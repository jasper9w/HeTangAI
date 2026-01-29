/**
 * RenameProjectModal - Modal for renaming projects
 */
import { useState, useEffect } from 'react';
import { X, Edit3 } from 'lucide-react';

interface RenameProjectModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (oldName: string, newName: string) => void;
  currentName: string;
}

export function RenameProjectModal({ isOpen, onClose, onConfirm, currentName }: RenameProjectModalProps) {
  const [projectName, setProjectName] = useState(currentName);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Reset project name when modal opens or currentName changes
  useEffect(() => {
    if (isOpen) {
      setProjectName(currentName);
    }
  }, [isOpen, currentName]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!projectName.trim() || projectName.trim() === currentName) return;

    setIsSubmitting(true);
    try {
      await onConfirm(currentName, projectName.trim());
      onClose();
    } catch (error) {
      console.error('Failed to rename project:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClose = () => {
    if (!isSubmitting) {
      setProjectName(currentName);
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-slate-800 rounded-lg p-6 w-full max-w-md mx-4">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-slate-100">重命名项目</h2>
          <button
            onClick={handleClose}
            disabled={isSubmitting}
            className="p-1 hover:bg-slate-700 rounded text-slate-400 hover:text-slate-200 transition-colors disabled:opacity-50"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit}>
          <div className="mb-4">
            <label htmlFor="projectName" className="block text-sm font-medium text-slate-300 mb-2">
              项目名称
            </label>
            <input
              id="projectName"
              type="text"
              value={projectName}
              onChange={(e) => setProjectName(e.target.value)}
              placeholder="请输入新的项目名称"
              className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent"
              disabled={isSubmitting}
              autoFocus
            />
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={handleClose}
              disabled={isSubmitting}
              className="px-4 py-2 text-slate-400 hover:text-slate-200 transition-colors disabled:opacity-50"
            >
              取消
            </button>
            <button
              type="submit"
              disabled={!projectName.trim() || projectName.trim() === currentName || isSubmitting}
              className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-teal-600 to-teal-500 hover:from-teal-500 hover:to-teal-400 disabled:bg-slate-600 disabled:cursor-not-allowed text-white rounded-lg transition-colors"
            >
              {isSubmitting ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  重命名中...
                </>
              ) : (
                <>
                  <Edit3 className="w-4 h-4" />
                  重命名
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}