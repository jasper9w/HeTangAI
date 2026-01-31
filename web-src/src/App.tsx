/**
 * AI Lens Creation Workshop - Main Application
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Film,
  Plus,
  Loader2,
  ArrowLeft,
  FileUp,
  Image,
  Sparkles,
  Type,
  Clock,
  Check,
  Bug,
  ChevronDown,
  ClipboardPaste,
  Download,
} from 'lucide-react';
import { useApi } from './hooks/useApi';
import { Sidebar } from './components/layout/Sidebar';
import { ProjectListPage } from './pages/ProjectListPage';
import { HomePage } from './pages/HomePage';
import { ShotsPage } from './pages/ShotsPage';
import { ShotBuilderPage } from './pages/ShotBuilderPage.tsx';
import { ProjectSettingsPage } from './pages/ProjectSettingsPage';
import { CharactersPage } from './pages/CharactersPage';
import { ScenesPage } from './pages/ScenesPage';
import { DubbingPage } from './pages/DubbingPage';
import { SettingsPage } from './pages/SettingsPage';
import { Toast, type ToastMessage } from './components/ui/Toast';
import { ImportDropdown } from './components/ui/ImportDropdown';
import { ExportDropdown } from './components/ui/ExportDropdown';
import { GenerateDropdown } from './components/ui/GenerateDropdown';
import { UpdateModal } from './components/ui/UpdateModal';
import { ExportProgressModal, type ExportProgress } from './components/ui/ExportProgressModal';
import { TaskStatusBar, TaskPanel } from './components/tasks';
import { useTaskPolling } from './hooks/useTaskPolling';
import type { ProjectData, Shot, PageType, ImportedCharacter, Character, Scene } from './types';

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

  // Generation state (isGenerating kept for ShotsPageActions prop compatibility)
  const [isGenerating, _setIsGenerating] = useState(false);
  const [isGeneratingCharacters, setIsGeneratingCharacters] = useState(false);
  const [isGeneratingScenes, setIsGeneratingScenes] = useState(false);
  const [generationProgress, setGenerationProgress] = useState<{
    current: number;
    total: number;
    type: 'image' | 'video' | 'audio';
  } | null>(null);

  // Export state
  const [exportModalOpen, setExportModalOpen] = useState(false);
  const [exportProgress, setExportProgress] = useState<ExportProgress | null>(null);
  const [exportOutputPath, setExportOutputPath] = useState<string | undefined>(undefined);

  // Character modal state
  const [addCharacterModalOpen, setAddCharacterModalOpen] = useState(false);
  const [importCharacterModalOpen, setImportCharacterModalOpen] = useState(false);
  const [importCharacterMode, setImportCharacterMode] = useState<'paste' | 'file'>('paste');

  // Scene modal state
  const [addSceneModalOpen, setAddSceneModalOpen] = useState(false);

  // One-click import conflict state
  const [importConflictOpen, setImportConflictOpen] = useState(false);
  const [importConflictTarget, setImportConflictTarget] = useState<'characters' | 'scenes' | 'shots'>('characters');

  // Version and update state
  const [appVersion, setAppVersion] = useState<string>('0.0.0');
  const [isCheckingUpdate, setIsCheckingUpdate] = useState(false);
  const [updateModalOpen, setUpdateModalOpen] = useState(false);
  const [hasUpdate, setHasUpdate] = useState(false); // 是否有新版本
  const [updateInfo, setUpdateInfo] = useState<{
    hasUpdate: boolean;
    currentVersion: string;
    latestVersion: string;
    releaseNotes: string;
    downloadUrl: string;
    releaseUrl: string;
  } | null>(null);
  const [importConflictTotal, setImportConflictTotal] = useState(0);
  const [importConflictCount, setImportConflictCount] = useState(0);

  // Prefix modal state
  const [shotPrefixModalOpen, setShotPrefixModalOpen] = useState(false);
  const [characterPrefixModalOpen, setCharacterPrefixModalOpen] = useState(false);
  const [shotImagePrefix, setShotImagePrefix] = useState('');
  const [shotVideoPrefix, setShotVideoPrefix] = useState('');
  const [characterPromptPrefix, setCharacterPromptPrefix] = useState('');

  // Task panel state
  const [taskPanelOpen, setTaskPanelOpen] = useState(false);

  // Task polling - only enabled when a project is loaded
  const {
    summary: taskSummary,
    refreshSummary: refreshTaskSummary,
  } = useTaskPolling({
    enabled: !!project,
    summaryInterval: 5000,
    runningInterval: 2000,
  });

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
    } else {
      showToast('error', `保存失败: ${result.error || '未知错误'}`);
    }
  }, [api, project, projectPath, projectName, showToast]);

  // Fetch app version on mount
  useEffect(() => {
    if (!api) return;
    api.get_app_version().then((version: string) => {
      setAppVersion(version);
    });
  }, [api]);

  // Check for updates (silent mode for auto-check, show modal for manual check)
  const checkUpdate = useCallback(async (silent: boolean) => {
    if (!api) return;
    setIsCheckingUpdate(true);
    try {
      const result = await api.check_for_updates();
      if (result.success) {
        const updateData = {
          hasUpdate: result.hasUpdate ?? false,
          currentVersion: result.currentVersion ?? '',
          latestVersion: result.latestVersion ?? '',
          releaseNotes: result.releaseNotes ?? '',
          downloadUrl: result.downloadUrl ?? '',
          releaseUrl: result.releaseUrl ?? '',
        };
        setUpdateInfo(updateData);
        setHasUpdate(updateData.hasUpdate);
        // 只有手动检查时才显示弹窗
        if (!silent) {
          setUpdateModalOpen(true);
        }
      } else if (!silent) {
        showToast('error', result.error || '检查更新失败');
      }
    } catch {
      if (!silent) {
        showToast('error', '检查更新失败');
      }
    } finally {
      setIsCheckingUpdate(false);
    }
  }, [api, showToast]);

  // Manual check for updates (shows modal)
  const handleCheckUpdate = useCallback(() => {
    if (isCheckingUpdate) return;
    checkUpdate(false);
  }, [checkUpdate, isCheckingUpdate]);

  // Auto check for updates on startup (silent, only once)
  const hasCheckedUpdate = useRef(false);
  useEffect(() => {
    if (!api || hasCheckedUpdate.current) return;
    hasCheckedUpdate.current = true;
    // 延迟2秒检查，避免影响启动速度
    const timer = setTimeout(() => {
      checkUpdate(true);
    }, 2000);
    return () => clearTimeout(timer);
  }, [api, checkUpdate]);

  // Open download page
  const handleOpenDownloadPage = useCallback(async (url: string) => {
    if (!api) return;
    await api.open_download_page(url);
    setUpdateModalOpen(false);
  }, [api]);

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

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).onExportProgress = (progress: ExportProgress) => {
      setExportProgress(progress);
      if (progress.stage === 'done') {
        setExportOutputPath(progress.message);
      }
    };

    // Listen for character updates from task system
    const handleCharacterUpdate = (event: CustomEvent<{ characterId: string; character: Character }>) => {
      const { characterId, character } = event.detail;
      setProject((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          characters: prev.characters.map((c) =>
            c.id === characterId ? character : c
          ),
        };
      });
      setIsDirty(true);
    };

    // Listen for scene updates from task system
    const handleSceneUpdate = (event: CustomEvent<{ sceneId: string; scene: Scene }>) => {
      const { sceneId, scene } = event.detail;
      setProject((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          scenes: (prev.scenes || []).map((s) =>
            s.id === sceneId ? scene : s
          ),
        };
      });
      setIsDirty(true);
    };

    window.addEventListener('characterUpdate', handleCharacterUpdate as EventListener);
    window.addEventListener('sceneUpdate', handleSceneUpdate as EventListener);

    return () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      delete (window as any).onShotStatusChange;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      delete (window as any).onProgressIncrement;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      delete (window as any).onExportProgress;
      window.removeEventListener('characterUpdate', handleCharacterUpdate as EventListener);
      window.removeEventListener('sceneUpdate', handleSceneUpdate as EventListener);
    };
  }, []);

  // Keyboard shortcut: Cmd+S / Ctrl+S and ESC to close modals
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault();
        if (api && project) {
          handleSaveProject();
        }
      }
      // ESC to close import conflict modal
      if (e.key === 'Escape') {
        if (importConflictOpen) {
          setImportConflictOpen(false);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [api, project, handleSaveProject, importConflictOpen]);

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

  const handleImportExcel = async () => {
    if (!api) return;
    const result = await api.import_excel();
    if (result.success && result.data) {
      setProject(result.data);
      setIsDirty(true);
      if (result.count > 0) {
        showToast('success', `成功导入 ${result.count} 个镜头`);
      }
      if (result.errors.length > 0) {
        console.warn('Import warnings:', result.errors);
      }
    }
  };

  const handleExportExcelTemplate = async () => {
    if (!api) return;
    await api.export_excel_template();
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

    if (result.success && result.task_id) {
      // Task created successfully - update character with task_id
      // The actual result will come via characterUpdate event
      setProject((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          characters: prev.characters.map((c) =>
            c.id === id ? { ...c, status: 'generating' as const, imageTaskId: result.task_id } : c
          ),
        };
      });
      setIsDirty(true);
      showToast('info', '角色图片生成任务已创建');
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
      showToast('error', `创建角色图片生成任务失败: ${result.error || '未知错误'}`);
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

  const handleSmartAssignAudios = async (mode: 'empty_only' | 'all') => {
    if (!api || !project) {
      return { success: false, assignedCount: 0, skippedCount: 0, error: 'No project loaded' };
    }

    // Use LLM-based smart assignment
    const result = await api.smart_assign_audios_with_llm(mode);
    if (result.success) {
      // Reload project data to get updated characters
      const projectResult = await api.get_project_data();
      if (projectResult.success && projectResult.data) {
        setProject(projectResult.data);
        setIsDirty(true);
      }
    }
    return result;
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

  const handleRemoveCharacterImage = async (id: string) => {
    if (!api || !project) return;

    const result = await api.remove_character_image(id);
    if (result.success && result.character) {
      setProject({
        ...project,
        characters: project.characters.map((c) =>
          c.id === id ? result.character! : c
        ),
      });
      setIsDirty(true);
      showToast('success', '已移除角色图片');
    } else if (result.error) {
      showToast('error', `移除失败: ${result.error}`);
    }
  };

  // ========== Scene Operations ==========

  const handleAddScene = async (name: string, prompt: string) => {
    if (!api || !project) return;
    const result = await api.add_scene(name, prompt);
    if (result.success && result.scene) {
      setProject({
        ...project,
        scenes: [...(project.scenes || []), result.scene],
      });
      setIsDirty(true);
    }
  };

  const handleUpdateScene = async (id: string, name: string, prompt: string) => {
    if (!api || !project) return;
    const result = await api.update_scene(id, name, prompt);
    if (result.success && result.scene) {
      setProject({
        ...project,
        scenes: (project.scenes || []).map((s) =>
          s.id === id ? result.scene! : s
        ),
      });
      setIsDirty(true);
    }
  };

  const handleDeleteScene = async (id: string) => {
    if (!api || !project) return;
    const result = await api.delete_scene(id);
    if (result.success) {
      setProject({
        ...project,
        scenes: (project.scenes || []).filter((s) => s.id !== id),
      });
      setIsDirty(true);
    }
  };

  const handleGenerateSceneImage = async (id: string) => {
    if (!api) return;
    setProject((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        scenes: (prev.scenes || []).map((s) =>
          s.id === id ? { ...s, status: 'generating' as const } : s
        ),
      };
    });

    const result = await api.generate_scene_image(id);
    if (result.success && result.task_id) {
      // Task created successfully - update scene with task_id
      // The actual result will come via sceneUpdate event
      setProject((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          scenes: (prev.scenes || []).map((s) =>
            s.id === id ? { ...s, status: 'generating' as const, imageTaskId: result.task_id } : s
          ),
        };
      });
      setIsDirty(true);
      showToast('info', '场景图片生成任务已创建');
    } else {
      setProject((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          scenes: (prev.scenes || []).map((s) =>
            s.id === id ? { ...s, status: 'error' as const, errorMessage: result.error } : s
          ),
        };
      });
      showToast('error', `创建场景图片生成任务失败: ${result.error || '未知错误'}`);
    }
  };

  const handleUploadSceneImage = async (id: string) => {
    if (!api || !project) return;
    const result = await api.upload_scene_image(id);
    if (result.success && result.scene) {
      setProject((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          scenes: (prev.scenes || []).map((s) =>
            s.id === id ? result.scene! : s
          ),
        };
      });
      setIsDirty(true);
      showToast('success', '场景图片上传成功');
    } else if (result.error && result.error !== 'No file selected') {
      showToast('error', `场景图片上传失败: ${result.error}`);
    }
  };

  const handleGenerateAllSceneImages = async () => {
    if (!api || !project) return;

    const pendingScenes = (project.scenes || []).filter(
      (s) => (s.status === 'pending' || !s.imageUrl) && s.prompt.trim()
    );

    if (pendingScenes.length === 0) return;

    setIsGeneratingScenes(true);

    for (const scene of pendingScenes) {
      await handleGenerateSceneImage(scene.id);
    }

    setIsGeneratingScenes(false);
  };

  // ========== One-Click Import ==========

  const handleImportShotBuilder = async (
    target: 'characters' | 'scenes' | 'shots',
    strategy?: 'overwrite' | 'skip' | 'cancel'
  ) => {
    if (!api || !project) return;
    let result;
    if (target === 'characters') {
      result = await api.import_shot_builder_roles(strategy);
    } else if (target === 'scenes') {
      result = await api.import_shot_builder_scenes(strategy);
    } else {
      result = await api.import_shot_builder_shots(strategy);
    }

    if (!result.success && result.conflicts && result.total !== undefined) {
      setImportConflictTarget(target);
      setImportConflictTotal(result.total);
      setImportConflictCount(result.conflicts.length);
      setImportConflictOpen(true);
      return;
    }

    if (!result.success) {
      if (result.error && result.error !== 'cancelled') {
        showToast('error', `导入失败: ${result.error}`);
      }
      return;
    }

    // Refresh project data after import
    const dataResult = await api.get_project_data();
    if (dataResult.success && dataResult.data) {
      setProject(dataResult.data);
      setIsDirty(true);
    }

    const importedCount = result.importedCount || 0;
    const overwrittenCount = result.overwrittenCount || 0;
    const skippedCount = result.skippedCount || 0;
    const summary = [
      importedCount ? `导入 ${importedCount}` : '',
      overwrittenCount ? `覆盖 ${overwrittenCount}` : '',
      skippedCount ? `跳过 ${skippedCount}` : '',
    ].filter(Boolean).join('，');
    showToast('success', summary ? `导入完成：${summary}` : '导入完成');
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

  const handleDeleteImage = async (shotId: string, imageIndex: number) => {
    if (!api || !project) return;
    const result = await api.delete_shot_image(shotId, imageIndex);
    if (result.success && result.shot) {
      setProject({
        ...project,
        shots: project.shots.map((s) =>
          s.id === shotId ? result.shot! : s
        ),
      });
      setIsDirty(true);
    } else {
      showToast('error', `删除图片失败: ${result.error || '未知错误'}`);
    }
  };

  const handleDeleteVideo = async (shotId: string, videoIndex: number) => {
    if (!api || !project) return;
    const result = await api.delete_shot_video(shotId, videoIndex);
    if (result.success && result.shot) {
      setProject({
        ...project,
        shots: project.shots.map((s) =>
          s.id === shotId ? result.shot! : s
        ),
      });
      setIsDirty(true);
    } else {
      showToast('error', `删除视频失败: ${result.error || '未知错误'}`);
    }
  };

  const handleUpdateShot = async (shotId: string, field: string, value: string | string[] | { role: string; text: string }[]) => {
    if (!api || !project) return;
    // Update locally first for responsiveness - 使用函数式更新确保连续调用时状态正确
    setProject(prev => {
      if (!prev) return prev;
      return {
        ...prev,
        shots: prev.shots.map((s) =>
          s.id === shotId ? { ...s, [field]: value } : s
        ),
      };
    });
    setIsDirty(true);
    // Then sync to backend
    await api.update_shot(shotId, field, value);
  };

  // ========== Generation Operations ==========

  const handleGenerateImages = async (shotId: string) => {
    if (!api || !project) return;

    // Use task system - submit as batch with single shot
    setProject((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        shots: prev.shots.map((s) =>
          s.id === shotId ? { ...s, status: 'generating_images' as const } : s
        ),
      };
    });

    try {
      const result = await api.generate_images_batch([shotId]);
      if (result.success) {
        refreshTaskSummary();
        showToast('success', '已提交图片生成任务');
      } else {
        setProject((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            shots: prev.shots.map((s) =>
              s.id === shotId ? { ...s, status: 'error' as const, errorMessage: result.error } : s
            ),
          };
        });
        showToast('error', `提交失败: ${result.error || '未知错误'}`);
      }
    } catch (error) {
      console.error('Failed to submit image task:', error);
      showToast('error', '提交图片生成任务失败');
    }
  };

  const handleGenerateVideo = async (shotId: string) => {
    if (!api || !project) return;

    // Use task system - submit as batch with single shot
    setProject((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        shots: prev.shots.map((s) =>
          s.id === shotId ? { ...s, status: 'generating_video' as const } : s
        ),
      };
    });

    try {
      const result = await api.generate_videos_batch([shotId]);
      if (result.success) {
        refreshTaskSummary();
        showToast('success', '已提交视频生成任务');
      } else {
        setProject((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            shots: prev.shots.map((s) =>
              s.id === shotId ? { ...s, status: 'error' as const, errorMessage: result.error } : s
            ),
          };
        });
        showToast('error', `提交失败: ${result.error || '未知错误'}`);
      }
    } catch (error) {
      console.error('Failed to submit video task:', error);
      showToast('error', '提交视频生成任务失败');
    }
  };

  const handleGenerateAudio = async (shotId: string) => {
    if (!api || !project) return;

    // Use task system - submit as batch with single shot
    setProject((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        shots: prev.shots.map((s) =>
          s.id === shotId ? { ...s, status: 'generating_audio' as const } : s
        ),
      };
    });

    try {
      const result = await api.generate_audios_batch([shotId]);
      if (result.success) {
        refreshTaskSummary();
        showToast('success', '已提交配音生成任务');
      } else {
        setProject((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            shots: prev.shots.map((s) =>
              s.id === shotId ? { ...s, status: 'error' as const, errorMessage: result.error } : s
            ),
          };
        });
        showToast('error', `提交失败: ${result.error || '未知错误'}`);
      }
    } catch (error) {
      console.error('Failed to submit audio task:', error);
      showToast('error', '提交配音生成任务失败');
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

  const handleExportFinalVideo = async (withSubtitles: boolean) => {
    if (!api) return;

    try {
      // Reset state and open modal
      setExportProgress(null);
      setExportOutputPath(undefined);
      setExportModalOpen(true);

      const result = await api.export_final_video(withSubtitles);
      if (!result.success) {
        // If failed to start, show error in modal
        setExportProgress({
          stage: 'error',
          current: 0,
          total: 0,
          message: result.error || 'Unknown error',
        });
      }
      // Success just means export started - progress will come via onExportProgress callback
    } catch (error) {
      console.error('Failed to export final video:', error);
      setExportProgress({
        stage: 'error',
        current: 0,
        total: 0,
        message: 'Failed to start export',
      });
    }
  };

  const handleCancelExport = async () => {
    if (!api) return;
    try {
      await api.cancel_export_final_video();
    } catch (error) {
      console.error('Failed to cancel export:', error);
    }
  };

  const handleCloseExportModal = () => {
    setExportModalOpen(false);
    setExportProgress(null);
    setExportOutputPath(undefined);
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

  const handleExportAudioSrt = async () => {
    if (!api) return;

    try {
      const result = await api.export_audio_srt();
      if (result.success) {
        alert(`导出成功！\nSRT文件: ${result.srtPath}\nWAV文件: ${result.wavPath}`);
      } else {
        alert(`导出失败: ${result.error}`);
      }
    } catch (error) {
      console.error('Failed to export audio SRT:', error);
      alert('导出失败');
    }
  };

  const handleExportAudioText = async () => {
    if (!api) return;

    try {
      const result = await api.export_audio_text();
      if (result.success) {
        alert(`导出成功！\n文件位置: ${result.path}`);
      } else {
        alert(`导出失败: ${result.error}`);
      }
    } catch (error) {
      console.error('Failed to export audio text:', error);
      alert('导出失败');
    }
  };

  const handleBatchGenerate = async (shotIds: string[], _forceRegenerate: boolean) => {
    if (!api || shotIds.length === 0) return;

    // Mark shots with appropriate generating status based on type
    const statusMap = {
      image: 'generating_images' as const,
      video: 'generating_video' as const,
      audio: 'generating_audio' as const,
    };
    const generatingStatus = statusMap[batchModalType];
    
    setProject((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        shots: prev.shots.map((s) =>
          shotIds.includes(s.id) ? { ...s, status: generatingStatus } : s
        ),
      };
    });

    try {
      let result: { success: boolean; task_ids?: string[]; errors?: string[]; message?: string; error?: string } | undefined;
      const typeNames = { image: '图片', video: '视频', audio: '音频' };
      const typeName = typeNames[batchModalType];

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

      if (result?.success) {
        const taskCount = result.task_ids?.length || 0;
        const errorCount = result.errors?.length || 0;
        
        // Refresh task summary to show new tasks
        refreshTaskSummary();
        
        if (errorCount === 0) {
          showToast('success', `已提交 ${taskCount} 个${typeName}生成任务`);
        } else {
          showToast('info', `已提交 ${taskCount} 个任务，${errorCount} 个失败`);
          console.warn('Batch generation errors:', result.errors);
        }
      } else {
        showToast('error', `批量生成失败: ${result?.error || '未知错误'}`);
        // Reset status on error
        setProject((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            shots: prev.shots.map((s) =>
              shotIds.includes(s.id) ? { ...s, status: 'error' as const, errorMessage: result?.error || 'Failed' } : s
            ),
          };
        });
      }
    } catch (error) {
      console.error('Batch generation failed:', error);
      showToast('error', '批量生成请求失败');
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
    }

    // Close batch modal
    setBatchModalOpen(false);
  };

  // ========== Save Prompt Prefixes ==========

  const handleSaveShotPrefixes = () => {
    if (!project) return;
    setProject((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        promptPrefixes: {
          shotImagePrefix: shotImagePrefix.trim(),
          shotVideoPrefix: shotVideoPrefix.trim(),
          characterPrefix: prev.promptPrefixes?.characterPrefix || '',
        },
      };
    });
    setIsDirty(true);
    setShotPrefixModalOpen(false);
    showToast('success', '已更新镜头提示词前缀');
  };

  const handleSaveCharacterPrefix = () => {
    if (!project) return;
    setProject((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        promptPrefixes: {
          shotImagePrefix: prev.promptPrefixes?.shotImagePrefix || '',
          shotVideoPrefix: prev.promptPrefixes?.shotVideoPrefix || '',
          characterPrefix: characterPromptPrefix.trim(),
        },
      };
    });
    setIsDirty(true);
    setCharacterPrefixModalOpen(false);
    showToast('success', '已更新角色提示词前缀');
  };

  // ========== Render Page Actions ==========

  const renderPageActions = () => {
    switch (currentPage) {
      case 'shots': {
        const selectedShots = (project?.shots || []).filter(s => selectedShotIds.includes(s.id));

        return (
          <div className="flex items-center gap-2">
            <ImportDropdown
              onOneClickImport={() => handleImportShotBuilder('shots')}
              onImportExcel={handleImportExcel}
              onExportExcelTemplate={handleExportExcelTemplate}
              onImportJsonl={handleImportJsonl}
              onExportJsonlTemplate={handleExportJsonlTemplate}
            />
            <GenerateDropdown
              onAddPrefix={() => {
                setShotImagePrefix(project?.promptPrefixes?.shotImagePrefix || '');
                setShotVideoPrefix(project?.promptPrefixes?.shotVideoPrefix || '');
                setShotPrefixModalOpen(true);
              }}
              onBatchAudio={handleBatchGenerateAudios}
              onBatchImage={handleBatchGenerateImages}
              onBatchVideo={handleBatchGenerateVideos}
              selectedCount={selectedShots.length}
              isGenerating={isGenerating}
              generationProgress={generationProgress}
            />
            <ExportDropdown
              onExportFinalVideo={handleExportFinalVideo}
              onExportJianyingDraft={handleExportJianyingDraft}
              onExportAudioSrt={handleExportAudioSrt}
              onExportAudioText={handleExportAudioText}
              disabled={!project}
            />
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
                className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-teal-600 to-teal-500 hover:from-teal-500 hover:to-teal-400 disabled:opacity-50 rounded-lg text-sm text-white transition-colors"
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
              onClick={() => {
                setCharacterPromptPrefix(project?.promptPrefixes?.characterPrefix || '');
                setCharacterPrefixModalOpen(true);
              }}
              className="flex items-center gap-2 px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg text-sm text-slate-200 transition-colors"
            >
              <Type className="w-4 h-4" />
              角色前缀
            </button>
            <div className="relative group">
              <button className="flex items-center gap-2 px-3 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg text-sm text-slate-200 transition-colors">
                <FileUp className="w-4 h-4" />
                导入
                <ChevronDown className="w-3 h-3" />
              </button>
              <div className="absolute left-0 top-full mt-1 w-36 bg-slate-800 border border-slate-700 rounded-lg shadow-xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-150 z-50">
                {/* 一键导入 */}
                <div className="py-1">
                  <button
                    onClick={() => handleImportShotBuilder('characters')}
                    className="w-full flex items-center gap-2 px-3 py-2 text-sm text-slate-200 hover:bg-slate-700 transition-colors"
                  >
                    <Sparkles className="w-4 h-4 text-teal-400" />
                    一键导入
                  </button>
                </div>
                <div className="border-t border-slate-700" />
                {/* 粘贴导入 */}
                <div className="py-1">
                  <button
                    onClick={() => {
                      setImportCharacterMode('paste');
                      setImportCharacterModalOpen(true);
                    }}
                    className="w-full flex items-center gap-2 px-3 py-2 text-sm text-slate-200 hover:bg-slate-700 transition-colors"
                  >
                    <ClipboardPaste className="w-4 h-4 text-slate-400" />
                    粘贴导入
                  </button>
                </div>
                <div className="border-t border-slate-700" />
                {/* 文件导入/导出 */}
                <div className="py-1">
                  <button
                    onClick={() => {
                      setImportCharacterMode('file');
                      setImportCharacterModalOpen(true);
                    }}
                    className="w-full flex items-center gap-2 px-3 py-2 text-sm text-slate-200 hover:bg-slate-700 transition-colors"
                  >
                    <FileUp className="w-4 h-4 text-slate-400" />
                    文件导入
                  </button>
                  <button
                    onClick={handleExportCharacterTemplate}
                    className="w-full flex items-center gap-2 px-3 py-2 text-sm text-slate-200 hover:bg-slate-700 transition-colors"
                  >
                    <Download className="w-4 h-4 text-slate-400" />
                    导出模板
                  </button>
                </div>
              </div>
            </div>
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
      case 'scenes':
        const pendingScenes = (project?.scenes || []).filter(
          (s) => s.status === 'pending' || !s.imageUrl
        );
        const pendingWithPromptCount = pendingScenes.filter((s) => s.prompt?.trim()).length;
        const missingPromptCount = pendingScenes.length - pendingWithPromptCount;

        return (
          <div className="flex items-center gap-3">
            {pendingWithPromptCount > 0 && (
              <button
                onClick={handleGenerateAllSceneImages}
                disabled={isGeneratingScenes}
                className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-teal-600 to-teal-500 hover:from-teal-500 hover:to-teal-400 disabled:opacity-50 rounded-lg text-sm text-white transition-colors"
              >
                {isGeneratingScenes ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    生成中...
                  </>
                ) : (
                  <>
                    <Image className="w-4 h-4" />
                    生成全部 ({pendingWithPromptCount})
                  </>
                )}
              </button>
            )}
            {missingPromptCount > 0 && (
              <div className="text-xs text-amber-400">
                {missingPromptCount} 个场景缺少提示词
              </div>
            )}
            <button
              onClick={() => handleImportShotBuilder('scenes')}
              className="flex items-center gap-2 px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg text-sm text-slate-200 transition-colors"
            >
              <FileUp className="w-4 h-4" />
              一键导入
            </button>
            <button
              onClick={() => setAddSceneModalOpen(true)}
              className="flex items-center gap-2 px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg text-sm text-slate-200 transition-colors"
            >
              <Plus className="w-4 h-4" />
              添加场景
            </button>
          </div>
        );
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
            scenes={project?.scenes || []}
            aspectRatio={project?.settings?.creationParams?.aspectRatio || '16:9'}
            selectedIds={selectedShotIds}
            onSelectShot={handleSelectShot}
            onSelectAll={handleSelectAllShots}
            onDeleteShots={handleDeleteShots}
            onGenerateImages={handleGenerateImages}
            onGenerateVideo={handleGenerateVideo}
            onGenerateAudio={handleGenerateAudio}
            onSelectImage={handleSelectImage}
            onSelectVideo={handleSelectVideo}
            onDeleteImage={handleDeleteImage}
            onDeleteVideo={handleDeleteVideo}
            onUpdateShot={handleUpdateShot}
            onFilterChange={setFilteredShots}
            onInsertShot={handleInsertShot}
            batchModalOpen={batchModalOpen}
            batchModalType={batchModalType}
            onBatchModalClose={() => setBatchModalOpen(false)}
            onBatchGenerate={handleBatchGenerate}
          />
        );
      case 'projectSettings':
        return (
          <ProjectSettingsPage
            projectName={projectName}
            showToast={showToast}
            onSettingsChange={(settings) => {
              setProject((prev) => prev ? { ...prev, settings } : prev);
            }}
          />
        );
      case 'storyboard':
        return (
          <ShotBuilderPage
            projectName={projectName}
            showToast={showToast}
          />
        );
      case 'characters':
        return (
          <CharactersPage
            characters={project?.characters || []}
            aspectRatio={project?.settings?.creationParams?.aspectRatio || '16:9'}
            onAddCharacter={handleAddCharacter}
            onUpdateCharacter={handleUpdateCharacter}
            onUpdateCharacterSpeed={handleUpdateCharacterSpeed}
            onDeleteCharacter={handleDeleteCharacter}
            onGenerateImage={handleGenerateCharacterImage}
            onUploadImage={handleUploadCharacterImage}
            onRemoveImage={handleRemoveCharacterImage}
            onSetReferenceAudio={handleSetCharacterReferenceAudio}
            onSmartAssign={handleSmartAssignAudios}
            onImportFromText={handleImportCharactersFromText}
            onImportFromFile={handleImportCharactersFromFile}
            onConfirmImport={handleConfirmImportCharacters}
            onExportTemplate={handleExportCharacterTemplate}
            addModalOpen={addCharacterModalOpen}
            onAddModalOpenChange={setAddCharacterModalOpen}
            importModalOpen={importCharacterModalOpen}
            onImportModalOpenChange={setImportCharacterModalOpen}
            importMode={importCharacterMode}
          />
        );
      case 'scenes':
        return (
          <ScenesPage
            scenes={project?.scenes || []}
            aspectRatio={project?.settings?.creationParams?.aspectRatio || '16:9'}
            onAddScene={handleAddScene}
            onUpdateScene={handleUpdateScene}
            onDeleteScene={handleDeleteScene}
            onGenerateImage={handleGenerateSceneImage}
            onUploadImage={handleUploadSceneImage}
            addModalOpen={addSceneModalOpen}
            onAddModalOpenChange={setAddSceneModalOpen}
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
        <Loader2 className="w-8 h-8 text-teal-500 animate-spin" />
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
                <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-teal-500 to-cyan-600 flex items-center justify-center">
                  <Film className="w-4 h-4 text-white" />
                </div>
                <div>
                  <h1 className="text-sm font-semibold text-slate-100">
                    {currentPage === 'projects' ? '荷塘AI' : (project?.name || '未命名项目')}
                    {isDirty && currentPage !== 'projects' && <span className="text-teal-400 ml-1">*</span>}
                  </h1>
                  <p className="text-xs text-slate-500">
                    {currentPage === 'projects' ? '项目管理' : `${project?.shots.length || 0} 个镜头`}
                  </p>
                </div>
              </div>
            </div>

            {/* Right: Page actions */}
            <div className="flex items-center gap-2">
              {/* Page-specific actions */}
              {currentPage !== 'projects' && renderPageActions()}
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
                  generationProgress.type === 'image' ? 'bg-teal-500' : generationProgress.type === 'video' ? 'bg-emerald-500' : 'bg-orange-500'
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

      {/* Status Bar - only show when in project */}
      {currentPage !== 'projects' && (
        <div className="h-6 bg-slate-800 border-t border-slate-700 px-4 flex items-center justify-between text-xs text-slate-500 flex-shrink-0">
          {/* Left: Version */}
          <div className="flex items-center gap-4">
            <button
              onClick={handleCheckUpdate}
              disabled={isCheckingUpdate}
              className={`flex items-center gap-1 transition-colors disabled:cursor-wait ${
                hasUpdate 
                  ? 'text-amber-400 hover:text-amber-300 animate-pulse' 
                  : 'text-slate-500 hover:text-slate-300'
              }`}
              title={hasUpdate ? '有新版本可用，点击查看' : '点击检查更新'}
            >
              {isCheckingUpdate && (
                <Loader2 className="w-3 h-3 animate-spin" />
              )}
              <span>v{appVersion}{hasUpdate ? ' (有更新)' : ''}</span>
            </button>
          </div>

          {/* Center: Task Status + Save Status */}
          <div className="flex items-center gap-4">
            {taskSummary && (
              <TaskStatusBar
                summary={taskSummary}
                onClick={() => setTaskPanelOpen(true)}
              />
            )}
            {isDirty ? (
              <div className="flex items-center gap-1.5">
                <Clock className="w-3 h-3 text-amber-400" />
                <span className="text-slate-400">未保存</span>
                <kbd className="px-1.5 py-0.5 bg-slate-700 rounded text-slate-500 font-mono text-[10px]">{typeof navigator !== 'undefined' && navigator.platform.toUpperCase().indexOf('MAC') >= 0 ? '⌘S' : 'Ctrl+S'}</kbd>
              </div>
            ) : (
              <div className="flex items-center gap-1.5">
                <Check className="w-3 h-3 text-emerald-400" />
                <span className="text-slate-400">已保存</span>
              </div>
            )}
          </div>

          {/* Right: Debug */}
          <div className="flex items-center gap-4">
            <button
              onClick={() => api.open_logs_dir()}
              className="flex items-center gap-1 text-slate-500 hover:text-slate-300 transition-colors"
              title="打开调试日志目录"
            >
              <Bug className="w-3 h-3" />
              <span>日志</span>
            </button>
          </div>
        </div>
      )}

      {/* Task Panel */}
      {taskSummary && (
        <TaskPanel
          isOpen={taskPanelOpen}
          onClose={() => setTaskPanelOpen(false)}
          summary={taskSummary}
          onRefresh={refreshTaskSummary}
        />
      )}

      {/* Update Modal */}
      <UpdateModal
        isOpen={updateModalOpen}
        onClose={() => setUpdateModalOpen(false)}
        updateInfo={updateInfo}
        onDownload={handleOpenDownloadPage}
      />

      {/* Export Progress Modal */}
      <ExportProgressModal
        isOpen={exportModalOpen}
        progress={exportProgress}
        onCancel={handleCancelExport}
        onClose={handleCloseExportModal}
        outputPath={exportOutputPath}
      />

      {/* Shot Prefix Modal */}
      {shotPrefixModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-slate-800 rounded-xl p-6 w-[520px] max-w-[90vw]">
            <h2 className="text-lg font-semibold text-white mb-4">镜头提示词前缀</h2>
            <p className="text-sm text-slate-400 mb-4">
              这里设置的是项目级前缀，生成时拼接，不会改写镜头原始提示词。
            </p>
            <div className="space-y-4">
              <div>
                <label className="block text-sm text-slate-400 mb-2">图片提示词前缀</label>
                <textarea
                  value={shotImagePrefix}
                  onChange={(e) => setShotImagePrefix(e.target.value)}
                  placeholder="例如：高清电影画质，"
                  className="w-full h-20 px-3 py-2 bg-slate-700 rounded-lg text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-teal-500 resize-none"
                  autoFocus
                />
              </div>
              <div>
                <label className="block text-sm text-slate-400 mb-2">视频提示词前缀</label>
                <textarea
                  value={shotVideoPrefix}
                  onChange={(e) => setShotVideoPrefix(e.target.value)}
                  placeholder="例如：镜头运动顺滑，"
                  className="w-full h-20 px-3 py-2 bg-slate-700 rounded-lg text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500 resize-none"
                />
              </div>
            </div>
            <div className="flex justify-end gap-3 mt-4">
              <button
                onClick={() => {
                  setShotPrefixModalOpen(false);
                  setShotImagePrefix(project?.promptPrefixes?.shotImagePrefix || '');
                  setShotVideoPrefix(project?.promptPrefixes?.shotVideoPrefix || '');
                }}
                className="px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg text-sm text-slate-200 transition-colors"
              >
                取消
              </button>
              <button
                onClick={handleSaveShotPrefixes}
                className="px-4 py-2 bg-gradient-to-r from-teal-600 to-teal-500 hover:from-teal-500 hover:to-teal-400 rounded-lg text-sm text-white transition-colors"
              >
                保存
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Character Prefix Modal */}
      {characterPrefixModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-slate-800 rounded-xl p-6 w-[520px] max-w-[90vw]">
            <h2 className="text-lg font-semibold text-white mb-4">角色提示词前缀</h2>
            <p className="text-sm text-slate-400 mb-4">
              这里设置的是项目级前缀，生成角色图时会拼接到角色描述前。
            </p>
            <textarea
              value={characterPromptPrefix}
              onChange={(e) => setCharacterPromptPrefix(e.target.value)}
              placeholder="例如：电影级细节，"
              className="w-full h-24 px-3 py-2 bg-slate-700 rounded-lg text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-teal-500 resize-none"
              autoFocus
            />
            <div className="flex justify-end gap-3 mt-4">
              <button
                onClick={() => {
                  setCharacterPrefixModalOpen(false);
                  setCharacterPromptPrefix(project?.promptPrefixes?.characterPrefix || '');
                }}
                className="px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg text-sm text-slate-200 transition-colors"
              >
                取消
              </button>
              <button
                onClick={handleSaveCharacterPrefix}
                className="px-4 py-2 bg-gradient-to-r from-teal-600 to-teal-500 hover:from-teal-500 hover:to-teal-400 rounded-lg text-sm text-white transition-colors"
              >
                保存
              </button>
            </div>
          </div>
        </div>
      )}

      {/* One-Click Import Conflict Modal */}
      {importConflictOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-slate-800 rounded-xl p-6 w-[520px] max-w-[90vw]">
            <h2 className="text-lg font-semibold text-white mb-3">发现重复ID</h2>
            <p className="text-sm text-slate-400 mb-4">
              从分镜JSONL导入时，检测到 {importConflictCount} 条重复（共 {importConflictTotal} 条）。
              请选择处理方式：
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => {
                  setImportConflictOpen(false);
                  handleImportShotBuilder(importConflictTarget, 'cancel');
                }}
                className="px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg text-sm text-slate-200 transition-colors"
              >
                取消
              </button>
              <button
                onClick={() => {
                  setImportConflictOpen(false);
                  handleImportShotBuilder(importConflictTarget, 'skip');
                }}
                className="px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg text-sm text-slate-200 transition-colors"
              >
                跳过重复
              </button>
              <button
                onClick={() => {
                  setImportConflictOpen(false);
                  handleImportShotBuilder(importConflictTarget, 'overwrite');
                }}
                className="px-4 py-2 bg-gradient-to-r from-teal-600 to-teal-500 hover:from-teal-500 hover:to-teal-400 rounded-lg text-sm text-white transition-colors"
              >
                覆盖重复
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
