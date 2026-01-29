"""
JSONL parser for importing shot data
"""
import json
import random
import string
from pathlib import Path
from typing import Tuple

from loguru import logger


class JsonlParser:
    """Parser for JSONL shot data"""

    def _generate_shot_id(self) -> str:
        """Generate a 6-character random ID for shot"""
        chars = string.ascii_lowercase + string.digits
        return ''.join(random.choices(chars, k=6))

    def parse(self, file_path: Path) -> Tuple[list, set, list]:
        """
        Parse JSONL file and extract shots and characters

        Args:
            file_path: Path to the JSONL file

        Returns:
            Tuple of (shots_list, characters_set, errors_list)
        """
        logger.info(f"Parsing JSONL file: {file_path}")
        errors = []
        shots = []
        characters = set()

        try:
            with open(file_path, 'r', encoding='utf-8') as f:
                for line_num, line in enumerate(f, 1):
                    line = line.strip()
                    if not line:
                        continue

                    try:
                        obj = json.loads(line)
                        shot = self._parse_jsonl_object(obj, line_num)
                        shots.append(shot)

                        # Extract characters from tti.characters
                        if 'tti' in obj and 'characters' in obj['tti']:
                            for char in obj['tti']['characters']:
                                if char.strip():
                                    characters.add(char.strip())

                        # Also extract from dialogue roles
                        if 'dialogue' in obj:
                            for d in obj['dialogue']:
                                if 'r' in d and d['r'].strip():
                                    characters.add(d['r'].strip())

                    except json.JSONDecodeError as e:
                        error_msg = f"Line {line_num}: Invalid JSON - {str(e)}"
                        errors.append(error_msg)
                        logger.warning(error_msg)
                    except Exception as e:
                        error_msg = f"Line {line_num}: {str(e)}"
                        errors.append(error_msg)
                        logger.warning(error_msg)

            logger.info(f"Parsed {len(shots)} shots, {len(characters)} characters")
            return shots, characters, errors

        except Exception as e:
            logger.error(f"Failed to parse JSONL file: {e}")
            raise

    def _parse_jsonl_object(self, obj: dict, line_num: int) -> dict:
        """Parse a single JSONL object into a shot dict"""
        # Validate required fields
        required_fields = ['shot', 'scene', 'tti', 'ttv', 'dialogue']
        missing = [f for f in required_fields if f not in obj]
        if missing:
            raise ValueError(f"Missing required fields: {', '.join(missing)}")

        tti = obj.get('tti', {})
        ttv = obj.get('ttv', {})
        dialogue_list = obj.get('dialogue', [])

        # Build imagePrompt from tti
        image_prompt = self._build_image_prompt(tti)

        # Build videoPrompt from ttv
        video_prompt = self._build_video_prompt(ttv)

        # Build dialogues array
        dialogues = []
        for d in dialogue_list:
            if 'r' in d and 't' in d:
                # Add support for optional emotion and intensity fields
                dialogue_entry = {
                    "role": d['r'],
                    "text": d['t']
                }

                # Add optional fields if they exist
                if 'emotion' in d:
                    dialogue_entry['emotion'] = d['emotion']
                if 'intensity' in d:
                    dialogue_entry['intensity'] = d['intensity']

                dialogues.append(dialogue_entry)

        # Build script from dialogues - each dialogue on a new line
        script = "\n".join([f"{d['role']}: {d['text']}" for d in dialogues])

        # Get voiceActor (use first dialogue role for backward compatibility)
        voice_actor = dialogues[0]['role'] if dialogues else ""

        # Get characters from tti (these are the characters appearing in the scene)
        characters = tti.get('characters', [])

        # Also add characters from dialogues if not already in the scene characters
        for dialogue in dialogues:
            role = dialogue.get('role', '')
            if role and role not in characters:
                characters.append(role)

        return {
            "id": self._generate_shot_id(),
            "sequence": int(obj.get('shot', line_num)),
            "scene": str(obj.get('scene', '')),
            "voiceActor": voice_actor,  # This is kept for backward compatibility
            "characters": characters,  # Characters appearing in the scene
            "emotion": "",  # Will be filled later if needed
            "intensity": "",  # Will be filled later if needed
            "script": script,  # Combined script of all dialogues in the shot
            "dialogues": dialogues,  # Individual dialogues in the shot
            "imagePrompt": image_prompt,
            "videoPrompt": video_prompt,
            "images": [],
            "selectedImageIndex": 0,
            "videos": [],
            "selectedVideoIndex": 0,
            "videoUrl": "",
            "audioUrl": "",
            "status": "pending",
        }

    def _build_image_prompt(self, tti: dict) -> str:
        """Build image prompt from tti object"""
        parts = []

        shot_type = tti.get('shot_type', '')
        if shot_type:
            parts.append(f"{shot_type}镜头")

        angle = tti.get('angle', '')
        if angle:
            parts.append(f"{angle}角度")

        composition = tti.get('composition', '')
        if composition:
            parts.append(composition)

        lighting = tti.get('lighting', '')
        if lighting:
            parts.append(lighting)

        mood = tti.get('mood', '')
        if mood:
            parts.append(f"氛围{mood}")

        return "，".join(parts) + "。" if parts else ""

    def _build_video_prompt(self, ttv: dict) -> str:
        """Build video prompt from ttv object"""
        parts = []

        motion_type = ttv.get('motion_type', '')
        if motion_type:
            parts.append(f"{motion_type}镜头")

        motion_desc = ttv.get('motion_desc', '')
        if motion_desc:
            parts.append(motion_desc)

        duration = ttv.get('duration', '')
        if duration:
            parts.append(f"时长{duration}")

        speed = ttv.get('speed', '')
        if speed:
            parts.append(f"速度{speed}")

        return "，".join(parts) + "。" if parts else ""

    def export_template(self, file_path: Path):
        """Export a JSONL template with example data"""
        examples = [
            {
                "shot": 1,
                "scene": "沈府厅堂",
                "tti": {
                    "characters": ["沈婉儿"],
                    "shot_type": "特写",
                    "angle": "正面平视",
                    "composition": "沈婉儿眼神决绝，面色沉静",
                    "lighting": "正面光突出坚定神情",
                    "mood": "不容置疑"
                },
                "ttv": {
                    "motion_type": "固定",
                    "motion_desc": "静止镜头强调决心",
                    "duration": "2s",
                    "speed": "normal"
                },
                "dialogue": [
                    {"r": "沈婉儿", "t": "女儿想得明明白白。", "emotion": "平静", "intensity": "0.3"}
                ]
            },
            {
                "shot": 2,
                "scene": "沈府厅堂",
                "tti": {
                    "characters": ["沈父", "沈婉儿"],
                    "shot_type": "中景",
                    "angle": "侧面",
                    "composition": "父女对峙，气氛紧张",
                    "lighting": "侧光营造对立感",
                    "mood": "紧张"
                },
                "ttv": {
                    "motion_type": "推进",
                    "motion_desc": "缓慢推进增强紧张感",
                    "duration": "3s",
                    "speed": "slow"
                },
                "dialogue": [
                    {"r": "沈父", "t": "你可想清楚了？", "emotion": "愤怒", "intensity": "0.3"},
                    {"r": "沈婉儿", "t": "父亲，女儿心意已决。", "emotion": "平静", "intensity": "0.4"}
                ]
            },
            {
                "shot": 3,
                "scene": "街道",
                "tti": {
                    "characters": ["旁白"],
                    "shot_type": "远景",
                    "angle": "俯视",
                    "composition": "繁华街道，人来人往",
                    "lighting": "自然光",
                    "mood": "平静"
                },
                "ttv": {
                    "motion_type": "平移",
                    "motion_desc": "缓慢右移展现街景",
                    "duration": "4s",
                    "speed": "slow"
                },
                "dialogue": [
                    {"r": "旁白", "t": "这是一个普通的下午。", "emotion": "平静", "intensity": "0.2"}
                ]
            }
        ]

        with open(file_path, 'w', encoding='utf-8') as f:
            for example in examples:
                f.write(json.dumps(example, ensure_ascii=False) + '\n')

        logger.info(f"JSONL template exported to: {file_path}")
