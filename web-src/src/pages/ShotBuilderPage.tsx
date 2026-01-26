/**
 * ShotBuilderPage - Storyboard builder page
 */
import { useEffect, useState, useRef, useCallback } from 'react';
import { Save, Play, Loader2, FileText, ChevronDown, RefreshCw } from 'lucide-react';
import { useApi } from '../hooks/useApi';
import type { ShotBuilderPrompts, ShotBuilderOutputs } from '../types';
import type { ToastType } from '../components/ui/Toast';

interface ShotBuilderPageProps {
  projectName: string | null;
  showToast: (type: ToastType, message: string, duration?: number) => void;
}

const emptyPrompts: ShotBuilderPrompts = {
  role: '',
  scene: '',
  shot: '',
};

const emptyOutputs: ShotBuilderOutputs = {
  roles: '',
  scenes: '',
  shots: '',
};

export function ShotBuilderPage({ projectName, showToast }: ShotBuilderPageProps) {
  const { api, ready } = useApi();
  const [prompts, setPrompts] = useState<ShotBuilderPrompts>(emptyPrompts);
  const [novelText, setNovelText] = useState('');
  const [outputs, setOutputs] = useState<ShotBuilderOutputs>(emptyOutputs);
  const [outputDir, setOutputDir] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSavingPrompts, setIsSavingPrompts] = useState(false);
  const [isSavingNovel, setIsSavingNovel] = useState(false);
  const [isSavingOutputs, setIsSavingOutputs] = useState(false);
  const [isRunning, setIsRunning] = useState<'role' | 'scene' | 'shot' | null>(null);
  const [isPromptsOpen, setIsPromptsOpen] = useState(false);
  const [activeOutputTab, setActiveOutputTab] = useState<'role' | 'scene' | 'shot'>('role');
  const [activePromptTab, setActivePromptTab] = useState<'role' | 'scene' | 'shot'>('role');
  const [isRefreshing, setIsRefreshing] = useState(false);
  
  // 用于跟踪是否已初始化加载
  const hasLoadedRef = useRef(false);
  const loadingProjectRef = useRef<string | null>(null);
  // 用于跟踪轮询是否应该停止
  const pollingRef = useRef(false);

  // 刷新输出内容的函数
  const refreshOutputs = useCallback(async () => {
    if (!api || !projectName) return;
    setIsRefreshing(true);
    try {
      const outputsResult = await api.get_shot_builder_outputs();
      if (outputsResult.success && outputsResult.outputs) {
        setOutputs({
          roles: outputsResult.outputs.roles || '',
          scenes: outputsResult.outputs.scenes || '',
          shots: outputsResult.outputs.shots || '',
        });
        if (outputsResult.outputs.outputDir) {
          setOutputDir(outputsResult.outputs.outputDir);
        }
      }
    } catch (error) {
      console.error('Failed to refresh outputs:', error);
    } finally {
      setIsRefreshing(false);
    }
  }, [api, projectName]);

  // 初始加载 - 只在组件挂载或项目变化时执行一次
  useEffect(() => {
    if (!ready || !api) return;
    
    // 如果项目名相同且已经加载过，跳过
    if (loadingProjectRef.current === projectName && hasLoadedRef.current) {
      return;
    }
    
    const load = async () => {
      setIsLoading(true);
      loadingProjectRef.current = projectName;
      
      try {
        const promptResult = await api.get_shot_builder_prompts();
        if (promptResult.success && promptResult.prompts) {
          setPrompts(promptResult.prompts);
        }

        if (projectName) {
          const novelResult = await api.get_shot_builder_novel();
          if (novelResult.success && typeof novelResult.text === 'string') {
            setNovelText(novelResult.text);
          }
          const outputsResult = await api.get_shot_builder_outputs();
          if (outputsResult.success && outputsResult.outputs) {
            setOutputs({
              roles: outputsResult.outputs.roles || '',
              scenes: outputsResult.outputs.scenes || '',
              shots: outputsResult.outputs.shots || '',
            });
            setOutputDir(outputsResult.outputs.outputDir || '');
          }
          // 检查是否有正在运行的任务
          const statusResult = await api.get_shot_builder_status();
          if (statusResult.success && statusResult.running && statusResult.step) {
            setIsRunning(statusResult.step);
          }
        }
        hasLoadedRef.current = true;
      } catch (error) {
        console.error('Failed to load shot builder data:', error);
        showToast('error', '加载分镜数据失败');
      } finally {
        setIsLoading(false);
      }
    };
    load();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, api, projectName]);

  // 轮询任务状态和输出内容
  useEffect(() => {
    if (!api || !projectName || !isRunning) {
      pollingRef.current = false;
      return;
    }

    pollingRef.current = true;
    let timeoutId: ReturnType<typeof setTimeout>;

    const poll = async () => {
      if (!pollingRef.current) return;

      try {
        // 获取任务状态
        const statusResult = await api.get_shot_builder_status();
        if (!pollingRef.current) return;

        // 获取输出内容
        const outputsResult = await api.get_shot_builder_outputs();
        if (!pollingRef.current) return;

        if (outputsResult.success && outputsResult.outputs) {
          setOutputs({
            roles: outputsResult.outputs.roles || '',
            scenes: outputsResult.outputs.scenes || '',
            shots: outputsResult.outputs.shots || '',
          });
          if (outputsResult.outputs.outputDir) {
            setOutputDir(outputsResult.outputs.outputDir);
          }
        }

        if (statusResult.success) {
          // 检查任务是否完成
          if (!statusResult.running) {
            pollingRef.current = false;
            setIsRunning(null);
            if (statusResult.error) {
              showToast('error', statusResult.error);
            } else {
              const stepName = isRunning === 'role' ? '角色' : isRunning === 'scene' ? '场景' : '分镜';
              showToast('success', `已完成${stepName}生成`);
            }
            return;
          }
        }

        // 继续轮询
        if (pollingRef.current) {
          timeoutId = setTimeout(poll, 1500);
        }
      } catch (error) {
        console.error('Polling error:', error);
        if (pollingRef.current) {
          timeoutId = setTimeout(poll, 2000);
        }
      }
    };

    // 立即开始轮询
    poll();

    return () => {
      pollingRef.current = false;
      clearTimeout(timeoutId);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api, projectName, isRunning]);

  const handleSavePrompts = async () => {
    if (!api) return;
    setIsSavingPrompts(true);
    try {
      const result = await api.save_shot_builder_prompts(prompts);
      if (result.success) {
        showToast('success', '提示词已保存');
      } else {
        showToast('error', result.error || '保存提示词失败');
      }
    } catch (error) {
      console.error('Failed to save prompts:', error);
      showToast('error', '保存提示词失败');
    } finally {
      setIsSavingPrompts(false);
    }
  };

  const handleSaveNovel = async () => {
    if (!api) return;
    if (!projectName) {
      showToast('error', '请先打开项目');
      return;
    }
    setIsSavingNovel(true);
    try {
      const result = await api.save_shot_builder_novel(novelText);
      if (result.success) {
        showToast('success', '小说文本已保存');
      } else {
        showToast('error', result.error || '保存小说文本失败');
      }
    } catch (error) {
      console.error('Failed to save novel text:', error);
      showToast('error', '保存小说文本失败');
    } finally {
      setIsSavingNovel(false);
    }
  };

  const handleSaveOutputs = async () => {
    if (!api) return;
    if (!projectName) {
      showToast('error', '请先打开项目');
      return;
    }
    setIsSavingOutputs(true);
    try {
      const result = await api.save_shot_builder_outputs(outputs);
      if (result.success) {
        if (result.outputDir) {
          setOutputDir(result.outputDir);
        }
        showToast('success', '生成内容已保存');
      } else {
        showToast('error', result.error || '保存生成内容失败');
      }
    } catch (error) {
      console.error('Failed to save outputs:', error);
      showToast('error', '保存生成内容失败');
    } finally {
      setIsSavingOutputs(false);
    }
  };

  const handleRunStep = async (step: 'role' | 'scene' | 'shot') => {
    if (!api) return;
    if (!projectName) {
      showToast('error', '请先打开项目');
      return;
    }
    if (isRunning) {
      showToast('error', '已有任务正在执行中');
      return;
    }
    try {
      const result = await api.run_shot_builder_step(step, true);
      if (result.success) {
        // 任务已启动，设置状态开始轮询
        setIsRunning(step);
        if (result.outputDir) {
          setOutputDir(result.outputDir);
        }
        const stepName = step === 'role' ? '角色' : step === 'scene' ? '场景' : '分镜';
        showToast('info', `已启动${stepName}生成任务...`);
      } else {
        showToast('error', result.error || '启动任务失败');
      }
    } catch (error) {
      console.error('Failed to start step:', error);
      showToast('error', '启动任务失败');
    }
  };


  if (isLoading) {
    return (
      <div className="h-full flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-violet-500 animate-spin" />
      </div>
    );
  }

  return (
    <div className="h-full p-4 overflow-y-auto space-y-4">
      <div className="bg-slate-800 rounded-lg border border-slate-700 p-3">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <FileText className="w-4 h-4 text-slate-300" />
            <h3 className="text-sm font-medium text-slate-100">生成内容（可编辑）</h3>
            <button
              onClick={refreshOutputs}
              disabled={isRefreshing || !projectName}
              className="flex items-center gap-1 px-2 py-1 bg-slate-700 hover:bg-slate-600 disabled:opacity-50 rounded text-xs text-slate-300 transition-colors"
              title="刷新内容"
            >
              <RefreshCw className={`w-3 h-3 ${isRefreshing ? 'animate-spin' : ''}`} />
              刷新
            </button>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => handleRunStep(activeOutputTab)}
              disabled={isRunning !== null || !projectName}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs text-white transition-colors ${
                activeOutputTab === 'role'
                  ? 'bg-violet-600 hover:bg-violet-500'
                  : activeOutputTab === 'scene'
                    ? 'bg-blue-600 hover:bg-blue-500'
                    : 'bg-emerald-600 hover:bg-emerald-500'
              } disabled:opacity-50`}
            >
              {isRunning === activeOutputTab ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
              {activeOutputTab === 'role' ? '生成角色' : activeOutputTab === 'scene' ? '生成场景' : '生成分镜'}
            </button>
            <button
              onClick={handleSaveOutputs}
              disabled={isSavingOutputs || !projectName}
              className="flex items-center gap-2 px-3 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 rounded-lg text-xs text-white transition-colors"
            >
              {isSavingOutputs ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              保存内容
            </button>
          </div>
        </div>
        <div className="text-xs text-slate-400 mb-2">
          保存位置：{outputDir ? `${outputDir}/roles.jsonl | scenes.jsonl | shots.jsonl` : '请先打开项目'}
        </div>
        <div className="flex space-x-1 mb-3 bg-slate-700 p-1 rounded-lg">
          {(['role', 'scene', 'shot'] as const).map((tab) => {
            const isActive = activeOutputTab === tab;
            return (
              <button
                key={tab}
                onClick={() => setActiveOutputTab(tab)}
                className={`flex-1 px-3 py-1.5 rounded-md text-xs transition-colors ${
                  isActive
                    ? tab === 'role'
                      ? 'bg-violet-600 text-white'
                      : tab === 'scene'
                        ? 'bg-blue-600 text-white'
                        : 'bg-emerald-600 text-white'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-600'
                }`}
              >
                {tab === 'role' ? '角色' : tab === 'scene' ? '场景' : '分镜'}
              </button>
            );
          })}
        </div>
        {activeOutputTab === 'role' && (
          <div>
            <label className="block text-xs text-slate-400 mb-2">角色 JSONL</label>
            <textarea
              value={outputs.roles}
              onChange={(e) => setOutputs({ ...outputs, roles: e.target.value })}
              className="w-full h-36 px-3 py-2 bg-slate-700 rounded-lg text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500 resize-none"
            />
          </div>
        )}
        {activeOutputTab === 'scene' && (
          <div>
            <label className="block text-xs text-slate-400 mb-2">场景 JSONL</label>
            <textarea
              value={outputs.scenes}
              onChange={(e) => setOutputs({ ...outputs, scenes: e.target.value })}
              className="w-full h-36 px-3 py-2 bg-slate-700 rounded-lg text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500 resize-none"
            />
          </div>
        )}
        {activeOutputTab === 'shot' && (
          <div>
            <label className="block text-xs text-slate-400 mb-2">分镜 JSONL</label>
            <textarea
              value={outputs.shots}
              onChange={(e) => setOutputs({ ...outputs, shots: e.target.value })}
              className="w-full h-40 px-3 py-2 bg-slate-700 rounded-lg text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500 resize-none"
            />
          </div>
        )}
      </div>

      <div className="bg-slate-800 rounded-lg border border-slate-700 p-3">
        <div className="flex items-center gap-2 mb-2">
          <FileText className="w-4 h-4 text-slate-300" />
          <h3 className="text-sm font-medium text-slate-100">小说文本</h3>
        </div>
        <div className="text-xs text-slate-400 mb-2">
          保存位置：{outputDir ? `${outputDir}/novel.txt` : '请先打开项目'}
        </div>
        <textarea
          value={novelText}
          onChange={(e) => setNovelText(e.target.value)}
          placeholder={projectName ? '请粘贴小说原文内容' : '请先打开项目'}
          className="w-full h-40 px-3 py-2 bg-slate-700 rounded-lg text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500 resize-none"
        />
        <div className="flex justify-end mt-2">
          <button
            onClick={handleSaveNovel}
            disabled={isSavingNovel || !projectName}
            className="flex items-center gap-2 px-3 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 rounded-lg text-xs text-white transition-colors"
          >
            {isSavingNovel ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            保存小说文本
          </button>
        </div>
      </div>

      <div className="bg-slate-800 rounded-lg border border-slate-700 p-3">
        <button
          onClick={() => setIsPromptsOpen((prev) => !prev)}
          className="w-full flex items-center justify-between text-left"
        >
          <div className="flex items-center gap-2">
            <FileText className="w-4 h-4 text-slate-400" />
            <span className="text-xs text-slate-300">基础提示词（可折叠）</span>
          </div>
          <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform ${isPromptsOpen ? 'rotate-180' : ''}`} />
        </button>
        {isPromptsOpen && (
          <div className="mt-3">
            <div className="flex items-center justify-between mb-3">
              <div className="text-xs text-slate-400">
                保存位置：~/.hetangai/prompts/role.txt | scene.txt | shot.txt
              </div>
              <button
                onClick={handleSavePrompts}
                disabled={isSavingPrompts}
                className="flex items-center gap-2 px-3 py-2 bg-violet-600 hover:bg-violet-500 disabled:opacity-50 rounded-lg text-xs text-white transition-colors"
              >
                {isSavingPrompts ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                保存提示词
              </button>
            </div>
            <div className="flex space-x-1 mb-3 bg-slate-700 p-1 rounded-lg">
              {(['role', 'scene', 'shot'] as const).map((tab) => {
                const isActive = activePromptTab === tab;
                return (
                  <button
                    key={tab}
                    onClick={() => setActivePromptTab(tab)}
                    className={`flex-1 px-3 py-1.5 rounded-md text-xs transition-colors ${
                      isActive
                        ? tab === 'role'
                          ? 'bg-violet-600 text-white'
                          : tab === 'scene'
                            ? 'bg-blue-600 text-white'
                            : 'bg-emerald-600 text-white'
                        : 'text-slate-400 hover:text-slate-200 hover:bg-slate-600'
                    }`}
                  >
                    {tab === 'role' ? '角色' : tab === 'scene' ? '场景' : '分镜'}
                  </button>
                );
              })}
            </div>
            {activePromptTab === 'role' && (
              <div>
                <label className="block text-xs text-slate-400 mb-2">角色提示词</label>
                <textarea
                  value={prompts.role}
                  onChange={(e) => setPrompts({ ...prompts, role: e.target.value })}
                  className="w-full h-32 px-3 py-2 bg-slate-700 rounded-lg text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-violet-500 resize-none"
                />
              </div>
            )}
            {activePromptTab === 'scene' && (
              <div>
                <label className="block text-xs text-slate-400 mb-2">场景提示词</label>
                <textarea
                  value={prompts.scene}
                  onChange={(e) => setPrompts({ ...prompts, scene: e.target.value })}
                  className="w-full h-32 px-3 py-2 bg-slate-700 rounded-lg text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-violet-500 resize-none"
                />
              </div>
            )}
            {activePromptTab === 'shot' && (
              <div>
                <label className="block text-xs text-slate-400 mb-2">分镜提示词</label>
                <textarea
                  value={prompts.shot}
                  onChange={(e) => setPrompts({ ...prompts, shot: e.target.value })}
                  className="w-full h-32 px-3 py-2 bg-slate-700 rounded-lg text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-violet-500 resize-none"
                />
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default ShotBuilderPage;
