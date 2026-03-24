import { Link } from 'react-router-dom';
import { Badge } from '@/components/ui/badge';
import { motion } from 'framer-motion';

const categoryColors = {
  A: 'bg-violet-100 text-violet-700 ring-1 ring-violet-200',
  B: 'bg-blue-100 text-blue-700 ring-1 ring-blue-200',
  C: 'bg-teal-100 text-teal-700 ring-1 ring-teal-200',
  D: 'bg-cyan-100 text-cyan-700 ring-1 ring-cyan-200',
  E: 'bg-orange-100 text-orange-700 ring-1 ring-orange-200',
  F: 'bg-slate-100 text-slate-700 ring-1 ring-slate-200',
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
    <div className="overflow-x-auto rounded-lg border border-slate-200">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-slate-50 border-b border-slate-200">
            {['RUT', 'Nombre', 'Cat.', 'Nivel', 'Cargo', 'Unidad', 'Contrato', 'Bienios', 'Pts. Exp.', 'Pts. Cap.', 'Total', 'Estado'].map(h => (
              <th key={h} className="px-3 py-2.5 text-left text-xs font-semibold text-slate-600 whitespace-nowrap">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100/80">
          {employees.map((emp, index) => (
            <motion.tr 
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: Math.min(index * 0.03, 0.3) }}
              key={emp.id} 
              className="hover:bg-indigo-50/50 hover:shadow-sm transition-all duration-200 group"
            >
              <td className="px-3 py-3 text-xs text-slate-500 whitespace-nowrap font-medium">{emp.rut}</td>
              <td className="px-3 py-3 whitespace-nowrap">
                <div className="flex items-center gap-3">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shadow-sm ${categoryColors[emp.category] || 'bg-slate-100 text-slate-600 ring-1 ring-slate-200'}`}>
                    {getInitials(emp.full_name)}
                  </div>
                  <Link to={`/EmployeeProfile?id=${emp.id}`} className="font-semibold text-slate-700 group-hover:text-indigo-600 transition-colors">
                    {emp.full_name}
                  </Link>
                </div>
              </td>
              <td className="px-3 py-3">
                <Badge className={`${categoryColors[emp.category] || 'bg-slate-100 text-slate-600'} text-[10px] shadow-sm`}>
                  {emp.category}
                </Badge>
              </td>
              <td className="px-3 py-3 text-center font-bold text-slate-700">{emp.current_level || '—'}</td>
              <td className="px-3 py-3 text-xs text-slate-600 max-w-[170px] truncate">{emp.position || '—'}</td>
              <td className="px-3 py-3 text-xs text-slate-500 max-w-[150px] truncate">{emp.department || '—'}</td>
              <td className="px-3 py-3 text-xs text-slate-500 whitespace-nowrap">{emp.contract_type || '—'}</td>
              <td className="px-3 py-3 text-center text-slate-700 font-medium">{emp.bienios_count || 0}</td>
              <td className="px-3 py-3 text-center text-slate-600">{emp.bienio_points || 0}</td>
              <td className="px-3 py-3 text-center text-slate-600">{emp.training_points || 0}</td>
              <td className="px-3 py-3 text-center font-black text-indigo-700 bg-indigo-50/30">{emp.total_points || 0}</td>
              <td className="px-3 py-3">
                <Badge className={`text-[10px] shadow-sm ${emp.status === 'Activo' ? 'bg-emerald-100 text-emerald-700 ring-1 ring-emerald-200' : emp.status === 'Licencia' ? 'bg-amber-100 text-amber-700 ring-1 ring-amber-200' : 'bg-red-100 text-red-700 ring-1 ring-red-200'}`}>
                  {emp.status || 'Activo'}
                </Badge>
              </td>
            </motion.tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}