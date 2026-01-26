/**
 * AI Lens Creation Workshop - Main Application
 */
import { useState, useEffect, useCallback } from 'react';
import {
  Save,
  Film,
  Plus,
  Loader2,
  ArrowLeft,
  FileUp,
  Download,
  Image,
  Video,
  Mic,
  Sparkles,
  Type,
} from 'lucide-react';
import { useApi } from './hooks/useApi';
import { Sidebar } from './components/layout/Sidebar';
import { ProjectListPage } from './pages/ProjectListPage';
import { HomePage } from './pages/HomePage';
import { ShotsPage } from './pages/ShotsPage';
import { CharactersPage } from './pages/CharactersPage';
import { DubbingPage } from './pages/DubbingPage';
import { SettingsPage } from './pages/SettingsPage';
import { Toast, type ToastMessage } from './components/ui/Toast';
import type { ProjectData, Shot, PageType, ImportedCharacter } from './types';

function App() {
  const { api, ready } = useApi();

  // Page state - start with projects list
  const [currentPage, setCurrentPage] = useState<PageType>('projects');

  // Project state
  const [project, setProject] = useState<ProjectData | null>(null);
  const [projectPath, setProjectPath] = useState<string | null>(null);
  const [projectName, setProjectName] = useState<string | null>(null);
  const [isDirty, setIsDirty] = useState(false);

  // Selection state
  const [selectedShotIds, setSelectedShotIds] = useState<string[]>([]);
  const [filteredShots, setFilteredShots] = useState<Shot[]>([]);

  // Batch generation modal state
  const [batchModalOpen, setBatchModalOpen] = useState(false);
  const [batchModalType, setBatchModalType] = useState<'image' | 'video' | 'audio'>('image');

  // Generation state
  const [isGenerating, setIsGenerating] = useState(false);
  const [isGeneratingCharacters, setIsGeneratingCharacters] = useState(false);
  const [generationProgress, setGenerationProgress] = useState<{
    current: number;
    total: number;
    type: 'image' | 'video' | 'audio';
  } | null>(null);

  // Character modal state
  const [addCharacterModalOpen, setAddCharacterModalOpen] = useState(false);
  const [importCharacterModalOpen, setImportCharacterModalOpen] = useState(false);

  // Prefix modal state
  const [prefixModalOpen, setPrefixModalOpen] = useState(false);
  const [promptPrefix, setPromptPrefix] = useState('');

  // Toast notifications
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const showToast = useCallback((type: ToastMessage['type'], message: string, duration?: number) => {
    const id = `toast-${Date.now()}-${Math.random()}`;
    setToasts((prev) => [...prev, { id, type, message, duration }]);
  }, []);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  // ========== Project Operations ==========

  
  const handleNewProjectWithName = async (projectName: string) => {
    if (!api) return;

    // Create new project
    const result = await api.new_project();
    if (result.success && result.data) {
      // Update project name
      result.data.name = projectName;

      // Save to work directory
      const saveResult = await api.save_project_to_workdir(projectName);
      if (saveResult.success) {
        setProject(result.data);
        setProjectPath(saveResult.path || null);
        setProjectName(saveResult.name || result.data.name || projectName);
        setIsDirty(false);
        setSelectedShotIds([]);
        setCurrentPage('shots');
      }
    }
  };

  const handleOpenProjectFromList = async (name: string) => {
    if (!api) return;
    const result = await api.open_project_from_workdir(name);
    if (result.success && result.data) {
      setProject(result.data);
      setProjectName(name);
      setProjectPath(null);
      setIsDirty(false);
      setSelectedShotIds([]);
      setCurrentPage('shots');
    }
  };

  
  const handleSaveProject = useCallback(async () => {
    if (!api || !project) return;
    const result = await api.save_project();
    if (result.success) {
      setProjectPath(result.path || projectPath);
      setProjectName(result.name || projectName);
      setIsDirty(false);
      showToast('success', '项目已保存');
    } else {
      showToast('error', `保存失败: ${result.error || '未知错误'}`);
    }
  }, [api, project, projectPath, projectName, showToast]);

  // Auto-save every 60 seconds
  useEffect(() => {
    if (!api || !project || !isDirty) return;

    const autoSaveInterval = setInterval(() => {
      if (isDirty) {
        handleSaveProject();
      }
    }, 60000); // 60 seconds

    return () => clearInterval(autoSaveInterval);
  }, [api, project, isDirty, handleSaveProject]);

  // Register callbacks for backend to notify shot status changes and progress
  useEffect(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).onShotStatusChange = (shotId: string, status: string, shotData: Shot | null) => {
      setProject((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          shots: prev.shots.map((s) => {
            if (s.id === shotId) {
              // If full shot data is provided, use it; otherwise just update status
              if (shotData) {
                return shotData;
              }
              return { ...s, status: status as Shot['status'] };
            }
            return s;
          }),
        };
      });
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).onProgressIncrement = () => {
      setGenerationProgress((prev) => {
        if (!prev) return prev;
        return { ...prev, current: prev.current + 1 };
      });
    };

    return () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      delete (window as any).onShotStatusChange;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      delete (window as any).onProgressIncrement;
    };
  }, []);

  // Keyboard shortcut: Cmd+S / Ctrl+S
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault();
        if (api && project) {
          handleSaveProject();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [api, project, handleSaveProject]);

  // ========== Import/Export ==========

  const handleImportJsonl = async () => {
    if (!api) return;
    const result = await api.import_jsonl();
    if (result.success && result.data) {
      setProject(result.data);
      setIsDirty(true);
      if (result.count > 0) {
        console.log(`Imported ${result.count} shots, ${result.characters.length} characters`);
      }
      if (result.errors.length > 0) {
        console.warn('Import warnings:', result.errors);
      }
    }
  };

  const handleExportJsonlTemplate = async () => {
    if (!api) return;
    await api.export_jsonl_template();
  };

  // ========== Character Operations ==========

  const handleAddCharacter = async (name: string, description: string) => {
    if (!api || !project) return;
    const result = await api.add_character(name, description);
    if (result.success && result.character) {
      setProject({
        ...project,
        characters: [...project.characters, result.character],
      });
      setIsDirty(true);
    }
  };

  const handleUpdateCharacter = async (id: string, name: string, description: string) => {
    if (!api || !project) return;
    const result = await api.update_character(id, name, description);
    if (result.success && result.character) {
      setProject({
        ...project,
        characters: project.characters.map((c) =>
          c.id === id ? result.character! : c
        ),
      });
      setIsDirty(true);
    }
  };

  const handleDeleteCharacter = async (id: string) => {
    if (!api || !project) return;
    const result = await api.delete_character(id);
    if (result.success) {
      setProject({
        ...project,
        characters: project.characters.filter((c) => c.id !== id),
      });
      setIsDirty(true);
    }
  };

  const handleGenerateCharacterImage = async (id: string) => {
    if (!api) return;

    // Update status locally first using functional update
    setProject((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        characters: prev.characters.map((c) =>
          c.id === id ? { ...c, status: 'generating' as const } : c
        ),
      };
    });

    const result = await api.generate_character_image(id);

    if (result.success && result.character) {
      setProject((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          characters: prev.characters.map((c) =>
            c.id === id ? result.character! : c
          ),
        };
      });
      setIsDirty(true);
      showToast('success', '角色图片生成成功');
    } else {
      // Revert status on error
      setProject((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          characters: prev.characters.map((c) =>
            c.id === id ? { ...c, status: 'error' as const, errorMessage: result.error } : c
          ),
        };
      });
      showToast('error', `角色图片生成失败: ${result.error || '未知错误'}`);
    }
  };

  const handleGenerateAllCharacterImages = async () => {
    if (!api || !project) return;

    const pendingChars = project.characters.filter(
      (c) => c.status === 'pending' || !c.imageUrl
    );

    if (pendingChars.length === 0) return;

    setIsGeneratingCharacters(true);

    for (const char of pendingChars) {
      await handleGenerateCharacterImage(char.id);
    }

    setIsGeneratingCharacters(false);
  };

  
  const handleSetCharacterReferenceAudio = async (id: string, audioPath: string) => {
    if (!api || !project) return;

    const result = await api.set_character_reference_audio(id, audioPath);
    if (result.success && result.character) {
      setProject({
        ...project,
        characters: project.characters.map((c) =>
          c.id === id ? result.character! : c
        ),
      });
      setIsDirty(true);
    }
  };

  const handleUploadCharacterImage = async (id: string) => {
    if (!api || !project) return;

    const result = await api.upload_character_image(id);
    if (result.success && result.character) {
      setProject({
        ...project,
        characters: project.characters.map((c) =>
          c.id === id ? result.character! : c
        ),
      });
      setIsDirty(true);
      showToast('success', '角色图片上传成功');
    } else if (result.error && result.error !== 'No file selected') {
      showToast('error', `角色图片上传失败: ${result.error}`);
    }
  };

  const handleImportCharactersFromText = async (text: string) => {
    if (!api) return { success: false, characters: [], errors: [], error: 'API not ready' };
    const result = await api.import_characters_from_text(text);
    return {
      success: result.success,
      characters: result.characters || [],
      errors: result.errors || [],
      error: result.error,
    };
  };

  const handleImportCharactersFromFile = async () => {
    if (!api) return { success: false, characters: [], errors: [], error: 'API not ready' };
    const result = await api.import_characters_from_file();
    return {
      success: result.success,
      characters: result.characters || [],
      errors: result.errors || [],
      error: result.error,
    };
  };

  const handleConfirmImportCharacters = async (
    characters: ImportedCharacter[],
    options?: { duplicateAction?: 'overwrite' | 'skip' },
  ) => {
    if (!api || !project) return { success: false, error: 'No project data' };

    const duplicateAction = options?.duplicateAction;
    const duplicates = characters.filter((char) => !!char.existingId);
    const newCharacters = characters.filter((char) => !char.existingId);
    let addedCount = 0;
    let overwrittenCount = 0;

    if (duplicates.length > 0 && duplicateAction === 'overwrite') {
      const errors: string[] = [];
      for (const char of duplicates) {
        if (!char.existingId) continue;
        const name = char.name || '';
        const description = char.description || '';
        const updateResult = await api.update_character(char.existingId, name, description);
        if (!updateResult.success) {
          errors.push(updateResult.error || `更新角色失败: ${name || char.existingId}`);
          continue;
        }
        overwrittenCount += 1;

        if (char.referenceAudioPath) {
          const audioResult = await api.set_character_reference_audio(char.existingId, char.referenceAudioPath);
          if (!audioResult.success) {
            errors.push(audioResult.error || `更新参考音频失败: ${name || char.existingId}`);
          }
        }
      }

      if (errors.length > 0) {
        showToast('error', errors[0]);
        return { success: false, error: errors.join('; ') };
      }
    }

    if (duplicates.length > 0 && duplicateAction === 'skip') {
      // Only import non-duplicate characters
      if (newCharacters.length === 0) {
        showToast('success', `已跳过 ${duplicates.length} 个重复角色`);
        return { success: true, addedCount: 0 };
      }
    }

    let result: { success: true; addedCount: number } = { success: true, addedCount: 0 };
    if (newCharacters.length > 0) {
      const importResult = await api.confirm_import_characters(newCharacters);
      if (!importResult.success) {
        return importResult;
      }
      addedCount = importResult.addedCount ?? 0;
      result = { success: true, addedCount };
    }

    if (duplicates.length > 0 && duplicateAction === 'overwrite') {
      showToast('success', `覆盖 ${overwrittenCount} 个角色，新增 ${addedCount} 个`);
    } else if (duplicates.length > 0 && duplicateAction === 'skip') {
      showToast('success', `新增 ${addedCount} 个，已跳过 ${duplicates.length} 个重复角色`);
    } else if (newCharacters.length > 0) {
      showToast('success', `成功导入 ${addedCount} 个角色`);
    }

    // Reload project data to get updated characters
    const projectResult = await api.get_project_data();
    if (projectResult.success && projectResult.data) {
      setProject(projectResult.data);
    }
    setIsDirty(true);
    return result;
  };

  const handleExportCharacterTemplate = async () => {
    if (!api) return;
    const result = await api.export_character_template();
    if (result.success) {
      showToast('success', '模板导出成功');
    } else if (result.error && result.error !== 'No file selected') {
      showToast('error', `模板导出失败: ${result.error}`);
    }
  };

  const handleUpdateCharacterSpeed = async (id: string, speed: number) => {
    if (!api || !project) return;

    const result = await api.update_character_speed(id, speed);
    if (result.success && result.character) {
      setProject({
        ...project,
        characters: project.characters.map((c) =>
          c.id === id ? result.character! : c
        ),
      });
      setIsDirty(true);
    }
  };

  // ========== Shot Operations ==========

  const handleSelectShot = (id: string, selected: boolean) => {
    if (selected) {
      setSelectedShotIds([...selectedShotIds, id]);
    } else {
      setSelectedShotIds(selectedShotIds.filter((sid) => sid !== id));
    }
  };

  const handleSelectAllShots = (selected: boolean) => {
    if (selected) {
      // 选择当前筛选后的镜头
      const shotsToSelect = filteredShots.length > 0 ? filteredShots : (project?.shots || []);
      setSelectedShotIds(shotsToSelect.map((s) => s.id));
    } else {
      setSelectedShotIds([]);
    }
  };

  const handleDeleteShots = async (ids: string[]) => {
    if (!api || !project) return;
    const result = await api.delete_shots(ids);
    if (result.success) {
      setProject({
        ...project,
        shots: project.shots.filter((s) => !ids.includes(s.id)),
      });
      setSelectedShotIds(selectedShotIds.filter((id) => !ids.includes(id)));
      setIsDirty(true);
    }
  };

  const handleInsertShot = async (afterShotId: string | null) => {
    if (!api || !project) return;
    const result = await api.insert_shot(afterShotId);
    if (result.success && result.shots) {
      // 直接使用返回的镜头列表更新项目
      setProject({
        ...project,
        shots: result.shots,
      });
      setIsDirty(true);
      showToast('success', '已插入新镜头');
    } else {
      showToast('error', `插入镜头失败: ${result.error || '未知错误'}`);
    }
  };

  const handleSelectImage = async (shotId: string, imageIndex: number) => {
    if (!api || !project) return;
    const result = await api.select_image(shotId, imageIndex);
    if (result.success) {
      setProject({
        ...project,
        shots: project.shots.map((s) =>
          s.id === shotId ? { ...s, selectedImageIndex: imageIndex } : s
        ),
      });
      setIsDirty(true);
    }
  };

  const handleSelectVideo = async (shotId: string, videoIndex: number) => {
    if (!api || !project) return;
    const result = await api.select_video(shotId, videoIndex);
    if (result.success) {
      setProject({
        ...project,
        shots: project.shots.map((s) => {
          if (s.id === shotId) {
            const videos = s.videos || [];
            return {
              ...s,
              selectedVideoIndex: videoIndex,
              videoUrl: videos[videoIndex] || '',
            };
          }
          return s;
        }),
      });
      setIsDirty(true);
    }
  };

  const handleUpdateShot = async (shotId: string, field: string, value: string | string[] | { role: string; text: string }[]) => {
    if (!api || !project) return;
    // Update locally first for responsiveness
    setProject({
      ...project,
      shots: project.shots.map((s) =>
        s.id === shotId ? { ...s, [field]: value } : s
      ),
    });
    setIsDirty(true);
    // Then sync to backend
    await api.update_shot(shotId, field, value);
  };

  // ========== Generation Operations ==========

  const updateShotInProject = useCallback((updatedShot: Shot) => {
    setProject((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        shots: prev.shots.map((s) => (s.id === updatedShot.id ? updatedShot : s)),
      };
    });
  }, []);

  const handleGenerateImages = async (shotId: string) => {
    if (!api || !project) return;

    // Update status locally first
    setProject((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        shots: prev.shots.map((s) =>
          s.id === shotId ? { ...s, status: 'generating_images' as const } : s
        ),
      };
    });

    const result = await api.generate_images_for_shot(shotId);

    if (result.success && result.shot) {
      updateShotInProject(result.shot);
      setIsDirty(true);
      showToast('success', '图片生成成功');
    } else {
      // Revert status on error
      setProject((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          shots: prev.shots.map((s) =>
            s.id === shotId ? { ...s, status: 'error' as const, errorMessage: result.error } : s
          ),
        };
      });
      showToast('error', `图片生成失败: ${result.error || '未知错误'}`);
    }
  };

  const handleGenerateVideo = async (shotId: string) => {
    if (!api || !project) return;

    // Update status locally first
    setProject((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        shots: prev.shots.map((s) =>
          s.id === shotId ? { ...s, status: 'generating_video' as const } : s
        ),
      };
    });

    const result = await api.generate_video_for_shot(shotId);

    if (result.success && result.shot) {
      updateShotInProject(result.shot);
      setIsDirty(true);
      showToast('success', '视频生成成功');
    } else {
      // Revert status on error
      setProject((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          shots: prev.shots.map((s) =>
            s.id === shotId ? { ...s, status: 'error' as const, errorMessage: result.error } : s
          ),
        };
      });
      showToast('error', `视频生成失败: ${result.error || '未知错误'}`);
    }
  };

  const handleGenerateAudio = async (shotId: string) => {
    if (!api || !project) return;

    // Update status locally first
    setProject((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        shots: prev.shots.map((s) =>
          s.id === shotId ? { ...s, status: 'generating_audio' as const } : s
        ),
      };
    });

    const result = await api.generate_audio_for_shot(shotId);

    if (result.success && result.shot) {
      updateShotInProject(result.shot);
      setIsDirty(true);
      showToast('success', '配音生成成功');
    } else {
      // Revert status on error
      setProject((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          shots: prev.shots.map((s) =>
            s.id === shotId ? { ...s, status: 'error' as const, errorMessage: result.error } : s
          ),
        };
      });
      showToast('error', `配音生成失败: ${result.error || '未知错误'}`);
    }
  };

  const handleBatchGenerateImages = () => {
    setBatchModalType('image');
    setBatchModalOpen(true);
  };

  const handleBatchGenerateVideos = () => {
    setBatchModalType('video');
    setBatchModalOpen(true);
  };

  const handleBatchGenerateAudios = () => {
    setBatchModalType('audio');
    setBatchModalOpen(true);
  };

  const handleExportJianyingDraft = async () => {
    if (!api) return;

    try {
      const result = await api.export_jianying_draft();
      if (result.success) {
        alert(`导出成功！\n草稿位置: ${result.path}`);
      } else {
        alert(`导出失败: ${result.error}`);
      }
    } catch (error) {
      console.error('Failed to export JianYing draft:', error);
      alert('导出失败');
    }
  };

  const handleBatchGenerate = async (shotIds: string[], _forceRegenerate: boolean) => {
    if (!api || shotIds.length === 0) return;

    setIsGenerating(true);
    setGenerationProgress({ current: 0, total: shotIds.length, type: batchModalType });

    // Mark shots as pending (waiting to be processed)
    // Actual "generating" status will be set by backend when each shot starts processing
    setProject((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        shots: prev.shots.map((s) =>
          shotIds.includes(s.id) ? { ...s, status: 'pending' as const } : s
        ),
      };
    });

    try {
      let result;
      switch (batchModalType) {
        case 'image':
          result = await api.generate_images_batch(shotIds);
          break;
        case 'video':
          result = await api.generate_videos_batch(shotIds);
          break;
        case 'audio':
          result = await api.generate_audios_batch(shotIds);
          break;
      }

      // Update project with results from batch generation
      if (result && result.results) {
        // Update each shot with its result
        setProject((prev) => {
          if (!prev) return prev;
          const updatedShots = [...prev.shots];
          
          for (const r of result.results as Array<{ shot_id: string; success: boolean; shot?: Shot; error?: string }>) {
            const idx = updatedShots.findIndex(s => s.id === r.shot_id);
            if (idx !== -1) {
              if (r.success && r.shot) {
                // Use the returned shot data
                updatedShots[idx] = r.shot;
              } else {
                // Mark as error
                updatedShots[idx] = {
                  ...updatedShots[idx],
                  status: 'error' as const,
                  errorMessage: r.error || 'Unknown error',
                };
              }
            }
          }
          
          return { ...prev, shots: updatedShots };
        });
        setIsDirty(true);

        // Count successes and failures
        const successCount = result.results.filter((r: { success: boolean }) => r.success).length;
        const failCount = result.results.length - successCount;

        if (failCount === 0) {
          showToast('success', `批量生成完成: ${successCount} 个成功`);
        } else {
          showToast('info', `批量生成完成: ${successCount} 个成功, ${failCount} 个失败`);
        }
      }
    } catch (error) {
      console.error('Batch generation failed:', error);
      // Reset status on error
      setProject((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          shots: prev.shots.map((s) =>
            shotIds.includes(s.id) ? { ...s, status: 'error' as const, errorMessage: 'Batch generation failed' } : s
          ),
        };
      });
      showToast('error', '批量生成失败');
    }

    setGenerationProgress({ current: shotIds.length, total: shotIds.length, type: batchModalType });
    setIsGenerating(false);
    setGenerationProgress(null);
  };

  // ========== Add Prefix to Image Prompts ==========

  const handleAddPrefix = () => {
    if (!project || !promptPrefix.trim()) return;

    const targetShots = selectedShotIds.length > 0
      ? project.shots.filter(s => selectedShotIds.includes(s.id))
      : project.shots;

    if (targetShots.length === 0) {
      showToast('error', '没有可添加前缀的镜头');
      return;
    }

    setProject((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        shots: prev.shots.map((shot) => {
          const shouldUpdate = selectedShotIds.length > 0
            ? selectedShotIds.includes(shot.id)
            : true;
          if (shouldUpdate && shot.imagePrompt) {
            return {
              ...shot,
              imagePrompt: `${promptPrefix.trim()} ${shot.imagePrompt}`,
            };
          }
          return shot;
        }),
      };
    });

    setIsDirty(true);
    setPrefixModalOpen(false);
    setPromptPrefix('');
    showToast('success', `已为 ${targetShots.length} 个镜头添加图片提示词前缀`);
  };

  // ========== Render Page Actions ==========

  const renderPageActions = () => {
    switch (currentPage) {
      case 'shots': {
        const selectedShots = (project?.shots || []).filter(s => selectedShotIds.includes(s.id));
        const hasSelection = selectedShots.length > 0;

        return (
          <div className="flex items-center gap-2">
            <button
              onClick={handleImportJsonl}
              className="flex items-center gap-2 px-3 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg text-sm text-slate-200 transition-colors"
            >
              <FileUp className="w-4 h-4" />
              导入JSONL
            </button>
            <button
              onClick={handleExportJsonlTemplate}
              className="flex items-center gap-2 px-3 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg text-sm text-slate-200 transition-colors"
            >
              <Download className="w-4 h-4" />
              JSONL模板
            </button>
            <button
              onClick={() => setPrefixModalOpen(true)}
              className="flex items-center gap-2 px-3 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg text-sm text-slate-200 transition-colors"
            >
              <Type className="w-4 h-4" />
              添加前缀
            </button>
            <div className="w-px h-6 bg-slate-700 mx-2" />
            <button
              onClick={handleBatchGenerateAudios}
              disabled={isGenerating || !hasSelection}
              className="flex items-center gap-2 px-3 py-2 bg-orange-600 hover:bg-orange-500 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg text-sm text-white transition-colors"
            >
              {isGenerating && generationProgress?.type === 'audio' ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  {generationProgress.current}/{generationProgress.total}
                </>
              ) : (
                <>
                  <Mic className="w-4 h-4" />
                  批量配音 ({selectedShots.length})
                </>
              )}
            </button>
            <button
              onClick={handleBatchGenerateImages}
              disabled={isGenerating || !hasSelection}
              className="flex items-center gap-2 px-3 py-2 bg-violet-600 hover:bg-violet-500 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg text-sm text-white transition-colors"
            >
              {isGenerating && generationProgress?.type === 'image' ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  {generationProgress.current}/{generationProgress.total}
                </>
              ) : (
                <>
                  <Image className="w-4 h-4" />
                  批量生图 ({selectedShots.length})
                </>
              )}
            </button>
            <button
              onClick={handleBatchGenerateVideos}
              disabled={isGenerating || !hasSelection}
              className="flex items-center gap-2 px-3 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg text-sm text-white transition-colors"
            >
              {isGenerating && generationProgress?.type === 'video' ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  {generationProgress.current}/{generationProgress.total}
                </>
              ) : (
                <>
                  <Video className="w-4 h-4" />
                  批量生视频 ({selectedShots.length})
                </>
              )}
            </button>
            <div className="w-px h-6 bg-slate-700 mx-2" />
            <button
              onClick={handleExportJianyingDraft}
              disabled={!project}
              className="flex items-center gap-2 px-3 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg text-sm text-white transition-colors"
            >
              <Film className="w-4 h-4" />
              导出剪映草稿
            </button>
          </div>
        );
      }
      case 'characters': {
        const pendingWithDescriptionCount = project?.characters.filter(c =>
          !c.isNarrator &&
          c.description?.trim() &&
          (c.status === 'pending' || !c.imageUrl)
        ).length || 0;
        const pendingCount = project?.characters.filter(c => !c.isNarrator && (c.status === 'pending' || !c.imageUrl)).length || 0;

        return (
          <div className="flex items-center gap-3">
            {pendingWithDescriptionCount > 0 && (
              <button
                onClick={handleGenerateAllCharacterImages}
                disabled={isGeneratingCharacters}
                className="flex items-center gap-2 px-4 py-2 bg-violet-600 hover:bg-violet-500 disabled:opacity-50 rounded-lg text-sm text-white transition-colors"
              >
                {isGeneratingCharacters ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    生成中...
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4" />
                    生成全部 ({pendingWithDescriptionCount})
                  </>
                )}
              </button>
            )}
            {pendingCount > pendingWithDescriptionCount && (
              <div className="text-xs text-amber-400">
                {pendingCount - pendingWithDescriptionCount} 个角色缺少描述
              </div>
            )}
            <button
              onClick={() => setImportCharacterModalOpen(true)}
              className="flex items-center gap-2 px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg text-sm text-slate-200 transition-colors"
            >
              <FileUp className="w-4 h-4" />
              导入角色
            </button>
            <button
              onClick={() => setAddCharacterModalOpen(true)}
              className="flex items-center gap-2 px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg text-sm text-slate-200 transition-colors"
            >
              <Plus className="w-4 h-4" />
              添加角色
            </button>
          </div>
        );
      }
      default:
        return null;
    }
  };

  const renderPageContent = () => {
    switch (currentPage) {
      case 'projects':
        return (
          <ProjectListPage
            onOpenProject={handleOpenProjectFromList}
            onNewProject={handleNewProjectWithName}
          />
        );
      case 'home':
        return <HomePage project={project} />;
      case 'shots':
        return (
          <ShotsPage
            shots={project?.shots || []}
            characters={project?.characters || []}
            selectedIds={selectedShotIds}
            onSelectShot={handleSelectShot}
            onSelectAll={handleSelectAllShots}
            onDeleteShots={handleDeleteShots}
            onGenerateImages={handleGenerateImages}
            onGenerateVideo={handleGenerateVideo}
            onGenerateAudio={handleGenerateAudio}
            onSelectImage={handleSelectImage}
            onSelectVideo={handleSelectVideo}
            onUpdateShot={handleUpdateShot}
            onFilterChange={setFilteredShots}
            onInsertShot={handleInsertShot}
            batchModalOpen={batchModalOpen}
            batchModalType={batchModalType}
            onBatchModalClose={() => setBatchModalOpen(false)}
            onBatchGenerate={handleBatchGenerate}
          />
        );
      case 'characters':
        return (
          <CharactersPage
            characters={project?.characters || []}
            onAddCharacter={handleAddCharacter}
            onUpdateCharacter={handleUpdateCharacter}
            onUpdateCharacterSpeed={handleUpdateCharacterSpeed}
            onDeleteCharacter={handleDeleteCharacter}
            onGenerateImage={handleGenerateCharacterImage}
            onUploadImage={handleUploadCharacterImage}
            onSetReferenceAudio={handleSetCharacterReferenceAudio}
            onImportFromText={handleImportCharactersFromText}
            onImportFromFile={handleImportCharactersFromFile}
            onConfirmImport={handleConfirmImportCharacters}
            onExportTemplate={handleExportCharacterTemplate}
            addModalOpen={addCharacterModalOpen}
            onAddModalOpenChange={setAddCharacterModalOpen}
            importModalOpen={importCharacterModalOpen}
            onImportModalOpenChange={setImportCharacterModalOpen}
          />
        );
      case 'dubbing':
        return (
          <DubbingPage
            shots={project?.shots || []}
            characters={project?.characters || []}
          />
        );
      case 'settings':
        return <SettingsPage />;
      default:
        return null;
    }
  };

  // ========== Render ==========

  if (!ready) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-violet-500 animate-spin" />
      </div>
    );
  }

  return (
    <div className="h-screen bg-slate-900 flex flex-col overflow-hidden">
      {/* Toast Notifications */}
      <Toast toasts={toasts} onRemove={removeToast} />

      {/* Header */}
      <header className="bg-slate-800 border-b border-slate-700 flex-shrink-0">
        <div className="px-4 py-3">
          <div className="flex items-center justify-between">
            {/* Left: Back button and Project info */}
            <div className="flex items-center gap-4">
              {/* Back button - only show when not on projects page */}
              {currentPage !== 'projects' && (
                <button
                  onClick={() => setCurrentPage('projects')}
                  className="p-2 hover:bg-slate-700 rounded-lg text-slate-400 hover:text-slate-200 transition-colors"
                  title="返回项目列表"
                >
                  <ArrowLeft className="w-5 h-5" />
                </button>
              )}

              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center">
                  <Film className="w-4 h-4 text-white" />
                </div>
                <div>
                  <h1 className="text-sm font-semibold text-slate-100">
                    {currentPage === 'projects' ? '荷塘AI' : (project?.name || '未命名项目')}
                    {isDirty && currentPage !== 'projects' && <span className="text-violet-400 ml-1">*</span>}
                  </h1>
                  <p className="text-xs text-slate-500">
                    {currentPage === 'projects' ? '项目管理' : `${project?.shots.length || 0} 个镜头`}
                  </p>
                </div>
              </div>
            </div>

            {/* Right: Page actions and project actions */}
            <div className="flex items-center gap-2">
              {/* Page-specific actions */}
              {currentPage !== 'projects' && renderPageActions()}

              {/* Project save button */}
              {currentPage !== 'projects' && (
                <>
                  {renderPageActions() && <div className="w-px h-6 bg-slate-700 mx-2" />}
                  <button
                    onClick={handleSaveProject}
                    disabled={!isDirty}
                    className="p-2 hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg text-slate-400 hover:text-slate-200 transition-colors"
                    title="保存项目"
                  >
                    <Save className="w-5 h-5" />
                  </button>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Progress bar - only show when generating */}
        {generationProgress && (
          <div className="px-4 pb-3">
            <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
              <span>
                正在生成{generationProgress.type === 'image' ? '图片' : generationProgress.type === 'video' ? '视频' : '配音'}...
              </span>
              <span>
                {generationProgress.current} / {generationProgress.total}
              </span>
            </div>
            <div className="h-1.5 bg-slate-700 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-300 ${
                  generationProgress.type === 'image' ? 'bg-violet-500' : generationProgress.type === 'video' ? 'bg-emerald-500' : 'bg-orange-500'
                }`}
                style={{
                  width: `${(generationProgress.current / generationProgress.total) * 100}%`,
                }}
              />
            </div>
          </div>
        )}
      </header>

      {/* Main Content */}
      <main className="flex-1 flex overflow-hidden">
        {/* Left Sidebar Navigation - only show when not on projects page */}
        {currentPage !== 'projects' && (
          <Sidebar currentPage={currentPage} onPageChange={setCurrentPage} />
        )}

        {/* Page Content */}
        <div className="flex-1 bg-slate-900 overflow-hidden h-full">
          {renderPageContent()}
        </div>
      </main>

      {/* Prefix Modal */}
      {prefixModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-slate-800 rounded-xl p-6 w-[500px] max-w-[90vw]">
            <h2 className="text-lg font-semibold text-white mb-4">添加图片提示词前缀</h2>
            <p className="text-sm text-slate-400 mb-4">
              {selectedShotIds.length > 0
                ? `将为选中的 ${selectedShotIds.length} 个镜头添加前缀`
                : `将为所有 ${project?.shots.length || 0} 个镜头添加前缀`}
            </p>
            <textarea
              value={promptPrefix}
              onChange={(e) => setPromptPrefix(e.target.value)}
              placeholder="输入要添加的前缀，例如：高清电影画质，"
              className="w-full h-24 px-3 py-2 bg-slate-700 rounded-lg text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-violet-500 resize-none"
              autoFocus
            />
            <div className="flex justify-end gap-3 mt-4">
              <button
                onClick={() => {
                  setPrefixModalOpen(false);
                  setPromptPrefix('');
                }}
                className="px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg text-sm text-slate-200 transition-colors"
              >
                取消
              </button>
              <button
                onClick={handleAddPrefix}
                disabled={!promptPrefix.trim()}
                className="px-4 py-2 bg-violet-600 hover:bg-violet-500 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg text-sm text-white transition-colors"
              >
                添加前缀
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
