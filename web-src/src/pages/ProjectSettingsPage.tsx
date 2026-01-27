/**
 * ProjectSettingsPage - 项目设定页面
 * 包含作品信息和创作参数设置
 */
import { useState, useEffect, useRef } from 'react';
import {
  Loader2,
  Sparkles,
  MessageSquare,
  Upload,
  Send,
  X,
  Palette,
  Languages,
  Monitor,
  Image as ImageIcon,
  Download,
} from 'lucide-react';
import { useApi } from '../hooks/useApi';
import { StyleSelectorModal } from '../components/style/StyleSelectorModal';
import type {
  StylePreset,
  ProjectSettings,
  WorkInfo,
  StyleSetting,
  ChatMessage,
} from '../types';
import type { ToastType } from '../components/ui/Toast';

interface ProjectSettingsPageProps {
  projectName: string | null;
  showToast: (type: ToastType, message: string, duration?: number) => void;
}

const defaultSettings: ProjectSettings = {
  workInfo: {
    title: '',
    coverImage: '',
    description: '',
  },
  creationParams: {
    style: {
      type: 'preset',
      presetId: undefined,
      customPrompt: '',
    },
    language: 'zh',
    aspectRatio: '16:9',
  },
};

const languageOptions = [
  { value: 'zh', label: '中文' },
  { value: 'en', label: 'English' },
  { value: 'ja', label: '日本語' },
  { value: 'ko', label: '한국어' },
];

const aspectRatioOptions = [
  { value: '16:9', label: '横屏 16:9' },
  { value: '9:16', label: '竖屏 9:16' },
  { value: '1:1', label: '方形 1:1' },
];

