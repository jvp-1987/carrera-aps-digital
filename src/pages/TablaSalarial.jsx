import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { DollarSign, Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { SALARY_YEAR, CATEGORY_LABELS, getSueldoBase, formatCLP } from '@/constants/salaryTable';

const CATEGORIES = ['A', 'B', 'C', 'D', 'E', 'F'];
const LEVELS = Array.from({ length: 15 }, (_, i) => i + 1);

const CAT_COLORS = {
  A: 'bg-violet-100 text-violet-700 border-violet-200',
  B: 'bg-blue-100 text-blue-700 border-blue-200',
  C: 'bg-teal-100 text-teal-700 border-teal-200',
  D: 'bg-cyan-100 text-cyan-700 border-cyan-200',
  E: 'bg-orange-100 text-orange-700 border-orange-200',
  F: 'bg-slate-100 text-slate-700 border-slate-200',
};

function handleExportCSV() {
  const headers = ['Nivel', ...CATEGORIES.map(c => `Cat. ${c} — ${CATEGORY_LABELS[c]}`)];
  const rows = LEVELS.map(lvl =>
    [lvl, ...CATEGORIES.map(cat => getSueldoBase(cat, lvl) ?? '')]
  );
  const csv = [headers, ...rows]
    .map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(','))
    .join('\n');
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `tabla_salarial_${SALARY_YEAR}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export default function TablaSalarial() {
  const [highlight, setHighlight] = useState(null); // { cat, level }

  return (
    <div className="p-6 lg:p-8 max-w-7xl mx-auto">
      {/* Header */}
      <div className="mb-6 flex items-start justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Tabla de Remuneraciones</h1>
          <p className="text-slate-500 text-sm mt-1">
            Sueldo Base Mensual — Ley 19.378 · Vigencia {SALARY_YEAR}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={handleExportCSV} className="flex items-center gap-2">
          <Download className="w-4 h-4" />
          Exportar CSV
        </Button>
      </div>

      {/* Tabla completa */}
      <Card>
        <CardHeader className="pb-3 border-b">
          <CardTitle className="flex items-center gap-2 text-base">
            <DollarSign className="w-4 h-4 text-indigo-600" />
            Tabla Oficial Completa — Categorías A a F · Niveles 1 a 15
          </CardTitle>
          <p className="text-xs text-slate-400 mt-1">
            Haz clic en una celda para resaltarla. Valores en pesos chilenos (CLP).
          </p>
        </CardHeader>
        <CardContent className="pt-4 overflow-x-auto">
          <table className="w-full text-sm min-w-[700px]">
            <thead>
              <tr className="border-b">
                <th className="text-left py-2 px-3 text-slate-500 font-semibold w-16">Nivel</th>
                {CATEGORIES.map(cat => (
                  <th key={cat} className="text-right py-2 px-3">
                    <Badge className={`${CAT_COLORS[cat]} font-semibold text-xs`}>
                      Cat. {cat}
                    </Badge>
                    <div className="text-xs text-slate-400 font-normal mt-0.5">{CATEGORY_LABELS[cat]}</div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {LEVELS.map(lvl => (
                <tr key={lvl} className="border-b last:border-0 hover:bg-slate-50 transition-colors">
                  <td className="py-2.5 px-3 font-semibold text-slate-600">
                    {lvl}
                    {lvl === 1 && <span className="ml-1 text-[10px] text-emerald-600 font-normal">(máx)</span>}
                    {lvl === 15 && <span className="ml-1 text-[10px] text-slate-400 font-normal">(ing)</span>}
                  </td>
                  {CATEGORIES.map(cat => {
                    const val = getSueldoBase(cat, lvl);
                    const isHighlighted = highlight?.cat === cat && highlight?.level === lvl;
                    return (
                      <td
                        key={cat}
                        className={`py-2.5 px-3 text-right font-mono cursor-pointer transition-colors rounded ${
                          isHighlighted
                            ? 'bg-indigo-100 text-indigo-800 font-bold'
                            : 'text-slate-700 hover:bg-indigo-50'
                        }`}
                        onClick={() => setHighlight(isHighlighted ? null : { cat, level: lvl })}
                      >
                        {formatCLP(val)}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>

      {/* Detalle del nivel seleccionado */}
      {highlight && (
        <Card className="mt-6 border-2 border-indigo-200 bg-indigo-50">
          <CardContent className="p-5">
            <p className="text-xs font-semibold text-indigo-500 uppercase tracking-wider mb-3">
              Detalle seleccionado — Categoría {highlight.cat} · Nivel {highlight.level}
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {(() => {
                const sb = getSueldoBase(highlight.cat, highlight.level);
                return (
                  <>
                    <div className="bg-white rounded-xl p-4 border border-indigo-100">
                      <p className="text-xs text-slate-400 uppercase tracking-wider">Sueldo Base</p>
                      <p className="text-2xl font-bold text-slate-800 mt-1">{formatCLP(sb)}</p>
                    </div>
                    <div className="bg-white rounded-xl p-4 border border-indigo-100">
                      <p className="text-xs text-indigo-500 uppercase tracking-wider">+ Asignación APS (100%)</p>
                      <p className="text-2xl font-bold text-indigo-700 mt-1">{formatCLP(sb)}</p>
                    </div>
                    <div className="bg-white rounded-xl p-4 border border-emerald-100">
                      <p className="text-xs text-emerald-600 uppercase tracking-wider">= Base Bruto (SB + APS)</p>
                      <p className="text-2xl font-bold text-emerald-700 mt-1">{formatCLP(sb != null ? sb * 2 : null)}</p>
                    </div>
                  </>
                );
              })()}
            </div>
          </CardContent>
        </Card>
      )}

      <p className="text-xs text-slate-300 mt-4 text-right">
        Tabla Ley 19.378 · Vigencia enero {SALARY_YEAR} · APS / MINSAL
      </p>
    </div>
  );
}