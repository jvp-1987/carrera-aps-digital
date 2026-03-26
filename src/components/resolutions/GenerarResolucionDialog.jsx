import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { FileDown, Loader2, CheckCircle, AlertTriangle, FileText } from 'lucide-react';
import { generarResolucionPDF } from '@/lib/resolutionPDF';
import { toast } from 'sonner';

const TYPE_LABELS = {
  'Cambio de Nivel':           { icon: '📈', desc: 'Cambio en el escalafón con actualización salarial y puntaje de carrera.' },
  'Reconocimiento de Bienio':  { icon: '🗓️', desc: 'Reconocimiento de bienio por dos años de servicios computables.' },
  'Contrato':                  { icon: '📋', desc: 'Nombramiento o contrato de funcionario con detalle de remuneración.' },
  'Asignación de Postítulo':   { icon: '🎓', desc: 'Reconocimiento de asignación de postítulo según Art. 37 Ley 19.378.' },
  'Desvinculación':            { icon: '📤', desc: 'Término de contrato o desvinculación del funcionario.' },
  'Otro':                      { icon: '📄', desc: 'Acto administrativo general de Recursos Humanos.' },
};

const STATUS_COLORS = {
  'Borrador':  'bg-slate-100 text-slate-600',
  'Firmada':   'bg-blue-100 text-blue-700',
  'Publicada': 'bg-emerald-100 text-emerald-700',
};

export default function GenerarResolucionDialog({ open, onOpenChange, resolution, employee }) {
  const [generating, setGenerating] = useState(false);
  const [done, setDone] = useState(false);

  if (!resolution) return null;

  const meta = TYPE_LABELS[resolution.type] || TYPE_LABELS['Otro'];
  const hasEmployee = !!employee;

  const handleGenerar = () => {
    setGenerating(true);
    setDone(false);
    setTimeout(() => {
      generarResolucionPDF({ resolution, employee: employee || { full_name: '—', rut: '—', category: '—', position: '—', department: '—' } });
      setGenerating(false);
      setDone(true);
      toast.success('PDF generado y descargado correctamente');
    }, 400);
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) setDone(false); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="w-5 h-5 text-indigo-600" />
            Generar Resolución PDF
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 pt-1">
          {/* Tipo */}
          <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-4">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xl">{meta.icon}</span>
              <p className="font-semibold text-indigo-800 text-sm">{resolution.type}</p>
            </div>
            <p className="text-xs text-indigo-600">{meta.desc}</p>
          </div>

          {/* Datos resolución */}
          <div className="space-y-2 text-sm">
            <div className="flex justify-between items-center py-1.5 border-b border-slate-100">
              <span className="text-slate-500">N° Resolución</span>
              <span className="font-semibold text-slate-800">{resolution.resolution_number}</span>
            </div>
            <div className="flex justify-between items-center py-1.5 border-b border-slate-100">
              <span className="text-slate-500">Fecha</span>
              <span className="font-semibold text-slate-800">{resolution.resolution_date}</span>
            </div>
            <div className="flex justify-between items-center py-1.5 border-b border-slate-100">
              <span className="text-slate-500">Estado</span>
              <Badge className={STATUS_COLORS[resolution.status] || 'bg-slate-100 text-slate-600'}>
                {resolution.status}
              </Badge>
            </div>
            {resolution.type === 'Cambio de Nivel' && resolution.new_level && (
              <div className="flex justify-between items-center py-1.5 border-b border-slate-100">
                <span className="text-slate-500">Cambio de Nivel</span>
                <span className="font-semibold text-slate-800">
                  {resolution.previous_level} → {resolution.new_level}
                </span>
              </div>
            )}
          </div>

          {/* Funcionario */}
          {hasEmployee ? (
            <div className="flex items-center gap-3 bg-slate-50 rounded-xl p-3 border border-slate-200">
              <div className="w-9 h-9 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-700 font-bold text-sm flex-shrink-0">
                {employee.full_name?.charAt(0)}
              </div>
              <div className="min-w-0">
                <p className="font-semibold text-slate-800 text-sm truncate">{employee.full_name}</p>
                <p className="text-xs text-slate-500">{employee.rut} · Cat. {employee.category} · Nivel {employee.current_level}</p>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-2 p-3 bg-amber-50 border border-amber-200 rounded-xl">
              <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0" />
              <p className="text-xs text-amber-700">Sin funcionario asociado. El documento se generará con campos en blanco.</p>
            </div>
          )}

          {/* Success */}
          {done && (
            <div className="flex items-center gap-2 p-3 bg-emerald-50 border border-emerald-200 rounded-xl">
              <CheckCircle className="w-4 h-4 text-emerald-600 flex-shrink-0" />
              <p className="text-xs text-emerald-700 font-medium">PDF descargado exitosamente. Revisa tu carpeta de descargas.</p>
            </div>
          )}

          {/* Botones */}
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="outline" onClick={() => onOpenChange(false)}>Cerrar</Button>
            <Button onClick={handleGenerar} disabled={generating} className="gap-2">
              {generating ? (
                <><Loader2 className="w-4 h-4 animate-spin" /> Generando...</>
              ) : (
                <><FileDown className="w-4 h-4" /> {done ? 'Descargar de nuevo' : 'Generar y Descargar PDF'}</>
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}