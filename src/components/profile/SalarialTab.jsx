import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { AlertTriangle, DollarSign, TrendingUp, CheckCircle } from 'lucide-react';

import { getSueldoBase, formatCLP as fmtCLP, SALARY_TABLE, SALARY_YEAR } from '@/constants/salaryTable';

export { getSueldoBase };

const VALID_LEVELS = Array.from({ length: 15 }, (_, i) => i + 1);

const fmt = fmtCLP;

const CAT_COLORS = {
  A: 'bg-violet-100 text-violet-700 border-violet-200',
  B: 'bg-blue-100 text-blue-700 border-blue-200',
  C: 'bg-teal-100 text-teal-700 border-teal-200',
  D: 'bg-cyan-100 text-cyan-700 border-cyan-200',
  E: 'bg-orange-100 text-orange-700 border-orange-200',
  F: 'bg-slate-100 text-slate-700 border-slate-200',
};

export default function SalarialTab({ employee }) {
  const cat = employee.category;
  const lvl = employee.current_level;

  const isValidLevel = VALID_LEVELS.includes(lvl);
  const isValidCategory = Object.keys(SALARY_TABLE_2026).includes(cat);
  const hasInconsistency = !isValidLevel || !isValidCategory;

  const sueldoBase = getSueldoBase(cat, lvl);
  const asignacionAPS = sueldoBase; // 100% del sueldo base según normativa
  const sueldoBruto = sueldoBase != null ? sueldoBase + asignacionAPS : null;

  // Tabla comparativa: nivel actual ± 2 para contexto
  const contextLevels = isValidLevel
    ? VALID_LEVELS.filter(l => l >= Math.max(1, lvl - 2) && l <= Math.min(15, lvl + 2))
    : VALID_LEVELS.slice(0, 5);

  return (
    <div className="space-y-5">

      {/* Alerta de inconsistencia */}
      {hasInconsistency && (
        <div className="flex items-start gap-3 p-4 bg-red-50 border border-red-200 rounded-xl">
          <AlertTriangle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold text-red-700 text-sm">Alerta de Inconsistencia de Escalafón</p>
            <p className="text-sm text-red-600 mt-0.5">
              {!isValidCategory
                ? `La categoría "${cat}" no es válida en la tabla 2026 (A–F).`
                : `El nivel ${lvl} no existe en la tabla 2026 para Categoría ${cat} (rango 1–15).`
              }
            </p>
          </div>
        </div>
      )}

      {/* Situación Salarial Actualizada */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <DollarSign className="w-5 h-5 text-indigo-600" />
            Situación Salarial Actualizada — 2026
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Identificación */}
          <div className="flex items-center gap-3 flex-wrap">
            <Badge className={`${CAT_COLORS[cat] || ''} border font-semibold text-sm px-3 py-1`}>
              Categoría {cat}
            </Badge>
            <Badge variant="outline" className="text-sm font-semibold px-3 py-1">
              Nivel {lvl ?? '—'}
            </Badge>
            {!hasInconsistency && (
              <span className="flex items-center gap-1 text-xs text-emerald-600">
                <CheckCircle className="w-3.5 h-3.5" /> Nivel verificado en tabla 2026
              </span>
            )}
          </div>

          {/* Breakdown salarial */}
          {sueldoBase != null ? (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="bg-slate-50 rounded-xl p-4 border">
                <p className="text-xs text-slate-400 font-semibold uppercase tracking-wider">Sueldo Base</p>
                <p className="text-2xl font-bold text-slate-800 mt-1">{fmt(sueldoBase)}</p>
                <p className="text-xs text-slate-400 mt-0.5">Cat. {cat} · Nivel {lvl}</p>
              </div>
              <div className="bg-indigo-50 rounded-xl p-4 border border-indigo-100">
                <p className="text-xs text-indigo-500 font-semibold uppercase tracking-wider">Asignación APS</p>
                <p className="text-2xl font-bold text-indigo-700 mt-1">{fmt(asignacionAPS)}</p>
                <p className="text-xs text-indigo-400 mt-0.5">100% Sueldo Base (Art. 25 Ley 19.378)</p>
              </div>
              <div className="bg-emerald-50 rounded-xl p-4 border border-emerald-100">
                <p className="text-xs text-emerald-600 font-semibold uppercase tracking-wider">Sueldo Base Bruto</p>
                <p className="text-2xl font-bold text-emerald-700 mt-1">{fmt(sueldoBruto)}</p>
                <p className="text-xs text-emerald-500 mt-0.5">Base + APS (monto imponible base)</p>
              </div>
            </div>
          ) : (
            <p className="text-sm text-slate-400 py-4 text-center">No se puede calcular: nivel o categoría inválidos.</p>
          )}
        </CardContent>
      </Card>

      {/* Tabla contextual de niveles próximos */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <TrendingUp className="w-5 h-5 text-indigo-600" />
            Matriz Salarial 2026 — Categoría {cat}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-xs text-slate-400 mb-3">Mostrando niveles cercanos al nivel actual ({lvl}). Valores en pesos chilenos.</p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-2 pr-4 text-slate-500 font-semibold">Nivel</th>
                  <th className="text-right py-2 pr-4 text-slate-500 font-semibold">Sueldo Base</th>
                  <th className="text-right py-2 pr-4 text-slate-500 font-semibold">Asig. APS</th>
                  <th className="text-right py-2 text-slate-500 font-semibold">Base Bruto</th>
                </tr>
              </thead>
              <tbody>
                {contextLevels.map(l => {
                  const sb = getSueldoBase(cat, l);
                  const isCurrent = l === lvl;
                  return (
                    <tr key={l} className={`border-b last:border-0 transition-colors ${isCurrent ? 'bg-indigo-50' : 'hover:bg-slate-50'}`}>
                      <td className="py-2.5 pr-4">
                        <span className={`font-semibold ${isCurrent ? 'text-indigo-700' : 'text-slate-700'}`}>
                          Nivel {l}
                          {isCurrent && <span className="ml-2 text-xs bg-indigo-600 text-white px-1.5 py-0.5 rounded-full">actual</span>}
                        </span>
                      </td>
                      <td className="text-right py-2.5 pr-4 font-mono text-slate-700">{fmt(sb)}</td>
                      <td className="text-right py-2.5 pr-4 font-mono text-indigo-600">{fmt(sb)}</td>
                      <td className="text-right py-2.5 font-mono font-semibold text-emerald-700">{fmt(sb != null ? sb * 2 : null)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-slate-300 mt-3 text-right">
            * Tabla completa: 15 niveles disponibles. Valores vigentes desde enero 2026.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}