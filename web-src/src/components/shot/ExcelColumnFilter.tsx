/**
 * ExcelColumnFilter - Excel风格的列筛选组件
 */
import { useState, useMemo, useRef, useEffect } from 'react';
import { Filter, Search, X, Check } from 'lucide-react';
import type { Shot, Character } from '../../types';

interface FilterDropdownProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  anchorRef: React.RefObject<HTMLElement | null>;
}

function FilterDropdown({ isOpen, onClose, title, children, anchorRef }: FilterDropdownProps) {
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ top: 0, left: 0 });

  // 计算下拉框位置
  useEffect(() => {
    if (isOpen && anchorRef.current) {
      const rect = anchorRef.current.getBoundingClientRect();
      setPosition({
        top: rect.bottom + 4,
        left: rect.left,
      });
    }
  }, [isOpen, anchorRef]);

  useEffect(() => {
    if (isOpen) {
      const handleClickOutside = (event: MouseEvent) => {
        if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
          onClose();
        }
      };
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      ref={dropdownRef}
      className="fixed w-64 bg-slate-800 border border-slate-700 rounded-lg shadow-xl z-[9999] max-h-[70vh] overflow-hidden flex flex-col"
      style={{ top: position.top, left: position.left }}
    >
      <div className="p-3 border-b border-slate-700 flex items-center justify-between">
        <h3 className="text-sm font-medium text-slate-200">{title}</h3>
        <button
          onClick={onClose}
          className="p-1 hover:bg-slate-700 rounded text-slate-400 hover:text-slate-200"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto">
        {children}
      </div>
    </div>
  );
}

interface SearchFilterProps {
  value: string;
  inverted: boolean;
  onChange: (value: string) => void;
  onInvertedChange: (inverted: boolean) => void;
  placeholder: string;
}

