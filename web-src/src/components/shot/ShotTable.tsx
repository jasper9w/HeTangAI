/**
 * Shot Table - Main content area for displaying shots with Excel-style column filters
 */
import { useState, useEffect, useRef, useMemo } from 'react';
import { Image, Film, Trash2, Loader2, Check, X, ZoomIn, Plus, Play, Pause } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useVirtualizer } from '@tanstack/react-virtual';
import { VideoModal } from '../ui/VideoModal';
import { useColumnFilter } from './ColumnFilter';
import { ColumnHeaderFilter, SearchFilter, StatusFilter } from './ExcelColumnFilter';
import type { Shot, Character, Scene } from '../../types';

// 角色颜色映射 - 使用柔和但可辨识的颜色
const CHARACTER_COLORS = [
  '#60a5fa', // blue-400
  '#34d399', // emerald-400
  '#f472b6', // pink-400
  '#a78bfa', // violet-400
  '#fbbf24', // amber-400
  '#2dd4bf', // teal-400
  '#fb923c', // orange-400
  '#818cf8', // indigo-400
  '#4ade80', // green-400
  '#f87171', // red-400
];

// 为角色分配颜色
function getCharacterColor(characterName: string, characters: Character[]): string {
  const idx = characters.findIndex(c => c.name === characterName);
  if (idx >= 0) {
    return CHARACTER_COLORS[idx % CHARACTER_COLORS.length];
  }
  return '#94a3b8'; // slate-400 默认色
}

// 检查是否是旁白角色
function isNarratorRole(roleName: string, characters: Character[]): boolean {
  const char = characters.find(c => c.name === roleName);
  return char?.isNarrator ?? false;
}

// 检查是否是已定义角色
function isDefinedCharacter(roleName: string, characters: Character[]): boolean {
  return characters.some(c => c.name === roleName);
}

