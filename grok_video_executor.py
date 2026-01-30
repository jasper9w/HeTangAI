#!/usr/bin/env python3
"""
Grok 图生视频执行器

基于 Grok Web API 实现图生视频功能，支持多并发执行。

使用方法:
    # 单个执行器
    uv run python grok_video_executor.py --db /path/to/tasks.db --cookie "sso=xxx; sso-rw=xxx"

    # 多并发执行器
    uv run python grok_video_executor.py --db /path/to/tasks.db --cookie "sso=xxx" --concurrency 3

依赖:
    pip install peewee loguru curl_cffi

环境变量（可选，优先级低于命令行参数）:
    GROK_COOKIE: Grok 网站的 cookie 字符串
"""

import argparse
import base64
import json
import os
import random
import re
import signal
import socket
import sys
import threading
import time
import uuid
from abc import ABC, abstractmethod
from datetime import datetime, timedelta
from enum import Enum
from pathlib import Path
from typing import Any, Optional, Tuple

from curl_cffi import requests as curl_requests
from loguru import logger
from peewee import (
    CharField,
    DatabaseProxy,
    DateTimeField,
    IntegerField,
    Model,
    OperationalError,
    SqliteDatabase,
    TextField,
)


# ============================================================
# 数据模型定义
# ============================================================

database_proxy = DatabaseProxy()


class TaskStatus(str, Enum):
    """任务状态"""
    PENDING = 'pending'
    PAUSED = 'paused'
    RUNNING = 'running'
    SUCCESS = 'success'
    FAILED = 'failed'
    CANCELLED = 'cancelled'


class BaseTask(Model):
    """任务基类"""
    
    id = CharField(primary_key=True, max_length=36)
    subtype = CharField(max_length=20)
    status = CharField(max_length=20, default=TaskStatus.PENDING.value)
    priority = IntegerField(default=100)
    depends_on = TextField(null=True)
    
    result_url = TextField(null=True)
    result_local_path = TextField(null=True)
    error = TextField(null=True)
    
    max_retries = IntegerField(default=3)
    retry_count = IntegerField(default=0)
    timeout_seconds = IntegerField(default=300)
    expire_at = DateTimeField(null=True)
    locked_by = CharField(max_length=64, null=True)
    locked_at = DateTimeField(null=True)
    started_at = DateTimeField(null=True)
    created_at = DateTimeField(default=datetime.now)
    updated_at = DateTimeField(default=datetime.now)
    completed_at = DateTimeField(null=True)
    
    class Meta:
        database = database_proxy


class VideoTask(BaseTask):
    """视频生成任务"""
    
    prompt = TextField()
    aspect_ratio = CharField(max_length=10)
    resolution = CharField(max_length=20, null=True)
    reference_images = TextField(null=True)
    duration = IntegerField(default=5)
    provider = CharField(max_length=20)
    output_dir = TextField(null=True)
    
    shot_id = CharField(max_length=36, null=True)
    shot_sequence = IntegerField(null=True)
    processed = IntegerField(default=0)
    
    class Meta:
        table_name = 'video_task'


class ImageTask(BaseTask):
    """图片任务（用于依赖检查）"""
    prompt = TextField()
    aspect_ratio = CharField(max_length=10)
    resolution = CharField(max_length=20, null=True)
    reference_images = TextField(null=True)
    provider = CharField(max_length=20)
    output_dir = TextField(null=True)
    shot_id = CharField(max_length=36, null=True)
    shot_sequence = IntegerField(null=True)
    slot = IntegerField(null=True)
    processed = IntegerField(default=0)
    
    class Meta:
        table_name = 'image_task'


class AudioTask(BaseTask):
    """音频任务（用于依赖检查）"""
    text = TextField()
    voice_ref = TextField(null=True)
    emotion = CharField(max_length=20, null=True)
    emotion_intensity = CharField(max_length=20, null=True)
    speed = IntegerField(default=1)
    provider = CharField(max_length=20)
    output_dir = TextField(null=True)
    result_duration_ms = IntegerField(null=True)
    shot_id = CharField(max_length=36, null=True)
    shot_sequence = IntegerField(null=True)
    dialogue_index = IntegerField(null=True)
    processed = IntegerField(default=0)
    
    class Meta:
        table_name = 'audio_task'


