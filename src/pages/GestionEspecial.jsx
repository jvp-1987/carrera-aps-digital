import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import {
  Umbrella, Shield, Plus, Pencil, Trash2, Search,
  Lock, AlertTriangle, ExternalLink
} from 'lucide-react';
import { toast } from 'sonner';
import { useNavigate } from 'react-router-dom';

// ── Helpers ───────────────────────────────────────────────────
const DIAS_DERECHO = [
  { min: 15, max: 19, dias: 20 },
  { min: 20, max: 24, dias: 25 },
  { min: 25, max: Infinity, dias: 30 },
];
function diasPorAnios(anios) {
  const t = DIAS_DERECHO.find(d => anios >= d.min && anios <= d.max);
  return t ? t.dias : 15;
}

const ESTADO_VAC_COLOR = {
  Pendiente: 'bg-yellow-100 text-yellow-800',
  Autorizada: 'bg-blue-100 text-blue-800',
  Tomada: 'bg-green-100 text-green-800',
  Vencida: 'bg-red-100 text-red-800',
};
const ESTADO_SUM_COLOR = {
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

// ── Formulario Vacación Progresiva ────────────────────────────
const EMPTY_VAC = { rut: '', nombre: '', anios_servicio: '', dias_tomados: '', periodo: String(new Date().getFullYear()), estado: 'Pendiente', resolution_number: '', fecha_inicio: '', fecha_fin: '' };

function VacacionForm({ initial, onSave, onClose, employees }) {
  const [form, setForm] = useState(initial || EMPTY_VAC);
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
    if (k === 'rut') {
      const found = employees?.find(e => e.rut?.replace(/\./g, '').trim().toUpperCase() === v.replace(/\./g, '').trim().toUpperCase());
      if (found) { updated.nombre = found.full_name; updated.employee_id = found.id; }
    }
    return updated;
  });

  const matched = employees?.find(e => e.id === form.employee_id);

  return (
    <div className="space-y-4">
      {matched && (
        <div className="bg-emerald-50 border border-emerald-200 rounded px-3 py-1.5 text-xs text-emerald-800 flex items-center gap-1">
          ✓ Vinculado a funcionario: <strong>{matched.full_name}</strong>
        </div>
      )}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label className="text-xs">RUT</Label>
          <Input value={form.rut} onChange={e => set('rut', e.target.value)} placeholder="12345678-9" />
        </div>
        <div><Label className="text-xs">Nombre</Label><Input value={form.nombre} onChange={e => set('nombre', e.target.value)} /></div>
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
        <Button variant="outline" onClick={onClose}>Cancelar</Button>
        <Button onClick={() => onSave(form)} className="bg-indigo-600 hover:bg-indigo-700">Guardar</Button>
      </div>
    </div>
  );
}

// ── Formulario Sumario ────────────────────────────────────────
const EMPTY_SUM = { rut: '', nombre: '', n_sumario: '', tipo: 'Sumario Administrativo', fecha_inicio: '', fiscal_instructor: '', cargo_imputado: '', n_resolucion: '', fecha_resolucion: '', sancion: 'Sin Sanción', estado: 'En Curso', confidencial: false, observaciones: '' };

function SumarioForm({ initial, onSave, onClose }) {
  const [form, setForm] = useState(initial || EMPTY_SUM);
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div><Label className="text-xs">RUT</Label><Input value={form.rut} onChange={e => set('rut', e.target.value)} placeholder="12345678-9" /></div>
        <div><Label className="text-xs">Nombre</Label><Input value={form.nombre} onChange={e => set('nombre', e.target.value)} /></div>
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
        <div className="col-span-2">
          <Label className="text-xs">Observaciones</Label>
          <Input value={form.observaciones} onChange={e => set('observaciones', e.target.value)} />
        </div>
        <div className="col-span-2 flex items-center gap-2">
          <input type="checkbox" id="conf" checked={form.confidencial} onChange={e => set('confidencial', e.target.checked)} className="h-4 w-4" />
          <label htmlFor="conf" className="text-sm text-slate-700 flex items-center gap-1"><Lock className="w-3 h-3" /> Sumario confidencial / reservado</label>
        </div>
      </div>
      <div className="flex gap-2 justify-end pt-2">
        <Button variant="outline" onClick={onClose}>Cancelar</Button>
        <Button onClick={() => onSave(form)} className="bg-indigo-600 hover:bg-indigo-700">Guardar</Button>
      </div>
    </div>
  );
}

