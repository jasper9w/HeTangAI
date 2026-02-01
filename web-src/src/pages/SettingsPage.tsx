/**
 * SettingsPage - Application settings page
 */
import { useState, useEffect, useCallback } from 'react';
import { FolderOpen, Loader2, Mic, Image, Video, MessageSquare, Terminal, ChevronDown, ChevronRight } from 'lucide-react';
import type { AppSettings, ApiMode } from '../types';

type TabType = 'tts' | 'tti' | 'ttv' | 'shotBuilder';

const defaultSettings: AppSettings = {
  apiMode: 'hosted',
  hostedService: {
    baseUrl: '',
    token: '',
  },
  customApi: {
    tts: { apiUrl: '', model: 'tts-1', apiKey: '', concurrency: 1 },
    tti: { provider: 'openai', apiUrl: '', apiKey: '', characterModel: '', sceneModel: '', shotModel: '', whiskToken: '', whiskWorkflowId: '', whiskCookie: '', concurrency: 1 },
    ttv: { provider: 'openai', apiUrl: '', apiKey: '', model: '', whiskToken: '', whiskWorkflowId: '', concurrency: 1 },
    shotBuilder: { apiUrl: '', apiKey: '', model: '' },
  },
  workDir: '',
  jianyingDraftDir: '',
  referenceAudioDir: '',
};

