import { createContext, useContext, useState, useCallback } from 'react';
import { base44 } from '@/api/base44Client';
import { toast } from 'sonner';
import { 
  calculateEffectiveDays, 
  calculateBienios, 
  calculateBienioPoints, 
  calculateNextBienioDate, 
  calculatePostitlePercentage, 
  calculateTrainingPoints 
} from '@/components/calculations';

const AuditContext = createContext();

const safeApiCall = async (apiFn, maxRetries = 5, baseDelay = 400) => {
  let attempt = 0;
  while (attempt < maxRetries) {
    try {
      const result = await apiFn();
      await new Promise(r => setTimeout(r, baseDelay));
      return result;
    } catch (err) {
      const isRateLimit = err?.response?.status === 429 || err?.status === 429 || String(err).includes('429');
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

export function AuditProvider({ children }) {
  const [isRunning, setIsRunning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [stats, setStats] = useState(null);

  const startAudit = useCallback(async (employees, servicePeriods, trainings, leaves) => {
    if (isRunning) return;
    
    setIsRunning(true);
    setProgress(0);
    setStats(null);
    let ok = 0, errors = 0;
    
    // Agrupar para rapidez
    const periodMap = {};
    servicePeriods.forEach(p => {
      if (!periodMap[p.employee_id]) periodMap[p.employee_id] = [];
      periodMap[p.employee_id].push(p);
    });
    const trainingMap = {};
    trainings.forEach(t => {
      if (!trainingMap[t.employee_id]) trainingMap[t.employee_id] = [];
      trainingMap[t.employee_id].push(t);
    });
    const leaveMap = {};
    leaves.forEach(l => {
      if (!leaveMap[l.employee_id]) leaveMap[l.employee_id] = [];
      leaveMap[l.employee_id].push(l);
    });

    // Iniciar loop de fondo
    (async () => {
      for (let i = 0; i < employees.length; i++) {
        const emp = employees[i];
        try {
          const empPeriods = periodMap[emp.id] || [];
          const empLeaves = leaveMap[emp.id] || [];
          const empTrainings = trainingMap[emp.id] || [];

          const tLeave = empLeaves.reduce((s, l) => s + parseInt(l.days_count || 0), 0);
          const eDays = calculateEffectiveDays(empPeriods, tLeave);
          const b = calculateBienios(eDays);
          const bp = calculateBienioPoints(emp.category, b);
          const nbd = calculateNextBienioDate(empPeriods, tLeave, b);

          const validated = empTrainings.filter(t => t.status === 'Validado');
          const tPts = validated.reduce((s, t) => {
            let pts = parseFloat(t.calculated_points) || 0;
            if (pts === 0 && t.hours > 0 && t.grade > 0) {
              pts = calculateTrainingPoints(parseFloat(t.hours), parseFloat(t.grade), t.technical_level);
            }
            return s + pts;
          }, 0);
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
          }), 6, 300);

          ok++;
        } catch (err) {
          console.error(`Audit error for ${emp.id}:`, err);
          errors++;
        }
        setProgress(Math.round(((i + 1) / employees.length) * 100));
      }
      setIsRunning(false);
      setStats({ ok, errors });
      toast.success(`Auditoría terminada. ${ok} actualizados, ${errors} errores.`);
    })();
    
    return true;
  }, [isRunning]);

  return (
    <AuditContext.Provider value={{ isRunning, progress, stats, startAudit }}>
      {children}
    </AuditContext.Provider>
  );
}

export const useAudit = () => useContext(AuditContext);
