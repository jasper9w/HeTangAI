/**
 * ScenesPage - Scene management page
 */
import { useState } from 'react';
import {
  Image as ImageIcon,
  Plus,
  Edit3,
  Trash2,
  X,
  Loader2,
  Upload,
} from 'lucide-react';
import { ImagePreviewModal } from '../components/ui/ImagePreviewModal';
import type { Scene } from '../types';

// 根据 aspectRatio 返回对应的 CSS class
function getAspectRatioClass(aspectRatio: string): string {
  switch (aspectRatio) {
    case '9:16':
      return 'aspect-[9/16]';
    case '1:1':
      return 'aspect-square';
    default:
      return 'aspect-video';
  }
}

// 根据 aspectRatio 返回 grid 列数 class
function getGridColsClass(aspectRatio: string): string {
  switch (aspectRatio) {
    case '9:16':
      // 竖屏模式：更多列数让卡片更小
      return 'grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-8';
    case '1:1':
      // 方形模式：中等列数
      return 'grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6';
    default:
      // 横屏模式：较少列数
      return 'grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6';
  }
}

interface ScenesPageProps {
  scenes: Scene[];
  aspectRatio?: '16:9' | '9:16' | '1:1';
  onAddScene: (name: string, prompt: string) => void;
  onUpdateScene: (id: string, name: string, prompt: string) => void;
  onDeleteScene: (id: string) => void;
  onGenerateImage: (id: string) => void;
  onUploadImage: (id: string) => void;
  addModalOpen: boolean;
  onAddModalOpenChange: (open: boolean) => void;
}

