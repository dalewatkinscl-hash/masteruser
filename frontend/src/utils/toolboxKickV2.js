/**
 * Dick's Toolbox 2.0 — shared helpers (dev/sandbox first).
 * Daily wind is seeded from the London day key so every player shares conditions.
 */

export const TOOLBOX_V2_FEATURE_LIST = [
  {
    id: 'wind',
    title: 'Fair daily wind',
    blurb: 'Attempt 1 calm · attempt 2 the same seeded wind for everyone · attempt 3 a shared storm with shifting gusts. Windsock shows speed & direction.',
  },
  {
    id: 'combo',
    title: 'Airborne bounce combos',
    blurb: 'Chain 3+ prop hits without touching the ground for a combo multiplier boost.',
  },
  {
    id: 'flags',
    title: 'Record flags',
    blurb: 'Pass flags marking your PR, today’s best kick, and the all-time world record.',
  },
  {
    id: 'coins',
    title: 'Flight coin pickups',
    blurb: 'Grab mid-air coins every 15–20 km — they drop straight into your portal coin wallet.',
  },
  {
    id: 'qte',
    title: 'Little Dick QTE',
    blurb: 'When he catches the toolbox, tap in time to stop the kickback and get a forward boost instead.',
  },
];

export const FLIGHT_COIN_AMOUNT = 5;
export const FLIGHT_COIN_MAX_SLOTS = 24;

