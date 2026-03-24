import fs from 'fs';
import * as XLSX from 'xlsx';

const filePath = '/Users/juanvidalp/Downloads/CarreraFuncionaria_Todos_20260321-2.xlsx';
const fileData = fs.readFileSync(filePath);
const wb = XLSX.read(fileData, { type: 'buffer', cellDates: false });
const names = wb.SheetNames.filter(n => n !== 'Sheet' && n.trim() !== '');

const norm = (s) => (s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();

function findPermisos() {
  const results = [];
  
  for (const name of names) {
    const sheet = wb.Sheets[name];
    if (!sheet || !sheet['!ref']) continue;
    const range = XLSX.utils.decode_range(sheet['!ref']);
    
    let hasPermiso = false;
    let totalDias = 0;
    
    for (let r = 0; r <= range.e.r; r++) {
      const c0 = sheet[XLSX.utils.encode_cell({ c: 0, r })];
      if (c0 && c0.v) {
        const val = norm(String(c0.v));
        if (val.includes('permiso sin goce')) {
            hasPermiso = true;
            
            // Generally columns 3, 4, 5 are Anos, Meses, Dias
            // We just sum any negative numbers found in the row
            let diasFila = 0;
            const c3 = sheet[XLSX.utils.encode_cell({ c: 3, r })];
            const c4 = sheet[XLSX.utils.encode_cell({ c: 4, r })];
            const c5 = sheet[XLSX.utils.encode_cell({ c: 5, r })];
            
            const anos = c3 && c3.v ? parseInt(c3.v) : 0;
            const meses = c4 && c4.v ? parseInt(c4.v) : 0;
            const dias = c5 && c5.v ? parseInt(c5.v) : 0;
            
            // Los valores son negativos, los pasamos a positivos
            diasFila += Math.abs(anos) * 365;
            diasFila += Math.abs(meses) * 30;
            diasFila += Math.abs(dias);
            
            totalDias += diasFila;
        }
      }
    }
    
    if (hasPermiso && totalDias > 0) {
        results.push({ funcionario: name, dias: totalDias });
    }
  }
  
  console.log(`\n\n=== REPORTE DE PERMISOS SIN GOCE ===`);
  console.log(`Se encontraron ${results.length} funcionarios con descuentos por permisos sin goce:\n`);
  
  results.forEach((r, i) => {
      console.log(`${i+1}. ${r.funcionario} -> Total descontado: ${r.dias} días aprox.`);
  });
  console.log('====================================\n');
}

findPermisos();
