"""
API class exposed to frontend via pywebview
"""
import base64
import json
import random
import string
import uuid
from concurrent.futures import ThreadPoolExecutor
from threading import Semaphore
from datetime import datetime
from pathlib import Path
from typing import Any, Optional

import webview
from loguru import logger

from services.project_manager import ProjectManager


class Api:
    """pywebview API for frontend communication"""

    def __init__(self, user_data_dir: Path, output_dir: Path):
        # Store as private attributes to avoid pywebview serialization warnings
        self._user_data_dir = Path(user_data_dir)
        self._output_dir = Path(output_dir)
        self._window: Optional[webview.Window] = None
        self.project_path: Optional[Path] = None
        self.project_data: Optional[dict] = None
        self.project_name: Optional[str] = None
        self._file_server_port = 8765  # Must match port in main.py

        # Settings file is always in ~/.hetangai/settings.json
        self._settings_file = Path.home() / ".hetangai" / "settings.json"
        self._ensure_settings_file()

        # Initialize project manager with work directory from settings
        settings = self._load_settings()
        default_work_dir = Path.home() / "Desktop" / "荷塘AI"
        work_dir_str = settings.get("workDir", "") or str(default_work_dir)
        work_dir = Path(work_dir_str)
        self._project_manager = ProjectManager(work_dir)

        # Initialize unified thread pool with semaphores for concurrency control
        tts_concurrency = settings.get("tts", {}).get("concurrency", 1)
        tti_concurrency = settings.get("tti", {}).get("concurrency", 1)
        ttv_concurrency = settings.get("ttv", {}).get("concurrency", 1)
        
        # Single thread pool with enough workers to handle all concurrent tasks
        total_max_workers = tts_concurrency + tti_concurrency + ttv_concurrency
        self._thread_pool = ThreadPoolExecutor(max_workers=total_max_workers, thread_name_prefix="gen")
        
        # Semaphores to control per-task-type concurrency
        self._tts_semaphore = Semaphore(tts_concurrency)
        self._tti_semaphore = Semaphore(tti_concurrency)
        self._ttv_semaphore = Semaphore(ttv_concurrency)
        
        # Store current concurrency values for comparison
        self._tts_concurrency = tts_concurrency
        self._tti_concurrency = tti_concurrency
        self._ttv_concurrency = ttv_concurrency
        
        logger.info(f"Thread pool initialized: total_workers={total_max_workers}, TTS={tts_concurrency}, TTI={tti_concurrency}, TTV={ttv_concurrency}")

        # Shot builder task state
        self._shot_builder_task: Optional[dict] = None  # {"step": str, "running": bool, "error": str|None}

        logger.info("API initialized")

    def _generate_shot_id(self) -> str:
        """Generate a 6-character random ID for shot"""
        chars = string.ascii_lowercase + string.digits
        return ''.join(random.choices(chars, k=6))

    def _generate_scene_id(self) -> str:
        """Generate a short random ID for scene"""
        return f"scene_{uuid.uuid4().hex[:8]}"

    def _generate_role_id(self) -> str:
        """Generate a short random ID for role"""
        return f"role_{uuid.uuid4().hex[:8]}"

    def _path_to_url(self, filepath: str) -> str:
        """Convert local file path to HTTP URL for file server"""
        # Use relative path from current directory
        try:
            from pathlib import Path
            import os

            base_dir = Path.cwd()
            file_path = Path(filepath)

            # Try to get relative path
            try:
                rel_path = file_path.relative_to(base_dir)
                return f"http://127.0.0.1:{self._file_server_port}/{rel_path}"
            except ValueError:
                # File is outside base_dir, use absolute path
                return f"http://127.0.0.1:{self._file_server_port}/{filepath}"
        except Exception as e:
            logger.warning(f"Failed to convert path to URL: {e}")
            return filepath

    def _url_to_path(self, url: str) -> str:
        """Convert HTTP URL back to local file path"""
        try:
            # Remove the HTTP URL prefix
            prefix = f"http://127.0.0.1:{self._file_server_port}/"
            if url.startswith(prefix):
                path_str = url[len(prefix):]
                # If it's a relative path, resolve it relative to cwd
                path = Path(path_str)
                if not path.is_absolute():
                    path = Path.cwd() / path
                return str(path)
            else:
                # If URL doesn't match expected format, assume it's already a path
                return url
        except Exception as e:
            logger.warning(f"Failed to convert URL to path: {e}")
            return url


    @property
    def user_data_dir(self) -> str:
        return str(self._user_data_dir)

    @property
    def output_dir(self) -> str:
        return str(self._output_dir)


    def set_window(self, window: webview.Window):
        """Set window reference (called from main.py, not stored in __init__)"""
        self._window = window

    def _ensure_settings_file(self):
        """Ensure settings file exists with default values"""
        if not self._settings_file.exists():
            desktop = Path.home() / "Desktop"
            default_work_dir = str(desktop / "荷塘AI")

            default_settings = {
                "workDir": default_work_dir,
                "jianyingDraftDir": "",
                "referenceAudioDir": "",
                "tts": {
                    "apiUrl": "",
                    "model": "tts-1",
                    "apiKey": "",
                    "concurrency": 1,
                },
                "tti": {
                    "provider": "openai",
                    "apiUrl": "",
                    "apiKey": "",
                    "characterModel": "gemini-3.0-pro-image-landscape",
                    "sceneModel": "gemini-2.5-flash-image-landscape",
                    "shotModel": "gemini-2.5-flash-image-landscape",
                    "whiskToken": "",
                    "whiskWorkflowId": "",
                    "concurrency": 1,
                },
                "ttv": {
                    "provider": "openai",
                    "apiUrl": "",
                    "apiKey": "",
                    "model": "veo_3_1_i2v_s_fast_fl_landscape",
                    "whiskToken": "",
                    "whiskWorkflowId": "",
                    "concurrency": 1,
                },
                "shotBuilder": {
                    "apiUrl": "",
                    "apiKey": "",
                    "model": "gemini-3-pro-preview",
                },
            }
            self._settings_file.parent.mkdir(parents=True, exist_ok=True)
            with open(self._settings_file, "w", encoding="utf-8") as f:
                json.dump(default_settings, f, indent=2, ensure_ascii=False)
            logger.info(f"Created default settings file: {self._settings_file}")

    def _load_settings(self) -> dict:
        """Load settings from file"""
        if self._settings_file.exists():
            try:
                with open(self._settings_file, "r", encoding="utf-8") as f:
                    return json.load(f)
            except Exception as e:
                logger.error(f"Failed to load settings: {e}")
        return {}

    def _ensure_prompt_prefixes(self, project_data: dict) -> None:
        """Ensure prompt prefixes exist in project data"""
        if "promptPrefixes" not in project_data or not isinstance(project_data.get("promptPrefixes"), dict):
            project_data["promptPrefixes"] = {}
        prefix_config = project_data["promptPrefixes"]
        prefix_config.setdefault("shotImagePrefix", "")
        prefix_config.setdefault("shotVideoPrefix", "")
        prefix_config.setdefault("characterPrefix", "")

    def _get_shot_builder_prompt_dir(self) -> Path:
        return Path.home() / ".hetangai" / "prompts"

    def _ensure_shot_builder_prompts(self) -> None:
        prompt_dir = self._get_shot_builder_prompt_dir()
        prompt_dir.mkdir(parents=True, exist_ok=True)
        source_dir = Path(__file__).resolve().parent / "services" / "prompts"
        for name in ("role.txt", "scene.txt", "shot.txt"):
            target_path = prompt_dir / name
            if not target_path.exists():
                source_path = source_dir / name
                if source_path.exists():
                    import shutil
                    shutil.copy2(source_path, target_path)
                else:
                    target_path.write_text("", encoding="utf-8")

    def _get_shot_builder_output_dir(self) -> Path:
        if not self.project_name:
            raise ValueError("Please save the project first before using shot builder")
        project_dir = self._project_manager.get_project_dir(self.project_name)
        output_dir = project_dir / "shot_builder"
        output_dir.mkdir(parents=True, exist_ok=True)
        return output_dir

    # ========== Project Management ==========

    def new_project(self) -> dict:
        """Create a new empty project"""
        logger.info("Creating new project")
        self.project_data = {
            "version": "1.0",
            "name": "Untitled Project",
            "createdAt": datetime.now().isoformat(),
            "updatedAt": datetime.now().isoformat(),
            "promptPrefixes": {
                "shotImagePrefix": "",
                "shotVideoPrefix": "",
                "characterPrefix": "",
            },
            "characters": [
                {
                    "id": "narrator",
                    "name": "旁白",
                    "description": "",
                    "imageUrl": "",
                    "speed": 1.5,
                    "isNarrator": True,
                    "status": "ready",
                }
            ],
            "scenes": [],
            "shots": [],
        }
        self.project_path = None
        self.project_name = None
        return {"success": True, "data": self.project_data}

    def list_projects(self) -> dict:
        """List all projects in work directory with metadata"""
        try:
            project_names = self._project_manager.list_projects()
            projects = []

            for name in project_names:
                try:
                    project_data = self._project_manager.load_project(name)
                    if project_data:
                        projects.append({
                            "name": name,
                            "path": str(self._project_manager.get_project_file(name)),
                            "createdAt": project_data.get("createdAt", ""),
                            "updatedAt": project_data.get("updatedAt", ""),
                            "shotCount": len(project_data.get("shots", [])),
                            "characterCount": len(project_data.get("characters", [])),
                        })
                except Exception as e:
                    logger.warning(f"Failed to load project {name}: {e}")
                    continue

            return {"success": True, "projects": projects}
        except Exception as e:
            logger.error(f"Failed to list projects: {e}")
            return {"success": False, "error": str(e), "projects": []}

    def open_project_from_workdir(self, project_name: str) -> dict:
        """Open a project from work directory by name"""
        try:
            project_data = self._project_manager.load_project(project_name)
            if project_data:
                self.project_data = project_data
                self.project_name = project_name
                self.project_path = self._project_manager.get_project_file(project_name)

                # Clear all "generating" statuses on startup
                for shot in self.project_data.get("shots", []):
                    if shot.get("status") in ["generating_images", "generating_video", "generating_audio"]:
                        shot["status"] = "pending"
                        logger.info(f"Cleared generating status for shot {shot.get('id')}")

                for character in self.project_data.get("characters", []):
                    if character.get("status") == "generating":
                        character["status"] = "pending"
                        logger.info(f"Cleared generating status for character {character.get('name')}")

                for scene in self.project_data.get("scenes", []):
                    if scene.get("status") == "generating":
                        scene["status"] = "pending"
                        logger.info(f"Cleared generating status for scene {scene.get('name')}")

                # Backward compatibility: migrate old format to new format
                for shot in self.project_data.get("shots", []):
                    if "dialogues" not in shot or not shot["dialogues"]:
                        if shot.get("script") and shot.get("voiceActor"):
                            shot["dialogues"] = [{"role": shot["voiceActor"], "text": shot["script"]}]
                            logger.info(f"Migrated shot {shot.get('id')} to new dialogue format")

                self._ensure_prompt_prefixes(self.project_data)
                if "scenes" not in self.project_data or not isinstance(self.project_data.get("scenes"), list):
                    self.project_data["scenes"] = []

                # Load all alternative images for each shot (slots 1-4)
                for shot in self.project_data.get("shots", []):
                    shot_id = shot.get("id")
                    all_image_paths = []
                    all_local_paths = []

                    for slot in range(1, 5):
                        slot_path = self._project_manager.get_shot_image_path(project_name, shot_id, slot)
                        if slot_path.exists():
                            all_image_paths.append(self._path_to_url(str(slot_path)))
                            all_local_paths.append(str(slot_path))

                    shot["images"] = all_image_paths
                    shot["_localImagePaths"] = all_local_paths
                    if all_image_paths and "selectedImageIndex" not in shot:
                        shot["selectedImageIndex"] = 0

                    # Load all alternative videos for each shot (slots 1-4)
                    all_video_paths = []
                    for slot in range(1, 5):
                        slot_path = self._project_manager.get_shot_video_path(project_name, shot_id, slot)
                        if slot_path.exists():
                            all_video_paths.append(self._path_to_url(str(slot_path)))

                    shot["videos"] = all_video_paths
                    if all_video_paths and "selectedVideoIndex" not in shot:
                        shot["selectedVideoIndex"] = 0

                    # Load audio
                    audio_path = self._project_manager.get_shot_audio_path(project_name, shot_id)
                    if audio_path.exists():
                        shot["audioUrl"] = self._path_to_url(str(audio_path))
                    else:
                        shot["audioUrl"] = ""

                logger.info(f"Opened project from workdir: {project_name}")
                return {"success": True, "data": self.project_data, "name": project_name}
            else:
                return {"success": False, "error": "Project not found"}
        except Exception as e:
            logger.error(f"Failed to open project: {e}")
            return {"success": False, "error": str(e)}

    def save_project_to_workdir(self, project_name: Optional[str] = None) -> dict:
        """Save project to work directory"""
        if not self.project_data:
            return {"success": False, "error": "No project data"}

        try:
            # Use provided name or existing name or project data name
            name = project_name or self.project_name or self.project_data.get("name", "Untitled Project")
            self.project_data["updatedAt"] = datetime.now().isoformat()
            self.project_data["name"] = name

            project_file = self._project_manager.save_project(name, self.project_data)
            self.project_name = name
            self.project_path = project_file

            logger.info(f"Saved project to workdir: {name}")
            return {"success": True, "name": name, "path": str(project_file)}
        except Exception as e:
            logger.error(f"Failed to save project: {e}")
            return {"success": False, "error": str(e)}

    def delete_project_from_workdir(self, project_name: str) -> dict:
        """Delete a project from work directory"""
        try:
            project_dir = self._project_manager.get_project_dir(project_name)
            if not project_dir.exists():
                return {"success": False, "error": "Project not found"}

            import shutil
            shutil.rmtree(project_dir)
            logger.info(f"Deleted project: {project_name}")
            return {"success": True}
        except Exception as e:
            logger.error(f"Failed to delete project: {e}")
            return {"success": False, "error": str(e)}

    def rename_project_in_workdir(self, old_name: str, new_name: str) -> dict:
        """Rename a project in work directory"""
        try:
            old_dir = self._project_manager.get_project_dir(old_name)
            new_dir = self._project_manager.get_project_dir(new_name)

            if not old_dir.exists():
                return {"success": False, "error": "Project not found"}

            if new_dir.exists():
                return {"success": False, "error": "A project with this name already exists"}

            # Load project data and update name
            project_data = self._project_manager.load_project(old_name)
            if not project_data:
                return {"success": False, "error": "Failed to load project data"}

            project_data["name"] = new_name
            project_data["updatedAt"] = datetime.now().isoformat()

            # Rename directory
            old_dir.rename(new_dir)

            # Update project.json with new name
            self._project_manager.save_project(new_name, project_data)

            # Update current project if it's the one being renamed
            if self.project_name == old_name:
                self.project_name = new_name
                self.project_data = project_data
                self.project_path = self._project_manager.get_project_file(new_name)

            logger.info(f"Renamed project: {old_name} -> {new_name}")
            return {"success": True, "name": new_name}
        except Exception as e:
            logger.error(f"Failed to rename project: {e}")
            return {"success": False, "error": str(e)}

    def open_project(self) -> dict:
        """Open a project file"""
        if not self._window:
            return {"success": False, "error": "Window not initialized"}

        file_types = ("HeTangAI Project (*.htai)",)
        result = self._window.create_file_dialog(
            webview.FileDialog.OPEN,
            allow_multiple=False,
            file_types=file_types,
        )

        if not result or len(result) == 0:
            return {"success": False, "error": "No file selected"}

        file_path = Path(result[0])
        logger.info(f"Opening project: {file_path}")

        try:
            with open(file_path, "r", encoding="utf-8") as f:
                self.project_data = json.load(f)
            self.project_path = file_path

            # Backward compatibility: migrate old format to new format
            for shot in self.project_data.get("shots", []):
                if "dialogues" not in shot or not shot["dialogues"]:
                    if shot.get("script") and shot.get("voiceActor"):
                        shot["dialogues"] = [{"role": shot["voiceActor"], "text": shot["script"]}]
                        logger.info(f"Migrated shot {shot.get('id')} to new dialogue format")

            self._ensure_prompt_prefixes(self.project_data)
            if "scenes" not in self.project_data or not isinstance(self.project_data.get("scenes"), list):
                self.project_data["scenes"] = []

            return {"success": True, "data": self.project_data, "path": str(file_path)}
        except Exception as e:
            logger.error(f"Failed to open project: {e}")
            return {"success": False, "error": str(e)}

    def save_project(self) -> dict:
        """Save project to current path or work directory"""
        if not self.project_data:
            return {"success": False, "error": "No project data"}

        # If project has a name but no path, save to work directory
        if not self.project_path and self.project_name:
            return self.save_project_to_workdir(self.project_name)

        # If no path and no name, save to work directory with project data name
        if not self.project_path:
            return self.save_project_to_workdir()

        return self._save_to_path(self.project_path)

    def save_project_as(self) -> dict:
        """Save project to a new path"""
        if not self._window:
            return {"success": False, "error": "Window not initialized"}

        if not self.project_data:
            return {"success": False, "error": "No project data"}

        result = self._window.create_file_dialog(
            webview.FileDialog.SAVE,
            save_filename=f"{self.project_data.get('name', 'project')}.htai",
            file_types=("HeTangAI Project (*.htai)",),
        )

        if not result:
            return {"success": False, "error": "No file selected"}

        file_path = Path(result)
        if not file_path.suffix:
            file_path = file_path.with_suffix(".htai")

        return self._save_to_path(file_path)

    def _save_to_path(self, file_path: Path) -> dict:
        """Internal: save project data to specified path"""
        try:
            self.project_data["updatedAt"] = datetime.now().isoformat()
            with open(file_path, "w", encoding="utf-8") as f:
                json.dump(self.project_data, f, ensure_ascii=False, indent=2)
            self.project_path = file_path
            logger.info(f"Project saved to: {file_path}")
            return {"success": True, "path": str(file_path)}
        except Exception as e:
            logger.error(f"Failed to save project: {e}")
            return {"success": False, "error": str(e)}

    def get_project_data(self) -> dict:
        """Get current project data"""
        return {
            "success": True,
            "data": self.project_data,
            "path": str(self.project_path) if self.project_path else None,
            "name": self.project_name,
        }

    def update_project_name(self, name: str) -> dict:
        """Update project name"""
        if not self.project_data:
            return {"success": False, "error": "No project data"}
        self.project_data["name"] = name
        return {"success": True}

    # ========== Import/Export ==========

    def import_jsonl(self) -> dict:
        """Import shots from JSONL file"""
        if not self._window:
            return {"success": False, "error": "Window not initialized"}
        file_types = ("JSONL Files (*.jsonl)",)
        result = self._window.create_file_dialog(
            webview.FileDialog.OPEN,
            allow_multiple=False,
            file_types=file_types,
        )

        if not result or len(result) == 0:
            return {"success": False, "error": "No file selected"}

        file_path = Path(result[0])
        logger.info(f"Importing from: {file_path}")

        try:
            from services.jsonl_parser import JsonlParser

            parser = JsonlParser()
            shots, characters, errors = parser.parse(file_path)

            if not self.project_data:
                self.new_project()

            # Add shots to project
            self.project_data["shots"].extend(shots)

            # Add new characters (avoid duplicates)
            existing_names = {c["name"] for c in self.project_data["characters"]}
            for char_name in characters:
                if char_name not in existing_names:
                    self.project_data["characters"].append({
                        "id": f"char_{uuid.uuid4().hex[:8]}",
                        "name": char_name,
                        "description": "",
                        "imageUrl": "",
                        "status": "pending",
                    })
                    existing_names.add(char_name)

            return {
                "success": True,
                "count": len(shots),
                "characters": list(characters),
                "errors": errors,
                "data": self.project_data,
            }
        except Exception as e:
            logger.error(f"Failed to import: {e}")
            return {"success": False, "error": str(e), "errors": [str(e)]}

    def export_jsonl_template(self) -> dict:
        """Export JSONL template file"""
        if not self._window:
            return {"success": False, "error": "Window not initialized"}

        result = self._window.create_file_dialog(
            webview.FileDialog.SAVE,
            save_filename="template.jsonl",
            file_types=("JSONL Files (*.jsonl)",),
        )

        if not result:
            return {"success": False, "error": "No file selected"}

        try:
            from services.jsonl_parser import JsonlParser

            parser = JsonlParser()
            parser.export_template(Path(result))
            logger.info(f"JSONL template exported to: {result}")
            return {"success": True, "path": result}
        except Exception as e:
            logger.error(f"Failed to export JSONL template: {e}")
            return {"success": False, "error": str(e)}

    # ========== Character Management ==========

    def add_character(self, name: str, description: str = "") -> dict:
        """Add a new character"""
        if not self.project_data:
            return {"success": False, "error": "No project data"}

        character = {
            "id": f"char_{uuid.uuid4().hex[:8]}",
            "name": name,
            "description": description,
            "imageUrl": "",
            "speed": 1.0,
            "isNarrator": False,
            "status": "pending",
        }
        self.project_data["characters"].append(character)
        logger.info(f"Added character: {name}")
        return {"success": True, "character": character}

    def update_character(self, character_id: str, name: str, description: str) -> dict:
        """Update character info"""
        if not self.project_data:
            return {"success": False, "error": "No project data"}

        for char in self.project_data["characters"]:
            if char["id"] == character_id:
                char["name"] = name
                char["description"] = description
                logger.info(f"Updated character: {character_id}")
                return {"success": True, "character": char}

        return {"success": False, "error": "Character not found"}

    def update_character_speed(self, character_id: str, speed: float) -> dict:
        """Update character voice speed"""
        if not self.project_data:
            return {"success": False, "error": "No project data"}

        for char in self.project_data["characters"]:
            if char["id"] == character_id:
                char["speed"] = speed
                logger.info(f"Updated character speed: {character_id} -> {speed}x")
                return {"success": True, "character": char}

        return {"success": False, "error": "Character not found"}

    def delete_character(self, character_id: str) -> dict:
        """Delete a character"""
        if not self.project_data:
            return {"success": False, "error": "No project data"}

        # Prevent deleting narrator
        for char in self.project_data["characters"]:
            if char["id"] == character_id and char.get("isNarrator", False):
                return {"success": False, "error": "Cannot delete narrator character"}

        original_len = len(self.project_data["characters"])
        self.project_data["characters"] = [
            c for c in self.project_data["characters"] if c["id"] != character_id
        ]

        if len(self.project_data["characters"]) < original_len:
            logger.info(f"Deleted character: {character_id}")
            return {"success": True}

        return {"success": False, "error": "Character not found"}

    def generate_character_image(self, character_id: str) -> dict:
        """Generate 3-view character image"""
        if not self.project_data:
            return {"success": False, "error": "No project data"}

        for char in self.project_data["characters"]:
            if char["id"] == character_id:
                try:
                    import asyncio
                    import time

                    char["status"] = "generating"

                    # Get settings
                    settings = self._load_settings()
                    tti_config = settings.get("tti", {})
                    provider = tti_config.get("provider", "openai")

                    # Require project to be saved before generating images
                    if not self.project_name:
                        raise ValueError("Please save the project first before generating character images")

                    # Build professional 3-view character design prompt
                    character_desc = char.get('description', '').strip()
                    prefix_config = (self.project_data or {}).get("promptPrefixes", {})
                    character_prefix = str(prefix_config.get("characterPrefix", "")).strip()
                    base_desc = character_desc if character_desc else char['name']
                    if character_prefix:
                        base_desc = f"{character_prefix} {base_desc}".strip()

                    prompt_template = """
专业角色设计参考图，16:9横向三等分构图，纯白背景。

左/中/右分别展示：正面全身、右侧面全身、背面全身。

要求：

同一角色三个视角：面容/服装/体型完全一致
自然站立姿态，双臂下垂，双脚并拢
角色占区域高度85%，头脚留白，不裁切
电影级超高清画质，光影真实，细节精细
默认：写实真人风格，亚洲面孔，主角级精致外貌（除非另有说明）
角色描述：
{character_desc}
"""

                    prompt = prompt_template.format(character_desc=base_desc)

                    # Get image path
                    image_path = self._project_manager.get_character_image_path(
                        self.project_name, character_id
                    )

                    if provider == "whisk":
                        # Whisk mode
                        from services.whisk import Whisk

                        if not tti_config.get("whiskToken") or not tti_config.get("whiskWorkflowId"):
                            raise ValueError("Whisk Token and Workflow ID not configured in settings")

                        whisk = Whisk(
                            token=tti_config["whiskToken"],
                            workflow_id=tti_config["whiskWorkflowId"]
                        )

                        # Generate using Whisk - MEDIA_CATEGORY_SUBJECT for character
                        whisk_image = whisk.generate_image(
                            prompt=prompt,
                            media_category="MEDIA_CATEGORY_SUBJECT",
                            aspect_ratio="IMAGE_ASPECT_RATIO_LANDSCAPE"
                        )

                        # Save base64 image to file
                        whisk_image.save(str(image_path))

                        # Save media_generation_id for later use in scene generation
                        char["imageMediaGenerationId"] = whisk_image.media_generation_id
                        char["imageSourceUrl"] = ""  # Whisk doesn't return URL

                        logger.info(f"Generated character image via Whisk, media_generation_id: {whisk_image.media_generation_id}")

                    else:
                        # OpenAI compatible mode
                        from services.generator import GenerationClient, download_file

                        if not tti_config.get("apiUrl") or not tti_config.get("apiKey"):
                            raise ValueError("TTI API not configured in settings")

                        model_name = tti_config.get("characterModel") or tti_config.get("model", "gemini-3.0-pro-image-landscape")
                        client = GenerationClient(
                            api_url=tti_config["apiUrl"],
                            api_key=tti_config["apiKey"],
                            model=model_name,
                        )

                        image_urls = asyncio.run(client.generate_image(prompt, count=1, task_type="character"))

                        if not image_urls:
                            raise ValueError("No images generated")

                        image_url = image_urls[0]

                        # Download and save to project directory
                        asyncio.run(download_file(image_url, image_path))
                        char["imageSourceUrl"] = image_url
                        char["imageMediaGenerationId"] = ""  # OpenAI mode doesn't have this

                    # Convert to HTTP URL for frontend with cache-busting timestamp
                    timestamp = int(time.time() * 1000)  # milliseconds timestamp
                    char["imageUrl"] = f"{self._path_to_url(str(image_path))}?t={timestamp}"

                    char["status"] = "ready"
                    logger.info(f"Generated character image for {character_id}")
                    return {"success": True, "imageUrl": char["imageUrl"], "character": char}

                except Exception as e:
                    char["status"] = "error"
                    char["errorMessage"] = str(e)
                    logger.error(f"Failed to generate character image: {e}")
                    return {"success": False, "error": str(e)}

        return {"success": False, "error": "Character not found"}

    def generate_characters_batch(self, character_ids: list) -> dict:
        """Generate images for multiple characters"""
        results = []
        for char_id in character_ids:
            result = self.generate_character_image(char_id)
            results.append({"character_id": char_id, **result})
        return {"success": True, "results": results}

    def upload_character_image(self, character_id: str) -> dict:
        """Upload character image from file"""
        if not self._window:
            return {"success": False, "error": "Window not initialized"}

        if not self.project_data:
            return {"success": False, "error": "No project data"}

        # Open file dialog
        file_types = ("Image Files (*.png;*.jpg;*.jpeg;*.webp)",)
        result = self._window.create_file_dialog(
            webview.FileDialog.OPEN,
            allow_multiple=False,
            file_types=file_types,
        )

        if not result or len(result) == 0:
            return {"success": False, "error": "No file selected"}

        try:
            import shutil

            # Require project to be saved before uploading images
            if not self.project_name:
                return {"success": False, "error": "Please save the project first before uploading character images"}

            source_path = Path(result[0])
            # Copy to project directory
            output_path = self._project_manager.get_character_image_path(
                self.project_name, character_id
            )
            output_path.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(source_path, output_path)

            # Update character
            for char in self.project_data["characters"]:
                if char["id"] == character_id:
                    # Convert to HTTP URL for frontend with cache-busting timestamp
                    import time
                    timestamp = int(time.time() * 1000)  # milliseconds timestamp
                    char["imageUrl"] = f"{self._path_to_url(str(output_path))}?t={timestamp}"
                    char["imageSourceUrl"] = ""
                    char["status"] = "ready"
                    logger.info(f"Uploaded character image for {character_id}")
                    return {"success": True, "imageUrl": char["imageUrl"], "character": char}

            return {"success": False, "error": "Character not found"}

        except Exception as e:
            logger.error(f"Failed to upload character image: {e}")
            return {"success": False, "error": str(e)}

    # ========== Scene Management ==========

    def add_scene(self, name: str, prompt: str = "") -> dict:
        """Add a new scene"""
        if not self.project_data:
            return {"success": False, "error": "No project data"}

        scene = {
            "id": f"scene_{uuid.uuid4().hex[:8]}",
            "name": name,
            "prompt": prompt,
            "imageUrl": "",
            "status": "pending",
        }
        self.project_data.setdefault("scenes", []).append(scene)
        logger.info(f"Added scene: {name}")
        return {"success": True, "scene": scene}

    def update_scene(self, scene_id: str, name: str, prompt: str) -> dict:
        """Update scene info"""
        if not self.project_data:
            return {"success": False, "error": "No project data"}

        for scene in self.project_data.get("scenes", []):
            if scene["id"] == scene_id:
                scene["name"] = name
                scene["prompt"] = prompt
                logger.info(f"Updated scene: {scene_id}")
                return {"success": True, "scene": scene}

        return {"success": False, "error": "Scene not found"}

    def delete_scene(self, scene_id: str) -> dict:
        """Delete a scene"""
        if not self.project_data:
            return {"success": False, "error": "No project data"}

        original_len = len(self.project_data.get("scenes", []))
        self.project_data["scenes"] = [
            s for s in self.project_data.get("scenes", []) if s["id"] != scene_id
        ]

        if len(self.project_data["scenes"]) < original_len:
            logger.info(f"Deleted scene: {scene_id}")
            return {"success": True}

        return {"success": False, "error": "Scene not found"}

    def generate_scene_image(self, scene_id: str) -> dict:
        """Generate scene image"""
        if not self.project_data:
            return {"success": False, "error": "No project data"}

        for scene in self.project_data.get("scenes", []):
            if scene["id"] == scene_id:
                try:
                    import asyncio
                    import time

                    scene["status"] = "generating"

                    settings = self._load_settings()
                    tti_config = settings.get("tti", {})
                    provider = tti_config.get("provider", "openai")

                    if not self.project_name:
                        raise ValueError("Please save the project first before generating scene images")

                    scene_prompt = str(scene.get("prompt", "")).strip()
                    prompt = scene_prompt or scene.get("name", "")

                    image_path = self._project_manager.get_scene_image_path(
                        self.project_name, scene_id
                    )
                    image_path.parent.mkdir(parents=True, exist_ok=True)

                    if provider == "whisk":
                        from services.whisk import Whisk

                        if not tti_config.get("whiskToken") or not tti_config.get("whiskWorkflowId"):
                            raise ValueError("Whisk Token and Workflow ID not configured in settings")

                        whisk = Whisk(
                            token=tti_config["whiskToken"],
                            workflow_id=tti_config["whiskWorkflowId"]
                        )

                        whisk_image = whisk.generate_image(
                            prompt=prompt,
                            media_category="MEDIA_CATEGORY_SCENE",
                            aspect_ratio="IMAGE_ASPECT_RATIO_LANDSCAPE"
                        )

                        whisk_image.save(str(image_path))
                        scene["imageMediaGenerationId"] = whisk_image.media_generation_id
                        scene["imageSourceUrl"] = ""
                        logger.info(f"Generated scene image via Whisk, media_generation_id: {whisk_image.media_generation_id}")
                    else:
                        from services.generator import GenerationClient, download_file

                        if not tti_config.get("apiUrl") or not tti_config.get("apiKey"):
                            raise ValueError("TTI API not configured in settings")

                        model_name = tti_config.get("sceneModel") or tti_config.get("model", "gemini-2.5-flash-image-landscape")
                        client = GenerationClient(
                            api_url=tti_config["apiUrl"],
                            api_key=tti_config["apiKey"],
                            model=model_name,
                        )

                        image_urls = asyncio.run(client.generate_image(prompt, count=1, task_type="scene"))
                        if not image_urls:
                            raise ValueError("No images returned from API")

                        image_url = image_urls[0]
                        if "?t=" in image_url:
                            image_url = image_url.split("?t=")[0]

                        asyncio.run(download_file(image_url, image_path))
                        scene["imageSourceUrl"] = image_url
                        scene["imageMediaGenerationId"] = ""

                    timestamp = int(time.time() * 1000)
                    scene["imageUrl"] = f"{self._path_to_url(str(image_path))}?t={timestamp}"
                    scene["status"] = "ready"
                    logger.info(f"Generated scene image for {scene_id}")
                    return {"success": True, "imageUrl": scene["imageUrl"], "scene": scene}

                except Exception as e:
                    scene["status"] = "error"
                    scene["errorMessage"] = str(e)
                    logger.error(f"Failed to generate scene image: {e}")
                    return {"success": False, "error": str(e)}

        return {"success": False, "error": "Scene not found"}

    def upload_scene_image(self, scene_id: str) -> dict:
        """Upload scene image from file"""
        if not self._window:
            return {"success": False, "error": "Window not initialized"}

        if not self.project_data:
            return {"success": False, "error": "No project data"}

        file_types = ("Image Files (*.png;*.jpg;*.jpeg;*.webp)",)
        result = self._window.create_file_dialog(
            webview.FileDialog.OPEN,
            allow_multiple=False,
            file_types=file_types,
        )

        if not result or len(result) == 0:
            return {"success": False, "error": "No file selected"}

        try:
            import shutil
            import time

            if not self.project_name:
                return {"success": False, "error": "Please save the project first before uploading scene images"}

            source_path = Path(result[0])
            output_path = self._project_manager.get_scene_image_path(
                self.project_name, scene_id
            )
            output_path.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(source_path, output_path)

            for scene in self.project_data.get("scenes", []):
                if scene["id"] == scene_id:
                    timestamp = int(time.time() * 1000)
                    scene["imageUrl"] = f"{self._path_to_url(str(output_path))}?t={timestamp}"
                    scene["imageSourceUrl"] = ""
                    scene["status"] = "ready"
                    logger.info(f"Uploaded scene image for {scene_id}")
                    return {"success": True, "imageUrl": scene["imageUrl"], "scene": scene}

            return {"success": False, "error": "Scene not found"}

        except Exception as e:
            logger.error(f"Failed to upload scene image: {e}")
            return {"success": False, "error": str(e)}

    # ========== Shot Builder One-Click Import ==========

    def _build_character_description_from_role(self, role: dict) -> str:
        parts = []
        dna = role.get("dna", "")
        if dna:
            parts.append(f"DNA: {dna}")
        tti = role.get("tti") or {}
        for label, key in [
            ("提示词", "prompt"),
            ("服装", "attire"),
            ("体型", "physique"),
            ("表情", "expression"),
            ("风格", "style"),
        ]:
            value = str(tti.get(key, "")).strip()
            if value:
                parts.append(f"{label}: {value}")
        return "\n".join(parts).strip()

    def _build_scene_prompt_from_scene(self, scene: dict) -> str:
        parts = []
        desc = str(scene.get("desc", "")).strip()
        if desc:
            parts.append(desc)
        tti = scene.get("tti") or {}
        for label, key in [
            ("环境", "environment"),
            ("建筑", "architecture"),
            ("道具", "props"),
            ("光线", "lighting"),
            ("氛围", "atmosphere"),
            ("风格", "style"),
        ]:
            value = str(tti.get(key, "")).strip()
            if value:
                parts.append(f"{label}: {value}")
        return "\n".join(parts).strip()

    def import_shot_builder_roles(self, strategy: str | None = None) -> dict:
        try:
            if not self.project_data:
                return {"success": False, "error": "No project data"}

            output_dir = self._get_shot_builder_output_dir()
            roles_path = output_dir / "roles.jsonl"
            if not roles_path.exists():
                return {"success": False, "error": "roles.jsonl 不存在"}

            from services.shots import Role

            roles = []
            with open(roles_path, "r", encoding="utf-8") as f:
                for line in f:
                    line = line.strip()
                    if not line:
                        continue
                    try:
                        roles.append(Role.model_validate_json(line).model_dump())
                    except Exception:
                        continue

            existing_names = {c.get("name", "") for c in self.project_data.get("characters", [])}
            new_items = []
            conflicts = []
            for role in roles:
                role_id = role.get("id")
                stable_id = f"role_{role_id}" if role_id is not None else self._generate_role_id()
                role_name = role.get("name", "")
                if role_name in existing_names:
                    conflicts.append({"id": stable_id, "name": role_name})
                new_items.append({
                    "id": stable_id,
                    "name": role_name,
                    "description": self._build_character_description_from_role(role),
                    "imageUrl": "",
                    "speed": 1.0,
                    "isNarrator": False,
                    "status": "pending",
                })

            if conflicts and not strategy:
                return {"success": False, "conflicts": conflicts, "total": len(new_items)}

            if strategy == "cancel":
                return {"success": False, "error": "cancelled"}

            characters = self.project_data.get("characters", [])
            if strategy == "overwrite":
                by_name = {c.get("name", ""): c for c in characters}
                for item in new_items:
                    by_name[item["name"]] = item
                self.project_data["characters"] = list(by_name.values())
                return {"success": True, "importedCount": len(new_items), "overwrittenCount": len(conflicts)}

            if strategy == "skip":
                filtered = [item for item in new_items if item["name"] not in existing_names]
                self.project_data["characters"].extend(filtered)
                return {"success": True, "importedCount": len(filtered), "skippedCount": len(conflicts)}

            self.project_data["characters"].extend(new_items)
            return {"success": True, "importedCount": len(new_items)}

        except Exception as e:
            logger.error(f"Failed to import roles: {e}")
            return {"success": False, "error": str(e)}

    def import_shot_builder_scenes(self, strategy: str | None = None) -> dict:
        try:
            if not self.project_data:
                return {"success": False, "error": "No project data"}

            output_dir = self._get_shot_builder_output_dir()
            scenes_path = output_dir / "scenes.jsonl"
            if not scenes_path.exists():
                return {"success": False, "error": "scenes.jsonl 不存在"}

            from services.shots import Scene as ShotScene

            scenes = []
            with open(scenes_path, "r", encoding="utf-8") as f:
                for line in f:
                    line = line.strip()
                    if not line:
                        continue
                    try:
                        scenes.append(ShotScene.model_validate_json(line).model_dump())
                    except Exception:
                        continue

            existing = {s.get("id") for s in self.project_data.get("scenes", [])}
            new_items = []
            conflicts = []
            for scene in scenes:
                scene_id = scene.get("id")
                stable_id = f"scene_{scene_id}" if scene_id is not None else self._generate_scene_id()
                if stable_id in existing:
                    conflicts.append({"id": stable_id, "name": scene.get("name", "")})
                new_items.append({
                    "id": stable_id,
                    "name": scene.get("name", ""),
                    "prompt": self._build_scene_prompt_from_scene(scene),
                    "imageUrl": "",
                    "status": "pending",
                })

            if conflicts and not strategy:
                return {"success": False, "conflicts": conflicts, "total": len(new_items)}

            if strategy == "cancel":
                return {"success": False, "error": "cancelled"}

            scenes_list = self.project_data.get("scenes", [])
            if strategy == "overwrite":
                by_id = {s.get("id"): s for s in scenes_list}
                for item in new_items:
                    by_id[item["id"]] = item
                self.project_data["scenes"] = list(by_id.values())
                return {"success": True, "importedCount": len(new_items), "overwrittenCount": len(conflicts)}

            if strategy == "skip":
                filtered = [item for item in new_items if item["id"] not in existing]
                self.project_data["scenes"].extend(filtered)
                return {"success": True, "importedCount": len(filtered), "skippedCount": len(conflicts)}

            self.project_data["scenes"].extend(new_items)
            return {"success": True, "importedCount": len(new_items)}

        except Exception as e:
            logger.error(f"Failed to import scenes: {e}")
            return {"success": False, "error": str(e)}

    def import_shot_builder_shots(self, strategy: str | None = None) -> dict:
        try:
            if not self.project_data:
                return {"success": False, "error": "No project data"}

            output_dir = self._get_shot_builder_output_dir()
            shots_path = output_dir / "shots.jsonl"
            if not shots_path.exists():
                return {"success": False, "error": "shots.jsonl 不存在"}

            from services.jsonl_parser import JsonlParser

            parser = JsonlParser()
            new_items = []
            conflicts = []
            existing = {s.get("id") for s in self.project_data.get("shots", [])}

            with open(shots_path, "r", encoding="utf-8") as f:
                for line_num, line in enumerate(f, 1):
                    line = line.strip()
                    if not line:
                        continue
                    try:
                        obj = json.loads(line)
                        shot_data = parser._parse_jsonl_object(obj, line_num)
                        shot_number = obj.get("shot", line_num)
                        stable_id = f"sb_{shot_number}" if shot_number is not None else self._generate_shot_id()
                        shot_data["id"] = stable_id
                        shot_data["sequence"] = int(shot_number) if str(shot_number).isdigit() else line_num
                        if stable_id in existing:
                            conflicts.append({"id": stable_id, "name": shot_data.get("scene", "")})
                        new_items.append(shot_data)
                    except Exception:
                        continue

            if conflicts and not strategy:
                return {"success": False, "conflicts": conflicts, "total": len(new_items)}

            if strategy == "cancel":
                return {"success": False, "error": "cancelled"}

            shots_list = self.project_data.get("shots", [])
            if strategy == "overwrite":
                by_id = {s.get("id"): s for s in shots_list}
                for item in new_items:
                    by_id[item["id"]] = item
                self.project_data["shots"] = list(by_id.values())
                return {"success": True, "importedCount": len(new_items), "overwrittenCount": len(conflicts)}

            if strategy == "skip":
                filtered = [item for item in new_items if item["id"] not in existing]
                self.project_data["shots"].extend(filtered)
                return {"success": True, "importedCount": len(filtered), "skippedCount": len(conflicts)}

            self.project_data["shots"].extend(new_items)
            return {"success": True, "importedCount": len(new_items)}

        except Exception as e:
            logger.error(f"Failed to import shots: {e}")
            return {"success": False, "error": str(e)}

    def set_character_reference_audio(self, character_id: str, audio_path: str) -> dict:
        """Set reference audio for character"""
        if not self.project_data:
            return {"success": False, "error": "No project data"}

        for char in self.project_data["characters"]:
            if char["id"] == character_id:
                char["referenceAudioPath"] = audio_path
                logger.info(f"Set reference audio for {character_id}: {audio_path}")
                return {"success": True, "character": char}

        return {"success": False, "error": "Character not found"}

    def import_characters_from_text(self, text: str) -> dict:
        """Import characters from pasted text (tab or comma separated)

        Supports two formats:
        - 2 columns: character_name, description
        - 3 columns: character_name, reference_audio_path, description
        """
        if not self.project_data:
            return {"success": False, "error": "No project data", "characters": [], "errors": []}

        characters = []
        errors = []
        lines = text.strip().split("\n")
        non_empty_lines = [line.strip() for line in lines if line.strip()]
        existing_name_map = {c["name"]: c["id"] for c in self.project_data["characters"]}
        seen_names = set()

        # JSONL import support
        if non_empty_lines and all(line.lstrip().startswith("{") for line in non_empty_lines):
            characters, errors = self._parse_characters_from_jsonl_text("\n".join(non_empty_lines))
            logger.info(f"Parsed {len(characters)} characters from JSONL text, {len(errors)} errors")
            return {
                "success": True,
                "characters": characters,
                "errors": errors,
            }

        for line_num, line in enumerate(lines, 1):
            line = line.strip()
            if not line:
                continue

            # Try tab separator first, then comma
            if "\t" in line:
                parts = [p.strip() for p in line.split("\t")]
            else:
                parts = [p.strip() for p in line.split(",")]

            # Remove empty parts
            parts = [p for p in parts if p]

            if len(parts) < 2:
                errors.append(f"Line {line_num}: insufficient columns (need at least 2)")
                continue

            if len(parts) == 2:
                # Format: name, description
                name, description = parts[0], parts[1]
                reference_audio = ""
            elif len(parts) >= 3:
                # Format: name, reference_audio, description
                name, reference_audio, description = parts[0], parts[1], parts[2]
            else:
                errors.append(f"Line {line_num}: invalid format")
                continue

            if not name:
                errors.append(f"Line {line_num}: character name is empty")
                continue

            # Check for duplicate names in current import batch
            if name in seen_names:
                errors.append(f"Line {line_num}: duplicate character name '{name}' in import")
                continue

            existing_id = existing_name_map.get(name)
            character = {
                "id": f"char_{uuid.uuid4().hex[:8]}",
                "name": name,
                "description": description,
                "imageUrl": "",
                "referenceAudioPath": reference_audio,
                "speed": 1.0,
                "isNarrator": False,
                "status": "pending",
                "existingId": existing_id,
                "isDuplicate": existing_id is not None,
            }
            characters.append(character)
            seen_names.add(name)

        logger.info(f"Parsed {len(characters)} characters from text, {len(errors)} errors")
        return {
            "success": True,
            "characters": characters,
            "errors": errors,
        }

    def import_characters_from_file(self) -> dict:
        """Import characters from CSV/Excel file via file dialog

        Recognizes columns: character name, reference audio, description
        For Excel with multiple sheets, finds the sheet with matching columns
        """
        if not self._window:
            return {"success": False, "error": "Window not initialized", "characters": [], "errors": []}

        if not self.project_data:
            return {"success": False, "error": "No project data", "characters": [], "errors": []}

        file_types = ("Excel Files (*.xlsx)", "Excel Files (*.xls)", "CSV Files (*.csv)", "JSONL Files (*.jsonl)")
        result = self._window.create_file_dialog(
            webview.FileDialog.OPEN,
            allow_multiple=False,
            file_types=file_types,
        )

        if not result or len(result) == 0:
            return {"success": False, "error": "No file selected", "characters": [], "errors": []}

        file_path = Path(result[0])
        logger.info(f"Importing characters from: {file_path}")

        try:
            import pandas as pd

            characters = []
            errors = []

            # Read file based on extension
            if file_path.suffix.lower() == ".jsonl":
                jsonl_text = file_path.read_text(encoding="utf-8")
                characters, errors = self._parse_characters_from_jsonl_text(jsonl_text)
                logger.info(f"Parsed {len(characters)} characters from JSONL file, {len(errors)} errors")
                return {
                    "success": True,
                    "characters": characters,
                    "errors": errors,
                }
            if file_path.suffix.lower() == ".csv":
                df = pd.read_csv(file_path, encoding="utf-8")
            else:
                # Excel file - try to find the right sheet
                excel_file = pd.ExcelFile(file_path)
                df = None

                # Column name patterns to match (English and Chinese)
                name_patterns = ["name", "character", "role", "actor", "角色", "名称", "名字", "人物"]
                desc_patterns = ["desc", "description", "prompt", "detail", "描述", "提示词", "说明", "详情"]
                audio_patterns = ["audio", "voice", "reference", "sound", "音频", "参考音", "声音", "配音"]

                def find_matching_columns(dataframe):
                    """Find columns matching our patterns"""
                    name_col = None
                    desc_col = None
                    audio_col = None

                    for i, col in enumerate(dataframe.columns):
                        col_lower = str(col).lower()
                        col_str = str(col)
                        # Check both lowercase (for English) and original (for Chinese)
                        if any(p in col_lower or p in col_str for p in name_patterns) and name_col is None:
                            name_col = col
                        elif any(p in col_lower or p in col_str for p in desc_patterns) and desc_col is None:
                            desc_col = col
                        elif any(p in col_lower or p in col_str for p in audio_patterns) and audio_col is None:
                            audio_col = col

                    return name_col, desc_col, audio_col

                # Try to find sheet named "角色" first
                if "角色" in excel_file.sheet_names:
                    df = pd.read_excel(excel_file, sheet_name="角色")
                    logger.info("Found sheet named '角色'")
                else:
                    # Try each sheet to find one with matching columns
                    for sheet_name in excel_file.sheet_names:
                        sheet_df = pd.read_excel(excel_file, sheet_name=sheet_name)
                        name_col, desc_col, audio_col = find_matching_columns(sheet_df)

                        if name_col and desc_col:
                            df = sheet_df
                            logger.info(f"Found matching sheet: {sheet_name}")
                            break

                if df is None:
                    # Use first sheet if no matching columns found
                    df = pd.read_excel(excel_file, sheet_name=0)
                    logger.info("Using first sheet (no matching columns found)")

            # Find column mappings
            name_col = None
            desc_col = None
            audio_col = None

            name_patterns = ["name", "character", "role", "actor", "角色", "名称", "名字", "人物"]
            desc_patterns = ["desc", "description", "prompt", "detail", "描述", "提示词", "说明", "详情"]
            audio_patterns = ["audio", "voice", "reference", "sound", "音频", "参考音", "声音", "配音"]

            for col in df.columns:
                col_lower = str(col).lower()
                col_str = str(col)
                # Check both lowercase (for English) and original (for Chinese)
                if any(p in col_lower or p in col_str for p in name_patterns) and name_col is None:
                    name_col = col
                elif any(p in col_lower or p in col_str for p in desc_patterns) and desc_col is None:
                    desc_col = col
                elif any(p in col_lower or p in col_str for p in audio_patterns) and audio_col is None:
                    audio_col = col

            # Fallback to positional columns if no matches
            if name_col is None and len(df.columns) >= 1:
                name_col = df.columns[0]
            if desc_col is None and len(df.columns) >= 2:
                desc_col = df.columns[1]

            if name_col is None:
                return {"success": False, "error": "Cannot find character name column", "characters": [], "errors": []}

            logger.info(f"Column mapping - name: {name_col}, desc: {desc_col}, audio: {audio_col}")

            # Get existing character names
            existing_name_map = {c["name"]: c["id"] for c in self.project_data["characters"]}
            seen_names = set()

            # Process rows
            for idx, row in df.iterrows():
                row_num = idx + 2  # Excel row number (1-indexed + header)

                name = str(row.get(name_col, "")).strip() if pd.notna(row.get(name_col)) else ""
                description = str(row.get(desc_col, "")).strip() if desc_col and pd.notna(row.get(desc_col)) else ""
                reference_audio = str(row.get(audio_col, "")).strip() if audio_col and pd.notna(row.get(audio_col)) else ""

                if not name:
                    continue  # Skip empty rows

                if name in seen_names:
                    errors.append(f"Row {row_num}: duplicate character name '{name}' in import")
                    continue

                existing_id = existing_name_map.get(name)
                character = {
                    "id": f"char_{uuid.uuid4().hex[:8]}",
                    "name": name,
                    "description": description,
                    "imageUrl": "",
                    "referenceAudioPath": reference_audio,
                    "speed": 1.0,
                    "isNarrator": False,
                    "status": "pending",
                    "existingId": existing_id,
                    "isDuplicate": existing_id is not None,
                }
                characters.append(character)
                seen_names.add(name)

            logger.info(f"Parsed {len(characters)} characters from file, {len(errors)} errors")
            return {
                "success": True,
                "characters": characters,
                "errors": errors,
            }

        except Exception as e:
            logger.error(f"Failed to import characters from file: {e}")
            return {"success": False, "error": str(e), "characters": [], "errors": []}

    def _build_character_description_from_json(self, obj: dict) -> str:
        """Build character description from JSONL fields (TTI only)"""
        if not isinstance(obj, dict):
            return ""

        parts = []

        tti = obj.get("tti")
        if isinstance(tti, dict):
            tti_parts = []
            for key in ("prompt", "attire", "physique", "expression", "style"):
                value = tti.get(key)
                if value:
                    tti_parts.append(f"{key}: {value}")
            if tti_parts:
                parts.append("tti: " + "; ".join(tti_parts))

        return "; ".join([p for p in parts if p]).strip()

    def _parse_characters_from_jsonl_text(self, text: str) -> tuple[list, list]:
        """Parse JSONL text into character objects"""
        if not self.project_data:
            return [], ["No project data"]

        characters = []
        errors = []
        existing_name_map = {c["name"]: c["id"] for c in self.project_data["characters"]}
        seen_names = set()

        for line_num, line in enumerate(text.splitlines(), 1):
            line = line.strip()
            if not line:
                continue

            try:
                obj = json.loads(line)
            except json.JSONDecodeError as e:
                errors.append(f"Line {line_num}: Invalid JSON - {str(e)}")
                continue
            except Exception as e:
                errors.append(f"Line {line_num}: {str(e)}")
                continue

            name = str(obj.get("name", "")).strip()
            if not name:
                errors.append(f"Line {line_num}: character name is empty")
                continue

            if name in seen_names:
                errors.append(f"Line {line_num}: duplicate character name '{name}' in import")
                continue

            description = self._build_character_description_from_json(obj)
            if not description:
                description = name

            reference_audio = ""
            for key in ("referenceAudioPath", "reference_audio", "referenceAudio", "audio", "reference"):
                value = obj.get(key)
                if isinstance(value, str) and value.strip():
                    reference_audio = value.strip()
                    break

            existing_id = existing_name_map.get(name)
            character = {
                "id": f"char_{uuid.uuid4().hex[:8]}",
                "name": name,
                "description": description,
                "imageUrl": "",
                "referenceAudioPath": reference_audio,
                "speed": 1.0,
                "isNarrator": False,
                "status": "pending",
                "existingId": existing_id,
                "isDuplicate": existing_id is not None,
            }
            characters.append(character)
            seen_names.add(name)

        return characters, errors

    def confirm_import_characters(self, characters: list) -> dict:
        """Confirm and add imported characters to project"""
        if not self.project_data:
            return {"success": False, "error": "No project data"}

        added_count = 0
        for char_data in characters:
            # Ensure required fields
            character = {
                "id": char_data.get("id", f"char_{uuid.uuid4().hex[:8]}"),
                "name": char_data.get("name", ""),
                "description": char_data.get("description", ""),
                "imageUrl": char_data.get("imageUrl", ""),
                "referenceAudioPath": char_data.get("referenceAudioPath", ""),
                "speed": char_data.get("speed", 1.0),
                "isNarrator": char_data.get("isNarrator", False),
                "status": char_data.get("status", "pending"),
            }

            if character["name"]:
                self.project_data["characters"].append(character)
                added_count += 1

        logger.info(f"Added {added_count} characters to project")
        return {"success": True, "addedCount": added_count}

    def export_character_template(self) -> dict:
        """Export character template Excel file"""
        if not self._window:
            return {"success": False, "error": "Window not initialized"}

        result = self._window.create_file_dialog(
            webview.FileDialog.SAVE,
            save_filename="角色模板.xlsx",
            file_types=("Excel Files (*.xlsx)",),
        )

        if not result:
            return {"success": False, "error": "No file selected"}

        try:
            import pandas as pd

            # Create template data with Chinese column names
            template_data = {
                "角色": ["示例角色1", "示例角色2"],
                "提示词": [
                    "年轻女性，长黑发，穿白色连衣裙",
                    "中年男性，短发，穿西装",
                ],
                "参考音": ["/path/to/audio1.wav", "/path/to/audio2.wav"],
            }

            df = pd.DataFrame(template_data)
            # Write with sheet name "角色"
            with pd.ExcelWriter(result, engine="openpyxl") as writer:
                df.to_excel(writer, sheet_name="角色", index=False)

            logger.info(f"Character template exported to: {result}")
            return {"success": True, "path": result}

        except Exception as e:
            logger.error(f"Failed to export character template: {e}")
            return {"success": False, "error": str(e)}

    # ========== Shot Management ==========

    def update_shot(self, shot_id: str, field: str, value: Any) -> dict:
        """Update a single shot field"""
        if not self.project_data:
            return {"success": False, "error": "No project data"}

        for shot in self.project_data["shots"]:
            if shot["id"] == shot_id:
                # Special handling for dialogues field
                if field == "dialogues":
                    shot["dialogues"] = value

                    # Update the script field to reflect all dialogues
                    script_parts = []
                    for dialogue in value:
                        if isinstance(dialogue, dict) and "role" in dialogue and "text" in dialogue:
                            script_parts.append(f"{dialogue['role']}: {dialogue['text']}")
                    shot["script"] = "\n".join(script_parts)

                    # Update characters list to include all characters from dialogues
                    dialogue_characters = {d["role"] for d in value if isinstance(d, dict) and "role" in d}
                    shot["characters"] = list(set(shot.get("characters", [])).union(dialogue_characters))

                    # Update voiceActor to first dialogue role for backward compatibility
                    if value and isinstance(value, list) and len(value) > 0:
                        first_dialogue = value[0]
                        if isinstance(first_dialogue, dict) and "role" in first_dialogue:
                            shot["voiceActor"] = first_dialogue["role"]
                else:
                    shot[field] = value

                logger.debug(f"Updated shot {shot_id}.{field}")
                return {"success": True, "shot": shot}

        return {"success": False, "error": "Shot not found"}

    def delete_shots(self, shot_ids: list) -> dict:
        """Delete multiple shots"""
        if not self.project_data:
            return {"success": False, "error": "No project data"}

        id_set = set(shot_ids)
        original_len = len(self.project_data["shots"])
        self.project_data["shots"] = [
            s for s in self.project_data["shots"] if s["id"] not in id_set
        ]

        deleted_count = original_len - len(self.project_data["shots"])
        logger.info(f"Deleted {deleted_count} shots")
        return {"success": True, "deletedCount": deleted_count}

    def insert_shot(self, after_shot_id: str = None) -> dict:
        """Insert a new empty shot after the specified shot (or at the beginning if None)"""
        if not self.project_data:
            return {"success": False, "error": "No project data"}

        # Create new shot with default values
        new_shot = {
            "id": self._generate_shot_id(),
            "sequence": 0,
            "voiceActor": "",
            "characters": [],
            "emotion": "",
            "intensity": "",
            "script": "",
            "imagePrompt": "",
            "videoPrompt": "",
            "images": [],
            "selectedImageIndex": 0,
            "videos": [],
            "selectedVideoIndex": 0,
            "videoUrl": "",
            "audioUrl": "",
            "status": "pending",
        }

        # Find insertion position
        if after_shot_id is None:
            # Insert at the beginning
            insert_index = 0
        else:
            # Find the shot to insert after
            insert_index = None
            for i, shot in enumerate(self.project_data["shots"]):
                if shot["id"] == after_shot_id:
                    insert_index = i + 1
                    break

            if insert_index is None:
                return {"success": False, "error": "Shot not found"}

        # Insert the new shot
        self.project_data["shots"].insert(insert_index, new_shot)

        # Update sequence numbers for all shots
        for i, shot in enumerate(self.project_data["shots"]):
            shot["sequence"] = i + 1

        logger.info(f"Inserted new shot at position {insert_index + 1}")
        return {"success": True, "shot": new_shot, "index": insert_index, "shots": self.project_data["shots"]}

    def select_image(self, shot_id: str, image_index: int) -> dict:
        """Select which image to use for a shot"""
        if not self.project_data:
            return {"success": False, "error": "No project data"}

        for shot in self.project_data["shots"]:
            if shot["id"] == shot_id:
                if 0 <= image_index < len(shot.get("images", [])):
                    shot["selectedImageIndex"] = image_index
                    logger.debug(f"Shot {shot_id} selected image {image_index}")
                    return {"success": True}
                return {"success": False, "error": "Invalid image index"}

        return {"success": False, "error": "Shot not found"}

    def select_video(self, shot_id: str, video_index: int) -> dict:
        """Select which video to use for a shot"""
        if not self.project_data:
            return {"success": False, "error": "No project data"}

        for shot in self.project_data["shots"]:
            if shot["id"] == shot_id:
                videos = shot.get("videos", [])
                if 0 <= video_index < len(videos):
                    shot["selectedVideoIndex"] = video_index
                    shot["videoUrl"] = videos[video_index]
                    logger.debug(f"Shot {shot_id} selected video {video_index}")
                    return {"success": True}
                return {"success": False, "error": "Invalid video index"}

        return {"success": False, "error": "Shot not found"}

    # ========== Image Generation ==========

    def generate_images_for_shot(self, shot_id: str) -> dict:
        """Generate 4 images for a single shot using character references"""
        if not self.project_data:
            return {"success": False, "error": "No project data"}

        for shot in self.project_data["shots"]:
            if shot["id"] == shot_id:
                try:
                    import asyncio
                    import time

                    shot["status"] = "generating_images"

                    # Get settings
                    settings = self._load_settings()
                    tti_config = settings.get("tti", {})
                    provider = tti_config.get("provider", "openai")

                    # Require project to be saved before generating images
                    if not self.project_name:
                        raise ValueError("Please save the project first before generating shot images")

                    # Get character references for this shot
                    # Parse characters from imagePrompt instead of using shot["characters"]
                    image_prompt = shot.get("imagePrompt", "")
                    all_character_names = [c["name"] for c in self.project_data.get("characters", []) if c.get("name")]
                    
                    # Find which characters are mentioned in the prompt
                    shot_characters = []
                    for char_name in all_character_names:
                        if char_name and char_name in image_prompt:
                            shot_characters.append(char_name)

                    base_prompt = shot.get("imagePrompt", "")
                    prefix_config = (self.project_data or {}).get("promptPrefixes", {})
                    shot_image_prefix = str(prefix_config.get("shotImagePrefix", "")).strip()
                    prompt_with_prefix = f"{shot_image_prefix} {base_prompt}".strip() if shot_image_prefix else base_prompt
                    current_shot_id = shot["id"]

                    # Resolve scene reference for this shot
                    scene_name = str(shot.get("scene", "")).strip()
                    matched_scene = None
                    if scene_name:
                        for scene in self.project_data.get("scenes", []):
                            if scene.get("name") == scene_name:
                                matched_scene = scene
                                break

                    # Check which slots (1-4) are already occupied
                    existing_slots = []
                    for slot in range(1, 5):
                        slot_path = self._project_manager.get_shot_image_path(self.project_name, current_shot_id, slot)
                        if slot_path.exists():
                            existing_slots.append((slot, slot_path.stat().st_mtime))

                    # Sort by modification time (oldest first)
                    existing_slots.sort(key=lambda x: x[1])

                    # Determine which slots to use for new images
                    slots_to_use = []
                    if len(existing_slots) < 4:
                        occupied = {slot for slot, _ in existing_slots}
                        for slot in range(1, 5):
                            if slot not in occupied:
                                slots_to_use.append(slot)
                                if len(slots_to_use) == 4:
                                    break
                    else:
                        slots_to_use = [slot for slot, _ in existing_slots[:4]]

                    existing_source_urls = shot.get("imageSourceUrls", [])
                    existing_media_gen_ids = shot.get("imageMediaGenerationIds", [])
                    source_url_by_slot = {
                        slot: existing_source_urls[slot - 1]
                        for slot in range(1, 5)
                        if slot - 1 < len(existing_source_urls)
                    }
                    media_gen_id_by_slot = {
                        slot: existing_media_gen_ids[slot - 1]
                        for slot in range(1, 5)
                        if slot - 1 < len(existing_media_gen_ids)
                    }

                    image_local_paths = []
                    image_paths = []
                    first_new_slot = None

                    if provider == "whisk":
                        # Whisk mode
                        from services.whisk import Whisk

                        if not tti_config.get("whiskToken") or not tti_config.get("whiskWorkflowId"):
                            raise ValueError("Whisk Token and Workflow ID not configured in settings")

                        whisk = Whisk(
                            token=tti_config["whiskToken"],
                            workflow_id=tti_config["whiskWorkflowId"]
                        )

                        # Collect subject_ids from characters with imageMediaGenerationId
                        subject_ids = []
                        scene_ids = []
                        missing_characters = []
                        if shot_characters:
                            logger.info(f"Characters found in imagePrompt: {shot_characters}")
                            for char_name in shot_characters:
                                char_found = False
                                for char in self.project_data["characters"]:
                                    if char["name"] == char_name:
                                        char_found = True
                                        media_gen_id = char.get("imageMediaGenerationId", "")
                                        logger.info(
                                            f"Whisk character reference: name={char_name}, media_generation_id={media_gen_id or 'EMPTY'}"
                                        )
                                        if media_gen_id:
                                            subject_ids.append(media_gen_id)
                                            logger.info(f"Added character subject_id: {char_name} -> {media_gen_id}")
                                        else:
                                            missing_characters.append(char_name)
                                        break
                                if not char_found:
                                    missing_characters.append(char_name)

                            if missing_characters:
                                raise ValueError(f"Missing character images (need Whisk media_generation_id) for: {', '.join(missing_characters)}")
                            logger.info(f"Whisk subject_ids prepared: {len(subject_ids)}")

                        if matched_scene:
                            scene_media_id = matched_scene.get("imageMediaGenerationId", "")
                            if scene_media_id:
                                scene_ids.append(scene_media_id)
                                logger.info(f"Added scene reference: {matched_scene.get('name', '')} -> {scene_media_id}")
                            else:
                                logger.warning("Scene has no imageMediaGenerationId, cannot use as Whisk reference")

                        # Generate 1 image using Whisk (user clicks multiple times to accumulate up to 4)
                        slot = slots_to_use[0] if slots_to_use else 1

                        if subject_ids or scene_ids:
                            # Use generate_with_references for scene with characters
                            whisk_image = whisk.generate_with_references(
                                prompt=prompt_with_prefix,
                                subject_ids=subject_ids,
                                scene_ids=scene_ids,
                                aspect_ratio="IMAGE_ASPECT_RATIO_LANDSCAPE"
                            )
                            logger.info(f"Generated scene image via Whisk with {len(subject_ids)} subject references and {len(scene_ids)} scene references")
                        else:
                            # Use generate_image for scene without characters
                            whisk_image = whisk.generate_image(
                                prompt=prompt_with_prefix,
                                media_category="MEDIA_CATEGORY_SCENE",
                                aspect_ratio="IMAGE_ASPECT_RATIO_LANDSCAPE"
                            )
                            logger.info("Generated scene image via Whisk (no character references)")

                        # Save the image
                        image_path = self._project_manager.get_shot_image_path(self.project_name, current_shot_id, slot)
                        whisk_image.save(str(image_path))

                        first_new_slot = slot
                        image_local_paths.append(str(image_path))
                        image_paths.append(self._path_to_url(str(image_path)))
                        source_url_by_slot[slot] = ""  # Whisk doesn't return URL
                        media_gen_id_by_slot[slot] = whisk_image.media_generation_id

                    else:
                        # OpenAI compatible mode
                        from services.generator import GenerationClient, download_file, compress_image_if_needed

                        if not tti_config.get("apiUrl") or not tti_config.get("apiKey"):
                            raise ValueError("TTI API not configured in settings")

                        reference_images = []
                        reference_urls = []
                        character_references = []
                        missing_characters = []

                        if shot_characters:
                            logger.info(f"Characters found in imagePrompt: {shot_characters}")

                            for char_name in shot_characters:
                                char_found = False
                                for char in self.project_data["characters"]:
                                    if char["name"] == char_name:
                                        char_found = True
                                        if not char.get("imageUrl"):
                                            missing_characters.append(char_name)
                                            break

                                        image_url = char["imageUrl"]
                                        if "?t=" in image_url:
                                            image_url = image_url.split("?t=")[0]

                                        source_url = char.get("imageSourceUrl", "")
                                        if source_url:
                                            reference_urls.append(source_url)
                                            if "mediaGenerationId" in source_url:
                                                reference_images.append({"url": source_url})
                                                character_references.append(char_name)
                                                logger.info(f"Added character reference url: {char_name} -> {source_url}")
                                                break

                                        if image_url.startswith(f"http://127.0.0.1:{self._file_server_port}/"):
                                            local_path = image_url.replace(f"http://127.0.0.1:{self._file_server_port}/", "")
                                            if not local_path.startswith("/"):
                                                local_path = str(Path.cwd() / local_path)

                                            if Path(local_path).exists():
                                                reference_image_data = compress_image_if_needed(local_path, max_size_kb=256)
                                                reference_images.append({"base64": reference_image_data})
                                                character_references.append(char_name)
                                                logger.info(f"Added character reference: {char_name} -> {local_path}")
                                            else:
                                                missing_characters.append(char_name)
                                                logger.warning(f"Character image file not found: {local_path}")
                                        break

                                if not char_found:
                                    missing_characters.append(char_name)

                            if missing_characters:
                                raise ValueError(f"Missing reference images for characters: {', '.join(missing_characters)}")

                        if matched_scene:
                            scene_source_url = matched_scene.get("imageSourceUrl", "")
                            scene_image_url = matched_scene.get("imageUrl", "")
                            if scene_source_url:
                                reference_urls.append(scene_source_url)
                                if "mediaGenerationId" in scene_source_url:
                                    reference_images.append({"url": scene_source_url})
                                    logger.info(f"Added scene reference url: {matched_scene.get('name', '')} -> {scene_source_url}")
                            elif scene_image_url.startswith(f"http://127.0.0.1:{self._file_server_port}/"):
                                local_path = scene_image_url.replace(f"http://127.0.0.1:{self._file_server_port}/", "")
                                if not local_path.startswith("/"):
                                    local_path = str(Path.cwd() / local_path)
                                if Path(local_path).exists():
                                    reference_image_data = compress_image_if_needed(local_path, max_size_kb=256)
                                    reference_images.append({"base64": reference_image_data})
                                    logger.info(f"Added scene reference local: {local_path}")
                                else:
                                    logger.warning(f"Scene image file not found: {local_path}")
                            else:
                                logger.warning("Scene has no usable image for reference")

                        has_references = len(reference_images) > 0
                        model_name = (
                            tti_config.get("sceneModel")
                            if has_references
                            else tti_config.get("shotModel")
                        ) or tti_config.get("model", "gemini-2.5-flash-image-landscape")
                        
                        client = GenerationClient(
                            api_url=tti_config["apiUrl"],
                            api_key=tti_config["apiKey"],
                            model=model_name,
                        )

                        if reference_images:
                            character_descriptions = []
                            for i, char_name in enumerate(character_references, 1):
                                character_descriptions.append(f"第{i}张图：{char_name}")

                            character_info = "、".join(character_descriptions)

                            enhanced_prompt = f"""基于提供的角色参考图，生成以下场景：

{prompt_with_prefix}

参考图说明：
{character_info}

要求：
- 严格按照参考图中对应角色的外观、服装、特征进行绘制
- 保持每个角色的一致性和辨识度
- 场景构图要符合镜头描述的要求
- 画质要求：电影级别的超高清画质，细节丰富精细
- 如果场景中涉及多个角色，请确保每个角色都按照对应的参考图进行绘制"""

                            logger.info(f"Using {len(reference_images)} character reference images: {character_references}")
                            image_urls = asyncio.run(client.generate_image(
                                enhanced_prompt,
                                reference_images=reference_images,
                                count=4,
                                task_type="scene",
                                reference_urls=reference_urls,
                            ))
                        else:
                            logger.info("No character references found, using text-to-image generation")
                            image_urls = asyncio.run(client.generate_image(prompt_with_prefix, count=4, task_type="shot"))

                        if not image_urls:
                            raise ValueError("No images generated")

                        for idx, img_url in enumerate(image_urls):
                            slot = slots_to_use[idx]
                            if first_new_slot is None:
                                first_new_slot = slot
                            image_path = self._project_manager.get_shot_image_path(self.project_name, current_shot_id, slot)
                            asyncio.run(download_file(img_url, image_path))
                            image_local_paths.append(str(image_path))
                            image_paths.append(self._path_to_url(str(image_path)))
                            source_url_by_slot[slot] = img_url
                            media_gen_id_by_slot[slot] = ""  # OpenAI mode doesn't have this

                    # Load all 4 slots for frontend display (in order 1-4)
                    all_image_paths = []
                    all_local_paths = []
                    all_source_urls = []
                    all_media_gen_ids = []
                    for slot in range(1, 5):
                        slot_path = self._project_manager.get_shot_image_path(self.project_name, current_shot_id, slot)
                        if slot_path.exists():
                            all_image_paths.append(self._path_to_url(str(slot_path)))
                            all_local_paths.append(str(slot_path))
                            all_source_urls.append(source_url_by_slot.get(slot, ""))
                            all_media_gen_ids.append(media_gen_id_by_slot.get(slot, ""))

                    if len(existing_slots) == 0 and first_new_slot is not None:
                        shot["selectedImageIndex"] = first_new_slot - 1
                        logger.info(f"Set first generated image (slot {first_new_slot}) as default selection")
                    elif "selectedImageIndex" not in shot or shot["selectedImageIndex"] >= len(all_image_paths):
                        shot["selectedImageIndex"] = 0

                    shot["images"] = all_image_paths
                    shot["imageSourceUrls"] = all_source_urls
                    shot["imageMediaGenerationIds"] = all_media_gen_ids
                    shot["_localImagePaths"] = all_local_paths
                    shot["status"] = "images_ready"

                    generation_type = "Whisk" if provider == "whisk" else ("图生图" if shot_characters else "文生图")
                    logger.info(f"Generated images for shot {current_shot_id} using {generation_type}, total alternatives: {len(all_image_paths)}")
                    return {"success": True, "images": all_image_paths, "shot": shot}

                except Exception as e:
                    shot["status"] = "error"
                    shot["errorMessage"] = str(e)
                    logger.error(f"Failed to generate images: {e}")
                    return {"success": False, "error": str(e)}

        return {"success": False, "error": "Shot not found"}

    def _notify_shot_status(self, shot_id: str, status: str, shot_data: dict = None):
        """Notify frontend about shot status change, optionally with full shot data"""
        try:
            if self._window:
                if shot_data:
                    # Send full shot data as JSON
                    import json
                    shot_json = json.dumps(shot_data)
                    self._window.evaluate_js(f'window.onShotStatusChange && window.onShotStatusChange("{shot_id}", "{status}", {shot_json})')
                else:
                    self._window.evaluate_js(f'window.onShotStatusChange && window.onShotStatusChange("{shot_id}", "{status}", null)')
        except Exception as e:
            logger.warning(f"Failed to notify frontend: {e}")

    def _notify_progress(self):
        """Notify frontend to increment progress"""
        try:
            if self._window:
                self._window.evaluate_js('window.onProgressIncrement && window.onProgressIncrement()')
        except Exception as e:
            logger.warning(f"Failed to notify progress: {e}")

    def _generate_images_with_semaphore(self, shot_id: str) -> dict:
        """Generate images for a shot with semaphore control"""
        with self._tti_semaphore:
            # Notify frontend that this shot is now generating
            self._notify_shot_status(shot_id, "generating_images")
            result = self.generate_images_for_shot(shot_id)
            # Notify frontend of completion status with shot data for immediate UI update
            if result.get("success") and result.get("shot"):
                self._notify_shot_status(shot_id, "images_ready", result["shot"])
            else:
                self._notify_shot_status(shot_id, "error")
            self._notify_progress()
            return result

    def generate_images_batch(self, shot_ids: list) -> dict:
        """Generate images for multiple shots using thread pool with semaphore control"""
        from concurrent.futures import as_completed

        results = []
        futures = {}

        # Submit all tasks to thread pool (semaphore controls actual concurrency)
        for shot_id in shot_ids:
            future = self._thread_pool.submit(self._generate_images_with_semaphore, shot_id)
            futures[future] = shot_id

        # Collect results as they complete
        for future in as_completed(futures):
            shot_id = futures[future]
            try:
                result = future.result()
                results.append({"shot_id": shot_id, **result})
            except Exception as e:
                logger.error(f"Failed to generate images for shot {shot_id}: {e}")
                results.append({"shot_id": shot_id, "success": False, "error": str(e)})

        return {"success": True, "results": results}

    # ========== Video Generation ==========

    def generate_video_for_shot(self, shot_id: str) -> dict:
        """Generate video for a single shot"""
        if not self.project_data:
            return {"success": False, "error": "No project data"}

        for shot in self.project_data["shots"]:
            if shot["id"] == shot_id:
                try:
                    shot["status"] = "generating_video"

                    # Get settings
                    settings = self._load_settings()
                    ttv_config = settings.get("ttv", {})
                    provider = ttv_config.get("provider", "openai")

                    # Require project to be saved before generating videos
                    if not self.project_name:
                        raise ValueError("Please save the project first before generating videos")

                    # Get selected image path (use local path for video generation)
                    selected_idx = shot.get("selectedImageIndex", 0)
                    local_images = shot.get("_localImagePaths", [])

                    if not local_images:
                        raise ValueError("No images available for video generation")

                    # Use local file path for video generation
                    image_local_path = local_images[selected_idx] if selected_idx < len(local_images) else local_images[0]
                    prompt = shot.get("videoPrompt", "")
                    prefix_config = (self.project_data or {}).get("promptPrefixes", {})
                    shot_video_prefix = str(prefix_config.get("shotVideoPrefix", "")).strip()
                    prompt_with_prefix = f"{shot_video_prefix} {prompt}".strip() if shot_video_prefix else prompt
                    shot_id_str = shot["id"]

                    # Check which slots (1-4) are already occupied
                    existing_slots = []
                    for slot in range(1, 5):
                        slot_path = self._project_manager.get_shot_video_path(self.project_name, shot_id_str, slot)
                        if slot_path.exists():
                            existing_slots.append((slot, slot_path.stat().st_mtime))

                    # Sort by modification time (oldest first)
                    existing_slots.sort(key=lambda x: x[1])

                    # Determine which slot to use for new video
                    target_slot = None
                    if len(existing_slots) < 4:
                        # Fill empty slot first
                        occupied = {slot for slot, _ in existing_slots}
                        for slot in range(1, 5):
                            if slot not in occupied:
                                target_slot = slot
                                break
                    else:
                        # All slots occupied, replace the oldest one
                        target_slot = existing_slots[0][0]

                    video_path = self._project_manager.get_shot_video_path(self.project_name, shot_id_str, target_slot)

                    if provider == "whisk":
                        # Whisk mode
                        from services.whisk import Whisk, VideoProgress, WhiskVideo

                        if not ttv_config.get("whiskToken") or not ttv_config.get("whiskWorkflowId"):
                            raise ValueError("Whisk Token and Workflow ID not configured in settings")

                        whisk = Whisk(
                            token=ttv_config["whiskToken"],
                            workflow_id=ttv_config["whiskWorkflowId"]
                        )

                        # Read image file
                        with open(image_local_path, 'rb') as f:
                            image_bytes = f.read()

                        logger.info(f"Generating video via Whisk with image: {image_local_path}")

                        # Generate video (iterate through generator)
                        whisk_video = None
                        for result in whisk.generate_video(prompt_with_prefix, image_bytes):
                            if isinstance(result, VideoProgress):
                                logger.info(f"Video generation progress: {result.status.value}, elapsed: {result.elapsed_seconds:.1f}s")
                            elif isinstance(result, WhiskVideo):
                                whisk_video = result
                                break

                        if not whisk_video:
                            raise ValueError("No video generated from Whisk")

                        # Save video to file
                        whisk_video.save(str(video_path))
                        logger.info(f"Saved Whisk video to: {video_path}")

                    else:
                        # OpenAI compatible mode
                        import asyncio
                        from services.generator import GenerationClient, download_file

                        if not ttv_config.get("apiUrl") or not ttv_config.get("apiKey"):
                            raise ValueError("TTV API not configured in settings")

                        client = GenerationClient(
                            api_url=ttv_config["apiUrl"],
                            api_key=ttv_config["apiKey"],
                            model=ttv_config.get("model", "veo_3_1_i2v_s_fast_fl_landscape"),
                        )

                        # Check if model supports image input
                        model = ttv_config.get("model", "")
                        image_paths = None

                        if "i2v" in model or "r2v" in model:
                            # Image-to-video models - use first frame
                            image_paths = [image_local_path]
                            logger.info(f"Using first frame for I2V: {image_local_path}")

                        # Generate video (returns URL)
                        video_url = asyncio.run(client.generate_video(prompt_with_prefix, image_paths))

                        if not video_url:
                            raise ValueError("No video generated")

                        # Download and save new video
                        asyncio.run(download_file(video_url, video_path))

                    # Load all 4 slots for frontend display (in order 1-4)
                    all_video_paths = []
                    for slot in range(1, 5):
                        slot_path = self._project_manager.get_shot_video_path(self.project_name, shot_id_str, slot)
                        if slot_path.exists():
                            all_video_paths.append(self._path_to_url(str(slot_path)))

                    # If no videos existed before, set the first newly generated video as selected
                    # Otherwise keep the current selection
                    if len(existing_slots) == 0 and target_slot is not None:
                        shot["selectedVideoIndex"] = target_slot - 1  # Convert slot (1-4) to index (0-3)
                        shot["videoUrl"] = all_video_paths[target_slot - 1] if target_slot - 1 < len(all_video_paths) else all_video_paths[0]
                        logger.info(f"Set first generated video (slot {target_slot}) as default selection")
                    elif "selectedVideoIndex" not in shot or shot["selectedVideoIndex"] >= len(all_video_paths):
                        shot["selectedVideoIndex"] = 0
                        shot["videoUrl"] = all_video_paths[0] if all_video_paths else ""
                    else:
                        # Keep current selection, update videoUrl
                        selected_idx = shot.get("selectedVideoIndex", 0)
                        shot["videoUrl"] = all_video_paths[selected_idx] if selected_idx < len(all_video_paths) else all_video_paths[0]

                    shot["videos"] = all_video_paths
                    shot["status"] = "completed"
                    generation_type = "Whisk" if provider == "whisk" else "OpenAI"
                    logger.info(f"Generated video for shot {shot_id} via {generation_type}, total alternatives: {len(all_video_paths)}")
                    return {"success": True, "videoUrl": shot["videoUrl"], "shot": shot}

                except Exception as e:
                    shot["status"] = "error"
                    shot["errorMessage"] = str(e)
                    logger.error(f"Failed to generate video: {e}")
                    return {"success": False, "error": str(e)}

        return {"success": False, "error": "Shot not found"}

    def _generate_video_with_semaphore(self, shot_id: str) -> dict:
        """Generate video for a shot with semaphore control"""
        with self._ttv_semaphore:
            # Notify frontend that this shot is now generating
            self._notify_shot_status(shot_id, "generating_video")
            result = self.generate_video_for_shot(shot_id)
            # Notify frontend of completion status with shot data for immediate UI update
            if result.get("success") and result.get("shot"):
                self._notify_shot_status(shot_id, "completed", result["shot"])
            else:
                self._notify_shot_status(shot_id, "error")
            self._notify_progress()
            return result

    def generate_videos_batch(self, shot_ids: list) -> dict:
        """Generate videos for multiple shots using thread pool with semaphore control"""
        from concurrent.futures import as_completed

        results = []
        futures = {}

        # Submit all tasks to thread pool (semaphore controls actual concurrency)
        for shot_id in shot_ids:
            future = self._thread_pool.submit(self._generate_video_with_semaphore, shot_id)
            futures[future] = shot_id

        # Collect results as they complete
        for future in as_completed(futures):
            shot_id = futures[future]
            try:
                result = future.result()
                results.append({"shot_id": shot_id, **result})
            except Exception as e:
                logger.error(f"Failed to generate video for shot {shot_id}: {e}")
                results.append({"shot_id": shot_id, "success": False, "error": str(e)})

        return {"success": True, "results": results}

    # ========== Audio Generation ==========

    def generate_audio_for_shot(self, shot_id: str) -> dict:
        """Generate audio for a single shot (supports multiple dialogues)"""
        if not self.project_data:
            return {"success": False, "error": "No project data"}

        for shot in self.project_data["shots"]:
            if shot["id"] == shot_id:
                try:
                    import asyncio
                    from services.generator import GenerationClient
                    from pydub import AudioSegment

                    shot["status"] = "generating_audio"

                    # Get settings
                    settings = self._load_settings()
                    tts_config = settings.get("tts", {})

                    if not tts_config.get("apiUrl"):
                        raise ValueError("TTS API not configured in settings")

                    # Require project to be saved before generating audio
                    if not self.project_name:
                        raise ValueError("Please save the project first before generating audio")

                    # Create client
                    client = GenerationClient(
                        api_url=tts_config["apiUrl"],
                        api_key=tts_config.get("apiKey", ""),
                        model=tts_config.get("model", "tts-1"),
                    )

                    # Check if shot has dialogues (new format) or script (old format)
                    dialogues = shot.get("dialogues", [])

                    # Backward compatibility: convert old format to new format
                    if not dialogues and shot.get("script"):
                        voice_actor = shot.get("voiceActor", "")
                        if voice_actor:
                            dialogues = [{"role": voice_actor, "text": shot["script"]}]
                            shot["dialogues"] = dialogues
                        else:
                            raise ValueError("No voice actor or dialogues specified")

                    if not dialogues:
                        raise ValueError("No dialogues found for this shot")

                    # Generate audio for each dialogue
                    audio_segments = []
                    temp_files = []

                    for idx, dialogue in enumerate(dialogues):
                        role = dialogue.get("role", "")
                        text = dialogue.get("text", "")

                        if not role or not text:
                            logger.warning(f"Skipping empty dialogue at index {idx}")
                            continue

                        # Find character with matching name
                        reference_audio = None
                        character_speed = 1.0
                        for char in self.project_data["characters"]:
                            if char["name"] == role:
                                reference_audio = char.get("referenceAudioPath")
                                character_speed = char.get("speed", 1.0)
                                break

                        if not reference_audio:
                            raise ValueError(f"No reference audio found for character: {role}")

                        # Get emotion and intensity
                        emotion = shot.get("emotion", "")
                        intensity = shot.get("intensity", "")

                        # Generate audio for this dialogue
                        logger.info(f"Generating audio for dialogue {idx + 1}/{len(dialogues)}: {role}")
                        audio_bytes = asyncio.run(
                            client.generate_audio(
                                text=text,
                                reference_audio=reference_audio,
                                speed=character_speed,
                                emotion=emotion,
                                intensity=intensity,
                            )
                        )

                        if not audio_bytes:
                            raise ValueError(f"No audio generated for dialogue {idx}")

                        # Save temporary audio file
                        temp_path = self._project_manager.get_shot_audio_path(
                            self.project_name, f"{shot_id}_dialogue_{idx}"
                        )
                        temp_path.parent.mkdir(parents=True, exist_ok=True)
                        with open(temp_path, "wb") as f:
                            f.write(audio_bytes)

                        temp_files.append(temp_path)

                        # Load audio segment
                        segment = AudioSegment.from_file(str(temp_path))
                        audio_segments.append(segment)

                        # Add 300ms silence between dialogues
                        if idx < len(dialogues) - 1:
                            silence = AudioSegment.silent(duration=300)
                            audio_segments.append(silence)

                    # Combine all audio segments
                    if not audio_segments:
                        raise ValueError("No audio segments generated")

                    combined = audio_segments[0]
                    for segment in audio_segments[1:]:
                        combined += segment

                    # Save combined audio
                    final_audio_path = self._project_manager.get_shot_audio_path(
                        self.project_name, shot_id
                    )
                    final_audio_path.parent.mkdir(parents=True, exist_ok=True)
                    combined.export(str(final_audio_path), format="wav")

                    # Clean up temporary files
                    for temp_file in temp_files:
                        try:
                            temp_file.unlink()
                        except Exception as e:
                            logger.warning(f"Failed to delete temp file {temp_file}: {e}")

                    # Update shot with audio URL
                    shot["audioUrl"] = self._path_to_url(str(final_audio_path))
                    shot["status"] = "audio_ready"

                    logger.info(f"Generated audio for shot {shot_id} with {len(dialogues)} dialogues")
                    return {"success": True, "audioUrl": shot["audioUrl"], "shot": shot}

                except Exception as e:
                    shot["status"] = "error"
                    shot["errorMessage"] = str(e)
                    logger.error(f"Failed to generate audio: {e}")
                    return {"success": False, "error": str(e)}

        return {"success": False, "error": "Shot not found"}

    def _generate_audio_with_semaphore(self, shot_id: str) -> dict:
        """Generate audio for a shot with semaphore control"""
        with self._tts_semaphore:
            # Notify frontend that this shot is now generating
            self._notify_shot_status(shot_id, "generating_audio")
            result = self.generate_audio_for_shot(shot_id)
            # Notify frontend of completion status with shot data for immediate UI update
            if result.get("success") and result.get("shot"):
                self._notify_shot_status(shot_id, "audio_ready", result["shot"])
            else:
                self._notify_shot_status(shot_id, "error")
            self._notify_progress()
            return result

    def generate_audios_batch(self, shot_ids: list) -> dict:
        """Generate audio for multiple shots using thread pool with semaphore control"""
        from concurrent.futures import as_completed

        results = []
        futures = {}

        # Submit all tasks to thread pool (semaphore controls actual concurrency)
        for shot_id in shot_ids:
            future = self._thread_pool.submit(self._generate_audio_with_semaphore, shot_id)
            futures[future] = shot_id

        # Collect results as they complete
        for future in as_completed(futures):
            shot_id = futures[future]
            try:
                result = future.result()
                results.append({"shot_id": shot_id, **result})
            except Exception as e:
                logger.error(f"Failed to generate audio for shot {shot_id}: {e}")
                results.append({"shot_id": shot_id, "success": False, "error": str(e)})

        return {"success": True, "results": results}

    # ========== File Operations ==========

    def open_output_dir(self) -> dict:
        """Open output directory in file explorer"""
        import subprocess
        import sys

        try:
            if sys.platform == "darwin":
                subprocess.run(["open", str(self.output_dir)])
            elif sys.platform == "win32":
                subprocess.run(["explorer", str(self.output_dir)])
            else:
                subprocess.run(["xdg-open", str(self.output_dir)])
            return {"success": True}
        except Exception as e:
            logger.error(f"Failed to open output dir: {e}")
            return {"success": False, "error": str(e)}

    def get_app_version(self) -> str:
        """Get application version"""
        return "0.1.0"

    # ========== Reference Audio Management ==========

    def scan_reference_audios(self, directory: str) -> dict:
        """Scan directory recursively for audio files"""
        import os

        audio_extensions = {".mp3", ".wav", ".m4a", ".flac", ".aac", ".ogg", ".wma"}
        audios = []

        try:
            dir_path = Path(directory)
            if not dir_path.exists() or not dir_path.is_dir():
                logger.warning(f"Directory does not exist: {directory}")
                return {"success": True, "audios": []}

            logger.info(f"Scanning audio files in: {directory}")

            for root, _, files in os.walk(directory):
                for file in files:
                    file_path = Path(root) / file
                    if file_path.suffix.lower() in audio_extensions:
                        relative_path = file_path.relative_to(dir_path)
                        audios.append({
                            "path": str(file_path),
                            "name": file_path.name,
                            "relativePath": str(relative_path),
                        })

            logger.info(f"Found {len(audios)} audio files")
            return {"success": True, "audios": audios}

        except Exception as e:
            logger.error(f"Failed to scan audio files: {e}")
            return {"success": False, "error": str(e), "audios": []}

    def select_reference_audio_dir(self) -> dict:
        """Select reference audio directory"""
        if not self._window:
            return {"success": False, "error": "Window not initialized"}

        result = self._window.create_file_dialog(
            webview.FileDialog.FOLDER,
            allow_multiple=False,
        )

        if not result or len(result) == 0:
            return {"success": False, "error": "No directory selected"}

        dir_path = Path(result[0])
        logger.info(f"Selected reference audio directory: {dir_path}")

        return {"success": True, "path": str(dir_path)}

    def get_reference_audio_data(self, file_path: str) -> dict:
        """Read audio file and return as base64 data"""
        import base64
        import mimetypes

        try:
            audio_path = Path(file_path)
            if not audio_path.exists() or not audio_path.is_file():
                return {"success": False, "error": "File not found"}

            # Read file as binary
            with open(audio_path, "rb") as f:
                audio_data = f.read()

            # Encode to base64
            base64_data = base64.b64encode(audio_data).decode("utf-8")

            # Determine MIME type
            mime_type, _ = mimetypes.guess_type(str(audio_path))
            if not mime_type:
                # Default MIME types based on extension
                ext = audio_path.suffix.lower()
                mime_map = {
                    ".mp3": "audio/mpeg",
                    ".wav": "audio/wav",
                    ".m4a": "audio/mp4",
                    ".flac": "audio/flac",
                    ".aac": "audio/aac",
                    ".ogg": "audio/ogg",
                    ".wma": "audio/x-ms-wma",
                }
                mime_type = mime_map.get(ext, "audio/mpeg")

            logger.info(f"Read audio file: {file_path} ({len(audio_data)} bytes)")
            return {"success": True, "data": base64_data, "mimeType": mime_type}

        except Exception as e:
            logger.error(f"Failed to read audio file: {e}")
            return {"success": False, "error": str(e)}


    # ========== Shot Builder ==========

    def get_shot_builder_prompts(self) -> dict:
        try:
            self._ensure_shot_builder_prompts()
            prompt_dir = self._get_shot_builder_prompt_dir()
            prompts = {
                "role": (prompt_dir / "role.txt").read_text(encoding="utf-8"),
                "scene": (prompt_dir / "scene.txt").read_text(encoding="utf-8"),
                "shot": (prompt_dir / "shot.txt").read_text(encoding="utf-8"),
            }
            return {"success": True, "prompts": prompts}
        except Exception as e:
            logger.error(f"Failed to load shot builder prompts: {e}")
            return {"success": False, "error": str(e)}

    def save_shot_builder_prompts(self, prompts: dict) -> dict:
        try:
            self._ensure_shot_builder_prompts()
            prompt_dir = self._get_shot_builder_prompt_dir()
            (prompt_dir / "role.txt").write_text(prompts.get("role", ""), encoding="utf-8")
            (prompt_dir / "scene.txt").write_text(prompts.get("scene", ""), encoding="utf-8")
            (prompt_dir / "shot.txt").write_text(prompts.get("shot", ""), encoding="utf-8")
            return {"success": True}
        except Exception as e:
            logger.error(f"Failed to save shot builder prompts: {e}")
            return {"success": False, "error": str(e)}

    def get_shot_builder_novel(self) -> dict:
        try:
            output_dir = self._get_shot_builder_output_dir()
            novel_path = output_dir / "novel.txt"
            text = novel_path.read_text(encoding="utf-8") if novel_path.exists() else ""
            return {"success": True, "text": text}
        except Exception as e:
            logger.error(f"Failed to load novel text: {e}")
            return {"success": False, "error": str(e)}

    def save_shot_builder_novel(self, text: str) -> dict:
        try:
            output_dir = self._get_shot_builder_output_dir()
            novel_path = output_dir / "novel.txt"
            novel_path.write_text(text or "", encoding="utf-8")
            return {"success": True}
        except Exception as e:
            logger.error(f"Failed to save novel text: {e}")
            return {"success": False, "error": str(e)}

    def clear_shot_builder_output(self) -> dict:
        try:
            output_dir = self._get_shot_builder_output_dir()
            if output_dir.exists():
                import shutil
                shutil.rmtree(output_dir)
            output_dir.mkdir(parents=True, exist_ok=True)
            return {"success": True, "outputDir": str(output_dir)}
        except Exception as e:
            logger.error(f"Failed to clear shot builder output: {e}")
            return {"success": False, "error": str(e)}

    def get_shot_builder_outputs(self) -> dict:
        try:
            output_dir = self._get_shot_builder_output_dir()

            def read_text(path: Path) -> str:
                return path.read_text(encoding="utf-8") if path.exists() else ""

            outputs = {
                "roles": read_text(output_dir / "roles.jsonl"),
                "scenes": read_text(output_dir / "scenes.jsonl"),
                "shots": read_text(output_dir / "shots.jsonl"),
                "outputDir": str(output_dir),
            }
            return {"success": True, "outputs": outputs}
        except Exception as e:
            logger.error(f"Failed to load shot builder outputs: {e}")
            return {"success": False, "error": str(e)}

    def save_shot_builder_outputs(self, outputs: dict) -> dict:
        try:
            output_dir = self._get_shot_builder_output_dir()
            (output_dir / "roles.jsonl").write_text(outputs.get("roles", ""), encoding="utf-8")
            (output_dir / "scenes.jsonl").write_text(outputs.get("scenes", ""), encoding="utf-8")
            (output_dir / "shots.jsonl").write_text(outputs.get("shots", ""), encoding="utf-8")
            return {"success": True, "outputDir": str(output_dir)}
        except Exception as e:
            logger.error(f"Failed to save shot builder outputs: {e}")
            return {"success": False, "error": str(e)}

    def _run_shot_builder_task(
        self,
        step: str,
        output_dir: Path,
        novel_text: str,
        prompt_role: str,
        prompt_scene: str,
        prompt_shot: str,
        llm_config: dict,
    ) -> None:
        """Background task to run shot builder step"""
        try:
            from services.shots import (
                generate_roles,
                generate_scenes,
                generate_shots,
                load_existing_data,
                Role,
                Scene,
            )

            if step == "role":
                generate_roles(prompt_role, novel_text, output_dir, llm_config=llm_config)
            elif step == "scene":
                generate_scenes(prompt_scene, novel_text, output_dir, llm_config=llm_config)
            else:
                roles_path = output_dir / "roles.jsonl"
                scenes_path = output_dir / "scenes.jsonl"
                roles = load_existing_data(roles_path, Role)
                scenes = load_existing_data(scenes_path, Scene)
                generate_shots(prompt_shot, novel_text, roles, scenes, output_dir, llm_config=llm_config)

            # Mark task as completed
            if self._shot_builder_task and self._shot_builder_task.get("step") == step:
                self._shot_builder_task["running"] = False
                self._shot_builder_task["error"] = None
                logger.info(f"Shot builder task completed: {step}")
        except Exception as e:
            logger.error(f"Shot builder task failed: {e}")
            if self._shot_builder_task and self._shot_builder_task.get("step") == step:
                self._shot_builder_task["running"] = False
                self._shot_builder_task["error"] = str(e)

    def run_shot_builder_step(self, step: str, force: bool) -> dict:
        """Start shot builder step in background thread"""
        try:
            if step not in {"role", "scene", "shot"}:
                return {"success": False, "error": "Invalid step"}

            # Check if a task is already running
            if self._shot_builder_task and self._shot_builder_task.get("running"):
                return {"success": False, "error": "已有任务正在执行中"}

            output_dir = self._get_shot_builder_output_dir()
            novel_path = output_dir / "novel.txt"
            novel_text = ""
            if novel_path.exists():
                novel_text = novel_path.read_text(encoding="utf-8")

            # 只删除当前步骤对应的文件，不删除整个目录
            step_file_map = {
                "role": "roles.jsonl",
                "scene": "scenes.jsonl",
                "shot": "shots.jsonl",
            }
            target_file = output_dir / step_file_map[step]
            if target_file.exists():
                target_file.unlink()
            if step == "shot":
                state_path = output_dir / "session_state.json"
                if state_path.exists():
                    state_path.unlink()

            novel_text = novel_text.strip()
            if not novel_text:
                return {"success": False, "error": "Novel text is empty"}

            self._ensure_shot_builder_prompts()
            prompt_dir = self._get_shot_builder_prompt_dir()
            prompt_role = (prompt_dir / "role.txt").read_text(encoding="utf-8")
            prompt_scene = (prompt_dir / "scene.txt").read_text(encoding="utf-8")
            prompt_shot = (prompt_dir / "shot.txt").read_text(encoding="utf-8")

            settings = self._load_settings()
            shot_builder_cfg = settings.get("shotBuilder", {})
            api_url = str(shot_builder_cfg.get("apiUrl", "")).strip()
            api_key = str(shot_builder_cfg.get("apiKey", "")).strip()
            model = str(shot_builder_cfg.get("model", "")).strip()
            if not api_url or not api_key or not model:
                return {"success": False, "error": "请在设置中配置分镜接口地址、密钥与模型"}

            if api_url.endswith("/chat/completions"):
                api_url = api_url.rsplit("/chat/completions", 1)[0]

            llm_config = {
                "api_key": api_key,
                "base_url": api_url,
                "model": model,
            }

            # For shot step, check if roles and scenes exist
            if step == "shot":
                roles_path = output_dir / "roles.jsonl"
                scenes_path = output_dir / "scenes.jsonl"
                if not roles_path.exists() or not scenes_path.exists():
                    return {"success": False, "error": "角色或场景数据不存在，请先生成"}

            # Initialize task state
            self._shot_builder_task = {
                "step": step,
                "running": True,
                "error": None,
                "outputDir": str(output_dir),
            }

            # Submit task to thread pool
            import threading
            thread = threading.Thread(
                target=self._run_shot_builder_task,
                args=(step, output_dir, novel_text, prompt_role, prompt_scene, prompt_shot, llm_config),
                daemon=True,
            )
            thread.start()

            return {
                "success": True,
                "step": step,
                "running": True,
                "outputDir": str(output_dir),
            }
        except Exception as e:
            logger.error(f"Failed to start shot builder step: {e}")
            return {"success": False, "error": str(e)}

    def get_shot_builder_status(self) -> dict:
        """Get current shot builder task status"""
        try:
            output_dir = self._get_shot_builder_output_dir()

            def count_lines(path: Path) -> int:
                if not path.exists():
                    return 0
                with open(path, "r", encoding="utf-8") as f:
                    return sum(1 for line in f if line.strip())

            counts = {
                "roles": count_lines(output_dir / "roles.jsonl"),
                "scenes": count_lines(output_dir / "scenes.jsonl"),
                "shots": count_lines(output_dir / "shots.jsonl"),
            }

            if self._shot_builder_task:
                return {
                    "success": True,
                    "step": self._shot_builder_task.get("step"),
                    "running": self._shot_builder_task.get("running", False),
                    "error": self._shot_builder_task.get("error"),
                    "outputDir": str(output_dir),
                    "counts": counts,
                }
            return {
                "success": True,
                "step": None,
                "running": False,
                "error": None,
                "outputDir": str(output_dir),
                "counts": counts,
            }
        except Exception as e:
            logger.error(f"Failed to get shot builder status: {e}")
            return {"success": False, "error": str(e)}


    # ========== Settings Management ==========

    def get_settings(self) -> dict:
        """Get application settings"""
        try:
            if self._settings_file.exists():
                with open(self._settings_file, "r", encoding="utf-8") as f:
                    settings = json.load(f)
                logger.info("Loaded settings")
                return {"success": True, "settings": settings}
            else:
                self._ensure_settings_file()
                return self.get_settings()
        except Exception as e:
            logger.error(f"Failed to load settings: {e}")
            return {"success": False, "error": str(e)}

    def save_settings(self, settings: dict) -> dict:
        """Save application settings"""
        try:
            # Save to settings file (always in ~/.hetangai/settings.json)
            self._settings_file.parent.mkdir(parents=True, exist_ok=True)
            with open(self._settings_file, "w", encoding="utf-8") as f:
                json.dump(settings, f, indent=2, ensure_ascii=False)

            # Update project manager work directory if changed
            if "workDir" in settings and settings["workDir"]:
                self._project_manager.set_work_dir(Path(settings["workDir"]))

            # Update thread pool sizes if concurrency changed
            self._update_thread_pools(settings)

            logger.info("Saved settings")
            return {"success": True}
        except Exception as e:
            logger.error(f"Failed to save settings: {e}")
            return {"success": False, "error": str(e)}

    def _update_thread_pools(self, settings: dict):
        """Update thread pool and semaphores based on settings"""
        tts_concurrency = settings.get("tts", {}).get("concurrency", 1)
        tti_concurrency = settings.get("tti", {}).get("concurrency", 1)
        ttv_concurrency = settings.get("ttv", {}).get("concurrency", 1)

        needs_pool_update = False

        # Update TTS semaphore if changed
        if self._tts_concurrency != tts_concurrency:
            self._tts_semaphore = Semaphore(tts_concurrency)
            self._tts_concurrency = tts_concurrency
            needs_pool_update = True
            logger.info(f"TTS concurrency updated: {tts_concurrency}")

        # Update TTI semaphore if changed
        if self._tti_concurrency != tti_concurrency:
            self._tti_semaphore = Semaphore(tti_concurrency)
            self._tti_concurrency = tti_concurrency
            needs_pool_update = True
            logger.info(f"TTI concurrency updated: {tti_concurrency}")

        # Update TTV semaphore if changed
        if self._ttv_concurrency != ttv_concurrency:
            self._ttv_semaphore = Semaphore(ttv_concurrency)
            self._ttv_concurrency = ttv_concurrency
            needs_pool_update = True
            logger.info(f"TTV concurrency updated: {ttv_concurrency}")

        # Update thread pool if total concurrency changed
        if needs_pool_update:
            total_max_workers = tts_concurrency + tti_concurrency + ttv_concurrency
            self._thread_pool.shutdown(wait=False)
            self._thread_pool = ThreadPoolExecutor(max_workers=total_max_workers, thread_name_prefix="gen")
            logger.info(f"Thread pool updated: total_workers={total_max_workers}")

    def select_work_dir(self) -> dict:
        """Select work directory"""
        if not self._window:
            return {"success": False, "error": "Window not initialized"}

        result = self._window.create_file_dialog(
            webview.FileDialog.FOLDER,
            allow_multiple=False,
        )

        if not result or len(result) == 0:
            return {"success": False, "error": "No directory selected"}

        dir_path = Path(result[0])
        logger.info(f"Selected work directory: {dir_path}")

        return {"success": True, "path": str(dir_path)}

    def select_jianying_draft_dir(self) -> dict:
        """Select JianYing draft directory"""
        if not self._window:
            return {"success": False, "error": "Window not initialized"}

        result = self._window.create_file_dialog(
            webview.FileDialog.FOLDER,
            allow_multiple=False,
        )

        if not result or len(result) == 0:
            return {"success": False, "error": "No directory selected"}

        dir_path = Path(result[0])
        logger.info(f"Selected JianYing draft directory: {dir_path}")

        return {"success": True, "path": str(dir_path)}

    def export_jianying_draft(self) -> dict:
        """Export current project to JianYing draft"""
        try:
            if not self.project_data or not self.project_name:
                return {"success": False, "error": "No project loaded"}

            # Load settings to get JianYing draft directory
            settings = self._load_settings()
            jianying_dir = settings.get("jianyingDraftDir", "")
            if not jianying_dir:
                return {"success": False, "error": "JianYing draft directory not configured"}

            jianying_path = Path(jianying_dir)
            if not jianying_path.exists():
                return {"success": False, "error": f"JianYing draft directory does not exist: {jianying_dir}"}

            # Import pycapcut
            try:
                import pycapcut as cc
                from pycapcut import trange, tim
            except ImportError:
                return {"success": False, "error": "pycapcut not installed"}

            # Create draft folder
            draft_folder = cc.DraftFolder(str(jianying_path))

            # Create draft with project name
            draft_name = self.project_name
            script = draft_folder.create_draft(draft_name, 1920, 1080, allow_replace=True)

            # Add tracks
            script.add_track(cc.TrackType.audio).add_track(cc.TrackType.video).add_track(cc.TrackType.text)

            # Process shots
            current_time = 0.0
            shots = self.project_data.get("shots", [])

            for shot in shots:
                shot_id = shot.get("id")
                if not shot_id:
                    continue

                # Get selected video path
                selected_video_index = shot.get("selectedVideoIndex", 0)
                videos = shot.get("videos", [])
                if not videos or selected_video_index >= len(videos):
                    logger.warning(f"Shot {shot_id} has no video, skipping")
                    continue

                video_url = videos[selected_video_index]
                video_path = self._url_to_path(video_url)
                if not video_path or not Path(video_path).exists():
                    logger.warning(f"Video file not found for shot {shot_id}: {video_path}")
                    continue

                # Get audio path
                audio_url = shot.get("audioUrl", "")
                audio_path = None
                if audio_url:
                    audio_path = self._url_to_path(audio_url)
                    if not audio_path or not Path(audio_path).exists():
                        logger.warning(f"Audio file not found for shot {shot_id}: {audio_path}")
                        audio_path = None

                # Get video duration using pycapcut
                try:
                    video_material = cc.VideoMaterial(video_path)
                    video_duration = video_material.duration

                    # Get audio duration if available
                    audio_duration = None
                    if audio_path:
                        try:
                            audio_material = cc.AudioMaterial(audio_path)
                            audio_duration = audio_material.duration
                        except Exception as e:
                            logger.warning(f"Failed to load audio for shot {shot_id}: {e}")
                            audio_path = None

                    # Determine segment duration and video settings
                    if audio_duration is not None:
                        # Use audio duration as the segment duration
                        segment_duration = audio_duration

                        if video_duration > audio_duration:
                            # Video is longer than audio: use first N seconds of video
                            video_segment = cc.VideoSegment(
                                video_material,
                                trange(tim(current_time), audio_duration),
                                source_timerange=trange(0, audio_duration),
                                volume=0.0  # Mute video audio track
                            )
                            logger.info(f"Shot {shot_id}: video {video_duration:.2f}s > audio {audio_duration:.2f}s, using first {audio_duration:.2f}s of video")
                        else:
                            # Audio is longer than video: slow down video to match audio duration
                            speed = video_duration / audio_duration
                            video_segment = cc.VideoSegment(
                                video_material,
                                trange(tim(current_time), audio_duration),
                                speed=speed,
                                volume=0.0  # Mute video audio track
                            )
                            logger.info(f"Shot {shot_id}: audio {audio_duration:.2f}s > video {video_duration:.2f}s, slowing video to {speed:.2f}x speed")
                    else:
                        # No audio: use video duration
                        segment_duration = video_duration
                        video_segment = cc.VideoSegment(
                            video_material,
                            trange(tim(current_time), video_duration),
                            volume=0.0  # Mute video audio track
                        )
                        logger.info(f"Shot {shot_id}: no audio, using video duration {video_duration:.2f}s")

                    script.add_segment(video_segment)

                    # Add audio segment if available
                    if audio_path and audio_duration is not None:
                        try:
                            audio_segment = cc.AudioSegment(
                                audio_material,
                                trange(tim(current_time), audio_duration)
                            )
                            script.add_segment(audio_segment)
                        except Exception as e:
                            logger.warning(f"Failed to add audio for shot {shot_id}: {e}")

                    # Add text segment with script
                    script_text = shot.get("script", "")
                    if script_text:
                        try:
                            text_segment = cc.TextSegment(
                                script_text,
                                trange(tim(current_time), segment_duration),
                                clip_settings=cc.ClipSettings(transform_y=-0.8)
                            )
                            script.add_segment(text_segment)
                        except Exception as e:
                            logger.warning(f"Failed to add text for shot {shot_id}: {e}")

                    current_time += segment_duration

                except Exception as e:
                    logger.error(f"Failed to process shot {shot_id}: {e}")
                    continue

            # Save draft
            script.save()

            draft_path = jianying_path / draft_name
            logger.info(f"Exported JianYing draft to: {draft_path}")

            return {"success": True, "path": str(draft_path)}

        except Exception as e:
            logger.error(f"Failed to export JianYing draft: {e}")
            return {"success": False, "error": str(e)}

