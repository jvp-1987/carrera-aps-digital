import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Plus, FileText, FileUp, Pencil, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

export default function ResolutionsTab({ employee }) {
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [form, setForm] = useState({
    resolution_number: '', resolution_date: '', type: '',
    description: '', previous_level: '', new_level: '', file_url: '',
  });

  const { data: resolutions = [] } = useQuery({
    queryKey: ['resolutions', employee.id],
    queryFn: () => base44.entities.Resolution.filter({ employee_id: employee.id }),
  });

  const createResolution = useMutation({
    mutationFn: async (data) => {
      await base44.entities.Resolution.create(data);
      if (data.type === 'Cambio de Nivel' && data.new_level) {
        await base44.entities.Employee.update(employee.id, {
          current_level: parseInt(data.new_level),
        });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['resolutions', employee.id] });
      queryClient.invalidateQueries({ queryKey: ['employee', employee.id] });
      setShowForm(false);
      toast.success('Resolución registrada');
    },
  });

  const handleFileUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    const { file_url } = await base44.integrations.Core.UploadFile({ file });
    setForm(p => ({ ...p, file_url }));
    setUploading(false);
    toast.success('Archivo subido');
  };

  const handleSubmit = () => {
    if (!form.file_url) {
      toast.error('Debe adjuntar la resolución. No se permiten cambios sin respaldo legal.');
      return;
    }
    createResolution.mutate({
      ...form,
      employee_id: employee.id,
      previous_level: form.previous_level ? parseInt(form.previous_level) : undefined,
      new_level: form.new_level ? parseInt(form.new_level) : undefined,
    });
  };

  const typeColors = {
    'Cambio de Nivel': 'bg-indigo-100 text-indigo-700',
    'Reconocimiento de Bienio': 'bg-emerald-100 text-emerald-700',
    'Asignación de Postítulo': 'bg-violet-100 text-violet-700',
    'Contrato': 'bg-blue-100 text-blue-700',
    'Desvinculación': 'bg-red-100 text-red-700',
    'Otro': 'bg-slate-100 text-slate-700',
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-3">
        <CardTitle className="text-base">Resoluciones y Actos Administrativos</CardTitle>
        <Dialog open={showForm} onOpenChange={setShowForm}>
          <DialogTrigger asChild>
            <Button size="sm" className="bg-indigo-600 hover:bg-indigo-700">
              <Plus className="w-4 h-4 mr-1" /> Registrar
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Nueva Resolución</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 mt-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>N° Resolución *</Label>
                  <Input value={form.resolution_number} onChange={e => setForm(p => ({...p, resolution_number: e.target.value}))} />
                </div>
                <div>
                  <Label>Fecha *</Label>
                  <Input type="date" value={form.resolution_date} onChange={e => setForm(p => ({...p, resolution_date: e.target.value}))} />
                </div>
              </div>
              <div>
                <Label>Tipo de Acto *</Label>
                <Select value={form.type} onValueChange={v => setForm(p => ({...p, type: v}))}>
                  <SelectTrigger><SelectValue placeholder="Seleccionar" /></SelectTrigger>
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
              {form.type === 'Cambio de Nivel' && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Nivel Anterior</Label>
                    <Input type="number" min={1} max={15} value={form.previous_level} onChange={e => setForm(p => ({...p, previous_level: e.target.value}))} />
                  </div>
                  <div>
                    <Label>Nuevo Nivel</Label>
                    <Input type="number" min={1} max={15} value={form.new_level} onChange={e => setForm(p => ({...p, new_level: e.target.value}))} />
                  </div>
                </div>
              )}
              <div>
                <Label>Descripción</Label>
                <Textarea value={form.description} onChange={e => setForm(p => ({...p, description: e.target.value}))} />
              </div>
              <div>
                <Label>Archivo Resolución (PDF) *</Label>
                <label className="flex items-center gap-2 px-4 py-2 border-2 border-dashed border-slate-300 rounded-lg cursor-pointer hover:border-indigo-400 transition-colors mt-1">
                  <FileUp className="w-4 h-4 text-slate-400" />
                  <span className="text-sm text-slate-500">
                    {uploading ? 'Subiendo...' : form.file_url ? '✓ Archivo cargado' : 'Seleccionar archivo'}
                  </span>
                  <input type="file" accept=".pdf" className="hidden" onChange={handleFileUpload} />
                </label>
              </div>
              <Button onClick={handleSubmit} className="w-full bg-indigo-600 hover:bg-indigo-700" disabled={createResolution.isPending}>
                {createResolution.isPending ? 'Guardando...' : 'Registrar Resolución'}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </CardHeader>
      <CardContent>
        {resolutions.length === 0 ? (
          <p className="text-sm text-slate-400 text-center py-6">Sin resoluciones registradas</p>
        ) : (
          <div className="space-y-3">
            {resolutions.map(r => (
              <div key={r.id} className="flex items-center justify-between p-3 rounded-lg bg-slate-50 border border-slate-100">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-slate-200">
                    <FileText className="w-4 h-4 text-slate-600" />
                  </div>
                  <div>
                    <p className="text-sm font-medium">Res. N° {r.resolution_number}</p>
                    <p className="text-xs text-slate-500">{r.resolution_date} — {r.description || 'Sin descripción'}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge className={typeColors[r.type] || 'bg-slate-100 text-slate-700'}>{r.type}</Badge>
                  {r.type === 'Cambio de Nivel' && r.new_level && (
                    <Badge variant="outline">→ Nivel {r.new_level}</Badge>
                  )}
                  {r.file_url && (
                    <a href={r.file_url} target="_blank" rel="noopener noreferrer" className="text-indigo-600 text-xs hover:underline">
                      PDF
                    </a>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}