export function ScenesPage({
  scenes,
  aspectRatio = '16:9',
  onAddScene,
  onUpdateScene,
  onDeleteScene,
  onGenerateImage,
  onUploadImage,
  addModalOpen,
  onAddModalOpenChange,
}: ScenesPageProps) {
  const aspectClass = getAspectRatioClass(aspectRatio);
  const gridColsClass = getGridColsClass(aspectRatio);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [sceneToDelete, setSceneToDelete] = useState<Scene | null>(null);
  const [viewingImage, setViewingImage] = useState<{ url: string; name: string } | null>(null);
  const [editing, setEditing] = useState<{ id: string | null; name: string; prompt: string }>({
    id: null,
    name: '',
    prompt: '',
  });
  const [newScene, setNewScene] = useState({ name: '', prompt: '' });

  const handleStartEdit = (scene: Scene) => {
    setEditing({
      id: scene.id,
      name: scene.name,
      prompt: scene.prompt,
    });
    setEditModalOpen(true);
  };

  const handleSaveEdit = () => {
    if (editing.id && editing.name.trim()) {
      onUpdateScene(editing.id, editing.name.trim(), editing.prompt.trim());
      setEditing({ id: null, name: '', prompt: '' });
      setEditModalOpen(false);
    }
  };

  const handleCancelEdit = () => {
    setEditing({ id: null, name: '', prompt: '' });
    setEditModalOpen(false);
  };

  const handleAddScene = () => {
    if (newScene.name.trim()) {
      onAddScene(newScene.name.trim(), newScene.prompt.trim());
      setNewScene({ name: '', prompt: '' });
      onAddModalOpenChange(false);
    }
  };

  const handleCancelAdd = () => {
    setNewScene({ name: '', prompt: '' });
    onAddModalOpenChange(false);
  };

  const handleDeleteClick = (scene: Scene) => {
    setSceneToDelete(scene);
    setDeleteConfirmOpen(true);
  };

  const handleConfirmDelete = () => {
    if (sceneToDelete) {
      onDeleteScene(sceneToDelete.id);
      setSceneToDelete(null);
      setDeleteConfirmOpen(false);
    }
  };

  const handleCancelDelete = () => {
    setSceneToDelete(null);
    setDeleteConfirmOpen(false);
  };

  const handleImageClick = (imageUrl: string, sceneName: string) => {
    setViewingImage({ url: imageUrl, name: sceneName });
  };

  const handleCloseImageViewer = () => {
    setViewingImage(null);
  };

  return (
    <div className="h-full p-6 overflow-y-auto">
      {scenes.length > 0 ? (
        <div className={`grid ${gridColsClass} gap-4`}>
          {scenes.map((scene) => (
            <div
              key={scene.id}
              className="bg-slate-800 rounded-lg overflow-hidden border border-slate-700 hover:border-slate-600 transition-colors"
            >
              <div className={`relative ${aspectClass} bg-slate-700 group`}>
                {scene.imageUrl ? (
                  <img
                    src={scene.imageUrl}
                    alt={scene.name}
                    className="w-full h-full object-cover cursor-pointer hover:opacity-90 transition-opacity"
                    onClick={() => handleImageClick(scene.imageUrl, scene.name)}
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-slate-500">
                    <ImageIcon className="w-10 h-10" />
                  </div>
                )}
                <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity flex gap-1">
                  <button
                    onClick={() => onUploadImage(scene.id)}
                    className="p-2 bg-slate-800/80 hover:bg-slate-700 text-slate-200 rounded-lg transition-colors"
                    title="上传图片"
                  >
                    <Upload className="w-4 h-4" />
                  </button>
                </div>
              </div>

              <div className="p-4">
                <div className="flex items-start justify-between mb-2">
                  <h3 className="text-sm font-medium text-slate-200">{scene.name}</h3>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => handleStartEdit(scene)}
                      className="p-1 text-slate-400 hover:text-slate-200 transition-colors"
                      title="编辑"
                    >
                      <Edit3 className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleDeleteClick(scene)}
                      className="p-1 text-slate-400 hover:text-red-400 transition-colors"
                      title="删除"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
                <p className="text-xs text-slate-400 line-clamp-3 mb-3">
                  {scene.prompt || '暂无场景提示词'}
                </p>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-slate-500">
                    {scene.status === 'generating'
                      ? '生成中...'
                      : scene.status === 'ready'
                        ? '已生成'
                        : scene.status === 'error'
                          ? '生成失败'
                          : '待生成'}
                  </span>
                  <button
                    onClick={() => onGenerateImage(scene.id)}
                    disabled={scene.status === 'generating' || !scene.prompt.trim()}
                    className="flex items-center gap-2 px-3 py-1.5 bg-violet-600 hover:bg-violet-500 disabled:opacity-50 rounded-lg text-xs text-white transition-colors"
                  >
                    {scene.status === 'generating' ? (
                      <>
                        <Loader2 className="w-3 h-3 animate-spin" />
                        生成中
                      </>
                    ) : (
                      <>
                        <ImageIcon className="w-3 h-3" />
                        生成
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="bg-slate-800/50 rounded-lg p-12 text-center">
          <ImageIcon className="w-16 h-16 mx-auto mb-4 text-slate-600" />
          <h3 className="text-lg font-medium text-slate-300 mb-2">暂无场景</h3>
          <p className="text-slate-500 mb-4">点击&quot;添加场景&quot;创建新场景</p>
          <button
            onClick={() => onAddModalOpenChange(true)}
            className="flex items-center gap-2 px-4 py-2 bg-violet-600 hover:bg-violet-500 rounded-lg text-sm text-white transition-colors mx-auto"
          >
            <Plus className="w-4 h-4" />
            添加场景
          </button>
        </div>
      )}

      {addModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-slate-800 rounded-lg p-6 w-full max-w-lg mx-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-medium text-slate-200">添加新场景</h3>
              <button
                onClick={handleCancelAdd}
                className="text-slate-400 hover:text-slate-200"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-sm text-slate-300 mb-2">场景名称</label>
                <input
                  type="text"
                  value={newScene.name}
                  onChange={(e) => setNewScene({ ...newScene, name: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-700 rounded-lg text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-violet-500"
                  placeholder="输入场景名称"
                />
              </div>
              <div>
                <label className="block text-sm text-slate-300 mb-2">场景提示词</label>
                <textarea
                  value={newScene.prompt}
                  onChange={(e) => setNewScene({ ...newScene, prompt: e.target.value })}
                  className="w-full h-32 px-3 py-2 bg-slate-700 rounded-lg text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-violet-500 resize-none"
                  placeholder="输入场景提示词"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-6">
              <button
                onClick={handleCancelAdd}
                className="px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg text-sm text-slate-200 transition-colors"
              >
                取消
              </button>
              <button
                onClick={handleAddScene}
                className="px-4 py-2 bg-violet-600 hover:bg-violet-500 rounded-lg text-sm text-white transition-colors"
              >
                添加
              </button>
            </div>
          </div>
        </div>
      )}

      {editModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-slate-800 rounded-lg p-6 w-full max-w-lg mx-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-medium text-slate-200">编辑场景</h3>
              <button
                onClick={handleCancelEdit}
                className="text-slate-400 hover:text-slate-200"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-sm text-slate-300 mb-2">场景名称</label>
                <input
                  type="text"
                  value={editing.name}
                  onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-700 rounded-lg text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-violet-500"
                />
              </div>
              <div>
                <label className="block text-sm text-slate-300 mb-2">场景提示词</label>
                <textarea
                  value={editing.prompt}
                  onChange={(e) => setEditing({ ...editing, prompt: e.target.value })}
                  className="w-full h-32 px-3 py-2 bg-slate-700 rounded-lg text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-violet-500 resize-none"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-6">
              <button
                onClick={handleCancelEdit}
                className="px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg text-sm text-slate-200 transition-colors"
              >
                取消
              </button>
              <button
                onClick={handleSaveEdit}
                className="px-4 py-2 bg-violet-600 hover:bg-violet-500 rounded-lg text-sm text-white transition-colors"
              >
                保存
              </button>
            </div>
          </div>
        </div>
      )}

      {deleteConfirmOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-slate-800 rounded-lg p-6 w-full max-w-md mx-4">
            <h3 className="text-lg font-medium text-slate-200 mb-2">确认删除</h3>
            <p className="text-slate-400 mb-6">
              确定要删除场景&quot;{sceneToDelete?.name}&quot;吗？此操作不可撤销。
            </p>
            <div className="flex justify-end gap-2">
              <button
                onClick={handleCancelDelete}
                className="px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg text-sm text-slate-200 transition-colors"
              >
                取消
              </button>
              <button
                onClick={handleConfirmDelete}
                className="px-4 py-2 bg-red-600 hover:bg-red-500 rounded-lg text-sm text-white transition-colors"
              >
                删除
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Image Viewer Modal */}
      {viewingImage && (
        <ImagePreviewModal
          imageUrl={viewingImage.url}
          title={viewingImage.name}
          onClose={handleCloseImageViewer}
        />
      )}
    </div>
  );
}

export default ScenesPage;