TASK_MODELS = {
    'image': ImageTask,
    'video': VideoTask,
    'audio': AudioTask,
}


# ============================================================
# Grok API 客户端
# ============================================================

class GrokVideoClient:
    """Grok 视频生成客户端"""
    
    BASE_URL = "https://grok.com"
    ASSETS_URL = "https://assets.grok.com"
    
    # 视频时长映射（秒 -> Grok videoLength 参数）
    DURATION_MAP = {
        3: 3,
        5: 5,
        6: 6,
        10: 10,
    }
    
    # Cookie 必需字段
    REQUIRED_COOKIES = ['sso', 'x-userid', 'cf_clearance']
    
    def __init__(self, cookie: str, timeout: int = 300):
        """
        初始化客户端
        
        Args:
            cookie: Grok 网站的 cookie 字符串
                    必须包含: sso, x-userid, cf_clearance
                    可选: sso-rw, _ga 等
            timeout: 请求超时时间（秒）
        """
        self.cookie = cookie
        self.timeout = timeout
        
        # 验证 cookie
        self._validate_cookie()
        
        self.user_id = self._extract_user_id(cookie)
        
        self.headers = {
            'accept': '*/*',
            'accept-language': 'zh-CN,zh;q=0.9',
            'content-type': 'application/json',
            'dnt': '1',
            'origin': self.BASE_URL,
            'priority': 'u=1, i',
            'referer': f'{self.BASE_URL}/imagine',
            'sec-ch-ua': '"Not(A:Brand";v="8", "Chromium";v="134", "Google Chrome";v="134"',
            'sec-ch-ua-mobile': '?0',
            'sec-ch-ua-platform': '"macOS"',
            'sec-fetch-dest': 'empty',
            'sec-fetch-mode': 'cors',
            'sec-fetch-site': 'same-origin',
            'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36',
        }
    
    def _validate_cookie(self):
        """验证 cookie 是否包含必需字段"""
        cookies = self._parse_cookies()
        missing = [key for key in self.REQUIRED_COOKIES if key not in cookies]
        if missing:
            raise ValueError(
                f"Cookie missing required fields: {', '.join(missing)}\n"
                f"Please copy the COMPLETE cookie from browser DevTools.\n"
                f"Required: sso, x-userid, cf_clearance"
            )
    
    def _extract_user_id(self, cookie: str) -> Optional[str]:
        """从 cookie 中提取 user_id"""
        match = re.search(r'x-userid=([a-f0-9-]+)', cookie)
        return match.group(1) if match else None
    
    def _get_request_id(self) -> str:
        """生成请求ID"""
        return str(uuid.uuid4())
    
    def upload_image(self, image_path: str) -> str:
        """
        上传图片到 Grok
        
        Args:
            image_path: 本地图片路径
        
        Returns:
            上传后的文件ID
        """
        path = Path(image_path)
        if not path.exists():
            raise FileNotFoundError(f"Image not found: {image_path}")
        
        # 读取图片并转为 base64
        with open(path, 'rb') as f:
            image_data = f.read()
        
        content_base64 = base64.b64encode(image_data).decode('utf-8')
        
        # 确定 MIME 类型
        suffix = path.suffix.lower()
        mime_types = {
            '.jpg': 'image/jpeg',
            '.jpeg': 'image/jpeg',
            '.png': 'image/png',
            '.gif': 'image/gif',
            '.webp': 'image/webp',
        }
        mime_type = mime_types.get(suffix, 'image/jpeg')
        
        # 构建请求
        payload = {
            "fileName": path.name,
            "fileMimeType": mime_type,
            "content": content_base64
        }
        
        headers = {
            **self.headers,
            'x-xai-request-id': self._get_request_id(),
        }
        
        # 使用原始 cookie 字符串作为 header（保持顺序）
        upload_headers = {
            **headers,
            'cookie': self.cookie,
        }
        
        response = curl_requests.post(
            f"{self.BASE_URL}/rest/app-chat/upload-file",
            headers=upload_headers,
            json=payload,
            impersonate="chrome124",  # 使用具体版本的 Chrome 指纹
            timeout=60
        )
        
        logger.debug(f"Upload response status: {response.status_code}")
        
        if response.status_code == 403:
            logger.error(f"403 Forbidden on upload-file")
            logger.error(f"Response text: {response.text[:1000]}")
            logger.error("Please refresh your cookie from browser")
            response.raise_for_status()
        
        response.raise_for_status()
        data = response.json()
        
        # 从响应中提取文件ID
        file_id = data.get('fileMetadataId') or data.get('id')
        if not file_id:
            # 尝试从其他字段获取
            logger.debug(f"Upload response: {data}")
            raise ValueError(f"Failed to get file ID from upload response: {data}")
        
        logger.info(f"Uploaded image: {path.name} -> {file_id}")
        return file_id
    
    def _parse_cookies(self) -> dict:
        """解析 cookie 字符串为字典"""
        cookies = {}
        for item in self.cookie.split(';'):
            item = item.strip()
            if '=' in item:
                key, value = item.split('=', 1)
                cookies[key.strip()] = value.strip()
        return cookies
    
    def generate_video(
        self,
        prompt: str,
        image_path: str,
        aspect_ratio: str = "16:9",
        duration: int = 5,
        resolution: str = "SD",
        progress_callback: callable = None
    ) -> str:
        """
        生成视频
        
        Args:
            prompt: 视频描述提示词
            image_path: 参考图片路径
            aspect_ratio: 宽高比 (16:9, 9:16, 1:1)
            duration: 视频时长（秒）
            resolution: 分辨率 (SD, HD)
            progress_callback: 进度回调函数 (progress: int) -> None
        
        Returns:
            视频的完整URL
        """
        # 1. 上传图片
        file_id = self.upload_image(image_path)
        
        # 2. 构建图片资源URL
        if self.user_id:
            image_url = f"{self.ASSETS_URL}/users/{self.user_id}/{file_id}/content"
        else:
            image_url = f"{self.ASSETS_URL}/{file_id}/content"
        
        # 3. 映射视频时长
        video_length = self.DURATION_MAP.get(duration, 5)
        
        # 4. 构建消息（包含图片URL和提示词）
        message = f"{image_url}  {prompt} --mode=custom"
        
        # 5. 构建请求体
        payload = {
            "temporary": True,
            "modelName": "grok-3",
            "message": message,
            "fileAttachments": [file_id],
            "toolOverrides": {"videoGen": True},
            "enableSideBySide": True,
            "responseMetadata": {
                "experiments": [],
                "modelConfigOverride": {
                    "modelMap": {
                        "videoGenModelConfig": {
                            "parentPostId": file_id,
                            "aspectRatio": aspect_ratio,
                            "videoLength": video_length,
                            "isVideoEdit": False,
                            "resolutionName": resolution
                        }
                    }
                }
            }
        }
        
        headers = {
            **self.headers,
            'x-xai-request-id': self._get_request_id(),
        }
        
        # 6. 发送请求并处理流式响应
        video_url = None
        
        # 使用原始 cookie 字符串
        gen_headers = {
            **headers,
            'cookie': self.cookie,
        }
        
        response = curl_requests.post(
            f"{self.BASE_URL}/rest/app-chat/conversations/new",
            headers=gen_headers,
            json=payload,
            impersonate="chrome124",
            timeout=self.timeout,
            stream=True
        )
        
        logger.debug(f"Generate response status: {response.status_code}")
        
        if response.status_code == 403:
            logger.error(f"403 Forbidden on conversations/new")
            logger.error(f"Response text: {response.text[:1000]}")
            logger.error("Please refresh your cookie from browser")
        
        response.raise_for_status()
        
        for line in response.iter_lines():
            if not line:
                continue
            
            try:
                # curl_cffi iter_lines returns bytes
                if isinstance(line, bytes):
                    line = line.decode('utf-8')
                
                data = json.loads(line)
                result = data.get('result', {}).get('response', {})
                
                # 检查视频生成进度
                video_resp = result.get('streamingVideoGenerationResponse', {})
                if video_resp:
                    progress = video_resp.get('progress', 0)
                    
                    if progress_callback:
                        progress_callback(progress)
                    else:
                        logger.debug(f"Video generation progress: {progress}%")
                    
                    # 检查是否完成
                    if progress >= 100 and video_resp.get('videoUrl'):
                        relative_url = video_resp['videoUrl']
                        video_url = f"{self.ASSETS_URL}/{relative_url}"
                        logger.info(f"Video generated: {video_url}")
                
                # 检查错误
                if 'error' in data:
                    raise RuntimeError(f"Grok API error: {data['error']}")
                
            except json.JSONDecodeError:
                continue
        
        if not video_url:
            raise RuntimeError("Video generation failed: no video URL returned")
        
        return video_url
    
    def download_video(self, video_url: str, output_path: str) -> str:
        """
        下载视频到本地
        
        Args:
            video_url: 视频URL
            output_path: 本地保存路径
        
        Returns:
            本地文件路径
        """
        output_path = Path(output_path)
        output_path.parent.mkdir(parents=True, exist_ok=True)
        
        response = curl_requests.get(
            video_url,
            impersonate="chrome",
            timeout=120,
            stream=True
        )
        response.raise_for_status()
        
        with open(output_path, 'wb') as f:
            for chunk in response.iter_content(chunk_size=8192):
                if chunk:
                    f.write(chunk)
        
        logger.info(f"Downloaded video to: {output_path}")
        return str(output_path)


