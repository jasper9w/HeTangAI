#!/usr/bin/env python3
"""
外部视频生成执行器模板

这是一个独立的脚本，可以在项目外部运行，连接同一数据库实现分布式任务处理。
你可以复制此文件到任意位置运行，只需确保能访问数据库文件。

使用方法:
    uv run python external_video_executor.py --db /path/to/tasks.db --worker-id "gpu-server-1"

依赖:
    pip install peewee loguru

自定义:
    修改 VideoExecutor.execute() 方法实现你的视频生成逻辑
"""

import argparse
import os
import random
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
# 数据模型定义（与 HeTangAI/tasks/models.py 保持一致）
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
    """视频生成任务
    
    subtype:
    - text2video: 文生视频
    - frames2video: 首尾帧生视频（reference_images: 第1张=首帧，第2张=尾帧）
    - reference2video: 多参考图生视频
    """
    
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


# 如果需要检查依赖任务，还需要定义其他任务模型
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
        """
        初始化执行器
        
        Args:
            db_path: 数据库路径
            worker_id: 执行器ID，为 None 则自动生成
            heartbeat_interval: 心跳间隔（秒）
            lock_timeout: 锁超时时间（秒）
        """
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
        """生成执行器ID"""
        hostname = socket.gethostname()[:20]
        pid = os.getpid()
        short_uuid = str(uuid.uuid4())[:8]
        return f"{hostname}-{pid}-{short_uuid}"
    
    @property
    def _model(self):
        """获取任务模型类"""
        return TASK_MODELS[self.task_type]
    
    # ========== 任务锁定 ==========
    
    def claim_task(self, max_retries: int = 3) -> Optional[Any]:
        """
        原子锁定一个待执行任务
        
        条件：
        1. status = 'pending'
        2. priority 最小（优先级最高）
        3. 依赖任务已完成（或无依赖）
        4. 未过期
        5. 未被锁定 或 锁已超时
        """
        for attempt in range(max_retries):
            try:
                return self._claim_task_once()
            except OperationalError as e:
                if "database is locked" in str(e):
                    wait_time = 0.5 + random.random() * 1.5
                    logger.debug(f"Database locked, retrying in {wait_time:.1f}s (attempt {attempt + 1}/{max_retries})")
                    time.sleep(wait_time)
                else:
                    raise
        return None
    
    def _claim_task_once(self) -> Optional[Any]:
        """尝试锁定一个任务"""
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
        """检查依赖任务是否已完成"""
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
    
    # ========== 心跳 ==========
    
    def _start_heartbeat(self, task_id: str):
        """启动心跳线程"""
        self._current_task_id = task_id
        self._heartbeat_stop_event.clear()
        self._heartbeat_thread = threading.Thread(
            target=self._heartbeat_loop,
            daemon=True
        )
        self._heartbeat_thread.start()
    
    def _stop_heartbeat(self):
        """停止心跳线程"""
        self._heartbeat_stop_event.set()
        if self._heartbeat_thread:
            self._heartbeat_thread.join(timeout=5)
        self._heartbeat_thread = None
        self._current_task_id = None
    
    def _heartbeat_loop(self):
        """心跳循环"""
        while not self._heartbeat_stop_event.wait(self.heartbeat_interval):
            if self._current_task_id:
                self._do_heartbeat(self._current_task_id)
    
    def _do_heartbeat(self, task_id: str):
        """执行一次心跳"""
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
    
    # ========== 任务释放 ==========
    
    def release_task(
        self,
        task_id: str,
        success: bool,
        result_url: str = None,
        result_local_path: str = None,
        error: str = None,
        **extra_fields
    ):
        """释放任务并更新结果"""
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
    
    # ========== 执行逻辑 ==========
    
    @abstractmethod
    def execute(self, task: Any) -> Tuple[Optional[str], Optional[str]]:
        """
        执行任务（子类实现）
        
        Args:
            task: 任务对象，包含以下属性：
                - id: 任务ID
                - subtype: 子类型 (text2video/frames2video/reference2video)
                - prompt: 生成提示词
                - aspect_ratio: 宽高比
                - resolution: 分辨率
                - reference_images: 参考图路径（逗号分隔）
                - duration: 视频时长（秒）
                - output_dir: 输出目录
        
        Returns:
            (result_url, result_local_path) 元组
            - result_url: 生成结果的URL（如果有）
            - result_local_path: 本地文件路径（如果已下载）
        
        Raises:
            Exception: 执行失败时抛出异常
        """
        raise NotImplementedError
    
    def run_once(self) -> bool:
        """执行一次：领取 -> 执行 -> 释放"""
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
        """获取额外的结果字段（子类可覆盖）"""
        return {}
    
    def run_loop(self, idle_sleep: float = 1.0):
        """持续运行循环"""
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
        """停止执行器"""
        self._running = False
        logger.info(f"{self.__class__.__name__} stopping...")


# ============================================================
# 视频执行器实现
# ============================================================

