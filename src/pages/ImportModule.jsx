import { useState, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import * as XLSX from 'xlsx';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  Upload, Download, CheckCircle2, XCircle, AlertTriangle,
  FileSpreadsheet, Pencil, RotateCcw, ClipboardCheck, User, ChevronDown, ChevronRight
} from 'lucide-react';
import { toast } from 'sonner';
import {
  calculateTrainingPoints, calculateEffectiveDays,
  calculateBienios, calculateBienioPoints, calculateNextBienioDate,
} from '@/components/calculations';

// ── Constantes ────────────────────────────────────────────────
const VALID_CATEGORIES = ['A', 'B', 'C', 'D', 'E', 'F'];
const VALID_CONTRACTS = ['Planta', 'Plazo Fijo', 'Honorarios', 'Reemplazo'];
const VALID_STATUSES = ['Pendiente', 'Validado', 'Rechazado'];
const LEVEL_MAP = { '1': 'Básico', '2': 'Intermedio', '3': 'Avanzado', '4': 'Postgrado' };

function normalizeRUT(rut) { return (rut || '').toString().replace(/\./g, '').trim().toUpperCase(); }

function cellValue(sheet, col, row) {
  const cell = sheet[XLSX.utils.encode_cell({ c: col, r: row })];
  return cell ? String(cell.v ?? '').trim() : '';
}

function dateVal(v) {
  if (!v) return '';
  if (typeof v === 'number') {
    const d = XLSX.SSF.parse_date_code(v);
    if (!d) return '';
    const mm = String(d.m).padStart(2, '0');
    const dd = String(d.d).padStart(2, '0');
    return `${d.y}-${mm}-${dd}`;
  }
  return String(v).trim();
}

// ── Parser de hoja de funcionario ────────────────────────────
// Estructura esperada por sección. Busca etiquetas en columna A.
// DATOS PERSONALES: fila con "RUT" encabezado → fila siguiente = datos
// EXPERIENCIA: fila con "TIPO PERIODO" encabezado → filas hasta vacía o nueva sección
// CAPACITACIÓN: fila con "NOMBRE CURSO" encabezado → filas hasta vacía

function findSectionRow(sheet, range, label) {
  for (let r = range.s.r; r <= range.e.r; r++) {
    const v = cellValue(sheet, 0, r).toUpperCase();
    if (v.includes(label.toUpperCase())) return r;
  }
  return -1;
}

