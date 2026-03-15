import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Link } from 'react-router-dom';
import { TrendingUp, DollarSign, Users, AlertTriangle, FileText, Calendar } from 'lucide-react';
import { checkPromotion, LEVEL_RANGES_AB, LEVEL_RANGES_CF } from '@/components/calculations';

// ── Sueldos Base oficiales Ley 19.378 por Nivel (1-15) ──────
// Fuente: Reglamento vigente. Nivel 1 = más alto.
const SUELDOS_BASE = {
  A: { 1:1180000,2:1143171,3:1106342,4:1069513,5:1032684,6:995855,7:959026,8:922197,9:885368,10:848539,11:811710,12:774881,13:738052,14:701223,15:664394 },
  B: { 1:954000,2:926021,3:898042,4:870063,5:842084,6:814105,7:786126,8:758147,9:730168,10:702189,11:674210,12:646231,13:618252,14:590273,15:562294 },
  C: { 1:510000,2:496304,3:482608,4:468912,5:455216,6:441520,7:427824,8:414128,9:400432,10:386736,11:373040,12:359344,13:345648,14:331952,15:318256 },
  D: { 1:480000,2:467200,3:454400,4:441600,5:428800,6:416000,7:403200,8:390400,9:377600,10:364800,11:352000,12:339200,13:326400,14:313600,15:300800 },
  E: { 1:450000,2:438000,3:426000,4:414000,5:402000,6:390000,7:378000,8:366000,9:354000,10:342000,11:330000,12:318000,13:306000,14:294000,15:282000 },
  F: { 1:420000,2:409200,3:398400,4:387600,5:376800,6:366000,7:355200,8:344400,9:333600,10:322800,11:312000,12:301200,13:290400,14:279600,15:268800 },
};

const CATEGORY_LABELS = {
  A: 'A — Médicos/Dentistas',
  B: 'B — Profesionales',
  C: 'C — Técnicos',
  D: 'D — Tecnólogos',
  E: 'E — Administrativos',
  F: 'F — Auxiliares',
};

const CATEGORY_COLORS = {
  A: 'bg-violet-100 text-violet-700 border-violet-200',
  B: 'bg-blue-100 text-blue-700 border-blue-200',
  C: 'bg-teal-100 text-teal-700 border-teal-200',
  D: 'bg-cyan-100 text-cyan-700 border-cyan-200',
  E: 'bg-orange-100 text-orange-700 border-orange-200',
  F: 'bg-slate-100 text-slate-700 border-slate-200',
};

