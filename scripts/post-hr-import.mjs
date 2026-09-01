import fs from 'fs';

const rowsPath =
  'c:/Users/dalewatkins/OneDrive - Country Lion/Projects/hrdata/hr-import-rows.json';
const apiUrl =
  process.env.UM_IMPORT_URL ||
  'https://employee.countrylion.co.uk/api/adminImportHrData';
const importSecret =
  process.env.HR_IMPORT_SECRET || 'CL-PROVISION-2026-XKQM9z7vBt4pLnWr';

const rows = JSON.parse(fs.readFileSync(rowsPath, 'utf8'));

const response = await fetch(apiUrl, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'x-hr-import-secret': importSecret,
  },
  body: JSON.stringify({ rows }),
});

const result = await response.json().catch(() => ({}));
console.log('Status:', response.status);
console.log(JSON.stringify(result, null, 2));

if (!response.ok) {
  process.exit(1);
}
