/**
 * StatusBar - Bottom status bar showing save status and shortcuts
 */
import { Check, Clock } from 'lucide-react';
import { useEffect, useState } from 'react';

interface StatusBarProps {
  isDirty: boolean;
  autoSaveInterval: number; // in seconds
  lastSaveTime: number | null; // timestamp
  onSave: () => void;
}

// 检测操作系统
const isMac = typeof navigator !== 'undefined' && navigator.platform.toUpperCase().indexOf('MAC') >= 0;

export function StatusBar({ isDirty, autoSaveInterval, lastSaveTime, onSave }: StatusBarProps) {
  const [countdown, setCountdown] = useState(autoSaveInterval);

  // 计算倒计时
  useEffect(() => {
    if (!isDirty) {
      setCountdown(autoSaveInterval);
      return;
    }

    // 如果有上次保存时间，计算从那时起经过的时间
    if (lastSaveTime) {
      const elapsed = Math.floor((Date.now() - lastSaveTime) / 1000);
      const remaining = Math.max(0, autoSaveInterval - elapsed);
      setCountdown(remaining);
    } else {
      setCountdown(autoSaveInterval);
    }

    const timer = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) {
          // 触发保存
          onSave();
          return autoSaveInterval;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [isDirty, autoSaveInterval, lastSaveTime, onSave]);

  // 格式化倒计时显示
  const formatCountdown = (seconds: number): string => {
    if (seconds >= 60) {
      const mins = Math.floor(seconds / 60);
      const secs = seconds % 60;
      return secs > 0 ? `${mins}分${secs}秒` : `${mins}分钟`;
    }
    return `${seconds}秒`;
  };

  const shortcutKey = isMac ? '⌘S' : 'Ctrl+S';

  return (
    <div className="h-6 bg-slate-800 border-t border-slate-700 px-4 flex items-center justify-between text-xs text-slate-500 flex-shrink-0">
      {/* 左侧：保存状态 */}
      <div className="flex items-center gap-4">
        {isDirty ? (
          <div className="flex items-center gap-1.5">
            <Clock className="w-3 h-3 text-amber-400" />
            <span className="text-slate-400">
              {formatCountdown(countdown)} 后自动保存
            </span>
          </div>
        ) : (
          <div className="flex items-center gap-1.5">
            <Check className="w-3 h-3 text-emerald-400" />
            <span className="text-slate-400">已保存</span>
          </div>
        )}
      </div>

      {/* 右侧：快捷键提示 */}
      <div className="flex items-center gap-4">
        <span className="text-slate-500">
          保存 <kbd className="px-1.5 py-0.5 bg-slate-700 rounded text-slate-400 font-mono text-[10px]">{shortcutKey}</kbd>
        </span>
      </div>
    </div>
  );
}
