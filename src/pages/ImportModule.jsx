import { useState, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import * as XLSX from 'xlsx';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  Upload, CheckCircle2, XCircle, AlertTriangle,
  FileSpreadsheet, RotateCcw, ClipboardCheck, User, ChevronDown, ChevronRight
} from 'lucide-react';
import { toast } from 'sonner';

// ── Helpers ─────────────────────────────────────────────────────
function normalizeRUT(rut) {
  return (rut || '').toString()
    .replace(/\./g, '').replace(/,/g, '').replace(/\s/g, '')
    .trim().toUpperCase();
}

function normalizeDateString(dateStr) {
  if (!dateStr) return '';
  const str = String(dateStr).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) return str;
  const match = str.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (match) {
    const [, day, month, year] = match;
    return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  }
  if (/^\d+$/.test(str)) {
    const num = parseInt(str);
    if (num > 0 && num < 100000) {
      const date = new Date((num - 25569) * 86400 * 1000);
      return date.toISOString().split('T')[0];
    }
  }
  return str;
}

function cellStr(sheet, col, row) {
  const cell = sheet[XLSX.utils.encode_cell({ c: col, r: row })];
  if (!cell) return '';
  // Para celdas de fecha, usar el valor formateado (cell.w) que trae DD/MM/YYYY
  if (cell.t === 'd' || (cell.t === 'n' && cell.w && /\d{1,2}[\/\-]\d{1,2}[\/\-]\d{4}/.test(cell.w))) {
    return cell.w ? cell.w.trim() : '';
  }
  return String(cell.v ?? '').trim();
}

// Parsea "Cat. B · Nivel 8 · 5.306 pts · $ 961.886 · 7 bienios"
function parseHeaderString(header) {
  const catMatch = header.match(/Cat\.\s*([A-Fa-f])/);
  const nivelMatch = header.match(/Nivel\s+(\d+)/i);
  const ptsMatch = header.match(/([\d.,]+)\s*pts/i);
  const bieniosMatch = header.match(/(\d+)\s*bienios/i);
  return {
    category: catMatch ? catMatch[1].toUpperCase() : '',
    current_level: nivelMatch ? parseInt(nivelMatch[1]) : null,
    total_points: ptsMatch ? parseFloat(ptsMatch[1].replace(/\./g, '').replace(',', '.')) : null,
    bienios_count: bieniosMatch ? parseInt(bieniosMatch[1]) : null,
  };
}

