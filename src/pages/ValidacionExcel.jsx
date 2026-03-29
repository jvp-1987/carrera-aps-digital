import { useState, useRef } from 'react';
import * as XLSX from 'xlsx';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Upload, FileSpreadsheet, CheckCircle2, AlertTriangle, XCircle, RefreshCw, Download, UserPlus } from 'lucide-react';
import { toast } from 'sonner';

// ── Normalización ──────────────────────────────────────────────
function norm(v, isNationality = false) {
  let val = (v ?? '').toString().trim()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ');
  
  if (isNationality) {
    const l = val.toLowerCase();
    if (l === 'chile' || l === 'chilena' || l === 'chileno' || l === 'chilenos' || l === 'chilenas' || l === 'cl') return 'Chilena';
    return val; // Mantener original (ej: "Extranjera") pero trim
  }
  return val.toLowerCase();
}
function normRut(v) {
  return (v ?? '').toString().replace(/\./g, '').replace(/-/g, '').replace(/\s/g, '').toUpperCase();
}

// Convierte cualquier valor de fecha a formato 'YYYY-MM-DD' de forma ultra-robusta
function toISODate(v) {
  if (!v && v !== 0) return '';
  
  // 1. Si ya es un objeto Date (xlsx con cellDates:true)
  if (v instanceof Date) {
    if (isNaN(v.getTime())) return '';
    const y = v.getFullYear();
    const m = String(v.getMonth() + 1).padStart(2, '0');
    const d = String(v.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  // 2. Si es un número (Excel serial date)
  if (typeof v === 'number' || (!isNaN(v) && !isNaN(parseFloat(v)))) {
    // Excel epochs: 1900-01-01. 
    // XLSX.utils.format_cell puede ser pesado, usamos cálculo manual seguro:
    // Ajuste de 25569 días ente 1900 y 1970 epoch.
    const date = new Date(Math.round((Number(v) - 25569) * 86400 * 1000));
    if (isNaN(date.getTime())) return String(v);
    // Debido a desfases de timezone de Excel, sumamos unas horas para evitar saltos al día anterior
    date.setUTCHours(date.getUTCHours() + 12); 
    const y = date.getUTCFullYear();
    const m = String(date.getUTCMonth() + 1).padStart(2, '0');
    const d = String(date.getUTCDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  const s = String(v).trim();
  if (!s) return '';

  // 3. Formato DD/MM/YYYY o DD-MM-YYYY
  const dmy = s.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})$/);
  if (dmy) return `${dmy[3]}-${dmy[2].padStart(2,'0')}-${dmy[1].padStart(2,'0')}`;

  // 4. Formato YYYY-MM-DD
  const ymd = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (ymd) return s;

  // 5. Formato DD/MM/YY (años cortos)
  const dmyShort = s.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{2})$/);
  if (dmyShort) {
    const year = parseInt(dmyShort[3]);
    const fullYear = year > 40 ? 1900 + year : 2000 + year;
    return `${fullYear}-${dmyShort[2].padStart(2,'0')}-${dmyShort[1].padStart(2,'0')}`;
  }

  return s;
}

// Formatea 'YYYY-MM-DD' a 'DD/MM/YYYY' para visualización
function formatToDMY(isoStr) {
  if (!isoStr || !/^\d{4}-\d{2}-\d{2}$/.test(isoStr)) return isoStr;
  const [y, m, d] = isoStr.split('-');
  return `${d}/${m}/${y}`;
}

