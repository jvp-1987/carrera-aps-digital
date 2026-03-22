import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ArrowLeft, Save, AlertTriangle, ExternalLink } from 'lucide-react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';

function normalizeRUT(rut) {
  return (rut || '').toString().replace(/\./g, '').replace(/,/g, '').replace(/\s/g, '').trim().toUpperCase();
}

export default function EmployeeForm() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [form, setForm] = useState({
    rut: '', full_name: '', category: '', current_level: 15,
    position: '', department: '', hire_date: '', contract_type: '',
    email: '', phone: '', status: 'Activo',
  });

  const [duplicateWarning, setDuplicateWarning] = useState(null); // { type: 'rut'|'name', employee }

  const { data: allEmployees = [] } = useQuery({
    queryKey: ['employees-all'],
    queryFn: () => base44.entities.Employee.list('-created_date', 2000),
  });

  const checkDuplicates = (field, value) => {
    if (!value) { setDuplicateWarning(null); return; }
    const normalizedInput = field === 'rut' ? normalizeRUT(value) : value.trim().toLowerCase();
    const match = allEmployees.find(emp => {
      if (field === 'rut') return normalizeRUT(emp.rut) === normalizedInput;
      if (field === 'full_name') return (emp.full_name || '').trim().toLowerCase() === normalizedInput;
      return false;
    });
    setDuplicateWarning(match ? { type: field, employee: match } : null);
  };

  const createMutation = useMutation({
    mutationFn: data => base44.entities.Employee.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['employees'] });
      toast.success('Funcionario creado exitosamente');
      navigate('/Employees');
    },
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    if (duplicateWarning) {
      toast.error(`Ya existe un funcionario con ese ${duplicateWarning.type === 'rut' ? 'RUT' : 'nombre'}. Revise los datos antes de continuar.`);
      return;
    }
    createMutation.mutate({
      ...form,
      current_level: parseInt(form.current_level),
      total_experience_days: 0,
      total_leave_days: 0,
      bienios_count: 0,
      bienio_points: 0,
      training_points: 0,
      postitle_percentage: 0,
      total_points: 0,
    });
  };

  const update = (field, value) => {
    setForm(prev => ({ ...prev, [field]: value }));
    if (field === 'rut' || field === 'full_name') checkDuplicates(field, value);
  };

  return (
    <div className="p-6 lg:p-8 max-w-3xl mx-auto">
      <Button variant="ghost" onClick={() => navigate(-1)} className="mb-4 text-slate-600">
        <ArrowLeft className="w-4 h-4 mr-2" /> Volver
      </Button>

      {duplicateWarning && (
        <div className="mb-4 flex items-start gap-3 bg-amber-50 border border-amber-300 rounded-lg px-4 py-3 text-sm text-amber-800">
          <AlertTriangle className="w-5 h-5 text-amber-500 mt-0.5 shrink-0" />
          <div>
            <p className="font-semibold">Funcionario duplicado detectado</p>
            <p className="mt-0.5">
              Ya existe un funcionario con ese {duplicateWarning.type === 'rut' ? 'RUT' : 'nombre'}:{' '}
              <strong>{duplicateWarning.employee.full_name}</strong> — {duplicateWarning.employee.rut}
              {' '}(Cat. {duplicateWarning.employee.category}, Nivel {duplicateWarning.employee.current_level}).
            </p>
            <Link to={`/EmployeeProfile?id=${duplicateWarning.employee.id}`} className="inline-flex items-center gap-1 mt-1 text-amber-700 underline font-medium hover:text-amber-900">
              <ExternalLink className="w-3.5 h-3.5" /> Ver perfil existente
            </Link>
          </div>
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Nuevo Funcionario</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <Label>RUT *</Label>
                <Input placeholder="12.345.678-9" value={form.rut} onChange={e => update('rut', e.target.value)} required />
              </div>
              <div>
                <Label>Nombre Completo *</Label>
                <Input placeholder="Nombre Apellido" value={form.full_name} onChange={e => update('full_name', e.target.value)} required />
              </div>
              <div>
                <Label>Categoría *</Label>
                <Select value={form.category} onValueChange={v => update('category', v)} required>
                  <SelectTrigger><SelectValue placeholder="Seleccionar" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="A">A — Médicos</SelectItem>
                    <SelectItem value="B">B — Profesionales</SelectItem>
                    <SelectItem value="C">C — Técnicos</SelectItem>
                    <SelectItem value="D">D — Técnicos Salud</SelectItem>
                    <SelectItem value="E">E — Administrativos</SelectItem>
                    <SelectItem value="F">F — Auxiliares</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Nivel Inicial</Label>
                <Input type="number" min={1} max={15} value={form.current_level} onChange={e => update('current_level', e.target.value)} />
              </div>
              <div>
                <Label>Cargo</Label>
                <Input placeholder="Cargo" value={form.position} onChange={e => update('position', e.target.value)} />
              </div>
              <div>
                <Label>Departamento / Establecimiento</Label>
                <Input placeholder="Unidad" value={form.department} onChange={e => update('department', e.target.value)} />
              </div>
              <div>
                <Label>Fecha de Ingreso</Label>
                <Input type="date" value={form.hire_date} onChange={e => update('hire_date', e.target.value)} />
              </div>
              <div>
                <Label>Tipo de Contrato</Label>
                <Select value={form.contract_type} onValueChange={v => update('contract_type', v)}>
                  <SelectTrigger><SelectValue placeholder="Seleccionar" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Planta">Planta</SelectItem>
                    <SelectItem value="Plazo Fijo">Plazo Fijo</SelectItem>
                    <SelectItem value="Honorarios">Honorarios</SelectItem>
                    <SelectItem value="Reemplazo">Reemplazo</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Email</Label>
                <Input type="email" placeholder="correo@ejemplo.cl" value={form.email} onChange={e => update('email', e.target.value)} />
              </div>
              <div>
                <Label>Teléfono</Label>
                <Input placeholder="+56 9 1234 5678" value={form.phone} onChange={e => update('phone', e.target.value)} />
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-4 border-t">
              <Button type="button" variant="outline" onClick={() => navigate(-1)}>Cancelar</Button>
              <Button type="submit" className={`${duplicateWarning ? 'bg-amber-600 hover:bg-amber-700' : 'bg-indigo-600 hover:bg-indigo-700'}`} disabled={createMutation.isPending}>
                <Save className="w-4 h-4 mr-2" />
                {createMutation.isPending ? 'Guardando...' : duplicateWarning ? '⚠ Guardar de todas formas' : 'Guardar Funcionario'}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}