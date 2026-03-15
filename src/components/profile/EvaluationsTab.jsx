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
import { Plus, Star, FileUp } from 'lucide-react';
import { toast } from 'sonner';

export default function EvaluationsTab({ employee }) {
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [form, setForm] = useState({
    evaluation_year: new Date().getFullYear(), period_start: '', period_end: '',
    score: '', rating: '', evaluator: '', observations: '',
    resolution_number: '', file_url: '',
  });

  const { data: evaluations = [] } = useQuery({
    queryKey: ['evaluations', employee.id],
    queryFn: () => base44.entities.PerformanceEvaluation.filter({ employee_id: employee.id }),
  });

  const createEval = useMutation({
    mutationFn: data => base44.entities.PerformanceEvaluation.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['evaluations', employee.id] });
      setShowForm(false);
      toast.success('Calificación registrada');
    },
  });

  const handleFileUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    const { file_url } = await base44.integrations.Core.UploadFile({ file });
    setForm(p => ({ ...p, file_url }));
    setUploading(false);
  };

  const handleSubmit = () => {
    createEval.mutate({
      ...form,
      employee_id: employee.id,
      evaluation_year: parseInt(form.evaluation_year),
      score: parseFloat(form.score),
    });
  };

  const ratingColors = {
    'Lista 1 - Distinción': 'bg-emerald-100 text-emerald-700',
    'Lista 2 - Buena': 'bg-blue-100 text-blue-700',
    'Lista 3 - Condicional': 'bg-amber-100 text-amber-700',
    'Lista 4 - Eliminación': 'bg-red-100 text-red-700',
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-3">
        <CardTitle className="text-base">Historial de Calificaciones</CardTitle>
        <Dialog open={showForm} onOpenChange={setShowForm}>
          <DialogTrigger asChild>
            <Button size="sm" className="bg-indigo-600 hover:bg-indigo-700">
              <Plus className="w-4 h-4 mr-1" /> Registrar
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Nueva Calificación</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 mt-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Año</Label>
                  <Input type="number" value={form.evaluation_year} onChange={e => setForm(p => ({...p, evaluation_year: e.target.value}))} />
                </div>
                <div>
                  <Label>Puntaje</Label>
                  <Input type="number" step={0.1} value={form.score} onChange={e => setForm(p => ({...p, score: e.target.value}))} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Inicio Periodo</Label>
                  <Input type="date" value={form.period_start} onChange={e => setForm(p => ({...p, period_start: e.target.value}))} />
                </div>
                <div>
                  <Label>Fin Periodo</Label>
                  <Input type="date" value={form.period_end} onChange={e => setForm(p => ({...p, period_end: e.target.value}))} />
                </div>
              </div>
              <div>
                <Label>Calificación *</Label>
                <Select value={form.rating} onValueChange={v => setForm(p => ({...p, rating: v}))}>
                  <SelectTrigger><SelectValue placeholder="Seleccionar" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Lista 1 - Distinción">Lista 1 — Distinción</SelectItem>
                    <SelectItem value="Lista 2 - Buena">Lista 2 — Buena</SelectItem>
                    <SelectItem value="Lista 3 - Condicional">Lista 3 — Condicional</SelectItem>
                    <SelectItem value="Lista 4 - Eliminación">Lista 4 — Eliminación</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Evaluador</Label>
                <Input value={form.evaluator} onChange={e => setForm(p => ({...p, evaluator: e.target.value}))} />
              </div>
              <div>
                <Label>Observaciones</Label>
                <Textarea value={form.observations} onChange={e => setForm(p => ({...p, observations: e.target.value}))} />
              </div>
              <div>
                <Label>N° Resolución</Label>
                <Input value={form.resolution_number} onChange={e => setForm(p => ({...p, resolution_number: e.target.value}))} />
              </div>
              <div>
                <Label>Archivo Adjunto</Label>
                <label className="flex items-center gap-2 px-4 py-2 border-2 border-dashed border-slate-300 rounded-lg cursor-pointer hover:border-indigo-400 mt-1">
                  <FileUp className="w-4 h-4 text-slate-400" />
                  <span className="text-sm text-slate-500">
                    {uploading ? 'Subiendo...' : form.file_url ? '✓ Archivo cargado' : 'Seleccionar archivo'}
                  </span>
                  <input type="file" accept=".pdf" className="hidden" onChange={handleFileUpload} />
                </label>
              </div>
              <Button onClick={handleSubmit} className="w-full bg-indigo-600 hover:bg-indigo-700" disabled={createEval.isPending}>
                {createEval.isPending ? 'Guardando...' : 'Registrar Calificación'}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </CardHeader>
      <CardContent>
        {evaluations.length === 0 ? (
          <p className="text-sm text-slate-400 text-center py-6">Sin calificaciones registradas</p>
        ) : (
          <div className="space-y-3">
            {evaluations.map(ev => (
              <div key={ev.id} className="flex items-center justify-between p-3 rounded-lg bg-slate-50 border border-slate-100">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-amber-100">
                    <Star className="w-4 h-4 text-amber-600" />
                  </div>
                  <div>
                    <p className="text-sm font-medium">Periodo {ev.evaluation_year}</p>
                    <p className="text-xs text-slate-500">Puntaje: {ev.score} — Evaluador: {ev.evaluator || '—'}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge className={ratingColors[ev.rating] || 'bg-slate-100 text-slate-700'}>{ev.rating}</Badge>
                  {ev.file_url && (
                    <a href={ev.file_url} target="_blank" rel="noopener noreferrer" className="text-indigo-600 text-xs hover:underline">
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