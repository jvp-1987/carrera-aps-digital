import { useState, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Upload, Download, CheckCircle2, XCircle, AlertTriangle,
  FileSpreadsheet, Pencil, RotateCcw, ClipboardCheck
} from 'lucide-react';
import { toast } from 'sonner';
import {
  calculateTrainingPoints, calculateEffectiveDays,
  calculateBienios, calculateBienioPoints, calculateNextBienioDate,
} from '@/components/calculations';

// ── CSV parser ────────────────────────────────────────────────
function parseCSV(text) {
  const lines = text.trim().split(/\r?\n/);
  if (lines.length < 2) return [];
  const headers = lines[0].split(',').map(h => h.trim().toLowerCase().replace(/\s+/g, '_'));
  return lines.slice(1).map((line, idx) => {
    const values = line.split(',').map(v => v.trim());
    const obj = { _lineNumber: idx + 2 };
    headers.forEach((h, i) => { obj[h] = values[i] || ''; });
    return obj;
  });
}

function normalizeRUT(rut) { return (rut || '').replace(/\./g, '').trim().toUpperCase(); }

// ── Validadores ───────────────────────────────────────────────
const VALID_CATEGORIES = ['A', 'B', 'C', 'D', 'E', 'F'];
const VALID_CONTRACTS = ['Planta', 'Plazo Fijo', 'Honorarios', 'Reemplazo'];
const VALID_STATUSES = ['Pendiente', 'Validado', 'Rechazado'];
const LEVEL_MAP = { '1': 'Básico', '2': 'Intermedio', '3': 'Avanzado', '4': 'Postgrado' };

function validateRow(tab, row, rutMap) {
  const errors = [];
  const rut = normalizeRUT(row.rut);

  if (!rut) errors.push('RUT: requerido');

  if (tab === 'dotacion') {
    if (!row.nombre) errors.push('nombre: requerido');
    if (!VALID_CATEGORIES.includes((row.categoria || '').toUpperCase()))
      errors.push(`categoría: inválida "${row.categoria}" (A/B/C/D/E/F)`);
    const nivel = parseInt(row.nivel);
    if (isNaN(nivel) || nivel < 1 || nivel > 15)
      errors.push(`nivel: inválido "${row.nivel}" (1-15)`);
    if (!VALID_CONTRACTS.includes(row.tipo_contrato))
      errors.push(`tipo_contrato: inválido "${row.tipo_contrato}"`);
  }

  if (tab === 'experiencia') {
    if (!rutMap[rut]) errors.push(`RUT: no encontrado "${rut}"`);
    if (!VALID_CONTRACTS.includes(row.tipo_periodo))
      errors.push(`tipo_periodo: inválido "${row.tipo_periodo}"`);
    if (!row.fecha_inicio) errors.push('fecha_inicio: requerida');
  }

  if (tab === 'capacitacion') {
    if (!rutMap[rut]) errors.push(`RUT: no encontrado "${rut}"`);
    if (!row.nombre_curso) errors.push('nombre_curso: requerido');
    const horas = parseFloat(row.horas);
    if (isNaN(horas) || horas <= 0) errors.push(`horas: inválidas "${row.horas}"`);
    const nota = parseFloat(row.nota);
    if (isNaN(nota) || nota < 1 || nota > 7) errors.push(`nota: inválida "${row.nota}" (1.0-7.0)`);
    const nivelT = LEVEL_MAP[row.nivel_tecnico] || row.nivel_tecnico;
    if (!['Básico', 'Intermedio', 'Avanzado', 'Postgrado'].includes(nivelT))
      errors.push(`nivel_tecnico: inválido "${row.nivel_tecnico}"`);
    if (row.estado && !VALID_STATUSES.includes(row.estado))
      errors.push(`estado: inválido "${row.estado}"`);
  }

  return errors;
}

