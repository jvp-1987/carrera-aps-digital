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
import { Plus, FileText, FileUp, Pencil, Trash2, FileDown } from 'lucide-react';
import { toast } from 'sonner';
import jsPDF from 'jspdf';

export default function ResolutionsTab({ employee }) {
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
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
        await base44.entities.Employee.update(employee.id, { current_level: parseInt(data.new_level) });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['resolutions', employee.id] });
      queryClient.invalidateQueries({ queryKey: ['employee', employee.id] });
      setShowForm(false);
      setEditingId(null);
      toast.success('Resolución registrada');
    },
  });

  const updateResolution = useMutation({
    mutationFn: ({ id, data }) => base44.entities.Resolution.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['resolutions', employee.id] });
      setShowForm(false);
      setEditingId(null);
      toast.success('Resolución actualizada');
    },
  });

  const deleteResolution = useMutation({
    mutationFn: id => base44.entities.Resolution.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['resolutions', employee.id] });
      toast.success('Resolución eliminada');
    },
  });

  const openEdit = (r) => {
    setEditingId(r.id);
    setForm({
      resolution_number: r.resolution_number || '', resolution_date: r.resolution_date || '',
      type: r.type || '', description: r.description || '',
      previous_level: r.previous_level || '', new_level: r.new_level || '', file_url: r.file_url || '',
    });
    setShowForm(true);
  };

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
    const payload = {
      ...form,
      employee_id: employee.id,
      previous_level: form.previous_level ? parseInt(form.previous_level) : undefined,
      new_level: form.new_level ? parseInt(form.new_level) : undefined,
    };
    if (editingId) {
      updateResolution.mutate({ id: editingId, data: payload });
    } else {
      createResolution.mutate(payload);
    }
  };

  const fmtDate = (d) => {
    if (!d) return '—';
    try { return new Date(d).toLocaleDateString('es-CL', { day: '2-digit', month: 'long', year: 'numeric' }); }
    catch { return d; }
  };

  const generateResolucionPDF = (r) => {
    const doc = new jsPDF({ unit: 'mm', format: 'a4' });
    const pw = 210;
    const ml = 20;
    const mr = 20;
    const cw = pw - ml - mr;
    let y = 20;

    const line = (text, fontSize = 10, style = 'normal', align = 'left', color = [30, 30, 30]) => {
      doc.setFontSize(fontSize);
      doc.setFont('helvetica', style);
      doc.setTextColor(...color);
      if (align === 'center') {
        doc.text(text, pw / 2, y, { align: 'center' });
      } else {
        const lines = doc.splitTextToSize(text, cw);
        doc.text(lines, ml, y);
        y += (lines.length - 1) * (fontSize * 0.4);
      }
      y += fontSize * 0.45;
    };

    const skip = (mm = 4) => { y += mm; };
    const hline = () => {
      doc.setDrawColor(180, 180, 180);
      doc.line(ml, y, pw - mr, y);
      y += 4;
    };

    // Encabezado
    line('MUNICIPALIDAD DE PANGUIPULLI', 13, 'bold', 'center', [30, 60, 140]);
    line('DEPARTAMENTO DE SALUD MUNICIPAL', 10, 'normal', 'center', [80, 80, 80]);
    line('APS PANGUIPULLI — DIRECCIÓN DE SALUD', 9, 'normal', 'center', [120, 120, 120]);
    skip(2);
    hline();

    // Título resolución
    skip(2);
    line(`RESOLUCIÓN EXENTA N° ${r.resolution_number || '___'}`, 14, 'bold', 'center', [30, 60, 140]);
    line(`Panguipulli, ${fmtDate(r.resolution_date)}`, 10, 'normal', 'center');
    skip(4);
    hline();

    // Tipo
    skip(2);
    line('VISTOS:', 10, 'bold');
    skip(1);

    const vistos = {
      'Cambio de Nivel': `Lo dispuesto en la Ley N° 19.378, Estatuto de Atención Primaria de Salud Municipal, y el Reglamento aprobado por Decreto Supremo N° 1.889 de 1995; los antecedentes de carrera funcionaria del/la funcionario/a ${employee.full_name} (RUT ${employee.rut}), quien cumple con los requisitos establecidos para el cambio de nivel en la Categoría ${employee.category};`,
      'Reconocimiento de Bienio': `Lo dispuesto en el Art. 41 de la Ley N° 19.378 sobre reconocimiento de bienios de experiencia; los antecedentes de servicio del/la funcionario/a ${employee.full_name} (RUT ${employee.rut});`,
      'Contrato': `Las facultades que la Ley N° 19.378 otorga al Alcalde; las necesidades de servicio del Departamento de Salud Municipal de Panguipulli;`,
      'Desvinculación': `Las facultades que la Ley N° 19.378 otorga al Alcalde; los antecedentes del/la funcionario/a ${employee.full_name} (RUT ${employee.rut});`,
    };
    const texto = vistos[r.type] || `Los antecedentes del/la funcionario/a ${employee.full_name} (RUT ${employee.rut}) y la normativa vigente Ley N° 19.378;`;
    line(texto, 10);
    skip(4);

    line('CONSIDERANDO:', 10, 'bold');
    skip(1);
    if (r.description) {
      line(r.description, 10);
    } else {
      line(`Que el/la funcionario/a ${employee.full_name}, RUT ${employee.rut}, ${employee.position || 'funcionario/a'} de la Categoría ${employee.category}, Nivel ${employee.current_level}, cumple con los requisitos establecidos en la normativa vigente.`, 10);
    }
    skip(4);

    line('RESUELVO:', 10, 'bold');
    skip(1);

    if (r.type === 'Cambio de Nivel') {
      line(`ARTÍCULO 1°: Ascender, a contar de la fecha de la presente Resolución, al/a la funcionario/a ${employee.full_name}, RUT ${employee.rut}, del Nivel ${r.previous_level || employee.current_level} al Nivel ${r.new_level}, en la Categoría ${employee.category} del Estatuto de Atención Primaria de Salud Municipal (Ley N° 19.378).`, 10);
      skip(3);
      line(`ARTÍCULO 2°: El mayor gasto que irrogue la presente Resolución se imputará al ítem correspondiente del presupuesto vigente del Departamento de Salud Municipal de Panguipulli.`, 10);
    } else if (r.type === 'Reconocimiento de Bienio') {
      line(`ARTÍCULO 1°: Reconocer el bienio de experiencia al/a la funcionario/a ${employee.full_name}, RUT ${employee.rut}, Categoría ${employee.category}, Nivel ${employee.current_level}, según los antecedentes de servicio verificados.`, 10);
    } else {
      line(`ARTÍCULO 1°: ${r.description || `Adoptar las medidas correspondientes respecto del/la funcionario/a ${employee.full_name}, RUT ${employee.rut}, Categoría ${employee.category}, Nivel ${employee.current_level}.`}`, 10);
    }

    skip(4);
    line(`ARTÍCULO FINAL°: Anótese, comuníquese y archívese.`, 10);
    skip(10);
    hline();

    // Firmas
    const sigY = y;
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(60, 60, 60);
    doc.text('_______________________________', ml, sigY);
    doc.text('_______________________________', pw / 2 + 5, sigY);
    doc.text('DIRECTOR/A DE SALUD MUNICIPAL', ml, sigY + 5);
    doc.text('ALCALDE/SA', pw / 2 + 5, sigY + 5);
    doc.text('APS Panguipulli', ml, sigY + 9);
    doc.text('Municipalidad de Panguipulli', pw / 2 + 5, sigY + 9);

    // Pie de página
    doc.setFontSize(7);
    doc.setTextColor(160, 160, 160);
    doc.text(`Generado el ${new Date().toLocaleDateString('es-CL')} — Sistema Carrera APS Digital`, pw / 2, 285, { align: 'center' });

    doc.save(`Resolucion_${r.resolution_number || 'borrador'}_${employee.full_name?.replace(/ /g,'_')}.pdf`);
    toast.success('PDF generado');
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
        <Dialog open={showForm} onOpenChange={(v) => { setShowForm(v); if (!v) setEditingId(null); }}>
          <DialogTrigger asChild>
            <Button size="sm" className="bg-indigo-600 hover:bg-indigo-700">
              <Plus className="w-4 h-4 mr-1" /> Registrar
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{editingId ? 'Editar Resolución' : 'Nueva Resolución'}</DialogTitle>
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
              <Button onClick={handleSubmit} className="w-full bg-indigo-600 hover:bg-indigo-700" disabled={createResolution.isPending || updateResolution.isPending}>
                {(createResolution.isPending || updateResolution.isPending) ? 'Guardando...' : editingId ? 'Guardar Cambios' : 'Registrar Resolución'}
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
                <div className="flex items-center gap-2 flex-wrap">
                  <Badge className={typeColors[r.type] || 'bg-slate-100 text-slate-700'}>{r.type}</Badge>
                  {r.type === 'Cambio de Nivel' && r.new_level && (
                    <Badge variant="outline">→ Nivel {r.new_level}</Badge>
                  )}
                  {r.file_url && (
                    <a href={r.file_url} target="_blank" rel="noopener noreferrer" className="text-indigo-600 text-xs hover:underline">
                      PDF
                    </a>
                  )}
                  <Button size="sm" variant="ghost" className="h-7 px-2 text-slate-400 hover:text-emerald-600 gap-1 text-xs" onClick={() => generateResolucionPDF(r)}>
                    <FileDown className="w-3.5 h-3.5" /> Generar
                  </Button>
                  <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-slate-400 hover:text-indigo-600" onClick={() => openEdit(r)}>
                    <Pencil className="w-3.5 h-3.5" />
                  </Button>
                  <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-slate-400 hover:text-red-500" onClick={() => { if (confirm('¿Eliminar esta resolución?')) deleteResolution.mutate(r.id); }}>
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