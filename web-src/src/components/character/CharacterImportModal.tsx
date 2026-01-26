/**
 * CharacterImportModal - 从文本或文件导入角色的模态框
 */
import { useState } from 'react';
import {
  X,
  FileSpreadsheet,
  ClipboardPaste,
  Download,
  AlertCircle,
  Check,
  Loader2,
  Trash2,
} from 'lucide-react';
import type { ImportedCharacter } from '../../types';

interface CharacterImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onImportFromText: (text: string) => Promise<{
    success: boolean;
    characters: ImportedCharacter[];
    errors: string[];
    error?: string;
  }>;
  onImportFromFile: () => Promise<{
    success: boolean;
    characters: ImportedCharacter[];
    errors: string[];
    error?: string;
  }>;
  onConfirmImport: (
    characters: ImportedCharacter[],
    options?: { duplicateAction?: 'overwrite' | 'skip' },
  ) => Promise<{
    success: boolean;
    addedCount?: number;
    error?: string;
  }>;
  onExportTemplate: () => Promise<void>;
}

type TabType = 'paste' | 'file' | 'template';

export function CharacterImportModal({
  isOpen,
  onClose,
  onImportFromText,
  onImportFromFile,
  onConfirmImport,
  onExportTemplate,
}: CharacterImportModalProps) {
  const [activeTab, setActiveTab] = useState<TabType>('paste');
  const [pasteText, setPasteText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [parseErrors, setParseErrors] = useState<string[]>([]);
  const [parsedCharacters, setParsedCharacters] = useState<ImportedCharacter[]>([]);
  const [showPreview, setShowPreview] = useState(false);
  const duplicateCharacters = parsedCharacters.filter((char) => !!char.existingId);
  const hasDuplicates = duplicateCharacters.length > 0;

  const handleClose = () => {
    setPasteText('');
    setParseErrors([]);
    setParsedCharacters([]);
    setShowPreview(false);
    setActiveTab('paste');
    onClose();
  };

  const handleParseText = async () => {
    if (!pasteText.trim()) return;

    setIsLoading(true);
    setParseErrors([]);

    try {
      const result = await onImportFromText(pasteText);
      if (result.success) {
        setParsedCharacters(result.characters);
        setParseErrors(result.errors);
        setShowPreview(true);
      } else {
        setParseErrors([result.error || 'Failed to parse text']);
      }
    } catch (error) {
      setParseErrors([String(error)]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleImportFile = async () => {
    setIsLoading(true);
    setParseErrors([]);

    try {
      const result = await onImportFromFile();
      if (result.success) {
        setParsedCharacters(result.characters);
        setParseErrors(result.errors);
        setShowPreview(true);
      } else if (result.error !== 'No file selected') {
        setParseErrors([result.error || 'Failed to import file']);
      }
    } catch (error) {
      setParseErrors([String(error)]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleConfirm = async (duplicateAction?: 'overwrite' | 'skip') => {
    if (parsedCharacters.length === 0) return;

    setIsLoading(true);
    try {
      const result = await onConfirmImport(parsedCharacters, { duplicateAction });
      if (result.success) {
        handleClose();
      } else {
        setParseErrors([result.error || 'Failed to import characters']);
      }
    } catch (error) {
      setParseErrors([String(error)]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleRemoveCharacter = (index: number) => {
    setParsedCharacters((prev) => prev.filter((_, i) => i !== index));
  };

  const handleExportTemplate = async () => {
    setIsLoading(true);
    try {
      await onExportTemplate();
    } finally {
      setIsLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-slate-800 rounded-lg border border-slate-700 w-full max-w-3xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="p-4 border-b border-slate-700 flex items-center justify-between">
          <h3 className="text-lg font-medium text-slate-200">
            {showPreview ? '预览导入' : '导入角色'}
          </h3>
          <button
            onClick={handleClose}
            className="p-1 hover:bg-slate-700 rounded text-slate-400 hover:text-slate-200 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        {!showPreview ? (
          <>
            {/* Tabs */}
            <div className="flex border-b border-slate-700">
              <button
                onClick={() => setActiveTab('paste')}
                className={`flex items-center gap-2 px-4 py-3 text-sm font-medium transition-colors ${
                  activeTab === 'paste'
                    ? 'text-violet-400 border-b-2 border-violet-400'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <ClipboardPaste className="w-4 h-4" />
                粘贴文本
              </button>
              <button
                onClick={() => setActiveTab('file')}
                className={`flex items-center gap-2 px-4 py-3 text-sm font-medium transition-colors ${
                  activeTab === 'file'
                    ? 'text-violet-400 border-b-2 border-violet-400'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <FileSpreadsheet className="w-4 h-4" />
                CSV/Excel/JSONL文件
              </button>
              <button
                onClick={() => setActiveTab('template')}
                className={`flex items-center gap-2 px-4 py-3 text-sm font-medium transition-colors ${
                  activeTab === 'template'
                    ? 'text-violet-400 border-b-2 border-violet-400'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <Download className="w-4 h-4" />
                导出模板
              </button>
            </div>

            {/* Tab Content */}
            <div className="p-4 flex-1 overflow-y-auto">
              {activeTab === 'paste' && (
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-2">
                      粘贴角色数据（Tab/逗号分隔或JSONL）
                    </label>
                    <textarea
                      value={pasteText}
                      onChange={(e) => setPasteText(e.target.value)}
                      placeholder={`格式示例:\n\n2列 (姓名, 描述):\nAlice\t黑长直的年轻女性\nBob\t穿西装的中年男性\n\n3列 (姓名, 参考音频, 描述):\nAlice\t/path/to/audio.wav\t黑长直的年轻女性\nBob\t/path/to/audio2.wav\t穿西装的中年男性\n\nJSONL:\n{"name":"Alice","dna":"黑长直的年轻女性","tti":{"prompt":"young woman"}}`}
                      rows={10}
                      className="w-full px-3 py-2 bg-slate-700 rounded-lg text-slate-300 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-violet-500 resize-none font-mono text-sm"
                    />
                  </div>

                  <div className="bg-slate-700/50 rounded-lg p-3">
                    <h4 className="text-sm font-medium text-slate-300 mb-2">列格式</h4>
                    <ul className="text-xs text-slate-400 space-y-1">
                      <li>
                        <span className="text-slate-300">2列:</span> 角色名, 描述
                      </li>
                      <li>
                        <span className="text-slate-300">3列:</span> 角色名, 参考音频路径, 描述
                      </li>
                      <li>
                        <span className="text-slate-300">JSONL:</span> 每行一个JSON对象
                      </li>
                      <li className="text-slate-500">
                        支持Tab或逗号作为分隔符，自动检测。
                      </li>
                    </ul>
                  </div>
                </div>
              )}

              {activeTab === 'file' && (
                <div className="space-y-4">
                  <div className="bg-slate-700/50 rounded-lg p-6 text-center">
                    <FileSpreadsheet className="w-12 h-12 mx-auto mb-3 text-slate-400" />
                    <p className="text-slate-300 mb-4">
                      从CSV、Excel或JSONL文件导入角色
                    </p>
                    <button
                      onClick={handleImportFile}
                      disabled={isLoading}
                      className="px-4 py-2 bg-violet-600 hover:bg-violet-500 disabled:opacity-50 rounded-lg text-sm text-white transition-colors"
                    >
                      {isLoading ? (
                        <span className="flex items-center gap-2">
                          <Loader2 className="w-4 h-4 animate-spin" />
                          加载中...
                        </span>
                      ) : (
                        '选择文件'
                      )}
                    </button>
                  </div>

                  <div className="bg-slate-700/50 rounded-lg p-3">
                    <h4 className="text-sm font-medium text-slate-300 mb-2">识别的列名</h4>
                    <ul className="text-xs text-slate-400 space-y-1">
                      <li>
                        <span className="text-slate-300">角色名称:</span> name, character, role, actor
                      </li>
                      <li>
                        <span className="text-slate-300">参考音频:</span> audio, voice, reference, sound
                      </li>
                      <li>
                        <span className="text-slate-300">描述:</span> desc, description, prompt, detail
                      </li>
                      <li className="text-slate-500">
                        对于有多张工作表的Excel文件，将使用第一张匹配列名的工作表。
                      </li>
                    </ul>
                  </div>
                </div>
              )}

              {activeTab === 'template' && (
                <div className="space-y-4">
                  <div className="bg-slate-700/50 rounded-lg p-6 text-center">
                    <Download className="w-12 h-12 mx-auto mb-3 text-slate-400" />
                    <p className="text-slate-300 mb-4">
                      下载带有示例数据的模板Excel文件
                    </p>
                    <button
                      onClick={handleExportTemplate}
                      disabled={isLoading}
                      className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 rounded-lg text-sm text-white transition-colors"
                    >
                      {isLoading ? (
                        <span className="flex items-center gap-2">
                          <Loader2 className="w-4 h-4 animate-spin" />
                          导出中...
                        </span>
                      ) : (
                        '导出模板'
                      )}
                    </button>
                  </div>

                  <div className="bg-slate-700/50 rounded-lg p-3">
                    <h4 className="text-sm font-medium text-slate-300 mb-2">模板列</h4>
                    <ul className="text-xs text-slate-400 space-y-1">
                      <li>
                        <span className="text-slate-300">character_name:</span> 角色名称
                      </li>
                      <li>
                        <span className="text-slate-300">reference_audio:</span> 参考音频文件路径（可选）
                      </li>
                      <li>
                        <span className="text-slate-300">description:</span> 用于图像生成的角色描述
                      </li>
                    </ul>
                  </div>
                </div>
              )}

              {/* Errors */}
              {parseErrors.length > 0 && (
                <div className="mt-4 bg-red-900/30 border border-red-700 rounded-lg p-3">
                  <div className="flex items-center gap-2 text-red-400 mb-2">
                    <AlertCircle className="w-4 h-4" />
                    <span className="text-sm font-medium">错误</span>
                  </div>
                  <ul className="text-xs text-red-300 space-y-1">
                    {parseErrors.map((error, i) => (
                      <li key={i}>{error}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="p-4 border-t border-slate-700 flex items-center justify-end gap-2">
              <button
                onClick={handleClose}
                className="px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg text-sm text-slate-300 transition-colors"
              >
                取消
              </button>
              {activeTab === 'paste' && (
                <button
                  onClick={handleParseText}
                  disabled={isLoading || !pasteText.trim()}
                  className="px-4 py-2 bg-violet-600 hover:bg-violet-500 disabled:opacity-50 rounded-lg text-sm text-white transition-colors"
                >
                  {isLoading ? (
                    <span className="flex items-center gap-2">
                      <Loader2 className="w-4 h-4 animate-spin" />
                      解析中...
                    </span>
                  ) : (
                    '解析并预览'
                  )}
                </button>
              )}
            </div>
          </>
        ) : (
          <>
            {/* Preview Content */}
            <div className="p-4 flex-1 overflow-y-auto">
              <div className="mb-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm text-slate-300">
                    即将导入 {parsedCharacters.length} 个角色
                  </span>
                  <button
                    onClick={() => setShowPreview(false)}
                    className="text-xs text-violet-400 hover:text-violet-300"
                  >
                    返回编辑
                  </button>
                </div>

                {/* Warnings */}
                {parseErrors.length > 0 && (
                  <div className="bg-amber-900/30 border border-amber-700 rounded-lg p-3 mb-4">
                    <div className="flex items-center gap-2 text-amber-400 mb-2">
                      <AlertCircle className="w-4 h-4" />
                      <span className="text-sm font-medium">警告</span>
                    </div>
                    <ul className="text-xs text-amber-300 space-y-1">
                      {parseErrors.map((error, i) => (
                        <li key={i}>{error}</li>
                      ))}
                    </ul>
                  </div>
                )}
                {hasDuplicates && (
                  <div className="bg-amber-900/30 border border-amber-700 rounded-lg p-3">
                    <div className="flex items-center gap-2 text-amber-400 mb-2">
                      <AlertCircle className="w-4 h-4" />
                      <span className="text-sm font-medium">检测到重复角色</span>
                    </div>
                    <p className="text-xs text-amber-300">
                      有 {duplicateCharacters.length} 个角色已存在。请选择覆盖或跳过重复角色。
                    </p>
                  </div>
                )}
              </div>

              {/* Character List */}
              {parsedCharacters.length > 0 ? (
                <div className="space-y-2">
                  {parsedCharacters.map((char, index) => (
                    <div
                      key={char.id || index}
                      className="bg-slate-700/50 rounded-lg p-3 flex items-start gap-3"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-medium text-slate-200">{char.name}</span>
                          {char.existingId && (
                            <span className="text-xs px-1.5 py-0.5 bg-amber-600/30 text-amber-300 rounded">
                              重复
                            </span>
                          )}
                          {char.referenceAudioPath && (
                            <span className="text-xs px-1.5 py-0.5 bg-violet-600/30 text-violet-300 rounded">
                              Has Audio
                            </span>
                          )}
                        </div>
                        {char.description && (
                          <p className="text-xs text-slate-400 line-clamp-2">{char.description}</p>
                        )}
                        {char.referenceAudioPath && (
                          <p className="text-xs text-slate-500 mt-1 truncate">
                            Audio: {char.referenceAudioPath}
                          </p>
                        )}
                      </div>
                      <button
                        onClick={() => handleRemoveCharacter(index)}
                        className="p-1 hover:bg-slate-600 rounded text-slate-400 hover:text-red-400 transition-colors"
                        title="Remove"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8 text-slate-400">
                  <AlertCircle className="w-8 h-8 mx-auto mb-2" />
                  <p>没有有效的角色可导入</p>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="p-4 border-t border-slate-700 flex items-center justify-end gap-2">
              <button
                onClick={hasDuplicates ? handleClose : () => setShowPreview(false)}
                className="px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg text-sm text-slate-300 transition-colors"
              >
                {hasDuplicates ? '取消' : '返回'}
              </button>
              {hasDuplicates ? (
                <>
                  <button
                    onClick={() => handleConfirm('skip')}
                    disabled={isLoading || parsedCharacters.length === 0}
                    className="px-4 py-2 bg-slate-600 hover:bg-slate-500 disabled:opacity-50 rounded-lg text-sm text-white transition-colors"
                  >
                    {isLoading ? '处理中...' : '跳过重复'}
                  </button>
                  <button
                    onClick={() => handleConfirm('overwrite')}
                    disabled={isLoading || parsedCharacters.length === 0}
                    className="flex items-center gap-2 px-4 py-2 bg-violet-600 hover:bg-violet-500 disabled:opacity-50 rounded-lg text-sm text-white transition-colors"
                  >
                    {isLoading ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        处理中...
                      </>
                    ) : (
                      <>
                        <Check className="w-4 h-4" />
                        覆盖重复
                      </>
                    )}
                  </button>
                </>
              ) : (
                <button
                  onClick={() => handleConfirm()}
                  disabled={isLoading || parsedCharacters.length === 0}
                  className="flex items-center gap-2 px-4 py-2 bg-violet-600 hover:bg-violet-500 disabled:opacity-50 rounded-lg text-sm text-white transition-colors"
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      导入中...
                    </>
                  ) : (
                    <>
                      <Check className="w-4 h-4" />
                      导入 {parsedCharacters.length} 个角色
                    </>
                  )}
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
