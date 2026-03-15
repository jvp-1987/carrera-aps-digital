import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { GraduationCap, Search, Lock, CheckCircle2, Clock as ClockIcon, XCircle } from 'lucide-react';
import { isAnnualClosurePeriod } from '@/components/calculations';
import { Link } from 'react-router-dom';

export default function TrainingModule() {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const isClosed = isAnnualClosurePeriod();

  const { data: trainings = [], isLoading } = useQuery({
    queryKey: ['all-trainings'],
    queryFn: () => base44.entities.Training.list('-created_date', 200),
  });

  const { data: employees = [] } = useQuery({
    queryKey: ['employees'],
    queryFn: () => base44.entities.Employee.list(),
  });

  const employeeMap = {};
  employees.forEach(e => { employeeMap[e.id] = e; });

  const filtered = trainings.filter(t => {
    const emp = employeeMap[t.employee_id];
    const matchSearch = !search || 
      t.course_name?.toLowerCase().includes(search.toLowerCase()) ||
      emp?.full_name?.toLowerCase().includes(search.toLowerCase());
    const matchStatus = statusFilter === 'all' || t.status === statusFilter;
    return matchSearch && matchStatus;
  });

  const statusIcons = {
    Pendiente: <ClockIcon className="w-3.5 h-3.5" />,
    Validado: <CheckCircle2 className="w-3.5 h-3.5" />,
    Rechazado: <XCircle className="w-3.5 h-3.5" />,
  };

  const statusColors = {
    Pendiente: 'bg-amber-100 text-amber-700',
    Validado: 'bg-emerald-100 text-emerald-700',
    Rechazado: 'bg-red-100 text-red-700',
  };

  const pendingCount = trainings.filter(t => t.status === 'Pendiente').length;
  const validatedCount = trainings.filter(t => t.status === 'Validado').length;
  const totalPoints = trainings.filter(t => t.status === 'Validado').reduce((s, t) => s + (t.calculated_points || 0), 0);

  return (
    <div className="p-6 lg:p-8 max-w-7xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Módulo de Capacitación</h1>
        <p className="text-slate-500 text-sm mt-1">Gestión y validación de capacitaciones — Ley 19.378</p>
      </div>

      {isClosed && (
        <div className="mb-6 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-800 flex items-center gap-2">
          <Lock className="w-4 h-4 flex-shrink-0" />
          El periodo de ingreso está cerrado (posterior al 31 de agosto). Los nuevos antecedentes aplican al siguiente periodo.
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 rounded-lg bg-amber-100"><ClockIcon className="w-5 h-5 text-amber-600" /></div>
            <div>
              <p className="text-xs text-slate-400">Pendientes</p>
              <p className="text-xl font-bold text-slate-900">{pendingCount}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 rounded-lg bg-emerald-100"><CheckCircle2 className="w-5 h-5 text-emerald-600" /></div>
            <div>
              <p className="text-xs text-slate-400">Validadas</p>
              <p className="text-xl font-bold text-slate-900">{validatedCount}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 rounded-lg bg-indigo-100"><GraduationCap className="w-5 h-5 text-indigo-600" /></div>
            <div>
              <p className="text-xs text-slate-400">Pts. Totales Validados</p>
              <p className="text-xl font-bold text-slate-900">{totalPoints.toFixed(0)}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="mb-6">
        <CardContent className="p-4 flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <Input placeholder="Buscar por curso o funcionario..." value={search} onChange={e => setSearch(e.target.value)} className="pl-10" />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-full sm:w-40"><SelectValue placeholder="Estado" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              <SelectItem value="Pendiente">Pendiente</SelectItem>
              <SelectItem value="Validado">Validado</SelectItem>
              <SelectItem value="Rechazado">Rechazado</SelectItem>
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      {isLoading ? (
        <div className="flex justify-center py-16">
          <div className="w-8 h-8 border-4 border-slate-200 border-t-indigo-600 rounded-full animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16">
          <GraduationCap className="w-12 h-12 text-slate-300 mx-auto mb-3" />
          <p className="text-slate-500">No se encontraron capacitaciones</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(t => {
            const emp = employeeMap[t.employee_id];
            return (
              <Card key={t.id} className="hover:shadow-sm transition-shadow">
                <CardContent className="p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-indigo-50">
                      <GraduationCap className="w-4 h-4 text-indigo-600" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-slate-900">{t.course_name}</p>
                      <p className="text-xs text-slate-500">
                        {emp ? (
                          <Link to={`/EmployeeProfile?id=${emp.id}`} className="text-indigo-600 hover:underline">{emp.full_name}</Link>
                        ) : 'Funcionario desconocido'} — {t.institution || 'Sin institución'} — {t.completion_date || 'Sin fecha'}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge variant="outline">{t.hours}h</Badge>
                    <Badge variant="outline">Nota {t.grade}</Badge>
                    <Badge variant="outline">{t.technical_level}</Badge>
                    <Badge className="bg-indigo-100 text-indigo-700">{t.calculated_points?.toFixed(0)} pts</Badge>
                    <Badge className={`${statusColors[t.status]} flex items-center gap-1`}>
                      {statusIcons[t.status]} {t.status}
                    </Badge>
                    {t.certificate_url && (
                      <a href={t.certificate_url} target="_blank" rel="noopener noreferrer" className="text-indigo-600 text-xs hover:underline">PDF</a>
                    )}
                    {t.is_locked && <Lock className="w-3.5 h-3.5 text-slate-400" />}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}