import { useState, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Upload, Download, CheckCircle2, XCircle, AlertTriangle, FileSpreadsheet } from 'lucide-react';
import { toast } from 'sonner';
import {
  calculateTrainingPoints,
  calculateEffectiveDays,
  calculateBienios,
  calculateBienioPoints,
  calculateNextBienioDate,
} from '@/components/calculations';

// ── Helpers ──────────────────────────────────────────────────

function parseCSV(text) {
  const lines = text.trim().split(/\r?\n/);
  if (lines.length < 2) return [];
  const headers = lines[0].split(',').map(h => h.trim().toLowerCase().replace(/\s+/g, '_'));
  return lines.slice(1).map(line => {
    const values = line.split(',').map(v => v.trim());
    const obj = {};
    headers.forEach((h, i) => { obj[h] = values[i] || ''; });
    return obj;
  });
}

function normalizeRUT(rut) {
  return (rut || '').replace(/\./g, '').trim().toUpperCase();
}

// ── Validadores ───────────────────────────────────────────────

function validateDotacion(rows, employees) {
  const rutMap = {};
  employees.forEach(e => { rutMap[normalizeRUT(e.rut)] = e; });
  const validCategories = ['A', 'B', 'C', 'D', 'E', 'F'];
  const validContracts = ['Planta', 'Plazo Fijo', 'Honorarios', 'Reemplazo'];

  return rows.map(row => {
    const errors = [];
    const rut = normalizeRUT(row.rut);
    if (!rut) errors.push('RUT requerido');
    if (!row.nombre) errors.push('Nombre requerido');
    if (!validCategories.includes((row.categoria || '').toUpperCase())) errors.push(`Categoría inválida: ${row.categoria}`);
    const nivel = parseInt(row.nivel);
    if (isNaN(nivel) || nivel < 1 || nivel > 15) errors.push(`Nivel inválido: ${row.nivel}`);
    if (!validContracts.includes(row.tipo_contrato)) errors.push(`Tipo contrato inválido: ${row.tipo_contrato}`);
    return { row, rut, errors, existing: rutMap[rut] || null };
  });
}

function validateExperiencia(rows, employees) {
  const rutMap = {};
  employees.forEach(e => { rutMap[normalizeRUT(e.rut)] = e; });
  const validTypes = ['Planta', 'Plazo Fijo', 'Honorarios', 'Reemplazo'];

  return rows.map(row => {
    const errors = [];
    const rut = normalizeRUT(row.rut);
    if (!rut) errors.push('RUT requerido');
    if (!rutMap[rut]) errors.push(`RUT no encontrado en el sistema: ${rut}`);
    if (!validTypes.includes(row.tipo_periodo)) errors.push(`Tipo periodo inválido: ${row.tipo_periodo}`);
    if (!row.fecha_inicio) errors.push('Fecha inicio requerida');
    return { row, rut, errors, employee: rutMap[rut] || null };
  });
}

function validateCapacitacion(rows, employees) {
  const rutMap = {};
  employees.forEach(e => { rutMap[normalizeRUT(e.rut)] = e; });
  const validLevels = ['Básico', 'Intermedio', 'Avanzado', 'Postgrado', '1', '2', '3', '4'];
  const levelMap = { '1': 'Básico', '2': 'Intermedio', '3': 'Avanzado', '4': 'Postgrado' };
  const validStatuses = ['Pendiente', 'Validado', 'Rechazado'];

  return rows.map(row => {
    const errors = [];
    const rut = normalizeRUT(row.rut);
    if (!rut) errors.push('RUT requerido');
    if (!rutMap[rut]) errors.push(`RUT no encontrado: ${rut}`);
    if (!row.nombre_curso) errors.push('Nombre del curso requerido');
    const horas = parseFloat(row.horas);
    if (isNaN(horas) || horas <= 0) errors.push(`Horas inválidas: ${row.horas}`);
    const nota = parseFloat(row.nota);
    if (isNaN(nota) || nota < 1 || nota > 7) errors.push(`Nota inválida: ${row.nota} (debe ser 1-7)`);
    const rawLevel = row.nivel_tecnico || '';
    const nivelTecnico = levelMap[rawLevel] || rawLevel;
    if (!['Básico', 'Intermedio', 'Avanzado', 'Postgrado'].includes(nivelTecnico)) errors.push(`Nivel técnico inválido: ${row.nivel_tecnico} (usar Básico/Intermedio/Avanzado/Postgrado o 1-4)`);
    const estado = row.estado || 'Pendiente';
    if (!validStatuses.includes(estado)) errors.push(`Estado inválido: ${estado}`);
    const points = errors.length === 0 ? calculateTrainingPoints(horas, nota, nivelTecnico) : 0;
    return { row, rut, errors, employee: rutMap[rut] || null, nivelTecnico, points };
  });
}

