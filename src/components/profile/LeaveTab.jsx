import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Plus, Clock, FileUp, Pencil, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { calculateCareerSummary } from '@/utils/employeeScores';

export default function LeaveTab({ employee }) {
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [form, setForm] = useState({
    start_date: '', end_date: '', reason: '',
    resolution_number: '', resolution_file_url: '',
  });

  const { data: leaves = [] } = useQuery({
    queryKey: ['leaves', employee.id],
    queryFn: () => base44.entities.LeaveWithoutPay.filter({ employee_id: employee.id }),
  });

  const totalLeaveDays = leaves.reduce((s, l) => s + (l.days_count || 0), 0);

  const updateLeave = useMutation({
    mutationFn: ({ id, data }) => base44.entities.LeaveWithoutPay.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['leaves', employee.id] });
      setShowForm(false);
      setEditingId(null);
      toast.success('Permiso actualizado');
    },
  });

  const deleteLeave = useMutation({
    mutationFn: id => base44.entities.LeaveWithoutPay.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['leaves', employee.id] });
      toast.success('Permiso eliminado');
    },
  });

  const openEdit = (l) => {
    setEditingId(l.id);
    setForm({
      start_date: l.start_date || '', end_date: l.end_date || '',
      reason: l.reason || '', resolution_number: l.resolution_number || '',
      resolution_file_url: l.resolution_file_url || '',
    });
    setShowForm(true);
  };

  const createLeave = useMutation({
    mutationFn: async (data) => {
      await base44.entities.LeaveWithoutPay.create(data);
      const [allPeriods, allLeaves, allTrainings] = await Promise.all([
        base44.entities.ServicePeriod.filter({ employee_id: employee.id }),
        base44.entities.LeaveWithoutPay.filter({ employee_id: employee.id }),
        base44.entities.Training.filter({ employee_id: employee.id }),
      ]);
      const summary = calculateCareerSummary(employee, {
        servicePeriods: allPeriods,
        leaves: allLeaves,
        trainings: allTrainings,
      });
      await base44.entities.Employee.update(employee.id, {
        total_experience_days: summary.total_experience_days,
        total_leave_days: summary.total_leave_days,
        bienios_count: summary.bienios_count,
        bienio_points: summary.bienio_points,
        next_bienio_date: summary.next_bienio_date,
        training_points: summary.training_points,
        postitle_percentage: summary.postitle_percentage,
        total_points: summary.total_points,
        current_level: summary.current_level,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['leaves', employee.id] });
      queryClient.invalidateQueries({ queryKey: ['employee', employee.id] });
      setShowForm(false);
      setEditingId(null);
      toast.success('Permiso registrado. Antigüedad y bienios recalculados.');
    },
  });

  const handleFileUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    const { file_url } = await base44.integrations.Core.UploadFile({ file });
    setForm(p => ({ ...p, resolution_file_url: file_url }));
    setUploading(false);
  };

  const handleSubmit = () => {
    const start = new Date(form.start_date);
    const end = new Date(form.end_date);
    const days = Math.floor((end - start) / (1000 * 60 * 60 * 24)) + 1;
    const payload = { ...form, employee_id: employee.id, days_count: days };
    if (editingId) {
      updateLeave.mutate({ id: editingId, data: payload });
    } else {
      createLeave.mutate(payload);
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-3">
        <div>
          <CardTitle className="text-base">Permisos Sin Goce de Remuneraciones</CardTitle>
          <p className="text-xs text-slate-500 mt-1">Total descontado: <strong>{totalLeaveDays} días</strong></p>
        </div>
        <Dialog open={showForm} onOpenChange={(v) => { setShowForm(v); if (!v) setEditingId(null); }}>
          <DialogTrigger asChild>
            <Button size="sm" className="bg-indigo-600 hover:bg-indigo-700">
              <Plus className="w-4 h-4 mr-1" /> Registrar
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{editingId ? 'Editar Permiso Sin Goce' : 'Registrar Permiso Sin Goce'}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 mt-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Fecha Inicio</Label>
                  <Input type="date" value={form.start_date} onChange={e => setForm(p => ({...p, start_date: e.target.value}))} />
                </div>
                <div>
                  <Label>Fecha Fin</Label>
                  <Input type="date" value={form.end_date} onChange={e => setForm(p => ({...p, end_date: e.target.value}))} />
                </div>
              </div>
              <div>
                <Label>Motivo</Label>
                <Textarea value={form.reason} onChange={e => setForm(p => ({...p, reason: e.target.value}))} />
              </div>
              <div>
                <Label>N° Resolución</Label>
                <Input value={form.resolution_number} onChange={e => setForm(p => ({...p, resolution_number: e.target.value}))} />
              </div>
              <div>
                <Label>Archivo Resolución</Label>
                <label className="flex items-center gap-2 px-4 py-2 border-2 border-dashed border-slate-300 rounded-lg cursor-pointer hover:border-indigo-400 mt-1">
                  <FileUp className="w-4 h-4 text-slate-400" />
                  <span className="text-sm text-slate-500">
                    {uploading ? 'Subiendo...' : form.resolution_file_url ? '✓ Archivo cargado' : 'Seleccionar'}
                  </span>
                  <input type="file" accept=".pdf" className="hidden" onChange={handleFileUpload} />
                </label>
              </div>
              <Button onClick={handleSubmit} className="w-full bg-indigo-600 hover:bg-indigo-700" disabled={createLeave.isPending || updateLeave.isPending}>
                {(createLeave.isPending || updateLeave.isPending) ? 'Guardando...' : editingId ? 'Guardar Cambios' : 'Registrar Permiso'}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </CardHeader>
      <CardContent>
        {leaves.length === 0 ? (
          <p className="text-sm text-slate-400 text-center py-6">Sin permisos registrados</p>
        ) : (
          <div className="space-y-3">
            {leaves.map(l => (
              <div key={l.id} className="flex items-center justify-between p-3 rounded-lg bg-slate-50 border border-slate-100">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-amber-100">
                    <Clock className="w-4 h-4 text-amber-600" />
                  </div>
                  <div>
                    <p className="text-sm font-medium">{l.start_date} → {l.end_date}</p>
                    <p className="text-xs text-slate-500">{l.reason || 'Sin motivo especificado'}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge className="bg-amber-100 text-amber-700">{l.days_count} días</Badge>
                  {l.resolution_file_url && (
                    <a href={l.resolution_file_url} target="_blank" rel="noopener noreferrer" className="text-indigo-600 text-xs hover:underline">
                      PDF
                    </a>
                  )}
                  <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-slate-400 hover:text-indigo-600" onClick={() => openEdit(l)}>
                    <Pencil className="w-3.5 h-3.5" />
                  </Button>
                  <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-slate-400 hover:text-red-500" onClick={() => { if (confirm('¿Eliminar este permiso?')) deleteLeave.mutate(l.id); }}>
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}