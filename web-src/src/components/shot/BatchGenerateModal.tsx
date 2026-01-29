/**
 * BatchGenerateModal - 批量生成模态窗口
 */
import { useState } from 'react';
import { X, Image, Video, Volume2, AlertCircle, CheckCircle } from 'lucide-react';
import type { Shot } from '../../types';

interface BatchGenerateModalProps {
  isOpen: boolean;
  onClose: () => void;
  type: 'image' | 'video' | 'audio';
  selectedShots: Shot[];
  onConfirm: (shotIds: string[], forceRegenerate: boolean) => void;
}

export function BatchGenerateModal({
  isOpen,
  onClose,
  type,
  selectedShots,
  onConfirm,
}: BatchGenerateModalProps) {
  const [forceRegenerate, setForceRegenerate] = useState(false);

  if (!isOpen) return null;

  const getTypeInfo = () => {
    switch (type) {
      case 'image':
        return {
          icon: Image,
          title: '批量生成图片',
          color: 'teal',
          checkExisting: (shot: Shot) => shot.images.length > 0,
          requirement: '需要图片提示词',
          checkRequirement: (shot: Shot) => shot.imagePrompt.trim().length > 0,
        };
      case 'video':
        return {
          icon: Video,
          title: '批量生成视频',
          color: 'emerald',
          checkExisting: (shot: Shot) => !!shot.videoUrl,
          requirement: '需要已生成的图片',
          checkRequirement: (shot: Shot) => shot.images.length > 0,
        };
      case 'audio':
        return {
          icon: Volume2,
          title: '批量生成配音',
          color: 'orange',
          checkExisting: (shot: Shot) => !!shot.audioUrl,
          requirement: '需要台词内容',
          checkRequirement: (shot: Shot) => shot.script.trim().length > 0,
        };
    }
  };

  const typeInfo = getTypeInfo();
  const Icon = typeInfo.icon;

  // 分析选中的镜头
  const shotsWithExisting = selectedShots.filter(typeInfo.checkExisting);
  const shotsWithoutExisting = selectedShots.filter(shot => !typeInfo.checkExisting(shot));
  const shotsWithRequirement = selectedShots.filter(typeInfo.checkRequirement);
  const shotsWithoutRequirement = selectedShots.filter(shot => !typeInfo.checkRequirement(shot));

  // 计算实际会处理的镜头
  const getTargetShots = () => {
    if (forceRegenerate) {
      return shotsWithRequirement;
    } else {
      return shotsWithoutExisting.filter(typeInfo.checkRequirement);
    }
  };

  const targetShots = getTargetShots();

  const handleConfirm = async () => {
    if (targetShots.length === 0) return;
    onClose(); // 先关闭modal，让用户看到列表
    await onConfirm(targetShots.map(s => s.id), forceRegenerate);
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-slate-800 rounded-lg border border-slate-700 w-full max-w-2xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="p-6 border-b border-slate-700">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className={`p-2 rounded-lg ${
                type === 'image' ? 'bg-teal-600/20' :
                type === 'video' ? 'bg-emerald-600/20' :
                'bg-orange-600/20'
              }`}>
                <Icon className={`w-5 h-5 ${
                  type === 'image' ? 'text-teal-400' :
                  type === 'video' ? 'text-emerald-400' :
                  'text-orange-400'
                }`} />
              </div>
              <h3 className="text-xl font-medium text-slate-200">{typeInfo.title}</h3>
            </div>
            <button
              onClick={onClose}
              className="p-2 hover:bg-slate-700 rounded-lg text-slate-400 hover:text-slate-200 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6 flex-1 overflow-y-auto">
          {/* 统计信息 */}
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-slate-700/50 rounded-lg p-4">
              <div className="text-2xl font-bold text-slate-100">{selectedShots.length}</div>
              <div className="text-sm text-slate-400">选中镜头</div>
            </div>
            <div className="bg-slate-700/50 rounded-lg p-4">
              <div className="text-2xl font-bold text-teal-400">{targetShots.length}</div>
              <div className="text-sm text-slate-400">将要处理</div>
            </div>
          </div>

          {/* 详细分析 */}
          <div className="space-y-4">
            {/* 已有内容的镜头 */}
            {shotsWithExisting.length > 0 && (
              <div className="bg-slate-700/30 rounded-lg p-4">
                <div className="flex items-center gap-2 mb-2">
                  <CheckCircle className="w-4 h-4 text-green-400" />
                  <span className="text-sm font-medium text-slate-300">
                    已有{type === 'image' ? '图片' : type === 'video' ? '视频' : '配音'}的镜头
                  </span>
                  <span className="text-xs bg-green-600/20 text-green-400 px-2 py-1 rounded">
                    {shotsWithExisting.length} 个
                  </span>
                </div>
                <div className="text-xs text-slate-400">
                  {forceRegenerate ? '将重新生成' : '将跳过（除非勾选强制重新生成）'}
                </div>
              </div>
            )}

            {/* 缺少内容的镜头 */}
            {shotsWithoutExisting.length > 0 && (
              <div className="bg-slate-700/30 rounded-lg p-4">
                <div className="flex items-center gap-2 mb-2">
                  <AlertCircle className="w-4 h-4 text-amber-400" />
                  <span className="text-sm font-medium text-slate-300">
                    缺少{type === 'image' ? '图片' : type === 'video' ? '视频' : '配音'}的镜头
                  </span>
                  <span className="text-xs bg-amber-600/20 text-amber-400 px-2 py-1 rounded">
                    {shotsWithoutExisting.length} 个
                  </span>
                </div>
                <div className="text-xs text-slate-400">
                  将自动生成（如果满足条件）
                </div>
              </div>
            )}

            {/* 不满足条件的镜头 */}
            {shotsWithoutRequirement.length > 0 && (
              <div className="bg-red-600/10 border border-red-600/20 rounded-lg p-4">
                <div className="flex items-center gap-2 mb-2">
                  <X className="w-4 h-4 text-red-400" />
                  <span className="text-sm font-medium text-red-300">
                    不满足生成条件的镜头
                  </span>
                  <span className="text-xs bg-red-600/20 text-red-400 px-2 py-1 rounded">
                    {shotsWithoutRequirement.length} 个
                  </span>
                </div>
                <div className="text-xs text-red-400">
                  {typeInfo.requirement}，这些镜头将被跳过
                </div>
              </div>
            )}
          </div>

          {/* 强制重新生成选项 */}
          {shotsWithExisting.length > 0 && (
            <div className="bg-slate-700/30 rounded-lg p-4">
              <label className="flex items-start gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={forceRegenerate}
                  onChange={(e) => setForceRegenerate(e.target.checked)}
                  className="mt-1 rounded border-slate-600 bg-slate-700 text-teal-600 focus:ring-teal-500"
                />
                <div>
                  <div className="text-sm font-medium text-slate-300">
                    强制重新生成已有内容
                  </div>
                  <div className="text-xs text-slate-400 mt-1">
                    勾选此项将对已有{type === 'image' ? '图片' : type === 'video' ? '视频' : '配音'}的镜头也重新生成，
                    这将覆盖现有内容
                  </div>
                </div>
              </label>
            </div>
          )}

          {/* 无可处理镜头的提示 */}
          {targetShots.length === 0 && (
            <div className="bg-amber-600/10 border border-amber-600/20 rounded-lg p-4 text-center">
              <AlertCircle className="w-8 h-8 text-amber-400 mx-auto mb-2" />
              <div className="text-sm text-amber-300 font-medium">没有可处理的镜头</div>
              <div className="text-xs text-amber-400 mt-1">
                {shotsWithoutRequirement.length > 0
                  ? `所有选中的镜头都不满足生成条件（${typeInfo.requirement}）`
                  : '所有选中的镜头都已有对应内容，可勾选"强制重新生成"选项'
                }
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-slate-700 flex items-center justify-end gap-3">
          <button
            onClick={onClose}
            className="px-6 py-2.5 bg-slate-700 hover:bg-slate-600 rounded-lg text-sm text-slate-300 transition-colors"
          >
            取消
          </button>
          <button
            onClick={handleConfirm}
            disabled={targetShots.length === 0}
            className={`px-6 py-2.5 rounded-lg text-sm text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
              type === 'image' ? 'bg-gradient-to-r from-teal-600 to-teal-500 hover:from-teal-500 hover:to-teal-400' :
              type === 'video' ? 'bg-emerald-600 hover:bg-emerald-500' :
              'bg-orange-600 hover:bg-orange-500'
            }`}
          >
            开始生成 ({targetShots.length} 个镜头)
          </button>
        </div>
      </div>
    </div>
  );
}