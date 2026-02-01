"""
视频生成执行器
"""

import asyncio
import json
from pathlib import Path
from typing import Optional, Tuple, Any, List, Callable

from loguru import logger

from .base import BaseExecutor
from services.generator import GenerationClient, download_file


class VideoExecutor(BaseExecutor):
    """视频生成执行器"""
    
    task_type = 'video'
    
    def __init__(
        self,
        db_path: str,
        api_url: str = None,
        api_key: str = None,
        model: str = None,
        worker_id: str = None,
        heartbeat_interval: int = 30,
        lock_timeout: int = 120,  # 视频生成通常更慢
        settings_file: str = None,
        config_key: str = 'ttv',
        current_project_id_getter: Callable[[], str] = None
    ):
        """
        初始化视频执行器
        
        Args:
            db_path: 数据库路径
            api_url: API 地址（已弃用，优先使用 settings_file）
            api_key: API 密钥（已弃用，优先使用 settings_file）
            model: 模型名称（已弃用，优先使用 settings_file）
            worker_id: 执行器ID
            heartbeat_interval: 心跳间隔
            lock_timeout: 锁超时
            settings_file: 设置文件路径，每次执行时动态读取配置
            config_key: 配置键名（如 'ttv'）
            current_project_id_getter: 获取当前项目ID的回调函数
        """
        super().__init__(db_path, worker_id, heartbeat_interval, lock_timeout, current_project_id_getter)
        self._settings_file = settings_file
        self._config_key = config_key
        # 保留旧参数作为后备
        self._fallback_api_url = api_url
        self._fallback_api_key = api_key
        self._fallback_model = model
    
    def _load_config(self) -> tuple:
        """动态加载最新配置，支持 hosted/custom 模式"""
        if self._settings_file and Path(self._settings_file).exists():
            try:
                with open(self._settings_file, 'r', encoding='utf-8') as f:
                    settings = json.load(f)
                
                # 检查是否是托管模式
                if settings.get('apiMode') == 'hosted':
                    hosted = settings.get('hostedService', {})
                    api_url = hosted.get('baseUrl', '')
                    api_key = hosted.get('token', '')
                    model = f'hetang-{self._config_key}-v1'
                    if api_key:
                        logger.debug(f"Using hosted mode: api_url={api_url[:30]}...")
                        return api_url, api_key, model
                else:
                    # 自定义模式
                    config = settings.get('customApi', {}).get(self._config_key, {})
                    api_url = config.get('apiUrl', '')
                    api_key = config.get('apiKey', '')
                    model = config.get('model', '')
                    if api_url:
                        logger.debug(f"Using custom mode: api_url={api_url[:30]}...")
                        return api_url, api_key, model
            except Exception as e:
                logger.warning(f"Failed to load settings file: {e}")
        
        # 使用后备配置
        return self._fallback_api_url, self._fallback_api_key, self._fallback_model
    
    def _get_client(self) -> GenerationClient:
        """获取使用最新配置的客户端"""
        api_url, api_key, model = self._load_config()
        if not api_url:
            raise ValueError("Video API URL not configured")
        return GenerationClient(api_url, api_key, model)
    
    def execute(self, task: Any) -> Tuple[Optional[str], Optional[str]]:
        """
        执行视频生成任务
        
        Args:
            task: VideoTask 对象
        
        Returns:
            (result_url, result_local_path)
        """
        logger.info(f"Executing video task: {task.id}, subtype={task.subtype}")
        
        # 准备参考图（根据 subtype 处理）
        image_paths: Optional[List[str]] = None
        
        if task.reference_images:
            image_paths = []
            for img_path in task.reference_images.split(','):
                img_path = img_path.strip()
                if img_path and Path(img_path).exists():
                    image_paths.append(img_path)
                    logger.debug(f"Added reference image: {img_path}")
            
            if not image_paths:
                image_paths = None
        
        # 根据 subtype 验证参数
        if task.subtype == 'frames2video':
            if not image_paths or len(image_paths) < 1:
                raise ValueError("frames2video requires at least 1 frame image")
            logger.info(f"Using {len(image_paths)} frame(s) for frames2video")
        elif task.subtype == 'reference2video':
            if not image_paths:
                raise ValueError("reference2video requires reference images")
            logger.info(f"Using {len(image_paths)} reference image(s)")
        elif task.subtype == 'text2video':
            image_paths = None  # 纯文生视频不需要图片
            logger.info("Using text2video mode (no images)")
        
        # 每次执行时获取最新配置的客户端
        client = self._get_client()
        
        # 调用生成 API
        result_url = asyncio.run(
            client.generate_video(
                prompt=task.prompt,
                image_paths=image_paths
            )
        )
        
        if not result_url:
            raise RuntimeError("No video URL returned from API")
        
        result_local_path = None
        
        # 如果指定了输出目录，下载到本地
        if task.output_dir:
            output_dir = Path(task.output_dir)
            output_dir.mkdir(parents=True, exist_ok=True)
            
            # 生成文件名
            ext = self._get_extension_from_url(result_url) or '.mp4'
            filename = f"{task.id}{ext}"
            local_path = output_dir / filename
            
            # 下载文件
            asyncio.run(download_file(result_url, local_path))
            result_local_path = str(local_path)
            logger.info(f"Downloaded video to: {result_local_path}")
        
        return result_url, result_local_path
    
    def _get_extension_from_url(self, url: str) -> str:
        """从 URL 提取文件扩展名"""
        from urllib.parse import urlparse
        path = urlparse(url).path
        if '.' in path:
            ext = '.' + path.rsplit('.', 1)[-1].lower()
            if ext in ['.mp4', '.webm', '.mov', '.avi']:
                return ext
        return '.mp4'
