import { Link } from 'react-router-dom';
import { Badge } from '@/components/ui/badge';
import { motion } from 'framer-motion';
import { Trophy, Briefcase, Star, Clock, GraduationCap, Award, MapPin } from 'lucide-react';

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

function getInitials(name) {
  if (!name) return '??';
  const parts = name.split(' ').filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
  return '??';
}

export default function EmployeeTableView({ employees }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
      <table className="w-full text-sm">
        <thead className="sticky top-0 z-10 bg-white/80 backdrop-blur-md border-b border-slate-200">
          <tr>
            <th className="px-3 py-3 text-left text-xs font-semibold text-slate-600 whitespace-nowrap">Funcionario</th>
            <th className="px-3 py-3 text-left text-xs font-semibold text-slate-600 whitespace-nowrap">Clasificación</th>
            <th className="px-3 py-3 text-left text-xs font-semibold text-slate-600 whitespace-nowrap">Asignación</th>
            <th className="px-3 py-3 text-left text-xs font-semibold text-slate-600 whitespace-nowrap">Contrato</th>
            <th className="px-3 py-3 text-left text-xs font-semibold text-slate-600 whitespace-nowrap">Experiencia</th>
            <th className="px-3 py-3 text-left text-xs font-semibold text-slate-600 whitespace-nowrap">Capacitación</th>
            <th className="px-3 py-3 text-center text-xs font-semibold text-slate-600 whitespace-nowrap">Pts. Totales</th>
            <th className="px-3 py-3 text-left text-xs font-semibold text-slate-600 whitespace-nowrap">Estado</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {employees.map((emp, index) => (
            <motion.tr 
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: Math.min(index * 0.02, 0.2) }}
              key={emp.id} 
              className="group hover:bg-slate-50/80 transition-all duration-300 hover:shadow-[0_4px_20px_-10px_rgba(0,0,0,0.1)] hover:-translate-y-[1px] relative z-0 hover:z-10 bg-white"
            >
              {/* Funcionario */}
              <td className="px-3 py-3">
                <div className="flex items-center gap-2.5 min-w-[180px]">
                  <div className={`w-9 h-9 rounded-full shrink-0 flex items-center justify-center text-xs font-bold shadow-sm bg-gradient-to-br ${categoryGradients[emp.category] || 'from-slate-200 to-slate-300'} text-white ring-2 ring-white`}>
                    {getInitials(emp.full_name)}
                  </div>
                  <div className="flex flex-col min-w-0">
                    <Link to={`/EmployeeProfile?id=${emp.id}`} className="font-semibold text-slate-800 hover:text-indigo-600 transition-colors truncate">
                      {emp.full_name || 'Sin Nombre'}
                    </Link>
                    <span className="text-[11px] font-medium text-slate-400 mt-0.5 font-mono truncate">{emp.rut || 'Sin RUT'}</span>
                  </div>
                </div>
              </td>

              {/* Clasificación */}
              <td className="px-3 py-3 whitespace-nowrap">
                <div className="flex flex-col gap-1 items-start">
                  <Badge className={`${categoryColors[emp.category] || 'bg-slate-100 text-slate-600'} text-[10px] font-bold px-1.5 py-0 shadow-sm`}>
                    Cat. {emp.category || '?'}
                  </Badge>
                  <span className="text-[11px] text-slate-500 flex items-center gap-1 font-medium mt-0.5">
                    <Star className="w-3 h-3 text-slate-400 shrink-0" /> Nivel {emp.current_level || '—'}
                  </span>
                </div>
              </td>

              {/* Asignación */}
              <td className="px-3 py-3 max-w-[180px]">
                <div className="flex flex-col min-w-0">
                  <span className="text-xs font-semibold text-slate-700 truncate block" title={emp.position}>
                    {emp.position || 'Sin Cargo'}
                  </span>
                  <span className="text-[11px] text-slate-500 truncate mt-0.5 block" title={emp.department}>
                    {emp.department || 'Sin Unidad'}
                  </span>
                </div>
              </td>

              {/* Contrato */}
              <td className="px-3 py-3 whitespace-nowrap">
                <span className="text-[11px] font-medium text-slate-600 bg-slate-100 px-2 py-0.5 rounded-md border border-slate-200/60 inline-block max-w-[90px] truncate" title={emp.contract_type}>
                  {emp.contract_type || '—'}
                </span>
              </td>

              {/* Experiencia */}
              <td className="px-3 py-3 whitespace-nowrap">
                <div className="flex items-center gap-1.5 text-xs">
                  <div className="flex flex-col items-center justify-center bg-slate-50 rounded border border-slate-100 px-1.5 py-0.5 min-w-[3rem]">
                    <span className="text-[9px] text-slate-400 font-medium lowercase tracking-wide">Bienios</span>
                    <span className="font-bold text-slate-700 flex items-center gap-0.5 text-xs">
                      <Clock className="w-2.5 h-2.5 text-slate-400 shrink-0" /> {emp.bienios_count || 0}
                    </span>
                  </div>
                  <div className="flex flex-col items-center justify-center bg-slate-50 rounded border border-slate-100 px-1.5 py-0.5 min-w-[3rem]">
                    <span className="text-[9px] text-slate-400 font-medium lowercase tracking-wide">Puntos</span>
                    <span className="font-bold text-slate-700 flex items-center gap-0.5 text-xs">
                      <Award className="w-2.5 h-2.5 text-indigo-400 shrink-0" /> {emp.bienio_points || 0}
                    </span>
                  </div>
                </div>
              </td>

              {/* Capacitación */}
              <td className="px-3 py-3 whitespace-nowrap">
                <div className="flex items-center gap-1.5">
                  <div className="w-7 h-7 shrink-0 rounded-lg bg-emerald-50 border border-emerald-100 flex items-center justify-center">
                    <GraduationCap className="w-3.5 h-3.5 text-emerald-600" />
                  </div>
                  <div className="flex flex-col">
                    <span className="text-xs font-bold text-slate-700 leading-none mb-0.5">{emp.training_points || 0}</span>
                    <span className="text-[9px] text-slate-400 leading-none">Puntos</span>
                  </div>
                </div>
              </td>

              {/* Pts. Totales */}
              <td className="px-3 py-3 whitespace-nowrap text-center">
                <div className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-gradient-to-r from-indigo-500 via-indigo-600 to-violet-600 text-white shadow-sm shadow-indigo-200 ring-2 ring-indigo-50 group-hover:ring-indigo-100 transition-all">
                  <Trophy className="w-3 h-3 text-indigo-100 shrink-0" />
                  <span className="font-black text-[13px] tracking-tight">{emp.total_points || 0}</span>
                </div>
              </td>

              {/* Estado */}
              <td className="px-3 py-3 whitespace-nowrap">
                <div className={`inline-flex items-center gap-1.5 pl-1.5 pr-2 py-0.5 rounded-full text-[10px] font-medium border ${
                  emp.status === 'Activo' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 
                  emp.status === 'Licencia' ? 'bg-amber-50 text-amber-700 border-amber-200' : 
                  'bg-red-50 text-red-700 border-red-200'
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

            </motion.tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}