# ============================================================
# 执行器基类
# ============================================================

class BaseExecutor(ABC):
    """任务执行器基类"""
    
    task_type: str = None
    
    def __init__(
        self,
        db_path: str,
        worker_id: str = None,
        heartbeat_interval: int = 30,
        lock_timeout: int = 60
    ):
        if self.task_type is None:
            raise ValueError("Subclass must define task_type")
        
        self.db_path = db_path
        self.worker_id = worker_id or self._generate_worker_id()
        self.heartbeat_interval = heartbeat_interval
        self.lock_timeout = lock_timeout
        
        self._running = False
        self._current_task_id: Optional[str] = None
        self._heartbeat_thread: Optional[threading.Thread] = None
        self._heartbeat_stop_event = threading.Event()
        
        logger.info(f"{self.__class__.__name__} initialized, worker_id={self.worker_id}")
    
    def _generate_worker_id(self) -> str:
        hostname = socket.gethostname()[:20]
        pid = os.getpid()
        short_uuid = str(uuid.uuid4())[:8]
        return f"{hostname}-{pid}-{short_uuid}"
    
    @property
    def _model(self):
        return TASK_MODELS[self.task_type]
    
    def claim_task(self, max_retries: int = 3) -> Optional[Any]:
        """原子锁定一个待执行任务"""
        for attempt in range(max_retries):
            try:
                return self._claim_task_once()
            except OperationalError as e:
                if "database is locked" in str(e):
                    wait_time = 0.5 + random.random() * 1.5
                    logger.debug(f"Database locked, retrying in {wait_time:.1f}s")
                    time.sleep(wait_time)
                else:
                    raise
        return None
    
    def _claim_task_once(self) -> Optional[Any]:
        now = datetime.now()
        lock_cutoff = now - timedelta(seconds=self.lock_timeout)
        
        candidates = (
            self._model.select()
            .where(
                (self._model.status == TaskStatus.PENDING.value) &
                (self._model.expire_at > now) &
                (
                    (self._model.locked_by.is_null()) |
                    (self._model.locked_at < lock_cutoff)
                )
            )
            .order_by(self._model.priority, self._model.created_at)
        )
        
        for task in candidates:
            if not self._check_dependency_met(task.depends_on):
                continue
            
            updated = (
                self._model.update(
                    status=TaskStatus.RUNNING.value,
                    locked_by=self.worker_id,
                    locked_at=now,
                    started_at=now,
                    updated_at=now
                )
                .where(
                    (self._model.id == task.id) &
                    (self._model.status == TaskStatus.PENDING.value) &
                    (
                        (self._model.locked_by.is_null()) |
                        (self._model.locked_at < lock_cutoff)
                    )
                )
                .execute()
            )
            
            if updated > 0:
                task = self._model.get_by_id(task.id)
                logger.info(f"Claimed task: {self.task_type}:{task.id}")
                return task
        
        return None
    
    def _check_dependency_met(self, depends_on: str) -> bool:
        if not depends_on:
            return True
        
        for ref in depends_on.split(','):
            ref = ref.strip()
            if not ref or ':' not in ref:
                continue
            
            dep_type, dep_id = ref.split(':', 1)
            if dep_type not in TASK_MODELS:
                logger.warning(f"Unknown dependency type: {dep_type}")
                return False
            
            dep_model = TASK_MODELS[dep_type]
            dep_task = dep_model.get_or_none(dep_model.id == dep_id)
            
            if not dep_task or dep_task.status != TaskStatus.SUCCESS.value:
                return False
        
        return True
    
    def _start_heartbeat(self, task_id: str):
        self._current_task_id = task_id
        self._heartbeat_stop_event.clear()
        self._heartbeat_thread = threading.Thread(
            target=self._heartbeat_loop,
            daemon=True
        )
        self._heartbeat_thread.start()
    
    def _stop_heartbeat(self):
        self._heartbeat_stop_event.set()
        if self._heartbeat_thread:
            self._heartbeat_thread.join(timeout=5)
        self._heartbeat_thread = None
        self._current_task_id = None
    
    def _heartbeat_loop(self):
        while not self._heartbeat_stop_event.wait(self.heartbeat_interval):
            if self._current_task_id:
                self._do_heartbeat(self._current_task_id)
    
    def _do_heartbeat(self, task_id: str):
        try:
            now = datetime.now()
            updated = (
                self._model.update(locked_at=now)
                .where(
                    (self._model.id == task_id) &
                    (self._model.locked_by == self.worker_id)
                )
                .execute()
            )
            if updated:
                logger.debug(f"Heartbeat: {self.task_type}:{task_id}")
        except Exception as e:
            logger.error(f"Heartbeat failed: {e}")
    
    def release_task(
        self,
        task_id: str,
        success: bool,
        result_url: str = None,
        result_local_path: str = None,
        error: str = None,
        **extra_fields
    ):
        now = datetime.now()
        task = self._model.get_or_none(self._model.id == task_id)
        
        if not task:
            logger.warning(f"Task not found: {task_id}")
            return
        
        if success:
            update_data = {
                'status': TaskStatus.SUCCESS.value,
                'result_url': result_url,
                'result_local_path': result_local_path,
                'locked_by': None,
                'locked_at': None,
                'updated_at': now,
                'completed_at': now,
            }
            update_data.update(extra_fields)
            
            self._model.update(**update_data).where(
                self._model.id == task_id
            ).execute()
            
            logger.info(f"Task succeeded: {self.task_type}:{task_id}")
        else:
            new_retry_count = task.retry_count + 1
            
            if new_retry_count < task.max_retries:
                self._model.update(
                    status=TaskStatus.PENDING.value,
                    retry_count=new_retry_count,
                    error=error,
                    locked_by=None,
                    locked_at=None,
                    updated_at=now,
                ).where(self._model.id == task_id).execute()
                
                logger.warning(
                    f"Task failed, will retry ({new_retry_count}/{task.max_retries}): "
                    f"{self.task_type}:{task_id}, error={error}"
                )
            else:
                self._model.update(
                    status=TaskStatus.FAILED.value,
                    retry_count=new_retry_count,
                    error=error,
                    locked_by=None,
                    locked_at=None,
                    updated_at=now,
                    completed_at=now,
                ).where(self._model.id == task_id).execute()
                
                logger.error(
                    f"Task failed permanently: {self.task_type}:{task_id}, error={error}"
                )
    
    @abstractmethod
    def execute(self, task: Any) -> Tuple[Optional[str], Optional[str]]:
        raise NotImplementedError
    
    def run_once(self) -> bool:
        task = self.claim_task()
        if not task:
            return False
        
        try:
            self._start_heartbeat(task.id)
            result_url, result_local_path = self.execute(task)
            extra = self._get_extra_result_fields(task)
            self.release_task(
                task.id,
                success=True,
                result_url=result_url,
                result_local_path=result_local_path,
                **extra
            )
        except Exception as e:
            logger.exception(f"Task execution failed: {self.task_type}:{task.id}")
            self.release_task(task.id, success=False, error=str(e))
        finally:
            self._stop_heartbeat()
        
        return True
    
    def _get_extra_result_fields(self, task: Any) -> dict:
        return {}
    
    def run_loop(self, idle_sleep: float = 1.0):
        self._running = True
        logger.info(f"{self.__class__.__name__} started running")
        
        while self._running:
            try:
                has_task = self.run_once()
                if not has_task:
                    time.sleep(idle_sleep)
            except Exception as e:
                logger.exception(f"Error in run_loop: {e}")
                time.sleep(idle_sleep)
        
        logger.info(f"{self.__class__.__name__} stopped")
    
    def stop(self):
        self._running = False
        logger.info(f"{self.__class__.__name__} stopping...")


