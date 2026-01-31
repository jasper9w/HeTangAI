/**
 * DubbingViewPage - Professional dubbing view for screenshots
 * This is a read-only showcase page designed to look professional for marketing materials
 */
import {
  Play,
  Pause,
  Square,
  SkipBack,
  SkipForward,
  Volume2,
  Repeat,
  AudioWaveform,
  List,
  Clock,
  Download,
  Settings2,
  Mic,
  Zap,
  ChevronDown,
  ChevronRight,
  User,
  Music,
  Gauge,
  Heart,
  Layers,
} from 'lucide-react';
import { useState, useMemo } from 'react';
import type { Shot, Character } from '../types';

interface DubbingViewPageProps {
  shots: Shot[];
  characters: Character[];
}

// Fake waveform component for decoration
function FakeWaveform({ isPlaying, color = 'teal' }: { isPlaying?: boolean; color?: string }) {
  const bars = useMemo(() => {
    return Array.from({ length: 40 }, () => Math.random() * 100);
  }, []);

  return (
    <div className="flex items-center gap-[2px] h-8">
      {bars.map((height, i) => (
        <div
          key={i}
          className={`w-[3px] rounded-full transition-all duration-150 ${
            color === 'teal' ? 'bg-teal-500/60' : 'bg-cyan-500/60'
          } ${isPlaying ? 'animate-pulse' : ''}`}
          style={{ height: `${Math.max(15, height * 0.8)}%` }}
        />
      ))}
    </div>
  );
}

// Time display component
function TimeDisplay({ current, total }: { current: string; total: string }) {
  return (
    <div className="flex items-center gap-2 font-mono text-sm">
      <span className="text-teal-400">{current}</span>
      <span className="text-slate-500">/</span>
      <span className="text-slate-400">{total}</span>
    </div>
  );
}

// VU Meter decoration
function VUMeter() {
  return (
    <div className="flex gap-1 items-end h-6">
      {[60, 80, 70, 90, 75, 85, 65, 95, 70, 80].map((h, i) => (
        <div
          key={i}
          className={`w-1 rounded-t transition-all ${
            h > 85 ? 'bg-red-500' : h > 70 ? 'bg-yellow-500' : 'bg-emerald-500'
          }`}
          style={{ height: `${h}%` }}
        />
      ))}
    </div>
  );
}

