/**
 * ProjectListPage - Display and manage all projects
 */
import { useState, useEffect } from 'react';
import { FolderOpen, Plus, Clock, Film, Users, MoreVertical, Edit3, Trash2 } from 'lucide-react';
import { useApi } from '../hooks/useApi';
import { NewProjectModal } from '../components/ui/NewProjectModal';
import { RenameProjectModal } from '../components/ui/RenameProjectModal';
import { ConfirmModal } from '../components/ui/ConfirmModal';
import type { ProjectListItem } from '../types';

interface ProjectListPageProps {
  onOpenProject: (projectName: string) => void;
  onNewProject: (projectName: string) => void;
}

export function ProjectListPage({ onOpenProject, onNewProject }: ProjectListPageProps) {
  const { api, ready } = useApi();
  const [projects, setProjects] = useState<ProjectListItem[]>([]);
  const [loading, setLoading] = useState(true);

  // Modal states
  const [showNewProjectModal, setShowNewProjectModal] = useState(false);
  const [showRenameModal, setShowRenameModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [selectedProject, setSelectedProject] = useState<string>('');
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    if (ready && api) {
      loadProjects();
    }
  }, [ready, api]);

  const loadProjects = async () => {
    if (!api) return;
    setLoading(true);
    try {
      const result = await api.list_projects();
      if (result.success && result.projects) {
        setProjects(result.projects);
      }
    } catch (error) {
      console.error('Failed to load projects:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateProject = async (projectName: string) => {
    if (!api) return;

    // Create new project with the given name
    const result = await api.new_project();
    if (result.success && result.data) {
      // Save the project with the specified name
      const saveResult = await api.save_project_to_workdir(projectName);
      if (saveResult.success) {
        await loadProjects(); // Refresh project list
        onNewProject(projectName);
      }
    }
  };

  const handleRenameProject = async (oldName: string, newName: string) => {
    if (!api) return;

    const result = await api.rename_project_in_workdir(oldName, newName);
    if (result.success) {
      await loadProjects(); // Refresh project list
    }
  };

  const handleDeleteProject = async () => {
    if (!api || !selectedProject) return;

    setIsDeleting(true);
    try {
      const result = await api.delete_project_from_workdir(selectedProject);
      if (result.success) {
        await loadProjects(); // Refresh project list
        setShowDeleteModal(false);
        setSelectedProject('');
      }
    } catch (error) {
      console.error('Failed to delete project:', error);
    } finally {
      setIsDeleting(false);
    }
  };

  const formatDate = (dateStr: string) => {
    if (!dateStr) return '';
    try {
      const date = new Date(dateStr);
      return date.toLocaleDateString('zh-CN', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return dateStr;
    }
  };

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-slate-400">加载中...</div>
      </div>
    );
  }

  return (
    <div className="h-full p-6 overflow-y-auto">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-semibold text-slate-100">我的项目</h2>
          <button
            onClick={() => setShowNewProjectModal(true)}
            className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-teal-600 to-teal-500 hover:from-teal-500 hover:to-teal-400 text-white rounded-lg transition-all shadow-md shadow-teal-900/30"
          >
            <Plus className="w-5 h-5" />
            新建项目
          </button>
        </div>

        {/* Project Grid */}
        {projects.length === 0 ? (
          <div className="bg-slate-800/50 backdrop-blur-sm rounded-lg p-12 text-center border border-slate-700/30 shadow-lg shadow-black/20">
            <FolderOpen className="w-16 h-16 mx-auto mb-4 text-slate-600" />
            <h3 className="text-lg font-medium text-slate-300 mb-2">暂无项目</h3>
            <p className="text-slate-500 mb-6">创建您的第一个项目开始创作</p>
            <button
              onClick={() => setShowNewProjectModal(true)}
              className="inline-flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-teal-600 to-teal-500 hover:from-teal-500 hover:to-teal-400 text-white rounded-lg transition-all shadow-md shadow-teal-900/30"
            >
              <Plus className="w-5 h-5" />
              新建项目
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {projects.map((project) => (
              <ProjectCard
                key={project.name}
                project={project}
                onOpen={() => onOpenProject(project.name)}
                onRename={() => {
                  setSelectedProject(project.name);
                  setShowRenameModal(true);
                }}
                onDelete={() => {
                  setSelectedProject(project.name);
                  setShowDeleteModal(true);
                }}
                formatDate={formatDate}
              />
            ))}
          </div>
        )}
      </div>

      {/* Modals */}
      <NewProjectModal
        isOpen={showNewProjectModal}
        onClose={() => setShowNewProjectModal(false)}
        onConfirm={handleCreateProject}
      />

      <RenameProjectModal
        isOpen={showRenameModal}
        onClose={() => {
          setShowRenameModal(false);
          setSelectedProject('');
        }}
        onConfirm={handleRenameProject}
        currentName={selectedProject}
      />

      <ConfirmModal
        isOpen={showDeleteModal}
        onClose={() => {
          setShowDeleteModal(false);
          setSelectedProject('');
        }}
        onConfirm={handleDeleteProject}
        title="删除项目"
        message={`确定要删除项目"${selectedProject}"吗？此操作不可撤销，将删除项目中的所有文件。`}
        confirmText="删除"
        confirmVariant="danger"
        isLoading={isDeleting}
      />
    </div>
  );
}

