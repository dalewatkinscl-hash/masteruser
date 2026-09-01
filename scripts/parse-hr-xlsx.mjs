import fs from 'fs';
import path from 'path';
import os from 'os';
import { execSync } from 'child_process';

const xlsxPath = 'c:/Users/dalewatkins/OneDrive - Country Lion/Projects/hrdata/HR Data.xlsx';
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'xlsx-'));
const zipCopy = path.join(tmp, 'data.zip');

fs.copyFileSync(xlsxPath, zipCopy);
execSync(
  `powershell -NoProfile -Command "Expand-Archive -LiteralPath '${zipCopy}' -DestinationPath '${path.join(tmp, 'unzipped')}' -Force"`,
  { stdio: 'inherit' },
);
const root = path.join(tmp, 'unzipped');

const sharedPath = path.join(root, 'xl', 'sharedStrings.xml');
const sheetPath = path.join(root, 'xl', 'worksheets', 'sheet1.xml');
const shared = [];

if (fs.existsSync(sharedPath)) {
  const xml = fs.readFileSync(sharedPath, 'utf8');
  const re = /<t[^>]*>([^<]*)<\/t>/g;
  let m;
  while ((m = re.exec(xml))) shared.push(m[1]);
}

const sheet = fs.readFileSync(sheetPath, 'utf8');

function colToIndex(col) {
  let n = 0;
  for (const ch of col) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

const rowRe = /<row[^>]*>([\s\S]*?)<\/row>/g;
const cellRe = /<c r="([A-Z]+)(\d+)"([^>]*)>(?:<v>([^<]*)<\/v>)?<\/c>/g;
const rows = {};

let rm;
while ((rm = rowRe.exec(sheet))) {
  const rowXml = rm[1];
  let cm;
  while ((cm = cellRe.exec(rowXml))) {
    const col = colToIndex(cm[1]);
    const row = parseInt(cm[2], 10) - 1;
    const attrs = cm[3];
    let val = cm[4] || '';
    if (attrs.includes('t="s"')) val = shared[parseInt(val, 10)] || '';
    if (!rows[row]) rows[row] = [];
    rows[row][col] = val;
  }
}

const data = Object.keys(rows)
  .map(Number)
  .sort((a, b) => a - b)
  .map((k) => rows[k]);

console.log('Total rows:', data.length);
console.log('Headers:', JSON.stringify(data[0]));
for (let i = 1; i < Math.min(5, data.length); i += 1) {
  console.log(`Row ${i}:`, JSON.stringify(data[i]));
}