/** FNV-1a style hash → uint32 seed from day key (+ optional salt). */
export function daySeed(dayKey, salt = '') {
  const str = `${String(dayKey || '1970-01-01')}|${salt}`;
  let h = 2166136261;
  for (let i = 0; i < str.length; i += 1) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry32(seed) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

/**
 * Fair daily wind profile for a given attempt.
 * 1 = calm, 2 = steady (same for all players), 3 = storm.
 * Dev sandbox run 4 = calm QTE practice lane.
 * All-or-nothing (1 attempt) stays calm.
 *
 * Angle: 0° = tailwind (+x downrange), 90° = lift, 180° = headwind (pushes back).
 */
function windDirLabel(angleDeg) {
  const ax = Math.cos((Number(angleDeg) || 0) * Math.PI / 180);
  if (ax < -0.35) return 'headwind';
  if (ax > 0.45) return 'tailwind';
  return 'crosswind';
}

export function windProfileForAttempt({ dayKey, attempt = 1, maxAttempts = 3 }) {
  const att = Math.max(1, Math.floor(Number(attempt) || 1));
  const max = Math.max(1, Math.floor(Number(maxAttempts) || 3));
  if (max <= 1 || att <= 1) {
    return {
      mode: 'calm',
      label: 'Calm',
      angleDeg: 0,
      speed: 0,
      seed: daySeed(dayKey, 'calm'),
    };
  }
  if (att === 2) {
    const rng = mulberry32(daySeed(dayKey, 'steady-wind'));
    // Weighted bands so headwind shows up often (~40%), not rarely.
    const band = rng();
    let angleDeg;
    if (band < 0.4) {
      // Headwind — push back toward the start (140°…200°)
      angleDeg = 140 + rng() * 60;
    } else if (band < 0.7) {
      // Cross / lift (50°…110°)
      angleDeg = 50 + rng() * 60;
    } else {
      // Tailwind (−15°…35°)
      angleDeg = -15 + rng() * 50;
    }
    const dir = windDirLabel(angleDeg);
    // Headwinds lean a touch stronger so the push-back is obvious
    const speed = dir === 'headwind'
      ? 0.75 + rng() * 0.95
      : 0.55 + rng() * 0.85;
    return {
      mode: 'steady',
      label: `Steady ${dir}`,
      angleDeg,
      speed,
      seed: daySeed(dayKey, 'steady-wind'),
    };
  }
  if (att === 3) {
    const rng = mulberry32(daySeed(dayKey, 'storm-wind'));
    const band = rng();
    // Storm base also favours headwind / wild angles so gusts often shove you back
    let angleDeg;
    if (band < 0.45) {
      angleDeg = 150 + rng() * 50; // headwind core
    } else if (band < 0.75) {
      angleDeg = 70 + rng() * 80; // messy cross → head
    } else {
      angleDeg = -20 + rng() * 50; // occasional howling tail
    }
    return {
      mode: 'storm',
      label: `Storm ${windDirLabel(angleDeg)}`,
      angleDeg,
      speed: 1.0 + rng() * 0.85,
      seed: daySeed(dayKey, 'storm-wind'),
      // Wider swirl so gusts swing into headwind even on a tailwind base day
      swirl: 0.032 + rng() * 0.014,
      swirlAmp: 70 + rng() * 35,
      pulse: 0.018 + rng() * 0.01,
    };
  }
  // Attempt 4+ (dev QTE practice): calm skies so you can focus on the tap
  return {
    mode: 'calm',
    label: 'QTE practice',
    angleDeg: 0,
    speed: 0,
    seed: daySeed(dayKey, 'qte-practice'),
  };
}

/** Instantaneous wind force for physics + windsock UI. */
export function sampleWind(profile, frame = 0) {
  if (!profile || profile.mode === 'calm' || !(profile.speed > 0)) {
    return {
      mode: 'calm',
      label: 'Calm',
      angleDeg: 0,
      speed: 0,
      ax: 0,
      ay: 0,
    };
  }
  let angleDeg = Number(profile.angleDeg) || 0;
  let speed = Number(profile.speed) || 0;
  if (profile.mode === 'storm') {
    const swirl = Number(profile.swirl) || 0.03;
    const swirlAmp = Number(profile.swirlAmp) || 55;
    const pulse = Number(profile.pulse) || 0.02;
    angleDeg += Math.sin(frame * swirl) * swirlAmp;
    speed *= 0.65 + 0.55 * (0.5 + 0.5 * Math.sin(frame * pulse + 1.2));
  }
  const rad = (angleDeg * Math.PI) / 180;
  // 0° = push toolbox downrange (+x); 180° = headwind push-back (−x); 90° = lift.
  const ax = Math.cos(rad) * speed * 0.045;
  const ay = -Math.sin(rad) * speed * 0.028;
  return {
    mode: profile.mode,
    label: profile.label || (profile.mode === 'storm' ? 'Storm' : 'Wind'),
    angleDeg,
    speed,
    ax,
    ay,
  };
}

/**
 * Coin pickup distances — same for everyone on a given London day.
 * Spacing ~15–20 km, starting at 15 km.
 */
export function buildFlightCoinPlan(dayKey, { maxKm = 220 } = {}) {
  const rng = mulberry32(daySeed(dayKey, 'flight-coins'));
  const slots = [];
  let km = 15;
  let slot = 0;
  while (km <= maxKm && slot < FLIGHT_COIN_MAX_SLOTS) {
    slots.push({
      slot,
      km,
      amount: FLIGHT_COIN_AMOUNT,
    });
    km += 15 + rng() * 5;
    slot += 1;
  }
  return slots;
}

/**
 * Distance marker flags (metres from kick-off).
 * Dedupes when two records share nearly the same distance.
 */
export function buildRecordMarkers({
  personalBestM = 0,
  personalBestLabel = 'Your PR',
  todayBestM = 0,
  todayBestName = '',
  allTimeBestM = 0,
  allTimeBestName = '',
} = {}) {
  const markers = [];
  const push = (kind, distanceM, title, sub, color) => {
    const d = Math.floor(Number(distanceM) || 0);
    if (!(d > 80)) return;
    const clash = markers.some((m) => Math.abs(m.distanceM - d) < 40);
    if (clash) return;
    markers.push({ kind, distanceM: d, title, sub: sub || '', color });
  };
  push('pr', personalBestM, personalBestLabel, '', '#38bdf8');
  push(
    'today',
    todayBestM,
    "Today's best",
    todayBestName ? String(todayBestName).slice(0, 28) : '',
    '#fbbf24',
  );
  push(
    'record',
    allTimeBestM,
    'All-time best',
    allTimeBestName ? String(allTimeBestName).slice(0, 28) : '',
    '#f472b6',
  );
  return markers.sort((a, b) => a.distanceM - b.distanceM);
}
