/**
 * HomePage - Project overview and statistics
 */
import { Film, Users, Image, Volume2 } from 'lucide-react';
import type { ProjectData } from '../types';

interface HomePageProps {
  project: ProjectData | null;
}

export function HomePage({ project }: HomePageProps) {
  const stats = {
    shots: project?.shots.length || 0,
    characters: project?.characters.length || 0,
    imagesGenerated: project?.shots.filter(s => s.images.length > 0).length || 0,
    videosGenerated: project?.shots.filter(s => s.videoUrl).length || 0,
    audiosGenerated: project?.shots.filter(s => s.audioUrl).length || 0,
  };

  return (
    <div className="h-full p-6 overflow-y-auto">
      <h2 className="text-xl font-semibold text-slate-100 mb-6">项目概览</h2>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <StatCard
          icon={Film}
          label="镜头数"
          value={stats.shots}
          color="teal"
        />
        <StatCard
          icon={Users}
          label="角色数"
          value={stats.characters}
          color="blue"
        />
        <StatCard
          icon={Image}
          label="已生成图片"
          value={stats.imagesGenerated}
          subValue={`/ ${stats.shots}`}
          color="emerald"
        />
        <StatCard
          icon={Volume2}
          label="已生成配音"
          value={stats.audiosGenerated}
          subValue={`/ ${stats.shots}`}
          color="orange"
        />
      </div>

      {stats.shots === 0 && (
        <div className="bg-slate-800/50 backdrop-blur-sm rounded-lg p-8 text-center border border-slate-700/30 shadow-lg shadow-black/20">
          <Film className="w-16 h-16 mx-auto mb-4 text-slate-600" />
          <h3 className="text-lg font-medium text-slate-300 mb-2">开始创作</h3>
          <p className="text-slate-500">
            导入 Excel 文件或手动添加镜头开始您的创作
          </p>
        </div>
      )}
    </div>
  );
}

interface StatCardProps {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: number;
  subValue?: string;
  color: 'teal' | 'blue' | 'emerald' | 'orange';
}

const colorMap = {
  teal: 'bg-teal-500/20 text-teal-400',
  blue: 'bg-blue-500/20 text-blue-400',
  emerald: 'bg-emerald-500/20 text-emerald-400',
  orange: 'bg-orange-500/20 text-orange-400',
};

function StatCard({ icon: Icon, label, value, subValue, color }: StatCardProps) {
  return (
    <div className="bg-slate-800/80 backdrop-blur-sm rounded-lg p-4 border border-slate-700/50 shadow-lg shadow-black/20 hover:shadow-xl hover:shadow-black/30 transition-all hover:-translate-y-0.5">
      <div className={`w-10 h-10 rounded-lg ${colorMap[color]} flex items-center justify-center mb-3`}>
        <Icon className="w-5 h-5" />
      </div>
      <div className="text-2xl font-bold text-slate-100">
        {value}
        {subValue && <span className="text-sm font-normal text-slate-500">{subValue}</span>}
      </div>
      <div className="text-sm text-slate-400">{label}</div>
    </div>
  );
}