// ── Parser de hoja formato CarreraFuncionaria ────────────────────
// Estructura:
//   Row 0: "Cat. X · Nivel Y · Z pts · $ W · N bienios"
//   Row 1: "DATOS PERSONALES"
//   Row 2: "RUT" | rut | | "Cargo" | cargo
//   Row 3: "Profesión" | prof | | "Universidad" | univ
//   Row 4: "Fecha Nacimiento" | fecha | | "Edad" | edad
//   ... más pares clave-valor hasta llegar a sección de experiencia o capacitación
//
// Secciones de experiencia y capacitación se detectan por sus headers.
function parseCarreraSheet(sheet, sheetName) {
  if (!sheet || !sheet['!ref']) return null;
  const range = XLSX.utils.decode_range(sheet['!ref']);
  const maxRow = range.e.r;

  // Fila 1 (r=0): Nombre del funcionario
  let fullNameFromSheet = '';
  for (let c = 0; c <= range.e.c; c++) {
    const v = cellStr(sheet, c, 0);
    if (v) { fullNameFromSheet = v; break; }
  }

  // Fila 2 (r=1): Encabezado de carrera "Cat. X · Nivel Y · Z pts · N bienios"
  let headerStr = '';
  for (let c = 0; c <= range.e.c; c++) {
    const v = cellStr(sheet, c, 1);
    if (v && /Cat\.\s*[A-Fa-f]/i.test(v)) { headerStr = v; break; }
  }
  // Fallback: buscar en filas siguientes si no estaba en fila 2
  if (!headerStr) {
    for (let r = 2; r <= Math.min(9, maxRow); r++) {
      for (let c = 0; c <= range.e.c; c++) {
        const v = cellStr(sheet, c, r);
        if (v && /Cat\.\s*[A-Fa-f]/i.test(v) && /Nivel/i.test(v)) { headerStr = v; break; }
      }
      if (headerStr) break;
    }
  }
  const headerData = parseHeaderString(headerStr);

  // Helper: normaliza texto para comparación
  const norm = (s) => (s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();

  // Helper: lee toda una fila como string normalizado para detectar secciones
  const rowText = (r) => {
    let t = '';
    for (let c = 0; c <= range.e.c; c++) t += ' ' + norm(cellStr(sheet, c, r));
    return t;
  };

  const kvData = {};
  let experienciaRows = [];
  let capacitacionRows = [];
  let inExperiencia = false;
  let inCapacitacion = false;
  let expHeaders = null;
  let capHeaders = null;

  for (let r = 2; r <= maxRow; r++) {
    const rt = rowText(r);
    const c0 = norm(cellStr(sheet, 0, r));
    const c1 = cellStr(sheet, 1, r);
    const c3 = norm(cellStr(sheet, 3, r));
    const c4 = cellStr(sheet, 4, r);

    // Detectar inicio de sección: busca en toda la fila
    const c0raw = cellStr(sheet, 0, r);
    const c0normRaw = norm(c0raw);
    const isExpRow = /experiencia|periodos\s*de\s*servicio|servicio\s*anterior|historia\s*laboral/i.test(rt);
    const isCapRow = /capacitaci|entrenamiento|formaci|curso|capacitacion/i.test(rt);

    if (isExpRow) {
      inExperiencia = true; inCapacitacion = false; expHeaders = null; continue;
    }
    if (isCapRow) {
      inCapacitacion = true; inExperiencia = false; capHeaders = null; continue;
    }

    if (inExperiencia) {
      // Primera fila no vacía = headers de la tabla
      if (!expHeaders && rt.trim().length > 2) {
        expHeaders = {};
        for (let c = 0; c <= range.e.c; c++) {
          const h = norm(cellStr(sheet, c, r));
          if (h) expHeaders[h] = c;
        }
        continue;
      }
      if (expHeaders) {
        const findCol = (...keys) => {
          for (const k of keys) {
            const found = Object.keys(expHeaders).find(h => h.includes(k));
            if (found !== undefined) return cellStr(sheet, expHeaders[found], r);
          }
          return '';
        };
        // El establecimiento contiene el tipo en paréntesis: "CESFAM X (Reemplazo)"
        const establecimiento = findCol('establecimiento', 'institucion', 'instituc', 'lugar');
        if (!establecimiento) continue;
        // Saltar fila TOTAL
        if (norm(establecimiento).includes('total')) continue;

        // Extraer tipo de período desde los paréntesis
        const tipoMatch = establecimiento.match(/\(([^)]+)\)/);
        const tipoRaw = tipoMatch ? tipoMatch[1].toLowerCase() : '';
        let tipo_periodo = 'Planta';
        if (tipoRaw.includes('reemplazo')) tipo_periodo = 'Reemplazo';
        else if (tipoRaw.includes('honorario')) tipo_periodo = 'Honorarios';
        else if (tipoRaw.includes('contrata') || tipoRaw.includes('contrato') || tipoRaw.includes('plazo')) tipo_periodo = 'Plazo Fijo';
        else if (tipoRaw.includes('titular') || tipoRaw.includes('planta')) tipo_periodo = 'Planta';

        // Institución = establecimiento sin el paréntesis del tipo
        const institucion = establecimiento.replace(/\s*\([^)]*\)\s*$/, '').trim();

        experienciaRows.push({
          tipo_periodo,
          institucion,
          fecha_inicio: normalizeDateString(findCol('inicio', 'desde', 'fecha inicio')),
          fecha_fin: normalizeDateString(findCol('termino', 'término', 'fin', 'hasta')),
          dias: findCol('dias', 'días'),
        });
      }
      continue;
    }

    if (inCapacitacion) {
      if (!capHeaders && rt.trim().length > 2) {
        capHeaders = {};
        for (let c = 0; c <= range.e.c; c++) {
          const h = norm(cellStr(sheet, c, r));
          if (h) capHeaders[h] = c;
        }
        continue;
      }
      if (capHeaders) {
        const findCol = (...keys) => {
          for (const k of keys) {
            const found = Object.keys(capHeaders).find(h => h.includes(k));
            if (found !== undefined) return cellStr(sheet, capHeaders[found], r);
          }
          return '';
        };
        // El formato es "Institución – Nombre del curso" en la primera columna
        const cursoRaw = findCol('institucion', 'curso', 'nombre', 'actividad');
        if (!cursoRaw) continue;

        // Separar institución y nombre del curso si hay " – " o " - "
        const partes = cursoRaw.split(/\s+[–-]\s+/);
        const institucion = partes.length > 1 ? partes[0].trim() : '';
        const nombre_curso = partes.length > 1 ? partes.slice(1).join(' – ').trim() : cursoRaw.trim();

        const horas = findCol('hora');
        const puntaje = findCol('punto', 'pts', 'puntaje');
        const fecha_fin = findCol('hasta', 'termino', 'término', 'fin');

        if (!nombre_curso) continue;
        capacitacionRows.push({
          nombre_curso,
          institucion,
          horas,
          nota: findCol('nota', 'calificacion'),
          nivel_tecnico: findCol('nivel', 'tipo'),
          fecha: normalizeDateString(fecha_fin),
          puntaje,
        });
      }
      continue;
    }

    // Sección de datos personales: pares clave-valor
    if (c0) kvData[c0] = c1;
    if (c3) kvData[c3] = c4;
  }

  // Mapear datos personales
  const getKV = (...keys) => {
    for (const k of keys) {
      const found = Object.entries(kvData).find(([key]) => key.toLowerCase().includes(k.toLowerCase()));
      if (found && found[1]) return found[1];
    }
    return '';
  };

  const rut = normalizeRUT(getKV('rut'));
  const cargo = getKV('cargo');
  const profesion = getKV('profesi');
  const universidad = getKV('universidad');
  const fechaNacimiento = getKV('fecha nacimiento', 'nacimiento');

  return {
    full_name: (fullNameFromSheet || sheetName).trim(),
    rut,
    position: cargo,
    category: headerData.category,
    current_level: headerData.current_level,
    bienios_count: headerData.bienios_count,
    total_points: headerData.total_points,
    profesion,
    universidad,
    fecha_nacimiento: fechaNacimiento,
    experiencia: experienciaRows,
    capacitacion: capacitacionRows,
  };
}

