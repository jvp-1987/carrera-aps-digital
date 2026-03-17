import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { FileText, Search, Plus, Upload } from 'lucide-react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';

const statusColors = {
  'Borrador': 'bg-slate-100 text-slate-600',
  'Firmada': 'bg-blue-100 text-blue-700',
  'Publicada': 'bg-emerald-100 text-emerald-700',
};

const EMPTY_FORM = {
  resolution_number: '', resolution_date: '', type: 'Otro', status: 'Borrador',
  description: '', employee_ids: [], previous_level: '', new_level: '', file_url: '',
};

const typeColors = {
  'Cambio de Nivel': 'bg-indigo-100 text-indigo-700',
  'Reconocimiento de Bienio': 'bg-emerald-100 text-emerald-700',
  'Asignación de Postítulo': 'bg-violet-100 text-violet-700',
  'Contrato': 'bg-blue-100 text-blue-700',
  'Desvinculación': 'bg-red-100 text-red-700',
  'Otro': 'bg-slate-100 text-slate-700',
};

export default function Resolutions() {
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');

  const { data: resolutions = [], isLoading } = useQuery({
    queryKey: ['all-resolutions'],
    queryFn: () => base44.entities.Resolution.list('-resolution_date', 200),
  });

  const { data: employees = [] } = useQuery({
    queryKey: ['employees'],
    queryFn: () => base44.entities.Employee.list(),
  });

  const employeeMap = {};
  employees.forEach(e => { employeeMap[e.id] = e; });

  const filtered = resolutions.filter(r => {
    const emp = employeeMap[r.employee_id];
    const matchSearch = !search || 
      r.resolution_number?.toLowerCase().includes(search.toLowerCase()) ||
      emp?.full_name?.toLowerCase().includes(search.toLowerCase());
    const matchType = typeFilter === 'all' || r.type === typeFilter;
    return matchSearch && matchType;
  });

  return (
    <div className="p-6 lg:p-8 max-w-7xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Resoluciones</h1>
        <p className="text-slate-500 text-sm mt-1">Registro de actos administrativos con trazabilidad documental</p>
      </div>

      <Card className="mb-6">
        <CardContent className="p-4 flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <Input placeholder="Buscar por N° resolución o funcionario..." value={search} onChange={e => setSearch(e.target.value)} className="pl-10" />
          </div>
          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className="w-full sm:w-52"><SelectValue placeholder="Tipo" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos los tipos</SelectItem>
              <SelectItem value="Cambio de Nivel">Cambio de Nivel</SelectItem>
              <SelectItem value="Reconocimiento de Bienio">Reconocimiento de Bienio</SelectItem>
              <SelectItem value="Asignación de Postítulo">Asignación de Postítulo</SelectItem>
              <SelectItem value="Contrato">Contrato</SelectItem>
              <SelectItem value="Desvinculación">Desvinculación</SelectItem>
              <SelectItem value="Otro">Otro</SelectItem>
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      {isLoading ? (
        <div className="flex justify-center py-16">
          <div className="w-8 h-8 border-4 border-slate-200 border-t-indigo-600 rounded-full animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16">
          <FileText className="w-12 h-12 text-slate-300 mx-auto mb-3" />
          <p className="text-slate-500">No se encontraron resoluciones</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(r => {
            const emp = employeeMap[r.employee_id];
            return (
              <Card key={r.id} className="hover:shadow-sm transition-shadow">
                <CardContent className="p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-slate-100">
                      <FileText className="w-4 h-4 text-slate-600" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-slate-900">Res. N° {r.resolution_number}</p>
                      <p className="text-xs text-slate-500">
                        {emp ? (
                          <Link to={`/EmployeeProfile?id=${emp.id}`} className="text-indigo-600 hover:underline">{emp.full_name}</Link>
                        ) : '—'} — {r.resolution_date} — {r.description || 'Sin descripción'}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge className={typeColors[r.type] || 'bg-slate-100 text-slate-700'}>{r.type}</Badge>
                    {r.type === 'Cambio de Nivel' && r.new_level && (
                      <Badge variant="outline">Nivel {r.previous_level} → {r.new_level}</Badge>
                    )}
                    {r.file_url && (
                      <a href={r.file_url} target="_blank" rel="noopener noreferrer" className="text-indigo-600 text-xs hover:underline">Ver PDF</a>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}