# ============================================================
# Grok 视频执行器
# ============================================================

class GrokVideoExecutor(BaseExecutor):
    """Grok 视频生成执行器"""
    
    task_type = 'video'
    
    def __init__(
        self,
        db_path: str,
        cookie: str,
        worker_id: str = None,
        heartbeat_interval: int = 30,
        lock_timeout: int = 300  # Grok 视频生成较慢，设置更长超时
    ):
        super().__init__(db_path, worker_id, heartbeat_interval, lock_timeout)
        self.client = GrokVideoClient(cookie, timeout=lock_timeout)
    
    def execute(self, task: Any) -> Tuple[Optional[str], Optional[str]]:
        """
        执行 Grok 视频生成任务
        
        Args:
            task: VideoTask 对象
        
        Returns:
            (result_url, result_local_path)
        """
        logger.info(f"Executing Grok video task: {task.id}")
        logger.info(f"  - subtype: {task.subtype}")
        logger.info(f"  - prompt: {task.prompt[:100]}...")
        logger.info(f"  - aspect_ratio: {task.aspect_ratio}")
        logger.info(f"  - duration: {task.duration}s")
        
        # 解析参考图（只取第一张）
        image_path = None
        if task.reference_images:
            for img_path in task.reference_images.split(','):
                img_path = img_path.strip()
                if img_path and Path(img_path).exists():
                    image_path = img_path
                    break
        
        if not image_path:
            raise ValueError("No valid reference image found")
        
        logger.info(f"  - reference image: {image_path}")
        
        # 映射分辨率
        resolution = "SD"
        if task.resolution:
            res_lower = task.resolution.lower()
            if "hd" in res_lower or "1080" in res_lower:
                resolution = "HD"
        
        # 进度回调
        def progress_callback(progress: int):
            logger.info(f"[{task.id}] Video generation progress: {progress}%")
        
        # 调用 Grok API 生成视频
        result_url = self.client.generate_video(
            prompt=task.prompt,
            image_path=image_path,
            aspect_ratio=task.aspect_ratio,
            duration=task.duration,
            resolution=resolution,
            progress_callback=progress_callback
        )
        
        result_local_path = None
        
        # 如果指定了输出目录，下载到本地
        if task.output_dir:
            output_dir = Path(task.output_dir)
            output_dir.mkdir(parents=True, exist_ok=True)
            local_path = output_dir / f"{task.id}.mp4"
            result_local_path = self.client.download_video(result_url, str(local_path))
        
        return result_url, result_local_path