// ── Validación básica ────────────────────────────────────────────
const VALID_CATEGORIES = ['A', 'B', 'C', 'D', 'E', 'F'];

function validateEmployee(emp) {
  const errors = [];
  if (!emp.rut) errors.push('RUT faltante');
  if (!emp.full_name) errors.push('Nombre faltante');
  if (!VALID_CATEGORIES.includes(emp.category)) errors.push(`Categoría inválida "${emp.category}"`);
  if (!emp.current_level || emp.current_level < 1 || emp.current_level > 15)
    errors.push(`Nivel inválido "${emp.current_level}"`);
  return errors;
}

// ── Helpers ─────────────────────────────────────────────────────
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

const isRateLimitError = (error) => {
  return error?.response?.status === 429 || error?.message?.includes('rate limit') || error?.message?.includes('Rate limit');
};

// ── Importar un funcionario con reintentos en rate limit ────────
async function importEmployee(emp, rutMap, onRateLimitRetry = null) {
  const payload = {
    rut: emp.rut,
    full_name: emp.full_name,
    category: emp.category,
    current_level: emp.current_level,
    position: emp.position || '',
    bienios_count: emp.bienios_count || 0,
    total_points: emp.total_points || 0,
    status: 'Activo',
  };

  let savedEmp;
  try {
    if (rutMap[emp.rut]) {
      await base44.entities.Employee.update(rutMap[emp.rut].id, payload);
      savedEmp = { ...rutMap[emp.rut], ...payload };
      // Limpiar periodos y capacitaciones anteriores en paralelo
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
  } catch (err) {
    if (isRateLimitError(err)) {
      if (onRateLimitRetry) onRateLimitRetry();
      await sleep(3000);
      return importEmployee(emp, rutMap, onRateLimitRetry);
    }
    throw err;
  }

  const validTypes = ['Planta', 'Plazo Fijo', 'Honorarios', 'Reemplazo'];
  const validLevels = ['Básico', 'Intermedio', 'Avanzado', 'Postgrado'];

  // Bulk crear periodos de servicio
  const periodosValidos = (emp.experiencia || [])
    .filter(e => e.tipo_periodo && e.fecha_inicio)
    .map(e => ({
      employee_id: savedEmp.id,
      period_type: validTypes.find(t => t.toLowerCase() === e.tipo_periodo.toLowerCase()) || 'Planta',
      start_date: e.fecha_inicio,
      end_date: e.fecha_fin || '',
      institution: e.institucion || '',
      resolution_number: e.n_resolucion || '',
      days_count: e.dias ? parseInt(e.dias) || null : null,
      is_active: !e.fecha_fin,
      conflict_status: 'Sin Conflicto',
    }));

  // Bulk crear capacitaciones
  const capacitacionesValidas = (emp.capacitacion || [])
    .filter(c => c.nombre_curso)
    .map(c => {
      const horas = parseFloat((c.horas || '0').toString().replace(',', '.')) || 0;
      const nota = parseFloat((c.nota || '0').toString().replace(',', '.')) || 4.0;
      return {
        employee_id: savedEmp.id,
        course_name: c.nombre_curso,
        institution: c.institucion || '',
        hours: horas,
        grade: nota,
        technical_level: validLevels.find(l => l.toLowerCase().includes((c.nivel_tecnico || '').toLowerCase())) || 'Básico',
        completion_date: c.fecha || '',
        calculated_points: parseFloat((c.puntaje || '0').toString().replace(',', '.')) || 0,
        status: 'Validado',
      };
    });

  await Promise.all([
    periodosValidos.length > 0 ? base44.entities.ServicePeriod.bulkCreate(periodosValidos) : Promise.resolve(),
    capacitacionesValidas.length > 0 ? base44.entities.Training.bulkCreate(capacitacionesValidas) : Promise.resolve(),
  ]);
}

// ── Tarjeta de funcionario ───────────────────────────────────────
// Helper: calcula días entre dos fechas
function calculateDaysBetween(startStr, endStr) {
  if (!startStr || !endStr) return null;
  try {
    const start = new Date(startStr);
    const end = new Date(endStr);
    const days = Math.floor((end - start) / (1000 * 60 * 60 * 24)) + 1;
    return days > 0 ? days : null;
  } catch {
    return null;
  }
}

function EmployeeCard({ emp, rutMap, onEdit }) {
  const [open, setOpen] = useState(false);
  const hasErrors = emp.errors.length > 0;
  const existsInDB = emp.data.rut && rutMap[emp.data.rut];

  return (
    <div className={`border rounded-lg ${hasErrors ? 'border-red-200 bg-red-50' : 'border-green-200 bg-green-50'}`}>
      <div className="px-4 py-2.5 space-y-2">
        <button onClick={() => setOpen(o => !o)} className="w-full flex items-center justify-between text-left hover:bg-slate-50 rounded p-1">
          <div className="flex items-center gap-3">
            {hasErrors
              ? <XCircle className="w-4 h-4 text-red-500 shrink-0" />
              : <CheckCircle2 className="w-4 h-4 text-green-600 shrink-0" />}
            <div>
              <span className="font-medium text-sm text-slate-800">{emp.sheetName}</span>
            </div>
            {existsInDB && <Badge className="text-[10px] bg-amber-100 text-amber-700 border-amber-200">Actualiza</Badge>}
          </div>
          <div className="flex items-center gap-2">
            {hasErrors && <Badge className="bg-red-100 text-red-700 border-red-200 text-[10px]">{emp.errors.length} error{emp.errors.length > 1 ? 'es' : ''}</Badge>}
            {open ? <ChevronDown className="w-4 h-4 text-slate-400" /> : <ChevronRight className="w-4 h-4 text-slate-400" />}
          </div>
        </button>
        {!open && emp.data.category && emp.data.current_level && (
          <div className="flex gap-2 text-xs text-slate-600 px-1">
            <span>Cat. {emp.data.category}</span>
            <span>·</span>
            <span>Niv. {emp.data.current_level}</span>
            {emp.data.bienios_count !== null && <>
              <span>·</span>
              <span>{emp.data.bienios_count} bienios</span>
            </>}
            {emp.data.total_points !== null && <>
              <span>·</span>
              <span>{emp.data.total_points} pts</span>
            </>}
          </div>
        )}
      </div>

      {open && (
        <div className="px-4 pb-4 space-y-3 border-t border-slate-200 pt-3">
          {hasErrors && (
            <div className="bg-red-100 border border-red-300 rounded p-2 space-y-1">
              {emp.errors.map((e, i) => (
                <p key={i} className="text-xs text-red-700 flex items-center gap-1">
                  <AlertTriangle className="w-3 h-3 shrink-0" /> {e}
                </p>
              ))}
            </div>
          )}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { key: 'rut', label: 'RUT' },
              { key: 'full_name', label: 'Nombre' },
              { key: 'category', label: 'Categoría', options: ['A', 'B', 'C', 'D', 'E', 'F'] },
              { key: 'current_level', label: 'Nivel', type: 'number' },
              { key: 'bienios_count', label: 'Bienios', type: 'number' },
              { key: 'total_points', label: 'Puntos', type: 'number' },
              { key: 'position', label: 'Cargo' },
            ].map(f => (
              <div key={f.key} className="flex flex-col gap-1">
                <label className="text-[10px] font-medium text-slate-600">{f.label}</label>
                {f.options ? (
                  <select
                    value={emp.data[f.key] || ''}
                    onChange={e => onEdit(emp.sheetName, f.key, e.target.value)}
                    className="h-8 px-2.5 text-xs border border-slate-300 rounded-md bg-white hover:border-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-0 transition-colors"
                  >
                    <option value="">—</option>
                    {f.options.map(opt => (
                      <option key={opt} value={opt}>{opt}</option>
                    ))}
                  </select>
                ) : (
                  <Input
                    type={f.type || 'text'}
                    value={emp.data[f.key] ?? ''}
                    onChange={e => onEdit(emp.sheetName, f.key, e.target.value)}
                    placeholder={f.key === 'rut' ? 'Ej: 12345678-K' : ''}
                    className="h-8 text-xs px-2.5 border-slate-300 focus:ring-indigo-500 focus:ring-2 focus:ring-offset-0"
                  />
                )}
              </div>
            ))}
          </div>
          <div className="space-y-3">
            <div className="flex gap-3 text-xs text-slate-500">
              {emp.data.experiencia?.length > 0 && <span>✓ {emp.data.experiencia.length} periodo(s) de servicio</span>}
              {emp.data.capacitacion?.length > 0 && <span>✓ {emp.data.capacitacion.length} capacitacion(es)</span>}
            </div>
            
            {emp.data.experiencia?.length > 0 && (
              <div className="bg-slate-50 rounded-lg p-3 space-y-2">
                <p className="text-[10px] font-semibold text-slate-600">Períodos de Servicio:</p>
                {emp.data.experiencia.map((exp, idx) => (
                  <div key={idx} className="text-[10px] border-b border-slate-200 pb-2 last:border-0">
                    <div className="flex justify-between items-start">
                      <div>
                        <p className="font-medium text-slate-700">{exp.tipo_periodo}</p>
                        <p className="text-slate-600">{exp.institucion}</p>
                        <p className="text-slate-500 text-[9px]">
                          {exp.fecha_inicio} {exp.fecha_fin ? `a ${exp.fecha_fin}` : '(vigente)'}
                        </p>
                      </div>
                      <div className="text-right font-semibold text-indigo-600">
                        {calculateDaysBetween(exp.fecha_inicio, exp.fecha_fin) || exp.dias ? (
                          <span>{calculateDaysBetween(exp.fecha_inicio, exp.fecha_fin) || exp.dias} días</span>
                        ) : (
                          <span className="text-amber-600 text-[9px]">Sin cálculo</span>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Componente principal ─────────────────────────────────────────
import { useImport } from '@/lib/ImportContext';

export default function ImportModule() {
  const fileInputRef = useRef(null);
  const { state, validCount, setEmployees: setCtxEmployees, startImport, resumeImport, cancelImport, resetImport } = useImport();
  const { status, employees: ctxEmployees, currentIndex, ok, failed, skipped, errorInfo } = state;

  // Local employees state for editing before import starts
  const [localEmployees, setLocalEmployees] = useState(ctxEmployees.length > 0 ? ctxEmployees : []);
  const [localStep, setLocalStep] = useState(
    status === 'done' ? 'done' : ctxEmployees.length > 0 ? 'preview' : 'idle'
  );

  const { data: dbEmployees = [] } = useQuery({
    queryKey: ['employees-all'],
    queryFn: () => base44.entities.Employee.list('-created_date', 2000),
  });

  const rutMap = {};
  dbEmployees.forEach(e => { rutMap[normalizeRUT(e.rut)] = e; });

  // Sync local employees with context when context has running import
  const displayEmployees = (status === 'running' || status === 'error') ? ctxEmployees : localEmployees;
  const displayStep = status === 'done' ? 'done' : status === 'running' || status === 'error' ? 'importing' : localStep;

  const handleFile = (e) => {
    const file = e.target.files[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const wb = XLSX.read(ev.target.result, { type: 'array', cellDates: false });
      const sheetNames = wb.SheetNames.filter(n => n !== 'Sheet' && n.trim() !== '');
      const parsed = sheetNames.map(name => {
        const sheet = wb.Sheets[name];
        const data = parseCarreraSheet(sheet, name);
        if (!data) return { sheetName: name, data: {}, errors: ['No se pudo parsear la hoja'] };
        const errors = validateEmployee(data);
        return { sheetName: name, data, errors };
      });
      setLocalEmployees(parsed);
      setLocalStep('preview');
    };
    reader.readAsArrayBuffer(file);
  };

  const handleEdit = (sheetName, field, value) => {
    setLocalEmployees(prev => prev.map(emp => {
      if (emp.sheetName !== sheetName) return emp;
      let finalValue = value;
      if (field === 'rut') finalValue = normalizeRUT(value);
      else if (['current_level', 'bienios_count'].includes(field)) {
        finalValue = value === '' ? null : parseInt(value) || value;
      } else if (field === 'total_points') {
        finalValue = value === '' ? null : parseFloat(value) || value;
      }
      const newData = { ...emp.data, [field]: finalValue };
      return { ...emp, data: newData, errors: validateEmployee(newData) };
    }));
  };

  const handleConfirm = () => {
    setCtxEmployees(localEmployees);
    startImport(localEmployees, rutMap, 0);
  };

  const handleReset = () => {
    resetImport();
    setLocalEmployees([]);
    setLocalStep('idle');
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const localValidCount = localEmployees.filter(e => e.errors.length === 0).length;
  const localErrorCount = localEmployees.length - localValidCount;

  const isRunning = status === 'running';
  const isError = status === 'error';
  const isDone = status === 'done';

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Importación Masiva</h1>
        <p className="text-sm text-slate-500 mt-1">
          Carga el libro Excel de Carrera Funcionaria. Cada pestaña corresponde a un funcionario.
        </p>
      </div>

      {/* Running import status card */}
      {(isRunning || isError) && (
        <Card className="border-blue-200 bg-blue-50">
          <CardContent className="p-4 space-y-3">
            <div className="flex items-center gap-2 text-blue-800 font-semibold text-sm">
              {isRunning && <div className="w-4 h-4 border-2 border-blue-400 border-t-blue-800 rounded-full animate-spin" />}
              {isError && <AlertTriangle className="w-4 h-4 text-amber-600" />}
              {isRunning ? `Importando en segundo plano... ${currentIndex + 1} de ${validCount}` : 'Importación pausada por error'}
            </div>
            {isRunning && (
              <div className="w-full bg-blue-200 rounded-full h-2">
                <div className="bg-blue-600 h-2 rounded-full transition-all" style={{ width: `${((currentIndex + 1) / validCount) * 100}%` }} />
              </div>
            )}
            <div className="flex gap-3 text-xs text-blue-700">
              <span>✓ {ok.length} importados</span>
              {failed.length > 0 && <span className="text-red-600">✗ {failed.length} fallidos</span>}
            </div>
            {isError && errorInfo && (
              <div className="bg-red-50 border border-red-200 rounded p-2 space-y-2">
                <p className="text-xs text-red-800">❌ Error en <strong>"{errorInfo.emp}"</strong>: {errorInfo.error}</p>
                <div className="flex gap-2">
                  <Button size="sm" onClick={() => resumeImport(ctxEmployees, rutMap, errorInfo.resumeFrom)} className="bg-amber-600 hover:bg-amber-700">
                    Continuar con el siguiente
                  </Button>
                  <Button size="sm" variant="ghost" onClick={handleReset}>Cancelar</Button>
                </div>
              </div>
            )}
            {isRunning && (
              <Button size="sm" variant="ghost" onClick={cancelImport} className="text-red-500 hover:text-red-700">
                Cancelar importación
              </Button>
            )}
          </CardContent>
        </Card>
      )}

      {isDone && (
        <Card className="border-emerald-200 bg-emerald-50">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2 text-emerald-800">
              <CheckCircle2 className="w-4 h-4" /> Importación completada
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-4 gap-3">
              {[
                { label: 'Total', value: ctxEmployees.length, color: 'slate' },
                { label: 'Importados', value: ok.length, color: 'green' },
                { label: 'Omitidos', value: skipped, color: 'amber' },
                { label: 'Errores', value: failed.length, color: 'red' },
              ].map(s => (
                <div key={s.label} className="bg-white rounded-lg p-3 text-center border">
                  <div className={`text-2xl font-bold text-${s.color}-600`}>{s.value}</div>
                  <div className="text-xs text-slate-500 mt-1">{s.label}</div>
                </div>
              ))}
            </div>
            {ok.length > 0 && (
              <div className="flex flex-wrap gap-1 max-h-32 overflow-y-auto">
                {ok.map(name => (
                  <Badge key={name} className="bg-green-100 text-green-800 text-[10px]">
                    <User className="w-2.5 h-2.5 mr-1" />{name}
                  </Badge>
                ))}
              </div>
            )}
            {failed.length > 0 && (
              <div className="bg-red-50 border border-red-200 rounded p-3 space-y-1">
                <p className="text-xs font-semibold text-red-700">Errores al guardar:</p>
                {failed.map((f, i) => (
                  <p key={i} className="text-xs text-red-600">• {f.name}: {f.error}</p>
                ))}
              </div>
            )}
            <Button variant="outline" size="sm" onClick={handleReset}>
              <RotateCcw className="w-3.5 h-3.5 mr-1" /> Nueva importación
            </Button>
          </CardContent>
        </Card>
      )}

      {!isRunning && !isError && !isDone && (
        <>
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2">
                <FileSpreadsheet className="w-4 h-4 text-indigo-600" /> Formato esperado
              </CardTitle>
            </CardHeader>
            <CardContent className="text-xs text-slate-600 space-y-3">
              <p>Archivo Excel con <strong>una pestaña por funcionario</strong>. Cada hoja debe tener:</p>
              <div className="bg-slate-50 rounded-md p-3 space-y-1.5 font-mono text-[11px]">
                <div><span className="text-slate-400">Fila 1 →</span> <span className="text-slate-800 font-semibold">Nombre completo del funcionario</span></div>
                <div><span className="text-slate-400">Fila 2 →</span> <span className="text-indigo-700">Cat. B · Nivel 8 · 5.306 pts · 7 bienios</span></div>
                <div><span className="text-slate-400">Fila 3+ →</span> <span className="text-slate-600">Pares clave-valor: RUT, Cargo, Profesión, etc.</span></div>
                <div className="mt-1"><span className="text-slate-400">Sección →</span> <span className="text-emerald-700 font-semibold">Experiencia</span></div>
                <div className="pl-10 text-slate-500">Headers: Establecimiento | Fecha Inicio | Término | Días</div>
                <div className="mt-1"><span className="text-slate-400">Sección →</span> <span className="text-blue-700 font-semibold">Capacitacion</span></div>
                <div className="pl-10 text-slate-500">Headers: Institución – Nombre curso | Horas | Nota | Nivel | Fecha</div>
              </div>
              <div className="pt-2">
                <Button size="sm" className="bg-indigo-600 hover:bg-indigo-700" onClick={() => fileInputRef.current?.click()}>
                  <Upload className="w-4 h-4 mr-1" /> Seleccionar archivo Excel
                </Button>
                <input ref={fileInputRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={handleFile} />
              </div>
            </CardContent>
          </Card>

          {localStep === 'preview' && localEmployees.length > 0 && (
            <div className="space-y-4">
              <div className="flex items-center gap-3 flex-wrap">
                <span className="text-sm font-semibold text-slate-700">{localEmployees.length} funcionarios detectados</span>
                <Badge className="bg-green-100 text-green-800">{localValidCount} válidos</Badge>
                {localErrorCount > 0 && <Badge className="bg-red-100 text-red-800">{localErrorCount} con errores</Badge>}
              </div>

              <div className="space-y-1.5 max-h-[60vh] overflow-y-auto pr-1">
                {localEmployees.map(emp => (
                  <EmployeeCard key={emp.sheetName} emp={emp} rutMap={rutMap} onEdit={handleEdit} />
                ))}
              </div>

              <div className="flex items-center gap-2 flex-wrap pt-2 border-t">
                <Button onClick={handleConfirm} disabled={localValidCount === 0} className="bg-emerald-600 hover:bg-emerald-700">
                  <ClipboardCheck className="w-4 h-4 mr-1" /> Importar en segundo plano
                </Button>
                {localErrorCount > 0 && (
                  <p className="text-xs text-slate-500">{localErrorCount} registro(s) con errores serán omitidos.</p>
                )}
                <Button variant="ghost" size="sm" onClick={handleReset}>
                  <RotateCcw className="w-3.5 h-3.5 mr-1" /> Cancelar
                </Button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}