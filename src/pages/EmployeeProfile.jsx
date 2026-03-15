import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ArrowLeft, User, Briefcase, GraduationCap, FileText, Star, Clock } from 'lucide-react';
import { checkPromotion, calculateTrainingGap, LEVEL_RANGES } from '@/components/calculations';
import ExperienceTab from '@/components/profile/ExperienceTab';
import TrainingTab from '@/components/profile/TrainingTab';
import ResolutionsTab from '@/components/profile/ResolutionsTab';
import EvaluationsTab from '@/components/profile/EvaluationsTab';
import LeaveTab from '@/components/profile/LeaveTab';

const categoryColors = {
  A: 'bg-violet-100 text-violet-700',
  B: 'bg-blue-100 text-blue-700',
  C: 'bg-teal-100 text-teal-700',
  D: 'bg-cyan-100 text-cyan-700',
  E: 'bg-orange-100 text-orange-700',
  F: 'bg-slate-100 text-slate-700',
};

export default function EmployeeProfile() {
  const navigate = useNavigate();
  const urlParams = new URLSearchParams(window.location.search);
  const employeeId = urlParams.get('id');

  const { data: employee, isLoading } = useQuery({
    queryKey: ['employee', employeeId],
    queryFn: () => base44.entities.Employee.filter({ id: employeeId }).then(r => r[0]),
    enabled: !!employeeId,
  });

  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-full">
        <div className="w-8 h-8 border-4 border-slate-200 border-t-indigo-600 rounded-full animate-spin" />
      </div>
    );
  }

  if (!employee) {
    return (
      <div className="p-8 text-center">
        <p className="text-slate-500">Funcionario no encontrado</p>
        <Button variant="outline" onClick={() => navigate('/Employees')} className="mt-4">Volver</Button>
      </div>
    );
  }

  const promo = checkPromotion(employee.current_level, employee.total_points || 0);
  const gap = calculateTrainingGap(employee.current_level, employee.bienio_points || 0, employee.training_points || 0);
  const currentRange = LEVEL_RANGES[employee.current_level];
  const progressInLevel = currentRange ? Math.min(100, ((employee.total_points || 0) - currentRange.min) / (currentRange.max - currentRange.min + 1) * 100) : 0;

  return (
    <div className="p-6 lg:p-8 max-w-6xl mx-auto">
      <Button variant="ghost" onClick={() => navigate('/Employees')} className="mb-4 text-slate-600">
        <ArrowLeft className="w-4 h-4 mr-2" /> Volver a Funcionarios
      </Button>

      {/* Header */}
      <Card className="mb-6">
        <CardContent className="p-6">
          <div className="flex flex-col sm:flex-row items-start gap-5">
            <div className="w-16 h-16 rounded-2xl bg-indigo-100 flex items-center justify-center text-indigo-700 font-bold text-xl flex-shrink-0">
              {employee.full_name?.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-3 flex-wrap">
                <h1 className="text-xl font-bold text-slate-900">{employee.full_name}</h1>
                <Badge className={categoryColors[employee.category]}>Cat. {employee.category}</Badge>
                <Badge variant="outline">Nivel {employee.current_level}</Badge>
                <Badge className={employee.status === 'Activo' ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}>
                  {employee.status}
                </Badge>
              </div>
              <p className="text-sm text-slate-500 mt-1">
                {employee.rut} — {employee.position || 'Sin cargo'} — {employee.department || 'Sin departamento'}
              </p>
              <p className="text-xs text-slate-400 mt-0.5">
                Contrato: {employee.contract_type || '—'} · Ingreso: {employee.hire_date || '—'}
              </p>
            </div>
          </div>

          {/* Points Summary */}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-4 mt-6 pt-6 border-t">
            <div className="text-center">
              <p className="text-xs text-slate-400">Pts. Experiencia</p>
              <p className="text-lg font-bold text-indigo-600">{employee.bienio_points || 0}</p>
            </div>
            <div className="text-center">
              <p className="text-xs text-slate-400">Pts. Capacitación</p>
              <p className="text-lg font-bold text-emerald-600">{employee.training_points || 0}</p>
            </div>
            <div className="text-center">
              <p className="text-xs text-slate-400">Pts. Total</p>
              <p className="text-lg font-bold text-slate-900">{employee.total_points || 0}</p>
            </div>
            <div className="text-center">
              <p className="text-xs text-slate-400">Bienios</p>
              <p className="text-lg font-bold text-blue-600">{employee.bienios_count || 0}</p>
            </div>
            <div className="text-center">
              <p className="text-xs text-slate-400">Postítulo</p>
              <p className="text-lg font-bold text-violet-600">{employee.postitle_percentage || 0}%</p>
            </div>
          </div>

          {/* Progress bar */}
          <div className="mt-4">
            <div className="flex justify-between text-xs text-slate-400 mb-1">
              <span>Progreso Nivel {employee.current_level}</span>
              <span>{Math.round(progressInLevel)}%</span>
            </div>
            <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
              <div className="h-full bg-indigo-500 rounded-full transition-all" style={{ width: `${Math.min(100, progressInLevel)}%` }} />
            </div>
          </div>

          {/* Alerts */}
          {promo.eligible && (
            <div className="mt-4 p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-sm text-emerald-800">
              ✅ <strong>Cumple puntaje para ascender a Nivel {promo.nextLevel}.</strong> Se requiere resolución para formalizar el cambio.
            </div>
          )}
          {gap.gap > 0 && (
            <div className="mt-2 p-3 bg-blue-50 border border-blue-200 rounded-lg text-sm text-blue-800">
              📊 {gap.message}. Necesita <strong>{gap.trainingGap} puntos</strong> adicionales de capacitación.
            </div>
          )}
        </CardContent>
      </Card>

      {/* Tabs */}
      <Tabs defaultValue="experience">
        <TabsList className="bg-white border mb-4 flex flex-wrap h-auto">
          <TabsTrigger value="experience" className="gap-1.5"><Briefcase className="w-4 h-4" /> Experiencia</TabsTrigger>
          <TabsTrigger value="training" className="gap-1.5"><GraduationCap className="w-4 h-4" /> Capacitación</TabsTrigger>
          <TabsTrigger value="leaves" className="gap-1.5"><Clock className="w-4 h-4" /> Permisos</TabsTrigger>
          <TabsTrigger value="resolutions" className="gap-1.5"><FileText className="w-4 h-4" /> Resoluciones</TabsTrigger>
          <TabsTrigger value="evaluations" className="gap-1.5"><Star className="w-4 h-4" /> Calificaciones</TabsTrigger>
        </TabsList>
        <TabsContent value="experience"><ExperienceTab employee={employee} /></TabsContent>
        <TabsContent value="training"><TrainingTab employee={employee} /></TabsContent>
        <TabsContent value="leaves"><LeaveTab employee={employee} /></TabsContent>
        <TabsContent value="resolutions"><ResolutionsTab employee={employee} /></TabsContent>
        <TabsContent value="evaluations"><EvaluationsTab employee={employee} /></TabsContent>
      </Tabs>
    </div>
  );
}