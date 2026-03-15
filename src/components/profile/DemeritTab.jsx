import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { AlertTriangle, Plus, FileText, Clock, XCircle } from 'lucide-react';
import { toast } from 'sonner';

const TYPE_CONFIG = {
  'Atraso':                   { color: 'bg-amber-100 text-amber-700',   defaultScore: -0.5, icon: Clock },
  'Ausencia Injustificada':   { color: 'bg-orange-100 text-orange-700', defaultScore: -2,   icon: XCircle },
  'Incumplimiento de Funciones': { color: 'bg-red-100 text-red-700',   defaultScore: -3,   icon: AlertTriangle },
  'Conducta Indebida':        { color: 'bg-red-200 text-red-800',       defaultScore: -5,   icon: AlertTriangle },
  'Abandono de Trabajo':      { color: 'bg-rose-200 text-rose-800',     defaultScore: -8,   icon: XCircle },
  'Otro':                     { color: 'bg-slate-100 text-slate-600',   defaultScore: -1,   icon: FileText },
};

const STATUS_COLOR = {
  'Vigente': 'bg-red-100 text-red-700',
  'Apelada': 'bg-amber-100 text-amber-700',
  'Anulada': 'bg-slate-100 text-slate-400 line-through',
};

const EMPTY_FORM = {
  type: 'Atraso',
  date: '',
  minutes_late: '',
  description: '',
  impact_score: -0.5,
  resolution_number: '',
  status: 'Vigente',
};

