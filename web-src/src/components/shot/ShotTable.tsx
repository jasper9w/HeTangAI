/**
 * Shot Table - Main content area for displaying shots with Excel-style column filters
 */
import { useState, useEffect, useMemo, useRef } from 'react';
import { Image, Film, Trash2, Loader2, Check, X, ZoomIn, Plus, Play, Pause, Mic } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useVirtualizer } from '@tanstack/react-virtual';
import { VideoModal } from '../ui/VideoModal';
import { useColumnFilter } from './ColumnFilter';
import { ColumnHeaderFilter, SearchFilter, MultiSelectFilter, StatusFilter } from './ExcelColumnFilter';
import type { Shot, Character } from '../../types';

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
  onSelectVideo: (shotId: string, videoIndex: number) => void;
  onUpdateShot: (shotId: string, field: string, value: string | string[]) => void;
  onFilterChange: (filteredShots: Shot[]) => void;
  onInsertShot: (afterShotId: string | null) => void;
}

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
  onSelectVideo,
  onUpdateShot,
  onFilterChange,
  onInsertShot,
}: ShotTableProps) {
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [previewVideo, setPreviewVideo] = useState<{ url: string; title: string } | null>(null);
  const [hoveredShotId, setHoveredShotId] = useState<string | null>(null);
  const [playingAudioId, setPlayingAudioId] = useState<string | null>(null);
  const parentRef = useRef<HTMLDivElement>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

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
    estimateSize: () => 240, // 固定高度：内容区域180px + 错误消息区域30px
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

  const voiceActorOptions = useMemo(() => {
    const actorCounts: Record<string, number> = {};
    shots.forEach(shot => {
      if (shot.voiceActor) {
        actorCounts[shot.voiceActor] = (actorCounts[shot.voiceActor] || 0) + 1;
      }
    });

    return Object.entries(actorCounts).map(([actor, count]) => ({
      value: actor,
      label: actor,
      count,
    }));
  }, [shots]);

  const characterOptions = useMemo(() => {
    const charCounts: Record<string, number> = {};
    shots.forEach(shot => {
      shot.characters.forEach(char => {
        charCounts[char] = (charCounts[char] || 0) + 1;
      });
    });

    return Object.entries(charCounts).map(([char, count]) => ({
      value: char,
      label: char,
      count,
    }));
  }, [shots]);

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
        <div className="px-4 py-2 flex items-center gap-4">
          {/* Checkbox column - 全选 */}
          <div className="w-4">
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

          {/* 序号列 */}
          <div className="w-12">
            <ColumnHeaderFilter
              title="序号"
              hasActiveFilter={!!filters.sequence.value || filters.sequence.inverted}
            >
              <SearchFilter
                value={filters.sequence.value}
                inverted={filters.sequence.inverted}
                onChange={(value) => updateFilter('sequence', { ...filters.sequence, value })}
                onInvertedChange={(inverted) => updateFilter('sequence', { ...filters.sequence, inverted })}
                placeholder="搜索序号..."
              />
            </ColumnHeaderFilter>
          </div>

          {/* 配音角色列 */}
          <div className="w-24">
            <ColumnHeaderFilter
              title="配音角色"
              hasActiveFilter={filters.voiceActor.values.length > 0 || filters.voiceActor.inverted}
            >
              <MultiSelectFilter
                selectedValues={filters.voiceActor.values}
                inverted={filters.voiceActor.inverted}
                onChange={(values) => updateFilter('voiceActor', { ...filters.voiceActor, values })}
                onInvertedChange={(inverted) => updateFilter('voiceActor', { ...filters.voiceActor, inverted })}
                options={voiceActorOptions}
                searchValue=""
                onSearchChange={() => {}}
              />
            </ColumnHeaderFilter>
          </div>

          {/* 文案列 */}
          <div className="flex-1 min-w-0 max-w-[200px]">
            <ColumnHeaderFilter
              title="文案"
              hasActiveFilter={!!filters.script.value || filters.script.inverted}
            >
              <SearchFilter
                value={filters.script.value}
                inverted={filters.script.inverted}
                onChange={(value) => updateFilter('script', { ...filters.script, value })}
                onInvertedChange={(inverted) => updateFilter('script', { ...filters.script, inverted })}
                placeholder="搜索文案内容..."
              />
            </ColumnHeaderFilter>
          </div>

          {/* 图片提示词列 */}
          <div className="w-40">
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

          {/* 出场角色列 */}
          <div className="w-24">
            <ColumnHeaderFilter
              title="出场角色"
              hasActiveFilter={filters.characters.values.length > 0 || filters.characters.inverted}
            >
              <MultiSelectFilter
                selectedValues={filters.characters.values}
                inverted={filters.characters.inverted}
                onChange={(values) => updateFilter('characters', { ...filters.characters, values })}
                onInvertedChange={(inverted) => updateFilter('characters', { ...filters.characters, inverted })}
                options={characterOptions}
                searchValue=""
                onSearchChange={() => {}}
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
          <div className="w-40">
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
      <div ref={parentRef} className="flex-1 overflow-y-auto">
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
                      isSelected={selectedIds.includes(shot.id)}
                      isPlayingAudio={playingAudioId === shot.id}
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
  isSelected: boolean;
  isPlayingAudio: boolean;
  onSelect: (selected: boolean) => void;
  onGenerateImages: () => void;
  onGenerateVideo: () => void;
  onGenerateAudio: () => void;
  onSelectImage: (imageIndex: number) => void;
  onSelectVideo: (videoIndex: number) => void;
  onDelete: () => void;
  onPreviewImage: (url: string) => void;
  onPreviewVideo: (url: string, title: string) => void;
  onUpdateField: (field: string, value: string | string[]) => void;
  onPlayAudio: (audioUrl: string) => void;
}