class VideoExecutor(BaseExecutor):
    """视频生成执行器
    
    继承此类并重写 execute() 方法来实现自定义的视频生成逻辑
    """
    
    task_type = 'video'
    
    def __init__(
        self,
        db_path: str,
        worker_id: str = None,
        heartbeat_interval: int = 30,
        lock_timeout: int = 120  # 视频生成通常更慢，设置更长的超时
    ):
        super().__init__(db_path, worker_id, heartbeat_interval, lock_timeout)
    
    def execute(self, task: Any) -> Tuple[Optional[str], Optional[str]]:
        """
        执行视频生成任务
        
        TODO: 在这里实现你的视频生成逻辑
        
        Args:
            task: VideoTask 对象
        
        Returns:
            (result_url, result_local_path)
        """
        logger.info(f"Executing video task: {task.id}")
        logger.info(f"  - subtype: {task.subtype}")
        logger.info(f"  - prompt: {task.prompt[:100]}...")
        logger.info(f"  - aspect_ratio: {task.aspect_ratio}")
        logger.info(f"  - duration: {task.duration}s")
        
        # 解析参考图
        image_paths = []
        if task.reference_images:
            for img_path in task.reference_images.split(','):
                img_path = img_path.strip()
                if img_path and Path(img_path).exists():
                    image_paths.append(img_path)
                    logger.info(f"  - reference image: {img_path}")
        
        # 根据 subtype 验证参数
        if task.subtype == 'frames2video':
            if len(image_paths) < 1:
                raise ValueError("frames2video requires at least 1 frame image")
        elif task.subtype == 'reference2video':
            if not image_paths:
                raise ValueError("reference2video requires reference images")
        
        # ========================================
        # TODO: 在这里调用你的视频生成 API
        # ========================================
        #
        # 示例：
        # result_url = your_video_api.generate(
        #     prompt=task.prompt,
        #     images=image_paths,
        #     duration=task.duration,
        #     aspect_ratio=task.aspect_ratio
        # )
        #
        # 如果 API 返回 URL，可以下载到本地：
        # if task.output_dir:
        #     local_path = download_video(result_url, task.output_dir, task.id)
        #     return result_url, local_path
        #
        # return result_url, None
        # ========================================
        
        # 示例实现：模拟生成过程
        logger.info("Simulating video generation (replace with your API call)...")
        time.sleep(2)  # 模拟耗时操作
        
        # 返回示例结果
        result_url = f"https://example.com/videos/{task.id}.mp4"
        result_local_path = None
        
        # 如果指定了输出目录，可以下载到本地
        if task.output_dir:
            output_dir = Path(task.output_dir)
            output_dir.mkdir(parents=True, exist_ok=True)
            result_local_path = str(output_dir / f"{task.id}.mp4")
            logger.info(f"Would download to: {result_local_path}")
            # TODO: 实际下载逻辑
            # download_file(result_url, result_local_path)
        
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
        description='External Video Executor',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
    # 运行执行器
    python external_video_executor.py --db /path/to/tasks.db

    # 指定 worker ID
    python external_video_executor.py --db /path/to/tasks.db --worker-id "gpu-server-1"

    # 调整心跳和超时参数
    python external_video_executor.py --db /path/to/tasks.db --heartbeat 60 --lock-timeout 300
        """
    )
    default_db = str(Path.home() / ".hetangai" / "tasks.db")
    parser.add_argument('--db', default=default_db, help=f'Database file path (default: {default_db})')
    parser.add_argument('--worker-id', help='Worker ID (auto-generated if not specified)')
    parser.add_argument('--heartbeat', type=int, default=30, help='Heartbeat interval in seconds (default: 30)')
    parser.add_argument('--lock-timeout', type=int, default=120, help='Lock timeout in seconds (default: 120)')
    parser.add_argument('--idle-sleep', type=float, default=1.0, help='Sleep time when idle in seconds (default: 1.0)')
    parser.add_argument('--log-level', default='INFO', choices=['DEBUG', 'INFO', 'WARNING', 'ERROR'], help='Log level')
    
    args = parser.parse_args()
    
    setup_logging(args.log_level)
    
    # 检查数据库文件
    db_path = Path(args.db)
    if not db_path.exists():
        logger.error(f"Database file not found: {db_path}")
        sys.exit(1)
    
    # 初始化数据库
    init_database(str(db_path))
    
    # 创建执行器
    executor = VideoExecutor(
        db_path=str(db_path),
        worker_id=args.worker_id,
        heartbeat_interval=args.heartbeat,
        lock_timeout=args.lock_timeout
    )
    
    # 设置信号处理
    def signal_handler(signum, frame):
        logger.info("Received shutdown signal, stopping executor...")
        executor.stop()
    
    signal.signal(signal.SIGINT, signal_handler)
    signal.signal(signal.SIGTERM, signal_handler)
    
    # 运行执行器
    logger.info("Starting video executor...")
    executor.run_loop(idle_sleep=args.idle_sleep)


if __name__ == '__main__':
    main()
