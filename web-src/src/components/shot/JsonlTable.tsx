/**
 * JsonlTable - Display JSONL content as a table or raw text
 * Columns are dynamically generated based on the first-level keys of the first row
 */
import { useState, useMemo, useCallback } from 'react';
import { ChevronDown, ChevronRight, Edit3, Check, X, Table, FileText } from 'lucide-react';

interface JsonlTableProps {
  value: string;
  onChange: (value: string) => void;
  className?: string;
}

// Parse a single JSON line, return null if invalid
function parseJsonLine(line: string): Record<string, unknown> | null {
  const trimmed = line.trim();
  if (!trimmed || !trimmed.startsWith('{')) return null;
  try {
    return JSON.parse(trimmed);
  } catch {
    return null;
  }
}

// Parse JSONL string into array of objects
function parseJsonl(text: string): Record<string, unknown>[] {
  if (!text) return [];
  const lines = text.split('\n');
  const result: Record<string, unknown>[] = [];
  for (const line of lines) {
    const obj = parseJsonLine(line);
    if (obj) result.push(obj);
  }
  return result;
}

// Convert array of objects back to JSONL string
function toJsonl(data: Record<string, unknown>[]): string {
  return data.map(obj => JSON.stringify(obj, null, 0)).join('\n');
}

// Format cell value for display
function formatCellValue(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) {
    // For simple arrays (strings/numbers), join with comma
    if (value.every(v => typeof v === 'string' || typeof v === 'number')) {
      return value.join(', ');
    }
    return JSON.stringify(value, null, 0);
  }
  if (typeof value === 'object') {
    return JSON.stringify(value, null, 0);
  }
  return String(value);
}

// Check if value is a nested object or complex array
function isComplexValue(value: unknown): boolean {
  if (Array.isArray(value)) {
    return value.some(v => typeof v === 'object' && v !== null);
  }
  return typeof value === 'object' && value !== null;
}

// Expandable cell for complex values - default expanded
function ExpandableCell({ value }: { value: unknown }) {
  const [expanded, setExpanded] = useState(true); // Default to expanded
  const isComplex = isComplexValue(value);
  const displayValue = formatCellValue(value);

  if (!isComplex) {
    return (
      <span className="text-slate-300 break-words" title={displayValue}>
        {displayValue}
      </span>
    );
  }

  return (
    <div>
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-1 text-slate-400 hover:text-slate-200 transition-colors"
      >
        {expanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
        <span className="text-xs">{Array.isArray(value) ? `[${(value as unknown[]).length}]` : '{...}'}</span>
      </button>
      {expanded && (
        <pre className="mt-1 p-2 bg-slate-900 rounded text-xs text-slate-400 overflow-x-auto max-h-40 overflow-y-auto">
          {JSON.stringify(value, null, 2)}
        </pre>
      )}
    </div>
  );
}

// Editable cell component
function EditableCell({
  value,
  rowIndex,
  column,
  onUpdate,
}: {
  value: unknown;
  rowIndex: number;
  column: string;
  onUpdate: (rowIndex: number, column: string, newValue: unknown) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState('');
  const isComplex = isComplexValue(value);

  const handleStartEdit = useCallback(() => {
    if (isComplex) {
      setEditValue(JSON.stringify(value, null, 2));
    } else {
      setEditValue(formatCellValue(value));
    }
    setEditing(true);
  }, [value, isComplex]);

  const handleSave = useCallback(() => {
    let newValue: unknown;
    if (isComplex) {
      try {
        newValue = JSON.parse(editValue);
      } catch {
        // If JSON parse fails, keep as string
        newValue = editValue;
      }
    } else if (typeof value === 'number') {
      const num = Number(editValue);
      newValue = isNaN(num) ? editValue : num;
    } else if (typeof value === 'boolean') {
      newValue = editValue.toLowerCase() === 'true';
    } else {
      newValue = editValue;
    }
    onUpdate(rowIndex, column, newValue);
    setEditing(false);
  }, [editValue, isComplex, value, rowIndex, column, onUpdate]);

  const handleCancel = useCallback(() => {
    setEditing(false);
  }, []);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey && !isComplex) {
      e.preventDefault();
      handleSave();
    } else if (e.key === 'Escape') {
      handleCancel();
    }
  }, [isComplex, handleSave, handleCancel]);

  if (editing) {
    return (
      <div className="flex flex-col gap-1">
        {isComplex ? (
          <textarea
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onKeyDown={handleKeyDown}
            className="w-full min-h-[80px] px-2 py-1 bg-slate-700 rounded text-xs text-slate-200 focus:outline-none focus:ring-1 focus:ring-teal-500 resize-y"
            autoFocus
          />
        ) : (
          <input
            type="text"
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onKeyDown={handleKeyDown}
            className="w-full px-2 py-1 bg-slate-700 rounded text-xs text-slate-200 focus:outline-none focus:ring-1 focus:ring-teal-500"
            autoFocus
          />
        )}
        <div className="flex items-center gap-1">
          <button
            onClick={handleSave}
            className="p-1 text-green-400 hover:text-green-300 transition-colors"
            title="Save"
          >
            <Check className="w-3 h-3" />
          </button>
          <button
            onClick={handleCancel}
            className="p-1 text-red-400 hover:text-red-300 transition-colors"
            title="Cancel"
          >
            <X className="w-3 h-3" />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="group flex items-start gap-1">
      <div className="flex-1 min-w-0">
        <ExpandableCell value={value} />
      </div>
      <button
        onClick={handleStartEdit}
        className="p-1 text-slate-500 hover:text-slate-300 opacity-0 group-hover:opacity-100 transition-all flex-shrink-0"
        title="Edit"
      >
        <Edit3 className="w-3 h-3" />
      </button>
    </div>
  );
}

