"""
生成任务数据库模型

使用 peewee + SQLite，每个项目独立数据库
"""

from datetime import datetime
from enum import Enum
from peewee import (
    Model, CharField, TextField, IntegerField, FloatField,
    DateTimeField, DatabaseProxy
)

# 数据库代理，运行时绑定具体数据库
database_proxy = DatabaseProxy()


class TaskStatus(str, Enum):
    """任务状态"""
    PENDING = 'pending'      # 等待执行
    PAUSED = 'paused'        # 已暂停
    RUNNING = 'running'      # 执行中
    SUCCESS = 'success'      # 执行成功
    FAILED = 'failed'        # 执行失败
    CANCELLED = 'cancelled'  # 已取消


class BaseTask(Model):
    """任务基类"""
    
    # 基础字段
    id = CharField(primary_key=True, max_length=36)
    subtype = CharField(max_length=20)
    status = CharField(max_length=20, default=TaskStatus.PENDING.value)
    priority = IntegerField(default=100)
    depends_on = TextField(null=True)
    
    # 结果字段
    result_url = TextField(null=True)
    result_local_path = TextField(null=True)
    error = TextField(null=True)
    
    # 控制字段
    max_retries = IntegerField(default=3)
    retry_count = IntegerField(default=0)
    timeout_seconds = IntegerField(default=300)
    expire_at = DateTimeField(null=True)
    locked_by = CharField(max_length=64, null=True)
    locked_at = DateTimeField(null=True)
    started_at = DateTimeField(null=True)  # 任务开始执行时间（不随心跳更新）
    created_at = DateTimeField(default=datetime.now)
    updated_at = DateTimeField(default=datetime.now)
    completed_at = DateTimeField(null=True)
    
    class Meta:
        database = database_proxy
    
    def to_dict(self) -> dict:
        """转换为字典"""
        return {
            'id': self.id,
            'subtype': self.subtype,
            'status': self.status,
            'priority': self.priority,
            'depends_on': self.depends_on,
            'result_url': self.result_url,
            'result_local_path': self.result_local_path,
            'error': self.error,
            'max_retries': self.max_retries,
            'retry_count': self.retry_count,
            'timeout_seconds': self.timeout_seconds,
            'expire_at': self.expire_at.isoformat() if self.expire_at else None,
            'locked_by': self.locked_by,
            'locked_at': self.locked_at.isoformat() if self.locked_at else None,
            'started_at': self.started_at.isoformat() if self.started_at else None,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None,
            'completed_at': self.completed_at.isoformat() if self.completed_at else None,
        }


class ImageTask(BaseTask):
    """图片生成任务
    
    subtype:
    - text2image: 文生图
    - image2image: 图生图
    """
    
    # 任务参数
    prompt = TextField()
    aspect_ratio = CharField(max_length=10)
    resolution = CharField(max_length=20, null=True)
    reference_images = TextField(null=True)  # 逗号分隔的路径
    provider = CharField(max_length=20)
    output_dir = TextField(null=True)
    
    # 业务关联字段
    shot_id = CharField(max_length=36, null=True)  # 关联的镜头ID
    shot_sequence = IntegerField(null=True)  # 镜头序号（用于显示）
    slot = IntegerField(null=True)  # 图片槽位 1-4
    processed = IntegerField(default=0)  # 是否已处理回写 0/1
    
    class Meta:
        table_name = 'image_task'
        indexes = (
            (('status', 'priority', 'created_at'), False),
            (('expire_at',), False),
            (('shot_id',), False),
        )
    
    def to_dict(self) -> dict:
        data = super().to_dict()
        data.update({
            'task_type': 'image',
            'prompt': self.prompt,
            'aspect_ratio': self.aspect_ratio,
            'resolution': self.resolution,
            'reference_images': self.reference_images,
            'provider': self.provider,
            'output_dir': self.output_dir,
            'shot_id': self.shot_id,
            'shot_sequence': self.shot_sequence,
            'slot': self.slot,
            'processed': self.processed,
        })
        return data


class VideoTask(BaseTask):
    """视频生成任务
    
    subtype:
    - text2video: 文生视频
    - frames2video: 首尾帧生视频（reference_images: 第1张=首帧，第2张=尾帧）
    - reference2video: 多参考图生视频
    """
    
    # 任务参数
    prompt = TextField()
    aspect_ratio = CharField(max_length=10)
    resolution = CharField(max_length=20, null=True)
    reference_images = TextField(null=True)  # 含义取决于 subtype
    duration = IntegerField(default=5)
    provider = CharField(max_length=20)
    output_dir = TextField(null=True)
    
    # 业务关联字段
    shot_id = CharField(max_length=36, null=True)  # 关联的镜头ID
    shot_sequence = IntegerField(null=True)  # 镜头序号（用于显示）
    processed = IntegerField(default=0)  # 是否已处理回写 0/1
    
    class Meta:
        table_name = 'video_task'
        indexes = (
            (('status', 'priority', 'created_at'), False),
            (('expire_at',), False),
            (('shot_id',), False),
        )
    
    def to_dict(self) -> dict:
        data = super().to_dict()
        data.update({
            'task_type': 'video',
            'prompt': self.prompt,
            'aspect_ratio': self.aspect_ratio,
            'resolution': self.resolution,
            'reference_images': self.reference_images,
            'duration': self.duration,
            'provider': self.provider,
            'output_dir': self.output_dir,
            'shot_id': self.shot_id,
            'shot_sequence': self.shot_sequence,
            'processed': self.processed,
        })
        return data


class AudioTask(BaseTask):
    """音频生成任务
    
    subtype:
    - text2speech: 文本转语音
    """
    
    # 任务参数
    text = TextField()
    voice_ref = TextField(null=True)
    emotion = CharField(max_length=20, null=True)
    emotion_intensity = CharField(max_length=20, null=True)
    speed = FloatField(default=1.0)
    provider = CharField(max_length=20)
    output_dir = TextField(null=True)
    
    # 额外结果字段
    result_duration_ms = IntegerField(null=True)
    
    # 业务关联字段
    shot_id = CharField(max_length=36, null=True)  # 关联的镜头ID
    shot_sequence = IntegerField(null=True)  # 镜头序号（用于显示）
    dialogue_index = IntegerField(null=True)  # 对话索引（镜头内多段对话）
    processed = IntegerField(default=0)  # 是否已处理回写 0/1
    
    class Meta:
        table_name = 'audio_task'
        indexes = (
            (('status', 'priority', 'created_at'), False),
            (('expire_at',), False),
            (('shot_id',), False),
        )
    
    def to_dict(self) -> dict:
        data = super().to_dict()
        data.update({
            'task_type': 'audio',
            'text': self.text,
            'voice_ref': self.voice_ref,
            'emotion': self.emotion,
            'emotion_intensity': self.emotion_intensity,
            'speed': self.speed,
            'provider': self.provider,
            'output_dir': self.output_dir,
            'result_duration_ms': self.result_duration_ms,
            'shot_id': self.shot_id,
            'shot_sequence': self.shot_sequence,
            'dialogue_index': self.dialogue_index,
            'processed': self.processed,
        })
        return data


# 任务类型映射
TASK_MODELS = {
    'image': ImageTask,
    'video': VideoTask,
    'audio': AudioTask,
}


def get_task_model(task_type: str) -> type:
    """获取任务模型类"""
    if task_type not in TASK_MODELS:
        raise ValueError(f"Unknown task type: {task_type}")
    return TASK_MODELS[task_type]
