import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Badge } from '@/components/ui/badge';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

const categoryColors = {
  A: 'bg-violet-100 text-violet-700 ring-1 ring-violet-200',
  B: 'bg-blue-100 text-blue-700 ring-1 ring-blue-200',
  C: 'bg-teal-100 text-teal-700 ring-1 ring-teal-200',
  D: 'bg-cyan-100 text-cyan-700 ring-1 ring-cyan-200',
  E: 'bg-orange-100 text-orange-700 ring-1 ring-orange-200',
  F: 'bg-slate-100 text-slate-700 ring-1 ring-slate-200',
};

const categoryLabels = {
  A: 'Médicos', B: 'Profesionales', C: 'Técnicos',
  D: 'Técnicos Salud', E: 'Administrativos', F: 'Auxiliares',
};

function getInitials(name) {
  if (!name) return '??';
  const parts = name.split(' ').filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
  return '??';
}

function GroupSection({ groupKey, employees, defaultOpen = true }) {
  const [open, setOpen] = useState(defaultOpen);
  const colorClass = categoryColors[groupKey] || 'bg-slate-100 text-slate-700 ring-1 ring-slate-200';

  return (
    <motion.div 
      initial={{ opacity: 0, scale: 0.98 }}
      animate={{ opacity: 1, scale: 1 }}
      className="border border-slate-200/80 rounded-2xl overflow-hidden shadow-sm bg-white hover:shadow-md transition-all duration-300"
    >
      <button
        onClick={() => setOpen(o => !o)}
        className={`w-full flex items-center justify-between px-5 py-4 transition-colors text-left ${open ? 'bg-indigo-50/30' : 'bg-slate-50/50 hover:bg-slate-100/80'}`}
      >
        <div className="flex items-center gap-4">
          <Badge className={`${colorClass} font-bold text-xs px-3 py-1 shadow-sm`}>
            {groupKey} — {categoryLabels[groupKey] || groupKey}
          </Badge>
          <span className="text-xs font-semibold text-slate-500 bg-white px-3 py-1.5 rounded-md border border-slate-200 shadow-sm">
            {employees.length} funcionario{employees.length !== 1 ? 's' : ''}
          </span>
        </div>
        <div className={`p-1 rounded-full transition-colors ${open ? 'bg-indigo-100' : 'bg-slate-200 group-hover:bg-indigo-50'}`}>
          {open ? <ChevronDown className="w-4 h-4 text-indigo-600" /> : <ChevronRight className="w-4 h-4 text-slate-500" />}
        </div>
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3, ease: 'easeInOut' }}
            className="overflow-hidden"
          >
            <div className="overflow-x-auto border-t border-slate-100">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50/50">
                    {['Nombre', 'RUT', 'Nivel', 'Cargo', 'Bienios', 'Pts Total', 'Estado'].map(h => (
                      <th key={h} className="px-4 py-3 text-left text-[11px] font-bold text-slate-500 uppercase tracking-wider">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {employees.map(emp => (
                    <tr key={emp.id} className="hover:bg-indigo-50/50 transition-colors group">
                      <td className="px-4 py-3.5">
                        <div className="flex items-center gap-3">
                          <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shadow-sm ${categoryColors[emp.category] || 'bg-slate-100 text-slate-600 ring-1 ring-slate-200'}`}>
                            {getInitials(emp.full_name)}
                          </div>
                          <Link to={`/EmployeeProfile?id=${emp.id}`} className="font-semibold text-slate-700 group-hover:text-indigo-600 transition-colors">
                            {emp.full_name}
                          </Link>
                        </div>
                      </td>
                      <td className="px-4 py-3.5 text-xs text-slate-500 font-medium">{emp.rut}</td>
                      <td className="px-4 py-3.5 text-center font-bold text-slate-700">{emp.current_level || '—'}</td>
                      <td className="px-4 py-3.5 text-xs text-slate-600 max-w-[200px] truncate">{emp.position || '—'}</td>
                      <td className="px-4 py-3.5 text-center font-medium text-slate-700">{emp.bienios_count || 0}</td>
                      <td className="px-4 py-3.5 text-center font-black text-indigo-700 bg-indigo-50/30">{emp.total_points || 0}</td>
                      <td className="px-4 py-3.5">
                        <Badge className={`text-[10px] shadow-sm ${emp.status === 'Activo' ? 'bg-emerald-100 text-emerald-700 ring-1 ring-emerald-200' : emp.status === 'Licencia' ? 'bg-amber-100 text-amber-700 ring-1 ring-amber-200' : 'bg-red-100 text-red-700 ring-1 ring-red-200'}`}>
                          {emp.status || 'Activo'}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

export default function EmployeeGroupView({ employees }) {
  const grouped = employees.reduce((acc, emp) => {
    const key = emp.category || 'Sin Categoría';
    if (!acc[key]) acc[key] = [];
    acc[key].push(emp);
    return acc;
  }, {});

  const orderedKeys = ['A', 'B', 'C', 'D', 'E', 'F', ...Object.keys(grouped).filter(k => !['A','B','C','D','E','F'].includes(k))];
  const presentKeys = orderedKeys.filter(k => grouped[k]);

  return (
    <div className="space-y-4">
      {presentKeys.map(key => (
        <GroupSection key={key} groupKey={key} employees={grouped[key]} />
      ))}
    </div>
  );
}