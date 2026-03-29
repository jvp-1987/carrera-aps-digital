import { useState, useRef, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Bell, X, TrendingUp, Clock, GraduationCap, AlertTriangle, CheckCircle2, FileText } from 'lucide-react';
import { Link } from 'react-router-dom';
import { checkPromotion, daysUntilClosure } from '@/components/calculations';
import { toast } from 'sonner';

function buildNotifications(employees, trainings, resolutions) {
  const notifications = [];
  const today = new Date();

  // Cierre anual
  const daysLeft = daysUntilClosure();
  if (daysLeft === null) {
    notifications.push({
      id: 'closure-closed',
      type: 'warning',
      icon: AlertTriangle,
      color: 'text-red-500',
      bg: 'bg-red-50',
      title: 'Periodo de capacitación cerrado',
      body: 'El plazo del 31 de agosto ya venció. Los certificados aplican al siguiente año.',
      link: '/TrainingModule',
    });
  } else if (daysLeft <= 30) {
    notifications.push({
      id: 'closure-soon',
      type: 'warning',
      icon: AlertTriangle,
      color: 'text-amber-500',
      bg: 'bg-amber-50',
      title: `Cierre anual en ${daysLeft} días`,
      body: 'Los funcionarios deben enviar sus certificados antes del 31 de agosto.',
      link: '/TrainingModule',
    });
  }

  // Bienios próximos (60 días)
  employees.forEach(emp => {
    if (!emp.next_bienio_date) return;
    const diff = new Date(emp.next_bienio_date) - today;
    const days = Math.ceil(diff / (1000 * 60 * 60 * 24));
    if (days > 0 && days <= 60) {
      notifications.push({
        id: `bienio-${emp.id}`,
        type: 'info',
        icon: Clock,
        color: 'text-blue-500',
        bg: 'bg-blue-50',
        title: `Bienio próximo — ${emp.full_name}`,
        body: `Bienio #${(emp.bienios_count || 0) + 1} se cumple el ${emp.next_bienio_date} (${days} días)`,
        link: `/EmployeeProfile?id=${emp.id}`,
      });
    }
  });

  // Ascensos elegibles
  employees.forEach(emp => {
    if (!emp.current_level || !emp.total_points) return;
    const promo = checkPromotion(emp.current_level, emp.total_points, emp.category);
    if (promo.eligible) {
      notifications.push({
        id: `promo-${emp.id}`,
        type: 'success',
        icon: TrendingUp,
        color: 'text-emerald-500',
        bg: 'bg-emerald-50',
        title: `Ascenso disponible — ${emp.full_name}`,
        body: `Cumple puntaje para ascender al Nivel ${promo.nextLevel} (Cat. ${emp.category})`,
        link: `/EmployeeProfile?id=${emp.id}`,
      });
    }
  });

  // Vencimientos de contratos (30 días)
  employees.forEach(emp => {
    if (!emp.contract_end_date || emp.status === 'Inactivo') return;
    const diff = new Date(emp.contract_end_date) - today;
    const days = Math.ceil(diff / (1000 * 60 * 60 * 24));
    if (days >= 0 && days <= 30) {
      notifications.push({
        id: `contract-${emp.id}-${emp.contract_end_date}`,
        type: 'warning',
        icon: AlertTriangle,
        color: 'text-red-500',
        bg: 'bg-red-50',
        title: `Contrato por vencer — ${emp.full_name}`,
        body: `Fin contrato: ${emp.contract_end_date} (en ${days} días)`,
        link: `/EmployeeProfile?id=${emp.id}`,
      });
    }
  });

  // Capacitaciones pendientes de validación
  const pending = trainings.filter(t => t.status === 'Pendiente' && t.certificate_url);
  if (pending.length > 0) {
    notifications.push({
      id: 'pending-trainings',
      type: 'warning',
      icon: GraduationCap,
      color: 'text-amber-500',
      bg: 'bg-amber-50',
      title: `${pending.length} capacitación${pending.length > 1 ? 'es' : ''} por validar`,
      body: 'Hay certificados con respaldo PDF esperando validación.',
      link: '/TrainingModule',
    });
  }

  // Resoluciones Borrador pendientes
  const pendingResolutions = (resolutions || []).filter(r => r.status === 'Borrador');
  if (pendingResolutions.length > 0) {
    notifications.push({
      id: 'pending-resolutions',
      type: 'info',
      icon: FileText,
      color: 'text-indigo-500',
      bg: 'bg-indigo-50',
      title: `${pendingResolutions.length} resolución(es) en borrador`,
      body: 'Hay actos administrativos pendientes de revisión o firma.',
      link: '/Resolutions',
    });
  }

  return notifications;
}

