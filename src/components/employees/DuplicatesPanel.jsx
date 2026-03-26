import { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { AlertTriangle } from 'lucide-react';

export default function DuplicatesPanel({ employees, onDelete }) {
  const duplicates = useMemo(() => {
    const seen = new Map();
    const dups = [];
    
    employees.forEach(emp => {
      const key = `${emp.rut}-${emp.name}`;
      if (seen.has(key)) {
        if (!dups.some(d => d.key === key)) {
          dups.push({ key, employees: [seen.get(key), emp] });
        } else {
          dups.find(d => d.key === key).employees.push(emp);
        }
      } else {
        seen.set(key, emp);
      }
    });
    
    return dups;
  }, [employees]);

  if (duplicates.length === 0) return null;

  return (
    <Card className="border-amber-200 bg-amber-50">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-amber-800">
          <AlertTriangle className="w-5 h-5" />
          Duplicados Encontrados ({duplicates.length})
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {duplicates.map((dup, idx) => (
            <div key={idx} className="border border-amber-200 rounded-lg p-4 bg-white">
              <div className="flex items-center justify-between mb-2">
                <Badge variant="outline" className="border-amber-300 text-amber-700">
                  {dup.employees.length} duplicados
                </Badge>
              </div>
              <div className="space-y-2">
                {dup.employees.map((emp, i) => (
                  <div key={emp.id} className="flex items-center justify-between p-2 bg-amber-50 rounded">
                    <div>
                      <span className="font-medium">{emp.name}</span>
                      <span className="text-sm text-gray-600 ml-2">{emp.rut}</span>
                    </div>
                    <button
                      onClick={() => onDelete(emp)}
                      className="text-red-600 hover:text-red-800 text-sm underline"
                    >
                      Eliminar
                    </button>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}