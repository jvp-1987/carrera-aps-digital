import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Badge } from '@/components/ui/badge';
import { ChevronDown, ChevronRight } from 'lucide-react';

const categoryColors = {
  A: 'bg-violet-100 text-violet-700 border-violet-200',
  B: 'bg-blue-100 text-blue-700 border-blue-200',
  C: 'bg-teal-100 text-teal-700 border-teal-200',
  D: 'bg-cyan-100 text-cyan-700 border-cyan-200',
  E: 'bg-orange-100 text-orange-700 border-orange-200',
  F: 'bg-slate-100 text-slate-700 border-slate-200',
};

const categoryLabels = {
  A: 'Médicos', B: 'Profesionales', C: 'Técnicos',
  D: 'Técnicos Salud', E: 'Administrativos', F: 'Auxiliares',
};

function GroupSection({ groupKey, employees, defaultOpen = true }) {
  const [open, setOpen] = useState(defaultOpen);
  const colorClass = categoryColors[groupKey] || 'bg-slate-100 text-slate-700 border-slate-200';

  return (
    <div className="border rounded-lg overflow-hidden">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-4 py-3 bg-slate-50 hover:bg-slate-100 transition-colors text-left"
      >
        <div className="flex items-center gap-3">
          <Badge className={`${colorClass} font-semibold`}>
            {groupKey} — {categoryLabels[groupKey] || groupKey}
          </Badge>
          <span className="text-sm text-slate-500">{employees.length} funcionario{employees.length !== 1 ? 's' : ''}</span>
        </div>
        {open ? <ChevronDown className="w-4 h-4 text-slate-400" /> : <ChevronRight className="w-4 h-4 text-slate-400" />}
      </button>

      {open && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-white">
                {['Nombre', 'RUT', 'Nivel', 'Cargo', 'Bienios', 'Pts Total', 'Estado'].map(h => (
                  <th key={h} className="px-3 py-2 text-left text-xs font-semibold text-slate-500">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {employees.map(emp => (
                <tr key={emp.id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-3 py-2">
                    <Link to={`/EmployeeProfile?id=${emp.id}`} className="font-medium text-indigo-600 hover:underline text-sm">
                      {emp.full_name}
                    </Link>
                  </td>
                  <td className="px-3 py-2 text-xs text-slate-500">{emp.rut}</td>
                  <td className="px-3 py-2 text-center font-bold text-slate-700">{emp.current_level || '—'}</td>
                  <td className="px-3 py-2 text-xs text-slate-600 max-w-[180px] truncate">{emp.position || '—'}</td>
                  <td className="px-3 py-2 text-center text-slate-700">{emp.bienios_count || 0}</td>
                  <td className="px-3 py-2 text-center font-semibold text-slate-800">{emp.total_points || 0}</td>
                  <td className="px-3 py-2">
                    <Badge className={`text-[10px] ${emp.status === 'Activo' ? 'bg-emerald-100 text-emerald-700' : emp.status === 'Licencia' ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-700'}`}>
                      {emp.status || 'Activo'}
                    </Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
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
    <div className="space-y-3">
      {presentKeys.map(key => (
        <GroupSection key={key} groupKey={key} employees={grouped[key]} />
      ))}
    </div>
  );
}