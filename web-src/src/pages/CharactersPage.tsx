/**
 * CharactersPage - Character management page
 */
import { useState, useEffect, useRef } from 'react';
import {
  Mic,
  Image as ImageIcon,
  Plus,
  Edit3,
  Trash2,
  Loader2,
  Sparkles,
  Upload,
  FileUp,
  Wand2,
  Pause,
  Volume2,
  ImageOff,
} from 'lucide-react';
import { ReferenceAudioModal } from '../components/character/ReferenceAudioModal';
import { CharacterImportModal } from '../components/character/CharacterImportModal';
import { ImagePreviewModal } from '../components/ui/ImagePreviewModal';
import type { Character, SmartAssignResult } from '../types';

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

interface CharactersPageProps {
  characters: Character[];
  aspectRatio?: '16:9' | '9:16' | '1:1';
  onAddCharacter: (name: string, description: string) => void;
  onUpdateCharacter: (id: string, name: string, description: string) => void;
  onUpdateCharacterSpeed: (id: string, speed: number) => void;
  onDeleteCharacter: (id: string) => void;
  onGenerateImage: (id: string) => void;
  onUploadImage: (id: string) => void;
  onRemoveImage: (id: string) => void;
  onSetReferenceAudio: (id: string, audioPath: string) => void;
  onSmartAssign: (mode: 'empty_only' | 'all') => Promise<SmartAssignResult>;
  onImportFromText: (text: string) => Promise<{
    success: boolean;
    characters: Partial<Character>[];
    errors: string[];
    error?: string;
  }>;
  onImportFromFile: () => Promise<{
    success: boolean;
    characters: Partial<Character>[];
    errors: string[];
    error?: string;
  }>;
  onConfirmImport: (characters: Partial<Character>[]) => Promise<{
    success: boolean;
    addedCount?: number;
    error?: string;
  }>;
  onExportTemplate: () => Promise<void>;
  addModalOpen: boolean;
  onAddModalOpenChange: (open: boolean) => void;
  importModalOpen: boolean;
  onImportModalOpenChange: (open: boolean) => void;
  importMode?: 'paste' | 'file';
}

