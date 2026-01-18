/**
 * Shot Table - Main content area for displaying shots with table header
 */
import { useState } from 'react';
import { Image, Film, Trash2, Loader2, Check, AlertCircle, Clock, Play, X, ZoomIn, Volume2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import type { Shot, ShotStatus, Character } from '../../types';

interface ShotTableProps {
  shots: Shot[];
  characters: Character[];
  selectedIds: string[];
  onSelectShot: (id: string, selected: boolean) => void;
  onSelectAll: (selected: boolean) => void;
  onDeleteShots: (ids: string[]) => void;
  onGenerateImages: (id: string) => void;
  onGenerateVideo: (id: string) => void;
  onGenerateAudio: (id: string) => void;
  onSelectImage: (shotId: string, imageIndex: number) => void;
  onUpdateShot: (shotId: string, field: string, value: string | string[]) => void;
}

const statusConfig: Record<ShotStatus, { icon: React.ComponentType<{ className?: string }>; color: string; label: string; animate?: boolean }> = {
  pending: { icon: Clock, color: 'text-slate-400', label: '待处理' },
  generating_images: { icon: Loader2, color: 'text-blue-400', label: '生成图片中...', animate: true },
  images_ready: { icon: Check, color: 'text-emerald-400', label: '图片就绪' },
  generating_video: { icon: Loader2, color: 'text-violet-400', label: '生成视频中...', animate: true },
  generating_audio: { icon: Loader2, color: 'text-orange-400', label: '生成配音中...', animate: true },
  completed: { icon: Check, color: 'text-emerald-400', label: '已完成' },
  error: { icon: AlertCircle, color: 'text-red-400', label: '错误' },
};

export function ShotTable({
  shots,
  characters,
  selectedIds,
  onSelectShot,
  onSelectAll,
  onDeleteShots,
  onGenerateImages,
  onGenerateVideo,
  onGenerateAudio,
  onSelectImage,
  onUpdateShot,
}: ShotTableProps) {
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const allSelected = shots.length > 0 && selectedIds.length === shots.length;
  const someSelected = selectedIds.length > 0 && selectedIds.length < shots.length;

  return (
    <div className="h-full flex flex-col">
      {/* Table Header Row */}
      <div className="bg-slate-800 border-b border-slate-700">
        {/* Selection bar */}
        <div className="px-4 py-2 border-b border-slate-700/50">
          <div className="flex items-center gap-4">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={allSelected}
                ref={(el) => {
                  if (el) el.indeterminate = someSelected;
                }}
                onChange={(e) => onSelectAll(e.target.checked)}
                className="w-4 h-4 rounded border-slate-600 bg-slate-700 text-violet-500 focus:ring-violet-500 focus:ring-offset-0"
              />
              <span className="text-sm text-slate-400">
                {selectedIds.length > 0 ? `已选 ${selectedIds.length} 项` : '全选'}
              </span>
            </label>

            {selectedIds.length > 0 && (
              <button
                onClick={() => onDeleteShots(selectedIds)}
                className="flex items-center gap-1 px-2 py-1 bg-red-600/20 hover:bg-red-600/30 text-red-400 rounded text-xs transition-colors"
              >
                <Trash2 className="w-3.5 h-3.5" />
                删除 ({selectedIds.length})
              </button>
            )}
          </div>
        </div>

        {/* Column headers */}
        <div className="px-4 py-2 flex items-center gap-4 text-xs text-slate-400 font-medium">
          <div className="w-4" /> {/* Checkbox space */}
          <div className="w-12 text-center">序号</div>
          <div className="w-24">配音角色</div>
          <div className="flex-1 min-w-0 max-w-[200px]">文案</div>
          <div className="w-40">图片提示词</div>
          <div className="w-24">出场角色</div>
          <div className="w-48">图片预览</div>
          <div className="w-40">视频提示词</div>
          <div className="w-20 text-center">视频</div>
          <div className="w-32 text-center">操作</div>
        </div>
      </div>

      {/* Table Content */}
      <div className="flex-1 overflow-y-auto">
        {shots.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-slate-500">
            <Film className="w-16 h-16 mb-4 opacity-30" />
            <p className="text-lg">暂无镜头</p>
            <p className="text-sm mt-1">导入 Excel 文件开始创作</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-700/50">
            {shots.map((shot) => (
              <ShotRow
                key={shot.id}
                shot={shot}
                characters={characters}
                isSelected={selectedIds.includes(shot.id)}
                onSelect={(selected) => onSelectShot(shot.id, selected)}
                onGenerateImages={() => onGenerateImages(shot.id)}
                onGenerateVideo={() => onGenerateVideo(shot.id)}
                onGenerateAudio={() => onGenerateAudio(shot.id)}
                onSelectImage={(idx) => onSelectImage(shot.id, idx)}
                onDelete={() => onDeleteShots([shot.id])}
                onPreviewImage={setPreviewImage}
                onUpdateField={(field, value) => onUpdateShot(shot.id, field, value)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Image Preview Modal */}
      <AnimatePresence>
        {previewImage && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-8"
            onClick={() => setPreviewImage(null)}
          >
            <motion.div
              initial={{ scale: 0.9 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0.9 }}
              className="relative max-w-4xl max-h-full"
            >
              <img
                src={previewImage}
                alt="预览"
                className="max-w-full max-h-[80vh] rounded-lg shadow-2xl"
              />
              <button
                onClick={() => setPreviewImage(null)}
                className="absolute -top-3 -right-3 w-8 h-8 bg-slate-800 hover:bg-slate-700 rounded-full flex items-center justify-center transition-colors"
              >
                <X className="w-5 h-5 text-slate-300" />
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

interface ShotRowProps {
  shot: Shot;
  characters: Character[];
  isSelected: boolean;
  onSelect: (selected: boolean) => void;
  onGenerateImages: () => void;
  onGenerateVideo: () => void;
  onGenerateAudio: () => void;
  onSelectImage: (imageIndex: number) => void;
  onDelete: () => void;
  onPreviewImage: (url: string) => void;
  onUpdateField: (field: string, value: string | string[]) => void;
}

function ShotRow({
  shot,
  characters,
  isSelected,
  onSelect,
  onGenerateImages,
  onGenerateVideo,
  onGenerateAudio,
  onSelectImage,
  onDelete,
  onPreviewImage,
  onUpdateField,
}: ShotRowProps) {
  const status = statusConfig[shot.status];
  const StatusIcon = status.icon;
  const hasImages = shot.images.length > 0;
  const hasVideo = !!shot.videoUrl;
  const hasAudio = !!shot.audioUrl;
  const selectedImage = hasImages ? shot.images[shot.selectedImageIndex] : null;

  const isGeneratingImages = shot.status === 'generating_images';
  const isGeneratingVideo = shot.status === 'generating_video';
  const isGeneratingAudio = shot.status === 'generating_audio';

  const handleCharacterToggle = (charName: string) => {
    const currentChars = shot.characters || [];
    const newChars = currentChars.includes(charName)
      ? currentChars.filter((c) => c !== charName)
      : [...currentChars, charName];
    onUpdateField('characters', newChars);
  };

  return (
    <div className={`px-4 py-3 hover:bg-slate-800/50 transition-colors ${isSelected ? 'bg-slate-800/70' : ''}`}>
      <div className="flex items-start gap-4">
        {/* Checkbox */}
        <input
          type="checkbox"
          checked={isSelected}
          onChange={(e) => onSelect(e.target.checked)}
          className="mt-2 w-4 h-4 rounded border-slate-600 bg-slate-700 text-violet-500 focus:ring-violet-500 focus:ring-offset-0"
        />

        {/* Sequence */}
        <div className="w-12 flex-shrink-0 text-center">
          <span className="text-lg font-bold text-slate-300">#{shot.sequence}</span>
        </div>

        {/* Voice Actor */}
        <div className="w-24 flex-shrink-0">
          <input
            type="text"
            value={shot.voiceActor}
            onChange={(e) => onUpdateField('voiceActor', e.target.value)}
            className="w-full px-2 py-1 bg-slate-700/50 hover:bg-slate-700 focus:bg-slate-700 rounded text-sm text-slate-300 focus:outline-none focus:ring-1 focus:ring-violet-500 transition-colors"
            placeholder="配音角色"
          />
          <div className="flex gap-1 mt-1 flex-wrap">
            {shot.emotion && (
              <span className="text-xs px-1.5 py-0.5 bg-slate-700 rounded text-slate-400">
                {shot.emotion}
              </span>
            )}
            {shot.intensity && (
              <span className="text-xs px-1.5 py-0.5 bg-slate-700 rounded text-slate-400">
                {shot.intensity}
              </span>
            )}
          </div>
        </div>

        {/* Script with Audio Button */}
        <div className="flex-1 min-w-0 max-w-[200px]">
          <div className="flex items-center justify-end gap-1 mb-1">
            {hasAudio && (
              <div className="w-4 h-4 rounded-full bg-emerald-500/20 flex items-center justify-center">
                <Volume2 className="w-2.5 h-2.5 text-emerald-400" />
              </div>
            )}
            <button
              onClick={onGenerateAudio}
              disabled={isGeneratingAudio || !shot.script.trim()}
              className="p-1 hover:bg-orange-600/20 rounded transition-colors disabled:opacity-50"
              title="生成配音"
            >
              {isGeneratingAudio ? (
                <Loader2 className="w-3 h-3 text-orange-400 animate-spin" />
              ) : (
                <Volume2 className="w-3 h-3 text-orange-400" />
              )}
            </button>
          </div>
          <textarea
            value={shot.script}
            onChange={(e) => onUpdateField('script', e.target.value)}
            className="w-full h-20 px-2 py-1 bg-slate-700/50 hover:bg-slate-700 focus:bg-slate-700 rounded text-sm text-slate-300 resize-none focus:outline-none focus:ring-1 focus:ring-violet-500 transition-colors"
            placeholder="镜头文案"
          />
        </div>

        {/* Image Prompt */}
        <div className="w-40 flex-shrink-0">
          <textarea
            value={shot.imagePrompt}
            onChange={(e) => onUpdateField('imagePrompt', e.target.value)}
            className="w-full h-20 px-2 py-1 bg-slate-700/50 hover:bg-slate-700 focus:bg-slate-700 rounded text-xs text-slate-400 resize-none focus:outline-none focus:ring-1 focus:ring-violet-500 transition-colors"
            placeholder="TTI 提示词"
          />
        </div>

        {/* Characters (出场角色) */}
        <div className="w-24 flex-shrink-0">
          <div className="flex flex-wrap gap-1">
            {characters.map((char) => {
              const isInShot = shot.characters?.includes(char.name);
              return (
                <button
                  key={char.id}
                  onClick={() => handleCharacterToggle(char.name)}
                  className={`text-xs px-1.5 py-0.5 rounded transition-colors ${
                    isInShot
                      ? 'bg-violet-600 text-white'
                      : 'bg-slate-700 text-slate-400 hover:bg-slate-600'
                  }`}
                  title={isInShot ? '点击移除' : '点击添加'}
                >
                  {char.name}
                </button>
              );
            })}
            {characters.length === 0 && (
              <span className="text-xs text-slate-500">无角色</span>
            )}
          </div>
        </div>

        {/* Image Preview & Selection */}
        <div className="w-48 flex-shrink-0">
          {hasImages ? (
            <div className="space-y-2">
              {/* Main preview */}
              <div
                className="relative h-20 rounded-lg overflow-hidden bg-slate-700 cursor-pointer group"
                onClick={() => selectedImage && onPreviewImage(selectedImage)}
              >
                <img
                  src={selectedImage!}
                  alt={`镜头 ${shot.sequence}`}
                  className="w-full h-full object-cover"
                />
                <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                  <ZoomIn className="w-6 h-6 text-white" />
                </div>
              </div>
              {/* Thumbnails */}
              <div className="flex gap-1">
                {shot.images.map((img, idx) => (
                  <button
                    key={idx}
                    onClick={() => onSelectImage(idx)}
                    className={`relative w-10 h-10 rounded overflow-hidden transition-all ${
                      idx === shot.selectedImageIndex
                        ? 'ring-2 ring-violet-500'
                        : 'ring-1 ring-slate-600 hover:ring-slate-500'
                    }`}
                  >
                    <img src={img} alt={`选项 ${idx + 1}`} className="w-full h-full object-cover" />
                    {idx === shot.selectedImageIndex && (
                      <div className="absolute inset-0 bg-violet-500/20 flex items-center justify-center">
                        <Check className="w-4 h-4 text-violet-400" />
                      </div>
                    )}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="h-20 rounded-lg bg-slate-700/50 flex flex-col items-center justify-center text-slate-500">
              <Image className="w-6 h-6 mb-1" />
              <span className="text-xs">暂无图片</span>
            </div>
          )}
        </div>

        {/* Video Prompt */}
        <div className="w-40 flex-shrink-0">
          <textarea
            value={shot.videoPrompt}
            onChange={(e) => onUpdateField('videoPrompt', e.target.value)}
            className="w-full h-20 px-2 py-1 bg-slate-700/50 hover:bg-slate-700 focus:bg-slate-700 rounded text-xs text-slate-400 resize-none focus:outline-none focus:ring-1 focus:ring-violet-500 transition-colors"
            placeholder="TTV 提示词"
          />
        </div>

        {/* Video Preview */}
        <div className="w-20 flex-shrink-0 text-center">
          {hasVideo ? (
            <div className="h-14 rounded-lg bg-slate-700 flex items-center justify-center">
              <Play className="w-6 h-6 text-emerald-400" />
            </div>
          ) : (
            <div className="h-14 rounded-lg bg-slate-700/50 flex flex-col items-center justify-center text-slate-500">
              <Film className="w-5 h-5 mb-1" />
              <span className="text-xs">暂无</span>
            </div>
          )}
        </div>

        {/* Status & Actions */}
        <div className="w-32 flex-shrink-0 space-y-2">
          {/* Status */}
          <div className="flex items-center gap-1.5 justify-center">
            <StatusIcon className={`w-4 h-4 ${status.color} ${status.animate ? 'animate-spin' : ''}`} />
            <span className={`text-xs ${status.color}`}>{status.label}</span>
          </div>

          {/* Actions */}
          <div className="grid grid-cols-2 gap-1">
            <button
              onClick={onGenerateImages}
              disabled={isGeneratingImages || isGeneratingVideo || isGeneratingAudio}
              className="flex items-center justify-center gap-1 px-2 py-1.5 bg-violet-600 hover:bg-violet-500 disabled:opacity-50 disabled:cursor-not-allowed rounded text-xs text-white transition-colors"
              title="生成图片"
            >
              {isGeneratingImages ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Image className="w-3.5 h-3.5" />
              )}
            </button>
            <button
              onClick={onGenerateVideo}
              disabled={!hasImages || isGeneratingImages || isGeneratingVideo || isGeneratingAudio}
              className="flex items-center justify-center gap-1 px-2 py-1.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed rounded text-xs text-white transition-colors"
              title="生成视频"
            >
              {isGeneratingVideo ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Film className="w-3.5 h-3.5" />
              )}
            </button>
            <button
              onClick={onGenerateAudio}
              disabled={!shot.script.trim() || isGeneratingImages || isGeneratingVideo || isGeneratingAudio}
              className="flex items-center justify-center gap-1 px-2 py-1.5 bg-orange-600 hover:bg-orange-500 disabled:opacity-50 disabled:cursor-not-allowed rounded text-xs text-white transition-colors"
              title="生成配音"
            >
              {isGeneratingAudio ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Volume2 className="w-3.5 h-3.5" />
              )}
            </button>
            <button
              onClick={onDelete}
              className="flex items-center justify-center p-1.5 hover:bg-red-600/20 rounded text-red-400 transition-colors"
              title="删除"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* Error message */}
      {shot.status === 'error' && shot.errorMessage && (
        <div className="mt-2 ml-16 text-xs text-red-400 bg-red-400/10 px-2 py-1 rounded">
          {shot.errorMessage}
        </div>
      )}
    </div>
  );
}
