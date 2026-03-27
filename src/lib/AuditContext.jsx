import { createContext, useContext, useState, useCallback } from 'react';
import { base44 } from '@/api/base44Client';
import { toast } from 'sonner';
import { 
  calculateEffectiveDays, 
  calculateBienios, 
  calculateBienioPoints, 
  calculateNextBienioDate, 
  calculatePostitlePercentage, 
  calculateTrainingPoints,
  getMaxTrainingPoints 
} from '@/components/calculations';

const AuditContext = createContext(null);

const safeApiCall = async (apiFn, maxRetries = 5, baseDelay = 400) => {
  let attempt = 0;
  while (attempt < maxRetries) {
    try {
      const result = await apiFn();
      // Pequeño delay para no saturar
      await new Promise(r => setTimeout(r, 100));
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

const fetchAll = async (entity) => {
  let all = [];
  let offset = 0;
  const limit = 2000;
  while (true) {
    const batch = await safeApiCall(() => entity.list(null, limit, offset));
    if (!batch || batch.length === 0) break;
    all = [...all, ...batch];
    if (batch.length < limit) break;
    offset += limit;
  }
  return all;
};

export function AuditProvider({ children }) {
  const [isRunning, setIsRunning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [stats, setStats] = useState(null);

  const [currentStatus, setCurrentStatus] = useState('');

  const startAudit = useCallback(async (employees) => {
    if (isRunning) return;
    
    setIsRunning(true);
    setProgress(0);
    setStats(null);
    setCurrentStatus('Iniciando descarga de datos...');
    let ok = 0, errors = 0;
    
    // Iniciar loop de fondo
    (async () => {
      try {
        // Precarga masiva eficiente con fetchAll (maneja paginación de 5000)
        setCurrentStatus('Descargando periodos de servicio...');
        const allPeriods = await fetchAll(base44.entities.ServicePeriod);
        
        setCurrentStatus('Descargando registros de capacitación...');
        const allTrainings = await fetchAll(base44.entities.Training);
        
        setCurrentStatus('Descargando permisos sin goce...');
        const allLeaves = await fetchAll(base44.entities.LeaveWithoutPay);

        // Agrupar en memoria para velocidad O(1) en el loop
        const periodMap = {};
        allPeriods.forEach(p => {
          if (!periodMap[p.employee_id]) periodMap[p.employee_id] = [];
          periodMap[p.employee_id].push(p);
        });
        const trainingMap = {};
        allTrainings.forEach(t => {
          if (!trainingMap[t.employee_id]) trainingMap[t.employee_id] = [];
          trainingMap[t.employee_id].push(t);
        });
        const leaveMap = {};
        allLeaves.forEach(l => {
          if (!leaveMap[l.employee_id]) leaveMap[l.employee_id] = [];
          leaveMap[l.employee_id].push(l);
        });

        setCurrentStatus('Iniciando recálculo...');

        for (let i = 0; i < employees.length; i++) {
          const emp = employees[i];
          setCurrentStatus(`Procesando: ${emp.full_name}`);
          try {
            const empPeriods = periodMap[emp.id] || [];
            const empLeaves = leaveMap[emp.id] || [];
            const empTrainings = trainingMap[emp.id] || [];
            
            const tLeave = empLeaves.reduce((s, l) => s + (parseInt(l.days_count) || 0), 0);
            const eDays = calculateEffectiveDays(empPeriods, tLeave);
            const b = calculateBienios(eDays);
            const bp = calculateBienioPoints(emp.category, b);
            const nbd = calculateNextBienioDate(empPeriods, tLeave, b);

            const validated = empTrainings.filter(t => t.status === 'Validado');
            const rawSum = validated.reduce((s, t) => {
              const pts = calculateTrainingPoints(parseFloat(t.hours || 0), parseFloat(t.grade || 0), t.technical_level);
              return s + pts;
            }, 0);
            const pHours = validated.filter(t => t.is_postitle).reduce((s, t) => s + (parseFloat(t.postitle_hours) || 0), 0);
            const pPct = calculatePostitlePercentage(emp.category, pHours);
            
            const maxPossible = getMaxTrainingPoints(emp.category, eDays);
            const finalTrainingPts = Math.min(maxPossible, Math.round(rawSum * 100) / 100);
            const totalPts = Math.round((bp + finalTrainingPts) * 100) / 100;

            await safeApiCall(() => base44.entities.Employee.update(emp.id, {
              total_experience_days: eDays,
              total_leave_days: tLeave,
              bienios_count: b,
              bienio_points: bp,
              next_bienio_date: nbd,
              training_points: finalTrainingPts,
              postitle_percentage: pPct,
              total_points: totalPts,
            }), 6, 200);

            ok++;
          } catch (err) {
            console.error(`Audit error for ${emp.id}:`, err);
            errors++;
          }
          setProgress(Math.round(((i + 1) / employees.length) * 100));
        }
        setIsRunning(false);
        setStats({ ok, errors });
        setCurrentStatus('');
        toast.success(`Auditoría terminada. ${ok} actualizados, ${errors} errores.`);
      } catch (globalErr) {
        console.error("Critical audit error:", globalErr);
        setIsRunning(false);
        setCurrentStatus('Error crítico en auditoría.');
        toast.error('Error al descargar datos masivos.');
      }
    })();
    
    return true;
  }, [isRunning]);

  return (
    <AuditContext.Provider value={{ isRunning, progress, stats, currentStatus, startAudit }}>
      {children}
    </AuditContext.Provider>
  );
}

export const useAudit = () => useContext(AuditContext);