# ============================================================
# 命令行入口
# ============================================================

def setup_logging(log_level: str = "INFO"):
    """配置日志"""
    logger.remove()
    logger.add(
        sys.stderr,
        format="<green>{time:YYYY-MM-DD HH:mm:ss}</green> | <level>{level: <8}</level> | <cyan>{name}</cyan>:<cyan>{function}</cyan>:<cyan>{line}</cyan> - <level>{message}</level>",
        level=log_level
    )


def init_database(db_path: str):
    """初始化数据库连接"""
    db = SqliteDatabase(
        db_path,
        pragmas={
            'journal_mode': 'wal',
            'cache_size': -1024 * 64,
            'foreign_keys': 1,
            'ignore_check_constraints': 0,
            'synchronous': 0,
        }
    )
    database_proxy.initialize(db)
    db.connect()
    logger.info(f"Connected to database: {db_path}")


def main():
    parser = argparse.ArgumentParser(
        description='Grok Video Executor - Generate videos using Grok API',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
    # 单个执行器
    python grok_video_executor.py --db /path/to/tasks.db --cookie "sso=xxx; sso-rw=xxx"

    # 多并发执行器
    python grok_video_executor.py --db /path/to/tasks.db --cookie "sso=xxx" --concurrency 3

    # 使用环境变量设置 cookie
    export GROK_COOKIE="sso=xxx; sso-rw=xxx; x-userid=xxx"
    python grok_video_executor.py --db /path/to/tasks.db

    # 从文件读取 cookie
    python grok_video_executor.py --db /path/to/tasks.db --cookie-file cookies.txt
        """
    )
    parser.add_argument('--db', required=True, help='Database file path')
    parser.add_argument('--cookie', help='Grok cookie string (or set GROK_COOKIE env var)')
    parser.add_argument('--cookie-file', help='File containing Grok cookie')
    parser.add_argument('--concurrency', type=int, default=1, help='Number of concurrent executors (default: 1)')
    parser.add_argument('--worker-id', help='Worker ID prefix (auto-generated if not specified)')
    parser.add_argument('--heartbeat', type=int, default=30, help='Heartbeat interval in seconds (default: 30)')
    parser.add_argument('--lock-timeout', type=int, default=300, help='Lock timeout in seconds (default: 300)')
    parser.add_argument('--idle-sleep', type=float, default=2.0, help='Sleep time when idle in seconds (default: 2.0)')
    parser.add_argument('--log-level', default='INFO', choices=['DEBUG', 'INFO', 'WARNING', 'ERROR'], help='Log level')
    
    args = parser.parse_args()
    
    setup_logging(args.log_level)
    
    # 获取 cookie
    cookie = args.cookie
    if not cookie and args.cookie_file:
        with open(args.cookie_file, 'r') as f:
            cookie = f.read().strip()
        # 移除可能的换行符
        cookie = cookie.replace('\n', '').replace('\r', '')
    if not cookie:
        cookie = os.environ.get('GROK_COOKIE')
        if cookie:
            cookie = cookie.replace('\n', '').replace('\r', '')
    
    if not cookie:
        logger.error("Cookie is required. Use --cookie, --cookie-file, or set GROK_COOKIE env var")
        sys.exit(1)
    
    # 检查数据库文件
    db_path = Path(args.db)
    if not db_path.exists():
        logger.error(f"Database file not found: {db_path}")
        sys.exit(1)
    
    # 初始化数据库
    init_database(str(db_path))
    
    # 创建执行器
    executors = []
    for i in range(args.concurrency):
        worker_id = f"{args.worker_id}-{i}" if args.worker_id else None
        executor = GrokVideoExecutor(
            db_path=str(db_path),
            cookie=cookie,
            worker_id=worker_id,
            heartbeat_interval=args.heartbeat,
            lock_timeout=args.lock_timeout
        )
        executors.append(executor)
    
    # 设置信号处理
    def signal_handler(signum, frame):
        logger.info("Received shutdown signal, stopping executors...")
        for executor in executors:
            executor.stop()
    
    signal.signal(signal.SIGINT, signal_handler)
    signal.signal(signal.SIGTERM, signal_handler)
    
    # 运行执行器
    if len(executors) == 1:
        logger.info("Starting single Grok video executor...")
        executors[0].run_loop(idle_sleep=args.idle_sleep)
    else:
        logger.info(f"Starting {len(executors)} Grok video executors...")
        threads = []
        
        for executor in executors:
            thread = threading.Thread(
                target=executor.run_loop,
                kwargs={'idle_sleep': args.idle_sleep},
                daemon=True
            )
            thread.start()
            threads.append(thread)
            logger.info(f"Started executor: {executor.worker_id}")
        
        try:
            for thread in threads:
                thread.join()
        except KeyboardInterrupt:
            logger.info("Interrupted, shutting down...")
            for executor in executors:
                executor.stop()


if __name__ == '__main__':
    main()
