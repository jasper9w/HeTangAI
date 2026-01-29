/**
 * ExportProgressModal - Modal showing export progress with cancel option
 */
import { Video, X, Loader2, CheckCircle, XCircle } from 'lucide-react';

export interface ExportProgress {
  stage: 'preparing' | 'processing' | 'merging' | 'subtitles' | 'done' | 'error' | 'cancelled';
  current: number;
  total: number;
  message: string;
}

interface ExportProgressModalProps {
  isOpen: boolean;
  progress: ExportProgress | null;
  onCancel: () => void;
  onClose: () => void;
  outputPath?: string;
}

export function ExportProgressModal({
  isOpen,
  progress,
  onCancel,
  onClose,
  outputPath,
}: ExportProgressModalProps) {
  if (!isOpen) return null;

  const isDone = progress?.stage === 'done';
  const isError = progress?.stage === 'error';
  const isCancelled = progress?.stage === 'cancelled';
  const isFinished = isDone || isError || isCancelled;

  const getStageText = (stage: ExportProgress['stage']) => {
    switch (stage) {
      case 'preparing':
        return '准备中...';
      case 'processing':
        return '处理镜头...';
      case 'merging':
        return '合并视频...';
      case 'subtitles':
        return '烧录字幕...';
      case 'done':
        return '导出完成';
      case 'error':
        return '导出失败';
      case 'cancelled':
        return '已取消';
      default:
        return '处理中...';
    }
  };

  const getProgressPercent = () => {
    if (!progress) return 0;
    if (progress.stage === 'done') return 100;
    if (progress.stage === 'merging') return 90;
    if (progress.stage === 'subtitles') return 95;
    if (progress.total === 0) return 0;
    // Processing stage: 0-85%
    return Math.min(85, Math.round((progress.current / progress.total) * 85));
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-slate-800 rounded-lg p-6 w-full max-w-md mx-4">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
              isDone ? 'bg-green-500/20' : isError || isCancelled ? 'bg-red-500/20' : 'bg-blue-500/20'
            }`}>
              {isDone ? (
                <CheckCircle className="w-5 h-5 text-green-400" />
              ) : isError || isCancelled ? (
                <XCircle className="w-5 h-5 text-red-400" />
              ) : (
                <Video className="w-5 h-5 text-blue-400" />
              )}
            </div>
            <div>
              <h2 className="text-lg font-semibold text-slate-100">导出成片</h2>
              <p className="text-sm text-slate-400">{progress ? getStageText(progress.stage) : '准备中...'}</p>
            </div>
          </div>
          {isFinished && (
            <button
              onClick={onClose}
              className="p-1 hover:bg-slate-700 rounded text-slate-400 hover:text-slate-200 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          )}
        </div>

        {/* Progress */}
        <div className="mb-4">
          {/* Progress bar */}
          <div className="h-2 bg-slate-700 rounded-full overflow-hidden mb-2">
            <div
              className={`h-full rounded-full transition-all duration-500 ${
                isDone ? 'bg-green-500' : isError || isCancelled ? 'bg-red-500' : 'bg-blue-500'
              }`}
              style={{ width: `${getProgressPercent()}%` }}
            />
          </div>

          {/* Progress text */}
          <div className="flex items-center justify-between text-sm">
            <span className="text-slate-400">
              {progress?.message || '正在准备...'}
            </span>
            {progress && progress.stage === 'processing' && progress.total > 0 && (
              <span className="text-slate-500">
                {progress.current} / {progress.total}
              </span>
            )}
          </div>
        </div>

        {/* Output path when done */}
        {isDone && outputPath && (
          <div className="mb-4 p-3 bg-slate-700/50 rounded-lg">
            <p className="text-xs text-slate-400 mb-1">输出位置</p>
            <p className="text-sm text-slate-200 break-all">{outputPath}</p>
          </div>
        )}

        {/* Error message */}
        {isError && progress?.message && (
          <div className="mb-4 p-3 bg-red-500/10 border border-red-500/30 rounded-lg">
            <p className="text-sm text-red-400">{progress.message}</p>
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center justify-end gap-3">
          {!isFinished ? (
            <button
              onClick={onCancel}
              className="flex items-center gap-2 px-4 py-2 bg-slate-700 hover:bg-slate-600 text-slate-200 rounded-lg transition-colors"
            >
              <Loader2 className="w-4 h-4 animate-spin" />
              取消导出
            </button>
          ) : (
            <button
              onClick={onClose}
              className={`px-4 py-2 text-white rounded-lg transition-colors ${
                isDone
                  ? 'bg-green-600 hover:bg-green-500'
                  : 'bg-slate-600 hover:bg-slate-500'
              }`}
            >
              {isDone ? '完成' : '关闭'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