// ── Plantillas ────────────────────────────────────────────────
const TEMPLATES = {
  dotacion: {
    name: 'plantilla_dotacion.csv',
    content: [
      'rut,nombre,categoria,nivel,cargo,fecha_ingreso,tipo_contrato',
      '12345678-9,María González Soto,A,6,Médico General,2010-03-15,Planta',
      '9876543-2,Pedro Ramírez López,B,9,Enfermero/a,2014-08-01,Planta',
      '11222333-4,Ana Torres Muñoz,C,12,Técnico Paramédico,2018-05-20,Plazo Fijo',
      '15432167-8,Luis Castillo Vera,D,14,Auxiliar de Servicios,2020-01-10,Honorarios',
      '7654321-K,Carolina Vega Díaz,E,11,Secretaria,2016-11-03,Reemplazo',
      '13579246-5,Jorge Fuentes Pino,F,10,Auxiliar de Limpieza,2019-07-22,Planta',
    ].join('\n'),
  },
  experiencia: {
    name: 'plantilla_experiencia.csv',
    content: [
      'rut,tipo_periodo,fecha_inicio,fecha_fin,institucion,n_resolucion',
      '12345678-9,Planta,2005-01-01,2009-12-31,Hospital Base Valdivia,EX-2005-001',
      '12345678-9,Planta,2010-01-01,,APS Panguipulli,EX-2010-015',
      '9876543-2,Honorarios,2011-03-01,2013-02-28,CESFAM Lanco,EX-2011-032',
      '9876543-2,Plazo Fijo,2013-03-01,2014-07-31,CESFAM Lanco,EX-2013-010',
      '9876543-2,Planta,2014-08-01,,APS Panguipulli,EX-2014-021',
      '11222333-4,Plazo Fijo,2016-06-01,2018-05-19,Municipalidad Valdivia,EX-2016-008',
    ].join('\n'),
  },
  capacitacion: {
    name: 'plantilla_capacitacion.csv',
    content: [
      'rut,nombre_curso,institucion,horas,nota,nivel_tecnico,fecha,estado',
      '12345678-9,Actualización en Medicina Familiar,ACHS,80,6.8,Avanzado,2023-08-10,Validado',
      '12345678-9,RCP Avanzado,Cruz Roja,20,6.5,Intermedio,2022-11-15,Validado',
      '9876543-2,Manejo de Paciente Crítico,MINSAL,60,6.0,Avanzado,2023-04-20,Validado',
      '9876543-2,Primeros Auxilios Básicos,ACHS,16,5.5,Básico,2022-06-05,Validado',
      '11222333-4,Técnicas de Laboratorio Clínico,SENCE,40,5.8,Intermedio,2023-01-30,Pendiente',
      '15432167-8,Seguridad e Higiene Laboral,Mutual de Seguridad,20,6.2,Básico,2023-05-12,Validado',
    ].join('\n'),
  },
};

