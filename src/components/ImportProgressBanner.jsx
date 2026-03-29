import { useImport } from '@/lib/ImportContext';
import { Link } from 'react-router-dom';
import { Loader2, AlertTriangle } from 'lucide-react';

export default function ImportProgressBanner() {
  const { state, validCount, cancelImport } = useImport();
  const { status, currentIndex, ok, failed } = state;

  if (status === 'idle' || status === 'done') return null;

  const total = validCount;
  const progress = total > 0 ? Math.round(((currentIndex + 1) / total) * 100) : 0;

  return (
    <div className="fixed bottom-4 right-4 z-50 w-80 bg-slate-900 text-white rounded-xl shadow-2xl overflow-hidden">
      <div className="p-4">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2 text-sm font-semibold">
            {status === 'running' && <Loader2 className="w-4 h-4 animate-spin text-indigo-400" />}
            {status === 'error' && <AlertTriangle className="w-4 h-4 text-amber-400" />}
            <span>Importación en progreso</span>
          </div>
          <Link to="/ImportModule" className="text-xs text-slate-400 hover:text-white underline">Ver detalle</Link>
        </div>

        {status === 'running' && (
          <>
            <p className="text-xs text-slate-400 mb-2">
              Procesando {currentIndex + 1} de {total} funcionarios...
            </p>
            <div className="w-full bg-slate-700 rounded-full h-1.5">
              <div
                className="bg-indigo-500 h-1.5 rounded-full transition-all duration-300"
                style={{ width: `${progress}%` }}
              />
            </div>
            <div className="flex justify-between text-[10px] text-slate-500 mt-1">
              <span>{ok.length} importados</span>
              <span>{progress}%</span>
            </div>
          </>
        )}

        {status === 'error' && (
          <div className="text-xs text-amber-300">
            Error en "{state.errorInfo?.emp}". <Link to="/ImportModule" className="underline text-white">Ir al módulo</Link> para continuar.
          </div>
        )}
      </div>

      {status === 'running' && (
        <button
          onClick={cancelImport}
          className="w-full py-1.5 bg-slate-800 hover:bg-red-900 text-xs text-slate-400 hover:text-red-300 transition-colors border-t border-slate-700"
        >
          Cancelar importación
        </button>
      )}
    </div>
  );
}