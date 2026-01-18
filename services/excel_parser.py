"""
Excel/CSV parser for importing shot data
"""
import uuid
from pathlib import Path
from typing import Tuple

import pandas as pd
from loguru import logger
from openpyxl import Workbook


# Column name mapping (Chinese -> English)
COLUMN_MAPPING = {
    "sequence": "sequence",
    "voiceActor": "voiceActor",
    "characters": "characters",
    "emotion": "emotion",
    "intensity": "intensity",
    "script": "script",
    "imagePrompt": "imagePrompt",
    "videoPrompt": "videoPrompt",
}

# Expected Chinese column names
EXPECTED_COLUMNS = ["sequence", "voiceActor", "characters", "emotion", "intensity", "script", "imagePrompt", "videoPrompt"]
CHINESE_COLUMNS = ["xuhao", "peiyin_juese", "chuchang_juese", "qinggan", "qiangdu", "wenan", "tupian_tishici", "shipin_tishici"]


class ExcelParser:
    """Parser for Excel/CSV shot data"""

    def parse(self, file_path: Path) -> Tuple[list, set, list]:
        """
        Parse Excel or CSV file and extract shots and characters

        Args:
            file_path: Path to the Excel/CSV file

        Returns:
            Tuple of (shots_list, characters_set, errors_list)
        """
        logger.info(f"Parsing file: {file_path}")
        errors = []

        try:
            # Read file based on extension
            if file_path.suffix.lower() == ".csv":
                df = pd.read_csv(file_path)
            else:
                df = pd.read_excel(file_path)

            # Normalize column names
            df.columns = self._normalize_columns(df.columns.tolist())

            # Validate required columns
            missing_cols = self._check_required_columns(df.columns.tolist())
            if missing_cols:
                errors.append(f"Missing columns: {', '.join(missing_cols)}")
                logger.warning(f"Missing columns: {missing_cols}")

            shots = []
            characters = set()

            for idx, row in df.iterrows():
                try:
                    shot = self._parse_row(row, idx)
                    shots.append(shot)

                    # Extract characters
                    char_str = str(row.get("characters", ""))
                    for char in self._split_characters(char_str):
                        if char.strip():
                            characters.add(char.strip())

                except Exception as e:
                    error_msg = f"Row {idx + 2}: {str(e)}"
                    errors.append(error_msg)
                    logger.warning(error_msg)

            logger.info(f"Parsed {len(shots)} shots, {len(characters)} characters")
            return shots, characters, errors

        except Exception as e:
            logger.error(f"Failed to parse file: {e}")
            raise

    def _normalize_columns(self, columns: list) -> list:
        """Normalize column names to expected format"""
        normalized = []
        for col in columns:
            col_lower = str(col).lower().strip()

            # Try common variations and Chinese names
            mapping = {
                "sequence": ["序号", "sequence", "xuhao", "id", "no", "num"],
                "voiceActor": ["配音角色", "voiceactor", "peiyin_juese", "voice", "peiyinjuese", "peiyin", "配音"],
                "characters": ["出场角色", "characters", "chuchang_juese", "juese", "chuchangjuese", "chuchang", "角色"],
                "emotion": ["情感", "emotion", "qinggan", "mood"],
                "intensity": ["强度", "intensity", "qiangdu", "level"],
                "script": ["文案", "script", "wenan", "text", "content"],
                "imagePrompt": ["图片提示词", "imageprompt", "tupian_tishici", "image", "tupiantishici", "image_prompt", "图片"],
                "videoPrompt": ["视频提示词", "videoprompt", "shipin_tishici", "video", "shipintishici", "video_prompt", "视频"],
            }

            found = False
            for key, variants in mapping.items():
                if col_lower in [v.lower() for v in variants] or col in variants:
                    normalized.append(key)
                    found = True
                    break

            if not found:
                normalized.append(col_lower)

        return normalized

    def _check_required_columns(self, columns: list) -> list:
        """Check for missing required columns"""
        required = ["script", "imagePrompt"]
        return [col for col in required if col not in columns]

    def _parse_row(self, row: pd.Series, idx: int) -> dict:
        """Parse a single row into a shot dict"""
        return {
            "id": f"shot_{uuid.uuid4().hex[:8]}",
            "sequence": int(row.get("sequence", idx + 1)) if pd.notna(row.get("sequence")) else idx + 1,
            "voiceActor": str(row.get("voiceActor", "")) if pd.notna(row.get("voiceActor")) else "",
            "characters": self._split_characters(str(row.get("characters", ""))),
            "emotion": str(row.get("emotion", "")) if pd.notna(row.get("emotion")) else "",
            "intensity": str(row.get("intensity", "")) if pd.notna(row.get("intensity")) else "",
            "script": str(row.get("script", "")) if pd.notna(row.get("script")) else "",
            "imagePrompt": str(row.get("imagePrompt", "")) if pd.notna(row.get("imagePrompt")) else "",
            "videoPrompt": str(row.get("videoPrompt", "")) if pd.notna(row.get("videoPrompt")) else "",
            "images": [],
            "selectedImageIndex": 0,
            "videoUrl": "",
            "audioUrl": "",
            "status": "pending",
        }

    def _split_characters(self, char_str: str) -> list:
        """Split character string into list"""
        if not char_str or char_str == "nan":
            return []
        # Split by common separators
        for sep in [",", "/", "|"]:
            if sep in char_str:
                return [c.strip() for c in char_str.split(sep) if c.strip()]
        return [char_str.strip()] if char_str.strip() else []

    def export_template(self, file_path: Path):
        """Export an empty Excel template"""
        wb = Workbook()
        ws = wb.active
        ws.title = "镜头列表"

        # Headers (Chinese)
        headers = ["序号", "配音角色", "出场角色", "情感", "强度", "文案", "图片提示词", "视频提示词"]
        for col, header in enumerate(headers, 1):
            ws.cell(row=1, column=col, value=header)

        # Example row
        example = [1, "旁白", "角色A, 角色B", "开心", "中等", "这是文案内容。", "两个角色开心的场景", "镜头缓慢推进"]
        for col, value in enumerate(example, 1):
            ws.cell(row=2, column=col, value=value)

        wb.save(file_path)
        logger.info(f"Template exported to: {file_path}")