export default function NotificationBell({ collapsed }) {
  const [open, setOpen] = useState(false);
  const [dismissed, setDismissed] = useState(() => {
    try { return JSON.parse(localStorage.getItem('dismissed_notifs') || '[]'); } catch { return []; }
  });
  const panelRef = useRef(null);

  const { data: employees = [] } = useQuery({ queryKey: ['employees'], queryFn: () => base44.entities.Employee.list() });
  const { data: trainings = [] } = useQuery({ queryKey: ['trainings'], queryFn: () => base44.entities.Training.list() });
  const { data: resolutions = [] } = useQuery({ queryKey: ['all-resolutions'], queryFn: () => base44.entities.Resolution.list() });

  const all = buildNotifications(employees, trainings, resolutions);
  const visible = all.filter(n => !dismissed.includes(n.id));
  const count = visible.length;

  const dismiss = (id, e) => {
    e.preventDefault();
    e.stopPropagation();
    const next = [...dismissed, id];
    setDismissed(next);
    localStorage.setItem('dismissed_notifs', JSON.stringify(next));
  };

  const dismissAll = () => {
    const next = all.map(n => n.id);
    setDismissed(next);
    localStorage.setItem('dismissed_notifs', JSON.stringify(next));
    setOpen(false);
  };

  const [toasted, setToasted] = useState(() => {
    try { return JSON.parse(localStorage.getItem('toasted_notifs') || '[]'); } catch { return []; }
  });

  useEffect(() => {
    if (visible.length > 0) {
      const newNotifs = visible.filter(n => !toasted.includes(n.id));
      if (newNotifs.length > 0) {
        newNotifs.forEach(n => {
          if (n.type === 'warning' || n.type === 'error') {
            toast.warning(n.title, { description: n.body, duration: 6000 });
          } else if (n.type === 'success') {
            toast.success(n.title, { description: n.body, duration: 5000 });
          } else {
            toast.info(n.title, { description: n.body, duration: 5000 });
          }
        });
        
        const nextToasted = [...toasted, ...newNotifs.map(n => n.id)];
        setToasted(nextToasted);
        localStorage.setItem('toasted_notifs', JSON.stringify(nextToasted));
      }
    }
  }, [visible, toasted]);

  // Close panel on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e) => {
      if (panelRef.current && !panelRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  return (
    <div className="relative" ref={panelRef}>
      <button
        onClick={() => setOpen(o => !o)}
        className={`relative flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors w-full
          ${open ? 'bg-slate-800 text-white' : 'text-slate-300 hover:bg-slate-800 hover:text-white'}`}
        title={collapsed ? `Notificaciones (${count})` : undefined}
      >
        <Bell className="w-5 h-5 flex-shrink-0" />
        {!collapsed && <span>Notificaciones</span>}
        {count > 0 && (
          <span className={`${collapsed ? 'absolute top-1 right-1' : 'ml-auto'} flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white text-[10px] font-bold`}>
            {count > 9 ? '9+' : count}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute left-full ml-2 top-0 z-50 w-80 bg-white rounded-xl shadow-2xl border border-slate-200 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 bg-slate-50">
            <span className="text-sm font-semibold text-slate-800">Notificaciones</span>
            {visible.length > 0 && (
              <button onClick={dismissAll} className="text-xs text-slate-400 hover:text-slate-600 transition-colors">
                Marcar todo leído
              </button>
            )}
          </div>
          <div className="max-h-[420px] overflow-y-auto divide-y divide-slate-100">
            {visible.length === 0 ? (
              <div className="flex flex-col items-center gap-2 py-10 text-slate-400">
                <CheckCircle2 className="w-8 h-8 text-slate-300" />
                <span className="text-sm">Sin notificaciones pendientes</span>
              </div>
            ) : (
              visible.map(n => {
                const Icon = n.icon;
                return (
                  <Link
                    key={n.id}
                    to={n.link}
                    onClick={() => setOpen(false)}
                    className={`flex gap-3 px-4 py-3 hover:bg-slate-50 transition-colors group relative`}
                  >
                    <div className={`mt-0.5 flex-shrink-0 p-1.5 rounded-lg ${n.bg}`}>
                      <Icon className={`w-4 h-4 ${n.color}`} />
                    </div>
                    <div className="flex-1 min-w-0 pr-4">
                      <p className="text-xs font-semibold text-slate-800 leading-tight">{n.title}</p>
                      <p className="text-xs text-slate-500 mt-0.5 leading-snug">{n.body}</p>
                    </div>
                    <button
                      onClick={(e) => dismiss(n.id, e)}
                      className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity text-slate-300 hover:text-slate-600"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </Link>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}