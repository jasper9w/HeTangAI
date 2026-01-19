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
}

function FilterDropdown({ isOpen, onClose, title, children }: FilterDropdownProps) {
  const dropdownRef = useRef<HTMLDivElement>(null);

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
      className="absolute top-full left-0 mt-1 w-64 bg-slate-800 border border-slate-700 rounded-lg shadow-xl z-50 max-h-80 overflow-hidden flex flex-col"
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
          className="w-4 h-4 rounded border-slate-600 bg-slate-700 text-violet-600 focus:ring-violet-500"
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
          className="w-full pl-10 pr-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-slate-200 text-sm placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-violet-500"
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

  const handleToggleAll = () => {
    if (selectedValues.length === options.length) {
      onChange([]);
    } else {
      onChange(options.map(opt => opt.value));
    }
  };

  const handleToggleOption = (value: string) => {
    if (selectedValues.includes(value)) {
      onChange(selectedValues.filter(v => v !== value));
    } else {
      onChange([...selectedValues, value]);
    }
  };

  const allSelected = selectedValues.length === options.length;
  const someSelected = selectedValues.length > 0 && selectedValues.length < options.length;

  return (
    <div>
      {/* 反选选项 */}
      <div className="p-3 border-b border-slate-700">
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={inverted}
            onChange={(e) => onInvertedChange(e.target.checked)}
            className="w-4 h-4 rounded border-slate-600 bg-slate-700 text-violet-600 focus:ring-violet-500"
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
            className="w-full pl-10 pr-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-slate-200 text-sm placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-violet-500"
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
                className="w-4 h-4 rounded border-slate-600 bg-slate-700 text-violet-600 focus:ring-violet-500"
              />
              <span className="text-slate-200 flex-1 truncate">{option.label}</span>
              {option.count !== undefined && (
                <span className="text-slate-400 text-xs">({option.count})</span>
              )}
              {selectedValues.includes(option.value) && (
                <Check className="w-4 h-4 text-violet-400" />
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

  return (
    <div className="relative">
      <div className="flex items-center gap-1">
        <span className="text-xs text-slate-400 font-medium">{title}</span>
        <button
          onClick={() => setIsOpen(!isOpen)}
          className={`p-1 rounded hover:bg-slate-700 transition-colors ${
            hasActiveFilter ? 'text-violet-400' : 'text-slate-500 hover:text-slate-300'
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
      >
        {children}
      </FilterDropdown>
    </div>
  );
}

// 导出筛选组件
export { SearchFilter, MultiSelectFilter, StatusFilter };