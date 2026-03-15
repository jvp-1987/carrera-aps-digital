import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { AlertTriangle, CheckCircle, FileText, Plus, TrendingUp, FileUp, Calendar, Clock } from 'lucide-react';
import { toast } from 'sonner';
import { LEVEL_RANGES_AB, LEVEL_RANGES_CF } from '@/components/calculations';

// Puntaje mínimo para acceder al nivel siguiente (primer rango de cada tabla)
function getMinPointsForLevel(category, level) {
  const ranges = (category === 'A' || category === 'B') ? LEVEL_RANGES_AB : LEVEL_RANGES_CF;
  return ranges[level]?.min ?? null;
}

const MOTIVOS = [
  'Cumplimiento de Bienio con Puntaje de Capacitación Validado',
  'Cumplimiento de Puntaje Mínimo por Bienios',
  'Cumplimiento de Puntaje Total (Bienios + Capacitación)',
  'Ascenso por Evaluación de Desempeño',
  'Reconocimiento de Periodos Anteriores',
  'Resolución de Nivelación de Escalafón',
  'Otro',
];

function daysBetween(d1, d2) {
  if (!d1 || !d2) return null;
  return Math.round((new Date(d2) - new Date(d1)) / (1000 * 60 * 60 * 24));
}

function fmt(n) {
  if (n == null) return '—';
  return new Intl.NumberFormat('es-CL').format(n);
}

const EMPTY_FORM = {
  resolution_number: '',
  resolution_date: '',
  effective_date: '',
  previous_level: '',
  new_level: '',
  motive: '',
  net_seniority_days: '',
  description: '',
};

