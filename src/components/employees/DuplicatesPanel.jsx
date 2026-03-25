import { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Copy, Trash2 } from 'lucide-react';
import { normalizeRUT } from './categoryUtils';

export default function DuplicatesPanel({ employees, onDelete }) {
  const duplicates = useMemo(() => {
    const seen = {};
    const dupes = [];
    employees.forEach(emp => {
      const key = normalizeRUT(emp.rut);
      if (!key) return;
      if (!seen[key]) {
        seen[key] = emp;
      } else {
        dupes.push({ original: seen[key], duplicate: emp });
      }
    });
    return dupes;
  }, [employees]);

  if (duplicates.length === 0) return null;

  return (
    <Card className="border-orange-200 bg-orange-50">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2 text-orange-800">
          <Copy className="w-4 h-4" /> {duplicates.length} RUT(s) duplicado(s) detectado(s)
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {duplicates.map(({ original, duplicate }) => (
          <div key={duplicate.id} className="flex items-center justify-between bg-white border border-orange-200 rounded-lg px-3 py-2 text-xs">
            <div>
              <span className="font-semibold text-slate-800">{duplicate.full_name}</span>
              <span className="ml-2 text-slate-500 font-mono">{duplicate.rut}</span>
              <Badge className="ml-2 bg-orange-100 text-orange-700 text-[10px]">Duplicado de: {original.full_name}</Badge>
            </div>
            <Button size="sm" variant="destructive" className="h-6 text-[11px]" onClick={() => onDelete(duplicate)}>
              <Trash2 className="w-3 h-3 mr-1" /> Eliminar
            </Button>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}