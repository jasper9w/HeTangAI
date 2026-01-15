"""
API class exposed to frontend via pywebview
"""
import json
import uuid
from datetime import datetime
from pathlib import Path
from typing import Any, Optional

import webview
from loguru import logger


class Api:
    """pywebview API for frontend communication"""

    def __init__(self, user_data_dir: Path, output_dir: Path):
        self.user_data_dir = user_data_dir
        self.output_dir = output_dir
        self._window: Optional[webview.Window] = None
        self.project_path: Optional[Path] = None
        self.project_data: Optional[dict] = None
        logger.info("API initialized")

    def set_window(self, window: webview.Window):
        """Set window reference (called from main.py, not stored in __init__)"""
        self._window = window

    # ========== Project Management ==========

    def new_project(self) -> dict:
        """Create a new empty project"""
        logger.info("Creating new project")
        self.project_data = {
            "version": "1.0",
            "name": "Untitled Project",
            "createdAt": datetime.now().isoformat(),
            "updatedAt": datetime.now().isoformat(),
            "characters": [],
            "shots": [],
        }
        self.project_path = None
        return {"success": True, "data": self.project_data}

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

    def delete_character(self, character_id: str) -> dict:
        """Delete a character"""
        if not self.project_data:
            return {"success": False, "error": "No project data"}

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
                    from services.mock_generator import MockCharacterGenerator

                    char["status"] = "generating"
                    generator = MockCharacterGenerator()
                    # Use character name and description as prompt
                    prompt = f"{char['name']}: {char.get('description', '')}"
                    image_url = generator.generate(prompt)
                    char["imageUrl"] = image_url
                    char["status"] = "ready"
                    logger.info(f"Generated character image for {character_id}")
                    return {"success": True, "imageUrl": image_url, "character": char}
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
                    from services.mock_generator import MockImageGenerator

                    shot["status"] = "generating_images"
                    generator = MockImageGenerator()
                    images = generator.generate(shot.get("imagePrompt", ""), count=4)
                    shot["images"] = images
                    shot["selectedImageIndex"] = 0
                    shot["status"] = "images_ready"
                    logger.info(f"Generated images for shot {shot_id}")
                    return {"success": True, "images": images, "shot": shot}
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
                    from services.mock_generator import MockVideoGenerator

                    shot["status"] = "generating_video"
                    generator = MockVideoGenerator()
                    selected_idx = shot.get("selectedImageIndex", 0)
                    images = shot.get("images", [])
                    image_url = images[selected_idx] if selected_idx < len(images) else ""
                    video_url = generator.generate(shot.get("videoPrompt", ""), image_url)
                    shot["videoUrl"] = video_url
                    shot["status"] = "completed"
                    logger.info(f"Generated video for shot {shot_id}")
                    return {"success": True, "videoUrl": video_url, "shot": shot}
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
