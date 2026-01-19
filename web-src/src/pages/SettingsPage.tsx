/**
 * SettingsPage - Application settings page
 */
import { useState, useEffect, useCallback } from 'react';
import { FolderOpen, Loader2, Mic, Image, Video } from 'lucide-react';
import type { AppSettings } from '../types';

interface SettingsPageProps {
  // No props needed anymore
}

type TabType = 'tts' | 'tti' | 'ttv';

const defaultSettings: AppSettings = {
  workDir: '',
  jianyingDraftDir: '',
  tts: { apiUrl: '', model: '', apiKey: '', concurrency: 1 },
  tti: { apiUrl: '', model: '', apiKey: '', concurrency: 1 },
  ttv: { apiUrl: '', model: '', apiKey: '', concurrency: 1 },
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
        setSettings(result.settings);
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

  const updateSetting = (category: 'tts' | 'tti' | 'ttv', field: string, value: string | number) => {
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
        model: 'dall-e-3',
      },
      ttv: {
        apiUrl: 'https://api.example.com/v1/video/generations',
        model: 'video-1',
      },
    };

    return (
      <div className="space-y-4">
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
        <div>
          <label className="block text-sm text-slate-400 mb-2">模型名称</label>
          <input
            type="text"
            value={config.model}
            onChange={(e) => updateSetting(activeTab, 'model', e.target.value)}
            placeholder={placeholders[activeTab].model}
            className="w-full px-3 py-2 bg-slate-700 rounded-lg text-sm text-slate-300 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-violet-500"
          />
        </div>
        <div>
          <label className="block text-sm text-slate-400 mb-2">API 密钥</label>
          <input
            type="password"
            value={config.apiKey}
            onChange={(e) => updateSetting(activeTab, 'apiKey', e.target.value)}
            placeholder="sk-..."
            className="w-full px-3 py-2 bg-slate-700 rounded-lg text-sm text-slate-300 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-violet-500"
          />
        </div>
        <div>
          <label className="block text-sm text-slate-400 mb-2">并发数</label>
          <input
            type="number"
            min="1"
            max="10"
            value={config.concurrency}
            onChange={(e) => updateSetting(activeTab, 'concurrency', parseInt(e.target.value) || 1)}
            className="w-32 px-3 py-2 bg-slate-700 rounded-lg text-sm text-slate-300 focus:outline-none focus:ring-1 focus:ring-violet-500"
          />
        </div>
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
            <p>AI 镜头创作工坊</p>
            <p>版本: 1.0.0</p>
            <p className="text-slate-500 mt-2">配置文件位置: ~/.hetang/settings.json</p>
          </div>
        </div>
      </div>
    </div>
  );
}
