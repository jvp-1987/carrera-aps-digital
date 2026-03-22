import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Link } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Search, Plus, Users, Download, LayoutGrid, Table, Layers } from 'lucide-react';
import EmployeeCardView from '@/components/employees/EmployeeCardView';
import EmployeeTableView from '@/components/employees/EmployeeTableView';
import EmployeeGroupView from '@/components/employees/EmployeeGroupView';

const categoryLabels = {
  A: 'Médicos',
  B: 'Profesionales',
  C: 'Técnicos',
  D: 'Técnicos Salud',
  E: 'Administrativos',
  F: 'Auxiliares',
};

const categoryColors = {
  A: 'bg-violet-100 text-violet-700',
  B: 'bg-blue-100 text-blue-700',
  C: 'bg-teal-100 text-teal-700',
  D: 'bg-cyan-100 text-cyan-700',
  E: 'bg-orange-100 text-orange-700',
  F: 'bg-slate-100 text-slate-700',
};

export default function Employees() {
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [viewMode, setViewMode] = useState('cards'); // 'cards' | 'table' | 'group'

  const exportToExcel = () => {
    const headers = ['RUT', 'Nombre', 'Categoría', 'Cargo', 'Unidad', 'Nivel Actual', 'Bienios', 'Pts. Bienio', 'Pts. Capacitación', 'Puntaje Total', 'Estado', 'Tipo Contrato', 'Fecha Ingreso'];
    const rows = employees.map(e => [
      e.rut || '',
      e.full_name || '',
      e.category || '',
      e.position || '',
      e.department || '',
      e.current_level ?? '',
      e.bienios_count ?? 0,
      e.bienio_points ?? 0,
      e.training_points ?? 0,
      e.total_points ?? 0,
      e.status || '',
      e.contract_type || '',
      e.hire_date || '',
    ]);

    const csvContent = [headers, ...rows]
      .map(row => row.map(v => `"${String(v).replace(/"/g, '""')}"`).join(','))
      .join('\n');

    const bom = '\uFEFF';
    const blob = new Blob([bom + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `funcionarios_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const { data: employees = [], isLoading } = useQuery({
    queryKey: ['employees'],
    queryFn: () => base44.entities.Employee.list(),
  });

  const filtered = employees.filter(e => {
    const matchSearch = !search || 
      e.full_name?.toLowerCase().includes(search.toLowerCase()) ||
      e.rut?.includes(search);
    const matchCategory = categoryFilter === 'all' || e.category === categoryFilter;
    const matchStatus = statusFilter === 'all' || e.status === statusFilter;
    return matchSearch && matchCategory && matchStatus;
  });

  return (
    <div className="p-6 lg:p-8 max-w-7xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Funcionarios</h1>
          <p className="text-slate-500 text-sm mt-1">{employees.length} registrados en el sistema</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <div className="flex border rounded-md overflow-hidden">
            {[
              { mode: 'cards', icon: LayoutGrid, label: 'Tarjetas' },
              { mode: 'table', icon: Table, label: 'Tabla' },
              { mode: 'group', icon: Layers, label: 'Grupos' },
            ].map(({ mode, icon: Icon, label }) => (
              <button
                key={mode}
                onClick={() => setViewMode(mode)}
                title={label}
                className={`px-3 py-2 flex items-center gap-1.5 text-xs font-medium transition-colors ${viewMode === mode ? 'bg-indigo-600 text-white' : 'bg-white text-slate-600 hover:bg-slate-50'}`}
              >
                <Icon className="w-3.5 h-3.5" /> {label}
              </button>
            ))}
          </div>
          <Button variant="outline" onClick={exportToExcel} className="flex items-center gap-2">
            <Download className="w-4 h-4" /> Exportar
          </Button>
          <Link to="/EmployeeForm">
            <Button className="bg-indigo-600 hover:bg-indigo-700">
              <Plus className="w-4 h-4 mr-2" />
              Nuevo
            </Button>
          </Link>
        </div>
      </div>

      <Card className="mb-6">
        <CardContent className="p-4">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <Input
                placeholder="Buscar por nombre o RUT..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="pl-10"
              />
            </div>
            <Select value={categoryFilter} onValueChange={setCategoryFilter}>
              <SelectTrigger className="w-full sm:w-44">
                <SelectValue placeholder="Categoría" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas las Cat.</SelectItem>
                {Object.entries(categoryLabels).map(([k, v]) => (
                  <SelectItem key={k} value={k}>{k} — {v}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-full sm:w-36">
                <SelectValue placeholder="Estado" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="Activo">Activo</SelectItem>
                <SelectItem value="Inactivo">Inactivo</SelectItem>
                <SelectItem value="Licencia">Licencia</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {isLoading ? (
        <div className="flex justify-center py-20">
          <div className="w-8 h-8 border-4 border-slate-200 border-t-indigo-600 rounded-full animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-20">
          <Users className="w-12 h-12 text-slate-300 mx-auto mb-3" />
          <p className="text-slate-500">No se encontraron funcionarios</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map(emp => (
            <Link key={emp.id} to={`/EmployeeProfile?id=${emp.id}`}>
              <Card className="hover:shadow-md transition-shadow cursor-pointer border-slate-200 hover:border-indigo-200">
                <CardContent className="p-5">
                  <div className="flex items-start gap-4">
                    <div className="w-11 h-11 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-700 font-semibold text-sm flex-shrink-0">
                      {emp.full_name?.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-slate-900 truncate">{emp.full_name}</p>
                      <p className="text-xs text-slate-500 mt-0.5">{emp.rut} — {emp.position || 'Sin cargo'}</p>
                      <div className="flex items-center gap-2 mt-2 flex-wrap">
                        <Badge className={`${categoryColors[emp.category] || 'bg-slate-100 text-slate-600'} text-[10px] px-2`}>
                          Cat. {emp.category}
                        </Badge>
                        <Badge variant="outline" className="text-[10px] px-2">
                          Nivel {emp.current_level || '—'}
                        </Badge>
                        <Badge className={`text-[10px] px-2 ${emp.status === 'Activo' ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>
                          {emp.status || 'Activo'}
                        </Badge>
                      </div>
                    </div>
                  </div>
                  <div className="mt-3 pt-3 border-t border-slate-100 grid grid-cols-3 gap-2 text-center">
                    <div>
                      <p className="text-xs text-slate-400">Bienios</p>
                      <p className="text-sm font-semibold text-slate-700">{emp.bienios_count || 0}</p>
                    </div>
                    <div>
                      <p className="text-xs text-slate-400">Pts. Exp.</p>
                      <p className="text-sm font-semibold text-slate-700">{emp.bienio_points || 0}</p>
                    </div>
                    <div>
                      <p className="text-xs text-slate-400">Pts. Cap.</p>
                      <p className="text-sm font-semibold text-slate-700">{emp.training_points || 0}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}