// ── Campos a comparar ─────────────────────────────────────────
const COMPARE_FIELDS = [
  { key: 'full_name',      label: 'Nombre',           normalize: norm, formatForSystem: val => String(val || '').trim() },
  { key: 'rut',            label: 'RUT',              normalize: normRut, formatForSystem: normRut },
  { key: 'birth_date',     label: 'Fecha Nacimiento', normalize: toISODate, formatForSystem: toISODate },
  { key: 'category',       label: 'Categoría',        normalize: norm, formatForSystem: val => {
      const v = String(val || '').trim().toUpperCase();
      const match = v.match(/\b([A-F])\b/);
      return match ? match[1] : v;
  } },
  { key: 'position',       label: 'Cargo',            normalize: val => norm(val).toUpperCase(), formatForSystem: val => String(val || '').trim().toUpperCase() },
  { key: 'profession',     label: 'Profesión',        normalize: val => norm(val).toUpperCase(), formatForSystem: val => String(val || '').trim().toUpperCase() },
  { key: 'department',     label: 'Establecimiento',  normalize: norm, formatForSystem: val => String(val || '').trim() },
  { key: 'nationality',    label: 'Nacionalidad',     normalize: val => norm(val, true), formatForSystem: val => {
      const n = norm(val, true);
      return n.toLowerCase() === 'chilena' ? 'Chilena' : String(val || '').trim();
  } },
  { key: 'contract_type',  label: 'Tipo Contrato',    normalize: norm, formatForSystem: val => {
      const v = norm(val);
      if (v.includes('fijo')) return 'Plazo Fijo';
      if (v.includes('planta') || v.includes('titular')) return 'Planta';
      if (v.includes('honorario')) return 'Honorarios';
      if (v.includes('reemplazo')) return 'Reemplazo';
      return String(val || '').trim();
  } },
];

// ── Intenta mapear columnas del Excel al esquema interno ───────
function parseExcelRow(row) {
  if (!row || typeof row !== 'object') return { parsed: {} };
  const columnsFound = {};
  const getRaw = (...keys) => {
    for (const k of keys) {
      const found = Object.keys(row).find(col => norm(col) === norm(k));
      if (found !== undefined) {
        columnsFound[k] = found;
        if (row[found] !== undefined && row[found] !== '') return row[found];
      }
    }
    return '';
  };
  const get = (...keys) => {
    const raw = getRaw(...keys);
    return raw === '' ? '' : String(raw).trim();
  };
  const getDate = (...keys) => {
    const raw = getRaw(...keys);
    if (raw === '' || raw === undefined) return '';
    return toISODate(raw);
  };

  const parsed = {
    full_name:     get('nombre', 'nombre completo', 'funcionario', 'nombres', 'apellidos y nombres', 'nombre_completo'),
    rut:           get('rut', 'run', 'cedula', 'id'),
    birth_date:    getDate('fecha nacimiento', 'nacimiento', 'fecha de nacimiento', 'fecha_nacimiento', 'fechanacimiento', 'f. nacimiento', 'fec. nacimiento', 'f.nacimiento', 'fec. nac', 'f. nac', 'dob', 'date of birth'),
    category:      get('categoria', 'categoría', 'cat', 'estamento', 'nivel cat'),
    position:      get('cargo', 'puesto', 'especialidad', 'funcion', 'función', 'profesion', 'profesión', ' Profesión'),
    profession:    get('profesion', 'profesión', ' Profesión', 'titulo', 'título', 'prof', 'cargo', 'puesto'),
    department:    get('establecimiento', 'departamento', 'unidad', 'cesfam', 'consultorio', 'lugar de trabajo', 'centro'),
    nationality:   get('nacionalidad', 'nacionalidad funcionario', 'nacionalidad func.', 'nac.', 'nac', 'nacion', 'pais', 'país', 'nationality', 'pais de origen'),
    contract_type: get('tipo contrato', 'contrato', 'tipo de contrato', 'tipo_contrato', 'calidad juridica', 'calidad jurídica', 'vinculo'),
  };

  return { parsed, columnsFound };
}

