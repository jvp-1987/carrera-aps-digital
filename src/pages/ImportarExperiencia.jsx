import { useState, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import * as XLSX from 'xlsx';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Upload, CheckCircle2, AlertTriangle, Loader2, FileSpreadsheet, User, RotateCcw, RefreshCw } from 'lucide-react';
import { Progress } from '@/components/ui/progress';
import { toast } from 'sonner';

// ── Helpers ───────────────────────────────────────────────────────
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
  if (cell.t === 'd' || (cell.t === 'n' && cell.w && /\d{1,2}[\/\-]\d{1,2}[\/\-]\d{4}/.test(cell.w))) {
    return cell.w ? cell.w.trim() : '';
  }
  return String(cell.v ?? '').trim();
}

const norm = (s) => (s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();

function extractRUTAndPeriods(sheet) {
  if (!sheet || !sheet['!ref']) return null;
  const range = XLSX.utils.decode_range(sheet['!ref']);
  const maxRow = range.e.r;

  let rut = '';
  const kvData = {};
  let periodos = [];
  let inExperiencia = false;
  let expHeaders = null;

  const rowText = (r) => {
    let t = '';
    for (let c = 0; c <= range.e.c; c++) t += ' ' + norm(cellStr(sheet, c, r));
    return t;
  };

  for (let r = 1; r <= maxRow; r++) {
    const c0raw = cellStr(sheet, 0, r);
    const c0n = norm(c0raw);
    const c1 = cellStr(sheet, 1, r);
    const c3n = norm(cellStr(sheet, 3, r));
    const c4 = cellStr(sheet, 4, r);
    const rt = rowText(r);

    if (!inExperiencia && /experiencia|periodos\s*de\s*servicio|servicio\s*anterior|historia\s*laboral/i.test(c0n)) {
      inExperiencia = true; expHeaders = null; continue;
    }
    if (inExperiencia && /^capacitaci|^entrenamiento|^formaci/i.test(c0n)) break;

    if (inExperiencia) {
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
        const establecimiento = findCol('establecimiento', 'institucion', 'instituc', 'lugar');
        if (!establecimiento || norm(establecimiento).includes('total')) continue;

        const tipoMatch = establecimiento.match(/\(([^)]+)\)/);
        const tipoRaw = tipoMatch ? tipoMatch[1].toLowerCase() : '';
        let tipo_periodo = 'Planta';
        if (tipoRaw.includes('reemplazo')) tipo_periodo = 'Reemplazo';
        else if (tipoRaw.includes('honorario')) tipo_periodo = 'Honorarios';
        else if (tipoRaw.includes('contrata') || tipoRaw.includes('contrato') || tipoRaw.includes('plazo')) tipo_periodo = 'Plazo Fijo';

        const institucion = establecimiento.replace(/\s*\([^)]*\)\s*$/, '').trim();
        periodos.push({
          tipo_periodo,
          institucion,
          fecha_inicio: normalizeDateString(findCol('inicio', 'desde', 'fecha inicio')),
          fecha_fin: normalizeDateString(findCol('termino', 'término', 'fin', 'hasta')),
          dias: findCol('dias', 'días'),
        });
      }
      continue;
    }

    if (c0n) kvData[c0n] = c1;
    if (c3n) kvData[c3n] = c4;
  }

  const rutEntry = Object.entries(kvData).find(([k]) => k.includes('rut'));
  if (rutEntry) rut = normalizeRUT(rutEntry[1]);

  return { rut, periodos };
}

const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const VALID_TYPES = ['Planta', 'Plazo Fijo', 'Honorarios', 'Reemplazo'];

