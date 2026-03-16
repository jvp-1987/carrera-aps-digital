import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Plus, Calendar, Building2, FileText, Pencil, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { calculateEffectiveDays, calculateBienios, calculateBienioPoints, calculateNextBienioDate } from '@/components/calculations';

export default function ExperienceTab({ employee }) {
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    period_type: '', start_date: '', end_date: '', institution: '',
    resolution_number: '', days_count: 0,
  });

  const { data: periods = [] } = useQuery({
    queryKey: ['service-periods', employee.id],
    queryFn: () => base44.entities.ServicePeriod.filter({ employee_id: employee.id }),
  });

  const { data: leaves = [] } = useQuery({
    queryKey: ['leaves', employee.id],
    queryFn: () => base44.entities.LeaveWithoutPay.filter({ employee_id: employee.id }),
  });

  const totalLeaveDays = leaves.reduce((sum, l) => sum + (l.days_count || 0), 0);
  const effectiveDays = calculateEffectiveDays(periods, totalLeaveDays);
  const bienios = calculateBienios(effectiveDays);
  const bienioPoints = calculateBienioPoints(employee.category, bienios);
  const nextBienioDate = calculateNextBienioDate(periods, totalLeaveDays, bienios);

  const createPeriod = useMutation({
    mutationFn: data => base44.entities.ServicePeriod.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['service-periods', employee.id] });
      recalculate();
      setShowForm(false);
      toast.success('Periodo agregado');
    },
  });

  const recalculate = async () => {
    const allPeriods = await base44.entities.ServicePeriod.filter({ employee_id: employee.id });
    const allLeaves = await base44.entities.LeaveWithoutPay.filter({ employee_id: employee.id });
    const tLeave = allLeaves.reduce((s, l) => s + (l.days_count || 0), 0);
    const eDays = calculateEffectiveDays(allPeriods, tLeave);
    const b = calculateBienios(eDays);
    const bp = calculateBienioPoints(employee.category, b);
    const nbd = calculateNextBienioDate(allPeriods, tLeave, b);
    
    await base44.entities.Employee.update(employee.id, {
      total_experience_days: eDays,
      total_leave_days: tLeave,
      bienios_count: b,
      bienio_points: bp,
      next_bienio_date: nbd,
      total_points: bp + (employee.training_points || 0),
    });
    queryClient.invalidateQueries({ queryKey: ['employee', employee.id] });
  };

  const handleSubmit = () => {
    const start = new Date(form.start_date);
    const end = form.end_date ? new Date(form.end_date) : new Date();
    const days = Math.floor((end - start) / (1000 * 60 * 60 * 24));
    createPeriod.mutate({
      ...form,
      employee_id: employee.id,
      days_count: days,
      is_active: !form.end_date,
    });
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-xs text-slate-400 mb-1">Días Efectivos</p>
            <p className="text-2xl font-bold text-slate-900">{effectiveDays}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-xs text-slate-400 mb-1">Bienios</p>
            <p className="text-2xl font-bold text-indigo-600">{bienios}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-xs text-slate-400 mb-1">Pts. Bienios</p>
            <p className="text-2xl font-bold text-emerald-600">{bienioPoints}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-xs text-slate-400 mb-1">Próx. Bienio</p>
            <p className="text-sm font-semibold text-blue-600">{nextBienioDate || '—'}</p>
          </CardContent>
        </Card>
      </div>

      {totalLeaveDays > 0 && (
        <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800">
          ⚠ Se han descontado <strong>{totalLeaveDays} días</strong> por permisos sin goce de remuneraciones. La fecha del próximo bienio se ha desplazado proporcionalmente.
        </div>
      )}

      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-3">
          <CardTitle className="text-base">Periodos de Servicio</CardTitle>
          <Dialog open={showForm} onOpenChange={setShowForm}>
            <DialogTrigger asChild>
              <Button size="sm" className="bg-indigo-600 hover:bg-indigo-700">
                <Plus className="w-4 h-4 mr-1" /> Agregar
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Nuevo Periodo de Servicio</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 mt-4">
                <div>
                  <Label>Tipo de Periodo</Label>
                  <Select value={form.period_type} onValueChange={v => setForm(p => ({...p, period_type: v}))}>
                    <SelectTrigger><SelectValue placeholder="Seleccionar" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Planta">Planta</SelectItem>
                      <SelectItem value="Plazo Fijo">Plazo Fijo</SelectItem>
                      <SelectItem value="Honorarios">Honorarios</SelectItem>
                      <SelectItem value="Reemplazo">Reemplazo</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
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
                  <Label>Institución</Label>
                  <Input value={form.institution} onChange={e => setForm(p => ({...p, institution: e.target.value}))} />
                </div>
                <div>
                  <Label>N° Resolución</Label>
                  <Input value={form.resolution_number} onChange={e => setForm(p => ({...p, resolution_number: e.target.value}))} />
                </div>
                <Button onClick={handleSubmit} className="w-full bg-indigo-600 hover:bg-indigo-700" disabled={createPeriod.isPending}>
                  {createPeriod.isPending ? 'Guardando...' : 'Guardar Periodo'}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </CardHeader>
        <CardContent>
          {periods.length === 0 ? (
            <p className="text-sm text-slate-400 text-center py-6">Sin periodos registrados</p>
          ) : (
            <div className="space-y-3">
              {periods.map(p => (
                <div key={p.id} className="flex items-center justify-between p-3 rounded-lg bg-slate-50 border border-slate-100">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-indigo-100">
                      <Building2 className="w-4 h-4 text-indigo-600" />
                    </div>
                    <div>
                      <p className="text-sm font-medium">{p.institution || 'APS Panguipulli'}</p>
                      <p className="text-xs text-slate-500">{p.start_date} → {p.end_date || 'Vigente'}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline">{p.period_type}</Badge>
                    <Badge className="bg-slate-100 text-slate-700">{p.days_count || 0} días</Badge>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}