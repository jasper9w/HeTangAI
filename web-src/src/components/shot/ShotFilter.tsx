/**
 * ShotFilter - 镜头筛选组件（横向并列布局）
 */
import { useState, useMemo } from 'react';
import { Search, X, ChevronDown } from 'lucide-react';
import type { Shot, Character, ShotStatus } from '../../types';

interface FilterOptions {
  search: string;
  voiceActor: string;
  characters: string[];
  status: ShotStatus[];
  hasImages: boolean | null;
  hasVideo: boolean | null;
  hasAudio: boolean | null;
}

interface ShotFilterProps {
  shots: Shot[];
  characters: Character[];
  onFilterChange: (filteredShots: Shot[]) => void;
}

export function ShotFilter({ shots, characters, onFilterChange }: ShotFilterProps) {
  const [filters, setFilters] = useState<FilterOptions>({
    search: '',
    voiceActor: '',
    characters: [],
    status: [],
    hasImages: null,
    hasVideo: null,
    hasAudio: null,
  });

  // 获取所有唯一的配音演员
  const voiceActors = useMemo(() =>
    Array.from(new Set(shots.map(s => s.voiceActor).filter(Boolean))),
    [shots]
  );

  // 应用筛选
  const applyFilters = (newFilters: FilterOptions) => {
    let filtered = shots;

    // 关键字搜索（搜索台词内容、图片提示词、视频提示词）
    if (newFilters.search.trim()) {
      const searchTerm = newFilters.search.toLowerCase();
      filtered = filtered.filter(shot =>
        shot.script.toLowerCase().includes(searchTerm) ||
        shot.imagePrompt.toLowerCase().includes(searchTerm) ||
        shot.videoPrompt.toLowerCase().includes(searchTerm) ||
        shot.sequence.toString().includes(searchTerm)
      );
    }

    // 按配音演员筛选
    if (newFilters.voiceActor) {
      filtered = filtered.filter(shot => shot.voiceActor === newFilters.voiceActor);
    }

    // 按角色筛选
    if (newFilters.characters.length > 0) {
      filtered = filtered.filter(shot =>
        newFilters.characters.some(char => shot.characters.includes(char))
      );
    }

    // 按状态筛选
    if (newFilters.status.length > 0) {
      filtered = filtered.filter(shot => newFilters.status.includes(shot.status));
    }

    // 按图片状态筛选
    if (newFilters.hasImages !== null) {
      filtered = filtered.filter(shot =>
        newFilters.hasImages ? shot.images.length > 0 : shot.images.length === 0
      );
    }

    // 按视频状态筛选
    if (newFilters.hasVideo !== null) {
      filtered = filtered.filter(shot =>
        newFilters.hasVideo ? !!shot.videoUrl : !shot.videoUrl
      );
    }

    // 按配音状态筛选
    if (newFilters.hasAudio !== null) {
      filtered = filtered.filter(shot =>
        newFilters.hasAudio ? !!shot.audioUrl : !shot.audioUrl
      );
    }

    onFilterChange(filtered);
  };

  const handleFilterChange = (key: keyof FilterOptions, value: any) => {
    const newFilters = { ...filters, [key]: value };
    setFilters(newFilters);
    applyFilters(newFilters);
  };

  const clearFilters = () => {
    const emptyFilters: FilterOptions = {
      search: '',
      voiceActor: '',
      characters: [],
      status: [],
      hasImages: null,
      hasVideo: null,
      hasAudio: null,
    };
    setFilters(emptyFilters);
    applyFilters(emptyFilters);
  };

  const hasActiveFilters = filters.search ||
    filters.voiceActor ||
    filters.characters.length > 0 ||
    filters.status.length > 0 ||
    filters.hasImages !== null ||
    filters.hasVideo !== null ||
    filters.hasAudio !== null;

  const statusOptions: { value: ShotStatus; label: string }[] = [
    { value: 'pending', label: '待处理' },
    { value: 'generating_images', label: '生成图片中' },
    { value: 'images_ready', label: '图片就绪' },
    { value: 'generating_video', label: '生成视频中' },
    { value: 'generating_audio', label: '生成配音中' },
    { value: 'completed', label: '已完成' },
    { value: 'error', label: '错误' },
  ];

  return (
    <div className="flex items-center gap-3 flex-wrap">
      {/* 关键字搜索 */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-slate-400" />
        <input
          type="text"
          placeholder="搜索镜头..."
          value={filters.search}
          onChange={(e) => handleFilterChange('search', e.target.value)}
          className="pl-10 pr-4 py-2 w-48 bg-slate-700 border border-slate-600 rounded-lg text-slate-200 text-sm placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent"
        />
        {filters.search && (
          <button
            onClick={() => handleFilterChange('search', '')}
            className="absolute right-3 top-1/2 transform -translate-y-1/2 text-slate-400 hover:text-slate-200"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* 配音演员筛选 */}
      <select
        value={filters.voiceActor}
        onChange={(e) => handleFilterChange('voiceActor', e.target.value)}
        className="px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
      >
        <option value="">全部配音演员</option>
        {voiceActors.map(actor => (
          <option key={actor} value={actor}>{actor}</option>
        ))}
      </select>

      {/* 角色筛选 */}
      <div className="relative">
        <select
          value=""
          onChange={(e) => {
            if (e.target.value) {
              const newCharacters = filters.characters.includes(e.target.value)
                ? filters.characters.filter(c => c !== e.target.value)
                : [...filters.characters, e.target.value];
              handleFilterChange('characters', newCharacters);
            }
          }}
          className="px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500 min-w-32"
        >
          <option value="">
            {filters.characters.length > 0
              ? `角色 (${filters.characters.length})`
              : '全部角色'
            }
          </option>
          {characters.map(char => (
            <option key={char.id} value={char.name}>
              {filters.characters.includes(char.name) ? '✓ ' : ''}{char.name}
            </option>
          ))}
        </select>
        {filters.characters.length > 0 && (
          <div className="absolute top-full left-0 mt-1 flex flex-wrap gap-1 z-10">
            {filters.characters.map(char => (
              <span
                key={char}
                className="inline-flex items-center gap-1 px-2 py-1 bg-violet-600 text-white text-xs rounded"
              >
                {char}
                <button
                  onClick={() => {
                    const newCharacters = filters.characters.filter(c => c !== char);
                    handleFilterChange('characters', newCharacters);
                  }}
                  className="hover:bg-violet-700 rounded"
                >
                  <X className="w-3 h-3" />
                </button>
              </span>
            ))}
          </div>
        )}
      </div>

      {/* 状态筛选 */}
      <div className="relative">
        <select
          value=""
          onChange={(e) => {
            if (e.target.value) {
              const status = e.target.value as ShotStatus;
              const newStatus = filters.status.includes(status)
                ? filters.status.filter(s => s !== status)
                : [...filters.status, status];
              handleFilterChange('status', newStatus);
            }
          }}
          className="px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500 min-w-32"
        >
          <option value="">
            {filters.status.length > 0
              ? `状态 (${filters.status.length})`
              : '全部状态'
            }
          </option>
          {statusOptions.map(option => (
            <option key={option.value} value={option.value}>
              {filters.status.includes(option.value) ? '✓ ' : ''}{option.label}
            </option>
          ))}
        </select>
        {filters.status.length > 0 && (
          <div className="absolute top-full left-0 mt-1 flex flex-wrap gap-1 z-10">
            {filters.status.map(status => {
              const option = statusOptions.find(o => o.value === status);
              return (
                <span
                  key={status}
                  className="inline-flex items-center gap-1 px-2 py-1 bg-emerald-600 text-white text-xs rounded"
                >
                  {option?.label}
                  <button
                    onClick={() => {
                      const newStatus = filters.status.filter(s => s !== status);
                      handleFilterChange('status', newStatus);
                    }}
                    className="hover:bg-emerald-700 rounded"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </span>
              );
            })}
          </div>
        )}
      </div>

      {/* 内容状态筛选 */}
      <div className="flex items-center gap-2">
        <select
          value={filters.hasImages === null ? '' : filters.hasImages.toString()}
          onChange={(e) => {
            const value = e.target.value === '' ? null : e.target.value === 'true';
            handleFilterChange('hasImages', value);
          }}
          className="px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
        >
          <option value="">图片</option>
          <option value="true">有图片</option>
          <option value="false">无图片</option>
        </select>

        <select
          value={filters.hasVideo === null ? '' : filters.hasVideo.toString()}
          onChange={(e) => {
            const value = e.target.value === '' ? null : e.target.value === 'true';
            handleFilterChange('hasVideo', value);
          }}
          className="px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
        >
          <option value="">视频</option>
          <option value="true">有视频</option>
          <option value="false">无视频</option>
        </select>

        <select
          value={filters.hasAudio === null ? '' : filters.hasAudio.toString()}
          onChange={(e) => {
            const value = e.target.value === '' ? null : e.target.value === 'true';
            handleFilterChange('hasAudio', value);
          }}
          className="px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
        >
          <option value="">配音</option>
          <option value="true">有配音</option>
          <option value="false">无配音</option>
        </select>
      </div>

      {/* 清除筛选按钮 */}
      {hasActiveFilters && (
        <button
          onClick={clearFilters}
          className="flex items-center gap-1 px-3 py-2 bg-red-600/20 hover:bg-red-600/30 border border-red-600/30 rounded-lg text-red-400 text-sm transition-colors"
        >
          <X className="w-4 h-4" />
          清除筛选
        </button>
      )}
    </div>
  );
}