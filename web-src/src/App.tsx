/**
 * AI Lens Creation Workshop - Main Application
 */
import { useState, useEffect, useCallback } from 'react';
import {
  FileSpreadsheet,
  Download,
  Save,
  FolderOpen,
  Image,
  Film,
  Plus,
  Loader2,
  FileUp,
} from 'lucide-react';
import { motion } from 'framer-motion';
import { useApi } from './hooks/useApi';
import { CharacterPanel } from './components/character/CharacterPanel';
import { ShotTable } from './components/shot/ShotTable';
import type { ProjectData, Shot, Character } from './types';

function App() {
  const { api, ready } = useApi();

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
    type: 'image' | 'video';
  } | null>(null);

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
    if (result.character) {
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

  const handleUpdateShot = async (shotId: string, field: string, value: string) => {
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
    if (result.shot) {
      updateShotInProject(result.shot);
      setIsDirty(true);
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
    if (result.shot) {
      updateShotInProject(result.shot);
      setIsDirty(true);
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

          {/* Center: Main actions */}
          <div className="flex items-center gap-2">
            <button
              onClick={handleImportExcel}
              className="flex items-center gap-2 px-3 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg text-sm text-slate-200 transition-colors"
            >
              <FileUp className="w-4 h-4" />
              导入
            </button>
            <button
              onClick={handleExportTemplate}
              className="flex items-center gap-2 px-3 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg text-sm text-slate-200 transition-colors"
            >
              <Download className="w-4 h-4" />
              模板
            </button>
            <div className="w-px h-6 bg-slate-700 mx-2" />
            <button
              onClick={handleBatchGenerateImages}
              disabled={isGenerating || !project?.shots.length}
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
                  批量生图
                </>
              )}
            </button>
            <button
              onClick={handleBatchGenerateVideos}
              disabled={isGenerating || !project?.shots.some(s => s.images.length > 0)}
              className="flex items-center gap-2 px-3 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg text-sm text-white transition-colors"
            >
              {isGenerating && generationProgress?.type === 'video' ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  {generationProgress.current}/{generationProgress.total}
                </>
              ) : (
                <>
                  <Film className="w-4 h-4" />
                  批量生视频
                </>
              )}
            </button>
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

        {/* Progress bar */}
        {generationProgress && (
          <div className="mt-3">
            <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
              <span>
                正在生成{generationProgress.type === 'image' ? '图片' : '视频'}...
              </span>
              <span>
                {generationProgress.current} / {generationProgress.total}
              </span>
            </div>
            <div className="h-1.5 bg-slate-700 rounded-full overflow-hidden">
              <motion.div
                className={`h-full rounded-full ${
                  generationProgress.type === 'image' ? 'bg-violet-500' : 'bg-emerald-500'
                }`}
                initial={{ width: 0 }}
                animate={{
                  width: `${(generationProgress.current / generationProgress.total) * 100}%`,
                }}
                transition={{ duration: 0.3 }}
              />
            </div>
          </div>
        )}
      </header>

      {/* Main Content */}
      <main className="flex-1 flex overflow-hidden">
        {/* Left Panel: Characters (1/5 width) */}
        <div className="w-1/5 min-w-[240px] max-w-[320px]">
          <CharacterPanel
            characters={project?.characters || []}
            onAddCharacter={handleAddCharacter}
            onUpdateCharacter={handleUpdateCharacter}
            onDeleteCharacter={handleDeleteCharacter}
            onGenerateImage={handleGenerateCharacterImage}
            onGenerateAllImages={handleGenerateAllCharacterImages}
            isGenerating={isGeneratingCharacters}
          />
        </div>

        {/* Right Panel: Shots (4/5 width) */}
        <div className="flex-1 bg-slate-900">
          <ShotTable
            shots={project?.shots || []}
            selectedIds={selectedShotIds}
            onSelectShot={handleSelectShot}
            onSelectAll={handleSelectAllShots}
            onDeleteShots={handleDeleteShots}
            onGenerateImages={handleGenerateImages}
            onGenerateVideo={handleGenerateVideo}
            onSelectImage={handleSelectImage}
            onUpdateShot={handleUpdateShot}
          />
        </div>
      </main>
    </div>
  );
}

export default App;
