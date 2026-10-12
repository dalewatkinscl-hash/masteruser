/**
 * Split Gemini Coach Depot sheets into individual PNGs under public/coach-depot/custom/
 * Expects sheets in frontend/tmp-depot-sheets/ (short paths — Windows).
 */
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const SHEETS = path.join(ROOT, 'tmp-depot-sheets');
const OUT = path.join(ROOT, 'public', 'coach-depot', 'custom');

const sheet = (name) => path.join(SHEETS, name);

async function writeExtract(src, region, name) {
  const meta = await sharp(src).metadata();
  const left = Math.max(0, Math.min(meta.width - 1, region.left));
  const top = Math.max(0, Math.min(meta.height - 1, region.top));
  const width = Math.max(1, Math.min(meta.width - left, region.width));
  const height = Math.max(1, Math.min(meta.height - top, region.height));
  const outPath = path.join(OUT, `${name}.png`);
  try {
    await sharp(src).extract({ left, top, width, height }).trim({ threshold: 18 }).png().toFile(outPath);
  } catch {
    await sharp(src).extract({ left, top, width, height }).png().toFile(outPath);
  }
  console.log('wrote', path.basename(outPath), `${width}x${height}`);
}

async function splitGrid(src, cols, rows, names, { inset = 0.03 } = {}) {
  const meta = await sharp(src).metadata();
  const cellW = meta.width / cols;
  const cellH = meta.height / rows;
  for (let r = 0; r < rows; r += 1) {
    for (let c = 0; c < cols; c += 1) {
      const i = r * cols + c;
      const name = names[i];
      if (!name) continue;
      await writeExtract(src, {
        left: Math.floor(c * cellW + cellW * inset),
        top: Math.floor(r * cellH + cellH * inset),
        width: Math.floor(cellW * (1 - inset * 2)),
        height: Math.floor(cellH * (1 - inset * 2)),
      }, name);
    }
  }
}

async function copySingle(src, name) {
  const outPath = path.join(OUT, `${name}.png`);
  try {
    await sharp(src).trim({ threshold: 18 }).png().toFile(outPath);
  } catch {
    await sharp(src).png().toFile(outPath);
  }
  console.log('wrote', path.basename(outPath));
}

async function splitVehicles(src) {
  const meta = await sharp(src).metadata();
  const W = meta.width;
  const H = meta.height;
  const specs = [
    { name: 'veh_minibus', left: 0.02, top: 0.02, w: 0.30, h: 0.46 },
    { name: 'veh_coach', left: 0.35, top: 0.02, w: 0.30, h: 0.46 },
    { name: 'veh_exec', left: 0.68, top: 0.02, w: 0.30, h: 0.46 },
    { name: 'veh_electric', left: 0.08, top: 0.52, w: 0.38, h: 0.46 },
    { name: 'veh_super_exec', left: 0.52, top: 0.52, w: 0.42, h: 0.46 },
  ];
  for (const s of specs) {
    await writeExtract(src, {
      left: Math.floor(s.left * W),
      top: Math.floor(s.top * H),
      width: Math.floor(s.w * W),
      height: Math.floor(s.h * H),
    }, s.name);
  }
}

fs.mkdirSync(OUT, { recursive: true });

await splitGrid(sheet('sheet_ops_hq.jpg'), 3, 2, [
  'bld_hq_glass_tall',
  'bld_ops_shack',
  'bld_ops_container',
  'bld_ops_dish',
  'bld_ops_tower',
  'bld_training_cabin',
]);
await copySingle(sheet('sheet_hq_garden.jpg'), 'bld_hq_modern_garden');
await copySingle(sheet('sheet_hq_container.jpg'), 'bld_hq_container_blue');
await copySingle(sheet('sheet_hq_metal.jpg'), 'bld_hq_metal_warehouse');
await splitGrid(sheet('sheet_tours_infra.jpg'), 3, 2, [
  'bld_tours_office',
  'bay_coach_only',
  'bay_ev_charger',
  'ground_road',
  'decor_fountain',
  'char_driver_wave',
]);
await splitGrid(sheet('sheet_grounds.jpg'), 3, 2, [
  'ground_grass_lush',
  'ground_grass_dry',
  'decor_flowerbed',
  'decor_fence_chain',
  'decor_lamp_single',
  'decor_lamp_double',
]);
await splitGrid(sheet('sheet_wash_workshop.jpg'), 3, 2, [
  'bld_wash_brushes',
  'decor_picnic',
  'bld_break_canteen',
  'bld_workshop_tent',
  'bld_workshop_garage',
  'bld_tours_kiosk',
]);
await splitGrid(sheet('sheet_training_workshop.jpg'), 3, 2, [
  'bld_training_container',
  'bld_training_centre',
  'bld_workshop_wood',
  'bld_workshop_brick',
  'bld_workshop_industrial',
  'bld_wash_bay',
]);
await splitVehicles(sheet('sheet_vehicles.jpg'));

const catalog = fs.readdirSync(OUT).filter((f) => f.endsWith('.png')).sort();
fs.writeFileSync(
  path.join(OUT, 'catalog.json'),
  `${JSON.stringify({ generatedAt: new Date().toISOString(), files: catalog }, null, 2)}\n`,
);
console.log(`Done — ${catalog.length} sprites`);
