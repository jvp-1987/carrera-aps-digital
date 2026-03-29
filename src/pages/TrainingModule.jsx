import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { GraduationCap, Search, Lock, CheckCircle2, Clock as ClockIcon, XCircle, Plus, Upload } from 'lucide-react';
import { isAnnualClosurePeriod, calculateTrainingPoints, getMaxTrainingPoints } from '@/components/calculations';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';

const EMPTY_FORM = {
  employee_id: '', course_name: '', institution: '', hours: '', grade: '',
  technical_level: 'Básico', completion_date: '', status: 'Pendiente',
  certificate_url: '', calculated_points: '',
};

export default function TrainingModule() {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [uploading, setUploading] = useState(false);
  const isClosed = isAnnualClosurePeriod();
  const queryClient = useQueryClient();

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

  const createTraining = useMutation({
    mutationFn: async (data) => {
      const training = await base44.entities.Training.create(data);
      // If validated, update employee points
      if (data.status === 'Validado') {
        await syncEmployeePoints(data.employee_id);
      }
      return training;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['all-trainings'] });
      setShowForm(false);
      setForm(EMPTY_FORM);
      toast.success('Capacitación registrada correctamente');
    },
  });

  const syncEmployeePoints = async (employeeId) => {
    const allTrainings = await base44.entities.Training.filter({ employee_id: employeeId, status: 'Validado' });
    const totalTrainingPoints = allTrainings.reduce((s, t) => s + (t.calculated_points || 0), 0);
    const emp = await base44.entities.Employee.filter({ id: employeeId }).then(r => r[0]);
    if (emp) {
      const maxPts = getMaxTrainingPoints(emp.category, emp.total_experience_days || 0);
      const cappedPoints = Math.min(totalTrainingPoints, maxPts);
      const totalPoints = (emp.bienio_points || 0) + cappedPoints;
      await base44.entities.Employee.update(employeeId, { training_points: cappedPoints, total_points: totalPoints });
      queryClient.invalidateQueries({ queryKey: ['employees'] });
    }
  };

  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setUploading(true);
    const { file_url } = await base44.integrations.Core.UploadFile({ file });
    setForm(f => ({ ...f, certificate_url: file_url }));
    setUploading(false);
  };

  const handleFormChange = (field, value) => {
    const updated = { ...form, [field]: value };
    // Auto-calculate points when hours, grade or level change
    if (['hours', 'grade', 'technical_level'].includes(field)) {
      const h = parseFloat(field === 'hours' ? value : updated.hours);
      const g = parseFloat(field === 'grade' ? value : updated.grade);
      const lvl = field === 'technical_level' ? value : updated.technical_level;
      if (h > 0 && g > 0) {
        updated.calculated_points = calculateTrainingPoints(h, g, lvl);
      }
    }
    setForm(updated);
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!form.employee_id || !form.course_name || !form.hours || !form.grade) {
      toast.error('Completa los campos obligatorios');
      return;
    }
    createTraining.mutate({
      ...form,
      hours: parseFloat(form.hours),
      grade: parseFloat(form.grade),
      calculated_points: parseFloat(form.calculated_points) || 0,
    });
  };

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
      <div className="mb-6 flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Módulo de Capacitación</h1>
          <p className="text-slate-500 text-sm mt-1">Gestión y validación de capacitaciones — Ley 19.378</p>
        </div>
        <Button onClick={() => setShowForm(true)} className="flex items-center gap-2">
          <Plus className="w-4 h-4" /> Nueva Capacitación
        </Button>
      </div>

      {/* Dialog Nueva Capacitación */}
      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Registrar Nueva Capacitación</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4 pt-2">
            <div>
              <Label>Funcionario *</Label>
              <Select value={form.employee_id} onValueChange={v => handleFormChange('employee_id', v)}>
                <SelectTrigger><SelectValue placeholder="Seleccionar funcionario..." /></SelectTrigger>
                <SelectContent>
                  {employees.sort((a,b) => a.full_name.localeCompare(b.full_name)).map(e => (
                    <SelectItem key={e.id} value={e.id}>{e.full_name} — Cat. {e.category}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Nombre del Curso *</Label>
              <Input value={form.course_name} onChange={e => handleFormChange('course_name', e.target.value)} placeholder="Ej: Atención Primaria de Salud" />
            </div>
            <div>
              <Label>Institución</Label>
              <Input value={form.institution} onChange={e => handleFormChange('institution', e.target.value)} placeholder="Ej: MINSAL, CESFAM, etc." />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Horas Pedagógicas *</Label>
                <Input type="number" min="1" value={form.hours} onChange={e => handleFormChange('hours', e.target.value)} placeholder="Ej: 40" />
              </div>
              <div>
                <Label>Nota (1.0–7.0) *</Label>
                <Input type="number" min="1" max="7" step="0.1" value={form.grade} onChange={e => handleFormChange('grade', e.target.value)} placeholder="Ej: 6.5" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Nivel Técnico</Label>
                <Select value={form.technical_level} onValueChange={v => handleFormChange('technical_level', v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Básico">Básico (×1.0)</SelectItem>
                    <SelectItem value="Intermedio">Intermedio (×1.1)</SelectItem>
                    <SelectItem value="Avanzado">Avanzado (×1.2)</SelectItem>
                    <SelectItem value="Postgrado">Postgrado (×1.2)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Fecha de Término</Label>
                <Input type="date" value={form.completion_date} onChange={e => handleFormChange('completion_date', e.target.value)} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Estado</Label>
                <Select value={form.status} onValueChange={v => handleFormChange('status', v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Pendiente">Pendiente</SelectItem>
                    <SelectItem value="Validado">Validado</SelectItem>
                    <SelectItem value="Rechazado">Rechazado</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Puntaje Calculado</Label>
                <Input type="number" step="0.01" value={form.calculated_points} onChange={e => handleFormChange('calculated_points', e.target.value)} placeholder="Auto-calculado" />
              </div>
            </div>
            <div>
              <Label>Documento Respaldatorio</Label>
              <div className="flex items-center gap-2 mt-1">
                <label className="flex items-center gap-2 cursor-pointer px-3 py-2 border rounded-md text-sm hover:bg-slate-50 flex-1 justify-center">
                  <Upload className="w-4 h-4" />
                  {uploading ? 'Subiendo...' : form.certificate_url ? 'Documento cargado ✓' : 'Subir PDF'}
                  <input type="file" accept=".pdf,.jpg,.png" className="hidden" onChange={handleFileUpload} disabled={uploading} />
                </label>
                {form.certificate_url && (
                  <a href={form.certificate_url} target="_blank" rel="noopener noreferrer" className="text-indigo-600 text-xs hover:underline">Ver</a>
                )}
              </div>
            </div>
            {form.calculated_points > 0 && (
              <div className="p-3 bg-indigo-50 border border-indigo-200 rounded-lg text-sm text-indigo-800">
                📊 Puntaje estimado: <strong>{form.calculated_points} pts</strong>
                {form.status === 'Validado' && ' — Se sumará automáticamente al funcionario al guardar.'}
              </div>
            )}
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => setShowForm(false)}>Cancelar</Button>
              <Button type="submit" disabled={createTraining.isPending}>
                {createTraining.isPending ? 'Guardando...' : 'Registrar Capacitación'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

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