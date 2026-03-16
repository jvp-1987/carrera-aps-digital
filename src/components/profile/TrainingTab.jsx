import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Plus, GraduationCap, FileUp, Lock, AlertCircle, Pencil, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { calculateTrainingPoints, calculatePostitlePercentage, isAnnualClosurePeriod, getDurationFactor, getGradeFactor, TECHNICAL_LEVEL_FACTOR } from '@/components/calculations';

export default function TrainingTab({ employee }) {
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [form, setForm] = useState({
    course_name: '', institution: '', hours: '', grade: '',
    technical_level: '', completion_date: '', is_postitle: false,
    postitle_hours: 0, certificate_url: '',
  });

  const currentYear = new Date().getFullYear();
  const isClosed = isAnnualClosurePeriod();

  const { data: trainings = [] } = useQuery({
    queryKey: ['trainings', employee.id],
    queryFn: () => base44.entities.Training.filter({ employee_id: employee.id }),
  });

  const validatedTrainings = trainings.filter(t => t.status === 'Validado');
  const totalTrainingPoints = validatedTrainings.reduce((s, t) => s + (t.calculated_points || 0), 0);
  const postitleHours = validatedTrainings.filter(t => t.is_postitle).reduce((s, t) => s + (t.postitle_hours || 0), 0);
  const postitlePct = calculatePostitlePercentage(employee.category, postitleHours);

  const createTraining = useMutation({
    mutationFn: data => base44.entities.Training.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['trainings', employee.id] });
      setShowForm(false);
      setEditingId(null);
      setForm({ course_name: '', institution: '', hours: '', grade: '', technical_level: '', completion_date: '', is_postitle: false, postitle_hours: 0, certificate_url: '' });
      toast.success('Capacitación registrada');
    },
  });

  const updateTraining = useMutation({
    mutationFn: ({ id, data }) => base44.entities.Training.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['trainings', employee.id] });
      setShowForm(false);
      setEditingId(null);
      setForm({ course_name: '', institution: '', hours: '', grade: '', technical_level: '', completion_date: '', is_postitle: false, postitle_hours: 0, certificate_url: '' });
      toast.success('Capacitación actualizada');
    },
  });

  const deleteTraining = useMutation({
    mutationFn: id => base44.entities.Training.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['trainings', employee.id] });
      toast.success('Capacitación eliminada');
    },
  });

  const openEdit = (t) => {
    setEditingId(t.id);
    setForm({
      course_name: t.course_name || '', institution: t.institution || '',
      hours: t.hours || '', grade: t.grade || '', technical_level: t.technical_level || '',
      completion_date: t.completion_date || '', is_postitle: t.is_postitle || false,
      postitle_hours: t.postitle_hours || 0, certificate_url: t.certificate_url || '',
    });
    setShowForm(true);
  };

  const validateTraining = useMutation({
    mutationFn: async (training) => {
      await base44.entities.Training.update(training.id, { status: 'Validado' });
      // Recalcular puntos del empleado
      const allTrainings = await base44.entities.Training.filter({ employee_id: employee.id });
      const validated = allTrainings.filter(t => t.status === 'Validado' || t.id === training.id);
      const totalPts = validated.reduce((s, t) => s + (t.calculated_points || 0), 0);
      const pHours = validated.filter(t => t.is_postitle).reduce((s, t) => s + (t.postitle_hours || 0), 0);
      const pPct = calculatePostitlePercentage(employee.category, pHours);
      await base44.entities.Employee.update(employee.id, {
        training_points: totalPts,
        postitle_percentage: pPct,
        total_points: (employee.bienio_points || 0) + totalPts,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['trainings', employee.id] });
      queryClient.invalidateQueries({ queryKey: ['employee', employee.id] });
      toast.success('Capacitación validada y puntaje actualizado');
    },
  });

  const handleFileUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    const { file_url } = await base44.integrations.Core.UploadFile({ file });
    setForm(p => ({ ...p, certificate_url: file_url }));
    setUploading(false);
    toast.success('Certificado subido');
  };

  const handleSubmit = () => {
    if (!form.certificate_url) {
      toast.error('Debe adjuntar el certificado PDF para habilitar el puntaje');
      return;
    }
    const pts = calculateTrainingPoints(parseFloat(form.hours), parseFloat(form.grade), form.technical_level);
    const payload = {
      ...form,
      employee_id: employee.id,
      hours: parseFloat(form.hours),
      grade: parseFloat(form.grade),
      calculated_points: pts,
      postitle_hours: form.is_postitle ? parseFloat(form.postitle_hours || 0) : 0,
    };
    if (editingId) {
      updateTraining.mutate({ id: editingId, data: payload });
    } else {
      createTraining.mutate({ ...payload, year_period: currentYear, is_locked: isClosed, status: 'Pendiente' });
    }
  };

  const statusColors = {
    Pendiente: 'bg-amber-100 text-amber-700',
    Validado: 'bg-emerald-100 text-emerald-700',
    Rechazado: 'bg-red-100 text-red-700',
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-xs text-slate-400 mb-1">Pts. Capacitación</p>
            <p className="text-2xl font-bold text-indigo-600">{totalTrainingPoints.toFixed(0)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-xs text-slate-400 mb-1">Cursos Validados</p>
            <p className="text-2xl font-bold text-slate-900">{validatedTrainings.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-xs text-slate-400 mb-1">Hrs. Postítulo</p>
            <p className="text-2xl font-bold text-violet-600">{postitleHours}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-xs text-slate-400 mb-1">Asig. Postítulo</p>
            <p className="text-2xl font-bold text-emerald-600">{postitlePct}%</p>
          </CardContent>
        </Card>
      </div>

      {isClosed && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-800 flex items-center gap-2">
          <Lock className="w-4 h-4 flex-shrink-0" />
          Periodo de ingreso cerrado (posterior al 31 de agosto {currentYear}). Los antecedentes ingresados serán para el siguiente periodo.
        </div>
      )}

      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-3">
          <CardTitle className="text-base">Capacitaciones</CardTitle>
          <Dialog open={showForm} onOpenChange={setShowForm}>
            <DialogTrigger asChild>
              <Button size="sm" className="bg-indigo-600 hover:bg-indigo-700">
                <Plus className="w-4 h-4 mr-1" /> Registrar
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg">
              <DialogHeader>
                <DialogTitle>Nueva Capacitación</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 mt-4">
                <div>
                  <Label>Nombre del Curso *</Label>
                  <Input value={form.course_name} onChange={e => setForm(p => ({...p, course_name: e.target.value}))} />
                </div>
                <div>
                  <Label>Institución</Label>
                  <Input value={form.institution} onChange={e => setForm(p => ({...p, institution: e.target.value}))} />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Horas *</Label>
                    <Input type="number" min={1} value={form.hours} onChange={e => setForm(p => ({...p, hours: e.target.value}))} />
                  </div>
                  <div>
                    <Label>Nota (1.0 - 7.0) *</Label>
                    <Input type="number" min={1} max={7} step={0.1} value={form.grade} onChange={e => setForm(p => ({...p, grade: e.target.value}))} />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Nivel Técnico *</Label>
                    <Select value={form.technical_level} onValueChange={v => setForm(p => ({...p, technical_level: v}))}>
                      <SelectTrigger><SelectValue placeholder="Seleccionar" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Bajo">Bajo (×1.0)</SelectItem>
                        <SelectItem value="Medio">Medio (×1.1)</SelectItem>
                        <SelectItem value="Alto">Alto (×1.2)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Fecha Finalización</Label>
                    <Input type="date" value={form.completion_date} onChange={e => setForm(p => ({...p, completion_date: e.target.value}))} />
                  </div>
                </div>
                {(employee.category === 'A' || employee.category === 'B') && (
                  <div className="p-3 bg-violet-50 rounded-lg space-y-2">
                    <label className="flex items-center gap-2 text-sm">
                      <input type="checkbox" checked={form.is_postitle} onChange={e => setForm(p => ({...p, is_postitle: e.target.checked}))} className="rounded" />
                      Es curso de Postgrado / Postítulo
                    </label>
                    {form.is_postitle && (
                      <div>
                        <Label>Horas acreditables postítulo</Label>
                        <Input type="number" value={form.postitle_hours} onChange={e => setForm(p => ({...p, postitle_hours: e.target.value}))} />
                      </div>
                    )}
                  </div>
                )}
                <div>
                  <Label>Certificado PDF *</Label>
                  <div className="mt-1">
                    <label className="flex items-center gap-2 px-4 py-2 border-2 border-dashed border-slate-300 rounded-lg cursor-pointer hover:border-indigo-400 transition-colors">
                      <FileUp className="w-4 h-4 text-slate-400" />
                      <span className="text-sm text-slate-500">
                        {uploading ? 'Subiendo...' : form.certificate_url ? '✓ Certificado cargado' : 'Seleccionar archivo'}
                      </span>
                      <input type="file" accept=".pdf" className="hidden" onChange={handleFileUpload} />
                    </label>
                  </div>
                </div>

                {form.hours && form.grade && form.technical_level && (
                  <div className="p-3 bg-indigo-50 rounded-lg text-sm space-y-1">
                    <p className="font-semibold text-indigo-800">Puntaje estimado (Art. 10°)</p>
                    <p className="text-slate-600">
                      Duración: {getDurationFactor(parseFloat(form.hours))} pts ×
                      Aprobación: ×{getGradeFactor(parseFloat(form.grade))} ×
                      Nivel: ×{TECHNICAL_LEVEL_FACTOR[form.technical_level] || 1.0}
                    </p>
                    <p className="font-bold text-indigo-700 text-base">
                      = {calculateTrainingPoints(parseFloat(form.hours), parseFloat(form.grade), form.technical_level)} puntos
                    </p>
                  </div>
                )}

                <Button onClick={handleSubmit} className="w-full bg-indigo-600 hover:bg-indigo-700" disabled={createTraining.isPending}>
                  {createTraining.isPending ? 'Guardando...' : 'Registrar Capacitación'}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </CardHeader>
        <CardContent>
          {trainings.length === 0 ? (
            <p className="text-sm text-slate-400 text-center py-6">Sin capacitaciones registradas</p>
          ) : (
            <div className="space-y-3">
              {trainings.map(t => (
                <div key={t.id} className="flex items-center justify-between p-3 rounded-lg bg-slate-50 border border-slate-100">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-indigo-100">
                      <GraduationCap className="w-4 h-4 text-indigo-600" />
                    </div>
                    <div>
                      <p className="text-sm font-medium">{t.course_name}</p>
                      <p className="text-xs text-slate-500">{t.hours}h — Nota {t.grade} — {t.technical_level}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge className={statusColors[t.status]}>{t.status}</Badge>
                    <Badge variant="outline">{t.calculated_points?.toFixed(0)} pts</Badge>
                    {t.status === 'Pendiente' && t.certificate_url && (
                      <Button size="sm" variant="outline" className="text-xs" onClick={() => validateTraining.mutate(t)}>
                        Validar
                      </Button>
                    )}
                    {t.certificate_url && (
                      <a href={t.certificate_url} target="_blank" rel="noopener noreferrer" className="text-indigo-600 text-xs hover:underline">
                        PDF
                      </a>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}