export function JsonlTable({ value, onChange, className = '' }: JsonlTableProps) {
  const [viewMode, setViewMode] = useState<'table' | 'text'>('table');
  
  // Parse JSONL data
  const data = useMemo(() => parseJsonl(value), [value]);

  // Get columns from first row's first-level keys
  const columns = useMemo(() => {
    if (data.length === 0) return [];
    return Object.keys(data[0]);
  }, [data]);

  // Handle cell update
  const handleCellUpdate = useCallback(
    (rowIndex: number, column: string, newValue: unknown) => {
      const newData = [...data];
      newData[rowIndex] = { ...newData[rowIndex], [column]: newValue };
      onChange(toJsonl(newData));
    },
    [data, onChange]
  );

  // View mode toggle button
  const ViewToggle = (
    <div className="flex items-center gap-1 bg-slate-900 rounded-lg p-1">
      <button
        onClick={() => setViewMode('table')}
        className={`flex items-center gap-1.5 px-2 py-1 rounded text-xs transition-colors ${
          viewMode === 'table'
            ? 'bg-teal-600 text-white'
            : 'text-slate-400 hover:text-slate-200'
        }`}
        title="Table view"
      >
        <Table className="w-3.5 h-3.5" />
        <span>Table</span>
      </button>
      <button
        onClick={() => setViewMode('text')}
        className={`flex items-center gap-1.5 px-2 py-1 rounded text-xs transition-colors ${
          viewMode === 'text'
            ? 'bg-teal-600 text-white'
            : 'text-slate-400 hover:text-slate-200'
        }`}
        title="Text view"
      >
        <FileText className="w-3.5 h-3.5" />
        <span>Text</span>
      </button>
    </div>
  );

  // Text view mode
  if (viewMode === 'text') {
    return (
      <div className={`flex flex-col gap-2 ${className}`}>
        <div className="flex justify-end">
          {ViewToggle}
        </div>
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full h-[60vh] px-3 py-2 bg-slate-700 rounded-lg text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500 resize-none font-mono"
          placeholder="JSONL content..."
        />
      </div>
    );
  }

  // Empty state
  if (data.length === 0) {
    return (
      <div className={`flex flex-col gap-2 ${className}`}>
        <div className="flex justify-end">
          {ViewToggle}
        </div>
        <div className="bg-slate-700 rounded-lg p-8 text-center">
          <p className="text-slate-400 text-sm">No data</p>
        </div>
      </div>
    );
  }

  return (
    <div className={`flex flex-col gap-2 ${className}`}>
      <div className="flex justify-end">
        {ViewToggle}
      </div>
      <div className="bg-slate-800 rounded-lg border border-slate-700 overflow-hidden">
        <div className="overflow-x-auto overflow-y-auto max-h-[60vh]">
          <table className="w-full text-sm">
            <thead className="bg-slate-900 sticky top-0 z-10">
              <tr>
                <th className="px-3 py-2 text-left text-xs font-medium text-slate-400 uppercase tracking-wider border-b border-slate-700 w-12">
                  #
                </th>
                {columns.map((col) => (
                  <th
                    key={col}
                    className="px-3 py-2 text-left text-xs font-medium text-slate-400 uppercase tracking-wider border-b border-slate-700 min-w-[100px]"
                  >
                    {col}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-700">
              {data.map((row, rowIndex) => (
                <tr key={rowIndex} className="hover:bg-slate-750 transition-colors">
                  <td className="px-3 py-2 text-slate-500 text-xs border-r border-slate-700">
                    {rowIndex + 1}
                  </td>
                  {columns.map((col) => (
                    <td key={col} className="px-3 py-2 text-xs align-top">
                      <EditableCell
                        value={row[col]}
                        rowIndex={rowIndex}
                        column={col}
                        onUpdate={handleCellUpdate}
                      />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

export default JsonlTable;
