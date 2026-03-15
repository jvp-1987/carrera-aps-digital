import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Link } from 'react-router-dom';
import { TrendingUp, BookOpen, Clock, AlertTriangle } from 'lucide-react';
import { checkPromotion, calculateTrainingGap } from '@/components/calculations';

export default function Alerts() {
  const { data: employees = [], isLoading } = useQuery({
    queryKey: ['employees'],
    queryFn: () => base44.entities.Employee.list(),
  });

  const activeEmployees = employees.filter(e => e.status === 'Activo');

  // Alertas de ascenso
  const promotionAlerts = activeEmployees
    .map(emp => {
      const promo = checkPromotion(emp.current_level, emp.total_points || 0, emp.category);
      return { ...emp, promo };
    })
    .filter(e => e.promo.eligible);

  // Brecha de capacitación
  const trainingGapAlerts = activeEmployees
    .map(emp => {
      const gap = calculateTrainingGap(emp.current_level, emp.bienio_points || 0, emp.training_points || 0, emp.category);
      return { ...emp, gap };
    })
    .filter(e => e.gap.gap > 0)
    .sort((a, b) => a.gap.gap - b.gap.gap);

  // Bienios próximos (90 días)
  const bienioAlerts = activeEmployees.filter(emp => {
    if (!emp.next_bienio_date) return false;
    const diff = new Date(emp.next_bienio_date) - new Date();
    return diff > 0 && diff < 90 * 24 * 60 * 60 * 1000;
  });

  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-full py-20">
        <div className="w-8 h-8 border-4 border-slate-200 border-t-indigo-600 rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="p-6 lg:p-8 max-w-7xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-slate-900">Inteligencia de Datos</h1>
        <p className="text-slate-500 text-sm mt-1">Alertas proactivas de ascenso, brechas de capacitación y bienios</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
        <Card className="border-l-4 border-l-emerald-500">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 rounded-lg bg-emerald-100">
              <TrendingUp className="w-5 h-5 text-emerald-600" />
            </div>
            <div>
              <p className="text-xs text-slate-400">Aptos para Ascenso</p>
              <p className="text-2xl font-bold text-slate-900">{promotionAlerts.length}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-amber-500">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 rounded-lg bg-amber-100">
              <BookOpen className="w-5 h-5 text-amber-600" />
            </div>
            <div>
              <p className="text-xs text-slate-400">Con Brecha de Capacitación</p>
              <p className="text-2xl font-bold text-slate-900">{trainingGapAlerts.length}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-blue-500">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 rounded-lg bg-blue-100">
              <Clock className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <p className="text-xs text-slate-400">Bienios en 90 días</p>
              <p className="text-2xl font-bold text-slate-900">{bienioAlerts.length}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="space-y-8">
        {/* Promotion Alerts */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-emerald-500" />
              Alertas de Ascenso
            </CardTitle>
          </CardHeader>
          <CardContent>
            {promotionAlerts.length === 0 ? (
              <p className="text-sm text-slate-400 text-center py-6">Ningún funcionario cumple puntaje para ascender actualmente</p>
            ) : (
              <div className="space-y-3">
                {promotionAlerts.map(emp => (
                  <Link key={emp.id} to={`/EmployeeProfile?id=${emp.id}`} className="flex items-center justify-between p-4 rounded-lg bg-emerald-50 hover:bg-emerald-100 transition-colors border border-emerald-100">
                    <div>
                      <p className="font-semibold text-slate-900">{emp.full_name}</p>
                      <p className="text-xs text-slate-500 mt-0.5">
                        Cat. {emp.category} · Nivel actual: {emp.current_level} · Pts: {emp.total_points || 0}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge className="bg-emerald-600 text-white">
                        Apto → Nivel {emp.promo.nextLevel}
                      </Badge>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Training Gap */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <BookOpen className="w-4 h-4 text-amber-500" />
              Brecha de Capacitación
            </CardTitle>
          </CardHeader>
          <CardContent>
            {trainingGapAlerts.length === 0 ? (
              <p className="text-sm text-slate-400 text-center py-6">Todos los funcionarios cumplen con el puntaje mínimo</p>
            ) : (
              <div className="space-y-3">
                {trainingGapAlerts.slice(0, 20).map(emp => (
                  <Link key={emp.id} to={`/EmployeeProfile?id=${emp.id}`} className="flex items-center justify-between p-4 rounded-lg bg-amber-50 hover:bg-amber-100 transition-colors border border-amber-100">
                    <div>
                      <p className="font-semibold text-slate-900">{emp.full_name}</p>
                      <p className="text-xs text-slate-500 mt-0.5">
                        Cat. {emp.category} · Nivel {emp.current_level} · Exp: {emp.bienio_points || 0} pts · Cap: {emp.training_points || 0} pts
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge className="bg-amber-100 text-amber-700 border border-amber-200">
                        Faltan {emp.gap.gap} pts
                      </Badge>
                      <Badge variant="outline" className="text-xs">
                        → Nivel {emp.current_level - 1}
                      </Badge>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Upcoming Bienios */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Clock className="w-4 h-4 text-blue-500" />
              Bienios Próximos (90 días)
            </CardTitle>
          </CardHeader>
          <CardContent>
            {bienioAlerts.length === 0 ? (
              <p className="text-sm text-slate-400 text-center py-6">Sin bienios próximos a cumplir</p>
            ) : (
              <div className="space-y-3">
                {bienioAlerts.map(emp => {
                  const daysLeft = Math.ceil((new Date(emp.next_bienio_date) - new Date()) / (1000 * 60 * 60 * 24));
                  return (
                    <Link key={emp.id} to={`/EmployeeProfile?id=${emp.id}`} className="flex items-center justify-between p-4 rounded-lg bg-blue-50 hover:bg-blue-100 transition-colors border border-blue-100">
                      <div>
                        <p className="font-semibold text-slate-900">{emp.full_name}</p>
                        <p className="text-xs text-slate-500 mt-0.5">
                          Cat. {emp.category} · Bienio #{(emp.bienios_count || 0) + 1}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge className="bg-blue-100 text-blue-700 border border-blue-200">
                          En {daysLeft} días
                        </Badge>
                        <Badge variant="outline">{emp.next_bienio_date}</Badge>
                      </div>
                    </Link>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}