function ShotRow({
  shot,
  characters,
  isSelected,
  isPlayingAudio,
  onSelect,
  onGenerateImages,
  onGenerateVideo,
  onGenerateAudio,
  onSelectImage,
  onSelectVideo,
  onDelete,
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
      <div className="flex items-start gap-4 h-[210px]">
        {/* Checkbox */}
        <input
          type="checkbox"
          checked={isSelected}
          onChange={(e) => onSelect(e.target.checked)}
          className="mt-2 w-4 h-4 rounded border-slate-600 bg-slate-700 text-violet-500 focus:ring-violet-500 focus:ring-offset-0"
        />

        {/* Sequence with Delete Button */}
        <div className="w-12 flex-shrink-0 text-center">
          <span className="text-lg font-bold text-slate-300">#{shot.sequence}</span>
          <button
            onClick={onDelete}
            className="mt-1 p-1 hover:bg-red-600/20 rounded text-red-400 transition-colors"
            title="删除"
          >
            <Trash2 className="w-3 h-3" />
          </button>
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

        {/* Script with Audio Buttons */}
        <div className="flex-1 min-w-0 max-w-[200px] relative">
          <textarea
            value={shot.script}
            onChange={(e) => onUpdateField('script', e.target.value)}
            className="w-full h-20 px-2 py-1 bg-slate-700/50 hover:bg-slate-700 focus:bg-slate-700 rounded text-sm text-slate-300 resize-none focus:outline-none focus:ring-1 focus:ring-violet-500 transition-colors"
            placeholder="镜头文案"
          />
          {/* Audio buttons overlay */}
          <div className="absolute bottom-1 right-1 flex items-center gap-1">
            {hasAudio && (
              <button
                onClick={() => onPlayAudio(shot.audioUrl)}
                className={`p-1.5 rounded transition-colors backdrop-blur-sm ${
                  isPlayingAudio
                    ? 'bg-emerald-600/30 hover:bg-emerald-600/40'
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
              disabled={isGeneratingAudio || !shot.script.trim()}
              className="p-1.5 bg-slate-800/80 hover:bg-orange-600/20 rounded transition-colors disabled:opacity-50 backdrop-blur-sm"
              title="生成配音"
            >
              {isGeneratingAudio ? (
                <Loader2 className="w-4 h-4 text-orange-400 animate-spin" />
              ) : (
                <Mic className="w-4 h-4 text-orange-400" />
              )}
            </button>
          </div>
        </div>

        {/* Image Prompt */}
        <div className="w-40 flex-shrink-0">
          <textarea
            value={shot.imagePrompt}
            onChange={(e) => onUpdateField('imagePrompt', e.target.value)}
            className="w-full h-32 px-2 py-1 bg-slate-700/50 hover:bg-slate-700 focus:bg-slate-700 rounded text-xs text-slate-400 resize-none focus:outline-none focus:ring-1 focus:ring-violet-500 transition-colors"
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

        {/* Image Preview & Selection - 左右结构 */}
        <div className="w-44 flex-shrink-0 relative">
          <div className="flex gap-1.5 h-full">
            {/* Main preview - 左侧 */}
            <div
              className={`relative flex-1 rounded-lg overflow-hidden cursor-pointer group flex items-center justify-center ${
                hasImages ? 'bg-slate-700' : 'bg-slate-700/50'
              }`}
              onClick={() => selectedImage && onPreviewImage(selectedImage)}
            >
              {hasImages ? (
                <>
                  <img
                    src={selectedImage!}
                    alt={`镜头 ${shot.sequence}`}
                    className="max-w-full max-h-full object-contain"
                  />
                  <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                    <ZoomIn className="w-6 h-6 text-white" />
                  </div>
                </>
              ) : (
                <div className="flex flex-col items-center justify-center text-slate-500">
                  <Image className="w-6 h-6 mb-1" />
                  <span className="text-[10px]">暂无图片</span>
                </div>
              )}
              {/* Generate button overlay */}
              {isGeneratingImages ? (
                <div className="absolute top-1 right-1 z-10 px-2 py-1 bg-violet-600 rounded text-[10px] text-white flex items-center gap-1">
                  <Loader2 className="w-3 h-3 animate-spin" />
                  <span>生成中</span>
                </div>
              ) : (
                <button
                  onClick={(e) => { e.stopPropagation(); onGenerateImages(); }}
                  disabled={isGeneratingVideo || !shot.imagePrompt.trim()}
                  className={`absolute top-1 right-1 z-10 px-2 py-1 rounded text-[10px] transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                    hasImages 
                      ? 'bg-slate-800/90 hover:bg-violet-600 text-violet-400 hover:text-white' 
                      : 'bg-violet-600 hover:bg-violet-500 text-white'
                  }`}
                >
                  {hasImages ? '重新生成' : '生成图片'}
                </button>
              )}
            </div>
            {/* Thumbnails - 右侧垂直排列，预置4个坑位 */}
            <div className="flex flex-col gap-1 w-8">
              {[0, 1, 2, 3].map((idx) => {
                const img = shot.images[idx];
                return img ? (
                  <button
                    key={idx}
                    onClick={() => onSelectImage(idx)}
                    className={`relative flex-1 rounded overflow-hidden transition-all bg-slate-800 flex items-center justify-center ${
                      idx === shot.selectedImageIndex
                        ? 'ring-2 ring-violet-500'
                        : 'ring-1 ring-slate-600 hover:ring-slate-500'
                    }`}
                  >
                    <img src={img} alt={`选项 ${idx + 1}`} className="max-w-full max-h-full object-contain" />
                    {idx === shot.selectedImageIndex && (
                      <div className="absolute inset-0 bg-violet-500/20 flex items-center justify-center">
                        <Check className="w-3 h-3 text-violet-400" />
                      </div>
                    )}
                  </button>
                ) : (
                  <div
                    key={idx}
                    className="flex-1 rounded bg-slate-700/50 flex items-center justify-center text-slate-500 text-[10px]"
                  >
                    {idx + 1}
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Video Prompt */}
        <div className="w-40 flex-shrink-0">
          <textarea
            value={shot.videoPrompt}
            onChange={(e) => onUpdateField('videoPrompt', e.target.value)}
            className="w-full h-32 px-2 py-1 bg-slate-700/50 hover:bg-slate-700 focus:bg-slate-700 rounded text-xs text-slate-400 resize-none focus:outline-none focus:ring-1 focus:ring-violet-500 transition-colors"
            placeholder="TTV 提示词"
          />
        </div>

        {/* Video Preview - 左右结构 */}
        <div className="w-44 flex-shrink-0 relative">
          {hasVideo ? (
            <div className="flex gap-1.5 h-full">
              {/* Main video preview - 左侧 */}
              <div
                className="relative flex-1 rounded-lg overflow-hidden bg-slate-700 cursor-pointer group flex items-center justify-center"
                onClick={() => selectedVideo && onPreviewVideo(selectedVideo, `镜头 #${shot.sequence} 视频`)}
              >
                {selectedVideo && (
                  <>
                    <video
                      src={selectedVideo}
                      className="max-w-full max-h-full object-contain pointer-events-none"
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
                {/* Generate button overlay */}
                {isGeneratingVideo ? (
                  <div className="absolute top-1 right-1 z-10 px-2 py-1 bg-emerald-600 rounded text-[10px] text-white flex items-center gap-1">
                    <Loader2 className="w-3 h-3 animate-spin" />
                    <span>生成中</span>
                  </div>
                ) : (
                  <button
                    onClick={(e) => { e.stopPropagation(); onGenerateVideo(); }}
                    disabled={!hasImages || isGeneratingImages}
                    className={`absolute top-1 right-1 z-10 px-2 py-1 rounded text-[10px] transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                      hasVideo 
                        ? 'bg-slate-800/90 hover:bg-emerald-600 text-emerald-400 hover:text-white' 
                        : 'bg-emerald-600 hover:bg-emerald-500 text-white'
                    }`}
                  >
                    {hasVideo ? '重新生成' : '生成视频'}
                  </button>
                )}
              </div>
              {/* Thumbnails - 右侧垂直排列，预置4个坑位 */}
              <div className="flex flex-col gap-1 w-8">
                {[0, 1, 2, 3].map((idx) => {
                  const video = shot.videos[idx];
                  return video ? (
                    <button
                      key={idx}
                      onClick={() => onSelectVideo(idx)}
                      className={`relative flex-1 rounded overflow-hidden transition-all bg-slate-800 flex items-center justify-center ${
                        idx === shot.selectedVideoIndex
                          ? 'ring-2 ring-emerald-500'
                          : 'ring-1 ring-slate-600 hover:ring-slate-500'
                      }`}
                    >
                      <video
                        src={video}
                        className="max-w-full max-h-full object-contain pointer-events-none"
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
                      className="flex-1 rounded bg-slate-700/50 flex items-center justify-center text-slate-500 text-[10px]"
                    >
                      {idx + 1}
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="flex gap-1.5 h-full">
              {/* Empty main preview - 左侧 */}
              <div className="relative flex-1 rounded-lg bg-slate-700/50 flex flex-col items-center justify-center text-slate-500">
                <Film className="w-6 h-6 mb-1" />
                <span className="text-[10px]">暂无视频</span>
                {/* Generate button overlay */}
                {isGeneratingVideo ? (
                  <div className="absolute top-1 right-1 z-10 px-2 py-1 bg-emerald-600 rounded text-[10px] text-white flex items-center gap-1">
                    <Loader2 className="w-3 h-3 animate-spin" />
                    <span>生成中</span>
                  </div>
                ) : (
                  <button
                    onClick={onGenerateVideo}
                    disabled={!hasImages || isGeneratingImages}
                    className="absolute top-1 right-1 z-10 px-2 py-1 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed rounded text-[10px] text-white transition-colors"
                  >
                    生成视频
                  </button>
                )}
              </div>
              {/* Empty thumbnails - 右侧垂直排列 */}
              <div className="flex flex-col gap-1 w-8">
                {[1, 2, 3, 4].map((num) => (
                  <div
                    key={num}
                    className="flex-1 rounded bg-slate-700/50 flex items-center justify-center text-slate-500 text-[10px]"
                  >
                    {num}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Error message - 固定高度区域避免布局变化 */}
      <div className="h-[30px] mt-2 ml-16">
        {shot.status === 'error' && shot.errorMessage && (
          <div className="text-xs text-red-400 bg-red-400/10 px-2 py-1 rounded truncate">
            {shot.errorMessage}
          </div>
        )}
      </div>
    </div>
  );
}
