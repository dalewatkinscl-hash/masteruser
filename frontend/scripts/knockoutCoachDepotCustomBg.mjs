/**
 * Knock out near-white sheet backgrounds so custom Coach Depot sprites are transparent.
 */
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIR = path.resolve(__dirname, '..', 'public', 'coach-depot', 'custom');

const HARD = 248; // fully transparent at/above
const SOFT = 232; // fade start

async function knockOut(filePath) {
  const { data, info } = await sharp(filePath)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const min = Math.min(r, g, b);
    const max = Math.max(r, g, b);
    // Near-neutral light pixels only (avoid bleaching pale yellows / blues)
    if (max - min > 18) continue;
    if (min >= HARD) {
      data[i + 3] = 0;
    } else if (min >= SOFT) {
      const t = (min - SOFT) / (HARD - SOFT);
      data[i + 3] = Math.min(data[i + 3], Math.round(255 * (1 - t)));
    }
  }

  await sharp(data, {
    raw: { width: info.width, height: info.height, channels: 4 },
  })
    .png()
    .toFile(filePath);

  console.log('knocked', path.basename(filePath));
}

async function main() {
  const files = fs.readdirSync(DIR).filter((f) => f.endsWith('.png'));
  for (const f of files) {
    await knockOut(path.join(DIR, f));
  }
  console.log(`done · ${files.length} files`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