async function importarPeriodos(emp, periodos) {
  // Eliminar períodos actuales con reintentos
  let oldPeriods = [];
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      oldPeriods = await base44.entities.ServicePeriod.filter({ employee_id: emp.id });
      break;
    } catch (err) {
      if (err?.response?.status === 429 && attempt < 4) await sleep(3000 * (attempt + 1));
      else throw err;
    }
  }
  for (const p of oldPeriods) {
    for (let attempt = 0; attempt < 5; attempt++) {
      try { await base44.entities.ServicePeriod.delete(p.id); break; }
      catch (err) { if (err?.response?.status === 429 && attempt < 4) await sleep(2000 * (attempt + 1)); else throw err; }
    }
  }

  // Crear nuevos
  const nuevos = periodos
    .filter(p => p.tipo_periodo && p.fecha_inicio)
    .map(p => ({
      employee_id: emp.id,
      period_type: VALID_TYPES.find(t => t.toLowerCase() === p.tipo_periodo.toLowerCase()) || 'Planta',
      start_date: p.fecha_inicio,
      end_date: p.fecha_fin || '',
      institution: p.institucion || '',
      days_count: p.dias ? parseInt(p.dias) || null : null,
      is_active: !p.fecha_fin,
      conflict_status: 'Sin Conflicto',
    }));

  if (nuevos.length > 0) {
    for (let attempt = 0; attempt < 5; attempt++) {
      try { await base44.entities.ServicePeriod.bulkCreate(nuevos); break; }
      catch (err) { if (err?.response?.status === 429 && attempt < 4) await sleep(3000 * (attempt + 1)); else throw err; }
    }
  }
  return nuevos.length;
}

// ── Calcular días entre dos fechas ────────────────────────────────
function calcDays(start, end) {
  if (!start || !end) return null;
  const d = Math.floor((new Date(end) - new Date(start)) / 86400000) + 1;
  return d > 0 ? d : null;
}

// ── Sección recálculo ─────────────────────────────────────────────
const BATCH_SIZE = 5;
const BATCH_PAUSE = 600; // ms entre lotes

