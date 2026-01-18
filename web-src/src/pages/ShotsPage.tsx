/**
 * ShotsPage - Shot management page wrapper
 */
import { FileUp, Download, Image, Film, Volume2, Loader2 } from 'lucide-react';
import { motion } from 'framer-motion';
import { ShotTable } from '../components/shot/ShotTable';
import type { Shot, Character } from '../types';

interface ShotsPageProps {
  shots: Shot[];
  characters: Character[];
  selectedIds: string[];
  onSelectShot: (id: string, selected: boolean) => void;
  onSelectAll: (selected: boolean) => void;
  onDeleteShots: (ids: string[]) => void;
  onGenerateImages: (id: string) => void;
  onGenerateVideo: (id: string) => void;
  onGenerateAudio: (id: string) => void;
  onSelectImage: (shotId: string, imageIndex: number) => void;
  onUpdateShot: (shotId: string, field: string, value: string | string[]) => void;
  onImportExcel: () => void;
  onExportTemplate: () => void;
  onBatchGenerateImages: () => void;
  onBatchGenerateVideos: () => void;
  onBatchGenerateAudios: () => void;
  isGenerating: boolean;
  generationProgress: { current: number; total: number; type: 'image' | 'video' | 'audio' } | null;
}

export function ShotsPage({
  shots,
  characters,
  selectedIds,
  onSelectShot,
  onSelectAll,
  onDeleteShots,
  onGenerateImages,
  onGenerateVideo,
  onGenerateAudio,
  onSelectImage,
  onUpdateShot,
  onImportExcel,
  onExportTemplate,
  onBatchGenerateImages,
  onBatchGenerateVideos,
  onBatchGenerateAudios,
  isGenerating,
  generationProgress,
}: ShotsPageProps) {
  return (
    <div className="h-full flex flex-col">
      {/* Action Bar */}
      <div className="bg-slate-800 border-b border-slate-700 px-4 py-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-100">镜头管理</h2>

          <div className="flex items-center gap-2">
            <button
              onClick={onImportExcel}
              className="flex items-center gap-2 px-3 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg text-sm text-slate-200 transition-colors"
            >
              <FileUp className="w-4 h-4" />
              导入
            </button>
            <button
              onClick={onExportTemplate}
              className="flex items-center gap-2 px-3 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg text-sm text-slate-200 transition-colors"
            >
              <Download className="w-4 h-4" />
              模板
            </button>
            <div className="w-px h-6 bg-slate-700 mx-2" />
            <button
              onClick={onBatchGenerateImages}
              disabled={isGenerating || !shots.length}
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
              onClick={onBatchGenerateVideos}
              disabled={isGenerating || !shots.some(s => s.images.length > 0)}
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
            <button
              onClick={onBatchGenerateAudios}
              disabled={isGenerating || !shots.some(s => s.script.trim())}
              className="flex items-center gap-2 px-3 py-2 bg-orange-600 hover:bg-orange-500 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg text-sm text-white transition-colors"
            >
              {isGenerating && generationProgress?.type === 'audio' ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  {generationProgress.current}/{generationProgress.total}
                </>
              ) : (
                <>
                  <Volume2 className="w-4 h-4" />
                  批量配音
                </>
              )}
            </button>
          </div>
        </div>

        {/* Progress bar */}
        {generationProgress && (
          <div className="mt-3">
            <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
              <span>
                正在生成{generationProgress.type === 'image' ? '图片' : generationProgress.type === 'video' ? '视频' : '配音'}...
              </span>
              <span>
                {generationProgress.current} / {generationProgress.total}
              </span>
            </div>
            <div className="h-1.5 bg-slate-700 rounded-full overflow-hidden">
              <motion.div
                className={`h-full rounded-full ${
                  generationProgress.type === 'image' ? 'bg-violet-500' : generationProgress.type === 'video' ? 'bg-emerald-500' : 'bg-orange-500'
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
      </div>

      {/* Shot Table */}
      <div className="flex-1 overflow-hidden">
        <ShotTable
          shots={shots}
          characters={characters}
          selectedIds={selectedIds}
          onSelectShot={onSelectShot}
          onSelectAll={onSelectAll}
          onDeleteShots={onDeleteShots}
          onGenerateImages={onGenerateImages}
          onGenerateVideo={onGenerateVideo}
          onGenerateAudio={onGenerateAudio}
          onSelectImage={onSelectImage}
          onUpdateShot={onUpdateShot}
        />
      </div>
    </div>
  );
}
