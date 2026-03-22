import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Users, GraduationCap, FileText, TrendingUp, Clock, Bell } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Link } from 'react-router-dom';
import { checkPromotion, daysUntilClosure } from '@/components/calculations';
import { PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid } from 'recharts';

const CATEGORY_COLORS = {
  A: '#7C3AED', B: '#4F46E5', C: '#0EA5E9', D: '#10B981', E: '#F59E0B', F: '#6B7280',
};
const CATEGORY_LABELS = {
  A: 'Cat. A · Médicos', B: 'Cat. B · Profesionales', C: 'Cat. C', D: 'Cat. D', E: 'Cat. E', F: 'Cat. F',
};

function StatCard({ title, value, subtitle, icon: Icon, color }) {
  return (
    <Card className="relative overflow-hidden shadow-card">
      <div className={`absolute top-0 right-0 w-24 h-24 -mr-6 -mt-6 rounded-full opacity-10 ${color}`} />
      <CardContent className="p-6">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-sm font-medium text-slate-500">{title}</p>
            <p className="text-3xl font-bold mt-1 text-slate-900">{value}</p>
            {subtitle && <p className="text-xs text-slate-400 mt-1">{subtitle}</p>}
          </div>
          <div className={`p-2.5 rounded-xl ${color} bg-opacity-10`}>
            <Icon className={`w-5 h-5 ${color.replace('bg-', 'text-')}`} />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function Dashboard() {
  const { data: employees = [] } = useQuery({
    queryKey: ['employees'],
    queryFn: () => base44.entities.Employee.list(),
  });

  const { data: trainings = [] } = useQuery({
    queryKey: ['trainings'],
    queryFn: () => base44.entities.Training.list(),
  });

  const { data: resolutions = [] } = useQuery({
    queryKey: ['resolutions'],
    queryFn: () => base44.entities.Resolution.list(),
  });

  const activeEmployees = employees.filter(e => e.status === 'Activo');
  const pendingTrainings = trainings.filter(t => t.status === 'Pendiente');
  
  const promotionAlerts = employees.filter(emp => {
    if (!emp.current_level || !emp.total_points) return false;
    const promo = checkPromotion(emp.current_level, emp.total_points, emp.category);
    return promo.eligible;
  });

  const upcomingBienios = employees.filter(emp => {
    if (!emp.next_bienio_date) return false;
    const diff = new Date(emp.next_bienio_date) - new Date();
    return diff > 0 && diff < 90 * 24 * 60 * 60 * 1000;
  });

  // Datos para gráfico de distribución por categoría
  const categoryData = ['A', 'B', 'C', 'D', 'E', 'F']
    .map(cat => ({
      name: `Cat. ${cat}`,
      value: employees.filter(e => e.category === cat).length,
      color: CATEGORY_COLORS[cat],
    }))
    .filter(d => d.value > 0);

  // Datos para gráfico de barras por contrato
  const contractData = ['Planta', 'Plazo Fijo', 'Honorarios', 'Reemplazo'].map(ct => ({
    name: ct,
    cantidad: employees.filter(e => e.contract_type === ct).length,
  }));

  return (
    <div className="p-6 lg:p-8 max-w-7xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Panel de Control</h1>
        <p className="text-slate-500 text-sm mt-1">Sistema de Carrera Funcionaria — Ley 19.378</p>
      </div>

      {(() => {
        const days = daysUntilClosure();
        if (days === null) {
          return (
            <div className="mb-6 p-3 bg-red-50 border border-red-300 rounded-lg flex items-center gap-3 text-sm text-red-800">
              <Bell className="w-4 h-4 flex-shrink-0" />
              <span><strong>Periodo cerrado:</strong> La recepción de certificados de capacitación cerró el 31 de agosto. Los antecedentes ingresados aplican al siguiente año.</span>
            </div>
          );
        }
        if (days <= 30) {
          return (
            <div className="mb-6 p-3 bg-amber-50 border border-amber-300 rounded-lg flex items-center gap-3 text-sm text-amber-800">
              <Bell className="w-4 h-4 flex-shrink-0" />
              <span><strong>Cierre Anual en {days} días (31 agosto):</strong> Recordar a los funcionarios enviar sus certificados de capacitación antes del vencimiento del plazo.</span>
            </div>
          );
        }
        return null;
      })()}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatCard title="Funcionarios Activos" value={activeEmployees.length} subtitle="Dotación vigente" icon={Users} color="bg-indigo-500" />
        <StatCard title="Capacitaciones Pendientes" value={pendingTrainings.length} subtitle="Por validar" icon={GraduationCap} color="bg-amber-500" />
        <StatCard title="Alertas de Ascenso" value={promotionAlerts.length} subtitle="Cumplen puntaje" icon={TrendingUp} color="bg-emerald-500" />
        <StatCard title="Bienios Próximos" value={upcomingBienios.length} subtitle="En 90 días" icon={Clock} color="bg-blue-500" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-emerald-500" />
              Alertas de Ascenso
            </CardTitle>
          </CardHeader>
          <CardContent>
            {promotionAlerts.length === 0 ? (
              <p className="text-sm text-slate-400 py-4 text-center">Sin alertas de ascenso pendientes</p>
            ) : (
              <div className="space-y-3">
                {promotionAlerts.slice(0, 5).map(emp => {
                  const promo = checkPromotion(emp.current_level, emp.total_points, emp.category);
                  return (
                    <Link key={emp.id} to={`/EmployeeProfile?id=${emp.id}`} className="flex items-center justify-between p-3 rounded-lg bg-emerald-50 hover:bg-emerald-100 transition-colors">
                      <div>
                        <p className="text-sm font-medium text-slate-900">{emp.full_name}</p>
                        <p className="text-xs text-slate-500">Cat. {emp.category} — Nivel {emp.current_level}</p>
                      </div>
                      <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100">
                        → Nivel {promo.nextLevel}
                      </Badge>
                    </Link>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <Clock className="w-4 h-4 text-blue-500" />
              Bienios Próximos (90 días)
            </CardTitle>
          </CardHeader>
          <CardContent>
            {upcomingBienios.length === 0 ? (
              <p className="text-sm text-slate-400 py-4 text-center">Sin bienios próximos a cumplir</p>
            ) : (
              <div className="space-y-3">
                {upcomingBienios.slice(0, 5).map(emp => (
                  <Link key={emp.id} to={`/EmployeeProfile?id=${emp.id}`} className="flex items-center justify-between p-3 rounded-lg bg-blue-50 hover:bg-blue-100 transition-colors">
                    <div>
                      <p className="text-sm font-medium text-slate-900">{emp.full_name}</p>
                      <p className="text-xs text-slate-500">Bienio #{(emp.bienios_count || 0) + 1}</p>
                    </div>
                    <Badge variant="outline" className="text-blue-700 border-blue-200">
                      {emp.next_bienio_date}
                    </Badge>
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Gráfico de Torta: Distribución por Categoría */}
        <Card className="shadow-card">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <Users className="w-4 h-4 text-indigo-500" />
              Distribución por Categoría
            </CardTitle>
          </CardHeader>
          <CardContent>
            {categoryData.length === 0 ? (
              <p className="text-sm text-slate-400 py-4 text-center">Sin datos</p>
            ) : (
              <ResponsiveContainer width="100%" height={240}>
                <PieChart>
                  <Pie
                    data={categoryData}
                    cx="50%"
                    cy="50%"
                    innerRadius={55}
                    outerRadius={90}
                    paddingAngle={3}
                    dataKey="value"
                    label={({ name, value }) => `${name}: ${value}`}
                    labelLine={false}
                  >
                    {categoryData.map((entry, index) => (
                      <Cell key={index} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(v) => [`${v} funcionarios`]} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Gráfico de Barras: Por tipo de contrato */}
        <Card className="shadow-card">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <FileText className="w-4 h-4 text-indigo-500" />
              Funcionarios por Tipo de Contrato
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={contractData} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                <Tooltip formatter={(v) => [`${v} funcionarios`]} />
                <Bar dataKey="cantidad" fill="#4F46E5" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}