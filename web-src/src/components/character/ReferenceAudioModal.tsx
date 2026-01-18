/**
 * ReferenceAudioModal - Modal for selecting reference audio
 */
import { useState, useRef, useEffect } from 'react';
import { X, Play, Pause, Search, Loader2, Check, Gauge } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface ReferenceAudio {
  path: string;
  name: string;
  relativePath: string;
}

interface ReferenceAudioModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (audioPath: string, speed: number) => void;
  currentAudioPath?: string;
  currentSpeed?: number;
}

export function ReferenceAudioModal({
  isOpen,
  onClose,
  onSelect,
  currentAudioPath,
  currentSpeed = 1.0,
}: ReferenceAudioModalProps) {
  const [referenceDir] = useState<string>('/Users/wei/Downloads/800+音色/逗哥音色整理合集');
  const [referenceAudios, setReferenceAudios] = useState<ReferenceAudio[]>([]);
  const [isLoadingAudios, setIsLoadingAudios] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [playingAudio, setPlayingAudio] = useState<string | null>(null);
  const [selectedAudio, setSelectedAudio] = useState<string | undefined>(currentAudioPath);
  const [selectedSpeed, setSelectedSpeed] = useState<number>(currentSpeed);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // 常用倍速选项
  const speedOptions = [0.5, 0.75, 1.0, 1.25, 1.5, 1.75, 2.0];

  // Load reference audios when modal opens
  useEffect(() => {
    if (isOpen) {
      loadReferenceAudios();
      setSelectedAudio(currentAudioPath);
      setSelectedSpeed(currentSpeed || 1.0);
    }
  }, [isOpen, currentAudioPath, currentSpeed]);

  const loadReferenceAudios = async () => {
    if (!window.pywebview?.api) return;

    setIsLoadingAudios(true);
    try {
      const result = await window.pywebview.api.scan_reference_audios(referenceDir);
      if (result.success && result.audios) {
        setReferenceAudios(result.audios);
      }
    } catch (error) {
      console.error('Failed to load reference audios:', error);
    } finally {
      setIsLoadingAudios(false);
    }
  };

  const handlePlayAudio = async (audio: ReferenceAudio) => {
    if (playingAudio === audio.path) {
      audioRef.current?.pause();
      setPlayingAudio(null);
    } else {
      if (audioRef.current) {
        audioRef.current.pause();
      }

      try {
        if (!window.pywebview?.api) return;

        const result = await window.pywebview.api.get_reference_audio_data(audio.path);
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
          audioRef.current.play();
          audioRef.current.onended = () => {
            setPlayingAudio(null);
            URL.revokeObjectURL(url);
          };
          setPlayingAudio(audio.path);
        }
      } catch (error) {
        console.error('Failed to play audio:', error);
      }
    }
  };

  const handleSelectAudio = (audioPath: string) => {
    setSelectedAudio(audioPath);
  };

  const handleConfirm = () => {
    if (selectedAudio) {
      onSelect(selectedAudio, selectedSpeed);
      onClose();
    }
  };

  const handleClose = () => {
    if (audioRef.current) {
      audioRef.current.pause();
    }
    setPlayingAudio(null);
    onClose();
  };

  const filteredAudios = referenceAudios.filter((audio) =>
    audio.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    audio.relativePath.toLowerCase().includes(searchQuery.toLowerCase())
  );

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-8"
        onClick={handleClose}
      >
        <motion.div
          initial={{ scale: 0.9 }}
          animate={{ scale: 1 }}
          exit={{ scale: 0.9 }}
          className="bg-slate-800 rounded-lg shadow-2xl w-full max-w-3xl max-h-[80vh] flex flex-col"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b border-slate-700">
            <h2 className="text-lg font-semibold text-slate-100">选择参考音与倍速</h2>
            <button
              onClick={handleClose}
              className="p-1 hover:bg-slate-700 rounded transition-colors"
            >
              <X className="w-5 h-5 text-slate-400" />
            </button>
          </div>

          {/* Speed Control */}
          <div className="p-4 border-b border-slate-700">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Gauge className="w-4 h-4 text-slate-400" />
                <span className="text-sm text-slate-400">配音倍速</span>
              </div>
              <span className="text-sm font-medium text-violet-400">
                {selectedSpeed}x
              </span>
            </div>
            <div className="flex gap-2 flex-wrap">
              {speedOptions.map((speed) => (
                <button
                  key={speed}
                  onClick={() => setSelectedSpeed(speed)}
                  className={`px-3 py-1.5 rounded text-sm transition-colors ${
                    selectedSpeed === speed
                      ? 'bg-violet-600 text-white'
                      : 'bg-slate-700 text-slate-400 hover:bg-slate-600'
                  }`}
                >
                  {speed}x
                </button>
              ))}
            </div>
          </div>

          {/* Search */}
          <div className="p-4 border-b border-slate-700">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="搜索音频文件..."
                className="w-full pl-10 pr-3 py-2 bg-slate-700 rounded-lg text-sm text-slate-300 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-violet-500"
              />
            </div>
          </div>

          {/* Audio List */}
          <div className="flex-1 overflow-y-auto p-4">
            {isLoadingAudios ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-8 h-8 text-violet-500 animate-spin" />
              </div>
            ) : filteredAudios.length === 0 ? (
              <div className="text-center py-12 text-slate-500">
                {searchQuery ? '未找到匹配的音频' : '暂无音频文件'}
              </div>
            ) : (
              <div className="space-y-2">
                <p className="text-xs text-slate-500 mb-2">
                  共 {filteredAudios.length} 个音频文件
                </p>
                {filteredAudios.map((audio) => {
                  const isSelected = selectedAudio === audio.path;
                  const isPlaying = playingAudio === audio.path;

                  return (
                    <div
                      key={audio.path}
                      className={`flex items-center gap-3 p-3 rounded-lg transition-colors cursor-pointer ${
                        isSelected
                          ? 'bg-violet-600/20 ring-1 ring-violet-500'
                          : 'bg-slate-700/50 hover:bg-slate-700'
                      }`}
                      onClick={() => handleSelectAudio(audio.path)}
                    >
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handlePlayAudio(audio);
                        }}
                        className="w-8 h-8 rounded-full bg-violet-600 hover:bg-violet-500 flex items-center justify-center flex-shrink-0 transition-colors"
                      >
                        {isPlaying ? (
                          <Pause className="w-4 h-4 text-white" />
                        ) : (
                          <Play className="w-4 h-4 text-white ml-0.5" />
                        )}
                      </button>

                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-slate-200 truncate">
                          {audio.name}
                        </p>
                        <p className="text-xs text-slate-500 truncate">
                          {audio.relativePath}
                        </p>
                      </div>

                      {isSelected && (
                        <Check className="w-5 h-5 text-violet-400 flex-shrink-0" />
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-end gap-2 p-4 border-t border-slate-700">
            <button
              onClick={handleClose}
              className="px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg text-sm text-slate-200 transition-colors"
            >
              取消
            </button>
            <button
              onClick={handleConfirm}
              disabled={!selectedAudio}
              className="px-4 py-2 bg-violet-600 hover:bg-violet-500 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg text-sm text-white transition-colors"
            >
              确定
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
