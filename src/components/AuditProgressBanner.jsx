import { useAudit } from '@/lib/AuditContext';
import { RefreshCw, CheckCircle2 } from 'lucide-react';

export default function AuditProgressBanner() {
  const { isRunning, progress, stats } = useAudit();

  if (!isRunning && !stats) return null;

  return (
    <div className="fixed bottom-20 right-6 z-50 animate-in fade-in slide-in-from-bottom-5">
      <div className={`
        flex items-center gap-4 p-4 rounded-xl shadow-2xl border 
        ${isRunning ? 'bg-indigo-600 border-indigo-400 text-white' : 'bg-emerald-600 border-emerald-400 text-white'}
      `}>
        <div className="bg-white/20 p-2 rounded-lg">
          {isRunning ? <RefreshCw className="w-5 h-5 animate-spin" /> : <CheckCircle2 className="w-5 h-5" />}
        </div>
        
        <div className="min-w-[180px]">
          <div className="flex justify-between items-end mb-1">
            <p className="text-xs font-bold uppercase tracking-wider opacity-90">
              {isRunning ? 'Recalculando Puntajes...' : 'Recálculo Terminado'}
            </p>
            {isRunning && <span className="text-xs font-mono font-bold">{progress}%</span>}
          </div>
          
          {isRunning ? (
            <div className="w-full bg-white/20 h-1.5 rounded-full overflow-hidden">
              <div 
                className="bg-white h-full transition-all duration-300 ease-out"
                style={{ width: `${progress}%` }}
              />
            </div>
          ) : (
            <p className="text-[10px] font-medium opacity-90">
              Éxito: {stats.ok} | Errores: {stats.errors}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
