/**
 * Generate Dropdown - A dropdown menu for generation operations
 */
import { Type, Mic, Image, Video, ChevronDown, Loader2, Sparkles } from 'lucide-react';

interface GenerationProgress {
  type: 'image' | 'video' | 'audio';
  current: number;
  total: number;
}

interface GenerateDropdownProps {
  onAddPrefix: () => void;
  onBatchAudio: () => void;
  onBatchImage: () => void;
  onBatchVideo: () => void;
  selectedCount: number;
  isGenerating: boolean;
  generationProgress?: GenerationProgress | null;
}

export function GenerateDropdown({
  onAddPrefix,
  onBatchAudio,
  onBatchImage,
  onBatchVideo,
  selectedCount,
  isGenerating,
  generationProgress,
}: GenerateDropdownProps) {
  const hasSelection = selectedCount > 0;

  // 根据生成状态显示不同的按钮内容
  const renderButtonContent = () => {
    if (isGenerating && generationProgress) {
      const typeLabel = generationProgress.type === 'image' ? '图片' 
                      : generationProgress.type === 'video' ? '视频' 
                      : '配音';
      return (
        <>
          <Loader2 className="w-4 h-4 animate-spin" />
          生成{typeLabel} {generationProgress.current}/{generationProgress.total}
        </>
      );
    }
    return (
      <>
        <Sparkles className="w-4 h-4" />
        生成
        <ChevronDown className="w-3 h-3" />
      </>
    );
  };

  return (
    <div className="relative group">
      {/* Main button */}
      <button 
        className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-white transition-colors ${
          isGenerating 
            ? 'bg-teal-600/80 cursor-wait' 
            : 'bg-gradient-to-r from-teal-600 to-teal-500 hover:from-teal-500 hover:to-teal-400'
        }`}
      >
        {renderButtonContent()}
      </button>

      {/* Dropdown menu */}
      <div className="absolute left-0 top-full mt-1 w-48 bg-slate-800 border border-slate-700 rounded-lg shadow-xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-150 z-50">
        {/* 添加前缀 */}
        <div className="py-1">
          <button
            onClick={onAddPrefix}
            className="w-full flex items-center gap-2 px-3 py-2 text-sm text-slate-200 hover:bg-slate-700 transition-colors"
          >
            <Type className="w-4 h-4 text-slate-400" />
            添加前缀
          </button>
        </div>

        {/* Divider */}
        <div className="border-t border-slate-700" />

        {/* 批量生成区域 */}
        <div className="py-1">
          <button
            onClick={onBatchAudio}
            disabled={isGenerating || !hasSelection}
            className={`w-full flex items-center justify-between gap-2 px-3 py-2 text-sm transition-colors ${
              isGenerating || !hasSelection 
                ? 'text-slate-500 cursor-not-allowed' 
                : 'text-slate-200 hover:bg-slate-700'
            }`}
          >
            <span className="flex items-center gap-2">
              {isGenerating && generationProgress?.type === 'audio' ? (
                <Loader2 className="w-4 h-4 text-orange-400 animate-spin" />
              ) : (
                <Mic className="w-4 h-4 text-orange-400" />
              )}
              批量配音
            </span>
            <span className="text-xs text-slate-500">
              {isGenerating && generationProgress?.type === 'audio' 
                ? `${generationProgress.current}/${generationProgress.total}` 
                : `(${selectedCount})`}
            </span>
          </button>
          <button
            onClick={onBatchImage}
            disabled={isGenerating || !hasSelection}
            className={`w-full flex items-center justify-between gap-2 px-3 py-2 text-sm transition-colors ${
              isGenerating || !hasSelection 
                ? 'text-slate-500 cursor-not-allowed' 
                : 'text-slate-200 hover:bg-slate-700'
            }`}
          >
            <span className="flex items-center gap-2">
              {isGenerating && generationProgress?.type === 'image' ? (
                <Loader2 className="w-4 h-4 text-teal-400 animate-spin" />
              ) : (
                <Image className="w-4 h-4 text-teal-400" />
              )}
              批量生图
            </span>
            <span className="text-xs text-slate-500">
              {isGenerating && generationProgress?.type === 'image' 
                ? `${generationProgress.current}/${generationProgress.total}` 
                : `(${selectedCount})`}
            </span>
          </button>
          <button
            onClick={onBatchVideo}
            disabled={isGenerating || !hasSelection}
            className={`w-full flex items-center justify-between gap-2 px-3 py-2 text-sm transition-colors ${
              isGenerating || !hasSelection 
                ? 'text-slate-500 cursor-not-allowed' 
                : 'text-slate-200 hover:bg-slate-700'
            }`}
          >
            <span className="flex items-center gap-2">
              {isGenerating && generationProgress?.type === 'video' ? (
                <Loader2 className="w-4 h-4 text-emerald-400 animate-spin" />
              ) : (
                <Video className="w-4 h-4 text-emerald-400" />
              )}
              批量生视频
            </span>
            <span className="text-xs text-slate-500">
              {isGenerating && generationProgress?.type === 'video' 
                ? `${generationProgress.current}/${generationProgress.total}` 
                : `(${selectedCount})`}
            </span>
          </button>
        </div>
      </div>
    </div>
  );
}