// ── Lógica de comparación ──────────────────────────────────────
function compareEmployee(excelRow, sysEmployee) {
  const diffs = {};
  for (const field of COMPARE_FIELDS) {
    const rawExcel = excelRow[field.key] ?? '';
    const rawSys   = sysEmployee?.[field.key] ?? '';
    const excelVal = field.normalize(rawExcel);
    const sysVal   = field.normalize(rawSys);
    const systemPayload = field.formatForSystem ? field.formatForSystem(rawExcel) : excelVal;

    // DEBUG: Solo loggear si son campos problemáticos
    if (field.key === 'birth_date' || field.key === 'nationality') {
      console.log(`[DEBUG] Comparando ${field.key} para ${sysEmployee?.full_name}:`);
      console.log(`  Excel: "${rawExcel}" -> normalizado: "${excelVal}"`);
      console.log(`  Sistema: "${rawSys}" -> normalizado: "${sysVal}"`);
    }

    if (excelVal && sysVal && excelVal !== sysVal) {
      const displayExcel = field.key === 'birth_date' ? formatToDMY(excelVal) : excelVal;
      const displaySys   = field.key === 'birth_date' ? formatToDMY(sysVal)   : sysVal;
      diffs[field.key] = { excel: displayExcel, system: displaySys, raw: systemPayload };
    } else if (excelVal && !sysVal) {
      const displayExcel = field.key === 'birth_date' ? formatToDMY(excelVal) : excelVal;
      diffs[field.key] = { excel: displayExcel, system: '(vacío)', missing: true, raw: systemPayload };
    }
  }
  return diffs;
}

