import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { AlertTriangle, CheckCircle2, Loader2, Wrench, Copy, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

// ── Utilidades ───────────────────────────────────────────────────
function detectOverlaps(periods) {
  const sorted = [...periods]
    .filter(p => p.start_date)
    .sort((a, b) => a.start_date.localeCompare(b.start_date));
  const overlaps = [];
  for (let i = 0; i < sorted.length; i++) {
    for (let j = i + 1; j < sorted.length; j++) {
      const a = sorted[i];
      const b = sorted[j];
      const aEnd = a.end_date || '9999-12-31';
      if (b.start_date <= aEnd) overlaps.push({ a, b });
    }
  }
  return overlaps;
}

function detectDuplicates(periods) {
  // Duplicado = mismo employee_id + start_date + end_date
  const seen = {};
  const dupes = [];
  periods.forEach(p => {
    const key = `${p.employee_id}|${p.start_date}|${p.end_date || ''}`;
    if (!seen[key]) { seen[key] = p; }
    else { dupes.push({ original: seen[key], duplicate: p }); }
  });
  return dupes;
}

function calcDays(start, end) {
  if (!start || !end) return 0;
  const diff = Math.floor((new Date(end) - new Date(start)) / (1000 * 60 * 60 * 24)) + 1;
  return diff > 0 ? diff : 0;
}

function nextDay(dateStr) {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return null;
  d.setDate(d.getDate() + 1);
  return d.toISOString().split('T')[0];
}

const sleep = (ms) => new Promise(res => setTimeout(res, ms));

// ── Componente principal ─────────────────────────────────────────
export default function AuditSolapamientos() {
  const queryClient = useQueryClient();
  const [resolving, setResolving] = useState(null);
  const [resolvingAll, setResolvingAll] = useState(false);
  const [deletingDupe, setDeletingDupe] = useState(null);
  const [deletingAllDupes, setDeletingAllDupes] = useState(false);

  const { data: employees = [], isLoading: empLoading } = useQuery({
    queryKey: ['employees-overlap-audit'],
    queryFn: () => base44.entities.Employee.list('-created_date', 2000),
  });

  const { data: servicePeriods = [], isLoading: spLoading } = useQuery({
    queryKey: ['service-periods-overlap-audit'],
    queryFn: () => base44.entities.ServicePeriod.list(null, 5000),
  });

  const isLoading = empLoading || spLoading;

  const empMap = useMemo(() => {
    const m = {};
    employees.forEach(e => { m[e.id] = e; });
    return m;
  }, [employees]);

  // ── Duplicados exactos ──────────────────────────────────────────
  const duplicates = useMemo(() => {
    const dupes = detectDuplicates(servicePeriods);
    // Agrupar con datos de empleado
    return dupes.map(d => ({
      ...d,
      emp: empMap[d.duplicate.employee_id],
    }));
  }, [servicePeriods, empMap]);

  // ── Solapamientos ───────────────────────────────────────────────
  const overlapsResults = useMemo(() => {
    const byEmp = {};
    servicePeriods.forEach(sp => {
      if (!byEmp[sp.employee_id]) byEmp[sp.employee_id] = [];
      byEmp[sp.employee_id].push(sp);
    });
    const conflicts = [];
    Object.entries(byEmp).forEach(([empId, periods]) => {
      const overlaps = detectOverlaps(periods);
      if (overlaps.length > 0) conflicts.push({ emp: empMap[empId], empId, overlaps });
    });
    return conflicts.sort((a, b) => (a.emp?.full_name || '').localeCompare(b.emp?.full_name || ''));
  }, [servicePeriods, empMap]);

  // ── Eliminar un duplicado ───────────────────────────────────────
  const handleDeleteDupe = async (period) => {
    setDeletingDupe(period.id);
    await base44.entities.ServicePeriod.delete(period.id);
    toast.success(`Duplicado eliminado`);
    queryClient.invalidateQueries({ queryKey: ['service-periods-overlap-audit'] });
    setDeletingDupe(null);
  };

  // ── Eliminar todos los duplicados ───────────────────────────────
  const handleDeleteAllDupes = async () => {
    setDeletingAllDupes(true);
    let count = 0;
    for (const d of duplicates) {
      await base44.entities.ServicePeriod.delete(d.duplicate.id);
      count++;
      await sleep(300);
    }
    toast.success(`${count} duplicado(s) eliminados`);
    queryClient.invalidateQueries({ queryKey: ['service-periods-overlap-audit'] });
    setDeletingAllDupes(false);
  };

  // ── Resolver todos los solapamientos ────────────────────────────
  const handleResolveAll = async () => {
    if (!confirm('¿Seguro que deseas establecer en 0 días TODOS los períodos solapados detectados? Las fechas se conservarán.')) return;
    setResolvingAll(true);
    let count = 0;
    for (const item of overlapsResults) {
      for (const ov of item.overlaps) {
        // Obviar los que ya están en 0
        if (ov.b.ajustado_por_solapamiento && ov.b.days_count === 0) continue;
        await base44.entities.ServicePeriod.update(ov.b.id, {
          days_count: 0,
          ajustado_por_solapamiento: true,
          conflict_status: 'Ajustado',
          solapamiento_detalle: `Ajustado masivamente a 0 días por solapamiento con ${ov.a.start_date}→${ov.a.end_date}`,
        });
        count++;
        await sleep(300);
      }
    }
    toast.success(`${count} períodos solapados fueron ajustados a 0 días.`);
    queryClient.invalidateQueries({ queryKey: ['service-periods-overlap-audit'] });
    setResolvingAll(false);
  };

  // ── Resolver solapamiento ───────────────────────────────────────
  const handleResolve = async (ov) => {
    const { a, b } = ov;
    setResolving(b.id);
    await base44.entities.ServicePeriod.update(b.id, {
      days_count: 0,
      ajustado_por_solapamiento: true,
      conflict_status: 'Ajustado',
      solapamiento_detalle: `Ajustado a 0 días por solapamiento con ${a.start_date}→${a.end_date}`,
    });
    toast.success(`Período penalizado a 0 días (fechas intactas)`);
    queryClient.invalidateQueries({ queryKey: ['service-periods-overlap-audit'] });
    setResolving(null);
  };

  if (isLoading) {
    return (
      <div className="p-6 flex justify-center items-center min-h-[300px]">
        <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
      </div>
    );
  }

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Auditoría de Períodos</h1>
        <p className="text-sm text-slate-500 mt-1">
          Detecta duplicados exactos y solapamientos en los períodos de servicio.
        </p>
      </div>

      {/* Resumen */}
      <div className="grid grid-cols-4 gap-4">
        <Card><CardContent className="p-4">
          <p className="text-xs font-semibold text-slate-500 uppercase">Funcionarios</p>
          <p className="text-2xl font-bold text-slate-900 mt-1">{employees.length}</p>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <p className="text-xs font-semibold text-slate-500 uppercase">Períodos totales</p>
          <p className="text-2xl font-bold text-slate-900 mt-1">{servicePeriods.length}</p>
        </CardContent></Card>
        <Card className={duplicates.length > 0 ? 'border-orange-200 bg-orange-50' : 'border-emerald-200 bg-emerald-50'}>
          <CardContent className="p-4">
            <p className={`text-xs font-semibold uppercase ${duplicates.length > 0 ? 'text-orange-600' : 'text-emerald-600'}`}>Duplicados exactos</p>
            <p className={`text-2xl font-bold mt-1 ${duplicates.length > 0 ? 'text-orange-900' : 'text-emerald-900'}`}>{duplicates.length}</p>
          </CardContent>
        </Card>
        <Card className={overlapsResults.length > 0 ? 'border-red-200 bg-red-50' : 'border-emerald-200 bg-emerald-50'}>
          <CardContent className="p-4">
            <p className={`text-xs font-semibold uppercase ${overlapsResults.length > 0 ? 'text-red-600' : 'text-emerald-600'}`}>Con solapamientos</p>
            <p className={`text-2xl font-bold mt-1 ${overlapsResults.length > 0 ? 'text-red-900' : 'text-emerald-900'}`}>{overlapsResults.length}</p>
          </CardContent>
        </Card>
      </div>

      {/* ── Sección duplicados ── */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-bold text-slate-800 flex items-center gap-2">
            <Copy className="w-4 h-4 text-orange-500" /> Duplicados exactos
          </h2>
          {duplicates.length > 0 && (
            <Button
              size="sm"
              variant="destructive"
              disabled={deletingAllDupes}
              onClick={handleDeleteAllDupes}
              className="text-xs"
            >
              {deletingAllDupes
                ? <><Loader2 className="w-3 h-3 animate-spin mr-1" /> Eliminando...</>
                : <><Trash2 className="w-3 h-3 mr-1" /> Eliminar todos ({duplicates.length})</>
              }
            </Button>
          )}
        </div>

        {duplicates.length === 0 ? (
          <Card className="border-emerald-200 bg-emerald-50">
            <CardContent className="p-4 flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5 text-emerald-600" />
              <p className="text-emerald-700 text-sm font-semibold">Sin duplicados detectados</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-2">
            {duplicates.map(({ original, duplicate, emp }, idx) => (
              <Card key={duplicate.id} className="border-orange-200">
                <CardContent className="p-3">
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <div className="text-xs space-y-0.5">
                      <p className="font-semibold text-slate-800">{emp?.full_name || duplicate.employee_id} <span className="text-slate-400 font-normal">{emp?.rut}</span></p>
                      <p className="text-slate-600 font-mono">{duplicate.start_date} → {duplicate.end_date || 'vigente'}</p>
                      <div className="flex gap-3 text-slate-500">
                        <span>Original: <span className="text-slate-700">{original.institution}</span> · {original.period_type}</span>
                        <span>Duplicado: <span className="text-orange-700">{duplicate.institution}</span> · {duplicate.period_type}</span>
                      </div>
                    </div>
                    <Button
                      size="sm"
                      variant="destructive"
                      className="h-7 text-[11px]"
                      disabled={deletingDupe === duplicate.id}
                      onClick={() => handleDeleteDupe(duplicate)}
                    >
                      {deletingDupe === duplicate.id
                        ? <Loader2 className="w-3 h-3 animate-spin" />
                        : <><Trash2 className="w-3 h-3 mr-1" /> Eliminar duplicado</>
                      }
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* ── Sección solapamientos ── */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-base font-bold text-slate-800 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-red-500" /> Solapamientos de fechas
            </h2>
            <p className="text-xs text-slate-500 mt-1">Períodos distintos que se superponen en fechas. Se conserva el mayor y se ajusta el menor a 0 días sin borrar sus fechas.</p>
          </div>
          {overlapsResults.length > 0 && (
            <Button
              size="sm"
              variant="default"
              className="bg-red-600 hover:bg-red-700 text-xs"
              disabled={resolvingAll}
              onClick={handleResolveAll}
            >
              {resolvingAll
                ? <><Loader2 className="w-3 h-3 animate-spin mr-1" /> Resolviendo todos...</>
                : <><Wrench className="w-3 h-3 mr-1" /> Subsanar todos a 0 días ({overlapsResults.length})</>
              }
            </Button>
          )}
        </div>

        {overlapsResults.length === 0 ? (
          <Card className="border-emerald-200 bg-emerald-50">
            <CardContent className="p-4 flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5 text-emerald-600" />
              <p className="text-emerald-700 text-sm font-semibold">Sin solapamientos detectados</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            <p className="text-sm font-semibold text-red-700">{overlapsResults.length} funcionario(s) con períodos solapados</p>
            {overlapsResults.map(({ emp, empId, overlaps }) => (
              <Card key={empId} className="border-red-200">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm text-red-800 flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 shrink-0" />
                    {emp?.full_name || empId}
                    <span className="text-xs text-red-500 font-normal">{emp?.rut}</span>
                    <Badge className="bg-red-100 text-red-700 ml-auto">{overlaps.length} solapamiento(s)</Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {overlaps.map((ov, idx) => {
                    const aEnd = ov.a.end_date;
                    const newStart = aEnd ? (nextDay(aEnd) || '?') : '?';
                    const newDays = newStart !== '?' && ov.b.end_date
                      ? (newStart <= ov.b.end_date ? calcDays(newStart, ov.b.end_date) : 0)
                      : 0;
                    return (
                      <div key={idx} className="bg-red-50 border border-red-200 rounded p-3 text-xs space-y-2">
                        <div className="flex items-center justify-between">
                          <p className="font-semibold text-red-700">Conflicto {idx + 1}</p>
                          <Button
                            size="sm"
                            className="h-7 text-[11px] bg-amber-600 hover:bg-amber-700"
                            disabled={resolving === ov.b.id || !aEnd}
                            onClick={() => handleResolve(ov)}
                          >
                            {resolving === ov.b.id
                              ? <Loader2 className="w-3 h-3 animate-spin mr-1" />
                              : <Wrench className="w-3 h-3 mr-1" />}
                            Resolver → ajustar a {newDays} días
                          </Button>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <div className="bg-white rounded p-2 border border-slate-200">
                            <Badge className="bg-green-100 text-green-700 text-[9px] mb-1">Se conserva</Badge>
                            <p className="font-medium text-slate-700">{ov.a.institution}</p>
                            <p className="text-slate-500">{ov.a.period_type}</p>
                            <p className="text-slate-600 font-mono">{ov.a.start_date} → {ov.a.end_date || 'vigente'}</p>
                            <p className="text-slate-400">{ov.a.days_count} días</p>
                          </div>
                          <div className="bg-white rounded p-2 border border-amber-200">
                            <Badge className="bg-amber-100 text-amber-700 text-[9px] mb-1">Se ajusta</Badge>
                            <p className="font-medium text-slate-700">{ov.b.institution}</p>
                            <p className="text-slate-500">{ov.b.period_type}</p>
                            <p className="text-slate-600 font-mono">{ov.b.start_date} → {ov.b.end_date || 'vigente'}</p>
                            <p className="text-amber-700 font-mono font-semibold">0 días (Anulado por solape)</p>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}