/**
 * Sidebar - Left navigation component
 */
import { Home, Film, Users, Settings } from 'lucide-react';
import type { PageType } from '../../types';

interface NavItem {
  id: PageType;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}

const navItems: NavItem[] = [
  { id: 'home', label: '首页', icon: Home },
  { id: 'shots', label: '镜头', icon: Film },
  { id: 'characters', label: '角色', icon: Users },
  { id: 'settings', label: '设置', icon: Settings },
];

interface SidebarProps {
  currentPage: PageType;
  onPageChange: (page: PageType) => void;
}

export function Sidebar({ currentPage, onPageChange }: SidebarProps) {
  return (
    <nav className="w-16 bg-slate-800 border-r border-slate-700 flex flex-col items-center py-4">
      {navItems.map((item) => {
        const Icon = item.icon;
        const isActive = currentPage === item.id;

        return (
          <button
            key={item.id}
            onClick={() => onPageChange(item.id)}
            className={`w-12 h-12 mb-2 rounded-lg flex flex-col items-center justify-center transition-colors ${
              isActive
                ? 'bg-violet-500 text-white'
                : 'text-slate-400 hover:bg-slate-700 hover:text-slate-200'
            }`}
            title={item.label}
          >
            <Icon className="w-5 h-5" />
            <span className="text-[10px] mt-0.5">{item.label}</span>
          </button>
        );
      })}
    </nav>
  );
}
