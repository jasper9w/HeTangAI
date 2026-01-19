"""
API class exposed to frontend via pywebview
"""
import base64
import json
import random
import string
import uuid
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

        # Initialize work directory and settings file location
        default_work_dir = Path.home() / "Desktop" / "荷塘AI"
        # Try to load existing settings to get work_dir, or use default
        temp_settings_file = default_work_dir / "settings.json"
        if temp_settings_file.exists():
            try:
                with open(temp_settings_file, "r", encoding="utf-8") as f:
                    settings = json.load(f)
                    work_dir = Path(settings.get("workDir", str(default_work_dir)))
            except Exception:
                work_dir = default_work_dir
        else:
            work_dir = default_work_dir

        # Settings file is now in work directory
        self._settings_file = work_dir / "settings.json"
        self._ensure_settings_file()

        # Initialize project manager with work directory from settings
        settings = self._load_settings()
        work_dir = Path(settings.get("workDir", str(default_work_dir)))
        self._project_manager = ProjectManager(work_dir)
        logger.info("API initialized")

    def _generate_shot_id(self) -> str:
        """Generate a 6-character random ID for shot"""
        chars = string.ascii_lowercase + string.digits
        return ''.join(random.choices(chars, k=6))

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
    def user_data_dir(self) -> Path:
        return self._user_data_dir

    @property
    def output_dir(self) -> Path:
        return self._output_dir

    @property
    def settings_file(self) -> Path:
        return self._settings_file

    @property
    def project_manager(self) -> ProjectManager:
        return self._project_manager

    def set_window(self, window: webview.Window):
        """Set window reference (called from main.py, not stored in __init__)"""
        self._window = window

    def _ensure_settings_file(self):
        """Ensure settings file exists with default values"""
        if not self.settings_file.exists():
            desktop = Path.home() / "Desktop"
            default_work_dir = str(desktop / "荷塘AI")

            # Default JianYing draft directory (macOS)
            default_jianying_dir = str(Path.home() / "Movies" / "JianyingPro Drafts")

            default_settings = {
                "workDir": default_work_dir,
                "jianyingDraftDir": default_jianying_dir,
                "tts": {
                    "apiUrl": "",
                    "model": "tts-1",
                    "apiKey": "",
                    "concurrency": 1,
                },
                "tti": {
                    "apiUrl": "",
                    "model": "gemini-2.5-flash-image-landscape",
                    "apiKey": "",
                    "concurrency": 1,
                },
                "ttv": {
                    "apiUrl": "",
                    "model": "veo_3_1_i2v_s_fast_fl_landscape",
                    "apiKey": "",
                    "concurrency": 1,
                },
            }
            self.settings_file.parent.mkdir(parents=True, exist_ok=True)
            with open(self.settings_file, "w", encoding="utf-8") as f:
                json.dump(default_settings, f, indent=2, ensure_ascii=False)
            logger.info(f"Created default settings file: {self.settings_file}")

    def _load_settings(self) -> dict:
        """Load settings from file"""
        if self.settings_file.exists():
            try:
                with open(self.settings_file, "r", encoding="utf-8") as f:
                    return json.load(f)
            except Exception as e:
                logger.error(f"Failed to load settings: {e}")
        return {}

    # ========== Project Management ==========

    def new_project(self) -> dict:
        """Create a new empty project"""
        logger.info("Creating new project")
        self.project_data = {
            "version": "1.0",
            "name": "Untitled Project",
            "createdAt": datetime.now().isoformat(),
            "updatedAt": datetime.now().isoformat(),
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
            "shots": [],
        }
        self.project_path = None
        self.project_name = None
        return {"success": True, "data": self.project_data}

    def list_projects(self) -> dict:
        """List all projects in work directory with metadata"""
        try:
            project_names = self.project_manager.list_projects()
            projects = []

            for name in project_names:
                try:
                    project_data = self.project_manager.load_project(name)
                    if project_data:
                        projects.append({
                            "name": name,
                            "path": str(self.project_manager.get_project_file(name)),
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
            project_data = self.project_manager.load_project(project_name)
            if project_data:
                self.project_data = project_data
                self.project_name = project_name
                self.project_path = self.project_manager.get_project_file(project_name)

                # Clear all "generating" statuses on startup
                for shot in self.project_data.get("shots", []):
                    if shot.get("status") in ["generating_images", "generating_video", "generating_audio"]:
                        shot["status"] = "pending"
                        logger.info(f"Cleared generating status for shot {shot.get('id')}")

                for character in self.project_data.get("characters", []):
                    if character.get("status") == "generating":
                        character["status"] = "pending"
                        logger.info(f"Cleared generating status for character {character.get('name')}")

                # Load all alternative images for each shot (slots 1-4)
                for shot in self.project_data.get("shots", []):
                    shot_id = shot.get("id")
                    all_image_paths = []
                    all_local_paths = []

                    for slot in range(1, 5):
                        slot_path = self.project_manager.get_shot_image_path(project_name, shot_id, slot)
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
                        slot_path = self.project_manager.get_shot_video_path(project_name, shot_id, slot)
                        if slot_path.exists():
                            all_video_paths.append(self._path_to_url(str(slot_path)))

                    shot["videos"] = all_video_paths
                    if all_video_paths and "selectedVideoIndex" not in shot:
                        shot["selectedVideoIndex"] = 0

                    # Load audio
                    audio_path = self.project_manager.get_shot_audio_path(project_name, shot_id)
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

            project_file = self.project_manager.save_project(name, self.project_data)
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
            project_dir = self.project_manager.get_project_dir(project_name)
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
            old_dir = self.project_manager.get_project_dir(old_name)
            new_dir = self.project_manager.get_project_dir(new_name)

            if not old_dir.exists():
                return {"success": False, "error": "Project not found"}

            if new_dir.exists():
                return {"success": False, "error": "A project with this name already exists"}

            # Load project data and update name
            project_data = self.project_manager.load_project(old_name)
            if not project_data:
                return {"success": False, "error": "Failed to load project data"}

            project_data["name"] = new_name
            project_data["updatedAt"] = datetime.now().isoformat()

            # Rename directory
            old_dir.rename(new_dir)

            # Update project.json with new name
            self.project_manager.save_project(new_name, project_data)

            # Update current project if it's the one being renamed
            if self.project_name == old_name:
                self.project_name = new_name
                self.project_data = project_data
                self.project_path = self.project_manager.get_project_file(new_name)

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
            webview.OPEN_DIALOG,
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
            webview.SAVE_DIALOG,
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

    def import_excel(self) -> dict:
        """Import shots from Excel/CSV file"""
        if not self._window:
            return {"success": False, "error": "Window not initialized"}

        file_types = ("Excel Files (*.xlsx;*.xls;*.csv)",)
        result = self._window.create_file_dialog(
            webview.OPEN_DIALOG,
            allow_multiple=False,
            file_types=file_types,
        )

        if not result or len(result) == 0:
            return {"success": False, "error": "No file selected"}

        file_path = Path(result[0])
        logger.info(f"Importing from: {file_path}")

        try:
            from services.excel_parser import ExcelParser

            parser = ExcelParser()
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

    def export_template(self) -> dict:
        """Export Excel template file"""
        if not self._window:
            return {"success": False, "error": "Window not initialized"}

        result = self._window.create_file_dialog(
            webview.SAVE_DIALOG,
            save_filename="template.xlsx",
            file_types=("Excel Files (*.xlsx)",),
        )

        if not result:
            return {"success": False, "error": "No file selected"}

        try:
            from services.excel_parser import ExcelParser

            parser = ExcelParser()
            parser.export_template(Path(result))
            logger.info(f"Template exported to: {result}")
            return {"success": True, "path": result}
        except Exception as e:
            logger.error(f"Failed to export template: {e}")
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
                    from services.generator import GenerationClient, download_file

                    char["status"] = "generating"

                    # Get settings
                    settings = self._load_settings()
                    tti_config = settings.get("tti", {})

                    if not tti_config.get("apiUrl") or not tti_config.get("apiKey"):
                        raise ValueError("TTI API not configured in settings")

                    # Create client
                    client = GenerationClient(
                        api_url=tti_config["apiUrl"],
                        api_key=tti_config["apiKey"],
                        model=tti_config.get("model", "gemini-2.5-flash-image-landscape"),
                    )

                    # Generate image (returns URL)
                    # Build professional 3-view character design prompt
                    character_desc = char.get('description', '').strip()

                    prompt_template = """
**一张专业角色设计参考图，横向3等分布局展示同一角色的三个视角。**

画面比例16:9，纯白背景，从左到右依次为：正面全身视角、侧面全身视角、背面全身视角。

**全局要求：**
- 三个视角必须是同一角色：相同的面容、服装、体型、比例
- 角色占每个区域高度的85%，头顶和脚底保留适当留白，不得裁切
- 统一姿态：自然站立，双臂自然下垂于身体两侧，双脚并拢，身体放松
- **画质标准：电影级别的超高清画质，细节丰富精细，光影自然真实，质感层次分明，达到专业影视制作的视觉水准（除非角色描述中有特殊风格要求）**
- **角色类型默认设定：真人风格，亚洲面孔（中国人），写实呈现（除非角色描述中另有说明）**
- **外貌品质标准：角色必须具备主角级别的出众外貌，五官精致立体，面部比例完美，气质超凡，具有强烈的视觉美感和吸引力。皮肤质感细腻，整体呈现应达到专业演员/模特的高水准颜值（除非角色描述中有特殊设定）**

**三个视角的具体要求：**
1. **左侧区域 - 正面视角**：角色正面朝向观察者，身体对称，完整展示面部特征和服装正面细节
2. **中间区域 - 侧面视角**：角色右侧身90度朝向观察者，清晰展示身体轮廓线条和服装侧面结构
3. **右侧区域 - 背面视角**：角色背部朝向观察者，完整呈现发型背面和服装后部设计

**角色描述：**
{character_desc}
"""

                    prompt = prompt_template.format(character_desc=character_desc if character_desc else char['name'])
                    image_urls = asyncio.run(client.generate_image(prompt, count=1))

                    if not image_urls:
                        raise ValueError("No images generated")

                    image_url = image_urls[0]

                    # Require project to be saved before generating images
                    if not self.project_name:
                        raise ValueError("Please save the project first before generating character images")

                    # Download and save to project directory
                    image_path = self.project_manager.get_character_image_path(
                        self.project_name, character_id
                    )
                    asyncio.run(download_file(image_url, image_path))
                    # Convert to HTTP URL for frontend with cache-busting timestamp
                    import time
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
            webview.OPEN_DIALOG,
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
            output_path = self.project_manager.get_character_image_path(
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
                    char["status"] = "ready"
                    logger.info(f"Uploaded character image for {character_id}")
                    return {"success": True, "imageUrl": char["imageUrl"], "character": char}

            return {"success": False, "error": "Character not found"}

        except Exception as e:
            logger.error(f"Failed to upload character image: {e}")
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

    # ========== Shot Management ==========

    def update_shot(self, shot_id: str, field: str, value: Any) -> dict:
        """Update a single shot field"""
        if not self.project_data:
            return {"success": False, "error": "No project data"}

        for shot in self.project_data["shots"]:
            if shot["id"] == shot_id:
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
                    from services.generator import GenerationClient, download_file, compress_image_if_needed

                    shot["status"] = "generating_images"

                    # Get settings
                    settings = self._load_settings()
                    tti_config = settings.get("tti", {})

                    if not tti_config.get("apiUrl") or not tti_config.get("apiKey"):
                        raise ValueError("TTI API not configured in settings")

                    # Require project to be saved before generating images
                    if not self.project_name:
                        raise ValueError("Please save the project first before generating shot images")

                    # Get character references for this shot
                    shot_characters = shot.get("characters", [])
                    reference_images = []
                    character_references = []  # Store character name and image data pairs

                    if shot_characters:
                        logger.info(f"Shot involves characters: {shot_characters}")

                        # Find characters with images
                        for char_name in shot_characters:
                            for char in self.project_data["characters"]:
                                if char["name"] == char_name and char.get("imageUrl"):
                                    # Get local path from imageUrl
                                    image_url = char["imageUrl"]
                                    # Remove cache-busting timestamp
                                    if "?t=" in image_url:
                                        image_url = image_url.split("?t=")[0]

                                    # Convert HTTP URL back to local path
                                    if image_url.startswith(f"http://127.0.0.1:{self._file_server_port}/"):
                                        local_path = image_url.replace(f"http://127.0.0.1:{self._file_server_port}/", "")
                                        # Handle both relative and absolute paths
                                        if not local_path.startswith("/"):
                                            local_path = str(Path.cwd() / local_path)

                                        if Path(local_path).exists():
                                            # Compress the reference image
                                            reference_image_data = compress_image_if_needed(local_path, max_size_kb=256)
                                            reference_images.append(reference_image_data)
                                            character_references.append(char_name)
                                            logger.info(f"Added character reference: {char_name} -> {local_path}")
                                        else:
                                            logger.warning(f"Character image not found: {local_path}")
                                    break

                    # Create client
                    client = GenerationClient(
                        api_url=tti_config["apiUrl"],
                        api_key=tti_config["apiKey"],
                        model=tti_config.get("model", "gemini-2.5-flash-image-landscape"),
                    )

                    # Build enhanced prompt with character information
                    base_prompt = shot.get("imagePrompt", "")

                    if reference_images:
                        # Build character reference description
                        character_descriptions = []
                        for i, char_name in enumerate(character_references, 1):
                            character_descriptions.append(f"第{i}张图：{char_name}")

                        character_info = "、".join(character_descriptions)

                        # Use image-to-image generation with character references
                        enhanced_prompt = f"""基于提供的角色参考图，生成以下场景：

{base_prompt}

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
                            count=4
                        ))
                    else:
                        # Use text-to-image generation (original behavior)
                        logger.info("No character references found, using text-to-image generation")
                        image_urls = asyncio.run(client.generate_image(base_prompt, count=4))

                    if not image_urls:
                        raise ValueError("No images generated")

                    # Download and save images to project directory
                    # Strategy: Always maintain 4 alternative images (index 1-4)
                    # If slots are available, fill them; otherwise replace the oldest one
                    image_paths = []
                    image_local_paths = []
                    shot_id = shot["id"]

                    # Check which slots (1-4) are already occupied
                    existing_slots = []
                    for slot in range(1, 5):
                        slot_path = self.project_manager.get_shot_image_path(self.project_name, shot_id, slot)
                        if slot_path.exists():
                            existing_slots.append((slot, slot_path.stat().st_mtime))

                    # Sort by modification time (oldest first)
                    existing_slots.sort(key=lambda x: x[1])

                    # Determine which slots to use for new images
                    slots_to_use = []
                    if len(existing_slots) < 4:
                        # Fill empty slots first
                        occupied = {slot for slot, _ in existing_slots}
                        for slot in range(1, 5):
                            if slot not in occupied:
                                slots_to_use.append(slot)
                                if len(slots_to_use) == 4:
                                    break
                    else:
                        # All slots occupied, replace the 4 oldest ones
                        slots_to_use = [slot for slot, _ in existing_slots[:4]]

                    # Download and save new images
                    first_new_slot = None  # Track the first newly generated image slot
                    for idx, img_url in enumerate(image_urls):
                        slot = slots_to_use[idx]
                        if first_new_slot is None:
                            first_new_slot = slot
                        image_path = self.project_manager.get_shot_image_path(self.project_name, shot_id, slot)
                        asyncio.run(download_file(img_url, image_path))
                        image_local_paths.append(str(image_path))
                        image_paths.append(self._path_to_url(str(image_path)))

                    # Load all 4 slots for frontend display (in order 1-4)
                    all_image_paths = []
                    all_local_paths = []
                    for slot in range(1, 5):
                        slot_path = self.project_manager.get_shot_image_path(self.project_name, shot_id, slot)
                        if slot_path.exists():
                            all_image_paths.append(self._path_to_url(str(slot_path)))
                            all_local_paths.append(str(slot_path))

                    # If no images existed before, set the first newly generated image as selected
                    # Otherwise keep the current selection
                    if len(existing_slots) == 0 and first_new_slot is not None:
                        # Find the index of the first new slot in the sorted list
                        shot["selectedImageIndex"] = first_new_slot - 1  # Convert slot (1-4) to index (0-3)
                        logger.info(f"Set first generated image (slot {first_new_slot}) as default selection")
                    elif "selectedImageIndex" not in shot or shot["selectedImageIndex"] >= len(all_image_paths):
                        shot["selectedImageIndex"] = 0  # Default to first available image

                    shot["images"] = all_image_paths
                    shot["_localImagePaths"] = all_local_paths
                    shot["status"] = "images_ready"

                    generation_type = "图生图" if reference_images else "文生图"
                    logger.info(f"Generated {len(image_urls)} images for shot {shot_id} using {generation_type}, total alternatives: {len(all_image_paths)}")
                    return {"success": True, "images": all_image_paths, "shot": shot}

                except Exception as e:
                    shot["status"] = "error"
                    shot["errorMessage"] = str(e)
                    logger.error(f"Failed to generate images: {e}")
                    return {"success": False, "error": str(e)}

        return {"success": False, "error": "Shot not found"}

    def generate_images_batch(self, shot_ids: list) -> dict:
        """Generate images for multiple shots"""
        results = []
        for shot_id in shot_ids:
            result = self.generate_images_for_shot(shot_id)
            results.append({"shot_id": shot_id, **result})
        return {"success": True, "results": results}

    # ========== Video Generation ==========

    def generate_video_for_shot(self, shot_id: str) -> dict:
        """Generate video for a single shot"""
        if not self.project_data:
            return {"success": False, "error": "No project data"}

        for shot in self.project_data["shots"]:
            if shot["id"] == shot_id:
                try:
                    import asyncio
                    from services.generator import GenerationClient, download_file

                    shot["status"] = "generating_video"

                    # Get settings
                    settings = self._load_settings()
                    ttv_config = settings.get("ttv", {})

                    if not ttv_config.get("apiUrl") or not ttv_config.get("apiKey"):
                        raise ValueError("TTV API not configured in settings")

                    # Create client
                    client = GenerationClient(
                        api_url=ttv_config["apiUrl"],
                        api_key=ttv_config["apiKey"],
                        model=ttv_config.get("model", "veo_3_1_i2v_s_fast_fl_landscape"),
                    )

                    # Get selected image path (use local path for video generation)
                    selected_idx = shot.get("selectedImageIndex", 0)
                    local_images = shot.get("_localImagePaths", [])

                    if not local_images:
                        raise ValueError("No images available for video generation")

                    # Use local file path for video generation
                    image_local_path = local_images[selected_idx] if selected_idx < len(local_images) else local_images[0]

                    # Check if model supports image input
                    model = ttv_config.get("model", "")
                    image_paths = None

                    if "i2v" in model or "r2v" in model:
                        # Image-to-video models - use first frame
                        image_paths = [image_local_path]
                        logger.info(f"Using first frame for I2V: {image_local_path}")

                    # Generate video (returns URL)
                    prompt = shot.get("videoPrompt", "")
                    video_url = asyncio.run(client.generate_video(prompt, image_paths))

                    if not video_url:
                        raise ValueError("No video generated")

                    # Require project to be saved before generating videos
                    if not self.project_name:
                        raise ValueError("Please save the project first before generating videos")

                    # Download and save video to project directory
                    # Strategy: Always maintain 4 alternative videos (index 1-4)
                    # If slots are available, fill them; otherwise replace the oldest one
                    video_paths = []
                    shot_id_str = shot["id"]

                    # Check which slots (1-4) are already occupied
                    existing_slots = []
                    for slot in range(1, 5):
                        slot_path = self.project_manager.get_shot_video_path(self.project_name, shot_id_str, slot)
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

                    # Download and save new video
                    video_path = self.project_manager.get_shot_video_path(self.project_name, shot_id_str, target_slot)
                    asyncio.run(download_file(video_url, video_path))

                    # Load all 4 slots for frontend display (in order 1-4)
                    all_video_paths = []
                    for slot in range(1, 5):
                        slot_path = self.project_manager.get_shot_video_path(self.project_name, shot_id_str, slot)
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
                    logger.info(f"Generated video for shot {shot_id}, total alternatives: {len(all_video_paths)}")
                    return {"success": True, "videoUrl": shot["videoUrl"], "shot": shot}

                except Exception as e:
                    shot["status"] = "error"
                    shot["errorMessage"] = str(e)
                    logger.error(f"Failed to generate video: {e}")
                    return {"success": False, "error": str(e)}

        return {"success": False, "error": "Shot not found"}

    def generate_videos_batch(self, shot_ids: list) -> dict:
        """Generate videos for multiple shots"""
        results = []
        for shot_id in shot_ids:
            result = self.generate_video_for_shot(shot_id)
            results.append({"shot_id": shot_id, **result})
        return {"success": True, "results": results}

    # ========== Audio Generation ==========

    def generate_audio_for_shot(self, shot_id: str) -> dict:
        """Generate audio for a single shot"""
        if not self.project_data:
            return {"success": False, "error": "No project data"}

        for shot in self.project_data["shots"]:
            if shot["id"] == shot_id:
                try:
                    import asyncio
                    from services.generator import GenerationClient

                    shot["status"] = "generating_audio"

                    # Get settings
                    settings = self._load_settings()
                    tts_config = settings.get("tts", {})

                    if not tts_config.get("apiUrl"):
                        raise ValueError("TTS API not configured in settings")

                    # Require project to be saved before generating audio
                    if not self.project_name:
                        raise ValueError("Please save the project first before generating audio")

                    # Get voice actor and reference audio
                    voice_actor = shot.get("voiceActor", "")
                    if not voice_actor:
                        raise ValueError("No voice actor specified for this shot")

                    # Find character with matching name
                    reference_audio = None
                    character_speed = 1.0
                    for char in self.project_data["characters"]:
                        if char["name"] == voice_actor:
                            reference_audio = char.get("referenceAudioPath")
                            character_speed = char.get("speed", 1.0)
                            break

                    if not reference_audio:
                        raise ValueError(f"No reference audio found for character: {voice_actor}")

                    # Create client
                    client = GenerationClient(
                        api_url=tts_config["apiUrl"],
                        api_key=tts_config.get("apiKey", ""),
                        model=tts_config.get("model", "tts-1"),
                    )

                    # Get script text
                    script = shot.get("script", "")
                    if not script:
                        raise ValueError("No script text for this shot")

                    # Get emotion and intensity
                    emotion = shot.get("emotion", "")
                    intensity = shot.get("intensity", "")

                    # Generate audio
                    audio_bytes = asyncio.run(
                        client.generate_audio(
                            text=script,
                            reference_audio=reference_audio,
                            speed=character_speed,
                            emotion=emotion,
                            intensity=intensity,
                        )
                    )

                    if not audio_bytes:
                        raise ValueError("No audio generated")

                    # Save audio to project directory
                    audio_path = self.project_manager.get_shot_audio_path(
                        self.project_name, shot_id
                    )
                    audio_path.parent.mkdir(parents=True, exist_ok=True)
                    with open(audio_path, "wb") as f:
                        f.write(audio_bytes)

                    # Update shot with audio URL
                    shot["audioUrl"] = self._path_to_url(str(audio_path))
                    shot["status"] = "audio_ready"

                    logger.info(f"Generated audio for shot {shot_id}")
                    return {"success": True, "audioUrl": shot["audioUrl"], "shot": shot}

                except Exception as e:
                    shot["status"] = "error"
                    shot["errorMessage"] = str(e)
                    logger.error(f"Failed to generate audio: {e}")
                    return {"success": False, "error": str(e)}

        return {"success": False, "error": "Shot not found"}

    def generate_audios_batch(self, shot_ids: list) -> dict:
        """Generate audio for multiple shots"""
        results = []
        for shot_id in shot_ids:
            result = self.generate_audio_for_shot(shot_id)
            results.append({"shot_id": shot_id, **result})
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
            webview.FOLDER_DIALOG,
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


    # ========== Settings Management ==========

    def get_settings(self) -> dict:
        """Get application settings"""
        try:
            if self.settings_file.exists():
                with open(self.settings_file, "r", encoding="utf-8") as f:
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
            # Check if work directory changed
            old_work_dir = None
            if self.settings_file.exists():
                try:
                    with open(self.settings_file, "r", encoding="utf-8") as f:
                        old_settings = json.load(f)
                        old_work_dir = old_settings.get("workDir")
                except Exception:
                    pass

            new_work_dir = settings.get("workDir")

            # If work directory changed, move settings file to new location
            if old_work_dir and new_work_dir and old_work_dir != new_work_dir:
                new_settings_file = Path(new_work_dir) / "settings.json"
                new_settings_file.parent.mkdir(parents=True, exist_ok=True)

                # Save to new location
                with open(new_settings_file, "w", encoding="utf-8") as f:
                    json.dump(settings, f, indent=2, ensure_ascii=False)

                # Remove old settings file
                try:
                    if self.settings_file.exists():
                        self.settings_file.unlink()
                        logger.info(f"Removed old settings file: {self.settings_file}")
                except Exception as e:
                    logger.warning(f"Failed to remove old settings file: {e}")

                # Update settings file path
                self._settings_file = new_settings_file
                logger.info(f"Moved settings file to: {new_settings_file}")
            else:
                # Save to current location
                self.settings_file.parent.mkdir(parents=True, exist_ok=True)
                with open(self.settings_file, "w", encoding="utf-8") as f:
                    json.dump(settings, f, indent=2, ensure_ascii=False)

            # Update project manager work directory if changed
            if "workDir" in settings:
                self.project_manager.set_work_dir(Path(settings["workDir"]))

            logger.info("Saved settings")
            return {"success": True}
        except Exception as e:
            logger.error(f"Failed to save settings: {e}")
            return {"success": False, "error": str(e)}

    def select_work_dir(self) -> dict:
        """Select work directory"""
        if not self._window:
            return {"success": False, "error": "Window not initialized"}

        result = self._window.create_file_dialog(
            webview.FOLDER_DIALOG,
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
            webview.FOLDER_DIALOG,
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

