import { Outlet, Link, useLocation } from 'react-router-dom';
import { 
  Users, LayoutDashboard, GraduationCap, FileText, 
  Bell, Shield, ChevronLeft, ChevronRight, LogOut
} from 'lucide-react';
import { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';

const navItems = [
  { path: '/Dashboard', label: 'Panel', icon: LayoutDashboard },
  { path: '/Employees', label: 'Funcionarios', icon: Users },
  { path: '/TrainingModule', label: 'Capacitación', icon: GraduationCap },
  { path: '/Resolutions', label: 'Resoluciones', icon: FileText },
  { path: '/Alerts', label: 'Alertas', icon: Bell },
  { path: '/BudgetProjection', label: 'Proyección 2027', icon: TrendingUp },
];

export default function Layout() {
  const location = useLocation();
  const [collapsed, setCollapsed] = useState(false);

  return (
    <div className="flex h-screen bg-slate-50">
      <aside className={`${collapsed ? 'w-16' : 'w-64'} bg-slate-900 text-white flex flex-col transition-all duration-300 ease-in-out flex-shrink-0`}>
        <div className="p-4 border-b border-slate-700 flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-indigo-500 flex items-center justify-center flex-shrink-0">
            <Shield className="w-5 h-5" />
          </div>
          {!collapsed && (
            <div className="min-w-0">
              <h1 className="font-bold text-sm tracking-wide">APS Panguipulli</h1>
              <p className="text-[10px] text-slate-400">Carrera Funcionaria</p>
            </div>
          )}
        </div>

        <nav className="flex-1 py-4 space-y-1 px-2">
          {navItems.map(item => {
            const isActive = location.pathname.startsWith(item.path);
            return (
              <Link
                key={item.path}
                to={item.path}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors ${
                  isActive 
                    ? 'bg-indigo-600 text-white' 
                    : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                }`}
                title={collapsed ? item.label : undefined}
              >
                <item.icon className="w-5 h-5 flex-shrink-0" />
                {!collapsed && <span>{item.label}</span>}
              </Link>
            );
          })}
        </nav>

        <div className="p-2 border-t border-slate-700 space-y-1">
          <button
            onClick={() => setCollapsed(!collapsed)}
            className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-slate-400 hover:text-white hover:bg-slate-800 w-full transition-colors"
          >
            {collapsed ? <ChevronRight className="w-5 h-5" /> : <ChevronLeft className="w-5 h-5" />}
            {!collapsed && <span>Contraer</span>}
          </button>
          <button
            onClick={() => base44.auth.logout()}
            className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-slate-400 hover:text-red-400 hover:bg-slate-800 w-full transition-colors"
          >
            <LogOut className="w-5 h-5 flex-shrink-0" />
            {!collapsed && <span>Cerrar Sesión</span>}
          </button>
        </div>
      </aside>

      <main className="flex-1 overflow-auto">
        <Outlet />
      </main>
    </div>
  );
}