export default function DemeritTab({ employee }) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [file, setFile] = useState(null);
  const [uploading, setUploading] = useState(false);

  const { data: notes = [], isLoading } = useQuery({
    queryKey: ['demerit_notes', employee.id],
    queryFn: () => base44.entities.DemeritNote.filter({ employee_id: employee.id }, '-date'),
    enabled: !!employee.id,
  });

  const createMutation = useMutation({
    mutationFn: (data) => base44.entities.DemeritNote.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['demerit_notes', employee.id] });
      toast.success('Anotación de demérito registrada');
      setOpen(false);
      setForm(EMPTY_FORM);
      setFile(null);
    },
  });

  const updateStatusMutation = useMutation({
    mutationFn: ({ id, status }) => base44.entities.DemeritNote.update(id, { status }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['demerit_notes', employee.id] });
      toast.success('Estado actualizado');
    },
  });

  const handleTypeChange = (type) => {
    const cfg = TYPE_CONFIG[type] || TYPE_CONFIG['Otro'];
    setForm(f => ({ ...f, type, impact_score: cfg.defaultScore }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setUploading(true);
    let fileUrl = null;
    if (file) {
      const res = await base44.integrations.Core.UploadFile({ file });
      fileUrl = res.file_url;
    }
    createMutation.mutate({
      ...form,
      employee_id: employee.id,
      minutes_late: form.type === 'Atraso' ? Number(form.minutes_late) : undefined,
      impact_score: Number(form.impact_score),
      resolution_file_url: fileUrl || undefined,
      registered_by: (await base44.auth.me())?.email,
    });
    setUploading(false);
  };

  const activeNotes = notes.filter(n => n.status !== 'Anulada');
  const totalImpact = activeNotes.reduce((s, n) => s + (n.impact_score || 0), 0);
  const lateCount = activeNotes.filter(n => n.type === 'Atraso').length;
  const totalMinutes = activeNotes.filter(n => n.type === 'Atraso').reduce((s, n) => s + (n.minutes_late || 0), 0);

  return (
    <div className="space-y-4">
      {/* Summary */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <Card className="border-red-200 bg-red-50">
          <CardContent className="p-4 text-center">
            <p className="text-xs text-red-500 font-semibold uppercase tracking-wider">Total Anotaciones</p>
            <p className="text-3xl font-bold text-red-700 mt-1">{activeNotes.length}</p>
            <p className="text-xs text-red-400 mt-0.5">vigentes</p>
          </CardContent>
        </Card>
        <Card className="border-amber-200 bg-amber-50">
          <CardContent className="p-4 text-center">
            <p className="text-xs text-amber-600 font-semibold uppercase tracking-wider">Atrasos</p>
            <p className="text-3xl font-bold text-amber-700 mt-1">{lateCount}</p>
            <p className="text-xs text-amber-500 mt-0.5">{totalMinutes} min acumulados</p>
          </CardContent>
        </Card>
        <Card className="border-slate-200">
          <CardContent className="p-4 text-center">
            <p className="text-xs text-slate-500 font-semibold uppercase tracking-wider">Impacto en Puntaje</p>
            <p className={`text-3xl font-bold mt-1 ${totalImpact < 0 ? 'text-red-600' : 'text-slate-500'}`}>{totalImpact}</p>
            <p className="text-xs text-slate-400 mt-0.5">puntos descontados</p>
          </CardContent>
        </Card>
      </div>

      {/* Header + Add button */}
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-slate-700 text-sm">Historial de Anotaciones</h3>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm" className="bg-red-600 hover:bg-red-700">
              <Plus className="w-4 h-4 mr-1" /> Nueva Anotación
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-red-600" />
                Registrar Anotación de Demérito
              </DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Tipo de Falta *</Label>
                  <Select value={form.type} onValueChange={handleTypeChange}>
                    <SelectTrigger className="mt-1">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.keys(TYPE_CONFIG).map(t => (
                        <SelectItem key={t} value={t}>{t}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Fecha *</Label>
                  <Input type="date" className="mt-1" value={form.date}
                    onChange={e => setForm(f => ({ ...f, date: e.target.value }))} required />
                </div>
              </div>

              {form.type === 'Atraso' && (
                <div>
                  <Label>Minutos de Atraso</Label>
                  <Input type="number" min={1} className="mt-1" placeholder="Ej: 20"
                    value={form.minutes_late}
                    onChange={e => setForm(f => ({ ...f, minutes_late: e.target.value }))} />
                </div>
              )}

              <div>
                <Label>Descripción</Label>
                <Textarea className="mt-1" rows={3} placeholder="Detalle de la falta..."
                  value={form.description}
                  onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Puntaje Demérito</Label>
                  <Input type="number" step="0.5" className="mt-1"
                    value={form.impact_score}
                    onChange={e => setForm(f => ({ ...f, impact_score: e.target.value }))} />
                  <p className="text-xs text-slate-400 mt-0.5">Valor negativo (ej: -2)</p>
                </div>
                <div>
                  <Label>N° Resolución / Acto</Label>
                  <Input className="mt-1" placeholder="Opcional"
                    value={form.resolution_number}
                    onChange={e => setForm(f => ({ ...f, resolution_number: e.target.value }))} />
                </div>
              </div>

              <div>
                <Label>Documento de Respaldo (PDF)</Label>
                <Input type="file" accept=".pdf,.doc,.docx" className="mt-1"
                  onChange={e => setFile(e.target.files[0])} />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
                <Button type="submit" className="bg-red-600 hover:bg-red-700"
                  disabled={createMutation.isPending || uploading}>
                  {createMutation.isPending || uploading ? 'Guardando...' : 'Registrar Anotación'}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* List */}
      {isLoading ? (
        <div className="flex justify-center py-8">
          <div className="w-6 h-6 border-4 border-slate-200 border-t-red-500 rounded-full animate-spin" />
        </div>
      ) : notes.length === 0 ? (
        <div className="text-center py-10 text-slate-400">
          <AlertTriangle className="w-8 h-8 mx-auto mb-2 opacity-30" />
          <p className="text-sm">Sin anotaciones de demérito registradas</p>
        </div>
      ) : (
        <div className="space-y-2">
          {notes.map(note => {
            const cfg = TYPE_CONFIG[note.type] || TYPE_CONFIG['Otro'];
            const Icon = cfg.icon;
            return (
              <Card key={note.id} className={note.status === 'Anulada' ? 'opacity-50' : ''}>
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3 flex-1 min-w-0">
                      <div className={`p-2 rounded-lg ${cfg.color} flex-shrink-0`}>
                        <Icon className="w-4 h-4" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <Badge className={cfg.color}>{note.type}</Badge>
                          <Badge className={STATUS_COLOR[note.status]}>{note.status}</Badge>
                          <span className="text-xs text-slate-400">{note.date}</span>
                          {note.type === 'Atraso' && note.minutes_late && (
                            <span className="text-xs text-amber-600 font-medium">{note.minutes_late} min</span>
                          )}
                          {note.impact_score && (
                            <span className="text-xs font-bold text-red-600">{note.impact_score} pts</span>
                          )}
                        </div>
                        {note.description && (
                          <p className="text-sm text-slate-600 mt-1 leading-snug">{note.description}</p>
                        )}
                        <div className="flex items-center gap-3 mt-1">
                          {note.resolution_number && (
                            <span className="text-xs text-slate-400">Res. {note.resolution_number}</span>
                          )}
                          {note.resolution_file_url && (
                            <a href={note.resolution_file_url} target="_blank" rel="noopener noreferrer"
                              className="text-xs text-indigo-600 hover:underline">
                              Ver documento
                            </a>
                          )}
                          {note.registered_by && (
                            <span className="text-xs text-slate-300">Registrado por: {note.registered_by}</span>
                          )}
                        </div>
                      </div>
                    </div>
                    {note.status === 'Vigente' && (
                      <div className="flex gap-1 flex-shrink-0">
                        <Button size="sm" variant="outline" className="text-xs h-7 px-2"
                          onClick={() => updateStatusMutation.mutate({ id: note.id, status: 'Apelada' })}>
                          Apelar
                        </Button>
                        <Button size="sm" variant="outline" className="text-xs h-7 px-2 text-slate-400 hover:text-red-500"
                          onClick={() => updateStatusMutation.mutate({ id: note.id, status: 'Anulada' })}>
                          Anular
                        </Button>
                      </div>
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