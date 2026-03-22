import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Plus, Pencil, Trash2, Umbrella } from 'lucide-react';
import { toast } from 'sonner';

const ESTADO_COLOR = {
  Pendiente: 'bg-yellow-100 text-yellow-800',
  Autorizada: 'bg-blue-100 text-blue-800',
  Tomada: 'bg-green-100 text-green-800',
  Vencida: 'bg-red-100 text-red-800',
};

function diasPorAnios(anios) {
  if (anios >= 25) return 30;
  if (anios >= 20) return 25;
  if (anios >= 15) return 20;
  return 15;
}

const EMPTY = { anios_servicio: '', dias_tomados: '', periodo: String(new Date().getFullYear()), estado: 'Pendiente', resolution_number: '', fecha_inicio: '', fecha_fin: '' };

export default function VacacionesTab({ employee }) {
  const qc = useQueryClient();
  const [dialog, setDialog] = useState(null);
  const [form, setForm] = useState(EMPTY);

  const { data: vacaciones = [] } = useQuery({
    queryKey: ['vacaciones', employee.id],
    queryFn: () => base44.entities.VacacionProgresiva.filter({ employee_id: employee.id }),
  });

  const save = useMutation({
    mutationFn: (d) => d.id
      ? base44.entities.VacacionProgresiva.update(d.id, d)
      : base44.entities.VacacionProgresiva.create(d),
    onSuccess: () => { qc.invalidateQueries(['vacaciones', employee.id]); setDialog(null); toast.success('Guardado'); },
  });

  const remove = useMutation({
    mutationFn: (id) => base44.entities.VacacionProgresiva.delete(id),
    onSuccess: () => { qc.invalidateQueries(['vacaciones', employee.id]); toast.success('Eliminado'); },
  });

  const openNew = () => {
    const dias = diasPorAnios(employee.bienios_count ? employee.bienios_count * 2 : 0);
    setForm({ ...EMPTY, rut: employee.rut, nombre: employee.full_name, employee_id: employee.id, dias_habiles_derecho: dias });
    setDialog('form');
  };

  const openEdit = (v) => { setForm(v); setDialog('form'); };

  const set = (k, v) => setForm(f => {
    const updated = { ...f, [k]: v };
    if (k === 'anios_servicio') {
      const dias = diasPorAnios(parseInt(v) || 0);
      updated.dias_habiles_derecho = dias;
      updated.dias_pendientes = dias - (parseInt(updated.dias_tomados) || 0);
    }
    if (k === 'dias_tomados') {
      updated.dias_pendientes = (parseInt(updated.dias_habiles_derecho) || 0) - (parseInt(v) || 0);
    }
    return updated;
  });

  const totalPendientes = vacaciones.filter(v => v.estado !== 'Tomada' && v.estado !== 'Vencida')
    .reduce((s, v) => s + ((v.dias_habiles_derecho || 0) - (v.dias_tomados || 0)), 0);

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm flex items-center gap-2">
            <Umbrella className="w-4 h-4 text-indigo-600" /> Vacaciones Progresivas
          </CardTitle>
          <Button size="sm" onClick={openNew} className="bg-indigo-600 hover:bg-indigo-700">
            <Plus className="w-4 h-4 mr-1" /> Agregar
          </Button>
        </div>
        {totalPendientes > 0 && (
          <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1 mt-2">
            {totalPendientes} día{totalPendientes !== 1 ? 's' : ''} de vacación pendiente{totalPendientes !== 1 ? 's' : ''} de tomar
          </p>
        )}
      </CardHeader>
      <CardContent className="space-y-2">
        {vacaciones.length === 0 && (
          <p className="text-sm text-slate-400 text-center py-6">Sin registros de vacación progresiva</p>
        )}
        {vacaciones.map(v => (
          <div key={v.id} className="flex items-center justify-between border rounded-lg px-4 py-3 hover:bg-slate-50">
            <div>
              <div className="flex items-center gap-2">
                <span className="font-medium text-sm text-slate-800">Período {v.periodo}</span>
                <Badge className={ESTADO_COLOR[v.estado] || ''}>{v.estado}</Badge>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                {v.anios_servicio} años serv. · Derecho: <strong>{v.dias_habiles_derecho || diasPorAnios(v.anios_servicio || 0)} días</strong>
                · Tomados: {v.dias_tomados || 0} · Pendientes: {(v.dias_habiles_derecho || diasPorAnios(v.anios_servicio || 0)) - (v.dias_tomados || 0)}
              </p>
              {v.fecha_inicio && <p className="text-xs text-slate-400">{v.fecha_inicio}{v.fecha_fin ? ` → ${v.fecha_fin}` : ''}</p>}
              {v.resolution_number && <p className="text-xs text-slate-400">Res. {v.resolution_number}</p>}
            </div>
            <div className="flex gap-1 ml-3">
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(v)}><Pencil className="w-3.5 h-3.5" /></Button>
              <Button variant="ghost" size="icon" className="h-7 w-7 text-red-400 hover:text-red-600" onClick={() => remove.mutate(v.id)}><Trash2 className="w-3.5 h-3.5" /></Button>
            </div>
          </div>
        ))}
      </CardContent>

      <Dialog open={dialog === 'form'} onOpenChange={o => !o && setDialog(null)}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Umbrella className="w-4 h-4 text-indigo-600" />
              {form.id ? 'Editar vacación progresiva' : 'Nueva vacación progresiva'}
            </DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <div><Label className="text-xs">Años de servicio</Label><Input type="number" value={form.anios_servicio} onChange={e => set('anios_servicio', e.target.value)} /></div>
            <div><Label className="text-xs">Período</Label><Input value={form.periodo} onChange={e => set('periodo', e.target.value)} placeholder="2024" /></div>
            <div>
              <Label className="text-xs">Días derecho (calculado)</Label>
              <Input value={form.dias_habiles_derecho || diasPorAnios(parseInt(form.anios_servicio) || 0)} readOnly className="bg-slate-50" />
            </div>
            <div><Label className="text-xs">Días tomados</Label><Input type="number" value={form.dias_tomados} onChange={e => set('dias_tomados', e.target.value)} /></div>
            <div><Label className="text-xs">Fecha inicio</Label><Input type="date" value={form.fecha_inicio} onChange={e => set('fecha_inicio', e.target.value)} /></div>
            <div><Label className="text-xs">Fecha fin</Label><Input type="date" value={form.fecha_fin} onChange={e => set('fecha_fin', e.target.value)} /></div>
            <div><Label className="text-xs">N° Resolución</Label><Input value={form.resolution_number} onChange={e => set('resolution_number', e.target.value)} /></div>
            <div>
              <Label className="text-xs">Estado</Label>
              <Select value={form.estado} onValueChange={v => set('estado', v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {['Pendiente', 'Autorizada', 'Tomada', 'Vencida'].map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="flex gap-2 justify-end pt-2">
            <Button variant="outline" onClick={() => setDialog(null)}>Cancelar</Button>
            <Button onClick={() => save.mutate(form)} disabled={save.isPending} className="bg-indigo-600 hover:bg-indigo-700">Guardar</Button>
          </div>
        </DialogContent>
      </Dialog>
    </Card>
  );
}