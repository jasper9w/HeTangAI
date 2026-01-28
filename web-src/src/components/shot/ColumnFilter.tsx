/**
 * ColumnFilter - 列头筛选Hook和组件
 */
import { useState, useMemo } from 'react';
import { Search, ChevronDown, X, Check } from 'lucide-react';
import type { Shot, Character, Scene } from '../../types';

interface FilterState {
  // 配音列 - 按角色多选
  dialogueCharacters: { values: string[]; inverted: boolean };
  // 场景列 - 按场景名多选
  scene: { values: string[]; inverted: boolean };
  // 图片提示词 - 角色多选 + 文本搜索
  imagePromptCharacters: { values: string[]; inverted: boolean };
  imagePromptText: { value: string; inverted: boolean };
  // 视频提示词 - 角色多选 + 文本搜索
  videoPromptCharacters: { values: string[]; inverted: boolean };
  videoPromptText: { value: string; inverted: boolean };
  // 图片预览 - 状态 + 无主图 + 备选数量
  imageStatus: { values: string[]; inverted: boolean };
  imageNoMain: boolean;
  imageCount: { values: number[]; inverted: boolean };
  // 视频预览 - 状态 + 无主视频 + 备选数量
  videoStatus: { values: string[]; inverted: boolean };
  videoNoMain: boolean;
  videoCount: { values: number[]; inverted: boolean };
  // 备注 - 文本搜索
  remark: { value: string; inverted: boolean };
}

interface UseColumnFilterProps {
  shots: Shot[];
  characters: Character[];
  scenes: Scene[];
}