// ── Subcomponente: Fila de resultado ──────────────────────────
function ResultRow({ result, onApply, isApplying, onCreate, isCreating }) {
  const { excelRow, employee, diffs, status } = result;
  const hasDiffs = Object.keys(diffs).length > 0;

  const rowBg = status === 'not_found'
    ? 'bg-red-50 border-red-200'
    : hasDiffs
    ? 'bg-amber-50 border-amber-200'
    : 'bg-emerald-50 border-emerald-100';

  return (
    <div className={`border rounded-lg p-4 ${rowBg}`}>
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3 min-w-0">
          {status === 'not_found' ? (
            <XCircle className="w-5 h-5 text-red-500 shrink-0" />
          ) : hasDiffs ? (
            <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0" />
          ) : (
            <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0" />
          )}
          <div>
            <p className="font-semibold text-sm text-slate-900">{excelRow.full_name || '(Sin nombre)'}</p>
            <p className="text-xs text-slate-500">{excelRow.rut || '—'}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {status === 'not_found' && (
            <Button
              size="sm"
              className="bg-red-600 hover:bg-red-700 text-white h-7 text-xs"
              disabled={isCreating}
              onClick={() => onCreate(excelRow)}
            >
              {isCreating ? <RefreshCw className="w-3 h-3 animate-spin mr-1" /> : <UserPlus className="w-3 h-3 mr-1" />}
              Agregar al sistema
            </Button>
          )}
          {status === 'ok' && !hasDiffs && (
            <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200 text-[10px]">✓ Sin diferencias</Badge>
          )}
          {hasDiffs && employee && (
            <Button
              size="sm"
              className="bg-amber-600 hover:bg-amber-700 text-white h-7 text-xs"
              disabled={isApplying}
              onClick={() => onApply(employee.id, diffs)}
            >
              {isApplying ? <RefreshCw className="w-3 h-3 animate-spin mr-1" /> : null}
              Aplicar corrección
            </Button>
          )}
        </div>
      </div>

      {hasDiffs && (
        <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
          {Object.entries(diffs).map(([fieldKey, { excel, system }]) => {
            const fieldDef = COMPARE_FIELDS.find(f => f.key === fieldKey);
            return (
              <div key={fieldKey} className="bg-white border border-amber-200 rounded-md p-2 text-xs">
                <p className="text-[10px] font-bold text-slate-400 uppercase mb-1">{fieldDef?.label}</p>
                <p className="text-slate-500 line-through">{system}</p>
                <p className="text-amber-800 font-semibold">{excel}</p>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Página Principal ──────────────────────────────────────────
export default function ValidacionExcel() {
  const queryClient = useQueryClient();
  const fileRef = useRef(null);
  const [results, setResults] = useState(null);
  const [applyingId, setApplyingId] = useState(null);
  const [creatingIds, setCreatingIds] = useState(new Set());
  const [filter, setFilter] = useState('all'); // all | diffs | ok | not_found
  const [isDragging, setIsDragging] = useState(false);

  const { data: employees = [], isLoading, refetch } = useQuery({
    queryKey: ['employees-all-validation'],
    queryFn: () => base44.entities.Employee.list('-created_date', 2000),
    staleTime: 0, // siempre considerar datos desactualizados
  });

  // Nota: usamos base44.entities.Employee.update directamente en handleApply
  // siguiendo el mismo patrón que EmployeeProfile.jsx

  const [loadingFile, setLoadingFile] = useState(false);

  const processFile = async (file) => {
    if (!file) return;
    setLoadingFile(true);
    try {
      // Forzar datos frescos desde el servidor antes de comparar
      const freshResult = await refetch();
      const freshEmployees = freshResult.data ?? employees;

      const reader = new FileReader();
      reader.onload = (ev) => {
        try {
          const ab = ev.target.result;
          const wb = XLSX.read(ab, { type: 'array', cellDates: true });
          const ws = wb.Sheets[wb.SheetNames[0]];

          // Convertimos toda la hoja a una matriz 2D (incluyendo filas vacías y basura al inicio)
          const allRows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });

          // DESCUBRIMIENTO DE CABECERA: Buscamos qué fila contiene palabras clave (RUT, Nombre, Categoría, etc.)
          let headerIndex = -1;
          for (let i = 0; i < Math.min(25, allRows.length); i++) {
            const row = allRows[i].map(c => norm(c));
            if (row.some(c => c.includes('rut') || c.includes('nombre') || c.includes('funcionario') || c.includes('nacimiento'))) {
              headerIndex = i;
              break;
            }
          }

          if (headerIndex === -1) {
            toast.error('No se pudo encontrar una fila de cabecera válida en el Excel (buscando RUT, Nombre, etc.)');
            setLoadingFile(false);
            return;
          }

          console.log(`[DEBUG] Cabecera encontrada en fila: ${headerIndex}`, allRows[headerIndex]);

          // Re-extraemos los datos usando la cabecera descubierta
          const headers = allRows[headerIndex];
          const rows = allRows.slice(headerIndex + 1)
            .filter(r => r.some(c => c !== '')) // solo filas con algo de contenido
            .map(r => {
              const obj = {};
              headers.forEach((h, idx) => { if (h) obj[h] = r[idx]; });
              return obj;
            });

          console.log(`[DEBUG] Se procesarán ${rows.length} funcionarios del Excel.`);
          if (rows.length > 0) {
            console.log('[DEBUG] Columnas detectadas:', Object.keys(rows[0]));
          }

          const byRut = {};
          freshEmployees.forEach(e => { byRut[normRut(e.rut)] = e; });

          const mapped = rows
            .map(row => parseExcelRow(row))
            .filter(entry => entry.parsed.full_name || entry.parsed.rut)
            .map(entry => {
              const excelRow = entry.parsed;
              const normalized = normRut(excelRow.rut);
              const employee = byRut[normalized];
              if (!employee) return { excelRow, employee: null, diffs: {}, status: 'not_found' };
              const diffs = compareEmployee(excelRow, employee);
              return { excelRow, employee, diffs, status: Object.keys(diffs).length > 0 ? 'diffs' : 'ok' };
            });

          setResults(mapped);
          setLoadingFile(false);
          toast.success(`${mapped.length} registros procesados con datos actualizados`);
        } catch (err) {
          console.error('Error al procesar Excel:', err);
          toast.error('Error al procesar el archivo Excel');
          setLoadingFile(false);
        }
      };
      reader.onerror = () => setLoadingFile(false);
      reader.readAsArrayBuffer(file);
    } catch (err) {
      console.error('Error al obtener datos frescos:', err);
      toast.error('Error al sincronizar con el servidor');
      setLoadingFile(false);
    }
  };

  const handleFileChange = (e) => {
    processFile(e.target.files?.[0]);
    e.target.value = '';
  };

  const onDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) processFile(file);
  };

  const handleApply = async (employeeId, diffs) => {
    setApplyingId(employeeId);
    const patch = {};
    for (const [key, { raw }] of Object.entries(diffs)) {
      patch[key] = raw;
    }
    try {
      if (!employeeId) throw new Error('ID de funcionario no válido');
      await base44.entities.Employee.update(employeeId, patch);
      toast.success('Datos actualizados correctamente');
      
      // Actualiza el resultado en la lista local de forma segura
      setResults(prev => (prev || []).map(r => r.employee?.id === employeeId
        ? { ...r, diffs: {}, status: 'ok' }
        : r
      ));
      
      queryClient.invalidateQueries({ queryKey: ['employees-all-validation'] });
    } catch (err) {
      console.error(`[CRÍTICO] Error al aplicar corrección a ID ${employeeId}:`, err);
      toast.error(`Fallo en ID ${employeeId}: ${err?.message || 'Error desconocido'}`);
      throw err; // Re-lanzar para que handleApplyAll sepa que falló
    } finally {
      setApplyingId(null);
    }
  };

  const handleCreate = async (excelRow) => {
    const rutKey = normRut(excelRow.rut);
    setCreatingIds(prev => new Set(prev).add(rutKey));
    try {
      await base44.entities.Employee.create({
        ...excelRow,
        rut: normRut(excelRow.rut), // Normalizamos RUT SIEMPRE al crear para el sistema
        position: (excelRow.position || '').toUpperCase(),
        birth_date: excelRow.birth_date || '',
        nationality: excelRow.nationality
          ? ((['chile','chilena','chileno','chilenos','chilenas','cl'].includes((excelRow.nationality).toString().trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,''))) ? 'Chilena' : excelRow.nationality)
          : 'Chilena',
        status: 'Activo',
        current_level: 15,
        total_experience_days: 0,
        total_leave_days: 0,
        bienios_count: 0,
        bienio_points: 0,
        training_points: 0,
        postitle_percentage: 0,
        total_points: 0,
      });
      toast.success(`Funcionario ${excelRow.full_name} creado`);
      
      // Forzar refetch para actualizar la lista de empleados y recalculamos resultados
      const freshResult = await refetch();
      const freshEmployees = freshResult.data ?? [];
      const byRut = {};
      freshEmployees.forEach(e => { byRut[normRut(e.rut)] = e; });
      
      setResults(prev => (prev || []).map(r => {
        const normR = normRut(r.excelRow.rut);
        if (normR === rutKey) {
          const emp = byRut[normR];
          return { ...r, employee: emp, status: 'ok', diffs: {} };
        }
        return r;
      }));
    } catch (err) {
      console.error('Error al crear funcionario:', err);
      toast.error(`Error al crear funcionario: ${err?.message || 'Error desconocido'}`);
    }
    setCreatingIds(prev => {
      const next = new Set(prev);
      next.delete(rutKey);
      return next;
    });
  };

  const handleCreateAll = async () => {
    const notFound = (results || []).filter(r => r.status === 'not_found');
    if (!notFound.length) { toast.info('No hay funcionarios para agregar'); return; }
    if (!window.confirm(`¿Deseas agregar los ${notFound.length} funcionarios nuevos al sistema automáticamente?`)) return;
    
    // Procesar en serie para no saturar el servidor y tener feedback
    for (const r of notFound) {
      await handleCreate(r.excelRow);
    }
    toast.success('Importación finalizada');
  };

  const handleApplyAll = async () => {
    const withDiffs = (results || []).filter(r => Object.keys(r.diffs).length > 0 && r.employee);
    if (!withDiffs.length) { toast.info('No hay diferencias para aplicar'); return; }
    if (!window.confirm(`¿Aplicar las ${withDiffs.length} correcciones en lote? Esta acción actualizará los datos del sistema con los del Excel.`)) return;
    
    let successCount = 0;
    let failCount = 0;

    for (const r of withDiffs) {
      try {
        await handleApply(r.employee.id, r.diffs);
        successCount++;
      } catch (err) {
        failCount++;
      }
    }
    
    if (failCount > 0) {
      toast.warning(`Proceso completado con ${failCount} errores. Se aplicaron ${successCount} correcciones.`);
    } else {
      toast.success(`Se aplicaron ${successCount} correcciones exitosamente.`);
    }
  };

  const handleExportReport = () => {
    if (!results) return;
    const rows = results.map(r => ({
      'Estado': r.status === 'not_found' ? 'No encontrado' : Object.keys(r.diffs).length ? 'Con diferencias' : 'OK',
      'Nombre (Excel)': r.excelRow.full_name,
      'RUT (Excel)': r.excelRow.rut,
      'Nombre (Sistema)': r.employee?.full_name ?? '',
      ...Object.fromEntries(
        COMPARE_FIELDS.map(f => [
          f.label,
          r.diffs[f.key] ? `Excel: "${r.diffs[f.key].excel}" / Sistema: "${r.diffs[f.key].system}"` : '✓'
        ])
      ),
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Informe');
    XLSX.writeFile(wb, `validacion_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  const filtered = (results || []).filter(r => {
    if (filter === 'all') return true;
    if (filter === 'diffs') return Object.keys(r.diffs).length > 0;
    if (filter === 'ok') return r.status === 'ok';
    if (filter === 'not_found') return r.status === 'not_found';
    return true;
  });

  const stats = results ? {
    total: results.length,
    ok: results.filter(r => r.status === 'ok').length,
    diffs: results.filter(r => r.status === 'diffs').length,
    not_found: results.filter(r => r.status === 'not_found').length,
  } : null;

  return (
    <div className="p-6 lg:p-8 max-w-6xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Validación contra Base Excel</h1>
        <p className="text-sm text-slate-500 mt-1">Carga tu planilla maestra y el sistema comparará automáticamente los datos ingresados.</p>
      </div>

      {/* Upload & Drag Zone */}
      <div
        onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={onDrop}
      >
        <Card className={`border-dashed border-2 transition-all ${isDragging ? 'border-indigo-500 bg-indigo-50' : 'border-indigo-100 bg-indigo-50/30'}`}>
          <CardContent className="p-10">
            <div className="flex flex-col items-center justify-center text-center gap-4">
              <div className={`w-16 h-16 rounded-full flex items-center justify-center transition-colors ${isDragging ? 'bg-indigo-600 text-white' : 'bg-indigo-100 text-indigo-600'}`}>
                <Upload className={`w-8 h-8 ${isDragging ? 'animate-bounce' : ''}`} />
              </div>
              <div className="max-w-md">
                <p className="text-lg font-bold text-slate-800">
                  {isDragging ? '¡Suelta el archivo aquí!' : 'Arrastra tu planilla o haz clic para subir'}
                </p>
                <p className="text-sm text-slate-500 mt-1">
                  El sistema detectará automáticamente RUT, Nombre, Establecimiento, Categoría, Profesión, Nacionalidad y Fechas.
                </p>
              </div>
              <div className="flex gap-2 mt-2">
                <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" onChange={handleFileChange} className="hidden" />
                <Button
                  className="bg-indigo-600 hover:bg-indigo-700 font-semibold px-6"
                  onClick={() => fileRef.current?.click()}
                  disabled={isLoading || loadingFile}
                >
                  {loadingFile
                    ? <><RefreshCw className="w-4 h-4 mr-2 animate-spin" />Procesando...</>
                    : isLoading
                    ? 'Preparando sistema...'
                    : <><FileSpreadsheet className="w-4 h-4 mr-2" />Seleccionar Archivo</>
                  }
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Resultados */}
      {stats && (
        <>
          {/* Estadísticas */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {[
              { label: 'Total procesados', value: stats.total, color: 'text-slate-800', badge: 'bg-slate-100 text-slate-700', key: 'all' },
              { label: 'Sin diferencias', value: stats.ok, color: 'text-emerald-700', badge: 'bg-emerald-100 text-emerald-700', key: 'ok' },
              { label: 'Con diferencias', value: stats.diffs, color: 'text-amber-700', badge: 'bg-amber-100 text-amber-700', key: 'diffs' },
              { label: 'No encontrados', value: stats.not_found, color: 'text-red-700', badge: 'bg-red-100 text-red-700', key: 'not_found' },
            ].map(s => (
              <button
                key={s.key}
                onClick={() => setFilter(s.key)}
                className={`text-left p-4 rounded-lg border cursor-pointer transition-all ${filter === s.key ? 'ring-2 ring-indigo-400' : ''} ${s.badge}`}
              >
                <p className="text-[10px] font-bold uppercase tracking-wide opacity-70">{s.label}</p>
                <p className={`text-3xl font-black mt-1 ${s.color}`}>{s.value}</p>
              </button>
            ))}
          </div>

          {/* Acciones */}
          <div className="flex gap-2 flex-wrap">
            {stats.not_found > 0 && (
              <Button variant="outline" className="border-red-300 text-red-700 hover:bg-red-50" onClick={handleCreateAll}>
                <UserPlus className="w-4 h-4 mr-2" />
                Agregar todos los faltantes ({stats.not_found})
              </Button>
            )}
            {stats.diffs > 0 && (
              <Button variant="outline" className="border-amber-300 text-amber-700 hover:bg-amber-50" onClick={handleApplyAll}>
                <RefreshCw className="w-4 h-4 mr-2" />
                Aplicar todas las correcciones ({stats.diffs})
              </Button>
            )}
            <Button variant="outline" className="border-slate-300 text-slate-600" onClick={handleExportReport}>
              <Download className="w-4 h-4 mr-2" />
              Exportar Informe
            </Button>
          </div>

          {/* Lista */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-slate-600">
                Mostrando {filtered.length} de {stats.total} registros
              </p>
              <Badge className="bg-indigo-100 text-indigo-700 text-[10px]">
                <FileSpreadsheet className="w-3 h-3 mr-1" />
                {filter === 'all' ? 'Todos' : filter === 'diffs' ? 'Con diferencias' : filter === 'ok' ? 'Sin diferencias' : 'No encontrados'}
              </Badge>
            </div>
            {filtered.map((result, i) => (
              <ResultRow
                key={i}
                result={result}
                onApply={handleApply}
                isApplying={applyingId === result.employee?.id}
                onCreate={handleCreate}
                isCreating={creatingIds.has(normRut(result.excelRow.rut))}
              />
            ))}
            {filtered.length === 0 && (
              <div className="text-center py-12 text-slate-400">
                <CheckCircle2 className="w-10 h-10 mx-auto mb-3 text-emerald-400" />
                <p className="text-sm">No hay registros en esta categoría.</p>
              </div>
            )}
          </div>
        </>
      )}

      {!results && !isLoading && (
        <div className="text-center py-16 text-slate-300">
          <FileSpreadsheet className="w-16 h-16 mx-auto mb-4" />
          <p className="text-lg font-medium text-slate-400">Carga un archivo Excel para comenzar</p>
          <p className="text-sm text-slate-400 mt-1">El sistema comparará {employees.length} funcionarios registrados</p>
        </div>
      )}
    </div>
  );
}