export function SettingsPage() {
  const [settings, setSettings] = useState<AppSettings>(defaultSettings);
  const [isLoading, setIsLoading] = useState(true);
  const [saveMessage, setSaveMessage] = useState('');
  const [activeTab, setActiveTab] = useState<TabType>('shotBuilder');
  const [showAdvanced, setShowAdvanced] = useState(false);

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    if (!window.pywebview?.api) return;

    setIsLoading(true);
    try {
      const result = await (window.pywebview.api as any).get_settings();
      if (result.success && result.settings) {
        const loaded = result.settings as AppSettings;
        
        // Merge with defaults
        const mergedSettings: AppSettings = {
          ...defaultSettings,
          ...loaded,
          hostedService: {
            ...defaultSettings.hostedService,
            ...loaded.hostedService,
          },
          customApi: {
            tts: { ...defaultSettings.customApi.tts, ...loaded.customApi?.tts },
            tti: { ...defaultSettings.customApi.tti, ...loaded.customApi?.tti },
            ttv: { ...defaultSettings.customApi.ttv, ...loaded.customApi?.ttv },
            shotBuilder: { ...defaultSettings.customApi.shotBuilder, ...loaded.customApi?.shotBuilder },
          },
        };

        // Default provider to 'openai' if not set
        if (!mergedSettings.customApi.tti.provider) {
          mergedSettings.customApi.tti.provider = 'openai';
        }
        if (!mergedSettings.customApi.ttv.provider) {
          mergedSettings.customApi.ttv.provider = 'openai';
        }

        // Auto-expand advanced settings if in custom mode
        if (mergedSettings.apiMode === 'custom') {
          setShowAdvanced(true);
        }

        setSettings(mergedSettings);
      }
    } catch (error) {
      console.error('Failed to load settings:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const autoSave = useCallback(async (newSettings: AppSettings) => {
    if (!window.pywebview?.api) return;

    try {
      const result = await (window.pywebview.api as any).save_settings(newSettings);
      if (!result.success) {
        setSaveMessage(`保存失败: ${result.error}`);
        setTimeout(() => setSaveMessage(''), 3000);
      }
    } catch (error) {
      console.error('Failed to auto-save settings:', error);
      setSaveMessage('自动保存失败');
      setTimeout(() => setSaveMessage(''), 3000);
    }
  }, []);

  // Auto-save when settings change
  useEffect(() => {
    if (isLoading) return;

    const timeoutId = setTimeout(() => {
      autoSave(settings);
    }, 500);

    return () => clearTimeout(timeoutId);
  }, [settings, isLoading, autoSave]);

  const handleSelectWorkDir = async () => {
    if (!window.pywebview?.api) return;

    try {
      const result = await (window.pywebview.api as any).select_work_dir();
      if (result.success && result.path) {
        setSettings({ ...settings, workDir: result.path });
      }
    } catch (error) {
      console.error('Failed to select work directory:', error);
    }
  };

  const handleSelectJianyingDraftDir = async () => {
    if (!window.pywebview?.api) return;

    try {
      const result = await (window.pywebview.api as any).select_jianying_draft_dir();
      if (result.success && result.path) {
        setSettings({ ...settings, jianyingDraftDir: result.path });
      }
    } catch (error) {
      console.error('Failed to select JianYing draft directory:', error);
    }
  };

  const handleSelectFfmpegPath = async () => {
    if (!window.pywebview?.api) return;

    try {
      const result = await (window.pywebview.api as any).select_ffmpeg_path();
      if (result.success && result.path) {
        setSettings({ ...settings, ffmpegPath: result.path });
      }
    } catch (error) {
      console.error('Failed to select ffmpeg path:', error);
    }
  };

  const updateApiMode = (mode: ApiMode) => {
    setSettings({ ...settings, apiMode: mode });
    if (mode === 'custom') {
      setShowAdvanced(true);
    }
  };

  const updateHostedToken = (token: string) => {
    setSettings({
      ...settings,
      hostedService: { ...settings.hostedService, token },
    });
  };

  const updateCustomSetting = (category: 'tts' | 'tti' | 'ttv' | 'shotBuilder', field: string, value: string | number) => {
    setSettings({
      ...settings,
      customApi: {
        ...settings.customApi,
        [category]: {
          ...settings.customApi[category],
          [field]: value,
        },
      },
    });
  };

  const tabs = [
    { id: 'shotBuilder' as TabType, label: '对话接口', icon: MessageSquare, color: 'blue' },
    { id: 'tti' as TabType, label: '生图接口', icon: Image, color: 'teal' },
    { id: 'ttv' as TabType, label: '生视频接口', icon: Video, color: 'emerald' },
    { id: 'tts' as TabType, label: '配音接口', icon: Mic, color: 'orange' },
  ];

  const renderCustomTabContent = () => {
    const config = settings.customApi[activeTab];
    const placeholders = {
      tts: { apiUrl: 'https://api.example.com/v1/audio/speech', model: 'tts-1' },
      tti: { apiUrl: 'https://api.example.com/v1/images/generations', characterModel: 'gemini-3.0-pro-image-landscape', sceneModel: 'gemini-2.5-flash-image-landscape', shotModel: 'gemini-2.5-flash-image-landscape' },
      ttv: { apiUrl: 'https://api.example.com/v1/video/generations', model: 'video-1' },
      shotBuilder: { apiUrl: 'https://api.example.com/v1/chat/completions', model: 'gemini-3-pro-preview' },
    };

    return (
      <div className="space-y-4">
        {(activeTab === 'tts' || activeTab === 'shotBuilder') && (
          <div>
            <label className="block text-sm text-slate-400 mb-2">API 地址</label>
            <input
              type="text"
              value={config.apiUrl}
              onChange={(e) => updateCustomSetting(activeTab, 'apiUrl', e.target.value)}
              placeholder={placeholders[activeTab].apiUrl}
              className="w-full px-3 py-2 bg-slate-700 rounded-lg text-sm text-slate-300 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-teal-500"
            />
          </div>
        )}

        {activeTab === 'tti' && (
          <div className="space-y-4">
            <div>
              <label className="block text-sm text-slate-400 mb-2">接口类型</label>
              <div className="flex gap-4">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="radio" name="tti-provider" checked={settings.customApi.tti.provider === 'openai'} onChange={() => updateCustomSetting('tti', 'provider', 'openai')} className="w-4 h-4 text-teal-600 bg-slate-700 border-slate-500" />
                  <span className="text-sm text-slate-300">OpenAI 兼容</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="radio" name="tti-provider" checked={settings.customApi.tti.provider === 'whisk'} onChange={() => updateCustomSetting('tti', 'provider', 'whisk')} className="w-4 h-4 text-teal-600 bg-slate-700 border-slate-500" />
                  <span className="text-sm text-slate-300">Whisk</span>
                </label>
              </div>
            </div>

            {settings.customApi.tti.provider === 'openai' ? (
              <>
                <div>
                  <label className="block text-sm text-slate-400 mb-2">API 地址</label>
                  <input type="text" value={settings.customApi.tti.apiUrl} onChange={(e) => updateCustomSetting('tti', 'apiUrl', e.target.value)} placeholder={placeholders.tti.apiUrl} className="w-full px-3 py-2 bg-slate-700 rounded-lg text-sm text-slate-300 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-teal-500" />
                </div>
                <div>
                  <label className="block text-sm text-slate-400 mb-2">API 密钥</label>
                  <input type="password" value={settings.customApi.tti.apiKey} onChange={(e) => updateCustomSetting('tti', 'apiKey', e.target.value)} placeholder="sk-..." className="w-full px-3 py-2 bg-slate-700 rounded-lg text-sm text-slate-300 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-teal-500" />
                </div>
                <div className="space-y-3">
                  <div>
                    <label className="block text-sm text-slate-400 mb-2">角色图片模型</label>
                    <input type="text" value={settings.customApi.tti.characterModel} onChange={(e) => updateCustomSetting('tti', 'characterModel', e.target.value)} placeholder={placeholders.tti.characterModel} className="w-full px-3 py-2 bg-slate-700 rounded-lg text-sm text-slate-300 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-teal-500" />
                  </div>
                  <div>
                    <label className="block text-sm text-slate-400 mb-2">场景图片模型</label>
                    <input type="text" value={settings.customApi.tti.sceneModel} onChange={(e) => updateCustomSetting('tti', 'sceneModel', e.target.value)} placeholder={placeholders.tti.sceneModel} className="w-full px-3 py-2 bg-slate-700 rounded-lg text-sm text-slate-300 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-teal-500" />
                  </div>
                  <div>
                    <label className="block text-sm text-slate-400 mb-2">镜头图片模型</label>
                    <input type="text" value={settings.customApi.tti.shotModel} onChange={(e) => updateCustomSetting('tti', 'shotModel', e.target.value)} placeholder={placeholders.tti.shotModel} className="w-full px-3 py-2 bg-slate-700 rounded-lg text-sm text-slate-300 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-teal-500" />
                  </div>
                </div>
              </>
            ) : (
              <>
                <div>
                  <label className="block text-sm text-slate-400 mb-2">Token</label>
                  <input type="password" value={settings.customApi.tti.whiskToken} onChange={(e) => updateCustomSetting('tti', 'whiskToken', e.target.value)} placeholder="ya29.xxx..." className="w-full px-3 py-2 bg-slate-700 rounded-lg text-sm text-slate-300 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-teal-500" />
                </div>
                <div>
                  <label className="block text-sm text-slate-400 mb-2">Workflow ID</label>
                  <input type="text" value={settings.customApi.tti.whiskWorkflowId} onChange={(e) => updateCustomSetting('tti', 'whiskWorkflowId', e.target.value)} placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" className="w-full px-3 py-2 bg-slate-700 rounded-lg text-sm text-slate-300 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-teal-500" />
                </div>
                <div>
                  <label className="block text-sm text-slate-400 mb-2">Cookie</label>
                  <textarea value={settings.customApi.tti.whiskCookie || ''} onChange={(e) => updateCustomSetting('tti', 'whiskCookie', e.target.value)} placeholder="从浏览器开发者工具复制 Cookie..." rows={3} className="w-full px-3 py-2 bg-slate-700 rounded-lg text-sm text-slate-300 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-teal-500 resize-none" />
                </div>
              </>
            )}
            <div>
              <label className="block text-sm text-slate-400 mb-2">并发数</label>
              <input type="number" min="1" max="10" value={settings.customApi.tti.concurrency} onChange={(e) => updateCustomSetting('tti', 'concurrency', parseInt(e.target.value) || 1)} className="w-32 px-3 py-2 bg-slate-700 rounded-lg text-sm text-slate-300 focus:outline-none focus:ring-1 focus:ring-teal-500" />
            </div>
          </div>
        )}

        {activeTab === 'ttv' && (
          <div className="space-y-4">
            <div>
              <label className="block text-sm text-slate-400 mb-2">接口类型</label>
              <div className="flex gap-4">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="radio" name="ttv-provider" checked={settings.customApi.ttv.provider === 'openai'} onChange={() => updateCustomSetting('ttv', 'provider', 'openai')} className="w-4 h-4 text-emerald-600 bg-slate-700 border-slate-500" />
                  <span className="text-sm text-slate-300">OpenAI 兼容</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="radio" name="ttv-provider" checked={settings.customApi.ttv.provider === 'whisk'} onChange={() => updateCustomSetting('ttv', 'provider', 'whisk')} className="w-4 h-4 text-emerald-600 bg-slate-700 border-slate-500" />
                  <span className="text-sm text-slate-300">Whisk</span>
                </label>
              </div>
            </div>

            {settings.customApi.ttv.provider === 'openai' ? (
              <>
                <div>
                  <label className="block text-sm text-slate-400 mb-2">API 地址</label>
                  <input type="text" value={settings.customApi.ttv.apiUrl} onChange={(e) => updateCustomSetting('ttv', 'apiUrl', e.target.value)} placeholder={placeholders.ttv.apiUrl} className="w-full px-3 py-2 bg-slate-700 rounded-lg text-sm text-slate-300 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-emerald-500" />
                </div>
                <div>
                  <label className="block text-sm text-slate-400 mb-2">API 密钥</label>
                  <input type="password" value={settings.customApi.ttv.apiKey} onChange={(e) => updateCustomSetting('ttv', 'apiKey', e.target.value)} placeholder="sk-..." className="w-full px-3 py-2 bg-slate-700 rounded-lg text-sm text-slate-300 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-emerald-500" />
                </div>
                <div>
                  <label className="block text-sm text-slate-400 mb-2">模型名称</label>
                  <input type="text" value={settings.customApi.ttv.model} onChange={(e) => updateCustomSetting('ttv', 'model', e.target.value)} placeholder={placeholders.ttv.model} className="w-full px-3 py-2 bg-slate-700 rounded-lg text-sm text-slate-300 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-emerald-500" />
                </div>
              </>
            ) : (
              <>
                <div>
                  <label className="block text-sm text-slate-400 mb-2">Token</label>
                  <input type="password" value={settings.customApi.ttv.whiskToken} onChange={(e) => updateCustomSetting('ttv', 'whiskToken', e.target.value)} placeholder="ya29.xxx..." className="w-full px-3 py-2 bg-slate-700 rounded-lg text-sm text-slate-300 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-emerald-500" />
                </div>
                <div>
                  <label className="block text-sm text-slate-400 mb-2">Workflow ID</label>
                  <input type="text" value={settings.customApi.ttv.whiskWorkflowId} onChange={(e) => updateCustomSetting('ttv', 'whiskWorkflowId', e.target.value)} placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" className="w-full px-3 py-2 bg-slate-700 rounded-lg text-sm text-slate-300 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-emerald-500" />
                </div>
              </>
            )}
            <div>
              <label className="block text-sm text-slate-400 mb-2">并发数</label>
              <input type="number" min="1" max="10" value={settings.customApi.ttv.concurrency} onChange={(e) => updateCustomSetting('ttv', 'concurrency', parseInt(e.target.value) || 1)} className="w-32 px-3 py-2 bg-slate-700 rounded-lg text-sm text-slate-300 focus:outline-none focus:ring-1 focus:ring-emerald-500" />
            </div>
          </div>
        )}

        {activeTab === 'shotBuilder' && (
          <div className="space-y-4">
            <div>
              <label className="block text-sm text-slate-400 mb-2">API 密钥</label>
              <input type="password" value={settings.customApi.shotBuilder.apiKey} onChange={(e) => updateCustomSetting('shotBuilder', 'apiKey', e.target.value)} placeholder="sk-..." className="w-full px-3 py-2 bg-slate-700 rounded-lg text-sm text-slate-300 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-sm text-slate-400 mb-2">模型名称</label>
              <input type="text" value={settings.customApi.shotBuilder.model} onChange={(e) => updateCustomSetting('shotBuilder', 'model', e.target.value)} placeholder={placeholders.shotBuilder.model} className="w-full px-3 py-2 bg-slate-700 rounded-lg text-sm text-slate-300 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-blue-500" />
            </div>
          </div>
        )}

        {activeTab === 'tts' && (
          <div className="space-y-4">
            <div>
              <label className="block text-sm text-slate-400 mb-2">模型名称</label>
              <input type="text" value={settings.customApi.tts.model} onChange={(e) => updateCustomSetting('tts', 'model', e.target.value)} placeholder={placeholders.tts.model} className="w-full px-3 py-2 bg-slate-700 rounded-lg text-sm text-slate-300 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-orange-500" />
            </div>
            <div>
              <label className="block text-sm text-slate-400 mb-2">API 密钥</label>
              <input type="password" value={settings.customApi.tts.apiKey} onChange={(e) => updateCustomSetting('tts', 'apiKey', e.target.value)} placeholder="sk-..." className="w-full px-3 py-2 bg-slate-700 rounded-lg text-sm text-slate-300 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-orange-500" />
            </div>
            <div>
              <label className="block text-sm text-slate-400 mb-2">并发数</label>
              <input type="number" min="1" max="10" value={settings.customApi.tts.concurrency} onChange={(e) => updateCustomSetting('tts', 'concurrency', parseInt(e.target.value) || 1)} className="w-32 px-3 py-2 bg-slate-700 rounded-lg text-sm text-slate-300 focus:outline-none focus:ring-1 focus:ring-orange-500" />
            </div>
          </div>
        )}
      </div>
    );
  };

  if (isLoading) {
    return (
      <div className="h-full flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-teal-500 animate-spin" />
      </div>
    );
  }

  return (
    <div className="h-full p-6 overflow-y-auto">
      {saveMessage && (
        <div className={`mb-4 px-4 py-2 rounded-lg text-sm ${saveMessage.includes('失败') ? 'bg-red-600/20 text-red-400' : 'bg-emerald-600/20 text-emerald-400'}`}>
          {saveMessage}
        </div>
      )}

      <div className="space-y-6 max-w-4xl">
        {/* API Service Mode */}
        <div className="bg-slate-800/80 backdrop-blur-sm rounded-lg p-6 border border-slate-700/50 shadow-lg shadow-black/20">
          <h3 className="text-lg font-medium text-slate-100 mb-4">API 服务</h3>
          
          <div className="space-y-4">
            {/* Hosted Mode */}
            <label className="flex items-start gap-3 p-4 bg-slate-700/50 rounded-lg cursor-pointer hover:bg-slate-700/70 transition-colors border border-transparent has-[:checked]:border-teal-500">
              <input
                type="radio"
                name="api-mode"
                checked={settings.apiMode === 'hosted'}
                onChange={() => updateApiMode('hosted')}
                className="w-4 h-4 mt-1 text-teal-600 bg-slate-700 border-slate-500"
              />
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-slate-200">荷塘AI 官方服务</span>
                  <span className="px-2 py-0.5 text-xs bg-teal-600/20 text-teal-400 rounded">推荐</span>
                </div>
                <p className="text-sm text-slate-400 mt-1">使用官方托管服务，无需复杂配置</p>
                {settings.apiMode === 'hosted' && (
                  <div className="mt-3 space-y-3">
                    <div>
                      <label className="block text-sm text-slate-400 mb-2">接入地址</label>
                      <input
                        type="text"
                        value={settings.hostedService.baseUrl}
                        onChange={(e) => setSettings({
                          ...settings,
                          hostedService: { ...settings.hostedService, baseUrl: e.target.value }
                        })}
                        placeholder="请输入接入地址..."
                        className="w-full px-3 py-2 bg-slate-600 rounded-lg text-sm text-slate-300 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-teal-500"
                      />
                    </div>
                    <div>
                      <label className="block text-sm text-slate-400 mb-2">Token</label>
                      <input
                        type="password"
                        value={settings.hostedService.token}
                        onChange={(e) => updateHostedToken(e.target.value)}
                        placeholder="请输入您的 Token..."
                        className="w-full px-3 py-2 bg-slate-600 rounded-lg text-sm text-slate-300 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-teal-500"
                      />
                    </div>
                  </div>
                )}
              </div>
            </label>

            {/* Custom Mode */}
            <label className="flex items-start gap-3 p-4 bg-slate-700/50 rounded-lg cursor-pointer hover:bg-slate-700/70 transition-colors border border-transparent has-[:checked]:border-teal-500">
              <input
                type="radio"
                name="api-mode"
                checked={settings.apiMode === 'custom'}
                onChange={() => updateApiMode('custom')}
                className="w-4 h-4 mt-1 text-teal-600 bg-slate-700 border-slate-500"
              />
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-slate-200">自定义 API</span>
                  <span className="px-2 py-0.5 text-xs bg-slate-600/50 text-slate-400 rounded">高级</span>
                </div>
                <p className="text-sm text-slate-400 mt-1">自行配置各项 API 接口</p>
              </div>
            </label>
          </div>

          {/* Advanced Settings (Custom Mode Detail) */}
          {settings.apiMode === 'custom' && (
            <div className="mt-4">
              <button
                onClick={() => setShowAdvanced(!showAdvanced)}
                className="flex items-center gap-2 text-sm text-slate-400 hover:text-slate-300 transition-colors"
              >
                {showAdvanced ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                {showAdvanced ? '收起高级配置' : '展开高级配置'}
              </button>

              {showAdvanced && (
                <div className="mt-4 pt-4 border-t border-slate-700">
                  {/* Tab Navigation */}
                  <div className="flex space-x-1 mb-6 bg-slate-700 p-1 rounded-lg">
                    {tabs.map((tab) => {
                      const Icon = tab.icon;
                      const isActive = activeTab === tab.id;
                      let activeClass = '';
                      if (isActive) {
                        switch (tab.color) {
                          case 'orange': activeClass = 'bg-orange-600 text-white'; break;
                          case 'teal': activeClass = 'bg-teal-600 text-white'; break;
                          case 'emerald': activeClass = 'bg-emerald-600 text-white'; break;
                          case 'blue': activeClass = 'bg-blue-600 text-white'; break;
                        }
                      }
                      return (
                        <button
                          key={tab.id}
                          onClick={() => setActiveTab(tab.id)}
                          className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${isActive ? activeClass : 'text-slate-400 hover:text-slate-200 hover:bg-slate-600'}`}
                        >
                          <Icon className="w-4 h-4" />
                          {tab.label}
                        </button>
                      );
                    })}
                  </div>

                  {/* Tab Content */}
                  {renderCustomTabContent()}
                </div>
              )}
            </div>
          )}
        </div>

        {/* JianYing Draft Directory */}
        <div className="bg-slate-800/80 backdrop-blur-sm rounded-lg p-4 border border-slate-700/50 shadow-lg shadow-black/20">
          <h3 className="text-base font-medium text-slate-100 mb-3">剪映草稿目录</h3>
          <div className="flex gap-2">
            <input type="text" value={settings.jianyingDraftDir} readOnly placeholder="~/Movies/JianyingPro Drafts" className="flex-1 px-3 py-2 bg-slate-700 rounded-lg text-sm text-slate-300 placeholder-slate-500" />
            <button onClick={handleSelectJianyingDraftDir} className="flex items-center gap-2 px-3 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg text-sm text-slate-200 transition-colors">
              <FolderOpen className="w-4 h-4" />
              选择
            </button>
          </div>
        </div>

        {/* FFmpeg Path */}
        <div className="bg-slate-800/80 backdrop-blur-sm rounded-lg p-4 border border-slate-700/50 shadow-lg shadow-black/20">
          <h3 className="text-base font-medium text-slate-100 mb-1">FFmpeg 路径</h3>
          <p className="text-xs text-slate-400 mb-3">用于导出成片功能，留空则使用系统默认路径</p>
          <div className="flex gap-2">
            <input type="text" value={settings.ffmpegPath || ''} readOnly placeholder="留空使用系统默认 (ffmpeg)" className="flex-1 px-3 py-2 bg-slate-700 rounded-lg text-sm text-slate-300 placeholder-slate-500" />
            <button onClick={handleSelectFfmpegPath} className="flex items-center gap-2 px-3 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg text-sm text-slate-200 transition-colors">
              <Terminal className="w-4 h-4" />
              选择
            </button>
          </div>
        </div>

        {/* Work Directory */}
        <div className="bg-slate-800/80 backdrop-blur-sm rounded-lg p-4 border border-slate-700/50 shadow-lg shadow-black/20">
          <h3 className="text-base font-medium text-slate-100 mb-3">工作目录</h3>
          <div className="flex gap-2">
            <input type="text" value={settings.workDir} readOnly placeholder="~/Desktop/荷塘AI" className="flex-1 px-3 py-2 bg-slate-700 rounded-lg text-sm text-slate-300 placeholder-slate-500" />
            <button onClick={handleSelectWorkDir} className="flex items-center gap-2 px-3 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg text-sm text-slate-200 transition-colors">
              <FolderOpen className="w-4 h-4" />
              选择
            </button>
          </div>
        </div>

        <div className="bg-slate-800/80 backdrop-blur-sm rounded-lg p-4 border border-slate-700/50 shadow-lg shadow-black/20">
          <h3 className="text-sm font-medium text-slate-200 mb-2">关于</h3>
          <div className="space-y-1 text-xs text-slate-400">
            <p>荷塘AI - 视频创作工坊</p>
            <p className="text-slate-500 mt-2">配置文件位置: ~/.hetangai/settings.json</p>
          </div>
        </div>
      </div>
    </div>
  );
}
