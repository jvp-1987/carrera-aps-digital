import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { AlertTriangle, CheckCircle2, Loader2, Wrench } from 'lucide-react';
import { toast } from 'sonner';

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
      if (b.start_date <= aEnd) {
        overlaps.push({ a, b });
      }
    }
  }
  return overlaps;
}

// Calcula días entre dos fechas (inclusive)
function calcDays(start, end) {
  if (!start || !end) return 0;
  const s = new Date(start);
  const e = new Date(end);
  const diff = Math.floor((e - s) / (1000 * 60 * 60 * 24)) + 1;
  return diff > 0 ? diff : 0;
}

// Día siguiente a una fecha ISO
function nextDay(dateStr) {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return null;
  d.setDate(d.getDate() + 1);
  return d.toISOString().split('T')[0];
}

export default function AuditSolapamientos() {
  const queryClient = useQueryClient();
  const [resolving, setResolving] = useState(null);

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

  const results = useMemo(() => {
    const byEmp = {};
    servicePeriods.forEach(sp => {
      if (!byEmp[sp.employee_id]) byEmp[sp.employee_id] = [];
      byEmp[sp.employee_id].push(sp);
    });

    const conflicts = [];
    Object.entries(byEmp).forEach(([empId, periods]) => {
      const overlaps = detectOverlaps(periods);
      if (overlaps.length > 0) {
        conflicts.push({ emp: empMap[empId], empId, overlaps });
      }
    });

    return conflicts.sort((a, b) => (a.emp?.full_name || '').localeCompare(b.emp?.full_name || ''));
  }, [servicePeriods, empMap]);

  // Resolver solapamiento: el período B (el que comienza después) se ajusta para
  // empezar justo después del fin del período A (el mayor/anterior).
  // Si quedan 0 días, start_date = end_date y days_count = 0.
  const handleResolve = async (ov) => {
    const { a, b } = ov;
    // a termina en aEnd, b debe empezar después de aEnd
    const aEnd = a.end_date;
    if (!aEnd) {
      toast.error('El período anterior no tiene fecha de término definida. Corrígelo manualmente.');
      return;
    }

    const newStart = nextDay(aEnd);
    // Si newStart > b.end_date, el período queda con 0 días (start = end = newStart)
    let newEnd = b.end_date;
    let newDays = 0;

    if (!newEnd || newStart <= newEnd) {
      newDays = newEnd ? calcDays(newStart, newEnd) : 0;
    } else {
      // b queda completamente absorbido → start = end = newStart, days = 0
      newEnd = newStart;
      newDays = 0;
    }

    setResolving(b.id);
    await base44.entities.ServicePeriod.update(b.id, {
      start_date: newStart,
      end_date: newEnd,
      days_count: newDays,
      ajustado_por_solapamiento: true,
      conflict_status: 'Ajustado',
      solapamiento_detalle: `Ajustado automáticamente: inicio movido de ${b.start_date} a ${newStart} por solapamiento con período ${a.start_date}→${a.end_date}`,
    });

    toast.success(`Período ajustado: nueva fecha inicio ${newStart} · ${newDays} días`);
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
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Auditoría de Solapamientos</h1>
        <p className="text-sm text-slate-500 mt-1">
          Detecta períodos superpuestos y los resuelve conservando el período mayor, ajustando el solapante a cero días si corresponde.
        </p>
      </div>

      {/* Resumen */}
      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-4">
            <p className="text-xs font-semibold text-slate-500 uppercase">Funcionarios analizados</p>
            <p className="text-2xl font-bold text-slate-900 mt-1">{employees.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs font-semibold text-slate-500 uppercase">Períodos totales</p>
            <p className="text-2xl font-bold text-slate-900 mt-1">{servicePeriods.length}</p>
          </CardContent>
        </Card>
        <Card className={results.length > 0 ? 'border-red-200 bg-red-50' : 'border-emerald-200 bg-emerald-50'}>
          <CardContent className="p-4">
            <p className={`text-xs font-semibold uppercase ${results.length > 0 ? 'text-red-600' : 'text-emerald-600'}`}>
              Con solapamientos
            </p>
            <p className={`text-2xl font-bold mt-1 ${results.length > 0 ? 'text-red-900' : 'text-emerald-900'}`}>
              {results.length}
            </p>
          </CardContent>
        </Card>
      </div>

      {results.length === 0 ? (
        <Card className="border-emerald-200 bg-emerald-50">
          <CardContent className="p-6 text-center">
            <CheckCircle2 className="w-8 h-8 text-emerald-600 mx-auto mb-2" />
            <p className="text-emerald-700 font-semibold">¡Sin solapamientos detectados!</p>
            <p className="text-sm text-emerald-600 mt-1">Todos los períodos de servicio son consistentes.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          <p className="text-sm font-semibold text-red-700 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4" /> {results.length} funcionario(s) con períodos solapados
          </p>
          {results.map(({ emp, empId, overlaps }) => (
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
                  const newStart = aEnd ? nextDay(aEnd) : '?';
                  const newDays = aEnd && ov.b.end_date
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
                        {/* Período A: se conserva */}
                        <div className="bg-white rounded p-2 border border-slate-200">
                          <Badge className="bg-green-100 text-green-700 text-[9px] mb-1">Se conserva</Badge>
                          <p className="font-medium text-slate-700">{ov.a.institution}</p>
                          <p className="text-slate-500">{ov.a.period_type}</p>
                          <p className="text-slate-600 font-mono">{ov.a.start_date} → {ov.a.end_date || 'vigente'}</p>
                          <p className="text-slate-400">{ov.a.days_count} días</p>
                        </div>
                        {/* Período B: se ajusta */}
                        <div className="bg-white rounded p-2 border border-amber-200">
                          <Badge className="bg-amber-100 text-amber-700 text-[9px] mb-1">Se ajusta</Badge>
                          <p className="font-medium text-slate-700">{ov.b.institution}</p>
                          <p className="text-slate-500">{ov.b.period_type}</p>
                          <p className="text-slate-600 font-mono line-through text-slate-400">{ov.b.start_date} → {ov.b.end_date || 'vigente'}</p>
                          <p className="text-amber-700 font-mono font-semibold">{newStart} → {ov.b.end_date || '?'} ({newDays} días)</p>
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
  );
}