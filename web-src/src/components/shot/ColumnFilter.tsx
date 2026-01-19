/**
 * ColumnFilter - 列头筛选Hook和组件
 */
import { useState, useMemo } from 'react';
import { Search, ChevronDown, X, Check } from 'lucide-react';
import type { Shot, Character } from '../../types';

interface FilterState {
  sequence: { value: string; inverted: boolean }; // 序号搜索
  voiceActor: { values: string[]; inverted: boolean }; // 配音角色多选
  script: { value: string; inverted: boolean }; // 文案搜索
  imagePrompt: { value: string; inverted: boolean }; // 图片提示词搜索
  characters: { values: string[]; inverted: boolean }; // 出场角色多选
  imageStatus: { values: string[]; inverted: boolean }; // 图片状态多选
  videoPrompt: { value: string; inverted: boolean }; // 视频提示词搜索
  videoStatus: { values: string[]; inverted: boolean }; // 视频状态多选
}

interface UseColumnFilterProps {
  shots: Shot[];
  characters: Character[];
}

export function useColumnFilter({ shots, characters }: UseColumnFilterProps) {
  const [filters, setFilters] = useState<FilterState>({
    sequence: { value: '', inverted: false },
    voiceActor: { values: [], inverted: false },
    script: { value: '', inverted: false },
    imagePrompt: { value: '', inverted: false },
    characters: { values: [], inverted: false },
    imageStatus: { values: [], inverted: false },
    videoPrompt: { value: '', inverted: false },
    videoStatus: { values: [], inverted: false },
  });

  // 缓存计算的选项
  const options = useMemo(() => {
    const voiceActors = Array.from(new Set(shots.map(s => s.voiceActor).filter(Boolean)));
    const allCharacters = characters.map(c => c.name);

    return {
      voiceActors,
      characters: allCharacters,
      imageStatusOptions: [
        { value: 'generated', label: '已生成' },
        { value: 'pending', label: '待生成' },
        { value: 'generating', label: '生成中' },
        { value: 'error', label: '错误' },
      ],
      videoStatusOptions: [
        { value: 'generated', label: '已生成' },
        { value: 'pending', label: '待生成' },
        { value: 'generating', label: '生成中' },
        { value: 'error', label: '错误' },
      ],
    };
  }, [shots, characters]);

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
    if (shot.videoUrl) return 'generated';
    return 'pending';
  };

  // 应用筛选逻辑
  const filteredShots = useMemo(() => {
    let filtered = shots;

    // 序号筛选
    if (filters.sequence.value.trim()) {
      const searchTerm = filters.sequence.value.toLowerCase();
      const matches = (shot: Shot) => shot.sequence.toString().includes(searchTerm);
      filtered = filtered.filter(shot =>
        filters.sequence.inverted ? !matches(shot) : matches(shot)
      );
    }

    // 配音角色筛选
    if (filters.voiceActor.values.length > 0) {
      const matches = (shot: Shot) => filters.voiceActor.values.includes(shot.voiceActor);
      filtered = filtered.filter(shot =>
        filters.voiceActor.inverted ? !matches(shot) : matches(shot)
      );
    }

    // 文案搜索
    if (filters.script.value.trim()) {
      const searchTerm = filters.script.value.toLowerCase();
      const matches = (shot: Shot) => shot.script.toLowerCase().includes(searchTerm);
      filtered = filtered.filter(shot =>
        filters.script.inverted ? !matches(shot) : matches(shot)
      );
    }

    // 图片提示词搜索
    if (filters.imagePrompt.value.trim()) {
      const searchTerm = filters.imagePrompt.value.toLowerCase();
      const matches = (shot: Shot) => shot.imagePrompt.toLowerCase().includes(searchTerm);
      filtered = filtered.filter(shot =>
        filters.imagePrompt.inverted ? !matches(shot) : matches(shot)
      );
    }

    // 出场角色筛选
    if (filters.characters.values.length > 0) {
      const matches = (shot: Shot) => filters.characters.values.some(char => shot.characters.includes(char));
      filtered = filtered.filter(shot =>
        filters.characters.inverted ? !matches(shot) : matches(shot)
      );
    }

    // 图片状态筛选
    if (filters.imageStatus.values.length > 0) {
      const matches = (shot: Shot) => {
        const status = getImageStatus(shot);
        return filters.imageStatus.values.includes(status);
      };
      filtered = filtered.filter(shot =>
        filters.imageStatus.inverted ? !matches(shot) : matches(shot)
      );
    }

    // 视频提示词搜索
    if (filters.videoPrompt.value.trim()) {
      const searchTerm = filters.videoPrompt.value.toLowerCase();
      const matches = (shot: Shot) => shot.videoPrompt.toLowerCase().includes(searchTerm);
      filtered = filtered.filter(shot =>
        filters.videoPrompt.inverted ? !matches(shot) : matches(shot)
      );
    }

    // 视频状态筛选
    if (filters.videoStatus.values.length > 0) {
      const matches = (shot: Shot) => {
        const status = getVideoStatus(shot);
        return filters.videoStatus.values.includes(status);
      };
      filtered = filtered.filter(shot =>
        filters.videoStatus.inverted ? !matches(shot) : matches(shot)
      );
    }

    return filtered;
  }, [shots, filters]);

  // 更新筛选条件
  const updateFilter = <K extends keyof FilterState>(key: K, value: FilterState[K]) => {
    setFilters(prev => ({ ...prev, [key]: value }));
  };

  // 清除所有筛选
  const clearAllFilters = () => {
    setFilters({
      sequence: { value: '', inverted: false },
      voiceActor: { values: [], inverted: false },
      script: { value: '', inverted: false },
      imagePrompt: { value: '', inverted: false },
      characters: { values: [], inverted: false },
      imageStatus: { values: [], inverted: false },
      videoPrompt: { value: '', inverted: false },
      videoStatus: { values: [], inverted: false },
    });
  };

  // 检查是否有激活的筛选
  const hasActiveFilters = Object.values(filters).some(filter => {
    if ('value' in filter) {
      return filter.value.trim() !== '';
    } else if ('values' in filter) {
      return filter.values.length > 0;
    }
    return false;
  });

  return {
    filters,
    options,
    updateFilter,
    clearAllFilters,
    hasActiveFilters,
    filteredShots,
    filteredCount: filteredShots.length,
  };
}

