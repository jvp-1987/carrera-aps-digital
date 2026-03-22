import { Link } from 'react-router-dom';
import { Badge } from '@/components/ui/badge';

const categoryColors = {
  A: 'bg-violet-100 text-violet-700',
  B: 'bg-blue-100 text-blue-700',
  C: 'bg-teal-100 text-teal-700',
  D: 'bg-cyan-100 text-cyan-700',
  E: 'bg-orange-100 text-orange-700',
  F: 'bg-slate-100 text-slate-700',
};

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
        <tbody className="divide-y divide-slate-100">
          {employees.map(emp => (
            <tr key={emp.id} className="hover:bg-slate-50 transition-colors">
              <td className="px-3 py-2.5 text-xs text-slate-500 whitespace-nowrap">{emp.rut}</td>
              <td className="px-3 py-2.5 whitespace-nowrap">
                <Link to={`/EmployeeProfile?id=${emp.id}`} className="font-medium text-indigo-600 hover:underline">
                  {emp.full_name}
                </Link>
              </td>
              <td className="px-3 py-2.5">
                <Badge className={`${categoryColors[emp.category] || 'bg-slate-100 text-slate-600'} text-[10px]`}>
                  {emp.category}
                </Badge>
              </td>
              <td className="px-3 py-2.5 text-center font-semibold text-slate-700">{emp.current_level || '—'}</td>
              <td className="px-3 py-2.5 text-xs text-slate-600 max-w-[160px] truncate">{emp.position || '—'}</td>
              <td className="px-3 py-2.5 text-xs text-slate-500 max-w-[140px] truncate">{emp.department || '—'}</td>
              <td className="px-3 py-2.5 text-xs text-slate-500 whitespace-nowrap">{emp.contract_type || '—'}</td>
              <td className="px-3 py-2.5 text-center text-slate-700 font-medium">{emp.bienios_count || 0}</td>
              <td className="px-3 py-2.5 text-center text-slate-700">{emp.bienio_points || 0}</td>
              <td className="px-3 py-2.5 text-center text-slate-700">{emp.training_points || 0}</td>
              <td className="px-3 py-2.5 text-center font-bold text-slate-800">{emp.total_points || 0}</td>
              <td className="px-3 py-2.5">
                <Badge className={`text-[10px] ${emp.status === 'Activo' ? 'bg-emerald-100 text-emerald-700' : emp.status === 'Licencia' ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-700'}`}>
                  {emp.status || 'Activo'}
                </Badge>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}