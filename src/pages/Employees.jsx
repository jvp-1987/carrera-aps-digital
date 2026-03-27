import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useEmployees } from '@/hooks/useEmployees';
import { logger } from '@/lib/logger';
import StatsCards from '@/components/employees/StatsCards';
import ViewToggle from '@/components/employees/ViewToggle';
import SearchFiltersBar from '@/components/employees/SearchFiltersBar';
import DuplicatesPanel from '@/components/employees/DuplicatesPanel';
import { categoryLabels, categoryColors, normalizeRUT } from '@/components/employees/categoryUtils';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Download } from 'lucide-react';

import EmployeeTableView from '@/components/employees/EmployeeTableView';
import EmployeeGroupView from '@/components/employees/EmployeeGroupView';

export default function Employees() {
  const navigate = useNavigate();
  const { data: employees = [], isLoading, isError, error } = useEmployees();
  
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [departmentFilter, setDepartmentFilter] = useState('all');
  const [viewMode, setViewMode] = useState('table');
  const [hideInactive, setHideInactive] = useState(false);

  // Logging
  logger.info(`Employees page loaded with ${employees.length} employees`);

  // Departamentos únicos
  const departments = useMemo(() => {
    return [...new Set(employees.map(e => e.department).filter(Boolean))].sort();
  }, [employees]);

  // Filtrar empleados
  const filteredEmployees = useMemo(() => {
    return employees.filter(emp => {
      if (hideInactive && emp.status === 'Inactivo') return false;
      
      const matchesSearch = !search || 
        emp.full_name?.toLowerCase().includes(search.toLowerCase()) ||
        normalizeRUT(emp.rut)?.includes(normalizeRUT(search));
      
      const matchesCategory = categoryFilter === 'all' || emp.category === categoryFilter;
      const matchesStatus = statusFilter === 'all' || emp.status === statusFilter;
      const matchesDepartment = departmentFilter === 'all' || emp.department === departmentFilter;
      
      return matchesSearch && matchesCategory && matchesStatus && matchesDepartment;
    });
  }, [employees, search, categoryFilter, statusFilter, departmentFilter, hideInactive]);

  // Estadísticas
  const stats = useMemo(() => {
    const activeCount = employees.filter(e => e.status === 'Activo').length;
    const categories = Object.entries(categoryLabels)
      .map(([cat, label]) => ({
        cat,
        label,
        count: employees.filter(e => e.category === cat).length
      }))
      .filter(c => c.count > 0);
    
    return {
      total: employees.length,
      active: activeCount,
      categories
    };
  }, [employees]);

  // Agrupar por categoría
  const groupedByCategory = useMemo(() => {
    const groups = {};
    filteredEmployees.forEach(emp => {
      if (!groups[emp.category]) groups[emp.category] = [];
      groups[emp.category].push(emp);
    });
    return groups;
  }, [filteredEmployees]);

  const handleExportExcel = () => {
    const headers = ['Nombre','RUT','Categoría','Cargo','Establecimiento','Estado','Tipo Contrato','Nivel Actual','Puntos Capacitación','Puntaje Total','Bienios'];
    const rows = filteredEmployees.map(emp => [
      emp.full_name || '',
      emp.rut || '',
      emp.category || '',
      emp.position || '',
      emp.department || '',
      emp.status || '',
      emp.contract_type || '',
      emp.current_level || '',
      emp.training_points || '0',
      emp.total_points || '',
      emp.bienios_count || '',
    ]);
    const csv = [headers, ...rows].map(r => r.map(v => `"${String(v).replace(/"/g,'""')}"`).join(',')).join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `funcionarios_${new Date().toISOString().slice(0,10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Handlers
  const handleDelete = async (emp) => {
    logger.info(`Deleting employee: ${emp.id}`);
    await base44.entities.Employee.delete(emp.id);
    logger.info(`Employee deleted successfully: ${emp.id}`);
  };

  // Loading state
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100">
        <div className="text-center">
          <div className="w-12 h-12 rounded-full border-4 border-indigo-200 border-t-indigo-600 animate-spin mx-auto mb-4" />
          <p className="text-slate-600 font-medium">Cargando funcionarios...</p>
        </div>
      </div>
    );
  }

  // Error state
  if (isError) {
    logger.error('Error loading employees', error);
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100">
        <div className="text-center max-w-md">
          <div className="bg-red-100 rounded-full w-16 h-16 flex items-center justify-center mx-auto mb-4">
            <span className="text-2xl">⚠️</span>
          </div>
          <p className="text-red-700 font-semibold">Error cargando empleados</p>
          <p className="text-red-600 text-sm mt-2">{error?.message}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50 pt-8 px-4 sm:px-6 lg:px-8 pb-12">
      <motion.div 
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="max-w-7xl mx-auto"
      >
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-4xl sm:text-5xl font-black bg-gradient-to-r from-indigo-600 via-purple-600 to-pink-600 bg-clip-text text-transparent mb-2">
            Funcionarios
          </h1>
          <p className="text-slate-600">Gestión y seguimiento del personal</p>
        </div>

        {/* Stats */}
        <StatsCards stats={stats} />

        {/* Filters & View Toggle */}
        <div className="mt-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <SearchFiltersBar
            search={search}
            onSearchChange={setSearch}
            categoryFilter={categoryFilter}
            onCategoryChange={setCategoryFilter}
            statusFilter={statusFilter}
            onStatusChange={setStatusFilter}
            departmentFilter={departmentFilter}
            onDepartmentChange={setDepartmentFilter}
            departments={departments}
          />
          <ViewToggle viewMode={viewMode} onViewChange={setViewMode} />
        </div>

        {/* Duplicates Panel */}
        <div className="mt-8">
          <DuplicatesPanel employees={filteredEmployees} onDelete={handleDelete} />
        </div>

        {/* Results */}
        <div className="mt-8">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-2xl font-bold text-slate-900">
                {viewMode === 'table' ? 'Lista de Funcionarios' : 'Agrupado por Categoría'}
              </h2>
              <p className="text-slate-500 text-sm mt-1">
                {filteredEmployees.length} de {employees.length} funcionarios
              </p>
            </div>
            <div className="flex items-center gap-4">
              <Button
                variant="outline"
                size="sm"
                onClick={handleExportExcel}
                className="flex items-center gap-2"
              >
                <Download className="w-4 h-4" />
                Exportar Excel
              </Button>
              <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={hideInactive}
                onChange={e => setHideInactive(e.target.checked)}
                className="w-5 h-5 rounded border-slate-300 text-indigo-600"
              />
              <span className="text-sm text-slate-600 font-medium">Ocultar inactivos</span>
            </label>
            </div>
          </div>

          {/* Table View */}
          {viewMode === 'table' && (
            <EmployeeTableView employees={filteredEmployees} />
          )}

          {/* Group View */}
          {viewMode === 'group' && (
            <EmployeeGroupView employees={filteredEmployees} />
          )}

          {filteredEmployees.length === 0 && (
            <div className="text-center py-12">
              <p className="text-slate-500 text-lg">No se encontraron funcionarios</p>
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
}