function RecalcularDias() {
  const [status, setStatus] = useState('idle'); // idle | loading | running | done
  const [allPeriods, setAllPeriods] = useState([]);
  const [toFix, setToFix] = useState([]);
  const [progress, setProgress] = useState(0);
  const [updated, setUpdated] = useState(0);
  const [errors, setErrors] = useState(0);
  const cancelRef = useRef(false);

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
    cancelRef.current = false;
    setStatus('running');
    setProgress(0);
    setUpdated(0);
    setErrors(0);
    let done = 0;
    let updCount = 0;
    let errCount = 0;

    for (let i = 0; i < toFix.length; i += BATCH_SIZE) {
      if (cancelRef.current) break;
      const batch = toFix.slice(i, i + BATCH_SIZE);
      await Promise.all(batch.map(async (p) => {
        const correct = calcDays(p.start_date, p.end_date);
        for (let attempt = 0; attempt < 5; attempt++) {
          try {
            await base44.entities.ServicePeriod.update(p.id, { days_count: correct });
            updCount++;
            break;
          } catch (err) {
            if (err?.response?.status === 429 && attempt < 4) await sleep(2000 * (attempt + 1));
            else { errCount++; break; }
          }
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
    cancelRef.current = false;
  };

  return (
    <div className="border border-slate-200 rounded-xl p-4 space-y-3 bg-white">
      <div className="flex items-center gap-2">
        <RefreshCw className="w-4 h-4 text-indigo-500" />
        <h2 className="text-sm font-bold text-slate-800">Recalcular días de períodos</h2>
      </div>
      <p className="text-xs text-slate-500">
        Detecta períodos cuyo campo <code className="bg-slate-100 px-1 rounded">days_count</code> no coincide
        con la diferencia real entre inicio y término, y los corrige en lotes de {BATCH_SIZE}.
      </p>

      {status === 'idle' && allPeriods.length === 0 && (
        <Button size="sm" variant="outline" onClick={handleAnalyze}>
          Analizar períodos
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
              <Button size="sm" className="bg-indigo-600 hover:bg-indigo-700" onClick={handleRun}>
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
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs text-slate-600">
            <span className="flex items-center gap-1.5">
              <Loader2 className="w-3.5 h-3.5 animate-spin text-indigo-500" />
              Procesando... {Math.round((progress / 100) * toFix.length)} / {toFix.length}
            </span>
            <button className="text-red-500 hover:underline" onClick={() => { cancelRef.current = true; }}>
              Detener
            </button>
          </div>
          <Progress value={progress} className="h-2" />
          <div className="flex gap-4 text-xs">
            {updated > 0 && <span className="text-emerald-700">✓ {updated} actualizados</span>}
            {errors > 0 && <span className="text-red-600">✗ {errors} errores</span>}
          </div>
        </div>
      )}

      {status === 'done' && (
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-emerald-700 text-sm font-semibold">
            <CheckCircle2 className="w-4 h-4" /> Recálculo completado
          </div>
          <div className="flex gap-4 text-xs">
            <span className="text-emerald-700">✓ {updated} períodos corregidos</span>
            {errors > 0 && <span className="text-red-600">✗ {errors} errores</span>}
          </div>
          <Button size="sm" variant="ghost" onClick={handleReset}>
            <RotateCcw className="w-3.5 h-3.5 mr-1" /> Nueva verificación
          </Button>
        </div>
      )}
    </div>
  );
}

// ── Componente principal ─────────────────────────────────────────
export default function ImportarExperiencia() {
  const fileInputRef = useRef(null);
  const queryClient = useQueryClient();

  const [excelMap, setExcelMap] = useState(null); // rut -> { periodos, sheetName }
  const [loadingItem, setLoadingItem] = useState(null);
  const [importingAll, setImportingAll] = useState(false);
  const [results, setResults] = useState({}); // empId -> count | 'error'

  const { data: dbEmployees = [], isLoading: empLoading } = useQuery({
    queryKey: ['employees-imp-exp'],
    queryFn: () => base44.entities.Employee.list('-created_date', 2000),
  });

  const rutMap = {};
  dbEmployees.forEach(e => { rutMap[normalizeRUT(e.rut)] = e; });

  // Candidatos: funcionarios cuyo RUT aparece en el Excel
  const candidates = excelMap
    ? Object.entries(excelMap)
        .map(([rut, data]) => {
          const emp = rutMap[rut];
          return emp ? { emp, periodos: data.periodos, sheetName: data.sheetName } : null;
        })
        .filter(Boolean)
        .sort((a, b) => a.emp.full_name.localeCompare(b.emp.full_name))
    : [];

  const notFoundCount = excelMap
    ? Object.keys(excelMap).filter(rut => !rutMap[rut]).length
    : 0;

  const handleFile = (e) => {
    const file = e.target.files[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const wb = XLSX.read(ev.target.result, { type: 'array', cellDates: false });
      const names = wb.SheetNames.filter(n => n !== 'Sheet' && n.trim() !== '');
      const map = {};
      names.forEach(name => {
        const data = extractRUTAndPeriods(wb.Sheets[name]);
        if (data?.rut) map[data.rut] = { periodos: data.periodos, sheetName: name };
      });
      setExcelMap(map);
      setResults({});
    };
    reader.readAsArrayBuffer(file);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleOne = async (item) => {
    setLoadingItem(item.emp.id);
    try {
      const count = await importarPeriodos(item.emp, item.periodos);
      setResults(r => ({ ...r, [item.emp.id]: count }));
      toast.success(`${item.emp.full_name}: ${count} período(s) importados`);
      queryClient.invalidateQueries({ queryKey: ['service-periods-overlap-audit'] });
    } catch (err) {
      setResults(r => ({ ...r, [item.emp.id]: 'error' }));
      toast.error(`Error en ${item.emp.full_name}: ${err.message}`);
    }
    setLoadingItem(null);
  };

  const handleAll = async () => {
    const pending = candidates.filter(c => results[c.emp.id] === undefined);
    if (!pending.length) return;
    setImportingAll(true);
    for (let i = 0; i < pending.length; i++) {
      const item = pending[i];
      setLoadingItem(item.emp.id);
      try {
        const count = await importarPeriodos(item.emp, item.periodos);
        setResults(r => ({ ...r, [item.emp.id]: count }));
        queryClient.invalidateQueries({ queryKey: ['service-periods-overlap-audit'] });
      } catch (err) {
        setResults(r => ({ ...r, [item.emp.id]: 'error' }));
        toast.error(`Error en ${item.emp.full_name}: ${err.message}`);
      }
      if (i < pending.length - 1) await sleep(400);
    }
    setLoadingItem(null);
    setImportingAll(false);
    toast.success('Importación completada');
  };

  const pendingCount = candidates.filter(c => results[c.emp.id] === undefined).length;
  const doneCount = candidates.filter(c => results[c.emp.id] !== undefined && results[c.emp.id] !== 'error').length;
  const errorCount = candidates.filter(c => results[c.emp.id] === 'error').length;

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Importar Experiencia Laboral</h1>
        <p className="text-sm text-slate-500 mt-1">
          Carga el Excel de Carrera Funcionaria y reemplaza los períodos de servicio de cada funcionario identificado.
          <strong className="text-slate-700"> No toca capacitaciones ni datos del empleado.</strong>
        </p>
      </div>

      {/* Cargar Excel */}
      <Card>
        <CardContent className="p-4 flex items-center gap-4">
          <FileSpreadsheet className="w-8 h-8 text-indigo-400 shrink-0" />
          <div className="flex-1">
            {excelMap ? (
              <>
                <p className="text-sm font-medium text-slate-700">
                  Excel cargado · {Object.keys(excelMap).length} hojas · {candidates.length} funcionarios identificados
                </p>
                {notFoundCount > 0 && (
                  <p className="text-xs text-amber-600 mt-0.5">{notFoundCount} hoja(s) sin coincidencia en la BD</p>
                )}
              </>
            ) : (
              <p className="text-sm text-slate-500">Sube el Excel para identificar los funcionarios y sus períodos</p>
            )}
          </div>
          <Button
            variant={excelMap ? 'outline' : 'default'}
            className={!excelMap ? 'bg-indigo-600 hover:bg-indigo-700' : ''}
            onClick={() => fileInputRef.current?.click()}
          >
            <Upload className="w-4 h-4 mr-1" />
            {excelMap ? 'Cambiar archivo' : 'Seleccionar Excel'}
          </Button>
          <input ref={fileInputRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={handleFile} />
        </CardContent>
      </Card>

      {/* Recálculo de días */}
      <RecalcularDias />

      {/* Sin candidatos */}
      {excelMap && candidates.length === 0 && (
        <Card className="border-amber-200 bg-amber-50">
          <CardContent className="p-4 flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-amber-500" />
            <p className="text-sm text-amber-700">Ningún funcionario del Excel fue encontrado en la base de datos.</p>
          </CardContent>
        </Card>
      )}

      {/* Lista de candidatos */}
      {candidates.length > 0 && (
        <div className="space-y-3">
          {/* Header + botón importar todos */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <p className="text-sm font-semibold text-slate-700">{candidates.length} funcionario(s)</p>
              {doneCount > 0 && <Badge className="bg-emerald-100 text-emerald-700">✓ {doneCount} importados</Badge>}
              {errorCount > 0 && <Badge className="bg-red-100 text-red-700">✗ {errorCount} errores</Badge>}
            </div>
            {pendingCount > 0 && (
              <Button
                size="sm"
                className="bg-emerald-600 hover:bg-emerald-700"
                disabled={importingAll || loadingItem !== null}
                onClick={handleAll}
              >
                {importingAll
                  ? <><Loader2 className="w-3.5 h-3.5 animate-spin mr-1" /> Importando...</>
                  : <><CheckCircle2 className="w-3.5 h-3.5 mr-1" /> Importar todos ({pendingCount})</>
                }
              </Button>
            )}
          </div>

          {/* Filas */}
          <div className="space-y-2">
            {candidates.map(item => {
              const res = results[item.emp.id];
              const isDone = res !== undefined && res !== 'error';
              const isErr = res === 'error';
              const isThis = loadingItem === item.emp.id;

              return (
                <Card key={item.emp.id} className={
                  isDone ? 'border-emerald-200 bg-emerald-50' :
                  isErr  ? 'border-red-200 bg-red-50' : 'border-slate-200'
                }>
                  <CardContent className="p-3 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <User className="w-4 h-4 text-slate-400 shrink-0" />
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-slate-800 truncate">{item.emp.full_name}</p>
                        <p className="text-xs text-slate-400">
                          {item.emp.rut} · Cat. {item.emp.category} · {item.periodos.length} período(s) en Excel
                        </p>
                      </div>
                    </div>
                    <div className="shrink-0">
                      {isDone ? (
                        <Badge className="bg-emerald-100 text-emerald-700 text-xs">
                          <CheckCircle2 className="w-3 h-3 mr-1" /> {res} períodos
                        </Badge>
                      ) : isErr ? (
                        <Badge className="bg-red-100 text-red-700 text-xs">Error</Badge>
                      ) : (
                        <Button
                          size="sm"
                          className="bg-indigo-600 hover:bg-indigo-700 h-7 text-xs"
                          disabled={isThis || importingAll}
                          onClick={() => handleOne(item)}
                        >
                          {isThis ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Importar'}
                        </Button>
                      )}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}