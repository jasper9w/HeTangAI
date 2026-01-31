"""
API class exposed to frontend via pywebview
"""
import base64
import json
import math
import random
import string
import sys
import uuid
import threading
from concurrent.futures import ThreadPoolExecutor
from threading import Semaphore
from datetime import datetime
from pathlib import Path
from typing import Any, Optional, List, Dict

import webview
from loguru import logger

from services.project_manager import ProjectManager
from tasks import TaskManager
from tasks.executor import ImageExecutor, VideoExecutor, AudioExecutor

import numpy as np
from audiotsm import wsola
from audiotsm.io.array import ArrayReader, ArrayWriter


def change_audio_speed(audio, speed: float):
    """
    使用 WSOLA 算法调整音频速度（变速不变调）
    Args:
        audio: pydub AudioSegment 对象
        speed: 速度倍率，> 1 加快，< 1 减慢
    Returns:
        调整后的 AudioSegment 对象
    """
    if speed == 1.0:
        return audio

    # 转换为 numpy 数组
    samples = np.array(audio.get_array_of_samples())
    if audio.channels == 2:
        samples = samples.reshape((-1, 2)).T
    else:
        samples = samples.reshape((1, -1))

    # WSOLA 时域拉伸
    reader = ArrayReader(samples.astype(np.float32) / 32768.0)
    writer = ArrayWriter(channels=audio.channels)
    wsola(channels=audio.channels, speed=speed).run(reader, writer)

    # 转回 AudioSegment
    output = (writer.data * 32768).astype(np.int16)
    if audio.channels == 2:
        output = output.T.flatten()
    else:
        output = output.flatten()

    return audio._spawn(output.tobytes())


