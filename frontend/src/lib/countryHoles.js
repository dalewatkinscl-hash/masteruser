/**
 * Country Holes — Daily Holes–style procedural 9-hole golf (client sandbox).
 * Seeded by London day key so the same date always yields the same course.
 */

export function hashString(s) {
  let h = 2166136261;
  const str = String(s || '');
  for (let i = 0; i < str.length; i += 1) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function mulberry32(seed) {
  let t = seed >>> 0;
  return () => {
    t += 0x6D2B79F5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

/** Pure timing window on the swing meter (slightly wide for readable stops). */
export const PURE_BAND = { lo: 78, hi: 90 };
export const METER_MAX = 100;
/** Meter fill speed — full 0→100 rise takes ~METER_MAX/METER_SPEED seconds. */
export const METER_SPEED = 58;

/** Club set — base carry yards at pure timing from fairway/tee. */
export const CLUBS = [
  { id: 'lw', name: 'L-Wedge', carry: 70, loft: 0.95 },
  { id: 'sw', name: 'S-Wedge', carry: 90, loft: 0.9 },
  { id: 'pw', name: 'P-Wedge', carry: 115, loft: 0.82 },
  { id: '9i', name: '9-Iron', carry: 130, loft: 0.75 },
  { id: '7i', name: '7-Iron', carry: 150, loft: 0.65 },
  { id: '5i', name: '5-Iron', carry: 175, loft: 0.55 },
  { id: '3w', name: '3-Wood', carry: 210, loft: 0.42 },
  { id: 'dr', name: 'Driver', carry: 250, loft: 0.32 },
];

export const LIE = {
  tee: 'tee',
  fairway: 'fairway',
  rough: 'rough',
  deepRough: 'deepRough',
  bunker: 'bunker',
  green: 'green',
  water: 'water',
  ob: 'ob',
};

const LIE_CARRY = {
  tee: 1,
  fairway: 1,
  rough: 0.84,
  deepRough: 0.62,
  bunker: 0.7,
  green: 0.55,
  water: 0,
  ob: 0,
};

const LIE_ROLLOUT = {
  tee: 1.25,
  fairway: 1.8,
  rough: 0.3,
  deepRough: 0.14,
  bunker: 0.07,
  green: 0.55,
  water: 0,
  ob: 0,
};

const COURSE_NAMES = [
  'Birch Shaw', 'Alders Edge', 'Meadow Burn', 'Hare Copse',
  'Willow Reach', 'Stonelea Links', 'Foxhollow', 'Lime Kiln',
  'Rookery Dunes', 'Ashcombe Vale', 'Heron Marsh', 'Copper Lea',
];

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function dist(a, b) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.hypot(dx, dy);
}

function clamp(n, lo, hi) {
  return Math.max(lo, Math.min(hi, n));
}

function pointInCircle(p, c, r) {
  return dist(p, c) <= r;
}

/** Point-in-polygon (ray cast). */
export function pointInPoly(p, poly) {
  if (!poly?.length) return false;
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i, i += 1) {
    const xi = poly[i].x;
    const yi = poly[i].y;
    const xj = poly[j].x;
    const yj = poly[j].y;
    const intersect = ((yi > p.y) !== (yj > p.y))
      && (p.x < ((xj - xi) * (p.y - yi)) / (yj - yi + 1e-12) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}

function corridorPoly(centerline, halfWidths) {
  const left = [];
  const right = [];
  const widths = typeof halfWidths === 'number'
    ? centerline.map(() => halfWidths)
    : halfWidths;
  for (let i = 0; i < centerline.length; i += 1) {
    const prev = centerline[Math.max(0, i - 1)];
    const next = centerline[Math.min(centerline.length - 1, i + 1)];
    const dx = next.x - prev.x;
    const dy = next.y - prev.y;
    const len = Math.hypot(dx, dy) || 1;
    const hw = widths[i] ?? widths[widths.length - 1] ?? 14;
    const nx = (-dy / len) * hw;
    const ny = (dx / len) * hw;
    const p = centerline[i];
    left.push({ x: p.x + nx, y: p.y + ny });
    right.push({ x: p.x - nx, y: p.y - ny });
  }
  return [...left, ...right.reverse()];
}

/** Rotate polyline so the green sits on +Y from the tee. */
function normalizeHoleAxis(pts) {
  const end = pts[pts.length - 1];
  const ang = Math.atan2(end.x, end.y);
  const c = Math.cos(-ang);
  const s = Math.sin(-ang);
  return pts.map((p) => ({
    x: p.x * c - p.y * s,
    y: p.x * s + p.y * c,
  }));
}

function pickHoleShape(rand, par, lengthYds) {
  // Short holes stay simpler; longer holes get more character
  if (par <= 3 || lengthYds < 190) {
    return rand() < 0.7 ? 'straight' : 'kink';
  }
  const roll = rand();
  if (roll < 0.2) return 'straight';
  if (roll < 0.4) return 'kink';
  if (roll < 0.78) return 'dogleg';
  return 'twisty';
}

/**
 * Build a shaped centerline (yards). Returns { points, shape, side }.
 * side: -1 left / +1 right bend (for dogleg/kink labels).
 */
function buildCenterline(rand, lengthYds, shape) {
  const steps = shape === 'twisty' ? 22 : shape === 'dogleg' ? 18 : 14;
  const side = rand() < 0.5 ? -1 : 1;
  const pts = [{ x: 0, y: 0 }];
  let x = 0;
  let y = 0;
  let heading = 0; // 0 = +Y; positive = veer toward +X

  const kinkT = 0.42 + rand() * 0.18;
  const doglegT = 0.36 + rand() * 0.22;
  const doglegSpan = 0.1 + rand() * 0.06;
  const doglegStrength = 0.85 + rand() * 0.55;
  const twistFreq = 1.6 + rand() * 1.4;
  const twistAmp = 0.16 + rand() * 0.14;

  for (let i = 1; i <= steps; i += 1) {
    const t = i / steps;
    const seg = lengthYds / steps;
    let turn = 0;

    if (shape === 'straight') {
      turn = (rand() - 0.5) * 0.03;
    } else if (shape === 'kink') {
      if (Math.abs(t - kinkT) < 1.4 / steps) {
        turn = side * (0.7 + rand() * 0.45);
      } else {
        turn = (rand() - 0.5) * 0.04;
      }
    } else if (shape === 'dogleg') {
      if (t >= doglegT && t <= doglegT + doglegSpan) {
        turn = (side * doglegStrength) / Math.max(1, doglegSpan * steps);
      } else {
        turn = (rand() - 0.5) * 0.03;
      }
    } else {
      // twisty — S-curves along the hole
      turn = side * Math.sin(t * Math.PI * twistFreq) * twistAmp
        + Math.sin(t * Math.PI * (twistFreq * 0.55 + 0.4)) * twistAmp * 0.45
        + (rand() - 0.5) * 0.05;
    }

    heading = clamp(heading + turn, -1.2, 1.2);
    // Ease heading toward the green over the last stretch so the approach isn't sideways
    if (t > 0.82) {
      heading *= 1 - (t - 0.82) / 0.18 * 0.55;
    }

    x += Math.sin(heading) * seg;
    y += Math.cos(heading) * seg;
    x = clamp(x, -75, 75);
    pts.push({ x, y });
  }

  const normalized = normalizeHoleAxis(pts);
  // Keep green roughly at lengthYds on +Y
  const end = normalized[normalized.length - 1];
  const scale = lengthYds / Math.max(1, end.y);
  const scaled = normalized.map((p) => ({ x: p.x * scale, y: p.y * scale }));
  scaled[0] = { x: 0, y: 0 };
  scaled[scaled.length - 1] = {
    x: clamp(scaled[scaled.length - 1].x, -28, 28),
    y: lengthYds,
  };
  return { points: scaled, shape, side };
}

function shapeLabel(shape, side) {
  if (shape === 'straight') return 'Straight';
  if (shape === 'kink') return side < 0 ? 'Kink left' : 'Kink right';
  if (shape === 'dogleg') return side < 0 ? 'Dogleg left' : 'Dogleg right';
  if (shape === 'twisty') return 'Twisty';
  return shape;
}

function pickParLength(rand, holeIndex) {
  // Mix: short openers, mid pars, longer back — max Par 5
  const roll = rand();
  if (holeIndex === 8) {
    if (roll < 0.4) return { par: 5, length: 480 + rand() * 80 };
    return { par: 4, length: 360 + rand() * 50 };
  }
  if (holeIndex < 3) {
    if (roll < 0.55) return { par: 3, length: 120 + rand() * 70 };
    return { par: 4, length: 300 + rand() * 60 };
  }
  if (roll < 0.2) return { par: 3, length: 140 + rand() * 50 };
  if (roll < 0.75) return { par: 4, length: 310 + rand() * 80 };
  return { par: 5, length: 460 + rand() * 70 };
}

/** Assign shapes after par/length so short holes never eat the dogleg/twisty quota. */
function assignShapesForCourse(rand, specs) {
  const shapes = Array(9).fill(null);
  const longIdx = [];
  const shortIdx = [];
  for (let i = 0; i < specs.length; i += 1) {
    const s = specs[i];
    if (s.par >= 4 && s.length >= 190) longIdx.push(i);
    else shortIdx.push(i);
  }
  // Guarantee personality on the long holes
  const longPool = ['dogleg', 'dogleg', 'twisty', 'kink', 'straight', 'dogleg', 'twisty', 'kink', 'straight'];
  for (let i = longPool.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rand() * (i + 1));
    const tmp = longPool[i];
    longPool[i] = longPool[j];
    longPool[j] = tmp;
  }
  longIdx.forEach((holeI, n) => {
    shapes[holeI] = longPool[n % longPool.length];
  });
  // Ensure at least 2 doglegs + 1 twisty when enough long holes exist
  if (longIdx.length >= 3) {
    const have = longIdx.map((i) => shapes[i]);
    const doglegs = have.filter((s) => s === 'dogleg').length;
    const twisty = have.filter((s) => s === 'twisty').length;
    let cursor = 0;
    const setAt = (want) => {
      while (cursor < longIdx.length && shapes[longIdx[cursor]] === want) cursor += 1;
      if (cursor < longIdx.length) {
        shapes[longIdx[cursor]] = want;
        cursor += 1;
      }
    };
    for (let n = doglegs; n < 2; n += 1) setAt('dogleg');
    if (twisty < 1) setAt('twisty');
  }
  shortIdx.forEach((holeI) => {
    shapes[holeI] = rand() < 0.65 ? 'straight' : 'kink';
  });
  return shapes;
}

function generateHole(rand, holeIndex, flags) {
  const picked = flags.forceParLength || pickParLength(rand, holeIndex);
  const par = picked.par;
  const length = picked.length;
  const shape = flags.forceShape || pickHoleShape(rand, par, length);
  const built = buildCenterline(rand, length, shape);
  let centerline = built.points;
  const bendSide = built.side;
  const fairwayHalf = 13 + rand() * 8;

  // Green always owns the pin: pin at centre, radius large enough for all putt rings + collar
  const greenRadius = 20 + rand() * 8;
  const apronR = greenRadius + 8;
  // Scenery ring past the apron so the green never “hangs” over empty sky
  const sceneryR = apronR + 18 + rand() * 8;
  const tee = { ...centerline[0] };
  const greenCenter = { ...centerline[centerline.length - 1] };

  // Extend the corridor past the pin so fairway/rough wrap the full green disc
  const prev = centerline[centerline.length - 2] || tee;
  const dx = greenCenter.x - prev.x;
  const dy = greenCenter.y - prev.y;
  const glen = Math.hypot(dx, dy) || 1;
  const ux = dx / glen;
  const uy = dy / glen;
  const beyond = sceneryR + 6;
  const approachIdx = centerline.length - 1;
  for (let i = 1; i <= 4; i += 1) {
    centerline.push({
      x: greenCenter.x + ux * (beyond * (i / 4)),
      y: greenCenter.y + uy * (beyond * (i / 4)),
    });
  }

  // Widen fairway into an apron that fully contains the green circle
  const apronHalf = apronR;
  const fairwayWidths = centerline.map((_, i) => {
    const t = i / Math.max(1, centerline.length - 1);
    // Hold apron width through the green and the extension behind the pin
    if (i >= approachIdx - 1) return apronHalf;
    if (t < 0.68) return fairwayHalf;
    const u = (t - 0.68) / 0.22;
    return lerp(fairwayHalf, apronHalf, Math.min(1, u * u));
  });
  const roughExtra = 14 + rand() * 6;
  const roughWidths = fairwayWidths.map((w, i) => (
    i >= approachIdx - 1 ? Math.max(w + roughExtra, sceneryR) : w + roughExtra
  ));
  const fairway = corridorPoly(centerline, fairwayWidths);
  const roughOuter = corridorPoly(centerline, roughWidths);

  // Decorative trees / scrub blobs in the scenery ring (outside the green)
  const scenery = [];
  const blobCount = 7 + Math.floor(rand() * 6);
  for (let i = 0; i < blobCount; i += 1) {
    const ang = rand() * Math.PI * 2;
    const distOut = greenRadius + 6 + rand() * (sceneryR - greenRadius - 4);
    scenery.push({
      x: greenCenter.x + Math.cos(ang) * distOut,
      y: greenCenter.y + Math.sin(ang) * distOut,
      r: 3.5 + rand() * 5.5,
      kind: rand() < 0.45 ? 'tree' : 'scrub',
    });
  }

  const slopeMag = rand() * 0.85;
  const slopeAngle = rand() * Math.PI * 2;
  const greenSlope = {
    x: Math.cos(slopeAngle) * slopeMag,
    y: Math.sin(slopeAngle) * slopeMag,
  };

  const bunkers = [];
  const bunkerCount = rand() < 0.2 ? 0 : (rand() < 0.55 ? 1 : 2);
  for (let i = 0; i < bunkerCount; i += 1) {
    const t = 0.35 + rand() * 0.5;
    const idx = Math.floor(t * (centerline.length - 1));
    const c = centerline[idx];
    const bunkerSide = rand() < 0.5 ? -1 : 1;
    bunkers.push({
      x: c.x + bunkerSide * (fairwayHalf * 0.75 + rand() * 10),
      y: c.y + (rand() - 0.5) * 20,
      r: 5 + rand() * 5,
    });
  }
  // Optional greenside bunker — fully outside the green + apron so pin/rings stay clear
  if (rand() < 0.55) {
    const ang = rand() * Math.PI * 2;
    const br = 4.5 + rand() * 3.5;
    const distOut = apronR + br + 2 + rand() * 4;
    bunkers.push({
      x: greenCenter.x + Math.cos(ang) * distOut,
      y: greenCenter.y + Math.sin(ang) * distOut,
      r: br,
    });
  }

  let water = null;
  if (flags.burnHole === holeIndex && par >= 4) {
    const t = 0.4 + rand() * 0.25;
    const y = length * t;
    water = {
      type: 'burn',
      y0: y - 8,
      y1: y + 8,
      skew: (rand() - 0.5) * 0.35,
      bridgeX: (rand() - 0.5) * 18,
      bridgeW: 10 + rand() * 6,
    };
  } else if (flags.islandHole === holeIndex && par <= 4) {
    water = {
      type: 'island',
      collar: greenRadius + 5,
      waterR: greenRadius + 26,
      drop: {
        x: greenCenter.x + (rand() < 0.5 ? -28 : 28),
        y: greenCenter.y - 40 - rand() * 20,
      },
    };
  }

  const windSpeed = 0.5 + rand() * 4.5;
  const windAngle = rand() * Math.PI * 2;
  const wind = {
    speed: windSpeed,
    angle: windAngle,
    x: Math.cos(windAngle) * windSpeed,
    y: Math.sin(windAngle) * windSpeed,
  };

  let gust = null;
  if (rand() < 0.4) {
    gust = {
      y0: length * (0.3 + rand() * 0.35),
      y1: length * (0.45 + rand() * 0.25),
      strength: 1.5 + rand() * 2.5,
      dir: rand() < 0.5 ? -1 : 1,
    };
    if (gust.y1 < gust.y0 + 20) gust.y1 = gust.y0 + 25;
  }

  return {
    index: holeIndex,
    number: holeIndex + 1,
    par,
    lengthYds: Math.round(length),
    shape,
    shapeLabel: shapeLabel(shape, bendSide),
    tee,
    // Pin is always the green centre; r is guaranteed to surround cup + putt rings
    green: { ...greenCenter, r: greenRadius, slope: greenSlope },
    centerline,
    fairway,
    roughOuter,
    fairwayHalf,
    apronR,
    sceneryR,
    scenery,
    bunkers,
    water,
    wind,
    gust,
  };
}

/**
 * @param {string} dayKey YYYY-MM-DD
 */
export function generateCourse(dayKey) {
  const key = String(dayKey || '1970-01-01');
  const rand = mulberry32(hashString(`countryholes:v5:${key}`));
  const name = COURSE_NAMES[Math.floor(rand() * COURSE_NAMES.length)];
  const burnHole = rand() < 0.75 ? 3 + Math.floor(rand() * 5) : -1;
  let islandHole = rand() < 0.55 ? Math.floor(rand() * 4) : -1;
  if (islandHole === burnHole) islandHole = (islandHole + 1) % 9;

  // Par/length first, then shapes — short holes never steal dogleg/twisty slots
  const specs = [];
  for (let i = 0; i < 9; i += 1) specs.push(pickParLength(rand, i));
  const forcedShapes = assignShapesForCourse(rand, specs);

  const holes = [];
  for (let i = 0; i < 9; i += 1) {
    holes.push(generateHole(rand, i, {
      burnHole,
      islandHole,
      forceShape: forcedShapes[i],
      forceParLength: specs[i],
    }));
  }

  const totalPar = holes.reduce((s, h) => s + h.par, 0);
  const totalYds = holes.reduce((s, h) => s + h.lengthYds, 0);

  return {
    id: `countryholes-${key}`,
    dayKey: key,
    name,
    holes,
    totalPar,
    totalYds,
    burnHole: burnHole >= 0 ? burnHole + 1 : null,
    islandHole: islandHole >= 0 ? islandHole + 1 : null,
  };
}

export function surfaceAt(hole, p) {
  if (!hole || !p) return LIE.fairway;
  const g = hole.green;
  if (pointInCircle(p, g, g.r)) return LIE.green;

  if (hole.water?.type === 'island') {
    const d = dist(p, g);
    if (d > g.r && d < hole.water.waterR) return LIE.water;
  }
  if (hole.water?.type === 'burn') {
    const skewX = (p.y - (hole.water.y0 + hole.water.y1) / 2) * hole.water.skew;
    const inBand = p.y >= hole.water.y0 && p.y <= hole.water.y1;
    const onBridge = Math.abs(p.x - (hole.water.bridgeX + skewX)) <= hole.water.bridgeW / 2;
    if (inBand && !onBridge) return LIE.water;
  }

  for (const b of hole.bunkers || []) {
    if (pointInCircle(p, b, b.r)) return LIE.bunker;
  }

  // Circular green apron — guarantees the full pin radius sits on short grass
  const apronR = hole.apronR || (g.r + 8);
  if (pointInCircle(p, g, apronR)) return LIE.fairway;

  if (pointInPoly(p, hole.fairway)) return LIE.fairway;
  if (pointInPoly(p, hole.roughOuter)) {
    // Outer band of rough is deep
    const toCenter = hole.centerline.reduce((best, c) => {
      const d = dist(p, c);
      return d < best ? d : best;
    }, Infinity);
    return toCenter > hole.fairwayHalf + 10 ? LIE.deepRough : LIE.rough;
  }
  // Scenery pad around the green — playable deep rough, not empty void / OB
  const sceneryR = hole.sceneryR || (apronR + 20);
  if (pointInCircle(p, g, sceneryR)) return LIE.deepRough;
  // Outside the marked course — out of bounds (stroke & distance)
  return LIE.ob;
}

export function puttRingRadii(hole) {
  const steep = Math.hypot(hole.green.slope.x, hole.green.slope.y);
  // Mild shrink only — rings must always stay inside the green radius
  const shrink = 1 - clamp(steep * 0.22, 0, 0.22);
  const greenR = hole.green.r;
  const gold = Math.min(greenR * 0.34 * shrink, greenR * 0.36);
  const pale = Math.min(greenR * 0.64 * shrink, greenR * 0.72);
  return { gold, pale, green: greenR };
}

export function puttsForStop(hole, stop) {
  if (!pointInCircle(stop, hole.green, hole.green.r)) return null;
  if (dist(stop, hole.green) < 0.8) return 0; // chip-in
  const rings = puttRingRadii(hole);
  const d = dist(stop, hole.green);
  if (d <= rings.gold) return 1;
  if (d <= rings.pale) return 2;
  return 3;
}

/**
 * Timing quality for a meter stop.
 * Club.carry is the yards you get with a pure hit from the fairway/tee.
 * Pure band → ~listed carry; weak/over reduce distance and widen miss.
 */
export function timingFactor(power) {
  const p = Number(power) || 0;
  const mid = (PURE_BAND.lo + PURE_BAND.hi) / 2;
  if (p >= PURE_BAND.lo && p <= PURE_BAND.hi) {
    // Map pure band → 0.97 … 1.03 of listed carry (mid of band = 1.0)
    const t = (p - PURE_BAND.lo) / Math.max(1e-6, PURE_BAND.hi - PURE_BAND.lo);
    return {
      scale: 0.97 + t * 0.06,
      spread: 0.35,
      label: 'pure',
    };
  }
  if (p > PURE_BAND.hi) {
    const over = (p - PURE_BAND.hi) / (METER_MAX - PURE_BAND.hi);
    return {
      // Slight bump then loss — never a free distance cheat
      scale: 1.03 - over * 0.28,
      spread: 0.35 + over * 2.2,
      label: 'overswing',
    };
  }
  // Weak: scale with how far below the pure band you stopped
  const under = (PURE_BAND.lo - p) / PURE_BAND.lo;
  return {
    scale: Math.max(0.2, (p / mid) * 0.92),
    spread: 0.5 + under * 1.4,
    label: 'weak',
  };
}

/** Shared carry estimate used by aim preview + shot sim (keeps them in sync). */
export function estimateCarryYards(club, lie, power) {
  const c = club || CLUBS[3];
  const lieMul = LIE_CARRY[lie] ?? 1;
  const timing = timingFactor(power);
  let carry = c.carry * lieMul * timing.scale;
  if (lie === LIE.bunker) carry = Math.min(carry, 160);
  return carry;
}

/** Clubs you can sensibly play from each lie (driver stays tee/fairway only). */
export function clubsForLie(lie) {
  switch (lie) {
    case LIE.tee:
    case LIE.fairway:
      return CLUBS;
    case LIE.rough:
      // No driver from the rough — longest option is 3-wood
      return CLUBS.filter((c) => c.id !== 'dr');
    case LIE.deepRough:
      return CLUBS.filter((c) => ['lw', 'sw', 'pw', '9i', '7i', '5i'].includes(c.id));
    case LIE.bunker:
      return CLUBS.filter((c) => ['lw', 'sw', 'pw', '9i', '7i'].includes(c.id));
    case LIE.green:
      return CLUBS.filter((c) => ['lw', 'sw', 'pw'].includes(c.id));
    default:
      return CLUBS.filter((c) => c.id !== 'dr');
  }
}

export function suggestClub(distanceYds, lie = LIE.fairway) {
  const allowed = clubsForLie(lie);
  const lieMul = LIE_CARRY[lie] || 1;
  // Listed carry × lie mul ≈ pure mid-band distance
  const need = distanceYds / Math.max(0.35, lieMul);
  let best = allowed[0];
  for (const c of allowed) {
    if (c.carry >= need) {
      best = c;
      break;
    }
    best = c;
  }
  return best;
}

/**
 * Wind / gust displacement projected onto the aim direction (yards).
 * Matches simulateShot’s wind + gust terms (no random miss).
 */
export function windAlongAim(hole, club, aimAngle, ballY, carryYds) {
  const wind = hole?.wind || { x: 0, y: 0 };
  const loft = club?.loft ?? 0.65;
  const flightT = 0.9 + loft * 0.4;
  const dirX = Math.sin(aimAngle);
  const dirY = Math.cos(aimAngle);
  let dx = wind.x * flightT * 1.1;
  let dy = wind.y * flightT * 0.35;
  if (hole?.gust) {
    const midY = (ballY || 0) + dirY * (carryYds ?? club?.carry ?? 150) * 0.5;
    if (midY >= hole.gust.y0 && midY <= hole.gust.y1) {
      dx += hole.gust.dir * hole.gust.strength * loft * 2.2;
    }
  }
  return dx * dirX + dy * dirY;
}

/**
 * Meter stop for CARRY to the pin (wind-adjusted).
 * Does not credit rollout — roll is a bonus, not assumed. That kept the old
 * PIN tick short of the flag when fairway roll was subtracted.
 * @param {{ hole?, aimAngle?, ball? }} opts
 */
export function pinPowerForClub(club, distanceYds, lie = LIE.fairway, opts = {}) {
  const lieMul = LIE_CARRY[lie] || 1;
  const full = (club?.carry || 150) * lieMul; // pure mid = listed
  if (full <= 1) return Math.round((PURE_BAND.lo + PURE_BAND.hi) / 2);

  let need = distanceYds;
  if (opts.hole && opts.aimAngle != null) {
    // First-pass carry guess, then refine wind with that carry length
    const along0 = windAlongAim(opts.hole, club, opts.aimAngle, opts.ball?.y, distanceYds);
    need = distanceYds - along0;
  }
  need = Math.max(20, need);

  const ratio = need / full;
  if (ratio >= 0.97 && ratio <= 1.03) {
    return Math.round((PURE_BAND.lo + PURE_BAND.hi) / 2);
  }
  if (ratio < 0.97) {
    return clamp(Math.round(ratio * PURE_BAND.lo), 20, PURE_BAND.lo - 1);
  }
  return PURE_BAND.hi;
}

/** Golf Clash–style spin: top (−1 back … +1 top), side (−1 left … +1 right curl). */
export const ZERO_SPIN = { top: 0, side: 0 };

/** Max spin authority by club loft (wedges check harder; woods still curl). */
export function spinLimitsForClub(club) {
  const loft = club?.loft ?? 0.55;
  return {
    top: clamp(0.5 + loft * 0.45, 0.5, 1),
    side: 0.85,
  };
}

export function clampSpin(spin, club) {
  const lim = spinLimitsForClub(club);
  return {
    top: clamp(Number(spin?.top) || 0, -lim.top, lim.top),
    side: clamp(Number(spin?.side) || 0, -lim.side, lim.side),
  };
}

function spinLabel(spin) {
  const t = Number(spin?.top) || 0;
  const s = Number(spin?.side) || 0;
  const bits = [];
  if (t > 0.12) bits.push('topspin');
  else if (t < -0.12) bits.push('backspin');
  if (s > 0.12) bits.push('curl R');
  else if (s < -0.12) bits.push('curl L');
  return bits.length ? bits.join(' · ') : 'no spin';
}

/**
 * Shared landing / roll math for preview + sim (Golf Clash spin model).
 * Top/back affect roll after landing; side curls flight (t²) and steers bounce.
 */
function computeShotGeometry({ hole, ball, aimAngle, power, club, spin, lateral = 0 }) {
  const lie = ball.lie || surfaceAt(hole, ball);
  const timing = timingFactor(power);
  const sp = clampSpin(spin, club);
  const carryYds = estimateCarryYards(club, lie, power);
  const dirX = Math.sin(aimAngle);
  const dirY = Math.cos(aimAngle);
  // Perp to the right of aim
  const perpX = dirY;
  const perpY = -dirX;

  const wind = hole.wind || { x: 0, y: 0 };
  // Backspin launches higher → catches a bit more wind (GC feel)
  const back = Math.max(0, -sp.top);
  const flightT = (0.9 + club.loft * 0.4) * (1 + back * 0.18);
  let gustPush = 0;
  if (hole.gust) {
    const midY = ball.y + dirY * carryYds * 0.5;
    if (midY >= hole.gust.y0 && midY <= hole.gust.y1) {
      gustPush = hole.gust.dir * hole.gust.strength * club.loft * 2.2 * (1 + back * 0.25);
    }
  }

  // Curl bends the shot off the guide — builds late in flight (t²)
  const curlMax = sp.side * carryYds * 0.2;
  const straightLand = {
    x: ball.x + dirX * carryYds + wind.x * flightT * 1.1 + lateral + gustPush,
    y: ball.y + dirY * carryYds + wind.y * flightT * 0.35,
  };
  const land = {
    x: straightLand.x + perpX * curlMax,
    y: straightLand.y + perpY * curlMax,
  };

  const landLie = surfaceAt(hole, land);
  let stop = { ...land };
  let rollDist = 0;
  let rollDirX = dirX;
  let rollDirY = dirY;
  if (landLie !== LIE.ob && landLie !== LIE.water) {
    const rollMul = LIE_ROLLOUT[landLie] ?? 1;
    // Topspin: more forward roll. Backspin: check / stop / slight reverse.
    const spinRoll = 1 + sp.top * (sp.top >= 0 ? 0.95 : 1.15);
    rollDist = carryYds * 0.12 * rollMul * timing.scale * spinRoll;
    // Curl also steers bounce/roll (official GC: curl changes post-bounce direction)
    rollDirX = dirX + perpX * sp.side * 0.55;
    rollDirY = dirY + perpY * sp.side * 0.55;
    const rLen = Math.hypot(rollDirX, rollDirY) || 1;
    rollDirX /= rLen;
    rollDirY /= rLen;
    stop = {
      x: land.x + rollDirX * rollDist,
      y: land.y + rollDirY * rollDist,
    };
    if (landLie === LIE.green && hole.green?.slope) {
      const mag = Math.abs(rollDist);
      stop.x += hole.green.slope.x * mag * 0.4;
      stop.y += hole.green.slope.y * mag * 0.4;
    }
  }

  return {
    club,
    lie,
    timing,
    spin: sp,
    carryYds,
    dirX,
    dirY,
    perpX,
    perpY,
    curlMax,
    straightLand,
    land,
    landLie,
    stop,
    rollDist,
    rollDirX,
    rollDirY,
    flightT,
    back,
  };
}

/**
 * Honest aim preview: carry point + expected stop (wind/gust/roll/spin, no random miss).
 */
export function previewShot({ hole, ball, aimAngle, power, clubId, spin = ZERO_SPIN }) {
  const club = CLUBS.find((c) => c.id === clubId) || CLUBS[3];
  const g = computeShotGeometry({ hole, ball, aimAngle, power, club, spin, lateral: 0 });
  // Sample curved guide for the canvas
  const guide = [];
  const n = 12;
  for (let i = 0; i <= n; i += 1) {
    const t = i / n;
    guide.push({
      x: lerp(ball.x, g.straightLand.x, t) + g.perpX * g.curlMax * t * t,
      y: lerp(ball.y, g.straightLand.y, t) + g.perpY * g.curlMax * t * t,
    });
  }
  return {
    land: g.land,
    stop: g.stop,
    carryYds: g.carryYds,
    landLie: g.landLie,
    guide,
    spin: g.spin,
    spinLabel: spinLabel(g.spin),
  };
}

/**
 * Simulate a shot. Returns path samples + final state.
 * @param {{ hole, ball, aimAngle, power, clubId, spin? }} opts
 * aimAngle: radians from +Y (0 = toward green along +y), clockwise positive to +x
 * spin: Golf Clash–style { top, side } — topspin/backspin + curl
 */
export function simulateShot({ hole, ball, aimAngle, power, clubId, spin = ZERO_SPIN }) {
  const club = CLUBS.find((c) => c.id === clubId) || CLUBS[3];
  const timing = timingFactor(power);
  // Deterministic lateral miss from inputs (no Math.random)
  const spreadSeed = Math.sin(aimAngle * 12.3 + power * 0.17 + ball.x * 0.01) * 43758.5453;
  const lateral = (spreadSeed - Math.floor(spreadSeed) - 0.5) * timing.spread * 8;

  const g = computeShotGeometry({ hole, ball, aimAngle, power, club, spin, lateral });
  const {
    land, landLie: initialLandLie, carryYds, perpX, perpY, curlMax,
    straightLand, rollDist, rollDirX, rollDirY, back,
  } = g;
  let landLie = initialLandLie;

  const path = [];
  const samples = 28;
  for (let i = 0; i <= samples; i += 1) {
    const t = i / samples;
    // Curved flight: straight lerp + curl that builds as t²
    const height = Math.sin(t * Math.PI) * (8 + club.loft * 18) * (1 + back * 0.22);
    path.push({
      x: lerp(ball.x, straightLand.x, t) + perpX * curlMax * t * t,
      y: lerp(ball.y, straightLand.y, t) + perpY * curlMax * t * t,
      z: height,
      phase: 'flight',
    });
  }

  let strokesAdd = 1;
  let dropFrom = null;
  let stop = { ...land };
  const prevLie = ball.lie || surfaceAt(hole, ball);
  const prevPos = { x: ball.x, y: ball.y };

  /** Rule 18.2 — stroke & distance: +1 penalty, replay from previous spot. */
  const applyStrokeAndDistance = (obPoint) => {
    strokesAdd = 2; // stroke played + one penalty stroke
    dropFrom = 'ob';
    stop = { ...prevPos };
    landLie = prevLie;
    path.push({ ...obPoint, z: 0, phase: 'ob' });
    path.push({ ...stop, z: 0, phase: 'drop' });
  };

  if (landLie === LIE.ob) {
    applyStrokeAndDistance(land);
  } else if (landLie === LIE.water) {
    if (hole.water?.type === 'island' && hole.water.drop) {
      strokesAdd += 1;
      stop = { ...hole.water.drop };
      dropFrom = 'island';
      landLie = surfaceAt(hole, stop);
      path.push({ ...stop, z: 0, phase: 'drop' });
    } else if (hole.water?.type === 'burn') {
      strokesAdd += 1;
      const dropY = hole.water.y0 - 6;
      stop = { x: ball.x * 0.3 + land.x * 0.7, y: dropY };
      const c = hole.centerline[Math.floor(hole.centerline.length * 0.45)];
      stop.x = lerp(stop.x, c.x, 0.5);
      dropFrom = 'burn';
      landLie = surfaceAt(hole, stop);
      path.push({ ...stop, z: 0, phase: 'drop' });
    } else {
      applyStrokeAndDistance(land);
    }
  } else {
    const rollSteps = 16;
    for (let i = 1; i <= rollSteps; i += 1) {
      const t = i / rollSteps;
      const decay = (1 - t) * (1 - t);
      let cx = land.x + rollDirX * rollDist * t;
      let cy = land.y + rollDirY * rollDist * t;
      if (landLie === LIE.green && hole.green?.slope) {
        const mag = Math.abs(rollDist);
        cx += hole.green.slope.x * mag * 0.25 * t;
        cy += hole.green.slope.y * mag * 0.25 * t;
      }
      const pt = { x: cx, y: cy };
      const lieHere = surfaceAt(hole, pt);
      path.push({ ...pt, z: 0, phase: 'roll' });
      if (lieHere === LIE.ob) {
        applyStrokeAndDistance(pt);
        break;
      }
      if (lieHere === LIE.water) {
        strokesAdd += 1;
        if (hole.water?.type === 'island' && hole.water.drop) {
          stop = { ...hole.water.drop };
        } else if (hole.water?.type === 'burn') {
          stop = { x: land.x, y: hole.water.y0 - 6 };
        } else {
          stop = { ...land };
        }
        dropFrom = 'roll-water';
        path.push({ ...stop, z: 0, phase: 'drop' });
        break;
      }
      if (lieHere === LIE.bunker || lieHere === LIE.deepRough) {
        stop = pt;
        break;
      }
      stop = pt;
      if (decay < 0.08) break;
    }
  }

  const finalLie = dropFrom === 'ob' ? prevLie : surfaceAt(hole, stop);
  const onGreen = finalLie === LIE.green;
  const putts = onGreen ? puttsForStop(hole, stop) : null;
  const holeOut = onGreen && putts != null;

  return {
    path,
    land,
    stop,
    lie: finalLie,
    strokesAdd,
    dropFrom,
    timing: timing.label,
    carryYds,
    onGreen,
    putts,
    holeOut,
    clubId: club.id,
    spin: g.spin,
    spinLabel: spinLabel(g.spin),
  };
}

export function formatScoreToPar(strokes, par) {
  const d = strokes - par;
  if (d === 0) return 'E';
  if (d > 0) return `+${d}`;
  return String(d);
}

export function holeResultLabel(strokes, par) {
  const d = strokes - par;
  if (strokes === 1) return 'Ace';
  if (d <= -3) return 'Albatross';
  if (d === -2) return 'Eagle';
  if (d === -1) return 'Birdie';
  if (d === 0) return 'Par';
  if (d === 1) return 'Bogey';
  if (d === 2) return 'Double';
  return `+${d}`;
}

export function worldBounds(hole) {
  const pad = 36;
  let minX = hole.tee.x;
  let maxX = hole.tee.x;
  let minY = hole.tee.y;
  let maxY = hole.tee.y;
  for (const p of hole.centerline || []) {
    minX = Math.min(minX, p.x);
    maxX = Math.max(maxX, p.x);
    minY = Math.min(minY, p.y);
    maxY = Math.max(maxY, p.y);
  }
  const padR = hole.sceneryR || hole.apronR || hole.green?.r || 20;
  minX = Math.min(minX, hole.green.x - padR);
  maxX = Math.max(maxX, hole.green.x + padR);
  minY = Math.min(minY, hole.green.y - padR);
  maxY = Math.max(maxY, hole.green.y + padR);
  return {
    minX: minX - pad,
    maxX: maxX + pad,
    minY: minY - pad,
    maxY: maxY + pad,
  };
}

export function angleToGreen(from, hole) {
  const dx = hole.green.x - from.x;
  const dy = hole.green.y - from.y;
  return Math.atan2(dx, dy);
}

export function distanceToPin(from, hole) {
  return dist(from, hole.green);
}
