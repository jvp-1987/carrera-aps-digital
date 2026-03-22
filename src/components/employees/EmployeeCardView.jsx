import { Link } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { User } from 'lucide-react';

const categoryColors = {
  A: 'bg-violet-100 text-violet-700',
  B: 'bg-blue-100 text-blue-700',
  C: 'bg-teal-100 text-teal-700',
  D: 'bg-cyan-100 text-cyan-700',
  E: 'bg-orange-100 text-orange-700',
  F: 'bg-slate-100 text-slate-700',
};

const categoryLabels = {
  A: 'Médicos', B: 'Profesionales', C: 'Técnicos',
  D: 'Técnicos Salud', E: 'Administrativos', F: 'Auxiliares',
};

export default function EmployeeCardView({ employees }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4">
      {employees.map(emp => (
        <Link key={emp.id} to={`/EmployeeProfile?id=${emp.id}`}>
          <Card className="hover:shadow-lg transition-all cursor-pointer hover:border-indigo-200 h-full">
            <CardContent className="p-5 flex flex-col items-center text-center gap-3">
              {emp.photo_url ? (
                <img src={emp.photo_url} alt={emp.full_name} className="w-16 h-16 rounded-full object-cover border-2 border-slate-200" />
              ) : (
                <div className="w-16 h-16 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-700 font-bold text-lg flex-shrink-0">
                  {emp.full_name?.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase() || <User className="w-6 h-6" />}
                </div>
              )}
              <div className="min-w-0 w-full">
                <p className="font-semibold text-slate-900 truncate text-sm">{emp.full_name}</p>
                <p className="text-xs text-slate-400 mt-0.5">{emp.rut}</p>
                <p className="text-xs text-slate-500 truncate mt-0.5">{emp.position || 'Sin cargo'}</p>
              </div>
              <div className="flex flex-wrap gap-1 justify-center">
                <Badge className={`${categoryColors[emp.category] || 'bg-slate-100 text-slate-600'} text-[10px]`}>
                  Cat. {emp.category} — {categoryLabels[emp.category] || ''}
                </Badge>
                <Badge variant="outline" className="text-[10px]">Nivel {emp.current_level || '—'}</Badge>
                <Badge className={`text-[10px] ${emp.status === 'Activo' ? 'bg-emerald-100 text-emerald-700' : emp.status === 'Licencia' ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-700'}`}>
                  {emp.status || 'Activo'}
                </Badge>
              </div>
              <div className="w-full pt-2 border-t border-slate-100 grid grid-cols-3 gap-1 text-center">
                <div>
                  <p className="text-[10px] text-slate-400">Bienios</p>
                  <p className="text-xs font-bold text-slate-700">{emp.bienios_count || 0}</p>
                </div>
                <div>
                  <p className="text-[10px] text-slate-400">Pts. Exp.</p>
                  <p className="text-xs font-bold text-slate-700">{emp.bienio_points || 0}</p>
                </div>
                <div>
                  <p className="text-[10px] text-slate-400">Pts. Cap.</p>
                  <p className="text-xs font-bold text-slate-700">{emp.training_points || 0}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </Link>
      ))}
    </div>
  );
}