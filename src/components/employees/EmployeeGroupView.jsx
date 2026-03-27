import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Badge } from '@/components/ui/badge';
import { ChevronDown, ChevronRight, Trophy, Briefcase, Star, Clock } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

const categoryColors = {
  A: 'bg-violet-100 text-violet-700 ring-1 ring-violet-200',
  B: 'bg-blue-100 text-blue-700 ring-1 ring-blue-200',
  C: 'bg-teal-100 text-teal-700 ring-1 ring-teal-200',
  D: 'bg-cyan-100 text-cyan-700 ring-1 ring-cyan-200',
  E: 'bg-orange-100 text-orange-700 ring-1 ring-orange-200',
  F: 'bg-slate-100 text-slate-700 ring-1 ring-slate-200',
};

const categoryGradients = {
  A: 'from-violet-500 to-fuchsia-500',
  B: 'from-blue-500 to-cyan-500',
  C: 'from-teal-400 to-emerald-500',
  D: 'from-cyan-400 to-blue-500',
  E: 'from-orange-400 to-amber-500',
  F: 'from-slate-400 to-slate-500',
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
            <div className="overflow-x-auto border-t border-slate-100 bg-white">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50/30 border-b border-slate-100/80">
                    <th className="px-5 py-3.5 text-left text-xs font-semibold text-slate-500">Funcionario</th>
                    <th className="px-5 py-3.5 text-left text-xs font-semibold text-slate-500">Asignación</th>
                    <th className="px-5 py-3.5 text-left text-xs font-semibold text-slate-500">Capacitación</th>
                    <th className="px-5 py-3.5 text-left text-xs font-semibold text-slate-500">Puntaje Total</th>
                    <th className="px-5 py-3.5 text-left text-xs font-semibold text-slate-500">Estado</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {employees.map(emp => (
                    <tr 
                      key={emp.id} 
                      className={`hover:bg-slate-50/80 transition-colors group ${
                        emp.status === 'Inactivo' ? 'opacity-60 grayscale-[0.4]' : ''
                      }`}
                    >
                      
                      {/* Funcionario */}
                      <td className="px-5 py-3.5 whitespace-nowrap">
                        <div className="flex items-center gap-3">
                          <div className={`w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold shadow-sm bg-gradient-to-br ${categoryGradients[emp.category] || 'from-slate-200 to-slate-300'} text-white ring-2 ring-white`}>
                            {getInitials(emp.full_name)}
                          </div>
                          <div className="flex flex-col">
                            <Link to={`/EmployeeProfile?id=${emp.id}`} className="font-semibold text-slate-700 group-hover:text-indigo-600 transition-colors">
                              {emp.full_name || 'Sin Nombre'}
                            </Link>
                            <span className="text-[11px] font-medium text-slate-400 mt-0.5 font-mono">{emp.rut || 'Sin RUT'}</span>
                          </div>
                        </div>
                      </td>

                      {/* Asignación (Cargo + Nivel) */}
                      <td className="px-5 py-3.5">
                        <div className="flex flex-col gap-0.5 max-w-[200px]">
                          <span className="text-xs font-semibold text-slate-700 truncate flex items-center gap-1.5" title={emp.position}>
                            <Briefcase className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
                            {emp.position || 'Sin Cargo'}
                          </span>
                          <span className="text-[11px] text-slate-500 flex items-center gap-1.5">
                            <Star className="w-3 h-3 text-amber-400 flex-shrink-0" /> Nivel {emp.current_level || '—'}
                          </span>
                        </div>
                      </td>

                      {/* Capacitación */}
                      <td className="px-5 py-3.5 whitespace-nowrap">
                        <div className="flex items-center gap-1.5">
                          <div className="flex flex-col">
                            <span className="text-xs font-bold text-slate-700 leading-none mb-0.5">{(emp.training_points || 0).toFixed(1)}</span>
                            <span className="text-[9px] text-slate-400 leading-none">Puntos</span>
                          </div>
                        </div>
                      </td>

                      {/* Puntos y Bienios */}
                      <td className="px-5 py-3.5 whitespace-nowrap">
                        <div className="flex items-center gap-3">
                          <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-gradient-to-r from-indigo-500 to-violet-500 text-white shadow-sm ring-2 ring-indigo-50 group-hover:ring-indigo-100 transition-all">
                            <Trophy className="w-3 h-3 text-indigo-100" />
                            <span className="font-bold text-xs">{emp.total_points || 0}</span>
                          </div>
                          <span className="text-xs font-medium text-slate-500 flex items-center gap-1 bg-slate-50 px-2 py-1 rounded-md border border-slate-100">
                            <Clock className="w-3 h-3 text-slate-300" /> {emp.bienios_count || 0} bns
                          </span>
                        </div>
                      </td>

                      {/* Estado */}
                      <td className="px-5 py-3.5 whitespace-nowrap">
                        <div className={`inline-flex items-center gap-1.5 pl-2 pr-3 py-1.5 rounded-full text-xs font-medium bg-white border ${
                          emp.status === 'Activo' ? 'text-emerald-700 border-emerald-200' : 
                          emp.status === 'Licencia' ? 'text-amber-700 border-amber-200' : 
                          'text-red-700 border-red-200'
                        }`}>
                          <span className="relative flex h-2 w-2">
                            {emp.status === 'Activo' && (
                              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                            )}
                            <span className={`relative inline-flex rounded-full h-2 w-2 ${
                              emp.status === 'Activo' ? 'bg-emerald-500' : 
                              emp.status === 'Licencia' ? 'bg-amber-500' : 
                              'bg-red-500'
                            }`}></span>
                          </span>
                          {emp.status || 'Activo'}
                        </div>
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