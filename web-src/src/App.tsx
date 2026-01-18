/**
 * AI Lens Creation Workshop - Main Application
 */
import { useState, useEffect, useCallback } from 'react';
import {
  Save,
  FolderOpen,
  Film,
  Plus,
  Loader2,
} from 'lucide-react';
import { useApi } from './hooks/useApi';
import { Sidebar } from './components/layout/Sidebar';
import { HomePage } from './pages/HomePage';
import { ShotsPage } from './pages/ShotsPage';
import { CharactersPage } from './pages/CharactersPage';
import { DubbingPage } from './pages/DubbingPage';
import { SettingsPage } from './pages/SettingsPage';
import { Toast, type ToastMessage } from './components/ui/Toast';
import type { ProjectData, Shot, PageType } from './types';

function App() {
  const { api, ready } = useApi();

  // Page state
  const [currentPage, setCurrentPage] = useState<PageType>('shots');

  // Project state
  const [project, setProject] = useState<ProjectData | null>(null);
  const [projectPath, setProjectPath] = useState<string | null>(null);
  const [isDirty, setIsDirty] = useState(false);

  // Selection state
  const [selectedShotIds, setSelectedShotIds] = useState<string[]>([]);

  // Generation state
  const [isGenerating, setIsGenerating] = useState(false);
  const [isGeneratingCharacters, setIsGeneratingCharacters] = useState(false);
  const [generationProgress, setGenerationProgress] = useState<{
    current: number;
    total: number;
    type: 'image' | 'video' | 'audio';
  } | null>(null);

  // Toast notifications
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const showToast = useCallback((type: ToastMessage['type'], message: string, duration?: number) => {
    const id = `toast-${Date.now()}-${Math.random()}`;
    setToasts((prev) => [...prev, { id, type, message, duration }]);
  }, []);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  // Initialize with empty project
  useEffect(() => {
    if (ready && !project) {
      handleNewProject();
    }
  }, [ready]);

  // ========== Project Operations ==========

  const handleNewProject = async () => {
    if (!api) return;
    const result = await api.new_project();
    if (result.success && result.data) {
      setProject(result.data);
      setProjectPath(null);
      setIsDirty(false);
      setSelectedShotIds([]);
    }
  };

  const handleOpenProject = async () => {
    if (!api) return;
    const result = await api.open_project();
    if (result.success && result.data) {
      setProject(result.data);
      setProjectPath(result.path || null);
      setIsDirty(false);
      setSelectedShotIds([]);
    }
  };

  const handleSaveProject = async () => {
    if (!api || !project) return;
    const result = await api.save_project();
    if (result.success) {
      setProjectPath(result.path || projectPath);
      setIsDirty(false);
    }
  };

  // ========== Import/Export ==========

  const handleImportExcel = async () => {
    if (!api) return;
    const result = await api.import_excel();
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

  const handleExportTemplate = async () => {
    if (!api) return;
    await api.export_template();
  };

  const handleOpenOutputDir = async () => {
    if (!api) return;
    await api.open_output_dir();
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
    if (!api || !project) return;

    // Update status locally first
    setProject({
      ...project,
      characters: project.characters.map((c) =>
        c.id === id ? { ...c, status: 'generating' as const } : c
      ),
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
    }
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
    if (selected && project) {
      setSelectedShotIds(project.shots.map((s) => s.id));
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

  const handleUpdateShot = async (shotId: string, field: string, value: string | string[]) => {
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
    setProject({
      ...project,
      shots: project.shots.map((s) =>
        s.id === shotId ? { ...s, status: 'generating_images' as const } : s
      ),
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
    setProject({
      ...project,
      shots: project.shots.map((s) =>
        s.id === shotId ? { ...s, status: 'generating_video' as const } : s
      ),
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
    setProject({
      ...project,
      shots: project.shots.map((s) =>
        s.id === shotId ? { ...s, status: 'generating_audio' as const } : s
      ),
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

  const handleBatchGenerateImages = async () => {
    if (!api || !project) return;

    const targetIds = selectedShotIds.length > 0
      ? selectedShotIds
      : project.shots.map(s => s.id);

    if (targetIds.length === 0) return;

    setIsGenerating(true);
    setGenerationProgress({ current: 0, total: targetIds.length, type: 'image' });

    for (let i = 0; i < targetIds.length; i++) {
      setGenerationProgress({ current: i + 1, total: targetIds.length, type: 'image' });
      await handleGenerateImages(targetIds[i]);
    }

    setIsGenerating(false);
    setGenerationProgress(null);
  };

  const handleBatchGenerateVideos = async () => {
    if (!api || !project) return;

    const targetIds = selectedShotIds.length > 0
      ? selectedShotIds.filter(id => {
          const shot = project.shots.find(s => s.id === id);
          return shot && shot.images.length > 0;
        })
      : project.shots.filter(s => s.images.length > 0).map(s => s.id);

    if (targetIds.length === 0) return;

    setIsGenerating(true);
    setGenerationProgress({ current: 0, total: targetIds.length, type: 'video' });

    for (let i = 0; i < targetIds.length; i++) {
      setGenerationProgress({ current: i + 1, total: targetIds.length, type: 'video' });
      await handleGenerateVideo(targetIds[i]);
    }

    setIsGenerating(false);
    setGenerationProgress(null);
  };

  const handleBatchGenerateAudios = async () => {
    if (!api || !project) return;

    const targetIds = selectedShotIds.length > 0
      ? selectedShotIds.filter(id => {
          const shot = project.shots.find(s => s.id === id);
          return shot && shot.script.trim();
        })
      : project.shots.filter(s => s.script.trim()).map(s => s.id);

    if (targetIds.length === 0) return;

    setIsGenerating(true);
    setGenerationProgress({ current: 0, total: targetIds.length, type: 'audio' });

    for (let i = 0; i < targetIds.length; i++) {
      setGenerationProgress({ current: i + 1, total: targetIds.length, type: 'audio' });
      await handleGenerateAudio(targetIds[i]);
    }

    setIsGenerating(false);
    setGenerationProgress(null);
  };

  // ========== Render Page Content ==========

  const renderPageContent = () => {
    switch (currentPage) {
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
            onUpdateShot={handleUpdateShot}
            onImportExcel={handleImportExcel}
            onExportTemplate={handleExportTemplate}
            onBatchGenerateImages={handleBatchGenerateImages}
            onBatchGenerateVideos={handleBatchGenerateVideos}
            onBatchGenerateAudios={handleBatchGenerateAudios}
            isGenerating={isGenerating}
            generationProgress={generationProgress}
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
            onGenerateAllImages={handleGenerateAllCharacterImages}
            onUploadImage={handleUploadCharacterImage}
            onSetReferenceAudio={handleSetCharacterReferenceAudio}
            isGenerating={isGeneratingCharacters}
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
        return <SettingsPage onOpenOutputDir={handleOpenOutputDir} />;
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
    <div className="min-h-screen bg-slate-900 flex flex-col">
      {/* Toast Notifications */}
      <Toast toasts={toasts} onRemove={removeToast} />

      {/* Header */}
      <header className="bg-slate-800 border-b border-slate-700 px-4 py-3">
        <div className="flex items-center justify-between">
          {/* Left: Project info */}
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center">
                <Film className="w-4 h-4 text-white" />
              </div>
              <div>
                <h1 className="text-sm font-semibold text-slate-100">
                  {project?.name || '未命名项目'}
                  {isDirty && <span className="text-violet-400 ml-1">*</span>}
                </h1>
                <p className="text-xs text-slate-500">
                  {project?.shots.length || 0} 个镜头
                </p>
              </div>
            </div>
          </div>

          {/* Right: Project actions */}
          <div className="flex items-center gap-2">
            <button
              onClick={handleNewProject}
              className="p-2 hover:bg-slate-700 rounded-lg text-slate-400 hover:text-slate-200 transition-colors"
              title="新建项目"
            >
              <Plus className="w-5 h-5" />
            </button>
            <button
              onClick={handleOpenProject}
              className="p-2 hover:bg-slate-700 rounded-lg text-slate-400 hover:text-slate-200 transition-colors"
              title="打开项目"
            >
              <FolderOpen className="w-5 h-5" />
            </button>
            <button
              onClick={handleSaveProject}
              disabled={!isDirty}
              className="p-2 hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg text-slate-400 hover:text-slate-200 transition-colors"
              title="保存项目"
            >
              <Save className="w-5 h-5" />
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 flex overflow-hidden">
        {/* Left Sidebar Navigation */}
        <Sidebar currentPage={currentPage} onPageChange={setCurrentPage} />

        {/* Page Content */}
        <div className="flex-1 bg-slate-900 overflow-hidden">
          {renderPageContent()}
        </div>
      </main>
    </div>
  );
}

export default App;
