import { useState, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import * as XLSX from 'xlsx';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Upload, CheckCircle2, AlertTriangle, RotateCcw, Loader2, FileSpreadsheet, User } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
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
  let experienciaRows = [];
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

    if (c0n) kvData[c0n] = c1;
    if (c3n) kvData[c3n] = c4;
  }

  const rutEntry = Object.entries(kvData).find(([k]) => k.includes('rut'));
  if (rutEntry) rut = normalizeRUT(rutEntry[1]);

  return { rut, periodos: experienciaRows };
}

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

const validTypes = ['Planta', 'Plazo Fijo', 'Honorarios', 'Reemplazo'];

async function importarPeriodosParaEmpleado(emp, periodos) {
  // Eliminar períodos actuales
  let oldPeriods = [];
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      oldPeriods = await base44.entities.ServicePeriod.filter({ employee_id: emp.id });
      break;
    } catch (err) {
      if ((err?.response?.status === 429 || (err?.message || '').includes('rate')) && attempt < 4) {
        await sleep(3000 * (attempt + 1));
      } else throw err;
    }
  }
  for (const p of oldPeriods) {
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        await base44.entities.ServicePeriod.delete(p.id);
        break;
      } catch (err) {
        if ((err?.response?.status === 429 || (err?.message || '').includes('rate')) && attempt < 4) {
          await sleep(2000 * (attempt + 1));
        } else throw err;
      }
    }
  }

  // Crear nuevos
  const nuevos = periodos
    .filter(p => p.tipo_periodo && p.fecha_inicio)
    .map(p => ({
      employee_id: emp.id,
      period_type: validTypes.find(t => t.toLowerCase() === p.tipo_periodo.toLowerCase()) || 'Planta',
      start_date: p.fecha_inicio,
      end_date: p.fecha_fin || '',
      institution: p.institucion || '',
      days_count: p.dias ? parseInt(p.dias) || null : null,
      is_active: !p.fecha_fin,
      conflict_status: 'Sin Conflicto',
    }));

  if (nuevos.length > 0) {
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        await base44.entities.ServicePeriod.bulkCreate(nuevos);
        break;
      } catch (err) {
        if ((err?.response?.status === 429 || (err?.message || '').includes('rate')) && attempt < 4) {
          await sleep(3000 * (attempt + 1));
        } else throw err;
      }
    }
  }
  return nuevos.length;
}