interface ProjectCardProps {
  project: ProjectListItem;
  onOpen: () => void;
  onRename: () => void;
  onDelete: () => void;
  formatDate: (dateStr: string) => string;
}

function ProjectCard({ project, onOpen, onRename, onDelete, formatDate }: ProjectCardProps) {
  const [showMenu, setShowMenu] = useState(false);

  return (
    <div className="bg-slate-800/80 backdrop-blur-sm rounded-lg p-5 border border-slate-700/50 hover:border-teal-500/50 shadow-lg shadow-black/20 hover:shadow-xl hover:shadow-black/30 transition-all hover:-translate-y-0.5 relative">
      {/* Menu Button */}
      <div className="absolute top-4 right-4">
        <button
          onClick={(e) => {
            e.stopPropagation();
            setShowMenu(!showMenu);
          }}
          className="p-1 hover:bg-slate-700 rounded text-slate-400 hover:text-slate-200 transition-colors"
        >
          <MoreVertical className="w-4 h-4" />
        </button>

        {/* Dropdown Menu */}
        {showMenu && (
          <div className="absolute right-0 top-8 bg-slate-700 rounded-lg shadow-lg border border-slate-600 py-1 z-10 min-w-[120px]">
            <button
              onClick={(e) => {
                e.stopPropagation();
                setShowMenu(false);
                onRename();
              }}
              className="w-full px-3 py-2 text-left text-sm text-slate-300 hover:bg-slate-600 flex items-center gap-2"
            >
              <Edit3 className="w-3.5 h-3.5" />
              重命名
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                setShowMenu(false);
                onDelete();
              }}
              className="w-full px-3 py-2 text-left text-sm text-red-400 hover:bg-slate-600 flex items-center gap-2"
            >
              <Trash2 className="w-3.5 h-3.5" />
              删除
            </button>
          </div>
        )}
      </div>

      {/* Project Content */}
      <div
        onClick={onOpen}
        className="cursor-pointer"
      >
        {/* Project Name */}
        <h3 className="text-lg font-semibold text-slate-100 mb-3 truncate pr-8">
          {project.name}
        </h3>

        {/* Stats */}
        <div className="flex items-center gap-4 mb-4">
          <div className="flex items-center gap-1.5 text-sm text-slate-400">
            <Film className="w-4 h-4" />
            <span>{project.shotCount} 镜头</span>
          </div>
          <div className="flex items-center gap-1.5 text-sm text-slate-400">
            <Users className="w-4 h-4" />
            <span>{project.characterCount} 角色</span>
          </div>
        </div>

        {/* Dates */}
        <div className="space-y-1">
          <div className="flex items-center gap-1.5 text-xs text-slate-500">
            <Clock className="w-3.5 h-3.5" />
            <span>更新: {formatDate(project.updatedAt)}</span>
          </div>
          <div className="flex items-center gap-1.5 text-xs text-slate-500">
            <Clock className="w-3.5 h-3.5" />
            <span>创建: {formatDate(project.createdAt)}</span>
          </div>
        </div>
      </div>
    </div>
  );
}