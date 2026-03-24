import fs from 'fs';
import * as XLSX from 'xlsx';

const filePath = '/Users/juanvidalp/Downloads/CarreraFuncionaria_Todos_20260321-2.xlsx';
const fileData = fs.readFileSync(filePath);
const wb = XLSX.read(fileData, { type: 'buffer', cellDates: false });
const names = wb.SheetNames.filter(n => n !== 'Sheet' && n.trim() !== '');

const norm = (s) => (s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();

function findHeaders() {
  for (const name of names) {
    const sheet = wb.Sheets[name];
    if (!sheet || !sheet['!ref']) continue;
    const range = XLSX.utils.decode_range(sheet['!ref']);
    for (let r = 0; r <= range.e.r; r++) {
      for (let c = 0; c <= range.e.c; c++) {
        const cell = sheet[XLSX.utils.encode_cell({ c, r })];
        if (cell && cell.v) {
            const val = norm(String(cell.v));
            if (val.includes('permiso') || val.includes('goce') || val.includes('licencia') || val.includes('remuneraci')) {
                console.log(`[hoja: ${name}, celda: r${r}, c${c}] -> ${cell.v}`);
            }
        }
      }
    }
  }
}
findHeaders();
