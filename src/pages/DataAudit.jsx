import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { AlertTriangle, CheckCircle2, Loader, RefreshCw, Loader2, RotateCcw, Wrench, Copy, Trash2, ClipboardList } from 'lucide-react';
import { toast } from 'sonner';
import { Progress } from '@/components/ui/progress';
import { useAudit } from '@/lib/AuditContext';

// ── Utilidades de Cálculo ─────────────────────────────────────
function calcDays(start, end) {
  if (!start || !end) return null;
  try {
    const d = Math.floor((new Date(end).getTime() - new Date(start).getTime()) / 86400000) + 1;
    return d > 0 ? d : null;
  } catch { return null; }
}

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
  const seen = {};
  const dupes = [];
  periods.forEach(p => {
    const key = `${p.employee_id}|${p.start_date}|${p.end_date || ''}`;
    if (!seen[key]) { seen[key] = p; }
    else { dupes.push({ original: seen[key], duplicate: p }); }
  });
  return dupes;
}

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// Helper: Exponential Backoff para mitigar errores 429
const safeApiCall = async (apiFn, maxRetries = 5, baseDelay = 400) => {
  let attempt = 0;
  while (attempt < maxRetries) {
    try {
      const result = await apiFn();
      await new Promise(r => setTimeout(r, baseDelay));
      return result;
    } catch (err) {
      const isRateLimit = err?.response?.status === 429 || err?.status === 429 || String(err).includes('429') || String(err).toLowerCase().includes('rate limit');
      if (isRateLimit && attempt < maxRetries - 1) {
        const backoffDelay = baseDelay * Math.pow(2, attempt + 1);
        await new Promise(r => setTimeout(r, backoffDelay));
        attempt++;
      } else {
        throw err;
      }
    }
  }
};

