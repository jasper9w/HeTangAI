"""
Project directory manager
Handles project directory structure and file organization
"""
import json
import shutil
from pathlib import Path
from typing import Optional
from loguru import logger


class ProjectManager:
    """Manages project directory structure and files"""

    def __init__(self, work_dir: Path):
        self.work_dir = Path(work_dir)
        self.work_dir.mkdir(parents=True, exist_ok=True)

    def set_work_dir(self, work_dir: Path):
        """Update work directory"""
        self.work_dir = Path(work_dir)
        self.work_dir.mkdir(parents=True, exist_ok=True)
        logger.info(f"Work directory set to: {self.work_dir}")

    def create_project_dir(self, project_name: str) -> Path:
        """Create project directory with subdirectories"""
        project_dir = self.work_dir / project_name
        project_dir.mkdir(parents=True, exist_ok=True)

        # Create subdirectories
        (project_dir / "角色").mkdir(exist_ok=True)
        (project_dir / "镜头").mkdir(exist_ok=True)

        logger.info(f"Created project directory: {project_dir}")
        return project_dir

    def get_project_dir(self, project_name: str) -> Path:
        """Get project directory path"""
        return self.work_dir / project_name

    def get_project_file(self, project_name: str) -> Path:
        """Get path to project.json file"""
        return self.work_dir / project_name / "project.json"

    def get_character_dir(self, project_name: str) -> Path:
        """Get character directory path"""
        return self.work_dir / project_name / "角色"

    def get_shot_dir(self, project_name: str) -> Path:
        """Get shot directory path"""
        return self.work_dir / project_name / "镜头"

    def get_shot_image_path(self, project_name: str, sequence: int, index: int = 0) -> Path:
        """
        Get shot image path
        Args:
            project_name: Project name
            sequence: Shot sequence number
            index: Image index (0 for main image, 1+ for alternatives)
        """
        shot_dir = self.get_shot_dir(project_name)
        if index == 0:
            return shot_dir / f"shot_image_{sequence:03d}.jpeg"
        else:
            return shot_dir / f"shot_image_{sequence:03d}_{index:02d}.jpeg"

    def get_shot_video_path(self, project_name: str, sequence: int) -> Path:
        """Get shot video path"""
        shot_dir = self.get_shot_dir(project_name)
        return shot_dir / f"shot_video_{sequence:03d}.mp4"

    def get_shot_audio_path(self, project_name: str, sequence: int) -> Path:
        """Get shot audio path"""
        shot_dir = self.get_shot_dir(project_name)
        return shot_dir / f"shot_audio_{sequence:03d}.wav"

    def get_character_image_path(self, project_name: str, character_id: str) -> Path:
        """Get character image path"""
        char_dir = self.get_character_dir(project_name)
        return char_dir / f"{character_id}.jpg"

    def list_projects(self) -> list[str]:
        """List all project names in work directory"""
        if not self.work_dir.exists():
            return []

        projects = []
        for item in self.work_dir.iterdir():
            if item.is_dir() and (item / "project.json").exists():
                projects.append(item.name)

        return sorted(projects)

    def save_project(self, project_name: str, project_data: dict) -> Path:
        """Save project data to project.json"""
        project_dir = self.create_project_dir(project_name)
        project_file = project_dir / "project.json"

        with open(project_file, "w", encoding="utf-8") as f:
            json.dump(project_data, f, ensure_ascii=False, indent=2)

        logger.info(f"Saved project to: {project_file}")
        return project_file

    def load_project(self, project_name: str) -> Optional[dict]:
        """Load project data from project.json"""
        project_file = self.get_project_file(project_name)

        if not project_file.exists():
            logger.warning(f"Project file not found: {project_file}")
            return None

        try:
            with open(project_file, "r", encoding="utf-8") as f:
                data = json.load(f)
            logger.info(f"Loaded project from: {project_file}")
            return data
        except Exception as e:
            logger.error(f"Failed to load project: {e}")
            return None

    def save_character_image(
        self, project_name: str, character_id: str, image_data: bytes, ext: str = ".jpg"
    ) -> Path:
        """Save character image to character directory"""
        char_dir = self.get_character_dir(project_name)
        char_dir.mkdir(parents=True, exist_ok=True)

        image_path = char_dir / f"{character_id}{ext}"
        with open(image_path, "wb") as f:
            f.write(image_data)

        logger.info(f"Saved character image: {image_path}")
        return image_path

    def copy_character_image(
        self, project_name: str, character_id: str, source_path: Path
    ) -> Path:
        """Copy character image from source to character directory"""
        char_dir = self.get_character_dir(project_name)
        char_dir.mkdir(parents=True, exist_ok=True)

        dest_path = char_dir / f"{character_id}{source_path.suffix}"
        shutil.copy2(source_path, dest_path)

        logger.info(f"Copied character image: {source_path} -> {dest_path}")
        return dest_path

    def save_shot_image(
        self, project_name: str, sequence: int, image_data: bytes, index: int = 0
    ) -> Path:
        """Save shot image to shot directory"""
        shot_dir = self.get_shot_dir(project_name)
        shot_dir.mkdir(parents=True, exist_ok=True)

        image_path = self.get_shot_image_path(project_name, sequence, index)
        with open(image_path, "wb") as f:
            f.write(image_data)

        logger.info(f"Saved shot image: {image_path}")
        return image_path

    def save_shot_video(
        self, project_name: str, sequence: int, video_data: bytes
    ) -> Path:
        """Save shot video to shot directory"""
        shot_dir = self.get_shot_dir(project_name)
        shot_dir.mkdir(parents=True, exist_ok=True)

        video_path = self.get_shot_video_path(project_name, sequence)
        with open(video_path, "wb") as f:
            f.write(video_data)

        logger.info(f"Saved shot video: {video_path}")
        return video_path

    def save_shot_audio(
        self, project_name: str, sequence: int, audio_data: bytes
    ) -> Path:
        """Save shot audio to shot directory"""
        shot_dir = self.get_shot_dir(project_name)
        shot_dir.mkdir(parents=True, exist_ok=True)

        audio_path = self.get_shot_audio_path(project_name, sequence)
        with open(audio_path, "wb") as f:
            f.write(audio_data)

        logger.info(f"Saved shot audio: {audio_path}")
        return audio_path

    def set_main_shot_image(self, project_name: str, sequence: int, alt_index: int) -> bool:
        """
        Set alternative image as main image
        Swaps the main image (index 0) with the alternative (alt_index)
        """
        main_path = self.get_shot_image_path(project_name, sequence, 0)
        alt_path = self.get_shot_image_path(project_name, sequence, alt_index)

        if not alt_path.exists():
            logger.warning(f"Alternative image not found: {alt_path}")
            return False

        # Swap files
        temp_path = main_path.with_suffix(".tmp")

        if main_path.exists():
            shutil.move(main_path, temp_path)

        shutil.copy2(alt_path, main_path)

        if temp_path.exists():
            shutil.move(temp_path, alt_path)

        logger.info(f"Set alternative {alt_index} as main image for shot {sequence}")
        return True

    def delete_shot_files(self, project_name: str, sequence: int):
        """Delete all files related to a shot"""
        shot_dir = self.get_shot_dir(project_name)

        # Delete main image and alternatives (up to 10)
        for i in range(10):
            img_path = self.get_shot_image_path(project_name, sequence, i)
            if img_path.exists():
                img_path.unlink()
                logger.info(f"Deleted: {img_path}")

        # Delete video
        video_path = self.get_shot_video_path(project_name, sequence)
        if video_path.exists():
            video_path.unlink()
            logger.info(f"Deleted: {video_path}")

        # Delete audio
        audio_path = self.get_shot_audio_path(project_name, sequence)
        if audio_path.exists():
            audio_path.unlink()
            logger.info(f"Deleted: {audio_path}")

    def delete_character_image(self, project_name: str, character_id: str):
        """Delete character image"""
        char_dir = self.get_character_dir(project_name)

        # Try common extensions
        for ext in [".jpg", ".jpeg", ".png", ".webp"]:
            img_path = char_dir / f"{character_id}{ext}"
            if img_path.exists():
                img_path.unlink()
                logger.info(f"Deleted character image: {img_path}")
                return

    def get_shot_images_list(self, project_name: str, sequence: int) -> list[str]:
        """Get list of all image paths for a shot (main + alternatives)"""
        images = []
        for i in range(10):
            img_path = self.get_shot_image_path(project_name, sequence, i)
            if img_path.exists():
                images.append(str(img_path))
        return images