function downloadTemplate(key) {
  const t = TEMPLATES[key];
  const blob = new Blob([t.content], { type: 'text/csv;charset=utf-8;' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = t.name; a.click();
}

// ── Columnas editables por tab ────────────────────────────────
const TAB_FIELDS = {
  dotacion: [
    { key: 'rut', label: 'RUT' }, { key: 'nombre', label: 'Nombre' },
    { key: 'categoria', label: 'Categoría' }, { key: 'nivel', label: 'Nivel' },
    { key: 'cargo', label: 'Cargo' }, { key: 'tipo_contrato', label: 'Contrato' },
  ],
  experiencia: [
    { key: 'rut', label: 'RUT' }, { key: 'tipo_periodo', label: 'Tipo' },
    { key: 'fecha_inicio', label: 'Inicio' }, { key: 'fecha_fin', label: 'Fin' },
    { key: 'institucion', label: 'Institución' },
  ],
  capacitacion: [
    { key: 'rut', label: 'RUT' }, { key: 'nombre_curso', label: 'Curso' },
    { key: 'horas', label: 'Horas' }, { key: 'nota', label: 'Nota' },
    { key: 'nivel_tecnico', label: 'Nivel Téc.' }, { key: 'estado', label: 'Estado' },
  ],
};

// ── Importar registros válidos ────────────────────────────────
async function importRows(tab, rows, rutMap) {
  const log = { ok: 0, errors: [] };

  if (tab === 'dotacion') {
    for (const r of rows) {
      const rut = normalizeRUT(r.rut);
      const payload = {
        rut, full_name: r.nombre, category: r.categoria.toUpperCase(),
        current_level: parseInt(r.nivel), position: r.cargo || '',
        hire_date: r.fecha_ingreso || '', contract_type: r.tipo_contrato, status: 'Activo',
      };
      if (rutMap[rut]) await base44.entities.Employee.update(rutMap[rut].id, payload);
      else await base44.entities.Employee.create(payload);
      log.ok++;
    }
  }

  if (tab === 'experiencia') {
    const byEmployee = {};
    for (const r of rows) {
      const emp = rutMap[normalizeRUT(r.rut)];
      const days = r.fecha_fin
        ? Math.max(0, Math.floor((new Date(r.fecha_fin) - new Date(r.fecha_inicio)) / 86400000))
        : Math.floor((new Date() - new Date(r.fecha_inicio)) / 86400000);
      await base44.entities.ServicePeriod.create({
        employee_id: emp.id, period_type: r.tipo_periodo,
        start_date: r.fecha_inicio, end_date: r.fecha_fin || '',
        institution: r.institucion || 'APS Panguipulli',
        resolution_number: r.n_resolucion || '',
        days_count: days, is_active: !r.fecha_fin,
        conflict_status: 'Sin Conflicto', ajustado_por_solapamiento: false,
      });
      byEmployee[emp.id] = emp; log.ok++;
    }
    for (const empId of Object.keys(byEmployee)) {
      const emp = byEmployee[empId];
      const allPeriods = await base44.entities.ServicePeriod.filter({ employee_id: empId });
      const allLeaves = await base44.entities.LeaveWithoutPay.filter({ employee_id: empId });
      const tLeave = allLeaves.reduce((s, l) => s + (l.days_count || 0), 0);
      const eDays = calculateEffectiveDays(allPeriods, tLeave);
      const b = calculateBienios(eDays);
      const bp = calculateBienioPoints(emp.category, b);
      const nbd = calculateNextBienioDate(allPeriods, tLeave, b);
      await base44.entities.Employee.update(empId, {
        total_experience_days: eDays, bienios_count: b, bienio_points: bp,
        next_bienio_date: nbd, total_points: bp + (emp.training_points || 0),
      });
    }
  }

  if (tab === 'capacitacion') {
    const byEmployee = {};
    for (const r of rows) {
      const emp = rutMap[normalizeRUT(r.rut)];
      const nivelT = LEVEL_MAP[r.nivel_tecnico] || r.nivel_tecnico;
      const pts = calculateTrainingPoints(parseFloat(r.horas), parseFloat(r.nota), nivelT);
      await base44.entities.Training.create({
        employee_id: emp.id, course_name: r.nombre_curso,
        institution: r.institucion || '', hours: parseFloat(r.horas),
        grade: parseFloat(r.nota), technical_level: nivelT,
        completion_date: r.fecha || '', calculated_points: pts,
        status: r.estado || 'Pendiente', is_postitle: nivelT === 'Postgrado',
      });
      byEmployee[emp.id] = emp; log.ok++;
    }
    for (const empId of Object.keys(byEmployee)) {
      const emp = byEmployee[empId];
      const allT = await base44.entities.Training.filter({ employee_id: empId });
      const totalPts = allT.filter(t => t.status === 'Validado').reduce((s, t) => s + (t.calculated_points || 0), 0);
      await base44.entities.Employee.update(empId, {
        training_points: totalPts, total_points: (emp.bienio_points || 0) + totalPts,
      });
    }
  }

  return log;
}

// ── Componente principal ──────────────────────────────────────
export default function ImportModule() {
  const fileInputRef = useRef(null);
  const [activeTab, setActiveTab] = useState('dotacion');

  // rows: array of row objects (editable)
  const [rows, setRows] = useState([]);
  // validation results indexed by row
  const [validationMap, setValidationMap] = useState({});
  // editing state: { rowIndex, field } | null
  const [editing, setEditing] = useState(null);

  // step: 'idle' | 'preview' | 'confirmed' | 'done'
  const [step, setStep] = useState('idle');
  const [importing, setImporting] = useState(false);
  const [importLog, setImportLog] = useState(null);

  const { data: employees = [] } = useQuery({
    queryKey: ['employees-all'],
    queryFn: () => base44.entities.Employee.list(),
  });

  const rutMap = {};
  employees.forEach(e => { rutMap[normalizeRUT(e.rut)] = e; });

  const revalidate = (currentRows) => {
    const map = {};
    currentRows.forEach((row, i) => {
      map[i] = validateRow(activeTab, row, rutMap);
    });
    setValidationMap(map);
  };

  const handleTabChange = (tab) => {
    setActiveTab(tab); setRows([]); setValidationMap({});
    setStep('idle'); setImportLog(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleFile = (e) => {
    const file = e.target.files[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const parsed = parseCSV(ev.target.result);
      setRows(parsed);
      const map = {};
      parsed.forEach((row, i) => { map[i] = validateRow(activeTab, row, rutMap); });
      setValidationMap(map);
      setStep('preview'); setImportLog(null);
    };
    reader.readAsText(file, 'UTF-8');
  };

  const handleCellEdit = (rowIdx, field, value) => {
    const updated = rows.map((r, i) => i === rowIdx ? { ...r, [field]: value } : r);
    setRows(updated);
    const updatedMap = { ...validationMap, [rowIdx]: validateRow(activeTab, updated[rowIdx], rutMap) };
    setValidationMap(updatedMap);
    setEditing(null);
  };

  const handleConfirm = async () => {
    const validRows = rows.filter((_, i) => validationMap[i]?.length === 0);
    if (!validRows.length) { toast.error('No hay filas válidas para importar'); return; }
    setImporting(true);
    const log = await importRows(activeTab, validRows, rutMap);
    setImportLog({ ...log, total: rows.length, invalid: rows.length - validRows.length });
    setStep('done'); setImporting(false);
    toast.success(`${log.ok} registros importados correctamente`);
  };

  const fields = TAB_FIELDS[activeTab];
  const validCount = rows.filter((_, i) => (validationMap[i] || []).length === 0).length;
  const errorCount = rows.length - validCount;

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Importación Masiva</h1>
        <p className="text-sm text-slate-500 mt-1">Carga histórica de datos de funcionarios desde archivos CSV</p>
      </div>

      <Tabs value={activeTab} onValueChange={handleTabChange}>
        <TabsList className="grid grid-cols-3 w-full">
          <TabsTrigger value="dotacion">Dotación</TabsTrigger>
          <TabsTrigger value="experiencia">Experiencia</TabsTrigger>
          <TabsTrigger value="capacitacion">Capacitación</TabsTrigger>
        </TabsList>

        {['dotacion', 'experiencia', 'capacitacion'].map(tab => (
          <TabsContent key={tab} value={tab} className="space-y-4 mt-4">

            {/* Descripción */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <FileSpreadsheet className="w-4 h-4 text-indigo-600" /> Campos requeridos
                </CardTitle>
              </CardHeader>
              <CardContent className="text-xs text-slate-600 space-y-1">
                {tab === 'dotacion' && <p><strong>rut, nombre, categoría</strong> (A-F), <strong>nivel</strong> (1-15), cargo, fecha_ingreso, <strong>tipo_contrato</strong> (Planta / Plazo Fijo / Honorarios / Reemplazo). Si el RUT ya existe, se actualiza.</p>}
                {tab === 'experiencia' && <p><strong>rut</strong> (debe existir), <strong>tipo_periodo, fecha_inicio</strong>, fecha_fin, institución, n_resolución. Los bienios se recalculan automáticamente.</p>}
                {tab === 'capacitacion' && <p><strong>rut</strong> (debe existir), <strong>nombre_curso, horas, nota</strong> (1-7), <strong>nivel_tecnico</strong> (Básico/Intermedio/Avanzado/Postgrado o 1-4), fecha, estado. Puntaje calculado por Ley 19.378.</p>}
              </CardContent>
            </Card>

            {/* Acciones */}
            <div className="flex flex-wrap gap-3">
              <Button variant="outline" size="sm" onClick={() => downloadTemplate(tab)}>
                <Download className="w-4 h-4 mr-1" /> Descargar plantilla
              </Button>
              <Button size="sm" className="bg-indigo-600 hover:bg-indigo-700" onClick={() => fileInputRef.current?.click()}>
                <Upload className="w-4 h-4 mr-1" /> Seleccionar archivo CSV
              </Button>
              <input ref={fileInputRef} type="file" accept=".csv" className="hidden" onChange={handleFile} />
            </div>

            {/* Preview / Editor */}
            {step !== 'idle' && rows.length > 0 && step !== 'done' && (
              <Card>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <CardTitle className="text-sm">Vista previa — {rows.length} filas</CardTitle>
                    <div className="flex gap-2">
                      <Badge className="bg-green-100 text-green-800">{validCount} válidas</Badge>
                      {errorCount > 0 && <Badge className="bg-red-100 text-red-800">{errorCount} con errores</Badge>}
                    </div>
                  </div>
                  {errorCount > 0 && (
                    <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-3 py-1.5 mt-2 flex items-center gap-1">
                      <Pencil className="w-3 h-3" /> Haz clic en cualquier celda para corregir el valor directamente.
                    </p>
                  )}
                </CardHeader>
                <CardContent>
                  <div className="overflow-auto max-h-72 border rounded-lg">
                    <table className="w-full text-xs">
                      <thead className="bg-slate-100 sticky top-0">
                        <tr>
                          <th className="px-2 py-2 text-left w-8">#</th>
                          <th className="px-2 py-2 text-left w-8"></th>
                          {fields.map(f => <th key={f.key} className="px-2 py-2 text-left">{f.label}</th>)}
                          <th className="px-2 py-2 text-left min-w-48">Errores</th>
                        </tr>
                      </thead>
                      <tbody>
                        {rows.map((row, rowIdx) => {
                          const errs = validationMap[rowIdx] || [];
                          const hasError = errs.length > 0;
                          return (
                            <tr key={rowIdx} className={hasError ? 'bg-red-50' : 'hover:bg-slate-50'}>
                              <td className="px-2 py-1.5 text-slate-400">{row._lineNumber}</td>
                              <td className="px-2 py-1.5">
                                {hasError
                                  ? <XCircle className="w-3.5 h-3.5 text-red-500" />
                                  : <CheckCircle2 className="w-3.5 h-3.5 text-green-600" />}
                              </td>
                              {fields.map(f => {
                                const isEditing = editing?.rowIdx === rowIdx && editing?.field === f.key;
                                return (
                                  <td key={f.key} className="px-2 py-1 cursor-pointer"
                                    onClick={() => setEditing({ rowIdx, field: f.key })}>
                                    {isEditing ? (
                                      <Input
                                        autoFocus
                                        defaultValue={row[f.key] || ''}
                                        className="h-6 text-xs px-1 w-28"
                                        onBlur={e => handleCellEdit(rowIdx, f.key, e.target.value)}
                                        onKeyDown={e => {
                                          if (e.key === 'Enter') handleCellEdit(rowIdx, f.key, e.target.value);
                                          if (e.key === 'Escape') setEditing(null);
                                        }}
                                      />
                                    ) : (
                                      <span className={`${hasError ? 'text-slate-700' : 'text-slate-600'} hover:underline`}>
                                        {row[f.key] || <span className="text-slate-300">—</span>}
                                      </span>
                                    )}
                                  </td>
                                );
                              })}
                              <td className="px-2 py-1.5 text-red-600 text-[11px]">
                                {errs.map((e, ei) => <div key={ei}>• {e}</div>)}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  {/* Puntaje capacitación */}
                  {tab === 'capacitacion' && validCount > 0 && (
                    <div className="mt-3 p-3 bg-indigo-50 border border-indigo-200 rounded-lg text-sm text-indigo-800">
                      Puntaje total estimado (filas válidas):{' '}
                      <strong>
                        {rows.filter((_, i) => (validationMap[i] || []).length === 0)
                          .reduce((s, r) => {
                            const nivelT = LEVEL_MAP[r.nivel_tecnico] || r.nivel_tecnico;
                            return s + calculateTrainingPoints(parseFloat(r.horas), parseFloat(r.nota), nivelT);
                          }, 0).toFixed(2)} pts
                      </strong>
                    </div>
                  )}

                  <div className="mt-4 flex items-center gap-3">
                    <Button
                      onClick={handleConfirm}
                      disabled={importing || validCount === 0}
                      className="bg-emerald-600 hover:bg-emerald-700"
                    >
                      <ClipboardCheck className="w-4 h-4 mr-1" />
                      {importing ? 'Importando...' : `Confirmar carga (${validCount} registro${validCount !== 1 ? 's' : ''})`}
                    </Button>
                    {errorCount > 0 && (
                      <p className="text-xs text-slate-500">{errorCount} fila{errorCount !== 1 ? 's' : ''} con errores serán omitidas.</p>
                    )}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Resultado final */}
            {step === 'done' && importLog && (
              <Card className="border-emerald-200 bg-emerald-50">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2 text-emerald-800">
                    <CheckCircle2 className="w-4 h-4" /> Importación completada
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="grid grid-cols-3 gap-3">
                    <div className="bg-white rounded-lg p-3 text-center border">
                      <div className="text-2xl font-bold text-slate-900">{importLog.total}</div>
                      <div className="text-xs text-slate-500 mt-1">Total procesadas</div>
                    </div>
                    <div className="bg-white rounded-lg p-3 text-center border border-green-200">
                      <div className="text-2xl font-bold text-green-600">{importLog.ok}</div>
                      <div className="text-xs text-slate-500 mt-1">Importadas correctamente</div>
                    </div>
                    <div className="bg-white rounded-lg p-3 text-center border border-red-200">
                      <div className="text-2xl font-bold text-red-500">{importLog.invalid}</div>
                      <div className="text-xs text-slate-500 mt-1">Omitidas (con errores)</div>
                    </div>
                  </div>

                  {importLog.errors?.length > 0 && (
                    <div className="bg-red-50 border border-red-200 rounded-lg p-3 space-y-1">
                      <p className="text-xs font-semibold text-red-700 flex items-center gap-1">
                        <AlertTriangle className="w-3 h-3" /> Errores durante la escritura:
                      </p>
                      {importLog.errors.map((e, i) => <p key={i} className="text-xs text-red-600">• {e}</p>)}
                    </div>
                  )}

                  <Button variant="outline" size="sm" onClick={() => { setStep('idle'); setRows([]); setValidationMap({}); if (fileInputRef.current) fileInputRef.current.value = ''; }}>
                    <RotateCcw className="w-3.5 h-3.5 mr-1" /> Nueva importación
                  </Button>
                </CardContent>
              </Card>
            )}

          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}