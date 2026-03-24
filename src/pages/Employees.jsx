import { useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import { useEmployees } from '@/hooks/useEmployees';
import { logger } from '@/lib/logger';
import StatsCards from '@/components/employees/StatsCards';
import ViewToggle from '@/components/employees/ViewToggle';
import SearchFiltersBar from '@/components/employees/SearchFiltersBar';
import DuplicatesPanel from '@/components/employees/DuplicatesPanel';
import { categoryLabels, categoryColors, normalizeRUT } from '@/components/employees/categoryUtils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';

export default function Employees() {
  const { data: employees = [], isLoading, isError, error } = useEmployees();
  
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [departmentFilter, setDepartmentFilter] = useState('all');
  const [viewMode, setViewMode] = useState('table');
  const [hideInactive, setHideInactive] = useState(true);

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
        emp.name?.toLowerCase().includes(search.toLowerCase()) ||
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

  // Handlers
  const handleDelete = async (emp) => {
    try {
      logger.info(`Deleting employee: ${emp.id}`);
      await emp.delete();
      logger.info(`Employee deleted successfully: ${emp.id}`);
    } catch (error) {
      logger.error(`Failed to delete employee: ${emp.id}`, error);
    }
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

          {/* Table View */}
          {viewMode === 'table' && (
            <div className="bg-white rounded-xl shadow-lg overflow-hidden border border-slate-200">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-slate-50 border-b border-slate-200">
                    <tr>
                      <th className="text-left px-6 py-4 font-semibold text-slate-900 text-sm">Funcionario</th>
                      <th className="text-left px-6 py-4 font-semibold text-slate-900 text-sm">RUT</th>
                      <th className="text-left px-6 py-4 font-semibold text-slate-900 text-sm">Categoría</th>
                      <th className="text-left px-6 py-4 font-semibold text-slate-900 text-sm">Estado</th>
                      <th className="text-left px-6 py-4 font-semibold text-slate-900 text-sm">Establecimiento</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredEmployees.map((emp, idx) => (
                      <motion.tr
                        key={emp.id}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ delay: idx * 0.02 }}
                        className="border-b border-slate-200 hover:bg-slate-50 transition-colors"
                      >
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-3">
                            <Avatar className="w-8 h-8">
                              <AvatarFallback>{emp.name?.charAt(0)}</AvatarFallback>
                            </Avatar>
                            <span className="font-medium text-slate-900">{emp.name}</span>
                          </div>
                        </td>
                        <td className="px-6 py-4 text-slate-600 font-mono text-sm">{emp.rut}</td>
                        <td className="px-6 py-4">
                          <Badge className={categoryColors[emp.category]}>
                            {emp.category} — {categoryLabels[emp.category]}
                          </Badge>
                        </td>
                        <td className="px-6 py-4">
                          <Badge variant={emp.status === 'Activo' ? 'default' : 'secondary'}>
                            {emp.status}
                          </Badge>
                        </td>
                        <td className="px-6 py-4 text-slate-600 text-sm">{emp.department}</td>
                      </motion.tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Group View */}
          {viewMode === 'group' && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {Object.entries(groupedByCategory).map(([cat, emps]) => (
                <motion.div
                  key={cat}
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ duration: 0.3 }}
                >
                  <Card className="border-none shadow-lg hover:shadow-xl transition-shadow">
                    <CardHeader className={`${categoryColors[cat]} rounded-t-xl`}>
                      <CardTitle className="text-lg">
                        {cat} — {categoryLabels[cat]}
                      </CardTitle>
                      <p className="text-sm opacity-75 mt-1">{emps.length} funcionarios</p>
                    </CardHeader>
                    <CardContent className="p-4">
                      <div className="space-y-2">
                        {emps.map(emp => (
                          <div key={emp.id} className="flex items-center gap-2 p-2 hover:bg-slate-50 rounded-lg">
                            <Avatar className="w-6 h-6 shrink-0">
                              <AvatarFallback className="text-xs">{emp.name?.charAt(0)}</AvatarFallback>
                            </Avatar>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-slate-900 truncate">{emp.name}</p>
                              <p className="text-xs text-slate-500">{emp.rut}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>
              ))}
            </div>
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