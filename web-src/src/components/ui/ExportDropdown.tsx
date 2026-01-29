/**
 * Export Dropdown - A dropdown menu for export operations
 */
import { Film, FileAudio, FileText, ChevronDown } from 'lucide-react';

interface ExportDropdownProps {
  onExportJianyingDraft: () => void;
  onExportAudioSrt: () => void;
  onExportAudioText: () => void;
  disabled?: boolean;
}

export function ExportDropdown({
  onExportJianyingDraft,
  onExportAudioSrt,
  onExportAudioText,
  disabled = false,
}: ExportDropdownProps) {
  return (
    <div className="relative group">
      {/* Main button */}
      <button
        disabled={disabled}
        className="flex items-center gap-2 px-3 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg text-sm text-white transition-colors"
      >
        <Film className="w-4 h-4" />
        导出
        <ChevronDown className="w-3 h-3" />
      </button>

      {/* Dropdown menu */}
      {!disabled && (
        <div className="absolute left-0 top-full mt-1 w-44 bg-slate-800 border border-slate-700 rounded-lg shadow-xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-150 z-50">
          {/* Export JianYing draft */}
          <div className="py-1">
            <button
              onClick={onExportJianyingDraft}
              className="w-full flex items-center gap-2 px-3 py-2 text-sm text-slate-200 hover:bg-slate-700 transition-colors"
            >
              <Film className="w-4 h-4 text-blue-400" />
              导出剪映草稿
            </button>
          </div>

          {/* Divider */}
          <div className="border-t border-slate-700" />

          {/* Audio export section */}
          <div className="py-1">
            <button
              onClick={onExportAudioSrt}
              className="w-full flex items-center gap-2 px-3 py-2 text-sm text-slate-200 hover:bg-slate-700 transition-colors"
            >
              <FileAudio className="w-4 h-4 text-slate-400" />
              导出配音SRT
            </button>
            <button
              onClick={onExportAudioText}
              className="w-full flex items-center gap-2 px-3 py-2 text-sm text-slate-200 hover:bg-slate-700 transition-colors"
            >
              <FileText className="w-4 h-4 text-slate-400" />
              导出配音文本
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
