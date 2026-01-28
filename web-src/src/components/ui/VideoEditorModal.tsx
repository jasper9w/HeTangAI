/**
 * VideoEditorModal - Professional video editor with waveform and thumbnails
 */
import { useState, useEffect, useRef, useCallback } from 'react';
import { X, Play, Pause, RotateCcw } from 'lucide-react';

interface VideoEditorModalProps {
  isOpen: boolean;
  onClose: () => void;
  videoUrl: string;
  audioUrl?: string;
  initialVideoDuration?: number;
  initialAudioDuration?: number;
  initialVideoSpeed?: number;
  initialAudioSpeed?: number;
  initialAudioOffset?: number;
  initialAudioTrimStart?: number;
  initialAudioTrimEnd?: number;
  onSave: (settings: { 
    videoSpeed: number; 
    audioSpeed: number;
    audioOffset: number;
    audioTrimStart: number;
    audioTrimEnd: number;
    videoDuration: number;
    audioDuration: number;
  }) => void;
}

const TIMELINE_DURATION = 15; // Fixed 15 second timeline view

export function VideoEditorModal({
  isOpen,
  onClose,
  videoUrl,
  audioUrl,
  initialVideoDuration,
  initialAudioDuration,
  initialVideoSpeed,
  initialAudioSpeed,
  initialAudioOffset = 0,
  initialAudioTrimStart = 0,
  initialAudioTrimEnd,
  onSave,
}: VideoEditorModalProps) {
  // Media durations
  const [videoDuration, setVideoDuration] = useState(initialVideoDuration ?? 0);
  const [audioDuration, setAudioDuration] = useState(initialAudioDuration ?? 0);
  
  // Editor state - 使用 ?? 确保 0 不被视为 falsy
  const [videoSpeed, setVideoSpeed] = useState(initialVideoSpeed ?? 1);
  const [audioSpeed, setAudioSpeed] = useState(initialAudioSpeed ?? 1);
  const [audioOffset, setAudioOffset] = useState(initialAudioOffset ?? 0);
  const [audioTrimStart, setAudioTrimStart] = useState(initialAudioTrimStart ?? 0);
  const [audioTrimEnd, setAudioTrimEnd] = useState(
    (initialAudioTrimEnd !== undefined && initialAudioTrimEnd > 0) ? initialAudioTrimEnd : (initialAudioDuration ?? 0)
  );
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  
  // Visual data
  const [videoThumbnails, setVideoThumbnails] = useState<string[]>([]);
  const [waveformImage, setWaveformImage] = useState<string>('');
  
  // Dragging state
  const [isDraggingAudio, setIsDraggingAudio] = useState(false);
  const [isDraggingAudioEnd, setIsDraggingAudioEnd] = useState(false);
  const [isDraggingAudioTrimStart, setIsDraggingAudioTrimStart] = useState(false);
  const [isDraggingAudioTrimEnd, setIsDraggingAudioTrimEnd] = useState(false);
  const [isDraggingVideoEnd, setIsDraggingVideoEnd] = useState(false);
  const [isDraggingPlayhead, setIsDraggingPlayhead] = useState(false);
  const [dragStartX, setDragStartX] = useState(0);
  const [dragStartValue, setDragStartValue] = useState(0);
  const timelineRef = useRef<HTMLDivElement>(null);
  
  // Media refs
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);

  // Calculate default speed - 只有当没有保存的视频倍速时才自动计算
  const calculateDefaultSpeed = useCallback(() => {
    if (videoDuration > 0 && audioDuration > 0 && initialVideoSpeed === undefined) {
      const defaultSpeed = Math.min(Math.max(videoDuration / audioDuration, 0.5), 3.0);
      setVideoSpeed(defaultSpeed);
    }
  }, [videoDuration, audioDuration, initialVideoSpeed]);

  useEffect(() => {
    calculateDefaultSpeed();
  }, [calculateDefaultSpeed]);

  // Playback durations after speed adjustment
  const adjustedVideoDuration = videoDuration / videoSpeed;
  // Full audio display width (for waveform display)
  const displayAudioDuration = audioDuration / audioSpeed;
  // Trimmed audio duration (for effective playback region)
  const trimmedAudioDuration = Math.max(0, audioTrimEnd - audioTrimStart);
  const effectiveAudioDuration = trimmedAudioDuration / audioSpeed;
  
  // Calculate active region (the part that will be exported)
  // Active region starts at offset + trimStart (adjusted for speed)
  const activeRegionStart = audioOffset + (audioTrimStart / audioSpeed);
  const activeRegionEnd = audioOffset + (audioTrimEnd / audioSpeed);

  // Generate video thumbnails from the preview video element
  const generateThumbnails = useCallback(() => {
    const video = videoRef.current;
    if (!video || videoDuration <= 0) {
      console.log('Cannot generate thumbnails: video not ready');
      return;
    }
    
    console.log('Generating thumbnails, duration:', videoDuration);
    
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    canvas.width = 120;
    canvas.height = 68;
    
    const thumbnails: string[] = [];
    const numThumbnails = Math.min(20, Math.max(8, Math.ceil(videoDuration * 2)));
    let currentIndex = 0;
    const originalTime = video.currentTime;
    
    const captureNextFrame = () => {
      if (currentIndex >= numThumbnails) {
        video.currentTime = originalTime;
        console.log('Thumbnails generated:', thumbnails.length);
        setVideoThumbnails([...thumbnails]);
        return;
      }
      
      const time = (currentIndex / numThumbnails) * videoDuration;
      video.currentTime = time;
    };
    
    const handleSeeked = () => {
      if (ctx && currentIndex < numThumbnails) {
        try {
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          thumbnails.push(canvas.toDataURL('image/jpeg', 0.7));
        } catch (e) {
          console.warn('Failed to capture frame:', e);
          thumbnails.push('');
        }
        currentIndex++;
        captureNextFrame();
      }
    };
    
    video.addEventListener('seeked', handleSeeked);
    captureNextFrame();
    
    // Cleanup will be handled by component unmount
  }, [videoDuration]);

  // Reset thumbnails and waveform when URLs change
  useEffect(() => {
    setVideoThumbnails([]);
  }, [videoUrl]);

  useEffect(() => {
    setWaveformImage('');
  }, [audioUrl]);

  // Trigger thumbnail generation after video loads
  useEffect(() => {
    if (videoDuration > 0 && videoThumbnails.length === 0) {
      const timer = setTimeout(generateThumbnails, 500);
      return () => clearTimeout(timer);
    }
  }, [videoDuration, videoThumbnails.length, generateThumbnails]);

  // Generate waveform image using Canvas (Audition-style)
  useEffect(() => {
    if (!audioUrl) return;
    
    console.log('Generating waveform for:', audioUrl);
    
    const generateWaveform = async () => {
      try {
        const response = await fetch(audioUrl);
        if (!response.ok) {
          throw new Error(`Fetch failed: ${response.status}`);
        }
        const arrayBuffer = await response.arrayBuffer();
        console.log('Audio loaded, size:', arrayBuffer.byteLength);
        
        const audioContext = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
        const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
        console.log('Audio decoded, duration:', audioBuffer.duration);
        
        // Get audio channel data
        const channelData = audioBuffer.getChannelData(0);
        
        // Create canvas for waveform
        const canvas = document.createElement('canvas');
        const width = 1200;
        const height = 64;
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d')!;
        
        // Draw background (transparent)
        ctx.clearRect(0, 0, width, height);
        
        // Calculate samples per pixel
        const samplesPerPixel = Math.floor(channelData.length / width);
        const centerY = height / 2;
        const amplitude = centerY * 0.85;
        
        // Collect min/max values for each x position
        const mins: number[] = [];
        const maxs: number[] = [];
        
        for (let x = 0; x < width; x++) {
          const start = x * samplesPerPixel;
          let min = 0;
          let max = 0;
          
          for (let j = 0; j < samplesPerPixel; j++) {
            const sample = channelData[start + j] || 0;
            if (sample < min) min = sample;
            if (sample > max) max = sample;
          }
          
          mins.push(min);
          maxs.push(max);
        }
        
        // Draw filled waveform (Audition style green)
        ctx.fillStyle = '#00ff00';
        ctx.beginPath();
        
        // Draw top edge (max values)
        ctx.moveTo(0, centerY - maxs[0] * amplitude);
        for (let x = 1; x < width; x++) {
          ctx.lineTo(x, centerY - maxs[x] * amplitude);
        }
        
        // Draw bottom edge (min values) in reverse
        for (let x = width - 1; x >= 0; x--) {
          ctx.lineTo(x, centerY - mins[x] * amplitude);
        }
        
        ctx.closePath();
        ctx.fill();
        
        // Draw center line
        ctx.strokeStyle = 'rgba(0, 255, 0, 0.3)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(0, centerY);
        ctx.lineTo(width, centerY);
        ctx.stroke();
        
        const dataUrl = canvas.toDataURL();
        console.log('Waveform generated, length:', dataUrl.length);
        setWaveformImage(dataUrl);
        audioContext.close();
      } catch (err) {
        console.error('Failed to generate waveform:', err);
      }
    };
    
    generateWaveform();
  }, [audioUrl]);

  // Load durations
  const handleVideoLoad = useCallback(() => {
    if (videoRef.current) setVideoDuration(videoRef.current.duration);
  }, []);

  const handleAudioLoad = useCallback(() => {
    if (audioRef.current) {
      const duration = audioRef.current.duration;
      setAudioDuration(duration);
      // Initialize trim end to full duration if not set or invalid
      if (audioTrimEnd <= 0 || audioTrimEnd > duration) {
        setAudioTrimEnd(duration);
      }
    }
  }, [audioTrimEnd]);

  // Playback
  const togglePlay = useCallback(() => {
    if (!videoRef.current) return;
    if (isPlaying) {
      videoRef.current.pause();
      audioRef.current?.pause();
    } else {
      videoRef.current.currentTime = currentTime * videoSpeed;
      videoRef.current.playbackRate = videoSpeed;
      videoRef.current.play();
      // Only play audio if current time is within the active (trimmed) region
      if (audioRef.current && currentTime >= activeRegionStart && currentTime < activeRegionEnd) {
        // Calculate audio position: map timeline position to actual audio time
        const timeInActiveRegion = currentTime - activeRegionStart;
        const audioTime = audioTrimStart + timeInActiveRegion * audioSpeed;
        audioRef.current.currentTime = Math.min(audioTime, audioTrimEnd);
        audioRef.current.playbackRate = audioSpeed;
        audioRef.current.play();
      }
    }
    setIsPlaying(!isPlaying);
  }, [isPlaying, videoSpeed, audioSpeed, activeRegionStart, activeRegionEnd, audioTrimStart, audioTrimEnd, currentTime]);

  // Handle keyboard shortcuts (ESC to close, Space to play/pause)
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      } else if (event.key === ' ' || event.code === 'Space') {
        event.preventDefault();
        togglePlay();
      }
    };
    if (isOpen) {
      document.addEventListener('keydown', handleKeyDown);
      document.body.style.overflow = 'hidden';
    }
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = 'unset';
    };
  }, [isOpen, onClose, togglePlay]);

  // Sync playback
  useEffect(() => {
    if (!videoRef.current) return;
    const video = videoRef.current;
    const audio = audioRef.current;
    
    const handleTimeUpdate = () => {
      const videoTime = video.currentTime / videoSpeed;
      setCurrentTime(videoTime);
      if (audio && isPlaying) {
        // Calculate active region boundaries
        const regionStart = audioOffset + (audioTrimStart / audioSpeed);
        const regionEnd = audioOffset + (audioTrimEnd / audioSpeed);
        
        // Only play audio when timeline is within the active (trimmed) region
        if (videoTime >= regionStart && videoTime < regionEnd) {
          // Map timeline position to actual audio time
          const timeInActiveRegion = videoTime - regionStart;
          const audioTime = audioTrimStart + timeInActiveRegion * audioSpeed;
          
          if (audio.paused || Math.abs(audio.currentTime - audioTime) > 0.5) {
            audio.currentTime = Math.min(audioTime, audioTrimEnd);
            audio.playbackRate = audioSpeed;
            if (audio.paused) audio.play();
          }
          // Stop if audio reached trim end
          if (audio.currentTime >= audioTrimEnd) {
            audio.pause();
          }
        } else if (!audio.paused) {
          audio.pause();
        }
      }
    };
    
    const handleEnded = () => {
      setIsPlaying(false);
      audio?.pause();
    };
    
    video.addEventListener('timeupdate', handleTimeUpdate);
    video.addEventListener('ended', handleEnded);
    return () => {
      video.removeEventListener('timeupdate', handleTimeUpdate);
      video.removeEventListener('ended', handleEnded);
    };
  }, [videoSpeed, audioSpeed, audioOffset, audioTrimStart, audioTrimEnd, isPlaying]);

  // Timeline mousedown - 在时间轴任意位置按下即开始拖动播放头
  const handleTimelineMouseDown = useCallback((e: React.MouseEvent) => {
    if (!timelineRef.current) return;
    
    // 先设置播放头到点击位置
    const rect = timelineRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const ratio = x / rect.width;
    const newTime = ratio * TIMELINE_DURATION;
    const clampedTime = Math.max(0, Math.min(adjustedVideoDuration, newTime));
    setCurrentTime(clampedTime);
    
    if (videoRef.current) {
      videoRef.current.currentTime = clampedTime * videoSpeed;
    }
    
    // 然后开始拖动模式
    setDragStartX(e.clientX);
    setIsDraggingPlayhead(true);
    setDragStartValue(clampedTime);
  }, [videoSpeed, adjustedVideoDuration]);

  // Dragging handlers for audio, audio-end, video-end
  // Alt key switches audio edge from speed control to trim control
  const handleMouseDown = useCallback((e: React.MouseEvent, type: 'audio' | 'audio-start' | 'audio-end' | 'video-end') => {
    e.preventDefault();
    e.stopPropagation();
    setDragStartX(e.clientX);
    const isAltPressed = e.altKey;
    
    if (type === 'audio') {
      setIsDraggingAudio(true);
      setDragStartValue(audioOffset);
    } else if (type === 'audio-start') {
      // Left edge: only trim (with Alt)
      if (isAltPressed) {
        setIsDraggingAudioTrimStart(true);
        setDragStartValue(audioTrimStart);
      }
    } else if (type === 'audio-end') {
      // Right edge: speed by default, trim with Alt
      if (isAltPressed) {
        setIsDraggingAudioTrimEnd(true);
        setDragStartValue(audioTrimEnd);
      } else {
        setIsDraggingAudioEnd(true);
        setDragStartValue(audioSpeed);
      }
    } else if (type === 'video-end') {
      setIsDraggingVideoEnd(true);
      setDragStartValue(videoSpeed);
    }
  }, [audioOffset, audioSpeed, videoSpeed, audioTrimStart, audioTrimEnd]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!timelineRef.current) return;
    const rect = timelineRef.current.getBoundingClientRect();
    const deltaX = e.clientX - dragStartX;
    const deltaRatio = deltaX / rect.width;
    
    if (isDraggingAudio) {
      const deltaTime = deltaRatio * TIMELINE_DURATION;
      const newOffset = Math.max(0, dragStartValue + deltaTime);
      // 限制音频不能超过视频右边界
      const currentTrimmed = (audioTrimEnd - audioTrimStart) / audioSpeed;
      const maxOffset = Math.max(0, adjustedVideoDuration - currentTrimmed);
      setAudioOffset(Math.min(newOffset, maxOffset));
    } else if (isDraggingAudioEnd) {
      // 使用拖拽开始时的 speed 计算初始宽度，保证拖拽位置准确
      const currentTrimmed = audioTrimEnd - audioTrimStart;
      const initialAdjustedDuration = currentTrimmed / dragStartValue;
      const initialWidth = initialAdjustedDuration / TIMELINE_DURATION;
      const newWidth = initialWidth + deltaRatio;
      if (newWidth > 0.05) {
        const newSpeed = currentTrimmed / (newWidth * TIMELINE_DURATION);
        setAudioSpeed(Math.max(0.5, Math.min(2.0, newSpeed)));
      }
    } else if (isDraggingVideoEnd) {
      // 使用拖拽开始时的 speed 计算初始宽度，保证拖拽位置准确
      const initialAdjustedDuration = videoDuration / dragStartValue;
      const initialWidth = initialAdjustedDuration / TIMELINE_DURATION;
      const newWidth = initialWidth + deltaRatio;
      if (newWidth > 0.05) {
        const newSpeed = videoDuration / (newWidth * TIMELINE_DURATION);
        setVideoSpeed(Math.max(0.5, Math.min(3.0, newSpeed)));
      }
    } else if (isDraggingAudioTrimStart) {
      // Trim start marker - in original audio time
      const deltaSec = (deltaRatio * TIMELINE_DURATION) * audioSpeed; // Convert timeline delta to audio time
      const newTrimStart = Math.max(0, Math.min(audioTrimEnd - 0.1, dragStartValue + deltaSec));
      setAudioTrimStart(newTrimStart);
    } else if (isDraggingAudioTrimEnd) {
      // Trim end marker - in original audio time
      const deltaSec = (deltaRatio * TIMELINE_DURATION) * audioSpeed;
      const newTrimEnd = Math.max(audioTrimStart + 0.1, Math.min(audioDuration, dragStartValue + deltaSec));
      setAudioTrimEnd(newTrimEnd);
    } else if (isDraggingPlayhead) {
      const deltaTime = deltaRatio * TIMELINE_DURATION;
      const newTime = dragStartValue + deltaTime;
      const clampedTime = Math.max(0, Math.min(adjustedVideoDuration, newTime));
      setCurrentTime(clampedTime);
      if (videoRef.current) {
        videoRef.current.currentTime = clampedTime * videoSpeed;
      }
    }
  }, [isDraggingAudio, isDraggingAudioEnd, isDraggingVideoEnd, isDraggingAudioTrimStart, isDraggingAudioTrimEnd, isDraggingPlayhead, dragStartX, dragStartValue, audioDuration, videoDuration, adjustedVideoDuration, audioSpeed, videoSpeed, audioTrimStart, audioTrimEnd]);

  const handleMouseUp = useCallback(() => {
    setIsDraggingAudio(false);
    setIsDraggingAudioEnd(false);
    setIsDraggingAudioTrimStart(false);
    setIsDraggingAudioTrimEnd(false);
    setIsDraggingVideoEnd(false);
    setIsDraggingPlayhead(false);
  }, []);

  // Save & Reset
  const handleSave = useCallback(() => {
    onSave({ videoSpeed, audioSpeed, audioOffset, audioTrimStart, audioTrimEnd, videoDuration, audioDuration });
    onClose();
  }, [videoSpeed, audioSpeed, audioOffset, audioTrimStart, audioTrimEnd, videoDuration, audioDuration, onSave, onClose]);

  const handleReset = useCallback(() => {
    setAudioOffset(0);
    setAudioSpeed(1);
    setAudioTrimStart(0);
    setAudioTrimEnd(audioDuration);
    if (videoDuration > 0 && audioDuration > 0) {
      setVideoSpeed(Math.min(Math.max(videoDuration / audioDuration, 0.5), 3.0));
    } else {
      setVideoSpeed(1);
    }
  }, [videoDuration, audioDuration]);

  if (!isOpen) return null;

  const formatTime = (seconds: number) => {
    return `${seconds.toFixed(1)}s`;
  };

  // Calculate positions relative to timeline view (15s window)
  const timeToPercent = (time: number) => (time / TIMELINE_DURATION) * 100;
  const durationToPercent = (duration: number) => (duration / TIMELINE_DURATION) * 100;
  
  const videoStartPercent = timeToPercent(0);
  const videoWidthPercent = durationToPercent(adjustedVideoDuration);
  const audioStartPercent = timeToPercent(audioOffset);
  const audioWidthPercent = durationToPercent(displayAudioDuration);
  const playheadPercent = timeToPercent(currentTime);

  return (
    <div 
      className="fixed inset-0 z-50 bg-black/95 flex items-center justify-center p-4"
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
    >
      <div className="absolute inset-0" onClick={onClose} />

      <div className="relative bg-slate-900 rounded-xl overflow-hidden w-full max-w-6xl flex flex-col shadow-2xl border border-slate-700/50">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-slate-700/50">
          <h3 className="text-base font-medium text-slate-200">视频编辑</h3>
          <div className="flex items-center gap-2">
            <button onClick={handleReset} className="p-1.5 hover:bg-slate-700 rounded text-slate-400 hover:text-slate-200" title="重置">
              <RotateCcw className="w-4 h-4" />
            </button>
            <button onClick={onClose} className="p-1.5 hover:bg-slate-700 rounded text-slate-400 hover:text-slate-200">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Video Preview */}
        <div className="flex items-center justify-center py-4 bg-black/50">
          <div className="relative rounded-lg overflow-hidden bg-black">
            <video
              ref={videoRef}
              src={videoUrl}
              crossOrigin="anonymous"
              className="max-w-full max-h-[40vh] object-contain"
              onLoadedMetadata={handleVideoLoad}
              muted
            />
            <button onClick={togglePlay} className="absolute inset-0 flex items-center justify-center bg-black/20 hover:bg-black/30">
              <div className="w-12 h-12 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center">
                {isPlaying ? <Pause className="w-6 h-6 text-white" /> : <Play className="w-6 h-6 text-white ml-0.5" />}
              </div>
            </button>
          </div>
          {audioUrl && <audio ref={audioRef} src={audioUrl} onLoadedMetadata={handleAudioLoad} preload="metadata" />}
        </div>

        {/* Timeline Area */}
        <div className="flex-1 bg-slate-800/30 p-4">
          {/* Timeline Tracks */}
          <div 
            ref={timelineRef}
            className="relative bg-slate-900 rounded-lg overflow-hidden cursor-crosshair"
            style={{ height: '180px' }}
            onMouseDown={handleTimelineMouseDown}
          >
            {/* Time Ruler - 每0.5秒一个刻度，每2秒显示标签 */}
            <div className="absolute inset-x-0 top-0 h-5 border-b border-slate-700/50">
              {Array.from({ length: 31 }, (_, i) => i * 0.5).map((second) => {
                const ratio = second / 15;
                const isWholeSecond = second % 1 === 0;
                const showLabel = second % 2 === 0;
                return (
                  <div key={second} className="absolute flex flex-col items-end" style={{ left: `${ratio * 100}%`, transform: 'translateX(-50%)' }}>
                    {showLabel ? (
                      <span className="text-[9px] text-slate-500">{formatTime(second)}</span>
                    ) : (
                      <div className={`w-px ${isWholeSecond ? 'h-2.5 bg-slate-500' : 'h-1.5 bg-slate-600'} mt-2`} />
                    )}
                  </div>
                );
              })}
            </div>

            {/* Inactive Region Overlay - darken areas OUTSIDE the exportable audio region */}
            {audioDuration > 0 && (
              <div className="absolute top-5 bottom-0 left-0 right-0 pointer-events-none z-10">
                {/* Left inactive: from timeline start (0) to audio start */}
                <div
                  className="absolute top-0 bottom-0 bg-black/60"
                  style={{
                    left: 0,
                    width: `${Math.max(0, timeToPercent(activeRegionStart))}%`,
                  }}
                />
                {/* Right inactive: from audio end to timeline end */}
                <div
                  className="absolute top-0 bottom-0 bg-black/60"
                  style={{
                    left: `${timeToPercent(activeRegionEnd)}%`,
                    right: 0,
                  }}
                />
              </div>
            )}

            {/* Video Track with Thumbnails */}
            <div className="absolute left-0 right-0 h-16" style={{ top: '28px' }}>
              <div className="relative h-full">
                <div className="absolute inset-0 bg-slate-800/30 rounded overflow-hidden">
                  {/* Video bar with thumbnails */}
                  <div
                    className={`absolute top-0 bottom-0 rounded overflow-hidden transition-all ${isDraggingVideoEnd ? 'ring-2 ring-violet-400' : ''}`}
                    style={{ left: `${Math.max(0, videoStartPercent)}%`, width: `${videoWidthPercent}%` }}
                  >
                    {/* Thumbnail strip */}
                    <div className="absolute inset-0 flex">
                      {videoThumbnails.map((thumb, i) => (
                        <div
                          key={i}
                          className="h-full flex-shrink-0 border-r border-slate-900/50"
                          style={{ width: `${100 / videoThumbnails.length}%` }}
                        >
                          {thumb && <img src={thumb} alt="" className="w-full h-full object-cover" />}
                        </div>
                      ))}
                    </div>
                    {/* Drag handle */}
                    <div
                      className="absolute right-0 top-0 bottom-0 w-4 cursor-ew-resize bg-violet-500/20 hover:bg-violet-500/40 flex items-center justify-center"
                      onMouseDown={(e) => handleMouseDown(e, 'video-end')}
                    >
                      <div className="w-1 h-10 bg-violet-400 rounded-full" />
                    </div>
                    {/* Label */}
                    <div className="absolute left-1 top-1 text-[10px] text-white/80 bg-black/40 px-1 rounded">
                      {formatTime(adjustedVideoDuration)}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Audio Track with Waveform */}
            <div className="absolute left-0 right-0 h-16" style={{ top: '100px' }}>
              <div className="relative h-full">
                <div className="absolute inset-0 bg-slate-800/30 rounded overflow-hidden">
                  {audioDuration > 0 ? (
                    <div
                      className={`absolute top-0 bottom-0 rounded overflow-hidden transition-all ${isDraggingAudio || isDraggingAudioEnd || isDraggingAudioTrimStart || isDraggingAudioTrimEnd ? 'ring-2 ring-lime-400' : ''}`}
                      style={{ left: `${Math.max(0, audioStartPercent)}%`, width: `${audioWidthPercent}%` }}
                    >
                      {/* Main draggable area for position */}
                      <div 
                        className="absolute inset-0 cursor-move"
                        style={{ right: '16px', left: '16px' }}
                        onMouseDown={(e) => handleMouseDown(e, 'audio')}
                      />
                      {/* Waveform background */}
                      <div className="absolute inset-0 bg-gradient-to-r from-lime-600/20 via-lime-500/30 to-lime-600/20 pointer-events-none" />
                      {/* Waveform image */}
                      {waveformImage ? (
                        <img 
                          src={waveformImage} 
                          alt="waveform"
                          className="absolute inset-0 w-full h-full object-fill pointer-events-none"
                        />
                      ) : (
                        <div className="absolute inset-0 flex items-center justify-center text-lime-300/50 text-xs pointer-events-none">
                          加载波形...
                        </div>
                      )}
                      
                      {/* Trim overlay - darken trimmed areas */}
                      {audioTrimStart > 0 && (
                        <div 
                          className="absolute top-0 bottom-0 left-0 bg-black/50 pointer-events-none"
                          style={{ width: `${(audioTrimStart / audioDuration) * 100}%` }}
                        />
                      )}
                      {audioTrimEnd < audioDuration && (
                        <div 
                          className="absolute top-0 bottom-0 bg-black/50 pointer-events-none"
                          style={{ left: `${(audioTrimEnd / audioDuration) * 100}%`, right: 0 }}
                        />
                      )}
                      
                      {/* Left edge handle (Alt+drag for trim start) */}
                      <div
                        className={`absolute left-0 top-0 bottom-0 w-4 cursor-ew-resize flex items-center justify-center ${isDraggingAudioTrimStart ? 'bg-yellow-500/40' : 'bg-lime-500/20 hover:bg-lime-500/40'}`}
                        onMouseDown={(e) => handleMouseDown(e, 'audio-start')}
                        title="Alt+拖拽裁剪起点"
                      >
                        <div className={`w-1 h-10 rounded-full ${isDraggingAudioTrimStart ? 'bg-yellow-400' : 'bg-lime-400'}`} />
                      </div>
                      
                      {/* Right edge handle (drag for speed, Alt+drag for trim end) */}
                      <div
                        className={`absolute right-0 top-0 bottom-0 w-4 cursor-ew-resize flex items-center justify-center ${isDraggingAudioTrimEnd ? 'bg-yellow-500/40' : 'bg-lime-500/20 hover:bg-lime-500/40'}`}
                        onMouseDown={(e) => handleMouseDown(e, 'audio-end')}
                        title="拖拽调速 / Alt+拖拽裁剪终点"
                      >
                        <div className={`w-1 h-10 rounded-full ${isDraggingAudioTrimEnd ? 'bg-yellow-400' : 'bg-lime-400'}`} />
                      </div>
                      {/* Label */}
                      <div className="absolute left-1 top-1 text-[10px] text-white/80 bg-black/40 px-1 rounded pointer-events-none">
                        {formatTime(effectiveAudioDuration)}
                      </div>
                    </div>
                  ) : (
                    <div className="absolute inset-0 flex items-center justify-center text-slate-500 text-xs">无音频</div>
                  )}
                </div>
              </div>
            </div>

            {/* Playhead - 放在最上层，只负责显示，拖动由时间轴区域处理 */}
            {playheadPercent >= 0 && playheadPercent <= 100 && (
              <div 
                className="absolute top-0 bottom-0 pointer-events-none z-50"
                style={{ left: `${playheadPercent}%`, transform: 'translateX(-50%)' }}
              >
                <div className={`absolute left-1/2 -translate-x-1/2 top-0 bottom-0 w-0.5 ${isDraggingPlayhead ? 'bg-red-400' : 'bg-red-500'}`} />
                <div className={`absolute left-1/2 -translate-x-1/2 -top-0.5 w-3 h-3 ${isDraggingPlayhead ? 'bg-red-400' : 'bg-red-500'} rounded-sm rotate-45`} />
              </div>
            )}
          </div>

          {/* Status & Tips */}
          <div className="mt-3 flex items-center justify-between">
            <div className="flex items-center gap-4 text-xs">
              <span className="text-slate-400">视频 <span className="text-violet-400 font-medium">{videoSpeed.toFixed(2)}x</span></span>
              <span className="text-slate-400">音频 <span className="text-lime-400 font-medium">{audioSpeed.toFixed(2)}x</span></span>
              <span className="text-slate-400">裁剪 <span className="text-yellow-400 font-medium">{audioTrimStart.toFixed(1)}-{audioTrimEnd.toFixed(1)}s</span></span>
            </div>
            <div className="flex items-center gap-3 text-[10px] text-slate-500">
              <span>边缘调速</span>
              <span><kbd className="px-1 py-0.5 bg-slate-700 rounded text-slate-400">Alt</kbd>+边缘裁剪</span>
              <span><kbd className="px-1 py-0.5 bg-slate-700 rounded text-slate-400">Space</kbd> 播放</span>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-slate-700/50 flex items-center justify-end gap-3">
          <button onClick={onClose} className="px-4 py-1.5 text-sm text-slate-400 hover:text-slate-200 hover:bg-slate-700 rounded">取消</button>
          <button onClick={handleSave} className="px-4 py-1.5 text-sm bg-violet-600 hover:bg-violet-500 text-white rounded">保存</button>
        </div>
      </div>
    </div>
  );
}