function SearchFilter({ value, inverted, onChange, onInvertedChange, placeholder }: SearchFilterProps) {
  return (
    <div className="p-3 space-y-3">
      {/* 反选选项 */}
      <label className="flex items-center gap-2 cursor-pointer">
        <input
          type="checkbox"
          checked={inverted}
          onChange={(e) => onInvertedChange(e.target.checked)}
          className="w-4 h-4 rounded border-slate-600 bg-slate-700 text-teal-600 focus:ring-teal-500"
        />
        <span className="text-sm text-slate-200">反选（不包含）</span>
      </label>

      {/* 搜索框 */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-slate-400" />
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="w-full pl-10 pr-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-slate-200 text-sm placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-teal-500"
          autoFocus
        />
        {value && (
          <button
            onClick={() => onChange('')}
            className="absolute right-3 top-1/2 transform -translate-y-1/2 text-slate-400 hover:text-slate-200"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* 反选提示 */}
      {inverted && value && (
        <div className="text-xs text-amber-400 bg-amber-600/10 border border-amber-600/20 rounded p-2">
          将显示不包含 "{value}" 的镜头
        </div>
      )}
    </div>
  );
}

interface MultiSelectFilterProps {
  selectedValues: string[];
  inverted: boolean;
  onChange: (values: string[]) => void;
  onInvertedChange: (inverted: boolean) => void;
  options: Array<{ value: string; label: string; count?: number }>;
  searchValue: string;
  onSearchChange: (value: string) => void;
}

function MultiSelectFilter({
  selectedValues,
  inverted,
  onChange,
  onInvertedChange,
  options,
  searchValue,
  onSearchChange
}: MultiSelectFilterProps) {
  const filteredOptions = useMemo(() => {
    if (!searchValue.trim()) return options;
    const search = searchValue.toLowerCase();
    return options.filter(option =>
      option.label.toLowerCase().includes(search)
    );
  }, [options, searchValue]);

  
  const handleToggleOption = (value: string) => {
    if (selectedValues.includes(value)) {
      onChange(selectedValues.filter(v => v !== value));
    } else {
      onChange([...selectedValues, value]);
    }
  };

  return (
    <div>
      {/* 反选选项 */}
      <div className="p-3 border-b border-slate-700">
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={inverted}
            onChange={(e) => onInvertedChange(e.target.checked)}
            className="w-4 h-4 rounded border-slate-600 bg-slate-700 text-teal-600 focus:ring-teal-500"
          />
          <span className="text-sm text-slate-200">反选（排除选中项）</span>
        </label>
        {inverted && selectedValues.length > 0 && (
          <div className="text-xs text-amber-400 bg-amber-600/10 border border-amber-600/20 rounded p-2 mt-2">
            将显示不包含所选项目的镜头
          </div>
        )}
      </div>

      {/* 搜索框 */}
      <div className="p-3 border-b border-slate-700">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            value={searchValue}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="搜索选项..."
            className="w-full pl-10 pr-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-slate-200 text-sm placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-teal-500"
          />
        </div>
      </div>

      {/* 选项列表 */}
      <div className="max-h-48 overflow-y-auto">
        {filteredOptions.length === 0 ? (
          <div className="p-3 text-center text-slate-400 text-sm">
            没有找到匹配的选项
          </div>
        ) : (
          filteredOptions.map(option => (
            <label
              key={option.value}
              className="flex items-center gap-2 px-3 py-2 cursor-pointer hover:bg-slate-700/50 text-sm"
            >
              <input
                type="checkbox"
                checked={selectedValues.includes(option.value)}
                onChange={() => handleToggleOption(option.value)}
                className="w-4 h-4 rounded border-slate-600 bg-slate-700 text-teal-600 focus:ring-teal-500"
              />
              <span className="text-slate-200 flex-1 truncate">{option.label}</span>
              {option.count !== undefined && (
                <span className="text-slate-400 text-xs">({option.count})</span>
              )}
              {selectedValues.includes(option.value) && (
                <Check className="w-4 h-4 text-teal-400" />
              )}
            </label>
          ))
        )}
      </div>
    </div>
  );
}

interface StatusFilterProps {
  selectedValues: string[];
  inverted: boolean;
  onChange: (values: string[]) => void;
  onInvertedChange: (inverted: boolean) => void;
  shots: Shot[];
  getStatus: (shot: Shot) => string;
  statusLabels: Record<string, string>;
}

function StatusFilter({ selectedValues, inverted, onChange, onInvertedChange, shots, getStatus, statusLabels }: StatusFilterProps) {
  const statusOptions = useMemo(() => {
    const statusCounts: Record<string, number> = {};
    shots.forEach(shot => {
      const status = getStatus(shot);
      statusCounts[status] = (statusCounts[status] || 0) + 1;
    });

    return Object.entries(statusCounts).map(([status, count]) => ({
      value: status,
      label: statusLabels[status] || status,
      count,
    }));
  }, [shots, getStatus, statusLabels]);

  const [searchValue, setSearchValue] = useState('');

  return (
    <MultiSelectFilter
      selectedValues={selectedValues}
      inverted={inverted}
      onChange={onChange}
      onInvertedChange={onInvertedChange}
      options={statusOptions}
      searchValue={searchValue}
      onSearchChange={setSearchValue}
    />
  );
}

interface ColumnHeaderFilterProps {
  title: string;
  hasActiveFilter: boolean;
  children: React.ReactNode;
}

export function ColumnHeaderFilter({ title, hasActiveFilter, children }: ColumnHeaderFilterProps) {
  const [isOpen, setIsOpen] = useState(false);
  const anchorRef = useRef<HTMLButtonElement>(null);

  return (
    <div className="relative">
      <div className="flex items-center gap-1">
        <span className="text-xs text-slate-400 font-medium">{title}</span>
        <button
          ref={anchorRef}
          onClick={() => setIsOpen(!isOpen)}
          className={`p-1 rounded hover:bg-slate-700 transition-colors ${
            hasActiveFilter ? 'text-teal-400' : 'text-slate-500 hover:text-slate-300'
          }`}
          title={`筛选 ${title}`}
        >
          <Filter className="w-3 h-3" />
        </button>
      </div>

      <FilterDropdown
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        title={`筛选 ${title}`}
        anchorRef={anchorRef}
      >
        {children}
      </FilterDropdown>
    </div>
  );
}

// 角色多选筛选组件（用于配音列）
interface CharacterSelectFilterProps {
  selectedValues: string[];
  inverted: boolean;
  onChange: (values: string[]) => void;
  onInvertedChange: (inverted: boolean) => void;
  characters: Character[];
  shots: Shot[];
}

function CharacterSelectFilter({
  selectedValues,
  inverted,
  onChange,
  onInvertedChange,
  characters,
  shots,
}: CharacterSelectFilterProps) {
  const [searchValue, setSearchValue] = useState('');

  // 计算每个角色在配音中出现的次数
  const options = useMemo(() => {
    const characterNames = characters.map(c => c.name).filter(Boolean);
    const characterCounts: Record<string, number> = {};
    
    shots.forEach(shot => {
      // 从 dialogues 中提取角色
      if (shot.dialogues && shot.dialogues.length > 0) {
        const roles = new Set(shot.dialogues.map(d => d.role).filter(Boolean));
        roles.forEach(role => {
          if (characterNames.includes(role)) {
            characterCounts[role] = (characterCounts[role] || 0) + 1;
          }
        });
      } else if (shot.voiceActor && characterNames.includes(shot.voiceActor)) {
        characterCounts[shot.voiceActor] = (characterCounts[shot.voiceActor] || 0) + 1;
      }
    });

    // 按出场次数倒序排列，旁白始终在第一位
    return characters
      .filter(c => c.name)
      .map(char => ({
        value: char.name,
        label: char.name,
        count: characterCounts[char.name] || 0,
        isNarrator: char.isNarrator,
      }))
      .sort((a, b) => {
        // 旁白始终在最前面
        if (a.isNarrator && !b.isNarrator) return -1;
        if (!a.isNarrator && b.isNarrator) return 1;
        // 其他按出场次数倒序
        return b.count - a.count;
      });
  }, [characters, shots]);

  return (
    <MultiSelectFilter
      selectedValues={selectedValues}
      inverted={inverted}
      onChange={onChange}
      onInvertedChange={onInvertedChange}
      options={options}
      searchValue={searchValue}
      onSearchChange={setSearchValue}
    />
  );
}

// 场景多选筛选组件
interface SceneSelectFilterProps {
  selectedValues: string[];
  inverted: boolean;
  onChange: (values: string[]) => void;
  onInvertedChange: (inverted: boolean) => void;
  scenes: string[];
  shots: Shot[];
}

function SceneSelectFilter({
  selectedValues,
  inverted,
  onChange,
  onInvertedChange,
  scenes,
  shots,
}: SceneSelectFilterProps) {
  const [searchValue, setSearchValue] = useState('');

  // 计算每个场景被使用的次数
  const options = useMemo(() => {
    const sceneCounts: Record<string, number> = {};
    
    shots.forEach(shot => {
      const sceneName = (shot.scene || '').trim();
      if (sceneName && scenes.includes(sceneName)) {
        sceneCounts[sceneName] = (sceneCounts[sceneName] || 0) + 1;
      }
    });

    // 按出场次数倒序排列
    return scenes
      .map(name => ({
        value: name,
        label: name,
        count: sceneCounts[name] || 0,
      }))
      .sort((a, b) => b.count - a.count);
  }, [scenes, shots]);

  return (
    <MultiSelectFilter
      selectedValues={selectedValues}
      inverted={inverted}
      onChange={onChange}
      onInvertedChange={onInvertedChange}
      options={options}
      searchValue={searchValue}
      onSearchChange={setSearchValue}
    />
  );
}

// 提示词组合筛选组件（角色多选 + 文本搜索）
interface PromptFilterProps {
  // 角色筛选
  characterValues: string[];
  characterInverted: boolean;
  onCharacterChange: (values: string[]) => void;
  onCharacterInvertedChange: (inverted: boolean) => void;
  // 文本筛选
  textValue: string;
  textInverted: boolean;
  onTextChange: (value: string) => void;
  onTextInvertedChange: (inverted: boolean) => void;
  // 选项
  characters: Character[];
  shots: Shot[];
  promptField: 'imagePrompt' | 'videoPrompt';
  placeholder: string;
}

function PromptFilter({
  characterValues,
  characterInverted,
  onCharacterChange,
  onCharacterInvertedChange,
  textValue,
  textInverted,
  onTextChange,
  onTextInvertedChange,
  characters,
  shots,
  promptField,
  placeholder,
}: PromptFilterProps) {
  const [searchValue, setSearchValue] = useState('');
  const [activeTab, setActiveTab] = useState<'character' | 'text'>('character');

  // 计算每个角色在提示词中出现的次数
  const characterOptions = useMemo(() => {
    const characterCounts: Record<string, number> = {};
    
    shots.forEach(shot => {
      const promptText = (shot[promptField] || '').toLowerCase();
      characters.forEach(char => {
        if (char.name && promptText.includes(char.name.toLowerCase())) {
          characterCounts[char.name] = (characterCounts[char.name] || 0) + 1;
        }
      });
    });

    // 按出场次数倒序排列，旁白始终在第一位
    return characters
      .filter(c => c.name)
      .map(char => ({
        value: char.name,
        label: char.name,
        count: characterCounts[char.name] || 0,
        isNarrator: char.isNarrator,
      }))
      .sort((a, b) => {
        // 旁白始终在最前面
        if (a.isNarrator && !b.isNarrator) return -1;
        if (!a.isNarrator && b.isNarrator) return 1;
        // 其他按出场次数倒序
        return b.count - a.count;
      });
  }, [characters, shots, promptField]);

  return (
    <div>
      {/* Tab 切换 */}
      <div className="flex border-b border-slate-700">
        <button
          onClick={() => setActiveTab('character')}
          className={`flex-1 px-3 py-2 text-sm ${
            activeTab === 'character'
              ? 'text-teal-400 border-b-2 border-teal-400'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          按角色
          {characterValues.length > 0 && (
            <span className="ml-1 px-1.5 py-0.5 bg-teal-500/20 rounded text-xs">
              {characterValues.length}
            </span>
          )}
        </button>
        <button
          onClick={() => setActiveTab('text')}
          className={`flex-1 px-3 py-2 text-sm ${
            activeTab === 'text'
              ? 'text-teal-400 border-b-2 border-teal-400'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          按文本
          {textValue && (
            <span className="ml-1 px-1.5 py-0.5 bg-teal-500/20 rounded text-xs">1</span>
          )}
        </button>
      </div>

      {/* 内容区域 */}
      {activeTab === 'character' ? (
        <MultiSelectFilter
          selectedValues={characterValues}
          inverted={characterInverted}
          onChange={onCharacterChange}
          onInvertedChange={onCharacterInvertedChange}
          options={characterOptions}
          searchValue={searchValue}
          onSearchChange={setSearchValue}
        />
      ) : (
        <SearchFilter
          value={textValue}
          inverted={textInverted}
          onChange={onTextChange}
          onInvertedChange={onTextInvertedChange}
          placeholder={placeholder}
        />
      )}
    </div>
  );
}

// 预览组合筛选组件（状态 + 无主图/视频 + 备选数量）
interface PreviewFilterProps {
  // 状态筛选
  statusValues: string[];
  statusInverted: boolean;
  onStatusChange: (values: string[]) => void;
  onStatusInvertedChange: (inverted: boolean) => void;
  // 无主图/视频
  noMain: boolean;
  onNoMainChange: (value: boolean) => void;
  // 备选数量
  countValues: number[];
  countInverted: boolean;
  onCountChange: (values: number[]) => void;
  onCountInvertedChange: (inverted: boolean) => void;
  // 统计
  shots: Shot[];
  getStatus: (shot: Shot) => string;
  statusLabels: Record<string, string>;
  type: 'image' | 'video';
}

function PreviewFilter({
  statusValues,
  statusInverted,
  onStatusChange,
  onStatusInvertedChange,
  noMain,
  onNoMainChange,
  countValues,
  countInverted,
  onCountChange,
  onCountInvertedChange,
  shots,
  getStatus,
  statusLabels,
  type,
}: PreviewFilterProps) {
  const [activeTab, setActiveTab] = useState<'status' | 'count'>('status');

  // 计算状态选项
  const statusOptions = useMemo(() => {
    const statusCounts: Record<string, number> = {};
    shots.forEach(shot => {
      const status = getStatus(shot);
      statusCounts[status] = (statusCounts[status] || 0) + 1;
    });

    return Object.entries(statusCounts).map(([status, count]) => ({
      value: status,
      label: statusLabels[status] || status,
      count,
    }));
  }, [shots, getStatus, statusLabels]);

  // 计算数量选项
  const countOptions = useMemo(() => {
    const countCounts: Record<number, number> = { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0 };
    shots.forEach(shot => {
      const arr = type === 'image' ? shot.images : shot.videos;
      const count = arr ? arr.length : 0;
      if (count >= 0 && count <= 4) {
        countCounts[count] = (countCounts[count] || 0) + 1;
      }
    });

    return [0, 1, 2, 3, 4].map(num => ({
      value: num,
      label: num === 0 ? '0个' : `${num}个`,
      count: countCounts[num],
    }));
  }, [shots, type]);

  const [statusSearchValue, setStatusSearchValue] = useState('');

  const handleToggleCount = (value: number) => {
    if (countValues.includes(value)) {
      onCountChange(countValues.filter(v => v !== value));
    } else {
      onCountChange([...countValues, value]);
    }
  };

  return (
    <div>
      {/* Tab 切换 */}
      <div className="flex border-b border-slate-700">
        <button
          onClick={() => setActiveTab('status')}
          className={`flex-1 px-3 py-2 text-sm ${
            activeTab === 'status'
              ? 'text-teal-400 border-b-2 border-teal-400'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          按状态
          {(statusValues.length > 0 || noMain) && (
            <span className="ml-1 px-1.5 py-0.5 bg-teal-500/20 rounded text-xs">
              {statusValues.length + (noMain ? 1 : 0)}
            </span>
          )}
        </button>
        <button
          onClick={() => setActiveTab('count')}
          className={`flex-1 px-3 py-2 text-sm ${
            activeTab === 'count'
              ? 'text-teal-400 border-b-2 border-teal-400'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          按数量
          {countValues.length > 0 && (
            <span className="ml-1 px-1.5 py-0.5 bg-teal-500/20 rounded text-xs">
              {countValues.length}
            </span>
          )}
        </button>
      </div>

      {/* 内容区域 */}
      {activeTab === 'status' ? (
        <div>
          {/* 无主图/视频选项 */}
          <div className="p-3 border-b border-slate-700">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={noMain}
                onChange={(e) => onNoMainChange(e.target.checked)}
                className="w-4 h-4 rounded border-slate-600 bg-slate-700 text-teal-600 focus:ring-teal-500"
              />
              <span className="text-sm text-slate-200">
                {type === 'image' ? '无主图' : '无主视频'}
              </span>
            </label>
          </div>

          {/* 状态多选 */}
          <MultiSelectFilter
            selectedValues={statusValues}
            inverted={statusInverted}
            onChange={onStatusChange}
            onInvertedChange={onStatusInvertedChange}
            options={statusOptions}
            searchValue={statusSearchValue}
            onSearchChange={setStatusSearchValue}
          />
        </div>
      ) : (
        <div>
          {/* 反选选项 */}
          <div className="p-3 border-b border-slate-700">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={countInverted}
                onChange={(e) => onCountInvertedChange(e.target.checked)}
                className="w-4 h-4 rounded border-slate-600 bg-slate-700 text-teal-600 focus:ring-teal-500"
              />
              <span className="text-sm text-slate-200">反选（排除选中项）</span>
            </label>
          </div>

          {/* 数量选项列表 */}
          <div className="max-h-48 overflow-y-auto">
            {countOptions.map(option => (
              <label
                key={option.value}
                className="flex items-center gap-2 px-3 py-2 cursor-pointer hover:bg-slate-700/50 text-sm"
              >
                <input
                  type="checkbox"
                  checked={countValues.includes(option.value)}
                  onChange={() => handleToggleCount(option.value)}
                  className="w-4 h-4 rounded border-slate-600 bg-slate-700 text-teal-600 focus:ring-teal-500"
                />
                <span className="text-slate-200 flex-1">{option.label}</span>
                <span className="text-slate-400 text-xs">({option.count})</span>
                {countValues.includes(option.value) && (
                  <Check className="w-4 h-4 text-teal-400" />
                )}
              </label>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// 导出筛选组件
export { SearchFilter, MultiSelectFilter, StatusFilter, CharacterSelectFilter, SceneSelectFilter, PromptFilter, PreviewFilter };