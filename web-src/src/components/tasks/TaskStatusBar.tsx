/**
 * Task status bar component - displays progress summary in the status bar
 */

import React from 'react';
import { ListTodo, Loader2 } from 'lucide-react';
import type { TaskSummary } from '../../types';

interface TaskStatusBarProps {
  summary: TaskSummary;
  onClick: () => void;
}

export const TaskStatusBar: React.FC<TaskStatusBarProps> = ({ summary, onClick }) => {
  const { image, video, audio, total } = summary;

  // Calculate running and pending counts
  const imageRunning = image.running;
  const imagePending = image.pending + image.paused;
  const videoRunning = video.running;
  const videoPending = video.pending + video.paused;
  const audioRunning = audio.running;
  const audioPending = audio.pending + audio.paused;
  const totalRunning = total.running;
  const totalPending = total.pending + total.paused;

  // Check if there are any active tasks
  const hasActiveTasks = totalRunning > 0 || totalPending > 0;

  return (
    <button
      onClick={onClick}
      className="flex items-center gap-2 px-2 hover:bg-slate-700 rounded transition-colors text-xs"
      title="点击查看任务队列"
    >
      {totalRunning > 0 ? (
        <Loader2 className="w-3 h-3 animate-spin text-teal-400" />
      ) : (
        <ListTodo className="w-3 h-3 text-slate-400" />
      )}
      
      {hasActiveTasks ? (
        <div className="flex items-center gap-2 text-slate-400">
          {(imageRunning > 0 || imagePending > 0) && (
            <span className="flex items-center gap-1">
              <span className="text-slate-500">图:</span>
              <span className={imageRunning > 0 ? 'text-teal-400' : ''}>
                {imageRunning}/{imagePending + imageRunning}
              </span>
            </span>
          )}
          
          {(videoRunning > 0 || videoPending > 0) && (
            <span className="flex items-center gap-1">
              <span className="text-slate-500">视:</span>
              <span className={videoRunning > 0 ? 'text-emerald-400' : ''}>
                {videoRunning}/{videoPending + videoRunning}
              </span>
            </span>
          )}
          
          {(audioRunning > 0 || audioPending > 0) && (
            <span className="flex items-center gap-1">
              <span className="text-slate-500">音:</span>
              <span className={audioRunning > 0 ? 'text-orange-400' : ''}>
                {audioRunning}/{audioPending + audioRunning}
              </span>
            </span>
          )}
        </div>
      ) : (
        <span className="text-slate-500">任务</span>
      )}
    </button>
  );
};

export default TaskStatusBar;
