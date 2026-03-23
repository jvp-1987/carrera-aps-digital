import { createContext, useContext, useState, useRef, useCallback } from 'react';
import { base44 } from '@/api/base44Client';
import { toast } from 'sonner';

const ImportContext = createContext(null);

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

function normalizeRUT(rut) {
  return (rut || '').toString().replace(/\./g, '').replace(/,/g, '').replace(/\s/g, '').trim().toUpperCase();
}

async function importEmployee(emp, rutMap) {
  const payload = {
    rut: emp.rut, full_name: emp.full_name, category: emp.category,
    current_level: emp.current_level, position: emp.position || '',
    bienios_count: emp.bienios_count || 0, total_points: emp.total_points || 0,
    status: 'Activo',
  };

  let savedEmp;
  if (rutMap[emp.rut]) {
    await base44.entities.Employee.update(rutMap[emp.rut].id, payload);
    savedEmp = { ...rutMap[emp.rut], ...payload };
    const [oldPeriods, oldTrainings] = await Promise.all([
      base44.entities.ServicePeriod.filter({ employee_id: savedEmp.id }),
      base44.entities.Training.filter({ employee_id: savedEmp.id }),
    ]);
    await Promise.all([
      ...oldPeriods.map(p => base44.entities.ServicePeriod.delete(p.id)),
      ...oldTrainings.map(t => base44.entities.Training.delete(t.id)),
    ]);
  } else {
    savedEmp = await base44.entities.Employee.create(payload);
  }

  const validTypes = ['Planta', 'Plazo Fijo', 'Honorarios', 'Reemplazo'];
  const validLevels = ['Básico', 'Intermedio', 'Avanzado', 'Postgrado'];

  const calcDays = (start, end) => {
    if (!start || !end) return null;
    try {
      const s = new Date(start), e = new Date(end);
      const d = Math.floor((e - s) / (1000 * 60 * 60 * 24)) + 1;
      return d > 0 ? d : null;
    } catch { return null; }
  };

  const periodosValidos = (emp.experiencia || [])
    .filter(e => e.tipo_periodo && e.fecha_inicio)
    .map(e => ({
      employee_id: savedEmp.id,
      period_type: validTypes.find(t => t.toLowerCase() === e.tipo_periodo.toLowerCase()) || 'Planta',
      start_date: e.fecha_inicio, end_date: e.fecha_fin || '',
      institution: e.institucion || '',
      days_count: calcDays(e.fecha_inicio, e.fecha_fin) || (e.dias ? parseInt(e.dias) || null : null),
      is_active: !e.fecha_fin, conflict_status: 'Sin Conflicto',
    }));

  const capacitacionesValidas = (emp.capacitacion || [])
    .filter(c => c.nombre_curso)
    .map(c => ({
      employee_id: savedEmp.id, course_name: c.nombre_curso,
      institution: c.institucion || '',
      hours: parseFloat((c.horas || '0').toString().replace(',', '.')) || 0,
      grade: parseFloat((c.nota || '0').toString().replace(',', '.')) || 4.0,
      technical_level: validLevels.find(l => l.toLowerCase().includes((c.nivel_tecnico || '').toLowerCase())) || 'Básico',
      completion_date: c.fecha || '',
      calculated_points: parseFloat((c.puntaje || '0').toString().replace(',', '.')) || 0,
      status: 'Validado',
    }));

  await Promise.all([
    periodosValidos.length > 0 ? base44.entities.ServicePeriod.bulkCreate(periodosValidos) : Promise.resolve(),
    capacitacionesValidas.length > 0 ? base44.entities.Training.bulkCreate(capacitacionesValidas) : Promise.resolve(),
  ]);
}

export function ImportProvider({ children }) {
  const [state, setState] = useState({
    status: 'idle', // idle | running | paused | done | error
    employees: [],   // parsed employees
    currentIndex: 0,
    ok: [],
    failed: [],
    skipped: 0,
    errorInfo: null,
  });

  const abortRef = useRef(false);

  const setEmployees = useCallback((emps) => {
    setState(s => ({ ...s, employees: emps, status: 'idle', ok: [], failed: [], currentIndex: 0, errorInfo: null }));
  }, []);

  const startImport = useCallback(async (employees, rutMap, startFrom = 0, skipExisting = false) => {
    const valid = employees.filter(e => e.errors.length === 0);
    if (!valid.length) { toast.error('No hay funcionarios válidos'); return; }

    abortRef.current = false;
    setState(s => ({ ...s, status: 'running', currentIndex: startFrom, errorInfo: null }));

    const ok = [];
    const failed = [];
    let skippedCount = employees.length - valid.length;

    for (let i = startFrom; i < valid.length; i++) {
      if (abortRef.current) break;
      setState(s => ({ ...s, currentIndex: i }));
      const emp = valid[i];

      // Saltar si ya existe en la BD y el usuario eligió omitir existentes
      if (skipExisting && rutMap[emp.data.rut]) {
        skippedCount++;
        continue;
      }

      try {
        await importEmployee(emp.data, rutMap);
        ok.push(emp.sheetName);
        setState(s => ({ ...s, ok: [...s.ok, emp.sheetName] }));
      } catch (err) {
        const errorMsg = err?.message || 'Error desconocido';
        failed.push({ name: emp.sheetName, error: errorMsg });
        setState(s => ({
          ...s, status: 'error', failed: [...s.failed, { name: emp.sheetName, error: errorMsg }],
          errorInfo: { emp: emp.sheetName, error: errorMsg, resumeFrom: i + 1 },
        }));
        return;
      }
      if (i < valid.length - 1) await sleep(300);
    }

    setState(s => ({
      ...s, status: 'done', ok, failed,
      skipped: skippedCount,
    }));
    toast.success(`${ok.length} funcionario(s) importado(s) correctamente`);
  }, []);

  const resumeImport = useCallback((employees, rutMap, from) => {
    setState(s => ({ ...s, status: 'running', errorInfo: null }));
    startImport(employees, rutMap, from);
  }, [startImport]);

  const cancelImport = useCallback(() => {
    abortRef.current = true;
    setState({ status: 'idle', employees: [], currentIndex: 0, ok: [], failed: [], skipped: 0, errorInfo: null });
    sessionStorage.removeItem('importedData');
  }, []);

  const resetImport = useCallback(() => {
    abortRef.current = true;
    setState({ status: 'idle', employees: [], currentIndex: 0, ok: [], failed: [], skipped: 0, errorInfo: null });
    sessionStorage.removeItem('importedData');
  }, []);

  const validCount = state.employees.filter(e => e.errors?.length === 0).length;

  return (
    <ImportContext.Provider value={{ state, validCount, setEmployees, startImport, resumeImport, cancelImport, resetImport }}>
      {children}
    </ImportContext.Provider>
  );
}

export function useImport() {
  return useContext(ImportContext);
}