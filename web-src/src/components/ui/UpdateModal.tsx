/**
 * UpdateModal - Modal for showing update information
 */
import { X, Download, ExternalLink, Sparkles, CheckCircle } from 'lucide-react';

interface UpdateInfo {
  hasUpdate: boolean;
  currentVersion: string;
  latestVersion: string;
  releaseNotes: string;
  downloadUrl: string;
  releaseUrl: string;
}

interface UpdateModalProps {
  isOpen: boolean;
  onClose: () => void;
  updateInfo: UpdateInfo | null;
  onDownload: (url: string) => void;
}

export function UpdateModal({ isOpen, onClose, updateInfo, onDownload }: UpdateModalProps) {
  if (!isOpen || !updateInfo) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={onClose}>
      <div
        className="bg-slate-800 rounded-xl p-6 w-[480px] max-w-[90vw] max-h-[80vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-white flex items-center gap-2">
            {updateInfo.hasUpdate ? (
              <>
                <Sparkles className="w-5 h-5 text-amber-400" />
                发现新版本
              </>
            ) : (
              <>
                <CheckCircle className="w-5 h-5 text-emerald-400" />
                已是最新版本
              </>
            )}
          </h2>
          <button
            onClick={onClose}
            className="p-1 hover:bg-slate-700 rounded-lg text-slate-400 hover:text-slate-200 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Version Info */}
        <div className="flex items-center gap-4 mb-4 p-3 bg-slate-700/50 rounded-lg">
          <div className="flex-1">
            <div className="text-xs text-slate-500 mb-1">当前版本</div>
            <div className="text-sm text-slate-300">v{updateInfo.currentVersion}</div>
          </div>
          {updateInfo.hasUpdate && (
            <>
              <div className="text-slate-500">→</div>
              <div className="flex-1">
                <div className="text-xs text-slate-500 mb-1">最新版本</div>
                <div className="text-sm text-emerald-400 font-medium">v{updateInfo.latestVersion}</div>
              </div>
            </>
          )}
        </div>

        {/* Release Notes */}
        {updateInfo.hasUpdate && updateInfo.releaseNotes && (
          <div className="flex-1 overflow-hidden flex flex-col mb-4">
            <div className="text-xs text-slate-500 mb-2">更新说明</div>
            <div className="flex-1 overflow-y-auto bg-slate-900/50 rounded-lg p-3">
              <div className="text-sm text-slate-300 whitespace-pre-wrap">
                {updateInfo.releaseNotes}
              </div>
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="flex justify-end gap-3">
          {updateInfo.hasUpdate ? (
            <>
              <button
                onClick={() => onDownload(updateInfo.releaseUrl)}
                className="flex items-center gap-2 px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg text-sm text-slate-200 transition-colors"
              >
                <ExternalLink className="w-4 h-4" />
                查看发布页
              </button>
              <button
                onClick={() => onDownload(updateInfo.downloadUrl)}
                className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-teal-600 to-teal-500 hover:from-teal-500 hover:to-teal-400 rounded-lg text-sm text-white transition-colors"
              >
                <Download className="w-4 h-4" />
                立即下载
              </button>
            </>
          ) : (
            <button
              onClick={onClose}
              className="px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg text-sm text-slate-200 transition-colors"
            >
              关闭
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
