"""
图片生成执行器
"""

import asyncio
import uuid
from pathlib import Path
from typing import Optional, Tuple, Any

from loguru import logger

from .base import BaseExecutor
from services.generator import (
    GenerationClient, compress_image_if_needed, download_file
)


class ImageExecutor(BaseExecutor):
    """图片生成执行器"""
    
    task_type = 'image'
    
    def __init__(
        self,
        db_path: str,
        api_url: str,
        api_key: str,
        model: str,
        worker_id: str = None,
        heartbeat_interval: int = 30,
        lock_timeout: int = 60
    ):
        """
        初始化图片执行器
        
        Args:
            db_path: 数据库路径
            api_url: API 地址
            api_key: API 密钥
            model: 模型名称
            worker_id: 执行器ID
            heartbeat_interval: 心跳间隔
            lock_timeout: 锁超时
        """
        super().__init__(db_path, worker_id, heartbeat_interval, lock_timeout)
        self._client = GenerationClient(api_url, api_key, model)
    
    def execute(self, task: Any) -> Tuple[Optional[str], Optional[str]]:
        """
        执行图片生成任务
        
        Args:
            task: ImageTask 对象
        
        Returns:
            (result_url, result_local_path)
        """
        logger.info(f"Executing image task: {task.id}, subtype={task.subtype}")
        
        # 准备参考图
        reference_images = None
        if task.reference_images:
            reference_images = []
            for img_path in task.reference_images.split(','):
                img_path = img_path.strip()
                if img_path and Path(img_path).exists():
                    # 压缩并转换为 base64
                    base64_data = compress_image_if_needed(img_path)
                    reference_images.append({"base64": base64_data})
                    logger.debug(f"Added reference image: {img_path}")
        
        # 调用生成 API（只生成1张）
        urls = asyncio.run(
            self._client.generate_image(
                prompt=task.prompt,
                reference_images=reference_images,
                count=1
            )
        )
        
        if not urls:
            raise RuntimeError("No image URL returned from API")
        
        result_url = urls[0]
        result_local_path = None
        
        # 如果指定了输出目录，下载到本地
        if task.output_dir:
            output_dir = Path(task.output_dir)
            output_dir.mkdir(parents=True, exist_ok=True)
            
            # 生成文件名
            ext = self._get_extension_from_url(result_url) or '.jpeg'
            filename = f"{task.id}{ext}"
            local_path = output_dir / filename
            
            # 下载文件
            asyncio.run(download_file(result_url, local_path))
            result_local_path = str(local_path)
            logger.info(f"Downloaded image to: {result_local_path}")
        
        return result_url, result_local_path
    
    def _get_extension_from_url(self, url: str) -> str:
        """从 URL 提取文件扩展名"""
        from urllib.parse import urlparse
        path = urlparse(url).path
        if '.' in path:
            ext = '.' + path.rsplit('.', 1)[-1].lower()
            if ext in ['.jpg', '.jpeg', '.png', '.webp', '.gif']:
                return ext
        return '.jpeg'
