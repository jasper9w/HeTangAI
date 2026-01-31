/**
 * View Dropdown - A dropdown menu for view switching
 */
import { Eye, ChevronDown, Film, AudioWaveform, Check } from 'lucide-react';

type ViewType = 'shots' | 'dubbingView';

interface ViewDropdownProps {
  currentView: ViewType;
  onViewChange: (view: ViewType) => void;
}

export function ViewDropdown({ currentView, onViewChange }: ViewDropdownProps) {
  return (
    <div className="relative group">
      {/* Main button */}
      <button className="flex items-center gap-2 px-3 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg text-sm text-slate-200 transition-colors">
        <Eye className="w-4 h-4" />
        视图
        <ChevronDown className="w-3 h-3" />
      </button>

      {/* Dropdown menu */}
      <div className="absolute left-0 top-full mt-1 w-64 bg-slate-800 border border-slate-700 rounded-lg shadow-xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-150 z-50">
        {/* Shot view */}
        <div className="py-1">
          <button
            onClick={() => onViewChange('shots')}
            className="w-full flex flex-col items-start px-3 py-2 text-sm text-slate-200 hover:bg-slate-700 transition-colors"
          >
            <div className="w-full flex items-center gap-2">
              <Film className="w-4 h-4 text-cyan-400" />
              <span className="flex-1 text-left">镜头视图</span>
              {currentView === 'shots' && <Check className="w-4 h-4 text-teal-400" />}
            </div>
            <span className="text-[10px] text-slate-500 mt-1 text-left w-full">
              管理和编辑镜头数据
            </span>
          </button>
        </div>

        {/* Divider */}
        <div className="border-t border-slate-700" />

        {/* Dubbing view */}
        <div className="py-1">
          <button
            onClick={() => onViewChange('dubbingView')}
            className="w-full flex flex-col items-start px-3 py-2 text-sm text-slate-200 hover:bg-slate-700 transition-colors"
          >
            <div className="w-full flex items-center gap-2">
              <AudioWaveform className="w-4 h-4 text-teal-400" />
              <span className="flex-1 text-left">专业配音视图</span>
              {currentView === 'dubbingView' && <Check className="w-4 h-4 text-teal-400" />}
            </div>
            <span className="text-[10px] text-slate-500 mt-1 text-left w-full">
              仅用于截图，以满足某些机构的特殊要求
            </span>
          </button>
        </div>
      </div>
    </div>
  );
}
