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
  return cell ? String(cell.v ?? '').trim() : '';
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

  // Fila 0 → header con cat/nivel/pts/bienios
  const headerStr = cellStr(sheet, 0, 0);
  const headerData = parseHeaderString(headerStr);

  // Leer pares clave-valor de la sección personal (filas 2..N)
  // col0=label izq, col1=valor izq, col3=label der, col4=valor der
  const kvData = {};
  let experienciaRows = [];
  let capacitacionRows = [];
  let inExperiencia = false;
  let inCapacitacion = false;
  let expHeaders = null;
  let capHeaders = null;

  for (let r = 2; r <= maxRow; r++) {
    const c0 = cellStr(sheet, 0, r).toLowerCase().trim();
    const c1 = cellStr(sheet, 1, r);
    const c3 = cellStr(sheet, 3, r).toLowerCase().trim();
    const c4 = cellStr(sheet, 4, r);

    // Detectar inicio de secciones
    if (c0.includes('experiencia') || c0.includes('periodos de servicio') || c0.includes('periodo de servicio')) {
      inExperiencia = true; inCapacitacion = false; expHeaders = null; continue;
    }
    if (c0.includes('capacitaci') || c0.includes('capacitación')) {
      inCapacitacion = true; inExperiencia = false; capHeaders = null; continue;
    }

    if (inExperiencia) {
      // Primera fila con contenido = headers de la tabla
      if (!expHeaders && (c0 || c1)) {
        expHeaders = {};
        for (let c = 0; c <= range.e.c; c++) {
          const h = cellStr(sheet, c, r).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
          if (h) expHeaders[h] = c;
        }
        continue;
      }
      if (expHeaders) {
        const tipo = expHeaders['tipo periodo'] !== undefined ? cellStr(sheet, expHeaders['tipo periodo'], r)
          : expHeaders['tipo'] !== undefined ? cellStr(sheet, expHeaders['tipo'], r) : '';
        if (!tipo) continue;
        const getE = (keys) => {
          for (const k of keys) if (expHeaders[k] !== undefined) return cellStr(sheet, expHeaders[k], r);
          return '';
        };
        experienciaRows.push({
          tipo_periodo: tipo,
          fecha_inicio: getE(['fecha inicio', 'inicio', 'fecha_inicio']),
          fecha_fin: getE(['fecha fin', 'fin', 'fecha_fin']),
          institucion: getE(['institucion', 'institución']),
          n_resolucion: getE(['n resolucion', 'n° resolucion', 'resolucion', 'resolución']),
        });
      }
      continue;
    }

    if (inCapacitacion) {
      if (!capHeaders && (c0 || c1)) {
        capHeaders = {};
        for (let c = 0; c <= range.e.c; c++) {
          const h = cellStr(sheet, c, r).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
          if (h) capHeaders[h] = c;
        }
        continue;
      }
      if (capHeaders) {
        const nombre = capHeaders['nombre curso'] !== undefined ? cellStr(sheet, capHeaders['nombre curso'], r)
          : capHeaders['curso'] !== undefined ? cellStr(sheet, capHeaders['curso'], r) : '';
        if (!nombre) continue;
        const getC = (keys) => {
          for (const k of keys) if (capHeaders[k] !== undefined) return cellStr(sheet, capHeaders[k], r);
          return '';
        };
        capacitacionRows.push({
          nombre_curso: nombre,
          institucion: getC(['institucion', 'institución']),
          horas: getC(['horas']),
          nota: getC(['nota']),
          nivel_tecnico: getC(['nivel tecnico', 'nivel_tecnico', 'nivel']),
          fecha: getC(['fecha', 'fecha finalizacion', 'fecha_finalizacion']),
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
    full_name: sheetName.trim(),
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
  } else {
    savedEmp = await base44.entities.Employee.create(payload);
  }

  // Importar periodos de servicio si existen
  for (const e of emp.experiencia) {
    if (!e.tipo_periodo || !e.fecha_inicio) continue;
    const validTypes = ['Planta', 'Plazo Fijo', 'Honorarios', 'Reemplazo'];
    const tipo = validTypes.find(t => t.toLowerCase() === e.tipo_periodo.toLowerCase()) || 'Planta';
    await base44.entities.ServicePeriod.create({
      employee_id: savedEmp.id,
      period_type: tipo,
      start_date: e.fecha_inicio,
      end_date: e.fecha_fin || '',
      institution: e.institucion || '',
      resolution_number: e.n_resolucion || '',
      is_active: !e.fecha_fin,
      conflict_status: 'Sin Conflicto',
    });
  }
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
          {emp.data.experiencia?.length > 0 && (
            <p className="text-xs text-slate-500">{emp.data.experiencia.length} periodo(s) de servicio detectados</p>
          )}
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

  const { data: dbEmployees = [] } = useQuery({
    queryKey: ['employees-all'],
    queryFn: () => base44.entities.Employee.list(),
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
    toast.success(`${log.ok.length} funcionario(s) importado(s)`);
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
        <CardContent className="text-xs text-slate-600 space-y-2">
          <p>El archivo <strong>CarreraFuncionaria</strong> con una pestaña por funcionario. Cada hoja contiene:</p>
          <ul className="list-disc list-inside space-y-0.5">
            <li>Fila 1: <code>Cat. X · Nivel Y · Z pts · N bienios</code></li>
            <li>Fila 3: RUT | valor | | Cargo | valor</li>
            <li>Filas siguientes: pares clave-valor con datos personales</li>
          </ul>
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

          <div className="flex items-center gap-4 pt-2 border-t">
            <Button
              onClick={handleConfirm}
              disabled={importing || validCount === 0}
              className="bg-emerald-600 hover:bg-emerald-700"
            >
              <ClipboardCheck className="w-4 h-4 mr-1" />
              {importing ? 'Importando...' : `Importar ${validCount} funcionario(s)`}
            </Button>
            {errorCount > 0 && (
              <p className="text-xs text-slate-500">{errorCount} registro(s) con errores serán omitidos.</p>
            )}
            <Button variant="ghost" size="sm" onClick={reset}>
              <RotateCcw className="w-3.5 h-3.5 mr-1" /> Cancelar
            </Button>
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