export default function CareerTimelineTab({ employee }) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [file, setFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [validationWarning, setValidationWarning] = useState(null);

  // Fetch only "Cambio de Nivel" resolutions
  const { data: allResolutions = [], isLoading } = useQuery({
    queryKey: ['resolutions', employee.id],
    queryFn: () => base44.entities.Resolution.filter({ employee_id: employee.id }, '-resolution_date'),
    enabled: !!employee.id,
  });

  const { data: leaves = [] } = useQuery({
    queryKey: ['leaves', employee.id],
    queryFn: () => base44.entities.LeaveWithoutPay.filter({ employee_id: employee.id }),
    enabled: !!employee.id,
  });

  const promotions = useMemo(
    () => allResolutions.filter(r => r.type === 'Cambio de Nivel').sort((a, b) => new Date(a.resolution_date) - new Date(b.resolution_date)),
    [allResolutions]
  );

  const totalLeaveDays = useMemo(
    () => leaves.reduce((s, l) => s + (l.days_count || 0), 0),
    [leaves]
  );

  const createMutation = useMutation({
    mutationFn: async ({ formData, fileUrl }) => {
      await base44.entities.Resolution.create({
        employee_id: employee.id,
        type: 'Cambio de Nivel',
        resolution_number: formData.resolution_number,
        resolution_date: formData.resolution_date,
        description: `[Vigencia: ${formData.effective_date}] [Motivo: ${formData.motive}] [Ant. Neta: ${formData.net_seniority_days} días] ${formData.description}`,
        previous_level: parseInt(formData.previous_level),
        new_level: parseInt(formData.new_level),
        file_url: fileUrl || undefined,
      });
      // Update employee current level
      await base44.entities.Employee.update(employee.id, {
        current_level: parseInt(formData.new_level),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['resolutions', employee.id] });
      queryClient.invalidateQueries({ queryKey: ['employee', employee.id] });
      toast.success('Ascenso registrado en la línea de tiempo');
      setOpen(false);
      setForm(EMPTY_FORM);
      setFile(null);
      setValidationWarning(null);
    },
  });

  // Validate points when new level changes
  const handleNewLevelChange = (val) => {
    setForm(f => ({ ...f, new_level: val }));
    const targetLevel = parseInt(val);
    if (!targetLevel || !employee.category) return;
    const minPts = getMinPointsForLevel(employee.category, targetLevel);
    const totalPts = employee.total_points || 0;
    if (minPts !== null && totalPts < minPts) {
      setValidationWarning(
        `El funcionario tiene ${fmt(totalPts)} pts. El Nivel ${targetLevel} requiere mínimo ${fmt(minPts)} pts. Verifique la consistencia antes de continuar.`
      );
    } else {
      setValidationWarning(null);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.resolution_number || !form.resolution_date || !form.new_level || !form.previous_level) {
      toast.error('Complete todos los campos obligatorios.');
      return;
    }
    if (!file) {
      toast.error('Debe adjuntar el PDF de la resolución. No se permite cambio de nivel sin respaldo legal.');
      return;
    }
    setUploading(true);
    const { file_url } = await base44.integrations.Core.UploadFile({ file });
    setUploading(false);
    createMutation.mutate({ formData: form, fileUrl: file_url });
  };

  // Retroactivity: days between effective_date and resolution_date
  const retroDays = form.resolution_date && form.effective_date
    ? daysBetween(form.effective_date, form.resolution_date)
    : null;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-semibold text-slate-800">Línea de Tiempo de Carrera</h3>
          <p className="text-xs text-slate-400 mt-0.5">Historial cronológico de ascensos vinculados a resoluciones administrativas</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm" className="bg-indigo-600 hover:bg-indigo-700">
              <Plus className="w-4 h-4 mr-1" /> Registrar Ascenso
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <TrendingUp className="w-5 h-5 text-indigo-600" />
                Nuevo Hito de Ascenso
              </DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4 mt-2">
              {/* Validation warning */}
              {validationWarning && (
                <div className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg">
                  <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
                  <p className="text-xs text-amber-700">{validationWarning}</p>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Nivel Anterior *</Label>
                  <Input type="number" min={1} max={15} className="mt-1"
                    value={form.previous_level}
                    onChange={e => setForm(f => ({ ...f, previous_level: e.target.value }))} />
                </div>
                <div>
                  <Label>Nuevo Nivel *</Label>
                  <Input type="number" min={1} max={15} className="mt-1"
                    value={form.new_level}
                    onChange={e => handleNewLevelChange(e.target.value)} />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>N° Resolución *</Label>
                  <Input className="mt-1" placeholder="Ej: 1234/2026"
                    value={form.resolution_number}
                    onChange={e => setForm(f => ({ ...f, resolution_number: e.target.value }))} />
                </div>
                <div>
                  <Label>Fecha de Resolución *</Label>
                  <Input type="date" className="mt-1"
                    value={form.resolution_date}
                    onChange={e => setForm(f => ({ ...f, resolution_date: e.target.value }))} />
                </div>
              </div>

              <div>
                <Label>Fecha de Vigencia *</Label>
                <Input type="date" className="mt-1"
                  value={form.effective_date}
                  onChange={e => setForm(f => ({ ...f, effective_date: e.target.value }))} />
                {retroDays !== null && retroDays > 0 && (
                  <p className="text-xs text-amber-600 mt-1 flex items-center gap-1">
                    <Clock className="w-3 h-3" /> Retroactividad: {retroDays} día(s) entre vigencia y resolución.
                  </p>
                )}
              </div>

              <div>
                <Label>Motivo del Ascenso *</Label>
                <Select value={form.motive} onValueChange={v => setForm(f => ({ ...f, motive: v }))}>
                  <SelectTrigger className="mt-1"><SelectValue placeholder="Seleccionar motivo" /></SelectTrigger>
                  <SelectContent>
                    {MOTIVOS.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label>Antigüedad Neta al Ascenso (días)</Label>
                <Input type="number" className="mt-1" placeholder={`Ant. acumulada total menos permisos sin goce (ref: ${employee.total_experience_days || 0} - ${totalLeaveDays} = ${(employee.total_experience_days || 0) - totalLeaveDays} días)`}
                  value={form.net_seniority_days}
                  onChange={e => setForm(f => ({ ...f, net_seniority_days: e.target.value }))} />
                <p className="text-xs text-slate-400 mt-0.5">
                  Referencia automática: {fmt((employee.total_experience_days || 0) - totalLeaveDays)} días netos actuales
                </p>
              </div>

              <div>
                <Label>Observaciones</Label>
                <Textarea rows={2} className="mt-1" placeholder="Observaciones adicionales..."
                  value={form.description}
                  onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
              </div>

              <div>
                <Label>Resolución PDF * (obligatorio)</Label>
                <label className="flex items-center gap-2 px-4 py-3 border-2 border-dashed border-slate-300 rounded-lg cursor-pointer hover:border-indigo-400 transition-colors mt-1">
                  <FileUp className="w-4 h-4 text-slate-400" />
                  <span className="text-sm text-slate-500">
                    {uploading ? 'Subiendo...' : file ? `✓ ${file.name}` : 'Adjuntar PDF de resolución'}
                  </span>
                  <input type="file" accept=".pdf" className="hidden"
                    onChange={e => setFile(e.target.files?.[0] || null)} />
                </label>
              </div>

              <div className="flex gap-2 justify-end pt-2">
                <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
                <Button type="submit" className="bg-indigo-600 hover:bg-indigo-700"
                  disabled={createMutation.isPending || uploading}>
                  {createMutation.isPending || uploading ? 'Guardando...' : 'Registrar Hito'}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Summary bar */}
      <div className="grid grid-cols-3 gap-3">
        <Card className="bg-indigo-50 border-indigo-100">
          <CardContent className="p-3 text-center">
            <p className="text-xs text-indigo-400 font-semibold uppercase tracking-wider">Ascensos</p>
            <p className="text-2xl font-bold text-indigo-700 mt-0.5">{promotions.length}</p>
          </CardContent>
        </Card>
        <Card className="bg-slate-50">
          <CardContent className="p-3 text-center">
            <p className="text-xs text-slate-400 font-semibold uppercase tracking-wider">Nivel Actual</p>
            <p className="text-2xl font-bold text-slate-800 mt-0.5">{employee.current_level ?? '—'}</p>
          </CardContent>
        </Card>
        <Card className="bg-emerald-50 border-emerald-100">
          <CardContent className="p-3 text-center">
            <p className="text-xs text-emerald-500 font-semibold uppercase tracking-wider">Ant. Neta</p>
            <p className="text-2xl font-bold text-emerald-700 mt-0.5">{fmt((employee.total_experience_days || 0) - totalLeaveDays)}</p>
            <p className="text-xs text-emerald-400">días</p>
          </CardContent>
        </Card>
      </div>

      {/* Timeline */}
      {isLoading ? (
        <div className="flex justify-center py-10">
          <div className="w-6 h-6 border-4 border-slate-200 border-t-indigo-500 rounded-full animate-spin" />
        </div>
      ) : promotions.length === 0 ? (
        <div className="text-center py-12 text-slate-400">
          <TrendingUp className="w-8 h-8 mx-auto mb-2 opacity-30" />
          <p className="text-sm">Sin ascensos registrados</p>
          <p className="text-xs mt-1">Registre el primer hito usando el botón superior</p>
        </div>
      ) : (
        <div className="relative">
          {/* Vertical line */}
          <div className="absolute left-5 top-0 bottom-0 w-0.5 bg-indigo-100" />
          <div className="space-y-4">
            {promotions.map((p, i) => {
              const isLast = i === promotions.length - 1;
              // Parse metadata from description
              const vigenciaMatch = p.description?.match(/\[Vigencia: ([^\]]+)\]/);
              const motivoMatch = p.description?.match(/\[Motivo: ([^\]]+)\]/);
              const antMatch = p.description?.match(/\[Ant\. Neta: ([^\]]+) días\]/);
              const vigencia = vigenciaMatch?.[1];
              const motivo = motivoMatch?.[1];
              const antDias = antMatch?.[1];
              const retroDaysDisplay = vigencia && p.resolution_date ? daysBetween(vigencia, p.resolution_date) : null;

              return (
                <div key={p.id} className="flex gap-4 pl-2">
                  {/* Node */}
                  <div className={`relative z-10 flex-shrink-0 w-6 h-6 rounded-full border-2 flex items-center justify-center mt-1 ${isLast ? 'bg-indigo-600 border-indigo-600' : 'bg-white border-indigo-300'}`}>
                    <div className={`w-2 h-2 rounded-full ${isLast ? 'bg-white' : 'bg-indigo-400'}`} />
                  </div>

                  <Card className={`flex-1 ${isLast ? 'border-indigo-200 bg-indigo-50' : ''}`}>
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between gap-2 flex-wrap">
                        <div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-semibold text-slate-800">
                              Ascenso Nivel {p.previous_level} → Nivel {p.new_level}
                            </span>
                            {isLast && <Badge className="bg-indigo-600 text-white text-xs">Más reciente</Badge>}
                          </div>
                          <p className="text-xs text-slate-500 mt-0.5 flex items-center gap-1">
                            <Calendar className="w-3 h-3" />
                            Resolución: {p.resolution_date}
                            {vigencia && vigencia !== p.resolution_date && (
                              <span className="ml-2">· Vigencia: {vigencia}</span>
                            )}
                          </p>
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          {p.file_url ? (
                            <a href={p.file_url} target="_blank" rel="noopener noreferrer"
                              className="flex items-center gap-1 text-xs text-indigo-600 hover:text-indigo-800 border border-indigo-200 rounded px-2 py-1 bg-white hover:bg-indigo-50 transition-colors">
                              <FileText className="w-3 h-3" /> Ver PDF
                            </a>
                          ) : (
                            <span className="flex items-center gap-1 text-xs text-red-400 border border-red-200 rounded px-2 py-1 bg-red-50">
                              <AlertTriangle className="w-3 h-3" /> Sin PDF
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-3">
                        <div className="bg-white rounded-lg p-2 border text-center">
                          <p className="text-xs text-slate-400">N° Resolución</p>
                          <p className="text-xs font-semibold text-slate-700 mt-0.5">{p.resolution_number}</p>
                        </div>
                        {motivo && (
                          <div className="bg-white rounded-lg p-2 border col-span-2">
                            <p className="text-xs text-slate-400">Motivo</p>
                            <p className="text-xs font-medium text-slate-700 mt-0.5 leading-snug">{motivo}</p>
                          </div>
                        )}
                        {antDias && (
                          <div className="bg-white rounded-lg p-2 border text-center">
                            <p className="text-xs text-slate-400">Ant. Neta</p>
                            <p className="text-xs font-semibold text-slate-700 mt-0.5">{fmt(parseInt(antDias))} días</p>
                          </div>
                        )}
                      </div>

                      {retroDaysDisplay !== null && retroDaysDisplay > 0 && (
                        <div className="mt-2 flex items-center gap-1.5 text-xs text-amber-600">
                          <Clock className="w-3 h-3" />
                          Retroactividad: {retroDaysDisplay} día(s) — la resolución se emitió después de la fecha de vigencia.
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Legal note */}
      <div className="flex items-center gap-2 text-xs text-slate-400 pt-2 border-t">
        <CheckCircle className="w-3.5 h-3.5 text-emerald-500 flex-shrink-0" />
        El nivel del funcionario solo puede ser modificado mediante una resolución de ascenso con PDF adjunto en este módulo.
      </div>
    </div>
  );
}