class Api:
    """pywebview API for frontend communication"""

    def __init__(self, user_data_dir: Path, output_dir: Path):
        # Store as private attributes to avoid pywebview serialization warnings
        self._user_data_dir = Path(user_data_dir)
        self._output_dir = Path(output_dir)
        self._window: Optional[webview.Window] = None
        self.project_path: Optional[Path] = None
        self.project_data: Optional[dict] = None
        self.project_name: Optional[str] = None
        self._file_server_port = 8765  # Must match port in main.py

        # Settings file is always in ~/.hetangai/settings.json
        self._settings_file = Path.home() / ".hetangai" / "settings.json"
        self._ensure_settings_file()

        # Initialize project manager with work directory from settings
        settings = self._load_settings()
        default_work_dir = Path.home() / "Desktop" / "荷塘AI"
        work_dir_str = settings.get("workDir", "") or str(default_work_dir)
        work_dir = Path(work_dir_str)
        self._project_manager = ProjectManager(work_dir)

        # Initialize unified thread pool with semaphores for concurrency control
        tts_concurrency = settings.get("tts", {}).get("concurrency", 1)
        tti_concurrency = settings.get("tti", {}).get("concurrency", 1)
        ttv_concurrency = settings.get("ttv", {}).get("concurrency", 1)
        
        # Single thread pool with enough workers to handle all concurrent tasks
        total_max_workers = tts_concurrency + tti_concurrency + ttv_concurrency
        self._thread_pool = ThreadPoolExecutor(max_workers=total_max_workers, thread_name_prefix="gen")
        
        # Semaphores to control per-task-type concurrency
        self._tts_semaphore = Semaphore(tts_concurrency)
        self._tti_semaphore = Semaphore(tti_concurrency)
        self._ttv_semaphore = Semaphore(ttv_concurrency)
        
        # Store current concurrency values for comparison
        self._tts_concurrency = tts_concurrency
        self._tti_concurrency = tti_concurrency
        self._ttv_concurrency = ttv_concurrency
        
        logger.info(f"Thread pool initialized: total_workers={total_max_workers}, TTS={tts_concurrency}, TTI={tti_concurrency}, TTV={ttv_concurrency}")

        # Shot builder task state
        self._shot_builder_task: Optional[dict] = None  # {"step": str, "running": bool, "error": str|None}

        # Task system (initialized when project is opened)
        self._task_manager: Optional[TaskManager] = None
        self._task_executors: List[Any] = []
        self._task_executor_threads: List[threading.Thread] = []
        
        # Task monitor thread
        self._task_monitor_running = False
        self._task_monitor_thread: Optional[threading.Thread] = None

        logger.info("API initialized")

    def _generate_shot_id(self) -> str:
        """Generate a 6-character random ID for shot"""
        chars = string.ascii_lowercase + string.digits
        return ''.join(random.choices(chars, k=6))

    def _get_project_id(self) -> str:
        """Get current project ID (empty string if not available)"""
        if self.project_data:
            return self.project_data.get('id', '')
        return ''

    # ========== Task System Methods ==========

    def _start_task_executors(self):
        """Start task executors (global shared database)"""
        # If already running, skip
        if self._task_manager is not None:
            logger.debug("Task executors already running, skipping")
            return

        # Use global shared database path
        db_path = str(Path.home() / ".hetangai" / "tasks.db")

        # Initialize TaskManager
        self._task_manager = TaskManager(db_path)

        # Get API configurations
        settings = self._load_settings()
        tti_config = settings.get("tti", {})
        ttv_config = settings.get("ttv", {})
        tts_config = settings.get("tts", {})

        # Get concurrency settings
        tti_concurrency = tti_config.get("concurrency", 1)
        ttv_concurrency = ttv_config.get("concurrency", 1)
        tts_concurrency = tts_config.get("concurrency", 1)

        # Settings file path for dynamic config loading
        settings_file = str(self._settings_file)

        # Start image executors
        if tti_config.get("apiUrl") and tti_config.get("apiKey"):
            for i in range(tti_concurrency):
                executor = ImageExecutor(
                    db_path=db_path,
                    worker_id=f"image-{i}",
                    settings_file=settings_file,
                    config_key='tti',
                    current_project_id_getter=self._get_project_id
                )
                thread = threading.Thread(
                    target=executor.run_loop,
                    daemon=True,
                    name=f"ImageExecutor-{i}"
                )
                thread.start()
                self._task_executors.append(executor)
                self._task_executor_threads.append(thread)
            logger.info(f"Started {tti_concurrency} image executor(s)")

        # Start video executors
        if ttv_config.get("apiUrl") and ttv_config.get("apiKey"):
            for i in range(ttv_concurrency):
                executor = VideoExecutor(
                    db_path=db_path,
                    worker_id=f"video-{i}",
                    settings_file=settings_file,
                    config_key='ttv',
                    current_project_id_getter=self._get_project_id
                )
                thread = threading.Thread(
                    target=executor.run_loop,
                    daemon=True,
                    name=f"VideoExecutor-{i}"
                )
                thread.start()
                self._task_executors.append(executor)
                self._task_executor_threads.append(thread)
            logger.info(f"Started {ttv_concurrency} video executor(s)")

        # Start audio executors
        if tts_config.get("apiUrl"):
            for i in range(tts_concurrency):
                executor = AudioExecutor(
                    db_path=db_path,
                    worker_id=f"audio-{i}",
                    settings_file=settings_file,
                    config_key='tts',
                    current_project_id_getter=self._get_project_id
                )
                thread = threading.Thread(
                    target=executor.run_loop,
                    daemon=True,
                    name=f"AudioExecutor-{i}"
                )
                thread.start()
                self._task_executors.append(executor)
                self._task_executor_threads.append(thread)
            logger.info(f"Started {tts_concurrency} audio executor(s)")

        # Start task monitor thread
        self._task_monitor_running = True
        self._task_monitor_thread = threading.Thread(
            target=self._task_monitor_loop,
            daemon=True,
            name="TaskMonitor"
        )
        self._task_monitor_thread.start()
        logger.info("Task monitor started")

        logger.info("Task executors started (global shared database)")

    def _stop_task_executors(self):
        """Stop all task executors"""
        # Stop task monitor
        self._task_monitor_running = False
        if self._task_monitor_thread:
            self._task_monitor_thread.join(timeout=2.0)
            self._task_monitor_thread = None
        
        # Signal all executors to stop
        for executor in self._task_executors:
            executor.stop()

        # Wait for threads to finish (with timeout)
        for thread in self._task_executor_threads:
            thread.join(timeout=2.0)

        # Clear lists
        self._task_executors.clear()
        self._task_executor_threads.clear()

        # Close TaskManager
        if self._task_manager:
            self._task_manager.close()
            self._task_manager = None

        logger.info("Task executors stopped")

    def _task_monitor_loop(self):
        """后台监控线程：检查已完成/失败任务并回写业务数据"""
        import time
        
        while self._task_monitor_running:
            try:
                if not self._task_manager or not self.project_data:
                    time.sleep(2)
                    continue
                
                # 获取未处理的已完成任务
                completed_tasks = self._task_manager.get_unprocessed_completed_tasks()
                
                for task_data in completed_tasks:
                    try:
                        task_type = task_data.get('task_type')
                        task_id = task_data.get('id')
                        shot_id = task_data.get('shot_id')
                        
                        if not shot_id:
                            # 没有关联 shot，尝试处理非镜头任务（封面、风格图、角色图、场景图）
                            self._handle_non_shot_task_completion(task_data)
                            self._task_manager.mark_task_processed(task_type, task_id)
                            continue
                        
                        # 找到对应的 shot
                        shot = None
                        for s in self.project_data.get("shots", []):
                            if s["id"] == shot_id:
                                shot = s
                                break
                        
                        if not shot:
                            logger.warning(f"Shot not found for task {task_id}: {shot_id}")
                            self._task_manager.mark_task_processed(task_type, task_id)
                            continue
                        
                        # 根据任务类型处理回写
                        if task_type == 'image':
                            self._handle_completed_image_task(task_data, shot)
                        elif task_type == 'video':
                            self._handle_completed_video_task(task_data, shot)
                        elif task_type == 'audio':
                            self._handle_completed_audio_task(task_data, shot)
                        
                        # 标记任务为已处理
                        self._task_manager.mark_task_processed(task_type, task_id)
                        
                    except Exception as e:
                        logger.error(f"Failed to process completed task: {e}")
                
                # 获取未处理的失败任务
                failed_tasks = self._task_manager.get_unprocessed_failed_tasks()
                if failed_tasks:
                    logger.info(f"Found {len(failed_tasks)} unprocessed failed tasks")
                
                for task_data in failed_tasks:
                    try:
                        task_type = task_data.get('task_type')
                        task_id = task_data.get('id')
                        shot_id = task_data.get('shot_id')
                        error_msg = task_data.get('error', 'Unknown error')
                        
                        logger.info(f"Processing failed task: {task_type}:{task_id}, shot_id={shot_id}")
                        
                        if not shot_id:
                            # 没有关联 shot，尝试处理非镜头任务的失败
                            self._handle_non_shot_task_failure(task_data)
                            self._task_manager.mark_task_processed(task_type, task_id)
                            continue
                        
                        # 找到对应的 shot
                        shot = None
                        for s in self.project_data.get("shots", []):
                            if s["id"] == shot_id:
                                shot = s
                                break
                        
                        if not shot:
                            logger.warning(f"Shot not found for failed task {task_id}: {shot_id}")
                            self._task_manager.mark_task_processed(task_type, task_id)
                            continue
                        
                        # 更新镜头状态为错误
                        shot["status"] = "error"
                        shot["errorMessage"] = error_msg
                        
                        # 通知前端
                        self._notify_shot_status(shot_id, "error", shot)
                        logger.info(f"Updated shot {shot_id} status to error: {error_msg}")
                        
                        # 标记任务为已处理
                        self._task_manager.mark_task_processed(task_type, task_id)
                        
                    except Exception as e:
                        logger.error(f"Failed to process failed task: {e}")
                
                # 检查并调整执行器数量
                self._check_executor_adjustment()
                
            except Exception as e:
                logger.error(f"Task monitor error: {e}")
            
            time.sleep(2)
    
    def _check_executor_adjustment(self):
        """检查并调整执行器数量（在 monitor loop 中每2秒调用）"""
        if not self._task_manager or not self.project_name:
            return
        
        settings = self._load_settings()
        
        # 定义类型映射
        type_config_map = [
            ('image', 'tti', ImageExecutor),
            ('video', 'ttv', VideoExecutor),
            ('audio', 'tts', AudioExecutor),
        ]
        
        for task_type, config_key, executor_class in type_config_map:
            config = settings.get(config_key, {})
            target_count = config.get("concurrency", 1)
            
            # 获取当前该类型的执行器
            current_executors = [(i, e) for i, e in enumerate(self._task_executors) if e.task_type == task_type]
            current_count = len(current_executors)
            
            if target_count > current_count:
                # 需要增加执行器
                diff = target_count - current_count
                for _ in range(diff):
                    self._add_executor(task_type, config, executor_class)
                logger.info(f"Added {diff} {task_type} executor(s), now {target_count}")
                
            elif target_count < current_count:
                # 需要减少执行器（每次只减少一个空闲的）
                for idx, executor in reversed(current_executors):  # 从后往前找
                    if executor._current_task_id is None:  # 空闲
                        executor.stop()
                        # 从列表中移除
                        self._task_executors.pop(idx)
                        self._task_executor_threads.pop(idx)
                        logger.info(f"Removed idle {task_type} executor, now {current_count - 1}")
                        break  # 每次循环只减少一个
    
    def _add_executor(self, task_type: str, config: dict, executor_class):
        """添加单个执行器"""
        # 使用全局共享数据库路径
        db_path = str(Path.home() / ".hetangai" / "tasks.db")
        
        # 计算新的 worker_id（找到当前最大的序号+1）
        existing_ids = [
            int(e.worker_id.split('-')[1]) 
            for e in self._task_executors 
            if e.task_type == task_type and '-' in e.worker_id
        ]
        next_id = max(existing_ids, default=-1) + 1
        
        # 检查 API 配置
        api_url = config.get("apiUrl", "")
        
        if not api_url:
            logger.warning(f"Cannot add {task_type} executor: apiUrl not configured")
            return
        
        # 配置键名映射
        config_key_map = {
            'image': 'tti',
            'video': 'ttv',
            'audio': 'tts'
        }
        
        # 创建执行器（使用动态配置加载，传入当前项目ID回调）
        executor = executor_class(
            db_path=db_path,
            worker_id=f"{task_type}-{next_id}",
            settings_file=str(self._settings_file),
            config_key=config_key_map.get(task_type, task_type),
            current_project_id_getter=self._get_project_id
        )
        
        # 启动线程
        thread = threading.Thread(
            target=executor.run_loop,
            daemon=True,
            name=f"{executor_class.__name__}-{next_id}"
        )
        thread.start()
        
        self._task_executors.append(executor)
        self._task_executor_threads.append(thread)
    
    def _handle_completed_image_task(self, task_data: dict, shot: dict):
        """处理已完成的图片任务，更新 shot 数据"""
        result_local_path = task_data.get('result_local_path')
        result_url = task_data.get('result_url')
        slot = task_data.get('slot', 1)
        shot_id = shot["id"]
        
        if not result_local_path or not Path(result_local_path).exists():
            logger.warning(f"Image result not found: {result_local_path}")
            return
        
        # 复制到正确的槽位路径
        target_path = self._project_manager.get_shot_image_path(self.project_name, shot_id, slot)
        target_path.parent.mkdir(parents=True, exist_ok=True)
        
        # 如果结果文件和目标路径不同，复制文件
        if str(result_local_path) != str(target_path):
            import shutil
            shutil.copy2(result_local_path, target_path)
        
        # 更新 shot 数据
        existing_images = shot.get("images", [])
        existing_local_paths = shot.get("_localImagePaths", [])
        existing_source_urls = shot.get("imageSourceUrls", [])
        
        # 确保列表长度足够
        while len(existing_images) < 4:
            existing_images.append("")
        while len(existing_local_paths) < 4:
            existing_local_paths.append("")
        while len(existing_source_urls) < 4:
            existing_source_urls.append("")
        
        # 更新槽位数据
        idx = slot - 1
        existing_images[idx] = self._path_to_url(str(target_path))
        existing_local_paths[idx] = str(target_path)
        existing_source_urls[idx] = result_url or ""
        
        # 过滤空值
        shot["images"] = [img for img in existing_images if img]
        shot["_localImagePaths"] = [p for p in existing_local_paths if p]
        shot["imageSourceUrls"] = [url for url in existing_source_urls if url or url == ""][:len(shot["images"])]
        
        # 选中新生成的图片
        shot["selectedImageIndex"] = min(idx, len(shot["images"]) - 1)
        shot["status"] = "images_ready"
        
        # 通知前端
        self._notify_shot_status(shot_id, "images_ready", shot)
        logger.info(f"Updated shot {shot_id} with new image at slot {slot}")
    
    def _handle_completed_video_task(self, task_data: dict, shot: dict):
        """处理已完成的视频任务，更新 shot 数据"""
        result_local_path = task_data.get('result_local_path')
        result_url = task_data.get('result_url')
        shot_id = shot["id"]
        
        if not result_local_path or not Path(result_local_path).exists():
            logger.warning(f"Video result not found: {result_local_path}")
            return
        
        # 确定目标槽位
        existing_slots = []
        for slot in range(1, 5):
            slot_path = self._project_manager.get_shot_video_path(self.project_name, shot_id, slot)
            if slot_path.exists():
                existing_slots.append((slot, slot_path.stat().st_mtime))
        existing_slots.sort(key=lambda x: x[1])
        
        if len(existing_slots) < 4:
            occupied = {slot for slot, _ in existing_slots}
            for slot in range(1, 5):
                if slot not in occupied:
                    target_slot = slot
                    break
        else:
            target_slot = existing_slots[0][0]
        
        # 复制到目标路径
        target_path = self._project_manager.get_shot_video_path(self.project_name, shot_id, target_slot)
        target_path.parent.mkdir(parents=True, exist_ok=True)
        
        if str(result_local_path) != str(target_path):
            import shutil
            shutil.copy2(result_local_path, target_path)
        
        # 重新扫描所有视频槽位
        all_videos = []
        for slot in range(1, 5):
            slot_path = self._project_manager.get_shot_video_path(self.project_name, shot_id, slot)
            if slot_path.exists():
                all_videos.append(self._path_to_url(str(slot_path)))
        
        shot["videos"] = all_videos
        shot["videoUrl"] = all_videos[0] if all_videos else ""
        shot["selectedVideoIndex"] = len(all_videos) - 1
        shot["status"] = "video_ready"
        
        # 通知前端
        self._notify_shot_status(shot_id, "video_ready", shot)
        logger.info(f"Updated shot {shot_id} with new video")
    
    def _handle_completed_audio_task(self, task_data: dict, shot: dict):
        """处理已完成的音频任务，检查是否所有对话都完成，然后合并"""
        shot_id = shot["id"]
        dialogue_index = task_data.get('dialogue_index', 0)
        result_local_path = task_data.get('result_local_path')
        
        if not result_local_path or not Path(result_local_path).exists():
            logger.warning(f"Audio result not found: {result_local_path}")
            return
        
        # 获取镜头的对话数量
        dialogues = shot.get("dialogues", [])
        if not dialogues and shot.get("script"):
            dialogues = [{"role": shot.get("voiceActor", ""), "text": shot["script"]}]
        
        total_dialogues = len(dialogues)
        
        # 检查是否所有对话任务都已完成
        from tasks.models import AudioTask, TaskStatus
        
        completed_dialogue_tasks = (
            AudioTask.select()
            .where(
                (AudioTask.shot_id == shot_id) &
                (AudioTask.status == TaskStatus.SUCCESS.value)
            )
        )
        
        completed_indices = set()
        dialogue_results = {}
        for task in completed_dialogue_tasks:
            if task.dialogue_index is not None:
                completed_indices.add(task.dialogue_index)
                dialogue_results[task.dialogue_index] = task.result_local_path
        
        # 如果不是所有对话都完成，等待
        if len(completed_indices) < total_dialogues:
            logger.debug(f"Shot {shot_id}: {len(completed_indices)}/{total_dialogues} dialogues completed")
            return
        
        # 所有对话都完成，合并音频
        try:
            from pydub import AudioSegment
            
            audio_segments = []
            for idx in range(total_dialogues):
                path = dialogue_results.get(idx)
                if path and Path(path).exists():
                    segment = AudioSegment.from_file(path)
                    audio_segments.append(segment)
                    
                    # 添加 300ms 间隔
                    if idx < total_dialogues - 1:
                        silence = AudioSegment.silent(duration=300)
                        audio_segments.append(silence)
            
            if not audio_segments:
                logger.warning(f"No audio segments to combine for shot {shot_id}")
                return
            
            # 合并
            combined = audio_segments[0]
            for segment in audio_segments[1:]:
                combined += segment
            
            # 保存
            final_path = self._project_manager.get_shot_audio_path(self.project_name, shot_id)
            final_path.parent.mkdir(parents=True, exist_ok=True)
            combined.export(str(final_path), format="wav")
            
            # 更新 shot
            shot["audioUrl"] = self._path_to_url(str(final_path))
            shot["status"] = "audio_ready"
            
            # 通知前端
            self._notify_shot_status(shot_id, "audio_ready", shot)
            logger.info(f"Combined audio for shot {shot_id} with {total_dialogues} dialogues")
            
        except Exception as e:
            logger.error(f"Failed to combine audio for shot {shot_id}: {e}")

    def _handle_non_shot_task_completion(self, task_data: dict):
        """处理非镜头任务完成（封面、风格图、角色图、场景图）"""
        task_id = task_data.get('id')
        task_type = task_data.get('task_type')
        result_local_path = task_data.get('result_local_path')
        result_url = task_data.get('result_url')
        
        if task_type != 'image':
            return
        
        if not result_local_path or not Path(result_local_path).exists():
            logger.warning(f"Non-shot task result not found: {result_local_path}")
            return
        
        import time
        timestamp = int(time.time() * 1000)
        image_url = f"{self._path_to_url(result_local_path)}?t={timestamp}"
        
        # 检查是否为封面任务
        if self.project_data.get('coverTaskId') == task_id:
            self.project_data['coverUrl'] = image_url
            self.project_data['coverTaskId'] = None  # 清除任务ID
            logger.info(f"Updated cover image from task {task_id}")
            # 通知前端
            self._notify_project_update('cover', {'coverUrl': image_url})
            return
        
        # 检查是否为风格图任务
        if self.project_data.get('styleTaskId') == task_id:
            style_config = self.project_data.get('styleConfig', {})
            style_config['previewImageUrl'] = image_url
            self.project_data['styleConfig'] = style_config
            self.project_data['styleTaskId'] = None
            logger.info(f"Updated style preview from task {task_id}")
            self._notify_project_update('style', {'styleConfig': style_config})
            return
        
        # 检查是否为角色图任务
        for char in self.project_data.get('characters', []):
            if char.get('imageTaskId') == task_id:
                char['imageUrl'] = image_url
                char['imageSourceUrl'] = result_url or ''
                char['status'] = 'ready'
                char['imageTaskId'] = None
                logger.info(f"Updated character {char['id']} image from task {task_id}")
                self._notify_character_update(char['id'], char)
                return
        
        # 检查是否为场景图任务
        for scene in self.project_data.get('scenes', []):
            if scene.get('imageTaskId') == task_id:
                scene['imageUrl'] = image_url
                scene['imageSourceUrl'] = result_url or ''
                scene['status'] = 'ready'
                scene['imageTaskId'] = None
                logger.info(f"Updated scene {scene['id']} image from task {task_id}")
                self._notify_scene_update(scene['id'], scene)
                return
        
        logger.debug(f"Non-shot task {task_id} not matched to any business object")

    def _handle_non_shot_task_failure(self, task_data: dict):
        """处理非镜头任务失败"""
        task_id = task_data.get('id')
        task_type = task_data.get('task_type')
        error_msg = task_data.get('error', 'Unknown error')
        
        if task_type != 'image':
            return
        
        # 检查是否为封面任务
        if self.project_data.get('coverTaskId') == task_id:
            self.project_data['coverTaskId'] = None
            logger.warning(f"Cover generation failed: {error_msg}")
            self._notify_project_update('cover_error', {'error': error_msg})
            return
        
        # 检查是否为风格图任务
        if self.project_data.get('styleTaskId') == task_id:
            self.project_data['styleTaskId'] = None
            logger.warning(f"Style preview generation failed: {error_msg}")
            self._notify_project_update('style_error', {'error': error_msg})
            return
        
        # 检查是否为角色图任务
        for char in self.project_data.get('characters', []):
            if char.get('imageTaskId') == task_id:
                char['status'] = 'error'
                char['errorMessage'] = error_msg
                char['imageTaskId'] = None
                logger.warning(f"Character {char['id']} image generation failed: {error_msg}")
                self._notify_character_update(char['id'], char)
                return
        
        # 检查是否为场景图任务
        for scene in self.project_data.get('scenes', []):
            if scene.get('imageTaskId') == task_id:
                scene['status'] = 'error'
                scene['errorMessage'] = error_msg
                scene['imageTaskId'] = None
                logger.warning(f"Scene {scene['id']} image generation failed: {error_msg}")
                self._notify_scene_update(scene['id'], scene)
                return

    def _notify_project_update(self, update_type: str, data: dict):
        """通知前端项目数据更新"""
        if hasattr(self, '_window') and self._window:
            try:
                self._window.evaluate_js(f"window.dispatchEvent(new CustomEvent('projectUpdate', {{detail: {{type: '{update_type}', data: {json.dumps(data)}}}}}));")
            except Exception as e:
                logger.debug(f"Failed to notify project update: {e}")

    def _notify_character_update(self, character_id: str, character: dict):
        """通知前端角色数据更新"""
        if hasattr(self, '_window') and self._window:
            try:
                self._window.evaluate_js(f"window.dispatchEvent(new CustomEvent('characterUpdate', {{detail: {{characterId: '{character_id}', character: {json.dumps(character)}}}}}));")
            except Exception as e:
                logger.debug(f"Failed to notify character update: {e}")

    def _notify_scene_update(self, scene_id: str, scene: dict):
        """通知前端场景数据更新"""
        if hasattr(self, '_window') and self._window:
            try:
                self._window.evaluate_js(f"window.dispatchEvent(new CustomEvent('sceneUpdate', {{detail: {{sceneId: '{scene_id}', scene: {json.dumps(scene)}}}}}));")
            except Exception as e:
                logger.debug(f"Failed to notify scene update: {e}")

    def _generate_scene_id(self) -> str:
        """Generate a short random ID for scene"""
        return f"scene_{uuid.uuid4().hex[:8]}"

    def _generate_role_id(self) -> str:
        """Generate a short random ID for role"""
        return f"role_{uuid.uuid4().hex[:8]}"

    def _path_to_url(self, filepath: str) -> str:
        """Convert local file path to HTTP URL for file server"""
        # Use relative path from current directory
        try:
            from pathlib import Path
            import os

            base_dir = Path.cwd()
            file_path = Path(filepath)

            # Try to get relative path
            try:
                rel_path = file_path.relative_to(base_dir)
                return f"http://127.0.0.1:{self._file_server_port}/{rel_path}"
            except ValueError:
                # File is outside base_dir, use absolute path
                return f"http://127.0.0.1:{self._file_server_port}/{filepath}"
        except Exception as e:
            logger.warning(f"Failed to convert path to URL: {e}")
            return filepath

    def _url_to_path(self, url: str) -> str:
        """Convert HTTP URL back to local file path"""
        try:
            # Remove query parameters (e.g., ?t=timestamp)
            if "?" in url:
                url = url.split("?")[0]

            # Remove the HTTP URL prefix
            prefix = f"http://127.0.0.1:{self._file_server_port}/"
            if url.startswith(prefix):
                path_str = url[len(prefix):]
                # If it's a relative path, resolve it relative to cwd
                path = Path(path_str)
                if not path.is_absolute():
                    path = Path.cwd() / path
                return str(path)
            else:
                # If URL doesn't match expected format, assume it's already a path
                return url
        except Exception as e:
            logger.warning(f"Failed to convert URL to path: {e}")
            return url


    @property
    def user_data_dir(self) -> str:
        return str(self._user_data_dir)

    @property
    def output_dir(self) -> str:
        return str(self._output_dir)


    def set_window(self, window: webview.Window):
        """Set window reference (called from main.py, not stored in __init__)"""
        self._window = window

    def _ensure_settings_file(self):
        """Ensure settings file exists with default values"""
        if not self._settings_file.exists():
            desktop = Path.home() / "Desktop"
            default_work_dir = str(desktop / "荷塘AI")

            default_settings = {
                "workDir": default_work_dir,
                "jianyingDraftDir": "",
                "referenceAudioDir": "",
                "tts": {
                    "apiUrl": "",
                    "model": "tts-1",
                    "apiKey": "",
                    "concurrency": 1,
                },
                "tti": {
                    "provider": "openai",
                    "apiUrl": "",
                    "apiKey": "",
                    "characterModel": "gemini-3.0-pro-image-landscape",
                    "sceneModel": "gemini-2.5-flash-image-landscape",
                    "shotModel": "gemini-2.5-flash-image-landscape",
                    "whiskToken": "",
                    "whiskWorkflowId": "",
                    "concurrency": 1,
                },
                "ttv": {
                    "provider": "openai",
                    "apiUrl": "",
                    "apiKey": "",
                    "model": "veo_3_1_i2v_s_fast_fl_landscape",
                    "whiskToken": "",
                    "whiskWorkflowId": "",
                    "concurrency": 1,
                },
                "shotBuilder": {
                    "apiUrl": "",
                    "apiKey": "",
                    "model": "gemini-3-pro-preview",
                },
            }
            self._settings_file.parent.mkdir(parents=True, exist_ok=True)
            with open(self._settings_file, "w", encoding="utf-8") as f:
                json.dump(default_settings, f, indent=2, ensure_ascii=False)
            logger.info(f"Created default settings file: {self._settings_file}")

    def _load_settings(self) -> dict:
        """Load settings from file"""
        if self._settings_file.exists():
            try:
                with open(self._settings_file, "r", encoding="utf-8") as f:
                    return json.load(f)
            except Exception as e:
                logger.error(f"Failed to load settings: {e}")
        return {}

    def _get_audio_preferences_file(self) -> Path:
        """Get path to audio preferences file"""
        return Path.home() / ".hetangai" / "audio_preferences.json"

    def _load_audio_preferences(self) -> dict:
        """Load audio preferences from file"""
        prefs_file = self._get_audio_preferences_file()
        if prefs_file.exists():
            try:
                with open(prefs_file, "r", encoding="utf-8") as f:
                    return json.load(f)
            except Exception as e:
                logger.error(f"Failed to load audio preferences: {e}")
        return {"speeds": {}, "favorites": [], "recentlyUsed": []}

    def _save_audio_preferences(self, data: dict) -> bool:
        """Save audio preferences to file"""
        prefs_file = self._get_audio_preferences_file()
        try:
            prefs_file.parent.mkdir(parents=True, exist_ok=True)
            with open(prefs_file, "w", encoding="utf-8") as f:
                json.dump(data, f, ensure_ascii=False, indent=2)
            return True
        except Exception as e:
            logger.error(f"Failed to save audio preferences: {e}")
            return False

    def get_audio_preferences(self) -> dict:
        """Get audio preferences for frontend"""
        prefs = self._load_audio_preferences()
        return {
            "success": True,
            "speeds": prefs.get("speeds", {}),
            "favorites": prefs.get("favorites", []),
            "recentlyUsed": prefs.get("recentlyUsed", [])
        }

    def set_audio_speed(self, audio_path: str, speed: float) -> dict:
        """Set speed for a specific audio"""
        prefs = self._load_audio_preferences()
        prefs["speeds"][audio_path] = speed
        success = self._save_audio_preferences(prefs)
        return {"success": success}

    def toggle_audio_favorite(self, audio_path: str) -> dict:
        """Toggle favorite status for an audio"""
        prefs = self._load_audio_preferences()
        favorites = prefs.get("favorites", [])
        
        if audio_path in favorites:
            favorites.remove(audio_path)
            is_favorite = False
        else:
            favorites.append(audio_path)
            is_favorite = True
        
        prefs["favorites"] = favorites
        success = self._save_audio_preferences(prefs)
        return {"success": success, "isFavorite": is_favorite}

    def record_audio_usage(self, audio_path: str) -> dict:
        """Record usage of an audio"""
        from datetime import datetime
        
        prefs = self._load_audio_preferences()
        recently_used = prefs.get("recentlyUsed", [])
        
        # Find existing entry
        existing = None
        for item in recently_used:
            if item.get("path") == audio_path:
                existing = item
                break
        
        if existing:
            existing["lastUsed"] = datetime.now().isoformat()
            existing["useCount"] = existing.get("useCount", 0) + 1
        else:
            recently_used.append({
                "path": audio_path,
                "lastUsed": datetime.now().isoformat(),
                "useCount": 1
            })
        
        # Keep only last 50 recently used
        recently_used.sort(key=lambda x: x.get("lastUsed", ""), reverse=True)
        prefs["recentlyUsed"] = recently_used[:50]
        
        success = self._save_audio_preferences(prefs)
        return {"success": success}

    def _ensure_prompt_prefixes(self, project_data: dict) -> None:
        """Ensure prompt prefixes exist in project data"""
        if "promptPrefixes" not in project_data or not isinstance(project_data.get("promptPrefixes"), dict):
            project_data["promptPrefixes"] = {}
        prefix_config = project_data["promptPrefixes"]
        prefix_config.setdefault("shotImagePrefix", "")
        prefix_config.setdefault("shotVideoPrefix", "")
        prefix_config.setdefault("characterPrefix", "")

    def _get_shot_builder_prompt_dir(self) -> Path:
        return Path.home() / ".hetangai" / "prompts"

    def _ensure_shot_builder_prompts(self) -> None:
        prompt_dir = self._get_shot_builder_prompt_dir()
        prompt_dir.mkdir(parents=True, exist_ok=True)
        source_dir = Path(__file__).resolve().parent / "services" / "prompts"
        for name in ("role.txt", "scene.txt", "shot.txt"):
            target_path = prompt_dir / name
            if not target_path.exists():
                source_path = source_dir / name
                if source_path.exists():
                    import shutil
                    shutil.copy2(source_path, target_path)
                else:
                    target_path.write_text("", encoding="utf-8")

    def _get_shot_builder_output_dir(self) -> Path:
        if not self.project_name:
            raise ValueError("Please save the project first before using shot builder")
        project_dir = self._project_manager.get_project_dir(self.project_name)
        output_dir = project_dir / "shot_builder"
        output_dir.mkdir(parents=True, exist_ok=True)
        return output_dir

    # ========== Project Management ==========

    def new_project(self) -> dict:
        """Create a new empty project"""
        import secrets
        logger.info("Creating new project")
        project_id = secrets.token_hex(4)  # 8位十六进制字符
        self.project_data = {
            "id": project_id,
            "version": "1.0",
            "name": "Untitled Project",
            "createdAt": datetime.now().isoformat(),
            "updatedAt": datetime.now().isoformat(),
            "promptPrefixes": {
                "shotImagePrefix": "",
                "shotVideoPrefix": "",
                "characterPrefix": "",
            },
            "characters": [
                {
                    "id": "narrator",
                    "name": "旁白",
                    "description": "",
                    "imageUrl": "",
                    "speed": 1.5,
                    "isNarrator": True,
                    "status": "ready",
                }
            ],
            "scenes": [],
            "shots": [],
        }
        self.project_path = None
        self.project_name = None
        return {"success": True, "data": self.project_data}

    def list_projects(self) -> dict:
        """List all projects in work directory with metadata"""
        try:
            project_names = self._project_manager.list_projects()
            projects = []

            for name in project_names:
                try:
                    project_data = self._project_manager.load_project(name)
                    if project_data:
                        projects.append({
                            "name": name,
                            "path": str(self._project_manager.get_project_file(name)),
                            "createdAt": project_data.get("createdAt", ""),
                            "updatedAt": project_data.get("updatedAt", ""),
                            "shotCount": len(project_data.get("shots", [])),
                            "characterCount": len(project_data.get("characters", [])),
                        })
                except Exception as e:
                    logger.warning(f"Failed to load project {name}: {e}")
                    continue

            return {"success": True, "projects": projects}
        except Exception as e:
            logger.error(f"Failed to list projects: {e}")
            return {"success": False, "error": str(e), "projects": []}

    def open_project_from_workdir(self, project_name: str) -> dict:
        """Open a project from work directory by name"""
        try:
            project_data = self._project_manager.load_project(project_name)
            if project_data:
                self.project_data = project_data
                self.project_name = project_name
                self.project_path = self._project_manager.get_project_file(project_name)

                # Clear all "generating" statuses on startup
                for shot in self.project_data.get("shots", []):
                    if shot.get("status") in ["generating_images", "generating_video", "generating_audio"]:
                        shot["status"] = "pending"
                        logger.info(f"Cleared generating status for shot {shot.get('id')}")

                for character in self.project_data.get("characters", []):
                    if character.get("status") == "generating":
                        character["status"] = "pending"
                        logger.info(f"Cleared generating status for character {character.get('name')}")

                for scene in self.project_data.get("scenes", []):
                    if scene.get("status") == "generating":
                        scene["status"] = "pending"
                        logger.info(f"Cleared generating status for scene {scene.get('name')}")

                # Backward compatibility: migrate old format to new format
                for shot in self.project_data.get("shots", []):
                    if "dialogues" not in shot or not shot["dialogues"]:
                        if shot.get("script") and shot.get("voiceActor"):
                            shot["dialogues"] = [{"role": shot["voiceActor"], "text": shot["script"]}]
                            logger.info(f"Migrated shot {shot.get('id')} to new dialogue format")

                self._ensure_prompt_prefixes(self.project_data)
                if "scenes" not in self.project_data or not isinstance(self.project_data.get("scenes"), list):
                    self.project_data["scenes"] = []

                # Load all alternative images for each shot (slots 1-4)
                for shot in self.project_data.get("shots", []):
                    shot_id = shot.get("id")
                    all_image_paths = []
                    all_local_paths = []

                    for slot in range(1, 5):
                        slot_path = self._project_manager.get_shot_image_path(project_name, shot_id, slot)
                        if slot_path.exists():
                            all_image_paths.append(self._path_to_url(str(slot_path)))
                            all_local_paths.append(str(slot_path))

                    shot["images"] = all_image_paths
                    shot["_localImagePaths"] = all_local_paths
                    if all_image_paths and "selectedImageIndex" not in shot:
                        shot["selectedImageIndex"] = 0

                    # Load all alternative videos for each shot (slots 1-4)
                    all_video_paths = []
                    for slot in range(1, 5):
                        slot_path = self._project_manager.get_shot_video_path(project_name, shot_id, slot)
                        if slot_path.exists():
                            all_video_paths.append(self._path_to_url(str(slot_path)))

                    shot["videos"] = all_video_paths
                    if all_video_paths and "selectedVideoIndex" not in shot:
                        shot["selectedVideoIndex"] = 0

                    # Load audio
                    audio_path = self._project_manager.get_shot_audio_path(project_name, shot_id)
                    if audio_path.exists():
                        shot["audioUrl"] = self._path_to_url(str(audio_path))
                    else:
                        shot["audioUrl"] = ""

                # Start task executors (global shared database, only starts once)
                try:
                    self._start_task_executors()
                except Exception as e:
                    logger.warning(f"Failed to start task executors: {e}")

                logger.info(f"Opened project from workdir: {project_name}")
                return {"success": True, "data": self.project_data, "name": project_name}
            else:
                return {"success": False, "error": "Project not found"}
        except Exception as e:
            logger.error(f"Failed to open project: {e}")
            return {"success": False, "error": str(e)}

    def save_project_to_workdir(self, project_name: Optional[str] = None) -> dict:
        """Save project to work directory"""
        if not self.project_data:
            return {"success": False, "error": "No project data"}

        try:
            # Use provided name or existing name or project data name
            name = project_name or self.project_name or self.project_data.get("name", "Untitled Project")
            self.project_data["updatedAt"] = datetime.now().isoformat()
            self.project_data["name"] = name

            project_file = self._project_manager.save_project(name, self.project_data)
            self.project_name = name
            self.project_path = project_file

            logger.info(f"Saved project to workdir: {name}")
            return {"success": True, "name": name, "path": str(project_file)}
        except Exception as e:
            logger.error(f"Failed to save project: {e}")
            return {"success": False, "error": str(e)}

    def delete_project_from_workdir(self, project_name: str) -> dict:
        """Delete a project from work directory"""
        try:
            project_dir = self._project_manager.get_project_dir(project_name)
            if not project_dir.exists():
                return {"success": False, "error": "Project not found"}

            import shutil
            shutil.rmtree(project_dir)
            logger.info(f"Deleted project: {project_name}")
            return {"success": True}
        except Exception as e:
            logger.error(f"Failed to delete project: {e}")
            return {"success": False, "error": str(e)}

    def rename_project_in_workdir(self, old_name: str, new_name: str) -> dict:
        """Rename a project in work directory"""
        try:
            old_dir = self._project_manager.get_project_dir(old_name)
            new_dir = self._project_manager.get_project_dir(new_name)

            if not old_dir.exists():
                return {"success": False, "error": "Project not found"}

            if new_dir.exists():
                return {"success": False, "error": "A project with this name already exists"}

            # Load project data and update name
            project_data = self._project_manager.load_project(old_name)
            if not project_data:
                return {"success": False, "error": "Failed to load project data"}

            project_data["name"] = new_name
            project_data["updatedAt"] = datetime.now().isoformat()

            # Rename directory
            old_dir.rename(new_dir)

            # Update project.json with new name
            self._project_manager.save_project(new_name, project_data)

            # Update current project if it's the one being renamed
            if self.project_name == old_name:
                self.project_name = new_name
                self.project_data = project_data
                self.project_path = self._project_manager.get_project_file(new_name)

            logger.info(f"Renamed project: {old_name} -> {new_name}")
            return {"success": True, "name": new_name}
        except Exception as e:
            logger.error(f"Failed to rename project: {e}")
            return {"success": False, "error": str(e)}

    def open_project(self) -> dict:
        """Open a project file"""
        if not self._window:
            return {"success": False, "error": "Window not initialized"}

        file_types = ("HeTangAI Project (*.htai)",)
        result = self._window.create_file_dialog(
            webview.FileDialog.OPEN,
            allow_multiple=False,
            file_types=file_types,
        )

        if not result or len(result) == 0:
            return {"success": False, "error": "No file selected"}

        file_path = Path(result[0])
        logger.info(f"Opening project: {file_path}")

        try:
            with open(file_path, "r", encoding="utf-8") as f:
                self.project_data = json.load(f)
            self.project_path = file_path

            # Backward compatibility: migrate old format to new format
            for shot in self.project_data.get("shots", []):
                if "dialogues" not in shot or not shot["dialogues"]:
                    if shot.get("script") and shot.get("voiceActor"):
                        shot["dialogues"] = [{"role": shot["voiceActor"], "text": shot["script"]}]
                        logger.info(f"Migrated shot {shot.get('id')} to new dialogue format")

            self._ensure_prompt_prefixes(self.project_data)
            if "scenes" not in self.project_data or not isinstance(self.project_data.get("scenes"), list):
                self.project_data["scenes"] = []

            return {"success": True, "data": self.project_data, "path": str(file_path)}
        except Exception as e:
            logger.error(f"Failed to open project: {e}")
            return {"success": False, "error": str(e)}

    def save_project(self) -> dict:
        """Save project to current path or work directory"""
        if not self.project_data:
            return {"success": False, "error": "No project data"}

        # If project has a name but no path, save to work directory
        if not self.project_path and self.project_name:
            return self.save_project_to_workdir(self.project_name)

        # If no path and no name, save to work directory with project data name
        if not self.project_path:
            return self.save_project_to_workdir()

        return self._save_to_path(self.project_path)

    def save_project_as(self) -> dict:
        """Save project to a new path"""
        if not self._window:
            return {"success": False, "error": "Window not initialized"}

        if not self.project_data:
            return {"success": False, "error": "No project data"}

        result = self._window.create_file_dialog(
            webview.FileDialog.SAVE,
            save_filename=f"{self.project_data.get('name', 'project')}.htai",
            file_types=("HeTangAI Project (*.htai)",),
        )

        if not result:
            return {"success": False, "error": "No file selected"}

        file_path = Path(result)
        if not file_path.suffix:
            file_path = file_path.with_suffix(".htai")

        return self._save_to_path(file_path)

    def _save_to_path(self, file_path: Path) -> dict:
        """Internal: save project data to specified path"""
        try:
            self.project_data["updatedAt"] = datetime.now().isoformat()
            with open(file_path, "w", encoding="utf-8") as f:
                json.dump(self.project_data, f, ensure_ascii=False, indent=2)
            self.project_path = file_path
            logger.info(f"Project saved to: {file_path}")
            return {"success": True, "path": str(file_path)}
        except Exception as e:
            logger.error(f"Failed to save project: {e}")
            return {"success": False, "error": str(e)}

    def get_project_data(self) -> dict:
        """Get current project data"""
        return {
            "success": True,
            "data": self.project_data,
            "path": str(self.project_path) if self.project_path else None,
            "name": self.project_name,
        }

    def update_project_name(self, name: str) -> dict:
        """Update project name"""
        if not self.project_data:
            return {"success": False, "error": "No project data"}
        self.project_data["name"] = name
        return {"success": True}

    # ========== Import/Export ==========

    def import_jsonl(self) -> dict:
        """Import shots from JSONL file"""
        if not self._window:
            return {"success": False, "error": "Window not initialized"}
        file_types = ("JSONL Files (*.jsonl)",)
        result = self._window.create_file_dialog(
            webview.FileDialog.OPEN,
            allow_multiple=False,
            file_types=file_types,
        )

        if not result or len(result) == 0:
            return {"success": False, "error": "No file selected"}

        file_path = Path(result[0])
        logger.info(f"Importing from: {file_path}")

        try:
            from services.jsonl_parser import JsonlParser

            parser = JsonlParser()
            shots, characters, errors = parser.parse(file_path)

            if not self.project_data:
                self.new_project()

            # Add shots to project
            self.project_data["shots"].extend(shots)

            # Add new characters (avoid duplicates)
            existing_names = {c["name"] for c in self.project_data["characters"]}
            for char_name in characters:
                if char_name not in existing_names:
                    self.project_data["characters"].append({
                        "id": f"char_{uuid.uuid4().hex[:8]}",
                        "name": char_name,
                        "description": "",
                        "imageUrl": "",
                        "status": "pending",
                    })
                    existing_names.add(char_name)

            return {
                "success": True,
                "count": len(shots),
                "characters": list(characters),
                "errors": errors,
                "data": self.project_data,
            }
        except Exception as e:
            logger.error(f"Failed to import: {e}")
            return {"success": False, "error": str(e), "errors": [str(e)]}

    def export_jsonl_template(self) -> dict:
        """Export JSONL template file"""
        if not self._window:
            return {"success": False, "error": "Window not initialized"}

        result = self._window.create_file_dialog(
            webview.FileDialog.SAVE,
            save_filename="template.jsonl",
            file_types=("JSONL Files (*.jsonl)",),
        )

        if not result:
            return {"success": False, "error": "No file selected"}

        try:
            from services.jsonl_parser import JsonlParser

            parser = JsonlParser()
            parser.export_template(Path(result))
            logger.info(f"JSONL template exported to: {result}")
            return {"success": True, "path": result}
        except Exception as e:
            logger.error(f"Failed to export JSONL template: {e}")
            return {"success": False, "error": str(e)}

    def import_excel(self) -> dict:
        """Import shots from Excel file"""
        if not self._window:
            return {"success": False, "error": "Window not initialized"}
        file_types = ("Excel Files (*.xlsx;*.xls)", "CSV Files (*.csv)")
        result = self._window.create_file_dialog(
            webview.FileDialog.OPEN,
            allow_multiple=False,
            file_types=file_types,
        )

        if not result or len(result) == 0:
            return {"success": False, "error": "No file selected"}

        file_path = Path(result[0])
        logger.info(f"Importing Excel from: {file_path}")

        try:
            from services.excel_parser import ExcelParser

            parser = ExcelParser()
            shots, characters, errors = parser.parse(file_path)

            if not self.project_data:
                self.new_project()

            # Add shots to project
            self.project_data["shots"].extend(shots)

            # Add new characters (avoid duplicates)
            existing_names = {c["name"] for c in self.project_data["characters"]}
            for char_name in characters:
                if char_name not in existing_names:
                    self.project_data["characters"].append({
                        "id": f"char_{uuid.uuid4().hex[:8]}",
                        "name": char_name,
                        "description": "",
                        "imageUrl": "",
                        "status": "pending",
                    })
                    existing_names.add(char_name)

            return {
                "success": True,
                "count": len(shots),
                "characters": list(characters),
                "errors": errors,
                "data": self.project_data,
            }
        except Exception as e:
            logger.error(f"Failed to import Excel: {e}")
            return {"success": False, "error": str(e), "errors": [str(e)]}

    def export_excel_template(self) -> dict:
        """Export Excel template file"""
        if not self._window:
            return {"success": False, "error": "Window not initialized"}

        result = self._window.create_file_dialog(
            webview.FileDialog.SAVE,
            save_filename="template.xlsx",
            file_types=("Excel Files (*.xlsx)",),
        )

        if not result:
            return {"success": False, "error": "No file selected"}

        try:
            from services.excel_parser import ExcelParser

            parser = ExcelParser()
            parser.export_template(Path(result))
            logger.info(f"Excel template exported to: {result}")
            return {"success": True, "path": result}
        except Exception as e:
            logger.error(f"Failed to export Excel template: {e}")
            return {"success": False, "error": str(e)}

    # ========== Character Management ==========

    def add_character(self, name: str, description: str = "") -> dict:
        """Add a new character"""
        if not self.project_data:
            return {"success": False, "error": "No project data"}

        character = {
            "id": f"char_{uuid.uuid4().hex[:8]}",
            "name": name,
            "description": description,
            "imageUrl": "",
            "speed": 1.0,
            "isNarrator": False,
            "status": "pending",
        }
        self.project_data["characters"].append(character)
        logger.info(f"Added character: {name}")
        return {"success": True, "character": character}

    def update_character(self, character_id: str, name: str, description: str) -> dict:
        """Update character info"""
        if not self.project_data:
            return {"success": False, "error": "No project data"}

        for char in self.project_data["characters"]:
            if char["id"] == character_id:
                char["name"] = name
                char["description"] = description
                logger.info(f"Updated character: {character_id}")
                return {"success": True, "character": char}

        return {"success": False, "error": "Character not found"}

    def update_character_speed(self, character_id: str, speed: float) -> dict:
        """Update character voice speed"""
        if not self.project_data:
            return {"success": False, "error": "No project data"}

        for char in self.project_data["characters"]:
            if char["id"] == character_id:
                char["speed"] = speed
                logger.info(f"Updated character speed: {character_id} -> {speed}x")
                return {"success": True, "character": char}

        return {"success": False, "error": "Character not found"}

    def delete_character(self, character_id: str) -> dict:
        """Delete a character"""
        if not self.project_data:
            return {"success": False, "error": "No project data"}

        # Prevent deleting narrator
        for char in self.project_data["characters"]:
            if char["id"] == character_id and char.get("isNarrator", False):
                return {"success": False, "error": "Cannot delete narrator character"}

        original_len = len(self.project_data["characters"])
        self.project_data["characters"] = [
            c for c in self.project_data["characters"] if c["id"] != character_id
        ]

        if len(self.project_data["characters"]) < original_len:
            logger.info(f"Deleted character: {character_id}")
            return {"success": True}

        return {"success": False, "error": "Character not found"}

    def generate_character_image(self, character_id: str) -> dict:
        """Generate 3-view character image (async via task system)"""
        if not self.project_data:
            return {"success": False, "error": "No project data"}

        if not self._task_manager:
            return {"success": False, "error": "Task system not initialized"}

        for char in self.project_data["characters"]:
            if char["id"] == character_id:
                try:
                    # Get settings
                    settings = self._load_settings()
                    tti_config = settings.get("tti", {})
                    provider = tti_config.get("provider", "openai")

                    # Require project to be saved before generating images
                    if not self.project_name:
                        raise ValueError("Please save the project first before generating character images")

                    # Build professional 3-view character design prompt
                    character_desc = char.get('description', '').strip()
                    prefix_config = (self.project_data or {}).get("promptPrefixes", {})
                    character_prefix = str(prefix_config.get("characterPrefix", "")).strip()
                    base_desc = character_desc if character_desc else char['name']
                    if character_prefix:
                        base_desc = f"{character_prefix} {base_desc}".strip()

                    # Get style info
                    style_info = self._get_style_info()
                    style_text = style_info.get("text", "")

                    prompt_template = """
专业角色设计参考图，标准四宫格构图，纯白背景。

四宫格布局（2x2）：
- 左上：面部特写（标注"特写"）
- 右上：正面全身（标注"正面"）
- 左下：右侧面全身（标注"侧面"）
- 右下：背面全身（标注"背面"）

要求：
- 每张图片左上角用简洁文字标注视角类型
- 同一角色四个视角：面容/服装/体型完全一致
- 全身图自然站立姿态，双臂下垂，双脚并拢
- 角色占区域高度85%，头脚留白，不裁切
- 电影级超高清画质，光影真实，细节精细
{style_requirement}

角色描述：
{character_desc}
"""

                    style_requirement = f"画面风格：{style_text}" if style_text else "默认：写实真人风格，亚洲面孔，主角级精致外貌（除非另有说明）"
                    prompt = prompt_template.format(character_desc=base_desc, style_requirement=style_requirement)

                    # Get output dir for character images
                    image_path = self._project_manager.get_character_image_path(
                        self.project_name, character_id
                    )
                    output_dir = str(image_path.parent)

                    # Create image task
                    task_id = self._task_manager.create_image_task(
                        subtype='text2image',
                        prompt=prompt,
                        aspect_ratio='16:9',
                        provider=provider,
                        project_id=self._get_project_id(),
                        output_dir=output_dir,
                    )

                    # Update character state
                    char["status"] = "generating"
                    char["imageTaskId"] = task_id

                    logger.info(f"Created character image task for {character_id}: {task_id}")
                    return {"success": True, "task_id": task_id, "character": char}

                except Exception as e:
                    char["status"] = "error"
                    char["errorMessage"] = str(e)
                    logger.error(f"Failed to create character image task: {e}")
                    return {"success": False, "error": str(e)}

        return {"success": False, "error": "Character not found"}

    def generate_characters_batch(self, character_ids: list) -> dict:
        """Generate images for multiple characters (async via task system)"""
        task_ids = []
        errors = []
        
        for char_id in character_ids:
            result = self.generate_character_image(char_id)
            if result.get("success"):
                task_ids.append(result.get("task_id"))
            else:
                errors.append({"character_id": char_id, "error": result.get("error")})
        
        return {
            "success": True,
            "task_ids": task_ids,
            "errors": errors,
            "message": f"Created {len(task_ids)} character image tasks"
        }

    def upload_character_image(self, character_id: str) -> dict:
        """Upload character image from file"""
        if not self._window:
            return {"success": False, "error": "Window not initialized"}

        if not self.project_data:
            return {"success": False, "error": "No project data"}

        # Open file dialog
        file_types = ("Image Files (*.png;*.jpg;*.jpeg;*.webp)",)
        result = self._window.create_file_dialog(
            webview.FileDialog.OPEN,
            allow_multiple=False,
            file_types=file_types,
        )

        if not result or len(result) == 0:
            return {"success": False, "error": "No file selected"}

        try:
            import shutil

            # Require project to be saved before uploading images
            if not self.project_name:
                return {"success": False, "error": "Please save the project first before uploading character images"}

            source_path = Path(result[0])
            # Copy to project directory
            output_path = self._project_manager.get_character_image_path(
                self.project_name, character_id
            )
            output_path.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(source_path, output_path)

            # Update character
            for char in self.project_data["characters"]:
                if char["id"] == character_id:
                    # Convert to HTTP URL for frontend with cache-busting timestamp
                    import time
                    timestamp = int(time.time() * 1000)  # milliseconds timestamp
                    char["imageUrl"] = f"{self._path_to_url(str(output_path))}?t={timestamp}"
                    char["imageSourceUrl"] = ""
                    char["status"] = "ready"
                    logger.info(f"Uploaded character image for {character_id}")
                    return {"success": True, "imageUrl": char["imageUrl"], "character": char}

            return {"success": False, "error": "Character not found"}

        except Exception as e:
            logger.error(f"Failed to upload character image: {e}")
            return {"success": False, "error": str(e)}

    # ========== Scene Management ==========

    def add_scene(self, name: str, prompt: str = "") -> dict:
        """Add a new scene"""
        if not self.project_data:
            return {"success": False, "error": "No project data"}

        scene = {
            "id": f"scene_{uuid.uuid4().hex[:8]}",
            "name": name,
            "prompt": prompt,
            "imageUrl": "",
            "status": "pending",
        }
        self.project_data.setdefault("scenes", []).append(scene)
        logger.info(f"Added scene: {name}")
        return {"success": True, "scene": scene}

    def update_scene(self, scene_id: str, name: str, prompt: str) -> dict:
        """Update scene info"""
        if not self.project_data:
            return {"success": False, "error": "No project data"}

        for scene in self.project_data.get("scenes", []):
            if scene["id"] == scene_id:
                scene["name"] = name
                scene["prompt"] = prompt
                logger.info(f"Updated scene: {scene_id}")
                return {"success": True, "scene": scene}

        return {"success": False, "error": "Scene not found"}

    def delete_scene(self, scene_id: str) -> dict:
        """Delete a scene"""
        if not self.project_data:
            return {"success": False, "error": "No project data"}

        original_len = len(self.project_data.get("scenes", []))
        self.project_data["scenes"] = [
            s for s in self.project_data.get("scenes", []) if s["id"] != scene_id
        ]

        if len(self.project_data["scenes"]) < original_len:
            logger.info(f"Deleted scene: {scene_id}")
            return {"success": True}

        return {"success": False, "error": "Scene not found"}

    def generate_scene_image(self, scene_id: str) -> dict:
        """Generate scene image (async via task system)"""
        if not self.project_data:
            return {"success": False, "error": "No project data"}

        if not self._task_manager:
            return {"success": False, "error": "Task system not initialized"}

        for scene in self.project_data.get("scenes", []):
            if scene["id"] == scene_id:
                try:
                    settings = self._load_settings()
                    tti_config = settings.get("tti", {})
                    provider = tti_config.get("provider", "openai")

                    if not self.project_name:
                        raise ValueError("Please save the project first before generating scene images")

                    scene_prompt = str(scene.get("prompt", "")).strip()
                    base_prompt = scene_prompt or scene.get("name", "")

                    # Get style info and enhance prompt
                    style_info = self._get_style_info()
                    style_text = style_info.get("text", "")
                    if style_text:
                        prompt = f"{base_prompt}\n\n画面风格：{style_text}"
                    else:
                        prompt = base_prompt

                    # Get output dir for scene images
                    image_path = self._project_manager.get_scene_image_path(
                        self.project_name, scene_id
                    )
                    output_dir = str(image_path.parent)
                    Path(output_dir).mkdir(parents=True, exist_ok=True)

                    # Create image task
                    task_id = self._task_manager.create_image_task(
                        subtype='text2image',
                        prompt=prompt,
                        aspect_ratio='16:9',
                        provider=provider,
                        project_id=self._get_project_id(),
                        output_dir=output_dir,
                    )

                    # Update scene state
                    scene["status"] = "generating"
                    scene["imageTaskId"] = task_id

                    logger.info(f"Created scene image task for {scene_id}: {task_id}")
                    return {"success": True, "task_id": task_id, "scene": scene}

                except Exception as e:
                    scene["status"] = "error"
                    scene["errorMessage"] = str(e)
                    logger.error(f"Failed to create scene image task: {e}")
                    return {"success": False, "error": str(e)}

        return {"success": False, "error": "Scene not found"}

    def upload_scene_image(self, scene_id: str) -> dict:
        """Upload scene image from file"""
        if not self._window:
            return {"success": False, "error": "Window not initialized"}

        if not self.project_data:
            return {"success": False, "error": "No project data"}

        file_types = ("Image Files (*.png;*.jpg;*.jpeg;*.webp)",)
        result = self._window.create_file_dialog(
            webview.FileDialog.OPEN,
            allow_multiple=False,
            file_types=file_types,
        )

        if not result or len(result) == 0:
            return {"success": False, "error": "No file selected"}

        try:
            import shutil
            import time

            if not self.project_name:
                return {"success": False, "error": "Please save the project first before uploading scene images"}

            source_path = Path(result[0])
            output_path = self._project_manager.get_scene_image_path(
                self.project_name, scene_id
            )
            output_path.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(source_path, output_path)

            for scene in self.project_data.get("scenes", []):
                if scene["id"] == scene_id:
                    timestamp = int(time.time() * 1000)
                    scene["imageUrl"] = f"{self._path_to_url(str(output_path))}?t={timestamp}"
                    scene["imageSourceUrl"] = ""
                    scene["status"] = "ready"
                    logger.info(f"Uploaded scene image for {scene_id}")
                    return {"success": True, "imageUrl": scene["imageUrl"], "scene": scene}

            return {"success": False, "error": "Scene not found"}

        except Exception as e:
            logger.error(f"Failed to upload scene image: {e}")
            return {"success": False, "error": str(e)}

    # ========== Shot Builder One-Click Import ==========

    def _build_character_description_from_role(self, role: dict) -> str:
        parts = []
        dna = role.get("dna", "")
        if dna:
            parts.append(f"DNA: {dna}")
        tti = role.get("tti") or {}
        for label, key in [
            ("提示词", "prompt"),
            ("服装", "attire"),
            ("体型", "physique"),
            ("表情", "expression"),
            ("风格", "style"),
        ]:
            value = str(tti.get(key, "")).strip()
            if value:
                parts.append(f"{label}: {value}")
        return "\n".join(parts).strip()

    def _build_scene_prompt_from_scene(self, scene: dict) -> str:
        parts = []
        tti = scene.get("tti") or {}
        for label, key in [
            ("环境", "environment"),
            ("建筑", "architecture"),
            ("道具", "props"),
            ("光线", "lighting"),
            ("氛围", "atmosphere"),
            ("风格", "style"),
        ]:
            value = str(tti.get(key, "")).strip()
            if value:
                parts.append(f"{label}: {value}")
        return "\n".join(parts).strip()

    def import_shot_builder_roles(self, strategy: str | None = None) -> dict:
        try:
            if not self.project_data:
                return {"success": False, "error": "No project data"}

            output_dir = self._get_shot_builder_output_dir()
            roles_path = output_dir / "roles.jsonl"
            if not roles_path.exists():
                return {"success": False, "error": "roles.jsonl 不存在"}

            from services.shots import Role

            roles = []
            with open(roles_path, "r", encoding="utf-8") as f:
                for line in f:
                    line = line.strip()
                    if not line:
                        continue
                    try:
                        roles.append(Role.model_validate_json(line).model_dump())
                    except Exception:
                        continue

            existing_names = {c.get("name", "") for c in self.project_data.get("characters", [])}
            new_items = []
            conflicts = []
            for role in roles:
                role_id = role.get("id")
                stable_id = f"role_{role_id}" if role_id is not None else self._generate_role_id()
                role_name = role.get("name", "")
                if role_name in existing_names:
                    conflicts.append({"id": stable_id, "name": role_name})
                new_items.append({
                    "id": stable_id,
                    "name": role_name,
                    "description": self._build_character_description_from_role(role),
                    "imageUrl": "",
                    "speed": 1.0,
                    "isNarrator": False,
                    "status": "pending",
                })

            if conflicts and not strategy:
                return {"success": False, "conflicts": conflicts, "total": len(new_items)}

            if strategy == "cancel":
                return {"success": False, "error": "cancelled"}

            characters = self.project_data.get("characters", [])
            if strategy == "overwrite":
                by_name = {c.get("name", ""): c for c in characters}
                for item in new_items:
                    by_name[item["name"]] = item
                self.project_data["characters"] = list(by_name.values())
                return {"success": True, "importedCount": len(new_items), "overwrittenCount": len(conflicts)}

            if strategy == "skip":
                filtered = [item for item in new_items if item["name"] not in existing_names]
                self.project_data["characters"].extend(filtered)
                return {"success": True, "importedCount": len(filtered), "skippedCount": len(conflicts)}

            self.project_data["characters"].extend(new_items)
            return {"success": True, "importedCount": len(new_items)}

        except Exception as e:
            logger.error(f"Failed to import roles: {e}")
            return {"success": False, "error": str(e)}

    def import_shot_builder_scenes(self, strategy: str | None = None) -> dict:
        try:
            if not self.project_data:
                return {"success": False, "error": "No project data"}

            output_dir = self._get_shot_builder_output_dir()
            scenes_path = output_dir / "scenes.jsonl"
            if not scenes_path.exists():
                return {"success": False, "error": "scenes.jsonl 不存在"}

            from services.shots import Scene as ShotScene

            scenes = []
            with open(scenes_path, "r", encoding="utf-8") as f:
                for line in f:
                    line = line.strip()
                    if not line:
                        continue
                    try:
                        scenes.append(ShotScene.model_validate_json(line).model_dump())
                    except Exception:
                        continue

            existing = {s.get("id") for s in self.project_data.get("scenes", [])}
            new_items = []
            conflicts = []
            for scene in scenes:
                scene_id = scene.get("id")
                stable_id = f"scene_{scene_id}" if scene_id is not None else self._generate_scene_id()
                if stable_id in existing:
                    conflicts.append({"id": stable_id, "name": scene.get("name", "")})
                new_items.append({
                    "id": stable_id,
                    "name": scene.get("name", ""),
                    "prompt": self._build_scene_prompt_from_scene(scene),
                    "imageUrl": "",
                    "status": "pending",
                })

            if conflicts and not strategy:
                return {"success": False, "conflicts": conflicts, "total": len(new_items)}

            if strategy == "cancel":
                return {"success": False, "error": "cancelled"}

            scenes_list = self.project_data.get("scenes", [])
            if strategy == "overwrite":
                by_id = {s.get("id"): s for s in scenes_list}
                for item in new_items:
                    by_id[item["id"]] = item
                self.project_data["scenes"] = list(by_id.values())
                return {"success": True, "importedCount": len(new_items), "overwrittenCount": len(conflicts)}

            if strategy == "skip":
                filtered = [item for item in new_items if item["id"] not in existing]
                self.project_data["scenes"].extend(filtered)
                return {"success": True, "importedCount": len(filtered), "skippedCount": len(conflicts)}

            self.project_data["scenes"].extend(new_items)
            return {"success": True, "importedCount": len(new_items)}

        except Exception as e:
            logger.error(f"Failed to import scenes: {e}")
            return {"success": False, "error": str(e)}

    def import_shot_builder_shots(self, strategy: str | None = None) -> dict:
        try:
            if not self.project_data:
                return {"success": False, "error": "No project data"}

            output_dir = self._get_shot_builder_output_dir()
            shots_path = output_dir / "shots.jsonl"
            if not shots_path.exists():
                return {"success": False, "error": "shots.jsonl 不存在"}

            from services.jsonl_parser import JsonlParser

            parser = JsonlParser()
            new_items = []
            conflicts = []
            existing = {s.get("id") for s in self.project_data.get("shots", [])}

            with open(shots_path, "r", encoding="utf-8") as f:
                for line_num, line in enumerate(f, 1):
                    line = line.strip()
                    if not line:
                        continue
                    try:
                        obj = json.loads(line)
                        shot_data = parser._parse_jsonl_object(obj, line_num)
                        shot_number = obj.get("shot", line_num)
                        stable_id = f"sb_{shot_number}" if shot_number is not None else self._generate_shot_id()
                        shot_data["id"] = stable_id
                        shot_data["sequence"] = int(shot_number) if str(shot_number).isdigit() else line_num
                        if stable_id in existing:
                            conflicts.append({"id": stable_id, "name": shot_data.get("scene", "")})
                        new_items.append(shot_data)
                    except Exception:
                        continue

            if conflicts and not strategy:
                return {"success": False, "conflicts": conflicts, "total": len(new_items)}

            if strategy == "cancel":
                return {"success": False, "error": "cancelled"}

            shots_list = self.project_data.get("shots", [])
            if strategy == "overwrite":
                by_id = {s.get("id"): s for s in shots_list}
                for item in new_items:
                    by_id[item["id"]] = item
                self.project_data["shots"] = list(by_id.values())
                return {"success": True, "importedCount": len(new_items), "overwrittenCount": len(conflicts)}

            if strategy == "skip":
                filtered = [item for item in new_items if item["id"] not in existing]
                self.project_data["shots"].extend(filtered)
                return {"success": True, "importedCount": len(filtered), "skippedCount": len(conflicts)}

            self.project_data["shots"].extend(new_items)
            return {"success": True, "importedCount": len(new_items)}

        except Exception as e:
            logger.error(f"Failed to import shots: {e}")
            return {"success": False, "error": str(e)}

    def set_character_reference_audio(self, character_id: str, audio_path: str) -> dict:
        """Set reference audio for character"""
        if not self.project_data:
            return {"success": False, "error": "No project data"}

        for char in self.project_data["characters"]:
            if char["id"] == character_id:
                char["referenceAudioPath"] = audio_path
                logger.info(f"Set reference audio for {character_id}: {audio_path}")
                return {"success": True, "character": char}

        return {"success": False, "error": "Character not found"}

    def import_characters_from_text(self, text: str) -> dict:
        """Import characters from pasted text (tab or comma separated)

        Supports two formats:
        - 2 columns: character_name, description
        - 3 columns: character_name, reference_audio_path, description
        """
        if not self.project_data:
            return {"success": False, "error": "No project data", "characters": [], "errors": []}

        characters = []
        errors = []
        lines = text.strip().split("\n")
        non_empty_lines = [line.strip() for line in lines if line.strip()]
        existing_name_map = {c["name"]: c["id"] for c in self.project_data["characters"]}
        seen_names = set()

        # JSONL import support
        if non_empty_lines and all(line.lstrip().startswith("{") for line in non_empty_lines):
            characters, errors = self._parse_characters_from_jsonl_text("\n".join(non_empty_lines))
            logger.info(f"Parsed {len(characters)} characters from JSONL text, {len(errors)} errors")
            return {
                "success": True,
                "characters": characters,
                "errors": errors,
            }

        for line_num, line in enumerate(lines, 1):
            line = line.strip()
            if not line:
                continue

            # Try tab separator first, then comma
            if "\t" in line:
                parts = [p.strip() for p in line.split("\t")]
            else:
                parts = [p.strip() for p in line.split(",")]

            # Remove empty parts
            parts = [p for p in parts if p]

            if len(parts) < 2:
                errors.append(f"Line {line_num}: insufficient columns (need at least 2)")
                continue

            if len(parts) == 2:
                # Format: name, description
                name, description = parts[0], parts[1]
                reference_audio = ""
            elif len(parts) >= 3:
                # Format: name, reference_audio, description
                name, reference_audio, description = parts[0], parts[1], parts[2]
            else:
                errors.append(f"Line {line_num}: invalid format")
                continue

            if not name:
                errors.append(f"Line {line_num}: character name is empty")
                continue

            # Check for duplicate names in current import batch
            if name in seen_names:
                errors.append(f"Line {line_num}: duplicate character name '{name}' in import")
                continue

            existing_id = existing_name_map.get(name)
            character = {
                "id": f"char_{uuid.uuid4().hex[:8]}",
                "name": name,
                "description": description,
                "imageUrl": "",
                "referenceAudioPath": reference_audio,
                "speed": 1.0,
                "isNarrator": False,
                "status": "pending",
                "existingId": existing_id,
                "isDuplicate": existing_id is not None,
            }
            characters.append(character)
            seen_names.add(name)

        logger.info(f"Parsed {len(characters)} characters from text, {len(errors)} errors")
        return {
            "success": True,
            "characters": characters,
            "errors": errors,
        }

    def import_characters_from_file(self) -> dict:
        """Import characters from CSV/Excel file via file dialog

        Recognizes columns: character name, reference audio, description
        For Excel with multiple sheets, finds the sheet with matching columns
        """
        if not self._window:
            return {"success": False, "error": "Window not initialized", "characters": [], "errors": []}

        if not self.project_data:
            return {"success": False, "error": "No project data", "characters": [], "errors": []}

        file_types = ("Excel Files (*.xlsx)", "Excel Files (*.xls)", "CSV Files (*.csv)", "JSONL Files (*.jsonl)")
        result = self._window.create_file_dialog(
            webview.FileDialog.OPEN,
            allow_multiple=False,
            file_types=file_types,
        )

        if not result or len(result) == 0:
            return {"success": False, "error": "No file selected", "characters": [], "errors": []}

        file_path = Path(result[0])
        logger.info(f"Importing characters from: {file_path}")

        try:
            import pandas as pd

            characters = []
            errors = []

            # Read file based on extension
            if file_path.suffix.lower() == ".jsonl":
                jsonl_text = file_path.read_text(encoding="utf-8")
                characters, errors = self._parse_characters_from_jsonl_text(jsonl_text)
                logger.info(f"Parsed {len(characters)} characters from JSONL file, {len(errors)} errors")
                return {
                    "success": True,
                    "characters": characters,
                    "errors": errors,
                }
            if file_path.suffix.lower() == ".csv":
                df = pd.read_csv(file_path, encoding="utf-8")
            else:
                # Excel file - try to find the right sheet
                excel_file = pd.ExcelFile(file_path)
                df = None

                # Column name patterns to match (English and Chinese)
                name_patterns = ["name", "character", "role", "actor", "角色", "名称", "名字", "人物"]
                desc_patterns = ["desc", "description", "prompt", "detail", "描述", "提示词", "说明", "详情"]
                audio_patterns = ["audio", "voice", "reference", "sound", "音频", "参考音", "声音", "配音"]

                def find_matching_columns(dataframe):
                    """Find columns matching our patterns"""
                    name_col = None
                    desc_col = None
                    audio_col = None

                    for i, col in enumerate(dataframe.columns):
                        col_lower = str(col).lower()
                        col_str = str(col)
                        # Check both lowercase (for English) and original (for Chinese)
                        if any(p in col_lower or p in col_str for p in name_patterns) and name_col is None:
                            name_col = col
                        elif any(p in col_lower or p in col_str for p in desc_patterns) and desc_col is None:
                            desc_col = col
                        elif any(p in col_lower or p in col_str for p in audio_patterns) and audio_col is None:
                            audio_col = col

                    return name_col, desc_col, audio_col

                # Try to find sheet named "角色" first
                if "角色" in excel_file.sheet_names:
                    df = pd.read_excel(excel_file, sheet_name="角色")
                    logger.info("Found sheet named '角色'")
                else:
                    # Try each sheet to find one with matching columns
                    for sheet_name in excel_file.sheet_names:
                        sheet_df = pd.read_excel(excel_file, sheet_name=sheet_name)
                        name_col, desc_col, audio_col = find_matching_columns(sheet_df)

                        if name_col and desc_col:
                            df = sheet_df
                            logger.info(f"Found matching sheet: {sheet_name}")
                            break

                if df is None:
                    # Use first sheet if no matching columns found
                    df = pd.read_excel(excel_file, sheet_name=0)
                    logger.info("Using first sheet (no matching columns found)")

            # Find column mappings
            name_col = None
            desc_col = None
            audio_col = None

            name_patterns = ["name", "character", "role", "actor", "角色", "名称", "名字", "人物"]
            desc_patterns = ["desc", "description", "prompt", "detail", "描述", "提示词", "说明", "详情"]
            audio_patterns = ["audio", "voice", "reference", "sound", "音频", "参考音", "声音", "配音"]

            for col in df.columns:
                col_lower = str(col).lower()
                col_str = str(col)
                # Check both lowercase (for English) and original (for Chinese)
                if any(p in col_lower or p in col_str for p in name_patterns) and name_col is None:
                    name_col = col
                elif any(p in col_lower or p in col_str for p in desc_patterns) and desc_col is None:
                    desc_col = col
                elif any(p in col_lower or p in col_str for p in audio_patterns) and audio_col is None:
                    audio_col = col

            # Fallback to positional columns if no matches
            if name_col is None and len(df.columns) >= 1:
                name_col = df.columns[0]
            if desc_col is None and len(df.columns) >= 2:
                desc_col = df.columns[1]

            if name_col is None:
                return {"success": False, "error": "Cannot find character name column", "characters": [], "errors": []}

            logger.info(f"Column mapping - name: {name_col}, desc: {desc_col}, audio: {audio_col}")

            # Get existing character names
            existing_name_map = {c["name"]: c["id"] for c in self.project_data["characters"]}
            seen_names = set()

            # Process rows
            for idx, row in df.iterrows():
                row_num = idx + 2  # Excel row number (1-indexed + header)

                name = str(row.get(name_col, "")).strip() if pd.notna(row.get(name_col)) else ""
                description = str(row.get(desc_col, "")).strip() if desc_col and pd.notna(row.get(desc_col)) else ""
                reference_audio = str(row.get(audio_col, "")).strip() if audio_col and pd.notna(row.get(audio_col)) else ""

                if not name:
                    continue  # Skip empty rows

                if name in seen_names:
                    errors.append(f"Row {row_num}: duplicate character name '{name}' in import")
                    continue

                existing_id = existing_name_map.get(name)
                character = {
                    "id": f"char_{uuid.uuid4().hex[:8]}",
                    "name": name,
                    "description": description,
                    "imageUrl": "",
                    "referenceAudioPath": reference_audio,
                    "speed": 1.0,
                    "isNarrator": False,
                    "status": "pending",
                    "existingId": existing_id,
                    "isDuplicate": existing_id is not None,
                }
                characters.append(character)
                seen_names.add(name)

            logger.info(f"Parsed {len(characters)} characters from file, {len(errors)} errors")
            return {
                "success": True,
                "characters": characters,
                "errors": errors,
            }

        except Exception as e:
            logger.error(f"Failed to import characters from file: {e}")
            return {"success": False, "error": str(e), "characters": [], "errors": []}

    def _build_character_description_from_json(self, obj: dict) -> str:
        """Build character description from JSONL fields (TTI only)"""
        if not isinstance(obj, dict):
            return ""

        parts = []

        tti = obj.get("tti")
        if isinstance(tti, dict):
            tti_parts = []
            for key in ("prompt", "attire", "physique", "expression", "style"):
                value = tti.get(key)
                if value:
                    tti_parts.append(f"{key}: {value}")
            if tti_parts:
                parts.append("tti: " + "; ".join(tti_parts))

        return "; ".join([p for p in parts if p]).strip()

    def _parse_characters_from_jsonl_text(self, text: str) -> tuple[list, list]:
        """Parse JSONL text into character objects"""
        if not self.project_data:
            return [], ["No project data"]

        characters = []
        errors = []
        existing_name_map = {c["name"]: c["id"] for c in self.project_data["characters"]}
        seen_names = set()

        for line_num, line in enumerate(text.splitlines(), 1):
            line = line.strip()
            if not line:
                continue

            try:
                obj = json.loads(line)
            except json.JSONDecodeError as e:
                errors.append(f"Line {line_num}: Invalid JSON - {str(e)}")
                continue
            except Exception as e:
                errors.append(f"Line {line_num}: {str(e)}")
                continue

            name = str(obj.get("name", "")).strip()
            if not name:
                errors.append(f"Line {line_num}: character name is empty")
                continue

            if name in seen_names:
                errors.append(f"Line {line_num}: duplicate character name '{name}' in import")
                continue

            description = self._build_character_description_from_json(obj)
            if not description:
                description = name

            reference_audio = ""
            for key in ("referenceAudioPath", "reference_audio", "referenceAudio", "audio", "reference"):
                value = obj.get(key)
                if isinstance(value, str) and value.strip():
                    reference_audio = value.strip()
                    break

            existing_id = existing_name_map.get(name)
            character = {
                "id": f"char_{uuid.uuid4().hex[:8]}",
                "name": name,
                "description": description,
                "imageUrl": "",
                "referenceAudioPath": reference_audio,
                "speed": 1.0,
                "isNarrator": False,
                "status": "pending",
                "existingId": existing_id,
                "isDuplicate": existing_id is not None,
            }
            characters.append(character)
            seen_names.add(name)

        return characters, errors

    def confirm_import_characters(self, characters: list) -> dict:
        """Confirm and add imported characters to project"""
        if not self.project_data:
            return {"success": False, "error": "No project data"}

        added_count = 0
        for char_data in characters:
            # Ensure required fields
            character = {
                "id": char_data.get("id", f"char_{uuid.uuid4().hex[:8]}"),
                "name": char_data.get("name", ""),
                "description": char_data.get("description", ""),
                "imageUrl": char_data.get("imageUrl", ""),
                "referenceAudioPath": char_data.get("referenceAudioPath", ""),
                "speed": char_data.get("speed", 1.0),
                "isNarrator": char_data.get("isNarrator", False),
                "status": char_data.get("status", "pending"),
            }

            if character["name"]:
                self.project_data["characters"].append(character)
                added_count += 1

        logger.info(f"Added {added_count} characters to project")
        return {"success": True, "addedCount": added_count}

    def export_character_template(self) -> dict:
        """Export character template Excel file"""
        if not self._window:
            return {"success": False, "error": "Window not initialized"}

        result = self._window.create_file_dialog(
            webview.FileDialog.SAVE,
            save_filename="角色模板.xlsx",
            file_types=("Excel Files (*.xlsx)",),
        )

        if not result:
            return {"success": False, "error": "No file selected"}

        try:
            import pandas as pd

            # Create template data with Chinese column names
            template_data = {
                "角色": ["示例角色1", "示例角色2"],
                "提示词": [
                    "年轻女性，长黑发，穿白色连衣裙",
                    "中年男性，短发，穿西装",
                ],
                "参考音": ["/path/to/audio1.wav", "/path/to/audio2.wav"],
            }

            df = pd.DataFrame(template_data)
            # Write with sheet name "角色"
            with pd.ExcelWriter(result, engine="openpyxl") as writer:
                df.to_excel(writer, sheet_name="角色", index=False)

            logger.info(f"Character template exported to: {result}")
            return {"success": True, "path": result}

        except Exception as e:
            logger.error(f"Failed to export character template: {e}")
            return {"success": False, "error": str(e)}

    # ========== Shot Management ==========

    def update_shot(self, shot_id: str, field: str, value: Any) -> dict:
        """Update a single shot field"""
        if not self.project_data:
            return {"success": False, "error": "No project data"}

        for shot in self.project_data["shots"]:
            if shot["id"] == shot_id:
                # Special handling for dialogues field
                if field == "dialogues":
                    shot["dialogues"] = value

                    # Update the script field to reflect all dialogues
                    script_parts = []
                    for dialogue in value:
                        if isinstance(dialogue, dict) and "role" in dialogue and "text" in dialogue:
                            script_parts.append(f"{dialogue['role']}: {dialogue['text']}")
                    shot["script"] = "\n".join(script_parts)

                    # Update characters list to include all characters from dialogues
                    dialogue_characters = {d["role"] for d in value if isinstance(d, dict) and "role" in d}
                    shot["characters"] = list(set(shot.get("characters", [])).union(dialogue_characters))

                    # Update voiceActor to first dialogue role for backward compatibility
                    if value and isinstance(value, list) and len(value) > 0:
                        first_dialogue = value[0]
                        if isinstance(first_dialogue, dict) and "role" in first_dialogue:
                            shot["voiceActor"] = first_dialogue["role"]
                else:
                    shot[field] = value

                logger.debug(f"Updated shot {shot_id}.{field}")
                return {"success": True, "shot": shot}

        return {"success": False, "error": "Shot not found"}

    def delete_shots(self, shot_ids: list) -> dict:
        """Delete multiple shots"""
        if not self.project_data:
            return {"success": False, "error": "No project data"}

        id_set = set(shot_ids)
        original_len = len(self.project_data["shots"])
        self.project_data["shots"] = [
            s for s in self.project_data["shots"] if s["id"] not in id_set
        ]

        deleted_count = original_len - len(self.project_data["shots"])
        logger.info(f"Deleted {deleted_count} shots")
        return {"success": True, "deletedCount": deleted_count}

    def insert_shot(self, after_shot_id: str = None) -> dict:
        """Insert a new empty shot after the specified shot (or at the beginning if None)"""
        if not self.project_data:
            return {"success": False, "error": "No project data"}

        # Create new shot with default values
        new_shot = {
            "id": self._generate_shot_id(),
            "sequence": 0,
            "voiceActor": "",
            "characters": [],
            "emotion": "",
            "intensity": "",
            "script": "",
            "imagePrompt": "",
            "videoPrompt": "",
            "images": [],
            "selectedImageIndex": 0,
            "videos": [],
            "selectedVideoIndex": 0,
            "videoUrl": "",
            "audioUrl": "",
            "status": "pending",
        }

        # Find insertion position
        if after_shot_id is None:
            # Insert at the beginning
            insert_index = 0
        else:
            # Find the shot to insert after
            insert_index = None
            for i, shot in enumerate(self.project_data["shots"]):
                if shot["id"] == after_shot_id:
                    insert_index = i + 1
                    break

            if insert_index is None:
                return {"success": False, "error": "Shot not found"}

        # Insert the new shot
        self.project_data["shots"].insert(insert_index, new_shot)

        # Update sequence numbers for all shots
        for i, shot in enumerate(self.project_data["shots"]):
            shot["sequence"] = i + 1

        logger.info(f"Inserted new shot at position {insert_index + 1}")
        return {"success": True, "shot": new_shot, "index": insert_index, "shots": self.project_data["shots"]}

    def select_image(self, shot_id: str, image_index: int) -> dict:
        """Select which image to use for a shot"""
        if not self.project_data:
            return {"success": False, "error": "No project data"}

        for shot in self.project_data["shots"]:
            if shot["id"] == shot_id:
                if 0 <= image_index < len(shot.get("images", [])):
                    shot["selectedImageIndex"] = image_index
                    logger.debug(f"Shot {shot_id} selected image {image_index}")
                    return {"success": True}
                return {"success": False, "error": "Invalid image index"}

        return {"success": False, "error": "Shot not found"}

    def select_video(self, shot_id: str, video_index: int) -> dict:
        """Select which video to use for a shot"""
        if not self.project_data:
            return {"success": False, "error": "No project data"}

        for shot in self.project_data["shots"]:
            if shot["id"] == shot_id:
                videos = shot.get("videos", [])
                if 0 <= video_index < len(videos):
                    shot["selectedVideoIndex"] = video_index
                    shot["videoUrl"] = videos[video_index]
                    logger.debug(f"Shot {shot_id} selected video {video_index}")
                    return {"success": True}
                return {"success": False, "error": "Invalid video index"}

        return {"success": False, "error": "Shot not found"}

    def delete_shot_image(self, shot_id: str, image_index: int) -> dict:
        """Delete a specific image from a shot (keeps position, sets to empty)"""
        if not self.project_data:
            return {"success": False, "error": "No project data"}

        for shot in self.project_data["shots"]:
            if shot["id"] == shot_id:
                images = shot.get("images", [])
                if not (0 <= image_index < len(images)):
                    return {"success": False, "error": "Invalid image index"}

                # Get file path and delete file
                local_paths = shot.get("_localImagePaths", [])
                if image_index < len(local_paths) and local_paths[image_index]:
                    file_path = Path(local_paths[image_index])
                    if file_path.exists():
                        try:
                            file_path.unlink()
                            logger.info(f"Deleted image file: {file_path}")
                        except Exception as e:
                            logger.warning(f"Failed to delete image file: {e}")

                # Set to empty string instead of removing (keep position)
                shot["images"][image_index] = ""
                if "imageSourceUrls" in shot and image_index < len(shot["imageSourceUrls"]):
                    shot["imageSourceUrls"][image_index] = ""
                if "imageMediaGenerationIds" in shot and image_index < len(shot["imageMediaGenerationIds"]):
                    shot["imageMediaGenerationIds"][image_index] = ""
                if "_localImagePaths" in shot and image_index < len(shot["_localImagePaths"]):
                    shot["_localImagePaths"][image_index] = ""

                # If deleted the selected image, find next available
                if shot.get("selectedImageIndex", 0) == image_index:
                    # Find first non-empty image
                    new_idx = -1
                    for i, img in enumerate(shot["images"]):
                        if img:
                            new_idx = i
                            break
                    shot["selectedImageIndex"] = new_idx if new_idx >= 0 else 0

                # Update status if no images left
                if not any(shot["images"]):
                    shot["status"] = "pending"

                logger.info(f"Deleted image at position {image_index} from shot {shot_id}")
                return {"success": True, "shot": shot}

        return {"success": False, "error": "Shot not found"}

    def delete_shot_video(self, shot_id: str, video_index: int) -> dict:
        """Delete a specific video from a shot (keeps position, sets to empty)"""
        if not self.project_data:
            return {"success": False, "error": "No project data"}

        for shot in self.project_data["shots"]:
            if shot["id"] == shot_id:
                videos = shot.get("videos", [])
                if not (0 <= video_index < len(videos)):
                    return {"success": False, "error": "Invalid video index"}

                # Get file path from URL and delete file
                video_url = videos[video_index]
                if video_url:
                    from urllib.parse import urlparse, unquote
                    parsed = urlparse(video_url)
                    file_path = Path(unquote(parsed.path))
                    if file_path.exists():
                        try:
                            file_path.unlink()
                            logger.info(f"Deleted video file: {file_path}")
                        except Exception as e:
                            logger.warning(f"Failed to delete video file: {e}")

                # Set to empty string instead of removing (keep position)
                shot["videos"][video_index] = ""

                # If deleted the selected video, find next available
                if shot.get("selectedVideoIndex", 0) == video_index:
                    # Find first non-empty video
                    new_idx = -1
                    for i, vid in enumerate(shot["videos"]):
                        if vid:
                            new_idx = i
                            break
                    shot["selectedVideoIndex"] = new_idx if new_idx >= 0 else 0
                    shot["videoUrl"] = shot["videos"][new_idx] if new_idx >= 0 else ""
                
                # Update status if no videos left
                if not any(shot["videos"]):
                    shot["videoUrl"] = ""
                    if shot.get("status") == "completed":
                        shot["status"] = "images_ready" if any(shot.get("images", [])) else "pending"

                logger.info(f"Deleted video at position {video_index} from shot {shot_id}")
                return {"success": True, "shot": shot}

        return {"success": False, "error": "Shot not found"}

    # ========== Image Generation ==========

    def generate_images_for_shot(self, shot_id: str) -> dict:
        """Generate 4 images for a single shot using character references"""
        if not self.project_data:
            return {"success": False, "error": "No project data"}

        for shot in self.project_data["shots"]:
            if shot["id"] == shot_id:
                try:
                    import asyncio
                    import time

                    shot["status"] = "generating_images"

                    # Get settings
                    settings = self._load_settings()
                    tti_config = settings.get("tti", {})
                    provider = tti_config.get("provider", "openai")

                    # Require project to be saved before generating images
                    if not self.project_name:
                        raise ValueError("Please save the project first before generating shot images")

                    # Get character references for this shot
                    # Parse characters from imagePrompt instead of using shot["characters"]
                    image_prompt = shot.get("imagePrompt", "")
                    all_character_names = [c["name"] for c in self.project_data.get("characters", []) if c.get("name")]
                    
                    # Find which characters are mentioned in the prompt
                    shot_characters = []
                    for char_name in all_character_names:
                        if char_name and char_name in image_prompt:
                            shot_characters.append(char_name)

                    base_prompt = shot.get("imagePrompt", "")
                    prefix_config = (self.project_data or {}).get("promptPrefixes", {})
                    shot_image_prefix = str(prefix_config.get("shotImagePrefix", "")).strip()

                    # Get style info
                    style_info = self._get_style_info()
                    style_text = style_info.get("text", "")
                    style_image_path = style_info.get("imagePath")

                    # Build prompt with prefix and style
                    prompt_parts = []
                    if shot_image_prefix:
                        prompt_parts.append(shot_image_prefix)
                    prompt_parts.append(base_prompt)
                    if style_text:
                        prompt_parts.append(f"\n\n画面风格：{style_text}")
                    prompt_with_prefix = " ".join(prompt_parts[:2]) + (prompt_parts[2] if len(prompt_parts) > 2 else "")

                    current_shot_id = shot["id"]

                    # Resolve scene reference for this shot
                    scene_name = str(shot.get("scene", "")).strip()
                    matched_scene = None
                    if scene_name:
                        for scene in self.project_data.get("scenes", []):
                            if scene.get("name") == scene_name:
                                matched_scene = scene
                                break

                    # Check which slots (1-4) are already occupied
                    existing_slots = []
                    for slot in range(1, 5):
                        slot_path = self._project_manager.get_shot_image_path(self.project_name, current_shot_id, slot)
                        if slot_path.exists():
                            existing_slots.append((slot, slot_path.stat().st_mtime))

                    # Sort by modification time (oldest first)
                    existing_slots.sort(key=lambda x: x[1])

                    # Determine which slots to use for new images
                    slots_to_use = []
                    if len(existing_slots) < 4:
                        occupied = {slot for slot, _ in existing_slots}
                        for slot in range(1, 5):
                            if slot not in occupied:
                                slots_to_use.append(slot)
                                if len(slots_to_use) == 4:
                                    break
                    else:
                        slots_to_use = [slot for slot, _ in existing_slots[:4]]

                    existing_source_urls = shot.get("imageSourceUrls", [])
                    existing_media_gen_ids = shot.get("imageMediaGenerationIds", [])
                    source_url_by_slot = {
                        slot: existing_source_urls[slot - 1]
                        for slot in range(1, 5)
                        if slot - 1 < len(existing_source_urls)
                    }
                    media_gen_id_by_slot = {
                        slot: existing_media_gen_ids[slot - 1]
                        for slot in range(1, 5)
                        if slot - 1 < len(existing_media_gen_ids)
                    }

                    image_local_paths = []
                    image_paths = []
                    first_new_slot = None

                    if provider == "whisk":
                        # Whisk mode
                        from services.whisk import Whisk

                        if not tti_config.get("whiskToken") or not tti_config.get("whiskWorkflowId"):
                            raise ValueError("Whisk Token and Workflow ID not configured in settings")

                        whisk = Whisk(
                            token=tti_config["whiskToken"],
                            workflow_id=tti_config["whiskWorkflowId"]
                        )

                        # Collect subject_ids from characters with imageMediaGenerationId
                        subject_ids = []
                        scene_ids = []
                        missing_characters = []
                        if shot_characters:
                            logger.info(f"Characters found in imagePrompt: {shot_characters}")
                            for char_name in shot_characters:
                                char_found = False
                                for char in self.project_data["characters"]:
                                    if char["name"] == char_name:
                                        char_found = True
                                        media_gen_id = char.get("imageMediaGenerationId", "")
                                        logger.info(
                                            f"Whisk character reference: name={char_name}, media_generation_id={media_gen_id or 'EMPTY'}"
                                        )
                                        if media_gen_id:
                                            subject_ids.append(media_gen_id)
                                            logger.info(f"Added character subject_id: {char_name} -> {media_gen_id}")
                                        else:
                                            missing_characters.append(char_name)
                                        break
                                if not char_found:
                                    missing_characters.append(char_name)

                            if missing_characters:
                                raise ValueError(f"Missing character images (need Whisk media_generation_id) for: {', '.join(missing_characters)}")
                            logger.info(f"Whisk subject_ids prepared: {len(subject_ids)}")

                        if matched_scene:
                            scene_media_id = matched_scene.get("imageMediaGenerationId", "")
                            if scene_media_id:
                                scene_ids.append(scene_media_id)
                                logger.info(f"Added scene reference: {matched_scene.get('name', '')} -> {scene_media_id}")
                            else:
                                logger.warning("Scene has no imageMediaGenerationId, cannot use as Whisk reference")

                        # Handle style image for Whisk
                        style_ids = []
                        if style_image_path and Path(style_image_path).exists():
                            # Check if we have a cached style media_generation_id
                            settings_data = self.project_data.get("settings", self._get_default_project_settings())
                            style_setting = settings_data.get("creationParams", {}).get("style", {})
                            cached_style_media_id = style_setting.get("whiskMediaGenerationId", "")

                            if cached_style_media_id:
                                style_ids.append(cached_style_media_id)
                                logger.info(f"Using cached style media_generation_id: {cached_style_media_id}")
                            else:
                                # Upload style image to get media_generation_id
                                whisk_cookie = tti_config.get("whiskCookie", "")
                                if whisk_cookie:
                                    try:
                                        uploaded_style_id = whisk.upload_image(
                                            style_image_path,
                                            media_category="MEDIA_CATEGORY_STYLE",
                                            cookie=whisk_cookie
                                        )
                                        style_ids.append(uploaded_style_id)
                                        # Cache the style media_generation_id
                                        if "settings" not in self.project_data:
                                            self.project_data["settings"] = self._get_default_project_settings()
                                        self.project_data["settings"]["creationParams"]["style"]["whiskMediaGenerationId"] = uploaded_style_id
                                        logger.info(f"Uploaded style image, media_generation_id: {uploaded_style_id}")
                                    except Exception as e:
                                        logger.warning(f"Failed to upload style image: {e}")
                                else:
                                    logger.warning("No whiskCookie configured, cannot upload style image")

                        # Generate 1 image using Whisk (user clicks multiple times to accumulate up to 4)
                        slot = slots_to_use[0] if slots_to_use else 1

                        if subject_ids or scene_ids or style_ids:
                            # Use generate_with_references for scene with characters/scene/style
                            whisk_image = whisk.generate_with_references(
                                prompt=prompt_with_prefix,
                                subject_ids=subject_ids,
                                scene_ids=scene_ids,
                                style_ids=style_ids,
                                aspect_ratio="IMAGE_ASPECT_RATIO_LANDSCAPE"
                            )
                            logger.info(f"Generated scene image via Whisk with {len(subject_ids)} subject, {len(scene_ids)} scene, {len(style_ids)} style references")
                        else:
                            # Use generate_image for scene without characters
                            whisk_image = whisk.generate_image(
                                prompt=prompt_with_prefix,
                                media_category="MEDIA_CATEGORY_SCENE",
                                aspect_ratio="IMAGE_ASPECT_RATIO_LANDSCAPE"
                            )
                            logger.info("Generated scene image via Whisk (no character references)")

                        # Save the image
                        image_path = self._project_manager.get_shot_image_path(self.project_name, current_shot_id, slot)
                        whisk_image.save(str(image_path))

                        first_new_slot = slot
                        image_local_paths.append(str(image_path))
                        image_paths.append(self._path_to_url(str(image_path)))
                        source_url_by_slot[slot] = ""  # Whisk doesn't return URL
                        media_gen_id_by_slot[slot] = whisk_image.media_generation_id

                    else:
                        # OpenAI compatible mode
                        from services.generator import GenerationClient, download_file, compress_image_if_needed

                        if not tti_config.get("apiUrl") or not tti_config.get("apiKey"):
                            raise ValueError("TTI API not configured in settings")

                        reference_images = []
                        character_references = []
                        missing_characters = []

                        if shot_characters:
                            logger.info(f"Characters found in imagePrompt: {shot_characters}")

                            for char_name in shot_characters:
                                char_found = False
                                for char in self.project_data["characters"]:
                                    if char["name"] == char_name:
                                        char_found = True
                                        if not char.get("imageUrl"):
                                            missing_characters.append(char_name)
                                            break

                                        image_url = char["imageUrl"]
                                        if "?t=" in image_url:
                                            image_url = image_url.split("?t=")[0]

                                        # Convert local URL to file path and encode as base64
                                        if image_url.startswith(f"http://127.0.0.1:{self._file_server_port}/"):
                                            local_path = image_url.replace(f"http://127.0.0.1:{self._file_server_port}/", "")
                                            if not local_path.startswith("/"):
                                                local_path = str(Path.cwd() / local_path)

                                            if Path(local_path).exists():
                                                reference_image_data = compress_image_if_needed(local_path, max_size_kb=768)
                                                reference_images.append({"base64": reference_image_data})
                                                character_references.append(char_name)
                                                logger.info(f"Added character reference: {char_name} -> {local_path}")
                                            else:
                                                missing_characters.append(char_name)
                                                logger.warning(f"Character image file not found: {local_path}")
                                        break

                                if not char_found:
                                    missing_characters.append(char_name)

                            if missing_characters:
                                raise ValueError(f"Missing reference images for characters: {', '.join(missing_characters)}")

                        if matched_scene:
                            scene_image_url = matched_scene.get("imageUrl", "")
                            if scene_image_url.startswith(f"http://127.0.0.1:{self._file_server_port}/"):
                                local_path = scene_image_url.replace(f"http://127.0.0.1:{self._file_server_port}/", "")
                                if not local_path.startswith("/"):
                                    local_path = str(Path.cwd() / local_path)
                                if Path(local_path).exists():
                                    reference_image_data = compress_image_if_needed(local_path, max_size_kb=768)
                                    reference_images.append({"base64": reference_image_data})
                                    logger.info(f"Added scene reference: {matched_scene.get('name', '')} -> {local_path}")
                                else:
                                    logger.warning(f"Scene image file not found: {local_path}")
                            else:
                                logger.warning("Scene has no usable image for reference")

                        # Add style image as reference if available
                        if style_image_path and Path(style_image_path).exists():
                            style_image_data = compress_image_if_needed(style_image_path, max_size_kb=768)
                            reference_images.append({"base64": style_image_data})
                            logger.info(f"Added style reference image: {style_image_path}")

                        has_references = len(reference_images) > 0
                        model_name = (
                            tti_config.get("sceneModel")
                            if has_references
                            else tti_config.get("shotModel")
                        ) or tti_config.get("model", "gemini-2.5-flash-image-landscape")
                        
                        client = GenerationClient(
                            api_url=tti_config["apiUrl"],
                            api_key=tti_config["apiKey"],
                            model=model_name,
                        )

                        if reference_images:
                            character_descriptions = []
                            for i, char_name in enumerate(character_references, 1):
                                character_descriptions.append(f"第{i}张图：{char_name}")

                            character_info = "、".join(character_descriptions)

                            enhanced_prompt = f"""基于提供的角色参考图，生成以下场景：

{prompt_with_prefix}

参考图说明：
{character_info}

要求：
- 严格按照参考图中对应角色的外观、服装、特征进行绘制
- 保持每个角色的一致性和辨识度
- 场景构图要符合镜头描述的要求
- 画质要求：电影级别的超高清画质，细节丰富精细
- 如果场景中涉及多个角色，请确保每个角色都按照对应的参考图进行绘制"""

                            logger.info(f"Using {len(reference_images)} character reference images: {character_references}")
                            image_urls = asyncio.run(client.generate_image(
                                enhanced_prompt,
                                reference_images=reference_images,
                                count=4,
                            ))
                        else:
                            logger.info("No character references found, using text-to-image generation")
                            image_urls = asyncio.run(client.generate_image(prompt_with_prefix, count=4))

                        if not image_urls:
                            raise ValueError("No images generated")

                        for idx, img_url in enumerate(image_urls):
                            slot = slots_to_use[idx]
                            if first_new_slot is None:
                                first_new_slot = slot
                            image_path = self._project_manager.get_shot_image_path(self.project_name, current_shot_id, slot)
                            asyncio.run(download_file(img_url, image_path))
                            image_local_paths.append(str(image_path))
                            image_paths.append(self._path_to_url(str(image_path)))
                            source_url_by_slot[slot] = img_url
                            media_gen_id_by_slot[slot] = ""  # OpenAI mode doesn't have this

                    # Load all 4 slots for frontend display (in order 1-4)
                    all_image_paths = []
                    all_local_paths = []
                    all_source_urls = []
                    all_media_gen_ids = []
                    for slot in range(1, 5):
                        slot_path = self._project_manager.get_shot_image_path(self.project_name, current_shot_id, slot)
                        if slot_path.exists():
                            all_image_paths.append(self._path_to_url(str(slot_path)))
                            all_local_paths.append(str(slot_path))
                            all_source_urls.append(source_url_by_slot.get(slot, ""))
                            all_media_gen_ids.append(media_gen_id_by_slot.get(slot, ""))

                    # Always select the newly generated image
                    if first_new_slot is not None:
                        shot["selectedImageIndex"] = first_new_slot - 1
                        logger.info(f"Auto-selected newly generated image (slot {first_new_slot})")
                    elif "selectedImageIndex" not in shot or shot["selectedImageIndex"] >= len(all_image_paths):
                        shot["selectedImageIndex"] = 0

                    shot["images"] = all_image_paths
                    shot["imageSourceUrls"] = all_source_urls
                    shot["imageMediaGenerationIds"] = all_media_gen_ids
                    shot["_localImagePaths"] = all_local_paths
                    shot["status"] = "images_ready"

                    generation_type = "Whisk" if provider == "whisk" else ("图生图" if shot_characters else "文生图")
                    logger.info(f"Generated images for shot {current_shot_id} using {generation_type}, total alternatives: {len(all_image_paths)}")
                    return {"success": True, "images": all_image_paths, "shot": shot}

                except Exception as e:
                    shot["status"] = "error"
                    shot["errorMessage"] = str(e)
                    logger.error(f"Failed to generate images: {e}")
                    return {"success": False, "error": str(e)}

        return {"success": False, "error": "Shot not found"}

    def _notify_shot_status(self, shot_id: str, status: str, shot_data: dict = None):
        """Notify frontend about shot status change, optionally with full shot data"""
        try:
            if self._window:
                if shot_data:
                    # Send full shot data as JSON
                    import json
                    shot_json = json.dumps(shot_data)
                    self._window.evaluate_js(f'window.onShotStatusChange && window.onShotStatusChange("{shot_id}", "{status}", {shot_json})')
                else:
                    self._window.evaluate_js(f'window.onShotStatusChange && window.onShotStatusChange("{shot_id}", "{status}", null)')
        except Exception as e:
            logger.warning(f"Failed to notify frontend: {e}")

    def _notify_progress(self):
        """Notify frontend to increment progress"""
        try:
            if self._window:
                self._window.evaluate_js('window.onProgressIncrement && window.onProgressIncrement()')
        except Exception as e:
            logger.warning(f"Failed to notify progress: {e}")

    def _generate_images_with_semaphore(self, shot_id: str) -> dict:
        """Generate images for a shot with semaphore control"""
        with self._tti_semaphore:
            # Notify frontend that this shot is now generating
            self._notify_shot_status(shot_id, "generating_images")
            result = self.generate_images_for_shot(shot_id)
            # Notify frontend of completion status with shot data for immediate UI update
            if result.get("success") and result.get("shot"):
                self._notify_shot_status(shot_id, "images_ready", result["shot"])
            else:
                self._notify_shot_status(shot_id, "error")
            self._notify_progress()
            return result

    def _prepare_image_task_params(self, shot: dict) -> dict:
        """
        准备图片生成任务的参数
        
        Args:
            shot: 镜头数据
        
        Returns:
            任务参数字典，包含 subtype, prompt, reference_images, output_dir, aspect_ratio, provider, slot
        """
        from services.generator import compress_image_if_needed
        
        # 获取设置
        settings = self._load_settings()
        tti_config = settings.get("tti", {})
        provider = tti_config.get("provider", "openai")
        
        # 宽高比
        settings_data = self.project_data.get("settings", self._get_default_project_settings())
        creation_params = settings_data.get("creationParams", {})
        aspect_ratio = creation_params.get("aspectRatio", "16:9")
        
        # 获取角色引用（从 imagePrompt 提取角色名）
        image_prompt = shot.get("imagePrompt", "")
        all_character_names = [c["name"] for c in self.project_data.get("characters", []) if c.get("name")]
        shot_characters = [name for name in all_character_names if name and name in image_prompt]
        
        # 构建提示词
        base_prompt = shot.get("imagePrompt", "")
        prefix_config = (self.project_data or {}).get("promptPrefixes", {})
        shot_image_prefix = str(prefix_config.get("shotImagePrefix", "")).strip()
        
        # 获取风格信息
        style_info = self._get_style_info()
        style_text = style_info.get("text", "")
        style_image_path = style_info.get("imagePath")
        
        # 构建完整提示词
        prompt_parts = []
        if shot_image_prefix:
            prompt_parts.append(shot_image_prefix)
        prompt_parts.append(base_prompt)
        if style_text:
            prompt_parts.append(f"\n\n画面风格：{style_text}")
        prompt_with_prefix = " ".join(prompt_parts[:2]) + (prompt_parts[2] if len(prompt_parts) > 2 else "")
        
        # 解析场景引用
        scene_name = str(shot.get("scene", "")).strip()
        matched_scene = None
        if scene_name:
            for scene in self.project_data.get("scenes", []):
                if scene.get("name") == scene_name:
                    matched_scene = scene
                    break
        
        # 确定槽位
        current_shot_id = shot["id"]
        existing_slots = []
        for slot in range(1, 5):
            slot_path = self._project_manager.get_shot_image_path(self.project_name, current_shot_id, slot)
            if slot_path.exists():
                existing_slots.append((slot, slot_path.stat().st_mtime))
        existing_slots.sort(key=lambda x: x[1])
        
        # 确定要使用的槽位（找一个空槽位或最老的槽位）
        if len(existing_slots) < 4:
            occupied = {slot for slot, _ in existing_slots}
            for slot in range(1, 5):
                if slot not in occupied:
                    target_slot = slot
                    break
        else:
            target_slot = existing_slots[0][0]  # 使用最老的槽位
        
        # 收集参考图路径（OpenAI 兼容模式）
        reference_paths = []
        character_references = []
        
        if provider != "whisk":  # OpenAI 兼容模式
            # 角色参考图
            for char_name in shot_characters:
                for char in self.project_data.get("characters", []):
                    if char["name"] == char_name and char.get("imageUrl"):
                        image_url = char["imageUrl"]
                        if "?t=" in image_url:
                            image_url = image_url.split("?t=")[0]
                        
                        if image_url.startswith(f"http://127.0.0.1:{self._file_server_port}/"):
                            local_path = image_url.replace(f"http://127.0.0.1:{self._file_server_port}/", "")
                            if not local_path.startswith("/"):
                                local_path = str(Path.cwd() / local_path)
                            if Path(local_path).exists():
                                reference_paths.append(local_path)
                                character_references.append(char_name)
                        break
            
            # 场景参考图
            if matched_scene:
                scene_image_url = matched_scene.get("imageUrl", "")
                if scene_image_url.startswith(f"http://127.0.0.1:{self._file_server_port}/"):
                    local_path = scene_image_url.replace(f"http://127.0.0.1:{self._file_server_port}/", "")
                    if not local_path.startswith("/"):
                        local_path = str(Path.cwd() / local_path)
                    if Path(local_path).exists():
                        reference_paths.append(local_path)
            
            # 风格参考图
            if style_image_path and Path(style_image_path).exists():
                reference_paths.append(style_image_path)
        
        # 增强提示词（如果有角色参考）
        if character_references:
            character_descriptions = [f"第{i}张图：{name}" for i, name in enumerate(character_references, 1)]
            character_info = "、".join(character_descriptions)
            prompt_with_prefix = f"""基于提供的角色参考图，生成以下场景：

{prompt_with_prefix}

参考图说明：
{character_info}

要求：
- 严格按照参考图中对应角色的外观、服装、特征进行绘制
- 保持每个角色的一致性和辨识度
- 场景构图要符合镜头描述的要求
- 画质要求：电影级别的超高清画质，细节丰富精细
- 如果场景中涉及多个角色，请确保每个角色都按照对应的参考图进行绘制"""
        
        # 确定子类型
        subtype = "image2image" if reference_paths else "text2image"
        
        # 输出目录
        output_dir = str(self._project_manager.get_project_dir(self.project_name) / "output" / "shots")
        
        # 确定模型
        has_references = len(reference_paths) > 0
        model_name = (
            tti_config.get("sceneModel") if has_references else tti_config.get("shotModel")
        ) or tti_config.get("model", "gemini-2.5-flash-image-landscape")
        
        return {
            "subtype": subtype,
            "prompt": prompt_with_prefix,
            "reference_images": ",".join(reference_paths) if reference_paths else None,
            "output_dir": output_dir,
            "aspect_ratio": aspect_ratio,
            "provider": provider,
            "model": model_name,
            "slot": target_slot,
            "api_url": tti_config.get("apiUrl"),
            "api_key": tti_config.get("apiKey"),
        }

    def generate_images_batch(self, shot_ids: list) -> dict:
        """
        批量创建图片生成任务
        
        使用任务系统，立即返回，后台异步执行
        """
        if not self.project_data:
            return {"success": False, "error": "No project data"}
        
        if not self._task_manager:
            return {"success": False, "error": "Task system not initialized"}
        
        # 获取设置
        settings = self._load_settings()
        tti_config = settings.get("tti", {})
        
        if not tti_config.get("apiUrl") or not tti_config.get("apiKey"):
            return {"success": False, "error": "TTI API not configured in settings"}
        
        task_ids = []
        errors = []
        
        for shot_id in shot_ids:
            # 找到镜头
            shot = None
            for s in self.project_data["shots"]:
                if s["id"] == shot_id:
                    shot = s
                    break
            
            if not shot:
                errors.append(f"Shot not found: {shot_id}")
                continue
            
            try:
                # 准备任务参数
                params = self._prepare_image_task_params(shot)
                
                # 创建任务
                task_id = self._task_manager.create_image_task(
                    subtype=params["subtype"],
                    prompt=params["prompt"],
                    aspect_ratio=params["aspect_ratio"],
                    provider=params["provider"],
                    project_id=self._get_project_id(),
                    reference_images=params["reference_images"],
                    output_dir=params["output_dir"],
                    shot_id=shot_id,
                    shot_sequence=shot.get("sequence"),
                    slot=params["slot"],
                    max_retries=2,
                    timeout=300,
                    ttl=3600,
                )
                
                task_ids.append(task_id)
                
                # 更新镜头状态
                shot["status"] = "generating_images"
                
                logger.info(f"Created image task {task_id} for shot {shot_id}, slot={params['slot']}")
                
            except Exception as e:
                logger.error(f"Failed to create image task for shot {shot_id}: {e}")
                errors.append(f"{shot_id}: {str(e)}")
        
        return {
            "success": True,
            "task_ids": task_ids,
            "errors": errors,
            "message": f"Created {len(task_ids)} image tasks"
        }

    # ========== Video Generation ==========

    def generate_video_for_shot(self, shot_id: str) -> dict:
        """Generate video for a single shot"""
        if not self.project_data:
            return {"success": False, "error": "No project data"}

        for shot in self.project_data["shots"]:
            if shot["id"] == shot_id:
                try:
                    shot["status"] = "generating_video"

                    # Get settings
                    settings = self._load_settings()
                    ttv_config = settings.get("ttv", {})
                    provider = ttv_config.get("provider", "openai")

                    # Require project to be saved before generating videos
                    if not self.project_name:
                        raise ValueError("Please save the project first before generating videos")

                    # Get selected image path (use local path for video generation)
                    selected_idx = shot.get("selectedImageIndex", 0)
                    local_images = shot.get("_localImagePaths", [])

                    if not local_images:
                        raise ValueError("No images available for video generation")

                    # Use local file path for video generation
                    image_local_path = local_images[selected_idx] if selected_idx < len(local_images) else local_images[0]
                    prompt = shot.get("videoPrompt", "")
                    prefix_config = (self.project_data or {}).get("promptPrefixes", {})
                    shot_video_prefix = str(prefix_config.get("shotVideoPrefix", "")).strip()
                    prompt_with_prefix = f"{shot_video_prefix} {prompt}".strip() if shot_video_prefix else prompt
                    shot_id_str = shot["id"]

                    # Check which slots (1-4) are already occupied
                    existing_slots = []
                    for slot in range(1, 5):
                        slot_path = self._project_manager.get_shot_video_path(self.project_name, shot_id_str, slot)
                        if slot_path.exists():
                            existing_slots.append((slot, slot_path.stat().st_mtime))

                    # Sort by modification time (oldest first)
                    existing_slots.sort(key=lambda x: x[1])

                    # Determine which slot to use for new video
                    target_slot = None
                    if len(existing_slots) < 4:
                        # Fill empty slot first
                        occupied = {slot for slot, _ in existing_slots}
                        for slot in range(1, 5):
                            if slot not in occupied:
                                target_slot = slot
                                break
                    else:
                        # All slots occupied, replace the oldest one
                        target_slot = existing_slots[0][0]

                    video_path = self._project_manager.get_shot_video_path(self.project_name, shot_id_str, target_slot)

                    if provider == "whisk":
                        # Whisk mode
                        from services.whisk import Whisk, VideoProgress, WhiskVideo

                        if not ttv_config.get("whiskToken") or not ttv_config.get("whiskWorkflowId"):
                            raise ValueError("Whisk Token and Workflow ID not configured in settings")

                        whisk = Whisk(
                            token=ttv_config["whiskToken"],
                            workflow_id=ttv_config["whiskWorkflowId"]
                        )

                        # Read image file
                        with open(image_local_path, 'rb') as f:
                            image_bytes = f.read()

                        logger.info(f"Generating video via Whisk with image: {image_local_path}")

                        # Generate video (iterate through generator)
                        whisk_video = None
                        for result in whisk.generate_video(prompt_with_prefix, image_bytes):
                            if isinstance(result, VideoProgress):
                                logger.info(f"Video generation progress: {result.status.value}, elapsed: {result.elapsed_seconds:.1f}s")
                            elif isinstance(result, WhiskVideo):
                                whisk_video = result
                                break

                        if not whisk_video:
                            raise ValueError("No video generated from Whisk")

                        # Save video to file
                        whisk_video.save(str(video_path))
                        logger.info(f"Saved Whisk video to: {video_path}")

                    else:
                        # OpenAI compatible mode
                        import asyncio
                        from services.generator import GenerationClient, download_file

                        if not ttv_config.get("apiUrl") or not ttv_config.get("apiKey"):
                            raise ValueError("TTV API not configured in settings")

                        client = GenerationClient(
                            api_url=ttv_config["apiUrl"],
                            api_key=ttv_config["apiKey"],
                            model=ttv_config.get("model", "veo_3_1_i2v_s_fast_fl_landscape"),
                        )

                        # Check if model supports image input
                        model = ttv_config.get("model", "")
                        image_paths = None

                        if "i2v" in model or "r2v" in model:
                            # Image-to-video models - use first frame
                            image_paths = [image_local_path]
                            logger.info(f"Using first frame for I2V: {image_local_path}")

                        # Generate video (returns URL)
                        video_url = asyncio.run(client.generate_video(prompt_with_prefix, image_paths))

                        if not video_url:
                            raise ValueError("No video generated")

                        # Download and save new video
                        asyncio.run(download_file(video_url, video_path))

                    # Load all 4 slots for frontend display (in order 1-4)
                    all_video_paths = []
                    for slot in range(1, 5):
                        slot_path = self._project_manager.get_shot_video_path(self.project_name, shot_id_str, slot)
                        if slot_path.exists():
                            all_video_paths.append(self._path_to_url(str(slot_path)))

                    # Always select the newly generated video
                    if target_slot is not None:
                        shot["selectedVideoIndex"] = target_slot - 1  # Convert slot (1-4) to index (0-3)
                        shot["videoUrl"] = all_video_paths[target_slot - 1] if target_slot - 1 < len(all_video_paths) else all_video_paths[0]
                        logger.info(f"Auto-selected newly generated video (slot {target_slot})")
                    elif "selectedVideoIndex" not in shot or shot["selectedVideoIndex"] >= len(all_video_paths):
                        shot["selectedVideoIndex"] = 0
                        shot["videoUrl"] = all_video_paths[0] if all_video_paths else ""
                    else:
                        # Keep current selection, update videoUrl
                        selected_idx = shot.get("selectedVideoIndex", 0)
                        shot["videoUrl"] = all_video_paths[selected_idx] if selected_idx < len(all_video_paths) else all_video_paths[0]

                    shot["videos"] = all_video_paths
                    shot["status"] = "completed"
                    generation_type = "Whisk" if provider == "whisk" else "OpenAI"
                    logger.info(f"Generated video for shot {shot_id} via {generation_type}, total alternatives: {len(all_video_paths)}")
                    return {"success": True, "videoUrl": shot["videoUrl"], "shot": shot}

                except Exception as e:
                    shot["status"] = "error"
                    shot["errorMessage"] = str(e)
                    logger.error(f"Failed to generate video: {e}")
                    return {"success": False, "error": str(e)}

        return {"success": False, "error": "Shot not found"}

    def _generate_video_with_semaphore(self, shot_id: str) -> dict:
        """Generate video for a shot with semaphore control"""
        with self._ttv_semaphore:
            # Notify frontend that this shot is now generating
            self._notify_shot_status(shot_id, "generating_video")
            result = self.generate_video_for_shot(shot_id)
            # Notify frontend of completion status with shot data for immediate UI update
            if result.get("success") and result.get("shot"):
                self._notify_shot_status(shot_id, "completed", result["shot"])
            else:
                self._notify_shot_status(shot_id, "error")
            self._notify_progress()
            return result

    def _prepare_video_task_params(self, shot: dict) -> dict:
        """
        准备视频生成任务的参数
        
        Args:
            shot: 镜头数据
        
        Returns:
            任务参数字典
        """
        # 获取设置
        settings = self._load_settings()
        ttv_config = settings.get("ttv", {})
        provider = ttv_config.get("provider", "openai")
        
        # 宽高比
        settings_data = self.project_data.get("settings", self._get_default_project_settings())
        creation_params = settings_data.get("creationParams", {})
        aspect_ratio = creation_params.get("aspectRatio", "16:9")
        
        # 获取选中的图片路径
        selected_idx = shot.get("selectedImageIndex", 0)
        local_images = shot.get("_localImagePaths", [])
        
        image_local_path = None
        if local_images:
            image_local_path = local_images[selected_idx] if selected_idx < len(local_images) else local_images[0]
        
        # 获取提示词
        prompt = shot.get("videoPrompt", "")
        prefix_config = (self.project_data or {}).get("promptPrefixes", {})
        shot_video_prefix = str(prefix_config.get("shotVideoPrefix", "")).strip()
        prompt_with_prefix = f"{shot_video_prefix} {prompt}".strip() if shot_video_prefix else prompt
        
        # 输出目录
        output_dir = str(self._project_manager.get_project_dir(self.project_name) / "output" / "shots")
        
        # 确定子类型
        model = ttv_config.get("model", "")
        if "i2v" in model or "r2v" in model:
            subtype = "frames2video" if image_local_path else "text2video"
        else:
            subtype = "text2video"
        
        return {
            "subtype": subtype,
            "prompt": prompt_with_prefix,
            "reference_images": image_local_path,  # 首帧图片
            "output_dir": output_dir,
            "aspect_ratio": aspect_ratio,
            "provider": provider,
            "duration": 5,
            "api_url": ttv_config.get("apiUrl"),
            "api_key": ttv_config.get("apiKey"),
            "model": ttv_config.get("model", "veo_3_1_i2v_s_fast_fl_landscape"),
        }

    def generate_videos_batch(self, shot_ids: list) -> dict:
        """
        批量创建视频生成任务
        
        使用任务系统，立即返回，后台异步执行
        """
        if not self.project_data:
            return {"success": False, "error": "No project data"}
        
        if not self._task_manager:
            return {"success": False, "error": "Task system not initialized"}
        
        # 获取设置
        settings = self._load_settings()
        ttv_config = settings.get("ttv", {})
        
        if not ttv_config.get("apiUrl") or not ttv_config.get("apiKey"):
            return {"success": False, "error": "TTV API not configured in settings"}
        
        task_ids = []
        errors = []
        
        for shot_id in shot_ids:
            # 找到镜头
            shot = None
            for s in self.project_data["shots"]:
                if s["id"] == shot_id:
                    shot = s
                    break
            
            if not shot:
                errors.append(f"Shot not found: {shot_id}")
                continue
            
            try:
                # 准备任务参数
                params = self._prepare_video_task_params(shot)
                
                # 检查是否有图片可用
                if params["subtype"] != "text2video" and not params["reference_images"]:
                    errors.append(f"{shot_id}: No images available for video generation")
                    continue
                
                # 创建任务
                task_id = self._task_manager.create_video_task(
                    subtype=params["subtype"],
                    prompt=params["prompt"],
                    aspect_ratio=params["aspect_ratio"],
                    provider=params["provider"],
                    project_id=self._get_project_id(),
                    reference_images=params["reference_images"],
                    duration=params["duration"],
                    output_dir=params["output_dir"],
                    shot_id=shot_id,
                    shot_sequence=shot.get("sequence"),
                    max_retries=2,
                    timeout=600,
                    ttl=7200,
                )
                
                task_ids.append(task_id)
                
                # 更新镜头状态
                shot["status"] = "generating_video"
                
                logger.info(f"Created video task {task_id} for shot {shot_id}")
                
            except Exception as e:
                logger.error(f"Failed to create video task for shot {shot_id}: {e}")
                errors.append(f"{shot_id}: {str(e)}")
        
        return {
            "success": True,
            "task_ids": task_ids,
            "errors": errors,
            "message": f"Created {len(task_ids)} video tasks"
        }

    # ========== Audio Generation ==========

    def generate_audio_for_shot(self, shot_id: str) -> dict:
        """Generate audio for a single shot (supports multiple dialogues)"""
        if not self.project_data:
            return {"success": False, "error": "No project data"}

        for shot in self.project_data["shots"]:
            if shot["id"] == shot_id:
                try:
                    import asyncio
                    from services.generator import GenerationClient
                    from pydub import AudioSegment

                    shot["status"] = "generating_audio"

                    # Get settings
                    settings = self._load_settings()
                    tts_config = settings.get("tts", {})

                    if not tts_config.get("apiUrl"):
                        raise ValueError("TTS API not configured in settings")

                    # Require project to be saved before generating audio
                    if not self.project_name:
                        raise ValueError("Please save the project first before generating audio")

                    # Create client
                    client = GenerationClient(
                        api_url=tts_config["apiUrl"],
                        api_key=tts_config.get("apiKey", ""),
                        model=tts_config.get("model", "tts-1"),
                    )

                    # Check if shot has dialogues (new format) or script (old format)
                    dialogues = shot.get("dialogues", [])

                    # Backward compatibility: convert old format to new format
                    if not dialogues and shot.get("script"):
                        voice_actor = shot.get("voiceActor", "")
                        if voice_actor:
                            dialogues = [{"role": voice_actor, "text": shot["script"]}]
                            shot["dialogues"] = dialogues
                        else:
                            raise ValueError("No voice actor or dialogues specified")

                    if not dialogues:
                        raise ValueError("No dialogues found for this shot")

                    # Generate audio for each dialogue
                    audio_segments = []
                    temp_files = []

                    for idx, dialogue in enumerate(dialogues):
                        role = dialogue.get("role", "")
                        text = dialogue.get("text", "")

                        if not role or not text:
                            logger.warning(f"Skipping empty dialogue at index {idx}")
                            continue

                        # Find character with matching name
                        reference_audio = None
                        character_speed = 1.0
                        for char in self.project_data["characters"]:
                            if char["name"] == role:
                                reference_audio = char.get("referenceAudioPath")
                                character_speed = char.get("speed", 1.0)
                                break

                        if not reference_audio:
                            raise ValueError(f"No reference audio found for character: {role}")

                        # Handle preset audio path (format: preset:relative_path)
                        if reference_audio.startswith("preset:"):
                            relative_path = reference_audio[7:]  # Remove "preset:" prefix
                            reference_audio = str(Path(__file__).parent / "assets" / "audios" / relative_path)
                            logger.info(f"Resolved preset audio path: {reference_audio}")

                        # Get emotion and intensity from dialogue level, fallback to shot level
                        emotion = dialogue.get("emotion", shot.get("emotion", ""))
                        intensity = dialogue.get("intensity", shot.get("intensity", ""))

                        # Generate audio for this dialogue
                        logger.info(f"Generating audio for dialogue {idx + 1}/{len(dialogues)}: {role}")
                        audio_bytes = asyncio.run(
                            client.generate_audio(
                                text=text,
                                reference_audio=reference_audio,
                                speed=character_speed,
                                emotion=emotion,
                                intensity=intensity,
                            )
                        )

                        if not audio_bytes:
                            raise ValueError(f"No audio generated for dialogue {idx}")

                        # Save temporary audio file
                        temp_path = self._project_manager.get_shot_audio_path(
                            self.project_name, f"{shot_id}_dialogue_{idx}"
                        )
                        temp_path.parent.mkdir(parents=True, exist_ok=True)
                        with open(temp_path, "wb") as f:
                            f.write(audio_bytes)

                        temp_files.append(temp_path)

                        # Load audio segment and apply speed adjustment
                        segment = AudioSegment.from_file(str(temp_path))
                        if character_speed != 1.0:
                            logger.info(f"Applying speed adjustment: {character_speed}x for {role}")
                            segment = change_audio_speed(segment, character_speed)
                        audio_segments.append(segment)

                        # Add 300ms silence between dialogues
                        if idx < len(dialogues) - 1:
                            silence = AudioSegment.silent(duration=300)
                            audio_segments.append(silence)

                    # Combine all audio segments
                    if not audio_segments:
                        raise ValueError("No audio segments generated")

                    combined = audio_segments[0]
                    for segment in audio_segments[1:]:
                        combined += segment

                    # Save combined audio
                    final_audio_path = self._project_manager.get_shot_audio_path(
                        self.project_name, shot_id
                    )
                    final_audio_path.parent.mkdir(parents=True, exist_ok=True)
                    combined.export(str(final_audio_path), format="wav")

                    # Clean up temporary files
                    for temp_file in temp_files:
                        try:
                            temp_file.unlink()
                        except Exception as e:
                            logger.warning(f"Failed to delete temp file {temp_file}: {e}")

                    # Update shot with audio URL
                    shot["audioUrl"] = self._path_to_url(str(final_audio_path))
                    shot["status"] = "audio_ready"

                    logger.info(f"Generated audio for shot {shot_id} with {len(dialogues)} dialogues")
                    return {"success": True, "audioUrl": shot["audioUrl"], "shot": shot}

                except Exception as e:
                    shot["status"] = "error"
                    shot["errorMessage"] = str(e)
                    logger.error(f"Failed to generate audio: {e}")
                    return {"success": False, "error": str(e)}

        return {"success": False, "error": "Shot not found"}

    def _generate_audio_with_semaphore(self, shot_id: str) -> dict:
        """Generate audio for a shot with semaphore control"""
        with self._tts_semaphore:
            # Notify frontend that this shot is now generating
            self._notify_shot_status(shot_id, "generating_audio")
            result = self.generate_audio_for_shot(shot_id)
            # Notify frontend of completion status with shot data for immediate UI update
            if result.get("success") and result.get("shot"):
                self._notify_shot_status(shot_id, "audio_ready", result["shot"])
            else:
                self._notify_shot_status(shot_id, "error")
            self._notify_progress()
            return result

    def _prepare_audio_task_params(self, shot: dict, dialogue_index: int) -> dict:
        """
        准备音频生成任务的参数
        
        Args:
            shot: 镜头数据
            dialogue_index: 对话索引
        
        Returns:
            任务参数字典
        """
        # 获取设置
        settings = self._load_settings()
        tts_config = settings.get("tts", {})
        
        # 获取对话
        dialogues = shot.get("dialogues", [])
        
        # 兼容旧格式
        if not dialogues and shot.get("script"):
            voice_actor = shot.get("voiceActor", "")
            if voice_actor:
                dialogues = [{"role": voice_actor, "text": shot["script"]}]
        
        if dialogue_index >= len(dialogues):
            raise ValueError(f"Dialogue index {dialogue_index} out of range")
        
        dialogue = dialogues[dialogue_index]
        role = dialogue.get("role", "")
        text = dialogue.get("text", "")
        
        if not role or not text:
            raise ValueError(f"Empty dialogue at index {dialogue_index}")
        
        # 找到角色的参考音频
        reference_audio = None
        character_speed = 1.0
        for char in self.project_data.get("characters", []):
            if char["name"] == role:
                reference_audio = char.get("referenceAudioPath")
                character_speed = char.get("speed", 1.0)
                break
        
        if not reference_audio:
            raise ValueError(f"No reference audio found for character: {role}")
        
        # 处理预设音频路径
        if reference_audio.startswith("preset:"):
            relative_path = reference_audio[7:]
            reference_audio = str(Path(__file__).parent / "assets" / "audios" / relative_path)
        
        # 获取情感参数
        emotion = dialogue.get("emotion", shot.get("emotion", ""))
        intensity = dialogue.get("intensity", shot.get("intensity", ""))
        
        # 输出目录
        output_dir = str(self._project_manager.get_project_dir(self.project_name) / "output" / "shots")
        
        return {
            "text": text,
            "voice_ref": reference_audio,
            "speed": character_speed,
            "emotion": emotion,
            "emotion_intensity": intensity,
            "output_dir": output_dir,
            "provider": "tts",
            "api_url": tts_config.get("apiUrl"),
            "api_key": tts_config.get("apiKey", ""),
            "model": tts_config.get("model", "tts-1"),
        }

    def generate_audios_batch(self, shot_ids: list) -> dict:
        """
        批量创建音频生成任务
        
        使用任务系统，立即返回，后台异步执行
        为每段对话创建独立任务
        """
        if not self.project_data:
            return {"success": False, "error": "No project data"}
        
        if not self._task_manager:
            return {"success": False, "error": "Task system not initialized"}
        
        # 获取设置
        settings = self._load_settings()
        tts_config = settings.get("tts", {})
        
        if not tts_config.get("apiUrl"):
            return {"success": False, "error": "TTS API not configured in settings"}
        
        task_ids = []
        errors = []
        
        for shot_id in shot_ids:
            # 找到镜头
            shot = None
            for s in self.project_data["shots"]:
                if s["id"] == shot_id:
                    shot = s
                    break
            
            if not shot:
                errors.append(f"Shot not found: {shot_id}")
                continue
            
            # 获取对话列表
            dialogues = shot.get("dialogues", [])
            
            # 兼容旧格式
            if not dialogues and shot.get("script"):
                voice_actor = shot.get("voiceActor", "")
                if voice_actor:
                    dialogues = [{"role": voice_actor, "text": shot["script"]}]
            
            if not dialogues:
                errors.append(f"{shot_id}: No dialogues found")
                continue
            
            # 为每段对话创建任务
            shot_task_ids = []
            for idx, dialogue in enumerate(dialogues):
                try:
                    params = self._prepare_audio_task_params(shot, idx)
                    
                    task_id = self._task_manager.create_audio_task(
                        text=params["text"],
                        provider=params["provider"],
                        project_id=self._get_project_id(),
                        voice_ref=params["voice_ref"],
                        emotion=params["emotion"] or None,
                        emotion_intensity=params["emotion_intensity"] or None,
                        speed=params["speed"],
                        output_dir=params["output_dir"],
                        shot_id=shot_id,
                        shot_sequence=shot.get("sequence"),
                        dialogue_index=idx,
                        max_retries=2,
                        timeout=120,
                        ttl=3600,
                    )
                    
                    task_ids.append(task_id)
                    shot_task_ids.append(task_id)
                    
                    logger.info(f"Created audio task {task_id} for shot {shot_id}, dialogue {idx}")
                    
                except Exception as e:
                    logger.error(f"Failed to create audio task for shot {shot_id} dialogue {idx}: {e}")
                    errors.append(f"{shot_id}[{idx}]: {str(e)}")
            
            # 更新镜头状态
            if shot_task_ids:
                shot["status"] = "generating_audio"
        
        return {
            "success": True,
            "task_ids": task_ids,
            "errors": errors,
            "message": f"Created {len(task_ids)} audio tasks"
        }

    # ========== File Operations ==========

    def open_output_dir(self) -> dict:
        """Open output directory in file explorer"""
        import subprocess
        import sys

        try:
            if sys.platform == "darwin":
                subprocess.run(["open", str(self.output_dir)])
            elif sys.platform == "win32":
                subprocess.run(["explorer", str(self.output_dir)])
            else:
                subprocess.run(["xdg-open", str(self.output_dir)])
            return {"success": True}
        except Exception as e:
            logger.error(f"Failed to open output dir: {e}")
            return {"success": False, "error": str(e)}

    def get_app_version(self) -> str:
        """Get application version"""
        from version import get_version
        return get_version()

    def check_for_updates(self) -> dict:
        """Check for application updates"""
        from updater import check_for_updates
        result = check_for_updates()
        if result is None:
            return {"success": False, "error": "Failed to check for updates"}
        return {
            "success": True,
            "hasUpdate": result.has_update,
            "currentVersion": result.current_version,
            "latestVersion": result.latest_version,
            "releaseNotes": result.release_notes,
            "downloadUrl": result.download_url,
            "releaseUrl": result.release_url
        }

    def open_download_page(self, url: str) -> dict:
        """Open download page in browser"""
        from updater import open_download_page
        success = open_download_page(url)
        return {"success": success}

    def reveal_in_file_manager(self, filepath: str) -> dict:
        """
        Reveal file in system file manager (Finder on macOS, Explorer on Windows)
        
        Args:
            filepath: Path to the file to reveal
        
        Returns:
            Success status
        """
        import subprocess
        import platform
        from pathlib import Path
        
        try:
            path = Path(filepath)
            if not path.exists():
                return {"success": False, "error": f"File not found: {filepath}"}
            
            system = platform.system()
            
            if system == "Darwin":  # macOS
                # -R flag reveals and selects the file in Finder
                subprocess.run(["open", "-R", str(path)], check=True)
            elif system == "Windows":
                # /select flag selects the file in Explorer
                subprocess.run(["explorer", "/select,", str(path)], check=True)
            else:  # Linux
                # Just open the parent directory
                subprocess.run(["xdg-open", str(path.parent)], check=True)
            
            return {"success": True}
        except Exception as e:
            logger.error(f"Failed to reveal file in file manager: {e}")
            return {"success": False, "error": str(e)}

    # ========== Reference Audio Management ==========

    def scan_reference_audios(self, directory: str) -> dict:
        """Scan directory recursively for audio files"""
        import os

        audio_extensions = {".mp3", ".wav", ".m4a", ".flac", ".aac", ".ogg", ".wma"}
        audios = []

        try:
            dir_path = Path(directory)
            if not dir_path.exists() or not dir_path.is_dir():
                logger.warning(f"Directory does not exist: {directory}")
                return {"success": True, "audios": []}

            logger.info(f"Scanning audio files in: {directory}")

            for root, _, files in os.walk(directory):
                for file in files:
                    file_path = Path(root) / file
                    if file_path.suffix.lower() in audio_extensions:
                        relative_path = file_path.relative_to(dir_path)
                        audios.append({
                            "path": str(file_path),
                            "name": file_path.name,
                            "relativePath": str(relative_path),
                        })

            logger.info(f"Found {len(audios)} audio files")
            return {"success": True, "audios": audios}

        except Exception as e:
            logger.error(f"Failed to scan audio files: {e}")
            return {"success": False, "error": str(e), "audios": []}

    def select_reference_audio_dir(self) -> dict:
        """Select reference audio directory"""
        if not self._window:
            return {"success": False, "error": "Window not initialized"}

        result = self._window.create_file_dialog(
            webview.FileDialog.FOLDER,
            allow_multiple=False,
        )

        if not result or len(result) == 0:
            return {"success": False, "error": "No directory selected"}

        dir_path = Path(result[0])
        logger.info(f"Selected reference audio directory: {dir_path}")

        return {"success": True, "path": str(dir_path)}

    def get_reference_audio_data(self, file_path: str) -> dict:
        """Read audio file and return as base64 data
        
        Supports both preset: prefixed paths and absolute paths
        """
        import base64
        import mimetypes

        try:
            # Handle preset audio paths
            if file_path.startswith("preset:"):
                relative_path = file_path[7:]  # Remove "preset:" prefix
                return self.get_preset_audio_data(relative_path)

            audio_path = Path(file_path)
            if not audio_path.exists() or not audio_path.is_file():
                return {"success": False, "error": "File not found"}

            # Read file as binary
            with open(audio_path, "rb") as f:
                audio_data = f.read()

            # Encode to base64
            base64_data = base64.b64encode(audio_data).decode("utf-8")

            # Determine MIME type
            mime_type, _ = mimetypes.guess_type(str(audio_path))
            if not mime_type:
                # Default MIME types based on extension
                ext = audio_path.suffix.lower()
                mime_map = {
                    ".mp3": "audio/mpeg",
                    ".wav": "audio/wav",
                    ".m4a": "audio/mp4",
                    ".flac": "audio/flac",
                    ".aac": "audio/aac",
                    ".ogg": "audio/ogg",
                    ".wma": "audio/x-ms-wma",
                }
                mime_type = mime_map.get(ext, "audio/mpeg")

            logger.info(f"Read audio file: {file_path} ({len(audio_data)} bytes)")
            return {"success": True, "data": base64_data, "mimeType": mime_type}

        except Exception as e:
            logger.error(f"Failed to read audio file: {e}")
            return {"success": False, "error": str(e)}

    # ========== Preset Audio ==========

    def _get_preset_audios_csv_path(self) -> Path:
        """Get the path to the preset audios CSV file"""
        # In development mode, use the local assets directory
        # In production mode, use the bundled assets
        if getattr(sys, 'frozen', False):
            # Running in PyInstaller bundle
            base_path = Path(sys._MEIPASS)
        else:
            # Running in development
            base_path = Path(__file__).parent
        return base_path / "assets" / "audios" / "audios.csv"

    def _get_preset_audios_dir(self) -> Path:
        """Get the directory containing preset audio files"""
        if getattr(sys, 'frozen', False):
            base_path = Path(sys._MEIPASS)
        else:
            base_path = Path(__file__).parent
        return base_path / "assets" / "audios"

    def get_preset_audios(self) -> dict:
        """Get list of preset reference audios from CSV"""
        import csv

        try:
            csv_path = self._get_preset_audios_csv_path()
            if not csv_path.exists():
                logger.warning(f"Preset audios CSV not found: {csv_path}")
                return {"success": True, "audios": []}

            audios = []
            with open(csv_path, "r", encoding="utf-8") as f:
                reader = csv.DictReader(f)
                for row in reader:
                    # Skip empty rows (CSV headers are in Chinese)
                    name = row.get("名称", "")
                    if not name:
                        continue
                    
                    # Parse tags from pipe-separated string
                    tags_str = row.get("标签", "")
                    tags = [t.strip() for t in tags_str.split("|") if t.strip()]
                    
                    audio = {
                        "name": name,
                        "path": row.get("相对路径", ""),
                        "gender": row.get("性别", ""),
                        "ageGroup": row.get("年龄段", ""),
                        "age": row.get("预测年龄", ""),
                        "speed": row.get("语速", ""),
                        "usage": row.get("用途", ""),
                        "tags": tags,
                        "typicalRoles": row.get("典型角色", ""),
                        "description": row.get("描述", ""),
                    }
                    audios.append(audio)

            logger.info(f"Loaded {len(audios)} preset audios from CSV")
            return {"success": True, "audios": audios}

        except Exception as e:
            logger.error(f"Failed to load preset audios: {e}")
            return {"success": False, "error": str(e)}

    def get_preset_audio_data(self, relative_path: str) -> dict:
        """Read preset audio file and return as base64 data"""
        import base64
        import mimetypes

        try:
            audios_dir = self._get_preset_audios_dir()
            audio_path = audios_dir / relative_path

            if not audio_path.exists() or not audio_path.is_file():
                logger.warning(f"Preset audio file not found: {audio_path}")
                return {"success": False, "error": "File not found"}

            # Read file as binary
            with open(audio_path, "rb") as f:
                audio_data = f.read()

            # Encode to base64
            base64_data = base64.b64encode(audio_data).decode("utf-8")

            # Determine MIME type
            mime_type, _ = mimetypes.guess_type(str(audio_path))
            if not mime_type:
                ext = audio_path.suffix.lower()
                mime_map = {
                    ".mp3": "audio/mpeg",
                    ".wav": "audio/wav",
                    ".m4a": "audio/mp4",
                    ".flac": "audio/flac",
                    ".aac": "audio/aac",
                    ".ogg": "audio/ogg",
                    ".wma": "audio/x-ms-wma",
                }
                mime_type = mime_map.get(ext, "audio/mpeg")

            logger.info(f"Read preset audio file: {relative_path} ({len(audio_data)} bytes)")
            return {"success": True, "data": base64_data, "mimeType": mime_type}

        except Exception as e:
            logger.error(f"Failed to read preset audio file: {e}")
            return {"success": False, "error": str(e)}

    def smart_assign_audios(self, mode: str = "empty_only") -> dict:
        """Smart assign reference audios to characters
        
        Args:
            mode: 'empty_only' - only assign to characters without audio
                  'all' - reassign all characters
        """
        import random

        try:
            if not self.project_data:
                return {"success": False, "error": "No project loaded"}

            # Get preset audios
            preset_result = self.get_preset_audios()
            if not preset_result.get("success"):
                return {"success": False, "error": "Failed to load preset audios"}
            
            all_audios = preset_result.get("audios", [])
            if not all_audios:
                return {"success": False, "error": "No preset audios available"}

            # Separate audios by usage type
            narration_audios = [a for a in all_audios if "旁白" in a.get("usage", "")]
            voiceover_audios = [a for a in all_audios if "配音" in a.get("usage", "")]
            
            # Further separate by gender
            def get_audios_by_gender(audios: list, gender: str) -> list:
                return [a for a in audios if a.get("gender") == gender]

            narration_male = get_audios_by_gender(narration_audios, "男")
            narration_female = get_audios_by_gender(narration_audios, "女")
            voiceover_male = get_audios_by_gender(voiceover_audios, "男")
            voiceover_female = get_audios_by_gender(voiceover_audios, "女")

            # Keywords for gender inference
            female_keywords = ["女", "娘", "姐", "妈", "母", "婆", "妹", "姑", "婶", "嫂", "她", "公主", "王后", "女王", "夫人", "小姐"]
            male_keywords = ["男", "哥", "弟", "爸", "父", "爷", "叔", "伯", "他", "王子", "国王", "先生", "大叔", "少爷"]

            def infer_gender(name: str) -> str:
                """Infer gender from character name"""
                for kw in female_keywords:
                    if kw in name:
                        return "女"
                for kw in male_keywords:
                    if kw in name:
                        return "男"
                return "random"

            def select_audio(is_narrator: bool, gender: str, used_paths: set) -> dict:
                """Select an audio based on character attributes"""
                if is_narrator:
                    if gender == "女":
                        pool = narration_female or narration_audios
                    elif gender == "男":
                        pool = narration_male or narration_audios
                    else:
                        pool = narration_audios
                else:
                    if gender == "女":
                        pool = voiceover_female or voiceover_audios
                    elif gender == "男":
                        pool = voiceover_male or voiceover_audios
                    else:
                        pool = voiceover_audios

                # Fall back to all audios if pool is empty
                if not pool:
                    pool = all_audios

                # Try to find an unused audio first
                unused = [a for a in pool if a.get("path") not in used_paths]
                if unused:
                    return random.choice(unused)
                
                # If all are used, just pick randomly
                return random.choice(pool)

            # Track used audio paths to avoid duplicates
            used_paths = set()
            assignments = []
            assigned_count = 0
            skipped_count = 0

            characters = self.project_data.get("characters", [])
            
            for char in characters:
                # Skip if mode is empty_only and character already has audio
                if mode == "empty_only" and char.get("referenceAudioPath"):
                    skipped_count += 1
                    continue

                is_narrator = char.get("isNarrator", False)
                char_name = char.get("name", "")
                
                # Infer gender from name
                gender = infer_gender(char_name)
                
                # Select audio
                audio = select_audio(is_narrator, gender, used_paths)
                
                if audio:
                    audio_path = audio.get("path", "")
                    # Store the path with preset: prefix to distinguish from user audios
                    full_path = f"preset:{audio_path}"
                    char["referenceAudioPath"] = full_path
                    used_paths.add(audio_path)
                    
                    assignments.append({
                        "characterId": char.get("id"),
                        "characterName": char_name,
                        "audioName": audio.get("name", ""),
                        "audioPath": full_path,
                    })
                    assigned_count += 1

            logger.info(f"Smart assign completed: {assigned_count} assigned, {skipped_count} skipped")
            return {
                "success": True,
                "assignedCount": assigned_count,
                "skippedCount": skipped_count,
                "assignments": assignments,
            }

        except Exception as e:
            logger.error(f"Failed to smart assign audios: {e}")
            return {"success": False, "error": str(e), "assignedCount": 0, "skippedCount": 0}

    def smart_assign_audios_with_llm(self, mode: str = "empty_only") -> dict:
        """Smart assign reference audios using LLM for better matching
        
        Args:
            mode: 'empty_only' - only assign to characters without audio
                  'all' - reassign all characters
        
        Returns:
            dict with recommendations for each character
        """
        import json
        import re
        from services.stream_llm import call_llm_stream

        try:
            if not self.project_data:
                return {"success": False, "error": "No project loaded", "assignedCount": 0, "skippedCount": 0}

            # Get settings for LLM config
            settings = self._load_settings()
            shot_builder_config = settings.get("shotBuilder", {})
            api_url = shot_builder_config.get("apiUrl", "")
            api_key = shot_builder_config.get("apiKey", "")
            model = shot_builder_config.get("model", "")

            if not api_key:
                return {"success": False, "error": "Please configure LLM API settings first", "assignedCount": 0, "skippedCount": 0}

            # Get preset audios
            preset_result = self.get_preset_audios()
            if not preset_result.get("success"):
                return {"success": False, "error": "Failed to load preset audios", "assignedCount": 0, "skippedCount": 0}
            
            all_audios = preset_result.get("audios", [])
            if not all_audios:
                return {"success": False, "error": "No preset audios available", "assignedCount": 0, "skippedCount": 0}

            # Get characters to assign
            characters = self.project_data.get("characters", [])
            if mode == "empty_only":
                chars_to_assign = [c for c in characters if not c.get("referenceAudioPath")]
            else:
                chars_to_assign = characters

            if not chars_to_assign:
                return {"success": True, "assignedCount": 0, "skippedCount": len(characters), "recommendations": {}}

            # Build audio library description (without file paths)
            narration_audios = []
            voiceover_audios = []
            for audio in all_audios:
                usage = audio.get("usage", "")
                audio_info = {
                    "name": audio.get("name", ""),
                    "gender": audio.get("gender", ""),
                    "ageGroup": audio.get("ageGroup", ""),
                    "age": audio.get("age", ""),
                    "speed": audio.get("speed", ""),
                    "tags": audio.get("tags", [])[:5],  # Limit tags
                    "typicalRoles": audio.get("typicalRoles", ""),
                    "description": audio.get("description", "")[:100],  # Limit description
                }
                if "旁白" in usage:
                    narration_audios.append(audio_info)
                if "配音" in usage:
                    voiceover_audios.append(audio_info)

            # Build character list description
            char_list = []
            for char in chars_to_assign:
                char_list.append({
                    "id": char.get("id", ""),
                    "name": char.get("name", ""),
                    "isNarrator": char.get("isNarrator", False),
                    "description": char.get("description", "")[:200] if char.get("description") else "",
                })

            # Construct prompt
            prompt = f"""你是一个专业的配音导演，需要为短剧角色分配合适的配音参考音。

## 旁白参考音库（适合旁白角色）
{json.dumps(narration_audios, ensure_ascii=False, indent=2)}

## 角色配音参考音库（适合对话角色）
{json.dumps(voiceover_audios, ensure_ascii=False, indent=2)}

## 待分配角色
{json.dumps(char_list, ensure_ascii=False, indent=2)}

## 任务
为每个角色推荐3-5个最合适的参考音，按匹配度从高到低排序。

## 匹配原则
1. 旁白角色(isNarrator=true)只能从旁白参考音库中选择，且必须同时推荐男声和女声（旁白可以是任意性别）
2. 对话角色(isNarrator=false)只能从角色配音参考音库中选择，根据角色性别选择对应性别的声音
3. 根据角色名称和描述推断角色性别和年龄特点
4. 根据角色性格特点匹配声音标签（如温柔、霸气、搞笑等）
5. 考虑角色的情感表达需求

## 输出格式
请直接输出JSON，不要有其他内容：
{{
  "recommendations": [
    {{
      "characterId": "角色ID",
      "characterName": "角色名称", 
      "audios": [
        {{
          "audioName": "参考音名称（必须是音库中存在的）",
          "reason": "推荐原因（15字以内）"
        }}
      ]
    }}
  ]
}}"""

            # Call LLM
            logger.info("Calling LLM for smart audio assignment...")
            response_lines = []
            for line in call_llm_stream(prompt, model=model, api_key=api_key, base_url=api_url, use_env=False):
                response_lines.append(line)
            response = "\n".join(response_lines)

            # Parse JSON response
            # Try to extract JSON from response (may be wrapped in markdown code block)
            json_match = re.search(r'\{[\s\S]*\}', response)
            if not json_match:
                logger.error(f"Failed to parse LLM response: {response}")
                return {"success": False, "error": "Failed to parse LLM response", "assignedCount": 0, "skippedCount": 0}

            try:
                result = json.loads(json_match.group())
            except json.JSONDecodeError as e:
                logger.error(f"JSON decode error: {e}, response: {response}")
                return {"success": False, "error": f"Invalid JSON response: {str(e)}", "assignedCount": 0, "skippedCount": 0}

            # Build audio name to path mapping
            audio_name_to_path = {a.get("name"): a.get("path") for a in all_audios}

            # Process recommendations and update characters
            recommendations_by_id = {}
            assigned_count = 0

            for rec in result.get("recommendations", []):
                char_id = rec.get("characterId", "")
                audios = rec.get("audios", [])
                
                # Convert audio names to full recommendation objects
                full_recs = []
                for audio in audios:
                    audio_name = audio.get("audioName", "")
                    audio_path = audio_name_to_path.get(audio_name)
                    if audio_path:
                        full_recs.append({
                            "audioPath": audio_path,
                            "audioName": audio_name,
                            "reason": audio.get("reason", "")
                        })

                if full_recs:
                    recommendations_by_id[char_id] = full_recs
                    
                    # Update character with first recommendation
                    for char in characters:
                        if char.get("id") == char_id:
                            first_rec = full_recs[0]
                            char["referenceAudioPath"] = f"preset:{first_rec['audioPath']}"
                            char["referenceAudioName"] = first_rec["audioName"]
                            char["audioRecommendations"] = full_recs
                            char["selectedRecommendationIndex"] = 0
                            assigned_count += 1
                            break

            skipped_count = len(characters) - assigned_count

            logger.info(f"LLM smart assign completed: {assigned_count} assigned, {skipped_count} skipped")
            return {
                "success": True,
                "assignedCount": assigned_count,
                "skippedCount": skipped_count,
                "recommendations": recommendations_by_id,
            }

        except Exception as e:
            logger.error(f"Failed to smart assign audios with LLM: {e}")
            import traceback
            traceback.print_exc()
            return {"success": False, "error": str(e), "assignedCount": 0, "skippedCount": 0}

    def select_character_recommendation(self, character_id: str, recommendation_index: int) -> dict:
        """Select a specific recommendation for a character
        
        Args:
            character_id: The character ID
            recommendation_index: Index of the recommendation to select (0-based)
        
        Returns:
            dict with updated character
        """
        try:
            if not self.project_data:
                return {"success": False, "error": "No project loaded"}

            characters = self.project_data.get("characters", [])
            for char in characters:
                if char.get("id") == character_id:
                    recommendations = char.get("audioRecommendations", [])
                    if not recommendations:
                        return {"success": False, "error": "No recommendations available for this character"}
                    
                    if recommendation_index < 0 or recommendation_index >= len(recommendations):
                        return {"success": False, "error": f"Invalid recommendation index: {recommendation_index}"}
                    
                    selected_rec = recommendations[recommendation_index]
                    char["referenceAudioPath"] = f"preset:{selected_rec['audioPath']}"
                    char["referenceAudioName"] = selected_rec["audioName"]
                    char["selectedRecommendationIndex"] = recommendation_index
                    
                    logger.info(f"Selected recommendation {recommendation_index} for character {character_id}: {selected_rec['audioName']}")
                    return {"success": True, "character": char}

            return {"success": False, "error": "Character not found"}

        except Exception as e:
            logger.error(f"Failed to select character recommendation: {e}")
            return {"success": False, "error": str(e)}


    # ========== Shot Builder ==========

    def get_shot_builder_prompts(self) -> dict:
        try:
            self._ensure_shot_builder_prompts()
            prompt_dir = self._get_shot_builder_prompt_dir()
            prompts = {
                "role": (prompt_dir / "role.txt").read_text(encoding="utf-8"),
                "scene": (prompt_dir / "scene.txt").read_text(encoding="utf-8"),
                "shot": (prompt_dir / "shot.txt").read_text(encoding="utf-8"),
            }
            return {"success": True, "prompts": prompts}
        except Exception as e:
            logger.error(f"Failed to load shot builder prompts: {e}")
            return {"success": False, "error": str(e)}

    def save_shot_builder_prompts(self, prompts: dict) -> dict:
        try:
            self._ensure_shot_builder_prompts()
            prompt_dir = self._get_shot_builder_prompt_dir()
            (prompt_dir / "role.txt").write_text(prompts.get("role", ""), encoding="utf-8")
            (prompt_dir / "scene.txt").write_text(prompts.get("scene", ""), encoding="utf-8")
            (prompt_dir / "shot.txt").write_text(prompts.get("shot", ""), encoding="utf-8")
            return {"success": True}
        except Exception as e:
            logger.error(f"Failed to save shot builder prompts: {e}")
            return {"success": False, "error": str(e)}

    def get_shot_builder_novel(self) -> dict:
        try:
            output_dir = self._get_shot_builder_output_dir()
            novel_path = output_dir / "novel.txt"
            text = novel_path.read_text(encoding="utf-8") if novel_path.exists() else ""
            return {"success": True, "text": text}
        except Exception as e:
            logger.error(f"Failed to load novel text: {e}")
            return {"success": False, "error": str(e)}

    def save_shot_builder_novel(self, text: str) -> dict:
        try:
            output_dir = self._get_shot_builder_output_dir()
            novel_path = output_dir / "novel.txt"
            novel_path.write_text(text or "", encoding="utf-8")
            return {"success": True}
        except Exception as e:
            logger.error(f"Failed to save novel text: {e}")
            return {"success": False, "error": str(e)}

    def clear_shot_builder_output(self) -> dict:
        try:
            output_dir = self._get_shot_builder_output_dir()
            if output_dir.exists():
                import shutil
                shutil.rmtree(output_dir)
            output_dir.mkdir(parents=True, exist_ok=True)
            return {"success": True, "outputDir": str(output_dir)}
        except Exception as e:
            logger.error(f"Failed to clear shot builder output: {e}")
            return {"success": False, "error": str(e)}

    def get_shot_builder_outputs(self) -> dict:
        try:
            output_dir = self._get_shot_builder_output_dir()

            def read_text(path: Path) -> str:
                return path.read_text(encoding="utf-8") if path.exists() else ""

            outputs = {
                "roles": read_text(output_dir / "roles.jsonl"),
                "scenes": read_text(output_dir / "scenes.jsonl"),
                "shots": read_text(output_dir / "shots.jsonl"),
                "outputDir": str(output_dir),
            }
            return {"success": True, "outputs": outputs}
        except Exception as e:
            logger.error(f"Failed to load shot builder outputs: {e}")
            return {"success": False, "error": str(e)}

    def save_shot_builder_outputs(self, outputs: dict) -> dict:
        try:
            output_dir = self._get_shot_builder_output_dir()
            (output_dir / "roles.jsonl").write_text(outputs.get("roles", ""), encoding="utf-8")
            (output_dir / "scenes.jsonl").write_text(outputs.get("scenes", ""), encoding="utf-8")
            (output_dir / "shots.jsonl").write_text(outputs.get("shots", ""), encoding="utf-8")
            return {"success": True, "outputDir": str(output_dir)}
        except Exception as e:
            logger.error(f"Failed to save shot builder outputs: {e}")
            return {"success": False, "error": str(e)}

    def _run_shot_builder_task(
        self,
        step: str,
        output_dir: Path,
        novel_text: str,
        prompt_role: str,
        prompt_scene: str,
        prompt_shot: str,
        llm_config: dict,
    ) -> None:
        """Background task to run shot builder step"""
        try:
            from services.shots import (
                generate_roles,
                generate_scenes,
                generate_shots,
                load_existing_data,
                Role,
                Scene,
            )

            if step == "role":
                generate_roles(prompt_role, novel_text, output_dir, llm_config=llm_config)
            elif step == "scene":
                generate_scenes(prompt_scene, novel_text, output_dir, llm_config=llm_config)
            else:
                roles_path = output_dir / "roles.jsonl"
                scenes_path = output_dir / "scenes.jsonl"
                roles = load_existing_data(roles_path, Role)
                scenes = load_existing_data(scenes_path, Scene)
                generate_shots(prompt_shot, novel_text, roles, scenes, output_dir, llm_config=llm_config)

            # Mark task as completed
            if self._shot_builder_task and self._shot_builder_task.get("step") == step:
                self._shot_builder_task["running"] = False
                self._shot_builder_task["error"] = None
                logger.info(f"Shot builder task completed: {step}")
        except Exception as e:
            logger.error(f"Shot builder task failed: {e}")
            if self._shot_builder_task and self._shot_builder_task.get("step") == step:
                self._shot_builder_task["running"] = False
                self._shot_builder_task["error"] = str(e)

    def run_shot_builder_step(self, step: str, force: bool) -> dict:
        """Start shot builder step in background thread"""
        try:
            if step not in {"role", "scene", "shot"}:
                return {"success": False, "error": "Invalid step"}

            # Check if a task is already running
            if self._shot_builder_task and self._shot_builder_task.get("running"):
                return {"success": False, "error": "已有任务正在执行中"}

            output_dir = self._get_shot_builder_output_dir()
            novel_path = output_dir / "novel.txt"
            novel_text = ""
            if novel_path.exists():
                novel_text = novel_path.read_text(encoding="utf-8")

            # 只删除当前步骤对应的文件，不删除整个目录
            step_file_map = {
                "role": "roles.jsonl",
                "scene": "scenes.jsonl",
                "shot": "shots.jsonl",
            }
            target_file = output_dir / step_file_map[step]
            if target_file.exists():
                target_file.unlink()
            if step == "shot":
                state_path = output_dir / "session_state.json"
                if state_path.exists():
                    state_path.unlink()

            novel_text = novel_text.strip()
            if not novel_text:
                return {"success": False, "error": "Novel text is empty"}

            self._ensure_shot_builder_prompts()
            prompt_dir = self._get_shot_builder_prompt_dir()
            prompt_role = (prompt_dir / "role.txt").read_text(encoding="utf-8")
            prompt_scene = (prompt_dir / "scene.txt").read_text(encoding="utf-8")
            prompt_shot = (prompt_dir / "shot.txt").read_text(encoding="utf-8")

            settings = self._load_settings()
            shot_builder_cfg = settings.get("shotBuilder", {})
            api_url = str(shot_builder_cfg.get("apiUrl", "")).strip()
            api_key = str(shot_builder_cfg.get("apiKey", "")).strip()
            model = str(shot_builder_cfg.get("model", "")).strip()
            if not api_url or not api_key or not model:
                return {"success": False, "error": "请在设置中配置分镜接口地址、密钥与模型"}

            if api_url.endswith("/chat/completions"):
                api_url = api_url.rsplit("/chat/completions", 1)[0]

            llm_config = {
                "api_key": api_key,
                "base_url": api_url,
                "model": model,
            }

            # For shot step, check if roles and scenes exist
            if step == "shot":
                roles_path = output_dir / "roles.jsonl"
                scenes_path = output_dir / "scenes.jsonl"
                if not roles_path.exists() or not scenes_path.exists():
                    return {"success": False, "error": "角色或场景数据不存在，请先生成"}

            # Initialize task state
            self._shot_builder_task = {
                "step": step,
                "running": True,
                "error": None,
                "outputDir": str(output_dir),
            }

            # Submit task to thread pool
            import threading
            thread = threading.Thread(
                target=self._run_shot_builder_task,
                args=(step, output_dir, novel_text, prompt_role, prompt_scene, prompt_shot, llm_config),
                daemon=True,
            )
            thread.start()

            return {
                "success": True,
                "step": step,
                "running": True,
                "outputDir": str(output_dir),
            }
        except Exception as e:
            logger.error(f"Failed to start shot builder step: {e}")
            return {"success": False, "error": str(e)}

    def get_shot_builder_status(self) -> dict:
        """Get current shot builder task status"""
        try:
            output_dir = self._get_shot_builder_output_dir()

            def count_lines(path: Path) -> int:
                if not path.exists():
                    return 0
                with open(path, "r", encoding="utf-8") as f:
                    return sum(1 for line in f if line.strip())

            counts = {
                "roles": count_lines(output_dir / "roles.jsonl"),
                "scenes": count_lines(output_dir / "scenes.jsonl"),
                "shots": count_lines(output_dir / "shots.jsonl"),
            }

            if self._shot_builder_task:
                return {
                    "success": True,
                    "step": self._shot_builder_task.get("step"),
                    "running": self._shot_builder_task.get("running", False),
                    "error": self._shot_builder_task.get("error"),
                    "outputDir": str(output_dir),
                    "counts": counts,
                }
            return {
                "success": True,
                "step": None,
                "running": False,
                "error": None,
                "outputDir": str(output_dir),
                "counts": counts,
            }
        except Exception as e:
            logger.error(f"Failed to get shot builder status: {e}")
            return {"success": False, "error": str(e)}


    # ========== Settings Management ==========

    def get_settings(self) -> dict:
        """Get application settings"""
        try:
            if self._settings_file.exists():
                with open(self._settings_file, "r", encoding="utf-8") as f:
                    settings = json.load(f)
                logger.info("Loaded settings")
                return {"success": True, "settings": settings}
            else:
                self._ensure_settings_file()
                return self.get_settings()
        except Exception as e:
            logger.error(f"Failed to load settings: {e}")
            return {"success": False, "error": str(e)}

    def save_settings(self, settings: dict) -> dict:
        """Save application settings"""
        try:
            # Save to settings file (always in ~/.hetangai/settings.json)
            self._settings_file.parent.mkdir(parents=True, exist_ok=True)
            with open(self._settings_file, "w", encoding="utf-8") as f:
                json.dump(settings, f, indent=2, ensure_ascii=False)

            # Update project manager work directory if changed
            if "workDir" in settings and settings["workDir"]:
                self._project_manager.set_work_dir(Path(settings["workDir"]))

            # Update thread pool sizes if concurrency changed
            self._update_thread_pools(settings)

            logger.info("Saved settings")
            return {"success": True}
        except Exception as e:
            logger.error(f"Failed to save settings: {e}")
            return {"success": False, "error": str(e)}

    def _update_thread_pools(self, settings: dict):
        """Update thread pool and semaphores based on settings"""
        tts_concurrency = settings.get("tts", {}).get("concurrency", 1)
        tti_concurrency = settings.get("tti", {}).get("concurrency", 1)
        ttv_concurrency = settings.get("ttv", {}).get("concurrency", 1)

        needs_pool_update = False

        # Update TTS semaphore if changed
        if self._tts_concurrency != tts_concurrency:
            self._tts_semaphore = Semaphore(tts_concurrency)
            self._tts_concurrency = tts_concurrency
            needs_pool_update = True
            logger.info(f"TTS concurrency updated: {tts_concurrency}")

        # Update TTI semaphore if changed
        if self._tti_concurrency != tti_concurrency:
            self._tti_semaphore = Semaphore(tti_concurrency)
            self._tti_concurrency = tti_concurrency
            needs_pool_update = True
            logger.info(f"TTI concurrency updated: {tti_concurrency}")

        # Update TTV semaphore if changed
        if self._ttv_concurrency != ttv_concurrency:
            self._ttv_semaphore = Semaphore(ttv_concurrency)
            self._ttv_concurrency = ttv_concurrency
            needs_pool_update = True
            logger.info(f"TTV concurrency updated: {ttv_concurrency}")

        # Update thread pool if total concurrency changed
        if needs_pool_update:
            total_max_workers = tts_concurrency + tti_concurrency + ttv_concurrency
            self._thread_pool.shutdown(wait=False)
            self._thread_pool = ThreadPoolExecutor(max_workers=total_max_workers, thread_name_prefix="gen")
            logger.info(f"Thread pool updated: total_workers={total_max_workers}")

    def select_work_dir(self) -> dict:
        """Select work directory"""
        if not self._window:
            return {"success": False, "error": "Window not initialized"}

        result = self._window.create_file_dialog(
            webview.FileDialog.FOLDER,
            allow_multiple=False,
        )

        if not result or len(result) == 0:
            return {"success": False, "error": "No directory selected"}

        dir_path = Path(result[0])
        logger.info(f"Selected work directory: {dir_path}")

        return {"success": True, "path": str(dir_path)}

    def select_jianying_draft_dir(self) -> dict:
        """Select JianYing draft directory"""
        if not self._window:
            return {"success": False, "error": "Window not initialized"}

        result = self._window.create_file_dialog(
            webview.FileDialog.FOLDER,
            allow_multiple=False,
        )

        if not result or len(result) == 0:
            return {"success": False, "error": "No directory selected"}

        dir_path = Path(result[0])
        logger.info(f"Selected JianYing draft directory: {dir_path}")

        return {"success": True, "path": str(dir_path)}

    def select_ffmpeg_path(self) -> dict:
        """Select ffmpeg executable path"""
        if not self._window:
            return {"success": False, "error": "Window not initialized"}

        result = self._window.create_file_dialog(
            webview.FileDialog.OPEN,
            allow_multiple=False,
        )

        if not result or len(result) == 0:
            return {"success": False, "error": "No file selected"}

        file_path = Path(result[0] if isinstance(result, tuple) else result)
        
        # Verify it's an executable
        import subprocess
        try:
            subprocess.run([str(file_path), "-version"], capture_output=True, check=True)
        except (subprocess.CalledProcessError, FileNotFoundError, PermissionError):
            return {"success": False, "error": "Selected file is not a valid ffmpeg executable"}

        logger.info(f"Selected ffmpeg path: {file_path}")
        return {"success": True, "path": str(file_path)}

    def _get_ffmpeg_path(self) -> str:
        """Get ffmpeg executable path from settings or use system default"""
        settings = self._load_settings()
        ffmpeg_path = settings.get("ffmpegPath", "")
        if ffmpeg_path and Path(ffmpeg_path).exists():
            return ffmpeg_path
        return "ffmpeg"

    def _get_ffprobe_path(self) -> str:
        """Get ffprobe executable path (derive from ffmpeg path)"""
        settings = self._load_settings()
        ffmpeg_path = settings.get("ffmpegPath", "")
        if ffmpeg_path:
            ffmpeg_dir = Path(ffmpeg_path).parent
            # Try ffprobe in the same directory
            ffprobe_path = ffmpeg_dir / "ffprobe"
            if ffprobe_path.exists():
                return str(ffprobe_path)
            # Try with .exe extension on Windows
            ffprobe_path = ffmpeg_dir / "ffprobe.exe"
            if ffprobe_path.exists():
                return str(ffprobe_path)
        return "ffprobe"

    def export_jianying_draft(self) -> dict:
        """Export current project to JianYing draft"""
        try:
            if not self.project_data or not self.project_name:
                return {"success": False, "error": "No project loaded"}

            # Load settings to get JianYing draft directory
            settings = self._load_settings()
            jianying_dir = settings.get("jianyingDraftDir", "")
            if not jianying_dir:
                return {"success": False, "error": "JianYing draft directory not configured"}

            jianying_path = Path(jianying_dir)
            if not jianying_path.exists():
                return {"success": False, "error": f"JianYing draft directory does not exist: {jianying_dir}"}

            # Import pycapcut
            try:
                import pycapcut as cc
                from pycapcut import trange
            except ImportError:
                return {"success": False, "error": "pycapcut not installed"}

            # Create draft folder
            draft_folder = cc.DraftFolder(str(jianying_path))

            # Create draft with project name
            draft_name = self.project_name
            script = draft_folder.create_draft(draft_name, 1920, 1080, allow_replace=True)

            # Add tracks: video, text, and audio (TTS audio will be added directly to segments)
            script.add_track(cc.TrackType.video).add_track(cc.TrackType.audio).add_track(cc.TrackType.text)

            # Process shots - 各轨道独立追踪时间位置
            video_current_time = 0.0
            audio_current_time = 0.0
            text_current_time = 0.0
            shots = self.project_data.get("shots", [])

            for shot in shots:
                shot_id = shot.get("id")
                if not shot_id:
                    continue

                # Get selected video path
                selected_video_index = shot.get("selectedVideoIndex", 0)
                videos = shot.get("videos", [])
                if not videos or selected_video_index >= len(videos):
                    logger.warning(f"Shot {shot_id} has no video, skipping")
                    continue

                video_url = videos[selected_video_index]
                video_path = self._url_to_path(video_url)
                if not video_path or not Path(video_path).exists():
                    logger.warning(f"Video file not found for shot {shot_id}: {video_path}")
                    continue

                # Get audio path
                audio_url = shot.get("audioUrl", "")
                audio_path = None
                if audio_url:
                    audio_path = self._url_to_path(audio_url)
                    if not audio_path or not Path(audio_path).exists():
                        logger.warning(f"Audio file not found for shot {shot_id}: {audio_path}")
                        audio_path = None

                # Get video duration using pycapcut
                try:
                    video_material = cc.VideoMaterial(video_path)
                    # Duration is in microseconds, convert to seconds
                    video_duration = video_material.duration / 1_000_000

                    # Get audio duration if available
                    audio_duration = None
                    if audio_path:
                        try:
                            audio_material = cc.AudioMaterial(audio_path)
                            # Duration is in microseconds, convert to seconds
                            audio_duration = audio_material.duration / 1_000_000
                        except Exception as e:
                            logger.warning(f"Failed to load audio for shot {shot_id}: {e}")
                            audio_path = None

                    # Get custom video settings if saved
                    custom_speed = shot.get("videoSpeed")
                    custom_audio_offset = shot.get("audioOffset", 0.0)
                    custom_audio_speed = shot.get("audioSpeed", 1.0)
                    custom_audio_trim_start = shot.get("audioTrimStart", 0.0)
                    custom_audio_trim_end = shot.get("audioTrimEnd")  # None means use full audio
                    
                    # Convert from string if necessary (frontend may send as string)
                    if isinstance(custom_speed, str):
                        try:
                            custom_speed = float(custom_speed)
                        except (ValueError, TypeError):
                            custom_speed = None
                    if isinstance(custom_audio_offset, str):
                        try:
                            custom_audio_offset = float(custom_audio_offset)
                        except (ValueError, TypeError):
                            custom_audio_offset = 0.0
                    if isinstance(custom_audio_speed, str):
                        try:
                            custom_audio_speed = float(custom_audio_speed)
                        except (ValueError, TypeError):
                            custom_audio_speed = 1.0
                    if isinstance(custom_audio_trim_start, str):
                        try:
                            custom_audio_trim_start = float(custom_audio_trim_start)
                        except (ValueError, TypeError):
                            custom_audio_trim_start = 0.0
                    if isinstance(custom_audio_trim_end, str):
                        try:
                            custom_audio_trim_end = float(custom_audio_trim_end)
                        except (ValueError, TypeError):
                            custom_audio_trim_end = None
                    
                    # Clamp audio speed to valid range
                    custom_audio_speed = max(0.5, min(2.0, custom_audio_speed))
                    
                    # 判断是否是编辑过的镜头
                    is_edited = shot.get('videoSpeed') is not None or shot.get('audioSpeed') is not None or shot.get('audioOffset') is not None or shot.get('audioTrimStart') is not None or shot.get('audioTrimEnd') is not None
                    
                    if is_edited:
                        logger.info(f"===== 镜头 {shot_id} [已编辑] =====")
                        logger.info(f"  原始参数:")
                        logger.info(f"    视频倍速: {shot.get('videoSpeed')}")
                        logger.info(f"    音频倍速: {shot.get('audioSpeed')}")
                        logger.info(f"    音频偏移: {shot.get('audioOffset')}")
                        logger.info(f"    音频裁剪起点: {shot.get('audioTrimStart')}")
                        logger.info(f"    音频裁剪终点: {shot.get('audioTrimEnd')}")
                        logger.info(f"  解析后参数:")
                        logger.info(f"    视频倍速: {custom_speed}")
                        logger.info(f"    音频倍速: {custom_audio_speed}")
                        logger.info(f"    音频偏移: {custom_audio_offset}")
                        logger.info(f"    音频裁剪: {custom_audio_trim_start} - {custom_audio_trim_end}")
                    else:
                        logger.info(f"===== 镜头 {shot_id} [未编辑] =====")

                    # Determine segment duration and video settings
                    if audio_duration is not None:
                        # Calculate effective audio duration after trim and speed
                        trim_start = custom_audio_trim_start
                        # Use full audio if trim_end is not set or invalid (0 or None)
                        trim_end = custom_audio_trim_end if custom_audio_trim_end and custom_audio_trim_end > 0 else audio_duration
                        # Clamp trim values to valid range
                        trim_start = max(0.0, min(trim_start, audio_duration))
                        trim_end = max(trim_start + 0.1, min(trim_end, audio_duration))  # Ensure at least 0.1s duration
                        trimmed_audio_duration = trim_end - trim_start
                        # Effective audio duration after speed adjustment
                        effective_audio_duration = trimmed_audio_duration / custom_audio_speed
                        
                        if is_edited:
                            logger.info(f"  素材时长:")
                            logger.info(f"    视频原始时长: {video_duration:.2f}s")
                            logger.info(f"    音频原始时长: {audio_duration:.2f}s")
                            logger.info(f"  计算结果:")
                            logger.info(f"    音频裁剪范围: {trim_start:.2f}s - {trim_end:.2f}s")
                            logger.info(f"    裁剪后音频时长: {trimmed_audio_duration:.2f}s")
                            logger.info(f"    倍速后音频时长: {trimmed_audio_duration:.2f}s / {custom_audio_speed:.2f}x = {effective_audio_duration:.2f}s")
                        
                        # 时间精度处理函数（对齐到 0.01s）
                        # target 用 round，source 用 floor 确保不超出素材时长
                        def align_time(t: float) -> float:
                            return round(t, 2)
                        def floor_time(t: float) -> float:
                            return math.floor(t * 100) / 100
                        
                        # 片段时长 = 音频有效时长（所有镜头的基准），对齐精度
                        segment_duration = align_time(effective_audio_duration)
                        
                        # 计算视频倍速（统一逻辑，无论是否编辑过）
                        if custom_speed is not None and 0.5 <= custom_speed <= 3.0:
                            video_speed = custom_speed
                            logger.info(f"    使用自定义视频倍速: {video_speed:.2f}x")
                        else:
                            video_speed = video_duration / segment_duration
                            video_speed = max(0.5, min(3.0, video_speed))
                            logger.info(f"    自动计算视频倍速: {video_duration:.2f}s / {segment_duration:.2f}s = {video_speed:.2f}x")
                        
                        # 视频 source 计算（统一逻辑），使用 floor 确保不超出素材时长
                        video_source_start = floor_time(custom_audio_offset * video_speed)
                        video_source_duration = floor_time(segment_duration * video_speed)
                        # 确保不超出素材范围
                        video_source_start = max(0, min(video_source_start, floor_time(video_duration - 0.1)))
                        video_source_duration = min(video_source_duration, floor_time(video_duration - video_source_start - 0.01))
                        video_source_duration = max(0.1, video_source_duration)
                        
                        # 音频 source 计算（统一逻辑），使用 floor 确保不超出素材时长
                        audio_source_start = floor_time(trim_start)
                        audio_source_duration = floor_time(trimmed_audio_duration)
                        # 确保不超出素材范围
                        audio_source_duration = min(audio_source_duration, floor_time(audio_duration - audio_source_start - 0.01))
                        audio_source_duration = max(0.1, audio_source_duration)
                        
                        # 对齐当前时间
                        video_target_start = align_time(video_current_time)
                        audio_target_start = align_time(audio_current_time)
                        
                        logger.info(f"  视频: target=[{video_target_start:.2f}s, {segment_duration:.2f}s], source=[{video_source_start:.2f}s, {video_source_duration:.2f}s], speed={video_speed:.3f}x")
                        logger.info(f"  音频: target=[{audio_target_start:.2f}s, {segment_duration:.2f}s], source=[{audio_source_start:.2f}s, {audio_source_duration:.2f}s], speed={custom_audio_speed:.3f}x")
                        
                        # 创建并添加视频片段
                        video_segment = cc.VideoSegment(
                            video_material,
                            target_timerange=trange(f"{video_target_start}s", f"{segment_duration}s"),
                            source_timerange=trange(f"{video_source_start}s", f"{video_source_duration}s"),
                            speed=video_speed,
                            volume=0.0
                        )
                        script.add_segment(video_segment)
                        video_current_time = align_time(video_target_start + segment_duration)
                        
                        # 创建并添加音频片段
                        if audio_path:
                            audio_segment = cc.AudioSegment(
                                audio_material,
                                target_timerange=trange(f"{audio_target_start}s", f"{segment_duration}s"),
                                source_timerange=trange(f"{audio_source_start}s", f"{audio_source_duration}s"),
                                speed=custom_audio_speed
                            )
                            script.add_segment(audio_segment)
                            audio_current_time = align_time(audio_target_start + segment_duration)
                        
                        logger.info(f"  下一起点: video={video_current_time:.2f}s, audio={audio_current_time:.2f}s")
                        
                    else:
                        # No audio: use video duration
                        def align_time(t: float) -> float:
                            return round(t, 2)
                        
                        segment_duration = align_time(video_duration)
                        video_source_start = 0.0
                        video_source_duration = align_time(video_duration - 0.01)
                        video_target_start = align_time(video_current_time)
                        
                        logger.info(f"  无音频, 视频: target=[{video_target_start:.2f}s, {segment_duration:.2f}s]")
                        
                        video_segment = cc.VideoSegment(
                            video_material,
                            target_timerange=trange(f"{video_target_start}s", f"{segment_duration}s"),
                            source_timerange=trange(f"{video_source_start}s", f"{video_source_duration}s"),
                            speed=1.0,
                            volume=0.0
                        )
                        script.add_segment(video_segment)
                        video_current_time = align_time(video_target_start + segment_duration)
                        audio_current_time = video_current_time  # 保持同步

                    # Add text segment with script
                    script_text = shot.get("script", "")
                    if script_text:
                        text_target_start = align_time(text_current_time)
                        text_segment = cc.TextSegment(
                            script_text,
                            trange(f"{text_target_start}s", f"{segment_duration}s"),
                            clip_settings=cc.ClipSettings(transform_y=-0.8)
                        )
                        script.add_segment(text_segment)
                        text_current_time = align_time(text_target_start + segment_duration)

                except Exception as e:
                    logger.error(f"Failed to process shot {shot_id}: {e}")
                    raise  # 不允许异常后继续，必须正确

            # Save draft
            script.save()

            draft_path = jianying_path / draft_name
            logger.info(f"Exported JianYing draft to: {draft_path}")

            return {"success": True, "path": str(draft_path)}

        except Exception as e:
            logger.error(f"Failed to export JianYing draft: {e}")
            return {"success": False, "error": str(e)}

    def export_audio_srt(self) -> dict:
        """Export audio as SRT subtitle file and concatenated WAV file"""
        try:
            if not self.project_data or not self.project_name:
                return {"success": False, "error": "No project loaded"}

            shots = self.project_data.get("shots", [])
            if not shots:
                return {"success": False, "error": "No shots in project"}

            # Collect audio files and build SRT content
            srt_entries = []
            audio_segments = []
            current_time = 0.0
            entry_index = 1

            from pydub import AudioSegment

            for shot in shots:
                audio_url = shot.get("audioUrl", "")
                if not audio_url:
                    continue

                audio_path = self._url_to_path(audio_url)
                if not audio_path or not Path(audio_path).exists():
                    logger.warning(f"Audio file not found: {audio_path}")
                    continue

                # Get dialogues text (without role names)
                dialogues = shot.get("dialogues", [])
                if not dialogues and shot.get("script"):
                    # Fallback to old format
                    dialogues = [{"text": shot["script"]}]

                text_lines = []
                for d in dialogues:
                    text = d.get("text", "").strip()
                    if text:
                        text_lines.append(text)

                if not text_lines:
                    continue

                # Load audio to get duration
                try:
                    audio_segment = AudioSegment.from_file(audio_path)
                    duration = len(audio_segment) / 1000.0  # ms to seconds
                except Exception as e:
                    logger.warning(f"Failed to load audio {audio_path}: {e}")
                    continue

                audio_segments.append(audio_segment)

                # Build SRT entry
                start_time = current_time
                end_time = current_time + duration

                srt_entries.append({
                    "index": entry_index,
                    "start": start_time,
                    "end": end_time,
                    "text": "\n".join(text_lines)
                })

                current_time = end_time
                entry_index += 1

            if not srt_entries:
                return {"success": False, "error": "No audio entries found"}

            # Generate SRT content
            def format_srt_time(seconds: float) -> str:
                hours = int(seconds // 3600)
                minutes = int((seconds % 3600) // 60)
                secs = int(seconds % 60)
                millis = int((seconds % 1) * 1000)
                return f"{hours:02d}:{minutes:02d}:{secs:02d},{millis:03d}"

            srt_content = ""
            for entry in srt_entries:
                srt_content += f"{entry['index']}\n"
                srt_content += f"{format_srt_time(entry['start'])} --> {format_srt_time(entry['end'])}\n"
                srt_content += f"{entry['text']}\n\n"

            # Concatenate audio segments
            combined_audio = audio_segments[0]
            for segment in audio_segments[1:]:
                combined_audio += segment

            # Show save dialog for SRT file
            srt_result = self._window.create_file_dialog(
                webview.FileDialog.SAVE,
                save_filename=f"{self.project_name}.srt",
                file_types=("SRT Files (*.srt)", "All files (*.*)")
            )

            if not srt_result:
                return {"success": False, "error": "User cancelled"}

            srt_path = Path(srt_result) if isinstance(srt_result, str) else Path(srt_result[0])

            # Determine WAV path (same directory, same name but .wav extension)
            wav_path = srt_path.with_suffix(".wav")

            # Save SRT file
            with open(srt_path, "w", encoding="utf-8") as f:
                f.write(srt_content)

            # Export combined audio as WAV
            combined_audio.export(str(wav_path), format="wav")

            logger.info(f"Exported SRT to: {srt_path}")
            logger.info(f"Exported WAV to: {wav_path}")

            return {
                "success": True,
                "srtPath": str(srt_path),
                "wavPath": str(wav_path)
            }

        except Exception as e:
            logger.error(f"Failed to export audio SRT: {e}")
            return {"success": False, "error": str(e)}

    def export_audio_text(self) -> dict:
        """Export audio dialogue text as plain text file (one line per dialogue, no role names)"""
        try:
            if not self.project_data or not self.project_name:
                return {"success": False, "error": "No project loaded"}

            shots = self.project_data.get("shots", [])
            if not shots:
                return {"success": False, "error": "No shots in project"}

            # Collect all dialogue texts
            text_lines = []
            for shot in shots:
                dialogues = shot.get("dialogues", [])
                if not dialogues and shot.get("script"):
                    # Fallback to old format
                    dialogues = [{"text": shot["script"]}]

                for d in dialogues:
                    text = d.get("text", "").strip()
                    if text:
                        text_lines.append(text)

            if not text_lines:
                return {"success": False, "error": "No dialogue text found"}

            # Show save dialog
            result = self._window.create_file_dialog(
                webview.FileDialog.SAVE,
                save_filename=f"{self.project_name}_dialogues.txt",
                file_types=("Text Files (*.txt)", "All files (*.*)")
            )

            if not result:
                return {"success": False, "error": "User cancelled"}

            file_path = Path(result) if isinstance(result, str) else Path(result[0])

            # Save text file
            with open(file_path, "w", encoding="utf-8") as f:
                f.write("\n".join(text_lines))

            logger.info(f"Exported dialogue text to: {file_path}")

            return {"success": True, "path": str(file_path)}

        except Exception as e:
            logger.error(f"Failed to export audio text: {e}")
            return {"success": False, "error": str(e)}

    # Export state
    _export_cancel_flag: bool = False
    _export_thread: Optional[Any] = None

    def export_final_video(self, with_subtitles: bool = True) -> dict:
        """Start exporting final video (async with progress)
        
        Args:
            with_subtitles: Whether to burn subtitles into the video
        """
        import subprocess
        
        try:
            if not self.project_data or not self.project_name:
                return {"success": False, "error": "No project loaded"}

            shots = self.project_data.get("shots", [])
            if not shots:
                return {"success": False, "error": "No shots in project"}

            # Check if already exporting
            if self._export_thread and self._export_thread.is_alive():
                return {"success": False, "error": "Export already in progress"}

            # Check if ffmpeg is available
            ffmpeg_path = self._get_ffmpeg_path()
            try:
                subprocess.run([ffmpeg_path, "-version"], capture_output=True, check=True)
            except (subprocess.CalledProcessError, FileNotFoundError):
                return {"success": False, "error": "ffmpeg not found. Please configure ffmpeg path in Settings."}

            # Show save dialog first
            save_result = self._window.create_file_dialog(
                webview.FileDialog.SAVE,
                save_filename=f"{self.project_name}.mp4",
                file_types=("MP4 Files (*.mp4)", "All files (*.*)")
            )

            if not save_result:
                return {"success": False, "error": "User cancelled"}

            output_path = Path(save_result) if isinstance(save_result, str) else Path(save_result[0])
            if not output_path.suffix:
                output_path = output_path.with_suffix(".mp4")

            # Reset cancel flag and start export thread
            self._export_cancel_flag = False
            ffprobe_path = self._get_ffprobe_path()
            
            import threading
            self._export_thread = threading.Thread(
                target=self._export_final_video_worker,
                args=(shots, str(output_path), with_subtitles, ffmpeg_path, ffprobe_path),
                daemon=True
            )
            self._export_thread.start()

            return {"success": True, "message": "Export started"}

        except Exception as e:
            logger.error(f"Failed to start export: {e}")
            return {"success": False, "error": str(e)}

    def cancel_export_final_video(self) -> dict:
        """Cancel the ongoing export"""
        self._export_cancel_flag = True
        logger.info("Export cancellation requested")
        return {"success": True}

    def _notify_export_progress(self, stage: str, current: int, total: int, message: str) -> None:
        """Notify frontend about export progress"""
        try:
            if self._window:
                progress_json = json.dumps({
                    "stage": stage,
                    "current": current,
                    "total": total,
                    "message": message
                })
                self._window.evaluate_js(f'window.onExportProgress && window.onExportProgress({progress_json})')
        except Exception as e:
            logger.warning(f"Failed to notify export progress: {e}")

    def _export_final_video_worker(self, shots: list, output_path: str, with_subtitles: bool = True, ffmpeg_path: str = "ffmpeg", ffprobe_path: str = "ffprobe") -> None:
        """Worker thread for exporting final video
        
        Args:
            shots: List of shot data
            output_path: Output video file path
            with_subtitles: Whether to burn subtitles into the video
            ffmpeg_path: Path to ffmpeg executable
            ffprobe_path: Path to ffprobe executable
        """
        import tempfile
        import shutil
        import subprocess
        
        temp_dir = None
        try:
            # Count valid shots first
            valid_shots = []
            for shot in shots:
                if self._export_cancel_flag:
                    self._notify_export_progress("cancelled", 0, 0, "Export cancelled by user")
                    return
                    
                shot_id = shot.get("id")
                if not shot_id:
                    continue
                selected_video_index = shot.get("selectedVideoIndex", 0)
                videos = shot.get("videos", [])
                if not videos or selected_video_index >= len(videos):
                    continue
                video_url = videos[selected_video_index]
                video_path = self._url_to_path(video_url)
                if video_path and Path(video_path).exists():
                    valid_shots.append(shot)

            total_shots = len(valid_shots)
            if total_shots == 0:
                self._notify_export_progress("error", 0, 0, "No valid shots to export")
                return

            self._notify_export_progress("preparing", 0, total_shots, "Preparing export...")

            # Create temp directory for intermediate files
            temp_dir = Path(tempfile.mkdtemp(prefix="hetangai_export_"))
            logger.info(f"Created temp directory: {temp_dir}")

            # Process each shot and collect segments
            segment_files = []
            srt_entries = []
            current_time = 0.0
            entry_index = 1

            for shot_idx, shot in enumerate(valid_shots):
                if self._export_cancel_flag:
                    self._notify_export_progress("cancelled", shot_idx, total_shots, "Export cancelled by user")
                    return

                shot_id = shot.get("id")
                self._notify_export_progress("processing", shot_idx, total_shots, f"Processing shot {shot_idx + 1}/{total_shots}")

                # Get selected video path
                selected_video_index = shot.get("selectedVideoIndex", 0)
                videos = shot.get("videos", [])
                video_url = videos[selected_video_index]
                video_path = self._url_to_path(video_url)

                # Get audio path
                audio_url = shot.get("audioUrl", "")
                audio_path = None
                if audio_url:
                    audio_path = self._url_to_path(audio_url)
                    if not audio_path or not Path(audio_path).exists():
                        audio_path = None

                # Get video duration using ffprobe
                video_duration = self._get_media_duration(video_path, ffprobe_path)
                if video_duration is None:
                    logger.warning(f"Failed to get video duration for shot {shot_id}")
                    continue

                # Get audio duration if available
                audio_duration = None
                if audio_path:
                    audio_duration = self._get_media_duration(audio_path, ffprobe_path)
                    if audio_duration is None:
                        audio_path = None

                # Get custom video settings
                custom_speed = shot.get("videoSpeed")
                custom_audio_offset = shot.get("audioOffset", 0.0)
                custom_audio_speed = shot.get("audioSpeed", 1.0)
                custom_audio_trim_start = shot.get("audioTrimStart", 0.0)
                custom_audio_trim_end = shot.get("audioTrimEnd")

                # Convert from string if necessary
                if isinstance(custom_speed, str):
                    try:
                        custom_speed = float(custom_speed)
                    except (ValueError, TypeError):
                        custom_speed = None
                if isinstance(custom_audio_offset, str):
                    try:
                        custom_audio_offset = float(custom_audio_offset)
                    except (ValueError, TypeError):
                        custom_audio_offset = 0.0
                if isinstance(custom_audio_speed, str):
                    try:
                        custom_audio_speed = float(custom_audio_speed)
                    except (ValueError, TypeError):
                        custom_audio_speed = 1.0
                if isinstance(custom_audio_trim_start, str):
                    try:
                        custom_audio_trim_start = float(custom_audio_trim_start)
                    except (ValueError, TypeError):
                        custom_audio_trim_start = 0.0
                if isinstance(custom_audio_trim_end, str):
                    try:
                        custom_audio_trim_end = float(custom_audio_trim_end)
                    except (ValueError, TypeError):
                        custom_audio_trim_end = None

                # Clamp audio speed to valid range
                custom_audio_speed = max(0.5, min(2.0, custom_audio_speed))

                # Calculate segment duration and video settings
                if audio_duration is not None:
                    trim_start = max(0.0, min(custom_audio_trim_start, audio_duration))
                    trim_end = custom_audio_trim_end if custom_audio_trim_end and custom_audio_trim_end > 0 else audio_duration
                    trim_end = max(trim_start + 0.1, min(trim_end, audio_duration))
                    trimmed_audio_duration = trim_end - trim_start
                    effective_audio_duration = trimmed_audio_duration / custom_audio_speed

                    segment_duration = round(effective_audio_duration, 2)

                    if custom_speed is not None and 0.5 <= custom_speed <= 3.0:
                        video_speed = custom_speed
                    else:
                        video_speed = video_duration / segment_duration
                        video_speed = max(0.5, min(3.0, video_speed))

                    video_source_start = math.floor(custom_audio_offset * video_speed * 100) / 100
                    video_source_start = max(0, min(video_source_start, video_duration - 0.1))
                else:
                    segment_duration = round(video_duration, 2)
                    video_speed = 1.0
                    video_source_start = 0.0
                    trim_start = 0.0
                    trimmed_audio_duration = 0.0
                    custom_audio_speed = 1.0

                logger.info(f"Processing shot {shot_id}: duration={segment_duration:.2f}s, video_speed={video_speed:.2f}x")

                # Create segment file
                segment_file = temp_dir / f"segment_{shot_idx:04d}.mp4"
                
                if audio_path and audio_duration is not None:
                    success = self._create_segment_with_audio(
                        video_path=video_path,
                        audio_path=audio_path,
                        output_path=str(segment_file),
                        video_speed=video_speed,
                        video_start=video_source_start,
                        segment_duration=segment_duration,
                        audio_speed=custom_audio_speed,
                        audio_trim_start=trim_start,
                        audio_trim_duration=trimmed_audio_duration,
                        ffmpeg_path=ffmpeg_path
                    )
                else:
                    success = self._create_segment_without_audio(
                        video_path=video_path,
                        output_path=str(segment_file),
                        video_speed=video_speed,
                        video_start=video_source_start,
                        segment_duration=segment_duration,
                        ffmpeg_path=ffmpeg_path
                    )

                if not success:
                    logger.error(f"Failed to create segment for shot {shot_id}")
                    continue

                segment_files.append(str(segment_file))

                # Build subtitle entry
                dialogues = shot.get("dialogues", [])
                if not dialogues and shot.get("script"):
                    script_text = shot["script"]
                    if ":" in script_text:
                        script_text = script_text.split(":", 1)[-1]
                    text_lines = [script_text.strip()] if script_text.strip() else []
                else:
                    text_lines = [d.get("text", "").strip() for d in dialogues if d.get("text", "").strip()]
                
                script_text = " ".join(text_lines)

                if script_text:
                    srt_entries.append({
                        "index": entry_index,
                        "start": current_time,
                        "end": current_time + segment_duration,
                        "text": script_text
                    })
                    entry_index += 1

                current_time += segment_duration

            if self._export_cancel_flag:
                self._notify_export_progress("cancelled", total_shots, total_shots, "Export cancelled by user")
                return

            if not segment_files:
                self._notify_export_progress("error", 0, 0, "No valid segments to export")
                return

            # Merge segments
            self._notify_export_progress("merging", total_shots, total_shots, "Merging video segments...")

            concat_list_file = temp_dir / "concat_list.txt"
            with open(concat_list_file, "w", encoding="utf-8") as f:
                for seg_file in segment_files:
                    escaped_path = seg_file.replace("'", "'\\''")
                    f.write(f"file '{escaped_path}'\n")

            concat_output = temp_dir / "concat_output.mp4"
            concat_cmd = [
                ffmpeg_path, "-y",
                "-f", "concat",
                "-safe", "0",
                "-i", str(concat_list_file),
                "-c", "copy",
                str(concat_output)
            ]
            logger.info(f"Concatenating segments: {' '.join(concat_cmd)}")
            result = subprocess.run(concat_cmd, capture_output=True, text=True)
            if result.returncode != 0:
                logger.error(f"Concat failed: {result.stderr}")
                self._notify_export_progress("error", 0, 0, f"Failed to merge: {result.stderr[:100]}")
                return

            if self._export_cancel_flag:
                self._notify_export_progress("cancelled", total_shots, total_shots, "Export cancelled by user")
                return

            if with_subtitles:
                # Burn subtitles
                self._notify_export_progress("subtitles", total_shots, total_shots, "Burning subtitles...")

                ass_file = temp_dir / "subtitles.ass"
                self._generate_ass_file(srt_entries, str(ass_file))

                ass_path_escaped = str(ass_file).replace("\\", "/").replace(":", "\\:")
                subtitle_cmd = [
                    ffmpeg_path, "-y",
                    "-i", str(concat_output),
                    "-vf", f"ass={ass_path_escaped}",
                    "-c:v", "libx264",
                    "-preset", "medium",
                    "-crf", "18",
                    "-c:a", "aac",
                    "-b:a", "192k",
                    output_path
                ]
                logger.info(f"Burning subtitles: {' '.join(subtitle_cmd)}")
                result = subprocess.run(subtitle_cmd, capture_output=True, text=True)
                if result.returncode != 0:
                    logger.error(f"Subtitle burn failed: {result.stderr}")
                    self._notify_export_progress("error", 0, 0, f"Failed to burn subtitles: {result.stderr[:100]}")
                    return
            else:
                # No subtitles - just copy the concat output to final location
                self._notify_export_progress("subtitles", total_shots, total_shots, "Finalizing video...")
                import shutil as shutil_copy
                shutil_copy.copy2(str(concat_output), output_path)

            if self._export_cancel_flag:
                # If cancelled during final step, try to remove partial output
                try:
                    Path(output_path).unlink(missing_ok=True)
                except:
                    pass
                self._notify_export_progress("cancelled", total_shots, total_shots, "Export cancelled by user")
                return

            logger.info(f"Exported final video to: {output_path}")
            self._notify_export_progress("done", total_shots, total_shots, output_path)

        except Exception as e:
            logger.error(f"Failed to export final video: {e}")
            import traceback
            traceback.print_exc()
            self._notify_export_progress("error", 0, 0, str(e))

        finally:
            # Cleanup temp directory
            if temp_dir:
                try:
                    shutil.rmtree(temp_dir)
                    logger.info(f"Cleaned up temp directory: {temp_dir}")
                except Exception as e:
                    logger.warning(f"Failed to cleanup temp directory: {e}")

    def _get_media_duration(self, file_path: str, ffprobe_path: str = "ffprobe") -> Optional[float]:
        """Get media duration using ffprobe"""
        import subprocess
        try:
            cmd = [
                ffprobe_path,
                "-v", "error",
                "-show_entries", "format=duration",
                "-of", "default=noprint_wrappers=1:nokey=1",
                file_path
            ]
            result = subprocess.run(cmd, capture_output=True, text=True)
            if result.returncode == 0:
                return float(result.stdout.strip())
        except Exception as e:
            logger.warning(f"Failed to get duration for {file_path}: {e}")
        return None

    def _create_segment_with_audio(
        self,
        video_path: str,
        audio_path: str,
        output_path: str,
        video_speed: float,
        video_start: float,
        segment_duration: float,
        audio_speed: float,
        audio_trim_start: float,
        audio_trim_duration: float,
        ffmpeg_path: str = "ffmpeg"
    ) -> bool:
        """Create a video segment with audio using ffmpeg"""
        import subprocess
        try:
            # Calculate PTS factor for video speed (inverse relationship)
            pts_factor = 1.0 / video_speed
            
            # Build complex filter
            # Video: trim, speed adjustment
            video_filter = f"[0:v]trim=start={video_start},setpts={pts_factor}*PTS,setpts=PTS-STARTPTS[v]"
            
            # Audio: trim, speed adjustment using atempo
            # atempo only supports 0.5 to 2.0, chain multiple for larger ranges
            atempo_filters = []
            remaining_speed = audio_speed
            while remaining_speed > 2.0:
                atempo_filters.append("atempo=2.0")
                remaining_speed /= 2.0
            while remaining_speed < 0.5:
                atempo_filters.append("atempo=0.5")
                remaining_speed /= 0.5
            atempo_filters.append(f"atempo={remaining_speed:.6f}")
            atempo_chain = ",".join(atempo_filters)
            
            audio_filter = f"[1:a]atrim=start={audio_trim_start}:duration={audio_trim_duration},asetpts=PTS-STARTPTS,{atempo_chain}[a]"
            
            filter_complex = f"{video_filter};{audio_filter}"
            
            cmd = [
                ffmpeg_path, "-y",
                "-i", video_path,
                "-i", audio_path,
                "-filter_complex", filter_complex,
                "-map", "[v]",
                "-map", "[a]",
                "-t", str(segment_duration),
                "-c:v", "libx264",
                "-preset", "fast",
                "-crf", "18",
                "-c:a", "aac",
                "-b:a", "192k",
                output_path
            ]
            
            logger.debug(f"Creating segment: {' '.join(cmd)}")
            result = subprocess.run(cmd, capture_output=True, text=True)
            if result.returncode != 0:
                logger.error(f"FFmpeg error: {result.stderr}")
                return False
            return True
        except Exception as e:
            logger.error(f"Failed to create segment: {e}")
            return False

    def _create_segment_without_audio(
        self,
        video_path: str,
        output_path: str,
        video_speed: float,
        video_start: float,
        segment_duration: float,
        ffmpeg_path: str = "ffmpeg"
    ) -> bool:
        """Create a video segment without audio using ffmpeg"""
        import subprocess
        try:
            pts_factor = 1.0 / video_speed
            
            video_filter = f"trim=start={video_start},setpts={pts_factor}*PTS,setpts=PTS-STARTPTS"
            
            cmd = [
                ffmpeg_path, "-y",
                "-i", video_path,
                "-vf", video_filter,
                "-t", str(segment_duration),
                "-c:v", "libx264",
                "-preset", "fast",
                "-crf", "18",
                "-an",
                output_path
            ]
            
            logger.debug(f"Creating segment: {' '.join(cmd)}")
            result = subprocess.run(cmd, capture_output=True, text=True)
            if result.returncode != 0:
                logger.error(f"FFmpeg error: {result.stderr}")
                return False
            return True
        except Exception as e:
            logger.error(f"Failed to create segment: {e}")
            return False

    def _generate_ass_file(self, srt_entries: list, output_path: str) -> None:
        """Generate ASS subtitle file with custom styling"""
        # ASS header with style definition
        # WrapStyle: 2 = smart wrapping, end-of-line word wrapping
        # MarginL/MarginR: 200 pixels to prevent text from touching screen edges
        # Alignment: 2 = bottom center
        ass_header = """[Script Info]
Title: HeTangAI Export
ScriptType: v4.00+
WrapStyle: 2
ScaledBorderAndShadow: yes
YCbCr Matrix: TV.709
PlayResX: 1920
PlayResY: 1080

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,Arial,56,&H00FFFFFF,&H000000FF,&H00000000,&H80000000,0,0,0,0,100,100,0,0,1,3,1,2,200,200,50,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
"""
        
        def format_ass_time(seconds: float) -> str:
            """Format time as H:MM:SS.CC (centiseconds)"""
            hours = int(seconds // 3600)
            minutes = int((seconds % 3600) // 60)
            secs = int(seconds % 60)
            centisecs = int((seconds % 1) * 100)
            return f"{hours}:{minutes:02d}:{secs:02d}.{centisecs:02d}"
        
        with open(output_path, "w", encoding="utf-8") as f:
            f.write(ass_header)
            for entry in srt_entries:
                start = format_ass_time(entry["start"])
                end = format_ass_time(entry["end"])
                # Escape special characters and replace newlines
                text = entry["text"].replace("\\", "\\\\").replace("{", "\\{").replace("}", "\\}")
                text = text.replace("\n", "\\N")
                f.write(f"Dialogue: 0,{start},{end},Default,,0,0,0,,{text}\n")

    # ========== Project Settings APIs (作品信息与创作参数) ==========

    def get_styles(self) -> dict:
        """Get available style presets from assets/styles/styles.json"""
        try:
            styles_file = Path(__file__).parent / "assets" / "styles" / "styles.json"
            if not styles_file.exists():
                logger.warning(f"Styles file not found: {styles_file}")
                return {"success": True, "styles": []}

            with open(styles_file, "r", encoding="utf-8") as f:
                styles = json.load(f)

            logger.info(f"Loaded {len(styles)} style presets")
            return {"success": True, "styles": styles}
        except Exception as e:
            logger.error(f"Failed to load styles: {e}")
            return {"success": False, "error": str(e)}

    def get_project_settings(self) -> dict:
        """Get project settings (work info and creation params)"""
        try:
            if not self.project_data:
                return {"success": False, "error": "No project loaded"}

            settings = self.project_data.get("settings", self._get_default_project_settings())
            return {"success": True, "settings": settings}
        except Exception as e:
            logger.error(f"Failed to get project settings: {e}")
            return {"success": False, "error": str(e)}

    def _get_default_project_settings(self) -> dict:
        """Get default project settings"""
        return {
            "workInfo": {
                "title": "",
                "coverImage": "",
                "description": "",
            },
            "creationParams": {
                "style": {
                    "type": "preset",
                    "presetId": None,
                    "customPrompt": "",
                },
                "language": "zh",
                "aspectRatio": "16:9",
            },
        }

    def _get_style_info(self) -> dict:
        """Get style text and image path from project settings
        Returns: {"text": str, "imagePath": str or None}
        """
        if not self.project_data:
            return {"text": "", "imagePath": None}

        settings_data = self.project_data.get("settings", self._get_default_project_settings())
        creation_params = settings_data.get("creationParams", {})
        style = creation_params.get("style", {})

        style_text = ""
        style_image_path = None

        if style.get("type") == "preset" and style.get("presetId") is not None:
            # Load style from styles.json
            styles_file = Path(__file__).parent / "assets" / "styles" / "styles.json"
            if styles_file.exists():
                with open(styles_file, "r", encoding="utf-8") as f:
                    styles = json.load(f)
                    for s in styles:
                        if s.get("id") == style.get("presetId"):
                            style_text = f"{s.get('name_cn', '')} style, {s.get('desc', '')}"
                            # Get style image path
                            style_image = s.get("image", "")
                            if style_image:
                                style_image_path = str(Path(__file__).parent / "assets" / "styles" / style_image)
                            break
        elif style.get("type") == "custom" and style.get("customPrompt"):
            style_text = style.get("customPrompt", "")
            # Get custom style preview image
            preview_url = style.get("previewUrl", "")
            if preview_url:
                style_image_path = self._url_to_path(preview_url)

        return {"text": style_text, "imagePath": style_image_path}

    def save_project_settings(self, settings: dict) -> dict:
        """Save project settings"""
        try:
            if not self.project_data:
                return {"success": False, "error": "No project loaded"}

            self.project_data["settings"] = settings

            # Save to work directory if project has a name
            if self.project_name:
                self.save_project_to_workdir(self.project_name)

            logger.info("Saved project settings")
            return {"success": True}
        except Exception as e:
            logger.error(f"Failed to save project settings: {e}")
            return {"success": False, "error": str(e)}

    def generate_work_info(self) -> dict:
        """Generate work info (title and description) based on project content using LLM"""
        try:
            if not self.project_data:
                return {"success": False, "error": "No project loaded"}

            # Gather project content for analysis
            shots = self.project_data.get("shots", [])
            characters = self.project_data.get("characters", [])
            scenes = self.project_data.get("scenes", [])

            if not shots:
                return {"success": False, "error": "No shots in project"}

            # Build context from project data
            context_parts = []

            # Characters
            if characters:
                char_names = [c.get("name", "") for c in characters if c.get("name")]
                if char_names:
                    context_parts.append(f"角色: {', '.join(char_names)}")

            # Scenes
            if scenes:
                scene_names = [s.get("name", "") for s in scenes if s.get("name")]
                if scene_names:
                    context_parts.append(f"场景: {', '.join(scene_names)}")

            # Dialogues (sample first 10 shots)
            dialogues = []
            for shot in shots[:10]:
                shot_dialogues = shot.get("dialogues", [])
                for d in shot_dialogues:
                    role = d.get("role", "")
                    text = d.get("text", "")
                    if role and text:
                        dialogues.append(f"{role}: {text}")
            if dialogues:
                context_parts.append(f"对话摘要:\n" + "\n".join(dialogues[:20]))

            context = "\n\n".join(context_parts)

            # Call LLM to generate work info
            settings = self._load_settings()
            shot_builder_config = settings.get("shotBuilder", {})
            api_url = shot_builder_config.get("apiUrl", "")
            api_key = shot_builder_config.get("apiKey", "")
            model = shot_builder_config.get("model", "")

            if not api_url or not api_key:
                return {"success": False, "error": "Shot builder API not configured"}

            from services.stream_llm import call_llm_stream

            prompt = f"""根据以下视频项目内容，生成一个吸引人的作品名和作品介绍。

项目内容:
{context}

请以 JSON 格式返回，包含以下字段:
- title: 作品名（简洁有吸引力，10字以内）
- description: 作品介绍（50-100字，描述故事梗概和看点）

只返回 JSON，不要其他内容。"""

            # Collect streaming response
            response_lines = []
            for line in call_llm_stream(prompt, model=model, api_key=api_key, base_url=api_url, use_env=False):
                response_lines.append(line)
            response = "\n".join(response_lines)

            # Parse JSON response
            try:
                # Try to extract JSON from response
                import re
                json_match = re.search(r'\{[^{}]*\}', response, re.DOTALL)
                if json_match:
                    work_info = json.loads(json_match.group())
                else:
                    work_info = json.loads(response)

                result = {
                    "title": work_info.get("title", ""),
                    "description": work_info.get("description", ""),
                    "coverImage": "",
                }
                logger.info(f"Generated work info: {result}")
                return {"success": True, "workInfo": result}
            except json.JSONDecodeError as e:
                logger.error(f"Failed to parse LLM response: {e}, response: {response}")
                return {"success": False, "error": "Failed to parse AI response"}

        except Exception as e:
            logger.error(f"Failed to generate work info: {e}")
            return {"success": False, "error": str(e)}

    def chat_update_work_info(self, message: str, history: list) -> dict:
        """Update work info through AI chat conversation"""
        try:
            if not self.project_data:
                return {"success": False, "error": "No project loaded"}

            # Get current work info
            settings = self.project_data.get("settings", self._get_default_project_settings())
            current_work_info = settings.get("workInfo", {})

            # Call LLM with conversation history
            app_settings = self._load_settings()
            shot_builder_config = app_settings.get("shotBuilder", {})
            api_url = shot_builder_config.get("apiUrl", "")
            api_key = shot_builder_config.get("apiKey", "")
            model = shot_builder_config.get("model", "")

            if not api_url or not api_key:
                return {"success": False, "error": "Shot builder API not configured"}

            from services.stream_llm import call_llm_stream

            system_prompt = f"""你是一个视频创作助手，帮助用户优化作品名和作品介绍。

当前作品信息:
- 作品名: {current_work_info.get('title', '未设置')}
- 作品介绍: {current_work_info.get('description', '未设置')}

用户可能会要求你:
1. 优化作品名（更有吸引力、更诗意、更简洁等）
2. 修改作品介绍（更详细、更简洁、换个角度等）
3. 同时修改两者

请根据用户的要求进行修改，并以 JSON 格式返回更新后的信息:
{{"title": "新作品名", "description": "新作品介绍", "reply": "你的回复说明"}}

如果用户只是在聊天没有要求修改，reply字段回复即可，title和description保持原值。
只返回 JSON，不要其他内容。"""

            # Build messages from history
            messages = [{"role": "system", "content": system_prompt}]
            for h in history:
                messages.append({"role": h.get("role", "user"), "content": h.get("content", "")})
            messages.append({"role": "user", "content": message})

            # Collect streaming response
            response_lines = []
            for line in call_llm_stream(messages, model=model, api_key=api_key, base_url=api_url, use_env=False):
                response_lines.append(line)
            response = "\n".join(response_lines)

            # Parse JSON response
            try:
                import re
                json_match = re.search(r'\{[^{}]*\}', response, re.DOTALL)
                if json_match:
                    result = json.loads(json_match.group())
                else:
                    result = json.loads(response)

                work_info = {
                    "title": result.get("title", current_work_info.get("title", "")),
                    "description": result.get("description", current_work_info.get("description", "")),
                    "coverImage": current_work_info.get("coverImage", ""),
                }
                reply = result.get("reply", "已更新")

                logger.info(f"Chat updated work info: {work_info}")
                return {"success": True, "reply": reply, "workInfo": work_info}
            except json.JSONDecodeError as e:
                logger.error(f"Failed to parse LLM response: {e}, response: {response}")
                # Return the raw response as reply
                return {"success": True, "reply": response, "workInfo": current_work_info}

        except Exception as e:
            logger.error(f"Failed to chat update work info: {e}")
            return {"success": False, "error": str(e)}

    def upload_cover_image(self) -> dict:
        """Upload cover image for the project"""
        try:
            if not self._window:
                return {"success": False, "error": "Window not initialized"}

            if not self.project_data or not self.project_name:
                return {"success": False, "error": "No project loaded"}

            # Open file dialog
            result = self._window.create_file_dialog(
                webview.FileDialog.OPEN,
                allow_multiple=False,
                file_types=("Image Files (*.png;*.jpg;*.jpeg;*.webp)", "All files (*.*)")
            )

            if not result or len(result) == 0:
                return {"success": False, "error": "No file selected"}

            source_path = Path(result[0])

            # Get project output directory
            work_dir = self._project_manager.work_dir
            project_dir = work_dir / self.project_name / "output"
            project_dir.mkdir(parents=True, exist_ok=True)

            # Copy file to project directory
            import shutil
            dest_filename = f"cover{source_path.suffix}"
            dest_path = project_dir / dest_filename
            shutil.copy2(source_path, dest_path)

            # Convert to URL
            image_url = self._path_to_url(str(dest_path))

            logger.info(f"Uploaded cover image: {dest_path}")
            return {"success": True, "imageUrl": image_url}

        except Exception as e:
            logger.error(f"Failed to upload cover image: {e}")
            return {"success": False, "error": str(e)}

    def generate_cover_image(self) -> dict:
        """Generate cover image for the project using AI (async via task system)"""
        try:
            if not self.project_data or not self.project_name:
                return {"success": False, "error": "No project loaded"}

            if not self._task_manager:
                return {"success": False, "error": "Task system not initialized"}

            # Build prompt from project data
            settings_data = self.project_data.get("settings", self._get_default_project_settings())
            work_info = settings_data.get("workInfo", {})
            creation_params = settings_data.get("creationParams", {})

            title = work_info.get("title", "")
            description = work_info.get("description", "")

            # Get style info
            style = creation_params.get("style", {})
            style_prompt = ""
            if style.get("type") == "preset" and style.get("presetId") is not None:
                # Load style from styles.json
                styles_file = Path(__file__).parent / "assets" / "styles" / "styles.json"
                if styles_file.exists():
                    with open(styles_file, "r", encoding="utf-8") as f:
                        styles = json.load(f)
                        for s in styles:
                            if s.get("id") == style.get("presetId"):
                                style_prompt = s.get("name_cn", "") + " style, " + s.get("desc", "")[:100]
                                break
            elif style.get("type") == "custom" and style.get("customPrompt"):
                style_prompt = style.get("customPrompt", "")

            # Build cover prompt
            prompt_parts = []
            if title:
                prompt_parts.append(f"Title: {title}")
            if description:
                prompt_parts.append(f"Story: {description[:200]}")
            if style_prompt:
                prompt_parts.append(f"Style: {style_prompt}")

            prompt = "Generate a movie poster or cover image. " + " ".join(prompt_parts)
            if not prompt_parts:
                prompt = "Generate a cinematic movie poster with dramatic lighting"

            # Get TTI settings
            app_settings = self._load_settings()
            tti_config = app_settings.get("tti", {})
            provider = tti_config.get("provider", "openai")

            # Determine aspect ratio
            aspect_ratio = creation_params.get("aspectRatio", "16:9")

            # Get output path
            work_dir = self._project_manager.work_dir
            project_dir = work_dir / self.project_name / "output"
            project_dir.mkdir(parents=True, exist_ok=True)

            # Create image task
            task_id = self._task_manager.create_image_task(
                subtype='text2image',
                prompt=prompt,
                aspect_ratio=aspect_ratio,
                provider=provider,
                project_id=self._get_project_id(),
                output_dir=str(project_dir),
            )

            # Store task ID in project data
            self.project_data['coverTaskId'] = task_id

            logger.info(f"Created cover image task: {task_id}")
            return {"success": True, "task_id": task_id}

        except Exception as e:
            logger.error(f"Failed to create cover image task: {e}")
            return {"success": False, "error": str(e)}

    def export_cover_image(self) -> dict:
        """Export cover image to user-selected location"""
        try:
            if not self._window:
                return {"success": False, "error": "Window not initialized"}

            if not self.project_data or not self.project_name:
                return {"success": False, "error": "No project loaded"}

            # Get current cover image path
            settings_data = self.project_data.get("settings", self._get_default_project_settings())
            work_info = settings_data.get("workInfo", {})
            cover_url = work_info.get("coverImage", "")

            if not cover_url:
                return {"success": False, "error": "No cover image to export"}

            # Try to find cover image in project output directory first
            work_dir = self._project_manager.work_dir
            project_dir = work_dir / self.project_name / "output"
            cover_path = project_dir / "cover.png"

            # If not found, try to parse from URL
            if not cover_path.exists():
                parsed_path = self._url_to_path(cover_url)
                cover_path = Path(parsed_path)

            logger.info(f"Export cover: URL={cover_url}, resolved path={cover_path}")

            if not cover_path.exists():
                return {"success": False, "error": f"Cover image file not found: {cover_path}"}

            # Open save dialog
            result = self._window.create_file_dialog(
                webview.FileDialog.SAVE,
                save_filename=f"{self.project_name}_cover{cover_path.suffix}",
                file_types=("Image Files (*.png;*.jpg;*.jpeg;*.webp)", "All files (*.*)")
            )

            if not result:
                return {"success": False, "error": "No file selected"}

            dest_path = Path(result)

            # Copy file
            import shutil
            shutil.copy2(cover_path, dest_path)

            logger.info(f"Exported cover image to: {dest_path}")
            return {"success": True, "path": str(dest_path)}

        except Exception as e:
            logger.error(f"Failed to export cover image: {e}")
            return {"success": False, "error": str(e)}

    def generate_style_preview(self, prompt: str) -> dict:
        """Generate a preview image for custom style description (async via task system)"""
        try:
            if not prompt or not prompt.strip():
                return {"success": False, "error": "Style description is required"}

            if not self.project_data or not self.project_name:
                return {"success": False, "error": "No project loaded"}

            if not self._task_manager:
                return {"success": False, "error": "Task system not initialized"}

            # Get TTI settings
            app_settings = self._load_settings()
            tti_config = app_settings.get("tti", {})
            provider = tti_config.get("provider", "openai")

            # Get output path in project directory
            work_dir = self._project_manager.work_dir
            preview_dir = work_dir / self.project_name / "output" / "style_previews"
            preview_dir.mkdir(parents=True, exist_ok=True)

            # Build prompt for style preview
            full_prompt = f"Create a sample image demonstrating this visual style: {prompt.strip()}. Show a beautiful landscape or scene that captures the essence of this style."

            # Create image task
            task_id = self._task_manager.create_image_task(
                subtype='text2image',
                prompt=full_prompt,
                aspect_ratio='16:9',
                provider=provider,
                project_id=self._get_project_id(),
                output_dir=str(preview_dir),
            )

            # Store task ID in project data
            self.project_data['styleTaskId'] = task_id

            logger.info(f"Created style preview task: {task_id}")
            return {"success": True, "task_id": task_id}

        except Exception as e:
            logger.error(f"Failed to create style preview task: {e}")
            return {"success": False, "error": str(e)}

    # ========== Task Management API ==========

    def get_task_summary(self) -> dict:
        """Get task summary (counts by type and status)"""
        # Return empty summary if no task manager (no project loaded)
        if not self._task_manager:
            empty_counts = {"pending": 0, "paused": 0, "running": 0, "success": 0, "failed": 0, "cancelled": 0}
            return {
                "success": True,
                "data": {
                    "image": empty_counts.copy(),
                    "video": empty_counts.copy(),
                    "audio": empty_counts.copy(),
                    "total": empty_counts.copy(),
                }
            }

        try:
            summary = self._task_manager.get_summary()
            return {"success": True, "data": summary}
        except Exception as e:
            logger.error(f"Failed to get task summary: {e}")
            return {"success": False, "error": str(e)}

    def list_tasks(self, task_type: str = None, status: str = None,
                   offset: int = 0, limit: int = 50) -> dict:
        """List tasks with optional filtering"""
        if not self._task_manager:
            return {"success": False, "error": "No project loaded"}

        try:
            tasks = self._task_manager.list_tasks(task_type, status, offset, limit)
            return {"success": True, "data": tasks}
        except Exception as e:
            logger.error(f"Failed to list tasks: {e}")
            return {"success": False, "error": str(e)}

    def get_task(self, task_type: str, task_id: str) -> dict:
        """Get a single task by type and ID"""
        if not self._task_manager:
            return {"success": False, "error": "No project loaded"}

        try:
            task = self._task_manager.get_task(task_type, task_id)
            if task:
                return {"success": True, "data": task}
            else:
                return {"success": False, "error": "Task not found"}
        except Exception as e:
            logger.error(f"Failed to get task: {e}")
            return {"success": False, "error": str(e)}

    def poll_tasks(self, task_refs: List[str]) -> dict:
        """Poll multiple tasks by reference (e.g., ['image:xxx', 'video:yyy'])"""
        if not self._task_manager:
            return {"success": False, "error": "No project loaded"}

        try:
            results = self._task_manager.poll_tasks(task_refs)
            return {"success": True, "data": results}
        except Exception as e:
            logger.error(f"Failed to poll tasks: {e}")
            return {"success": False, "error": str(e)}

    def pause_task(self, task_type: str, task_id: str) -> dict:
        """Pause a pending task"""
        if not self._task_manager:
            return {"success": False, "error": "No project loaded"}

        try:
            success = self._task_manager.pause_task(task_type, task_id)
            return {"success": success}
        except Exception as e:
            logger.error(f"Failed to pause task: {e}")
            return {"success": False, "error": str(e)}

    def resume_task(self, task_type: str, task_id: str) -> dict:
        """Resume a paused task"""
        if not self._task_manager:
            return {"success": False, "error": "No project loaded"}

        try:
            success = self._task_manager.resume_task(task_type, task_id)
            return {"success": success}
        except Exception as e:
            logger.error(f"Failed to resume task: {e}")
            return {"success": False, "error": str(e)}

    def cancel_task(self, task_type: str, task_id: str) -> dict:
        """Cancel a pending/paused task"""
        if not self._task_manager:
            return {"success": False, "error": "No project loaded"}

        try:
            success = self._task_manager.cancel_task(task_type, task_id)
            return {"success": success}
        except Exception as e:
            logger.error(f"Failed to cancel task: {e}")
            return {"success": False, "error": str(e)}

    def retry_task(self, task_type: str, task_id: str) -> dict:
        """Retry a failed/cancelled task"""
        if not self._task_manager:
            return {"success": False, "error": "No project loaded"}

        try:
            success = self._task_manager.retry_task(task_type, task_id)
            return {"success": success}
        except Exception as e:
            logger.error(f"Failed to retry task: {e}")
            return {"success": False, "error": str(e)}

    def pause_all_tasks(self, task_type: str = None) -> dict:
        """Pause all pending tasks"""
        if not self._task_manager:
            return {"success": False, "error": "No project loaded"}

        try:
            count = self._task_manager.pause_all(task_type)
            return {"success": True, "count": count}
        except Exception as e:
            logger.error(f"Failed to pause all tasks: {e}")
            return {"success": False, "error": str(e)}

    def resume_all_tasks(self, task_type: str = None) -> dict:
        """Resume all paused tasks"""
        if not self._task_manager:
            return {"success": False, "error": "No project loaded"}

        try:
            count = self._task_manager.resume_all(task_type)
            return {"success": True, "count": count}
        except Exception as e:
            logger.error(f"Failed to resume all tasks: {e}")
            return {"success": False, "error": str(e)}

    def cancel_all_pending_tasks(self, task_type: str = None) -> dict:
        """Cancel all pending/paused tasks"""
        if not self._task_manager:
            return {"success": False, "error": "No project loaded"}

        try:
            count = self._task_manager.cancel_all_pending(task_type)
            return {"success": True, "count": count}
        except Exception as e:
            logger.error(f"Failed to cancel all tasks: {e}")
            return {"success": False, "error": str(e)}

    def get_executor_status(self) -> dict:
        """Get status of all task executors
        
        Returns:
            dict with:
            - data: list of executor status objects
            - summary: counts by type (total/busy)
        """
        executors = []
        summary = {
            'image': {'total': 0, 'busy': 0},
            'video': {'total': 0, 'busy': 0},
            'audio': {'total': 0, 'busy': 0}
        }
        
        for i, executor in enumerate(self._task_executors):
            task_type = executor.task_type
            is_busy = executor._current_task_id is not None
            
            # Get thread status
            thread_alive = False
            if i < len(self._task_executor_threads):
                thread_alive = self._task_executor_threads[i].is_alive()
            
            # Get current task info if busy
            current_task = None
            if is_busy and self._task_manager:
                try:
                    result = self._task_manager.get_task(task_type, executor._current_task_id)
                    if result.get('success'):
                        current_task = result.get('data')
                except Exception:
                    pass
            
            # Get current config (dynamically loaded)
            config_info = {}
            if hasattr(executor, '_load_config'):
                try:
                    api_url, api_key, model = executor._load_config()
                    config_info = {
                        'api_url': api_url or '',
                        'api_key': api_key or '',
                        'model': model or '',
                        'settings_file': getattr(executor, '_settings_file', ''),
                        'config_key': getattr(executor, '_config_key', ''),
                    }
                except Exception as e:
                    config_info = {'error': str(e)}
            
            executors.append({
                'worker_id': executor.worker_id,
                'task_type': task_type,
                'running': executor._running,
                'current_task_id': executor._current_task_id,
                'current_task': current_task,
                'thread_alive': thread_alive,
                'heartbeat_interval': getattr(executor, 'heartbeat_interval', 10),
                'lock_timeout': getattr(executor, 'lock_timeout', 60),
                'config': config_info,
            })
            
            # Update summary
            summary[task_type]['total'] += 1
            if is_busy:
                summary[task_type]['busy'] += 1
        
        return {
            'success': True,
            'data': executors,
            'summary': summary
        }

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
        depends_on: str = None
    ) -> dict:
        """Create an image generation task"""
        if not self._task_manager:
            return {"success": False, "error": "No project loaded"}

        try:
            # Use project shots directory if output_dir not specified
            if not output_dir and self.project_name:
                output_dir = str(self._project_manager.get_project_dir(self.project_name) / "images")

            task_id = self._task_manager.create_image_task(
                subtype=subtype,
                prompt=prompt,
                aspect_ratio=aspect_ratio,
                provider=provider,
                project_id=self._get_project_id(),
                resolution=resolution,
                reference_images=reference_images,
                output_dir=output_dir,
                priority=priority,
                depends_on=depends_on
            )
            return {"success": True, "taskId": task_id}
        except Exception as e:
            logger.error(f"Failed to create image task: {e}")
            return {"success": False, "error": str(e)}

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
        depends_on: str = None
    ) -> dict:
        """Create a video generation task"""
        if not self._task_manager:
            return {"success": False, "error": "No project loaded"}

        try:
            # Use project shots directory if output_dir not specified
            if not output_dir and self.project_name:
                output_dir = str(self._project_manager.get_project_dir(self.project_name) / "videos")

            task_id = self._task_manager.create_video_task(
                subtype=subtype,
                prompt=prompt,
                aspect_ratio=aspect_ratio,
                provider=provider,
                project_id=self._get_project_id(),
                resolution=resolution,
                reference_images=reference_images,
                duration=duration,
                output_dir=output_dir,
                priority=priority,
                depends_on=depends_on
            )
            return {"success": True, "taskId": task_id}
        except Exception as e:
            logger.error(f"Failed to create video task: {e}")
            return {"success": False, "error": str(e)}

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
        depends_on: str = None
    ) -> dict:
        """Create an audio generation task"""
        if not self._task_manager:
            return {"success": False, "error": "No project loaded"}

        try:
            # Use project shots directory if output_dir not specified
            if not output_dir and self.project_name:
                output_dir = str(self._project_manager.get_project_dir(self.project_name) / "audio")

            task_id = self._task_manager.create_audio_task(
                text=text,
                provider=provider,
                project_id=self._get_project_id(),
                voice_ref=voice_ref,
                emotion=emotion,
                emotion_intensity=emotion_intensity,
                speed=speed,
                output_dir=output_dir,
                priority=priority,
                depends_on=depends_on
            )
            return {"success": True, "taskId": task_id}
        except Exception as e:
            logger.error(f"Failed to create audio task: {e}")
            return {"success": False, "error": str(e)}
