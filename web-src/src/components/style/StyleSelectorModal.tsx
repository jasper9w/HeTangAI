/**
 * StyleSelectorModal - 风格选择弹窗
 * 展示预设风格画廊，支持选择预设或输入自定义风格描述
 */
import { useState, useEffect } from 'react';
import { X, Check, Palette, Sparkles, Loader2 } from 'lucide-react';
import type { StylePreset, StyleSetting, PyWebViewApi } from '../../types';

interface StyleSelectorModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (style: StyleSetting) => void;
  currentStyle?: StyleSetting;
  styles: StylePreset[];
  stylesBaseUrl: string;  // 风格图片的基础 URL
  api?: PyWebViewApi;  // API for generating preview
}

export function StyleSelectorModal({
  isOpen,
  onClose,
  onSelect,
  currentStyle,
  styles,
  stylesBaseUrl,
  api,
}: StyleSelectorModalProps) {
  const [selectedType, setSelectedType] = useState<'preset' | 'custom'>(
    currentStyle?.type || 'preset'
  );
  const [selectedPresetId, setSelectedPresetId] = useState<number | undefined>(
    currentStyle?.presetId
  );
  const [customPrompt, setCustomPrompt] = useState(currentStyle?.customPrompt || '');
  const [hoveredStyle, setHoveredStyle] = useState<StylePreset | null>(null);
  const [customPreviewUrl, setCustomPreviewUrl] = useState<string | undefined>(
    currentStyle?.previewUrl
  );
  const [isGeneratingPreview, setIsGeneratingPreview] = useState(false);

  // 重置状态当弹窗打开时
  useEffect(() => {
    if (isOpen) {
      setSelectedType(currentStyle?.type || 'preset');
      setSelectedPresetId(currentStyle?.presetId);
      setCustomPrompt(currentStyle?.customPrompt || '');
      setCustomPreviewUrl(currentStyle?.previewUrl);
    }
  }, [isOpen, currentStyle]);

  // ESC key to close modal
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  const handleGeneratePreview = async () => {
    if (!api || !customPrompt.trim() || isGeneratingPreview) return;

    setIsGeneratingPreview(true);
    try {
      const result = await api.generate_style_preview(customPrompt.trim());
      if (result.success && result.imageUrl) {
        setCustomPreviewUrl(result.imageUrl);
      }
    } catch (error) {
      console.error('Failed to generate style preview:', error);
    } finally {
      setIsGeneratingPreview(false);
    }
  };

  if (!isOpen) return null;

  const handleConfirm = () => {
    if (selectedType === 'preset' && selectedPresetId !== undefined) {
      onSelect({
        type: 'preset',
        presetId: selectedPresetId,
      });
    } else if (selectedType === 'custom' && customPrompt.trim()) {
      onSelect({
        type: 'custom',
        customPrompt: customPrompt.trim(),
        previewUrl: customPreviewUrl,
      });
    }
    onClose();
  };

  const isValid = selectedType === 'preset'
    ? selectedPresetId !== undefined
    : customPrompt.trim().length > 0;

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
      <div className="bg-slate-800 rounded-xl w-[900px] max-w-[95vw] max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-700">
          <div className="flex items-center gap-2">
            <Palette className="w-5 h-5 text-teal-400" />
            <h2 className="text-lg font-semibold text-white">选择画面风格</h2>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-slate-700 rounded-lg text-slate-400 hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-hidden flex">
          {/* Left: Style Gallery */}
          <div className="flex-1 p-4 overflow-y-auto">
            {/* Type Toggle */}
            <div className="flex gap-2 mb-4">
              <button
                onClick={() => setSelectedType('preset')}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  selectedType === 'preset'
                    ? 'bg-teal-600 text-white'
                    : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                }`}
              >
                预设风格
              </button>
              <button
                onClick={() => setSelectedType('custom')}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  selectedType === 'custom'
                    ? 'bg-teal-600 text-white'
                    : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                }`}
              >
                自定义描述
              </button>
            </div>

            {selectedType === 'preset' ? (
              /* Preset Grid */
              <div className="grid grid-cols-4 gap-3">
                {styles.map((style) => (
                  <div
                    key={style.id}
                    onClick={() => setSelectedPresetId(style.id)}
                    onMouseEnter={() => setHoveredStyle(style)}
                    onMouseLeave={() => setHoveredStyle(null)}
                    className={`relative cursor-pointer rounded-lg overflow-hidden border-2 transition-all ${
                      selectedPresetId === style.id
                        ? 'border-teal-500 ring-2 ring-teal-500/30'
                        : 'border-transparent hover:border-slate-600'
                    }`}
                  >
                    <div className="aspect-video bg-slate-700">
                      <img
                        src={`${stylesBaseUrl}/${style.image}`}
                        alt={style.name_cn}
                        className="w-full h-full object-cover"
                        loading="lazy"
                      />
                    </div>
                    <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent" />
                    <div className="absolute bottom-0 left-0 right-0 p-2">
                      <p className="text-xs font-medium text-white truncate">
                        {style.name_cn}
                      </p>
                    </div>
                    {selectedPresetId === style.id && (
                      <div className="absolute top-2 right-2 w-5 h-5 bg-teal-500 rounded-full flex items-center justify-center">
                        <Check className="w-3 h-3 text-white" />
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              /* Custom Prompt Input */
              <div className="space-y-3">
                <p className="text-sm text-slate-400">
                  用文字描述你想要的画面风格，AI 将根据描述生成图片
                </p>
                <textarea
                  value={customPrompt}
                  onChange={(e) => setCustomPrompt(e.target.value)}
                  placeholder="例如：水墨画风格，淡雅的色调，留白构图，古典意境..."
                  className="w-full h-40 px-4 py-3 bg-slate-700 rounded-lg text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-teal-500 resize-none"
                  autoFocus
                />
                <button
                  onClick={handleGeneratePreview}
                  disabled={!customPrompt.trim() || isGeneratingPreview || !api}
                  className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-teal-600 to-teal-500 hover:from-teal-500 hover:to-teal-400 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg text-sm text-white transition-colors"
                >
                  {isGeneratingPreview ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Sparkles className="w-4 h-4" />
                  )}
                  生成预览图
                </button>
              </div>
            )}
          </div>

          {/* Right: Style Preview / Description */}
          <div className="w-72 border-l border-slate-700 p-4 flex flex-col">
            <h3 className="text-sm font-medium text-slate-300 mb-3">风格详情</h3>
            {selectedType === 'preset' && hoveredStyle ? (
              <div className="flex-1 overflow-y-auto">
                <div className="aspect-video bg-slate-700 rounded-lg overflow-hidden mb-3">
                  <img
                    src={`${stylesBaseUrl}/${hoveredStyle.image}`}
                    alt={hoveredStyle.name_cn}
                    className="w-full h-full object-cover"
                  />
                </div>
                <h4 className="font-medium text-white mb-1">{hoveredStyle.name_cn}</h4>
                <p className="text-xs text-slate-500 mb-2">{hoveredStyle.name}</p>
                <p className="text-sm text-slate-400 leading-relaxed">
                  {hoveredStyle.desc}
                </p>
              </div>
            ) : selectedType === 'preset' && selectedPresetId !== undefined ? (
              <div className="flex-1 overflow-y-auto">
                {(() => {
                  const selected = styles.find((s) => s.id === selectedPresetId);
                  if (!selected) return null;
                  return (
                    <>
                      <div className="aspect-video bg-slate-700 rounded-lg overflow-hidden mb-3">
                        <img
                          src={`${stylesBaseUrl}/${selected.image}`}
                          alt={selected.name_cn}
                          className="w-full h-full object-cover"
                        />
                      </div>
                      <h4 className="font-medium text-white mb-1">{selected.name_cn}</h4>
                      <p className="text-xs text-slate-500 mb-2">{selected.name}</p>
                      <p className="text-sm text-slate-400 leading-relaxed">
                        {selected.desc}
                      </p>
                    </>
                  );
                })()}
              </div>
            ) : selectedType === 'custom' ? (
              <div className="flex-1 overflow-y-auto">
                {customPreviewUrl ? (
                  <>
                    <div className="aspect-video bg-slate-700 rounded-lg overflow-hidden mb-3">
                      <img
                        src={customPreviewUrl}
                        alt="Custom style preview"
                        className="w-full h-full object-cover"
                      />
                    </div>
                    <h4 className="font-medium text-white mb-1">自定义风格</h4>
                    <p className="text-sm text-slate-400 leading-relaxed">
                      {customPrompt}
                    </p>
                  </>
                ) : isGeneratingPreview ? (
                  <div className="flex flex-col items-center justify-center h-full gap-3">
                    <Loader2 className="w-8 h-8 text-teal-400 animate-spin" />
                    <p className="text-sm text-slate-400">正在生成预览...</p>
                  </div>
                ) : (
                  <div className="flex items-center justify-center h-full">
                    <p className="text-sm text-slate-500 text-center">
                      输入风格描述后点击生成预览
                    </p>
                  </div>
                )}
              </div>
            ) : (
              <div className="flex-1 flex items-center justify-center">
                <p className="text-sm text-slate-500 text-center">
                  悬停或选择一个风格查看详情
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-slate-700">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg text-sm text-slate-200 transition-colors"
          >
            取消
          </button>
          <button
            onClick={handleConfirm}
            disabled={!isValid}
            className="px-4 py-2 bg-gradient-to-r from-teal-600 to-teal-500 hover:from-teal-500 hover:to-teal-400 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg text-sm text-white transition-colors"
          >
            确认选择
          </button>
        </div>
      </div>
    </div>
  );
}
