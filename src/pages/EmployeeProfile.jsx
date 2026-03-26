import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ArrowLeft, User, Briefcase, GraduationCap, FileText, Star, Clock, AlertTriangle, DollarSign, TrendingUp, Pencil, Check, X, Umbrella, Shield, Zap, Award, BookOpen, Calendar, UserCircle2 } from 'lucide-react';
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
      status: headerForm.status || employee.status,
      contract_end_date: headerForm.contract_end_date !== undefined ? headerForm.contract_end_date : employee.contract_end_date,
    });
  };

  const handleEditHeaderOpen = () => {
    setHeaderForm({rut: employee.rut, full_name: employee.full_name, category: employee.category, current_level: employee.current_level, position: employee.position, bienios_count: employee.bienios_count, total_points: employee.total_points, status: employee.status, contract_end_date: employee.contract_end_date || ''});
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

      {/* Header Hero */}
      <div className="mb-6 bg-gradient-to-br from-indigo-600 via-blue-600 to-purple-600 rounded-xl overflow-hidden text-white shadow-lg">
        <div className="p-6 md:p-8">
          {editingHeader ? (
            <div className="space-y-3">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div>
                  <label className="text-xs font-medium text-indigo-100">RUT</label>
                  <Input value={headerForm.rut || employee.rut} onChange={e => setHeaderForm({...headerForm, rut: e.target.value})} className="text-sm h-8 mt-1" />
                </div>
                <div>
                  <label className="text-xs font-medium text-indigo-100">Nombre</label>
                  <Input value={headerForm.full_name || employee.full_name} onChange={e => setHeaderForm({...headerForm, full_name: e.target.value})} className="text-sm h-8 mt-1" />
                </div>
                <div>
                  <label className="text-xs font-medium text-indigo-100">Categoría</label>
                  <select value={headerForm.category || employee.category} onChange={e => setHeaderForm({...headerForm, category: e.target.value})} className="h-8 px-2 text-sm border border-indigo-300 rounded-md bg-indigo-50 text-slate-900 mt-1">
                    {['A', 'B', 'C', 'D', 'E', 'F'].map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-medium text-indigo-100">Nivel</label>
                  <Input type="number" min={1} max={15} value={headerForm.current_level || employee.current_level} onChange={e => setHeaderForm({...headerForm, current_level: e.target.value})} className="text-sm h-8 mt-1" />
                </div>
                <div>
                  <label className="text-xs font-medium text-indigo-100">Cargo</label>
                  <Input value={headerForm.position || employee.position} onChange={e => setHeaderForm({...headerForm, position: e.target.value})} className="text-sm h-8 mt-1" />
                </div>
                <div>
                  <label className="text-xs font-medium text-indigo-100">Bienios</label>
                  <Input type="number" value={headerForm.bienios_count || employee.bienios_count} onChange={e => setHeaderForm({...headerForm, bienios_count: e.target.value})} className="text-sm h-8 mt-1" />
                </div>
                <div>
                  <label className="text-xs font-medium text-indigo-100">Pts. Total</label>
                  <Input type="number" step="0.1" value={headerForm.total_points || employee.total_points} onChange={e => setHeaderForm({...headerForm, total_points: e.target.value})} className="text-sm h-8 mt-1" />
                </div>
                <div>
                  <label className="text-xs font-medium text-indigo-100">Estado</label>
                  <select value={headerForm.status || employee.status} onChange={e => setHeaderForm({...headerForm, status: e.target.value})} className="h-8 px-2 text-sm border border-indigo-300 rounded-md bg-indigo-50 text-slate-900 mt-1">
                    <option value="Activo">Activo</option>
                    <option value="Inactivo">Inactivo</option>
                    <option value="Licencia">Licencia</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs font-medium text-indigo-100">Fin Contrato</label>
                  <Input type="date" value={headerForm.contract_end_date || employee.contract_end_date || ''} onChange={e => setHeaderForm({...headerForm, contract_end_date: e.target.value})} className="text-sm h-8 mt-1" />
                </div>
              </div>
              <div className="flex gap-2 pt-3">
                <Button size="sm" className="bg-emerald-500 hover:bg-emerald-600 text-white font-semibold" onClick={handleHeaderSave} disabled={updateHeader.isPending}>
                  <Check className="w-3.5 h-3.5 mr-1" /> Guardar
                </Button>
                <Button size="sm" className="bg-slate-600 hover:bg-slate-700 text-white font-semibold" onClick={() => setEditingHeader(false)}>
                  <X className="w-3.5 h-3.5 mr-1" /> Cancelar
                </Button>
              </div>
            </div>
          ) : (
            <>
              <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
                <div className="flex items-end gap-4">
                  <div className="w-20 h-20 rounded-2xl bg-white/20 backdrop-blur flex items-center justify-center text-white flex-shrink-0 border border-white/30">
                    <UserCircle2 className="w-12 h-12" />
                  </div>
                  <div>
                    <h1 className="text-3xl font-bold">{employee.full_name}</h1>
                    <p className="text-indigo-100 text-sm mt-1">
                      {employee.rut} • {employee.position || 'Sin cargo'}
                    </p>
                    <p className="text-indigo-200 text-xs mt-1">
                      {employee.department || 'Sin establecimiento'}
                    </p>
                  </div>
                </div>
                <Button size="icon" variant="ghost" className="h-8 w-8 text-white hover:bg-white/20" onClick={handleEditHeaderOpen}>
                  <Pencil className="w-4 h-4" />
                </Button>
              </div>
              <div className="flex items-center gap-2 flex-wrap mt-4">
                <Badge className={categoryColors[employee.category] + ' text-sm font-semibold'}>Cat. {employee.category}</Badge>
                <Badge className="bg-white/20 text-white border-white/30 text-sm font-semibold">Nivel {employee.current_level}</Badge>
                <Badge className={employee.status === 'Activo' ? 'bg-emerald-400 text-emerald-900' : 'bg-red-400 text-red-900'}>
                  {employee.status}
                </Badge>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Metrics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
        <div className="bg-gradient-to-br from-indigo-50 to-indigo-100 rounded-lg p-4 border border-indigo-200">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-semibold text-indigo-600">EXPERIENCIA</p>
            <Zap className="w-4 h-4 text-indigo-500" />
          </div>
          <p className="text-2xl font-bold text-indigo-900">{employee.bienio_points || 0}</p>
          <p className="text-xs text-indigo-600 mt-1">Puntos acumulados</p>
        </div>

        <div className="bg-gradient-to-br from-emerald-50 to-emerald-100 rounded-lg p-4 border border-emerald-200">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-semibold text-emerald-600">CAPACITACIÓN</p>
            <BookOpen className="w-4 h-4 text-emerald-500" />
          </div>
          <p className="text-2xl font-bold text-emerald-900">{employee.training_points || 0}</p>
          <p className="text-xs text-emerald-600 mt-1">Puntos de cursos</p>
        </div>

        <div className="bg-gradient-to-br from-violet-50 to-violet-100 rounded-lg p-4 border border-violet-200">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-semibold text-violet-600">TOTAL</p>
            <Award className="w-4 h-4 text-violet-500" />
          </div>
          <p className="text-2xl font-bold text-violet-900">{employee.total_points || 0}</p>
          <p className="text-xs text-violet-600 mt-1">Puntaje total</p>
        </div>

        <div className="bg-gradient-to-br from-blue-50 to-blue-100 rounded-lg p-4 border border-blue-200">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-semibold text-blue-600">BIENIOS</p>
            <Calendar className="w-4 h-4 text-blue-500" />
          </div>
          <p className="text-2xl font-bold text-blue-900">{employee.bienios_count || 0}</p>
          <p className="text-xs text-blue-600 mt-1">Años reconocidos</p>
        </div>

        <div className="bg-gradient-to-br from-pink-50 to-pink-100 rounded-lg p-4 border border-pink-200">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-semibold text-pink-600">POSTÍTULO</p>
            <GraduationCap className="w-4 h-4 text-pink-500" />
          </div>
          <p className="text-2xl font-bold text-pink-900">{employee.postitle_percentage || 0}%</p>
          <p className="text-xs text-pink-600 mt-1">Asignación</p>
        </div>
      </div>

      {/* Progress Section */}
      <Card className="mb-6 bg-white border-slate-200">
        <CardContent className="p-6">
          <div className="space-y-4">
            <div>
              <div className="flex justify-between items-center mb-2">
                <h3 className="font-semibold text-slate-900">Progreso en Nivel {employee.current_level}</h3>
                <span className="text-sm font-bold text-indigo-600">{Math.round(progressInLevel)}%</span>
              </div>
              <div className="w-full h-3 bg-slate-200 rounded-full overflow-hidden">
                <div className="h-full bg-gradient-to-r from-indigo-500 to-purple-600 rounded-full transition-all" style={{ width: `${Math.min(100, progressInLevel)}%` }} />
              </div>
            </div>

            {/* Alerts */}
            <div className="space-y-3">
              {promo.eligible && (
                <div className="p-4 bg-emerald-50 border border-emerald-300 rounded-lg flex gap-3">
                  <Zap className="w-5 h-5 text-emerald-600 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="font-semibold text-emerald-900">¡Apto para ascenso!</p>
                    <p className="text-sm text-emerald-700 mt-1">Cumple puntaje para ascender a <strong>Nivel {promo.nextLevel}</strong>. Se requiere resolución para formalizar el cambio.</p>
                  </div>
                </div>
              )}
              {gap.gap > 0 && (
                <div className="p-4 bg-blue-50 border border-blue-300 rounded-lg flex gap-3">
                  <BookOpen className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="font-semibold text-blue-900">Brecha de capacitación</p>
                    <p className="text-sm text-blue-700 mt-1">{gap.message}. Necesita <strong>{gap.trainingGap} puntos</strong> adicionales de capacitación.</p>
                  </div>
                </div>
              )}
            </div>
          </div>
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