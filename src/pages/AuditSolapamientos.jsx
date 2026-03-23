import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { AlertTriangle, CheckCircle2, Loader2, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

function detectOverlaps(periods) {
  const sorted = [...periods]
    .filter(p => p.start_date)
    .sort((a, b) => a.start_date.localeCompare(b.start_date));

  const overlaps = [];
  for (let i = 0; i < sorted.length; i++) {
    for (let j = i + 1; j < sorted.length; j++) {
      const a = sorted[i];
      const b = sorted[j];
      const aEnd = a.end_date || '9999-12-31';
      if (b.start_date <= aEnd) {
        overlaps.push({ a, b });
      }
    }
  }
  return overlaps;
}

export default function AuditSolapamientos() {
  const queryClient = useQueryClient();
  const [deleting, setDeleting] = useState(null); // id del período que se está eliminando

  const { data: employees = [], isLoading: empLoading } = useQuery({
    queryKey: ['employees-overlap-audit'],
    queryFn: () => base44.entities.Employee.list('-created_date', 2000),
  });

  const { data: servicePeriods = [], isLoading: spLoading } = useQuery({
    queryKey: ['service-periods-overlap-audit'],
    queryFn: () => base44.entities.ServicePeriod.list(null, 5000),
  });

  const isLoading = empLoading || spLoading;

  const empMap = useMemo(() => {
    const m = {};
    employees.forEach(e => { m[e.id] = e; });
    return m;
  }, [employees]);

  const results = useMemo(() => {
    const byEmp = {};
    servicePeriods.forEach(sp => {
      if (!byEmp[sp.employee_id]) byEmp[sp.employee_id] = [];
      byEmp[sp.employee_id].push(sp);
    });

    const conflicts = [];
    Object.entries(byEmp).forEach(([empId, periods]) => {
      const overlaps = detectOverlaps(periods);
      if (overlaps.length > 0) {
        conflicts.push({ emp: empMap[empId], empId, overlaps });
      }
    });

    return conflicts.sort((a, b) => (a.emp?.full_name || '').localeCompare(b.emp?.full_name || ''));
  }, [servicePeriods, empMap]);

  const handleDelete = async (period) => {
    setDeleting(period.id);
    await base44.entities.ServicePeriod.delete(period.id);
    toast.success(`Período eliminado: ${period.institution} (${period.start_date})`);
    queryClient.invalidateQueries({ queryKey: ['service-periods-overlap-audit'] });
    setDeleting(null);
  };

  if (isLoading) {
    return (
      <div className="p-6 flex justify-center items-center min-h-[300px]">
        <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
      </div>
    );
  }

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Auditoría de Solapamientos</h1>
        <p className="text-sm text-slate-500 mt-1">
          Períodos de servicio con fechas superpuestas. Elimina el período incorrecto directamente desde aquí.
        </p>
      </div>

      {/* Resumen */}
      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-4">
            <p className="text-xs font-semibold text-slate-500 uppercase">Funcionarios analizados</p>
            <p className="text-2xl font-bold text-slate-900 mt-1">{employees.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs font-semibold text-slate-500 uppercase">Períodos totales</p>
            <p className="text-2xl font-bold text-slate-900 mt-1">{servicePeriods.length}</p>
          </CardContent>
        </Card>
        <Card className={results.length > 0 ? 'border-red-200 bg-red-50' : 'border-emerald-200 bg-emerald-50'}>
          <CardContent className="p-4">
            <p className={`text-xs font-semibold uppercase ${results.length > 0 ? 'text-red-600' : 'text-emerald-600'}`}>
              Con solapamientos
            </p>
            <p className={`text-2xl font-bold mt-1 ${results.length > 0 ? 'text-red-900' : 'text-emerald-900'}`}>
              {results.length}
            </p>
          </CardContent>
        </Card>
      </div>

      {results.length === 0 ? (
        <Card className="border-emerald-200 bg-emerald-50">
          <CardContent className="p-6 text-center">
            <CheckCircle2 className="w-8 h-8 text-emerald-600 mx-auto mb-2" />
            <p className="text-emerald-700 font-semibold">¡Sin solapamientos detectados!</p>
            <p className="text-sm text-emerald-600 mt-1">Todos los períodos de servicio son consistentes.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          <p className="text-sm font-semibold text-red-700 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4" /> {results.length} funcionario(s) con períodos solapados
          </p>
          {results.map(({ emp, empId, overlaps }) => (
            <Card key={empId} className="border-red-200">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-red-800 flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  {emp?.full_name || empId}
                  <span className="text-xs text-red-500 font-normal">{emp?.rut}</span>
                  <Badge className="bg-red-100 text-red-700 ml-auto">{overlaps.length} solapamiento(s)</Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {overlaps.map((ov, idx) => (
                  <div key={idx} className="bg-red-50 border border-red-200 rounded p-3 text-xs space-y-2">
                    <p className="font-semibold text-red-700">Conflicto {idx + 1}:</p>
                    <div className="grid grid-cols-2 gap-2">
                      {[ov.a, ov.b].map((period) => (
                        <div key={period.id} className="bg-white rounded p-2 border border-red-100 space-y-1">
                          <p className="font-medium text-slate-700">{period.institution}</p>
                          <p className="text-slate-500">{period.period_type}</p>
                          <p className="text-slate-600 font-mono">{period.start_date} → {period.end_date || 'vigente'}</p>
                          <p className="text-slate-400">{period.days_count} días</p>
                          <Button
                            size="sm"
                            variant="destructive"
                            className="w-full h-7 text-[11px] mt-1"
                            disabled={deleting === period.id}
                            onClick={() => handleDelete(period)}
                          >
                            {deleting === period.id
                              ? <Loader2 className="w-3 h-3 animate-spin" />
                              : <><Trash2 className="w-3 h-3 mr-1" /> Eliminar este período</>
                            }
                          </Button>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}