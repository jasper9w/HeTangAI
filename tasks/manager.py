"""
任务管理器

提供任务的创建、查询、操作等核心功能
"""

import uuid
from datetime import datetime, timedelta
from typing import Optional, List, Dict, Any
from pathlib import Path

from peewee import SqliteDatabase
from loguru import logger

from .models import (
    database_proxy, ImageTask, VideoTask, AudioTask,
    TaskStatus, TASK_MODELS, get_task_model
)


class TaskManager:
    """任务管理器"""
    
    def __init__(self, db_path: str):
        """
        初始化任务管理器
        
        Args:
            db_path: 数据库文件路径
        """
        self.db_path = db_path
        self._db: Optional[SqliteDatabase] = None
        self._init_database()
    
    def _init_database(self):
        """初始化数据库"""
        # 确保目录存在
        Path(self.db_path).parent.mkdir(parents=True, exist_ok=True)
        
        # 创建数据库连接
        self._db = SqliteDatabase(
            self.db_path,
            pragmas={
                'journal_mode': 'wal',
                'cache_size': -1024 * 64,
                'foreign_keys': 1,
                'ignore_check_constraints': 0,
                'synchronous': 1,
                'busy_timeout': 30000,  # 30秒等待锁
            }
        )
        
        # 绑定到代理
        database_proxy.initialize(self._db)
        
        # 创建表
        self._db.create_tables([ImageTask, VideoTask, AudioTask], safe=True)
        
        # 恢复僵死的任务
        self._recover_stale_tasks()
        
        logger.info(f"TaskManager initialized with database: {self.db_path}")
    
    def _recover_stale_tasks(self, stale_timeout: int = 120):
        """
        恢复僵死的 running 任务（程序异常退出时遗留的）
        
        Args:
            stale_timeout: 判定为僵死的超时时间（秒），默认2分钟
        """
        now = datetime.now()
        cutoff = now - timedelta(seconds=stale_timeout)
        
        for task_type, model in TASK_MODELS.items():
            # 找到所有 running 状态但锁已超时的任务
            stale_tasks = (
                model.select()
                .where(
                    (model.status == TaskStatus.RUNNING.value) &
                    (model.locked_at < cutoff)
                )
            )
            
            for task in stale_tasks:
                if task.retry_count < task.max_retries:
                    # 还有重试次数，重置为 pending
                    model.update(
                        status=TaskStatus.PENDING.value,
                        locked_by=None,
                        locked_at=None,
                        retry_count=model.retry_count + 1,
                        updated_at=now,
                        error=f"Task recovered after stale (was running by {task.locked_by})"
                    ).where(model.id == task.id).execute()
                    logger.warning(f"Recovered stale task: {task_type}:{task.id} -> pending (retry {task.retry_count + 1}/{task.max_retries})")
                else:
                    # 没有重试次数了，标记为失败
                    model.update(
                        status=TaskStatus.FAILED.value,
                        locked_by=None,
                        locked_at=None,
                        updated_at=now,
                        completed_at=now,
                        error=f"Task failed after max retries (was running by {task.locked_by})"
                    ).where(model.id == task.id).execute()
                    logger.warning(f"Failed stale task: {task_type}:{task.id} -> failed (max retries reached)")
    
    def close(self):
        """关闭数据库连接"""
        if self._db:
            self._db.close()
            self._db = None
            logger.info("TaskManager closed")
    
    # ========== 创建任务 ==========
    
    def create_image_task(
        self,
        subtype: str,
        prompt: str,
        aspect_ratio: str,
        provider: str,
        resolution: str = None,
        reference_images: str = None,
        output_dir: str = None,
        priority: int = 100,
        max_retries: int = 3,
        timeout: int = 300,
        ttl: int = 3600,
        depends_on: str = None,
        shot_id: str = None,
        shot_sequence: int = None,
        slot: int = None
    ) -> str:
        """
        创建图片生成任务
        
        Args:
            subtype: 任务子类型 (text2image / image2image)
            prompt: 生成提示词
            aspect_ratio: 宽高比 ('16:9', '1:1', '9:16')
            provider: 服务提供商
            resolution: 分辨率 (可选)
            reference_images: 参考图路径，逗号分隔 (可选)
            output_dir: 输出目录 (可选)
            priority: 优先级，数字越小越优先
            max_retries: 最大重试次数
            timeout: 超时时间（秒）
            ttl: 任务有效期（秒）
            depends_on: 依赖任务，格式: 'image:xxx,video:yyy'
            shot_id: 关联的镜头ID (可选，用于回写)
            shot_sequence: 镜头序号 (可选，用于显示)
            slot: 图片槽位 1-4 (可选，用于回写)
        
        Returns:
            任务ID
        """
        task_id = str(uuid.uuid4())
        expire_at = datetime.now() + timedelta(seconds=ttl)
        
        ImageTask.create(
            id=task_id,
            subtype=subtype,
            prompt=prompt,
            aspect_ratio=aspect_ratio,
            resolution=resolution,
            reference_images=reference_images,
            provider=provider,
            output_dir=output_dir,
            priority=priority,
            max_retries=max_retries,
            timeout_seconds=timeout,
            expire_at=expire_at,
            depends_on=depends_on,
            shot_id=shot_id,
            shot_sequence=shot_sequence,
            slot=slot,
        )
        
        logger.debug(f"Created image task: {task_id}, subtype={subtype}, shot_id={shot_id}")
        return task_id
    
    def create_video_task(
        self,
        subtype: str,
        prompt: str,
        aspect_ratio: str,
        provider: str,
        resolution: str = None,
        reference_images: str = None,
        duration: int = 5,
        output_dir: str = None,
        priority: int = 100,
        max_retries: int = 3,
        timeout: int = 600,
        ttl: int = 7200,
        depends_on: str = None,
        shot_id: str = None,
        shot_sequence: int = None
    ) -> str:
        """
        创建视频生成任务
        
        Args:
            subtype: 任务子类型 (text2video / frames2video / reference2video)
            prompt: 生成提示词
            aspect_ratio: 宽高比
            provider: 服务提供商
            resolution: 分辨率 (可选)
            reference_images: 参考图路径 (可选)
            duration: 视频时长（秒）
            output_dir: 输出目录 (可选)
            priority: 优先级
            max_retries: 最大重试次数
            timeout: 超时时间（秒）
            ttl: 任务有效期（秒）
            depends_on: 依赖任务
            shot_id: 关联的镜头ID (可选，用于回写)
            shot_sequence: 镜头序号 (可选，用于显示)
        
        Returns:
            任务ID
        """
        task_id = str(uuid.uuid4())
        expire_at = datetime.now() + timedelta(seconds=ttl)
        
        VideoTask.create(
            id=task_id,
            subtype=subtype,
            prompt=prompt,
            aspect_ratio=aspect_ratio,
            resolution=resolution,
            reference_images=reference_images,
            duration=duration,
            provider=provider,
            output_dir=output_dir,
            priority=priority,
            max_retries=max_retries,
            timeout_seconds=timeout,
            expire_at=expire_at,
            depends_on=depends_on,
            shot_id=shot_id,
            shot_sequence=shot_sequence,
        )
        
        logger.debug(f"Created video task: {task_id}, subtype={subtype}, shot_id={shot_id}")
        return task_id
    
    def create_audio_task(
        self,
        text: str,
        provider: str,
        voice_ref: str = None,
        emotion: str = None,
        emotion_intensity: str = None,
        speed: float = 1.0,
        output_dir: str = None,
        priority: int = 100,
        max_retries: int = 3,
        timeout: int = 120,
        ttl: int = 3600,
        depends_on: str = None,
        shot_id: str = None,
        shot_sequence: int = None,
        dialogue_index: int = None
    ) -> str:
        """
        创建音频生成任务
        
        Args:
            text: 要合成的文本
            provider: 服务提供商
            voice_ref: 参考音频路径 (可选)
            emotion: 情感类型 (可选)
            emotion_intensity: 情感强度 (可选)
            speed: 语速
            output_dir: 输出目录 (可选)
            priority: 优先级
            max_retries: 最大重试次数
            timeout: 超时时间（秒）
            ttl: 任务有效期（秒）
            depends_on: 依赖任务
            shot_id: 关联的镜头ID (可选，用于回写)
            shot_sequence: 镜头序号 (可选，用于显示)
            dialogue_index: 对话索引 (可选，用于多段对话回写)
        
        Returns:
            任务ID
        """
        task_id = str(uuid.uuid4())
        expire_at = datetime.now() + timedelta(seconds=ttl)
        
        AudioTask.create(
            id=task_id,
            subtype='text2speech',
            text=text,
            voice_ref=voice_ref,
            emotion=emotion,
            emotion_intensity=emotion_intensity,
            speed=speed,
            provider=provider,
            output_dir=output_dir,
            priority=priority,
            max_retries=max_retries,
            timeout_seconds=timeout,
            expire_at=expire_at,
            depends_on=depends_on,
            shot_id=shot_id,
            shot_sequence=shot_sequence,
            dialogue_index=dialogue_index,
        )
        
        logger.debug(f"Created audio task: {task_id}, shot_id={shot_id}, dialogue_index={dialogue_index}")
        return task_id
    
    # ========== 查询 ==========
    
    def get_task(self, task_type: str, task_id: str) -> Optional[Dict[str, Any]]:
        """
        获取单个任务
        
        Args:
            task_type: 任务类型 (image / video / audio)
            task_id: 任务ID
        
        Returns:
            任务信息字典，不存在则返回 None
        """
        model = get_task_model(task_type)
        task = model.get_or_none(model.id == task_id)
        return task.to_dict() if task else None
    
    def poll_tasks(self, task_refs: List[str]) -> Dict[str, Dict[str, Any]]:
        """
        批量查询任务状态
        
        Args:
            task_refs: 任务引用列表，格式: ['image:xxx', 'video:yyy']
        
        Returns:
            {task_id: task_info} 字典
        """
        results = {}
        
        # 按类型分组
        grouped: Dict[str, List[str]] = {}
        for ref in task_refs:
            if ':' not in ref:
                continue
            task_type, task_id = ref.split(':', 1)
            if task_type not in grouped:
                grouped[task_type] = []
            grouped[task_type].append(task_id)
        
        # 批量查询每种类型
        for task_type, task_ids in grouped.items():
            if task_type not in TASK_MODELS:
                continue
            model = TASK_MODELS[task_type]
            tasks = model.select().where(model.id.in_(task_ids))
            for task in tasks:
                results[task.id] = task.to_dict()
        
        return results
    
    def get_summary(self) -> Dict[str, Dict[str, int]]:
        """
        获取任务摘要（各类型各状态的任务计数）
        
        Returns:
            {
                "image": {"pending": 10, "paused": 2, "running": 3, ...},
                "video": {...},
                "audio": {...},
                "total": {"pending": 30, "running": 5, ...}
            }
        """
        summary = {
            'image': {},
            'video': {},
            'audio': {},
            'total': {}
        }
        
        for task_type, model in TASK_MODELS.items():
            for status in TaskStatus:
                count = model.select().where(model.status == status.value).count()
                summary[task_type][status.value] = count
                summary['total'][status.value] = summary['total'].get(status.value, 0) + count
        
        return summary
    
    def list_tasks(
        self,
        task_type: str = None,
        status: str = None,
        offset: int = 0,
        limit: int = 100
    ) -> List[Dict[str, Any]]:
        """
        分页查询任务列表
        
        Args:
            task_type: 任务类型，为 None 则查询所有类型
            status: 状态筛选
            offset: 偏移量
            limit: 数量限制
        
        Returns:
            任务列表
        """
        results = []
        
        types_to_query = [task_type] if task_type else list(TASK_MODELS.keys())
        
        for t in types_to_query:
            if t not in TASK_MODELS:
                continue
            model = TASK_MODELS[t]
            query = model.select()
            
            if status:
                query = query.where(model.status == status)
            
            # 按创建时间倒序排列（最新的在前）
            query = query.order_by(model.created_at.desc())
            
            if task_type:
                # 单类型查询，直接应用分页
                query = query.offset(offset).limit(limit)
            else:
                # 多类型查询时，每个表取 limit 条，合并后再排序截取
                query = query.limit(limit)
            
            for task in query:
                results.append(task.to_dict())
        
        # 多类型查询时，在内存中排序和分页
        if not task_type:
            results.sort(key=lambda x: x['created_at'], reverse=True)
            results = results[offset:offset + limit]
        
        return results
    
    # ========== 操作 ==========
    
    def cancel_task(self, task_type: str, task_id: str) -> bool:
        """
        取消任务（仅 pending/paused 状态可取消）
        
        Returns:
            是否成功
        """
        model = get_task_model(task_type)
        updated = (
            model.update(
                status=TaskStatus.CANCELLED.value,
                updated_at=datetime.now()
            )
            .where(
                (model.id == task_id) &
                (model.status.in_([TaskStatus.PENDING.value, TaskStatus.PAUSED.value]))
            )
            .execute()
        )
        if updated:
            logger.debug(f"Cancelled task: {task_type}:{task_id}")
        return updated > 0
    
    def pause_task(self, task_type: str, task_id: str) -> bool:
        """
        暂停任务（pending -> paused）
        
        Returns:
            是否成功
        """
        model = get_task_model(task_type)
        updated = (
            model.update(
                status=TaskStatus.PAUSED.value,
                updated_at=datetime.now()
            )
            .where(
                (model.id == task_id) &
                (model.status == TaskStatus.PENDING.value)
            )
            .execute()
        )
        if updated:
            logger.debug(f"Paused task: {task_type}:{task_id}")
        return updated > 0
    
    def resume_task(self, task_type: str, task_id: str) -> bool:
        """
        恢复任务（paused -> pending）
        
        Returns:
            是否成功
        """
        model = get_task_model(task_type)
        updated = (
            model.update(
                status=TaskStatus.PENDING.value,
                updated_at=datetime.now()
            )
            .where(
                (model.id == task_id) &
                (model.status == TaskStatus.PAUSED.value)
            )
            .execute()
        )
        if updated:
            logger.debug(f"Resumed task: {task_type}:{task_id}")
        return updated > 0
    
    def retry_task(self, task_type: str, task_id: str) -> bool:
        """
        重试任务（failed/cancelled -> pending，重置 retry_count）
        
        Returns:
            是否成功
        """
        model = get_task_model(task_type)
        updated = (
            model.update(
                status=TaskStatus.PENDING.value,
                retry_count=0,
                error=None,
                locked_by=None,  # 清除锁定信息，让执行器能认领
                locked_at=None,
                started_at=None,
                updated_at=datetime.now()
            )
            .where(
                (model.id == task_id) &
                (model.status.in_([TaskStatus.FAILED.value, TaskStatus.CANCELLED.value]))
            )
            .execute()
        )
        if updated:
            logger.debug(f"Retried task: {task_type}:{task_id}")
        return updated > 0
    
    # ========== 批量操作 ==========
    
    def pause_all(self, task_type: str = None) -> int:
        """
        暂停所有 pending 任务
        
        Args:
            task_type: 指定类型，为 None 则暂停所有类型
        
        Returns:
            暂停的任务数量
        """
        total = 0
        types_to_pause = [task_type] if task_type else list(TASK_MODELS.keys())
        
        for t in types_to_pause:
            if t not in TASK_MODELS:
                continue
            model = TASK_MODELS[t]
            updated = (
                model.update(
                    status=TaskStatus.PAUSED.value,
                    updated_at=datetime.now()
                )
                .where(model.status == TaskStatus.PENDING.value)
                .execute()
            )
            total += updated
        
        if total:
            logger.info(f"Paused {total} tasks")
        return total
    
    def resume_all(self, task_type: str = None) -> int:
        """
        恢复所有 paused 任务
        
        Args:
            task_type: 指定类型，为 None 则恢复所有类型
        
        Returns:
            恢复的任务数量
        """
        total = 0
        types_to_resume = [task_type] if task_type else list(TASK_MODELS.keys())
        
        for t in types_to_resume:
            if t not in TASK_MODELS:
                continue
            model = TASK_MODELS[t]
            updated = (
                model.update(
                    status=TaskStatus.PENDING.value,
                    updated_at=datetime.now()
                )
                .where(model.status == TaskStatus.PAUSED.value)
                .execute()
            )
            total += updated
        
        if total:
            logger.info(f"Resumed {total} tasks")
        return total
    
    def cancel_all_pending(self, task_type: str = None) -> int:
        """
        取消所有 pending/paused 任务
        
        Args:
            task_type: 指定类型，为 None 则取消所有类型
        
        Returns:
            取消的任务数量
        """
        total = 0
        types_to_cancel = [task_type] if task_type else list(TASK_MODELS.keys())
        
        for t in types_to_cancel:
            if t not in TASK_MODELS:
                continue
            model = TASK_MODELS[t]
            updated = (
                model.update(
                    status=TaskStatus.CANCELLED.value,
                    updated_at=datetime.now()
                )
                .where(model.status.in_([TaskStatus.PENDING.value, TaskStatus.PAUSED.value]))
                .execute()
            )
            total += updated
        
        if total:
            logger.info(f"Cancelled {total} pending tasks")
        return total
    
    # ========== 获取待回写任务 ==========
    
    def get_unprocessed_completed_tasks(self, task_type: str = None, limit: int = 50) -> List[Dict[str, Any]]:
        """
        获取未处理的已完成任务（用于回写业务数据）
        
        Args:
            task_type: 任务类型，为 None 则查询所有类型
            limit: 每轮最多处理数量
        
        Returns:
            未处理的已完成任务列表
        """
        results = []
        types_to_query = [task_type] if task_type else list(TASK_MODELS.keys())
        
        for t in types_to_query:
            if t not in TASK_MODELS:
                continue
            model = TASK_MODELS[t]
            # 查询所有成功且未处理的任务（包括没有shot_id的）
            tasks = (
                model.select()
                .where(
                    (model.status == TaskStatus.SUCCESS.value) &
                    (model.processed == 0)
                )
                .order_by(model.completed_at)
                .limit(limit)
            )
            for task in tasks:
                results.append(task.to_dict())
        
        return results
    
    def get_unprocessed_failed_tasks(self, task_type: str = None, limit: int = 50) -> List[Dict[str, Any]]:
        """
        获取未处理的失败任务（用于更新镜头状态）
        
        Args:
            task_type: 任务类型，为 None 则查询所有类型
            limit: 每轮最多处理数量
        
        Returns:
            未处理的失败任务列表
        """
        results = []
        types_to_query = [task_type] if task_type else list(TASK_MODELS.keys())
        
        for t in types_to_query:
            if t not in TASK_MODELS:
                continue
            model = TASK_MODELS[t]
            # 查询所有失败且未处理的任务（包括没有shot_id的）
            tasks = (
                model.select()
                .where(
                    (model.status == TaskStatus.FAILED.value) &
                    (model.processed == 0)
                )
                .order_by(model.completed_at)
                .limit(limit)
            )
            for task in tasks:
                results.append(task.to_dict())
        
        return results
    
    def mark_task_processed(self, task_type: str, task_id: str) -> bool:
        """
        标记任务为已处理
        
        Args:
            task_type: 任务类型
            task_id: 任务ID
        
        Returns:
            是否成功
        """
        model = get_task_model(task_type)
        updated = (
            model.update(processed=1, updated_at=datetime.now())
            .where(model.id == task_id)
            .execute()
        )
        if updated:
            logger.debug(f"Marked task as processed: {task_type}:{task_id}")
        return updated > 0
    
    # ========== 清理 ==========
    
    def cleanup_expired(self) -> int:
        """
        清理过期的 pending 任务（标记为 cancelled）
        
        Returns:
            清理的任务数量
        """
        total = 0
        now = datetime.now()
        
        for model in TASK_MODELS.values():
            updated = (
                model.update(
                    status=TaskStatus.CANCELLED.value,
                    error='Task expired',
                    updated_at=now
                )
                .where(
                    (model.status == TaskStatus.PENDING.value) &
                    (model.expire_at < now)
                )
                .execute()
            )
            total += updated
        
        if total:
            logger.info(f"Cleaned up {total} expired tasks")
        return total
    
    def cleanup_completed(self, before_days: int = 7) -> int:
        """
        清理已完成的任务（删除记录）
        
        Args:
            before_days: 清理多少天前完成的任务
        
        Returns:
            删除的任务数量
        """
        total = 0
        cutoff = datetime.now() - timedelta(days=before_days)
        
        for model in TASK_MODELS.values():
            deleted = (
                model.delete()
                .where(
                    (model.status.in_([TaskStatus.SUCCESS.value, TaskStatus.CANCELLED.value])) &
                    (model.completed_at < cutoff)
                )
                .execute()
            )
            total += deleted
        
        if total:
            logger.info(f"Cleaned up {total} completed tasks older than {before_days} days")
        return total
