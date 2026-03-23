import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { AlertTriangle, CheckCircle2, Loader, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';

export default function DataAudit() {

  const { data: employees = [], isLoading: empLoading } = useQuery({
    queryKey: ['employees-audit'],
    queryFn: () => base44.entities.Employee.list('-created_date', 2000),
  });

  const { data: servicePeriods = [] } = useQuery({
    queryKey: ['service-periods-audit'],
    queryFn: () => base44.entities.ServicePeriod.list(null, 5000),
  });

  const { data: trainings = [] } = useQuery({
    queryKey: ['trainings-audit'],
    queryFn: () => base44.entities.Training.list(null, 5000),
  });

  const isLoading = empLoading;

  // Agrupar por empleado
  const employeeServiceMap = {};
  const employeeTrainingMap = {};

  servicePeriods.forEach(sp => {
    if (!employeeServiceMap[sp.employee_id]) employeeServiceMap[sp.employee_id] = [];
    employeeServiceMap[sp.employee_id].push(sp);
  });

  trainings.forEach(t => {
    if (!employeeTrainingMap[t.employee_id]) employeeTrainingMap[t.employee_id] = [];
    employeeTrainingMap[t.employee_id].push(t);
  });

  // Analizar
  const noExperience = employees.filter(e => !employeeServiceMap[e.id]);
  const noTraining = employees.filter(e => !employeeTrainingMap[e.id]);
  const noEither = employees.filter(e => !employeeServiceMap[e.id] && !employeeTrainingMap[e.id]);

  if (isLoading) {
    return (
      <div className="p-6 flex justify-center items-center min-h-screen">
        <Loader className="w-6 h-6 animate-spin text-slate-400" />
      </div>
    );
  }

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Auditoría de Datos</h1>
          <p className="text-sm text-slate-500 mt-1">Funcionarios sin información de experiencia o capacitación</p>
        </div>
        <div className="flex flex-col items-end gap-1">
          <Button variant="outline" onClick={handleRecalcularDias} disabled={recalculating} className="flex items-center gap-2">
            <RefreshCw className={`w-4 h-4 ${recalculating ? 'animate-spin' : ''}`} />
            {recalculating ? `Recalculando... ${recalcProgress.current}/${recalcProgress.total}` : 'Recalcular días de períodos'}
          </Button>
          {recalculating && recalcProgress.total > 0 && (
            <div className="w-48 h-1.5 bg-slate-200 rounded-full overflow-hidden">
              <div
                className="h-full bg-indigo-500 rounded-full transition-all"
                style={{ width: `${(recalcProgress.current / recalcProgress.total) * 100}%` }}
              />
            </div>
          )}
        </div>
      </div>

      {/* Resumen */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <p className="text-xs font-semibold text-slate-500 uppercase">Total</p>
            <p className="text-2xl font-bold text-slate-900 mt-1">{employees.length}</p>
          </CardContent>
        </Card>
        <Card className="border-red-200 bg-red-50">
          <CardContent className="p-4">
            <p className="text-xs font-semibold text-red-600 uppercase">Sin experiencia</p>
            <p className="text-2xl font-bold text-red-900 mt-1">{noExperience.length}</p>
          </CardContent>
        </Card>
        <Card className="border-orange-200 bg-orange-50">
          <CardContent className="p-4">
            <p className="text-xs font-semibold text-orange-600 uppercase">Sin capacitación</p>
            <p className="text-2xl font-bold text-orange-900 mt-1">{noTraining.length}</p>
          </CardContent>
        </Card>
        <Card className="border-rose-200 bg-rose-50">
          <CardContent className="p-4">
            <p className="text-xs font-semibold text-rose-600 uppercase">Sin ambos</p>
            <p className="text-2xl font-bold text-rose-900 mt-1">{noEither.length}</p>
          </CardContent>
        </Card>
      </div>

      {/* Sin experiencia */}
      {noExperience.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2 text-red-700">
              <AlertTriangle className="w-4 h-4" /> Sin períodos de servicio ({noExperience.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {noExperience.map(emp => (
                <div key={emp.id} className="flex items-center justify-between p-2 bg-slate-50 rounded text-sm">
                  <div>
                    <p className="font-medium text-slate-900">{emp.full_name}</p>
                    <p className="text-xs text-slate-500">{emp.rut}</p>
                  </div>
                  <Badge className="bg-red-100 text-red-700">{emp.category}</Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Sin capacitación */}
      {noTraining.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2 text-orange-700">
              <AlertTriangle className="w-4 h-4" /> Sin capacitación ({noTraining.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {noTraining.map(emp => (
                <div key={emp.id} className="flex items-center justify-between p-2 bg-slate-50 rounded text-sm">
                  <div>
                    <p className="font-medium text-slate-900">{emp.full_name}</p>
                    <p className="text-xs text-slate-500">{emp.rut}</p>
                  </div>
                  <Badge className="bg-orange-100 text-orange-700">{emp.category}</Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Sin ambos */}
      {noEither.length > 0 && (
        <Card className="border-rose-300 bg-rose-50">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2 text-rose-700">
              <AlertTriangle className="w-4 h-4" /> Crítico: Sin experiencia ni capacitación ({noEither.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {noEither.map(emp => (
                <div key={emp.id} className="flex items-center justify-between p-2 bg-white rounded text-sm border border-rose-200">
                  <div>
                    <p className="font-bold text-rose-900">{emp.full_name}</p>
                    <p className="text-xs text-rose-700">{emp.rut}</p>
                  </div>
                  <Badge className="bg-rose-200 text-rose-900">{emp.category}</Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {noExperience.length === 0 && noTraining.length === 0 && (
        <Card className="border-emerald-200 bg-emerald-50">
          <CardContent className="p-6 text-center">
            <CheckCircle2 className="w-8 h-8 text-emerald-600 mx-auto mb-2" />
            <p className="text-emerald-700 font-semibold">¡Excelente!</p>
            <p className="text-sm text-emerald-600 mt-1">Todos los funcionarios tienen información de experiencia y capacitación.</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}