export function CharactersPage({
  characters,
  aspectRatio = '16:9',
  onAddCharacter,
  onUpdateCharacter,
  onUpdateCharacterSpeed,
  onDeleteCharacter,
  onGenerateImage,
  onUploadImage,
  onRemoveImage,
  onSetReferenceAudio,
  onSmartAssign,
  onImportFromText,
  onImportFromFile,
  onConfirmImport,
  onExportTemplate,
  addModalOpen,
  onAddModalOpenChange,
  importModalOpen,
  onImportModalOpenChange,
  importMode = 'paste',
}: CharactersPageProps) {
  const aspectClass = getAspectRatioClass(aspectRatio);
  const gridColsClass = getGridColsClass(aspectRatio);
  const [audioModalOpen, setAudioModalOpen] = useState(false);
  const [selectedCharacterId, setSelectedCharacterId] = useState<string | null>(null);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [characterToDelete, setCharacterToDelete] = useState<Character | null>(null);
  const [removeImageConfirmOpen, setRemoveImageConfirmOpen] = useState(false);
  const [characterToRemoveImage, setCharacterToRemoveImage] = useState<Character | null>(null);
  const [viewingImage, setViewingImage] = useState<{ url: string; name: string } | null>(null);
  const [editing, setEditing] = useState<{ id: string | null; name: string; description: string }>({
    id: null,
    name: '',
    description: '',
  });
  const [newCharacter, setNewCharacter] = useState({ name: '', description: '' });
  
  // Smart assign state
  const [smartAssignModalOpen, setSmartAssignModalOpen] = useState(false);
  const [isSmartAssigning, setIsSmartAssigning] = useState(false);
  const [smartAssignResult, setSmartAssignResult] = useState<SmartAssignResult | null>(null);

  // Audio playback state
  const [playingCharacterId, setPlayingCharacterId] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // ESC key to close modals
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (removeImageConfirmOpen) {
          setCharacterToRemoveImage(null);
          setRemoveImageConfirmOpen(false);
        } else if (deleteConfirmOpen) {
          setCharacterToDelete(null);
          setDeleteConfirmOpen(false);
        } else if (editModalOpen) {
          setEditing({ id: null, name: '', description: '' });
          setEditModalOpen(false);
        } else if (addModalOpen) {
          setNewCharacter({ name: '', description: '' });
          onAddModalOpenChange(false);
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [addModalOpen, editModalOpen, deleteConfirmOpen, removeImageConfirmOpen, onAddModalOpenChange]);

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
      onAddModalOpenChange(false);
    }
  };

  const handleCancelAdd = () => {
    setNewCharacter({ name: '', description: '' });
    onAddModalOpenChange(false);
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
  };

  const handleCloseImageViewer = () => {
    setViewingImage(null);
  };

  // Smart assign handlers
  const handleOpenSmartAssign = () => {
    setSmartAssignResult(null);
    setSmartAssignModalOpen(true);
  };

  const handleSmartAssign = async (mode: 'empty_only' | 'all') => {
    setIsSmartAssigning(true);
    try {
      const result = await onSmartAssign(mode);
      setSmartAssignResult(result);
    } catch (error) {
      console.error('Smart assign failed:', error);
      setSmartAssignResult({
        success: false,
        assignedCount: 0,
        skippedCount: 0,
        error: String(error),
      });
    } finally {
      setIsSmartAssigning(false);
    }
  };

  const handleCloseSmartAssign = () => {
    setSmartAssignModalOpen(false);
    setSmartAssignResult(null);
  };

  // Audio playback handler
  const handlePlayCharacterAudio = async (char: Character) => {
    if (!char.referenceAudioPath) return;

    // If already playing this character, pause
    if (playingCharacterId === char.id) {
      audioRef.current?.pause();
      setPlayingCharacterId(null);
      return;
    }

    // Stop any currently playing audio
    if (audioRef.current) {
      audioRef.current.pause();
    }

    try {
      if (!window.pywebview?.api) return;

      const result = await window.pywebview.api.get_reference_audio_data(char.referenceAudioPath);
      if (result.success && result.data) {
        const byteCharacters = atob(result.data);
        const byteNumbers = new Array(byteCharacters.length);
        for (let i = 0; i < byteCharacters.length; i++) {
          byteNumbers[i] = byteCharacters.charCodeAt(i);
        }
        const byteArray = new Uint8Array(byteNumbers);
        const blob = new Blob([byteArray], { type: result.mimeType || 'audio/wav' });
        const url = URL.createObjectURL(blob);

        audioRef.current = new Audio(url);
        // Apply current speed setting
        audioRef.current.playbackRate = char.speed || 1.0;
        audioRef.current.play();
        audioRef.current.onended = () => {
          setPlayingCharacterId(null);
          URL.revokeObjectURL(url);
        };
        setPlayingCharacterId(char.id);
      }
    } catch (error) {
      console.error('Failed to play audio:', error);
      setPlayingCharacterId(null);
    }
  };

  // Cleanup audio on unmount
  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
      }
    };
  }, []);

  // Calculate stats for smart assign dialog
  const narratorCount = characters.filter(c => c.isNarrator).length;
  const voiceoverCount = characters.filter(c => !c.isNarrator).length;
  const emptyAudioCount = characters.filter(c => !c.referenceAudioPath).length;
  
  const selectedCharacter = characters.find((c) => c.id === selectedCharacterId);

  return (
    <div className="h-full p-6 overflow-y-auto">
      {/* Toolbar */}
      {characters.length > 0 && (
        <div className="flex items-center justify-between mb-4">
          <div className="text-sm text-slate-400">
            共 {characters.length} 个角色
            {narratorCount > 0 && <span className="ml-2">({narratorCount} 旁白, {voiceoverCount} 配音)</span>}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleOpenSmartAssign}
              disabled={characters.length === 0}
              className="flex items-center gap-2 px-3 py-1.5 bg-gradient-to-r from-teal-600 to-teal-500 hover:from-teal-500 hover:to-teal-400 disabled:opacity-50 rounded-lg text-sm text-white transition-colors"
            >
              <Wand2 className="w-4 h-4" />
              智能分配参考音
            </button>
          </div>
        </div>
      )}

      {/* Characters Grid */}
      {characters.length > 0 ? (
        <div className={`grid ${gridColsClass} gap-4`}>
          {characters.map((char) => (
            <div
              key={char.id}
              className="bg-slate-800 rounded-lg overflow-hidden border border-slate-700 hover:border-slate-600 transition-colors"
            >
              {/* Character Image */}
              {!char.isNarrator && (
                <div className={`relative ${aspectClass} bg-slate-700 group`}>
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

                    {/* Top Right Actions (show on hover) - Only for non-narrator characters */}
                    {!char.isNarrator && (
                      <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-auto flex items-center gap-1">
                        {/* Remove Image Button - Only show when has image */}
                        {char.imageUrl && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setCharacterToRemoveImage(char);
                              setRemoveImageConfirmOpen(true);
                            }}
                            className="p-1.5 bg-black/50 hover:bg-amber-600/70 rounded-full text-white hover:text-amber-100 transition-colors backdrop-blur-sm"
                            title="移除图片"
                          >
                            <ImageOff className="w-3.5 h-3.5" />
                          </button>
                        )}
                        {/* Delete Button */}
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
                          className="p-1.5 bg-black/50 hover:bg-teal-600/70 disabled:opacity-50 rounded-full text-white transition-colors backdrop-blur-sm"
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

                      {/* Upload Image Button - Only for non-narrator characters */}
                      {!char.isNarrator && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onUploadImage(char.id);
                          }}
                          disabled={char.status === 'generating'}
                          className="p-1.5 bg-black/50 hover:bg-blue-600/70 disabled:opacity-50 rounded-full text-white transition-colors backdrop-blur-sm"
                          title="上传参考图"
                        >
                          <Upload className="w-3.5 h-3.5" />
                        </button>
                      )}

                      {/* Try Listen Button - Only show when has reference audio */}
                      {char.referenceAudioPath && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handlePlayCharacterAudio(char);
                          }}
                          className={`p-1.5 rounded-full transition-colors backdrop-blur-sm ${
                            playingCharacterId === char.id
                              ? 'text-teal-400 bg-teal-500/30'
                              : 'text-white/70 hover:text-white bg-black/30 hover:bg-black/50'
                          }`}
                          title={playingCharacterId === char.id ? '停止试听' : '试听参考音'}
                        >
                          {playingCharacterId === char.id ? (
                            <Pause className="w-3.5 h-3.5" />
                          ) : (
                            <Volume2 className="w-3.5 h-3.5" />
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
                            ? 'bg-teal-600/70 hover:bg-teal-600/90'
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
                <div className={`relative ${aspectClass} bg-slate-700 group flex items-center justify-center`}>
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

                      {/* Try Listen Button - Only show when has reference audio */}
                      {char.referenceAudioPath && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handlePlayCharacterAudio(char);
                          }}
                          className={`p-1.5 rounded-full transition-colors backdrop-blur-sm ${
                            playingCharacterId === char.id
                              ? 'text-teal-400 bg-teal-500/30'
                              : 'text-white/70 hover:text-white bg-black/30 hover:bg-black/50'
                          }`}
                          title={playingCharacterId === char.id ? '停止试听' : '试听参考音'}
                        >
                          {playingCharacterId === char.id ? (
                            <Pause className="w-3.5 h-3.5" />
                          ) : (
                            <Volume2 className="w-3.5 h-3.5" />
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
                            ? 'bg-teal-600/70 hover:bg-teal-600/90'
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
          <div className="flex items-center gap-3 justify-center">
            <button
              onClick={() => onAddModalOpenChange(true)}
              className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-teal-600 to-teal-500 hover:from-teal-500 hover:to-teal-400 rounded-lg text-sm text-white transition-colors"
            >
              <Plus className="w-4 h-4" />
              添加角色
            </button>
            <button
              onClick={() => onImportModalOpenChange(true)}
              className="flex items-center gap-2 px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg text-sm text-slate-300 transition-colors"
            >
              <FileUp className="w-4 h-4" />
              导入角色
            </button>
          </div>
        </div>
      )}

      {/* Reference Audio Modal */}
      <ReferenceAudioModal
        isOpen={audioModalOpen}
        onClose={() => setAudioModalOpen(false)}
        onSelect={handleSelectAudio}
        currentAudioPath={selectedCharacter?.referenceAudioPath}
        currentSpeed={selectedCharacter?.speed}
        isNarrator={selectedCharacter?.isNarrator}
        audioRecommendations={selectedCharacter?.audioRecommendations}
      />

      {/* Character Import Modal */}
      <CharacterImportModal
        isOpen={importModalOpen}
        onClose={() => onImportModalOpenChange(false)}
        onImportFromText={onImportFromText}
        onImportFromFile={onImportFromFile}
        onConfirmImport={onConfirmImport}
        onExportTemplate={onExportTemplate}
        mode={importMode}
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
                  className="w-full px-4 py-3 bg-slate-700 rounded-lg text-slate-300 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-teal-500 transition-colors"
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
                  className="w-full px-4 py-3 bg-slate-700 rounded-lg text-slate-300 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-teal-500 resize-none transition-colors leading-relaxed"
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
                className="px-6 py-2.5 bg-gradient-to-r from-teal-600 to-teal-500 hover:from-teal-500 hover:to-teal-400 disabled:opacity-50 rounded-lg text-sm text-white transition-colors"
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
                  className="w-full px-4 py-3 bg-slate-700 rounded-lg text-slate-300 focus:outline-none focus:ring-2 focus:ring-teal-500 transition-colors"
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
                  className="w-full px-4 py-3 bg-slate-700 rounded-lg text-slate-300 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-teal-500 resize-none transition-colors leading-relaxed"
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
                className="px-6 py-2.5 bg-gradient-to-r from-teal-600 to-teal-500 hover:from-teal-500 hover:to-teal-400 disabled:opacity-50 rounded-lg text-sm text-white transition-colors"
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

      {/* Remove Image Confirmation Modal */}
      {removeImageConfirmOpen && characterToRemoveImage && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-slate-800 rounded-lg border border-slate-700 w-full max-w-md">
            <div className="p-4 border-b border-slate-700">
              <h3 className="text-lg font-medium text-slate-200">确认移除图片</h3>
            </div>
            <div className="p-4">
              <p className="text-slate-300">
                确定要移除角色 <span className="font-medium text-slate-100">"{characterToRemoveImage.name}"</span> 的图片吗？
              </p>
              <p className="text-sm text-slate-400 mt-2">
                移除后角色状态将重置为"待生成"。
              </p>
            </div>
            <div className="p-4 border-t border-slate-700 flex items-center justify-end gap-2">
              <button
                onClick={() => {
                  setCharacterToRemoveImage(null);
                  setRemoveImageConfirmOpen(false);
                }}
                className="px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg text-sm text-slate-300 transition-colors"
              >
                取消
              </button>
              <button
                onClick={() => {
                  onRemoveImage(characterToRemoveImage.id);
                  setCharacterToRemoveImage(null);
                  setRemoveImageConfirmOpen(false);
                }}
                className="px-4 py-2 bg-amber-600 hover:bg-amber-500 rounded-lg text-sm text-white transition-colors"
              >
                移除
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

      {/* Smart Assign Modal */}
      {smartAssignModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-slate-800 rounded-lg border border-slate-700 w-full max-w-md">
            <div className="p-4 border-b border-slate-700">
              <div className="flex items-center gap-2">
                <Wand2 className="w-5 h-5 text-teal-400" />
                <h3 className="text-lg font-medium text-slate-200">智能分配参考音</h3>
              </div>
            </div>
            <div className="p-4">
              {!smartAssignResult ? (
                <>
                  <p className="text-slate-300 mb-4">
                    将根据角色类型自动分配合适的参考音:
                  </p>
                  <div className="space-y-2 mb-4 text-sm">
                    <div className="flex items-center justify-between p-2 bg-slate-700/50 rounded">
                      <span className="text-slate-400">旁白角色</span>
                      <span className="text-slate-200">{narratorCount} 个</span>
                    </div>
                    <div className="flex items-center justify-between p-2 bg-slate-700/50 rounded">
                      <span className="text-slate-400">配音角色</span>
                      <span className="text-slate-200">{voiceoverCount} 个</span>
                    </div>
                    <div className="flex items-center justify-between p-2 bg-slate-700/50 rounded">
                      <span className="text-slate-400">未设置参考音</span>
                      <span className="text-amber-400">{emptyAudioCount} 个</span>
                    </div>
                  </div>
                  <p className="text-xs text-slate-500">
                    系统将根据角色名称智能推断性别，并从预置音库中选择合适的参考音。
                  </p>
                </>
              ) : (
                <div className="text-center py-4">
                  {smartAssignResult.success ? (
                    <>
                      <div className="w-12 h-12 rounded-full bg-green-500/20 flex items-center justify-center mx-auto mb-3">
                        <Sparkles className="w-6 h-6 text-green-400" />
                      </div>
                      <p className="text-slate-200 mb-2">分配完成</p>
                      <p className="text-sm text-slate-400">
                        已为 <span className="text-green-400">{smartAssignResult.assignedCount}</span> 个角色分配参考音
                        {smartAssignResult.skippedCount > 0 && (
                          <span>，跳过 <span className="text-slate-300">{smartAssignResult.skippedCount}</span> 个</span>
                        )}
                      </p>
                    </>
                  ) : (
                    <>
                      <div className="w-12 h-12 rounded-full bg-red-500/20 flex items-center justify-center mx-auto mb-3">
                        <Wand2 className="w-6 h-6 text-red-400" />
                      </div>
                      <p className="text-slate-200 mb-2">分配失败</p>
                      <p className="text-sm text-red-400">{smartAssignResult.error}</p>
                    </>
                  )}
                </div>
              )}
            </div>
            <div className="p-4 border-t border-slate-700 flex items-center justify-end gap-2">
              {!smartAssignResult ? (
                <>
                  <button
                    onClick={handleCloseSmartAssign}
                    disabled={isSmartAssigning}
                    className="px-4 py-2 bg-slate-700 hover:bg-slate-600 disabled:opacity-50 rounded-lg text-sm text-slate-300 transition-colors"
                  >
                    取消
                  </button>
                  <button
                    onClick={() => handleSmartAssign('empty_only')}
                    disabled={isSmartAssigning || emptyAudioCount === 0}
                    className="px-4 py-2 bg-gradient-to-r from-teal-600 to-teal-500 hover:from-teal-500 hover:to-teal-400 disabled:opacity-50 rounded-lg text-sm text-white transition-colors flex items-center gap-2"
                  >
                    {isSmartAssigning && <Loader2 className="w-4 h-4 animate-spin" />}
                    仅分配空白角色
                  </button>
                  <button
                    onClick={() => handleSmartAssign('all')}
                    disabled={isSmartAssigning}
                    className="px-4 py-2 bg-amber-600 hover:bg-amber-500 disabled:opacity-50 rounded-lg text-sm text-white transition-colors flex items-center gap-2"
                  >
                    {isSmartAssigning && <Loader2 className="w-4 h-4 animate-spin" />}
                    全部重新分配
                  </button>
                </>
              ) : (
                <button
                  onClick={handleCloseSmartAssign}
                  className="px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg text-sm text-slate-300 transition-colors"
                >
                  关闭
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
