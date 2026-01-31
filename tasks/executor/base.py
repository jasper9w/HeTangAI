"""
任务执行器基类

提供任务锁定、心跳、执行循环等基础功能
"""

import os
import socket
import threading
import time
import uuid
from abc import ABC, abstractmethod
from datetime import datetime, timedelta
from typing import Optional, Tuple, Any, Callable

from loguru import logger

from ..models import (
    database_proxy, TaskStatus, TASK_MODELS, get_task_model
)


class BaseExecutor(ABC):
    """任务执行器基类"""
    
    # 子类必须定义任务类型
    task_type: str = None
    
    def __init__(
        self,
        db_path: str,
        worker_id: str = None,
        heartbeat_interval: int = 30,
        lock_timeout: int = 60,
        current_project_id_getter: Callable[[], str] = None
    ):
        """
        初始化执行器
        
        Args:
            db_path: 数据库路径（用于依赖检查时的跨表查询）
            worker_id: 执行器ID，为 None 则自动生成
            heartbeat_interval: 心跳间隔（秒）
            lock_timeout: 锁超时时间（秒）
            current_project_id_getter: 获取当前项目ID的回调函数（用于优先执行当前项目任务）
        """
        if self.task_type is None:
            raise ValueError("Subclass must define task_type")
        
        self.db_path = db_path
        self.worker_id = worker_id or self._generate_worker_id()
        self.heartbeat_interval = heartbeat_interval
        self.lock_timeout = lock_timeout
        self._current_project_id_getter = current_project_id_getter
        
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
        return get_task_model(self.task_type)
    
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
        
        Args:
            max_retries: 遇到数据库锁时的最大重试次数
        
        Returns:
            锁定的任务对象，无可用任务则返回 None
        """
        import random
        from peewee import OperationalError
        
        for attempt in range(max_retries):
            try:
                return self._claim_task_once()
            except OperationalError as e:
                if "database is locked" in str(e):
                    # 随机等待后重试，避免多个执行器同时重试
                    wait_time = 0.5 + random.random() * 1.5  # 0.5-2秒
                    logger.debug(f"Database locked, retrying in {wait_time:.1f}s (attempt {attempt + 1}/{max_retries})")
                    time.sleep(wait_time)
                else:
                    raise
        
        return None
    
    def _claim_task_once(self) -> Optional[Any]:
        """尝试锁定一个任务（单次尝试）"""
        now = datetime.now()
        lock_cutoff = now - timedelta(seconds=self.lock_timeout)
        
        # 获取当前项目 ID（如果有回调函数）
        current_project_id = None
        if self._current_project_id_getter:
            current_project_id = self._current_project_id_getter()
        
        # 基础查询条件
        base_conditions = (
            (self._model.status == TaskStatus.PENDING.value) &
            (self._model.expire_at > now) &
            (
                (self._model.locked_by.is_null()) |
                (self._model.locked_at < lock_cutoff)
            )
        )
        
        # 如果有当前项目，先查当前项目的任务
        if current_project_id:
            task = self._try_claim_with_conditions(
                base_conditions & (self._model.project_id == current_project_id),
                now, lock_cutoff
            )
            if task:
                return task
        
        # 查询所有其他项目的任务
        if current_project_id:
            # 排除当前项目（已经查过了）
            task = self._try_claim_with_conditions(
                base_conditions & (self._model.project_id != current_project_id),
                now, lock_cutoff
            )
        else:
            # 没有当前项目，查所有任务
            task = self._try_claim_with_conditions(base_conditions, now, lock_cutoff)
        
        return task
    
    def _try_claim_with_conditions(self, conditions, now, lock_cutoff) -> Optional[Any]:
        """尝试在给定条件下锁定任务"""
        candidates = (
            self._model.select()
            .where(conditions)
            .order_by(self._model.priority, self._model.created_at)
        )
        
        for task in candidates:
            # 检查依赖
            if not self._check_dependency_met(task.depends_on):
                continue
            
            # 尝试原子锁定
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
                # 锁定成功，重新获取最新数据
                task = self._model.get_by_id(task.id)
                logger.info(f"Claimed task: {self.task_type}:{task.id} (project: {task.project_id or 'none'})")
                return task
        
        return None
    
    def _check_dependency_met(self, depends_on: str) -> bool:
        """
        检查依赖任务是否已完成
        
        Args:
            depends_on: 依赖格式 'image:xxx,video:yyy'
        
        Returns:
            依赖是否满足
        """
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
        """
        释放任务并更新结果
        
        Args:
            task_id: 任务ID
            success: 是否成功
            result_url: 结果URL
            result_local_path: 结果本地路径
            error: 错误信息
            **extra_fields: 额外字段（如 result_duration_ms）
        """
        now = datetime.now()
        task = self._model.get_or_none(self._model.id == task_id)
        
        if not task:
            logger.warning(f"Task not found: {task_id}")
            return
        
        if success:
            # 成功
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
            # 失败
            new_retry_count = task.retry_count + 1
            
            if new_retry_count < task.max_retries:
                # 可重试，恢复为 pending
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
                # 不可重试，标记为失败
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
            task: 任务对象
        
        Returns:
            (result_url, result_local_path) 元组
        
        Raises:
            Exception: 执行失败时抛出异常
        """
        raise NotImplementedError
    
    def run_once(self) -> bool:
        """
        执行一次：领取 -> 执行 -> 释放
        
        Returns:
            是否有任务执行
        """
        task = self.claim_task()
        if not task:
            return False
        
        try:
            # 启动心跳
            self._start_heartbeat(task.id)
            
            # 执行任务
            result_url, result_local_path = self.execute(task)
            
            # 释放任务（成功）
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
            # 停止心跳
            self._stop_heartbeat()
        
        return True
    
    def _get_extra_result_fields(self, task: Any) -> dict:
        """
        获取额外的结果字段（子类可覆盖）
        """
        return {}
    
    def run_loop(self, idle_sleep: float = 1.0):
        """
        持续运行循环
        
        Args:
            idle_sleep: 无任务时的休眠时间（秒）
        """
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