// 搜索输入框组件
export function SearchInput({
  value,
  onChange,
  placeholder,
  className = '',
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  className?: string;
}) {
  return (
    <div className={`relative ${className}`}>
      <Search className="absolute left-2 top-1/2 transform -translate-y-1/2 w-3 h-3 text-slate-400" />
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full pl-7 pr-6 py-1 text-xs bg-slate-700 border border-slate-600 rounded text-slate-200 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-violet-500"
      />
      {value && (
        <button
          onClick={() => onChange('')}
          className="absolute right-2 top-1/2 transform -translate-y-1/2 text-slate-400 hover:text-slate-200"
        >
          <X className="w-3 h-3" />
        </button>
      )}
    </div>
  );
}

// 多选下拉框组件
export function MultiSelect({
  value,
  onChange,
  options,
  placeholder,
  className = '',
}: {
  value: string[];
  onChange: (value: string[]) => void;
  options: Array<{ value: string; label: string }>;
  placeholder: string;
  className?: string;
}) {
  const [isOpen, setIsOpen] = useState(false);

  const toggleOption = (optionValue: string) => {
    const newValue = value.includes(optionValue)
      ? value.filter(v => v !== optionValue)
      : [...value, optionValue];
    onChange(newValue);
  };

  return (
    <div className={`relative ${className}`}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full px-2 py-1 text-xs bg-slate-700 border border-slate-600 rounded text-slate-200 text-left flex items-center justify-between focus:outline-none focus:ring-1 focus:ring-violet-500"
      >
        <span className="truncate">
          {value.length > 0 ? `已选 ${value.length} 项` : placeholder}
        </span>
        <ChevronDown className={`w-3 h-3 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && (
        <>
          <div
            className="fixed inset-0 z-10"
            onClick={() => setIsOpen(false)}
          />
          <div className="absolute top-full left-0 mt-1 w-full max-w-48 bg-slate-800 border border-slate-700 rounded shadow-lg z-20 max-h-48 overflow-y-auto">
            {options.map(option => (
              <label
                key={option.value}
                className="flex items-center gap-2 px-3 py-2 hover:bg-slate-700 cursor-pointer text-xs"
              >
                <input
                  type="checkbox"
                  checked={value.includes(option.value)}
                  onChange={() => toggleOption(option.value)}
                  className="w-3 h-3 rounded border-slate-600 bg-slate-700 text-violet-600 focus:ring-violet-500"
                />
                <span className="text-slate-200 truncate">{option.label}</span>
                {value.includes(option.value) && (
                  <Check className="w-3 h-3 text-violet-400 ml-auto" />
                )}
              </label>
            ))}
          </div>
        </>
      )}
    </div>
  );
}