function parseEmployeeSheet(sheet) {
  const range = XLSX.utils.decode_range(sheet['!ref'] || 'A1:Z100');
  const result = { personal: null, experiencia: [], capacitacion: [], rawErrors: [] };

  // ── Datos personales ──
  const rpHdr = findSectionRow(sheet, range, 'RUT');
  if (rpHdr === -1) { result.rawErrors.push('No se encontró sección de Datos Personales (fila con "RUT")'); }
  else {
    const dr = rpHdr + 1;
    // Read headers from rpHdr row
    const headers = {};
    for (let c = range.s.c; c <= range.e.c; c++) {
      const h = cellValue(sheet, c, rpHdr).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      if (h) headers[h] = c;
    }
    const g = (key) => {
      const aliases = {
        rut: ['rut'],
        nombre: ['nombre', 'nombre completo', 'nombre_completo'],
        categoria: ['categoria', 'categoría'],
        nivel: ['nivel'],
        cargo: ['cargo'],
        fecha_ingreso: ['fecha ingreso', 'fecha_ingreso', 'ingreso'],
        tipo_contrato: ['tipo contrato', 'tipo_contrato', 'contrato'],
      };
      const keys = aliases[key] || [key];
      for (const k of keys) {
        if (headers[k] !== undefined) {
          const raw = sheet[XLSX.utils.encode_cell({ c: headers[k], r: dr })];
          return raw ? String(raw.v ?? '').trim() : '';
        }
      }
      return '';
    };
    result.personal = {
      rut: normalizeRUT(g('rut')),
      nombre: g('nombre'),
      categoria: (g('categoria') || '').toUpperCase(),
      nivel: g('nivel'),
      cargo: g('cargo'),
      fecha_ingreso: dateVal(g('fecha_ingreso')),
      tipo_contrato: g('tipo_contrato'),
    };
  }

  // ── Experiencia ──
  const rExpHdr = findSectionRow(sheet, range, 'TIPO PERIODO');
  if (rExpHdr !== -1) {
    const expHeaders = {};
    for (let c = range.s.c; c <= range.e.c; c++) {
      const h = cellValue(sheet, c, rExpHdr).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      if (h) expHeaders[h] = c;
    }
    const colIdx = (key, aliases) => {
      const all = aliases || [key];
      for (const a of all) if (expHeaders[a] !== undefined) return expHeaders[a];
      return -1;
    };
    const cTipo = colIdx('tipo periodo', ['tipo periodo', 'tipo_periodo', 'tipo']);
    const cIni = colIdx('fecha inicio', ['fecha inicio', 'fecha_inicio', 'inicio']);
    const cFin = colIdx('fecha fin', ['fecha fin', 'fecha_fin', 'fin']);
    const cInst = colIdx('institucion', ['institucion', 'institución']);
    const cRes = colIdx('n resolucion', ['n resolucion', 'n° resolucion', 'n_resolucion', 'resolucion', 'resolución']);

    for (let r = rExpHdr + 1; r <= range.e.r; r++) {
      const tipo = cTipo >= 0 ? cellValue(sheet, cTipo, r) : '';
      if (!tipo) continue;
      const upper = tipo.toUpperCase();
      if (upper.includes('CAPACIT') || upper.includes('NOMBRE CURSO')) break;
      result.experiencia.push({
        tipo_periodo: tipo,
        fecha_inicio: cIni >= 0 ? dateVal(sheet[XLSX.utils.encode_cell({ c: cIni, r })]?.v) : '',
        fecha_fin: cFin >= 0 ? dateVal(sheet[XLSX.utils.encode_cell({ c: cFin, r })]?.v) : '',
        institucion: cInst >= 0 ? cellValue(sheet, cInst, r) : '',
        n_resolucion: cRes >= 0 ? cellValue(sheet, cRes, r) : '',
      });
    }
  }

  // ── Capacitación ──
  const rCapHdr = findSectionRow(sheet, range, 'NOMBRE CURSO');
  if (rCapHdr !== -1) {
    const capHeaders = {};
    for (let c = range.s.c; c <= range.e.c; c++) {
      const h = cellValue(sheet, c, rCapHdr).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      if (h) capHeaders[h] = c;
    }
    const colIdx = (aliases) => {
      for (const a of aliases) if (capHeaders[a] !== undefined) return capHeaders[a];
      return -1;
    };
    const cNombre = colIdx(['nombre curso', 'nombre_curso', 'curso']);
    const cInst = colIdx(['institucion', 'institución']);
    const cHoras = colIdx(['horas']);
    const cNota = colIdx(['nota']);
    const cNivel = colIdx(['nivel tecnico', 'nivel_tecnico', 'nivel']);
    const cFecha = colIdx(['fecha', 'fecha finalizacion', 'fecha_finalizacion']);
    const cEstado = colIdx(['estado']);

    for (let r = rCapHdr + 1; r <= range.e.r; r++) {
      const nombre = cNombre >= 0 ? cellValue(sheet, cNombre, r) : '';
      if (!nombre) continue;
      result.capacitacion.push({
        nombre_curso: nombre,
        institucion: cInst >= 0 ? cellValue(sheet, cInst, r) : '',
        horas: cHoras >= 0 ? String(sheet[XLSX.utils.encode_cell({ c: cHoras, r })]?.v ?? '') : '',
        nota: cNota >= 0 ? String(sheet[XLSX.utils.encode_cell({ c: cNota, r })]?.v ?? '') : '',
        nivel_tecnico: cNivel >= 0 ? cellValue(sheet, cNivel, r) : '',
        fecha: cFecha >= 0 ? dateVal(sheet[XLSX.utils.encode_cell({ c: cFecha, r })]?.v) : '',
        estado: cEstado >= 0 ? cellValue(sheet, cEstado, r) : 'Pendiente',
      });
    }
  }

  return result;
}

