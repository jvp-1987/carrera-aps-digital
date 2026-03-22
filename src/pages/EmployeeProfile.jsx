import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ArrowLeft, User, Briefcase, GraduationCap, FileText, Star, Clock, AlertTriangle, DollarSign, TrendingUp, Pencil, Check, X, Umbrella, Shield, Zap, Award, BookOpen, Calendar } from 'lucide-react';
import { checkPromotion, calculateTrainingGap, LEVEL_RANGES_AB, LEVEL_RANGES_CF } from '@/components/calculations';
import { useState } from 'react';
import { toast } from 'sonner';
import ExperienceTab from '@/components/profile/ExperienceTab';
import TrainingTab from '@/components/profile/TrainingTab';
import ResolutionsTab from '@/components/profile/ResolutionsTab';
import EvaluationsTab from '@/components/profile/EvaluationsTab';
import LeaveTab from '@/components/profile/LeaveTab';
import DemeritTab from '@/components/profile/DemeritTab';
import SalarialTab from '@/components/profile/SalarialTab';
import CareerTimelineTab from '@/components/profile/CareerTimelineTab';
import HojaVidaPDF from '@/components/profile/HojaVidaPDF';
import VacacionesTab from '@/components/profile/VacacionesTab';
import SumariosTab from '@/components/profile/SumariosTab';

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
  const queryClient = useQueryClient();
  const urlParams = new URLSearchParams(window.location.search);
  const employeeId = urlParams.get('id');
  const [editingLevel, setEditingLevel] = useState(false);
  const [levelInput, setLevelInput] = useState('');
  const [editingHeader, setEditingHeader] = useState(false);
  const [headerForm, setHeaderForm] = useState({});

  const { data: employee, isLoading } = useQuery({
    queryKey: ['employee', employeeId],
    queryFn: () => base44.entities.Employee.filter({ id: employeeId }).then(r => r[0]),
    enabled: !!employeeId,
  });

  const updateLevel = useMutation({
    mutationFn: (level) => base44.entities.Employee.update(employeeId, { current_level: level }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['employee', employeeId] });
      setEditingLevel(false);
      toast.success('Nivel actualizado');
    },
  });

  const updateHeader = useMutation({
    mutationFn: (data) => base44.entities.Employee.update(employeeId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['employee', employeeId] });
      setEditingHeader(false);
      toast.success('Datos actualizados');
    },
  });

  const handleLevelSave = () => {
    const val = parseInt(levelInput);
    if (isNaN(val) || val < 1 || val > 15) { toast.error('Nivel debe ser entre 1 y 15'); return; }
    updateLevel.mutate(val);
  };

  const handleHeaderSave = () => {
    const level = parseInt(headerForm.current_level) || employee.current_level;
    if (level < 1 || level > 15) { toast.error('Nivel debe ser entre 1 y 15'); return; }
    updateHeader.mutate({
      rut: headerForm.rut || employee.rut,
      full_name: headerForm.full_name || employee.full_name,
      category: headerForm.category || employee.category,
      current_level: level,
      position: headerForm.position || employee.position,
      bienios_count: parseInt(headerForm.bienios_count) || employee.bienios_count,
      total_points: parseFloat(headerForm.total_points) || employee.total_points,
    });
  };

  const handleEditHeaderOpen = () => {
    setHeaderForm({rut: employee.rut, full_name: employee.full_name, category: employee.category, current_level: employee.current_level, position: employee.position, bienios_count: employee.bienios_count, total_points: employee.total_points});
    setEditingHeader(true);
  };

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

  const promo = checkPromotion(employee.current_level, employee.total_points || 0, employee.category);
  const gap = calculateTrainingGap(employee.current_level, employee.bienio_points || 0, employee.training_points || 0, employee.category);
  const ranges = (employee.category === 'A' || employee.category === 'B') ? LEVEL_RANGES_AB : LEVEL_RANGES_CF;
  const currentRange = ranges[employee.current_level];
  const progressInLevel = currentRange ? Math.min(100, ((employee.total_points || 0) - currentRange.min) / (currentRange.max - currentRange.min + 1) * 100) : 0;

  return (
    <div className="p-6 lg:p-8 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-4">
        <Button variant="ghost" onClick={() => navigate('/Employees')} className="text-slate-600">
          <ArrowLeft className="w-4 h-4 mr-2" /> Volver a Funcionarios
        </Button>
        <HojaVidaPDF employee={employee} />
      </div>

      {/* Header */}
      <Card className="mb-6">
        <CardContent className="p-6">
          <div className="flex flex-col sm:flex-row items-start gap-5">
            <div className="w-16 h-16 rounded-2xl bg-indigo-100 flex items-center justify-center text-indigo-700 font-bold text-xl flex-shrink-0">
              {employee.full_name?.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              {editingHeader ? (
                <div className="space-y-3 p-4 bg-slate-50 rounded-lg border border-slate-200">
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <div>
                      <label className="text-xs font-medium text-slate-600">RUT</label>
                      <Input value={headerForm.rut || employee.rut} onChange={e => setHeaderForm({...headerForm, rut: e.target.value})} className="text-sm h-8" />
                    </div>
                    <div>
                      <label className="text-xs font-medium text-slate-600">Nombre</label>
                      <Input value={headerForm.full_name || employee.full_name} onChange={e => setHeaderForm({...headerForm, full_name: e.target.value})} className="text-sm h-8" />
                    </div>
                    <div>
                      <label className="text-xs font-medium text-slate-600">Categoría</label>
                      <select value={headerForm.category || employee.category} onChange={e => setHeaderForm({...headerForm, category: e.target.value})} className="h-8 px-2 text-sm border border-slate-300 rounded-md bg-white">
                        {['A', 'B', 'C', 'D', 'E', 'F'].map(c => <option key={c} value={c}>{c}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="text-xs font-medium text-slate-600">Nivel</label>
                      <Input type="number" min={1} max={15} value={headerForm.current_level || employee.current_level} onChange={e => setHeaderForm({...headerForm, current_level: e.target.value})} className="text-sm h-8" />
                    </div>
                    <div>
                      <label className="text-xs font-medium text-slate-600">Cargo</label>
                      <Input value={headerForm.position || employee.position} onChange={e => setHeaderForm({...headerForm, position: e.target.value})} className="text-sm h-8" />
                    </div>
                    <div>
                      <label className="text-xs font-medium text-slate-600">Bienios</label>
                      <Input type="number" value={headerForm.bienios_count || employee.bienios_count} onChange={e => setHeaderForm({...headerForm, bienios_count: e.target.value})} className="text-sm h-8" />
                    </div>
                    <div>
                      <label className="text-xs font-medium text-slate-600">Pts. Total</label>
                      <Input type="number" step="0.1" value={headerForm.total_points || employee.total_points} onChange={e => setHeaderForm({...headerForm, total_points: e.target.value})} className="text-sm h-8" />
                    </div>
                  </div>
                  <div className="flex gap-2 pt-2">
                    <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700" onClick={handleHeaderSave} disabled={updateHeader.isPending}>
                      <Check className="w-3.5 h-3.5 mr-1" /> Guardar
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => setEditingHeader(false)}>
                      <X className="w-3.5 h-3.5 mr-1" /> Cancelar
                    </Button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="flex items-center gap-3 flex-wrap">
                    <h1 className="text-xl font-bold text-slate-900">{employee.full_name}</h1>
                    <Badge className={categoryColors[employee.category]}>Cat. {employee.category}</Badge>
                    <Badge variant="outline">Nivel {employee.current_level}</Badge>
                    <Badge className={employee.status === 'Activo' ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}>
                      {employee.status}
                    </Badge>
                    <Button size="icon" variant="ghost" className="h-6 w-6 text-slate-400 hover:text-indigo-600" onClick={handleEditHeaderOpen}>
                      <Pencil className="w-3 h-3" />
                    </Button>
                  </div>
                  <p className="text-sm text-slate-500 mt-1">
                    {employee.rut} — {employee.position || 'Sin cargo'} — {employee.department || 'Sin departamento'}
                  </p>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Contrato: {employee.contract_type || '—'} · Ingreso: {employee.hire_date || '—'}
                  </p>
                </>
              )}
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
          <TabsTrigger value="demerits" className="gap-1.5"><AlertTriangle className="w-4 h-4" /> Demérito</TabsTrigger>
          <TabsTrigger value="salarial" className="gap-1.5"><DollarSign className="w-4 h-4" /> Remuneraciones</TabsTrigger>
          <TabsTrigger value="career" className="gap-1.5"><TrendingUp className="w-4 h-4" /> Línea de Carrera</TabsTrigger>
          <TabsTrigger value="vacaciones" className="gap-1.5"><Umbrella className="w-4 h-4" /> Vacaciones</TabsTrigger>
          <TabsTrigger value="sumarios" className="gap-1.5"><Shield className="w-4 h-4" /> Sumarios</TabsTrigger>
        </TabsList>
        <TabsContent value="experience"><ExperienceTab employee={employee} /></TabsContent>
        <TabsContent value="training"><TrainingTab employee={employee} /></TabsContent>
        <TabsContent value="leaves"><LeaveTab employee={employee} /></TabsContent>
        <TabsContent value="resolutions"><ResolutionsTab employee={employee} /></TabsContent>
        <TabsContent value="evaluations"><EvaluationsTab employee={employee} /></TabsContent>
        <TabsContent value="demerits"><DemeritTab employee={employee} /></TabsContent>
        <TabsContent value="salarial"><SalarialTab employee={employee} /></TabsContent>
        <TabsContent value="career"><CareerTimelineTab employee={employee} /></TabsContent>
        <TabsContent value="vacaciones"><VacacionesTab employee={employee} /></TabsContent>
        <TabsContent value="sumarios"><SumariosTab employee={employee} /></TabsContent>
      </Tabs>
    </div>
  );
}