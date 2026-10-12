/**
 * Re-split Gemini sheets + flood-fill white backgrounds to transparent alpha.
 * Sandbox / Fun Admin pack only (public/coach-depot/custom).
 */
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const ASSETS = path.resolve(
  process.env.USERPROFILE || '',
  '.cursor/projects/c-Users-dalewatkins-OneDrive-Country-Lion-Projects-User-Management/assets',
);
const SHEETS = path.join(ROOT, 'tmp-depot-sheets');
const OUT = path.join(ROOT, 'public', 'coach-depot', 'custom');

/**
 * Original uploads → sheet names (matched by byte size + content fingerprint).
 * Note: 154410 is the 5-coach sheet; 122706 is the blue container HQ (sizes were swapped earlier).
 */
const SOURCE_MAP = [
  { size: 154471, sheet: 'sheet_ops_hq.jpg' },
  { size: 92039, sheet: 'sheet_hq_garden.jpg' },
  { size: 154410, sheet: 'sheet_vehicles.jpg' },
  { size: 122706, sheet: 'sheet_hq_container.jpg' },
  { size: 106485, sheet: 'sheet_grounds.jpg' },
  { size: 105689, sheet: 'sheet_tours_infra.jpg' },
  { size: 154018, sheet: 'sheet_wash_workshop.jpg' },
  { size: 154315, sheet: 'sheet_training_workshop.jpg' },
  { size: 117815, sheet: 'sheet_hq_metal.jpg' },
];

function sheet(name) {
  return path.join(SHEETS, name);
}

function isNearWhite(r, g, b, soft = 248) {
  const min = Math.min(r, g, b);
  const max = Math.max(r, g, b);
  // Strict: only true sheet white / off-white (protect light curb / grass tips).
  return min >= soft && max - min <= 18;
}

/** Flood-fill from image edges: sheet white → alpha 0. Keeps pale grey/green art. */
function floodKnockout(data, width, height) {
  const n = width * height;
  const seen = new Uint8Array(n);
  const q = [];
  const push = (x, y) => {
    if (x < 0 || y < 0 || x >= width || y >= height) return;
    const i = y * width + x;
    if (seen[i]) return;
    const o = i * 4;
    if (!isNearWhite(data[o], data[o + 1], data[o + 2], 246)) return;
    seen[i] = 1;
    q.push(i);
  };

  for (let x = 0; x < width; x += 1) {
    push(x, 0);
    push(x, height - 1);
  }
  for (let y = 0; y < height; y += 1) {
    push(0, y);
    push(width - 1, y);
  }

  while (q.length) {
    const i = q.pop();
    const o = i * 4;
    data[o + 3] = 0;
    const x = i % width;
    const y = (i / width) | 0;
    push(x + 1, y);
    push(x - 1, y);
    push(x, y + 1);
    push(x, y - 1);
  }

  // One soft fringe pass on pure white only (avoid eating light concrete).
  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const i = y * width + x;
      const o = i * 4;
      if (data[o + 3] === 0) continue;
      if (!isNearWhite(data[o], data[o + 1], data[o + 2], 250)) continue;
      let touchClear = false;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        if (data[((y + dy) * width + (x + dx)) * 4 + 3] === 0) {
          touchClear = true;
          break;
        }
      }
      if (touchClear) data[o + 3] = 0;
    }
  }
}

/** Bounding box of non-near-white (ink) pixels in an RGBA buffer. */
function contentBounds(data, width, height, soft = 248) {
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const o = (y * width + x) * 4;
      if (isNearWhite(data[o], data[o + 1], data[o + 2], soft)) continue;
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }
  }
  if (maxX < 0) return null;
  return { minX, minY, maxX, maxY };
}

function clampRegion(meta, left, top, width, height) {
  const l = Math.max(0, Math.min(meta.width - 1, Math.floor(left)));
  const t = Math.max(0, Math.min(meta.height - 1, Math.floor(top)));
  const w = Math.max(1, Math.min(meta.width - l, Math.floor(width)));
  const h = Math.max(1, Math.min(meta.height - t, Math.floor(height)));
  return { left: l, top: t, width: w, height: h };
}

