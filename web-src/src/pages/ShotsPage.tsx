/**
 * ShotsPage - Shot management page wrapper
 */
import { ShotTable } from '../components/shot/ShotTable';
import { BatchGenerateModal } from '../components/shot/BatchGenerateModal';
import type { Shot, Character, Scene } from '../types';

interface ShotsPageProps {
  shots: Shot[];
  characters: Character[];
  scenes: Scene[];
  selectedIds: string[];
  onSelectShot: (id: string, selected: boolean) => void;
  onSelectAll: (selected: boolean) => void;
  onDeleteShots: (ids: string[]) => void;
  onGenerateImages: (id: string) => void;
  onGenerateVideo: (id: string) => void;
  onGenerateAudio: (id: string) => void;
  onSelectImage: (shotId: string, imageIndex: number) => void;
  onSelectVideo: (shotId: string, videoIndex: number) => void;
  onDeleteImage: (shotId: string, imageIndex: number) => void;
  onDeleteVideo: (shotId: string, videoIndex: number) => void;
  onUpdateShot: (shotId: string, field: string, value: string | string[] | { role: string; text: string }[]) => void;
  onFilterChange: (filteredShots: Shot[]) => void;
  onInsertShot: (afterShotId: string | null) => void;
  batchModalOpen: boolean;
  batchModalType: 'image' | 'video' | 'audio';
  onBatchModalClose: () => void;
  onBatchGenerate: (shotIds: string[], forceRegenerate: boolean) => void;
}

export function ShotsPage({
  shots,
  characters,
  scenes,
  selectedIds,
  onSelectShot,
  onSelectAll,
  onDeleteShots,
  onGenerateImages,
  onGenerateVideo,
  onGenerateAudio,
  onSelectImage,
  onSelectVideo,
  onDeleteImage,
  onDeleteVideo,
  onUpdateShot,
  onFilterChange,
  onInsertShot,
  batchModalOpen,
  batchModalType,
  onBatchModalClose,
  onBatchGenerate,
}: ShotsPageProps) {
  // 获取当前选中的镜头
  const selectedShots = shots.filter(s => selectedIds.includes(s.id));

  return (
    <div className="h-full flex flex-col">
      {/* Shot Table with integrated filter */}
      <div className="flex-1 overflow-hidden">
        <ShotTable
          shots={shots}
          characters={characters}
          scenes={scenes}
          selectedIds={selectedIds}
          onSelectShot={onSelectShot}
          onSelectAll={onSelectAll}
          onDeleteShots={onDeleteShots}
          onGenerateImages={onGenerateImages}
          onGenerateVideo={onGenerateVideo}
          onGenerateAudio={onGenerateAudio}
          onSelectImage={onSelectImage}
          onSelectVideo={onSelectVideo}
          onDeleteImage={onDeleteImage}
          onDeleteVideo={onDeleteVideo}
          onUpdateShot={onUpdateShot}
          onFilterChange={onFilterChange}
          onInsertShot={onInsertShot}
        />
      </div>

      {/* Batch Generate Modal */}
      <BatchGenerateModal
        isOpen={batchModalOpen}
        type={batchModalType}
        selectedShots={selectedShots}
        onClose={onBatchModalClose}
        onConfirm={onBatchGenerate}
      />
    </div>
  );
}
