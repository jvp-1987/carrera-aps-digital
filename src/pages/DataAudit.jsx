import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { AlertTriangle, CheckCircle2, Loader, RefreshCw, Loader2, RotateCcw } from 'lucide-react';
import { toast } from 'sonner';
import { Progress } from '@/components/ui/progress';
import { calculateEffectiveDays, calculateBienios, calculateBienioPoints, calculateNextBienioDate, calculatePostitlePercentage, calculateTrainingPoints } from '@/components/calculations';
import { useAudit } from '@/lib/AuditContext';

// ── Helpers de Limpieza ───────────────────────────────────────
function calcDays(start, end) {
  if (!start || !end) return null;
  try {
    const d = Math.floor((new Date(end).getTime() - new Date(start).getTime()) / 86400000) + 1;
    return d > 0 ? d : null;
  } catch { return null; }
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
        console.warn(`[API] Rate limit (429) detectado en recálculo. Reintentando en ${backoffDelay}ms... `);
        await new Promise(r => setTimeout(r, backoffDelay));
        attempt++;
      } else {
        throw err;
      }
    }
  }
};

function RecalcularPuntajesMasivo() {
  const { isRunning, progress, stats, currentStatus, startAudit } = useAudit();
  
  const handleRecalculate = async () => {
    if (!confirm('¿Seguro que deseas recalcular la experiencia y capacitación de TODOS los funcionarios (activos e inactivos)? Esto puede tomar varios minutos. Podrás seguir navegando por la aplicación mientras se procesa.')) return;
    startAudit();
  };

  return (
    <Card className="border-indigo-200 bg-indigo-50 mt-6 shadow-sm">
      <CardContent className="p-5 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <h3 className="text-base font-semibold text-indigo-900 flex items-center gap-2">
            <RefreshCw className="w-5 h-5 text-indigo-600" /> Recálculo Masivo de Puntajes
          </h3>
          <p className="text-sm text-indigo-700 mt-1 max-w-xl">
            Esta herramienta recalcula y actualiza los días efectivos, bienios contables, puntos de experiencia y puntos 
            de capacitación de todos los funcionarios (incluyendo inactivos) basándose en la última data registrada.
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

const BATCH_SIZE = 5;
const BATCH_PAUSE = 600;

function HerramientaLimpiezaDias() {
  const [status, setStatus] = useState('idle'); // idle | loading | running | done
  const [allPeriods, setAllPeriods] = useState([]);
  const [toFix, setToFix] = useState([]);
  const [progress, setProgress] = useState(0);
  const [updated, setUpdated] = useState(0);
  const [errors, setErrors] = useState(0);
  const [isCanceled, setIsCanceled] = useState(false);

  const handleAnalyze = async () => {
    setStatus('loading');
    const periods = await base44.entities.ServicePeriod.list(null, 9999);
    const needFix = periods.filter(p => {
      if (!p.start_date || !p.end_date) return false;
      const correct = calcDays(p.start_date, p.end_date);
      return correct !== null && p.days_count !== correct;
    });
    setAllPeriods(periods);
    setToFix(needFix);
    setStatus('idle');
  };

  const handleRun = async () => {
    setIsCanceled(false);
    setStatus('running');
    setProgress(0);
    setUpdated(0);
    setErrors(0);
    let done = 0;
    let updCount = 0;
    let errCount = 0;

    for (let i = 0; i < toFix.length; i += BATCH_SIZE) {
      if (isCanceled) break;
      const batch = toFix.slice(i, i + BATCH_SIZE);
      await Promise.all(batch.map(async (p) => {
        const correct = calcDays(p.start_date, p.end_date);
        try {
          await safeApiCall(() => base44.entities.ServicePeriod.update(p.id, { days_count: correct }), 3, 200);
          updCount++;
        } catch (err) {
          errCount++;
        }
      }));
      done += batch.length;
      setProgress(Math.round((done / toFix.length) * 100));
      setUpdated(updCount);
      setErrors(errCount);
      if (i + BATCH_SIZE < toFix.length) await sleep(BATCH_PAUSE);
    }
    setStatus('done');
  };

  const handleReset = () => {
    setStatus('idle');
    setAllPeriods([]);
    setToFix([]);
    setProgress(0);
    setUpdated(0);
    setErrors(0);
    setIsCanceled(false);
  };

  return (
    <Card className="border-slate-200 shadow-sm overflow-hidden">
      <CardHeader className="pb-3 border-b bg-slate-50/50">
        <CardTitle className="text-sm font-bold text-slate-800 flex items-center gap-2">
          <RefreshCw className="w-4 h-4 text-indigo-500" /> Auditoría de Días de Períodos
        </CardTitle>
      </CardHeader>
      <CardContent className="p-4 space-y-3">
        <p className="text-xs text-slate-500">
          Detecta períodos cuyo campo <code className="bg-slate-100 px-1 rounded text-indigo-700">days_count</code> no coincide
          con la diferencia real entre inicio y término (incluyendo ambos días), y los corrige en lotes.
        </p>

        {status === 'idle' && allPeriods.length === 0 && (
          <Button size="sm" variant="outline" onClick={handleAnalyze}>
            Analizar discrepancias
          </Button>
        )}

        {status === 'loading' && (
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <Loader2 className="w-3.5 h-3.5 animate-spin" /> Cargando períodos...
          </div>
        )}

        {status === 'idle' && allPeriods.length > 0 && (
          <div className="space-y-3">
            <div className="flex gap-4 text-xs text-slate-600">
              <span>Total períodos: <strong>{allPeriods.length}</strong></span>
              <span className={toFix.length > 0 ? 'text-amber-700 font-semibold' : 'text-emerald-700 font-semibold'}>
                {toFix.length > 0 ? `${toFix.length} requieren corrección` : '✓ Todos correctos'}
              </span>
            </div>
            {toFix.length > 0 ? (
              <div className="flex gap-2">
                <Button size="sm" className="bg-slate-800 hover:bg-slate-900" onClick={handleRun}>
                  <RefreshCw className="w-3.5 h-3.5 mr-1" /> Corregir {toFix.length} períodos
                </Button>
                <Button size="sm" variant="ghost" onClick={handleReset}>Cancelar</Button>
              </div>
            ) : (
              <Button size="sm" variant="ghost" onClick={handleReset}>
                <RotateCcw className="w-3.5 h-3.5 mr-1" /> Nueva verificación
              </Button>
            )}
          </div>
        )}

        {status === 'running' && (
          <div className="space-y-2 pt-2">
            <div className="flex items-center justify-between text-xs text-slate-600">
              <span className="flex items-center gap-1.5 font-medium">
                <Loader2 className="w-3.5 h-3.5 animate-spin text-indigo-500" />
                Procesando... {Math.round((progress / 100) * toFix.length)} / {toFix.length}
              </span>
              <button className="text-red-500 hover:underline text-[10px]" onClick={() => setIsCanceled(true)}>
                Detener
              </button>
            </div>
            <Progress value={progress} className="h-1.5" />
            <div className="flex gap-4 text-[10px]">
              {updated > 0 && <span className="text-emerald-700 font-medium">✓ {updated} actualizados</span>}
              {errors > 0 && <span className="text-red-600 font-medium">✗ {errors} errores</span>}
            </div>
          </div>
        )}

        {status === 'done' && (
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-emerald-700 text-sm font-semibold">
              <CheckCircle2 className="w-4 h-4" /> Proceso completado
            </div>
            <div className="flex gap-4 text-xs">
              <span className="text-emerald-700 font-medium">✓ {updated} períodos corregidos</span>
              {errors > 0 && <span className="text-red-600 font-medium">✗ {errors} errores</span>}
            </div>
            <Button size="sm" variant="ghost" onClick={handleReset} className="h-7 text-xs">
              <RotateCcw className="w-3.5 h-3.5 mr-1" /> Nueva verificación
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

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

  // Agrupar por empleado
  const employeeServiceMap = {};
  const employeeTrainingMap = {};

  servicePeriods.forEach(sp => {
    if (!employeeServiceMap[sp.employee_id]) employeeServiceMap[sp.employee_id] = [];
    employeeServiceMap[sp.employee_id].push(sp);
  });

  trainings.forEach(t => {
    if (!employeeTrainingMap[t.employee_id]) employeeTrainingMap[t.employee_id] = [];
    employeeTrainingMap[t.employee_id].push(t);
  });

  // Analizar
  const noExperience = employees.filter(e => !employeeServiceMap[e.id] || (e.total_experience_days || 0) === 0);
  const noTraining = employees.filter(e => (e.training_points || 0) === 0);
  const noEither = employees.filter(e => ((e.training_points || 0) === 0) && (!employeeServiceMap[e.id] || (e.total_experience_days || 0) === 0));

  if (isLoading) {
    return (
      <div className="p-6 flex justify-center items-center min-h-screen">
        <Loader className="w-6 h-6 animate-spin text-slate-400" />
      </div>
    );
  }

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Auditoría de Datos</h1>
        <p className="text-sm text-slate-500 mt-1">Funcionarios sin información de experiencia o capacitación</p>
      </div>

      <RecalcularPuntajesMasivo />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start">
        <HerramientaLimpiezaDias />
        <Card className="border-slate-200 shadow-sm h-full">
          <CardHeader className="pb-3 border-b bg-slate-50/50">
            <CardTitle className="text-sm font-bold text-slate-800">Resumen de Registros</CardTitle>
          </CardHeader>
          <CardContent className="p-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="p-3 bg-white border rounded text-center">
                <p className="text-[10px] font-semibold text-slate-500 uppercase">Períodos</p>
                <p className="text-xl font-bold text-slate-900 mt-1">{servicePeriods.length}</p>
              </div>
              <div className="p-3 bg-white border rounded text-center">
                <p className="text-[10px] font-semibold text-slate-500 uppercase">Capacitaciones</p>
                <p className="text-xl font-bold text-slate-900 mt-1">{trainings.length}</p>
              </div>
              <div className="p-3 bg-white border rounded text-center">
                <p className="text-[10px] font-semibold text-slate-500 uppercase">Permisos</p>
                <p className="text-xl font-bold text-slate-900 mt-1">{leaves.length}</p>
              </div>
              <div className="p-3 bg-white border rounded text-center">
                <p className="text-[10px] font-semibold text-slate-500 uppercase">Funcionarios</p>
                <p className="text-xl font-bold text-slate-900 mt-1">{employees.length}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="pt-4">
        <h2 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2">
          <AlertTriangle className="w-5 h-5 text-amber-500" />
          Detección de Vacíos Críticos
        </h2>
      </div>

      {/* Sin experiencia */}
      {noExperience.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2 text-red-700">
              <AlertTriangle className="w-4 h-4" /> Sin períodos de servicio ({noExperience.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {noExperience.map(emp => (
                <div key={emp.id} className="flex items-center justify-between p-2 bg-slate-50 rounded text-sm">
                  <div>
                    <p className="font-medium text-slate-900">{emp.full_name}</p>
                    <p className="text-xs text-slate-500">{emp.rut}</p>
                  </div>
                  <Badge variant="destructive" className="bg-red-100 text-red-700">{emp.category}</Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Sin capacitación */}
      {noTraining.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2 text-orange-700">
              <AlertTriangle className="w-4 h-4" /> Sin capacitación ({noTraining.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {noTraining.map(emp => (
                <div key={emp.id} className="flex items-center justify-between p-2 bg-slate-50 rounded text-sm">
                  <div>
                    <p className="font-medium text-slate-900">{emp.full_name}</p>
                    <p className="text-xs text-slate-500">{emp.rut}</p>
                  </div>
                  <Badge variant="outline" className="bg-orange-100 text-orange-700">{emp.category}</Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Sin ambos */}
      {noEither.length > 0 && (
        <Card className="border-rose-300 bg-rose-50">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2 text-rose-700">
              <AlertTriangle className="w-4 h-4" /> Crítico: Sin experiencia ni capacitación ({noEither.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {noEither.map(emp => (
                <div key={emp.id} className="flex items-center justify-between p-2 bg-white rounded text-sm border border-rose-200">
                  <div>
                    <p className="font-bold text-rose-900">{emp.full_name}</p>
                    <p className="text-xs text-rose-700">{emp.rut}</p>
                  </div>
                  <Badge variant="destructive" className="bg-rose-200 text-rose-900">{emp.category}</Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {noExperience.length === 0 && noTraining.length === 0 && (
        <Card className="border-emerald-200 bg-emerald-50">
          <CardContent className="p-6 text-center">
            <CheckCircle2 className="w-8 h-8 text-emerald-600 mx-auto mb-2" />
            <p className="text-emerald-700 font-semibold">¡Excelente!</p>
            <p className="text-sm text-emerald-600 mt-1">Todos los funcionarios tienen información de experiencia y capacitación.</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}