// ── Plantillas CSV ────────────────────────────────────────────

const TEMPLATES = {
  dotacion: {
    name: 'plantilla_dotacion.csv',
    content: 'rut,nombre,categoria,nivel,cargo,fecha_ingreso,tipo_contrato\n12345678-9,Juan Pérez,B,8,Enfermero,2015-03-01,Planta',
  },
  experiencia: {
    name: 'plantilla_experiencia.csv',
    content: 'rut,tipo_periodo,fecha_inicio,fecha_fin,institucion,n_resolucion\n12345678-9,Planta,2010-01-01,2015-02-28,Hospital Base Valdivia,EX-2010-001',
  },
  capacitacion: {
    name: 'plantilla_capacitacion.csv',
    content: 'rut,nombre_curso,institucion,horas,nota,nivel_tecnico,fecha,estado\n12345678-9,Curso de Primeros Auxilios,ACHS,40,6.5,Intermedio,2023-06-15,Validado',
  },
};

function downloadTemplate(key) {
  const t = TEMPLATES[key];
  const blob = new Blob([t.content], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = t.name; a.click();
  URL.revokeObjectURL(url);
}

// ── Sub-componente: tabla de resultados ───────────────────────

function ResultTable({ results, columns }) {
  if (!results.length) return null;
  const ok = results.filter(r => r.errors.length === 0).length;
  const bad = results.length - ok;
  return (
    <div className="space-y-3">
      <div className="flex gap-3">
        <Badge className="bg-green-100 text-green-800">{ok} válidos</Badge>
        {bad > 0 && <Badge className="bg-red-100 text-red-800">{bad} con errores</Badge>}
      </div>
      <div className="overflow-auto max-h-64 border rounded-lg">
        <table className="w-full text-xs">
          <thead className="bg-slate-100 sticky top-0">
            <tr>
              <th className="px-2 py-2 text-left">Estado</th>
              {columns.map(c => <th key={c} className="px-2 py-2 text-left">{c}</th>)}
              <th className="px-2 py-2 text-left">Errores</th>
            </tr>
          </thead>
          <tbody>
            {results.map((r, i) => (
              <tr key={i} className={r.errors.length ? 'bg-red-50' : 'bg-white'}>
                <td className="px-2 py-1.5">
                  {r.errors.length === 0
                    ? <CheckCircle2 className="w-4 h-4 text-green-600" />
                    : <XCircle className="w-4 h-4 text-red-500" />}
                </td>
                {columns.map(c => <td key={c} className="px-2 py-1.5 text-slate-700">{r.row[c.toLowerCase().replace(/\s/g, '_')] || '—'}</td>)}
                <td className="px-2 py-1.5 text-red-600">{r.errors.join('; ')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Componente principal ──────────────────────────────────────

export default function ImportModule() {
  const fileInputRef = useRef(null);
  const [activeTab, setActiveTab] = useState('dotacion');
  const [parsed, setParsed] = useState([]);
  const [validated, setValidated] = useState([]);
  const [importing, setImporting] = useState(false);
  const [importLog, setImportLog] = useState(null);

  const { data: employees = [] } = useQuery({
    queryKey: ['employees-all'],
    queryFn: () => base44.entities.Employee.list(),
  });

  const handleTabChange = (tab) => {
    setActiveTab(tab);
    setParsed([]);
    setValidated([]);
    setImportLog(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleFile = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target.result;
      const rows = parseCSV(text);
      setParsed(rows);
      setImportLog(null);

      let results = [];
      if (activeTab === 'dotacion') results = validateDotacion(rows, employees);
      else if (activeTab === 'experiencia') results = validateExperiencia(rows, employees);
      else if (activeTab === 'capacitacion') results = validateCapacitacion(rows, employees);
      setValidated(results);
    };
    reader.readAsText(file, 'UTF-8');
  };

  const handleImport = async () => {
    const valid = validated.filter(r => r.errors.length === 0);
    if (!valid.length) { toast.error('No hay filas válidas para importar'); return; }
    setImporting(true);
    const log = { ok: 0, skipped: 0, errors: [] };

    try {
      if (activeTab === 'dotacion') {
        for (const r of valid) {
          const payload = {
            rut: r.rut,
            full_name: r.row.nombre,
            category: r.row.categoria.toUpperCase(),
            current_level: parseInt(r.row.nivel),
            position: r.row.cargo || '',
            hire_date: r.row.fecha_ingreso || '',
            contract_type: r.row.tipo_contrato,
            status: 'Activo',
          };
          if (r.existing) {
            await base44.entities.Employee.update(r.existing.id, payload);
          } else {
            await base44.entities.Employee.create(payload);
          }
          log.ok++;
        }
      } else if (activeTab === 'experiencia') {
        // Agrupar por empleado para recalcular al final
        const byEmployee = {};
        for (const r of valid) {
          const emp = r.employee;
          const start = r.row.fecha_inicio;
          const end = r.row.fecha_fin || null;
          const days = end
            ? Math.max(0, Math.floor((new Date(end) - new Date(start)) / 86400000))
            : Math.floor((new Date() - new Date(start)) / 86400000);

          await base44.entities.ServicePeriod.create({
            employee_id: emp.id,
            period_type: r.row.tipo_periodo,
            start_date: start,
            end_date: end || '',
            institution: r.row.institucion || 'APS Panguipulli',
            resolution_number: r.row.n_resolucion || '',
            days_count: days,
            is_active: !end,
            conflict_status: 'Sin Conflicto',
            ajustado_por_solapamiento: false,
          });
          byEmployee[emp.id] = emp;
          log.ok++;
        }
        // Recalcular bienios para cada empleado afectado
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
            total_experience_days: eDays,
            bienios_count: b,
            bienio_points: bp,
            next_bienio_date: nbd,
            total_points: bp + (emp.training_points || 0),
          });
        }
      } else if (activeTab === 'capacitacion') {
        const byEmployee = {};
        for (const r of valid) {
          const emp = r.employee;
          await base44.entities.Training.create({
            employee_id: emp.id,
            course_name: r.row.nombre_curso,
            institution: r.row.institucion || '',
            hours: parseFloat(r.row.horas),
            grade: parseFloat(r.row.nota),
            technical_level: r.nivelTecnico,
            completion_date: r.row.fecha || '',
            calculated_points: r.points,
            status: r.row.estado || 'Pendiente',
            is_postitle: r.nivelTecnico === 'Postgrado',
          });
          byEmployee[emp.id] = emp;
          log.ok++;
        }
        // Recalcular puntos de capacitación para cada empleado
        for (const empId of Object.keys(byEmployee)) {
          const emp = byEmployee[empId];
          const allTrainings = await base44.entities.Training.filter({ employee_id: empId });
          const validatedTrainings = allTrainings.filter(t => t.status === 'Validado');
          const totalTrainingPoints = validatedTrainings.reduce((s, t) => s + (t.calculated_points || 0), 0);
          await base44.entities.Employee.update(empId, {
            training_points: totalTrainingPoints,
            total_points: (emp.bienio_points || 0) + totalTrainingPoints,
          });
        }
      }
    } catch (err) {
      log.errors.push(err.message || 'Error desconocido');
    }

    setImportLog(log);
    setImporting(false);
    if (log.ok > 0) toast.success(`${log.ok} registros importados correctamente`);
    if (log.errors.length) toast.error(`${log.errors.length} errores durante la importación`);
  };

  const tabColumns = {
    dotacion: ['rut', 'nombre', 'categoria', 'nivel', 'cargo', 'tipo_contrato'],
    experiencia: ['rut', 'tipo_periodo', 'fecha_inicio', 'fecha_fin', 'institucion'],
    capacitacion: ['rut', 'nombre_curso', 'horas', 'nota', 'nivel_tecnico', 'estado'],
  };

  const validCount = validated.filter(r => r.errors.length === 0).length;

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
            {/* Descripción de campos */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm flex items-center gap-2">
                  <FileSpreadsheet className="w-4 h-4 text-indigo-600" />
                  Campos requeridos
                </CardTitle>
              </CardHeader>
              <CardContent>
                {tab === 'dotacion' && (
                  <p className="text-xs text-slate-600">
                    <strong>rut</strong>, <strong>nombre</strong>, <strong>categoria</strong> (A/B/C/D/E/F),{' '}
                    <strong>nivel</strong> (1-15), <strong>cargo</strong>, <strong>fecha_ingreso</strong> (YYYY-MM-DD),{' '}
                    <strong>tipo_contrato</strong> (Planta / Plazo Fijo / Honorarios / Reemplazo)
                    <br /><span className="text-slate-400 mt-1 block">Si el RUT ya existe, se actualizará el registro.</span>
                  </p>
                )}
                {tab === 'experiencia' && (
                  <p className="text-xs text-slate-600">
                    <strong>rut</strong> (debe existir en el sistema), <strong>tipo_periodo</strong> (Planta / Plazo Fijo / Honorarios / Reemplazo),{' '}
                    <strong>fecha_inicio</strong> (YYYY-MM-DD), <strong>fecha_fin</strong> (YYYY-MM-DD o vacío si vigente),{' '}
                    <strong>institucion</strong>, <strong>n_resolucion</strong>
                    <br /><span className="text-slate-400 mt-1 block">Los bienios se recalcularán automáticamente para cada funcionario.</span>
                  </p>
                )}
                {tab === 'capacitacion' && (
                  <p className="text-xs text-slate-600">
                    <strong>rut</strong> (debe existir en el sistema), <strong>nombre_curso</strong>, <strong>institucion</strong>,{' '}
                    <strong>horas</strong>, <strong>nota</strong> (1.0-7.0), <strong>nivel_tecnico</strong> (Básico/Intermedio/Avanzado/Postgrado o 1-4),{' '}
                    <strong>fecha</strong> (YYYY-MM-DD), <strong>estado</strong> (Pendiente / Validado / Rechazado)
                    <br /><span className="text-slate-400 mt-1 block">El puntaje se calcula automáticamente según Ley 19.378.</span>
                  </p>
                )}
              </CardContent>
            </Card>

            {/* Acciones: descargar plantilla + subir archivo */}
            <div className="flex flex-wrap gap-3">
              <Button variant="outline" size="sm" onClick={() => downloadTemplate(tab)}>
                <Download className="w-4 h-4 mr-1" /> Descargar plantilla
              </Button>
              <Button size="sm" className="bg-indigo-600 hover:bg-indigo-700" onClick={() => fileInputRef.current?.click()}>
                <Upload className="w-4 h-4 mr-1" /> Seleccionar archivo CSV
              </Button>
              <input ref={fileInputRef} type="file" accept=".csv" className="hidden" onChange={handleFile} />
            </div>

            {/* Resultados de validación */}
            {validated.length > 0 && (
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm">Vista previa y validación ({validated.length} filas)</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <ResultTable results={validated} columns={tabColumns[tab]} />

                  {/* Puntos calculados (solo capacitación) */}
                  {tab === 'capacitacion' && validated.filter(r => r.errors.length === 0).length > 0 && (
                    <div className="p-3 bg-indigo-50 border border-indigo-200 rounded-lg text-sm text-indigo-800">
                      Puntaje total calculado (filas válidas):{' '}
                      <strong>
                        {validated.filter(r => r.errors.length === 0).reduce((s, r) => s + r.points, 0).toFixed(2)} pts
                      </strong>
                    </div>
                  )}

                  <Button
                    onClick={handleImport}
                    disabled={importing || validCount === 0}
                    className="bg-emerald-600 hover:bg-emerald-700"
                  >
                    {importing ? 'Importando...' : `Importar ${validCount} registro${validCount !== 1 ? 's' : ''} válidos`}
                  </Button>
                </CardContent>
              </Card>
            )}

            {/* Log de resultado */}
            {importLog && (
              <div className={`p-4 rounded-lg border text-sm space-y-1 ${importLog.errors.length ? 'bg-amber-50 border-amber-200' : 'bg-green-50 border-green-200'}`}>
                <div className="flex items-center gap-2 font-semibold">
                  {importLog.errors.length ? <AlertTriangle className="w-4 h-4 text-amber-600" /> : <CheckCircle2 className="w-4 h-4 text-green-600" />}
                  Importación completada
                </div>
                <p className="text-slate-700">{importLog.ok} registros importados correctamente.</p>
                {importLog.errors.map((e, i) => (
                  <p key={i} className="text-red-600">⚠ {e}</p>
                ))}
              </div>
            )}
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}