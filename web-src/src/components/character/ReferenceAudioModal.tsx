/**
 * ReferenceAudioModal - Modal for selecting reference audio
 * Supports both preset audio library and user's custom audio files
 */
import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import {
  X,
  Play,
  Pause,
  Search,
  Loader2,
  FolderOpen,
  Sparkles,
  User,
  Users,
  Volume2,
  Wand2,
  Minus,
  Plus,
  Star,
  ChevronDown,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import type { AppSettings, PresetAudio, ReferenceAudio, AudioRecommendation, AudioUsageRecord } from '../../types';

type MainTab = 'preset' | 'custom';
type UsageTab = 'smart' | 'narration' | 'voiceover';
type GenderFilter = 'all' | '男' | '女';
type AgeGroupFilter = 'all' | '儿童' | '少年' | '青年' | '中年' | '老年';
type SpeedFilter = 'all' | '较慢' | '适中' | '较快';

interface ReferenceAudioModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (audioPath: string, speed: number) => void;
  currentAudioPath?: string;
  currentSpeed?: number;
  isNarrator?: boolean;
  audioRecommendations?: AudioRecommendation[];
}

export function ReferenceAudioModal({
  isOpen,
  onClose,
  onSelect,
  currentAudioPath,
  currentSpeed = 1.0,
  isNarrator = false,
  audioRecommendations = [],
}: ReferenceAudioModalProps) {
  // Main state
  const [mainTab, setMainTab] = useState<MainTab>('preset');
  const [usageTab, setUsageTab] = useState<UsageTab>(
    audioRecommendations.length > 0 ? 'smart' : (isNarrator ? 'narration' : 'voiceover')
  );
  
  // Filter state
  const [genderFilter, setGenderFilter] = useState<GenderFilter>('all');
  const [ageGroupFilter, setAgeGroupFilter] = useState<AgeGroupFilter>('all');
  const [speedFilter, setSpeedFilter] = useState<SpeedFilter>('all');
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [selectedRoles, setSelectedRoles] = useState<string[]>([]);
  const [tagSearch, setTagSearch] = useState('');
  const [roleSearch, setRoleSearch] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  // Preset audio state
  const [presetAudios, setPresetAudios] = useState<PresetAudio[]>([]);
  const [isLoadingPreset, setIsLoadingPreset] = useState(false);

  // Custom audio state
  const [referenceDir, setReferenceDir] = useState<string>('');
  const [customAudios, setCustomAudios] = useState<ReferenceAudio[]>([]);
  const [isLoadingCustom, setIsLoadingCustom] = useState(false);
  const [isLoadingSettings, setIsLoadingSettings] = useState(false);

  // Selection state
  const [selectedAudio, setSelectedAudio] = useState<string | undefined>(currentAudioPath);
  const [audioSpeeds, setAudioSpeeds] = useState<Record<string, number>>({});
  const [playingAudio, setPlayingAudio] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Global preferences state (persisted)
  const [favorites, setFavorites] = useState<string[]>([]);
  
  // Initial preferences for sorting (frozen at modal open, not updated during interaction)
  const [initialFavorites, setInitialFavorites] = useState<string[]>([]);
  const [initialRecentlyUsed, setInitialRecentlyUsed] = useState<AudioUsageRecord[]>([]);

  // Extract unique tags and roles from preset audios
  const allTags = useMemo(() => {
    const tagSet = new Set<string>();
    presetAudios.forEach(a => a.tags.forEach(t => tagSet.add(t)));
    return Array.from(tagSet).sort();
  }, [presetAudios]);

  const allRoles = useMemo(() => {
    const roleSet = new Set<string>();
    presetAudios.forEach(a => {
      a.typicalRoles.split(/[、,，]/).forEach(r => {
        const trimmed = r.trim();
        if (trimmed) roleSet.add(trimmed);
      });
    });
    return Array.from(roleSet).sort();
  }, [presetAudios]);

  // Count active filters for badge
  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (genderFilter !== 'all') count++;
    if (ageGroupFilter !== 'all') count++;
    if (speedFilter !== 'all') count++;
    count += selectedTags.length;
    count += selectedRoles.length;
    return count;
  }, [genderFilter, ageGroupFilter, speedFilter, selectedTags, selectedRoles]);

  // Get speed for a specific audio (default to currentSpeed)
  const getAudioSpeed = (audioPath: string) => {
    return audioSpeeds[audioPath] ?? currentSpeed;
  };

  // Speed change handler for specific audio (with persistence)
  const handleSpeedChange = (audioPath: string, delta: number) => {
    setAudioSpeeds(prev => {
      const currentSpeedValue = prev[audioPath] ?? currentSpeed;
      const newSpeed = Math.max(0.5, Math.min(2.0, Math.round((currentSpeedValue + delta) * 100) / 100));
      // Update playback rate if this audio is currently playing
      if (audioRef.current && playingAudio === audioPath) {
        audioRef.current.playbackRate = newSpeed;
      }
      // Persist speed change
      window.pywebview?.api?.set_audio_speed(audioPath, newSpeed);
      return { ...prev, [audioPath]: newSpeed };
    });
  };

  // Load global audio preferences
  const loadAudioPreferences = useCallback(async () => {
    if (!window.pywebview?.api) return;
    try {
      const result = await window.pywebview.api.get_audio_preferences();
      if (result.success) {
        const favs = result.favorites || [];
        const recent = result.recentlyUsed || [];
        setAudioSpeeds(result.speeds || {});
        setFavorites(favs);
        // Set initial values for sorting (frozen during this session)
        setInitialFavorites(favs);
        setInitialRecentlyUsed(recent);
      }
    } catch (error) {
      console.error('Failed to load audio preferences:', error);
    }
  }, []);

  // Toggle favorite status
  const handleToggleFavorite = async (audioPath: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!window.pywebview?.api) return;
    try {
      const result = await window.pywebview.api.toggle_audio_favorite(audioPath);
      if (result.success) {
        setFavorites(prev => 
          result.isFavorite 
            ? [...prev, audioPath]
            : prev.filter(p => p !== audioPath)
        );
      }
    } catch (error) {
      console.error('Failed to toggle favorite:', error);
    }
  };

  // Check if audio is favorited
  const isFavorite = (audioPath: string) => favorites.includes(audioPath);

  // Load preset audios
  const loadPresetAudios = useCallback(async () => {
    if (!window.pywebview?.api) return;

    setIsLoadingPreset(true);
    try {
      const result = await window.pywebview.api.get_preset_audios();
      if (result.success && result.audios) {
        setPresetAudios(result.audios);
      }
    } catch (error) {
      console.error('Failed to load preset audios:', error);
    } finally {
      setIsLoadingPreset(false);
    }
  }, []);

  // Load custom audios
  const loadCustomAudios = useCallback(async (dir: string) => {
    if (!window.pywebview?.api || !dir) return;

    setIsLoadingCustom(true);
    try {
      const result = await window.pywebview.api.scan_reference_audios(dir);
      if (result.success && result.audios) {
        setCustomAudios(result.audios);
      }
    } catch (error) {
      console.error('Failed to load custom audios:', error);
    } finally {
      setIsLoadingCustom(false);
    }
  }, []);

  // Load settings and audios
  const loadSettingsAndAudios = useCallback(async () => {
    if (!window.pywebview?.api) return;

    setIsLoadingSettings(true);
    try {
      const settingsResult = await window.pywebview.api.get_settings() as { success: boolean; settings?: AppSettings };
      if (settingsResult.success && settingsResult.settings?.referenceAudioDir) {
        const dir = settingsResult.settings.referenceAudioDir;
        setReferenceDir(dir);
        await loadCustomAudios(dir);
      } else {
        setReferenceDir('');
        setCustomAudios([]);
      }
    } catch (error) {
      console.error('Failed to load settings:', error);
    } finally {
      setIsLoadingSettings(false);
    }
  }, [loadCustomAudios]);

  // Determine initial tab based on current audio path
  const determineInitialTab = useCallback((audioPath: string | undefined, presets: PresetAudio[]): { mainTab: MainTab; usageTab: UsageTab } => {
    // 1. 无音频 - 默认逻辑
    if (!audioPath) {
      return {
        mainTab: 'preset',
        usageTab: audioRecommendations.length > 0 ? 'smart' : (isNarrator ? 'narration' : 'voiceover')
      };
    }

    // 2. 自定义音频（无 preset: 前缀）→ 我的参考音
    if (!audioPath.startsWith('preset:')) {
      return { mainTab: 'custom', usageTab: isNarrator ? 'narration' : 'voiceover' };
    }

    // 3. 优先检查：是否在智能推荐列表中
    if (audioRecommendations.some(rec => `preset:${rec.audioPath}` === audioPath)) {
      return { mainTab: 'preset', usageTab: 'smart' };
    }

    // 4. 根据 usage 字段判断旁白/配音
    const presetPath = audioPath.replace('preset:', '');
    const presetAudio = presets.find(a => a.path === presetPath);
    
    if (presetAudio) {
      const usage = presetAudio.usage || '';
      // 纯旁白（不含"配音"）
      if (usage.includes('旁白') && !usage.includes('配音')) {
        return { mainTab: 'preset', usageTab: 'narration' };
      }
      // 配音或配音+旁白
      if (usage.includes('配音')) {
        return { mainTab: 'preset', usageTab: 'voiceover' };
      }
    }

    // 5. 默认
    return { mainTab: 'preset', usageTab: isNarrator ? 'narration' : 'voiceover' };
  }, [audioRecommendations, isNarrator]);

  // Initialize on modal open
  useEffect(() => {
    if (isOpen) {
      loadPresetAudios();
      loadSettingsAndAudios();
      loadAudioPreferences();  // Load global preferences (speeds, favorites, recentlyUsed)
      setSelectedAudio(currentAudioPath);
      
      // Set initial tabs based on current audio
      if (!currentAudioPath) {
        // No audio selected - use default
        setMainTab('preset');
        setUsageTab(audioRecommendations.length > 0 ? 'smart' : (isNarrator ? 'narration' : 'voiceover'));
      } else if (!currentAudioPath.startsWith('preset:')) {
        // Custom audio
        setMainTab('custom');
      }
      // For preset audio, we'll set the correct tab after presetAudios loads
    }
  }, [isOpen, currentAudioPath, currentSpeed, isNarrator, audioRecommendations.length, loadPresetAudios, loadSettingsAndAudios, loadAudioPreferences]);

  // Update usage tab when preset audios are loaded (for preset audio selection)
  useEffect(() => {
    if (isOpen && currentAudioPath?.startsWith('preset:') && presetAudios.length > 0) {
      const { mainTab: newMainTab, usageTab: newUsageTab } = determineInitialTab(currentAudioPath, presetAudios);
      setMainTab(newMainTab);
      setUsageTab(newUsageTab);
    }
  }, [isOpen, currentAudioPath, presetAudios, determineInitialTab]);

  // ESC key to close
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        handleClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  // Filter and sort preset audios - with selected audio at top
  const filteredPresetAudios = useMemo(() => {
    const filtered = presetAudios.filter((audio) => {
      // Usage filter (based on sub-tab)
      const usage = audio.usage || '';
      if (usageTab === 'narration' && !usage.includes('旁白')) return false;
      if (usageTab === 'voiceover' && !usage.includes('配音')) return false;

      // Gender filter
      if (genderFilter !== 'all' && audio.gender !== genderFilter) return false;

      // Age group filter
      if (ageGroupFilter !== 'all' && audio.ageGroup !== ageGroupFilter) return false;

      // Speed filter
      if (speedFilter !== 'all' && audio.speed !== speedFilter) return false;

      // Tags filter (multi-select, OR logic)
      if (selectedTags.length > 0) {
        if (!selectedTags.some(tag => audio.tags.includes(tag))) return false;
      }

      // Roles filter (multi-select, OR logic)
      if (selectedRoles.length > 0) {
        const audioRoles = audio.typicalRoles.split(/[、,，]/).map(r => r.trim());
        if (!selectedRoles.some(role => audioRoles.includes(role))) return false;
      }

      // Search query
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        const searchFields = [
          audio.name,
          audio.typicalRoles,
          audio.description,
          ...audio.tags,
        ].join(' ').toLowerCase();
        if (!searchFields.includes(query)) return false;
      }

      return true;
    });

    // Sort: current > favorites > recently used > others
    // Uses initial values (frozen at modal open) to prevent position jumping
    const currentPath = currentAudioPath?.replace('preset:', '');
    const initialRecentPaths = new Set(initialRecentlyUsed.map(r => r.path));
    
    return filtered.sort((a, b) => {
      const aFullPath = `preset:${a.path}`;
      const bFullPath = `preset:${b.path}`;
      
      // 1. Current audio first
      const aCurrent = a.path === currentPath;
      const bCurrent = b.path === currentPath;
      if (aCurrent && !bCurrent) return -1;
      if (!aCurrent && bCurrent) return 1;
      
      // 2. Favorites second (using initial favorites for stable sorting)
      const aFav = initialFavorites.includes(aFullPath);
      const bFav = initialFavorites.includes(bFullPath);
      if (aFav && !bFav) return -1;
      if (!aFav && bFav) return 1;
      
      // 3. Recently used third
      const aRecent = initialRecentPaths.has(aFullPath);
      const bRecent = initialRecentPaths.has(bFullPath);
      if (aRecent && !bRecent) return -1;
      if (!aRecent && bRecent) return 1;
      
      return 0;
    });
  }, [presetAudios, usageTab, genderFilter, ageGroupFilter, speedFilter, selectedTags, selectedRoles, searchQuery, currentAudioPath, initialFavorites, initialRecentlyUsed]);

  // Filter and sort custom audios - with selected audio at top
  const filteredCustomAudios = useMemo(() => {
    let filtered = customAudios;
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = customAudios.filter((audio) =>
        audio.name.toLowerCase().includes(query) ||
        audio.relativePath.toLowerCase().includes(query)
      );
    }

    // Sort: current > favorites > recently used > others
    // Uses initial values (frozen at modal open) to prevent position jumping
    const initialRecentPaths = new Set(initialRecentlyUsed.map(r => r.path));
    
    return [...filtered].sort((a, b) => {
      // 1. Current audio first
      const aCurrent = a.path === currentAudioPath;
      const bCurrent = b.path === currentAudioPath;
      if (aCurrent && !bCurrent) return -1;
      if (!aCurrent && bCurrent) return 1;
      
      // 2. Favorites second (using initial favorites for stable sorting)
      const aFav = initialFavorites.includes(a.path);
      const bFav = initialFavorites.includes(b.path);
      if (aFav && !bFav) return -1;
      if (!aFav && bFav) return 1;
      
      // 3. Recently used third
      const aRecent = initialRecentPaths.has(a.path);
      const bRecent = initialRecentPaths.has(b.path);
      if (aRecent && !bRecent) return -1;
      if (!aRecent && bRecent) return 1;
      
      return 0;
    });
  }, [customAudios, searchQuery, currentAudioPath, initialFavorites, initialRecentlyUsed]);

  // Play audio
  const handlePlayAudio = async (audioPath: string, isPreset: boolean) => {
    const fullPath = isPreset ? `preset:${audioPath}` : audioPath;

    if (playingAudio === fullPath) {
      audioRef.current?.pause();
      setPlayingAudio(null);
      return;
    }

    if (audioRef.current) {
      audioRef.current.pause();
    }

    try {
      if (!window.pywebview?.api) return;

      const result = await window.pywebview.api.get_reference_audio_data(fullPath);
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
        audioRef.current.playbackRate = getAudioSpeed(fullPath);
        audioRef.current.play();
        audioRef.current.onended = () => {
          setPlayingAudio(null);
          URL.revokeObjectURL(url);
        };
        setPlayingAudio(fullPath);
      }
    } catch (error) {
      console.error('Failed to play audio:', error);
    }
  };

  // Handle item click - select, and stop if currently playing
  const handleItemClick = (audioPath: string, isPreset: boolean) => {
    const fullPath = isPreset ? `preset:${audioPath}` : audioPath;
    // If this audio is playing, stop it
    if (playingAudio === fullPath) {
      audioRef.current?.pause();
      setPlayingAudio(null);
    }
    // Always select the audio
    setSelectedAudio(fullPath);
  };

  // Handle item double click - play the audio
  const handleItemDoubleClick = (audioPath: string, isPreset: boolean) => {
    handlePlayAudio(audioPath, isPreset);
  };

  // Confirm selection with audio's speed
  const handleConfirm = () => {
    if (selectedAudio) {
      // Record usage for analytics
      window.pywebview?.api?.record_audio_usage(selectedAudio);
      onSelect(selectedAudio, getAudioSpeed(selectedAudio));
      onClose();
    }
  };

  // Close modal
  const handleClose = () => {
    if (audioRef.current) {
      audioRef.current.pause();
    }
    setPlayingAudio(null);
    onClose();
  };

  // Reset filters
  const handleResetFilters = () => {
    setGenderFilter('all');
    setAgeGroupFilter('all');
    setSpeedFilter('all');
    setSelectedTags([]);
    setSelectedRoles([]);
    setTagSearch('');
    setRoleSearch('');
    setSearchQuery('');
  };

  // Toggle tag selection
  const handleToggleTag = (tag: string) => {
    setSelectedTags(prev => 
      prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag]
    );
  };

  // Toggle role selection
  const handleToggleRole = (role: string) => {
    setSelectedRoles(prev => 
      prev.includes(role) ? prev.filter(r => r !== role) : [...prev, role]
    );
  };

  // Get preset audio info by path
  const getPresetAudioByPath = (path: string) => {
    return presetAudios.find(a => a.path === path);
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4"
        onClick={handleClose}
      >
        <motion.div
          initial={{ scale: 0.9 }}
          animate={{ scale: 1 }}
          exit={{ scale: 0.9 }}
          className="bg-slate-800 rounded-lg shadow-2xl w-full max-w-4xl h-[85vh] flex flex-col"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b border-slate-700">
            <h2 className="text-lg font-semibold text-slate-100">选择参考音</h2>
            <button
              onClick={handleClose}
              className="p-1 hover:bg-slate-700 rounded transition-colors"
            >
              <X className="w-5 h-5 text-slate-400" />
            </button>
          </div>

          {/* Main Tabs */}
          <div className="flex border-b border-slate-700">
            <button
              onClick={() => setMainTab('preset')}
              className={`flex-1 px-4 py-3 text-sm font-medium flex items-center justify-center gap-2 transition-colors ${
                mainTab === 'preset'
                  ? 'text-teal-400 border-b-2 border-teal-400 bg-slate-700/30'
                  : 'text-slate-400 hover:text-slate-300 hover:bg-slate-700/20'
              }`}
            >
              <Sparkles className="w-4 h-4" />
              预置参考音
            </button>
            <button
              onClick={() => setMainTab('custom')}
              className={`flex-1 px-4 py-3 text-sm font-medium flex items-center justify-center gap-2 transition-colors ${
                mainTab === 'custom'
                  ? 'text-teal-400 border-b-2 border-teal-400 bg-slate-700/30'
                  : 'text-slate-400 hover:text-slate-300 hover:bg-slate-700/20'
              }`}
            >
              <FolderOpen className="w-4 h-4" />
              我的参考音
            </button>
          </div>

          {/* Preset Audio Content */}
          {mainTab === 'preset' && (
            <>
              {/* Combined Tabs + Filters + Search Bar */}
              <div className="flex items-center gap-2 p-2 border-b border-slate-700 bg-slate-800/50">
                {/* Usage Tabs Section */}
                <div className="flex gap-1 flex-shrink-0">
                  <button
                    onClick={() => setUsageTab('smart')}
                    className={`px-3 py-1.5 rounded text-xs font-medium flex items-center gap-1.5 transition-colors ${
                      usageTab === 'smart'
                        ? 'bg-teal-600 text-white'
                        : 'bg-slate-700 text-slate-400 hover:bg-slate-600'
                    }`}
                  >
                    <Wand2 className="w-3.5 h-3.5" />
                    智能匹配
                    {audioRecommendations.length > 0 && (
                      <span className="px-1 py-0.5 bg-white/20 rounded text-xs">
                        {audioRecommendations.length}
                      </span>
                    )}
                  </button>
                  <button
                    onClick={() => setUsageTab('narration')}
                    className={`px-3 py-1.5 rounded text-xs font-medium flex items-center gap-1.5 transition-colors ${
                      usageTab === 'narration'
                        ? 'bg-teal-600 text-white'
                        : 'bg-slate-700 text-slate-400 hover:bg-slate-600'
                    }`}
                  >
                    <User className="w-3.5 h-3.5" />
                    旁白
                  </button>
                  <button
                    onClick={() => setUsageTab('voiceover')}
                    className={`px-3 py-1.5 rounded text-xs font-medium flex items-center gap-1.5 transition-colors ${
                      usageTab === 'voiceover'
                        ? 'bg-teal-600 text-white'
                        : 'bg-slate-700 text-slate-400 hover:bg-slate-600'
                    }`}
                  >
                    <Users className="w-3.5 h-3.5" />
                    配音
                  </button>
                </div>

                {/* Filters Section - Only show for narration/voiceover */}
                {(usageTab === 'narration' || usageTab === 'voiceover') && (
                  <>
                    {/* Divider */}
                    <div className="w-px h-6 bg-slate-600 flex-shrink-0" />

                    <div className="flex items-center gap-1 flex-shrink-0">
                      {/* Gender Filter Dropdown */}
                      <div className="relative group">
                        <button className={`px-2 py-1.5 rounded text-xs flex items-center gap-1 transition-colors ${
                          genderFilter !== 'all' ? 'bg-blue-600 text-white' : 'bg-slate-700 text-slate-400 hover:bg-slate-600'
                        }`}>
                          <span>性别</span>
                          {genderFilter !== 'all' && <span className="font-medium">: {genderFilter === '男' ? '男' : '女'}</span>}
                          <ChevronDown className="w-3 h-3" />
                        </button>
                        <div className="absolute top-full left-0 mt-1 p-1.5 bg-slate-800 rounded-lg shadow-xl border border-slate-600 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-20 min-w-[80px]">
                          {(['all', '男', '女'] as GenderFilter[]).map((g) => (
                            <button
                              key={g}
                              onClick={() => setGenderFilter(g)}
                              className={`w-full px-2 py-1 rounded text-xs text-left transition-colors ${
                                genderFilter === g ? 'bg-blue-600 text-white' : 'text-slate-300 hover:bg-slate-700'
                              }`}
                            >
                              {g === 'all' ? '全部' : g === '男' ? '男声' : '女声'}
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Age Filter Dropdown */}
                      <div className="relative group">
                        <button className={`px-2 py-1.5 rounded text-xs flex items-center gap-1 transition-colors ${
                          ageGroupFilter !== 'all' ? 'bg-green-600 text-white' : 'bg-slate-700 text-slate-400 hover:bg-slate-600'
                        }`}>
                          <span>年龄</span>
                          {ageGroupFilter !== 'all' && <span className="font-medium">: {ageGroupFilter}</span>}
                          <ChevronDown className="w-3 h-3" />
                        </button>
                        <div className="absolute top-full left-0 mt-1 p-1.5 bg-slate-800 rounded-lg shadow-xl border border-slate-600 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-20 min-w-[80px]">
                          {(['all', '儿童', '少年', '青年', '中年', '老年'] as AgeGroupFilter[]).map((a) => (
                            <button
                              key={a}
                              onClick={() => setAgeGroupFilter(a)}
                              className={`w-full px-2 py-1 rounded text-xs text-left transition-colors ${
                                ageGroupFilter === a ? 'bg-green-600 text-white' : 'text-slate-300 hover:bg-slate-700'
                              }`}
                            >
                              {a === 'all' ? '全部' : a}
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Speed Filter Dropdown */}
                      <div className="relative group">
                        <button className={`px-2 py-1.5 rounded text-xs flex items-center gap-1 transition-colors ${
                          speedFilter !== 'all' ? 'bg-orange-600 text-white' : 'bg-slate-700 text-slate-400 hover:bg-slate-600'
                        }`}>
                          <span>语速</span>
                          {speedFilter !== 'all' && <span className="font-medium">: {speedFilter}</span>}
                          <ChevronDown className="w-3 h-3" />
                        </button>
                        <div className="absolute top-full left-0 mt-1 p-1.5 bg-slate-800 rounded-lg shadow-xl border border-slate-600 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-20 min-w-[80px]">
                          {(['all', '较慢', '适中', '较快'] as SpeedFilter[]).map((s) => (
                            <button
                              key={s}
                              onClick={() => setSpeedFilter(s)}
                              className={`w-full px-2 py-1 rounded text-xs text-left transition-colors ${
                                speedFilter === s ? 'bg-orange-600 text-white' : 'text-slate-300 hover:bg-slate-700'
                              }`}
                            >
                              {s === 'all' ? '全部' : s}
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Tags Filter Dropdown */}
                      {allTags.length > 0 && (
                        <div className="relative group">
                          <button className={`px-2 py-1.5 rounded text-xs flex items-center gap-1 transition-colors ${
                            selectedTags.length > 0 ? 'bg-teal-600 text-white' : 'bg-slate-700 text-slate-400 hover:bg-slate-600'
                          }`}>
                            <span>标签</span>
                            {selectedTags.length > 0 && <span className="px-1 bg-white/20 rounded">{selectedTags.length}</span>}
                            <ChevronDown className="w-3 h-3" />
                          </button>
                          <div className="absolute top-full left-0 mt-1 bg-slate-800 rounded-lg shadow-xl border border-slate-600 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-20 w-80">
                            <div className="p-2 border-b border-slate-700">
                              <input
                                type="text"
                                value={tagSearch}
                                onChange={(e) => setTagSearch(e.target.value)}
                                placeholder="搜索标签..."
                                className="w-full px-2 py-1 bg-slate-700 rounded text-xs text-slate-300 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-teal-500"
                                onClick={(e) => e.stopPropagation()}
                              />
                            </div>
                            <div className="p-3 max-h-48 overflow-y-auto">
                              <div className="flex flex-wrap gap-1.5">
                                {allTags
                                  .filter(tag => tag.toLowerCase().includes(tagSearch.toLowerCase()))
                                  .map((tag) => (
                                    <button
                                      key={tag}
                                      onClick={() => handleToggleTag(tag)}
                                      className={`px-2.5 py-1.5 rounded text-xs transition-colors ${
                                        selectedTags.includes(tag) ? 'bg-violet-600 text-white' : 'bg-slate-700 text-slate-400 hover:bg-slate-600'
                                      }`}
                                    >
                                      {tag}
                                    </button>
                                  ))}
                              </div>
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Roles Filter Dropdown */}
                      {allRoles.length > 0 && (
                        <div className="relative group">
                          <button className={`px-2 py-1.5 rounded text-xs flex items-center gap-1 transition-colors ${
                            selectedRoles.length > 0 ? 'bg-pink-600 text-white' : 'bg-slate-700 text-slate-400 hover:bg-slate-600'
                          }`}>
                            <span>角色</span>
                            {selectedRoles.length > 0 && <span className="px-1 bg-white/20 rounded">{selectedRoles.length}</span>}
                            <ChevronDown className="w-3 h-3" />
                          </button>
                          <div className="absolute top-full left-0 mt-1 bg-slate-800 rounded-lg shadow-xl border border-slate-600 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-20 w-80">
                            <div className="p-2 border-b border-slate-700">
                              <input
                                type="text"
                                value={roleSearch}
                                onChange={(e) => setRoleSearch(e.target.value)}
                                placeholder="搜索角色..."
                                className="w-full px-2 py-1 bg-slate-700 rounded text-xs text-slate-300 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-pink-500"
                                onClick={(e) => e.stopPropagation()}
                              />
                            </div>
                            <div className="p-3 max-h-48 overflow-y-auto">
                              <div className="flex flex-wrap gap-1.5">
                                {allRoles
                                  .filter(role => role.toLowerCase().includes(roleSearch.toLowerCase()))
                                  .map((role) => (
                                    <button
                                      key={role}
                                      onClick={() => handleToggleRole(role)}
                                      className={`px-2.5 py-1.5 rounded text-xs transition-colors ${
                                        selectedRoles.includes(role) ? 'bg-pink-600 text-white' : 'bg-slate-700 text-slate-400 hover:bg-slate-600'
                                      }`}
                                    >
                                      {role}
                                    </button>
                                  ))}
                              </div>
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Reset filters */}
                      {activeFilterCount > 0 && (
                        <button
                          onClick={handleResetFilters}
                          className="px-2 py-1.5 rounded text-xs bg-slate-600 text-slate-300 hover:bg-slate-500 transition-colors"
                        >
                          重置
                        </button>
                      )}
                    </div>

                    {/* Divider */}
                    <div className="w-px h-6 bg-slate-600 flex-shrink-0" />
                  </>
                )}

                {/* Search - takes remaining space */}
                {(usageTab === 'narration' || usageTab === 'voiceover') && (
                  <div className="relative flex-1 min-w-[120px]">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500" />
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="搜索名称、标签、典型角色..."
                      className="w-full pl-8 pr-3 py-1.5 bg-slate-700 rounded text-xs text-slate-300 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-teal-500"
                    />
                  </div>
                )}
              </div>

              {/* Smart Match Content */}
              {usageTab === 'smart' && (
                <div className="flex-1 overflow-y-auto p-4">
                  {audioRecommendations.length > 0 ? (
                    <>
                      <p className="text-xs text-slate-500 mb-3">
                        系统为当前角色推荐了 {audioRecommendations.length} 个参考音
                      </p>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        {audioRecommendations.map((rec, idx) => {
                          const fullPath = `preset:${rec.audioPath}`;
                          const isSelected = selectedAudio === fullPath;
                          const isPlaying = playingAudio === fullPath;
                          const audioInfo = getPresetAudioByPath(rec.audioPath);

                          return (
                            <div
                              key={idx}
                              onClick={() => handleItemClick(rec.audioPath, true)}
                              onDoubleClick={() => handleItemDoubleClick(rec.audioPath, true)}
                              className={`relative p-4 rounded-lg cursor-pointer transition-all ${
                                isSelected
                                  ? 'bg-violet-600/20 ring-2 ring-violet-500'
                                  : 'bg-slate-700/50 hover:bg-slate-700'
                              }`}
                            >
                              {/* Top right: favorite button */}
                              <button
                                onClick={(e) => handleToggleFavorite(fullPath, e)}
                                className={`absolute top-3 right-3 p-1 rounded transition-colors ${
                                  isFavorite(fullPath)
                                    ? 'text-yellow-400'
                                    : 'text-slate-500 hover:text-yellow-400'
                                }`}
                                title={isFavorite(fullPath) ? '取消收藏' : '收藏'}
                              >
                                <Star className={`w-4 h-4 ${isFavorite(fullPath) ? 'fill-current' : ''}`} />
                              </button>

                              <div className="flex items-start gap-3">
                                {/* Play button */}
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handlePlayAudio(rec.audioPath, true);
                                  }}
                                  className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 transition-colors ${
                                    isPlaying
                                      ? 'bg-violet-600 text-white'
                                      : 'bg-slate-600 text-slate-300 hover:bg-slate-500'
                                  }`}
                                >
                                  {isPlaying ? (
                                    <Pause className="w-4 h-4" />
                                  ) : (
                                    <Play className="w-4 h-4 ml-0.5" />
                                  )}
                                </button>

                                <div className="flex-1 min-w-0">
                                  {/* Name and gender */}
                                  <div className="flex items-center gap-2 mb-1">
                                    <span className="font-medium text-slate-200">
                                      {rec.audioName}
                                    </span>
                                    {audioInfo && (
                                      <span className={`text-xs px-1.5 py-0.5 rounded ${
                                        audioInfo.gender === '女' 
                                          ? 'bg-pink-500/20 text-pink-300'
                                          : 'bg-blue-500/20 text-blue-300'
                                      }`}>
                                        {audioInfo.gender}
                                      </span>
                                    )}
                                  </div>

                                  {/* Reason */}
                                  <p className="text-sm text-violet-400 mb-2">
                                    {rec.reason}
                                  </p>

                                  {/* Audio info */}
                                  {audioInfo && (
                                    <div className="flex items-center gap-2 text-xs text-slate-400">
                                      <span>{audioInfo.age}</span>
                                      <span className="text-slate-600">|</span>
                                      <span>{audioInfo.speed}</span>
                                      {audioInfo.tags.slice(0, 2).map((tag, i) => (
                                        <span key={i} className="px-1.5 py-0.5 bg-slate-600/50 rounded">
                                          {tag}
                                        </span>
                                      ))}
                                    </div>
                                  )}

                                  {/* Speed Control */}
                                  <div className="flex items-center gap-1.5 mt-2" onClick={e => e.stopPropagation()}>
                                    <span className="text-xs text-slate-500">倍速</span>
                                    <button
                                      onClick={() => handleSpeedChange(fullPath, -0.05)}
                                      disabled={getAudioSpeed(fullPath) <= 0.5}
                                      className="w-5 h-5 rounded flex items-center justify-center bg-slate-600 hover:bg-slate-500 disabled:opacity-30 text-slate-300 transition-colors"
                                    >
                                      <Minus className="w-2.5 h-2.5" />
                                    </button>
                                    <span className="text-xs font-medium text-teal-400 min-w-[40px] text-center">
                                      {getAudioSpeed(fullPath).toFixed(2)}x
                                    </span>
                                    <button
                                      onClick={() => handleSpeedChange(fullPath, 0.05)}
                                      disabled={getAudioSpeed(fullPath) >= 2.0}
                                      className="w-5 h-5 rounded flex items-center justify-center bg-slate-600 hover:bg-slate-500 disabled:opacity-30 text-slate-300 transition-colors"
                                    >
                                      <Plus className="w-2.5 h-2.5" />
                                    </button>
                                  </div>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </>
                  ) : (
                    <div className="text-center py-16">
                      <Wand2 className="w-16 h-16 text-slate-600 mx-auto mb-4" />
                      <p className="text-slate-300 mb-2">暂无智能匹配结果</p>
                      <p className="text-sm text-slate-500 max-w-md mx-auto">
                        请在角色页面点击"智能分配参考音"按钮，系统将根据角色特点推荐合适的参考音
                      </p>
                    </div>
                  )}
                </div>
              )}

              {/* Narration/Voiceover Content */}
              {(usageTab === 'narration' || usageTab === 'voiceover') && (
                <>
                  {/* Preset Audio Grid */}
                  <div className="flex-1 overflow-y-auto p-3">
                    {isLoadingPreset ? (
                      <div className="flex items-center justify-center py-12">
                        <Loader2 className="w-8 h-8 text-teal-500 animate-spin" />
                      </div>
                    ) : filteredPresetAudios.length === 0 ? (
                      <div className="text-center py-12 text-slate-500">
                        {searchQuery || activeFilterCount > 0
                          ? '未找到匹配的参考音'
                          : '暂无预置参考音'}
                      </div>
                    ) : (
                      <>
                        <p className="text-xs text-slate-500 mb-3">
                          共 {filteredPresetAudios.length} 个参考音
                        </p>
                        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                          {filteredPresetAudios.map((audio) => {
                            const fullPath = `preset:${audio.path}`;
                            const isSelected = selectedAudio === fullPath;
                            const isCurrent = currentAudioPath === fullPath;
                            const isPlaying = playingAudio === fullPath;
                            const displayTags = audio.tags.slice(0, 3);

                            return (
                              <div
                                key={audio.path}
                                onClick={() => handleItemClick(audio.path, true)}
                                onDoubleClick={() => handleItemDoubleClick(audio.path, true)}
                                className={`relative p-3 rounded-lg cursor-pointer transition-all group ${
                                  isSelected
                                    ? 'bg-teal-600/20 ring-2 ring-teal-500'
                                    : isCurrent
                                      ? 'bg-slate-700 ring-1 ring-slate-500'
                                      : 'bg-slate-700/50 hover:bg-slate-700'
                                }`}
                              >
                                {/* Top right: favorite button + current badge */}
                                <div className="absolute top-2 right-2 flex items-center gap-1">
                                  <button
                                    onClick={(e) => handleToggleFavorite(fullPath, e)}
                                    className={`p-0.5 rounded transition-colors ${
                                      isFavorite(fullPath)
                                        ? 'text-yellow-400'
                                        : 'text-slate-500 hover:text-yellow-400'
                                    }`}
                                    title={isFavorite(fullPath) ? '取消收藏' : '收藏'}
                                  >
                                    <Star className={`w-3.5 h-3.5 ${isFavorite(fullPath) ? 'fill-current' : ''}`} />
                                  </button>
                                  {isCurrent && !isSelected && (
                                    <span className="px-1.5 py-0.5 bg-slate-600 text-slate-300 text-xs rounded">
                                      当前
                                    </span>
                                  )}
                                </div>

                                {/* Name and gender/age */}
                                <div className="flex items-center gap-2 mb-2">
                                  <span className="font-medium text-slate-200 truncate">
                                    {audio.name}
                                  </span>
                                  <span className={`text-xs px-1.5 py-0.5 rounded ${
                                    audio.gender === '女' 
                                      ? 'bg-pink-500/20 text-pink-300'
                                      : 'bg-blue-500/20 text-blue-300'
                                  }`}>
                                    {audio.gender}
                                  </span>
                                </div>

                                {/* Age and speed */}
                                <div className="flex items-center gap-2 text-xs text-slate-400 mb-2">
                                  <span>{audio.age}</span>
                                  <span className="text-slate-600">|</span>
                                  <span>{audio.speed}</span>
                                </div>

                                {/* Tags */}
                                <div className="flex flex-wrap gap-1 mb-3">
                                  {displayTags.map((tag, i) => (
                                    <span
                                      key={i}
                                      className="px-1.5 py-0.5 bg-slate-600/50 rounded text-xs text-slate-400"
                                    >
                                      {tag}
                                    </span>
                                  ))}
                                  {audio.tags.length > 3 && (
                                    <span className="px-1.5 py-0.5 text-xs text-slate-500">
                                      +{audio.tags.length - 3}
                                    </span>
                                  )}
                                </div>

                                {/* Play button and Speed Control */}
                                <div className="flex items-center gap-2">
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handlePlayAudio(audio.path, true);
                                    }}
                                    className={`flex-1 py-1.5 rounded flex items-center justify-center gap-1.5 text-xs transition-colors ${
                                      isPlaying
                                        ? 'bg-teal-600 text-white'
                                        : 'bg-slate-600 text-slate-300 hover:bg-slate-500'
                                    }`}
                                  >
                                    {isPlaying ? (
                                      <>
                                        <Pause className="w-3.5 h-3.5" />
                                        暂停
                                      </>
                                    ) : (
                                      <>
                                        <Play className="w-3.5 h-3.5 ml-0.5" />
                                        试听
                                      </>
                                    )}
                                  </button>

                                  {/* Speed Control */}
                                  <div className="flex items-center gap-0.5" onClick={e => e.stopPropagation()}>
                                    <button
                                      onClick={() => handleSpeedChange(fullPath, -0.05)}
                                      disabled={getAudioSpeed(fullPath) <= 0.5}
                                      className="w-5 h-5 rounded flex items-center justify-center bg-slate-600 hover:bg-slate-500 disabled:opacity-30 text-slate-300 transition-colors"
                                    >
                                      <Minus className="w-2.5 h-2.5" />
                                    </button>
                                    <span className="text-xs font-medium text-teal-400 min-w-[36px] text-center">
                                      {getAudioSpeed(fullPath).toFixed(2)}x
                                    </span>
                                    <button
                                      onClick={() => handleSpeedChange(fullPath, 0.05)}
                                      disabled={getAudioSpeed(fullPath) >= 2.0}
                                      className="w-5 h-5 rounded flex items-center justify-center bg-slate-600 hover:bg-slate-500 disabled:opacity-30 text-slate-300 transition-colors"
                                    >
                                      <Plus className="w-2.5 h-2.5" />
                                    </button>
                                  </div>
                                </div>

                                {/* Tooltip on hover */}
                                <div className="absolute left-0 right-0 bottom-full mb-2 p-3 bg-slate-900 rounded-lg shadow-xl opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity z-10 hidden group-hover:block">
                                  <p className="text-xs text-slate-400 mb-1">典型角色</p>
                                  <p className="text-xs text-slate-300 mb-2">{audio.typicalRoles}</p>
                                  <p className="text-xs text-slate-400 mb-1">描述</p>
                                  <p className="text-xs text-slate-300 line-clamp-3">{audio.description}</p>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </>
                    )}
                  </div>
                </>
              )}
            </>
          )}

          {/* Custom Audio Content */}
          {mainTab === 'custom' && (
            <>
              {/* Search */}
              <div className="p-3 border-b border-slate-700">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="搜索音频文件..."
                    className="w-full pl-10 pr-3 py-2 bg-slate-700 rounded-lg text-sm text-slate-300 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-teal-500"
                  />
                </div>
              </div>

              {/* Custom Audio List */}
              <div className="flex-1 overflow-y-auto p-4">
                {isLoadingSettings || isLoadingCustom ? (
                  <div className="flex items-center justify-center py-12">
                    <Loader2 className="w-8 h-8 text-teal-500 animate-spin" />
                  </div>
                ) : !referenceDir ? (
                  <div className="text-center py-12">
                    <FolderOpen className="w-12 h-12 text-slate-600 mx-auto mb-4" />
                    <p className="text-slate-400 mb-2">未设置参考音频目录</p>
                    <p className="text-slate-500 text-sm">请在设置页面中配置参考音频目录</p>
                  </div>
                ) : filteredCustomAudios.length === 0 ? (
                  <div className="text-center py-12 text-slate-500">
                    {searchQuery ? '未找到匹配的音频' : '暂无音频文件'}
                  </div>
                ) : (
                  <div className="space-y-2">
                    <p className="text-xs text-slate-500 mb-2">
                      共 {filteredCustomAudios.length} 个音频文件
                    </p>
                    {filteredCustomAudios.map((audio) => {
                      const isSelected = selectedAudio === audio.path;
                      const isCurrent = currentAudioPath === audio.path;
                      const isPlaying = playingAudio === audio.path;

                      return (
                        <div
                          key={audio.path}
                          className={`flex items-center gap-3 p-3 rounded-lg transition-colors cursor-pointer ${
                            isSelected
                              ? 'bg-teal-600/20 ring-1 ring-teal-500'
                              : isCurrent
                                ? 'bg-slate-700 ring-1 ring-slate-500'
                                : 'bg-slate-700/50 hover:bg-slate-700'
                          }`}
                          onClick={() => handleItemClick(audio.path, false)}
                          onDoubleClick={() => handleItemDoubleClick(audio.path, false)}
                        >
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handlePlayAudio(audio.path, false);
                            }}
                            className="w-8 h-8 rounded-full bg-gradient-to-r from-teal-600 to-teal-500 hover:from-teal-500 hover:to-teal-400 flex items-center justify-center flex-shrink-0 transition-colors"
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

                          {/* Speed Control */}
                          <div className="flex items-center gap-0.5 flex-shrink-0" onClick={e => e.stopPropagation()}>
                            <button
                              onClick={() => handleSpeedChange(audio.path, -0.05)}
                              disabled={getAudioSpeed(audio.path) <= 0.5}
                              className="w-5 h-5 rounded flex items-center justify-center bg-slate-600 hover:bg-slate-500 disabled:opacity-30 text-slate-300 transition-colors"
                            >
                              <Minus className="w-2.5 h-2.5" />
                            </button>
                            <span className="text-xs font-medium text-teal-400 min-w-[36px] text-center">
                              {getAudioSpeed(audio.path).toFixed(2)}x
                            </span>
                            <button
                              onClick={() => handleSpeedChange(audio.path, 0.05)}
                              disabled={getAudioSpeed(audio.path) >= 2.0}
                              className="w-5 h-5 rounded flex items-center justify-center bg-slate-600 hover:bg-slate-500 disabled:opacity-30 text-slate-300 transition-colors"
                            >
                              <Plus className="w-2.5 h-2.5" />
                            </button>
                          </div>

                          {/* Favorite button + current badge */}
                          <button
                            onClick={(e) => handleToggleFavorite(audio.path, e)}
                            className={`p-1 rounded transition-colors flex-shrink-0 ${
                              isFavorite(audio.path)
                                ? 'text-yellow-400'
                                : 'text-slate-500 hover:text-yellow-400'
                            }`}
                            title={isFavorite(audio.path) ? '取消收藏' : '收藏'}
                          >
                            <Star className={`w-4 h-4 ${isFavorite(audio.path) ? 'fill-current' : ''}`} />
                          </button>

                          {isCurrent && !isSelected && (
                            <span className="px-1.5 py-0.5 bg-slate-600 text-slate-300 text-xs rounded flex-shrink-0">
                              当前
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </>
          )}

          {/* Footer */}
          <div className="flex items-center justify-between p-4 border-t border-slate-700">
            {/* Selected audio info */}
            <div className="text-xs text-slate-500">
              {selectedAudio && (
                <div className="flex items-center gap-2">
                  <Volume2 className="w-4 h-4" />
                  <span className="truncate max-w-[300px]">
                    已选: {selectedAudio.startsWith('preset:') 
                      ? presetAudios.find(a => `preset:${a.path}` === selectedAudio)?.name || selectedAudio.replace('preset:', '')
                      : customAudios.find(a => a.path === selectedAudio)?.name || selectedAudio.split('/').pop()}
                    {' '}({getAudioSpeed(selectedAudio).toFixed(2)}x)
                  </span>
                </div>
              )}
            </div>
            
            <div className="flex gap-2">
              <button
                onClick={handleClose}
                className="px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg text-sm text-slate-200 transition-colors"
              >
                取消
              </button>
              <button
                onClick={handleConfirm}
                disabled={!selectedAudio}
                className="px-4 py-2 bg-gradient-to-r from-teal-600 to-teal-500 hover:from-teal-500 hover:to-teal-400 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg text-sm text-white transition-colors"
              >
                确定选择
              </button>
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