// ── Componente: Recálculo Masivo ───────────────────────────────
function RecalcularPuntajesMasivo() {
  const { isRunning, progress, stats, currentStatus, startAudit } = useAudit();
  
  const handleRecalculate = async () => {
    if (!confirm('¿Seguro que deseas recalcular la experiencia y capacitación de TODOS los funcionarios? Esto puede tomar varios minutos.')) return;
    startAudit();
  };

  return (
    <Card className="border-indigo-200 bg-indigo-50 shadow-sm">
      <CardContent className="p-5 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <h3 className="text-base font-semibold text-indigo-900 flex items-center gap-2">
            <RefreshCw className="w-5 h-5 text-indigo-600" /> Recálculo Masivo de Puntajes
          </h3>
          <p className="text-sm text-indigo-700 mt-1 max-w-xl">
            Actualiza días efectivos, bienios, puntos de experiencia y capacitación de todos los funcionarios.
          </p>
        </div>
        <div className="flex flex-col items-end gap-2 text-sm text-indigo-800 font-medium whitespace-nowrap w-full md:w-auto">
          {isRunning ? (
            <div className="flex flex-col items-end gap-1 w-full md:w-auto">
              <div className="flex items-center gap-2 bg-indigo-100 px-4 py-2 rounded-md border border-indigo-200 w-full justify-center">
                <Loader2 className="w-4 h-4 animate-spin text-indigo-600"/> {progress}%
              </div>
              <p className="text-[10px] text-indigo-600 font-normal italic animate-pulse">
                {currentStatus || 'Preparando...'}
              </p>
            </div>
          ) : (
            <>
              <Button size="lg" className="bg-indigo-600 hover:bg-indigo-700 w-full md:w-auto text-sm" onClick={handleRecalculate}>
                Iniciar Recálculo {stats?.total ? `(${stats.total})` : ''}
              </Button>
              {stats && (
                <p className="text-xs text-indigo-600/80">
                  Último: ✓ {stats.ok} {stats.errors > 0 && `| ✗ ${stats.errors}`}
                </p>
              )}
            </>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// ── Componente: Herramienta de Limpieza de Días ───────────────
function HerramientaLimpiezaDias() {
  const [status, setStatus] = useState('idle');
  const [toFix, setToFix] = useState([]);
  const [progress, setProgress] = useState(0);
  const [updated, setUpdated] = useState(0);
  const [errors, setErrors] = useState(0);
  const [allCount, setAllCount] = useState(0);

  const handleAnalyze = async () => {
    setStatus('loading');
    const periods = await base44.entities.ServicePeriod.list(null, 9999);
    const needFix = periods.filter(p => {
      if (!p.start_date || !p.end_date) return false;
      const correct = calcDays(p.start_date, p.end_date);
      return correct !== null && p.days_count !== correct;
    });
    setAllCount(periods.length);
    setToFix(needFix);
    setStatus('idle');
    if (needFix.length === 0) toast.info('No se detectaron discrepancias en los días.');
  };

  const handleRun = async () => {
    setStatus('running');
    let done = 0, upd = 0, errs = 0;
    const batchSize = 5;

    for (let i = 0; i < toFix.length; i += batchSize) {
      const batch = toFix.slice(i, i + batchSize);
      await Promise.all(batch.map(async (p) => {
        try {
          const correct = calcDays(p.start_date, p.end_date);
          await safeApiCall(() => base44.entities.ServicePeriod.update(p.id, { days_count: correct }), 3, 200);
          upd++;
        } catch { errs++; }
      }));
      done += batch.length;
      setProgress(Math.round((done / toFix.length) * 100));
      setUpdated(upd);
      setErrors(errs);
    }
    setStatus('done');
    toast.success('Corrección finalizada');
  };

  return (
    <Card className="border-slate-200 shadow-sm h-full">
      <CardHeader className="pb-3 border-b bg-slate-50/50">
        <CardTitle className="text-sm font-bold text-slate-800 flex items-center gap-2">
          <RefreshCw className="w-4 h-4 text-indigo-500" /> Auditoría de Días
        </CardTitle>
      </CardHeader>
      <CardContent className="p-4 space-y-3">
        {status === 'loading' ? (
          <div className="flex items-center gap-2 text-xs text-slate-500 py-4"><Loader2 className="w-4 h-4 animate-spin" /> Analizando períodos...</div>
        ) : status === 'running' ? (
          <div className="space-y-2 py-2">
            <div className="flex justify-between text-xs text-slate-600 underline decoration-indigo-200 decoration-2">
              <span>Procesando {updated + errors} / {toFix.length}</span>
              <span>{progress}%</span>
            </div>
            <Progress value={progress} className="h-1.5" />
          </div>
        ) : status === 'done' ? (
          <div className="space-y-2">
            <p className="text-xs text-emerald-700 font-medium">✓ {updated} períodos corregidos.</p>
            <Button size="sm" variant="ghost" onClick={() => setStatus('idle')} className="h-7 text-xs">Finalizar</Button>
          </div>
        ) : toFix.length > 0 ? (
          <div className="space-y-3">
            <p className="text-xs text-amber-700">Se detectaron <strong>{toFix.length}</strong> períodos con conteo de días incorrecto.</p>
            <Button size="sm" onClick={handleRun} className="bg-slate-800 hover:bg-slate-900">Corregir ahora</Button>
          </div>
        ) : (
          <div className="space-y-2">
            <p className="text-xs text-slate-500">Compara `days_count` contra las fechas `inicio` y `término`.</p>
            <Button size="sm" variant="outline" onClick={handleAnalyze}>Analizar discrepancias</Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ── Componente: Auditoría de Solapamientos ─────────────────────
function LimpiezaPeriodosTab({ employees, servicePeriods }) {
  const queryClient = useQueryClient();
  const [resolving, setResolving] = useState(null);
  
  const empMap = useMemo(() => {
    const m = {};
    employees.forEach(e => { m[e.id] = e; });
    return m;
  }, [employees]);

  const duplicates = useMemo(() => detectDuplicates(servicePeriods), [servicePeriods]);
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
    return conflicts;
  }, [servicePeriods, empMap]);

  const handleDeleteDupe = async (id) => {
    if (!confirm('¿Eliminar este registro duplicado?')) return;
    await safeApiCall(() => base44.entities.ServicePeriod.delete(id));
    toast.success('Duplicado eliminado');
    queryClient.invalidateQueries({ queryKey: ['service-periods-audit'] });
  };

  const handleResolveOverlap = async (ov) => {
    setResolving(ov.b.id);
    await safeApiCall(() => base44.entities.ServicePeriod.update(ov.b.id, {
      days_count: 0,
      ajustado_por_solapamiento: true,
      conflict_status: 'Ajustado',
      solapamiento_detalle: `Ajustado a 0 días por solapamiento con ${ov.a.start_date}→${ov.a.end_date}`,
    }));
    toast.success('Período penalizado a 0 días');
    queryClient.invalidateQueries({ queryKey: ['service-periods-audit'] });
    setResolving(null);
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Duplicados */}
      <Card className="border-orange-100 bg-orange-50/30 h-fit">
        <CardHeader className="pb-3 border-b border-orange-100">
          <CardTitle className="text-sm font-bold text-orange-800 flex items-center gap-2">
            <Copy className="w-4 h-4" /> Duplicados Exactos ({duplicates.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="p-4 space-y-2">
          {duplicates.length === 0 ? (
            <p className="text-xs text-slate-400 italic">No se detectaron duplicados.</p>
          ) : (
            <div className="space-y-2 max-h-[500px] overflow-y-auto pr-1">
              {duplicates.map((d, i) => (
                <div key={i} className="bg-white p-3 rounded-md border border-orange-200 flex justify-between items-center text-xs">
                  <div>
                    <p className="font-semibold text-slate-800">{empMap[d.duplicate.employee_id]?.full_name || 'Desconocido'}</p>
                    <p className="text-slate-500">{d.duplicate.start_date} → {d.duplicate.end_date || '?'}</p>
                    <p className="text-[10px] text-slate-400 italic">{d.duplicate.institution}</p>
                  </div>
                  <Button size="icon" variant="ghost" className="text-red-500 h-8 w-8" onClick={() => handleDeleteDupe(d.duplicate.id)}>
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Solapamientos */}
      <Card className="border-red-100 bg-red-50/30 h-fit">
        <CardHeader className="pb-3 border-b border-red-100">
          <CardTitle className="text-sm font-bold text-red-800 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4" /> Solapamientos de Fechas ({overlapsResults.length} funcionarios)
          </CardTitle>
        </CardHeader>
        <CardContent className="p-4 space-y-4">
          {overlapsResults.length === 0 ? (
            <p className="text-xs text-slate-400 italic">Sin solapamientos detectados.</p>
          ) : (
            <div className="space-y-4 max-h-[500px] overflow-y-auto pr-1">
              {overlapsResults.slice(0, 10).map((res, i) => (
                <div key={i} className="bg-white p-3 rounded-md border border-red-200 space-y-2">
                  <p className="text-sm font-bold text-slate-800 border-b pb-1">{res.emp?.full_name}</p>
                  {res.overlaps.map((ov, j) => (
                    <div key={j} className="text-xs bg-red-50/50 p-2 rounded flex justify-between items-center gap-2">
                      <div className="flex-1">
                        <p className="text-slate-600"><span className="font-semibold">A:</span> {ov.a.start_date} → {ov.a.end_date} ({ov.a.days_count}d)</p>
                        <p className="text-red-700 font-medium"><span className="font-semibold">B:</span> {ov.b.start_date} → {ov.b.end_date} (Solapa)</p>
                      </div>
                      <Button size="sm" variant="outline" className="h-8 border-red-200 text-red-700 hover:bg-red-100" onClick={() => handleResolveOverlap(ov)} disabled={resolving === ov.b.id}>
                        {resolving === ov.b.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Wrench className="w-3.5 h-3.5 mr-1" />}
                        Subsanar
                      </Button>
                    </div>
                  ))}
                </div>
              ))}
              {overlapsResults.length > 10 && <p className="text-[10px] text-slate-400 text-center italic">... y {overlapsResults.length - 10} funcionarios más.</p>}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ── Componente Principal ──────────────────────────────────────
export default function DataAudit() {
  const { data: employees = [], isLoading: empLoading } = useQuery({
    queryKey: ['employees-audit'],
    queryFn: () => base44.entities.Employee.list('-created_date', 2000),
  });

  const { data: servicePeriods = [] } = useQuery({
    queryKey: ['service-periods-audit'],
    queryFn: () => base44.entities.ServicePeriod.list(null, 5000),
  });

  const { data: trainings = [] } = useQuery({
    queryKey: ['trainings-audit'],
    queryFn: () => base44.entities.Training.list(null, 5000),
  });

  const { data: leaves = [] } = useQuery({
    queryKey: ['leaves-audit'],
    queryFn: () => base44.entities.LeaveWithoutPay.list(null, 5000),
  });

  const isLoading = empLoading;

  // Analizar Vacíos
  const noExperience = employees.filter(e => {
    const p = servicePeriods.filter(sp => sp.employee_id === e.id);
    return p.length === 0 || (e.total_experience_days || 0) === 0;
  });
  const noTraining = employees.filter(e => (e.training_points || 0) === 0);
  const noEither = noExperience.filter(e => (e.training_points || 0) === 0);

  if (isLoading) {
    return (
      <div className="p-6 flex justify-center items-center min-h-[300px]">
        <Loader className="w-8 h-8 animate-spin text-slate-300" />
      </div>
    );
  }

  return (
    <div className="p-6 lg:p-8 max-w-7xl mx-auto space-y-8">
      <div className="flex items-center gap-3">
        <div className="w-12 h-12 rounded-xl bg-indigo-600 flex items-center justify-center text-white shadow-lg">
          <ClipboardList className="w-6 h-6" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Centro de Auditoría</h1>
          <p className="text-slate-500 text-sm">Mantenimiento de integridad, cálculo masivo y saneamiento de datos</p>
        </div>
      </div>

      <Tabs defaultValue="overview" className="space-y-6">
        <TabsList className="bg-slate-100 p-1 h-11 border border-slate-200">
          <TabsTrigger value="overview" className="px-6 data-[state=active]:bg-white data-[state=active]:shadow-sm">Recálculo y Resumen</TabsTrigger>
          <TabsTrigger value="periods" className="px-6 data-[state=active]:bg-white data-[state=active]:shadow-sm">Limpieza de Períodos</TabsTrigger>
          <TabsTrigger value="gaps" className="px-6 data-[state=active]:bg-white data-[state=active]:shadow-sm">Vacíos Críticos</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
          <RecalcularPuntajesMasivo />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Card className="border-slate-200 shadow-sm">
              <CardHeader className="pb-3 bg-slate-50/50 border-b">
                <CardTitle className="text-sm font-bold text-slate-800">Estadísticas de la Base de Datos</CardTitle>
              </CardHeader>
              <CardContent className="p-6">
                <div className="grid grid-cols-2 gap-4">
                  {[
                    { label: 'Funcionarios', val: employees.length, bg: 'bg-blue-50', text: 'text-blue-700' },
                    { label: 'Períodos', val: servicePeriods.length, bg: 'bg-emerald-50', text: 'text-emerald-700' },
                    { label: 'Capacitaciones', val: trainings.length, bg: 'bg-indigo-50', text: 'text-indigo-700' },
                    { label: 'Permisos S/G', val: leaves.length, bg: 'bg-amber-50', text: 'text-amber-700' },
                  ].map(s => (
                    <div key={s.label} className={`${s.bg} rounded-xl p-4 border border-white/50 text-center shadow-inner`}>
                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{s.label}</p>
                      <p className={`text-2xl font-black ${s.text} mt-1`}>{s.val}</p>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
            <HerramientaLimpiezaDias />
          </div>
        </TabsContent>

        <TabsContent value="periods" className="animate-in fade-in slide-in-from-bottom-2 duration-300">
          <LimpiezaPeriodosTab employees={employees} servicePeriods={servicePeriods} />
        </TabsContent>

        <TabsContent value="gaps" className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <Card className="border-red-200 bg-red-50/20">
              <CardHeader className="pb-2">
                <CardTitle className="text-xs font-bold text-red-800 flex items-center gap-1.5 uppercase tracking-tight">
                  <AlertTriangle className="w-3.5 h-3.5" /> Sin Experiencia
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-black text-red-900">{noExperience.length}</p>
                <p className="text-[10px] text-red-600 mt-1 uppercase font-semibold">Casos detectados</p>
                <div className="mt-4 space-y-1 max-h-60 overflow-y-auto">
                  {noExperience.slice(0, 50).map(e => (
                    <div key={e.id} className="text-[10px] text-slate-600 bg-white border border-red-100 rounded px-2 py-1 flex justify-between">
                      <span className="truncate w-32">{e.full_name}</span>
                      <span className="font-mono">{e.rut}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            <Card className="border-orange-200 bg-orange-50/20">
              <CardHeader className="pb-2">
                <CardTitle className="text-xs font-bold text-orange-800 flex items-center gap-1.5 uppercase tracking-tight">
                  <AlertTriangle className="w-3.5 h-3.5" /> Sin Capacitación
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-black text-orange-900">{noTraining.length}</p>
                <p className="text-[10px] text-orange-600 mt-1 uppercase font-semibold">Casos detectados</p>
                <div className="mt-4 space-y-1 max-h-60 overflow-y-auto">
                  {noTraining.slice(0, 50).map(e => (
                    <div key={e.id} className="text-[10px] text-slate-600 bg-white border border-orange-100 rounded px-2 py-1 flex justify-between">
                      <span className="truncate w-32">{e.full_name}</span>
                      <span className="font-mono">{e.rut}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            <Card className="border-rose-300 bg-rose-50">
              <CardHeader className="pb-2">
                <CardTitle className="text-xs font-bold text-rose-800 flex items-center gap-1.5 uppercase tracking-tight">
                  <AlertTriangle className="w-3.5 h-3.5" /> Crítico: Falta Todo
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-black text-rose-900">{noEither.length}</p>
                <p className="text-[10px] text-rose-600 mt-1 uppercase font-semibold">Casos críticos</p>
                <div className="mt-4 space-y-1 max-h-60 overflow-y-auto">
                  {noEither.slice(0, 50).map(e => (
                    <div key={e.id} className="text-[10px] text-rose-800 bg-white border border-rose-200 rounded px-2 py-1 flex justify-between font-bold">
                      <span className="truncate w-32">{e.full_name}</span>
                      <span className="font-mono">{e.rut}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
          {noExperience.length === 0 && noTraining.length === 0 && (
            <div className="text-center py-12 bg-emerald-50 border border-emerald-100 rounded-2xl">
              <CheckCircle2 className="w-12 h-12 text-emerald-500 mx-auto mb-3" />
              <p className="text-emerald-800 font-bold text-lg">Integridad Total</p>
              <p className="text-emerald-600 text-sm mt-1">Todos los funcionarios cuentan con registros básicos de experiencia y capacitación.</p>
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}