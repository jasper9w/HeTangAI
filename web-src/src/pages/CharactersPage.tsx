/**
 * CharactersPage - Character management page
 */
import { useState } from 'react';
import {
  Upload,
  Mic,
  Image as ImageIcon,
  Gauge,
  Plus,
  Edit3,
  Trash2,
  Check,
  X,
  Loader2,
  Sparkles,
  ZoomIn,
  ZoomOut,
  RotateCcw
} from 'lucide-react';
import { ReferenceAudioModal } from '../components/character/ReferenceAudioModal';
import type { Character } from '../types';

interface CharactersPageProps {
  characters: Character[];
  onAddCharacter: (name: string, description: string) => void;
  onUpdateCharacter: (id: string, name: string, description: string) => void;
  onUpdateCharacterSpeed: (id: string, speed: number) => void;
  onDeleteCharacter: (id: string) => void;
  onGenerateImage: (id: string) => void;
  onGenerateAllImages: () => void;
  onUploadImage: (id: string) => void;
  onSetReferenceAudio: (id: string, audioPath: string) => void;
  isGenerating: boolean;
}

export function CharactersPage({
  characters,
  onAddCharacter,
  onUpdateCharacter,
  onUpdateCharacterSpeed,
  onDeleteCharacter,
  onGenerateImage,
  onGenerateAllImages,
  onUploadImage,
  onSetReferenceAudio,
  isGenerating,
}: CharactersPageProps) {
  const [audioModalOpen, setAudioModalOpen] = useState(false);
  const [selectedCharacterId, setSelectedCharacterId] = useState<string | null>(null);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [characterToDelete, setCharacterToDelete] = useState<Character | null>(null);
  const [imageViewerOpen, setImageViewerOpen] = useState(false);
  const [viewingImage, setViewingImage] = useState<{ url: string; name: string } | null>(null);
  const [imageScale, setImageScale] = useState(1);
  const [editing, setEditing] = useState<{ id: string | null; name: string; description: string }>({
    id: null,
    name: '',
    description: '',
  });
  const [newCharacter, setNewCharacter] = useState({ name: '', description: '' });

  const handleOpenAudioModal = (characterId: string) => {
    setSelectedCharacterId(characterId);
    setAudioModalOpen(true);
  };

  const handleSelectAudio = (audioPath: string, speed: number) => {
    if (selectedCharacterId) {
      onSetReferenceAudio(selectedCharacterId, audioPath);
      onUpdateCharacterSpeed(selectedCharacterId, speed);
    }
  };

  const handleStartEdit = (character: Character) => {
    setEditing({
      id: character.id,
      name: character.name,
      description: character.description,
    });
    setEditModalOpen(true);
  };

  const handleSaveEdit = () => {
    if (editing.id && editing.name.trim()) {
      onUpdateCharacter(editing.id, editing.name.trim(), editing.description.trim());
      setEditing({ id: null, name: '', description: '' });
      setEditModalOpen(false);
    }
  };

  const handleCancelEdit = () => {
    setEditing({ id: null, name: '', description: '' });
    setEditModalOpen(false);
  };

  const handleAddCharacter = () => {
    if (newCharacter.name.trim()) {
      onAddCharacter(newCharacter.name.trim(), newCharacter.description.trim());
      setNewCharacter({ name: '', description: '' });
      setAddModalOpen(false);
    }
  };

  const handleCancelAdd = () => {
    setNewCharacter({ name: '', description: '' });
    setAddModalOpen(false);
  };

  const handleDeleteClick = (character: Character) => {
    setCharacterToDelete(character);
    setDeleteConfirmOpen(true);
  };

  const handleConfirmDelete = () => {
    if (characterToDelete) {
      onDeleteCharacter(characterToDelete.id);
      setCharacterToDelete(null);
      setDeleteConfirmOpen(false);
    }
  };

  const handleCancelDelete = () => {
    setCharacterToDelete(null);
    setDeleteConfirmOpen(false);
  };

  const handleImageClick = (imageUrl: string, characterName: string) => {
    setViewingImage({ url: imageUrl, name: characterName });
    setImageScale(1);
    setImageViewerOpen(true);
  };

  const handleCloseImageViewer = () => {
    setImageViewerOpen(false);
    setViewingImage(null);
    setImageScale(1);
  };

  const handleZoomIn = () => {
    setImageScale(prev => Math.min(prev + 0.25, 3));
  };

  const handleZoomOut = () => {
    setImageScale(prev => Math.max(prev - 0.25, 0.25));
  };

  const handleResetZoom = () => {
    setImageScale(1);
  };

  const selectedCharacter = characters.find((c) => c.id === selectedCharacterId);
  // 只计算普通角色中需要生成三视图的数量（旁白角色不需要生成三视图）
  const pendingCount = characters.filter(c => !c.isNarrator && (c.status === 'pending' || !c.imageUrl)).length;
  // 计算有描述且需要生成的角色数量
  const pendingWithDescriptionCount = characters.filter(c =>
    !c.isNarrator &&
    c.description?.trim() &&
    (c.status === 'pending' || !c.imageUrl)
  ).length;

  return (
    <div className="h-full p-6 overflow-y-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-semibold text-slate-100">角色库</h2>
          <p className="text-slate-400 mt-1">
            {characters.length} 个角色 {pendingCount > 0 && `· ${pendingCount} 个待生成`}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {pendingWithDescriptionCount > 0 && (
            <button
              onClick={onGenerateAllImages}
              disabled={isGenerating}
              className="flex items-center gap-2 px-4 py-2 bg-violet-600 hover:bg-violet-500 disabled:opacity-50 rounded-lg text-sm text-white transition-colors"
            >
              {isGenerating ? (
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
            onClick={() => setAddModalOpen(true)}
            className="flex items-center gap-2 px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg text-sm text-slate-200 transition-colors"
          >
            <Plus className="w-4 h-4" />
            添加角色
          </button>
        </div>
      </div>

      {/* Characters Grid */}
      {characters.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {characters.map((char) => (
            <div
              key={char.id}
              className="bg-slate-800 rounded-lg overflow-hidden border border-slate-700 hover:border-slate-600 transition-colors"
            >
              {/* Character Image - 16:9 ratio */}
              {!char.isNarrator && (
                <div className="relative aspect-video bg-slate-700 group">
                  {char.imageUrl ? (
                    <img
                      src={char.imageUrl}
                      alt={char.name}
                      className="w-full h-full object-cover cursor-pointer hover:opacity-90 transition-opacity"
                      onClick={() => handleImageClick(char.imageUrl, char.name)}
                    />
                  ) : (
                    <div className="absolute inset-0 flex items-center justify-center text-slate-500">
                      <div className="text-center">
                        <ImageIcon className="w-10 h-10 mx-auto mb-1" />
                        <p className="text-xs">
                          {char.status === 'generating' ? '生成中...' : '待生成'}
                        </p>
                      </div>
                    </div>
                  )}

                  {/* Character Name and Actions Overlay */}
                  <div className="absolute inset-0 bg-gradient-to-b from-black/60 via-transparent to-black/40 pointer-events-none">
                    {/* Character Name - Top Left */}
                    <div className="absolute top-2 left-2 pointer-events-none">
                      <div className="flex items-center gap-2">
                        <h3 className="font-medium text-white text-sm drop-shadow-lg">{char.name}</h3>
                        {char.isNarrator && (
                          <span className="text-xs px-1.5 py-0.5 bg-blue-600/80 text-blue-100 rounded backdrop-blur-sm">
                            旁白
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Reference Audio Info - Bottom Left (show on hover) */}
                    {char.referenceAudioPath && (
                      <div className="absolute bottom-2 left-2 group/audio pointer-events-auto">
                        <div className="flex items-center gap-1.5 px-2 py-1 bg-black/50 backdrop-blur-sm rounded-full text-white text-xs">
                          <Mic className="w-3 h-3" />
                          <span>{char.speed || 1}x</span>
                        </div>

                        {/* Audio File Tooltip - Show on hover */}
                        <div className="absolute bottom-full left-0 mb-2 w-64 p-3 bg-slate-800/95 backdrop-blur-sm rounded-lg border border-slate-600 text-xs text-slate-200 opacity-0 group-hover/audio:opacity-100 transition-opacity pointer-events-none z-10">
                          <div className="font-medium text-slate-100 mb-1">参考音文件:</div>
                          <div className="text-slate-300 break-all">{char.referenceAudioPath.split('/').pop()}</div>
                          <div className="text-slate-400 mt-1">倍速: {char.speed || 1}x</div>
                          {/* Arrow */}
                          <div className="absolute -bottom-1 left-3 w-2 h-2 bg-slate-800 border-r border-b border-slate-600 rotate-45"></div>
                        </div>
                      </div>
                    )}

                    {/* Delete Button - Top Right (show on hover) - Only for non-narrator characters */}
                    {!char.isNarrator && (
                      <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-auto">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteClick(char);
                          }}
                          className="p-1.5 bg-black/50 hover:bg-red-600/70 rounded-full text-white hover:text-red-100 transition-colors backdrop-blur-sm"
                          title="删除"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    )}

                    {/* Action Buttons - Bottom Right (show on hover) */}
                    <div className="absolute bottom-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1 pointer-events-auto">
                      {/* Edit Button */}
                      <div className="relative group/edit">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleStartEdit(char);
                          }}
                          className="p-1.5 bg-black/50 hover:bg-black/70 rounded-full text-white transition-colors backdrop-blur-sm"
                          title="编辑"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                        </button>

                        {/* Description Tooltip - Show on edit button hover */}
                        {char.description && (
                          <div className="absolute bottom-full right-0 mb-2 w-64 p-3 bg-slate-800/95 backdrop-blur-sm rounded-lg border border-slate-600 text-xs text-slate-200 opacity-0 group-hover/edit:opacity-100 transition-opacity pointer-events-none z-10">
                            <div className="font-medium text-slate-100 mb-1">角色描述:</div>
                            <div className="text-slate-300">{char.description}</div>
                            {/* Arrow */}
                            <div className="absolute -bottom-1 right-3 w-2 h-2 bg-slate-800 border-r border-b border-slate-600 rotate-45"></div>
                          </div>
                        )}
                      </div>

                      {/* Generate Button - Only for non-narrator characters with description */}
                      {!char.isNarrator && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onGenerateImage(char.id);
                          }}
                          disabled={char.status === 'generating' || !char.description?.trim()}
                          className="p-1.5 bg-black/50 hover:bg-violet-600/70 disabled:opacity-50 rounded-full text-white transition-colors backdrop-blur-sm"
                          title={
                            !char.description?.trim()
                              ? '请先添加角色描述'
                              : char.status === 'generating'
                                ? '生成中...'
                                : '生成三视图'
                          }
                        >
                          {char.status === 'generating' ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <Sparkles className="w-3.5 h-3.5" />
                          )}
                        </button>
                      )}

                      {/* Reference Audio Button */}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleOpenAudioModal(char.id);
                        }}
                        className={`p-1.5 rounded-full text-white transition-colors backdrop-blur-sm ${
                          char.referenceAudioPath
                            ? 'bg-violet-600/70 hover:bg-violet-600/90'
                            : 'bg-black/50 hover:bg-black/70'
                        }`}
                        title={char.referenceAudioPath ? '已设置参考音' : '设置参考音'}
                      >
                        <Mic className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Narrator Character - No Image */}
              {char.isNarrator && (
                <div className="relative aspect-video bg-slate-700 group flex items-center justify-center">
                  <div className="text-center text-slate-400">
                    <Mic className="w-12 h-12 mx-auto mb-2" />
                    <p className="text-sm">旁白角色</p>
                  </div>

                  {/* Character Name and Actions Overlay for Narrator */}
                  <div className="absolute inset-0 bg-gradient-to-b from-black/60 via-transparent to-black/40 pointer-events-none">
                    {/* Character Name - Top Left */}
                    <div className="absolute top-2 left-2 pointer-events-none">
                      <div className="flex items-center gap-2">
                        <h3 className="font-medium text-white text-sm drop-shadow-lg">{char.name}</h3>
                        <span className="text-xs px-1.5 py-0.5 bg-blue-600/80 text-blue-100 rounded backdrop-blur-sm">
                          旁白
                        </span>
                      </div>
                    </div>

                    {/* Reference Audio Info - Bottom Left (show on hover) */}
                    {char.referenceAudioPath && (
                      <div className="absolute bottom-2 left-2 group/audio pointer-events-auto">
                        <div className="flex items-center gap-1.5 px-2 py-1 bg-black/50 backdrop-blur-sm rounded-full text-white text-xs">
                          <Mic className="w-3 h-3" />
                          <span>{char.speed || 1}x</span>
                        </div>

                        {/* Audio File Tooltip - Show on hover */}
                        <div className="absolute bottom-full left-0 mb-2 w-64 p-3 bg-slate-800/95 backdrop-blur-sm rounded-lg border border-slate-600 text-xs text-slate-200 opacity-0 group-hover/audio:opacity-100 transition-opacity pointer-events-none z-10">
                          <div className="font-medium text-slate-100 mb-1">参考音文件:</div>
                          <div className="text-slate-300 break-all">{char.referenceAudioPath.split('/').pop()}</div>
                          <div className="text-slate-400 mt-1">倍速: {char.speed || 1}x</div>
                          {/* Arrow */}
                          <div className="absolute -bottom-1 left-3 w-2 h-2 bg-slate-800 border-r border-b border-slate-600 rotate-45"></div>
                        </div>
                      </div>
                    )}

                    {/* Action Buttons - Bottom Right (show on hover) */}
                    <div className="absolute bottom-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1 pointer-events-auto">
                      {/* Edit Button */}
                      <div className="relative group/edit">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleStartEdit(char);
                          }}
                          className="p-1.5 bg-black/50 hover:bg-black/70 rounded-full text-white transition-colors backdrop-blur-sm"
                          title="编辑"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                        </button>

                        {/* Description Tooltip - Show on edit button hover */}
                        {char.description && (
                          <div className="absolute bottom-full right-0 mb-2 w-64 p-3 bg-slate-800/95 backdrop-blur-sm rounded-lg border border-slate-600 text-xs text-slate-200 opacity-0 group-hover/edit:opacity-100 transition-opacity pointer-events-none z-10">
                            <div className="font-medium text-slate-100 mb-1">角色描述:</div>
                            <div className="text-slate-300">{char.description}</div>
                            {/* Arrow */}
                            <div className="absolute -bottom-1 right-3 w-2 h-2 bg-slate-800 border-r border-b border-slate-600 rotate-45"></div>
                          </div>
                        )}
                      </div>

                      {/* Reference Audio Button */}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleOpenAudioModal(char.id);
                        }}
                        className={`p-1.5 rounded-full text-white transition-colors backdrop-blur-sm ${
                          char.referenceAudioPath
                            ? 'bg-violet-600/70 hover:bg-violet-600/90'
                            : 'bg-black/50 hover:bg-black/70'
                        }`}
                        title={char.referenceAudioPath ? '已设置参考音' : '设置参考音'}
                      >
                        <Mic className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Character Info - Compact Layout */}
              <div className="p-2">
                {/* Character Ready Status */}
                <div className="text-xs text-center py-1">
                  {(() => {
                    const hasImage = !char.isNarrator && char.imageUrl;
                    const hasAudio = char.referenceAudioPath;

                    if (char.isNarrator) {
                      // 旁白角色只需要参考音，不需要三视图
                      if (hasAudio) {
                        return (
                          <span className="text-green-400">
                            ✓ 角色已就绪
                          </span>
                        );
                      } else {
                        return (
                          <span className="text-amber-400">
                            待设置参考音
                          </span>
                        );
                      }
                    } else {
                      // 普通角色需要三视图和参考音
                      if (hasImage && hasAudio) {
                        return (
                          <span className="text-green-400">
                            ✓ 角色已就绪
                          </span>
                        );
                      } else if (hasImage && !hasAudio) {
                        return (
                          <span className="text-amber-400">
                            待设置参考音
                          </span>
                        );
                      } else if (!hasImage && hasAudio) {
                        return (
                          <span className="text-amber-400">
                            待生成三视图
                          </span>
                        );
                      } else {
                        return (
                          <span className="text-slate-400">
                            待生成三视图和设置参考音
                          </span>
                        );
                      }
                    }
                  })()}
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="bg-slate-800/50 rounded-lg p-12 text-center">
          <ImageIcon className="w-16 h-16 mx-auto mb-4 text-slate-600" />
          <h3 className="text-lg font-medium text-slate-300 mb-2">暂无角色</h3>
          <p className="text-slate-500 mb-4">
            点击"添加角色"创建新角色，或导入 Excel 自动提取角色
          </p>
          <button
            onClick={() => setAddModalOpen(true)}
            className="flex items-center gap-2 px-4 py-2 bg-violet-600 hover:bg-violet-500 rounded-lg text-sm text-white transition-colors mx-auto"
          >
            <Plus className="w-4 h-4" />
            添加角色
          </button>
        </div>
      )}

      {/* Reference Audio Modal */}
      <ReferenceAudioModal
        isOpen={audioModalOpen}
        onClose={() => setAudioModalOpen(false)}
        onSelect={handleSelectAudio}
        currentAudioPath={selectedCharacter?.referenceAudioPath}
        currentSpeed={selectedCharacter?.speed}
      />

      {/* Add Character Modal */}
      {addModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-slate-800 rounded-lg border border-slate-700 w-full max-w-2xl max-h-[90vh] flex flex-col">
            <div className="p-6 border-b border-slate-700">
              <h3 className="text-xl font-medium text-slate-200">添加新角色</h3>
            </div>
            <div className="p-6 space-y-6 flex-1 overflow-y-auto">
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-3">角色名称</label>
                <input
                  type="text"
                  value={newCharacter.name}
                  onChange={(e) => setNewCharacter({ ...newCharacter, name: e.target.value })}
                  placeholder="请输入角色名称"
                  className="w-full px-4 py-3 bg-slate-700 rounded-lg text-slate-300 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-violet-500 transition-colors"
                  autoFocus
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-3">
                  角色描述（用于生成三视图）
                  <span className="text-slate-500 font-normal ml-2">- 详细描述有助于生成更准确的角色形象</span>
                </label>
                <textarea
                  value={newCharacter.description}
                  onChange={(e) => setNewCharacter({ ...newCharacter, description: e.target.value })}
                  placeholder="请详细描述角色的外观特征，例如：&#10;• 性别和年龄：年轻女性，约25岁&#10;• 发型发色：长直发，黑色&#10;• 面部特征：大眼睛，温和的笑容&#10;• 服装风格：白色连衣裙，简约优雅&#10;• 体型特征：身材修长，气质优雅&#10;• 其他特征：戴着银色项链"
                  rows={12}
                  className="w-full px-4 py-3 bg-slate-700 rounded-lg text-slate-300 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-violet-500 resize-none transition-colors leading-relaxed"
                />
                <div className="mt-2 text-xs text-slate-500">
                  提示：描述越详细，生成的三视图越准确。建议包含性别、年龄、发型、服装、体型等关键信息。
                </div>
              </div>
            </div>
            <div className="p-6 border-t border-slate-700 flex items-center justify-end gap-3">
              <button
                onClick={handleCancelAdd}
                className="px-6 py-2.5 bg-slate-700 hover:bg-slate-600 rounded-lg text-sm text-slate-300 transition-colors"
              >
                取消
              </button>
              <button
                onClick={handleAddCharacter}
                disabled={!newCharacter.name.trim()}
                className="px-6 py-2.5 bg-violet-600 hover:bg-violet-500 disabled:opacity-50 rounded-lg text-sm text-white transition-colors"
              >
                添加角色
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Character Modal */}
      {editModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-slate-800 rounded-lg border border-slate-700 w-full max-w-2xl max-h-[90vh] flex flex-col">
            <div className="p-6 border-b border-slate-700">
              <h3 className="text-xl font-medium text-slate-200">编辑角色</h3>
            </div>
            <div className="p-6 space-y-6 flex-1 overflow-y-auto">
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-3">角色名称</label>
                <input
                  type="text"
                  value={editing.name}
                  onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                  className="w-full px-4 py-3 bg-slate-700 rounded-lg text-slate-300 focus:outline-none focus:ring-2 focus:ring-violet-500 transition-colors"
                  autoFocus
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-3">
                  角色描述（用于生成三视图）
                  <span className="text-slate-500 font-normal ml-2">- 详细描述有助于生成更准确的角色形象</span>
                </label>
                <textarea
                  value={editing.description}
                  onChange={(e) => setEditing({ ...editing, description: e.target.value })}
                  placeholder="请详细描述角色的外观特征，例如：&#10;• 性别和年龄：年轻女性，约25岁&#10;• 发型发色：长直发，黑色&#10;• 面部特征：大眼睛，温和的笑容&#10;• 服装风格：白色连衣裙，简约优雅&#10;• 体型特征：身材修长，气质优雅&#10;• 其他特征：戴着银色项链"
                  rows={12}
                  className="w-full px-4 py-3 bg-slate-700 rounded-lg text-slate-300 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-violet-500 resize-none transition-colors leading-relaxed"
                />
                <div className="mt-2 text-xs text-slate-500">
                  提示：描述越详细，生成的三视图越准确。建议包含性别、年龄、发型、服装、体型等关键信息。
                </div>
              </div>
            </div>
            <div className="p-6 border-t border-slate-700 flex items-center justify-end gap-3">
              <button
                onClick={handleCancelEdit}
                className="px-6 py-2.5 bg-slate-700 hover:bg-slate-600 rounded-lg text-sm text-slate-300 transition-colors"
              >
                取消
              </button>
              <button
                onClick={handleSaveEdit}
                disabled={!editing.name.trim()}
                className="px-6 py-2.5 bg-violet-600 hover:bg-violet-500 disabled:opacity-50 rounded-lg text-sm text-white transition-colors"
              >
                保存
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteConfirmOpen && characterToDelete && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-slate-800 rounded-lg border border-slate-700 w-full max-w-md">
            <div className="p-4 border-b border-slate-700">
              <h3 className="text-lg font-medium text-slate-200">确认删除</h3>
            </div>
            <div className="p-4">
              <p className="text-slate-300">
                确定要删除角色 <span className="font-medium text-slate-100">"{characterToDelete.name}"</span> 吗？
              </p>
              <p className="text-sm text-slate-400 mt-2">
                此操作无法撤销，角色的所有数据将被永久删除。
              </p>
            </div>
            <div className="p-4 border-t border-slate-700 flex items-center justify-end gap-2">
              <button
                onClick={handleCancelDelete}
                className="px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg text-sm text-slate-300 transition-colors"
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
      {imageViewerOpen && viewingImage && (
        <div
          className="fixed inset-0 bg-black/90 flex items-center justify-center z-50 p-4"
          onClick={handleCloseImageViewer}
        >
          <div className="relative max-w-full max-h-full">
            {/* Close button */}
            <button
              onClick={handleCloseImageViewer}
              className="absolute top-4 right-4 z-10 p-2 bg-black/50 hover:bg-black/70 rounded-full text-white transition-colors"
            >
              <X className="w-6 h-6" />
            </button>

            {/* Zoom controls */}
            <div className="absolute top-4 left-4 z-10 flex flex-col gap-2">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleZoomIn();
                }}
                className="p-2 bg-black/50 hover:bg-black/70 rounded-full text-white transition-colors"
                title="放大"
              >
                <ZoomIn className="w-5 h-5" />
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleZoomOut();
                }}
                className="p-2 bg-black/50 hover:bg-black/70 rounded-full text-white transition-colors"
                title="缩小"
              >
                <ZoomOut className="w-5 h-5" />
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleResetZoom();
                }}
                className="p-2 bg-black/50 hover:bg-black/70 rounded-full text-white transition-colors"
                title="重置缩放"
              >
                <RotateCcw className="w-5 h-5" />
              </button>
            </div>

            {/* Scale indicator */}
            <div className="absolute bottom-4 left-4 z-10 px-3 py-1 bg-black/50 rounded-full text-white text-sm">
              {Math.round(imageScale * 100)}%
            </div>

            {/* Character name */}
            <div className="absolute bottom-4 right-4 z-10 px-3 py-1 bg-black/50 rounded-full text-white text-sm">
              {viewingImage.name}
            </div>

            {/* Image */}
            <img
              src={viewingImage.url}
              alt={viewingImage.name}
              className="max-w-full max-h-full object-contain transition-transform duration-200"
              style={{ transform: `scale(${imageScale})` }}
              onClick={(e) => e.stopPropagation()}
            />
          </div>
        </div>
      )}
    </div>
  );
}
