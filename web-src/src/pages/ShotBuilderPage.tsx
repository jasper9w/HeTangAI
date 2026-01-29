/**
 * ShotBuilderPage - Storyboard builder page
 */
import { useEffect, useState, useRef } from 'react';
import { Play, Loader2, X } from 'lucide-react';
import { useApi } from '../hooks/useApi';
import { JsonlTable } from '../components/shot/JsonlTable';
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
  const [isRunning, setIsRunning] = useState<'role' | 'scene' | 'shot' | null>(null);
  const [activeTab, setActiveTab] = useState<'novel' | 'role' | 'scene' | 'shot'>('novel');
  const [promptModalOpen, setPromptModalOpen] = useState(false);
  const [promptModalStep, setPromptModalStep] = useState<'role' | 'scene' | 'shot'>('role');
  const [promptDraft, setPromptDraft] = useState('');
  const [isSavingPromptModal, setIsSavingPromptModal] = useState(false);
  
  // 用于跟踪是否已初始化加载
  const hasLoadedRef = useRef(false);
  const loadingProjectRef = useRef<string | null>(null);
  // 用于跟踪轮询是否应该停止
  const pollingRef = useRef(false);

  const outputsRef = useRef(outputs);
  const novelRef = useRef(novelText);
  const promptsRef = useRef(prompts);
  const promptOriginalRef = useRef<ShotBuilderPrompts | null>(null);
  const outputSaveTimersRef = useRef<{
    roles?: ReturnType<typeof setTimeout>;
    scenes?: ReturnType<typeof setTimeout>;
    shots?: ReturnType<typeof setTimeout>;
  }>({});
  const promptSaveTimersRef = useRef<{
    role?: ReturnType<typeof setTimeout>;
    scene?: ReturnType<typeof setTimeout>;
    shot?: ReturnType<typeof setTimeout>;
  }>({});
  const novelSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dirtyOutputsRef = useRef({ roles: false, scenes: false, shots: false });
  const dirtyPromptsRef = useRef({ role: false, scene: false, shot: false });
  const dirtyNovelRef = useRef(false);

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
          const nextOutputs = outputsResult.outputs;
          setOutputs((prev) => ({
            roles: dirtyOutputsRef.current.roles ? prev.roles : nextOutputs.roles || '',
            scenes: dirtyOutputsRef.current.scenes ? prev.scenes : nextOutputs.scenes || '',
            shots: dirtyOutputsRef.current.shots ? prev.shots : nextOutputs.shots || '',
          }));
          if (nextOutputs.outputDir) {
            setOutputDir(nextOutputs.outputDir);
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

  useEffect(() => {
    outputsRef.current = outputs;
  }, [outputs]);

  useEffect(() => {
    novelRef.current = novelText;
  }, [novelText]);

  useEffect(() => {
    promptsRef.current = prompts;
  }, [prompts]);

  // ESC key to close modals
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && promptModalOpen) {
        handlePromptCancel();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [promptModalOpen]);

  const scheduleSaveOutputs = (field: 'roles' | 'scenes' | 'shots') => {
    if (!api || !projectName) return;
    dirtyOutputsRef.current[field] = true;
    if (outputSaveTimersRef.current[field]) {
      clearTimeout(outputSaveTimersRef.current[field]);
    }
    outputSaveTimersRef.current[field] = setTimeout(async () => {
      try {
        const result = await api.save_shot_builder_outputs(outputsRef.current);
        if (!result.success) {
          showToast('error', result.error || '自动保存失败');
        } else {
          if (result.outputDir) {
            setOutputDir(result.outputDir);
          }
          dirtyOutputsRef.current[field] = false;
        }
      } catch (error) {
        console.error('Failed to auto save outputs:', error);
        showToast('error', '自动保存失败');
      }
    }, 1000);
  };

  const scheduleSaveNovel = () => {
    if (!api || !projectName) return;
    dirtyNovelRef.current = true;
    if (novelSaveTimerRef.current) {
      clearTimeout(novelSaveTimerRef.current);
    }
    novelSaveTimerRef.current = setTimeout(async () => {
      try {
        const result = await api.save_shot_builder_novel(novelRef.current);
        if (!result.success) {
          showToast('error', result.error || '自动保存失败');
        } else {
          dirtyNovelRef.current = false;
        }
      } catch (error) {
        console.error('Failed to auto save novel:', error);
        showToast('error', '自动保存失败');
      }
    }, 1000);
  };

  const scheduleSavePrompts = (step: 'role' | 'scene' | 'shot') => {
    if (!api) return;
    dirtyPromptsRef.current[step] = true;
    if (promptSaveTimersRef.current[step]) {
      clearTimeout(promptSaveTimersRef.current[step]);
    }
    promptSaveTimersRef.current[step] = setTimeout(async () => {
      try {
        const result = await api.save_shot_builder_prompts(promptsRef.current);
        if (!result.success) {
          showToast('error', result.error || '自动保存失败');
        } else {
          dirtyPromptsRef.current[step] = false;
        }
      } catch (error) {
        console.error('Failed to auto save prompts:', error);
        showToast('error', '自动保存失败');
      }
    }, 1000);
  };

  const openPromptModal = (step: 'role' | 'scene' | 'shot') => {
    setPromptModalStep(step);
    setPromptDraft(promptsRef.current[step] || '');
    promptOriginalRef.current = { ...promptsRef.current };
    setPromptModalOpen(true);
  };

  const handlePromptChange = (value: string) => {
    setPromptDraft(value);
    setPrompts((prev) => ({
      ...prev,
      [promptModalStep]: value,
    }));
    scheduleSavePrompts(promptModalStep);
  };

  const handlePromptCancel = () => {
    if (promptOriginalRef.current) {
      setPrompts(promptOriginalRef.current);
      setPromptDraft(promptOriginalRef.current[promptModalStep] || '');
    }
    if (promptSaveTimersRef.current[promptModalStep]) {
      clearTimeout(promptSaveTimersRef.current[promptModalStep]);
    }
    dirtyPromptsRef.current[promptModalStep] = false;
    setPromptModalOpen(false);
  };

  const handlePromptSave = async () => {
    if (!api) return;
    setIsSavingPromptModal(true);
    try {
      const result = await api.save_shot_builder_prompts(promptsRef.current);
      if (!result.success) {
        showToast('error', result.error || '保存提示词失败');
      } else {
        showToast('success', '提示词已保存');
        dirtyPromptsRef.current[promptModalStep] = false;
        setPromptModalOpen(false);
      }
    } catch (error) {
      console.error('Failed to save prompts:', error);
      showToast('error', '保存提示词失败');
    } finally {
      setIsSavingPromptModal(false);
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
        <Loader2 className="w-8 h-8 text-teal-500 animate-spin" />
      </div>
    );
  }

  return (
    <div className="h-full p-4 overflow-y-auto space-y-4">
      <div className="flex space-x-1 bg-slate-800 p-1 rounded-lg">
        {([
          { id: 'novel', label: '小说' },
          { id: 'role', label: '角色' },
          { id: 'scene', label: '场景' },
          { id: 'shot', label: '分镜' },
        ] as const).map((tab) => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex-1 px-3 py-2 rounded-md text-sm transition-colors ${
                isActive ? 'bg-teal-600 text-white' : 'text-slate-300 hover:text-white hover:bg-slate-700'
              }`}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      <div className="bg-slate-800 rounded-lg border border-slate-700 p-4 space-y-3">
        {activeTab === 'novel' && (
          <>
            <div className="text-xs text-slate-400">
              保存位置：{outputDir ? `${outputDir}/novel.txt` : '请先打开项目'}
            </div>
            <textarea
              value={novelText}
              onChange={(e) => {
                setNovelText(e.target.value);
                scheduleSaveNovel();
              }}
              placeholder={projectName ? '请粘贴小说原文内容' : '请先打开项目'}
              className="w-full h-[60vh] px-3 py-2 bg-slate-700 rounded-lg text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500 resize-none"
            />
          </>
        )}

        {activeTab !== 'novel' && (
          <>
            <div className="flex items-center justify-between gap-2">
              <div className="text-xs text-slate-400">
                保存位置：
                {outputDir
                  ? `${outputDir}/${activeTab === 'role' ? 'roles' : activeTab === 'scene' ? 'scenes' : 'shots'}.jsonl`
                  : '请先打开项目'}
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => handleRunStep(activeTab)}
                  disabled={isRunning !== null || !projectName}
                  className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs text-white transition-colors ${
                    activeTab === 'role'
                      ? 'bg-gradient-to-r from-teal-600 to-teal-500 hover:from-teal-500 hover:to-teal-400'
                      : activeTab === 'scene'
                        ? 'bg-blue-600 hover:bg-blue-500'
                        : 'bg-emerald-600 hover:bg-emerald-500'
                  } disabled:opacity-50`}
                >
                  {isRunning === activeTab ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
                  {activeTab === 'role' ? '生成角色' : activeTab === 'scene' ? '生成场景' : '生成分镜'}
                </button>
                <button
                  onClick={() => openPromptModal(activeTab)}
                  className="px-3 py-2 rounded-lg text-xs text-slate-200 bg-slate-700 hover:bg-slate-600 transition-colors"
                >
                  查看系统提示词
                </button>
              </div>
            </div>

            {activeTab === 'role' && (
              <JsonlTable
                value={outputs.roles}
                onChange={(newValue) => {
                  setOutputs((prev) => ({ ...prev, roles: newValue }));
                  scheduleSaveOutputs('roles');
                }}
              />
            )}
            {activeTab === 'scene' && (
              <JsonlTable
                value={outputs.scenes}
                onChange={(newValue) => {
                  setOutputs((prev) => ({ ...prev, scenes: newValue }));
                  scheduleSaveOutputs('scenes');
                }}
              />
            )}
            {activeTab === 'shot' && (
              <JsonlTable
                value={outputs.shots}
                onChange={(newValue) => {
                  setOutputs((prev) => ({ ...prev, shots: newValue }));
                  scheduleSaveOutputs('shots');
                }}
              />
            )}
          </>
        )}
      </div>

      {promptModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-3xl bg-slate-800 border border-slate-700 rounded-lg shadow-xl">
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-700">
              <h3 className="text-sm font-medium text-slate-100">
                {promptModalStep === 'role' ? '角色' : promptModalStep === 'scene' ? '场景' : '分镜'}系统提示词
              </h3>
              <button
                onClick={handlePromptCancel}
                className="p-1 text-slate-400 hover:text-slate-200 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-4">
              <textarea
                value={promptDraft}
                onChange={(e) => handlePromptChange(e.target.value)}
                className="w-full h-[60vh] px-3 py-2 bg-slate-700 rounded-lg text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-teal-500 resize-none"
              />
              <div className="flex justify-end gap-2 mt-4">
                <button
                  onClick={handlePromptCancel}
                  className="px-4 py-2 rounded-lg text-xs text-slate-200 bg-slate-700 hover:bg-slate-600 transition-colors"
                >
                  取消
                </button>
                <button
                  onClick={handlePromptSave}
                  disabled={isSavingPromptModal}
                  className="px-4 py-2 rounded-lg text-xs text-white bg-gradient-to-r from-teal-600 to-teal-500 hover:from-teal-500 hover:to-teal-400 disabled:opacity-50 transition-colors"
                >
                  {isSavingPromptModal ? '保存中...' : '保存'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default ShotBuilderPage;
