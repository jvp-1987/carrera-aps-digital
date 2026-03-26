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
import { FileText, Search, Plus, Upload, FileDown } from 'lucide-react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import GenerarResolucionDialog from '@/components/resolutions/GenerarResolucionDialog';

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
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [uploading, setUploading] = useState(false);
  const [generarDialog, setGenerarDialog] = useState({ open: false, resolution: null });
  const queryClient = useQueryClient();

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

  const createResolution = useMutation({
    mutationFn: async (data) => {
      // Create one resolution record per affected employee (or a single one if none selected)
      const ids = data.employee_ids?.length ? data.employee_ids : [null];
      const promises = ids.map(eid =>
        base44.entities.Resolution.create({
          ...data,
          employee_id: eid || '',
          previous_level: data.previous_level ? parseInt(data.previous_level) : undefined,
          new_level: data.new_level ? parseInt(data.new_level) : undefined,
        })
      );
      return Promise.all(promises);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['all-resolutions'] });
      setShowForm(false);
      setForm(EMPTY_FORM);
      toast.success('Resolución registrada correctamente');
    },
  });

  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setUploading(true);
    const { file_url } = await base44.integrations.Core.UploadFile({ file });
    setForm(f => ({ ...f, file_url }));
    setUploading(false);
  };

  const toggleEmployee = (id) => {
    setForm(f => ({
      ...f,
      employee_ids: f.employee_ids.includes(id)
        ? f.employee_ids.filter(x => x !== id)
        : [...f.employee_ids, id],
    }));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!form.resolution_number || !form.resolution_date || !form.type) {
      toast.error('Completa los campos obligatorios');
      return;
    }
    createResolution.mutate(form);
  };

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
      <div className="mb-6 flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Resoluciones</h1>
          <p className="text-slate-500 text-sm mt-1">Registro de actos administrativos con trazabilidad documental</p>
        </div>
        <Button onClick={() => setShowForm(true)} className="flex items-center gap-2">
          <Plus className="w-4 h-4" /> Nueva Resolución
        </Button>
      </div>

      {/* Dialog Nueva Resolución */}
      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Registrar Nueva Resolución</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4 pt-2">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>N° Resolución *</Label>
                <Input value={form.resolution_number} onChange={e => setForm(f => ({ ...f, resolution_number: e.target.value }))} placeholder="Ej: 1234/2026" />
              </div>
              <div>
                <Label>Fecha *</Label>
                <Input type="date" value={form.resolution_date} onChange={e => setForm(f => ({ ...f, resolution_date: e.target.value }))} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Tipo *</Label>
                <Select value={form.type} onValueChange={v => setForm(f => ({ ...f, type: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Cambio de Nivel">Cambio de Nivel</SelectItem>
                    <SelectItem value="Reconocimiento de Bienio">Reconocimiento de Bienio</SelectItem>
                    <SelectItem value="Asignación de Postítulo">Asignación de Postítulo</SelectItem>
                    <SelectItem value="Contrato">Contrato</SelectItem>
                    <SelectItem value="Desvinculación">Desvinculación</SelectItem>
                    <SelectItem value="Otro">Otro</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Estado</Label>
                <Select value={form.status} onValueChange={v => setForm(f => ({ ...f, status: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Borrador">Borrador</SelectItem>
                    <SelectItem value="Firmada">Firmada</SelectItem>
                    <SelectItem value="Publicada">Publicada</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            {form.type === 'Cambio de Nivel' && (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Nivel Anterior</Label>
                  <Input type="number" min="1" max="15" value={form.previous_level} onChange={e => setForm(f => ({ ...f, previous_level: e.target.value }))} />
                </div>
                <div>
                  <Label>Nivel Nuevo</Label>
                  <Input type="number" min="1" max="15" value={form.new_level} onChange={e => setForm(f => ({ ...f, new_level: e.target.value }))} />
                </div>
              </div>
            )}
            <div>
              <Label>Descripción</Label>
              <Input value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="Descripción del acto administrativo" />
            </div>
            <div>
              <Label>Funcionarios Afectados</Label>
              <div className="mt-1 max-h-36 overflow-y-auto border rounded-md divide-y">
                {employees.sort((a, b) => a.full_name.localeCompare(b.full_name)).map(e => (
                  <label key={e.id} className="flex items-center gap-2 px-3 py-2 cursor-pointer hover:bg-slate-50 text-sm">
                    <input
                      type="checkbox"
                      checked={form.employee_ids.includes(e.id)}
                      onChange={() => toggleEmployee(e.id)}
                      className="rounded"
                    />
                    <span>{e.full_name}</span>
                    <span className="text-slate-400 text-xs ml-auto">Cat. {e.category}</span>
                  </label>
                ))}
              </div>
              {form.employee_ids.length > 0 && (
                <p className="text-xs text-slate-500 mt-1">{form.employee_ids.length} funcionario(s) seleccionado(s)</p>
              )}
            </div>
            <div>
              <Label>Documento PDF</Label>
              <div className="flex items-center gap-2 mt-1">
                <label className="flex items-center gap-2 cursor-pointer px-3 py-2 border rounded-md text-sm hover:bg-slate-50 flex-1 justify-center">
                  <Upload className="w-4 h-4" />
                  {uploading ? 'Subiendo...' : form.file_url ? 'Documento cargado ✓' : 'Subir PDF'}
                  <input type="file" accept=".pdf" className="hidden" onChange={handleFileUpload} disabled={uploading} />
                </label>
                {form.file_url && (
                  <a href={form.file_url} target="_blank" rel="noopener noreferrer" className="text-indigo-600 text-xs hover:underline">Ver</a>
                )}
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => setShowForm(false)}>Cancelar</Button>
              <Button type="submit" disabled={createResolution.isPending}>
                {createResolution.isPending ? 'Guardando...' : 'Registrar Resolución'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

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
                    {r.status && <Badge className={statusColors[r.status] || 'bg-slate-100 text-slate-600'}>{r.status}</Badge>}
                    {r.type === 'Cambio de Nivel' && r.new_level && (
                      <Badge variant="outline">Nivel {r.previous_level} → {r.new_level}</Badge>
                    )}
                    {r.file_url && (
                      <a href={r.file_url} target="_blank" rel="noopener noreferrer" className="text-indigo-600 text-xs hover:underline">Ver PDF</a>
                    )}
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 text-xs gap-1 text-indigo-600 border-indigo-200 hover:bg-indigo-50"
                      onClick={() => setGenerarDialog({ open: true, resolution: r })}
                    >
                      <FileDown className="w-3.5 h-3.5" /> Generar PDF
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <GenerarResolucionDialog
        open={generarDialog.open}
        onOpenChange={(v) => setGenerarDialog(d => ({ ...d, open: v }))}
        resolution={generarDialog.resolution}
        employee={generarDialog.resolution ? employeeMap[generarDialog.resolution.employee_id] : null}
      />
    </div>
  );
}