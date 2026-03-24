import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Search } from 'lucide-react';
import { motion } from 'framer-motion';
import { categoryLabels } from './categoryUtils';

export default function SearchFiltersBar({ 
  search, 
  onSearchChange, 
  categoryFilter, 
  onCategoryChange,
  statusFilter,
  onStatusChange,
  departmentFilter,
  onDepartmentChange,
  departments
}) {
  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.2 }}
      className="sticky top-4 z-30"
    >
      <div className="bg-white/70 backdrop-blur-xl border border-white/50 shadow-lg rounded-2xl overflow-hidden p-4 sm:p-5 transition-all">
        <div className="flex flex-col sm:flex-row gap-4 items-center">
          <div className="relative flex-1 w-full">
            <Search className="w-5 h-5 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <Input
              placeholder="Buscar por nombre o RUT..."
              value={search}
              onChange={e => onSearchChange(e.target.value)}
              className="pl-11 h-11 bg-white/80 border-slate-200 focus:bg-white rounded-xl shadow-sm text-[15px] focus:ring-indigo-500 focus:border-indigo-500 transition-all"
            />
          </div>
          <div className="flex gap-3 w-full sm:w-auto">
            <Select value={categoryFilter} onValueChange={onCategoryChange}>
              <SelectTrigger className="w-full sm:w-44 h-11 bg-white/80 border-slate-200 focus:bg-white rounded-xl shadow-sm">
                <SelectValue placeholder="Categoría" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas las Cat.</SelectItem>
                {Object.entries(categoryLabels).map(([k, v]) => (
                  <SelectItem key={k} value={k}>{k} — {v}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={statusFilter} onValueChange={onStatusChange}>
              <SelectTrigger className="w-full sm:w-48 h-11 bg-white/80 border-slate-200 focus:bg-white rounded-xl shadow-sm">
                <SelectValue placeholder="Estado" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos los estados</SelectItem>
                <SelectItem value="Activo">✓ Activo</SelectItem>
                <SelectItem value="Inactivo">✗ Inactivo (No pertenece)</SelectItem>
                <SelectItem value="Licencia">📋 Licencia</SelectItem>
              </SelectContent>
            </Select>

            <Select value={departmentFilter} onValueChange={onDepartmentChange}>
              <SelectTrigger className="w-full sm:w-56 h-11 bg-white/80 border-slate-200 focus:bg-white rounded-xl shadow-sm">
                <SelectValue placeholder="Establecimiento" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos los establ.</SelectItem>
                {departments.map(d => (
                  <SelectItem key={d} value={d}>{d}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>
    </motion.div>
  );
}