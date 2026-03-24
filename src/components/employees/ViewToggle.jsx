import { Table, Layers } from 'lucide-react';

export default function ViewToggle({ viewMode, onViewChange }) {
  return (
    <div className="flex bg-white shadow-sm border border-slate-200 rounded-lg p-1">
      {[
        { mode: 'table', icon: Table, label: 'Tabla' },
        { mode: 'group', icon: Layers, label: 'Grupos' },
      ].map(({ mode, icon: Icon, label }) => (
        <button
          key={mode}
          onClick={() => onViewChange(mode)}
          title={label}
          className={`px-4 py-2 flex items-center gap-2 text-sm font-semibold rounded-md transition-all duration-300 ${viewMode === mode ? 'bg-indigo-600 text-white shadow-md transform scale-105' : 'bg-transparent text-slate-500 hover:text-indigo-600 hover:bg-indigo-50'}`}
        >
          <Icon className="w-4 h-4" /> {label}
        </button>
      ))}
    </div>
  );
}