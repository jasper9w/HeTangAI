/**
 * ScenesPage - Scene management page
 */
import { useState, useEffect, useCallback } from 'react';
import {
  Image as ImageIcon,
  Plus,
  Edit3,
  Trash2,
  X,
  Loader2,
  Upload,
  ZoomIn,
  ZoomOut,
  RotateCcw,
} from 'lucide-react';
import type { Scene } from '../types';

interface ScenesPageProps {
  scenes: Scene[];
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
  onAddScene,
  onUpdateScene,
  onDeleteScene,
  onGenerateImage,
  onUploadImage,
  addModalOpen,
  onAddModalOpenChange,
}: ScenesPageProps) {
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [sceneToDelete, setSceneToDelete] = useState<Scene | null>(null);
  const [imageViewerOpen, setImageViewerOpen] = useState(false);
  const [viewingImage, setViewingImage] = useState<{ url: string; name: string } | null>(null);
  const [imageScale, setImageScale] = useState(1);
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
    setImageScale(1);
    setImageViewerOpen(true);
  };

  const handleCloseImageViewer = () => {
    setImageViewerOpen(false);
    setViewingImage(null);
    setImageScale(1);
  };

  const handleZoomIn = () => {
    setImageScale((prev) => Math.min(prev + 0.25, 3));
  };

  const handleZoomOut = () => {
    setImageScale((prev) => Math.max(prev - 0.25, 0.25));
  };

  const handleResetZoom = () => {
    setImageScale(1);
  };

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    if (e.deltaY < 0) {
      setImageScale(prev => Math.min(prev + 0.1, 3));
    } else {
      setImageScale(prev => Math.max(prev - 0.1, 0.25));
    }
  }, []);

  // ESC key listener for image viewer
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && imageViewerOpen) {
        handleCloseImageViewer();
      }
    };
    
    if (imageViewerOpen) {
      window.addEventListener('keydown', handleKeyDown);
      return () => window.removeEventListener('keydown', handleKeyDown);
    }
  }, [imageViewerOpen]);

  return (
    <div className="h-full p-6 overflow-y-auto">
      {scenes.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {scenes.map((scene) => (
            <div
              key={scene.id}
              className="bg-slate-800 rounded-lg overflow-hidden border border-slate-700 hover:border-slate-600 transition-colors"
            >
              <div className="relative aspect-video bg-slate-700 group">
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

      {imageViewerOpen && viewingImage && (
        <div
          className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center"
          onClick={handleCloseImageViewer}
          onWheel={handleWheel}
        >
          <div className="absolute top-4 right-4 flex items-center gap-2">
            <button
              onClick={(e) => { e.stopPropagation(); handleZoomIn(); }}
              className="p-2 bg-slate-800/80 hover:bg-slate-700 text-slate-200 rounded-lg"
              title="放大 (滚轮向上)"
            >
              <ZoomIn className="w-4 h-4" />
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); handleZoomOut(); }}
              className="p-2 bg-slate-800/80 hover:bg-slate-700 text-slate-200 rounded-lg"
              title="缩小 (滚轮向下)"
            >
              <ZoomOut className="w-4 h-4" />
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); handleResetZoom(); }}
              className="p-2 bg-slate-800/80 hover:bg-slate-700 text-slate-200 rounded-lg"
              title="重置缩放"
            >
              <RotateCcw className="w-4 h-4" />
            </button>
            <button
              onClick={handleCloseImageViewer}
              className="p-2 bg-slate-800/80 hover:bg-slate-700 text-slate-200 rounded-lg"
              title="关闭 (Esc)"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          {/* Scale indicator */}
          <div className="absolute bottom-4 left-4 z-10 px-3 py-1 bg-black/50 rounded-full text-white text-sm">
            {Math.round(imageScale * 100)}%
          </div>
          {/* Scene name */}
          <div className="absolute bottom-4 right-4 z-10 px-3 py-1 bg-black/50 rounded-full text-white text-sm">
            {viewingImage.name}
          </div>
          <div className="max-w-[90vw] max-h-[90vh] overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <img
              src={viewingImage.url}
              alt={viewingImage.name}
              className="max-w-full max-h-full object-contain transition-transform"
              style={{ transform: `scale(${imageScale})` }}
            />
          </div>
        </div>
      )}
    </div>
  );
}

export default ScenesPage;
