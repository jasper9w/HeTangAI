"""
API class exposed to frontend via pywebview
"""
import base64
import json
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
        self._settings_file = self._user_data_dir / "settings.json"
        self._window: Optional[webview.Window] = None
        self.project_path: Optional[Path] = None
        self.project_data: Optional[dict] = None
        self.project_name: Optional[str] = None
        self._file_server_port = 8765  # Must match port in main.py
        self._ensure_settings_file()
        # Initialize project manager with work directory from settings
        settings = self._load_settings()
        work_dir = Path(settings.get("workDir", str(Path.home() / "Desktop" / "荷塘AI")))
        self._project_manager = ProjectManager(work_dir)
        logger.info("API initialized")

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

            default_settings = {
                "workDir": default_work_dir,
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
        """List all projects in work directory"""
        try:
            projects = self.project_manager.list_projects()
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
        """Save project to current path"""
        if not self.project_data:
            return {"success": False, "error": "No project data"}

        if not self.project_path:
            return self.save_project_as()

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

                    prompt_template = """一张横向3等分的专业角色设计三视图。
纯白背景，高清画质，三个视角保持角色完全一致。
左侧正面全身，中间侧面全身，右侧背面全身。

画面为横向16:9比例，纯白背景，横向平均分为3个区域，从左到右依次展示同一角色的正面、侧面、背面全身图。

全局规范：
- 三个视图必须保持完全一致：同一角色、同一服装、同一体型比例
- 人物占每个区域高度的85%，头顶与脚底适当留白，禁止裁切
- 统一站姿：自然站立，双臂垂于身侧，双脚并拢，身体放松
- 画质要求：高清、精细、专业角色设计稿风格

区域定义：
1. 左侧 - 正面图：人物正对镜头，左右对称，展示面部与服装正面全部细节
2. 中间 - 侧面图：人物右侧90度朝向镜头，展示身体轮廓与服装侧面结构
3. 右侧 - 背面图：人物完全背对镜头，展示发型后部与服装背面设计

角色描述：
{character_desc}"""

                    prompt = prompt_template.format(character_desc=character_desc if character_desc else char['name'])
                    image_urls = asyncio.run(client.generate_image(prompt, count=1))

                    if not image_urls:
                        raise ValueError("No images generated")

                    image_url = image_urls[0]

                    # Download and save to project directory if project is saved
                    if self.project_name:
                        image_path = self.project_manager.get_character_image_path(
                            self.project_name, character_id
                        )
                        asyncio.run(download_file(image_url, image_path))
                        # Convert to HTTP URL for frontend
                        char["imageUrl"] = self._path_to_url(str(image_path))
                    else:
                        # Save to temp output directory
                        output_path = self.output_dir / "characters" / f"{character_id}.jpg"
                        asyncio.run(download_file(image_url, output_path))
                        # Convert to HTTP URL for frontend
                        char["imageUrl"] = self._path_to_url(str(output_path))

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

            source_path = Path(result[0])
            # Copy to output directory
            output_path = self.output_dir / "characters" / f"{character_id}{source_path.suffix}"
            output_path.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(source_path, output_path)

            # Update character
            for char in self.project_data["characters"]:
                if char["id"] == character_id:
                    char["imageUrl"] = str(output_path)
                    char["status"] = "ready"
                    logger.info(f"Uploaded character image for {character_id}")
                    return {"success": True, "imageUrl": str(output_path), "character": char}

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

    # ========== Image Generation ==========

    def generate_images_for_shot(self, shot_id: str) -> dict:
        """Generate 4 images for a single shot"""
        if not self.project_data:
            return {"success": False, "error": "No project data"}

        for shot in self.project_data["shots"]:
            if shot["id"] == shot_id:
                try:
                    import asyncio
                    from services.generator import GenerationClient, download_file

                    shot["status"] = "generating_images"

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

                    # Generate images (returns URLs)
                    prompt = shot.get("imagePrompt", "")
                    image_urls = asyncio.run(client.generate_image(prompt, count=4))

                    if not image_urls:
                        raise ValueError("No images generated")

                    # Download and save images to project directory if project is saved
                    image_paths = []
                    image_local_paths = []  # Store local paths for video generation
                    sequence = shot.get("sequence", 1)

                    for idx, img_url in enumerate(image_urls):
                        if self.project_name:
                            # Save to project directory
                            image_path = self.project_manager.get_shot_image_path(
                                self.project_name,
                                sequence,
                                index=idx + 1  # 1-4 for alternatives, 0 reserved for main
                            )
                            asyncio.run(download_file(img_url, image_path))
                            # Store local path for video generation
                            image_local_paths.append(str(image_path))
                            # Convert to HTTP URL for frontend
                            image_paths.append(self._path_to_url(str(image_path)))
                        else:
                            # Save to temp output directory
                            output_path = self.output_dir / "shots" / f"shot_{shot_id}_{idx}.jpg"
                            asyncio.run(download_file(img_url, output_path))
                            # Store local path for video generation
                            image_local_paths.append(str(output_path))
                            # Convert to HTTP URL for frontend
                            image_paths.append(self._path_to_url(str(output_path)))

                    # Set first alternative as main image
                    if self.project_name and image_paths:
                        self.project_manager.set_main_shot_image(self.project_name, sequence, 1)
                        # Get the main image path and convert to URL
                        main_path = self.project_manager.get_shot_image_path(self.project_name, sequence, 0)
                        image_local_paths.insert(0, str(main_path))
                        image_paths.insert(0, self._path_to_url(str(main_path)))

                    shot["images"] = image_paths
                    shot["_localImagePaths"] = image_local_paths  # Store local paths for internal use
                    shot["selectedImageIndex"] = 0
                    shot["status"] = "images_ready"
                    logger.info(f"Generated {len(image_paths)} images for shot {shot_id}")
                    return {"success": True, "images": image_paths, "shot": shot}

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

                    # Download and save video to project directory if project is saved
                    sequence = shot.get("sequence", 1)

                    if self.project_name:
                        # Save to project directory
                        video_path = self.project_manager.get_shot_video_path(
                            self.project_name, sequence
                        )
                        asyncio.run(download_file(video_url, video_path))
                        # Convert to HTTP URL for frontend
                        video_local_url = self._path_to_url(str(video_path))
                    else:
                        # Save to temp output directory
                        output_path = self.output_dir / "shots" / f"shot_{shot_id}.mp4"
                        asyncio.run(download_file(video_url, output_path))
                        # Convert to HTTP URL for frontend
                        video_local_url = self._path_to_url(str(output_path))

                    shot["videoUrl"] = video_local_url
                    shot["status"] = "completed"
                    logger.info(f"Generated video for shot {shot_id}")
                    return {"success": True, "videoUrl": video_local_url, "shot": shot}

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
