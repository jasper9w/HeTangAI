/**
 * DubbingPage - Dubbing/TTS management page with reference audio library
 */
import { Volume2, Play, Pause, FolderOpen, Loader2 } from 'lucide-react';
import { useState, useRef, useEffect } from 'react';
import type { Shot, Character } from '../types';

interface DubbingPageProps {
  shots: Shot[];
  characters: Character[];
}

interface ReferenceAudio {
  path: string;
  name: string;
  relativePath: string;
}

export function DubbingPage({ shots, characters: _characters }: DubbingPageProps) {
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [playingRefAudio, setPlayingRefAudio] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Reference audio state
  const [referenceDir, setReferenceDir] = useState<string>('/Users/wei/Downloads/800+音色/逗哥音色整理合集');
  const [referenceAudios, setReferenceAudios] = useState<ReferenceAudio[]>([]);
  const [isLoadingAudios, setIsLoadingAudios] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const shotsWithAudio = shots.filter((s) => s.audioUrl);
  const shotsWithScript = shots.filter((s) => s.script.trim());

  // Load reference audios when directory changes
  useEffect(() => {
    loadReferenceAudios();
  }, [referenceDir]);

  const loadReferenceAudios = async () => {
    if (!window.pywebview?.api) {
      console.warn('PyWebView API not available');
      return;
    }

    setIsLoadingAudios(true);
    try {
      console.log('Loading reference audios from:', referenceDir);
      // Call Python API to scan audio files
      const result = await window.pywebview.api.scan_reference_audios(referenceDir);
      console.log('Scan result:', result);
      if (result.success && result.audios) {
        setReferenceAudios(result.audios);
        console.log(`Loaded ${result.audios.length} audio files`);
      } else {
        console.error('Failed to scan audios:', result.error);
      }
    } catch (error) {
      console.error('Failed to load reference audios:', error);
    } finally {
      setIsLoadingAudios(false);
    }
  };

  const handleSelectReferenceDir = async () => {
    if (!window.pywebview?.api) {
      console.warn('PyWebView API not available');
      return;
    }

    try {
      console.log('Opening directory selector...');
      const result = await window.pywebview.api.select_reference_audio_dir();
      console.log('Select directory result:', result);
      if (result.success && result.path) {
        console.log('Selected directory:', result.path);
        setReferenceDir(result.path);
      } else {
        console.error('Failed to select directory:', result.error);
      }
    } catch (error) {
      console.error('Failed to select directory:', error);
    }
  };

  const handlePlayShot = (shot: Shot) => {
    if (playingId === shot.id) {
      audioRef.current?.pause();
      setPlayingId(null);
    } else {
      if (audioRef.current) {
        audioRef.current.pause();
      }
      audioRef.current = new Audio(shot.audioUrl);
      audioRef.current.play();
      audioRef.current.onended = () => setPlayingId(null);
      setPlayingId(shot.id);
      setPlayingRefAudio(null);
    }
  };

  const handlePlayRefAudio = async (audio: ReferenceAudio) => {
    if (playingRefAudio === audio.path) {
      audioRef.current?.pause();
      setPlayingRefAudio(null);
    } else {
      if (audioRef.current) {
        audioRef.current.pause();
      }

      try {
        // Request audio data from backend
        if (!window.pywebview?.api) return;

        const result = await window.pywebview.api.get_reference_audio_data(audio.path);
        if (result.success && result.data) {
          // Create blob from base64 data
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
            setPlayingRefAudio(null);
            URL.revokeObjectURL(url);
          };
          setPlayingRefAudio(audio.path);
          setPlayingId(null);
        }
      } catch (error) {
        console.error('Failed to play audio:', error);
      }
    }
  };

  // Filter reference audios by search query
  const filteredRefAudios = referenceAudios.filter((audio) =>
    audio.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    audio.relativePath.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="h-full flex">
      {/* Left: Generated Dubbing */}
      <div className="w-1/2 border-r border-slate-700 p-6 overflow-y-auto">
        <h2 className="text-xl font-semibold text-slate-100 mb-2">已生成配音</h2>
        <p className="text-slate-400 mb-6">
          已生成 {shotsWithAudio.length} / {shotsWithScript.length} 个配音
        </p>

        {shotsWithScript.length === 0 ? (
          <div className="bg-slate-800/50 rounded-lg p-8 text-center">
            <Volume2 className="w-16 h-16 mx-auto mb-4 text-slate-600" />
            <h3 className="text-lg font-medium text-slate-300 mb-2">暂无配音内容</h3>
            <p className="text-slate-500">导入镜头文案后可生成配音</p>
          </div>
        ) : (
          <div className="space-y-3">
            {shotsWithScript.map((shot) => (
              <div
                key={shot.id}
                className="bg-slate-800 rounded-lg p-4 flex items-start gap-4"
              >
                <div className="w-12 h-12 rounded-lg bg-slate-700 flex items-center justify-center flex-shrink-0">
                  <span className="text-lg font-bold text-slate-300">
                    #{shot.sequence}
                  </span>
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-sm font-medium text-slate-200">
                      {shot.voiceActor || '未指定配音角色'}
                    </span>
                    {shot.emotion && (
                      <span className="text-xs px-1.5 py-0.5 bg-slate-700 rounded text-slate-400">
                        {shot.emotion}
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-slate-400 line-clamp-2">{shot.script}</p>
                </div>

                <div className="flex-shrink-0">
                  {shot.audioUrl ? (
                    <button
                      onClick={() => handlePlayShot(shot)}
                      className="w-10 h-10 rounded-full bg-emerald-600 hover:bg-emerald-500 flex items-center justify-center transition-colors"
                    >
                      {playingId === shot.id ? (
                        <Pause className="w-5 h-5 text-white" />
                      ) : (
                        <Play className="w-5 h-5 text-white ml-0.5" />
                      )}
                    </button>
                  ) : (
                    <div className="w-10 h-10 rounded-full bg-slate-700 flex items-center justify-center">
                      <Volume2 className="w-5 h-5 text-slate-500" />
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Right: Reference Audio Library */}
      <div className="w-1/2 p-6 overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold text-slate-100">参考音库</h2>
          <button
            onClick={handleSelectReferenceDir}
            className="flex items-center gap-2 px-3 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg text-sm text-slate-200 transition-colors"
          >
            <FolderOpen className="w-4 h-4" />
            选择目录
          </button>
        </div>

        <div className="mb-4">
          <p className="text-xs text-slate-500 mb-2">当前目录:</p>
          <p className="text-sm text-slate-300 bg-slate-800 px-3 py-2 rounded truncate">
            {referenceDir}
          </p>
        </div>

        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="搜索音频文件..."
          className="w-full px-3 py-2 mb-4 bg-slate-800 rounded-lg text-sm text-slate-300 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-violet-500"
        />

        {isLoadingAudios ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-8 h-8 text-violet-500 animate-spin" />
          </div>
        ) : filteredRefAudios.length === 0 ? (
          <div className="bg-slate-800/50 rounded-lg p-8 text-center">
            <Volume2 className="w-16 h-16 mx-auto mb-4 text-slate-600" />
            <h3 className="text-lg font-medium text-slate-300 mb-2">
              {searchQuery ? '未找到匹配的音频' : '暂无音频文件'}
            </h3>
            <p className="text-slate-500">
              {searchQuery ? '尝试其他搜索关键词' : '选择包含音频文件的目录'}
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            <p className="text-xs text-slate-500 mb-2">
              共 {filteredRefAudios.length} 个音频文件
            </p>
            {filteredRefAudios.map((audio) => (
              <div
                key={audio.path}
                className="bg-slate-800 rounded-lg p-3 flex items-center gap-3 hover:bg-slate-700/50 transition-colors"
              >
                <button
                  onClick={() => handlePlayRefAudio(audio)}
                  className="w-8 h-8 rounded-full bg-violet-600 hover:bg-violet-500 flex items-center justify-center flex-shrink-0 transition-colors"
                >
                  {playingRefAudio === audio.path ? (
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
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
