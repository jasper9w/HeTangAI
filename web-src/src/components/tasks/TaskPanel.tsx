/**
 * Task panel component - displays task list with filtering and actions
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  X,
  Pause,
  Play,
  RefreshCw,
  Trash2,
  Image,
  Video,
  Music,
  Loader2,
  CheckCircle,
  XCircle,
  Clock,
  PauseCircle,
  AlertCircle,
  Cpu,
  Activity,
  CircleDot,
} from 'lucide-react';
import { ImagePreviewModal } from '../ui/ImagePreviewModal';
import { VideoModal } from '../ui/VideoModal';
import type { Task, TaskType, TaskStatus, TaskSummary, ExecutorStatus, ExecutorSummary } from '../../types';

interface TaskPanelProps {
  isOpen: boolean;
  onClose: () => void;
  summary: TaskSummary;
  onRefresh: () => void;
}

type FilterType = 'all' | TaskType;
type FilterStatus = 'all' | TaskStatus;

const STATUS_LABELS: Record<TaskStatus, string> = {
  pending: '等待中',
  paused: '已暂停',
  running: '执行中',
  success: '已完成',
  failed: '失败',
  cancelled: '已取消',
};

const STATUS_CONFIG: Record<TaskStatus, { icon: React.ReactNode; color: string; bg: string }> = {
  pending: {
    icon: <Clock className="w-3.5 h-3.5" />,
    color: 'text-slate-400',
    bg: 'bg-slate-500/20',
  },
  paused: {
    icon: <PauseCircle className="w-3.5 h-3.5" />,
    color: 'text-amber-400',
    bg: 'bg-amber-500/20',
  },
  running: {
    icon: <Loader2 className="w-3.5 h-3.5 animate-spin" />,
    color: 'text-teal-400',
    bg: 'bg-teal-500/20',
  },
  success: {
    icon: <CheckCircle className="w-3.5 h-3.5" />,
    color: 'text-emerald-400',
    bg: 'bg-emerald-500/20',
  },
  failed: {
    icon: <XCircle className="w-3.5 h-3.5" />,
    color: 'text-red-400',
    bg: 'bg-red-500/20',
  },
  cancelled: {
    icon: <XCircle className="w-3.5 h-3.5" />,
    color: 'text-slate-500',
    bg: 'bg-slate-600/30',
  },
};

const TYPE_CONFIG: Record<TaskType, { icon: React.ReactNode; label: string }> = {
  image: { icon: <Image className="w-4 h-4" />, label: '图片' },
  video: { icon: <Video className="w-4 h-4" />, label: '视频' },
  audio: { icon: <Music className="w-4 h-4" />, label: '音频' },
};

type PanelTab = 'tasks' | 'executors';

export const TaskPanel: React.FC<TaskPanelProps> = ({
  isOpen,
  onClose,
  summary,
  onRefresh,
}) => {
  // Main tab state
  const [activeTab, setActiveTab] = useState<PanelTab>('tasks');
  
  // Task list state
  const [filterType, setFilterType] = useState<FilterType>('all');
  const [filterStatus, setFilterStatus] = useState<FilterStatus>('all');
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(0);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [previewVideo, setPreviewVideo] = useState<{ url: string; title: string } | null>(null);
  const [detailTab, setDetailTab] = useState<'overview' | 'metadata'>('overview');
  const [mediaInfo, setMediaInfo] = useState<Record<string, { width: number; height: number; duration?: number; size?: number }>>({});
  const pageSize = 100;
  
  // Executor state
  const [executors, setExecutors] = useState<ExecutorStatus[]>([]);
  const [executorSummary, setExecutorSummary] = useState<Record<TaskType, ExecutorSummary>>({
    image: { total: 0, busy: 0 },
    video: { total: 0, busy: 0 },
    audio: { total: 0, busy: 0 },
  });
  const [executorLoading, setExecutorLoading] = useState(false);
  const [selectedExecutor, setSelectedExecutor] = useState<ExecutorStatus | null>(null);
  const [executorFilterType, setExecutorFilterType] = useState<TaskType>('image');

  // Helper to format file size
  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };

  // Fetch file size via HEAD request
  const fetchFileSize = async (url: string, key: string) => {
    try {
      const response = await fetch(url, { method: 'HEAD' });
      const contentLength = response.headers.get('Content-Length');
      if (contentLength) {
        const size = parseInt(contentLength, 10);
        setMediaInfo(prev => ({
          ...prev,
          [key]: { ...prev[key], size }
        }));
      }
    } catch (e) {
      // Ignore errors
    }
  };

  // Handle media click - Alt+click reveals in file manager, normal click previews
  const handleMediaClick = (e: React.MouseEvent, localPath: string, previewUrl: string, isVideo: boolean = false) => {
    if (e.altKey) {
      // Alt+click: reveal in file manager
      e.preventDefault();
      e.stopPropagation();
      if (window.pywebview?.api?.reveal_in_file_manager) {
        window.pywebview.api.reveal_in_file_manager(localPath);
      }
    } else {
      // Normal click: preview
      if (isVideo) {
        setPreviewVideo({ url: previewUrl, title: `视频预览` });
      } else {
        setPreviewImage(previewUrl);
      }
    }
  };

  // Fetch tasks
  const fetchTasks = useCallback(async () => {
    if (!window.pywebview?.api) return;

    setLoading(true);
    try {
      const typeParam = filterType === 'all' ? undefined : filterType;
      const statusParam = filterStatus === 'all' ? undefined : filterStatus;
      const result = await window.pywebview.api.list_tasks(typeParam, statusParam, page * pageSize, pageSize);
      if (result.success && result.data) {
        setTasks(result.data);
      }
    } catch (e) {
      console.error('Failed to fetch tasks:', e);
    } finally {
      setLoading(false);
    }
  }, [filterType, filterStatus, page]);

  // Fetch executor status
  const fetchExecutors = useCallback(async () => {
    if (!window.pywebview?.api) return;

    setExecutorLoading(true);
    try {
      const result = await window.pywebview.api.get_executor_status();
      if (result.success) {
        setExecutors(result.data || []);
        setExecutorSummary(result.summary || {
          image: { total: 0, busy: 0 },
          video: { total: 0, busy: 0 },
          audio: { total: 0, busy: 0 },
        });
      }
    } catch (e) {
      console.error('Failed to fetch executor status:', e);
    } finally {
      setExecutorLoading(false);
    }
  }, []);

  // Reset page when filter changes
  useEffect(() => {
    setPage(0);
  }, [filterType, filterStatus]);

  // Fetch tasks on filter/page change
  useEffect(() => {
    if (isOpen && activeTab === 'tasks') {
      fetchTasks();
    }
  }, [isOpen, activeTab, filterType, filterStatus, page, fetchTasks]);

  // Fetch executors when executor tab is active
  useEffect(() => {
    if (isOpen && activeTab === 'executors') {
      fetchExecutors();
    }
  }, [isOpen, activeTab, fetchExecutors]);

  // Handle ESC key to close modals in order (innermost first)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        // Close in order: preview image -> preview video -> task detail -> executor detail -> panel
        // Use stopImmediatePropagation to prevent other ESC handlers from firing
        if (previewImage) {
          e.stopImmediatePropagation();
          setPreviewImage(null);
        } else if (previewVideo) {
          e.stopImmediatePropagation();
          setPreviewVideo(null);
        } else if (selectedTask) {
          e.stopImmediatePropagation();
          setSelectedTask(null);
        } else if (selectedExecutor) {
          e.stopImmediatePropagation();
          setSelectedExecutor(null);
        } else {
          onClose();
        }
      }
    };
    
    // Use capture phase to handle before child components
    document.addEventListener('keydown', handleKeyDown, true);
    return () => document.removeEventListener('keydown', handleKeyDown, true);
  }, [isOpen, onClose, previewImage, previewVideo, selectedTask]);

  // Task actions
  const pauseTask = async (taskType: string, taskId: string) => {
    if (!window.pywebview?.api) return;
    await window.pywebview.api.pause_task(taskType, taskId);
    fetchTasks();
    onRefresh();
  };

  const resumeTask = async (taskType: string, taskId: string) => {
    if (!window.pywebview?.api) return;
    await window.pywebview.api.resume_task(taskType, taskId);
    fetchTasks();
    onRefresh();
  };

  const cancelTask = async (taskType: string, taskId: string) => {
    if (!window.pywebview?.api) return;
    await window.pywebview.api.cancel_task(taskType, taskId);
    fetchTasks();
    onRefresh();
  };

  const retryTask = async (taskType: string, taskId: string) => {
    if (!window.pywebview?.api) return;
    await window.pywebview.api.retry_task(taskType, taskId);
    fetchTasks();
    onRefresh();
  };

  const pauseAll = async () => {
    if (!window.pywebview?.api) return;
    const typeParam = filterType === 'all' ? undefined : filterType;
    await window.pywebview.api.pause_all_tasks(typeParam);
    fetchTasks();
    onRefresh();
  };

  const resumeAll = async () => {
    if (!window.pywebview?.api) return;
    const typeParam = filterType === 'all' ? undefined : filterType;
    await window.pywebview.api.resume_all_tasks(typeParam);
    fetchTasks();
    onRefresh();
  };

  // Format relative time
  const formatRelativeTime = (dateStr: string | null): string => {
    if (!dateStr) return '-';
    const date = new Date(dateStr);
    const diff = Date.now() - date.getTime();
    const seconds = Math.floor(diff / 1000);
    if (seconds < 60) return '刚刚';
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}分钟前`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}小时前`;
    return `${Math.floor(hours / 24)}天前`;
  };

  // Format duration between two timestamps or from start to now
  const formatDuration = (startStr: string | null, endStr?: string | null): string => {
    if (!startStr) return '-';
    const start = new Date(startStr);
    const end = endStr ? new Date(endStr) : new Date();
    const diff = end.getTime() - start.getTime();
    if (diff < 0) return '-';
    const seconds = Math.floor(diff / 1000);
    if (seconds < 60) return `${seconds}秒`;
    const minutes = Math.floor(seconds / 60);
    const secs = seconds % 60;
    if (minutes < 60) return `${minutes}分${secs}秒`;
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return `${hours}时${mins}分`;
  };

  // Get execution duration for a task
  const getExecutionDuration = (task: Task): string => {
    if (task.status === 'running' && task.started_at) {
      // Still running: from started_at to now
      return formatDuration(task.started_at);
    }
    if ((task.status === 'success' || task.status === 'failed') && task.started_at) {
      // Completed: from started_at to completed_at
      return formatDuration(task.started_at, task.completed_at || task.updated_at);
    }
    return '-';
  };

  // Get task content (prompt or text)
  const getTaskContent = (task: Task): string => {
    if (task.task_type === 'audio') {
      return task.text || '';
    }
    return task.prompt || '';
  };

  // Get task location info
  const getTaskLocation = (task: Task): string => {
    const parts: string[] = [];
    if (task.shot_sequence !== null && task.shot_sequence !== undefined) {
      parts.push(`镜头 ${task.shot_sequence}`);
    }
    if (task.task_type === 'image' && task.slot !== null && task.slot !== undefined) {
      parts.push(`槽位 ${task.slot}`);
    }
    if (task.task_type === 'audio' && task.dialogue_index !== null && task.dialogue_index !== undefined) {
      parts.push(`对话 ${task.dialogue_index + 1}`);
    }
    return parts.join(' / ');
  };

  // Sort tasks by created_at descending (newest first)
  const sortedTasks = [...tasks].sort((a, b) => {
    const timeA = a.created_at ? new Date(a.created_at).getTime() : 0;
    const timeB = b.created_at ? new Date(b.created_at).getTime() : 0;
    return timeB - timeA;
  });

  // Render task table row
  const renderTaskRow = (task: Task, index: number) => {
    const canPause = task.status === 'pending';
    const canResume = task.status === 'paused';
    const canCancel = task.status === 'pending' || task.status === 'paused';
    const canRetry = task.status === 'failed' || task.status === 'cancelled';
    
    const content = getTaskContent(task);
    const location = getTaskLocation(task);
    const statusConfig = STATUS_CONFIG[task.status];
    const typeConfig = TYPE_CONFIG[task.task_type];

    return (
      <tr
        key={task.id}
        onClick={() => { setSelectedTask(task); setMediaInfo({}); setDetailTab('overview'); }}
        className={`
          border-b border-slate-700/50 last:border-b-0 transition-colors cursor-pointer
          ${index % 2 === 0 ? 'bg-slate-800/30' : 'bg-slate-800/60'}
          hover:bg-slate-700/50
        `}
      >
        {/* Type */}
        <td className="px-4 py-3">
          <div className="flex items-center gap-2">
            <span className="text-slate-400">{typeConfig.icon}</span>
            <span className="text-xs text-slate-500">{typeConfig.label}</span>
          </div>
        </td>

        {/* Status */}
        <td className="px-4 py-3">
          <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium ${statusConfig.color} ${statusConfig.bg}`}>
            {statusConfig.icon}
            {STATUS_LABELS[task.status]}
          </span>
        </td>

        {/* Location */}
        <td className="px-4 py-3">
          <span className="text-sm text-slate-300">
            {location || <span className="font-mono text-slate-500 text-xs">{task.id.slice(0, 8)}</span>}
          </span>
        </td>

        {/* Content */}
        <td className="px-4 py-3 max-w-[240px]">
          <div className="truncate text-sm" title={content || task.error || ''}>
            {task.error ? (
              <span className="text-red-400 flex items-center gap-1">
                <AlertCircle className="w-3 h-3 flex-shrink-0" />
                <span className="truncate">{task.error}</span>
              </span>
            ) : content ? (
              <span className="text-slate-400">{content}</span>
            ) : (
              <span className="text-slate-600">-</span>
            )}
          </div>
        </td>

        {/* Created Time */}
        <td className="px-4 py-3 text-right">
          <span className="text-sm text-slate-500 whitespace-nowrap">
            {formatRelativeTime(task.created_at)}
          </span>
        </td>

        {/* Execution Duration */}
        <td className="px-4 py-3 text-right">
          <span className={`text-sm whitespace-nowrap ${task.status === 'running' ? 'text-teal-400 font-medium' : 'text-slate-500'}`}>
            {getExecutionDuration(task)}
          </span>
        </td>

        {/* Retry */}
        <td className="px-4 py-3 text-center">
          <span className={`text-sm ${task.retry_count > 0 ? 'text-amber-400 font-medium' : 'text-slate-600'}`}>
            {task.retry_count}/{task.max_retries}
          </span>
        </td>

        {/* Actions */}
        <td className="px-4 py-3">
          <div className="flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
            {canPause && (
              <button
                onClick={() => pauseTask(task.task_type, task.id)}
                className="p-1.5 hover:bg-slate-600 rounded-lg transition-colors"
                title="暂停"
              >
                <Pause className="w-4 h-4 text-slate-400" />
              </button>
            )}
            {canResume && (
              <button
                onClick={() => resumeTask(task.task_type, task.id)}
                className="p-1.5 hover:bg-emerald-500/20 rounded-lg transition-colors"
                title="恢复"
              >
                <Play className="w-4 h-4 text-emerald-400" />
              </button>
            )}
            {canRetry && (
              <button
                onClick={() => retryTask(task.task_type, task.id)}
                className="p-1.5 hover:bg-teal-500/20 rounded-lg transition-colors"
                title="重试"
              >
                <RefreshCw className="w-4 h-4 text-teal-400" />
              </button>
            )}
            {canCancel && (
              <button
                onClick={() => cancelTask(task.task_type, task.id)}
                className="p-1.5 hover:bg-red-500/20 rounded-lg transition-colors"
                title="取消"
              >
                <Trash2 className="w-4 h-4 text-red-400" />
              </button>
            )}
            {!canPause && !canResume && !canRetry && !canCancel && (
              <span className="text-slate-600 text-xs px-2">-</span>
            )}
          </div>
        </td>
      </tr>
    );
  };

  // Format datetime for display
  const formatDateTime = (dateStr: string | null) => {
    if (!dateStr) return '-';
    const date = new Date(dateStr);
    return date.toLocaleString('zh-CN', {
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  };

  // Render task detail modal
  const renderTaskDetailModal = () => {
    if (!selectedTask) return null;

    const task = selectedTask;
    const statusConfig = STATUS_CONFIG[task.status];
    const typeConfig = TYPE_CONFIG[task.task_type];

    const metadataRows = [
      { label: '任务ID', value: task.id },
      { label: '类型', value: `${typeConfig.label} / ${task.subtype || '-'}` },
      { label: '状态', value: STATUS_LABELS[task.status] },
      { label: '关联镜头ID', value: task.shot_id || '-' },
      { label: '镜头序号', value: task.shot_sequence !== null ? `${task.shot_sequence}` : '-' },
      ...(task.task_type === 'image' ? [{ label: '槽位', value: task.slot !== null ? `${task.slot}` : '-' }] : []),
      ...(task.task_type === 'audio' ? [{ label: '对话索引', value: task.dialogue_index !== null ? `${task.dialogue_index + 1}` : '-' }] : []),
      { label: '优先级', value: `${task.priority}` },
      { label: '重试次数', value: `${task.retry_count} / ${task.max_retries}` },
      { label: '超时时间', value: `${task.timeout_seconds || '-'} 秒` },
      { label: '创建时间', value: formatDateTime(task.created_at) },
      { label: '开始执行', value: formatDateTime(task.started_at) },
      { label: '完成时间', value: formatDateTime(task.completed_at) },
      { label: '更新时间', value: formatDateTime(task.updated_at) },
      { label: '提供商', value: task.provider || '-' },
      ...(task.task_type === 'image' || task.task_type === 'video' ? [{ label: '宽高比', value: task.aspect_ratio || '-' }] : []),
      ...(task.result_url ? [{ label: '结果URL', value: task.result_url }] : []),
      ...(task.result_local_path ? [{ label: '本地路径', value: task.result_local_path }] : []),
      ...('reference_images' in task && task.reference_images ? [{ label: '参考图路径', value: task.reference_images }] : []),
    ];

    return (
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[60]">
        <div className="bg-slate-800 rounded-xl shadow-2xl w-[900px] max-h-[85vh] overflow-hidden border border-slate-700/50">
          {/* Header */}
          <div className="px-6 py-4 border-b border-slate-700/50 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="text-slate-400">{typeConfig.icon}</span>
              <h3 className="text-lg font-semibold text-slate-200">任务详情</h3>
              <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium ${statusConfig.color} ${statusConfig.bg}`}>
                {statusConfig.icon}
                {STATUS_LABELS[task.status]}
              </span>
            </div>
            <button
              onClick={() => setSelectedTask(null)}
              className="p-2 hover:bg-slate-700 rounded-lg transition-colors"
            >
              <X className="w-5 h-5 text-slate-400" />
            </button>
          </div>

          {/* Tabs */}
          <div className="px-6 pt-3 border-b border-slate-700/50 flex gap-1">
            <button
              onClick={() => setDetailTab('overview')}
              className={`px-4 py-2 text-sm font-medium rounded-t-lg transition-colors ${
                detailTab === 'overview'
                  ? 'bg-slate-700 text-slate-200 border-b-2 border-teal-500'
                  : 'text-slate-400 hover:text-slate-300 hover:bg-slate-700/50'
              }`}
            >
              概览
            </button>
            <button
              onClick={() => setDetailTab('metadata')}
              className={`px-4 py-2 text-sm font-medium rounded-t-lg transition-colors ${
                detailTab === 'metadata'
                  ? 'bg-slate-700 text-slate-200 border-b-2 border-teal-500'
                  : 'text-slate-400 hover:text-slate-300 hover:bg-slate-700/50'
              }`}
            >
              元数据
            </button>
          </div>

          {/* Content */}
          <div className="px-6 py-4 overflow-auto max-h-[calc(85vh-180px)]">
            {detailTab === 'overview' ? (
              <>
                {/* Error - show first if any */}
                {task.error && (
                  <div className="mb-4">
                    <div className="bg-red-900/20 border border-red-500/30 rounded-lg p-3 text-sm text-red-300">
                      <span className="font-medium text-red-400">错误: </span>
                      {task.error}
                    </div>
                  </div>
                )}

                {/* Two-column layout: Input | Output */}
                <div className="flex gap-6">
                  {/* Left: Input */}
                  <div className="flex-1 min-w-0">
                    <h4 className="text-sm font-medium text-blue-400 mb-3 flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-blue-400"></span>
                      输入
                    </h4>
                    
                    {/* Prompt/Text */}
                    {(('prompt' in task && task.prompt) || ('text' in task && task.text)) && (
                      <div className="mb-4">
                        <h5 className="text-xs font-medium text-slate-500 mb-1.5">
                          {task.task_type === 'audio' ? '文本内容' : '提示词'}
                        </h5>
                        <div className="bg-slate-900/50 rounded-lg p-3 text-sm text-slate-300 whitespace-pre-wrap max-h-[200px] overflow-auto select-text cursor-text">
                          {('prompt' in task ? task.prompt : '') || ('text' in task ? task.text : '') || '-'}
                        </div>
                      </div>
                    )}

                    {/* Reference Images */}
                    {'reference_images' in task && task.reference_images && (
                      <div className="mb-4">
                        <h5 className="text-xs font-medium text-slate-500 mb-1.5">参考图片</h5>
                        <div className="flex flex-wrap gap-2">
                          {task.reference_images.split(',').map((imgPath, idx) => {
                            const trimmedPath = imgPath.trim();
                            if (!trimmedPath) return null;
                            const imgUrl = trimmedPath.startsWith('http') 
                              ? trimmedPath 
                              : `http://127.0.0.1:8765/${trimmedPath.replace(/^\//, '')}`;
                            const infoKey = `ref_${idx}`;
                            const info = mediaInfo[infoKey];
                            return (
                              <div 
                                key={idx} 
                                className="relative group cursor-pointer"
                                onClick={(e) => handleMediaClick(e, trimmedPath, imgUrl, false)}
                                title="点击预览 / Alt+点击在文件管理器中显示"
                              >
                                <img
                                  src={imgUrl}
                                  alt={`参考图 ${idx + 1}`}
                                  className="w-16 h-16 object-cover rounded-lg border border-slate-600 hover:border-teal-500 transition-colors"
                                  onLoad={(e) => {
                                    const img = e.target as HTMLImageElement;
                                    setMediaInfo(prev => ({ ...prev, [infoKey]: { ...prev[infoKey], width: img.naturalWidth, height: img.naturalHeight } }));
                                    fetchFileSize(imgUrl, infoKey);
                                  }}
                                  onError={(e) => {
                                    (e.target as HTMLImageElement).style.display = 'none';
                                  }}
                                />
                                <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity rounded-lg flex flex-col items-center justify-center">
                                  <span className="text-[10px] text-slate-300">查看</span>
                                  {info && <span className="text-[9px] text-slate-400">{info.width}x{info.height}</span>}
                                  {info?.size && <span className="text-[9px] text-slate-400">{formatFileSize(info.size)}</span>}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* Reference Audio (for audio tasks) */}
                    {task.task_type === 'audio' && 'voice_ref' in task && task.voice_ref && (
                      <div className="mb-4">
                        <h5 className="text-xs font-medium text-slate-500 mb-2">参考音频</h5>
                        <div 
                          className="flex items-center gap-3 bg-slate-900/50 rounded-lg p-3 cursor-pointer hover:bg-slate-900/70 transition-colors"
                          onClick={(e) => {
                            if (e.altKey && window.pywebview?.api?.reveal_in_file_manager) {
                              e.preventDefault();
                              window.pywebview.api.reveal_in_file_manager(task.voice_ref!);
                            }
                          }}
                          title="Alt+点击在文件管理器中显示"
                        >
                          <div className="w-8 h-8 rounded-full bg-teal-500/20 flex items-center justify-center flex-shrink-0">
                            <svg className="w-4 h-4 text-teal-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M9 12a3 3 0 11-6 0 3 3 0 016 0z" />
                            </svg>
                          </div>
                          <div className="flex-1 min-w-0">
                            <audio
                              src={`http://127.0.0.1:8765/${task.voice_ref.replace(/^\//, '')}`}
                              controls
                              className="w-full h-8"
                              style={{ minWidth: '200px' }}
                            />
                            <p className="text-xs text-slate-500 mt-1 truncate">{task.voice_ref.split('/').pop()}</p>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Basic params */}
                    <div className="space-y-2 text-sm">
                      <div className="flex items-center gap-2">
                        <span className="text-slate-500 w-16">类型</span>
                        <span className="text-slate-300">{typeConfig.label} / {task.subtype || '-'}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-slate-500 w-16">提供商</span>
                        <span className="text-slate-300">{task.provider || '-'}</span>
                      </div>
                      {(task.task_type === 'image' || task.task_type === 'video') && (
                        <div className="flex items-center gap-2">
                          <span className="text-slate-500 w-16">宽高比</span>
                          <span className="text-slate-300">{task.aspect_ratio || '-'}</span>
                        </div>
                      )}
                      {task.task_type === 'audio' && 'speed' in task && (
                        <div className="flex items-center gap-2">
                          <span className="text-slate-500 w-16">语速</span>
                          <span className="text-slate-300">{task.speed || 1.0}</span>
                        </div>
                      )}
                      {task.task_type === 'audio' && 'emotion' in task && task.emotion && (
                        <div className="flex items-center gap-2">
                          <span className="text-slate-500 w-16">情绪</span>
                          <span className="text-slate-300">{task.emotion}{task.emotion_intensity ? ` (${task.emotion_intensity})` : ''}</span>
                        </div>
                      )}
                      {task.shot_sequence !== null && task.shot_sequence !== undefined && (
                        <div className="flex items-center gap-2">
                          <span className="text-slate-500 w-16">关联</span>
                          <span className="text-slate-300">镜头 {task.shot_sequence}</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Divider */}
                  <div className="w-px bg-slate-700"></div>

                  {/* Right: Output */}
                  <div className="flex-1 min-w-0">
                    <h4 className="text-sm font-medium text-teal-400 mb-3 flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-teal-400"></span>
                      输出
                    </h4>
                    
                    {task.result_local_path ? (
                      <div>
                        {task.task_type === 'image' && (
                          <>
                            <img
                              src={`http://127.0.0.1:8765/${task.result_local_path.replace(/^\//, '')}`}
                              alt="生成结果"
                              className="max-w-full max-h-[280px] object-contain rounded-lg border border-slate-600 cursor-pointer hover:border-teal-500 transition-colors"
                              title="点击预览 / Alt+点击在文件管理器中显示"
                              onClick={(e) => handleMediaClick(e, task.result_local_path!, `http://127.0.0.1:8765/${task.result_local_path!.replace(/^\//, '')}`, false)}
                              onLoad={(e) => {
                                const img = e.target as HTMLImageElement;
                                const url = `http://127.0.0.1:8765/${task.result_local_path!.replace(/^\//, '')}`;
                                setMediaInfo(prev => ({ ...prev, output: { ...prev.output, width: img.naturalWidth, height: img.naturalHeight } }));
                                fetchFileSize(url, 'output');
                              }}
                              onError={(e) => {
                                (e.target as HTMLImageElement).style.display = 'none';
                              }}
                            />
                            {mediaInfo.output && (
                              <div className="mt-1 text-xs text-slate-500">
                                尺寸: {mediaInfo.output.width} x {mediaInfo.output.height}
                                {mediaInfo.output.size && ` / 大小: ${formatFileSize(mediaInfo.output.size)}`}
                              </div>
                            )}
                          </>
                        )}
                        {task.task_type === 'video' && (
                          <>
                            <div 
                              className="relative cursor-pointer group"
                              title="点击预览 / Alt+点击在文件管理器中显示"
                              onClick={(e) => handleMediaClick(e, task.result_local_path!, `http://127.0.0.1:8765/${task.result_local_path!.replace(/^\//, '')}`, true)}
                            >
                              <video
                                src={`http://127.0.0.1:8765/${task.result_local_path.replace(/^\//, '')}`}
                                className="max-w-full max-h-[280px] rounded-lg border border-slate-600 group-hover:border-teal-500 transition-colors"
                                onLoadedMetadata={(e) => {
                                  const video = e.target as HTMLVideoElement;
                                  const url = `http://127.0.0.1:8765/${task.result_local_path!.replace(/^\//, '')}`;
                                  setMediaInfo(prev => ({ 
                                    ...prev, 
                                    output: { 
                                      ...prev.output,
                                      width: video.videoWidth, 
                                      height: video.videoHeight,
                                      duration: video.duration
                                    } 
                                  }));
                                  fetchFileSize(url, 'output');
                                }}
                              />
                              <div className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity rounded-lg">
                                <Play className="w-12 h-12 text-white" />
                              </div>
                            </div>
                            {mediaInfo.output && (
                              <div className="mt-1 text-xs text-slate-500">
                                尺寸: {mediaInfo.output.width} x {mediaInfo.output.height}
                                {mediaInfo.output.duration && ` / 时长: ${mediaInfo.output.duration.toFixed(1)}秒`}
                                {mediaInfo.output.size && ` / 大小: ${formatFileSize(mediaInfo.output.size)}`}
                              </div>
                            )}
                          </>
                        )}
                        {task.task_type === 'audio' && (
                          <audio
                            src={`http://127.0.0.1:8765/${task.result_local_path.replace(/^\//, '')}`}
                            controls
                            className="w-full"
                          />
                        )}
                        <div className="mt-2 text-xs text-slate-500">
                          状态: <span className={statusConfig.color}>{STATUS_LABELS[task.status]}</span>
                          {task.completed_at && (
                            <span className="ml-2">完成于 {formatDateTime(task.completed_at)}</span>
                          )}
                        </div>
                      </div>
                    ) : (
                      <div className="flex flex-col items-center justify-center h-[200px] text-slate-500">
                        {task.status === 'running' ? (
                          <>
                            <Loader2 className="w-8 h-8 animate-spin text-teal-500 mb-2" />
                            <span className="text-sm">任务执行中...</span>
                          </>
                        ) : task.status === 'pending' || task.status === 'paused' ? (
                          <>
                            <Clock className="w-8 h-8 text-slate-600 mb-2" />
                            <span className="text-sm">等待执行</span>
                          </>
                        ) : (
                          <>
                            <XCircle className="w-8 h-8 text-slate-600 mb-2" />
                            <span className="text-sm">暂无结果</span>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </>
            ) : (
              /* Metadata Tab */
              <div className="space-y-3">
                {metadataRows.map((row, idx) => (
                  <div key={idx} className="flex items-start gap-4 py-2 border-b border-slate-700/30 last:border-0">
                    <span className="text-sm text-slate-500 w-28 flex-shrink-0">{row.label}</span>
                    <span className="text-sm text-slate-300 break-all font-mono select-text cursor-text">{row.value}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="px-6 py-3 border-t border-slate-700/50 flex justify-end">
            <button
              onClick={() => setSelectedTask(null)}
              className="px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg text-sm text-slate-300 transition-colors"
            >
              关闭
            </button>
          </div>
        </div>
      </div>
    );
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-gradient-to-b from-slate-800 to-slate-900 w-full max-w-4xl max-h-[85vh] rounded-2xl shadow-2xl flex flex-col border border-slate-700/50">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-700/50">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-teal-500 to-emerald-600 flex items-center justify-center">
                <Loader2 className="w-5 h-5 text-white" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-white">任务队列</h2>
                <p className="text-sm text-slate-400">
                  {activeTab === 'tasks' ? `共 ${tasks.length} 个任务` : `共 ${executors.length} 个执行器`}
                </p>
              </div>
            </div>
            
            {/* Main Tab Switch */}
            <div className="flex items-center gap-1 bg-slate-900/50 rounded-xl p-1 ml-4">
              <button
                onClick={() => setActiveTab('tasks')}
                className={`
                  flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-sm font-medium transition-all
                  ${activeTab === 'tasks'
                    ? 'bg-teal-500/20 text-teal-400 shadow-sm'
                    : 'text-slate-400 hover:text-slate-300 hover:bg-slate-700/50'
                  }
                `}
              >
                <Clock className="w-3.5 h-3.5" />
                任务列表
              </button>
              <button
                onClick={() => setActiveTab('executors')}
                className={`
                  flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-sm font-medium transition-all
                  ${activeTab === 'executors'
                    ? 'bg-teal-500/20 text-teal-400 shadow-sm'
                    : 'text-slate-400 hover:text-slate-300 hover:bg-slate-700/50'
                  }
                `}
              >
                <Cpu className="w-3.5 h-3.5" />
                执行器
              </button>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {activeTab === 'tasks' && (
              <>
                <button
                  onClick={pauseAll}
                  className="px-4 py-2 text-sm font-medium bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 rounded-xl transition-all border border-amber-500/20"
                >
                  全部暂停
                </button>
                <button
                  onClick={resumeAll}
                  className="px-4 py-2 text-sm font-medium bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 rounded-xl transition-all border border-emerald-500/20"
                >
                  全部恢复
                </button>
              </>
            )}
            <button
              onClick={onClose}
              className="p-2 hover:bg-slate-700 rounded-xl transition-colors"
            >
              <X className="w-5 h-5 text-slate-400" />
            </button>
          </div>
        </div>

        {/* Task List View */}
        {activeTab === 'tasks' && (
          <>
            {/* Type Tabs + Filters */}
            <div className="border-b border-slate-700/50 bg-slate-800/50">
              {/* Type Tabs */}
              <div className="flex items-center px-6 pt-2">
                <div className="flex items-center gap-1 bg-slate-900/50 rounded-xl p-1">
                  {[
                    { value: 'all', label: '全部', icon: null },
                    { value: 'image', label: '图片', icon: <Image className="w-3.5 h-3.5" /> },
                    { value: 'video', label: '视频', icon: <Video className="w-3.5 h-3.5" /> },
                    { value: 'audio', label: '音频', icon: <Music className="w-3.5 h-3.5" /> },
                  ].map((tab) => (
                    <button
                      key={tab.value}
                      onClick={() => setFilterType(tab.value as FilterType)}
                      className={`
                        flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-sm font-medium transition-all
                        ${filterType === tab.value
                          ? 'bg-teal-500/20 text-teal-400 shadow-sm'
                          : 'text-slate-400 hover:text-slate-300 hover:bg-slate-700/50'
                        }
                      `}
                    >
                      {tab.icon}
                      {tab.label}
                    </button>
                  ))}
                </div>

                <div className="ml-auto flex items-center gap-4">
                  {/* Status Filter */}
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-slate-500">状态</span>
                    <select
                      value={filterStatus}
                      onChange={(e) => setFilterStatus(e.target.value as FilterStatus)}
                      className="text-sm bg-slate-700/50 border border-slate-600 rounded-lg px-2 py-1 text-slate-200 focus:outline-none focus:ring-2 focus:ring-teal-500/50 focus:border-teal-500"
                    >
                      <option value="all">全部</option>
                      <option value="pending">等待中</option>
                      <option value="paused">已暂停</option>
                      <option value="running">执行中</option>
                      <option value="success">已完成</option>
                      <option value="failed">失败</option>
                      <option value="cancelled">已取消</option>
                    </select>
                  </div>

                  {/* Refresh */}
                  <button
                    onClick={fetchTasks}
                    className="p-1.5 hover:bg-slate-700 rounded-lg transition-colors"
                    title="刷新"
                  >
                    <RefreshCw className={`w-4 h-4 text-slate-400 ${loading ? 'animate-spin' : ''}`} />
                  </button>
                </div>
              </div>

              {/* Spacer */}
              <div className="h-2" />
            </div>

            {/* Task table */}
            <div className="h-[520px] overflow-auto">
              {loading && tasks.length === 0 ? (
                <div className="flex items-center justify-center py-16">
                  <Loader2 className="w-8 h-8 animate-spin text-teal-500" />
                </div>
              ) : tasks.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-slate-500">
                  <div className="w-16 h-16 rounded-full bg-slate-800 flex items-center justify-center mb-4">
                    <CheckCircle className="w-8 h-8 text-slate-600" />
                  </div>
                  <p className="text-lg font-medium">暂无任务</p>
                  <p className="text-sm text-slate-600 mt-1">任务队列为空</p>
                </div>
              ) : (
                <table className="w-full">
                  <thead className="sticky top-0 bg-slate-800/95 backdrop-blur-sm">
                    <tr className="text-xs text-slate-500 uppercase tracking-wider border-b border-slate-700/50">
                      <th className="px-4 py-3 text-left font-semibold w-24">类型</th>
                      <th className="px-4 py-3 text-left font-semibold w-28">状态</th>
                      <th className="px-4 py-3 text-left font-semibold w-32">关联</th>
                      <th className="px-4 py-3 text-left font-semibold">内容</th>
                      <th className="px-4 py-3 text-right font-semibold w-20">创建</th>
                      <th className="px-4 py-3 text-right font-semibold w-20">耗时</th>
                      <th className="px-4 py-3 text-center font-semibold w-16">重试</th>
                      <th className="px-4 py-3 text-right font-semibold w-24">操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedTasks.map((task, index) => renderTaskRow(task, index))}
                  </tbody>
                </table>
              )}
            </div>

            {/* Pagination & Summary footer */}
            <div className="px-6 py-3 border-t border-slate-700/50 bg-slate-800/50">
              <div className="flex items-center justify-between text-sm">
                {/* Pagination */}
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setPage(p => Math.max(0, p - 1))}
                    disabled={page === 0}
                    className="px-3 py-1 text-xs rounded bg-slate-700 hover:bg-slate-600 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    上一页
                  </button>
                  <span className="text-slate-400 px-2">第 {page + 1} 页</span>
                  <button
                    onClick={() => setPage(p => p + 1)}
                    disabled={tasks.length < pageSize}
                    className="px-3 py-1 text-xs rounded bg-slate-700 hover:bg-slate-600 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    下一页
                  </button>
                </div>
                
                {/* Task counts */}
                <div className="flex items-center gap-6">
                  <div className="flex items-center gap-2">
                    <Image className="w-4 h-4 text-slate-500" />
                    <span className="text-slate-400">
                      <span className="text-teal-400 font-medium">{summary.image.running}</span> 执行
                      <span className="text-slate-600 mx-1">/</span>
                      <span className="text-slate-300">{summary.image.pending}</span> 等待
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Video className="w-4 h-4 text-slate-500" />
                    <span className="text-slate-400">
                      <span className="text-teal-400 font-medium">{summary.video.running}</span> 执行
                      <span className="text-slate-600 mx-1">/</span>
                      <span className="text-slate-300">{summary.video.pending}</span> 等待
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Music className="w-4 h-4 text-slate-500" />
                    <span className="text-slate-400">
                      <span className="text-teal-400 font-medium">{summary.audio.running}</span> 执行
                      <span className="text-slate-600 mx-1">/</span>
                      <span className="text-slate-300">{summary.audio.pending}</span> 等待
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </>
        )}

        {/* Executor View */}
        {activeTab === 'executors' && (
          <>
            {/* Type Tabs + Refresh */}
            <div className="border-b border-slate-700/50 bg-slate-800/50">
              <div className="flex items-center px-6 pt-2">
                <div className="flex items-center gap-1 bg-slate-900/50 rounded-xl p-1">
                  {[
                    { value: 'image' as TaskType, label: '图片', icon: <Image className="w-3.5 h-3.5" /> },
                    { value: 'video' as TaskType, label: '视频', icon: <Video className="w-3.5 h-3.5" /> },
                    { value: 'audio' as TaskType, label: '音频', icon: <Music className="w-3.5 h-3.5" /> },
                  ].map((tab) => {
                    const summary = executorSummary[tab.value];
                    return (
                      <button
                        key={tab.value}
                        onClick={() => setExecutorFilterType(tab.value)}
                        className={`
                          flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-sm font-medium transition-all
                          ${executorFilterType === tab.value
                            ? 'bg-teal-500/20 text-teal-400 shadow-sm'
                            : 'text-slate-400 hover:text-slate-300 hover:bg-slate-700/50'
                          }
                        `}
                      >
                        {tab.icon}
                        {tab.label}
                        <span className={`ml-1 text-xs ${executorFilterType === tab.value ? 'text-teal-300' : 'text-slate-500'}`}>
                          {summary.busy}/{summary.total}
                        </span>
                      </button>
                    );
                  })}
                </div>

                <div className="ml-auto flex items-center gap-4">
                  <button
                    onClick={fetchExecutors}
                    className="p-1.5 hover:bg-slate-700 rounded-lg transition-colors"
                    title="刷新"
                  >
                    <RefreshCw className={`w-4 h-4 text-slate-400 ${executorLoading ? 'animate-spin' : ''}`} />
                  </button>
                </div>
              </div>
              <div className="h-2" />
            </div>

            {/* Executor table */}
            <div className="h-[520px] overflow-auto">
              {(() => {
                const filteredExecutors = executors.filter(e => e.task_type === executorFilterType);
                
                if (executorLoading && executors.length === 0) {
                  return (
                    <div className="flex items-center justify-center py-16">
                      <Loader2 className="w-8 h-8 animate-spin text-teal-500" />
                    </div>
                  );
                }
                
                if (filteredExecutors.length === 0) {
                  return (
                    <div className="flex flex-col items-center justify-center py-16 text-slate-500">
                      <div className="w-16 h-16 rounded-full bg-slate-800 flex items-center justify-center mb-4">
                        <Cpu className="w-8 h-8 text-slate-600" />
                      </div>
                      <p className="text-lg font-medium">暂无{TYPE_CONFIG[executorFilterType].label}执行器</p>
                      <p className="text-sm text-slate-600 mt-1">该类型执行器尚未启动</p>
                    </div>
                  );
                }
                
                return (
                  <table className="w-full">
                    <thead className="sticky top-0 bg-slate-800/95 backdrop-blur-sm z-10">
                      <tr className="text-xs text-slate-500 uppercase tracking-wider border-b border-slate-700/50">
                        <th className="px-4 py-3 text-left font-semibold w-40">执行器ID</th>
                        <th className="px-4 py-3 text-left font-semibold w-24">状态</th>
                        <th className="px-4 py-3 text-left font-semibold">当前任务</th>
                        <th className="px-4 py-3 text-center font-semibold w-24">线程</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredExecutors.map((executor, index) => {
                        const isBusy = executor.current_task_id !== null;
                        const taskLocation = executor.current_task ? getTaskLocation(executor.current_task) : null;
                        const taskContent = executor.current_task ? getTaskContent(executor.current_task) : null;
                        
                        return (
                          <tr
                            key={executor.worker_id}
                            onClick={() => setSelectedExecutor(executor)}
                            className={`
                              border-b border-slate-700/50 last:border-b-0 transition-colors cursor-pointer
                              ${index % 2 === 0 ? 'bg-slate-800/30' : 'bg-slate-800/60'}
                              hover:bg-slate-700/50
                            `}
                          >
                            {/* Worker ID */}
                            <td className="px-4 py-3">
                              <span className="font-mono text-sm text-slate-300">{executor.worker_id}</span>
                            </td>

                            {/* Status */}
                            <td className="px-4 py-3">
                              <span className={`
                                inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium
                                ${isBusy 
                                  ? 'text-teal-400 bg-teal-500/20' 
                                  : 'text-slate-400 bg-slate-500/20'
                                }
                              `}>
                                {isBusy ? (
                                  <>
                                    <Activity className="w-3 h-3 animate-pulse" />
                                    执行中
                                  </>
                                ) : (
                                  <>
                                    <CircleDot className="w-3 h-3" />
                                    空闲
                                  </>
                                )}
                              </span>
                            </td>

                            {/* Current Task */}
                            <td className="px-4 py-3 max-w-[280px]">
                              {isBusy && executor.current_task ? (
                                <div className="flex flex-col gap-0.5">
                                  <span className="text-sm text-slate-300">
                                    {taskLocation || <span className="font-mono text-xs">{executor.current_task_id?.slice(0, 8)}</span>}
                                  </span>
                                  {taskContent && (
                                    <span className="text-xs text-slate-500 truncate" title={taskContent}>
                                      {taskContent}
                                    </span>
                                  )}
                                </div>
                              ) : (
                                <span className="text-slate-600">-</span>
                              )}
                            </td>

                            {/* Thread Status */}
                            <td className="px-4 py-3 text-center">
                              <span className={`
                                inline-flex items-center gap-1 text-xs font-medium
                                ${executor.thread_alive ? 'text-emerald-400' : 'text-red-400'}
                              `}>
                                <span className={`w-2 h-2 rounded-full ${executor.thread_alive ? 'bg-emerald-400' : 'bg-red-400'}`}></span>
                                {executor.thread_alive ? '正常' : '异常'}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                );
              })()}
            </div>

            {/* Executor footer */}
            <div className="px-6 py-3 border-t border-slate-700/50 bg-slate-800/50">
              <div className="flex items-center justify-between text-sm text-slate-400">
                <span>
                  执行器是独立的任务处理线程，每个执行器同时只能处理一个任务
                </span>
                <span className="text-xs text-slate-500">
                  {TYPE_CONFIG[executorFilterType].label}: {executors.filter(e => e.task_type === executorFilterType && e.current_task_id).length} 忙碌 / {executors.filter(e => e.task_type === executorFilterType).length} 总数
                </span>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Task detail modal */}
      {renderTaskDetailModal()}

      {/* Image preview modal */}
      {previewImage && (
        <ImagePreviewModal
          imageUrl={previewImage}
          onClose={() => setPreviewImage(null)}
        />
      )}

      {/* Video preview modal */}
      {previewVideo && (
        <VideoModal
          isOpen={true}
          videoUrl={previewVideo.url}
          title={previewVideo.title}
          onClose={() => setPreviewVideo(null)}
        />
      )}

      {/* Executor detail modal */}
      {selectedExecutor && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[60] flex items-center justify-center p-4">
          <div className="bg-gradient-to-b from-slate-800 to-slate-900 w-full max-w-lg rounded-2xl shadow-2xl border border-slate-700/50">
            {/* Modal Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-700/50">
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                  selectedExecutor.current_task_id 
                    ? 'bg-gradient-to-br from-teal-500 to-emerald-600' 
                    : 'bg-slate-700'
                }`}>
                  <Cpu className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-white">执行器详情</h3>
                  <p className="text-sm text-slate-400 font-mono">{selectedExecutor.worker_id}</p>
                </div>
              </div>
              <button
                onClick={() => setSelectedExecutor(null)}
                className="p-2 hover:bg-slate-700 rounded-xl transition-colors"
              >
                <X className="w-5 h-5 text-slate-400" />
              </button>
            </div>

            {/* Modal Content */}
            <div className="p-6 space-y-6">
              {/* Basic Info */}
              <div>
                <h4 className="text-sm font-medium text-slate-400 mb-3">基本信息</h4>
                <div className="bg-slate-900/50 rounded-xl p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-slate-500">任务类型</span>
                    <span className="text-sm text-slate-200 flex items-center gap-2">
                      {TYPE_CONFIG[selectedExecutor.task_type].icon}
                      {TYPE_CONFIG[selectedExecutor.task_type].label}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-slate-500">运行状态</span>
                    <span className={`text-sm ${selectedExecutor.running ? 'text-emerald-400' : 'text-red-400'}`}>
                      {selectedExecutor.running ? '运行中' : '已停止'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-slate-500">线程状态</span>
                    <span className={`text-sm flex items-center gap-1.5 ${selectedExecutor.thread_alive ? 'text-emerald-400' : 'text-red-400'}`}>
                      <span className={`w-2 h-2 rounded-full ${selectedExecutor.thread_alive ? 'bg-emerald-400' : 'bg-red-400'}`}></span>
                      {selectedExecutor.thread_alive ? '正常' : '异常'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-slate-500">工作状态</span>
                    <span className={`text-sm ${selectedExecutor.current_task_id ? 'text-teal-400' : 'text-slate-400'}`}>
                      {selectedExecutor.current_task_id ? '执行中' : '空闲'}
                    </span>
                  </div>
                </div>
              </div>

              {/* API Config Info */}
              {selectedExecutor.config && (
                <div>
                  <h4 className="text-sm font-medium text-slate-400 mb-3">接口配置 (实时读取)</h4>
                  <div className="bg-slate-900/50 rounded-xl p-4 space-y-3">
                    {selectedExecutor.config.error ? (
                      <div className="text-sm text-red-400">配置读取失败: {selectedExecutor.config.error}</div>
                    ) : (
                      <>
                        <div>
                          <span className="text-sm text-slate-500 block mb-1">接口地址</span>
                          <p className="text-sm text-slate-200 bg-slate-800/50 rounded-lg p-2 font-mono break-all select-text cursor-text">
                            {selectedExecutor.config.api_url || <span className="text-slate-500 italic">未配置</span>}
                          </p>
                        </div>
                        <div>
                          <span className="text-sm text-slate-500 block mb-1">API Key</span>
                          <p className="text-sm text-slate-200 bg-slate-800/50 rounded-lg p-2 font-mono break-all select-text cursor-text">
                            {selectedExecutor.config.api_key || <span className="text-slate-500 italic">未配置</span>}
                          </p>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-sm text-slate-500">模型</span>
                          <span className="text-sm text-slate-200 font-mono">
                            {selectedExecutor.config.model || <span className="text-slate-500 italic">未配置</span>}
                          </span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-sm text-slate-500">配置键</span>
                          <span className="text-sm text-slate-200 font-mono">{selectedExecutor.config.config_key}</span>
                        </div>
                      </>
                    )}
                  </div>
                </div>
              )}

              {/* Runtime Config */}
              <div>
                <h4 className="text-sm font-medium text-slate-400 mb-3">运行参数</h4>
                <div className="bg-slate-900/50 rounded-xl p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-slate-500">心跳间隔</span>
                    <span className="text-sm text-slate-200">{selectedExecutor.heartbeat_interval} 秒</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-slate-500">锁超时时间</span>
                    <span className="text-sm text-slate-200">{selectedExecutor.lock_timeout} 秒</span>
                  </div>
                </div>
              </div>

              {/* Current Task Info */}
              {selectedExecutor.current_task && (
                <div>
                  <h4 className="text-sm font-medium text-slate-400 mb-3">当前任务</h4>
                  <div className="bg-slate-900/50 rounded-xl p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-slate-500">任务ID</span>
                      <span className="text-sm text-slate-200 font-mono">{selectedExecutor.current_task.id.slice(0, 12)}...</span>
                    </div>
                    {selectedExecutor.current_task.shot_sequence !== null && (
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-slate-500">关联镜头</span>
                        <span className="text-sm text-slate-200">镜头 {selectedExecutor.current_task.shot_sequence}</span>
                      </div>
                    )}
                    {('prompt' in selectedExecutor.current_task && selectedExecutor.current_task.prompt) && (
                      <div>
                        <span className="text-sm text-slate-500 block mb-1">提示词</span>
                        <p className="text-sm text-slate-300 bg-slate-800/50 rounded-lg p-2 max-h-20 overflow-auto select-text cursor-text">
                          {selectedExecutor.current_task.prompt}
                        </p>
                      </div>
                    )}
                    {('text' in selectedExecutor.current_task && selectedExecutor.current_task.text) && (
                      <div>
                        <span className="text-sm text-slate-500 block mb-1">文本内容</span>
                        <p className="text-sm text-slate-300 bg-slate-800/50 rounded-lg p-2 max-h-20 overflow-auto select-text cursor-text">
                          {selectedExecutor.current_task.text}
                        </p>
                      </div>
                    )}
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-slate-500">开始时间</span>
                      <span className="text-sm text-slate-200">
                        {selectedExecutor.current_task.started_at 
                          ? new Date(selectedExecutor.current_task.started_at).toLocaleString('zh-CN')
                          : '-'
                        }
                      </span>
                    </div>
                  </div>
                </div>
              )}

              {/* No current task */}
              {!selectedExecutor.current_task && (
                <div className="text-center py-4 text-slate-500">
                  <CircleDot className="w-8 h-8 mx-auto mb-2 opacity-50" />
                  <p className="text-sm">执行器当前空闲，等待任务分配</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default TaskPanel;