// ── Componente principal ──────────────────────────────────────
export default function GestionEspecial() {
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [dialogVac, setDialogVac] = useState(null);   // null | 'new' | record
  const [dialogSum, setDialogSum] = useState(null);

  const { data: vacaciones = [] } = useQuery({ queryKey: ['vacaciones'], queryFn: () => base44.entities.VacacionProgresiva.list() });
  const { data: sumarios = [] } = useQuery({ queryKey: ['sumarios'], queryFn: () => base44.entities.SumarioAdministrativo.list() });

  const saveVac = useMutation({
    mutationFn: (d) => d.id ? base44.entities.VacacionProgresiva.update(d.id, d) : base44.entities.VacacionProgresiva.create(d),
    onSuccess: () => { qc.invalidateQueries(['vacaciones']); setDialogVac(null); toast.success('Vacación guardada'); },
  });
  const deleteVac = useMutation({
    mutationFn: (id) => base44.entities.VacacionProgresiva.delete(id),
    onSuccess: () => { qc.invalidateQueries(['vacaciones']); toast.success('Eliminado'); },
  });
  const saveSum = useMutation({
    mutationFn: (d) => d.id ? base44.entities.SumarioAdministrativo.update(d.id, d) : base44.entities.SumarioAdministrativo.create(d),
    onSuccess: () => { qc.invalidateQueries(['sumarios']); setDialogSum(null); toast.success('Sumario guardado'); },
  });
  const deleteSum = useMutation({
    mutationFn: (id) => base44.entities.SumarioAdministrativo.delete(id),
    onSuccess: () => { qc.invalidateQueries(['sumarios']); toast.success('Eliminado'); },
  });

  const filteredVac = vacaciones.filter(v => !search || v.nombre?.toLowerCase().includes(search.toLowerCase()) || v.rut?.includes(search));
  const filteredSum = sumarios.filter(s => !search || s.nombre?.toLowerCase().includes(search.toLowerCase()) || s.rut?.includes(search) || s.n_sumario?.includes(search));

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Gestión Especial</h1>
        <p className="text-sm text-slate-500 mt-1">Vacaciones progresivas y sumarios administrativos</p>
      </div>

      <div className="relative w-72">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
        <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar por nombre o RUT..." className="pl-9" />
      </div>

      <Tabs defaultValue="vacaciones">
        <TabsList className="grid grid-cols-2 w-72">
          <TabsTrigger value="vacaciones" className="flex items-center gap-1"><Umbrella className="w-3.5 h-3.5" /> Vacaciones</TabsTrigger>
          <TabsTrigger value="sumarios" className="flex items-center gap-1"><Shield className="w-3.5 h-3.5" /> Sumarios</TabsTrigger>
        </TabsList>

        {/* ── Vacaciones Progresivas ── */}
        <TabsContent value="vacaciones" className="mt-4 space-y-4">
          <div className="flex justify-between items-center">
            <div className="flex gap-3">
              <div className="bg-white border rounded-lg px-4 py-2 text-center">
                <div className="text-xl font-bold text-slate-800">{vacaciones.length}</div>
                <div className="text-xs text-slate-500">Registros</div>
              </div>
              <div className="bg-yellow-50 border border-yellow-200 rounded-lg px-4 py-2 text-center">
                <div className="text-xl font-bold text-yellow-700">{vacaciones.filter(v => v.estado === 'Pendiente').length}</div>
                <div className="text-xs text-slate-500">Pendientes</div>
              </div>
              <div className="bg-green-50 border border-green-200 rounded-lg px-4 py-2 text-center">
                <div className="text-xl font-bold text-green-700">{vacaciones.filter(v => v.estado === 'Tomada').length}</div>
                <div className="text-xs text-slate-500">Tomadas</div>
              </div>
            </div>
            <Button onClick={() => setDialogVac('new')} className="bg-indigo-600 hover:bg-indigo-700">
              <Plus className="w-4 h-4 mr-1" /> Nueva vacación progresiva
            </Button>
          </div>

          <div className="space-y-2">
            {filteredVac.length === 0 && <p className="text-sm text-slate-400 text-center py-8">Sin registros</p>}
            {filteredVac.map(v => (
              <Card key={v.id} className="hover:shadow-sm transition-shadow">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between flex-wrap gap-3">
                    <div className="flex items-center gap-4">
                      <div className="bg-indigo-100 rounded-full p-2"><Umbrella className="w-4 h-4 text-indigo-600" /></div>
                      <div>
                        <p className="font-semibold text-slate-800">{v.nombre}</p>
                        <p className="text-xs text-slate-500">{v.rut} · Período {v.periodo}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 flex-wrap">
                      <div className="text-center">
                        <p className="text-sm font-bold text-slate-700">{v.anios_servicio}</p>
                        <p className="text-[10px] text-slate-400">años serv.</p>
                      </div>
                      <div className="text-center">
                        <p className="text-sm font-bold text-indigo-700">{v.dias_habiles_derecho || diasPorAnios(v.anios_servicio || 0)}</p>
                        <p className="text-[10px] text-slate-400">días derecho</p>
                      </div>
                      <div className="text-center">
                        <p className="text-sm font-bold text-amber-700">{v.dias_tomados || 0}</p>
                        <p className="text-[10px] text-slate-400">tomados</p>
                      </div>
                      <div className="text-center">
                        <p className="text-sm font-bold text-green-700">{(v.dias_habiles_derecho || diasPorAnios(v.anios_servicio || 0)) - (v.dias_tomados || 0)}</p>
                        <p className="text-[10px] text-slate-400">pendientes</p>
                      </div>
                      <Badge className={ESTADO_VAC_COLOR[v.estado] || ''}>{v.estado}</Badge>
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setDialogVac(v)}><Pencil className="w-3.5 h-3.5" /></Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-red-500 hover:text-red-700" onClick={() => deleteVac.mutate(v.id)}><Trash2 className="w-3.5 h-3.5" /></Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        {/* ── Sumarios ── */}
        <TabsContent value="sumarios" className="mt-4 space-y-4">
          <div className="flex justify-between items-center">
            <div className="flex gap-3">
              <div className="bg-orange-50 border border-orange-200 rounded-lg px-4 py-2 text-center">
                <div className="text-xl font-bold text-orange-700">{sumarios.filter(s => s.estado === 'En Curso').length}</div>
                <div className="text-xs text-slate-500">En curso</div>
              </div>
              <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-2 text-center">
                <div className="text-xl font-bold text-red-700">{sumarios.filter(s => s.estado === 'Sancionado').length}</div>
                <div className="text-xs text-slate-500">Sancionados</div>
              </div>
              <div className="bg-slate-50 border rounded-lg px-4 py-2 text-center">
                <div className="text-xl font-bold text-slate-700">{sumarios.filter(s => s.confidencial).length}</div>
                <div className="text-xs text-slate-500">Confidenciales</div>
              </div>
            </div>
            <Button onClick={() => setDialogSum('new')} className="bg-indigo-600 hover:bg-indigo-700">
              <Plus className="w-4 h-4 mr-1" /> Nuevo sumario
            </Button>
          </div>

          <div className="space-y-2">
            {filteredSum.length === 0 && <p className="text-sm text-slate-400 text-center py-8">Sin registros</p>}
            {filteredSum.map(s => (
              <Card key={s.id} className="hover:shadow-sm transition-shadow">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between flex-wrap gap-3">
                    <div className="flex items-center gap-4">
                      <div className="bg-red-100 rounded-full p-2">
                        <Shield className="w-4 h-4 text-red-600" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="font-semibold text-slate-800">{s.nombre}</p>
                          {s.confidencial && <Lock className="w-3 h-3 text-slate-400" title="Confidencial" />}
                        </div>
                        <p className="text-xs text-slate-500">{s.rut} · N° {s.n_sumario} · {s.tipo}</p>
                        {s.cargo_imputado && <p className="text-xs text-slate-500 italic">"{s.cargo_imputado}"</p>}
                      </div>
                    </div>
                    <div className="flex items-center gap-3 flex-wrap">
                      {s.fiscal_instructor && (
                        <div className="text-right hidden md:block">
                          <p className="text-xs text-slate-500">Fiscal</p>
                          <p className="text-xs font-medium text-slate-700">{s.fiscal_instructor}</p>
                        </div>
                      )}
                      {s.sancion && s.sancion !== 'Sin Sanción' && (
                        <Badge className={SANCION_COLOR[s.sancion] || ''}>{s.sancion}</Badge>
                      )}
                      <Badge className={ESTADO_SUM_COLOR[s.estado] || ''}>{s.estado}</Badge>
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setDialogSum(s)}><Pencil className="w-3.5 h-3.5" /></Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-red-500 hover:text-red-700" onClick={() => deleteSum.mutate(s.id)}><Trash2 className="w-3.5 h-3.5" /></Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>
      </Tabs>

      {/* Diálogo Vacación */}
      <Dialog open={dialogVac !== null} onOpenChange={o => !o && setDialogVac(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Umbrella className="w-4 h-4 text-indigo-600" />
              {dialogVac === 'new' ? 'Nueva vacación progresiva' : 'Editar vacación progresiva'}
            </DialogTitle>
          </DialogHeader>
          {dialogVac !== null && (
            <VacacionForm
              initial={dialogVac === 'new' ? null : dialogVac}
              onSave={d => saveVac.mutate(d)}
              onClose={() => setDialogVac(null)}
            />
          )}
        </DialogContent>
      </Dialog>

      {/* Diálogo Sumario */}
      <Dialog open={dialogSum !== null} onOpenChange={o => !o && setDialogSum(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Shield className="w-4 h-4 text-red-600" />
              {dialogSum === 'new' ? 'Nuevo sumario administrativo' : 'Editar sumario'}
            </DialogTitle>
          </DialogHeader>
          {dialogSum !== null && (
            <SumarioForm
              initial={dialogSum === 'new' ? null : dialogSum}
              onSave={d => saveSum.mutate(d)}
              onClose={() => setDialogSum(null)}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}