function formatCLP(n) {
  return n.toLocaleString('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 });
}

function getSueldo(category, level) {
  return (SUELDOS_BASE[category]?.[level]) ?? 0;
}

export default function BudgetProjection() {
  const { data: employees = [], isLoading } = useQuery({
    queryKey: ['employees'],
    queryFn: () => base44.entities.Employee.list(),
  });
  const { data: leaves = [] } = useQuery({
    queryKey: ['leaves'],
    queryFn: () => base44.entities.LeaveWithoutPay.list(),
  });

  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-full p-20">
        <div className="w-8 h-8 border-4 border-slate-200 border-t-indigo-600 rounded-full animate-spin" />
      </div>
    );
  }

  // Funcionarios elegibles para ascenso
  const eligibleForPromotion = employees
    .filter(e => e.status === 'Activo' && e.current_level && e.total_points)
    .map(emp => {
      const promo = checkPromotion(emp.current_level, emp.total_points, emp.category);
      if (!promo.eligible) return null;
      const currentSueldo = getSueldo(emp.category, emp.current_level);
      const nextSueldo = getSueldo(emp.category, promo.nextLevel);
      const diff = nextSueldo - currentSueldo;
      return { ...emp, promo, currentSueldo, nextSueldo, diff };
    })
    .filter(Boolean);

  // Agrupar por categoría
  const byCategory = ['A','B','C','D','E','F'].map(cat => {
    const list = eligibleForPromotion.filter(e => e.category === cat);
    const totalDiff = list.reduce((s, e) => s + e.diff, 0);
    const totalAnual = totalDiff * 12;
    return { cat, list, totalDiff, totalAnual };
  }).filter(c => c.list.length > 0);

  // Total global
  const totalMensual = eligibleForPromotion.reduce((s, e) => s + e.diff, 0);
  const totalAnual = totalMensual * 12;
  const planillaActual = employees
    .filter(e => e.status === 'Activo' && e.current_level && e.category)
    .reduce((s, e) => s + getSueldo(e.category, e.current_level), 0);
  const porcentajeAumento = planillaActual > 0 ? ((totalMensual / planillaActual) * 100).toFixed(2) : 0;

  // Bienios desplazados (next_bienio_date en 2027)
  const bieniosDesplazados = employees.filter(emp => {
    if (!emp.next_bienio_date) return false;
    return emp.next_bienio_date.startsWith('2027');
  });

  // Ahorro permisos sin goce
  const totalLeaveDays = leaves.reduce((s, l) => s + (l.days_count || 0), 0);
  const avgDailyCost = planillaActual > 0 ? (planillaActual / 30) : 0;
  const ahorroPermisos = Math.round(totalLeaveDays * avgDailyCost);

  return (
    <div className="p-6 lg:p-8 max-w-7xl mx-auto">
      {/* Header */}
      <div className="mb-6 flex items-start justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Proyección de Impacto Presupuestario</h1>
          <p className="text-slate-500 text-sm mt-1">Año 2027 — Ley 19.378 · APS Panguipulli</p>
        </div>
        <Badge className="bg-indigo-100 text-indigo-700 text-sm px-3 py-1">
          <Calendar className="w-3.5 h-3.5 mr-1" />
          Vigencia: 1 enero 2027
        </Badge>
      </div>

      {/* Resumen ejecutivo */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <Card className="border-2 border-indigo-200 bg-indigo-50">
          <CardContent className="p-5">
            <p className="text-xs font-semibold text-indigo-500 uppercase tracking-wider">Funcionarios a Ascender</p>
            <p className="text-4xl font-bold text-indigo-700 mt-1">{eligibleForPromotion.length}</p>
            <p className="text-xs text-indigo-500 mt-1">Con puntaje suficiente al periodo 2027</p>
          </CardContent>
        </Card>
        <Card className="border-2 border-rose-200 bg-rose-50">
          <CardContent className="p-5">
            <p className="text-xs font-semibold text-rose-500 uppercase tracking-wider">Costo Mensual Adicional</p>
            <p className="text-2xl font-bold text-rose-700 mt-1">{formatCLP(totalMensual)}</p>
            <p className="text-xs text-rose-500 mt-1">Diferencial de sueldos base</p>
          </CardContent>
        </Card>
        <Card className="border-2 border-rose-200 bg-rose-50">
          <CardContent className="p-5">
            <p className="text-xs font-semibold text-rose-500 uppercase tracking-wider">Costo Anual Proyectado</p>
            <p className="text-2xl font-bold text-rose-700 mt-1">{formatCLP(totalAnual)}</p>
            <p className="text-xs text-rose-500 mt-1">12 meses × diferencial</p>
          </CardContent>
        </Card>
        <Card className="border-2 border-amber-200 bg-amber-50">
          <CardContent className="p-5">
            <p className="text-xs font-semibold text-amber-600 uppercase tracking-wider">Aumento % de Planilla</p>
            <p className="text-4xl font-bold text-amber-700 mt-1">{porcentajeAumento}%</p>
            <p className="text-xs text-amber-600 mt-1">Sobre planilla activa actual</p>
          </CardContent>
        </Card>
      </div>

      {/* 1. Ascensos detectados por categoría */}
      <Card className="mb-6">
        <CardHeader className="pb-3 border-b">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-emerald-600" />
            1. Resumen de Ascensos Detectados
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-4">
          <div className="space-y-4">
            {byCategory.map(({ cat, list, totalDiff, totalAnual }) => (
              <div key={cat}>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <Badge className={`${CATEGORY_COLORS[cat]} font-semibold`}>Cat. {cat}</Badge>
                    <span className="text-sm font-medium text-slate-700">{CATEGORY_LABELS[cat]}</span>
                    <span className="text-xs text-slate-400">({list.length} funcionarios)</span>
                  </div>
                  <div className="text-right">
                    <span className="text-sm font-bold text-rose-600">{formatCLP(totalDiff)}</span>
                    <span className="text-xs text-slate-400 ml-1">/ mes</span>
                  </div>
                </div>
                <div className="rounded-lg overflow-hidden border border-slate-100">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-50 text-xs text-slate-500">
                      <tr>
                        <th className="text-left px-3 py-2 font-medium">Funcionario</th>
                        <th className="text-center px-3 py-2 font-medium">Nivel Actual → Nuevo</th>
                        <th className="text-right px-3 py-2 font-medium">Sueldo Actual</th>
                        <th className="text-right px-3 py-2 font-medium">Sueldo Nuevo</th>
                        <th className="text-right px-3 py-2 font-medium">Diferencia Mensual</th>
                      </tr>
                    </thead>
                    <tbody>
                      {list.map((emp, i) => (
                        <tr key={emp.id} className={i % 2 === 0 ? 'bg-white' : 'bg-slate-50'}>
                          <td className="px-3 py-2">
                            <Link to={`/EmployeeProfile?id=${emp.id}`} className="text-indigo-600 hover:underline font-medium">
                              {emp.full_name}
                            </Link>
                            <span className="text-xs text-slate-400 ml-2">{emp.rut}</span>
                          </td>
                          <td className="px-3 py-2 text-center">
                            <span className="inline-flex items-center gap-1">
                              <Badge variant="outline" className="text-xs">Niv. {emp.current_level}</Badge>
                              <span className="text-slate-400">→</span>
                              <Badge className="bg-emerald-100 text-emerald-700 text-xs">Niv. {emp.promo.nextLevel}</Badge>
                            </span>
                          </td>
                          <td className="px-3 py-2 text-right text-slate-600">{formatCLP(emp.currentSueldo)}</td>
                          <td className="px-3 py-2 text-right text-slate-600">{formatCLP(emp.nextSueldo)}</td>
                          <td className="px-3 py-2 text-right font-semibold text-rose-600">+{formatCLP(emp.diff)}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot className="bg-slate-100 font-semibold text-sm">
                      <tr>
                        <td colSpan={4} className="px-3 py-2 text-right text-slate-600">Total mensual Cat. {cat}:</td>
                        <td className="px-3 py-2 text-right text-rose-600">+{formatCLP(totalDiff)}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>
            ))}

            {byCategory.length === 0 && (
              <p className="text-sm text-slate-400 py-6 text-center">Sin funcionarios con puntaje suficiente para ascenso en el periodo</p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* 2. Asignaciones transitarias */}
      <Card className="mb-6">
        <CardHeader className="pb-3 border-b">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <DollarSign className="w-4 h-4 text-blue-600" />
            2. Diferencial por Asignaciones Transitorias
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {/* Asignación APS 100% */}
            <div className="p-4 rounded-xl border bg-blue-50 border-blue-200">
              <p className="text-xs font-semibold text-blue-600 uppercase tracking-wider mb-2">Asignación APS (100%)</p>
              <p className="text-2xl font-bold text-blue-700">{formatCLP(totalMensual * 2)}</p>
              <p className="text-xs text-blue-500 mt-1">Impacto mensual total (diferencial × 2 por la asignación proporcional)</p>
              <p className="text-xs text-slate-400 mt-2">Al incrementar el sueldo base, la asignación de Atención Primaria (100% del SB) sube en igual proporción.</p>
            </div>
            {/* Responsabilidad Directiva */}
            <div className="p-4 rounded-xl border bg-violet-50 border-violet-200">
              <p className="text-xs font-semibold text-violet-600 uppercase tracking-wider mb-2">Resp. Directiva (20%)</p>
              {(() => {
                const directivos = eligibleForPromotion.filter(e => e.category === 'A' || e.category === 'B');
                const impacto = directivos.reduce((s, e) => s + Math.round(e.diff * 0.20), 0);
                return (
                  <>
                    <p className="text-2xl font-bold text-violet-700">{formatCLP(impacto)}</p>
                    <p className="text-xs text-violet-500 mt-1">{directivos.length} funcionarios directivos afectados</p>
                    <p className="text-xs text-slate-400 mt-2">Calculado como 20% del diferencial de sueldo base para personal con asignación de responsabilidad.</p>
                  </>
                );
              })()}
            </div>
            {/* Estímulo Médicos */}
            <div className="p-4 rounded-xl border bg-emerald-50 border-emerald-200">
              <p className="text-xs font-semibold text-emerald-600 uppercase tracking-wider mb-2">Estímulo Médicos/Dentistas (15%)</p>
              {(() => {
                const medicos = eligibleForPromotion.filter(e => e.category === 'A');
                const impacto = medicos.reduce((s, e) => s + Math.round((e.nextSueldo + e.nextSueldo) * 0.15 - (e.currentSueldo + e.currentSueldo) * 0.15), 0);
                return (
                  <>
                    <p className="text-2xl font-bold text-emerald-700">{formatCLP(impacto)}</p>
                    <p className="text-xs text-emerald-500 mt-1">{medicos.length} médicos/dentistas afectados</p>
                    <p className="text-xs text-slate-400 mt-2">15% sobre (SB + Asignación APS) para personal contratado post-2007.</p>
                  </>
                );
              })()}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 3. Bienios y Permisos */}
      <Card className="mb-6">
        <CardHeader className="pb-3 border-b">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-500" />
            3. Bienios y Permisos sin Goce — Costo de Oportunidad
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="p-4 rounded-xl border bg-amber-50 border-amber-200">
              <p className="text-xs font-semibold text-amber-600 uppercase tracking-wider mb-2">Bienios Desplazados a 2027</p>
              <p className="text-3xl font-bold text-amber-700">{bieniosDesplazados.length}</p>
              <p className="text-xs text-amber-600 mt-1">funcionarios con bienio diferido</p>
              <p className="text-xs text-slate-500 mt-2">
                Estos bienios, por efecto de permisos sin goce, se trasladaron del presupuesto 2026 al 2027, liberando caja en el ejercicio actual.
              </p>
              {bieniosDesplazados.length > 0 && (
                <div className="mt-3 space-y-1 max-h-32 overflow-y-auto">
                  {bieniosDesplazados.map(emp => (
                    <div key={emp.id} className="flex justify-between text-xs">
                      <Link to={`/EmployeeProfile?id=${emp.id}`} className="text-indigo-600 hover:underline truncate max-w-[60%]">{emp.full_name}</Link>
                      <span className="text-slate-500">{emp.next_bienio_date}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="p-4 rounded-xl border bg-slate-50 border-slate-200">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Ahorro por Permisos sin Goce</p>
              <p className="text-3xl font-bold text-slate-700">{totalLeaveDays.toLocaleString('es-CL')}</p>
              <p className="text-xs text-slate-500 mt-1">días de permiso sin goce registrados</p>
              <div className="mt-3 p-3 bg-white rounded-lg border border-slate-200">
                <p className="text-xs text-slate-500">Ahorro estimado acumulado:</p>
                <p className="text-xl font-bold text-slate-600 mt-0.5">{formatCLP(ahorroPermisos)}</p>
                <p className="text-xs text-slate-400 mt-1">Calculado sobre costo diario promedio de planilla activa (SB ÷ 30)</p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 4. Resumen Ejecutivo */}
      <Card className="border-2 border-indigo-300">
        <CardHeader className="pb-3 border-b bg-indigo-50 rounded-t-xl">
          <CardTitle className="text-base font-semibold flex items-center gap-2 text-indigo-800">
            <FileText className="w-4 h-4 text-indigo-600" />
            4. Resumen Ejecutivo — Concejo Municipal
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-5">
            <div className="p-4 bg-white rounded-xl border-2 border-rose-200 text-center">
              <p className="text-xs text-rose-500 font-semibold uppercase tracking-wider">Costo Total Proyectado Ascensos</p>
              <p className="text-2xl font-bold text-rose-700 mt-1">{formatCLP(totalAnual)}</p>
              <p className="text-xs text-rose-400 mt-1">Anual (12 meses)</p>
            </div>
            <div className="p-4 bg-white rounded-xl border-2 border-amber-200 text-center">
              <p className="text-xs text-amber-600 font-semibold uppercase tracking-wider">Aumento % de Planilla</p>
              <p className="text-2xl font-bold text-amber-700 mt-1">{porcentajeAumento}%</p>
              <p className="text-xs text-amber-400 mt-1">Sobre planilla base activa</p>
            </div>
            <div className="p-4 bg-white rounded-xl border-2 border-blue-200 text-center">
              <p className="text-xs text-blue-500 font-semibold uppercase tracking-wider">Funcionarios Afectados</p>
              <p className="text-2xl font-bold text-blue-700 mt-1">{eligibleForPromotion.length}</p>
              <p className="text-xs text-blue-400 mt-1">Ascensos proyectados</p>
            </div>
            <div className="p-4 bg-white rounded-xl border-2 border-emerald-200 text-center">
              <p className="text-xs text-emerald-500 font-semibold uppercase tracking-wider">Fecha de Vigencia</p>
              <p className="text-lg font-bold text-emerald-700 mt-1">1 ene 2027</p>
              <p className="text-xs text-emerald-400 mt-1">Según cumplimiento bienio neto</p>
            </div>
          </div>

          <div className="p-4 bg-indigo-50 rounded-xl border border-indigo-200 text-sm text-indigo-800">
            <p className="font-semibold mb-1">Nota para el Concejo Municipal:</p>
            <p className="text-indigo-700 leading-relaxed">
              Los montos proyectados corresponden exclusivamente al diferencial de Sueldo Base según la tabla oficial Ley 19.378.
              El costo total real incluirá además el incremento proporcional en asignaciones dependientes del sueldo base
              (Atención Primaria, Responsabilidad Directiva, Estímulo Médicos). Las fechas de vigencia de cada cambio de nivel
              están sujetas al acto administrativo de resolución que formalice el cumplimiento del bienio neto correspondiente.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}