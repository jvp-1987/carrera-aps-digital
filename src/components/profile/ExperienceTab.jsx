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
import { Plus, Building2, Pencil, Trash2, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';
import { calculateEffectiveDays, calculateBienios, calculateBienioPoints, calculateNextBienioDate, formatDaysToYMD } from '@/components/calculations';

// Detecta si dos periodos se solapan
function periodsOverlap(startA, endA, startB, endB) {
  const a1 = new Date(startA);
  const a2 = endA ? new Date(endA) : new Date('2099-12-31');
  const b1 = new Date(startB);
  const b2 = endB ? new Date(endB) : new Date('2099-12-31');
  return a1 <= b2 && b1 <= a2;
}

// Encuentra solapamientos contra periodos existentes (excluyendo el que se edita)
function findOverlaps(newStart, newEnd, existingPeriods, excludeId = null) {
  return existingPeriods.filter(p => {
    if (p.id === excludeId) return false;
    return periodsOverlap(newStart, newEnd, p.start_date, p.end_date);
  });
}

// Calcula días usando meses de 30 días (para bienio)
function calcDays30(startStr, endStr) {
  const start = new Date(startStr);
  const end = endStr ? new Date(endStr) : new Date();
  const diffMs = end - start;
  return Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)));
}

export default function ExperienceTab({ employee }) {
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState({
    period_type: '', start_date: '', end_date: '', institution: '',
    resolution_number: '', days_count: 0,
  });

  // Estado de solapamiento detectado (pendiente de resolución)
  const [overlapInfo, setOverlapInfo] = useState(null); // { overlappingPeriod, suggestedDate }
  const [overlapDismissed, setOverlapDismissed] = useState(false);

  const { data: periods = [] } = useQuery({
    queryKey: ['service-periods', employee.id],
    queryFn: () => base44.entities.ServicePeriod.filter({ employee_id: employee.id }),
  });

  const { data: leaves = [] } = useQuery({
    queryKey: ['leaves', employee.id],
    queryFn: () => base44.entities.LeaveWithoutPay.filter({ employee_id: employee.id }),
  });

  const totalLeaveDays = leaves.reduce((sum, l) => sum + (l.days_count || 0), 0);
  const effectiveDays = calculateEffectiveDays(periods, totalLeaveDays);
  const bienios = calculateBienios(effectiveDays);
  const bienioPoints = calculateBienioPoints(employee.category, bienios);
  const nextBienioDate = calculateNextBienioDate(periods, totalLeaveDays, bienios);

  const createPeriod = useMutation({
    mutationFn: data => base44.entities.ServicePeriod.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['service-periods', employee.id] });
      recalculate();
      closeForm();
      toast.success('Periodo agregado');
    },
  });

  const updatePeriod = useMutation({
    mutationFn: ({ id, data }) => base44.entities.ServicePeriod.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['service-periods', employee.id] });
      recalculate();
      closeForm();
      toast.success('Periodo actualizado');
    },
  });

  const deletePeriod = useMutation({
    mutationFn: id => base44.entities.ServicePeriod.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['service-periods', employee.id] });
      recalculate();
      toast.success('Periodo eliminado');
    },
  });

  const closeForm = () => {
    setShowForm(false);
    setEditingId(null);
    setOverlapInfo(null);
    setOverlapDismissed(false);
    setForm({ period_type: '', start_date: '', end_date: '', institution: '', resolution_number: '', days_count: 0 });
  };

  const openEdit = (p) => {
    setEditingId(p.id);
    setForm({
      period_type: p.period_type || '', start_date: p.start_date || '',
      end_date: p.end_date || '', institution: p.institution || '',
      resolution_number: p.resolution_number || '', days_count: p.days_count || 0,
    });
    setOverlapInfo(null);
    setOverlapDismissed(false);
    setShowForm(true);
  };

  const recalculate = async () => {
    const allPeriods = await base44.entities.ServicePeriod.filter({ employee_id: employee.id });
    const allLeaves = await base44.entities.LeaveWithoutPay.filter({ employee_id: employee.id });
    const tLeave = allLeaves.reduce((s, l) => s + (l.days_count || 0), 0);
    const eDays = calculateEffectiveDays(allPeriods, tLeave);
    const b = calculateBienios(eDays);
    const bp = calculateBienioPoints(employee.category, b);
    const nbd = calculateNextBienioDate(allPeriods, tLeave, b);
    await base44.entities.Employee.update(employee.id, {
      total_experience_days: eDays,
      total_leave_days: tLeave,
      bienios_count: b,
      bienio_points: bp,
      next_bienio_date: nbd,
      total_points: bp + (employee.training_points || 0),
    });
    queryClient.invalidateQueries({ queryKey: ['employee', employee.id] });
  };

  // Detectar solapamiento al cambiar fecha inicio
  const handleStartDateChange = (newStart) => {
    setForm(p => ({ ...p, start_date: newStart }));
    setOverlapDismissed(false);
    if (!newStart) { setOverlapInfo(null); return; }

    const overlaps = findOverlaps(newStart, form.end_date || null, periods, editingId);
    if (overlaps.length > 0) {
      // Encontrar el que termina más tarde
      const latest = overlaps.reduce((prev, curr) => {
        if (!prev.end_date) return prev;
        if (!curr.end_date) return curr;
        return new Date(curr.end_date) > new Date(prev.end_date) ? curr : prev;
      });
      const latestEnd = latest.end_date;
      let suggested = null;
      if (latestEnd) {
        const d = new Date(latestEnd);
        d.setDate(d.getDate() + 1);
        suggested = d.toISOString().split('T')[0];
      }
      setOverlapInfo({ overlappingPeriod: latest, suggestedDate: suggested });
    } else {
      setOverlapInfo(null);
    }
  };

  // Ajuste automático: mover fecha inicio a D+1 del periodo solapado
  const handleAutoAdjust = () => {
    if (!overlapInfo?.suggestedDate) return;
    setForm(p => ({ ...p, start_date: overlapInfo.suggestedDate }));
    setOverlapInfo(null);
    setOverlapDismissed(true);
    toast.success(`Fecha ajustada a ${overlapInfo.suggestedDate}`);
  };

  const handleSubmit = () => {
    const originalStartDate = form.start_date;
    const wasAdjusted = overlapDismissed; // se ajustó automáticamente
    const start = new Date(form.start_date);
    const end = form.end_date ? new Date(form.end_date) : new Date();
    const days = calcDays30(form.start_date, form.end_date || null);

    // Verificar si aún hay solapamiento activo (no resuelto)
    const overlapsNow = findOverlaps(form.start_date, form.end_date || null, periods, editingId);
    const hasConflict = overlapsNow.length > 0;

    const payload = {
      ...form,
      employee_id: employee.id,
      days_count: days,
      is_active: !form.end_date,
      conflict_status: hasConflict ? 'En Conflicto' : wasAdjusted ? 'Ajustado' : 'Sin Conflicto',
      ajustado_por_solapamiento: wasAdjusted,
      solapamiento_detalle: wasAdjusted
        ? `Fecha original ajustada desde [valor previo] por solapamiento con periodo ${overlapInfo?.overlappingPeriod?.period_type || ''}`
        : hasConflict
        ? `Solapamiento detectado con ${overlapsNow.map(o => o.period_type).join(', ')}`
        : null,
    };

    // Si fue ajustado, guardar fecha original
    if (wasAdjusted) {
      payload.fecha_original = originalStartDate;
    }

    if (editingId) {
      updatePeriod.mutate({ id: editingId, data: payload });
    } else {
      createPeriod.mutate(payload);
    }
  };

  const conflictBadgeStyle = (p) => {
    if (p.conflict_status === 'En Conflicto') return 'bg-red-100 text-red-700 border-red-200';
    if (p.conflict_status === 'Ajustado') return 'bg-amber-100 text-amber-700 border-amber-200';
    return 'bg-slate-100 text-slate-700';
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4 text-center">
            <div className="flex flex-col items-center">
              <p className="text-2xl font-bold text-slate-900">{effectiveDays}</p>
              <p className="text-[10px] text-slate-400 italic mt-0.5 leading-tight px-2">
                {formatDaysToYMD(effectiveDays)}
              </p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-xs text-slate-400 mb-1">Bienios</p>
            <p className="text-2xl font-bold text-indigo-600">{bienios}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-xs text-slate-400 mb-1">Pts. Bienios</p>
            <p className="text-2xl font-bold text-emerald-600">{bienioPoints}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-xs text-slate-400 mb-1">Próx. Bienio</p>
            <p className="text-sm font-semibold text-blue-600">{nextBienioDate || '—'}</p>
          </CardContent>
        </Card>
      </div>

      {totalLeaveDays > 0 && (
        <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800">
          ⚠ Se han descontado <strong>{totalLeaveDays} días</strong> por permisos sin goce de remuneraciones. La fecha del próximo bienio se ha desplazado proporcionalmente.
        </div>
      )}

      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-3">
          <CardTitle className="text-base">Periodos de Servicio</CardTitle>
          <Dialog open={showForm} onOpenChange={(v) => { if (!v) closeForm(); else setShowForm(true); }}>
            <DialogTrigger asChild>
              <Button size="sm" className="bg-indigo-600 hover:bg-indigo-700">
                <Plus className="w-4 h-4 mr-1" /> Agregar
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{editingId ? 'Editar Periodo de Servicio' : 'Nuevo Periodo de Servicio'}</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 mt-4">
                <div>
                  <Label>Tipo de Periodo</Label>
                  <Select value={form.period_type} onValueChange={v => setForm(p => ({ ...p, period_type: v }))}>
                    <SelectTrigger><SelectValue placeholder="Seleccionar" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Planta">Planta</SelectItem>
                      <SelectItem value="Plazo Fijo">Plazo Fijo</SelectItem>
                      <SelectItem value="Honorarios">Honorarios</SelectItem>
                      <SelectItem value="Reemplazo">Reemplazo</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Fecha Inicio</Label>
                    <Input
                      type="date"
                      value={form.start_date}
                      onChange={e => handleStartDateChange(e.target.value)}
                    />
                  </div>
                  <div>
                    <Label>Fecha Fin</Label>
                    <Input
                      type="date"
                      value={form.end_date}
                      onChange={e => setForm(p => ({ ...p, end_date: e.target.value }))}
                    />
                  </div>
                </div>

                {/* Alerta de solapamiento */}
                {overlapInfo && !overlapDismissed && (
                  <div className="p-3 bg-red-50 border border-red-200 rounded-lg space-y-2">
                    <div className="flex items-start gap-2">
                      <AlertTriangle className="w-4 h-4 text-red-600 mt-0.5 flex-shrink-0" />
                      <p className="text-sm text-red-800">
                        <strong>Atención:</strong> Este periodo se solapa con{' '}
                        <strong>{overlapInfo.overlappingPeriod.period_type}</strong>
                        {overlapInfo.overlappingPeriod.institution
                          ? ` en ${overlapInfo.overlappingPeriod.institution}`
                          : ''}
                        {' '}({overlapInfo.overlappingPeriod.start_date} → {overlapInfo.overlappingPeriod.end_date || 'Vigente'}).
                        ¿Desea ajustar la fecha de inicio para evitar duplicidad de antigüedad?
                      </p>
                    </div>
                    {overlapInfo.suggestedDate && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="border-red-300 text-red-700 hover:bg-red-100 w-full"
                        onClick={handleAutoAdjust}
                      >
                        Ajustar automáticamente → {overlapInfo.suggestedDate}
                      </Button>
                    )}
                  </div>
                )}

                {/* Confirmación de ajuste */}
                {overlapDismissed && (
                  <div className="flex items-center gap-2 p-2 bg-green-50 border border-green-200 rounded-lg text-sm text-green-800">
                    <CheckCircle2 className="w-4 h-4 text-green-600" />
                    Fecha ajustada automáticamente. Se guardará registro de trazabilidad legal.
                  </div>
                )}

                <div>
                  <Label>Institución</Label>
                  <Input value={form.institution} onChange={e => setForm(p => ({ ...p, institution: e.target.value }))} />
                </div>
                <div>
                  <Label>N° Resolución</Label>
                  <Input value={form.resolution_number} onChange={e => setForm(p => ({ ...p, resolution_number: e.target.value }))} />
                </div>
                <Button
                  onClick={handleSubmit}
                  className="w-full bg-indigo-600 hover:bg-indigo-700"
                  disabled={createPeriod.isPending || updatePeriod.isPending}
                >
                  {(createPeriod.isPending || updatePeriod.isPending) ? 'Guardando...' : editingId ? 'Guardar Cambios' : 'Guardar Periodo'}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </CardHeader>
        <CardContent>
          {periods.length === 0 ? (
            <p className="text-sm text-slate-400 text-center py-6">Sin periodos registrados</p>
          ) : (
            <div className="space-y-3">
              {periods.map(p => (
                <div
                  key={p.id}
                  className={`flex items-center justify-between p-3 rounded-lg border ${
                    p.conflict_status === 'En Conflicto'
                      ? 'bg-red-50 border-red-200'
                      : p.conflict_status === 'Ajustado'
                      ? 'bg-amber-50 border-amber-200'
                      : 'bg-slate-50 border-slate-100'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div className={`p-2 rounded-lg ${p.conflict_status === 'En Conflicto' ? 'bg-red-100' : 'bg-indigo-100'}`}>
                      <Building2 className={`w-4 h-4 ${p.conflict_status === 'En Conflicto' ? 'text-red-600' : 'text-indigo-600'}`} />
                    </div>
                    <div>
                      <p className="text-sm font-medium">{p.institution || 'APS Panguipulli'}</p>
                      <p className="text-xs text-slate-500">{p.start_date} → {p.end_date || 'Vigente'}</p>
                      {p.ajustado_por_solapamiento && (
                        <p className="text-xs text-amber-600 mt-0.5">
                          ⚙ Ajustado — fecha original: {p.fecha_original}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap justify-end">
                    <Badge variant="outline">{p.period_type}</Badge>
                    <Badge className="bg-slate-100 text-slate-700">{p.days_count || 0} días</Badge>
                    {p.conflict_status && p.conflict_status !== 'Sin Conflicto' && (
                      <Badge className={conflictBadgeStyle(p)}>{p.conflict_status}</Badge>
                    )}
                    <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-slate-400 hover:text-indigo-600" onClick={() => openEdit(p)}>
                      <Pencil className="w-3.5 h-3.5" />
                    </Button>
                    <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-slate-400 hover:text-red-500" onClick={() => { if (confirm('¿Eliminar este periodo?')) deletePeriod.mutate(p.id); }}>
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
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