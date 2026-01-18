/**
 * SettingsPage - Application settings page
 */
import { useState, useEffect } from 'react';
import { FolderOpen, Save, Loader2 } from 'lucide-react';
import type { AppSettings } from '../types';

interface SettingsPageProps {
  onOpenOutputDir: () => void;
}

const defaultSettings: AppSettings = {
  workDir: '',
  tts: { apiUrl: '', model: '', apiKey: '', concurrency: 1 },
  tti: { apiUrl: '', model: '', apiKey: '', concurrency: 1 },
  ttv: { apiUrl: '', model: '', apiKey: '', concurrency: 1 },
};

export function SettingsPage({ onOpenOutputDir }: SettingsPageProps) {
  const [settings, setSettings] = useState<AppSettings>(defaultSettings);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState('');

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

  const handleSave = async () => {
    if (!window.pywebview?.api) return;

    setIsSaving(true);
    setSaveMessage('');
    try {
      const result = await (window.pywebview.api as any).save_settings(settings);
      if (result.success) {
        setSaveMessage('设置已保存');
        setTimeout(() => setSaveMessage(''), 3000);
      } else {
        setSaveMessage(`保存失败: ${result.error}`);
      }
    } catch (error) {
      console.error('Failed to save settings:', error);
      setSaveMessage('保存失败');
    } finally {
      setIsSaving(false);
    }
  };

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

  const updateSetting = (category: 'tts' | 'tti' | 'ttv', field: string, value: string | number) => {
    setSettings({
      ...settings,
      [category]: {
        ...settings[category],
        [field]: value,
      },
    });
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
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-semibold text-slate-100">设置</h2>
        <button
          onClick={handleSave}
          disabled={isSaving}
          className="flex items-center gap-2 px-4 py-2 bg-violet-600 hover:bg-violet-500 disabled:opacity-50 rounded-lg text-sm text-white transition-colors"
        >
          {isSaving ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              保存中...
            </>
          ) : (
            <>
              <Save className="w-4 h-4" />
              保存设置
            </>
          )}
        </button>
      </div>

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
        {/* Work Directory */}
        <div className="bg-slate-800 rounded-lg p-6">
          <h3 className="text-lg font-medium text-slate-100 mb-4">工作目录</h3>
          <p className="text-sm text-slate-400 mb-4">
            所有项目文件将保存在此目录下，每个项目一个子目录
          </p>
          <div className="space-y-4">
            <div>
              <label className="block text-sm text-slate-400 mb-2">目录路径</label>
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
          </div>
        </div>

        {/* TTS Settings */}
        <div className="bg-slate-800 rounded-lg p-6">
          <h3 className="text-lg font-medium text-slate-100 mb-4">配音接口 (TTS)</h3>
          <div className="space-y-4">
            <div>
              <label className="block text-sm text-slate-400 mb-2">API 地址</label>
              <input
                type="text"
                value={settings.tts.apiUrl}
                onChange={(e) => updateSetting('tts', 'apiUrl', e.target.value)}
                placeholder="https://api.example.com/v1/audio/speech"
                className="w-full px-3 py-2 bg-slate-700 rounded-lg text-sm text-slate-300 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-violet-500"
              />
            </div>
            <div>
              <label className="block text-sm text-slate-400 mb-2">模型名称</label>
              <input
                type="text"
                value={settings.tts.model}
                onChange={(e) => updateSetting('tts', 'model', e.target.value)}
                placeholder="tts-1"
                className="w-full px-3 py-2 bg-slate-700 rounded-lg text-sm text-slate-300 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-violet-500"
              />
            </div>
            <div>
              <label className="block text-sm text-slate-400 mb-2">API 密钥</label>
              <input
                type="password"
                value={settings.tts.apiKey}
                onChange={(e) => updateSetting('tts', 'apiKey', e.target.value)}
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
                value={settings.tts.concurrency}
                onChange={(e) => updateSetting('tts', 'concurrency', parseInt(e.target.value) || 1)}
                className="w-32 px-3 py-2 bg-slate-700 rounded-lg text-sm text-slate-300 focus:outline-none focus:ring-1 focus:ring-violet-500"
              />
            </div>
          </div>
        </div>

        {/* TTI Settings */}
        <div className="bg-slate-800 rounded-lg p-6">
          <h3 className="text-lg font-medium text-slate-100 mb-4">生图接口 (TTI)</h3>
          <div className="space-y-4">
            <div>
              <label className="block text-sm text-slate-400 mb-2">API 地址</label>
              <input
                type="text"
                value={settings.tti.apiUrl}
                onChange={(e) => updateSetting('tti', 'apiUrl', e.target.value)}
                placeholder="https://api.example.com/v1/images/generations"
                className="w-full px-3 py-2 bg-slate-700 rounded-lg text-sm text-slate-300 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-violet-500"
              />
            </div>
            <div>
              <label className="block text-sm text-slate-400 mb-2">模型名称</label>
              <input
                type="text"
                value={settings.tti.model}
                onChange={(e) => updateSetting('tti', 'model', e.target.value)}
                placeholder="dall-e-3"
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
        </div>

        {/* TTV Settings */}
        <div className="bg-slate-800 rounded-lg p-6">
          <h3 className="text-lg font-medium text-slate-100 mb-4">生视频接口 (TTV)</h3>
          <div className="space-y-4">
            <div>
              <label className="block text-sm text-slate-400 mb-2">API 地址</label>
              <input
                type="text"
                value={settings.ttv.apiUrl}
                onChange={(e) => updateSetting('ttv', 'apiUrl', e.target.value)}
                placeholder="https://api.example.com/v1/video/generations"
                className="w-full px-3 py-2 bg-slate-700 rounded-lg text-sm text-slate-300 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-violet-500"
              />
            </div>
            <div>
              <label className="block text-sm text-slate-400 mb-2">模型名称</label>
              <input
                type="text"
                value={settings.ttv.model}
                onChange={(e) => updateSetting('ttv', 'model', e.target.value)}
                placeholder="video-1"
                className="w-full px-3 py-2 bg-slate-700 rounded-lg text-sm text-slate-300 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-violet-500"
              />
            </div>
            <div>
              <label className="block text-sm text-slate-400 mb-2">API 密钥</label>
              <input
                type="password"
                value={settings.ttv.apiKey}
                onChange={(e) => updateSetting('ttv', 'apiKey', e.target.value)}
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
                value={settings.ttv.concurrency}
                onChange={(e) => updateSetting('ttv', 'concurrency', parseInt(e.target.value) || 1)}
                className="w-32 px-3 py-2 bg-slate-700 rounded-lg text-sm text-slate-300 focus:outline-none focus:ring-1 focus:ring-violet-500"
              />
            </div>
          </div>
        </div>

        {/* Other Settings */}
        <div className="bg-slate-800 rounded-lg p-6">
          <h3 className="text-lg font-medium text-slate-100 mb-4">其他设置</h3>
          <div className="space-y-4">
            <div>
              <label className="block text-sm text-slate-400 mb-2">输出目录</label>
              <button
                onClick={onOpenOutputDir}
                className="flex items-center gap-2 px-3 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg text-sm text-slate-200 transition-colors"
              >
                <FolderOpen className="w-4 h-4" />
                打开输出目录
              </button>
            </div>
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
