/**
 * VideoModal - Modal for playing videos
 */
import { useEffect } from 'react';
import { X } from 'lucide-react';

interface VideoModalProps {
  isOpen: boolean;
  onClose: () => void;
  videoUrl: string;
  title?: string;
}

export function VideoModal({ isOpen, onClose, videoUrl, title }: VideoModalProps) {
  // Handle ESC key press
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    if (isOpen) {
      document.addEventListener('keydown', handleKeyDown);
      // Prevent body scroll when modal is open
      document.body.style.overflow = 'hidden';
    }

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = 'unset';
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0"
        onClick={onClose}
      />

      {/* Modal Content */}
      <div className="relative bg-slate-800 rounded-lg overflow-hidden max-w-4xl max-h-[90vh] w-full">
        {/* Header */}
        <div className="flex items-center justify-between p-4 bg-slate-700">
          <h3 className="text-lg font-semibold text-slate-100">
            {title || '视频播放'}
          </h3>
          <button
            onClick={onClose}
            className="p-1 hover:bg-slate-600 rounded text-slate-400 hover:text-slate-200 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Video Player */}
        <div className="p-4">
          <video
            src={videoUrl}
            className="w-full max-h-[70vh] rounded-lg bg-black"
            controls
            autoPlay
            onError={(e) => {
              console.error('Video modal load error:', e);
              console.log('Video URL:', videoUrl);
            }}
          />
        </div>

        {/* Footer */}
        <div className="p-4 bg-slate-700 text-center">
          <p className="text-sm text-slate-400">
            按 ESC 键或点击背景关闭
          </p>
        </div>
      </div>
    </div>
  );
}