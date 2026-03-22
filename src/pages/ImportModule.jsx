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

    // Detectar inicio de sección: celda A exactamente "Experiencia" o "Capacitacion"
    // También acepta detección en toda la fila como fallback
    const c0raw = cellStr(sheet, 0, r);
    const c0normRaw = norm(c0raw);
    const isExpRow = c0normRaw === 'experiencia' || c0normRaw === 'periodos de servicio' ||
      c0normRaw === 'experiencia laboral' ||
      (rt.replace(/\s/g,'').length < 40 && (rt.includes('experiencia') || rt.includes('periodos de servicio')));
    const isCapRow = c0normRaw === 'capacitacion' || c0normRaw === 'capacitaciones' ||
      (rt.replace(/\s/g,'').length < 40 && rt.includes('capacitaci'));

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
          fecha_inicio: findCol('inicio', 'desde', 'fecha inicio'),
          fecha_fin: findCol('termino', 'término', 'fin', 'hasta'),
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
          fecha: fecha_fin,
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

// ── Importar un funcionario ──────────────────────────────────────
async function importEmployee(emp, rutMap) {
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
function EmployeeCard({ emp, rutMap, onEdit }) {
  const [open, setOpen] = useState(false);
  const hasErrors = emp.errors.length > 0;
  const existsInDB = emp.data.rut && rutMap[emp.data.rut];

  return (
    <div className={`border rounded-lg ${hasErrors ? 'border-red-200 bg-red-50' : 'border-green-200 bg-green-50'}`}>
      <div className="flex items-center justify-between px-4 py-2.5 cursor-pointer" onClick={() => setOpen(o => !o)}>
        <div className="flex items-center gap-3">
          {hasErrors
            ? <XCircle className="w-4 h-4 text-red-500 shrink-0" />
            : <CheckCircle2 className="w-4 h-4 text-green-600 shrink-0" />}
          <div>
            <span className="font-medium text-sm text-slate-800">{emp.sheetName}</span>
            {emp.data.rut && <span className="ml-2 text-xs text-slate-500">{emp.data.rut}</span>}
            {emp.data.category && emp.data.current_level && (
              <span className="ml-2 text-xs text-slate-400">Cat. {emp.data.category} · Niv. {emp.data.current_level}</span>
            )}
          </div>
          {existsInDB && <Badge className="text-[10px] bg-amber-100 text-amber-700 border-amber-200">Actualiza</Badge>}
        </div>
        <div className="flex items-center gap-2">
          {hasErrors && <Badge className="bg-red-100 text-red-700 border-red-200 text-[10px]">{emp.errors.length} error{emp.errors.length > 1 ? 'es' : ''}</Badge>}
          {open ? <ChevronDown className="w-4 h-4 text-slate-400" /> : <ChevronRight className="w-4 h-4 text-slate-400" />}
        </div>
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
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            {[
              { key: 'rut', label: 'RUT' },
              { key: 'full_name', label: 'Nombre' },
              { key: 'category', label: 'Categoría' },
              { key: 'current_level', label: 'Nivel' },
              { key: 'position', label: 'Cargo' },
            ].map(f => (
              <div key={f.key}>
                <label className="text-[10px] text-slate-500">{f.label}</label>
                <Input
                  value={emp.data[f.key] || ''}
                  onChange={e => onEdit(emp.sheetName, f.key, e.target.value)}
                  className="h-7 text-xs"
                />
              </div>
            ))}
          </div>
          <div className="flex gap-3 text-xs text-slate-500">
            {emp.data.experiencia?.length > 0 && <span>✓ {emp.data.experiencia.length} periodo(s) de servicio</span>}
            {emp.data.capacitacion?.length > 0 && <span>✓ {emp.data.capacitacion.length} capacitacion(es)</span>}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Componente principal ─────────────────────────────────────────
export default function ImportModule() {
  const fileInputRef = useRef(null);
  const [employees, setEmployees] = useState([]);
  const [step, setStep] = useState('idle');
  const [importing, setImporting] = useState(false);
  const [importLog, setImportLog] = useState(null);
  const [singleMode, setSingleMode] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);

  const { data: dbEmployees = [] } = useQuery({
    queryKey: ['employees-all'],
    queryFn: () => base44.entities.Employee.list('-created_date', 2000),
  });

  const rutMap = {};
  dbEmployees.forEach(e => { rutMap[normalizeRUT(e.rut)] = e; });

  const handleFile = (e) => {
    const file = e.target.files[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const wb = XLSX.read(ev.target.result, { type: 'array', cellDates: false });
      // Saltar la primera hoja "Sheet" que es una plantilla vacía
      const sheetNames = wb.SheetNames.filter(n => n !== 'Sheet' && n.trim() !== '');
      const parsed = sheetNames.map(name => {
        const sheet = wb.Sheets[name];
        const data = parseCarreraSheet(sheet, name);
        if (!data) return { sheetName: name, data: {}, errors: ['No se pudo parsear la hoja'] };
        const errors = validateEmployee(data);
        return { sheetName: name, data, errors };
      });
      setEmployees(parsed);
      setStep('preview');
      setImportLog(null);
    };
    reader.readAsArrayBuffer(file);
  };

  const handleEdit = (sheetName, field, value) => {
    setEmployees(prev => prev.map(emp => {
      if (emp.sheetName !== sheetName) return emp;
      const newData = { ...emp.data, [field]: field === 'rut' ? normalizeRUT(value) : value };
      if (field === 'current_level') newData.current_level = parseInt(value) || null;
      return { ...emp, data: newData, errors: validateEmployee(newData) };
    }));
  };

  const handleConfirm = async () => {
    const valid = employees.filter(e => e.errors.length === 0);
    if (!valid.length) { toast.error('No hay funcionarios válidos para importar'); return; }
    
    if (singleMode) {
      // Modo verificación: importar de a 1
      setImporting(true);
      const emp = valid[currentIndex];
      try {
        await importEmployee(emp.data, rutMap);
        toast.success(`"${emp.sheetName}" importado correctamente`);
        if (currentIndex < valid.length - 1) {
          setCurrentIndex(currentIndex + 1);
        } else {
          toast.success('¡Todos importados!');
          setSingleMode(false);
          setCurrentIndex(0);
          reset();
        }
      } catch (err) {
        toast.error(`Error en "${emp.sheetName}": ${err?.message || 'Error desconocido'}`);
      }
      setImporting(false);
    } else {
      // Modo lote: procesar todos
      setImporting(true);
      const log = { ok: [], failed: [] };
      for (let i = 0; i < valid.length; i++) {
        const emp = valid[i];
        try {
          await importEmployee(emp.data, rutMap);
          log.ok.push(emp.sheetName);
        } catch (err) {
          log.failed.push({ name: emp.sheetName, error: err?.message || 'Error desconocido' });
        }
        if (i < valid.length - 1) await sleep(300);
      }
      setImportLog({ ...log, total: employees.length, skipped: employees.length - valid.length });
      setStep('done');
      setImporting(false);
      toast.success(`${log.ok.length} funcionario(s) importado(s)`);
    }
  };

  const reset = () => {
    setEmployees([]); setStep('idle'); setImportLog(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const validCount = employees.filter(e => e.errors.length === 0).length;
  const errorCount = employees.length - validCount;

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Importación Masiva</h1>
        <p className="text-sm text-slate-500 mt-1">
          Carga el libro Excel de Carrera Funcionaria. Cada pestaña corresponde a un funcionario.
        </p>
      </div>

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
            <div className="mt-1"><span className="text-slate-400">Sección →</span> <span className="text-emerald-700 font-semibold">Experiencia</span> <span className="text-slate-400">(celda A con esa palabra exacta)</span></div>
            <div className="pl-10 text-slate-500">Headers: Establecimiento | Fecha Inicio | Término | Días</div>
            <div className="pl-10 text-slate-500">El tipo va entre paréntesis: <em>CESFAM X (Reemplazo)</em></div>
            <div className="mt-1"><span className="text-slate-400">Sección →</span> <span className="text-blue-700 font-semibold">Capacitacion</span> <span className="text-slate-400">(celda A con esa palabra exacta)</span></div>
            <div className="pl-10 text-slate-500">Headers: Institución – Nombre curso | Horas | Nota | Nivel | Fecha</div>
            <div className="pl-10 text-slate-500">Institución y curso separados por <em> – </em> en la misma celda</div>
          </div>
          <p className="text-slate-400">Tipos válidos: Planta · Plazo Fijo · Honorarios · Reemplazo &nbsp;|&nbsp; Niveles: Básico · Intermedio · Avanzado · Postgrado</p>
          <div className="pt-2">
            <Button size="sm" className="bg-indigo-600 hover:bg-indigo-700" onClick={() => fileInputRef.current?.click()}>
              <Upload className="w-4 h-4 mr-1" /> Seleccionar archivo Excel
            </Button>
            <input ref={fileInputRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={handleFile} />
          </div>
        </CardContent>
      </Card>

      {step === 'preview' && employees.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-3">
              <span className="text-sm font-semibold text-slate-700">{employees.length} funcionarios detectados</span>
              <Badge className="bg-green-100 text-green-800">{validCount} válidos</Badge>
              {errorCount > 0 && <Badge className="bg-red-100 text-red-800">{errorCount} con errores</Badge>}
            </div>
          </div>

          <div className="space-y-1.5 max-h-[60vh] overflow-y-auto pr-1">
            {employees.map(emp => (
              <EmployeeCard key={emp.sheetName} emp={emp} rutMap={rutMap} onEdit={handleEdit} />
            ))}
          </div>

          <div className="space-y-3 pt-2 border-t">
            {singleMode && (
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                <p className="text-xs text-blue-800 mb-2">
                  Verificando: <strong>{currentIndex + 1} de {employees.filter(e => e.errors.length === 0).length}</strong>
                </p>
                <div className="w-full bg-blue-200 rounded-full h-1.5">
                  <div
                    className="bg-blue-600 h-1.5 rounded-full transition-all"
                    style={{ width: `${((currentIndex + 1) / employees.filter(e => e.errors.length === 0).length) * 100}%` }}
                  />
                </div>
              </div>
            )}
            <div className="flex items-center gap-2 flex-wrap">
              {!singleMode ? (
                <>
                  <Button
                    onClick={handleConfirm}
                    disabled={importing || validCount === 0}
                    className="bg-emerald-600 hover:bg-emerald-700"
                  >
                    <ClipboardCheck className="w-4 h-4 mr-1" />
                    {importing ? 'Importando...' : `Importar ${validCount} funcionario(s)`}
                  </Button>
                  <Button
                    onClick={() => { setSingleMode(true); setCurrentIndex(0); }}
                    disabled={importing || validCount === 0}
                    variant="outline"
                    size="sm"
                  >
                    Verificar de a 1
                  </Button>
                </>
              ) : (
                <>
                  <Button
                    onClick={handleConfirm}
                    disabled={importing}
                    className="bg-blue-600 hover:bg-blue-700"
                  >
                    {importing ? 'Procesando...' : 'Siguiente'}
                  </Button>
                  <Button
                    onClick={() => { setSingleMode(false); setCurrentIndex(0); reset(); }}
                    disabled={importing}
                    variant="ghost"
                    size="sm"
                  >
                    Cancelar verificación
                  </Button>
                </>
              )}
              {!singleMode && errorCount > 0 && (
                <p className="text-xs text-slate-500">{errorCount} registro(s) con errores serán omitidos.</p>
              )}
              {!singleMode && (
                <Button variant="ghost" size="sm" onClick={reset}>
                  <RotateCcw className="w-3.5 h-3.5 mr-1" /> Cancelar
                </Button>
              )}
            </div>
          </div>
        </div>
      )}

      {step === 'done' && importLog && (
        <Card className="border-emerald-200 bg-emerald-50">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2 text-emerald-800">
              <CheckCircle2 className="w-4 h-4" /> Importación completada
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-4 gap-3">
              {[
                { label: 'Total', value: importLog.total, color: 'slate' },
                { label: 'Importados', value: importLog.ok.length, color: 'green' },
                { label: 'Omitidos', value: importLog.skipped, color: 'amber' },
                { label: 'Errores guardado', value: importLog.failed.length, color: 'red' },
              ].map(s => (
                <div key={s.label} className="bg-white rounded-lg p-3 text-center border">
                  <div className={`text-2xl font-bold text-${s.color}-600`}>{s.value}</div>
                  <div className="text-xs text-slate-500 mt-1">{s.label}</div>
                </div>
              ))}
            </div>

            {importLog.ok.length > 0 && (
              <div className="flex flex-wrap gap-1 max-h-32 overflow-y-auto">
                {importLog.ok.map(name => (
                  <Badge key={name} className="bg-green-100 text-green-800 text-[10px]">
                    <User className="w-2.5 h-2.5 mr-1" />{name}
                  </Badge>
                ))}
              </div>
            )}

            {importLog.failed.length > 0 && (
              <div className="bg-red-50 border border-red-200 rounded p-3 space-y-1">
                <p className="text-xs font-semibold text-red-700">Errores al guardar:</p>
                {importLog.failed.map((f, i) => (
                  <p key={i} className="text-xs text-red-600">• {f.name}: {f.error}</p>
                ))}
              </div>
            )}

            <Button variant="outline" size="sm" onClick={reset}>
              <RotateCcw className="w-3.5 h-3.5 mr-1" /> Nueva importación
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}