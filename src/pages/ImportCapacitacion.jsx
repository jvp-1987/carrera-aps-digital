import { useState, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import * as XLSX from 'xlsx';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Upload, CheckCircle2, XCircle, AlertTriangle,
  FileSpreadsheet, RotateCcw, ClipboardCheck, BookOpen, ChevronDown, ChevronRight
} from 'lucide-react';
import { toast } from 'sonner';

// ── Helpers ──────────────────────────────────────────────────────
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

// ── Parser: extrae RUT y capacitaciones de una hoja ─────────────
// Busca el RUT en los pares clave-valor de la hoja,
// luego detecta la sección "Capacitacion" y extrae sus filas.
function parseCapacitacionSheet(sheet, sheetName) {
  if (!sheet || !sheet['!ref']) return null;
  const range = XLSX.utils.decode_range(sheet['!ref']);
  const maxRow = range.e.r;

  // Fila 0: nombre del funcionario
  let fullName = '';
  for (let c = 0; c <= range.e.c; c++) {
    const v = cellStr(sheet, c, 0);
    if (v) { fullName = v; break; }
  }

  const rowText = (r) => {
    let t = '';
    for (let c = 0; c <= range.e.c; c++) t += ' ' + norm(cellStr(sheet, c, r));
    return t;
  };

  let rut = '';
  const kvData = {};
  let capacitacionRows = [];
  let inCapacitacion = false;
  let capHeaders = null;

  for (let r = 1; r <= maxRow; r++) {
    const c0raw = cellStr(sheet, 0, r);
    const c0n = norm(c0raw);
    const c1 = cellStr(sheet, 1, r);
    const c3n = norm(cellStr(sheet, 3, r));
    const c4 = cellStr(sheet, 4, r);
    const rt = rowText(r);

    // Detectar sección capacitación
    if (!inCapacitacion && /^capacitaci|^entrenamiento|^formaci/i.test(c0n)) {
      inCapacitacion = true; capHeaders = null; continue;
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

        let cursoRaw = findCol('curso', 'actividad', 'nombre');
        if (!cursoRaw) {
          for (let c = 0; c <= range.e.c; c++) {
            const v = cellStr(sheet, c, r);
            if (v) { cursoRaw = v; break; }
          }
        }
        if (!cursoRaw) continue;

        const cursoNorm = norm(cursoRaw);

        // Descartar filas que son encabezados, totales o metadatos, no cursos reales
        const esFilaBasura = (
          cursoNorm === 'capacitacion' ||
          cursoNorm === 'capacitacion' ||
          cursoNorm === 'capacitacion' ||
          cursoNorm === '' ||
          cursoNorm.includes('bienio') ||
          cursoNorm.includes('total') ||
          /^cat\.\s*[a-f]/i.test(cursoRaw) ||
          (cursoNorm.includes('nivel') && cursoNorm.includes('pts')) ||
          // Encabezados de columna típicos
          cursoNorm === 'nivel' ||
          cursoNorm === 'nivel tecnico' ||
          cursoNorm === 'calificacion' ||
          cursoNorm === 'nota' ||
          cursoNorm === 'horas' ||
          cursoNorm === 'termino' ||
          cursoNorm === 'puntaje' ||
          cursoNorm === 'institucion' ||
          cursoNorm === 'curso' ||
          cursoNorm === 'actividad' ||
          cursoNorm === 'nombre' ||
          cursoNorm === 'fecha' ||
          cursoNorm === 'desde' ||
          cursoNorm === 'hasta' ||
          cursoNorm === 'tipo' ||
          // Filas de totales o subtotales
          /^total\b/i.test(cursoNorm) ||
          /^puntaje\s*(total|acumulado)?$/i.test(cursoNorm) ||
          /^terminos?\s*(y|de)?\s*nivel/i.test(cursoNorm) ||
          /^calificaciones?$/i.test(cursoNorm) ||
          // Filas que solo tienen números (no son nombres de cursos)
          /^\d+([.,]\d+)?$/.test(cursoNorm)
        );
        if (esFilaBasura) continue;

        const partes = cursoRaw.split(/\s+[–-]\s+/);
        const institucion = partes.length > 1 ? partes[0].trim() : '';
        const nombre_curso = partes.length > 1 ? partes.slice(1).join(' – ').trim() : cursoRaw.trim();
        if (!nombre_curso) continue;

        capacitacionRows.push({
          nombre_curso,
          institucion,
          horas: findCol('hora'),
          nota: findCol('nota', 'calificacion'),
          nivel_tecnico: findCol('nivel', 'tipo'),
          fecha: normalizeDateString(findCol('hasta', 'termino', 'término', 'fin')),
          puntaje: findCol('punto', 'pts', 'puntaje'),
        });
      }
      continue;
    }

    // Datos personales: buscar RUT
    if (c0n) kvData[c0n] = c1;
    if (c3n) kvData[c3n] = c4;
  }

  // Extraer RUT de kvData
  const rutEntry = Object.entries(kvData).find(([k]) => k.includes('rut'));
  if (rutEntry) rut = normalizeRUT(rutEntry[1]);

  return {
    sheetName,
    full_name: fullName || sheetName,
    rut,
    capacitacion: capacitacionRows,
  };
}

