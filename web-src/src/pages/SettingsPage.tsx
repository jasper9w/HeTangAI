/**
 * SettingsPage - Application settings page
 */
import { useState, useEffect, useCallback } from 'react';
import { FolderOpen, Loader2, Mic, Image, Video, Clapperboard } from 'lucide-react';
import type { AppSettings } from '../types';

interface SettingsPageProps {
  // No props needed anymore
}

type TabType = 'tts' | 'tti' | 'ttv' | 'shotBuilder';

const defaultSettings: AppSettings = {
  workDir: '',
  jianyingDraftDir: '',
  referenceAudioDir: '',
  tts: { apiUrl: 'https://9u7acouw9j7q8f5o-6006.container.x-gpu.com/tts_url', model: 'indextts2', apiKey: '', concurrency: 1 },
  tti: { provider: 'openai', apiUrl: '', apiKey: '', characterModel: '', sceneModel: '', shotModel: '', whiskToken: '', whiskWorkflowId: '', concurrency: 1 },
  ttv: { provider: 'openai', apiUrl: '', apiKey: '', model: '', whiskToken: '', whiskWorkflowId: '', concurrency: 1 },
  shotBuilder: { apiUrl: '', apiKey: '', model: '' },
};

export function SettingsPage({}: SettingsPageProps) {
  const [settings, setSettings] = useState<AppSettings>(defaultSettings);
  const [isLoading, setIsLoading] = useState(true);
  const [saveMessage, setSaveMessage] = useState('');
  const [activeTab, setActiveTab] = useState<TabType>('tts');

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    if (!window.pywebview?.api) return;

    setIsLoading(true);
    try {
      const result = await (window.pywebview.api as any).get_settings();
      if (result.success && result.settings) {
        const legacyTtiModel = (result.settings as { tti?: { model?: string } })?.tti?.model || '';
        const mergedSettings: AppSettings = {
          ...defaultSettings,
          ...result.settings,
          tts: {
            ...defaultSettings.tts,
            ...result.settings.tts,
          },
          tti: {
            ...defaultSettings.tti,
            ...result.settings.tti,
          },
          ttv: {
            ...defaultSettings.ttv,
            ...result.settings.ttv,
          },
          shotBuilder: {
            ...defaultSettings.shotBuilder,
            ...result.settings.shotBuilder,
          },
        };

        if (legacyTtiModel) {
          if (!mergedSettings.tti.characterModel) mergedSettings.tti.characterModel = legacyTtiModel;
          if (!mergedSettings.tti.sceneModel) mergedSettings.tti.sceneModel = legacyTtiModel;
          if (!mergedSettings.tti.shotModel) mergedSettings.tti.shotModel = legacyTtiModel;
        }

        // Default provider to 'openai' if not set
        if (!mergedSettings.tti.provider) {
          mergedSettings.tti.provider = 'openai';
        }
        if (!mergedSettings.ttv.provider) {
          mergedSettings.ttv.provider = 'openai';
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
    if (isLoading) return; // Don't auto-save during initial load

    const timeoutId = setTimeout(() => {
      autoSave(settings);
    }, 500); // Debounce auto-save by 500ms

    return () => clearTimeout(timeoutId);
  }, [settings, isLoading, autoSave]);

  const handleSelectWorkDir = async () => {
    if (!window.pywebview?.api) return;

    try {
      const result = await (window.pywebview.api as any).select_work_dir();
      if (result.success && result.path) {
        setSettings({
          ...settings,
          workDir: result.path,
        });
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
        setSettings({
          ...settings,
          jianyingDraftDir: result.path,
        });
      }
    } catch (error) {
      console.error('Failed to select JianYing draft directory:', error);
    }
  };

  const handleSelectReferenceAudioDir = async () => {
    if (!window.pywebview?.api) return;

    try {
      const result = await (window.pywebview.api as any).select_reference_audio_dir();
      if (result.success && result.path) {
        setSettings({
          ...settings,
          referenceAudioDir: result.path,
        });
      }
    } catch (error) {
      console.error('Failed to select reference audio directory:', error);
    }
  };

  const updateSetting = (category: 'tts' | 'tti' | 'ttv' | 'shotBuilder', field: string, value: string | number) => {
    setSettings({
      ...settings,
      [category]: {
        ...settings[category],
        [field]: value,
      },
    });
  };

  const tabs = [
    { id: 'tts' as TabType, label: '配音接口', icon: Mic, color: 'orange' },
    { id: 'tti' as TabType, label: '生图接口', icon: Image, color: 'violet' },
    { id: 'ttv' as TabType, label: '生视频接口', icon: Video, color: 'emerald' },
    { id: 'shotBuilder' as TabType, label: '分镜接口', icon: Clapperboard, color: 'blue' },
  ];

  const renderTabContent = () => {
    const config = settings[activeTab];
    const placeholders = {
      tts: {
        apiUrl: 'https://api.example.com/v1/audio/speech',
        model: 'tts-1',
      },
      tti: {
        apiUrl: 'https://api.example.com/v1/images/generations',
        characterModel: 'gemini-3.0-pro-image-landscape',
        sceneModel: 'gemini-2.5-flash-image-landscape',
        shotModel: 'gemini-2.5-flash-image-landscape',
      },
      ttv: {
        apiUrl: 'https://api.example.com/v1/video/generations',
        model: 'video-1',
      },
      shotBuilder: {
        apiUrl: 'https://api.example.com/v1/chat/completions',
        model: 'gemini-3-pro-preview',
      },
    };

    return (
      <div className="space-y-4">
        {activeTab === 'tts' && (
          <div className="bg-blue-600/10 border border-blue-600/20 rounded-lg p-4">
            <h4 className="font-medium text-blue-300 mb-2 flex items-center gap-2">
              <Mic className="w-4 h-4" />
              配音接口接入说明
            </h4>
            <p className="text-sm text-slate-300 mb-2">
              本项目已为您配置好配音接口，您也可以根据需要自行更换。
            </p>
            <p className="text-sm text-slate-300">
              如需获取更多接口信息，请访问：
              <a
                href="https://www.xiangongyun.com/image/detail/2b41d3b1-2674-420b-864e-d9eb44adf636"
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-400 hover:text-blue-300 underline ml-1"
              >
                https://www.xiangongyun.com/image/detail/2b41d3b1-2674-420b-864e-d9eb44adf636
              </a>
            </p>
          </div>
        )}
        <div>
          <label className="block text-sm text-slate-400 mb-2">API 地址</label>
          <input
            type="text"
            value={config.apiUrl}
            onChange={(e) => updateSetting(activeTab, 'apiUrl', e.target.value)}
            placeholder={placeholders[activeTab].apiUrl}
            className="w-full px-3 py-2 bg-slate-700 rounded-lg text-sm text-slate-300 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-violet-500"
          />
        </div>
        {activeTab === 'tti' ? (
          <div className="space-y-4">
            {/* Provider Selection */}
            <div>
              <label className="block text-sm text-slate-400 mb-2">接口类型</label>
              <div className="flex gap-4">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="tti-provider"
                    checked={settings.tti.provider === 'openai'}
                    onChange={() => updateSetting('tti', 'provider', 'openai')}
                    className="w-4 h-4 text-violet-600 bg-slate-700 border-slate-500 focus:ring-violet-500"
                  />
                  <span className="text-sm text-slate-300">OpenAI 兼容</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="tti-provider"
                    checked={settings.tti.provider === 'whisk'}
                    onChange={() => updateSetting('tti', 'provider', 'whisk')}
                    className="w-4 h-4 text-violet-600 bg-slate-700 border-slate-500 focus:ring-violet-500"
                  />
                  <span className="text-sm text-slate-300">Whisk</span>
                </label>
              </div>
            </div>

            {settings.tti.provider === 'openai' ? (
              <>
                {/* OpenAI Mode Settings */}
                <div>
                  <label className="block text-sm text-slate-400 mb-2">API 地址</label>
                  <input
                    type="text"
                    value={settings.tti.apiUrl}
                    onChange={(e) => updateSetting('tti', 'apiUrl', e.target.value)}
                    placeholder={placeholders.tti.apiUrl}
                    className="w-full px-3 py-2 bg-slate-700 rounded-lg text-sm text-slate-300 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-violet-500"
                  />
                </div>
                <div>
                  <label className="block text-sm text-slate-400 mb-2">API 密钥</label>
                  <input
                    type="password"
                    value={settings.tti.apiKey}
                    onChange={(e) => updateSetting('tti', 'apiKey', e.target.value)}
                    placeholder="sk-..."
                    className="w-full px-3 py-2 bg-slate-700 rounded-lg text-sm text-slate-300 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-violet-500"
                  />
                </div>
                <div className="space-y-3">
                  <div>
                    <label className="block text-sm text-slate-400 mb-2">角色图片模型</label>
                    <input
                      type="text"
                      value={settings.tti.characterModel}
                      onChange={(e) => updateSetting('tti', 'characterModel', e.target.value)}
                      placeholder={placeholders.tti.characterModel}
                      className="w-full px-3 py-2 bg-slate-700 rounded-lg text-sm text-slate-300 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-violet-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm text-slate-400 mb-2">场景图片模型</label>
                    <input
                      type="text"
                      value={settings.tti.sceneModel}
                      onChange={(e) => updateSetting('tti', 'sceneModel', e.target.value)}
                      placeholder={placeholders.tti.sceneModel}
                      className="w-full px-3 py-2 bg-slate-700 rounded-lg text-sm text-slate-300 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-violet-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm text-slate-400 mb-2">镜头图片模型</label>
                    <input
                      type="text"
                      value={settings.tti.shotModel}
                      onChange={(e) => updateSetting('tti', 'shotModel', e.target.value)}
                      placeholder={placeholders.tti.shotModel}
                      className="w-full px-3 py-2 bg-slate-700 rounded-lg text-sm text-slate-300 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-violet-500"
                    />
                  </div>
                </div>
              </>
            ) : (
              <>
                {/* Whisk Mode Settings */}
                <div className="bg-violet-600/10 border border-violet-600/20 rounded-lg p-4">
                  <h4 className="font-medium text-violet-300 mb-2 flex items-center gap-2">
                    <Image className="w-4 h-4" />
                    Whisk 接口说明
                  </h4>
                  <p className="text-sm text-slate-300">
                    Whisk 是 Google Labs 的图片生成接口，支持角色/场景/风格组合生成。
                  </p>
                </div>
                <div>
                  <label className="block text-sm text-slate-400 mb-2">Token</label>
                  <input
                    type="password"
                    value={settings.tti.whiskToken}
                    onChange={(e) => updateSetting('tti', 'whiskToken', e.target.value)}
                    placeholder="ya29.xxx..."
                    className="w-full px-3 py-2 bg-slate-700 rounded-lg text-sm text-slate-300 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-violet-500"
                  />
                </div>
                <div>
                  <label className="block text-sm text-slate-400 mb-2">Workflow ID</label>
                  <input
                    type="text"
                    value={settings.tti.whiskWorkflowId}
                    onChange={(e) => updateSetting('tti', 'whiskWorkflowId', e.target.value)}
                    placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                    className="w-full px-3 py-2 bg-slate-700 rounded-lg text-sm text-slate-300 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-violet-500"
                  />
                </div>
              </>
            )}

            <div>
              <label className="block text-sm text-slate-400 mb-2">并发数</label>
              <input
                type="number"
                min="1"
                max="10"
                value={settings.tti.concurrency}
                onChange={(e) => updateSetting('tti', 'concurrency', parseInt(e.target.value) || 1)}
                className="w-32 px-3 py-2 bg-slate-700 rounded-lg text-sm text-slate-300 focus:outline-none focus:ring-1 focus:ring-violet-500"
              />
            </div>
          </div>
        ) : activeTab === 'ttv' ? (
          <div className="space-y-4">
            {/* Provider Selection for TTV */}
            <div>
              <label className="block text-sm text-slate-400 mb-2">接口类型</label>
              <div className="flex gap-4">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="ttv-provider"
                    checked={settings.ttv.provider === 'openai'}
                    onChange={() => updateSetting('ttv', 'provider', 'openai')}
                    className="w-4 h-4 text-emerald-600 bg-slate-700 border-slate-500 focus:ring-emerald-500"
                  />
                  <span className="text-sm text-slate-300">OpenAI 兼容</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="ttv-provider"
                    checked={settings.ttv.provider === 'whisk'}
                    onChange={() => updateSetting('ttv', 'provider', 'whisk')}
                    className="w-4 h-4 text-emerald-600 bg-slate-700 border-slate-500 focus:ring-emerald-500"
                  />
                  <span className="text-sm text-slate-300">Whisk</span>
                </label>
              </div>
            </div>

            {settings.ttv.provider === 'openai' ? (
              <>
                {/* OpenAI Mode Settings */}
                <div>
                  <label className="block text-sm text-slate-400 mb-2">API 地址</label>
                  <input
                    type="text"
                    value={settings.ttv.apiUrl}
                    onChange={(e) => updateSetting('ttv', 'apiUrl', e.target.value)}
                    placeholder={placeholders.ttv.apiUrl}
                    className="w-full px-3 py-2 bg-slate-700 rounded-lg text-sm text-slate-300 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                  />
                </div>
                <div>
                  <label className="block text-sm text-slate-400 mb-2">API 密钥</label>
                  <input
                    type="password"
                    value={settings.ttv.apiKey}
                    onChange={(e) => updateSetting('ttv', 'apiKey', e.target.value)}
                    placeholder="sk-..."
                    className="w-full px-3 py-2 bg-slate-700 rounded-lg text-sm text-slate-300 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                  />
                </div>
                <div>
                  <label className="block text-sm text-slate-400 mb-2">模型名称</label>
                  <input
                    type="text"
                    value={settings.ttv.model}
                    onChange={(e) => updateSetting('ttv', 'model', e.target.value)}
                    placeholder={placeholders.ttv.model}
                    className="w-full px-3 py-2 bg-slate-700 rounded-lg text-sm text-slate-300 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                  />
                </div>
              </>
            ) : (
              <>
                {/* Whisk Mode Settings */}
                <div className="bg-emerald-600/10 border border-emerald-600/20 rounded-lg p-4">
                  <h4 className="font-medium text-emerald-300 mb-2 flex items-center gap-2">
                    <Video className="w-4 h-4" />
                    Whisk 视频接口说明
                  </h4>
                  <p className="text-sm text-slate-300">
                    Whisk 视频生成基于图片生成视频，支持 VEO 模型。
                  </p>
                </div>
                <div>
                  <label className="block text-sm text-slate-400 mb-2">Token</label>
                  <input
                    type="password"
                    value={settings.ttv.whiskToken}
                    onChange={(e) => updateSetting('ttv', 'whiskToken', e.target.value)}
                    placeholder="ya29.xxx..."
                    className="w-full px-3 py-2 bg-slate-700 rounded-lg text-sm text-slate-300 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                  />
                </div>
                <div>
                  <label className="block text-sm text-slate-400 mb-2">Workflow ID</label>
                  <input
                    type="text"
                    value={settings.ttv.whiskWorkflowId}
                    onChange={(e) => updateSetting('ttv', 'whiskWorkflowId', e.target.value)}
                    placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                    className="w-full px-3 py-2 bg-slate-700 rounded-lg text-sm text-slate-300 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                  />
                </div>
              </>
            )}

            <div>
              <label className="block text-sm text-slate-400 mb-2">并发数</label>
              <input
                type="number"
                min="1"
                max="10"
                value={settings.ttv.concurrency}
                onChange={(e) => updateSetting('ttv', 'concurrency', parseInt(e.target.value) || 1)}
                className="w-32 px-3 py-2 bg-slate-700 rounded-lg text-sm text-slate-300 focus:outline-none focus:ring-1 focus:ring-emerald-500"
              />
            </div>
          </div>
        ) : activeTab === 'shotBuilder' ? (
          <div className="space-y-4">
            <div className="bg-blue-600/10 border border-blue-600/20 rounded-lg p-4">
              <h4 className="font-medium text-blue-300 mb-2 flex items-center gap-2">
                <Clapperboard className="w-4 h-4" />
                分镜接口说明
              </h4>
              <p className="text-sm text-slate-300">
                分镜生成使用该模型配置进行角色/场景/分镜结构化输出。
              </p>
            </div>
            <div>
              <label className="block text-sm text-slate-400 mb-2">API 密钥</label>
              <input
                type="password"
                value={settings.shotBuilder.apiKey}
                onChange={(e) => updateSetting('shotBuilder', 'apiKey', e.target.value)}
                placeholder="sk-..."
                className="w-full px-3 py-2 bg-slate-700 rounded-lg text-sm text-slate-300 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm text-slate-400 mb-2">模型名称</label>
              <input
                type="text"
                value={settings.shotBuilder.model}
                onChange={(e) => updateSetting('shotBuilder', 'model', e.target.value)}
                placeholder={placeholders.shotBuilder.model}
                className="w-full px-3 py-2 bg-slate-700 rounded-lg text-sm text-slate-300 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
          </div>
        ) : (
          <>
            {/* TTS fields */}
            <div>
              <label className="block text-sm text-slate-400 mb-2">模型名称</label>
              <input
                type="text"
                value={settings.tts.model}
                onChange={(e) => updateSetting('tts', 'model', e.target.value)}
                placeholder={placeholders.tts.model}
                className="w-full px-3 py-2 bg-slate-700 rounded-lg text-sm text-slate-300 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-orange-500"
              />
            </div>
            <div>
              <label className="block text-sm text-slate-400 mb-2">API 密钥</label>
              <input
                type="password"
                value={settings.tts.apiKey}
                onChange={(e) => updateSetting('tts', 'apiKey', e.target.value)}
                placeholder="sk-..."
                className="w-full px-3 py-2 bg-slate-700 rounded-lg text-sm text-slate-300 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-orange-500"
              />
            </div>
            <div>
              <label className="block text-sm text-slate-400 mb-2">并发数</label>
              <input
                type="number"
                min="1"
                max="10"
                value={settings.tts.concurrency}
                onChange={(e) => updateSetting('tts', 'concurrency', parseInt(e.target.value) || 1)}
                className="w-32 px-3 py-2 bg-slate-700 rounded-lg text-sm text-slate-300 focus:outline-none focus:ring-1 focus:ring-orange-500"
              />
            </div>
          </>
        )}
      </div>
    );
  };

  if (isLoading) {
    return (
      <div className="h-full flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-violet-500 animate-spin" />
      </div>
    );
  }

  return (
    <div className="h-full p-6 overflow-y-auto">
      {saveMessage && (
        <div className={`mb-4 px-4 py-2 rounded-lg text-sm ${
          saveMessage.includes('失败')
            ? 'bg-red-600/20 text-red-400'
            : 'bg-emerald-600/20 text-emerald-400'
        }`}>
          {saveMessage}
        </div>
      )}

      <div className="space-y-6 max-w-4xl">
        {/* Reference Audio Directory */}
        <div className="bg-slate-800 rounded-lg p-4">
          <h3 className="text-base font-medium text-slate-100 mb-3">参考音频目录</h3>
          <p className="text-xs text-slate-500 mb-2">设置角色选择参考音频时使用的目录</p>
          <div className="flex gap-2">
            <input
              type="text"
              value={settings.referenceAudioDir}
              readOnly
              placeholder="请选择参考音频目录..."
              className="flex-1 px-3 py-2 bg-slate-700 rounded-lg text-sm text-slate-300 placeholder-slate-500"
            />
            <button
              onClick={handleSelectReferenceAudioDir}
              className="flex items-center gap-2 px-3 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg text-sm text-slate-200 transition-colors"
            >
              <FolderOpen className="w-4 h-4" />
              选择
            </button>
          </div>
        </div>

        {/* JianYing Draft Directory */}
        <div className="bg-slate-800 rounded-lg p-4">
          <h3 className="text-base font-medium text-slate-100 mb-3">剪映草稿目录</h3>
          <div className="flex gap-2">
            <input
              type="text"
              value={settings.jianyingDraftDir}
              readOnly
              placeholder="~/Movies/JianyingPro Drafts"
              className="flex-1 px-3 py-2 bg-slate-700 rounded-lg text-sm text-slate-300 placeholder-slate-500"
            />
            <button
              onClick={handleSelectJianyingDraftDir}
              className="flex items-center gap-2 px-3 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg text-sm text-slate-200 transition-colors"
            >
              <FolderOpen className="w-4 h-4" />
              选择
            </button>
          </div>
        </div>

        {/* API Settings Tabs */}
        <div className="bg-slate-800 rounded-lg p-6">
          <h3 className="text-lg font-medium text-slate-100 mb-4">API 接口配置</h3>

          {/* Tab Navigation */}
          <div className="flex space-x-1 mb-6 bg-slate-700 p-1 rounded-lg">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              let activeClass = '';
              if (isActive) {
                switch (tab.color) {
                  case 'orange':
                    activeClass = 'bg-orange-600 text-white';
                    break;
                  case 'violet':
                    activeClass = 'bg-violet-600 text-white';
                    break;
                  case 'emerald':
                    activeClass = 'bg-emerald-600 text-white';
                    break;
                  case 'blue':
                    activeClass = 'bg-blue-600 text-white';
                    break;
                }
              }
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                    isActive
                      ? activeClass
                      : 'text-slate-400 hover:text-slate-200 hover:bg-slate-600'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  {tab.label}
                </button>
              );
            })}
          </div>

          {/* Tab Content */}
          {renderTabContent()}
        </div>

        {/* Work Directory */}
        <div className="bg-slate-800 rounded-lg p-4">
          <h3 className="text-base font-medium text-slate-100 mb-3">工作目录</h3>
          <div className="flex gap-2">
            <input
              type="text"
              value={settings.workDir}
              readOnly
              placeholder="~/Desktop/荷塘AI"
              className="flex-1 px-3 py-2 bg-slate-700 rounded-lg text-sm text-slate-300 placeholder-slate-500"
            />
            <button
              onClick={handleSelectWorkDir}
              className="flex items-center gap-2 px-3 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg text-sm text-slate-200 transition-colors"
            >
              <FolderOpen className="w-4 h-4" />
              选择
            </button>
          </div>
        </div>

        <div className="bg-slate-800 rounded-lg p-4">
          <h3 className="text-sm font-medium text-slate-200 mb-2">关于</h3>
          <div className="space-y-1 text-xs text-slate-400">
            <p>荷塘AI - 视频创作工坊</p>
            {/*<p>版本: 1.0.0</p>*/}
            <p className="text-slate-500 mt-2">配置文件位置: ~/.hetangai/settings.json</p>
          </div>
        </div>
      </div>
    </div>
  );
}