export function useColumnFilter({ shots, characters, scenes }: UseColumnFilterProps) {
  const [filters, setFilters] = useState<FilterState>({
    // 配音列 - 按角色多选
    dialogueCharacters: { values: [], inverted: false },
    // 场景列 - 按场景名多选
    scene: { values: [], inverted: false },
    // 图片提示词 - 角色多选 + 文本搜索
    imagePromptCharacters: { values: [], inverted: false },
    imagePromptText: { value: '', inverted: false },
    // 视频提示词 - 角色多选 + 文本搜索
    videoPromptCharacters: { values: [], inverted: false },
    videoPromptText: { value: '', inverted: false },
    // 图片预览 - 状态 + 无主图 + 备选数量
    imageStatus: { values: [], inverted: false },
    imageNoMain: false,
    imageCount: { values: [], inverted: false },
    // 视频预览 - 状态 + 无主视频 + 备选数量
    videoStatus: { values: [], inverted: false },
    videoNoMain: false,
    videoCount: { values: [], inverted: false },
    // 备注 - 文本搜索
    remark: { value: '', inverted: false },
  });

  // 缓存计算的选项
  const options = useMemo(() => {
    const allCharacters = characters.map(c => c.name).filter(Boolean);
    const allScenes = scenes.map(s => s.name).filter(Boolean);

    return {
      characters: allCharacters,
      scenes: allScenes,
      statusOptions: [
        { value: 'generated', label: '已生成' },
        { value: 'pending', label: '待生成' },
        { value: 'generating', label: '生成中' },
        { value: 'error', label: '错误' },
      ],
      countOptions: [
        { value: 1, label: '1个' },
        { value: 2, label: '2个' },
        { value: 3, label: '3个' },
        { value: 4, label: '4个' },
      ],
    };
  }, [characters, scenes]);

  // 获取图片状态
  const getImageStatus = (shot: Shot): string => {
    if (shot.status === 'generating_images') return 'generating';
    if (shot.status === 'error') return 'error';
    if (shot.images && shot.images.length > 0) return 'generated';
    return 'pending';
  };

  // 获取视频状态
  const getVideoStatus = (shot: Shot): string => {
    if (shot.status === 'generating_video') return 'generating';
    if (shot.status === 'error') return 'error';
    if (shot.videos && shot.videos.length > 0) return 'generated';
    return 'pending';
  };

  // 从镜头中提取对话角色
  const getShotDialogueCharacters = (shot: Shot): string[] => {
    if (!shot.dialogues || shot.dialogues.length === 0) {
      return shot.voiceActor ? [shot.voiceActor] : [];
    }
    return [...new Set(shot.dialogues.map(d => d.role).filter(Boolean))];
  };

  // 检查文本中是否包含角色名
  const textContainsCharacter = (text: string, characterNames: string[]): boolean => {
    if (!text) return false;
    const lowerText = text.toLowerCase();
    return characterNames.some(name => lowerText.includes(name.toLowerCase()));
  };

  // 应用筛选逻辑
  const filteredShots = useMemo(() => {
    let filtered = shots;

    // 配音列 - 按角色多选筛选
    if (filters.dialogueCharacters.values.length > 0) {
      const matches = (shot: Shot) => {
        const shotCharacters = getShotDialogueCharacters(shot);
        return filters.dialogueCharacters.values.some(char => shotCharacters.includes(char));
      };
      filtered = filtered.filter(shot =>
        filters.dialogueCharacters.inverted ? !matches(shot) : matches(shot)
      );
    }

    // 场景列 - 按场景名多选筛选
    if (filters.scene.values.length > 0) {
      const matches = (shot: Shot) => {
        const sceneName = (shot.scene || '').trim();
        return filters.scene.values.includes(sceneName);
      };
      filtered = filtered.filter(shot =>
        filters.scene.inverted ? !matches(shot) : matches(shot)
      );
    }

    // 图片提示词 - 角色筛选
    if (filters.imagePromptCharacters.values.length > 0) {
      const matches = (shot: Shot) => textContainsCharacter(shot.imagePrompt, filters.imagePromptCharacters.values);
      filtered = filtered.filter(shot =>
        filters.imagePromptCharacters.inverted ? !matches(shot) : matches(shot)
      );
    }

    // 图片提示词 - 文本搜索
    if (filters.imagePromptText.value.trim()) {
      const searchTerm = filters.imagePromptText.value.toLowerCase();
      const matches = (shot: Shot) => (shot.imagePrompt || '').toLowerCase().includes(searchTerm);
      filtered = filtered.filter(shot =>
        filters.imagePromptText.inverted ? !matches(shot) : matches(shot)
      );
    }

    // 视频提示词 - 角色筛选
    if (filters.videoPromptCharacters.values.length > 0) {
      const matches = (shot: Shot) => textContainsCharacter(shot.videoPrompt, filters.videoPromptCharacters.values);
      filtered = filtered.filter(shot =>
        filters.videoPromptCharacters.inverted ? !matches(shot) : matches(shot)
      );
    }

    // 视频提示词 - 文本搜索
    if (filters.videoPromptText.value.trim()) {
      const searchTerm = filters.videoPromptText.value.toLowerCase();
      const matches = (shot: Shot) => (shot.videoPrompt || '').toLowerCase().includes(searchTerm);
      filtered = filtered.filter(shot =>
        filters.videoPromptText.inverted ? !matches(shot) : matches(shot)
      );
    }

    // 图片预览 - 状态筛选
    if (filters.imageStatus.values.length > 0) {
      const matches = (shot: Shot) => {
        const status = getImageStatus(shot);
        return filters.imageStatus.values.includes(status);
      };
      filtered = filtered.filter(shot =>
        filters.imageStatus.inverted ? !matches(shot) : matches(shot)
      );
    }

    // 图片预览 - 无主图筛选
    if (filters.imageNoMain) {
      filtered = filtered.filter(shot => {
        const hasImages = shot.images && shot.images.length > 0;
        if (!hasImages) return true; // 没有图片也算无主图
        const selectedIdx = shot.selectedImageIndex || 0;
        return !shot.images[selectedIdx]; // 选中的索引对应的图片不存在
      });
    }

    // 图片预览 - 备选数量筛选
    if (filters.imageCount.values.length > 0) {
      const matches = (shot: Shot) => {
        const count = shot.images ? shot.images.length : 0;
        return filters.imageCount.values.includes(count);
      };
      filtered = filtered.filter(shot =>
        filters.imageCount.inverted ? !matches(shot) : matches(shot)
      );
    }

    // 视频预览 - 状态筛选
    if (filters.videoStatus.values.length > 0) {
      const matches = (shot: Shot) => {
        const status = getVideoStatus(shot);
        return filters.videoStatus.values.includes(status);
      };
      filtered = filtered.filter(shot =>
        filters.videoStatus.inverted ? !matches(shot) : matches(shot)
      );
    }

    // 视频预览 - 无主视频筛选
    if (filters.videoNoMain) {
      filtered = filtered.filter(shot => {
        const hasVideos = shot.videos && shot.videos.length > 0;
        if (!hasVideos) return true; // 没有视频也算无主视频
        const selectedIdx = shot.selectedVideoIndex || 0;
        return !shot.videos[selectedIdx]; // 选中的索引对应的视频不存在
      });
    }

    // 视频预览 - 备选数量筛选
    if (filters.videoCount.values.length > 0) {
      const matches = (shot: Shot) => {
        const count = shot.videos ? shot.videos.length : 0;
        return filters.videoCount.values.includes(count);
      };
      filtered = filtered.filter(shot =>
        filters.videoCount.inverted ? !matches(shot) : matches(shot)
      );
    }

    // 备注 - 文本搜索
    if (filters.remark.value.trim()) {
      const searchTerm = filters.remark.value.toLowerCase();
      const matches = (shot: Shot) => (shot.remark || '').toLowerCase().includes(searchTerm);
      filtered = filtered.filter(shot =>
        filters.remark.inverted ? !matches(shot) : matches(shot)
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
      dialogueCharacters: { values: [], inverted: false },
      scene: { values: [], inverted: false },
      imagePromptCharacters: { values: [], inverted: false },
      imagePromptText: { value: '', inverted: false },
      videoPromptCharacters: { values: [], inverted: false },
      videoPromptText: { value: '', inverted: false },
      imageStatus: { values: [], inverted: false },
      imageNoMain: false,
      imageCount: { values: [], inverted: false },
      videoStatus: { values: [], inverted: false },
      videoNoMain: false,
      videoCount: { values: [], inverted: false },
      remark: { value: '', inverted: false },
    });
  };

  // 检查是否有激活的筛选
  const hasActiveFilters = useMemo(() => {
    return (
      filters.dialogueCharacters.values.length > 0 ||
      filters.scene.values.length > 0 ||
      filters.imagePromptCharacters.values.length > 0 ||
      filters.imagePromptText.value.trim() !== '' ||
      filters.videoPromptCharacters.values.length > 0 ||
      filters.videoPromptText.value.trim() !== '' ||
      filters.imageStatus.values.length > 0 ||
      filters.imageNoMain ||
      filters.imageCount.values.length > 0 ||
      filters.videoStatus.values.length > 0 ||
      filters.videoNoMain ||
      filters.videoCount.values.length > 0 ||
      filters.remark.value.trim() !== ''
    );
  }, [filters]);

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