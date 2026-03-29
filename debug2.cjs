const XLSX = require('xlsx');

function norm(v, isNationality) {
  let val = (v ?? '').toString().trim().toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ');
  if (isNationality && ['chile','chilena','chileno','chilenos','chilenas'].includes(val)) return 'chilena';
  return val;
}
function normRut(v) {
  return (v ?? '').toString().replace(/\./g,'').replace(/-/g,'').replace(/\s/g,'').toUpperCase();
}
function toISODate(v) {
  if (!v && v !== 0) return '';
  if (typeof v === 'number') {
    const date = new Date(Math.round((v - 25569) * 86400 * 1000));
    date.setUTCHours(date.getUTCHours() + 12);
    return date.getUTCFullYear() + '-' + String(date.getUTCMonth()+1).padStart(2,'0') + '-' + String(date.getUTCDate()).padStart(2,'0');
  }
  const s = String(v).trim();
  const dmy = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (dmy) return dmy[3]+'-'+dmy[2].padStart(2,'0')+'-'+dmy[1].padStart(2,'0');
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  return s;
}

const wb = XLSX.readFile('BASE DATOS MODO APS.xlsx');
const ws = wb.Sheets[wb.SheetNames[0]];
const allRows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });

let headerIndex = -1;
for (let i = 0; i < 25; i++) {
  const row = allRows[i].map(c => norm(c));
  if (row.some(c => c.includes('rut') || c.includes('nombre') || c.includes('nacimiento'))) {
    headerIndex = i; break;
  }
}

const headers = allRows[headerIndex];
const rows = allRows.slice(headerIndex + 1)
  .filter(r => r.some(c => c !== ''))
  .map(r => { const obj = {}; headers.forEach((h, idx) => { if (h) obj[h] = r[idx]; }); return obj; });

function parseExcelRow(row) {
  const columnsFound = {};
  Object.keys(row).forEach(h => { columnsFound[norm(h)] = h; });

  const getRaw = (...keys) => {
    for (const key of keys) {
      const nk = norm(key);
      if (columnsFound[nk] !== undefined) {
        const v = row[columnsFound[nk]];
        return (v !== undefined && v !== null) ? v : '';
      }
    }
    return '';
  };
  const get = (...keys) => { const r = getRaw(...keys); return r === '' ? '' : String(r).trim(); };
  const getDate = (...keys) => { const raw = getRaw(...keys); if (raw === '' || raw === undefined) return ''; return toISODate(raw); };

  return {
    full_name: get('nombre', 'nombre completo', 'funcionario'),
    rut: get('rut', 'run'),
    birth_date: getDate('fecha nacimiento', 'fecha de nacimiento', 'nacimiento'),
    nationality: get('nacionalidad', 'pais', 'nac.'),
    position: get('cargo', 'puesto', ' Profesion', 'profesion', 'profesión'),
  };
}

console.log('HEADER ROW:', headerIndex, '| Headers:', headers);
console.log('TOTAL ROWS:', rows.length);
console.log('');

rows.slice(0, 3).forEach((row, i) => {
  const parsed = parseExcelRow(row);
  console.log('=== ROW', i + 1, '===');
  console.log('RAW RUT:', JSON.stringify(row['RUT']), '  TIPO:', typeof row['RUT']);
  console.log('RAW FECHA NACIMIENTO:', JSON.stringify(row['Fecha Nacimiento']), '  TIPO:', typeof row['Fecha Nacimiento']);
  console.log('RAW NACIONALIDAD:', JSON.stringify(row['Nacionalidad']));
  console.log('RAW PROFESION:', JSON.stringify(row[' Profesión']));
  console.log('');
  console.log('PARSED birth_date:', parsed.birth_date);
  console.log('PARSED nationality:', parsed.nationality, '-> normed:', norm(parsed.nationality, true));
  console.log('PARSED position:', parsed.position);
  console.log('PARSED rut (raw):', parsed.rut, '-> normRut:', normRut(parsed.rut));
  console.log('');
});
