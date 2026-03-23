import { useState, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import * as XLSX from 'xlsx';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Upload, CheckCircle2, AlertTriangle, RotateCcw, Loader2 } from 'lucide-react';
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

    // Detectar sección experiencia
    if (!inExperiencia && /experiencia|periodos\s*de\s*servicio|servicio\s*anterior|historia\s*laboral/i.test(c0n)) {
      inExperiencia = true; expHeaders = null; continue;
    }
    // Detener en capacitación
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

export default function ReimportarPeriodos() {
  const fileInputRef = useRef(null);
  const [step, setStep] = useState('idle');
  const [progress, setProgress] = useState({ current: 0, total: 0, ok: [], failed: [], skipped: [] });
  const [sheets, setSheets] = useState([]);

  const { data: dbEmployees = [] } = useQuery({
    queryKey: ['employees-reimport'],
    queryFn: () => base44.entities.Employee.list('-created_date', 2000),
  });

  const rutMap = {};
  dbEmployees.forEach(e => { rutMap[normalizeRUT(e.rut)] = e; });

  const handleFile = (e) => {
    const file = e.target.files[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const wb = XLSX.read(ev.target.result, { type: 'array', cellDates: false });
      const names = wb.SheetNames.filter(n => n !== 'Sheet' && n.trim() !== '');
      const parsed = names.map(name => {
        const data = extractRUTAndPeriods(wb.Sheets[name]);
        return { sheetName: name, rut: data?.rut || '', periodos: data?.periodos || [] };
      });
      // Solo mostrar hojas donde se encontró el RUT en la BD
      const filtered = parsed.filter(s => s.rut && rutMap[s.rut]);
      setSheets(filtered);
      setStep('preview');
    };
    reader.readAsArrayBuffer(file);
  };

  const handleImport = async () => {
    const valid = sheets.filter(s => s.rut && rutMap[s.rut] && s.periodos.length > 0);
    const skippedSheets = sheets.filter(s => !s.rut || !rutMap[s.rut]);

    setStep('importing');
    setProgress({ current: 0, total: valid.length, ok: [], failed: [], skipped: skippedSheets.map(s => s.sheetName) });

    const validTypes = ['Planta', 'Plazo Fijo', 'Honorarios', 'Reemplazo'];
    const ok = [], failed = [];

    for (let i = 0; i < valid.length; i++) {
      const item = valid[i];
      setProgress(p => ({ ...p, current: i + 1 }));
      const emp = rutMap[item.rut];

      try {
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

        // Crear nuevos períodos
        const nuevos = item.periodos
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

        ok.push({ name: item.sheetName, count: nuevos.length });
        setProgress(p => ({ ...p, ok: [...p.ok, { name: item.sheetName, count: nuevos.length }] }));
      } catch (err) {
        failed.push({ name: item.sheetName, error: err?.message || 'Error desconocido' });
        setProgress(p => ({ ...p, failed: [...p.failed, { name: item.sheetName, error: err?.message }] }));
      }

      if (i < valid.length - 1) await sleep(400);
    }

    setStep('done');
    toast.success(`Reimportación completada: ${ok.length} funcionario(s) actualizados`);
  };

  const handleReset = () => {
    setSheets([]);
    setStep('idle');
    setProgress({ current: 0, total: 0, ok: [], failed: [], skipped: [] });
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const matched = sheets.filter(s => s.rut && rutMap[s.rut] && s.periodos.length > 0);
  const unmatched = sheets.filter(s => !s.rut || !rutMap[s.rut]);
  const noPeriodos = sheets.filter(s => s.rut && rutMap[s.rut] && s.periodos.length === 0);

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Reimportar Períodos de Servicio</h1>
        <p className="text-sm text-slate-500 mt-1">
          Reemplaza los períodos de servicio actuales con los datos del Excel original. <strong>Solo toca períodos, no empleados ni capacitaciones.</strong>
        </p>
      </div>

      {/* Importando */}
      {step === 'importing' && (
        <Card className="border-blue-200 bg-blue-50">
          <CardContent className="p-4 space-y-3">
            <div className="flex items-center gap-2 text-blue-800 font-semibold text-sm">
              <Loader2 className="w-4 h-4 animate-spin" />
              Reimportando... {progress.current} de {progress.total}
            </div>
            <div className="w-full bg-blue-200 rounded-full h-2">
              <div className="bg-blue-600 h-2 rounded-full transition-all" style={{ width: `${progress.total ? (progress.current / progress.total) * 100 : 0}%` }} />
            </div>
            <div className="flex gap-3 text-xs text-blue-700">
              <span>✓ {progress.ok.length} procesados</span>
              {progress.failed.length > 0 && <span className="text-red-600">✗ {progress.failed.length} errores</span>}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Resultado */}
      {step === 'done' && (
        <Card className="border-emerald-200 bg-emerald-50">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2 text-emerald-800">
              <CheckCircle2 className="w-4 h-4" /> Reimportación completada
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-3 gap-3">
              {[
                { label: 'Actualizados', value: progress.ok.length, color: 'green' },
                { label: 'Sin períodos', value: progress.skipped.length, color: 'amber' },
                { label: 'Errores', value: progress.failed.length, color: 'red' },
              ].map(s => (
                <div key={s.label} className="bg-white rounded-lg p-3 text-center border">
                  <div className={`text-2xl font-bold text-${s.color}-600`}>{s.value}</div>
                  <div className="text-xs text-slate-500 mt-1">{s.label}</div>
                </div>
              ))}
            </div>
            {progress.failed.length > 0 && (
              <div className="bg-red-50 border border-red-200 rounded p-3 space-y-1">
                <p className="text-xs font-semibold text-red-700">Errores:</p>
                {progress.failed.map((f, i) => (
                  <p key={i} className="text-xs text-red-600">• {f.name}: {f.error}</p>
                ))}
              </div>
            )}
            <Button variant="outline" size="sm" onClick={handleReset}>
              <RotateCcw className="w-3.5 h-3.5 mr-1" /> Listo
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Idle */}
      {step === 'idle' && (
        <Card>
          <CardContent className="p-6 space-y-3">
            <p className="text-sm text-slate-600">Sube el mismo archivo Excel de Carrera Funcionaria para restaurar los períodos eliminados.</p>
            <Button className="bg-indigo-600 hover:bg-indigo-700" onClick={() => fileInputRef.current?.click()}>
              <Upload className="w-4 h-4 mr-1" /> Seleccionar archivo Excel
            </Button>
            <input ref={fileInputRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={handleFile} />
          </CardContent>
        </Card>
      )}

      {/* Preview */}
      {step === 'preview' && (
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-green-50 border border-green-200 rounded-lg p-3 text-center">
              <div className="text-2xl font-bold text-green-700">{matched.length}</div>
              <div className="text-xs text-slate-500">Funcionarios a reimportar</div>
            </div>
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-center">
              <div className="text-2xl font-bold text-amber-700">{unmatched.length}</div>
              <div className="text-xs text-slate-500">No encontrados en BD</div>
            </div>
            <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 text-center">
              <div className="text-2xl font-bold text-slate-700">{noPeriodos.length}</div>
              <div className="text-xs text-slate-500">Sin períodos en Excel</div>
            </div>
          </div>

          {unmatched.length > 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
              <p className="text-xs font-semibold text-amber-700 mb-1">Hojas sin funcionario en BD ({unmatched.length}):</p>
              <div className="flex flex-wrap gap-1 max-h-20 overflow-y-auto">
                {unmatched.map(s => (
                  <span key={s.sheetName} className="text-[10px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded">
                    {s.sheetName} {s.rut ? `(${s.rut})` : '(sin RUT)'}
                  </span>
                ))}
              </div>
            </div>
          )}

          <div className="flex items-center gap-3 pt-2 border-t">
            <Button
              onClick={handleImport}
              disabled={matched.length === 0}
              className="bg-emerald-600 hover:bg-emerald-700"
            >
              <CheckCircle2 className="w-4 h-4 mr-1" />
              Reimportar {matched.length} funcionario(s)
            </Button>
            <Button variant="ghost" size="sm" onClick={handleReset}>
              <RotateCcw className="w-3.5 h-3.5 mr-1" /> Cancelar
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}