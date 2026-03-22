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
import { Plus, Pencil, Trash2, Shield, Lock } from 'lucide-react';
import { toast } from 'sonner';

const ESTADO_COLOR = {
  'En Curso': 'bg-orange-100 text-orange-800',
  Sobreseído: 'bg-blue-100 text-blue-800',
  Sancionado: 'bg-red-100 text-red-800',
  Apelado: 'bg-purple-100 text-purple-800',
  Cerrado: 'bg-slate-100 text-slate-700',
};
const SANCION_COLOR = {
  'Sin Sanción': 'bg-green-100 text-green-700',
  'Amonestación Verbal': 'bg-yellow-100 text-yellow-700',
  'Amonestación Escrita': 'bg-amber-100 text-amber-700',
  Multa: 'bg-orange-100 text-orange-700',
  Suspensión: 'bg-red-100 text-red-700',
  Destitución: 'bg-red-200 text-red-900',
};

const EMPTY = { n_sumario: '', tipo: 'Sumario Administrativo', fecha_inicio: '', fiscal_instructor: '', cargo_imputado: '', n_resolucion_inicio: '', n_resolucion: '', fecha_resolucion: '', sancion: 'Sin Sanción', estado: 'En Curso', confidencial: false, observaciones: '' };

export default function SumariosTab({ employee }) {
  const qc = useQueryClient();
  const [dialog, setDialog] = useState(null);
  const [form, setForm] = useState(EMPTY);

  const { data: sumarios = [] } = useQuery({
    queryKey: ['sumarios', employee.id],
    queryFn: () => base44.entities.SumarioAdministrativo.filter({ employee_id: employee.id }),
  });

  const save = useMutation({
    mutationFn: (d) => d.id
      ? base44.entities.SumarioAdministrativo.update(d.id, d)
      : base44.entities.SumarioAdministrativo.create(d),
    onSuccess: () => { qc.invalidateQueries(['sumarios', employee.id]); setDialog(null); toast.success('Guardado'); },
  });

  const remove = useMutation({
    mutationFn: (id) => base44.entities.SumarioAdministrativo.delete(id),
    onSuccess: () => { qc.invalidateQueries(['sumarios', employee.id]); toast.success('Eliminado'); },
  });

  const openNew = () => {
    setForm({ ...EMPTY, rut: employee.rut, nombre: employee.full_name, employee_id: employee.id });
    setDialog('form');
  };
  const openEdit = (s) => { setForm(s); setDialog('form'); };
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const enCurso = sumarios.filter(s => s.estado === 'En Curso').length;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm flex items-center gap-2">
            <Shield className="w-4 h-4 text-red-600" /> Sumarios Administrativos
          </CardTitle>
          <Button size="sm" onClick={openNew} className="bg-indigo-600 hover:bg-indigo-700">
            <Plus className="w-4 h-4 mr-1" /> Agregar
          </Button>
        </div>
        {enCurso > 0 && (
          <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded px-2 py-1 mt-2">
            {enCurso} sumario{enCurso !== 1 ? 's' : ''} en curso
          </p>
        )}
      </CardHeader>
      <CardContent className="space-y-2">
        {sumarios.length === 0 && (
          <p className="text-sm text-slate-400 text-center py-6">Sin sumarios registrados</p>
        )}
        {sumarios.map(s => (
          <div key={s.id} className="flex items-center justify-between border rounded-lg px-4 py-3 hover:bg-slate-50">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-medium text-sm text-slate-800">N° {s.n_sumario}</span>
                {s.confidencial && <Lock className="w-3 h-3 text-slate-400" title="Confidencial" />}
                <Badge className="text-[10px]">{s.tipo}</Badge>
                <Badge className={ESTADO_COLOR[s.estado] || ''}>{s.estado}</Badge>
                {s.sancion && s.sancion !== 'Sin Sanción' && (
                  <Badge className={SANCION_COLOR[s.sancion] || ''}>{s.sancion}</Badge>
                )}
              </div>
              {s.cargo_imputado && <p className="text-xs text-slate-500 italic mt-0.5">"{s.cargo_imputado}"</p>}
              <p className="text-xs text-slate-400 mt-0.5">
                Inicio: {s.fecha_inicio}
                {s.fiscal_instructor && ` · Fiscal: ${s.fiscal_instructor}`}
                {s.fecha_resolucion && ` · Res: ${s.fecha_resolucion}`}
              </p>
            </div>
            <div className="flex gap-1 ml-3">
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(s)}><Pencil className="w-3.5 h-3.5" /></Button>
              <Button variant="ghost" size="icon" className="h-7 w-7 text-red-400 hover:text-red-600" onClick={() => remove.mutate(s.id)}><Trash2 className="w-3.5 h-3.5" /></Button>
            </div>
          </div>
        ))}
      </CardContent>

      <Dialog open={dialog === 'form'} onOpenChange={o => !o && setDialog(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Shield className="w-4 h-4 text-red-600" />
              {form.id ? 'Editar sumario' : 'Nuevo sumario administrativo'}
            </DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <div><Label className="text-xs">N° Sumario</Label><Input value={form.n_sumario} onChange={e => set('n_sumario', e.target.value)} /></div>
            <div>
              <Label className="text-xs">Tipo</Label>
              <Select value={form.tipo} onValueChange={v => set('tipo', v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Sumario Administrativo">Sumario Administrativo</SelectItem>
                  <SelectItem value="Investigación Sumaria">Investigación Sumaria</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div><Label className="text-xs">Fecha inicio</Label><Input type="date" value={form.fecha_inicio} onChange={e => set('fecha_inicio', e.target.value)} /></div>
            <div><Label className="text-xs">Fiscal instructor</Label><Input value={form.fiscal_instructor} onChange={e => set('fiscal_instructor', e.target.value)} /></div>
            <div className="col-span-2"><Label className="text-xs">Cargo imputado</Label><Input value={form.cargo_imputado} onChange={e => set('cargo_imputado', e.target.value)} /></div>
            <div><Label className="text-xs">N° Resolución inicio</Label><Input value={form.n_resolucion_inicio || ''} onChange={e => set('n_resolucion_inicio', e.target.value)} /></div>
            <div><Label className="text-xs">N° Resolución cierre</Label><Input value={form.n_resolucion} onChange={e => set('n_resolucion', e.target.value)} /></div>
            <div><Label className="text-xs">Fecha resolución</Label><Input type="date" value={form.fecha_resolucion} onChange={e => set('fecha_resolucion', e.target.value)} /></div>
            <div>
              <Label className="text-xs">Sanción</Label>
              <Select value={form.sancion} onValueChange={v => set('sancion', v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {['Sin Sanción', 'Amonestación Verbal', 'Amonestación Escrita', 'Multa', 'Suspensión', 'Destitución'].map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Estado</Label>
              <Select value={form.estado} onValueChange={v => set('estado', v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {['En Curso', 'Sobreseído', 'Sancionado', 'Apelado', 'Cerrado'].map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="col-span-2"><Label className="text-xs">Observaciones</Label><Input value={form.observaciones} onChange={e => set('observaciones', e.target.value)} /></div>
            <div className="col-span-2 flex items-center gap-2">
              <input type="checkbox" id="conf" checked={form.confidencial} onChange={e => set('confidencial', e.target.checked)} className="h-4 w-4" />
              <label htmlFor="conf" className="text-sm text-slate-700 flex items-center gap-1"><Lock className="w-3 h-3" /> Sumario confidencial / reservado</label>
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