// ── Tarjeta preview de una hoja ──────────────────────────────────
function SheetCard({ item, rutMap }) {
  const [open, setOpen] = useState(false);
  const empInDB = item.rut && rutMap[item.rut];
  const hasError = !!item.error;

  return (
    <div className={`border rounded-lg ${hasError ? 'border-red-200 bg-red-50' : 'border-green-200 bg-green-50'}`}>
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full px-4 py-2.5 flex items-center justify-between text-left hover:bg-white/40 rounded-lg"
      >
        <div className="flex items-center gap-3">
          {hasError
            ? <XCircle className="w-4 h-4 text-red-500 shrink-0" />
            : <CheckCircle2 className="w-4 h-4 text-green-600 shrink-0" />}
          <div>
            <span className="font-medium text-sm text-slate-800">{item.sheetName}</span>
            {item.rut && <span className="text-xs text-slate-500 ml-2">RUT: {item.rut}</span>}
          </div>
          {empInDB && <Badge className="text-[10px] bg-blue-100 text-blue-700 border-blue-200">Funcionario encontrado</Badge>}
          {!hasError && !empInDB && item.rut && <Badge className="text-[10px] bg-red-100 text-red-700 border-red-200">No existe en BD</Badge>}
        </div>
        <div className="flex items-center gap-2">
          {!hasError && <Badge className="bg-indigo-100 text-indigo-700 text-[10px]">{item.capacitacion.length} capacitacion(es)</Badge>}
          {open ? <ChevronDown className="w-4 h-4 text-slate-400" /> : <ChevronRight className="w-4 h-4 text-slate-400" />}
        </div>
      </button>

      {open && (
        <div className="px-4 pb-4 pt-2 border-t border-slate-200 space-y-2">
          {hasError && (
            <p className="text-xs text-red-700 flex items-center gap-1">
              <AlertTriangle className="w-3 h-3" /> {item.error}
            </p>
          )}
          {!hasError && item.capacitacion.length > 0 && (
            <div className="space-y-1">
              {item.capacitacion.map((c, i) => (
                <div key={i} className="text-[10px] bg-white rounded p-2 border border-slate-200 flex justify-between">
                  <div>
                    <p className="font-medium text-slate-700">{c.nombre_curso}</p>
                    {c.institucion && <p className="text-slate-500">{c.institucion}</p>}
                    <p className="text-slate-400">{c.fecha} · {c.horas}h · Nota: {c.nota}</p>
                  </div>
                  <div className="text-indigo-600 font-semibold text-xs">
                    {c.puntaje ? `${c.puntaje} pts` : ''}
                  </div>
                </div>
              ))}
            </div>
          )}
          {!hasError && item.capacitacion.length === 0 && (
            <p className="text-xs text-slate-500">No se detectaron capacitaciones en esta hoja.</p>
          )}
        </div>
      )}
    </div>
  );
}