// ── Validación ────────────────────────────────────────────────
function validateEmployee(data, rutMap) {
  const errors = [];
  const p = data.personal;
  if (!p) { errors.push('Datos personales no encontrados en la hoja'); return errors; }
  if (!p.rut) errors.push('RUT: requerido');
  if (!p.nombre) errors.push('Nombre: requerido');
  if (!VALID_CATEGORIES.includes(p.categoria)) errors.push(`Categoría inválida "${p.categoria}" (A/B/C/D/E/F)`);
  const nivel = parseInt(p.nivel);
  if (isNaN(nivel) || nivel < 1 || nivel > 15) errors.push(`Nivel inválido "${p.nivel}" (1-15)`);
  if (!VALID_CONTRACTS.includes(p.tipo_contrato)) errors.push(`Tipo contrato inválido "${p.tipo_contrato}"`);

  data.experiencia.forEach((e, i) => {
    if (!VALID_CONTRACTS.includes(e.tipo_periodo)) errors.push(`Exp. fila ${i + 1}: tipo_periodo inválido "${e.tipo_periodo}"`);
    if (!e.fecha_inicio) errors.push(`Exp. fila ${i + 1}: fecha_inicio requerida`);
  });

  data.capacitacion.forEach((c, i) => {
    const horas = parseFloat(c.horas);
    if (isNaN(horas) || horas <= 0) errors.push(`Cap. fila ${i + 1}: horas inválidas "${c.horas}"`);
    const nota = parseFloat(c.nota);
    if (isNaN(nota) || nota < 1 || nota > 7) errors.push(`Cap. fila ${i + 1}: nota inválida "${c.nota}" (1.0-7.0)`);
    const nivelT = LEVEL_MAP[c.nivel_tecnico] || c.nivel_tecnico;
    if (!['Básico', 'Intermedio', 'Avanzado', 'Postgrado'].includes(nivelT))
      errors.push(`Cap. fila ${i + 1}: nivel_tecnico inválido "${c.nivel_tecnico}"`);
  });

  return errors;
}

// ── Importar un funcionario ───────────────────────────────────
async function importEmployee(data, rutMap) {
  const p = data.personal;
  const rut = normalizeRUT(p.rut);

  let emp;
  const payload = {
    rut, full_name: p.nombre, category: p.categoria,
    current_level: parseInt(p.nivel), position: p.cargo || '',
    hire_date: p.fecha_ingreso || '', contract_type: p.tipo_contrato, status: 'Activo',
  };
  if (rutMap[rut]) {
    await base44.entities.Employee.update(rutMap[rut].id, payload);
    emp = { ...rutMap[rut], ...payload };
  } else {
    emp = await base44.entities.Employee.create(payload);
  }

  for (const e of data.experiencia) {
    const days = e.fecha_fin
      ? Math.max(0, Math.floor((new Date(e.fecha_fin) - new Date(e.fecha_inicio)) / 86400000))
      : Math.floor((new Date() - new Date(e.fecha_inicio)) / 86400000);
    await base44.entities.ServicePeriod.create({
      employee_id: emp.id, period_type: e.tipo_periodo,
      start_date: e.fecha_inicio, end_date: e.fecha_fin || '',
      institution: e.institucion || 'APS Panguipulli',
      resolution_number: e.n_resolucion || '',
      days_count: days, is_active: !e.fecha_fin, conflict_status: 'Sin Conflicto',
      ajustado_por_solapamiento: false,
    });
  }

  for (const c of data.capacitacion) {
    const nivelT = LEVEL_MAP[c.nivel_tecnico] || c.nivel_tecnico;
    const pts = calculateTrainingPoints(parseFloat(c.horas), parseFloat(c.nota), nivelT);
    await base44.entities.Training.create({
      employee_id: emp.id, course_name: c.nombre_curso,
      institution: c.institucion || '', hours: parseFloat(c.horas),
      grade: parseFloat(c.nota), technical_level: nivelT,
      completion_date: c.fecha || '', calculated_points: pts,
      status: c.estado || 'Pendiente', is_postitle: nivelT === 'Postgrado',
    });
  }

  // Recalcular métricas
  const allPeriods = await base44.entities.ServicePeriod.filter({ employee_id: emp.id });
  const allLeaves = await base44.entities.LeaveWithoutPay.filter({ employee_id: emp.id });
  const allTrainings = await base44.entities.Training.filter({ employee_id: emp.id });
  const tLeave = allLeaves.reduce((s, l) => s + (l.days_count || 0), 0);
  const eDays = calculateEffectiveDays(allPeriods, tLeave);
  const b = calculateBienios(eDays);
  const bp = calculateBienioPoints(p.categoria, b);
  const nbd = calculateNextBienioDate(allPeriods, tLeave, b);
  const totalPts = allTrainings.filter(t => t.status === 'Validado').reduce((s, t) => s + (t.calculated_points || 0), 0);
  await base44.entities.Employee.update(emp.id, {
    total_experience_days: eDays, bienios_count: b, bienio_points: bp,
    next_bienio_date: nbd, training_points: totalPts, total_points: bp + totalPts,
  });
}