export function DubbingViewPage({ shots, characters }: DubbingViewPageProps) {
  const [selectedShotId, setSelectedShotId] = useState<string | null>(
    shots.length > 0 ? shots[0].id : null
  );
  const [isPlaying, setIsPlaying] = useState(false);
  const [viewMode, setViewMode] = useState<'waveform' | 'list'>('waveform');
  const [advancedOpen, setAdvancedOpen] = useState(false);

  // Filter shots with script content
  const shotsWithScript = shots.filter((s) => s.script?.trim());

  // Get selected shot
  const selectedShot = shotsWithScript.find((s) => s.id === selectedShotId);

  // Find character for selected shot
  const selectedCharacter = useMemo(() => {
    if (!selectedShot) return null;
    const characterName = selectedShot.voiceActor || selectedShot.characters?.[0];
    return characters.find((c) => c.name === characterName) || null;
  }, [selectedShot, characters]);

  // Calculate total duration (fake if no real data)
  const totalDuration = useMemo(() => {
    const total = shotsWithScript.reduce((acc, s) => acc + (s.audioDuration || 3.5), 0);
    const minutes = Math.floor(total / 60);
    const seconds = Math.floor(total % 60);
    return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  }, [shotsWithScript]);

  // Format duration
  const formatDuration = (seconds?: number) => {
    const s = seconds || 3.5;
    const mins = Math.floor(s / 60);
    const secs = Math.floor(s % 60);
    const ms = Math.floor((s % 1) * 100);
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}.${ms.toString().padStart(2, '0')}`;
  };

  // Get emotion color
  const getEmotionColor = (emotion: string) => {
    const colors: Record<string, string> = {
      '开心': 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
      '悲伤': 'bg-blue-500/20 text-blue-400 border-blue-500/30',
      '愤怒': 'bg-red-500/20 text-red-400 border-red-500/30',
      '惊讶': 'bg-purple-500/20 text-purple-400 border-purple-500/30',
      '恐惧': 'bg-orange-500/20 text-orange-400 border-orange-500/30',
      '厌恶': 'bg-rose-500/20 text-rose-400 border-rose-500/30',
      '平静': 'bg-slate-500/20 text-slate-400 border-slate-500/30',
    };
    return colors[emotion] || colors['平静'];
  };

  return (
    <div className="h-full flex flex-col bg-slate-900">
      {/* Professional Toolbar */}
      <div className="flex-shrink-0 bg-slate-800 border-b border-slate-700 px-4 py-3">
        <div className="flex items-center justify-between">
          {/* Left: Title + Playback Controls */}
          <div className="flex items-center gap-4">
            {/* Page Title */}
            <h2 className="text-lg font-semibold text-slate-100">配音</h2>
            
            {/* Divider */}
            <div className="w-px h-6 bg-slate-600" />
            
            {/* Transport Controls */}
            <div className="flex items-center bg-slate-700/50 rounded-lg p-1 gap-1">
              <button className="p-2 hover:bg-slate-600 rounded text-slate-400 hover:text-slate-200 transition-colors">
                <SkipBack className="w-4 h-4" />
              </button>
              <button
                onClick={() => setIsPlaying(!isPlaying)}
                className={`p-2 rounded transition-colors ${
                  isPlaying
                    ? 'bg-teal-500 text-white hover:bg-teal-400'
                    : 'bg-slate-600 text-slate-200 hover:bg-slate-500'
                }`}
              >
                {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
              </button>
              <button className="p-2 hover:bg-slate-600 rounded text-slate-400 hover:text-slate-200 transition-colors">
                <Square className="w-4 h-4" />
              </button>
              <button className="p-2 hover:bg-slate-600 rounded text-slate-400 hover:text-slate-200 transition-colors">
                <SkipForward className="w-4 h-4" />
              </button>
            </div>

            {/* Loop Toggle */}
            <button className="p-2 hover:bg-slate-700 rounded text-slate-500 hover:text-teal-400 transition-colors">
              <Repeat className="w-4 h-4" />
            </button>

            {/* Divider */}
            <div className="w-px h-6 bg-slate-600 mx-2" />

            {/* Time Display */}
            <TimeDisplay current="00:12" total={totalDuration} />

            {/* Divider */}
            <div className="w-px h-6 bg-slate-600 mx-2" />

            {/* VU Meter */}
            <VUMeter />
          </div>

          {/* Center: View Mode Toggle */}
          <div className="flex items-center gap-2">
            <div className="flex items-center bg-slate-700/50 rounded-lg p-1">
              <button
                onClick={() => setViewMode('waveform')}
                className={`px-3 py-1.5 rounded text-sm font-medium transition-colors flex items-center gap-1.5 ${
                  viewMode === 'waveform'
                    ? 'bg-teal-500/20 text-teal-400'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <AudioWaveform className="w-4 h-4" />
                波形
              </button>
              <button
                onClick={() => setViewMode('list')}
                className={`px-3 py-1.5 rounded text-sm font-medium transition-colors flex items-center gap-1.5 ${
                  viewMode === 'list'
                    ? 'bg-teal-500/20 text-teal-400'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <List className="w-4 h-4" />
                列表
              </button>
            </div>

            {/* Track Count Badge */}
            <div className="flex items-center gap-1.5 px-2.5 py-1 bg-slate-700/50 rounded-lg">
              <Layers className="w-4 h-4 text-cyan-400" />
              <span className="text-sm text-slate-300">{shotsWithScript.length} 轨道</span>
            </div>
          </div>

          {/* Right: Actions */}
          <div className="flex items-center gap-2">
            {/* Volume */}
            <div className="flex items-center gap-2 px-3 py-1.5 bg-slate-700/50 rounded-lg">
              <Volume2 className="w-4 h-4 text-slate-400" />
              <div className="w-20 h-1.5 bg-slate-600 rounded-full overflow-hidden">
                <div className="w-3/4 h-full bg-teal-500 rounded-full" />
              </div>
            </div>

            {/* AI Badge */}
            <div className="flex items-center gap-1.5 px-2.5 py-1.5 bg-gradient-to-r from-purple-500/20 to-cyan-500/20 rounded-lg border border-purple-500/30">
              <Zap className="w-4 h-4 text-purple-400" />
              <span className="text-xs font-medium text-purple-300">AI 增强</span>
            </div>

            {/* Export */}
            <button className="flex items-center gap-1.5 px-3 py-1.5 bg-teal-600 hover:bg-teal-500 rounded-lg text-sm font-medium text-white transition-colors">
              <Download className="w-4 h-4" />
              导出
            </button>

            {/* Settings */}
            <button className="p-2 hover:bg-slate-700 rounded text-slate-400 hover:text-slate-200 transition-colors">
              <Settings2 className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Progress Bar */}
        <div className="mt-3 relative">
          <div className="h-2 bg-slate-700 rounded-full overflow-hidden">
            <div className="h-full bg-gradient-to-r from-teal-500 to-cyan-500 rounded-full w-1/4 transition-all" />
          </div>
          {/* Markers */}
          <div className="absolute top-0 left-1/4 w-0.5 h-2 bg-yellow-500 rounded" />
          <div className="absolute top-0 left-1/2 w-0.5 h-2 bg-yellow-500 rounded" />
          <div className="absolute top-0 left-3/4 w-0.5 h-2 bg-yellow-500 rounded" />
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left: Dubbing Content List */}
        <div className="flex-1 overflow-y-auto p-4">
          <div className="space-y-2">
            {shotsWithScript.map((shot, index) => {
              const isSelected = shot.id === selectedShotId;
              const characterName = shot.voiceActor || shot.characters?.[0] || '旁白';

              return (
                <div
                  key={shot.id}
                  onClick={() => setSelectedShotId(shot.id)}
                  className={`group relative rounded-xl p-4 cursor-pointer transition-all ${
                    isSelected
                      ? 'bg-slate-800 ring-2 ring-teal-500/50 shadow-lg shadow-teal-500/10'
                      : 'bg-slate-800/50 hover:bg-slate-800/80'
                  }`}
                >
                  {/* Track Number Indicator */}
                  <div
                    className={`absolute left-0 top-0 bottom-0 w-1 rounded-l-xl transition-colors ${
                      isSelected ? 'bg-teal-500' : 'bg-slate-600 group-hover:bg-slate-500'
                    }`}
                  />

                  <div className="flex items-start gap-4 pl-2">
                    {/* Sequence Number */}
                    <div
                      className={`flex-shrink-0 w-10 h-10 rounded-lg flex items-center justify-center font-mono text-sm font-bold ${
                        isSelected
                          ? 'bg-teal-500/20 text-teal-400'
                          : 'bg-slate-700 text-slate-400'
                      }`}
                    >
                      {String(shot.sequence).padStart(2, '0')}
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      {/* Header Row */}
                      <div className="flex items-center gap-2 mb-2">
                        {/* Character Name */}
                        <span className="text-sm font-medium text-slate-200">{characterName}</span>

                        {/* Emotion Badge */}
                        {shot.emotion && (
                          <span
                            className={`text-xs px-2 py-0.5 rounded-full border ${getEmotionColor(shot.emotion)}`}
                          >
                            {shot.emotion}
                            {shot.intensity && (
                              <span className="ml-1 opacity-70">{shot.intensity}</span>
                            )}
                          </span>
                        )}

                        {/* Speed Badge */}
                        {shot.audioSpeed && shot.audioSpeed !== 1 && (
                          <span className="text-xs px-2 py-0.5 rounded-full bg-cyan-500/20 text-cyan-400 border border-cyan-500/30">
                            <Gauge className="w-3 h-3 inline mr-1" />
                            {shot.audioSpeed}x
                          </span>
                        )}

                        {/* AI Analyzed Badge (decorative) */}
                        {index % 3 === 0 && (
                          <span className="text-xs px-2 py-0.5 rounded-full bg-purple-500/20 text-purple-400 border border-purple-500/30">
                            <Zap className="w-3 h-3 inline mr-1" />
                            AI
                          </span>
                        )}
                      </div>

                      {/* Script Text */}
                      <p className="text-sm text-slate-400 mb-3 line-clamp-2">{shot.script}</p>

                      {/* Waveform & Duration */}
                      <div className="flex items-center gap-4">
                        <div className="flex-1">
                          <FakeWaveform
                            isPlaying={isSelected && isPlaying}
                            color={isSelected ? 'teal' : 'cyan'}
                          />
                        </div>

                        {/* Duration */}
                        <div className="flex items-center gap-1.5 text-xs text-slate-500">
                          <Clock className="w-3.5 h-3.5" />
                          <span className="font-mono">{formatDuration(shot.audioDuration)}</span>
                        </div>

                        {/* Play Button */}
                        <button
                          className={`p-2 rounded-full transition-colors ${
                            isSelected
                              ? 'bg-teal-500 text-white hover:bg-teal-400'
                              : 'bg-slate-700 text-slate-400 hover:bg-slate-600 hover:text-slate-200'
                          }`}
                        >
                          <Play className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}

            {/* Empty State */}
            {shotsWithScript.length === 0 && (
              <div className="flex flex-col items-center justify-center py-20 text-center">
                <Mic className="w-16 h-16 text-slate-600 mb-4" />
                <h3 className="text-lg font-medium text-slate-300 mb-2">暂无配音内容</h3>
                <p className="text-sm text-slate-500">导入镜头脚本后即可开始配音</p>
              </div>
            )}
          </div>
        </div>

        {/* Right: Character Settings Panel */}
        <div className="w-72 flex-shrink-0 bg-slate-800/50 border-l border-slate-700 overflow-y-auto">
          <div className="p-4">
            {/* Header */}
            <h3 className="text-sm font-semibold text-slate-300 mb-4 flex items-center gap-2">
              <User className="w-4 h-4 text-teal-500" />
              角色配音设置
            </h3>

            {selectedCharacter ? (
              <div className="space-y-4">
                {/* Character Avatar */}
                <div className="flex flex-col items-center">
                  {selectedCharacter.imageUrl ? (
                    <img
                      src={selectedCharacter.imageUrl}
                      alt={selectedCharacter.name}
                      className="w-24 h-24 rounded-xl object-cover ring-2 ring-slate-600"
                    />
                  ) : (
                    <div className="w-24 h-24 rounded-xl bg-slate-700 flex items-center justify-center">
                      <User className="w-10 h-10 text-slate-500" />
                    </div>
                  )}
                  <h4 className="mt-3 text-lg font-medium text-slate-200">
                    {selectedCharacter.name}
                  </h4>
                  {selectedCharacter.isNarrator && (
                    <span className="mt-1 text-xs px-2 py-0.5 rounded-full bg-cyan-500/20 text-cyan-400 border border-cyan-500/30">
                      旁白角色
                    </span>
                  )}
                </div>

                {/* Reference Audio */}
                <div className="bg-slate-700/50 rounded-lg p-3">
                  <div className="flex items-center gap-2 text-xs text-slate-500 mb-2">
                    <Music className="w-3.5 h-3.5" />
                    <span>参考音频</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="flex-1 truncate text-sm text-slate-300">
                      {selectedCharacter.referenceAudioName || '未设置'}
                    </div>
                    <button className="p-1.5 hover:bg-slate-600 rounded text-slate-400 hover:text-slate-200 transition-colors">
                      <Play className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {/* Speed Setting */}
                <div className="bg-slate-700/50 rounded-lg p-3">
                  <div className="flex items-center gap-2 text-xs text-slate-500 mb-2">
                    <Gauge className="w-3.5 h-3.5" />
                    <span>默认倍速</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="flex-1 h-1.5 bg-slate-600 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-teal-500 rounded-full"
                        style={{ width: `${((selectedCharacter.speed || 1) / 2) * 100}%` }}
                      />
                    </div>
                    <span className="text-sm font-mono text-teal-400">
                      {selectedCharacter.speed || 1}x
                    </span>
                  </div>
                </div>

                {/* Current Shot Info */}
                {selectedShot && (
                  <div className="bg-slate-700/50 rounded-lg p-3">
                    <div className="flex items-center gap-2 text-xs text-slate-500 mb-2">
                      <Heart className="w-3.5 h-3.5" />
                      <span>当前镜头情感</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span
                        className={`text-sm px-2 py-0.5 rounded-full border ${getEmotionColor(selectedShot.emotion || '平静')}`}
                      >
                        {selectedShot.emotion || '平静'}
                      </span>
                      {selectedShot.intensity && (
                        <span className="text-xs text-slate-400">
                          强度 {selectedShot.intensity}
                        </span>
                      )}
                    </div>
                  </div>
                )}

                {/* Advanced Settings (Decorative) */}
                <div className="border border-slate-600 rounded-lg overflow-hidden">
                  <button
                    onClick={() => setAdvancedOpen(!advancedOpen)}
                    className="w-full flex items-center justify-between p-3 text-sm text-slate-400 hover:text-slate-300 hover:bg-slate-700/30 transition-colors"
                  >
                    <span className="flex items-center gap-2">
                      <Settings2 className="w-4 h-4" />
                      高级设置
                    </span>
                    {advancedOpen ? (
                      <ChevronDown className="w-4 h-4" />
                    ) : (
                      <ChevronRight className="w-4 h-4" />
                    )}
                  </button>
                  {advancedOpen && (
                    <div className="p-3 border-t border-slate-600 space-y-3">
                      {/* AI Emotion Prediction */}
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-slate-400">AI 情感预测</span>
                        <div className="w-8 h-4 bg-teal-500 rounded-full relative">
                          <div className="absolute right-0.5 top-0.5 w-3 h-3 bg-white rounded-full" />
                        </div>
                      </div>
                      {/* Auto Segmentation */}
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-slate-400">智能断句</span>
                        <div className="w-8 h-4 bg-teal-500 rounded-full relative">
                          <div className="absolute right-0.5 top-0.5 w-3 h-3 bg-white rounded-full" />
                        </div>
                      </div>
                      {/* Noise Reduction */}
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-slate-400">降噪处理</span>
                        <div className="w-8 h-4 bg-slate-600 rounded-full relative">
                          <div className="absolute left-0.5 top-0.5 w-3 h-3 bg-slate-400 rounded-full" />
                        </div>
                      </div>
                      {/* Pitch Correction */}
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-slate-400">音高校正</span>
                        <div className="w-8 h-4 bg-slate-600 rounded-full relative">
                          <div className="absolute left-0.5 top-0.5 w-3 h-3 bg-slate-400 rounded-full" />
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <User className="w-12 h-12 text-slate-600 mb-3" />
                <p className="text-sm text-slate-500">选择一个镜头查看角色设置</p>
              </div>
            )}

            {/* Queue Status (Decorative) */}
            <div className="mt-6 bg-slate-700/30 rounded-lg p-3">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-slate-500">批量处理队列</span>
                <span className="text-xs text-teal-400">
                  {Math.floor(shotsWithScript.length * 0.7)}/{shotsWithScript.length}
                </span>
              </div>
              <div className="h-1.5 bg-slate-600 rounded-full overflow-hidden">
                <div className="h-full bg-gradient-to-r from-teal-500 to-cyan-500 rounded-full w-[70%]" />
              </div>
              <p className="mt-2 text-xs text-slate-500">预计剩余时间: 2分30秒</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