/** Keep the largest opaque blob; drop neighbour scraps from the sheet. */
function keepLargestBlob(data, width, height) {
  const n = width * height;
  const seen = new Int32Array(n);
  let best = null;
  let label = 0;
  for (let i = 0; i < n; i += 1) {
    if (seen[i] || data[i * 4 + 3] < 16) continue;
    label += 1;
    const q = [i];
    seen[i] = label;
    let count = 0;
    let minX = width;
    let minY = height;
    let maxX = 0;
    let maxY = 0;
    while (q.length) {
      const p = q.pop();
      count += 1;
      const x = p % width;
      const y = (p / width) | 0;
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
        const ni = ny * width + nx;
        if (seen[ni] || data[ni * 4 + 3] < 16) continue;
        seen[ni] = label;
        q.push(ni);
      }
    }
    if (!best || count > best.count) best = { label, count, minX, minY, maxX, maxY };
  }
  if (!best) return;
  for (let i = 0; i < n; i += 1) {
    if (seen[i] && seen[i] !== best.label) data[i * 4 + 3] = 0;
  }
}

async function writePngFromRgba(name, data, width, height, { pad = 14 } = {}) {
  const outPath = path.join(OUT, `${name}.png`);
  floodKnockout(data, width, height);
  keepLargestBlob(data, width, height);

  // Trim transparent borders, then add a transparent pad so tile tips aren't flush.
  let buf;
  try {
    buf = await sharp(data, { raw: { width, height, channels: 4 } })
      .trim({ threshold: 0 })
      .png()
      .toBuffer();
  } catch {
    buf = await sharp(data, { raw: { width, height, channels: 4 } }).png().toBuffer();
  }

  const again = await sharp(buf).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  floodKnockout(again.data, again.info.width, again.info.height);
  keepLargestBlob(again.data, again.info.width, again.info.height);

  let trimmed;
  try {
    trimmed = await sharp(again.data, {
      raw: { width: again.info.width, height: again.info.height, channels: 4 },
    })
      .trim({ threshold: 0 })
      .extend({
        top: pad,
        bottom: pad,
        left: pad,
        right: pad,
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      })
      .png()
      .toBuffer();
  } catch {
    trimmed = await sharp(again.data, {
      raw: { width: again.info.width, height: again.info.height, channels: 4 },
    })
      .extend({
        top: pad,
        bottom: pad,
        left: pad,
        right: pad,
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      })
      .png()
      .toBuffer();
  }

  await sharp(trimmed).png().toFile(outPath);
  const meta = await sharp(outPath).metadata();
  console.log('wrote', name, `${meta.width}x${meta.height}`);
}

/**
 * Extract using a search window, then snap to the ink bounding box (+ pad in source px)
 * so isometric tile corners / vehicle overhangs aren't clipped by a fixed inset.
 */
async function extractSmart(src, search, name, {
  pad = 18,
  soft = 236,
  clampToSearch = true,
  outPad = 16,
} = {}) {
  const meta = await sharp(src).metadata();
  const region = clampRegion(meta, search.left, search.top, search.width, search.height);
  const { data, info } = await sharp(src)
    .extract(region)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const bounds = contentBounds(data, info.width, info.height, soft);
  let left = region.left;
  let top = region.top;
  let width = region.width;
  let height = region.height;
  if (bounds) {
    left = region.left + bounds.minX - pad;
    top = region.top + bounds.minY - pad;
    width = (bounds.maxX - bounds.minX + 1) + pad * 2;
    height = (bounds.maxY - bounds.minY + 1) + pad * 2;
  }
  if (clampToSearch) {
    const right = Math.min(region.left + region.width, left + width);
    const bottom = Math.min(region.top + region.height, top + height);
    left = Math.max(region.left, left);
    top = Math.max(region.top, top);
    width = Math.max(1, right - left);
    height = Math.max(1, bottom - top);
  }
  const final = clampRegion(meta, left, top, width, height);
  const cropped = await sharp(src)
    .extract(final)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  await writePngFromRgba(name, cropped.data, cropped.info.width, cropped.info.height, { pad: outPad });
}

async function extractCell(src, region, name, opts = {}) {
  await extractSmart(src, region, name, opts);
}

async function splitGrid(src, cols, rows, names, { inset = 0.01, pad = 16, outPad = 18 } = {}) {
  const meta = await sharp(src).metadata();
  const cellW = meta.width / cols;
  const cellH = meta.height / rows;
  for (let r = 0; r < rows; r += 1) {
    for (let c = 0; c < cols; c += 1) {
      const i = r * cols + c;
      const name = names[i];
      if (!name) continue;
      // Near-full cell search so diamond tips aren't cut; clamp keeps neighbour bleed out.
      await extractSmart(src, {
        left: c * cellW + cellW * inset,
        top: r * cellH + cellH * inset,
        width: cellW * (1 - inset * 2),
        height: cellH * (1 - inset * 2),
      }, name, { pad, outPad, clampToSearch: true });
    }
  }
}

async function copySingle(src, name, { inset = 0.02, pad = 24 } = {}) {
  const meta = await sharp(src).metadata();
  await extractSmart(src, {
    left: meta.width * inset,
    top: meta.height * inset,
    width: meta.width * (1 - inset * 2),
    height: meta.height * (1 - inset * 2),
  }, name, { pad });
}

