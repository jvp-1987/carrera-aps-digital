import fs from 'fs';
import * as XLSX from 'xlsx';

const filePath = '/Users/juanvidalp/Downloads/CarreraFuncionaria_Todos_20260321-2.xlsx';
const fileData = fs.readFileSync(filePath);
const wb = XLSX.read(fileData, { type: 'buffer', cellDates: false });
const sheet = wb.Sheets['VERONICA CATALINA MONGE BARRA'];

function cellStr(sheet, c, r) {
  const cell = sheet[XLSX.utils.encode_cell({ c, r })];
  return cell ? String(cell.v ?? '').trim() : '';
}

for (let r = 15; r <= 25; r++) {
    let rowText = '';
    for (let c = 0; c <= 6; c++) {
        rowText += `[${cellStr(sheet, c, r)}] \t`;
    }
    console.log(`Row ${r}: ${rowText}`);
}