// ── Componente principal ─────────────────────────────────────────
export default function ImportCapacitacion() {
  const fileInputRef = useRef(null);
  const [sheets, setSheets] = useState([]);
  const [step, setStep] = useState('idle'); // idle | preview | importing | done
  const [progress, setProgress] = useState({ current: 0, total: 0, ok: [], failed: [], skipped: [] });

  const { data: dbEmployees = [] } = useQuery({
    queryKey: ['employees-all-cap'],
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
        const data = parseCapacitacionSheet(wb.Sheets[name], name);
        if (!data) return { sheetName: name, rut: '', full_name: name, capacitacion: [], error: 'No se pudo parsear la hoja' };
        if (!data.rut) return { ...data, error: 'RUT no encontrado en la hoja' };
        if (!rutMap[data.rut]) return { ...data, error: `Funcionario con RUT ${data.rut} no existe en la base de datos` };
        return data;
      });
      setSheets(parsed);
      setStep('preview');
    };
    reader.readAsArrayBuffer(file);
  };

  const handleImport = async () => {
    const valid = sheets.filter(s => !s.error && s.capacitacion.length > 0);
    if (!valid.length) { toast.error('No hay hojas válidas con capacitaciones para importar'); return; }

    setStep('importing');
    setProgress({ current: 0, total: valid.length, ok: [], failed: [], skipped: [] });

    const validLevels = ['Básico', 'Intermedio', 'Avanzado', 'Postgrado'];
    const ok = [], failed = [], skipped = [];

    for (let i = 0; i < valid.length; i++) {
      const item = valid[i];
      setProgress(p => ({ ...p, current: i + 1 }));

      const emp = rutMap[item.rut];
      if (!emp) { failed.push({ name: item.sheetName, error: 'Funcionario no encontrado' }); continue; }

      // Obtener capacitaciones existentes para no duplicar (con reintento ante rate limit)
      let existingTrainings = [];
      for (let attempt = 0; attempt < 5; attempt++) {
        try {
          existingTrainings = await base44.entities.Training.filter({ employee_id: emp.id });
          break;
        } catch (err) {
          const isRateLimit = err?.response?.status === 429 || (err?.message || '').toLowerCase().includes('rate limit');
          if (isRateLimit && attempt < 4) {
            await new Promise(r => setTimeout(r, 3000 * (attempt + 1)));
          } else { break; }
        }
      }

      const existingKeys = new Set(
        existingTrainings.map(t => `${(t.course_name || '').toLowerCase().trim()}|${t.completion_date || ''}`)
      );

      const nuevas = item.capacitacion.filter(c => {
        const key = `${c.nombre_curso.toLowerCase().trim()}|${c.fecha || ''}`;
        return !existingKeys.has(key);
      });

      if (nuevas.length === 0) {
        skipped.push(item.sheetName);
        setProgress(p => ({ ...p, skipped: [...p.skipped, item.sheetName] }));
        continue;
      }

      try {
        const toCreate = nuevas.map(c => ({
          employee_id: emp.id,
          course_name: c.nombre_curso,
          institution: c.institucion || '',
          hours: parseFloat((c.horas || '0').toString().replace(',', '.')) || 0,
          grade: parseFloat((c.nota || '0').toString().replace(',', '.')) || 4.0,
          technical_level: validLevels.find(l => l.toLowerCase().includes((c.nivel_tecnico || '').toLowerCase())) || 'Básico',
          completion_date: c.fecha || '',
          calculated_points: parseFloat((c.puntaje || '0').toString().replace(',', '.')) || 0,
          status: 'Validado',
        }));

        // Intentar con reintentos ante rate limit
        let attempts = 0;
        while (attempts < 5) {
          try {
            await base44.entities.Training.bulkCreate(toCreate);
            break;
          } catch (err) {
            const isRateLimit = err?.response?.status === 429 || (err?.message || '').toLowerCase().includes('rate limit');
            if (isRateLimit && attempts < 4) {
              attempts++;
              await new Promise(r => setTimeout(r, 3000 * attempts));
            } else {
              throw err;
            }
          }
        }

        ok.push({ name: item.sheetName, count: toCreate.length });
        setProgress(p => ({ ...p, ok: [...p.ok, { name: item.sheetName, count: toCreate.length }] }));
      } catch (err) {
        failed.push({ name: item.sheetName, error: err?.message || 'Error desconocido' });
        setProgress(p => ({ ...p, failed: [...p.failed, { name: item.sheetName, error: err?.message }] }));
      }

      if (i < valid.length - 1) await new Promise(r => setTimeout(r, 600));
    }

    setStep('done');
    toast.success(`Importación completada: ${ok.length} funcionario(s) actualizados`);
  };

  const handleReset = () => {
    setSheets([]);
    setStep('idle');
    setProgress({ current: 0, total: 0, ok: [], failed: [], skipped: [] });
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const validSheets = sheets.filter(s => !s.error && s.capacitacion.length > 0);
  const errorSheets = sheets.filter(s => !!s.error || s.capacitacion.length === 0);

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Importación de Capacitaciones</h1>
        <p className="text-sm text-slate-500 mt-1">
          Carga un Excel con capacitaciones por funcionario. Se agregan solo las nuevas (sin duplicar).
        </p>
      </div>

      {/* Importando */}
      {step === 'importing' && (
        <Card className="border-blue-200 bg-blue-50">
          <CardContent className="p-4 space-y-3">
            <div className="flex items-center gap-2 text-blue-800 font-semibold text-sm">
              <div className="w-4 h-4 border-2 border-blue-400 border-t-blue-800 rounded-full animate-spin" />
              Importando... {progress.current} de {progress.total}
            </div>
            <div className="w-full bg-blue-200 rounded-full h-2">
              <div className="bg-blue-600 h-2 rounded-full transition-all" style={{ width: `${(progress.current / progress.total) * 100}%` }} />
            </div>
            <div className="flex gap-3 text-xs text-blue-700">
              <span>✓ {progress.ok.length} procesados</span>
              {progress.skipped.length > 0 && <span className="text-amber-600">⊘ {progress.skipped.length} sin novedades</span>}
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
              <CheckCircle2 className="w-4 h-4" /> Importación completada
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-3 gap-3">
              {[
                { label: 'Actualizados', value: progress.ok.length, color: 'green' },
                { label: 'Sin novedades', value: progress.skipped.length, color: 'amber' },
                { label: 'Errores', value: progress.failed.length, color: 'red' },
              ].map(s => (
                <div key={s.label} className="bg-white rounded-lg p-3 text-center border">
                  <div className={`text-2xl font-bold text-${s.color}-600`}>{s.value}</div>
                  <div className="text-xs text-slate-500 mt-1">{s.label}</div>
                </div>
              ))}
            </div>
            {progress.ok.length > 0 && (
              <div className="space-y-1">
                {progress.ok.map((o, i) => (
                  <p key={i} className="text-xs text-emerald-700">✓ {o.name}: +{o.count} capacitacion(es)</p>
                ))}
              </div>
            )}
            {progress.failed.length > 0 && (
              <div className="bg-red-50 border border-red-200 rounded p-3 space-y-1">
                <p className="text-xs font-semibold text-red-700">Errores:</p>
                {progress.failed.map((f, i) => (
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

      {/* Idle */}
      {step === 'idle' && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <FileSpreadsheet className="w-4 h-4 text-indigo-600" /> Formato esperado
            </CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-slate-600 space-y-3">
            <p>Archivo Excel con <strong>una pestaña por funcionario</strong>. Cada hoja debe contener:</p>
            <div className="bg-slate-50 rounded-md p-3 space-y-1.5 font-mono text-[11px]">
              <div><span className="text-slate-400">Fila 1 →</span> <span className="text-slate-800 font-semibold">Nombre completo del funcionario</span></div>
              <div><span className="text-slate-400">Fila N →</span> <span className="text-slate-600">RUT | valor del RUT</span></div>
              <div className="mt-1"><span className="text-slate-400">Sección →</span> <span className="text-blue-700 font-semibold">Capacitacion</span></div>
              <div className="pl-10 text-slate-500">Headers: Nombre curso | Horas | Nota | Nivel | Fecha</div>
            </div>
            <div className="pt-2">
              <Button size="sm" className="bg-indigo-600 hover:bg-indigo-700" onClick={() => fileInputRef.current?.click()}>
                <Upload className="w-4 h-4 mr-1" /> Seleccionar archivo Excel
              </Button>
              <input ref={fileInputRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={handleFile} />
            </div>
          </CardContent>
        </Card>
      )}

      {/* Preview */}
      {step === 'preview' && (
        <div className="space-y-4">
          <div className="flex items-center gap-3 flex-wrap">
            <span className="text-sm font-semibold text-slate-700">{sheets.length} hojas detectadas</span>
            <Badge className="bg-green-100 text-green-800">{validSheets.length} válidas</Badge>
            {errorSheets.length > 0 && <Badge className="bg-red-100 text-red-800">{errorSheets.length} con problemas</Badge>}
          </div>

          <div className="space-y-1.5 max-h-[60vh] overflow-y-auto pr-1">
            {sheets.map(item => (
              <SheetCard key={item.sheetName} item={item} rutMap={rutMap} />
            ))}
          </div>

          <div className="flex items-center gap-2 flex-wrap pt-2 border-t">
            <Button onClick={handleImport} disabled={validSheets.length === 0} className="bg-emerald-600 hover:bg-emerald-700">
              <ClipboardCheck className="w-4 h-4 mr-1" /> Importar {validSheets.length} funcionario(s)
            </Button>
            {errorSheets.length > 0 && (
              <p className="text-xs text-slate-500">{errorSheets.length} hoja(s) serán omitidas.</p>
            )}
            <Button variant="ghost" size="sm" onClick={handleReset}>
              <RotateCcw className="w-3.5 h-3.5 mr-1" /> Cancelar
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}