/**
 * Auto-detect vehicle boxes via column ink histograms (shadows connect soft blobs).
 * Top row = 3 coaches, bottom = 2.
 */
async function detectVehicleBoxes(src) {
  const { data, info } = await sharp(src).raw().toBuffer({ resolveWithObject: true });
  const w = info.width;
  const h = info.height;
  const ch = info.channels;
  const isInk = (o, mode) => {
    const r = data[o];
    const g = data[o + 1];
    const b = data[o + 2];
    const min = Math.min(r, g, b);
    const max = Math.max(r, g, b);
    if (mode === 'soft') {
      if (min >= 245) return false;
      if (min >= 220 && max - min < 15) return false;
      if (min >= 200 && max - min < 10) return false;
      return true;
    }
    // strict — ignore soft grey road-shadow bridges between bottom coaches
    if (min > 210) return false;
    if (max - min < 8 && min > 170) return false;
    return true;
  };

  const regionsInBand = (y0, y1, mode, mergeGap = 20, thresh = 8) => {
    const col = new Array(w).fill(0);
    for (let y = y0; y < y1; y += 1) {
      for (let x = 0; x < w; x += 1) {
        if (isInk((y * w + x) * ch, mode)) col[x] += 1;
      }
    }
    const raw = [];
    let inR = false;
    let start = 0;
    for (let x = 0; x < w; x += 1) {
      if (col[x] >= thresh) {
        if (!inR) {
          inR = true;
          start = x;
        }
      } else if (inR) {
        inR = false;
        raw.push([start, x - 1]);
      }
    }
    if (inR) raw.push([start, w - 1]);
    const merged = [];
    for (const r of raw) {
      if (!merged.length || r[0] - merged[merged.length - 1][1] > mergeGap) merged.push([...r]);
      else merged[merged.length - 1][1] = r[1];
    }
    return merged.map(([x0, x1]) => ({ x0, x1 }));
  };

  /** Vertical extent including pale roof kit (white dishes / AC) — anything not sheet-white. */
  const yExtent = (x0, x1, y0, y1) => {
    let minY = h;
    let maxY = 0;
    for (let y = y0; y < y1; y += 1) {
      for (let x = x0; x <= x1; x += 1) {
        const o = (y * w + x) * ch;
        const r = data[o];
        const g = data[o + 1];
        const b = data[o + 2];
        const min = Math.min(r, g, b);
        const max = Math.max(r, g, b);
        if (min >= 250 && max - min <= 12) continue;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
    if (maxY < minY) return { minY: y0, maxY: y1 - 1 };
    return { minY, maxY };
  };

  const toBoxes = (spans, y0, y1) => spans.map(({ x0, x1 }) => {
    const { minY, maxY } = yExtent(x0, x1, y0, y1);
    return { left: x0, top: minY, width: x1 - x0 + 1, height: maxY - minY + 1 };
  });

  // Keep top band above the bottom coaches (0.52 merges mid/right via shadows).
  const topSpans = regionsInBand(0, Math.floor(h * 0.48), 'soft', 14, 10);
  // Bottom: strict ink + tiny merge gap (coaches are only a few px apart in the histogram).
  const botSpans = regionsInBand(Math.floor(h * 0.52), h, 'strict', 2, 15);
  // Full-height y search within each x span so roof dishes / mirrors aren't cut.
  const top = toBoxes(topSpans, 0, Math.floor(h * 0.52));
  const bot = toBoxes(botSpans, Math.floor(h * 0.45), h);
  top.sort((a, b) => a.left - b.left);
  bot.sort((a, b) => a.left - b.left);
  return { top, bot, sheetW: w, sheetH: h };
}

/** Vehicle sheet: 3 on top row, 2 on bottom — detected boxes + padding. */
async function splitVehicles(src) {
  const { top, bot } = await detectVehicleBoxes(src);
  const namesTop = ['veh_minibus', 'veh_coach', 'veh_exec'];
  const namesBot = ['veh_electric', 'veh_super_exec'];
  if (top.length < 3 || bot.length < 2) {
    console.warn('vehicle detect fallback', { top: top.length, bot: bot.length });
  }
  const padBox = (box, padX = 16, padTop = 28, padBot = 20) => ({
    left: box.left - padX,
    top: box.top - padTop,
    width: box.width + padX * 2,
    height: box.height + padTop + padBot,
  });
  for (let i = 0; i < namesTop.length; i += 1) {
    const box = top[i] || top[top.length - 1];
    if (!box) continue;
    await extractSmart(src, padBox(box, 10, 30, 20), namesTop[i], {
      pad: 2,
      outPad: 28,
      clampToSearch: true,
      soft: 250,
    });
  }
  for (let i = 0; i < namesBot.length; i += 1) {
    const box = bot[i] || bot[bot.length - 1];
    if (!box) continue;
    await extractSmart(src, padBox(box, 12, 36, 24), namesBot[i], {
      pad: 2,
      outPad: 28,
      clampToSearch: true,
      soft: 250,
    });
  }
}

/** Pull tire stack + barrels from HQ container / metal depot singles. */
async function splitDepotProps(src, prefix) {
  const meta = await sharp(src).metadata();
  const W = meta.width;
  const H = meta.height;
  await extractSmart(src, {
    left: W * 0.02, top: H * 0.40, width: W * 0.28, height: H * 0.48,
  }, `${prefix}_tires`, { pad: 16 });
  await extractSmart(src, {
    left: W * 0.68, top: H * 0.42, width: W * 0.30, height: H * 0.48,
  }, `${prefix}_barrels`, { pad: 16 });
}

function syncSheetsFromAssets() {
  fs.mkdirSync(SHEETS, { recursive: true });
  const files = fs.readdirSync(ASSETS)
    .map((name) => {
      const p = path.join(ASSETS, name);
      const st = fs.statSync(p);
      return { name, path: p, size: st.size };
    })
    .filter((f) => f.size > 50000 && /\.(jpg|jpeg|png)$/i.test(f.name));

  for (const want of SOURCE_MAP) {
    const hit = files.find((f) => f.size === want.size);
    if (!hit) {
      console.warn('missing source size', want.size, want.sheet);
      continue;
    }
    fs.copyFileSync(hit.path, sheet(want.sheet));
    console.log('synced', want.sheet, '←', hit.name.slice(0, 48));
  }
}

fs.mkdirSync(OUT, { recursive: true });
for (const f of fs.readdirSync(OUT)) {
  if (f.endsWith('.png')) fs.unlinkSync(path.join(OUT, f));
}

syncSheetsFromAssets();

await splitGrid(sheet('sheet_ops_hq.jpg'), 3, 2, [
  'bld_hq_glass_tall',
  'bld_ops_shack',
  'bld_ops_container',
  'bld_ops_dish',
  'bld_ops_tower',
  'bld_training_cabin',
], { inset: 0.008, pad: 12, outPad: 20 });

await copySingle(sheet('sheet_hq_garden.jpg'), 'bld_hq_modern_garden');
await copySingle(sheet('sheet_hq_container.jpg'), 'bld_hq_container_blue');
await copySingle(sheet('sheet_hq_metal.jpg'), 'bld_hq_metal_warehouse');
await splitDepotProps(sheet('sheet_hq_container.jpg'), 'decor_container');
await splitDepotProps(sheet('sheet_hq_metal.jpg'), 'decor_metal');

await splitGrid(sheet('sheet_tours_infra.jpg'), 3, 2, [
  'bld_tours_office',
  'bay_coach_only',
  'bay_ev_charger',
  'ground_road',
  'decor_fountain',
  'char_driver_wave',
], { inset: 0.005, pad: 10, outPad: 22 });

await splitGrid(sheet('sheet_grounds.jpg'), 3, 2, [
  'ground_grass_lush',
  'ground_grass_dry',
  'decor_flowerbed',
  'decor_fence_chain',
  'decor_lamp_single',
  'decor_lamp_double',
], { inset: 0.005, pad: 10, outPad: 22 });

await splitGrid(sheet('sheet_wash_workshop.jpg'), 3, 2, [
  'bld_wash_brushes',
  'decor_picnic',
  'bld_break_canteen',
  'bld_workshop_tent',
  'bld_workshop_garage',
  'bld_tours_kiosk',
], { inset: 0.008, pad: 12, outPad: 20 });

await splitGrid(sheet('sheet_training_workshop.jpg'), 3, 2, [
  'bld_training_container',
  'bld_training_centre',
  'bld_workshop_wood',
  'bld_workshop_brick',
  'bld_workshop_industrial',
  'bld_wash_bay',
], { inset: 0.008, pad: 12, outPad: 20 });

await splitVehicles(sheet('sheet_vehicles.jpg'));

const catalog = fs.readdirSync(OUT).filter((f) => f.endsWith('.png')).sort();
fs.writeFileSync(
  path.join(OUT, 'catalog.json'),
  `${JSON.stringify({ generatedAt: new Date().toISOString(), files: catalog }, null, 2)}\n`,
);
console.log(`Done — ${catalog.length} sprites`);
