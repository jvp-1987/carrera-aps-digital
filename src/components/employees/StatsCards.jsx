import { motion } from 'framer-motion';
import { Card, CardContent } from '@/components/ui/card';
import { Users, Briefcase, BarChart3 } from 'lucide-react';

export default function StatsCards({ stats }) {
  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.1 }}
      className="grid grid-cols-1 md:grid-cols-3 gap-6"
    >
      {/* Card Total */}
      <Card className="border-none shadow-xl bg-gradient-to-br from-indigo-500 via-indigo-600 to-violet-700 text-white overflow-hidden relative group">
        <div className="absolute -right-6 -top-6 opacity-10 transform group-hover:scale-110 transition-transform duration-500"><Users className="w-40 h-40" /></div>
        <CardContent className="p-6 relative z-10">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-indigo-100 uppercase tracking-widest text-[10px] font-bold mb-2">Total Funcionarios</p>
              <p className="text-5xl font-black tracking-tighter drop-shadow-md">{stats.total}</p>
              <div className="mt-4 flex items-center gap-2">
                <span className="bg-white/20 backdrop-blur-md px-2.5 py-1 rounded-md text-xs font-semibold shadow-sm border border-white/10">{stats.active} activos</span>
              </div>
            </div>
            <div className="bg-white/20 p-3.5 rounded-2xl backdrop-blur-md shadow-inner border border-white/20">
              <Users className="w-7 h-7 text-white" />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Card Categorías */}
      <Card className="border-none shadow-xl bg-gradient-to-br from-teal-400 via-emerald-500 to-emerald-600 text-white overflow-hidden relative group">
        <div className="absolute -right-6 -top-6 opacity-10 transform group-hover:scale-110 transition-transform duration-500"><Briefcase className="w-40 h-40" /></div>
        <CardContent className="p-6 relative z-10">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-emerald-50 uppercase tracking-widest text-[10px] font-bold mb-2">Categorías</p>
              <p className="text-5xl font-black tracking-tighter drop-shadow-md">{stats.categories.length}</p>
              <div className="mt-4 flex items-center gap-2">
                <span className="bg-white/20 backdrop-blur-md px-2.5 py-1 rounded-md text-xs font-semibold shadow-sm border border-white/10">Grupos Profesionales</span>
              </div>
            </div>
            <div className="bg-white/20 p-3.5 rounded-2xl backdrop-blur-md shadow-inner border border-white/20">
              <Briefcase className="w-7 h-7 text-white" />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Card Distribución */}
      <Card className="border-none shadow-xl bg-gradient-to-br from-orange-400 via-pink-500 to-rose-500 text-white overflow-hidden relative group">
        <div className="absolute -right-6 -top-6 opacity-10 transform group-hover:scale-110 transition-transform duration-500"><BarChart3 className="w-40 h-40" /></div>
        <CardContent className="p-6 relative z-10 flex flex-col justify-between h-full">
          <div className="flex items-start justify-between mb-4">
            <p className="text-orange-50 uppercase tracking-widest text-[10px] font-bold">Distribución</p>
            <div className="bg-white/20 p-2.5 rounded-2xl backdrop-blur-md shadow-inner border border-white/20 shrink-0">
              <BarChart3 className="w-5 h-5 text-white" />
            </div>
          </div>
          
          <div className="w-full">
            <div className="flex gap-1 h-5 bg-black/10 rounded-full w-full backdrop-blur-sm p-1 shadow-inner overflow-hidden">
              {stats.categories.map(cat => (
                <div 
                  key={cat.cat} 
                  title={`${cat.label}: ${cat.count}`} 
                  className="h-full rounded-full bg-white/90 hover:bg-white transition-all cursor-pointer" 
                  style={{ width: `${(cat.count / stats.total) * 100}%` }} 
                />
              ))}
            </div>
            <p className="text-pink-100 text-[10px] uppercase tracking-wider mt-3 font-semibold text-right">Por Categoría</p>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}