"""
音频生成执行器
"""

import asyncio
from pathlib import Path
from typing import Optional, Tuple, Any

from loguru import logger

from .base import BaseExecutor
from services.generator import GenerationClient


class AudioExecutor(BaseExecutor):
    """音频生成执行器"""
    
    task_type = 'audio'
    
    def __init__(
        self,
        db_path: str,
        api_url: str,
        api_key: str,
        model: str = '',  # TTS 可能不需要 model
        worker_id: str = None,
        heartbeat_interval: int = 30,
        lock_timeout: int = 60
    ):
        """
        初始化音频执行器
        
        Args:
            db_path: 数据库路径
            api_url: TTS API 地址
            api_key: API 密钥
            model: 模型名称（TTS 可能不需要）
            worker_id: 执行器ID
            heartbeat_interval: 心跳间隔
            lock_timeout: 锁超时
        """
        super().__init__(db_path, worker_id, heartbeat_interval, lock_timeout)
        self._client = GenerationClient(api_url, api_key, model)
    
    def execute(self, task: Any) -> Tuple[Optional[str], Optional[str]]:
        """
        执行音频生成任务
        
        Args:
            task: AudioTask 对象
        
        Returns:
            (result_url, result_local_path)
        """
        logger.info(f"Executing audio task: {task.id}")
        
        # 检查参考音频
        voice_ref = task.voice_ref
        if voice_ref and not Path(voice_ref).exists():
            raise ValueError(f"Voice reference file not found: {voice_ref}")
        
        # 调用生成 API
        audio_bytes = asyncio.run(
            self._client.generate_audio(
                text=task.text,
                reference_audio=voice_ref,
                speed=task.speed or 1.0,
                emotion=task.emotion or '',
                intensity=task.emotion_intensity or ''
            )
        )
        
        if not audio_bytes:
            raise RuntimeError("No audio data returned from API")
        
        result_url = None  # TTS 通常直接返回 bytes，没有 URL
        result_local_path = None
        
        # 保存到本地
        if task.output_dir:
            output_dir = Path(task.output_dir)
            output_dir.mkdir(parents=True, exist_ok=True)
            
            filename = f"{task.id}.wav"
            local_path = output_dir / filename
            
            with open(local_path, 'wb') as f:
                f.write(audio_bytes)
            
            result_local_path = str(local_path)
            logger.info(f"Saved audio to: {result_local_path}")
            
            # 计算音频时长（简单估算，或者用 pydub）
            self._audio_duration_ms = self._estimate_duration(audio_bytes)
        else:
            # 如果没有指定输出目录，需要临时保存
            import tempfile
            with tempfile.NamedTemporaryFile(suffix='.wav', delete=False) as f:
                f.write(audio_bytes)
                result_local_path = f.name
            self._audio_duration_ms = self._estimate_duration(audio_bytes)
        
        return result_url, result_local_path
    
    def _estimate_duration(self, audio_bytes: bytes) -> int:
        """估算音频时长（毫秒）"""
        try:
            from pydub import AudioSegment
            import io
            audio = AudioSegment.from_file(io.BytesIO(audio_bytes))
            return len(audio)
        except Exception as e:
            logger.warning(f"Failed to estimate audio duration: {e}")
            # 粗略估算：假设 16kHz, 16bit, mono
            # bytes / (16000 * 2) * 1000 = bytes / 32
            return len(audio_bytes) // 32
    
    def _get_extra_result_fields(self, task: Any) -> dict:
        """返回额外的结果字段"""
        return {
            'result_duration_ms': getattr(self, '_audio_duration_ms', None)
        }
