/**
 * Import Dropdown - A dropdown menu for import/export operations
 */
import { FileUp, Download, ChevronDown, Sparkles } from 'lucide-react';

interface ImportDropdownProps {
  onOneClickImport: () => void;
  onImportExcel: () => void;
  onExportExcelTemplate: () => void;
  onImportJsonl: () => void;
  onExportJsonlTemplate: () => void;
}

export function ImportDropdown({
  onOneClickImport,
  onImportExcel,
  onExportExcelTemplate,
  onImportJsonl,
  onExportJsonlTemplate,
}: ImportDropdownProps) {
  return (
    <div className="relative group">
      {/* Main button */}
      <button className="flex items-center gap-2 px-3 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg text-sm text-slate-200 transition-colors">
        <FileUp className="w-4 h-4" />
        导入
        <ChevronDown className="w-3 h-3" />
      </button>

      {/* Dropdown menu */}
      <div className="absolute left-0 top-full mt-1 w-40 bg-slate-800 border border-slate-700 rounded-lg shadow-xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-150 z-50">
        {/* One-click import */}
        <div className="py-1">
          <button
            onClick={onOneClickImport}
            className="w-full flex items-center gap-2 px-3 py-2 text-sm text-slate-200 hover:bg-slate-700 transition-colors"
          >
            <Sparkles className="w-4 h-4 text-violet-400" />
            一键导入
          </button>
        </div>

        {/* Divider */}
        <div className="border-t border-slate-700" />

        {/* Excel section */}
        <div className="py-1">
          <button
            onClick={onImportExcel}
            className="w-full flex items-center gap-2 px-3 py-2 text-sm text-slate-200 hover:bg-slate-700 transition-colors"
          >
            <FileUp className="w-4 h-4 text-slate-400" />
            从EXCEL导入
          </button>
          <button
            onClick={onExportExcelTemplate}
            className="w-full flex items-center gap-2 px-3 py-2 text-sm text-slate-200 hover:bg-slate-700 transition-colors"
          >
            <Download className="w-4 h-4 text-slate-400" />
            导出EXCEL模板
          </button>
        </div>

        {/* Divider */}
        <div className="border-t border-slate-700" />

        {/* JSONL section */}
        <div className="py-1">
          <button
            onClick={onImportJsonl}
            className="w-full flex items-center gap-2 px-3 py-2 text-sm text-slate-200 hover:bg-slate-700 transition-colors"
          >
            <FileUp className="w-4 h-4 text-slate-400" />
            从JSONL导入
          </button>
          <button
            onClick={onExportJsonlTemplate}
            className="w-full flex items-center gap-2 px-3 py-2 text-sm text-slate-200 hover:bg-slate-700 transition-colors"
          >
            <Download className="w-4 h-4 text-slate-400" />
            导出JSONL模板
          </button>
        </div>
      </div>
    </div>
  );
}
