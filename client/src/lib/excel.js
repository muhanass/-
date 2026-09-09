import * as XLSX from 'xlsx';

// Exports one or more data sheets to a downloaded .xlsx file.
// sheets: [{ name: 'Sheet name', rows: [{ col: value, ... }, ...] }]
// We only ever WRITE workbooks here (never parse untrusted .xlsx input),
// which keeps us clear of the known parsing-related vulnerabilities in the xlsx package.
export function exportToExcel(filename, sheets) {
  const workbook = XLSX.utils.book_new();
  for (const sheet of sheets) {
    const worksheet = XLSX.utils.json_to_sheet(sheet.rows);
    XLSX.utils.book_append_sheet(workbook, worksheet, sheet.name.slice(0, 31));
  }
  XLSX.writeFile(workbook, filename.endsWith('.xlsx') ? filename : `${filename}.xlsx`);
}
