import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { AlertTriangle, CheckCircle2, Loader, RefreshCw, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { calculateEffectiveDays, calculateBienios, calculateBienioPoints, calculateNextBienioDate, calculatePostitlePercentage } from '@/components/calculations';

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

function RecalcularPuntajesMasivo({ employees, servicePeriods, trainings, leaves }) {
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [stats, setStats] = useState(null);
  
  const handleRecalculate = async () => {
    if (!confirm('¿Seguro que deseas recalcular la experiencia y capacitación de TODOS los funcionarios? Esto puede tomar varios minutos.')) return;
    
    setRunning(true);
    setStats(null);
    let ok = 0, errors = 0;
    
    for (let i = 0; i < employees.length; i++) {
      const emp = employees[i];
      try {
        const empPeriods = servicePeriods.filter(p => p.employee_id === emp.id);
        const empLeaves = leaves.filter(l => l.employee_id === emp.id);
        const empTrainings = trainings.filter(t => t.employee_id === emp.id);

        const tLeave = empLeaves.reduce((s, l) => s + parseInt(l.days_count || 0), 0);
        const eDays = calculateEffectiveDays(empPeriods, tLeave);
        const b = calculateBienios(eDays);
        const bp = calculateBienioPoints(emp.category, b);
        const nbd = calculateNextBienioDate(empPeriods, tLeave, b);

        const validated = empTrainings.filter(t => t.status === 'Validado');
        const tPts = validated.reduce((s, t) => s + (parseFloat(t.calculated_points) || 0), 0);
        const pHours = validated.filter(t => t.is_postitle).reduce((s, t) => s + (parseFloat(t.postitle_hours) || 0), 0);
        const pPct = calculatePostitlePercentage(emp.category, pHours);

        const totalPts = Math.round((bp + tPts) * 100) / 100;

        await safeApiCall(() => base44.entities.Employee.update(emp.id, {
          total_experience_days: eDays,
          total_leave_days: tLeave,
          bienios_count: b,
          bienio_points: bp,
          next_bienio_date: nbd,
          training_points: tPts,
          postitle_percentage: pPct,
          total_points: totalPts,
        }), 6, 400);

        ok++;
      } catch (err) {
        console.error(`Error updating employee ${emp.id}:`, err);
        errors++;
      }
      setProgress(Math.round(((i + 1) / employees.length) * 100));
    }
    
    setRunning(false);
    setStats({ ok, errors });
    toast.success(`Recálculo masivo terminado. Actualizados: ${ok}, Errores: ${errors}`);
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
            de capacitación de los {employees.length} funcionarios basándose en la última data registrada.
          </p>
        </div>
        <div className="flex flex-col items-end gap-2 text-sm text-indigo-800 font-medium whitespace-nowrap w-full md:w-auto">
          {running ? (
            <div className="flex items-center gap-2 bg-indigo-100 px-4 py-2 rounded-md border border-indigo-200 w-full md:w-auto justify-center">
              <Loader2 className="w-4 h-4 animate-spin text-indigo-600"/> Procesando... {progress}%
            </div>
          ) : (
            <>
              <Button size="lg" className="bg-indigo-600 hover:bg-indigo-700 w-full md:w-auto text-sm" onClick={handleRecalculate}>
                Iniciar Recálculo ({employees.length})
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

      <RecalcularPuntajesMasivo employees={employees} servicePeriods={servicePeriods} trainings={trainings} leaves={leaves} />

      {/* Resumen */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <p className="text-xs font-semibold text-slate-500 uppercase">Total</p>
            <p className="text-2xl font-bold text-slate-900 mt-1">{employees.length}</p>
          </CardContent>
        </Card>
        <Card className="border-red-200 bg-red-50">
          <CardContent className="p-4">
            <p className="text-xs font-semibold text-red-600 uppercase">Sin experiencia</p>
            <p className="text-2xl font-bold text-red-900 mt-1">{noExperience.length}</p>
          </CardContent>
        </Card>
        <Card className="border-orange-200 bg-orange-50">
          <CardContent className="p-4">
            <p className="text-xs font-semibold text-orange-600 uppercase">Sin capacitación</p>
            <p className="text-2xl font-bold text-orange-900 mt-1">{noTraining.length}</p>
          </CardContent>
        </Card>
        <Card className="border-rose-200 bg-rose-50">
          <CardContent className="p-4">
            <p className="text-xs font-semibold text-rose-600 uppercase">Sin ambos</p>
            <p className="text-2xl font-bold text-rose-900 mt-1">{noEither.length}</p>
          </CardContent>
        </Card>
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
                  <Badge className="bg-red-100 text-red-700">{emp.category}</Badge>
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
                  <Badge className="bg-orange-100 text-orange-700">{emp.category}</Badge>
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
                  <Badge className="bg-rose-200 text-rose-900">{emp.category}</Badge>
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