// 高亮文本中的角色名称
function highlightCharacterNames(text: string, characters: Character[]): React.ReactNode {
  if (!text || characters.length === 0) {
    return <span className="text-slate-400">{text}</span>;
  }

  // 获取所有角色名，按长度降序排列（优先匹配长的名称）
  const charNames = characters.map(c => c.name).filter(n => n).sort((a, b) => b.length - a.length);
  
  if (charNames.length === 0) {
    return <span className="text-slate-400">{text}</span>;
  }

  // 创建正则表达式匹配所有角色名
  const escapedNames = charNames.map(name => name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  const regex = new RegExp(`(${escapedNames.join('|')})`, 'g');

  // 分割文本并高亮
  const parts = text.split(regex);
  
  return parts.map((part, idx) => {
    const isCharacter = characters.some(c => c.name === part);
    if (isCharacter) {
      const color = getCharacterColor(part, characters);
      return (
        <span key={idx} style={{ color, fontWeight: 500 }}>
          {part}
        </span>
      );
    }
    return <span key={idx} className="text-slate-400">{part}</span>;
  });
}

interface ShotTableProps {
  shots: Shot[];
  characters: Character[];
  scenes: Scene[];
  selectedIds: string[];
  onSelectShot: (id: string, selected: boolean) => void;
  onSelectAll: (selected: boolean) => void;
  onDeleteShots: (ids: string[]) => void;
  onGenerateImages: (id: string) => void;
  onGenerateVideo: (id: string) => void;
  onGenerateAudio: (id: string) => void;
  onSelectImage: (shotId: string, imageIndex: number) => void;
  onSelectVideo: (shotId: string, videoIndex: number) => void;
  onUpdateShot: (shotId: string, field: string, value: string | string[] | { role: string; text: string }[]) => void;
  onFilterChange: (filteredShots: Shot[]) => void;
  onInsertShot: (afterShotId: string | null) => void;
}

export function ShotTable({
  shots,
  characters,
  scenes,
  selectedIds,
  onSelectShot,
  onSelectAll,
  onDeleteShots,
  onGenerateImages,
  onGenerateVideo,
  onGenerateAudio,
  onSelectImage,
  onSelectVideo,
  onUpdateShot,
  onFilterChange,
  onInsertShot,
}: ShotTableProps) {
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [previewVideo, setPreviewVideo] = useState<{ url: string; title: string } | null>(null);
  const [isSceneModalOpen, setIsSceneModalOpen] = useState(false);
  const [sceneModalShotId, setSceneModalShotId] = useState<string | null>(null);
  const [sceneModalShotSceneName, setSceneModalShotSceneName] = useState<string>('');
  const [hoveredShotId, setHoveredShotId] = useState<string | null>(null);
  const [playingAudioId, setPlayingAudioId] = useState<string | null>(null);
  const parentRef = useRef<HTMLDivElement>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const sceneByName = useMemo(() => {
    const map = new Map<string, Scene>();
    for (const scene of scenes) {
      const key = scene.name?.trim();
      if (!key) continue;
      map.set(key, scene);
    }
    return map;
  }, [scenes]);

  const openSceneModal = (shotId: string, currentSceneName: string) => {
    setSceneModalShotId(shotId);
    setSceneModalShotSceneName(currentSceneName);
    setIsSceneModalOpen(true);
  };

  const closeSceneModal = () => {
    setIsSceneModalOpen(false);
    setSceneModalShotId(null);
    setSceneModalShotSceneName('');
  };

  const handleSelectScene = (scene: Scene) => {
    if (!sceneModalShotId) return;
    onUpdateShot(sceneModalShotId, 'scene', scene.name);
    closeSceneModal();
  };

  const handleClearScene = () => {
    if (!sceneModalShotId) return;
    onUpdateShot(sceneModalShotId, 'scene', '');
    closeSceneModal();
  };

  // 使用列筛选钩子
  const {
    filters,
    updateFilter,
    clearAllFilters,
    hasActiveFilters,
    filteredShots,
    filteredCount,
  } = useColumnFilter({ shots, characters });

  // 设置虚拟列表 - 使用固定高度避免重叠
  const rowVirtualizer = useVirtualizer({
    count: filteredShots.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 240, // 固定高度：内容区域180px + 一些额外空间
    overscan: 5, // 预渲染5个额外的行
  });

  // 通知父组件筛选结果变化
  useEffect(() => {
    onFilterChange(filteredShots);
  }, [filteredShots, onFilterChange]);

  // 音频播放控制
  const handleAudioPlay = (shotId: string, audioUrl: string) => {
    // 如果点击的是正在播放的音频，则停止播放
    if (playingAudioId === shotId) {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
      setPlayingAudioId(null);
      return;
    }

    // 停止当前播放的音频
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }

    // 播放新的音频
    const audio = new Audio(audioUrl);
    audioRef.current = audio;
    setPlayingAudioId(shotId);

    audio.play();

    // 监听播放结束事件
    audio.addEventListener('ended', () => {
      setPlayingAudioId(null);
      audioRef.current = null;
    });

    // 监听错误事件
    audio.addEventListener('error', () => {
      setPlayingAudioId(null);
      audioRef.current = null;
    });
  };

  // 清理音频资源
  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
    };
  }, []);

  // 获取图片状态
  const getImageStatus = (shot: Shot): string => {
    if (shot.status === 'generating_images') return 'generating';
    if (shot.status === 'error') return 'error';
    if (shot.images.length > 0) return 'generated';
    return 'pending';
  };

  // 获取视频状态
  const getVideoStatus = (shot: Shot): string => {
    if (shot.status === 'generating_video') return 'generating';
    if (shot.status === 'error') return 'error';
    if (shot.videos && shot.videos.length > 0) return 'generated';
    return 'pending';
  };

  // 状态标签映射
  const imageStatusLabels = {
    generated: '已生成',
    pending: '待生成',
    generating: '生成中',
    error: '错误',
  };

  const videoStatusLabels = {
    generated: '已生成',
    pending: '待生成',
    generating: '生成中',
    error: '错误',
  };

  // Handle ESC key for image preview
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        if (previewImage) {
          setPreviewImage(null);
        }
      }
    };

    if (previewImage) {
      document.addEventListener('keydown', handleKeyDown);
      document.body.style.overflow = 'hidden';
    }

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = 'unset';
    };
  }, [previewImage]);

  return (
    <div className="h-full flex flex-col">
      {/* Table Header with Excel-style Filters */}
      <div className="bg-slate-800 border-b border-slate-700 flex-shrink-0">
        {/* Selection bar */}
        <div className="px-4 py-2 border-b border-slate-700/50">
          <div className="flex items-center gap-4">
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              镜头列表
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

            {hasActiveFilters && (
              <div className="flex items-center gap-2 ml-auto">
                <span className="text-xs text-slate-400">
                  显示 {filteredCount} / {shots.length} 个镜头
                </span>
                <button
                  onClick={clearAllFilters}
                  className="px-2 py-1 bg-red-600/20 hover:bg-red-600/30 text-red-400 rounded text-xs transition-colors"
                >
                  清除筛选
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Column headers with filter icons */}
        <div className="px-4 py-2 flex items-center gap-4 overflow-x-auto">
          {/* Checkbox column - 全选 */}
          <div className="w-8">
            <input
              type="checkbox"
              checked={
                filteredShots.length > 0 &&
                filteredShots.every(shot => selectedIds.includes(shot.id))
              }
              ref={(el) => {
                if (el) {
                  const selectedFilteredCount = filteredShots.filter(shot => selectedIds.includes(shot.id)).length;
                  el.indeterminate = selectedFilteredCount > 0 && selectedFilteredCount < filteredShots.length;
                }
              }}
              onChange={(e) => onSelectAll(e.target.checked)}
              className="w-4 h-4 rounded border-slate-600 bg-slate-700 text-violet-600 focus:ring-violet-500 cursor-pointer"
              title="全选/取消全选当前筛选结果"
            />
          </div>

          {/* 配音列 */}
          <div className="w-84">  {/* 增加宽度以容纳对话列表 */}
            <ColumnHeaderFilter
              title="配音"
              hasActiveFilter={!!filters.script.value || filters.script.inverted}
            >
              <SearchFilter
                value={filters.script.value}
                inverted={filters.script.inverted}
                onChange={(value) => updateFilter('script', { ...filters.script, value })}
                onInvertedChange={(inverted) => updateFilter('script', { ...filters.script, inverted })}
                placeholder="搜索配音内容..."
              />
            </ColumnHeaderFilter>
          </div>

          {/* 场景列 */}
          <div className="w-[101px] flex-shrink-0">
            <ColumnHeaderFilter
              title="场景"
              hasActiveFilter={!!filters.scene.value || filters.scene.inverted}
            >
              <SearchFilter
                value={filters.scene.value}
                inverted={filters.scene.inverted}
                onChange={(value) => updateFilter('scene', { ...filters.scene, value })}
                onInvertedChange={(inverted) => updateFilter('scene', { ...filters.scene, inverted })}
                placeholder="搜索场景..."
              />
            </ColumnHeaderFilter>
          </div>

          {/* 图片提示词列 */}
          <div className="w-44">
            <ColumnHeaderFilter
              title="图片提示词"
              hasActiveFilter={!!filters.imagePrompt.value || filters.imagePrompt.inverted}
            >
              <SearchFilter
                value={filters.imagePrompt.value}
                inverted={filters.imagePrompt.inverted}
                onChange={(value) => updateFilter('imagePrompt', { ...filters.imagePrompt, value })}
                onInvertedChange={(inverted) => updateFilter('imagePrompt', { ...filters.imagePrompt, inverted })}
                placeholder="搜索提示词..."
              />
            </ColumnHeaderFilter>
          </div>


          {/* 图片预览列 */}
          <div className="w-44">
            <ColumnHeaderFilter
              title="图片预览"
              hasActiveFilter={filters.imageStatus.values.length > 0 || filters.imageStatus.inverted}
            >
              <StatusFilter
                selectedValues={filters.imageStatus.values}
                inverted={filters.imageStatus.inverted}
                onChange={(values) => updateFilter('imageStatus', { ...filters.imageStatus, values })}
                onInvertedChange={(inverted) => updateFilter('imageStatus', { ...filters.imageStatus, inverted })}
                shots={shots}
                getStatus={getImageStatus}
                statusLabels={imageStatusLabels}
              />
            </ColumnHeaderFilter>
          </div>

          {/* 视频提示词列 */}
          <div className="w-44">
            <ColumnHeaderFilter
              title="视频提示词"
              hasActiveFilter={!!filters.videoPrompt.value || filters.videoPrompt.inverted}
            >
              <SearchFilter
                value={filters.videoPrompt.value}
                inverted={filters.videoPrompt.inverted}
                onChange={(value) => updateFilter('videoPrompt', { ...filters.videoPrompt, value })}
                onInvertedChange={(inverted) => updateFilter('videoPrompt', { ...filters.videoPrompt, inverted })}
                placeholder="搜索提示词..."
              />
            </ColumnHeaderFilter>
          </div>

          {/* 视频列 */}
          <div className="w-44">
            <ColumnHeaderFilter
              title="视频"
              hasActiveFilter={filters.videoStatus.values.length > 0 || filters.videoStatus.inverted}
            >
              <StatusFilter
                selectedValues={filters.videoStatus.values}
                inverted={filters.videoStatus.inverted}
                onChange={(values) => updateFilter('videoStatus', { ...filters.videoStatus, values })}
                onInvertedChange={(inverted) => updateFilter('videoStatus', { ...filters.videoStatus, inverted })}
                shots={shots}
                getStatus={getVideoStatus}
                statusLabels={videoStatusLabels}
              />
            </ColumnHeaderFilter>
          </div>
        </div>
      </div>

      {/* Table Content */}
      <div ref={parentRef} className="flex-1 overflow-auto">
        {filteredShots.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-slate-500">
            <Film className="w-16 h-16 mb-4 opacity-30" />
            {shots.length === 0 ? (
              <>
                <p className="text-lg">暂无镜头</p>
                <p className="text-sm mt-1">导入 Excel 文件开始创作</p>
              </>
            ) : (
              <>
                <p className="text-lg">没有匹配的镜头</p>
                <p className="text-sm mt-1">尝试调整筛选条件</p>
                {hasActiveFilters && (
                  <button
                    onClick={clearAllFilters}
                    className="mt-3 px-4 py-2 bg-violet-600 hover:bg-violet-500 text-white rounded-lg text-sm transition-colors"
                  >
                    清除所有筛选
                  </button>
                )}
              </>
            )}
          </div>
        ) : (
          <div
            style={{
              height: `${rowVirtualizer.getTotalSize()}px`,
              width: '100%',
              position: 'relative',
            }}
          >
            {rowVirtualizer.getVirtualItems().map((virtualRow) => {
              const shot = filteredShots[virtualRow.index];
              const isFirst = virtualRow.index === 0;

              return (
                <div
                  key={shot.id}
                  data-index={virtualRow.index}
                  ref={rowVirtualizer.measureElement}
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '100%',
                    transform: `translateY(${virtualRow.start}px)`,
                  }}
                >
                  {/* 在第一个镜头前添加插入按钮 */}
                  {isFirst && (
                    <div
                      className="relative h-0.5 bg-slate-700/50 group"
                      onMouseEnter={() => setHoveredShotId('before-first')}
                      onMouseLeave={() => setHoveredShotId(null)}
                    >
                      {hoveredShotId === 'before-first' && (
                        <button
                          onClick={() => onInsertShot(null)}
                          className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 flex items-center gap-1 px-3 py-1 bg-violet-600 hover:bg-violet-500 text-white text-xs rounded-full shadow-lg transition-colors z-10"
                        >
                          <Plus className="w-3 h-3" />
                          插入镜头
                        </button>
                      )}
                    </div>
                  )}

                  <div
                    onMouseEnter={() => setHoveredShotId(shot.id)}
                    onMouseLeave={() => setHoveredShotId(null)}
                  >
                    <ShotRow
                      shot={shot}
                      characters={characters}
                      scene={shot.scene ? (sceneByName.get(shot.scene.trim()) || null) : null}
                      isSelected={selectedIds.includes(shot.id)}
                      isPlayingAudio={playingAudioId === shot.id}
                      onOpenSceneModal={openSceneModal}
                      onSelect={(selected) => onSelectShot(shot.id, selected)}
                      onGenerateImages={() => onGenerateImages(shot.id)}
                      onGenerateVideo={() => onGenerateVideo(shot.id)}
                      onGenerateAudio={() => onGenerateAudio(shot.id)}
                      onSelectImage={(idx) => onSelectImage(shot.id, idx)}
                      onSelectVideo={(idx) => onSelectVideo(shot.id, idx)}
                      onDelete={() => onDeleteShots([shot.id])}
                      onPreviewImage={setPreviewImage}
                      onPreviewVideo={(url, title) => setPreviewVideo({ url, title })}
                      onUpdateField={(field, value) => onUpdateShot(shot.id, field, value)}
                      onPlayAudio={(audioUrl) => handleAudioPlay(shot.id, audioUrl)}
                    />
                  </div>

                  {/* 在每个镜头后添加插入按钮 */}
                  <div
                    className="relative h-0.5 bg-slate-700/50 group"
                    onMouseEnter={() => setHoveredShotId(`after-${shot.id}`)}
                    onMouseLeave={() => setHoveredShotId(null)}
                  >
                    {hoveredShotId === `after-${shot.id}` && (
                      <button
                        onClick={() => onInsertShot(shot.id)}
                        className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 flex items-center gap-1 px-3 py-1 bg-violet-600 hover:bg-violet-500 text-white text-xs rounded-full shadow-lg transition-colors z-10"
                      >
                        <Plus className="w-3 h-3" />
                        插入镜头
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Scene Select Modal */}
      {isSceneModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={closeSceneModal}>
          <div
            className="bg-slate-800 rounded-lg p-6 w-full max-w-3xl mx-4 max-h-[80vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-medium text-slate-200">选择场景</h3>
              <button
                onClick={closeSceneModal}
                className="text-slate-400 hover:text-slate-200"
                title="关闭"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto">
              {scenes.length === 0 ? (
                <div className="text-sm text-slate-400 text-center py-10">
                  暂无场景，请先在场景页创建
                </div>
              ) : (
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                  {scenes.map((scene) => {
                    const isSelected = scene.name === sceneModalShotSceneName.trim();
                    return (
                      <button
                        key={scene.id}
                        type="button"
                        onClick={() => handleSelectScene(scene)}
                        className={`text-left border rounded-lg overflow-hidden transition-colors ${
                          isSelected
                            ? 'border-violet-500 bg-violet-500/10'
                            : 'border-slate-700 hover:border-slate-600'
                        }`}
                      >
                        <div className="relative aspect-video bg-slate-700">
                          {scene.imageUrl ? (
                            <img
                              src={scene.imageUrl}
                              alt={scene.name}
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center text-slate-500">
                              <Image className="w-6 h-6" />
                            </div>
                          )}
                          {isSelected && (
                            <div className="absolute inset-0 bg-violet-500/20 flex items-center justify-center">
                              <Check className="w-5 h-5 text-violet-300" />
                            </div>
                          )}
                        </div>
                        <div className="px-3 py-2 text-sm text-slate-200 truncate">
                          {scene.name}
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="flex justify-end gap-2 mt-4">
              <button
                onClick={handleClearScene}
                className="px-4 py-2 bg-red-600/20 hover:bg-red-600/30 text-red-400 rounded text-sm transition-colors"
              >
                清空场景
              </button>
              <button
                onClick={closeSceneModal}
                className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-slate-200 rounded text-sm transition-colors"
              >
                取消
              </button>
            </div>
          </div>
        </div>
      )}

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
              onClick={(e) => e.stopPropagation()}
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
              {/* ESC hint */}
              <div className="absolute -bottom-8 left-1/2 transform -translate-x-1/2 text-sm text-slate-400">
                按 ESC 键或点击背景关闭
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Video Preview Modal */}
      <VideoModal
        isOpen={!!previewVideo}
        onClose={() => setPreviewVideo(null)}
        videoUrl={previewVideo?.url || ''}
        title={previewVideo?.title || ''}
      />
    </div>
  );
}

interface ShotRowProps {
  shot: Shot;
  characters: Character[];
  scene: Scene | null;
  isSelected: boolean;
  isPlayingAudio: boolean;
  onOpenSceneModal: (shotId: string, sceneName: string) => void;
  onSelect: (selected: boolean) => void;
  onGenerateImages: () => void;
  onGenerateVideo: () => void;
  onGenerateAudio: () => void;
  onSelectImage: (imageIndex: number) => void;
  onSelectVideo: (videoIndex: number) => void;
  onDelete: () => void;
  onPreviewImage: (url: string) => void;
  onPreviewVideo: (url: string, title: string) => void;
  onUpdateField: (field: string, value: string | string[] | { role: string; text: string }[]) => void;
  onPlayAudio: (audioUrl: string) => void;
}

// 高亮文本编辑器组件 - 使用叠加层实现
interface HighlightedTextAreaProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  renderHighlight: (text: string) => React.ReactNode;
}

function HighlightedTextArea({
  value,
  onChange,
  placeholder,
  className = '',
  renderHighlight,
}: HighlightedTextAreaProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const highlightRef = useRef<HTMLDivElement>(null);

  // 同步滚动
  const handleScroll = () => {
    if (textareaRef.current && highlightRef.current) {
      highlightRef.current.scrollTop = textareaRef.current.scrollTop;
      highlightRef.current.scrollLeft = textareaRef.current.scrollLeft;
    }
  };

  // 共享的文本样式，确保 textarea 和高亮层完全一致
  const sharedTextStyle = {
    fontSize: '12px',      // text-xs
    lineHeight: '18px',    // 固定行高
    fontFamily: 'ui-sans-serif, system-ui, sans-serif',
  };

  return (
    <div className={`relative ${className}`}>
      {/* 高亮层 - 在下面 */}
      <div
        ref={highlightRef}
        className="absolute inset-0 px-2 py-1 overflow-hidden whitespace-pre-wrap break-words pointer-events-none"
        style={{ 
          ...sharedTextStyle,
          wordBreak: 'break-word',
          overflowWrap: 'break-word',
        }}
      >
        {renderHighlight(value)}
        {/* 添加空白以防止滚动时内容截断 */}
        <span className="invisible">&nbsp;</span>
      </div>
      {/* 透明文本框 - 在上面，可编辑 */}
      <textarea
        ref={textareaRef}
        className="absolute inset-0 w-full h-full px-2 py-1 bg-transparent text-transparent caret-slate-300 outline-none resize-none overflow-y-auto"
        style={{
          ...sharedTextStyle,
          caretColor: '#cbd5e1', // slate-300
          WebkitTextFillColor: 'transparent',
        }}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onScroll={handleScroll}
        placeholder={placeholder}
      />
      {/* Placeholder */}
      {!value && placeholder && (
        <div className="absolute left-2 top-1 text-xs text-slate-500 pointer-events-none">
          {placeholder}
        </div>
      )}
    </div>
  );
}

function ShotRow({
  shot,
  characters,
  scene,
  isSelected,
  isPlayingAudio,
  onOpenSceneModal,
  onSelect,
  onGenerateImages,
  onGenerateVideo,
  onGenerateAudio,
  onSelectImage,
  onSelectVideo,
  onDelete: _onDelete,
  onPreviewImage,
  onPreviewVideo,
  onUpdateField,
  onPlayAudio,
}: ShotRowProps) {
  const hasImages = shot.images.length > 0;
  const hasVideo = shot.videos && shot.videos.length > 0;
  const hasAudio = !!shot.audioUrl;
  const selectedImage = hasImages ? shot.images[shot.selectedImageIndex] : null;
  const selectedVideo = hasVideo ? shot.videos[shot.selectedVideoIndex || 0] : null;
  const sceneName = shot.scene?.trim() || '';

  const isGeneratingImages = shot.status === 'generating_images';
  const isGeneratingVideo = shot.status === 'generating_video';
  const isGeneratingAudio = shot.status === 'generating_audio';

  return (
    <div className={`px-4 py-3 hover:bg-slate-800/50 transition-colors relative ${isSelected ? 'bg-slate-800/70' : ''}`}>
      <div className="flex items-start gap-4 h-[180px]">
        {/* Checkbox with sequence number - full cell clickable */}
        <div
          className="flex flex-col items-center justify-center w-8 h-[180px] cursor-pointer"
          onClick={() => onSelect(!isSelected)}
        >
          <input
            type="checkbox"
            checked={isSelected}
            onChange={(e) => onSelect(e.target.checked)}
            className="w-4 h-4 rounded border-slate-600 bg-slate-700 text-violet-500 focus:ring-violet-500 focus:ring-offset-0 cursor-pointer"
            onClick={(e) => e.stopPropagation()} // 防止事件冒泡
          />
          <span className="text-xs text-slate-400 mt-1">#{shot.sequence}</span>
        </div>

        {/* 配音列 - 高亮文本框 */}
        <div className="w-80 flex-shrink-0 relative h-[180px]">
          <div className="h-[180px] space-y-2 overflow-y-auto relative">
            <HighlightedTextArea
              className="w-full h-full bg-slate-700/50 rounded pr-10 pb-8"
              value={shot.script || ''}
              onChange={(plainText) => {
                const lines = plainText.split('\n');
                const newDialogues: { role: string; text: string }[] = [];

                for (const line of lines) {
                  const colonIndex = line.indexOf(': ');
                  if (colonIndex !== -1) {
                    const role = line.substring(0, colonIndex);
                    const text = line.substring(colonIndex + 2);
                    if (role.trim() || text.trim()) {
                      newDialogues.push({ role, text });
                    }
                  } else if (line.trim()) {
                    newDialogues.push({ role: '', text: line });
                  }
                }

                onUpdateField('dialogues', newDialogues);
                onUpdateField('script', plainText);
              }}
              renderHighlight={(text) => {
                // 按行解析配音文本，高亮冒号后的角色部分
                const lines = text.split('\n');
                return lines.map((line, idx) => {
                  const colonIndex = line.indexOf(': ');
                  if (colonIndex !== -1) {
                    const role = line.substring(0, colonIndex);
                    const rest = line.substring(colonIndex);
                    
                    // 确定角色颜色
                    let roleColor: string;
                    if (isNarratorRole(role, characters)) {
                      roleColor = getCharacterColor(role, characters);
                    } else if (isDefinedCharacter(role, characters)) {
                      roleColor = getCharacterColor(role, characters);
                    } else if (role.trim()) {
                      // 非旁白且非已定义角色，染为红色警示
                      roleColor = '#f87171'; // red-400
                    } else {
                      roleColor = '#94a3b8'; // slate-400
                    }
                    
                    return (
                      <span key={idx}>
                        <span style={{ color: roleColor, fontWeight: 500 }}>{role}</span>
                        <span className="text-slate-300">{rest}</span>
                        {idx < lines.length - 1 && '\n'}
                      </span>
                    );
                  } else {
                    return (
                      <span key={idx} className="text-slate-300">
                        {line}
                        {idx < lines.length - 1 && '\n'}
                      </span>
                    );
                  }
                });
              }}
            />
            {/* 配音控制按钮 - 叠放在文本框右下角 */}
            <div className="absolute bottom-1 right-1 flex items-center gap-1">
              {hasAudio && (
                <button
                  onClick={() => onPlayAudio(shot.audioUrl)}
                  className={`p-1.5 rounded transition-colors backdrop-blur-sm ${
                    isPlayingAudio
                      ? 'bg-emerald-600/20'
                      : 'bg-slate-800/80 hover:bg-emerald-600/20'
                  }`}
                  title={isPlayingAudio ? '停止播放' : '试听配音'}
                >
                  {isPlayingAudio ? (
                    <Pause className="w-4 h-4 text-emerald-400" />
                  ) : (
                    <Play className="w-4 h-4 text-emerald-400" />
                  )}
                </button>
              )}
              <button
                onClick={onGenerateAudio}
                disabled={isGeneratingAudio || !shot.dialogues || shot.dialogues.length === 0}
                className={`px-2 py-1 rounded text-[10px] transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                  hasAudio
                    ? 'bg-slate-800/90 hover:bg-orange-600 text-orange-400 hover:text-white'
                    : 'bg-orange-600 hover:bg-orange-500 text-white'
                }`}
                title="生成配音"
              >
                {isGeneratingAudio ? (
                  <>
                    <Loader2 className="w-3 h-3 animate-spin inline mr-1" />
                    <span>生成中</span>
                  </>
                ) : (
                  '生成配音'
                )}
              </button>
            </div>
          </div>
        </div>

        {/* 场景列 */}
        <div className="flex-shrink-0">
          <div
            className={`relative w-[101px] h-[180px] rounded-lg overflow-hidden ${
              scene?.imageUrl ? 'bg-slate-700 cursor-pointer group' : 'bg-slate-700/50'
            }`}
            onClick={() => scene?.imageUrl && onPreviewImage(scene.imageUrl)}
            title={scene?.imageUrl ? '预览场景图' : '暂无场景图'}
          >
            {scene?.imageUrl ? (
              <>
                <img
                  src={scene.imageUrl}
                  alt={sceneName || scene.name}
                  className="w-full h-full object-cover"
                />
                <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                  <ZoomIn className="w-6 h-6 text-white" />
                </div>
              </>
            ) : (
              <div className="w-full h-full flex flex-col items-center justify-center text-slate-500">
                <Image className="w-6 h-6 mb-1" />
                <span className="text-[10px]">暂无场景</span>
              </div>
            )}
            {/* 场景名叠加在底部 */}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onOpenSceneModal(shot.id, sceneName);
              }}
              className="absolute bottom-0 left-0 right-0 bg-black/60 px-2 py-1.5 text-[10px] text-slate-200 truncate text-center hover:bg-black/70 transition-colors"
              title="选择场景"
            >
              {sceneName || '未设置'}
            </button>
          </div>
        </div>

        {/* Image Prompt - 高亮角色名 */}
        <div className="w-44 flex-shrink-0 h-[180px] relative">
          <HighlightedTextArea
            className="w-full h-[180px] bg-slate-700/50 hover:bg-slate-700 rounded pr-8 pb-6"
            value={shot.imagePrompt || ''}
            onChange={(value) => onUpdateField('imagePrompt', value)}
            placeholder="TTI 提示词"
            renderHighlight={(text) => highlightCharacterNames(text, characters)}
          />
          {/* 生成图片按钮 - 叠放在文本框右下角 */}
          <button
            onClick={(e) => { e.stopPropagation(); onGenerateImages(); }}
            disabled={isGeneratingVideo || !shot.imagePrompt.trim()}
            className={`absolute bottom-1 right-1 px-2 py-1 rounded text-[10px] transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
              hasImages
                ? 'bg-slate-800/90 hover:bg-violet-600 text-violet-400 hover:text-white'
                : 'bg-violet-600 hover:bg-violet-500 text-white'
            }`}
          >
            {isGeneratingImages ? (
              <>
                <Loader2 className="w-3 h-3 animate-spin inline mr-1" />
                <span>生成中</span>
              </>
            ) : (
              hasImages ? '重新生成' : '生成图片'
            )}
          </button>
        </div>


        {/* Image Preview & Selection - 左右结构，整体宽高比18:16 */}
        <div className="flex-shrink-0 relative">
          <div className="flex gap-1.5 h-[180px]">
            {/* Main preview - 左侧，9:16 */}
            <div
              className={`relative w-[101px] h-full rounded-lg overflow-hidden cursor-pointer group ${
                hasImages ? 'bg-slate-700' : 'bg-slate-700/50'
              }`}
              onClick={() => selectedImage && onPreviewImage(selectedImage)}
            >
              {hasImages ? (
                <>
                  <img
                    src={selectedImage!}
                    alt={`镜头 ${shot.sequence}`}
                    className="w-full h-full object-cover"
                  />
                  <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                    <ZoomIn className="w-6 h-6 text-white" />
                  </div>
                </>
              ) : (
                <div className="w-full h-full flex flex-col items-center justify-center text-slate-500">
                  <Image className="w-6 h-6 mb-1" />
                  <span className="text-[10px]">暂无图片</span>
                </div>
              )}
            </div>
            {/* Thumbnails - 2x2 grid layout，右侧也是9:16 */}
            <div className="grid grid-cols-2 grid-rows-2 gap-1 w-[101px]">
              {[0, 1, 2, 3].map((idx) => {
                const img = shot.images[idx];
                return img ? (
                  <button
                    key={idx}
                    onClick={() => onSelectImage(idx)}
                    className={`relative rounded overflow-hidden transition-all bg-slate-800 flex items-center justify-center aspect-[9/16] ${
                      idx === shot.selectedImageIndex
                        ? 'ring-2 ring-violet-500'
                        : 'ring-1 ring-slate-600 hover:ring-slate-500'
                    }`}
                  >
                    <img src={img} alt={`选项 ${idx + 1}`} className="object-cover w-full h-full" />
                    {idx === shot.selectedImageIndex && (
                      <div className="absolute inset-0 bg-violet-500/20 flex items-center justify-center">
                        <Check className="w-3 h-3 text-violet-400" />
                      </div>
                    )}
                  </button>
                ) : (
                  <div
                    key={idx}
                    className="rounded bg-slate-700/50 flex items-center justify-center text-slate-500 text-[10px] aspect-[9/16]"
                  >
                    {idx + 1}
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Video Prompt - 高亮角色名 */}
        <div className="w-48 flex-shrink-0 h-[180px] relative">
          <HighlightedTextArea
            className="w-full h-[180px] bg-slate-700/50 hover:bg-slate-700 rounded pr-8 pb-6"
            value={shot.videoPrompt || ''}
            onChange={(value) => onUpdateField('videoPrompt', value)}
            placeholder="TTV 提示词"
            renderHighlight={(text) => highlightCharacterNames(text, characters)}
          />
          {/* 生成视频按钮 - 叠放在文本框右下角 */}
          <button
            onClick={(e) => { e.stopPropagation(); onGenerateVideo(); }}
            disabled={!hasImages || isGeneratingImages}
            className={`absolute bottom-1 right-1 px-2 py-1 rounded text-[10px] transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
              hasVideo
                ? 'bg-slate-800/90 hover:bg-emerald-600 text-emerald-400 hover:text-white'
                : 'bg-emerald-600 hover:bg-emerald-500 text-white'
            }`}
          >
            {isGeneratingVideo ? (
              <>
                <Loader2 className="w-3 h-3 animate-spin inline mr-1" />
                <span>生成中</span>
              </>
            ) : (
              hasVideo ? '重新生成' : '生成视频'
            )}
          </button>
        </div>

        {/* Video Preview - 左右结构，整体宽高比18:16 */}
        <div className="flex-shrink-0 relative">
          {hasVideo ? (
            <div className="flex gap-1.5 h-[180px]">
              {/* Main video preview - 左侧，9:16 */}
              <div
                className="relative w-[101px] h-full rounded-lg overflow-hidden bg-slate-700 cursor-pointer group"
                onClick={() => selectedVideo && onPreviewVideo(selectedVideo, `镜头 #${shot.sequence} 视频`)}
              >
                {selectedVideo && (
                  <>
                    <video
                      src={selectedVideo}
                      className="w-full h-full object-cover"
                      preload="metadata"
                      muted
                      playsInline
                      onLoadedMetadata={(e) => {
                        const video = e.target as HTMLVideoElement;
                        video.currentTime = 0.1;
                      }}
                    />
                    <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                      <Play className="w-6 h-6 text-white" />
                    </div>
                  </>
                )}
              </div>
              {/* Thumbnails - 2x2 grid layout，右侧也是9:16 */}
              <div className="grid grid-cols-2 grid-rows-2 gap-1 w-[101px]">
                {[0, 1, 2, 3].map((idx) => {
                  const video = shot.videos[idx];
                  return video ? (
                    <button
                      key={idx}
                      onClick={() => onSelectVideo(idx)}
                      className={`relative rounded overflow-hidden transition-all bg-slate-800 flex items-center justify-center aspect-[9/16] ${
                        idx === shot.selectedVideoIndex
                          ? 'ring-2 ring-emerald-500'
                          : 'ring-1 ring-slate-600 hover:ring-slate-500'
                      }`}
                    >
                      <video
                        src={video}
                        className="object-cover w-full h-full"
                        preload="metadata"
                        muted
                        playsInline
                        onLoadedMetadata={(e) => {
                          const v = e.target as HTMLVideoElement;
                          v.currentTime = 0.1;
                        }}
                      />
                      {idx === shot.selectedVideoIndex && (
                        <div className="absolute inset-0 bg-emerald-500/20 flex items-center justify-center">
                          <Check className="w-3 h-3 text-emerald-400" />
                        </div>
                      )}
                    </button>
                  ) : (
                    <div
                      key={idx}
                      className="rounded bg-slate-700/50 flex items-center justify-center text-slate-500 text-[10px] aspect-[9/16]"
                    >
                      {idx + 1}
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="flex gap-1.5 h-[180px]">
              {/* Empty main preview - 左侧，9:16 */}
              <div
                className="relative w-[101px] h-full rounded-lg bg-slate-700/50 flex flex-col items-center justify-center text-slate-500"
              >
                <Film className="w-6 h-6 mb-1" />
                <span className="text-[10px]">暂无视频</span>
              </div>
              {/* Empty thumbnails - 2x2 grid layout，右侧也是9:16 */}
              <div className="grid grid-cols-2 grid-rows-2 gap-1 w-[101px]">
                {[1, 2, 3, 4].map((num) => (
                  <div
                    key={num}
                    className="rounded bg-slate-700/50 flex items-center justify-center text-slate-500 text-[10px] aspect-[9/16]"
                  >
                    {num}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Error message - 叠加在行底部，不影响行高 */}
      {shot.status === 'error' && shot.errorMessage && (
        <div className="absolute bottom-0 left-16 mb-1">
          <div className="text-xs text-red-400 bg-red-400/10 px-2 py-1 rounded truncate">
            {shot.errorMessage}
          </div>
        </div>
      )}

    </div>
  );
}