// ── Plantilla Excel ───────────────────────────────────────────
function downloadTemplate() {
  const wb = XLSX.utils.book_new();

  const makeSheet = (name) => {
    const ws = XLSX.utils.aoa_to_sheet([
      ['DATOS PERSONALES'],
      ['RUT', 'Nombre', 'Categoría', 'Nivel', 'Cargo', 'Fecha Ingreso', 'Tipo Contrato'],
      ['12345678-9', 'María González Soto', 'A', 6, 'Médico General', '2010-03-15', 'Planta'],
      [],
      ['EXPERIENCIA'],
      ['Tipo Periodo', 'Fecha Inicio', 'Fecha Fin', 'Institución', 'N° Resolución'],
      ['Planta', '2005-01-01', '2009-12-31', 'Hospital Base Valdivia', 'EX-2005-001'],
      ['Planta', '2010-01-01', '', 'APS Panguipulli', 'EX-2010-015'],
      [],
      ['CAPACITACIÓN'],
      ['Nombre Curso', 'Institución', 'Horas', 'Nota', 'Nivel Tecnico', 'Fecha', 'Estado'],
      ['Actualización en Medicina Familiar', 'ACHS', 80, 6.8, 'Avanzado', '2023-08-10', 'Validado'],
      ['RCP Avanzado', 'Cruz Roja', 20, 6.5, 'Intermedio', '2022-11-15', 'Validado'],
    ]);
    XLSX.utils.book_append_sheet(wb, ws, name);
  };

  makeSheet('María González');
  makeSheet('Pedro Ramírez');

  XLSX.writeFile(wb, 'plantilla_funcionarios.xlsx');
}