export function ProjectSettingsPage({ projectName, showToast }: ProjectSettingsPageProps) {
  const { api, ready } = useApi();

  // State
  const [projectSettings, setProjectSettings] = useState<ProjectSettings>(defaultSettings);
  const [styles, setStyles] = useState<StylePreset[]>([]);
  const [styleModalOpen, setStyleModalOpen] = useState(false);
  const [aiChatModalOpen, setAiChatModalOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isGeneratingWorkInfo, setIsGeneratingWorkInfo] = useState(false);
  const [isGeneratingCover, setIsGeneratingCover] = useState(false);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [isChatting, setIsChatting] = useState(false);

  // Refs
  const settingsRef = useRef(projectSettings);
  const settingsSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const hasLoadedRef = useRef(false);
  const loadingProjectRef = useRef<string | null>(null);

  const stylesBaseUrl = 'http://127.0.0.1:8765/assets/styles';

  // Load initial data
  useEffect(() => {
    if (!ready || !api) return;

    if (loadingProjectRef.current === projectName && hasLoadedRef.current) {
      return;
    }

    const load = async () => {
      setIsLoading(true);
      loadingProjectRef.current = projectName;

      try {
        // Load styles
        const stylesResult = await api.get_styles();
        if (stylesResult.success && stylesResult.styles) {
          setStyles(stylesResult.styles);
        }

        if (projectName) {
          // Load project settings
          const settingsResult = await api.get_project_settings();
          if (settingsResult.success && settingsResult.settings) {
            setProjectSettings(settingsResult.settings);
          }
        }
        hasLoadedRef.current = true;
      } catch (error) {
        console.error('Failed to load project settings:', error);
        showToast('error', '加载设定失败');
      } finally {
        setIsLoading(false);
      }
    };
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, api, projectName]);

  // Sync ref
  useEffect(() => {
    settingsRef.current = projectSettings;
  }, [projectSettings]);

  // Scroll chat to bottom
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages]);

  // Auto-save settings
  const scheduleSaveSettings = () => {
    if (!api || !projectName) return;
    if (settingsSaveTimerRef.current) {
      clearTimeout(settingsSaveTimerRef.current);
    }
    settingsSaveTimerRef.current = setTimeout(async () => {
      try {
        const result = await api.save_project_settings(settingsRef.current);
        if (!result.success) {
          showToast('error', result.error || '保存设定失败');
        }
      } catch (error) {
        console.error('Failed to save settings:', error);
      }
    }, 500);
  };

  // Handlers
  const updateWorkInfo = (updates: Partial<WorkInfo>) => {
    setProjectSettings((prev) => ({
      ...prev,
      workInfo: { ...prev.workInfo, ...updates },
    }));
    scheduleSaveSettings();
  };

  const updateStyle = (style: StyleSetting) => {
    setProjectSettings((prev) => ({
      ...prev,
      creationParams: { ...prev.creationParams, style },
    }));
    scheduleSaveSettings();
  };

  const updateLanguage = (language: string) => {
    setProjectSettings((prev) => ({
      ...prev,
      creationParams: { ...prev.creationParams, language },
    }));
    scheduleSaveSettings();
  };

  const updateAspectRatio = (aspectRatio: '16:9' | '9:16' | '1:1') => {
    setProjectSettings((prev) => ({
      ...prev,
      creationParams: { ...prev.creationParams, aspectRatio },
    }));
    scheduleSaveSettings();
  };

  const handleGenerateWorkInfo = async () => {
    if (!api || !projectName) {
      showToast('error', '请先打开项目');
      return;
    }

    setIsGeneratingWorkInfo(true);
    try {
      const result = await api.generate_work_info();
      if (result.success && result.workInfo) {
        updateWorkInfo(result.workInfo);
        showToast('success', '作品信息已生成');
      } else {
        showToast('error', result.error || '生成失败');
      }
    } catch (error) {
      console.error('Failed to generate work info:', error);
      showToast('error', '生成作品信息失败');
    } finally {
      setIsGeneratingWorkInfo(false);
    }
  };

  const handleUploadCover = async () => {
    if (!api || !projectName) {
      showToast('error', '请先打开项目');
      return;
    }

    try {
      const result = await api.upload_cover_image();
      if (result.success && result.imageUrl) {
        updateWorkInfo({ coverImage: result.imageUrl });
        showToast('success', '封面已上传');
      } else if (result.error && result.error !== 'No file selected') {
        showToast('error', result.error);
      }
    } catch (error) {
      console.error('Failed to upload cover:', error);
      showToast('error', '上传封面失败');
    }
  };

  const handleGenerateCover = async () => {
    if (!api || !projectName) {
      showToast('error', '请先打开项目');
      return;
    }

    setIsGeneratingCover(true);
    try {
      const result = await api.generate_cover_image();
      if (result.success && result.imageUrl) {
        updateWorkInfo({ coverImage: result.imageUrl });
        showToast('success', '封面已生成');
      } else {
        showToast('error', result.error || '生成封面失败');
      }
    } catch (error) {
      console.error('Failed to generate cover:', error);
      showToast('error', '生成封面失败');
    } finally {
      setIsGeneratingCover(false);
    }
  };

  const handleExportCover = async () => {
    if (!api || !projectName) {
      showToast('error', '请先打开项目');
      return;
    }

    try {
      const result = await api.export_cover_image();
      if (result.success) {
        showToast('success', '封面已导出');
      } else if (result.error && result.error !== 'No file selected') {
        showToast('error', result.error);
      }
    } catch (error) {
      console.error('Failed to export cover:', error);
      showToast('error', '导出封面失败');
    }
  };

  const handleSendChat = async () => {
    if (!api || !projectName || !chatInput.trim() || isChatting) return;

    const userMessage: ChatMessage = { role: 'user', content: chatInput.trim() };
    setChatMessages((prev) => [...prev, userMessage]);
    setChatInput('');
    setIsChatting(true);

    try {
      const result = await api.chat_update_work_info(userMessage.content, chatMessages);
      if (result.success) {
        const assistantMessage: ChatMessage = {
          role: 'assistant',
          content: result.reply || '已更新',
        };
        setChatMessages((prev) => [...prev, assistantMessage]);

        if (result.workInfo) {
          updateWorkInfo(result.workInfo);
        }
      } else {
        showToast('error', result.error || '对话失败');
      }
    } catch (error) {
      console.error('Failed to chat:', error);
      showToast('error', '对话失败');
    } finally {
      setIsChatting(false);
    }
  };

  const getCurrentStyleInfo = () => {
    const { style } = projectSettings.creationParams;
    if (style.type === 'custom' && style.customPrompt) {
      return {
        name: style.customPrompt.slice(0, 15) + (style.customPrompt.length > 15 ? '...' : ''),
        imageUrl: style.previewUrl,
      };
    }
    if (style.type === 'preset' && style.presetId !== undefined) {
      const preset = styles.find((s) => s.id === style.presetId);
      return {
        name: preset?.name_cn || '未选择',
        imageUrl: preset ? `${stylesBaseUrl}/${preset.image}` : undefined,
      };
    }
    return { name: '未选择', imageUrl: undefined };
  };

  if (isLoading) {
    return (
      <div className="h-full flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-violet-500 animate-spin" />
      </div>
    );
  }

  if (!projectName) {
    return (
      <div className="h-full flex items-center justify-center">
        <p className="text-slate-500">请先打开项目</p>
      </div>
    );
  }

  return (
    <div className="h-full p-6 overflow-y-auto">
      <div className="max-w-3xl mx-auto space-y-6">
        {/* Work Info Section */}
        <div className="bg-slate-800 rounded-xl p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-medium text-white">作品信息</h2>
            <div className="flex gap-2">
              <button
                onClick={handleGenerateWorkInfo}
                disabled={isGeneratingWorkInfo}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-violet-600 hover:bg-violet-500 disabled:opacity-50 rounded-lg text-xs text-white transition-colors"
              >
                {isGeneratingWorkInfo ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Sparkles className="w-4 h-4" />
                )}
                一键生成
              </button>
              <button
                onClick={() => setAiChatModalOpen(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-700 hover:bg-slate-600 rounded-lg text-xs text-slate-200 transition-colors"
              >
                <MessageSquare className="w-4 h-4" />
                AI优化
              </button>
            </div>
          </div>

          <div className="grid grid-cols-[180px_1fr] gap-6">
            {/* Cover Image */}
            <div>
              <label className="block text-xs text-slate-400 mb-2">作品封面</label>
              <div
                className="aspect-[3/4] bg-slate-700 rounded-lg overflow-hidden flex items-center justify-center cursor-pointer hover:ring-2 hover:ring-violet-500 transition-all relative group"
                onClick={handleUploadCover}
              >
                {projectSettings.workInfo.coverImage ? (
                  <>
                    <img
                      src={projectSettings.workInfo.coverImage}
                      alt="Cover"
                      className="w-full h-full object-cover"
                    />
                    <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                      <Upload className="w-6 h-6 text-white" />
                    </div>
                  </>
                ) : (
                  <div className="text-center text-slate-500">
                    <ImageIcon className="w-8 h-8 mx-auto mb-2" />
                    <span className="text-xs">点击上传</span>
                  </div>
                )}
              </div>
              <div className="flex gap-2 mt-2">
                <button
                  onClick={handleGenerateCover}
                  disabled={isGeneratingCover}
                  className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 bg-slate-700 hover:bg-slate-600 disabled:opacity-50 rounded-lg text-xs text-slate-200 transition-colors"
                >
                  {isGeneratingCover ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Sparkles className="w-4 h-4" />
                  )}
                  生成
                </button>
                <button
                  onClick={handleExportCover}
                  disabled={!projectSettings.workInfo.coverImage}
                  className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 bg-slate-700 hover:bg-slate-600 disabled:opacity-50 rounded-lg text-xs text-slate-200 transition-colors"
                >
                  <Download className="w-4 h-4" />
                  导出
                </button>
              </div>
            </div>

            {/* Title & Description */}
            <div className="space-y-4">
              <div>
                <label className="block text-xs text-slate-400 mb-2">作品名称</label>
                <input
                  type="text"
                  value={projectSettings.workInfo.title}
                  onChange={(e) => updateWorkInfo({ title: e.target.value })}
                  placeholder="输入作品名称"
                  className="w-full px-4 py-3 bg-slate-700 rounded-lg text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-violet-500"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-2">作品介绍</label>
                <textarea
                  value={projectSettings.workInfo.description}
                  onChange={(e) => updateWorkInfo({ description: e.target.value })}
                  placeholder="输入作品介绍..."
                  rows={5}
                  className="w-full px-4 py-3 bg-slate-700 rounded-lg text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-violet-500 resize-none"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Creation Params Section */}
        <div className="bg-slate-800 rounded-xl p-6">
          <h2 className="text-lg font-medium text-white mb-4">创作参数</h2>

          <div className="space-y-4">
            {/* Style */}
            <div className="flex items-center justify-between py-4 border-b border-slate-700">
              <div className="flex items-center gap-3">
                <Palette className="w-5 h-5 text-violet-400" />
                <div>
                  <p className="text-sm text-white">画面风格</p>
                  <p className="text-xs text-slate-500">视频的整体美术风格</p>
                </div>
              </div>
              <button
                onClick={() => setStyleModalOpen(true)}
                className="flex items-center gap-3 px-3 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg transition-colors max-w-[280px]"
              >
                {(() => {
                  const styleInfo = getCurrentStyleInfo();
                  return (
                    <>
                      {styleInfo.imageUrl ? (
                        <div className="w-20 h-14 rounded overflow-hidden bg-slate-600 flex-shrink-0">
                          <img
                            src={styleInfo.imageUrl}
                            alt={styleInfo.name}
                            className="w-full h-full object-cover"
                          />
                        </div>
                      ) : (
                        <div className="w-20 h-14 rounded bg-slate-600 flex items-center justify-center flex-shrink-0">
                          <Palette className="w-6 h-6 text-slate-400" />
                        </div>
                      )}
                      <span className="text-sm text-slate-200 text-left line-clamp-2">{styleInfo.name}</span>
                    </>
                  );
                })()}
              </button>
            </div>

            {/* Language */}
            <div className="flex items-center justify-between py-3 border-b border-slate-700">
              <div className="flex items-center gap-3">
                <Languages className="w-5 h-5 text-emerald-400" />
                <div>
                  <p className="text-sm text-white">配音语种</p>
                  <p className="text-xs text-slate-500">TTS 配音使用的语言</p>
                </div>
              </div>
              <select
                value={projectSettings.creationParams.language}
                onChange={(e) => updateLanguage(e.target.value)}
                className="px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-violet-500 min-w-[120px]"
              >
                {languageOptions.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Aspect Ratio */}
            <div className="flex items-center justify-between py-3">
              <div className="flex items-center gap-3">
                <Monitor className="w-5 h-5 text-blue-400" />
                <div>
                  <p className="text-sm text-white">画面比例</p>
                  <p className="text-xs text-slate-500">视频的横竖屏设置</p>
                </div>
              </div>
              <div className="flex rounded-lg overflow-hidden">
                {aspectRatioOptions.map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => updateAspectRatio(opt.value as '16:9' | '9:16' | '1:1')}
                    className={`px-4 py-2 text-sm transition-colors ${
                      projectSettings.creationParams.aspectRatio === opt.value
                        ? 'bg-violet-600 text-white'
                        : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Style Selector Modal */}
      <StyleSelectorModal
        isOpen={styleModalOpen}
        onClose={() => setStyleModalOpen(false)}
        onSelect={updateStyle}
        currentStyle={projectSettings.creationParams.style}
        styles={styles}
        stylesBaseUrl={stylesBaseUrl}
        api={api || undefined}
      />

      {/* AI Chat Modal */}
      {aiChatModalOpen && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
          <div className="bg-slate-800 rounded-xl w-[600px] max-w-[95vw] max-h-[80vh] flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-700">
              <div className="flex items-center gap-2">
                <MessageSquare className="w-5 h-5 text-emerald-400" />
                <h2 className="text-lg font-semibold text-white">AI 优化作品信息</h2>
              </div>
              <button
                onClick={() => setAiChatModalOpen(false)}
                className="p-2 hover:bg-slate-700 rounded-lg text-slate-400 hover:text-white transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Current Info */}
            <div className="px-6 py-3 bg-slate-700/50 border-b border-slate-700">
              <p className="text-xs text-slate-400 mb-1">当前作品名</p>
              <p className="text-sm text-white">{projectSettings.workInfo.title || '未设置'}</p>
              <p className="text-xs text-slate-400 mt-2 mb-1">当前介绍</p>
              <p className="text-sm text-slate-300 line-clamp-2">
                {projectSettings.workInfo.description || '未设置'}
              </p>
            </div>

            {/* Chat Messages */}
            <div className="flex-1 overflow-y-auto p-6 space-y-3 min-h-[200px]">
              {chatMessages.length === 0 ? (
                <div className="text-center py-8">
                  <p className="text-sm text-slate-500">
                    与 AI 对话来优化作品名和介绍
                  </p>
                  <p className="text-xs text-slate-600 mt-2">
                    例如："作品名能更有诗意一些吗？" 或 "介绍写得更吸引人"
                  </p>
                </div>
              ) : (
                chatMessages.map((msg, i) => (
                  <div
                    key={i}
                    className={`p-3 rounded-lg ${
                      msg.role === 'user'
                        ? 'bg-violet-600/30 text-violet-200 ml-12'
                        : 'bg-slate-700 text-slate-300 mr-12'
                    }`}
                  >
                    <p className="text-sm">{msg.content}</p>
                  </div>
                ))
              )}
              <div ref={chatEndRef} />
            </div>

            {/* Input */}
            <div className="px-6 py-4 border-t border-slate-700">
              <div className="flex gap-3">
                <input
                  type="text"
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && handleSendChat()}
                  placeholder="输入你的要求..."
                  className="flex-1 px-4 py-3 bg-slate-700 rounded-lg text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
                <button
                  onClick={handleSendChat}
                  disabled={isChatting || !chatInput.trim()}
                  className="px-4 py-3 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 rounded-lg text-white transition-colors"
                >
                  {isChatting ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                  ) : (
                    <Send className="w-5 h-5" />
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default ProjectSettingsPage;
