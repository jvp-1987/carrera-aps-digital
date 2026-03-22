import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Link } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Search, Plus, Users, Download, Table, Layers, AlertTriangle, ChevronDown, ChevronRight, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
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

function normalizeRUT(rut) {
  return (rut || '').toString().replace(/\./g, '').replace(/,/g, '').replace(/\s/g, '').trim().toUpperCase();
}

function DuplicatesPanel({ employees, onDelete }) {
  const [open, setOpen] = useState(false);
  const [deleting, setDeleting] = useState(null);

  // Detectar duplicados por RUT normalizado
  const rutMap = {};
  employees.forEach(e => {
    const key = normalizeRUT(e.rut);
    if (!key) return;
    if (!rutMap[key]) rutMap[key] = [];
    rutMap[key].push(e);
  });

  // Detectar duplicados por nombre (normalizado)
  const nameMap = {};
  employees.forEach(e => {
    const key = (e.full_name || '').trim().toLowerCase();
    if (!key) return;
    if (!nameMap[key]) nameMap[key] = [];
    nameMap[key].push(e);
  });

  const rutDupes = Object.values(rutMap).filter(g => g.length > 1);
  const nameDupes = Object.values(nameMap).filter(g => g.length > 1);
  const total = rutDupes.length + nameDupes.length;

  const handleDelete = async (emp) => {
    if (!confirm(`¿Eliminar a "${emp.full_name}" (${emp.rut})? Esta acción no se puede deshacer.`)) return;
    setDeleting(emp.id);
    await base44.entities.Employee.delete(emp.id);
    setDeleting(null);
    toast.success(`"${emp.full_name}" eliminado`);
    onDelete();
  };

  if (total === 0) return null;

  return (
    <div className="mb-5 border border-amber-300 rounded-lg overflow-hidden">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-4 py-3 bg-amber-50 hover:bg-amber-100 transition-colors text-left"
      >
        <div className="flex items-center gap-2 text-amber-800 font-semibold text-sm">
          <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0" />
          {total} grupo{total !== 1 ? 's' : ''} de funcionarios duplicados detectados
          {rutDupes.length > 0 && <span className="text-xs font-normal text-amber-600">({rutDupes.length} por RUT{nameDupes.length > 0 ? `, ${nameDupes.length} por nombre` : ''})</span>}
        </div>
        {open ? <ChevronDown className="w-4 h-4 text-amber-500" /> : <ChevronRight className="w-4 h-4 text-amber-500" />}
      </button>

      {open && (
        <div className="bg-white divide-y divide-slate-100 px-4 py-3 space-y-4">
          {rutDupes.map((group, i) => (
            <div key={`rut-${i}`}>
              <p className="text-xs font-semibold text-red-600 mb-1">RUT duplicado: {group[0].rut}</p>
              <div className="space-y-1">
                {group.map(e => (
                  <div key={e.id} className="flex items-center justify-between gap-3">
                    <Link to={`/EmployeeProfile?id=${e.id}`} className="flex items-center gap-3 text-sm text-slate-700 hover:text-indigo-600 hover:underline">
                      <span className="font-medium">{e.full_name}</span>
                      <span className="text-xs text-slate-400">Cat. {e.category} · Niv. {e.current_level} · {e.status}</span>
                    </Link>
                    <button
                      onClick={() => handleDelete(e)}
                      disabled={deleting === e.id}
                      className="text-red-400 hover:text-red-600 disabled:opacity-40 p-1"
                      title="Eliminar este duplicado"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          ))}
          {nameDupes.map((group, i) => (
            <div key={`name-${i}`}>
              <p className="text-xs font-semibold text-orange-600 mb-1">Nombre duplicado: {group[0].full_name}</p>
              <div className="space-y-1">
                {group.map(e => (
                  <div key={e.id} className="flex items-center justify-between gap-3">
                    <Link to={`/EmployeeProfile?id=${e.id}`} className="flex items-center gap-3 text-sm text-slate-700 hover:text-indigo-600 hover:underline">
                      <span className="font-medium">{e.rut}</span>
                      <span className="text-xs text-slate-400">Cat. {e.category} · Niv. {e.current_level} · {e.status}</span>
                    </Link>
                    <button
                      onClick={() => handleDelete(e)}
                      disabled={deleting === e.id}
                      className="text-red-400 hover:text-red-600 disabled:opacity-40 p-1"
                      title="Eliminar este duplicado"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function Employees() {
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [departmentFilter, setDepartmentFilter] = useState('all');
  const [viewMode, setViewMode] = useState('table'); // 'table' | 'group'

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

  const queryClient = useQueryClient();

  const { data: employees = [], isLoading } = useQuery({
    queryKey: ['employees'],
    queryFn: () => base44.entities.Employee.list(),
  });

  // Lista única de establecimientos
  const departments = [...new Set(employees.map(e => e.department).filter(Boolean))].sort();

  const filtered = employees.filter(e => {
    const matchSearch = !search || 
      e.full_name?.toLowerCase().includes(search.toLowerCase()) ||
      e.rut?.includes(search);
    const matchCategory = categoryFilter === 'all' || e.category === categoryFilter;
    const matchStatus = statusFilter === 'all' || e.status === statusFilter;
    const matchDept = departmentFilter === 'all' || e.department === departmentFilter;
    return matchSearch && matchCategory && matchStatus && matchDept;
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

      <DuplicatesPanel employees={employees} onDelete={() => queryClient.invalidateQueries({ queryKey: ['employees'] })} />

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
        viewMode === 'cards' ? <EmployeeCardView employees={filtered} /> :
        viewMode === 'table' ? <EmployeeTableView employees={filtered} /> :
        <EmployeeGroupView employees={filtered} />
      )}
    </div>
  );
}