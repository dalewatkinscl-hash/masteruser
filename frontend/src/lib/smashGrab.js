/**
 * Daz’s Smash and Grab — scoring / tuning (client sandbox + future daily).
 */

export const HOTWIRE_WINDOW_MS = 4000;
export const HOTWIRE_MIN_TAP_GAP_MS = 40;
export const HOTWIRE_FILL_PER_TAP = 0.065;

export const REV_BASE_SPEED = 2.4; // rad-ish units per second (0–1 oscillate)
export const REV_SWEET_CENTER = 0.78;
export const REV_SWEET_HALF = 0.07;
export const REV_OVERREV_START = 0.92;

export const LINE_BASE_SPEED = 1.15;
export const LINE_WINDOW_HALF = 0.18; // glass centre band on 0–1 shopfront

export const GRAB_BASE_MS = 3500;
export const GRAB_SPAWN_BASE_MS = 280;

export const LOOT_TYPES = [
  { id: 'cigs', label: 'Cig cartons', emoji: '🚬', base: 40, rarity: 1 },
  { id: 'can', label: 'Energy cans', emoji: '🥤', base: 25, rarity: 1 },
  { id: 'bottle', label: 'Bottles', emoji: '🍾', base: 55, rarity: 1.4 },
  { id: 'scratch', label: 'Scratchcards', emoji: '🎫', base: 80, rarity: 1.8 },
  { id: 'till', label: 'Till cash', emoji: '💷', base: 120, rarity: 2.2 },
];

/** @returns {'perfect'|'great'|'ok'|'poor'|'fail'} */
export function hotwireGradeFromFill(fill, elapsedMs, windowMs = HOTWIRE_WINDOW_MS) {
  if (fill < 1) return 'fail';
  const t = elapsedMs / windowMs;
  if (t <= 0.35) return 'perfect';
  if (t <= 0.55) return 'great';
  if (t <= 0.75) return 'ok';
  return 'poor';
}

export function hotwireRevMods(grade) {
  switch (grade) {
    case 'perfect':
      return { needleSpeed: 0.7, sweetWidth: 1.4, label: 'Wired fast — revs steadier' };
    case 'great':
      return { needleSpeed: 0.85, sweetWidth: 1.2, label: 'Solid wire — needle calmer' };
    case 'ok':
      return { needleSpeed: 1.0, sweetWidth: 1.0, label: 'Engine caught — standard revs' };
    case 'poor':
      return { needleSpeed: 1.15, sweetWidth: 0.85, label: 'Sloppy wire — twitchy revs' };
    default:
      return { needleSpeed: 1.35, sweetWidth: 0.7, label: 'Barely started — revs wild' };
  }
}

export function hotwireGradeLabel(grade) {
  switch (grade) {
    case 'perfect':
      return 'Perfect hotwire';
    case 'great':
      return 'Great hotwire';
    case 'ok':
      return 'OK hotwire';
    case 'poor':
      return 'Rough hotwire';
    default:
      return 'Failed hotwire';
  }
}

/**
 * Rev lock quality 0–1 from needle position + sweet band.
 */
export function revQuality(needle, sweetHalf) {
  const dist = Math.abs(needle - REV_SWEET_CENTER);
  if (needle >= REV_OVERREV_START) {
    // Over-rev: still usable but bleeds
    const bleed = (needle - REV_OVERREV_START) / (1 - REV_OVERREV_START);
    return Math.max(0.25, 0.55 - bleed * 0.35);
  }
  if (dist <= sweetHalf) {
    return 1 - (dist / sweetHalf) * 0.15;
  }
  if (dist <= sweetHalf * 2.2) {
    return 0.55 - ((dist - sweetHalf) / (sweetHalf * 1.2)) * 0.35;
  }
  return Math.max(0.1, 0.2 - dist * 0.15);
}

/**
 * Line lock: 0 = brick, 1 = dead centre glass.
 */
export function lineQuality(aim) {
  // shop: brick 0–0.22, glass 0.22–0.78, brick 0.78–1
  const glassL = 0.22;
  const glassR = 0.78;
  const centre = 0.5;
  if (aim < glassL || aim > glassR) {
    const edgeDist = aim < glassL ? glassL - aim : aim - glassR;
    return Math.max(0, 0.12 - edgeDist * 0.4);
  }
  const dist = Math.abs(aim - centre);
  const half = (glassR - glassL) / 2;
  return 1 - (dist / half) * 0.55;
}

export function smashDepth(revQ, lineQ) {
  return Math.max(0, Math.min(100, Math.round((revQ * 0.55 + lineQ * 0.45) * 100)));
}

export function smashGradeFromDepth(depth, revQ, lineQ) {
  if (depth < 18 || lineQ < 0.15) return { mult: 0.15, id: 'brick', label: 'Brick miss' };
  if (depth < 40) return { mult: 0.45, id: 'glance', label: 'Glancing blow' };
  if (depth < 70) return { mult: 0.75, id: 'clean', label: 'Clean smash' };
  if (revQ >= 0.92 && lineQ >= 0.88) return { mult: 1.15, id: 'perfect', label: 'Perfect smash' };
  return { mult: 1.0, id: 'deep', label: 'Deep smash' };
}

export function rollIntel() {
  // 55% quiet night, 45% silent alarm
  if (Math.random() < 0.55) {
    return {
      id: 'quiet',
      label: 'Quiet night',
      valueMult: 1.25,
      grabTimeMult: 1,
      detail: '+25% stock value',
    };
  }
  return {
    id: 'alarm',
    label: 'Silent alarm',
    valueMult: 0.85,
    grabTimeMult: 0.8,
    detail: '−20% grab time · −15% value',
  };
}

export function cleanIntel() {
  return {
    id: 'clean',
    label: 'Went clean',
    valueMult: 1,
    grabTimeMult: 1,
    detail: '×1.0 loot',
  };
}

export function grabDurationMs(intel, smashMult) {
  const base = GRAB_BASE_MS * (intel?.grabTimeMult || 1);
  // Better smash = slightly more time in the aisle
  return Math.round(base * (0.9 + smashMult * 0.15));
}

export function spawnIntervalMs(smashMult) {
  // Deeper smash → faster loot rain
  return Math.max(140, Math.round(GRAB_SPAWN_BASE_MS / (0.65 + smashMult * 0.55)));
}

export function pickLootType(smashMult, rng = Math.random) {
  const pool = LOOT_TYPES.filter((t) => {
    if (t.id === 'till') return smashMult >= 1.0;
    if (t.id === 'scratch') return smashMult >= 0.75;
    if (t.id === 'bottle') return smashMult >= 0.45;
    return true;
  });
  // Weight rarer items lower unless deep smash
  const weights = pool.map((t) => {
    const rarityPenalty = t.rarity > 1.5 ? 1 / t.rarity : 1;
    return rarityPenalty * (0.7 + smashMult * 0.5);
  });
  const sum = weights.reduce((a, b) => a + b, 0);
  let r = rng() * sum;
  for (let i = 0; i < pool.length; i += 1) {
    r -= weights[i];
    if (r <= 0) return pool[i];
  }
  return pool[0];
}

export function itemValue(type, smashMult, intelMult) {
  return Math.round(type.base * type.rarity * smashMult * intelMult);
}

export function totalLootValue(bagged) {
  return bagged.reduce((sum, item) => sum + (item.value || 0), 0);
}