// ── Componente principal ─────────────────────────────────────────
export default function ReimportarPeriodos() {
  const fileInputRef = useRef(null);
  const queryClient = useQueryClient();
  const [excelSheets, setExcelSheets] = useState(null); // mapa rut -> periodos
  const [loadingItem, setLoadingItem] = useState(null);
  const [doneItems, setDoneItems] = useState({});
  const [importingAll, setImportingAll] = useState(false);

  const { data: dbEmployees = [], isLoading: empLoading } = useQuery({
    queryKey: ['employees-reimport'],
    queryFn: () => base44.entities.Employee.list('-created_date', 2000),
  });

  const { data: allPeriods = [], isLoading: spLoading } = useQuery({
    queryKey: ['periods-reimport'],
    queryFn: () => base44.entities.ServicePeriod.list(null, 5000),
    enabled: dbEmployees.length > 0,
  });

  const isLoading = empLoading || spLoading;

  // Empleados sin períodos
  const periodsByEmp = {};
  allPeriods.forEach(p => {
    if (!periodsByEmp[p.employee_id]) periodsByEmp[p.employee_id] = 0;
    periodsByEmp[p.employee_id]++;
  });

  const sinPeriodos = dbEmployees.filter(e => !periodsByEmp[e.id] || periodsByEmp[e.id] === 0);

  const rutMap = {};
  dbEmployees.forEach(e => { rutMap[normalizeRUT(e.rut)] = e; });

  // De los sin períodos, cuáles tienen datos en el Excel cargado
  const candidates = excelSheets
    ? sinPeriodos.map(emp => {
        const rut = normalizeRUT(emp.rut);
        const sheet = excelSheets[rut];
        return sheet ? { emp, periodos: sheet.periodos, sheetName: sheet.sheetName } : null;
      }).filter(Boolean)
    : [];

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
      setExcelSheets(map);
      setDoneItems({});
    };
    reader.readAsArrayBuffer(file);
  };

  const handleImportOne = async (item) => {
    setLoadingItem(item.emp.id);
    try {
      const count = await importarPeriodosParaEmpleado(item.emp, item.periodos);
      setDoneItems(d => ({ ...d, [item.emp.id]: count }));
      toast.success(`${item.emp.full_name}: ${count} período(s) importados`);
      queryClient.invalidateQueries({ queryKey: ['periods-reimport'] });
    } catch (err) {
      toast.error(`Error en ${item.emp.full_name}: ${err.message}`);
    }
    setLoadingItem(null);
  };

  const handleImportAll = async () => {
    const pending = candidates.filter(c => doneItems[c.emp.id] === undefined);
    if (pending.length === 0) return;
    setImportingAll(true);
    for (let i = 0; i < pending.length; i++) {
      const item = pending[i];
      setLoadingItem(item.emp.id);
      try {
        const count = await importarPeriodosParaEmpleado(item.emp, item.periodos);
        setDoneItems(d => ({ ...d, [item.emp.id]: count }));
        queryClient.invalidateQueries({ queryKey: ['periods-reimport'] });
      } catch (err) {
        toast.error(`Error en ${item.emp.full_name}: ${err.message}`);
      }
      if (i < pending.length - 1) await sleep(400);
    }
    setLoadingItem(null);
    setImportingAll(false);
    toast.success('Importación masiva completada');
  };

  const pendingCount = candidates.filter(c => doneItems[c.emp.id] === undefined).length;

  if (isLoading) {
    return (
      <div className="p-6 flex justify-center items-center min-h-[300px]">
        <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
      </div>
    );
  }

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Reimportar Períodos de Servicio</h1>
        <p className="text-sm text-slate-500 mt-1">
          Detecta funcionarios sin períodos y permite restaurarlos desde el Excel original.
        </p>
      </div>

      {/* Resumen */}
      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-slate-900">{dbEmployees.length}</p>
            <p className="text-xs text-slate-500 mt-1">Total funcionarios</p>
          </CardContent>
        </Card>
        <Card className="border-red-200 bg-red-50">
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-red-700">{sinPeriodos.length}</p>
            <p className="text-xs text-red-600 mt-1">Sin períodos en BD</p>
          </CardContent>
        </Card>
        <Card className={candidates.length > 0 ? 'border-amber-200 bg-amber-50' : 'border-slate-200'}>
          <CardContent className="p-4 text-center">
            <p className={`text-2xl font-bold ${candidates.length > 0 ? 'text-amber-700' : 'text-slate-400'}`}>
              {excelSheets ? candidates.length : '—'}
            </p>
            <p className="text-xs text-slate-500 mt-1">Encontrados en Excel</p>
          </CardContent>
        </Card>
      </div>

      {/* Cargar Excel */}
      <Card>
        <CardContent className="p-4 flex items-center gap-4">
          <FileSpreadsheet className="w-8 h-8 text-indigo-400 shrink-0" />
          <div className="flex-1">
            <p className="text-sm font-medium text-slate-700">
              {excelSheets
                ? `Excel cargado · ${Object.keys(excelSheets).length} hojas encontradas`
                : 'Sube el Excel de Carrera Funcionaria para cruzar los datos'}
            </p>
            {excelSheets && <p className="text-xs text-slate-400 mt-0.5">{candidates.length} funcionario(s) sin períodos identificados en el archivo</p>}
          </div>
          <Button
            variant={excelSheets ? 'outline' : 'default'}
            className={!excelSheets ? 'bg-indigo-600 hover:bg-indigo-700' : ''}
            onClick={() => fileInputRef.current?.click()}
          >
            <Upload className="w-4 h-4 mr-1" />
            {excelSheets ? 'Cambiar archivo' : 'Seleccionar Excel'}
          </Button>
          <input ref={fileInputRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={handleFile} />
        </CardContent>
      </Card>

      {/* Lista de candidatos */}
      {excelSheets && candidates.length === 0 && (
        <Card className="border-emerald-200 bg-emerald-50">
          <CardContent className="p-4 flex items-center gap-2">
            <CheckCircle2 className="w-5 h-5 text-emerald-600" />
            <p className="text-sm text-emerald-700 font-semibold">
              No se encontraron funcionarios sin períodos en el Excel cargado.
            </p>
          </CardContent>
        </Card>
      )}

      {candidates.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-slate-700">
              {candidates.length} funcionario(s) a restaurar
            </p>
            {pendingCount > 0 && (
              <Button
                size="sm"
                className="bg-emerald-600 hover:bg-emerald-700"
                disabled={importingAll}
                onClick={handleImportAll}
              >
                {importingAll
                  ? <><Loader2 className="w-3.5 h-3.5 animate-spin mr-1" /> Importando...</>
                  : <><CheckCircle2 className="w-3.5 h-3.5 mr-1" /> Importar todos ({pendingCount})</>
                }
              </Button>
            )}
          </div>

          <div className="space-y-2">
            {candidates.map(item => {
              const isDone = doneItems[item.emp.id] !== undefined;
              const isThis = loadingItem === item.emp.id;
              return (
                <Card key={item.emp.id} className={isDone ? 'border-emerald-200 bg-emerald-50' : 'border-slate-200'}>
                  <CardContent className="p-3 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <User className="w-4 h-4 text-slate-400 shrink-0" />
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-slate-800 truncate">{item.emp.full_name}</p>
                        <p className="text-xs text-slate-400">{item.emp.rut} · {item.periodos.length} período(s) en Excel</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {isDone ? (
                        <Badge className="bg-emerald-100 text-emerald-700 text-xs">
                          <CheckCircle2 className="w-3 h-3 mr-1" /> {doneItems[item.emp.id]} períodos
                        </Badge>
                      ) : (
                        <Button
                          size="sm"
                          className="bg-indigo-600 hover:bg-indigo-700 h-7 text-xs"
                          disabled={isThis || importingAll}
                          onClick={() => handleImportOne(item)}
                        >
                          {isThis
                            ? <Loader2 className="w-3 h-3 animate-spin" />
                            : 'Restaurar'
                          }
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

      {/* Sin períodos pero no en Excel */}
      {excelSheets && sinPeriodos.length > candidates.length && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
          <p className="text-xs font-semibold text-amber-700 mb-1 flex items-center gap-1">
            <AlertTriangle className="w-3.5 h-3.5" />
            Sin períodos y no encontrados en el Excel ({sinPeriodos.length - candidates.length}):
          </p>
          <div className="flex flex-wrap gap-1 max-h-24 overflow-y-auto">
            {sinPeriodos
              .filter(e => !candidates.find(c => c.emp.id === e.id))
              .map(e => (
                <span key={e.id} className="text-[10px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded">
                  {e.full_name} ({e.rut})
                </span>
              ))}
          </div>
        </div>
      )}
    </div>
  );
}