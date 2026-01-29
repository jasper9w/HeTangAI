/**
 * StatusBar - Bottom status bar showing save status, version and shortcuts
 */
import { Check, Clock, Loader2 } from 'lucide-react';
import { useEffect, useState, useRef } from 'react';

interface StatusBarProps {
  isDirty: boolean;
  autoSaveInterval: number; // in seconds
  onSave: () => void;
  version: string;
  onCheckUpdate: () => void;
  isCheckingUpdate: boolean;
  hasUpdate: boolean; // 是否有新版本可用
}

// 检测操作系统
const isMac = typeof navigator !== 'undefined' && navigator.platform.toUpperCase().indexOf('MAC') >= 0;

export function StatusBar({ isDirty, autoSaveInterval, onSave, version, onCheckUpdate, isCheckingUpdate, hasUpdate }: StatusBarProps) {
  const [countdown, setCountdown] = useState(autoSaveInterval);
  const dirtyStartRef = useRef<number | null>(null);

  // 当 isDirty 变化时管理倒计时
  useEffect(() => {
    if (!isDirty) {
      // 已保存，重置倒计时
      setCountdown(autoSaveInterval);
      dirtyStartRef.current = null;
      return;
    }

    // 开始脏状态，记录开始时间
    if (!dirtyStartRef.current) {
      dirtyStartRef.current = Date.now();
    }

    // 设置定时器
    const timer = setInterval(() => {
      if (dirtyStartRef.current) {
        const elapsed = Math.floor((Date.now() - dirtyStartRef.current) / 1000);
        const remaining = Math.max(0, autoSaveInterval - elapsed);
        setCountdown(remaining);
        
        if (remaining <= 0) {
          // 触发保存
          onSave();
          dirtyStartRef.current = null;
        }
      }
    }, 1000);

    return () => clearInterval(timer);
  }, [isDirty, autoSaveInterval, onSave]);

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
      {/* 左侧：版本号 */}
      <div className="flex items-center gap-4">
        <button
          onClick={onCheckUpdate}
          disabled={isCheckingUpdate}
          className={`flex items-center gap-1 transition-colors disabled:cursor-wait ${
            hasUpdate 
              ? 'text-amber-400 hover:text-amber-300 animate-pulse' 
              : 'text-slate-500 hover:text-slate-300'
          }`}
          title={hasUpdate ? '有新版本可用，点击查看' : '点击检查更新'}
        >
          {isCheckingUpdate ? (
            <Loader2 className="w-3 h-3 animate-spin" />
          ) : null}
          <span>v{version}{hasUpdate ? ' (有更新)' : ''}</span>
        </button>
      </div>

      {/* 中间：保存状态 */}
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