// ── Componente ────────────────────────────────────────────────
function EmployeeCard({ emp, rutMap, onEdit }) {
  const [open, setOpen] = useState(false);
  const hasErrors = emp.errors.length > 0;
  const p = emp.data.personal || {};
  const existsInDB = p.rut && rutMap[p.rut];

  return (
    <div className={`border rounded-lg ${hasErrors ? 'border-red-200 bg-red-50' : 'border-green-200 bg-green-50'}`}>
      <div
        className="flex items-center justify-between px-4 py-3 cursor-pointer"
        onClick={() => setOpen(o => !o)}
      >
        <div className="flex items-center gap-3">
          {hasErrors
            ? <XCircle className="w-4 h-4 text-red-500 shrink-0" />
            : <CheckCircle2 className="w-4 h-4 text-green-600 shrink-0" />}
          <div>
            <span className="font-medium text-sm text-slate-800">
              {emp.sheetName}
            </span>
            {p.rut && <span className="ml-2 text-xs text-slate-500">{p.rut}</span>}
          </div>
          {existsInDB && <Badge className="text-[10px] bg-amber-100 text-amber-700 border-amber-200">Actualización</Badge>}
        </div>
        <div className="flex items-center gap-3">
          <div className="flex gap-2 text-xs">
            {emp.data.experiencia.length > 0 && <span className="text-slate-500">{emp.data.experiencia.length} exp.</span>}
            {emp.data.capacitacion.length > 0 && <span className="text-slate-500">{emp.data.capacitacion.length} cap.</span>}
          </div>
          {hasErrors && <Badge className="bg-red-100 text-red-700 border-red-200 text-[10px]">{emp.errors.length} error{emp.errors.length > 1 ? 'es' : ''}</Badge>}
          {open ? <ChevronDown className="w-4 h-4 text-slate-400" /> : <ChevronRight className="w-4 h-4 text-slate-400" />}
        </div>
      </div>

      {open && (
        <div className="px-4 pb-4 space-y-3 border-t border-slate-200 pt-3">
          {/* Errores */}
          {hasErrors && (
            <div className="bg-red-100 border border-red-300 rounded p-2 space-y-1">
              {emp.errors.map((e, i) => (
                <p key={i} className="text-xs text-red-700 flex items-center gap-1">
                  <AlertTriangle className="w-3 h-3 shrink-0" /> {e}
                </p>
              ))}
            </div>
          )}

          {/* Datos personales editable */}
          {p.rut !== undefined && (
            <div>
              <p className="text-xs font-semibold text-slate-600 mb-1">Datos personales</p>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                {[
                  { key: 'rut', label: 'RUT' }, { key: 'nombre', label: 'Nombre' },
                  { key: 'categoria', label: 'Categoría' }, { key: 'nivel', label: 'Nivel' },
                  { key: 'cargo', label: 'Cargo' }, { key: 'tipo_contrato', label: 'Contrato' },
                  { key: 'fecha_ingreso', label: 'Fecha Ingreso' },
                ].map(f => (
                  <div key={f.key}>
                    <label className="text-[10px] text-slate-500">{f.label}</label>
                    <Input
                      value={p[f.key] || ''}
                      onChange={e => onEdit(emp.sheetName, 'personal', null, f.key, e.target.value)}
                      className="h-7 text-xs"
                    />
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Experiencia */}
          {emp.data.experiencia.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-slate-600 mb-1">Experiencia ({emp.data.experiencia.length} periodos)</p>
              <div className="space-y-1">
                {emp.data.experiencia.map((ex, i) => (
                  <div key={i} className="grid grid-cols-3 gap-1">
                    {['tipo_periodo', 'fecha_inicio', 'fecha_fin', 'institucion'].map(f => (
                      <Input key={f} value={ex[f] || ''} placeholder={f.replace('_', ' ')}
                        onChange={e => onEdit(emp.sheetName, 'experiencia', i, f, e.target.value)}
                        className="h-6 text-xs" />
                    ))}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Capacitación */}
          {emp.data.capacitacion.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-slate-600 mb-1">Capacitación ({emp.data.capacitacion.length} cursos)</p>
              <div className="space-y-1">
                {emp.data.capacitacion.map((c, i) => (
                  <div key={i} className="grid grid-cols-4 gap-1">
                    {['nombre_curso', 'horas', 'nota', 'nivel_tecnico'].map(f => (
                      <Input key={f} value={c[f] || ''} placeholder={f.replace('_', ' ')}
                        onChange={e => onEdit(emp.sheetName, 'capacitacion', i, f, e.target.value)}
                        className="h-6 text-xs" />
                    ))}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function ImportModule() {
  const fileInputRef = useRef(null);
  const [employees, setEmployees] = useState([]); // parsed per-sheet
  const [step, setStep] = useState('idle'); // idle | preview | done
  const [importing, setImporting] = useState(false);
  const [importLog, setImportLog] = useState(null);

  const { data: dbEmployees = [] } = useQuery({
    queryKey: ['employees-all'],
    queryFn: () => base44.entities.Employee.list(),
  });

  const rutMap = {};
  dbEmployees.forEach(e => { rutMap[normalizeRUT(e.rut)] = e; });

  const parseAndSetFile = (file) => {
    const reader = new FileReader();
    reader.onload = (ev) => {
      const wb = XLSX.read(ev.target.result, { type: 'array', cellDates: false });
      const parsed = wb.SheetNames.map(name => {
        const sheet = wb.Sheets[name];
        const data = parseEmployeeSheet(sheet);
        const errors = [...data.rawErrors, ...validateEmployee(data, rutMap)];
        return { sheetName: name, data, errors };
      });
      setEmployees(parsed);
      setStep('preview');
      setImportLog(null);
    };
    reader.readAsArrayBuffer(file);
  };

  const handleFile = (e) => {
    const file = e.target.files[0]; if (!file) return;
    parseAndSetFile(file);
  };

  // Re-validate after edit
  const revalidateAll = (emps) => {
    return emps.map(emp => ({
      ...emp,
      errors: [...(emp.data.rawErrors || []), ...validateEmployee(emp.data, rutMap)],
    }));
  };

  const handleEdit = (sheetName, section, rowIdx, field, value) => {
    setEmployees(prev => {
      const updated = prev.map(emp => {
        if (emp.sheetName !== sheetName) return emp;
        const newData = { ...emp.data };
        if (section === 'personal') {
          newData.personal = { ...newData.personal, [field]: value };
          if (field === 'rut') newData.personal.rut = normalizeRUT(value);
        } else {
          const arr = [...newData[section]];
          arr[rowIdx] = { ...arr[rowIdx], [field]: value };
          newData[section] = arr;
        }
        return { ...emp, data: newData };
      });
      return revalidateAll(updated);
    });
  };

  const handleConfirm = async () => {
    const valid = employees.filter(e => e.errors.length === 0);
    if (!valid.length) { toast.error('No hay funcionarios sin errores para importar'); return; }
    setImporting(true);
    const log = { ok: [], failed: [] };
    for (const emp of valid) {
      try {
        await importEmployee(emp.data, rutMap);
        log.ok.push(emp.sheetName);
      } catch (err) {
        log.failed.push({ name: emp.sheetName, error: err.message });
      }
    }
    setImportLog({ ...log, total: employees.length, skipped: employees.length - valid.length });
    setStep('done');
    setImporting(false);
    toast.success(`${log.ok.length} funcionario${log.ok.length !== 1 ? 's' : ''} importado${log.ok.length !== 1 ? 's' : ''}`);
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
          Carga tu libro Excel con una pestaña por funcionario. Cada hoja debe contener datos personales, experiencia y capacitación.
        </p>
      </div>

      {/* Instrucciones + acciones */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <FileSpreadsheet className="w-4 h-4 text-indigo-600" /> Estructura del libro Excel
          </CardTitle>
        </CardHeader>
        <CardContent className="text-xs text-slate-600 space-y-2">
          <p>Cada pestaña = un funcionario. Dentro de cada hoja se esperan <strong>3 secciones con sus encabezados</strong>:</p>
          <ul className="list-disc list-inside space-y-0.5">
            <li><strong>Datos personales:</strong> fila con RUT | Nombre | Categoría | Nivel | Cargo | Fecha Ingreso | Tipo Contrato</li>
            <li><strong>Experiencia:</strong> fila con Tipo Periodo | Fecha Inicio | Fecha Fin | Institución | N° Resolución</li>
            <li><strong>Capacitación:</strong> fila con Nombre Curso | Institución | Horas | Nota | Nivel Tecnico | Fecha | Estado</li>
          </ul>
          <div className="flex gap-3 pt-2">
            <Button variant="outline" size="sm" onClick={downloadTemplate}>
              <Download className="w-4 h-4 mr-1" /> Descargar plantilla Excel
            </Button>
            <Button size="sm" className="bg-indigo-600 hover:bg-indigo-700" onClick={() => fileInputRef.current?.click()}>
              <Upload className="w-4 h-4 mr-1" /> Seleccionar libro Excel
            </Button>
            <input ref={fileInputRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={handleFile} />
          </div>
        </CardContent>
      </Card>

      {/* Panel de previsualización */}
      {step === 'preview' && employees.length > 0 && (
        <div className="space-y-4">
          {/* Resumen */}
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-3">
              <span className="text-sm font-semibold text-slate-700">{employees.length} pestaña{employees.length !== 1 ? 's' : ''} detectada{employees.length !== 1 ? 's' : ''}</span>
              <Badge className="bg-green-100 text-green-800">{validCount} sin errores</Badge>
              {errorCount > 0 && <Badge className="bg-red-100 text-red-800">{errorCount} con errores</Badge>}
            </div>
            {errorCount > 0 && (
              <p className="text-xs text-amber-700 flex items-center gap-1">
                <Pencil className="w-3 h-3" /> Expande cada tarjeta para corregir los datos directamente.
              </p>
            )}
          </div>

          {/* Tarjetas de funcionarios */}
          <div className="space-y-2">
            {employees.map(emp => (
              <EmployeeCard key={emp.sheetName} emp={emp} rutMap={rutMap} onEdit={handleEdit} />
            ))}
          </div>

          {/* Confirmar */}
          <div className="flex items-center gap-4 pt-2">
            <Button
              onClick={handleConfirm}
              disabled={importing || validCount === 0}
              className="bg-emerald-600 hover:bg-emerald-700"
            >
              <ClipboardCheck className="w-4 h-4 mr-1" />
              {importing ? 'Importando...' : `Confirmar carga (${validCount} funcionario${validCount !== 1 ? 's' : ''})`}
            </Button>
            {errorCount > 0 && (
              <p className="text-xs text-slate-500">{errorCount} pestaña{errorCount !== 1 ? 's' : ''} con errores serán omitidas.</p>
            )}
            <Button variant="ghost" size="sm" onClick={reset}>
              <RotateCcw className="w-3.5 h-3.5 mr-1" /> Cancelar
            </Button>
          </div>
        </div>
      )}

      {/* Resultado final */}
      {step === 'done' && importLog && (
        <Card className="border-emerald-200 bg-emerald-50">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2 text-emerald-800">
              <CheckCircle2 className="w-4 h-4" /> Importación completada
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-4 gap-3">
              <div className="bg-white rounded-lg p-3 text-center border">
                <div className="text-2xl font-bold text-slate-900">{importLog.total}</div>
                <div className="text-xs text-slate-500 mt-1">Total pestañas</div>
              </div>
              <div className="bg-white rounded-lg p-3 text-center border border-green-200">
                <div className="text-2xl font-bold text-green-600">{importLog.ok.length}</div>
                <div className="text-xs text-slate-500 mt-1">Importados</div>
              </div>
              <div className="bg-white rounded-lg p-3 text-center border border-red-200">
                <div className="text-2xl font-bold text-red-500">{importLog.skipped}</div>
                <div className="text-xs text-slate-500 mt-1">Omitidos (errores)</div>
              </div>
              <div className="bg-white rounded-lg p-3 text-center border border-orange-200">
                <div className="text-2xl font-bold text-orange-500">{importLog.failed.length}</div>
                <div className="text-xs text-slate-500 mt-1">Error al guardar</div>
              </div>
            </div>

            {importLog.ok.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {importLog.ok.map(name => (
                  <Badge key={name} className="bg-green-100 text-green-800 text-[10px]">
                    <User className="w-2.5 h-2.5 mr-1" />{name}
                  </Badge>
                ))}
              </div>
            )}

            {importLog.failed.length > 0 && (
              <div className="bg-red-50 border border-red-200 rounded p-3 space-y-1">
                <p className="text-xs font-semibold text-red-700 flex items-center gap-1">
                  <AlertTriangle className="w-3 h-3" /> Errores al guardar:
                </p>
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