/**
 * Character Panel - Left sidebar for managing characters with 3-view generation
 */
import { useState } from 'react';
import { Plus, User, Pencil, Trash2, X, Image, Loader2, Check, AlertCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import type { Character, CharacterStatus } from '../../types';

interface CharacterPanelProps {
  characters: Character[];
  onAddCharacter: (name: string, description: string) => void;
  onUpdateCharacter: (id: string, name: string, description: string) => void;
  onDeleteCharacter: (id: string) => void;
  onGenerateImage: (id: string) => void;
  onGenerateAllImages: () => void;
  isGenerating: boolean;
}

interface EditingState {
  id: string | null;
  name: string;
  description: string;
}

const statusConfig: Record<CharacterStatus, { icon: React.ComponentType<{ className?: string }>; color: string; animate?: boolean }> = {
  pending: { icon: Image, color: 'text-slate-400' },
  generating: { icon: Loader2, color: 'text-blue-400', animate: true },
  ready: { icon: Check, color: 'text-emerald-400' },
  error: { icon: AlertCircle, color: 'text-red-400' },
};

export function CharacterPanel({
  characters,
  onAddCharacter,
  onUpdateCharacter,
  onDeleteCharacter,
  onGenerateImage,
  onGenerateAllImages,
  isGenerating,
}: CharacterPanelProps) {
  const [showAddForm, setShowAddForm] = useState(false);
  const [newName, setNewName] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [editing, setEditing] = useState<EditingState>({ id: null, name: '', description: '' });
  const [previewImage, setPreviewImage] = useState<string | null>(null);

  const handleAdd = () => {
    if (newName.trim()) {
      onAddCharacter(newName.trim(), newDescription.trim());
      setNewName('');
      setNewDescription('');
      setShowAddForm(false);
    }
  };

  const handleStartEdit = (char: Character) => {
    setEditing({ id: char.id, name: char.name, description: char.description });
  };

  const handleSaveEdit = () => {
    if (editing.id && editing.name.trim()) {
      onUpdateCharacter(editing.id, editing.name.trim(), editing.description.trim());
      setEditing({ id: null, name: '', description: '' });
    }
  };

  const handleCancelEdit = () => {
    setEditing({ id: null, name: '', description: '' });
  };

  const pendingCount = characters.filter(c => c.status === 'pending' || !c.imageUrl).length;

  return (
    <div className="h-full flex flex-col bg-slate-800 border-r border-slate-700">
      {/* Header */}
      <div className="p-4 border-b border-slate-700">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-slate-100">角色库</h2>
            <p className="text-xs text-slate-400 mt-1">{characters.length} 个角色</p>
          </div>
          {pendingCount > 0 && (
            <button
              onClick={onGenerateAllImages}
              disabled={isGenerating}
              className="flex items-center gap-1 px-2 py-1 bg-gradient-to-r from-teal-600 to-teal-500 hover:from-teal-500 hover:to-teal-400 disabled:opacity-50 rounded text-xs text-white transition-colors"
              title="批量生成所有角色图"
            >
              {isGenerating ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Image className="w-3.5 h-3.5" />
              )}
              生成全部
            </button>
          )}
        </div>
      </div>

      {/* Character List */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        <AnimatePresence>
          {characters.map((char) => {
            const status = statusConfig[char.status || 'pending'];
            const StatusIcon = status.icon;
            const isCharGenerating = char.status === 'generating';

            return (
              <motion.div
                key={char.id}
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="bg-slate-700/50 rounded-lg overflow-hidden group"
              >
                {editing.id === char.id ? (
                  // Edit mode
                  <div className="p-3 space-y-2">
                    <input
                      type="text"
                      value={editing.name}
                      onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                      className="w-full px-2 py-1 bg-slate-600 rounded text-sm text-slate-100 focus:outline-none focus:ring-1 focus:ring-teal-500"
                      placeholder="角色名称"
                    />
                    <textarea
                      value={editing.description}
                      onChange={(e) => setEditing({ ...editing, description: e.target.value })}
                      className="w-full px-2 py-1 bg-slate-600 rounded text-xs text-slate-300 resize-none focus:outline-none focus:ring-1 focus:ring-teal-500"
                      placeholder="角色描述（用于生成3视图）"
                      rows={3}
                    />
                    <div className="flex gap-2">
                      <button
                        onClick={handleSaveEdit}
                        className="flex-1 px-2 py-1 bg-gradient-to-r from-teal-600 to-teal-500 hover:from-teal-500 hover:to-teal-400 rounded text-xs text-white transition-colors"
                      >
                        保存
                      </button>
                      <button
                        onClick={handleCancelEdit}
                        className="px-2 py-1 bg-slate-600 hover:bg-slate-500 rounded text-xs text-slate-300 transition-colors"
                      >
                        取消
                      </button>
                    </div>
                  </div>
                ) : (
                  // Display mode
                  <>
                    {/* 3-View Image */}
                    <div
                      className="relative aspect-[3/1] bg-slate-600 cursor-pointer"
                      onClick={() => char.imageUrl && setPreviewImage(char.imageUrl)}
                    >
                      {char.imageUrl ? (
                        <img
                          src={char.imageUrl}
                          alt={`${char.name} 3视图`}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-500">
                          <User className="w-8 h-8 mb-1" />
                          <span className="text-xs">待生成</span>
                        </div>
                      )}
                      {/* Status overlay */}
                      <div className="absolute top-1 right-1">
                        <div className={`p-1 rounded-full bg-slate-900/50 ${status.color}`}>
                          <StatusIcon className={`w-3 h-3 ${status.animate ? 'animate-spin' : ''}`} />
                        </div>
                      </div>
                    </div>

                    {/* Info */}
                    <div className="p-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-slate-100 truncate">{char.name}</p>
                          {char.description && (
                            <p className="text-xs text-slate-400 line-clamp-2 mt-0.5">{char.description}</p>
                          )}
                          {char.status === 'error' && char.errorMessage && (
                            <p className="text-xs text-red-400 mt-1">{char.errorMessage}</p>
                          )}
                        </div>

                        {/* Actions */}
                        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button
                            onClick={() => onGenerateImage(char.id)}
                            disabled={isCharGenerating}
                            className="p-1 hover:bg-teal-600/20 rounded transition-colors"
                            title="生成角色图"
                          >
                            {isCharGenerating ? (
                              <Loader2 className="w-3.5 h-3.5 text-blue-400 animate-spin" />
                            ) : (
                              <Image className="w-3.5 h-3.5 text-teal-400" />
                            )}
                          </button>
                          <button
                            onClick={() => handleStartEdit(char)}
                            disabled={char.isNarrator}
                            className="p-1 hover:bg-slate-600 rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                            title={char.isNarrator ? "旁白角色不可编辑" : "编辑"}
                          >
                            <Pencil className="w-3.5 h-3.5 text-slate-400" />
                          </button>
                          {!char.isNarrator && (
                            <button
                              onClick={() => onDeleteCharacter(char.id)}
                              className="p-1 hover:bg-red-600/20 rounded transition-colors"
                              title="删除"
                            >
                              <Trash2 className="w-3.5 h-3.5 text-red-400" />
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  </>
                )}
              </motion.div>
            );
          })}
        </AnimatePresence>

        {characters.length === 0 && !showAddForm && (
          <div className="text-center py-8 text-slate-500">
            <User className="w-10 h-10 mx-auto mb-2 opacity-50" />
            <p className="text-sm">暂无角色</p>
            <p className="text-xs mt-1">导入 Excel 自动提取角色</p>
          </div>
        )}
      </div>

      {/* Add Character Form */}
      <AnimatePresence>
        {showAddForm && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="border-t border-slate-700 p-3 space-y-2"
          >
            <div className="flex items-center justify-between">
              <span className="text-sm text-slate-300">新增角色</span>
              <button
                onClick={() => setShowAddForm(false)}
                className="p-1 hover:bg-slate-700 rounded"
              >
                <X className="w-4 h-4 text-slate-400" />
              </button>
            </div>
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              className="w-full px-3 py-2 bg-slate-700 rounded-lg text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-teal-500"
              placeholder="角色名称"
              autoFocus
            />
            <textarea
              value={newDescription}
              onChange={(e) => setNewDescription(e.target.value)}
              className="w-full px-3 py-2 bg-slate-700 rounded-lg text-xs text-slate-300 placeholder-slate-500 resize-none focus:outline-none focus:ring-1 focus:ring-teal-500"
              placeholder="角色描述（用于生成3视图提示词）"
              rows={3}
            />
            <button
              onClick={handleAdd}
              disabled={!newName.trim()}
              className="w-full py-2 bg-gradient-to-r from-teal-600 to-teal-500 hover:from-teal-500 hover:to-teal-400 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg text-sm text-white font-medium transition-colors"
            >
              添加角色
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Add Button */}
      {!showAddForm && (
        <div className="p-3 border-t border-slate-700">
          <button
            onClick={() => setShowAddForm(true)}
            className="w-full flex items-center justify-center gap-2 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg text-sm text-slate-300 transition-colors"
          >
            <Plus className="w-4 h-4" />
            添加角色
          </button>
        </div>
      )}

      {/* Image Preview Modal */}
      <AnimatePresence>
        {previewImage && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-8"
            onClick={() => setPreviewImage(null)}
          >
            <motion.div
              initial={{ scale: 0.9 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0.9 }}
              className="relative max-w-4xl max-h-full"
            >
              <img
                src={previewImage}
                alt="角色3视图预览"
                className="max-w-full max-h-[80vh] rounded-lg shadow-2xl"
              />
              <button
                onClick={() => setPreviewImage(null)}
                className="absolute -top-3 -right-3 w-8 h-8 bg-slate-800 hover:bg-slate-700 rounded-full flex items-center justify-center transition-colors"
              >
                <X className="w-5 h-5 text-slate-300" />
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
