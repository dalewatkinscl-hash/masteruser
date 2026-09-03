import { useCallback, useEffect, useRef, useState } from 'react';
import FunDayPicker, { getLondonDayKey } from './FunDayPicker';
import FunLeaderboardRow from './FunLeaderboardRow';
import { TOOLBOX_KICK_LIVE_FROM } from '../lib/funRotation';

/**
 * Toolbox Kick — Kitten Cannon–style.
 * Space ×2: lock power, then lock angle (~45° ideal). Kick the toolbox past coaches.
 * Competitive Fun: one round per day (all-or-nothing or 3 goes); distance leaderboard.
 */

async function readJsonResponse(res) {
  const contentType = res.headers.get('content-type') || '';
  if (!contentType.includes('application/json')) return null;
  try {
    return await res.json();
  } catch {
    return null;
  }
}

const W = 960;
const H = 420;
const GROUND_Y = 340;
const MECH_START_X = 18;
const MECH_KICK_X = 102;
const BOX_REST_X = 118;
const RUNUP_FRAMES = 52;
const KICK_FRAME = 54;
const LAUNCH_FRAME = 58;
const PX_PER_METRE = 2.2;
const CHUNK_SIZE = 4000;
const AHEAD_BUFFER = 2800;
const INTRO_STORAGE_KEY = 'toolbox-kick-intro-seen-v4';
const MAX_ATTEMPTS = 3;
/** World X where rare smoker drivers can appear (12 km of flight). */
const SMOKER_FROM_X = BOX_REST_X + 12 * 1000 * PX_PER_METRE;
/** Even rarer Macan — starts a bit further out than the smoker. */
const MACAN_FROM_X = BOX_REST_X + 18 * 1000 * PX_PER_METRE;
/** Ultra-rare Little Dick cameo — further still. */
const LITTLE_DICK_FROM_X = BOX_REST_X + 25 * 1000 * PX_PER_METRE;
/** Sea-level-ish: mph ÷ this ≈ Mach. */
const MPH_PER_MACH = 767.269;
const MACH_DISPLAY_FROM_MPH = 250;
/** How far the camera can pull out at top speed. */
const MIN_ZOOM = 0.42;
/** Oil spill coating, birds, Julies Car and the Little Dick cameo — live everywhere. */
export const TOOLBOX_NEW_PROPS_LIVE = true;

/**
 * Real-ish road distances south from Northampton (game km = real km).
 * Corridor: A508 / M1 south toward London & the coast.
 */
const DISTANCE_MILESTONES = [
  { km: 5, label: 'Wootton!', sub: '5 km south of Northampton' },
  { km: 13, label: 'Roade!', sub: '13 km south of Northampton' },
  { km: 32, label: 'Milton Keynes!', sub: '32 km south of Northampton' },
  { km: 50, label: 'Dunstable!', sub: '50 km south of Northampton' },
  { km: 60, label: 'Luton!', sub: '60 km south of Northampton' },
  { km: 88, label: 'St Albans!', sub: '88 km south of Northampton' },
  { km: 110, label: 'London!', sub: '110 km south of Northampton' },
  { km: 130, label: 'Croydon!', sub: '130 km south of Northampton' },
  { km: 190, label: 'Brighton!', sub: '190 km south — the coast!' },
  { km: 210, label: 'Newhaven!', sub: '210 km south — Channel ferry' },
  { km: 350, label: 'Calais!', sub: '350 km south — made it to France' },
  { km: 480, label: 'Paris!', sub: '480 km south of Northampton' },
];

/**
 * Hardcoded gameplay values (tuned in Dev, then locked in).
 */
export const DEFAULT_TUNING = {
  launchSpeed100: 45,
  launchSpeedMin: 5,
  sackBounce: 14,
  sackBoost: 1.28,
  groundDrag: 0.98,
  friction: 0.9975,
  /** After oil coating — slides much further on the ground. */
  oilGroundDrag: 0.994,
  oilFriction: 0.9994,
  bounceDamp: 0.82,
  gravity: 0.2,
  airDrag: 0.9994,
  stopSpeed: 0.08,
  coachSlow: 0.84,
  coachDrag: 0.985,
  birdSlow: 0.93,
};

/** Bar oscillation speeds by play mode. */
const BAR_SPEED = {
  careful: { power: 0.0225, angle: 0.02 },
  allOrNothing: { power: 0.011, angle: 0.01 },
};

const PHASE = {
  READY: 'ready',
  POWER: 'power',
  ANGLE: 'angle',
  RUNUP: 'runup',
  FLIGHT: 'flight',
  LANDED: 'landed',
};

function hasSeenIntro() {
  try {
    return localStorage.getItem(INTRO_STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

function markIntroSeen() {
  try {
    localStorage.setItem(INTRO_STORAGE_KEY, '1');
  } catch {
    // ignore
  }
}

/**
 * Metres under 1000; kilometres from 1000+.
 * Extra ! per full km after the first (capped at 5). From 10 km the UI pulses.
 * Negative distances (Little Dick boot-back) keep the minus sign.
 */
function formatDistanceParts(metres) {
  const raw = Math.floor(Number(metres) || 0);
  const neg = raw < 0;
  const m = Math.abs(raw);
  const sign = neg ? '−' : '';
  if (m < 1000) {
    return {
      label: `${sign}${m.toLocaleString('en-GB')} m`,
      bangs: '',
      pulse: false,
      kmWhole: 0,
      negative: neg,
    };
  }
  const km = m / 1000;
  const kmWhole = Math.floor(km);
  const label = `${sign}${km.toFixed(1)} km`;
  const bangs = neg ? '' : '!'.repeat(Math.min(5, Math.max(0, kmWhole - 1)));
  return {
    label,
    bangs,
    pulse: !neg && m >= 10000,
    kmWhole,
    negative: neg,
  };
}

function formatDistance(metres) {
  const { label, bangs } = formatDistanceParts(metres);
  return `${label}${bangs}`;
}

const HIT_TALLY_ORDER = [
  'coach',
  'sack',
  'cone',
  'drum',
  'bird',
  'smoker',
  'macan',
  'littleDick',
  'oilSpill',
];

const HIT_TALLY_LABELS = {
  coach: 'Coach',
  sack: 'Sack',
  cone: 'Cone',
  drum: 'Drum',
  bird: 'Bird',
  smoker: 'Smoker',
  macan: 'Julies Car',
  littleDick: 'Little Dick',
  oilSpill: 'Oil',
};

function bumpHitTally(st, type) {
  if (!st.hitTally) st.hitTally = {};
  st.hitTally[type] = (st.hitTally[type] || 0) + 1;
}

/**
 * Arcade mph from toolbox velocity.
 * Tuned so a full-power launch (~45 px/frame) reads ~95 mph.
 */
function speedMphFromBox(box) {
  if (!box) return 0;
  const pxPerFrame = Math.hypot(Number(box.vx) || 0, Number(box.vy) || 0);
  return Math.max(0, Math.round(pxPerFrame * 2.1));
}

/** Above 250 mph → Mach readout. */
function formatSpeedReadout(mph) {
  const n = Math.max(0, Number(mph) || 0);
  if (n > MACH_DISPLAY_FROM_MPH) {
    const mach = n / MPH_PER_MACH;
    return {
      primary: mach.toFixed(2),
      unit: 'Mach',
      label: `Mach ${mach.toFixed(2)}`,
      mach: true,
    };
  }
  return {
    primary: String(Math.round(n)),
    unit: 'mph',
    label: `${Math.round(n)} mph`,
    mach: false,
  };
}

/** Height above ground (game metres). */
function altitudeMetresFromBox(box) {
  if (!box) return 0;
  const groundY = GROUND_Y - 10;
  return Math.max(0, (groundY - box.y) / PX_PER_METRE);
}

/** Altitude readout — m below 1000, km from 1000+. */
function formatAltitudeReadout(metres) {
  const m = Math.max(0, Math.floor(Number(metres) || 0));
  if (m < 1000) {
    return {
      primary: m.toLocaleString('en-GB'),
      unit: 'm',
      label: `${m.toLocaleString('en-GB')} m`,
    };
  }
  const km = (m / 1000).toFixed(1);
  return {
    primary: km,
    unit: 'km',
    label: `${km} km`,
  };
}

/** Distance value + unit for the centre stat (no bangs). */
function formatDistanceStat(metres) {
  const raw = Math.floor(Number(metres) || 0);
  const neg = raw < 0;
  const m = Math.abs(raw);
  const sign = neg ? '−' : '';
  if (m < 1000) {
    return {
      primary: `${sign}${m.toLocaleString('en-GB')}`,
      unit: 'm',
      negative: neg,
    };
  }
  return {
    primary: `${sign}${(m / 1000).toFixed(1)}`,
    unit: 'km',
    negative: neg,
  };
}

const STAT_PANEL_H = 68;
const STAT_BAR_H = STAT_PANEL_H + 12;
const STAT_GAP = 10;

/** Floating RPG damage-number stat — no panel, just glowing text. */
function drawRpgStatPanel(ctx, x, y, w, h, opts) {
  const {
    title,
    value,
    unit,
    color,
    glow,
    gold = false,
    frame = 0,
    pulse = false,
  } = opts;

  ctx.save();
  const cx = x + w / 2;
  const valY = y + 34;
  const scale = pulse ? 1 + 0.05 * Math.sin(frame * 0.2) : 1;
  ctx.translate(cx, valY);
  ctx.scale(scale, scale);
  ctx.translate(-cx, -valY);

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  ctx.fillStyle = gold ? 'rgba(253,230,138,0.85)' : 'rgba(226,232,240,0.7)';
  ctx.font = '800 11px system-ui, Segoe UI, sans-serif';
  ctx.shadowColor = 'rgba(11,18,32,0.85)';
  ctx.shadowBlur = 4;
  ctx.fillText(title.toUpperCase(), cx, y + 12);

  ctx.font = '900 40px system-ui, Segoe UI, sans-serif';
  ctx.lineWidth = 5;
  ctx.strokeStyle = 'rgba(11,18,32,0.8)';
  ctx.shadowBlur = 0;
  ctx.strokeText(value, cx, valY);
  ctx.shadowColor = glow;
  ctx.shadowBlur = gold ? 20 : 12;
  ctx.fillStyle = color;
  ctx.fillText(value, cx, valY);
  ctx.shadowBlur = 0;

  const valueW = ctx.measureText(value).width;
  ctx.font = '900 15px system-ui, Segoe UI, sans-serif';
  ctx.textAlign = 'left';
  ctx.lineWidth = 3;
  ctx.strokeStyle = 'rgba(11,18,32,0.8)';
  ctx.strokeText(unit.toUpperCase(), cx + valueW / 2 + 5, valY + 9);
  ctx.fillStyle = gold ? '#fde68a' : '#e2e8f0';
  ctx.shadowColor = glow;
  ctx.shadowBlur = gold ? 12 : 6;
  ctx.fillText(unit.toUpperCase(), cx + valueW / 2 + 5, valY + 9);
  ctx.restore();
}

function drawTopStatsBar(ctx, st) {
  const box = st.box || {};
  const mph = speedMphFromBox(box);
  const speed = formatSpeedReadout(mph);
  const distStat = formatDistanceStat(st.distance || 0);
  const alt = formatAltitudeReadout(altitudeMetresFromBox(box));
  const panelW = (W - STAT_GAP * 4) / 3;
  const y = 6;
  const distM = Math.floor(st.distance || 0);

  const speedGold = speed.mach || mph >= 200;
  const speedColor = speed.mach ? '#f472b6' : mph >= 200 ? '#fbbf24' : '#ffffff';
  const speedGlow = speed.mach ? '#ec4899' : mph >= 200 ? '#f59e0b' : '#64748b';

  const distGold = !distStat.negative && distM >= 10000;
  const distColor = distStat.negative ? '#f87171' : distGold ? '#fbbf24' : '#ffffff';
  const distGlow = distStat.negative ? '#ef4444' : distGold ? '#f59e0b' : '#94a3b8';

  const altM = Math.floor(altitudeMetresFromBox(box));
  const altGold = altM >= 500;
  const altColor = altGold ? '#fde68a' : '#bae6fd';
  const altGlow = altGold ? '#eab308' : '#0ea5e9';

  drawRpgStatPanel(ctx, STAT_GAP, y, panelW, STAT_PANEL_H, {
    title: 'Speed',
    value: speed.primary,
    unit: speed.unit,
    color: speedColor,
    glow: speedGlow,
    gold: speedGold,
    frame: st.frame,
    pulse: speedGold,
  });
  drawRpgStatPanel(ctx, STAT_GAP * 2 + panelW, y, panelW, STAT_PANEL_H, {
    title: 'Distance',
    value: distStat.primary,
    unit: distStat.unit,
    color: distColor,
    glow: distGlow,
    gold: distGold,
    frame: st.frame,
    pulse: distGold || distStat.negative,
  });
  drawRpgStatPanel(ctx, STAT_GAP * 3 + panelW * 2, y, panelW, STAT_PANEL_H, {
    title: 'Altitude',
    value: alt.primary,
    unit: alt.unit,
    color: altColor,
    glow: altGlow,
    gold: altGold,
    frame: st.frame,
    pulse: altGold,
  });
}

function drawHitTally(ctx, st) {
  const tally = st.hitTally || {};
  const rows = HIT_TALLY_ORDER
    .filter((k) => (tally[k] || 0) > 0)
    .map((k) => `${HIT_TALLY_LABELS[k]} ×${tally[k]}`);
  const lineH = 18;
  const x = W - 14;
  const startY = H - 14 - Math.max(1, rows.length) * lineH;

  ctx.save();
  ctx.textAlign = 'right';
  ctx.textBaseline = 'top';

  ctx.font = '800 11px system-ui, Segoe UI, sans-serif';
  ctx.lineWidth = 3;
  ctx.strokeStyle = 'rgba(11,18,32,0.8)';
  ctx.strokeText('HIT', x, startY - 16);
  ctx.fillStyle = 'rgba(253,230,138,0.85)';
  ctx.fillText('HIT', x, startY - 16);

  if (rows.length) {
    ctx.font = '900 17px system-ui, Segoe UI, sans-serif';
    rows.forEach((line, i) => {
      const ly = startY + i * lineH;
      ctx.lineWidth = 4;
      ctx.strokeStyle = 'rgba(11,18,32,0.8)';
      ctx.shadowBlur = 0;
      ctx.strokeText(line, x, ly);
      ctx.fillStyle = '#fbbf24';
      ctx.shadowColor = '#f59e0b';
      ctx.shadowBlur = 10;
      ctx.fillText(line, x, ly);
      ctx.shadowBlur = 0;
    });
  } else {
    ctx.font = '800 14px system-ui, Segoe UI, sans-serif';
    ctx.lineWidth = 3;
    ctx.strokeStyle = 'rgba(11,18,32,0.8)';
    ctx.strokeText('none yet', x, startY);
    ctx.fillStyle = 'rgba(148,163,184,0.9)';
    ctx.fillText('none yet', x, startY);
  }
  ctx.restore();
}

function clamp(n, lo, hi) {
  return Math.max(lo, Math.min(hi, n));
}

function makeRng(seed) {
  let s = (seed >>> 0) || 1;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

/** Append randomised props from `fromX` up to `toX`. Returns new cursor x. */
function appendProps(items, fromX, toX, next, features = {}) {
  const newProps = Boolean(features.newProps);
  const skipRare = Boolean(features.skipRare);
  let x = Math.max(fromX, 0);
  while (x < toX) {
    if (next() < 0.2) {
      x += 140 + next() * 480;
      continue;
    }
    // Ultra-rare Little Dick — rarer than Macan, from 25 km
    if (!skipRare && newProps && x >= LITTLE_DICK_FROM_X && next() < 0.0015) {
      items.push({
        type: 'littleDick',
        x,
        id: `littledick-${items.length}-${x | 0}`,
      });
      x += 600 + next() * 1000;
      continue;
    }
    // Ultra-rare black Macan — rarer than smoker, from 18 km
    if (!skipRare && newProps && x >= MACAN_FROM_X && next() < 0.004) {
      items.push({
        type: 'macan',
        x,
        id: `macan-${items.length}-${x | 0}`,
      });
      x += 520 + next() * 900;
      continue;
    }
    // Very rare smoker break from 12 km onward — enormous bounce if you hit them
    if (!skipRare && x >= SMOKER_FROM_X && next() < 0.012) {
      items.push({
        type: 'smoker',
        x,
        id: `smoker-${items.length}-${x | 0}`,
      });
      x += 400 + next() * 700;
      continue;
    }
    const roll = next();
    if (newProps && roll < 0.1) {
      // Airborne birds — small speed tax if hit
      items.push({
        type: 'bird',
        x,
        y: GROUND_Y - (55 + next() * 110),
        dir: next() > 0.5 ? 1 : -1,
        id: `bird-${items.length}-${x | 0}`,
      });
      x += 90 + next() * 180;
    } else if (roll < 0.28) {
      items.push({
        type: 'coach',
        x,
        w: 100 + next() * 70,
        h: 48 + next() * 16,
        id: `coach-${items.length}-${x | 0}`,
      });
      x += 140 + next() * 200;
    } else if (roll < 0.52) {
      items.push({
        type: 'sack',
        x,
        r: 14 + next() * 10,
        id: `sack-${items.length}-${x | 0}`,
      });
      x += 70 + next() * 160;
    } else if (roll < 0.72) {
      items.push({ type: 'cone', x, id: `cone-${items.length}-${x | 0}` });
      x += 50 + next() * 110;
    } else if (roll < 0.88) {
      items.push({
        type: 'drum',
        x,
        spilled: false,
        id: `drum-${items.length}-${x | 0}`,
      });
      x += 60 + next() * 130;
    } else {
      items.push({
        type: 'sack',
        x,
        r: 15 + next() * 8,
        id: `sack-${items.length}-${x | 0}`,
      });
      items.push({
        type: 'sack',
        x: x + 36 + next() * 24,
        r: 14 + next() * 8,
        id: `sack-${items.length}-${(x + 40) | 0}`,
      });
      x += 100 + next() * 140;
    }
  }
  return x;
}

function ensurePropsAhead(st, lookAheadX) {
  while (st.propCursor < lookAheadX) {
    const target = st.propCursor + CHUNK_SIZE;
    st.propCursor = appendProps(st.items, st.propCursor, target, st.rng, {
      newProps: st.newProps,
    });
  }
}

/** Fill regular obstacles on the leg back toward the kick-off (after Little Dick boot). */
function ensureReturnPathProps(st, boxX) {
  const fromX = Math.max(BOX_REST_X + 280, boxX - AHEAD_BUFFER);
  const toX = boxX + 240;
  let cursor = fromX;
  while (cursor < toX) {
    const hasProp = st.items.some((it) => it.x >= cursor && it.x < cursor + 160);
    if (!hasProp) {
      appendProps(st.items, cursor, cursor + 900, st.rng, {
        newProps: st.newProps,
        skipRare: true,
      });
    }
    cursor += 480;
  }
  st.items.sort((a, b) => a.x - b.x);
}

function cullDistantProps(st, box) {
  const vx = box?.vx || 0;
  const x = box?.x || 0;
  const keepMin = vx < -0.5
    ? Math.max(BOX_REST_X - 160, x - AHEAD_BUFFER)
    : st.camX - 800;
  const keepMax = x + AHEAD_BUFFER + 600;
  if (st.items.length > 100) {
    st.items = st.items.filter((it) => it.x >= keepMin && it.x <= keepMax);
  }
}

function ensurePropsAround(st, box) {
  ensurePropsAhead(st, box.x + AHEAD_BUFFER);
  if ((box.vx || 0) < -0.5) {
    ensureReturnPathProps(st, box.x);
  }
  cullDistantProps(st, box);
}

/** Dev sandbox — drop a rare prop just downrange of the toolbox. */
function spawnDevPropAhead(st, type) {
  const baseX = st.phase === PHASE.FLIGHT && st.box ? st.box.x : BOX_REST_X;
  const spawnX = baseX + 480;
  st.items = st.items.filter((it) => !(it.type === type && Math.abs(it.x - spawnX) < 320));
  st.items.push({
    type,
    x: spawnX,
    id: `dev-${type}-${spawnX | 0}-${Date.now()}`,
  });
  st.message = type === 'macan'
    ? 'CHEAT · Julies Car spawned ahead'
    : 'CHEAT · Little Dick spawned ahead';
}

function meterValue(t) {
  const cycle = t % 2;
  return cycle < 1 ? cycle : 2 - cycle;
}

function gradePower(pct) {
  if (pct >= 100) {
    return { label: 'Perfect!', sub: `${pct}% POWER`, gold: true, color: '#fbbf24', glow: '#f59e0b' };
  }
  if (pct >= 90) {
    return { label: 'Excellent!', sub: `${pct}% POWER`, gold: false, color: '#e9d5ff', glow: '#a855f7' };
  }
  if (pct >= 75) {
    return { label: 'Great!', sub: `${pct}% POWER`, gold: false, color: '#bae6fd', glow: '#0ea5e9' };
  }
  if (pct >= 50) {
    return { label: 'Good', sub: `${pct}% POWER`, gold: false, color: '#bbf7d0', glow: '#22c55e' };
  }
  return { label: 'Weak', sub: `${pct}% POWER`, gold: false, color: '#cbd5e1', glow: '#64748b' };
}

function gradeAngle(deg) {
  const off = Math.abs(45 - deg);
  const pct = Math.round(clamp(100 - off * 4, 0, 100));
  if (off <= 1) {
    return { label: 'Perfect!', sub: `${deg.toFixed(0)}° ANGLE`, gold: true, color: '#fbbf24', glow: '#f59e0b' };
  }
  if (off <= 3) {
    return { label: 'Excellent!', sub: `${deg.toFixed(0)}° ANGLE`, gold: false, color: '#e9d5ff', glow: '#a855f7' };
  }
  if (off <= 7) {
    return { label: 'Great!', sub: `${deg.toFixed(0)}° ANGLE`, gold: false, color: '#bae6fd', glow: '#0ea5e9' };
  }
  if (off <= 14) {
    return { label: 'Good', sub: `${deg.toFixed(0)}° ANGLE`, gold: false, color: '#bbf7d0', glow: '#22c55e' };
  }
  return { label: 'Off', sub: `${deg.toFixed(0)}° · want 45°`, gold: false, color: '#cbd5e1', glow: '#64748b', pct };
}

function isPerfectPower(power01) {
  return Math.round(clamp(power01, 0, 1) * 100) >= 100;
}

function isPerfectAngle(deg) {
  return Math.abs(45 - Number(deg)) <= 1;
}

/** Combined perfect power + angle → launch flash + speed multiplier. */
const PERFECT_LAUNCH_BOOST = 1.25;

function perfectLaunchGrade() {
  return {
    label: 'Perfect launch!!!',
    sub: '+25% launch speed',
    gold: true,
    epic: true,
    color: '#fde68a',
    glow: '#f59e0b',
  };
}

function launchSpeedForPower(power01, tuning) {
  const p = clamp(power01, 0, 1);
  return tuning.launchSpeedMin + p * (tuning.launchSpeed100 - tuning.launchSpeedMin);
}

function drawSky(ctx, camX) {
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, '#7eb6d9');
  g.addColorStop(0.55, '#c5dce8');
  g.addColorStop(1, '#e8dcc8');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);

  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  for (let i = 0; i < 5; i += 1) {
    const cx = ((i * 220 - camX * 0.15) % (W + 200)) - 40;
    ctx.beginPath();
    ctx.ellipse(cx, 48 + (i % 3) * 12, 42, 16, 0, 0, Math.PI * 2);
    ctx.ellipse(cx + 28, 52, 34, 14, 0, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawGround(ctx, camX) {
  ctx.fillStyle = '#3d5c3a';
  ctx.fillRect(0, GROUND_Y, W, H - GROUND_Y);
  ctx.fillStyle = '#4a6b45';
  ctx.fillRect(0, GROUND_Y, W, 8);

  ctx.strokeStyle = 'rgba(0,0,0,0.12)';
  ctx.lineWidth = 1;
  for (let x = -((camX * 0.5) % 40); x < W; x += 40) {
    ctx.beginPath();
    ctx.moveTo(x, GROUND_Y + 10);
    ctx.lineTo(x + 20, H);
    ctx.stroke();
  }

  ctx.fillStyle = '#5a5a5a';
  ctx.fillRect(0, GROUND_Y - 2, W, 4);
}

function drawMechanic(ctx, x, y, frame, { kicking = false, running = false } = {}) {
  ctx.save();
  ctx.translate(x, y);

  ctx.fillStyle = 'rgba(0,0,0,0.22)';
  ctx.beginPath();
  ctx.ellipse(0, 4, 22, 6, 0, 0, Math.PI * 2);
  ctx.fill();

  const stride = running ? Math.sin(frame * 0.55) : 0;
  const lean = kicking ? -0.42 : running ? 0.22 : Math.sin(frame * 0.2) * 0.05;
  ctx.rotate(lean);

  ctx.strokeStyle = '#c45a12';
  ctx.lineWidth = 7;
  ctx.lineCap = 'round';
  const backLeg = kicking ? -20 : running ? -10 - stride * 12 : -6;
  const frontLeg = kicking ? 16 : running ? 8 + stride * 12 : 6;
  ctx.beginPath();
  ctx.moveTo(-4, -8);
  ctx.lineTo(backLeg, 0);
  ctx.moveTo(4, -8);
  ctx.lineTo(frontLeg, 0);
  ctx.stroke();

  ctx.fillStyle = '#1a1a1a';
  ctx.fillRect(backLeg - 6, -3, 12, 6);
  ctx.fillRect(frontLeg - 4, -3, 12, 6);

  ctx.fillStyle = '#e86a12';
  ctx.beginPath();
  ctx.roundRect(-14, -48, 28, 42, 6);
  ctx.fill();
  ctx.fillStyle = '#c4550e';
  ctx.fillRect(-4, -48, 8, 42);

  ctx.strokeStyle = '#e86a12';
  ctx.lineWidth = 6;
  const armSwing = running ? stride * 10 : 0;
  ctx.beginPath();
  ctx.moveTo(-12, -38);
  ctx.lineTo(kicking ? -24 : -18 - armSwing, kicking ? -24 : -20);
  ctx.moveTo(12, -38);
  ctx.lineTo(kicking ? 6 : 16 + armSwing, kicking ? -30 : -18);
  ctx.stroke();

  ctx.fillStyle = '#e8b090';
  ctx.beginPath();
  ctx.arc(0, -58, 11, 0, Math.PI * 2);
  ctx.fill();

  // black hair
  ctx.fillStyle = '#0a0a0a';
  ctx.beginPath();
  ctx.ellipse(0, -64, 11, 7, 0, Math.PI, 0);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(-11, -62);
  ctx.quadraticCurveTo(-14, -54, -10, -50);
  ctx.lineTo(-8, -56);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(11, -62);
  ctx.quadraticCurveTo(14, -54, 10, -50);
  ctx.lineTo(8, -56);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(-5, -66, 4, 3, -0.3, 0, Math.PI * 2);
  ctx.ellipse(5, -66, 4, 3, 0.3, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = '#1a1a1a';
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.moveTo(-7, -62);
  ctx.lineTo(-2, -60);
  ctx.moveTo(7, -62);
  ctx.lineTo(2, -60);
  ctx.stroke();

  ctx.fillStyle = '#1a1a1a';
  ctx.beginPath();
  ctx.arc(-4, -58, 1.6, 0, Math.PI * 2);
  ctx.arc(4, -58, 1.6, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = '#1a1a1a';
  ctx.beginPath();
  ctx.moveTo(-8, -52);
  ctx.quadraticCurveTo(0, -38, 8, -52);
  ctx.quadraticCurveTo(0, -46, -8, -52);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(0, -48, 7, 8, 0, 0, Math.PI);
  ctx.fill();

  ctx.strokeStyle = '#5a2a1a';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(-3, -54);
  ctx.lineTo(3, -54);
  ctx.stroke();

  ctx.restore();
}

function drawToolbox(ctx, x, y, rot, flying, oiled = false) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rot);
  ctx.fillStyle = 'rgba(0,0,0,0.2)';
  ctx.beginPath();
  ctx.ellipse(0, 10, 16, 5, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = oiled ? '#3f3a1a' : '#c4a035';
  ctx.strokeStyle = oiled ? '#1a1a0a' : '#6b5420';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.roundRect(-16, -10, 32, 18, 3);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = oiled ? '#2a2810' : '#8a7028';
  ctx.fillRect(-16, -2, 32, 3);
  ctx.fillStyle = '#2a2a2a';
  ctx.fillRect(-4, -14, 8, 5);
  ctx.strokeStyle = '#2a2a2a';
  ctx.beginPath();
  ctx.arc(0, -14, 5, Math.PI, 0);
  ctx.stroke();

  if (oiled) {
    ctx.fillStyle = 'rgba(40, 35, 10, 0.55)';
    ctx.beginPath();
    ctx.ellipse(-4, -2, 7, 4, -0.3, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(6, 2, 5, 3, 0.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(180, 160, 40, 0.35)';
    ctx.beginPath();
    ctx.ellipse(2, -6, 3, 1.5, 0.2, 0, Math.PI * 2);
    ctx.fill();
  }

  if (flying) {
    ctx.strokeStyle = oiled ? 'rgba(80,70,20,0.45)' : 'rgba(255,200,80,0.5)';
    ctx.beginPath();
    ctx.moveTo(-20, 0);
    ctx.lineTo(-32, 4);
    ctx.stroke();
  }
  ctx.restore();
}

function drawCoach(ctx, x, y, w, h) {
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = '#6b1c2a';
  ctx.strokeStyle = '#3f0f18';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.roundRect(0, -h, w, h, 6);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#8b2a3b';
  ctx.fillRect(0, -h + 10, w, 8);
  ctx.fillStyle = '#f5e6d3';
  ctx.fillRect(0, -h + 18, w, 3);
  ctx.fillStyle = '#93c5fd';
  const winCount = Math.max(3, Math.floor(w / 28));
  for (let i = 0; i < winCount; i += 1) {
    ctx.fillRect(8 + i * (w / winCount), -h + 26, 14, 14);
  }
  ctx.fillStyle = '#111';
  ctx.beginPath();
  ctx.arc(18, 0, 8, 0, Math.PI * 2);
  ctx.arc(w - 18, 0, 8, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawSack(ctx, x, y, r) {
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = '#5b4a32';
  ctx.beginPath();
  ctx.ellipse(0, -r * 0.2, r * 1.1, r, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#3f3424';
  ctx.beginPath();
  ctx.moveTo(-r * 0.4, -r);
  ctx.lineTo(0, -r * 1.35);
  ctx.lineTo(r * 0.4, -r);
  ctx.fill();
  ctx.fillStyle = '#7a9a5a';
  ctx.strokeStyle = '#c5d4a8';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(0, -r * 0.15, 5, -0.2, Math.PI * 1.4);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(3, -r * 0.15 - 5);
  ctx.lineTo(6, -r * 0.15 - 1);
  ctx.lineTo(1, -r * 0.15 - 1);
  ctx.fill();
  ctx.restore();
}

function drawCone(ctx, x, y) {
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = '#ea580c';
  ctx.beginPath();
  ctx.moveTo(0, -28);
  ctx.lineTo(10, 0);
  ctx.lineTo(-10, 0);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.fillRect(-7, -14, 14, 4);
  ctx.restore();
}

function drawDrum(ctx, x, y, spilled = false) {
  ctx.save();
  ctx.translate(x, y);

  if (spilled) {
    // Oil puddle on the road
    ctx.fillStyle = 'rgba(20, 18, 8, 0.72)';
    ctx.beginPath();
    ctx.ellipse(8, 1, 38, 10, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(60, 50, 15, 0.35)';
    ctx.beginPath();
    ctx.ellipse(14, 0, 18, 5, 0.1, 0, Math.PI * 2);
    ctx.fill();
    // Tipped barrel
    ctx.rotate(1.15);
    ctx.fillStyle = '#92400e';
    ctx.fillRect(-12, -28, 24, 28);
    ctx.fillStyle = '#78350f';
    ctx.fillRect(-12, -20, 24, 4);
    ctx.fillStyle = '#1e3a8a';
    ctx.font = 'bold 8px sans-serif';
    ctx.fillText('OIL', -8, -8);
  } else {
    ctx.fillStyle = '#b45309';
    ctx.fillRect(-12, -28, 24, 28);
    ctx.fillStyle = '#92400e';
    ctx.fillRect(-12, -20, 24, 4);
    ctx.fillStyle = '#1d4ed8';
    ctx.font = 'bold 9px sans-serif';
    ctx.fillText('OIL', -9, -8);
  }
  ctx.restore();
}

/** Rare boost prop: driver on a smoke break — big silhouette + thick smoke. */
function drawSmoker(ctx, x, y, frame = 0) {
  ctx.save();
  ctx.translate(x, y);

  // soft glow so they read at speed
  ctx.fillStyle = 'rgba(250, 204, 21, 0.18)';
  ctx.beginPath();
  ctx.arc(0, -36, 42, 0, Math.PI * 2);
  ctx.fill();

  // shadow
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.beginPath();
  ctx.ellipse(0, 2, 22, 6, 0, 0, Math.PI * 2);
  ctx.fill();

  // legs
  ctx.strokeStyle = '#1e3a5f';
  ctx.lineWidth = 6;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(-5, -10);
  ctx.lineTo(-10, 0);
  ctx.moveTo(5, -10);
  ctx.lineTo(9, 0);
  ctx.stroke();

  // body / hi-vis jacket (larger)
  ctx.fillStyle = '#facc15';
  ctx.beginPath();
  ctx.roundRect(-14, -48, 28, 40, 5);
  ctx.fill();
  ctx.fillStyle = '#1e293b';
  ctx.fillRect(-14, -32, 28, 5);
  // reflective strips
  ctx.fillStyle = '#fef08a';
  ctx.fillRect(-14, -40, 28, 3);
  ctx.fillRect(-14, -24, 28, 3);

  // head
  ctx.fillStyle = '#e8b090';
  ctx.beginPath();
  ctx.arc(0, -56, 10, 0, Math.PI * 2);
  ctx.fill();

  // cap
  ctx.fillStyle = '#0f172a';
  ctx.beginPath();
  ctx.ellipse(0, -61, 10, 5, 0, Math.PI, 0);
  ctx.fill();
  ctx.fillRect(-11, -64, 18, 4);

  // arm holding cigarette
  ctx.strokeStyle = '#e8b090';
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.moveTo(12, -36);
  ctx.lineTo(26, -42);
  ctx.stroke();

  // cigarette
  ctx.strokeStyle = '#f5f5f4';
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.moveTo(26, -42);
  ctx.lineTo(38, -45);
  ctx.stroke();
  ctx.fillStyle = '#f97316';
  ctx.beginPath();
  ctx.arc(38, -45, 2.4, 0, Math.PI * 2);
  ctx.fill();
  // ember glow
  ctx.fillStyle = 'rgba(249, 115, 22, 0.45)';
  ctx.beginPath();
  ctx.arc(38, -45, 6, 0, Math.PI * 2);
  ctx.fill();

  // thick rising smoke
  const t = frame * 0.14;
  for (let i = 0; i < 5; i += 1) {
    const sy = -48 - i * 11 - ((t * 4 + i * 3) % 14);
    const sx = 40 + i * 4 + Math.sin(t + i * 1.2) * 4;
    const r = 4 + i * 1.4;
    ctx.fillStyle = `rgba(210,210,210,${0.55 - i * 0.07})`;
    ctx.beginPath();
    ctx.arc(sx, sy, r, 0, Math.PI * 2);
    ctx.fill();
  }

  // floating label
  ctx.fillStyle = 'rgba(15, 23, 42, 0.75)';
  ctx.beginPath();
  ctx.roundRect(-36, -92, 72, 16, 4);
  ctx.fill();
  ctx.fillStyle = '#facc15';
  ctx.font = 'bold 10px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('SMOKE BREAK', 0, -81);

  ctx.restore();
}

function drawOilSpill(ctx, x, y, frame = 0) {
  ctx.save();
  ctx.translate(x, y);
  const shimmer = 0.08 + 0.04 * Math.sin(frame * 0.15);
  ctx.fillStyle = `rgba(15, 12, 4, ${0.7 + shimmer})`;
  ctx.beginPath();
  ctx.ellipse(0, 0, 44, 12, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = `rgba(80, 70, 20, ${0.25 + shimmer})`;
  ctx.beginPath();
  ctx.ellipse(8, -1, 16, 5, 0.15, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = `rgba(120, 100, 30, ${0.2 + shimmer})`;
  ctx.beginPath();
  ctx.ellipse(-10, 1, 10, 3, -0.2, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawBird(ctx, x, y, frame = 0, dir = 1) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(dir, 1);
  const flap = Math.sin(frame * 0.45) * 0.55;
  // body
  ctx.fillStyle = '#1e293b';
  ctx.beginPath();
  ctx.ellipse(0, 0, 8, 4.5, 0, 0, Math.PI * 2);
  ctx.fill();
  // head
  ctx.beginPath();
  ctx.arc(7, -2, 3.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#f59e0b';
  ctx.beginPath();
  ctx.moveTo(10, -2);
  ctx.lineTo(15, -1);
  ctx.lineTo(10, 0);
  ctx.fill();
  // wings
  ctx.strokeStyle = '#334155';
  ctx.lineWidth = 2.5;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(-2, -1);
  ctx.quadraticCurveTo(-6, -14 - flap * 10, -14, -4 + flap * 6);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.quadraticCurveTo(2, 8 + flap * 8, -8, 6 - flap * 4);
  ctx.stroke();
  ctx.restore();
}

/** Ultra-rare black Porsche Macan — canvas silhouette. */
function drawMacan(ctx, x, y, frame = 0) {
  ctx.save();
  ctx.translate(x, y);
  const w = 92;
  const h = 38;

  // rare shimmer
  ctx.fillStyle = `rgba(148, 163, 184, ${0.12 + 0.06 * Math.sin(frame * 0.2)})`;
  ctx.beginPath();
  ctx.ellipse(w * 0.45, -h * 0.4, 58, 28, 0, 0, Math.PI * 2);
  ctx.fill();

  // shadow
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.beginPath();
  ctx.ellipse(w * 0.45, 2, 46, 7, 0, 0, Math.PI * 2);
  ctx.fill();

  // body
  ctx.fillStyle = '#0a0a0a';
  ctx.strokeStyle = '#27272a';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(4, -8);
  ctx.lineTo(10, -22);
  ctx.lineTo(28, -34);
  ctx.lineTo(58, -36);
  ctx.lineTo(78, -28);
  ctx.lineTo(88, -14);
  ctx.lineTo(90, -6);
  ctx.lineTo(4, -6);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // windows
  ctx.fillStyle = '#334155';
  ctx.beginPath();
  ctx.moveTo(30, -32);
  ctx.lineTo(44, -33);
  ctx.lineTo(44, -20);
  ctx.lineTo(28, -20);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(46, -33);
  ctx.lineTo(62, -33);
  ctx.lineTo(70, -22);
  ctx.lineTo(46, -20);
  ctx.closePath();
  ctx.fill();

  // headlights
  ctx.fillStyle = '#fef3c7';
  ctx.fillRect(82, -16, 6, 4);
  ctx.fillStyle = '#f87171';
  ctx.fillRect(6, -16, 5, 4);

  // wheels
  ctx.fillStyle = '#18181b';
  ctx.beginPath();
  ctx.arc(22, -2, 9, 0, Math.PI * 2);
  ctx.arc(70, -2, 9, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#52525b';
  ctx.beginPath();
  ctx.arc(22, -2, 4, 0, Math.PI * 2);
  ctx.arc(70, -2, 4, 0, Math.PI * 2);
  ctx.fill();

  // badge hint
  ctx.fillStyle = 'rgba(250, 250, 250, 0.7)';
  ctx.font = 'bold 8px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('MACAN', w * 0.45, -12);

  ctx.restore();
}

function applySmokerBoost(box) {
  box.vy = -48 * (0.95 + Math.random() * 0.15);
  box.vx = Math.max(Math.abs(box.vx) * 3.1, 42);
  box.spin = (Math.random() > 0.5 ? 1 : -1) * 1.15;
  box.onGround = false;
}

/** Roughly 2× smoker launch — ultra rare Macan hit. */
function applyMacanBoost(box) {
  box.vy = -96 * (0.95 + Math.random() * 0.15);
  box.vx = Math.max(Math.abs(box.vx) * 6.2, 84);
  box.spin = (Math.random() > 0.5 ? 1 : -1) * 1.45;
  box.onGround = false;
}

function smokerBoostGrade(cheat = false) {
  return {
    label: cheat ? 'CHEAT · SMOKE BREAK!' : 'SMOKE BREAK!',
    sub: cheat ? 'Y · simulated ciggy hit' : 'Sent flying!',
    gold: true,
    color: '#fbbf24',
    glow: '#f97316',
  };
}

function macanBoostGrade() {
  return {
    label: 'JULIES CAR!',
    sub: '2× smoke break — absolute rocket',
    gold: true,
    epic: true,
    color: '#e2e8f0',
    glow: '#94a3b8',
  };
}

function littleDickRebootGrade() {
  return {
    label: 'LITTLE DICK!',
    sub: 'Caught it — boots it BACK!',
    gold: true,
    epic: true,
    color: '#fdba74',
    glow: '#ea580c',
  };
}

function oilSpillGrade() {
  return {
    label: 'OIL SPILL!',
    sub: 'Toolbox coated — low friction slide',
    gold: false,
    color: '#fde68a',
    glow: '#a16207',
  };
}

function birdHitGrade() {
  return {
    label: 'Bird strike!',
    sub: 'Feathers everywhere — slight slowdown',
    gold: false,
    color: '#cbd5e1',
    glow: '#64748b',
  };
}

function milestoneGrade(m) {
  const big = m.km >= 110;
  return {
    label: m.label,
    sub: m.sub,
    gold: big,
    color: big ? '#fbbf24' : '#fde68a',
    glow: big ? '#f59e0b' : '#eab308',
  };
}

function RpgPopup({ popup }) {
  if (!popup) return null;
  const epic = Boolean(popup.epic);
  return (
    <div
      className={`pointer-events-none absolute inset-x-0 flex justify-center z-10 ${epic ? 'top-6' : 'top-10'}`}
      aria-live="polite"
    >
      <div
        className={`text-center rounded-xl border backdrop-blur-sm ${
          epic
            ? 'px-6 py-4 animate-[tkPopEpic_1.7s_ease-out_forwards]'
            : 'px-5 py-3 animate-[tkPop_1.15s_ease-out_forwards]'
        }`}
        style={{
          borderColor: popup.gold ? 'rgba(251,191,36,0.75)' : 'rgba(148,163,184,0.35)',
          background: popup.gold
            ? 'linear-gradient(180deg, rgba(120,80,10,0.95), rgba(40,28,8,0.94))'
            : 'rgba(11,18,32,0.88)',
          boxShadow: epic
            ? `0 0 42px ${popup.glow}aa, 0 0 18px ${popup.glow}66`
            : popup.gold
              ? `0 0 28px ${popup.glow}88`
              : `0 0 18px ${popup.glow}44`,
        }}
      >
        <p
          className={`font-black tracking-wide uppercase ${
            epic ? 'text-3xl sm:text-5xl' : 'text-2xl sm:text-3xl'
          }`}
          style={{
            color: popup.color,
            textShadow: popup.gold ? `0 0 16px ${popup.glow}` : '0 1px 0 rgba(0,0,0,0.5)',
          }}
        >
          {popup.label}
        </p>
        <p
          className={`font-semibold mt-0.5 ${epic ? 'text-base sm:text-lg' : 'text-sm'}`}
          style={{ color: popup.gold ? '#fde68a' : '#e2e8f0' }}
        >
          {popup.sub}
        </p>
      </div>
      <style>{`
        @keyframes tkPop {
          0% { opacity: 0; transform: translateY(18px) scale(0.7); }
          18% { opacity: 1; transform: translateY(0) scale(1.08); }
          55% { opacity: 1; transform: translateY(-6px) scale(1); }
          100% { opacity: 0; transform: translateY(-28px) scale(0.96); }
        }
        @keyframes tkPopEpic {
          0% { opacity: 0; transform: translateY(24px) scale(0.55); }
          14% { opacity: 1; transform: translateY(0) scale(1.18); }
          35% { opacity: 1; transform: translateY(-4px) scale(1.05); }
          70% { opacity: 1; transform: translateY(-10px) scale(1); }
          100% { opacity: 0; transform: translateY(-36px) scale(0.98); }
        }
      `}</style>
    </div>
  );
}

function ToolboxKickGame({
  mode = 'careful',
  onChangeMode,
  competitive = false,
  onRoundComplete = null,
  devCheats = false,
}) {
  const canvasRef = useRef(null);
  const stageRef = useRef(null);
  const stateRef = useRef(null);
  const tuningRef = useRef(DEFAULT_TUNING);
  const modeRef = useRef(mode);
  const competitiveRef = useRef(competitive);
  const devCheatsRef = useRef(devCheats);
  const onRoundCompleteRef = useRef(onRoundComplete);
  const popupIdRef = useRef(0);
  const [hud, setHud] = useState({
    phase: PHASE.READY,
    distance: 0,
    speedMph: 0,
    altitudeM: 0,
    best: Number(localStorage.getItem('toolbox-kick-best') || 0),
    attempt: 1,
    roundBest: 0,
    message: mode === 'allOrNothing'
      ? 'All or nothing — one shot. Tap to set POWER'
      : `Attempt 1/${MAX_ATTEMPTS} — tap to set POWER`,
  });
  const [popup, setPopup] = useState(null);
  const [roundDone, setRoundDone] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);

  useEffect(() => {
    modeRef.current = mode;
  }, [mode]);

  useEffect(() => {
    competitiveRef.current = competitive;
  }, [competitive]);

  useEffect(() => {
    devCheatsRef.current = devCheats;
  }, [devCheats]);

  useEffect(() => {
    onRoundCompleteRef.current = onRoundComplete;
  }, [onRoundComplete]);

  const showRpgPopup = useCallback((grade, durationMs = 1150) => {
    const id = (popupIdRef.current += 1);
    setPopup({ id, ...grade });
    window.setTimeout(() => {
      setPopup((prev) => (prev?.id === id ? null : prev));
    }, durationMs);
  }, []);
  const popupFnRef = useRef(showRpgPopup);
  useEffect(() => {
    popupFnRef.current = showRpgPopup;
  }, [showRpgPopup]);

  const initShot = useCallback((opts = {}) => {
    const keepBest = typeof opts === 'boolean' ? opts : opts.keepBest !== false;
    const attempt = typeof opts === 'object' && opts.attempt ? opts.attempt : 1;
    const roundBest = typeof opts === 'object' && opts.freshRound
      ? 0
      : (typeof opts === 'object' && opts.roundBest) || 0;
    const attemptDistances = typeof opts === 'object' && opts.freshRound
      ? []
      : (typeof opts === 'object' && Array.isArray(opts.attemptDistances)
        ? opts.attemptDistances
        : []);
    const best = keepBest
      ? Number(localStorage.getItem('toolbox-kick-best') || 0)
      : 0;
    const rng = makeRng(Date.now() ^ (Math.random() * 1e9));
    const items = [];
    const startX = 380 + rng() * 220;
    const newProps = TOOLBOX_NEW_PROPS_LIVE;
    const propCursor = appendProps(items, startX, startX + CHUNK_SIZE, rng, { newProps });
    const attempts = modeRef.current === 'allOrNothing' ? 1 : MAX_ATTEMPTS;
    const message = attempts === 1
      ? 'All or nothing — one shot. Tap to set POWER'
      : `Attempt ${attempt}/${attempts} — tap to set POWER`;
    stateRef.current = {
      phase: PHASE.READY,
      frame: 0,
      powerT: 0,
      angleT: 0,
      power: 0,
      angleDeg: 45,
      camX: 0,
      mechX: MECH_START_X,
      runup: 0,
      box: {
        x: BOX_REST_X,
        y: GROUND_Y - 12,
        vx: 0,
        vy: 0,
        rot: 0,
        spin: 0,
        onGround: true,
        oiled: false,
      },
      items,
      propCursor,
      rng,
      newProps,
      hitIds: new Set(),
      hitTally: {},
      distance: 0,
      best,
      attempt,
      maxAttempts: attempts,
      roundBest,
      attemptDistances,
      roundReported: false,
      perfectLaunch: false,
      message,
      kickFlash: 0,
      zoom: 1,
      hitMilestones: new Set(),
      launchSpeed: 0,
      launchAngleDeg: 45,
      dickCatch: null,
    };
    setHud({
      phase: PHASE.READY,
      distance: 0,
      speedMph: 0,
      altitudeM: 0,
      best,
      attempt,
      roundBest,
      message,
    });
  }, []);

  const doSpace = useCallback(() => {
    const st = stateRef.current;
    if (!st) return;
    const attempts = st.maxAttempts || (modeRef.current === 'allOrNothing' ? 1 : MAX_ATTEMPTS);

    if (st.phase === PHASE.READY) {
      st.phase = PHASE.POWER;
      st.powerT = Math.random();
      st.message = 'Tap to set power…';
      setHud((h) => ({ ...h, phase: st.phase, message: st.message }));
    } else if (st.phase === PHASE.POWER) {
      st.power = meterValue(st.powerT);
      const pct = Math.round(st.power * 100);
      if (pct >= 99) st.power = 1;
      const showPct = Math.round(st.power * 100);
      showRpgPopup(gradePower(showPct));
      st.phase = PHASE.ANGLE;
      st.angleT = Math.random();
      st.message = 'Tap to set angle — chase 45°…';
      setHud((h) => ({ ...h, phase: st.phase, message: st.message }));
    } else if (st.phase === PHASE.ANGLE) {
      st.angleDeg = 15 + meterValue(st.angleT) * 60;
      st.perfectLaunch = isPerfectPower(st.power) && isPerfectAngle(st.angleDeg);
      showRpgPopup(gradeAngle(st.angleDeg));
      st.phase = PHASE.RUNUP;
      st.runup = 0;
      st.message = st.perfectLaunch
        ? 'PERFECT LAUNCH — here comes the boot…'
        : 'Here comes the boot…';
      setHud((h) => ({ ...h, phase: st.phase, message: st.message }));
    } else if (st.phase === PHASE.LANDED) {
      if (st.attempt < attempts) {
        initShot({
          keepBest: true,
          attempt: st.attempt + 1,
          roundBest: st.roundBest,
          attemptDistances: st.attemptDistances || [],
        });
      } else if (!competitiveRef.current) {
        initShot({ keepBest: true, attempt: 1, freshRound: true });
      }
    }
  }, [initShot, showRpgPopup]);

  /** Dev cheat (sandbox / practice only): Y = perfect launch, or smoker boost in flight. */
  const doCheatY = useCallback(() => {
    if (!devCheatsRef.current || competitiveRef.current) return;
    const st = stateRef.current;
    if (!st) return;

    if (st.phase === PHASE.READY || st.phase === PHASE.POWER || st.phase === PHASE.ANGLE) {
      st.power = 1;
      st.angleDeg = 45;
      st.perfectLaunch = true;
      st.phase = PHASE.RUNUP;
      st.runup = 0;
      st.mechX = MECH_START_X;
      st.message = 'CHEAT · perfect launch — here comes the boot…';
      showRpgPopup({
        label: 'CHEAT · Perfect!',
        sub: '100% power · 45° angle',
        gold: true,
        color: '#fbbf24',
        glow: '#f59e0b',
      });
      setHud((h) => ({ ...h, phase: st.phase, message: st.message }));
      return;
    }

    if (st.phase === PHASE.FLIGHT) {
      applySmokerBoost(st.box);
      st.message = 'CHEAT · smoke break boost!';
      showRpgPopup(smokerBoostGrade(true), 1600);
      setHud((h) => ({
        ...h,
        phase: st.phase,
        distance: Math.floor(st.distance),
        message: st.message,
      }));
    }
  }, [showRpgPopup]);

  /** Dev cheat (sandbox / practice only): U = tiny forward nudge to help test rare events. */
  const doCheatU = useCallback(() => {
    if (!devCheatsRef.current || competitiveRef.current) return;
    const st = stateRef.current;
    if (!st || st.phase !== PHASE.FLIGHT || st.dickCatch) return;
    st.box.vx += 4.5;
    st.message = 'CHEAT · little speed nudge';
    setHud((h) => ({
      ...h,
      phase: st.phase,
      distance: Math.floor(st.distance),
      speedMph: speedMphFromBox(st.box),
      altitudeM: Math.floor(altitudeMetresFromBox(st.box)),
      message: st.message,
    }));
  }, []);

  /** Dev cheat: M = spawn Julies Car ahead; L = spawn Little Dick ahead. */
  const doCheatSpawn = useCallback((type) => {
    if (!devCheatsRef.current || competitiveRef.current) return;
    const st = stateRef.current;
    if (!st) return;
    if (st.phase === PHASE.FLIGHT && st.dickCatch) return;
    spawnDevPropAhead(st, type);
    setHud((h) => ({ ...h, message: st.message }));
  }, []);

  const toggleFullscreen = useCallback(async () => {
    const el = stageRef.current;
    if (!el) return;
    try {
      if (document.fullscreenElement === el) {
        await document.exitFullscreen();
      } else {
        await el.requestFullscreen();
      }
    } catch {
      // ignore — browser may block without user gesture
    }
  }, []);

  useEffect(() => {
    const onFullscreenChange = () => {
      setFullscreen(document.fullscreenElement === stageRef.current);
    };
    document.addEventListener('fullscreenchange', onFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', onFullscreenChange);
  }, []);

  useEffect(() => {
    initShot({ keepBest: true, attempt: 1, freshRound: true });
  }, [initShot, mode]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    const ctx = canvas.getContext('2d');
    let raf = 0;

    const syncHud = (st) => {
      setHud({
        phase: st.phase,
        distance: Math.floor(st.distance),
        speedMph: speedMphFromBox(st.box),
        altitudeM: Math.floor(altitudeMetresFromBox(st.box)),
        best: st.best,
        attempt: st.attempt || 1,
        roundBest: st.roundBest || 0,
        message: st.message,
      });
    };

    const step = () => {
      const st = stateRef.current;
      const tun = tuningRef.current || DEFAULT_TUNING;
      const bar = BAR_SPEED[modeRef.current] || BAR_SPEED.careful;
      if (!st) {
        raf = requestAnimationFrame(step);
        return;
      }
      st.frame += 1;

      if (st.phase === PHASE.POWER) {
        st.powerT += bar.power;
        st.power = meterValue(st.powerT);
      } else if (st.phase === PHASE.ANGLE) {
        st.angleT += bar.angle;
        st.angleDeg = 15 + meterValue(st.angleT) * 60;
      } else if (st.phase === PHASE.RUNUP) {
        st.runup += 1;
        const t = Math.min(1, st.runup / RUNUP_FRAMES);
        const eased = t * t;
        st.mechX = MECH_START_X + (MECH_KICK_X - MECH_START_X) * eased;
        if (st.runup === KICK_FRAME) st.kickFlash = 10;
        if (st.runup >= LAUNCH_FRAME) {
          const rad = (st.angleDeg * Math.PI) / 180;
          let speed = launchSpeedForPower(st.power, tun);
          if (st.perfectLaunch) {
            speed *= PERFECT_LAUNCH_BOOST;
            popupFnRef.current?.(perfectLaunchGrade(), 1700);
          }
          st.launchSpeed = speed;
          st.launchAngleDeg = st.angleDeg;
          st.box.x = BOX_REST_X;
          st.box.y = GROUND_Y - 12;
          st.box.vx = Math.cos(rad) * speed;
          st.box.vy = -Math.sin(rad) * speed;
          st.box.spin = 0.2 + st.power * 0.3;
          st.box.onGround = false;
          st.dickCatch = null;
          st.phase = PHASE.FLIGHT;
          st.message = st.perfectLaunch
            ? 'Perfect launch!!! Fly, toolbox, fly…'
            : 'Fly, toolbox, fly…';
          syncHud(st);
        }
      } else if (st.phase === PHASE.FLIGHT && st.dickCatch) {
        const box = st.box;
        const catchSt = st.dickCatch;
        catchSt.frame += 1;
        const f = catchSt.frame;
        // Hold toolbox while he catches / winds up / boots BACK toward start
        box.vx = 0;
        box.vy = 0;
        box.onGround = false;
        box.x = catchSt.x + (catchSt.facing < 0 ? -8 : 8);
        box.y = GROUND_Y - (f < 14 ? 28 : 18);
        box.rot = f < 14 ? -0.4 : 0.15;
        box.spin = 0;

        if (f === 1) {
          st.message = 'Little Dick caught the toolbox!';
          popupFnRef.current?.(littleDickRebootGrade(), 2000);
          syncHud(st);
        }
        if (f === 16) {
          catchSt.facing = -1; // betrayal — turns and boots BACK toward the start
          st.message = 'Oh no — he boots it BACK toward the start!';
          syncHud(st);
        }
        if (f === 34) {
          st.kickFlash = 10;
        }
        if (f >= 40) {
          const rad = ((st.launchAngleDeg || 45) * Math.PI) / 180;
          const speed = st.launchSpeed || launchSpeedForPower(st.power, tun);
          box.x = catchSt.x - 12;
          box.y = GROUND_Y - 14;
          // Same launch force, opposite direction (back toward kick-off)
          box.vx = -Math.cos(rad) * speed;
          box.vy = -Math.sin(rad) * speed;
          box.spin = -(0.2 + (st.power || 0.5) * 0.3);
          box.onGround = false;
          st.dickCatch = null;
          st.hitIds = new Set(); // re-collide with obstacles on the way back
          ensureReturnPathProps(st, box.x);
          st.message = 'Little Dick sent it BACK — distance plunging!';
          syncHud(st);
        }
        st.distance = (box.x - BOX_REST_X) / PX_PER_METRE;
        st.camX = box.x - W * 0.35;
        if (st.frame % 6 === 0) syncHud(st);
      } else if (st.phase === PHASE.FLIGHT) {
        const box = st.box;
        box.vy += tun.gravity;
        box.vx *= tun.airDrag;
        box.vy *= tun.airDrag;
        box.x += box.vx;
        box.y += box.vy;
        box.rot += box.spin;
        st.distance = (box.x - BOX_REST_X) / PX_PER_METRE;

        // Northampton milestones
        if (!st.hitMilestones) st.hitMilestones = new Set();
        const kmNow = st.distance / 1000;
        for (const milestone of DISTANCE_MILESTONES) {
          if (kmNow >= milestone.km && !st.hitMilestones.has(milestone.km)) {
            st.hitMilestones.add(milestone.km);
            popupFnRef.current?.(milestoneGrade(milestone), 1700);
            st.message = milestone.label;
          }
        }

        ensurePropsAround(st, box);

        // Birds drift slowly while you're in flight
        for (let i = 0; i < st.items.length; i += 1) {
          const it = st.items[i];
          if (it.type === 'bird' && !it.hit) {
            it.x += (it.dir || 1) * 0.35;
          }
        }

        for (let i = 0; i < st.items.length; i += 1) {
          const it = st.items[i];
          const id = it.id || `${it.type}-${i}`;
          if (it.type === 'coach') {
            const left = it.x;
            const right = it.x + it.w;
            const top = GROUND_Y - it.h;
            if (
              box.x > left - 8
              && box.x < right + 8
              && box.y > top - 6
              && box.y < GROUND_Y + 4
            ) {
              if (!st.hitIds.has(id)) {
                st.hitIds.add(id);
                bumpHitTally(st, 'coach');
                box.vx *= tun.coachSlow;
                box.vy *= tun.coachSlow;
                box.spin *= 0.55;
                if (box.y > top && box.vy > 0) {
                  box.y = top - 2;
                  box.vy = Math.min(box.vy, 2);
                }
                st.message = 'Hit a coach — slowed down!';
                syncHud(st);
              } else {
                box.vx *= tun.coachDrag;
              }
            }
          } else if (it.type === 'sack') {
            const dx = box.x - it.x;
            const dy = box.y - (GROUND_Y - it.r);
            if (dx * dx + dy * dy < (it.r + 14) ** 2 && box.vy > 0) {
              const bounceId = `${id}-${Math.floor(box.x / 40)}`;
              if (!st.hitIds.has(bounceId)) {
                st.hitIds.add(bounceId);
                bumpHitTally(st, 'sack');
                box.vy = -tun.sackBounce * (0.9 + Math.random() * 0.35);
                box.vx *= tun.sackBoost;
                box.spin = -box.spin * 1.15;
                st.message = 'Rubbish sack trampoline!';
                syncHud(st);
              }
            }
          } else if (it.type === 'smoker') {
            const dx = box.x - it.x;
            const dy = box.y - (GROUND_Y - 34);
            if (dx * dx + dy * dy < 36 ** 2) {
              if (!st.hitIds.has(id)) {
                st.hitIds.add(id);
                bumpHitTally(st, 'smoker');
                applySmokerBoost(box);
                st.message = 'Driver on a ciggy break — sent flying!';
                popupFnRef.current?.(smokerBoostGrade(false), 1600);
                syncHud(st);
              }
            }
          } else if (it.type === 'macan') {
            const dx = box.x - (it.x + 46);
            const dy = box.y - (GROUND_Y - 20);
            if (dx * dx + dy * dy < 48 ** 2) {
              if (!st.hitIds.has(id)) {
                st.hitIds.add(id);
                bumpHitTally(st, 'macan');
                applyMacanBoost(box);
                st.message = 'JULIES CAR!';
                popupFnRef.current?.(macanBoostGrade(), 2000);
                syncHud(st);
              }
            }
          } else if (it.type === 'littleDick') {
            // Must land on him (descending) to get the catch-and-reboot
            const dx = box.x - it.x;
            const dy = box.y - (GROUND_Y - 30);
            if (dx * dx + dy * dy < 40 ** 2 && box.vy > 0 && !st.hitIds.has(id)) {
              st.hitIds.add(id);
              bumpHitTally(st, 'littleDick');
              st.dickCatch = {
                x: it.x,
                frame: 0,
                facing: 1, // pretends he'll boot you onward…
              };
              box.vx = 0;
              box.vy = 0;
              box.x = it.x;
              box.y = GROUND_Y - 28;
              st.message = 'Landed on Little Dick!';
              syncHud(st);
            }
          } else if (it.type === 'bird') {
            const by = it.y ?? (GROUND_Y - 80);
            const dx = box.x - it.x;
            const dy = box.y - by;
            if (dx * dx + dy * dy < 22 ** 2 && !st.hitIds.has(id)) {
              st.hitIds.add(id);
              bumpHitTally(st, 'bird');
              it.hit = true;
              box.vx *= tun.birdSlow;
              box.vy *= 0.96;
              box.spin *= -0.8;
              st.message = 'Bird strike — feathers everywhere!';
              popupFnRef.current?.(birdHitGrade(), 900);
              syncHud(st);
            }
          } else if (it.type === 'oilSpill') {
            const dx = box.x - it.x;
            const dy = box.y - GROUND_Y;
            if (Math.abs(dx) < 40 && Math.abs(dy) < 18 && !box.oiled) {
              box.oiled = true;
              bumpHitTally(st, 'oilSpill');
              st.message = 'Drove through the oil spill — coated!';
              popupFnRef.current?.(oilSpillGrade(), 1100);
              syncHud(st);
            }
          } else if (it.type === 'cone' || it.type === 'drum') {
            const cx = it.x;
            const cy = GROUND_Y - (it.type === 'drum' ? 14 : 10);
            const dx = box.x - cx;
            const dy = box.y - cy;
            if (dx * dx + dy * dy < 18 ** 2 && !st.hitIds.has(id)) {
              st.hitIds.add(id);
              bumpHitTally(st, it.type === 'drum' ? 'drum' : 'cone');
              if (it.type === 'drum' && st.newProps) {
                it.spilled = true;
                box.oiled = true;
                st.items.push({
                  type: 'oilSpill',
                  x: it.x + 10,
                  id: `spill-${st.items.length}-${it.x | 0}`,
                });
                box.vy = Math.min(box.vy, -4);
                box.spin *= -1.1;
                st.message = 'Oil drum burst — toolbox coated!';
                popupFnRef.current?.(oilSpillGrade(), 1200);
              } else {
                box.vx *= 0.92;
                box.vy = Math.min(box.vy, -5);
                box.spin *= -1;
                st.message = it.type === 'cone' ? 'Traffic cone ping!' : 'Oil drum clang!';
              }
              syncHud(st);
            }
          }
        }

        if (box.y >= GROUND_Y - 10) {
          box.y = GROUND_Y - 10;
          const bounceFric = box.oiled ? tun.oilFriction : tun.friction;
          const slideDrag = box.oiled ? tun.oilGroundDrag : tun.groundDrag;
          if (Math.abs(box.vy) > 1.6) {
            box.vy = -box.vy * tun.bounceDamp;
            box.vx *= bounceFric;
            box.spin *= 0.92;
          } else {
            box.vy = 0;
            box.vx *= slideDrag;
            box.spin *= box.oiled ? 0.985 : 0.96;
            box.onGround = true;
            if (Math.abs(box.vx) < tun.stopSpeed) {
              box.vx = 0;
              st.phase = PHASE.LANDED;
              const dist = Math.floor(st.distance);
              if (!Array.isArray(st.attemptDistances)) st.attemptDistances = [];
              // Highest distance wins — negatives are valid (and hilarious)
              st.roundBest = st.attemptDistances.length === 0
                ? dist
                : Math.max(st.roundBest, dist);
              st.attemptDistances = [...st.attemptDistances, dist];
              if (dist > st.best) {
                st.best = dist;
                localStorage.setItem('toolbox-kick-best', String(dist));
              }
              const maxAttempts = st.maxAttempts || MAX_ATTEMPTS;
              if (st.attempt < maxAttempts) {
                st.message = `Attempt ${st.attempt} · ${formatDistance(dist)}. Tap for attempt ${st.attempt + 1}/${maxAttempts}`;
              } else if (competitiveRef.current) {
                st.message = `Round locked · best ${formatDistance(st.roundBest)}. Leaderboard score submitted.`;
                if (!st.roundReported) {
                  st.roundReported = true;
                  setRoundDone(true);
                  onRoundCompleteRef.current?.({
                    distanceM: st.roundBest,
                    attempts: [...st.attemptDistances],
                  });
                }
              } else {
                st.message = dist < 0
                  ? `Round over · best ${formatDistance(st.roundBest)}. (Yes, negative is allowed.) Tap for a new round`
                  : `Round over · best ${formatDistance(st.roundBest)}. Tap for a new round`;
              }
              syncHud(st);
            }
          }
        }

        st.camX = box.x - W * 0.35;
        if (st.frame % 6 === 0) syncHud(st);
      }

      if (st.kickFlash > 0) st.kickFlash -= 1;

      // Camera pulls out as the toolbox speeds up
      const zoomTarget = st.phase === PHASE.FLIGHT
        ? clamp(Math.sqrt(30 / Math.max(8, Math.hypot(st.box.vx, st.box.vy))), MIN_ZOOM, 1)
        : 1;
      st.zoom = (st.zoom || 1) + (zoomTarget - (st.zoom || 1)) * 0.06;
      const zoom = st.zoom;

      const cam = st.camX;
      drawSky(ctx, cam);
      drawGround(ctx, cam);

      const pivotX = W * 0.35;
      const visMinSx = pivotX + (-200 - pivotX) / zoom;
      const visMaxSx = pivotX + (W + 200 - pivotX) / zoom;

      ctx.save();
      ctx.translate(pivotX, GROUND_Y);
      ctx.scale(zoom, zoom);
      ctx.translate(-pivotX, -GROUND_Y);

      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      ctx.font = '11px ui-monospace, monospace';
      const markEvery = 50;
      const minMark = Math.floor((visMinSx + cam - BOX_REST_X) / PX_PER_METRE / markEvery) * markEvery - markEvery;
      const maxMark = Math.ceil((visMaxSx + cam - BOX_REST_X) / PX_PER_METRE / markEvery) * markEvery + markEvery;
      for (let m = minMark; m <= maxMark; m += markEvery) {
        const sx = BOX_REST_X + m * PX_PER_METRE - cam;
        if (sx < visMinSx || sx > visMaxSx) continue;
        ctx.fillStyle = m < 0 ? 'rgba(248,113,113,0.45)' : 'rgba(0,0,0,0.25)';
        ctx.fillRect(sx, GROUND_Y, 2, 8);
        ctx.fillText(`${m}m`, sx + 4, GROUND_Y + 18);
      }

      for (let i = 0; i < st.items.length; i += 1) {
        const it = st.items[i];
        const sx = it.x - cam;
        if (sx < visMinSx || sx > visMaxSx) continue;
        if (it.type === 'coach') drawCoach(ctx, sx, GROUND_Y, it.w, it.h);
        else if (it.type === 'sack') drawSack(ctx, sx, GROUND_Y, it.r);
        else if (it.type === 'cone') drawCone(ctx, sx, GROUND_Y);
        else if (it.type === 'drum') drawDrum(ctx, sx, GROUND_Y, Boolean(it.spilled));
        else if (it.type === 'oilSpill') drawOilSpill(ctx, sx, GROUND_Y, st.frame);
        else if (it.type === 'smoker') drawSmoker(ctx, sx, GROUND_Y, st.frame);
        else if (it.type === 'macan') drawMacan(ctx, sx, GROUND_Y, st.frame);
        else if (it.type === 'littleDick') {
          const catching = st.dickCatch && st.dickCatch.x === it.x;
          const face = catching ? (st.dickCatch.facing || 1) : 1;
          const kicking = catching && st.dickCatch.frame >= 30 && st.dickCatch.frame < 42;
          ctx.save();
          ctx.translate(sx, GROUND_Y);
          ctx.scale(face < 0 ? -1 : 1, 1);
          drawMechanic(ctx, 0, 0, st.frame, { kicking, running: false });
          ctx.restore();
          if (!catching) {
            ctx.fillStyle = 'rgba(15, 23, 42, 0.75)';
            ctx.beginPath();
            ctx.roundRect(sx - 40, GROUND_Y - 96, 80, 16, 4);
            ctx.fill();
            ctx.fillStyle = '#fdba74';
            ctx.font = 'bold 10px system-ui, sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText('LITTLE DICK', sx, GROUND_Y - 85);
          }
        }
        else if (it.type === 'bird' && !it.hit) {
          drawBird(ctx, sx, it.y ?? (GROUND_Y - 80), st.frame, it.dir || 1);
        }
      }

      const running = st.phase === PHASE.RUNUP && st.runup < KICK_FRAME;
      const kicking = st.phase === PHASE.RUNUP && st.runup >= KICK_FRAME;
      if (st.mechX - cam > visMinSx && st.mechX - cam < visMaxSx) {
        drawMechanic(ctx, st.mechX - cam, GROUND_Y, st.frame, { kicking, running });
      }

      const oiled = Boolean(st.box.oiled);
      if (st.phase === PHASE.READY || st.phase === PHASE.POWER || st.phase === PHASE.ANGLE) {
        drawToolbox(ctx, st.box.x - cam, st.box.y, -0.15, false, oiled);
      } else if (st.phase === PHASE.RUNUP && st.runup < LAUNCH_FRAME) {
        drawToolbox(ctx, BOX_REST_X - cam, GROUND_Y - 12, -0.2, false, oiled);
      } else {
        drawToolbox(ctx, st.box.x - cam, st.box.y, st.box.rot, st.phase === PHASE.FLIGHT, oiled);
      }

      if (st.kickFlash > 0) {
        const flashX = st.dickCatch
          ? st.dickCatch.x - 18 - cam
          : MECH_KICK_X + 18 - cam;
        ctx.fillStyle = `rgba(255,220,120,${st.kickFlash / 10})`;
        ctx.beginPath();
        ctx.arc(flashX, GROUND_Y - 16, 22, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.restore();

      if (st.phase === PHASE.FLIGHT || st.phase === PHASE.LANDED) {
        drawTopStatsBar(ctx, st);
        if (st.phase === PHASE.LANDED) {
          const dist = Math.floor(st.distance);
          const parts = formatDistanceParts(dist);
          ctx.save();
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.font = '600 14px system-ui, sans-serif';
          ctx.fillStyle = parts.negative
            ? 'rgba(252,165,165,0.95)'
            : 'rgba(226,232,240,0.9)';
          ctx.fillText(
            parts.negative
              ? 'Back behind the start…'
              : (dist >= st.best ? 'New best!' : `Best ${formatDistance(st.best)}`),
            W * 0.5,
            STAT_BAR_H + 22,
          );
          ctx.restore();
        }
      }

      if (st.phase === PHASE.FLIGHT || st.phase === PHASE.LANDED) {
        drawHitTally(ctx, st);
      }

      if (st.phase === PHASE.POWER || st.phase === PHASE.ANGLE) {
        const meterX = 24;
        const meterY = STAT_BAR_H + 12;
        ctx.fillStyle = 'rgba(11,18,32,0.75)';
        ctx.beginPath();
        ctx.roundRect(meterX, meterY, 200, 56, 8);
        ctx.fill();
        ctx.fillStyle = '#94a3b8';
        ctx.font = '12px system-ui, sans-serif';
        if (st.phase === PHASE.POWER) {
          ctx.fillText('POWER — Space / tap to lock', meterX + 10, meterY + 18);
          ctx.fillStyle = '#1e293b';
          ctx.fillRect(meterX + 10, meterY + 28, 180, 14);
          const pw = st.power * 180;
          const grad = ctx.createLinearGradient(meterX + 10, 0, meterX + 190, 0);
          grad.addColorStop(0, '#22c55e');
          grad.addColorStop(0.7, '#eab308');
          grad.addColorStop(1, '#ef4444');
          ctx.fillStyle = grad;
          ctx.fillRect(meterX + 10, meterY + 28, pw, 14);
        } else {
          ctx.fillText('ANGLE — Space / tap (45° ideal)', meterX + 10, meterY + 18);
          ctx.fillStyle = '#1e293b';
          ctx.fillRect(meterX + 10, meterY + 28, 180, 14);
          ctx.fillStyle = 'rgba(34,197,94,0.35)';
          ctx.fillRect(meterX + 10 + 180 * 0.42, meterY + 28, 180 * 0.16, 14);
          const t = (st.angleDeg - 15) / 60;
          ctx.fillStyle = '#38bdf8';
          ctx.fillRect(meterX + 10, meterY + 28, t * 180, 14);
        }
      }

      if (st.phase === PHASE.ANGLE) {
        const rad = (st.angleDeg * Math.PI) / 180;
        const speed = launchSpeedForPower(st.power, tun);
        let gx = BOX_REST_X;
        let gy = GROUND_Y - 12;
        let vx = Math.cos(rad) * speed;
        let vy = -Math.sin(rad) * speed;
        ctx.strokeStyle = 'rgba(56,189,248,0.45)';
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.moveTo(gx - cam, gy);
        for (let i = 0; i < 50; i += 1) {
          vy += tun.gravity;
          gx += vx;
          gy += vy;
          if (gy > GROUND_Y - 10) break;
          ctx.lineTo(gx - cam, gy);
        }
        ctx.stroke();
        ctx.setLineDash([]);
      }

      raf = requestAnimationFrame(step);
    };

    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, []);

  useEffect(() => {
    const onKey = (e) => {
      if (e.code === 'Space' || e.key === ' ') {
        e.preventDefault();
        doSpace();
        return;
      }
      if (!devCheatsRef.current) return;
      if (e.key === 'y' || e.key === 'Y' || e.code === 'KeyY') {
        if (e.repeat) return;
        e.preventDefault();
        doCheatY();
        return;
      }
      if (e.key === 'u' || e.key === 'U' || e.code === 'KeyU') {
        if (e.repeat) return;
        e.preventDefault();
        doCheatU();
        return;
      }
      if (e.key === 'm' || e.key === 'M' || e.code === 'KeyM') {
        if (e.repeat) return;
        e.preventDefault();
        doCheatSpawn('macan');
        return;
      }
      if (e.key === 'l' || e.key === 'L' || e.code === 'KeyL') {
        if (e.repeat) return;
        e.preventDefault();
        doCheatSpawn('littleDick');
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [doSpace, doCheatY, doCheatU, doCheatSpawn]);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
        <p className="text-slate-300">{hud.message}</p>
        <div className="flex flex-wrap gap-3 text-xs text-slate-400">
          <span>
            Attempt{' '}
            <span className="text-orange-200 font-semibold tabular-nums">
              {hud.attempt || 1}/{mode === 'allOrNothing' ? 1 : MAX_ATTEMPTS}
            </span>
          </span>
          <span>
            Round best{' '}
            <span className="text-sky-200 font-semibold tabular-nums">
              {formatDistance(hud.roundBest || 0)}
            </span>
          </span>
          <span>
            All-time{' '}
            <span className="text-amber-200 font-semibold tabular-nums">
              {formatDistance(hud.best)}
            </span>
          </span>
        </div>
      </div>

      <div
        ref={stageRef}
        className="relative overflow-hidden rounded-xl border border-[#1a2540] bg-[#0b1220] [&:fullscreen]:flex [&:fullscreen]:items-center [&:fullscreen]:justify-center [&:fullscreen]:rounded-none [&:fullscreen]:border-0 [&:fullscreen]:min-h-screen [&:fullscreen]:w-screen"
      >
        <RpgPopup popup={popup} />
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            toggleFullscreen();
          }}
          className="absolute top-2 right-2 z-20 px-2.5 py-1.5 rounded-md text-xs font-medium border border-slate-500/40 bg-[#0b1220]/85 text-slate-200 hover:bg-white/10 backdrop-blur-sm"
          aria-pressed={fullscreen}
        >
          {fullscreen ? 'Exit fullscreen' : 'Fullscreen'}
        </button>
        <canvas
          ref={canvasRef}
          width={W}
          height={H}
          className={`block w-full max-w-full touch-none cursor-pointer${
            fullscreen ? ' max-h-screen w-auto max-w-[min(100vw,calc(100vh*960/420))]' : ''
          }`}
          style={{ imageRendering: 'auto' }}
          tabIndex={0}
          role="img"
          aria-label="Little Dicks Toolbox game canvas"
          onClick={() => {
            canvasRef.current?.focus();
            doSpace();
          }}
        />
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={doSpace}
          disabled={competitive && roundDone}
          className="px-3 py-2 rounded-lg text-sm border border-orange-500/40 text-orange-100 hover:bg-orange-500/10 disabled:opacity-40 disabled:pointer-events-none"
        >
          Space / tap action
        </button>
        {!competitive ? (
          <>
            <button
              type="button"
              onClick={() => initShot({ keepBest: true, attempt: 1, freshRound: true })}
              className="px-3 py-2 rounded-lg text-sm border border-[#1a2540] text-slate-300 hover:bg-white/[0.04]"
            >
              New round
            </button>
            {devCheats ? (
              <p className="w-full text-xs text-slate-500">
                Dev keys: Y perfect/smoker boost · U nudge · M Julies Car · L Little Dick
              </p>
            ) : null}
          </>
        ) : null}
        {!competitive && typeof onChangeMode === 'function' ? (
          <button
            type="button"
            onClick={onChangeMode}
            className="px-3 py-2 rounded-lg text-sm border border-sky-500/35 text-sky-100 hover:bg-sky-500/10"
          >
            Change mode
          </button>
        ) : null}
      </div>
    </div>
  );
}

function IntroBubble({ open, onClose }) {
  const [dontShowAgain, setDontShowAgain] = useState(true);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60">
      <div
        role="dialog"
        aria-labelledby="toolbox-kick-intro-title"
        className="w-full max-w-md rounded-2xl border border-orange-500/35 bg-[#0b1220] shadow-xl overflow-hidden"
      >
        <div className="px-5 pt-5 pb-4 space-y-3">
          <p className="text-xs font-semibold uppercase tracking-wider text-orange-300/80">Little Dicks Toolbox</p>
          <h2 id="toolbox-kick-intro-title" className="text-lg font-semibold text-slate-100">
            Little Dick is mad
          </h2>
          <img
            src="/toolbox-kick/little-dick.png"
            alt="Little Dick in an orange boilersuit, furious, holding a wrench"
            className="w-full rounded-xl border border-[#1a2540] object-cover object-top max-h-64"
          />
          <div className="relative rounded-xl border border-[#1a2540] bg-[#060e1a] px-4 py-3">
            <div
              className="absolute -bottom-2 left-8 w-3 h-3 bg-[#060e1a] border-r border-b border-[#1a2540] rotate-45"
              aria-hidden
            />
            <p className="text-sm text-slate-300 leading-relaxed">
              Little Dick is mad. Drivers keep defecting buses, he can&apos;t get the part to fit,
              and he&apos;s just dropped his 10mm right in the engine bay. He&apos;s about to kick
              his toolbox — see how far it can go!
            </p>
          </div>
          <label className="flex items-center gap-2 text-xs text-slate-400 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={dontShowAgain}
              onChange={(e) => setDontShowAgain(e.target.checked)}
              className="rounded border-slate-600"
            />
            Don&apos;t show again
          </label>
        </div>
        <div className="px-5 pb-5 flex justify-end">
          <button
            type="button"
            onClick={() => {
              if (dontShowAgain) markIntroSeen();
              onClose();
            }}
            className="px-4 py-2 rounded-lg text-sm bg-orange-600 hover:bg-orange-500 text-white font-medium"
          >
            Let&apos;s kick
          </button>
        </div>
      </div>
    </div>
  );
}

function ModeSelect({ onPick, competitive = false }) {
  return (
    <div className="rounded-xl border border-[#1a2540] p-5 space-y-4">
      <p className="text-sm text-slate-300">
        How do you want to boot Dick&apos;s toolbox?
        {competitive
          ? ' One competitive round per day — pick a mode, then your best distance hits today’s leaderboard.'
          : ''}
      </p>
      <div className="grid sm:grid-cols-2 gap-3">
        <button
          type="button"
          onClick={() => onPick('allOrNothing')}
          className="text-left rounded-xl border border-rose-500/40 bg-rose-500/10 hover:bg-rose-500/15 px-4 py-4 space-y-1 transition-colors"
        >
          <p className="text-base font-semibold text-rose-100">All or nothing</p>
          <p className="text-xs text-slate-400 leading-relaxed">
            One chance only. Slower power and angle bars — be careful.
          </p>
        </button>
        <button
          type="button"
          onClick={() => onPick('careful')}
          className="text-left rounded-xl border border-sky-500/40 bg-sky-500/10 hover:bg-sky-500/15 px-4 py-4 space-y-1 transition-colors"
        >
          <p className="text-base font-semibold text-sky-100">3 goes</p>
          <p className="text-xs text-slate-400 leading-relaxed">
            Three attempts. Normal-speed bars. Best of three counts.
          </p>
        </button>
      </div>
    </div>
  );
}

export function ToolboxKickSandbox() {
  const [introOpen, setIntroOpen] = useState(() => !hasSeenIntro());
  const [mode, setMode] = useState(null);

  return (
    <div className="space-y-4">
      <IntroBubble open={introOpen} onClose={() => setIntroOpen(false)} />

      <div className="rounded-xl border border-[#1a2540] p-4 space-y-2">
        <p className="text-sm text-slate-300">
          <span className="text-white font-medium">Little Dicks Toolbox</span>
          {' '}— Dev sandbox. Tap for power, then angle. Distance callouts head south from Northampton.
          Competitive Fun from <span className="text-white font-medium">{TOOLBOX_KICK_LIVE_FROM}</span>.
        </p>
        <p className="text-xs text-amber-200/90">
          Dev keys (sandbox only): Y · U · M spawn Julies Car · L spawn Little Dick.
          Fullscreen button on the canvas.
        </p>
        {!introOpen ? (
          <button
            type="button"
            onClick={() => setIntroOpen(true)}
            className="text-xs text-orange-200/80 hover:text-orange-100 underline-offset-2 hover:underline"
          >
            Show intro again
          </button>
        ) : null}
      </div>

      {!mode ? (
        <ModeSelect onPick={setMode} />
      ) : (
        <ToolboxKickGame
          key={mode}
          mode={mode}
          devCheats
          onChangeMode={() => setMode(null)}
        />
      )}
    </div>
  );
}

export function ToolboxKickDailyPanel({ currentUserUid = null, onAchievements = null, isAdmin = false }) {
  const todayKey = getLondonDayKey();
  const [dayKey, setDayKey] = useState(todayKey);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [game, setGame] = useState(null);
  const [leaderboard, setLeaderboard] = useState([]);
  const [mode, setMode] = useState(null);
  const [introOpen, setIntroOpen] = useState(() => !hasSeenIntro());
  const practice = dayKey !== todayKey;

  const load = useCallback(async (key) => {
    const params = new URLSearchParams();
    if (key && key !== todayKey) params.set('dayKey', key);
    const query = params.toString() ? `?${params}` : '';
    const response = await fetch(`/api/getDailyToolboxKick${query}`, { credentials: 'include' });
    const payload = (await readJsonResponse(response)) || {};
    if (!response.ok) throw new Error(payload.error || 'Failed to load Little Dicks Toolbox.');
    if (payload.weekend || payload.sittingOut) {
      setGame(null);
      setLeaderboard([]);
      setMode(null);
      setError(payload.message || 'Little Dicks Toolbox isn’t in today’s Fun rotation.');
      return;
    }
    setError('');
    setGame(payload.game || null);
    setLeaderboard(payload.leaderboard || []);
    if (payload.game?.status === 'won') {
      setMode(payload.game.mode || 'careful');
    } else {
      setMode(null);
    }
  }, [todayKey]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        await load(dayKey);
      } catch (err) {
        if (!cancelled) {
          setError(err.message || 'Failed to load Little Dicks Toolbox.');
          setGame(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [dayKey, load]);

  const submitRound = useCallback(async ({ distanceM, attempts }) => {
    if (practice || !mode) return;
    try {
      setSubmitting(true);
      const response = await fetch('/api/submitToolboxKickResult', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode,
          distanceM,
          attempts,
          dayKey: dayKey !== todayKey ? dayKey : undefined,
        }),
      });
      const payload = (await readJsonResponse(response)) || {};
      if (!response.ok) throw new Error(payload.error || 'Failed to submit score.');
      setGame(payload.game || null);
      if (Array.isArray(payload.leaderboard)) setLeaderboard(payload.leaderboard);
      if (Array.isArray(payload.achievements) && onAchievements) {
        onAchievements(payload.achievements);
      }
    } catch (err) {
      setError(err.message || 'Could not submit your score.');
      setMode(null);
    } finally {
      setSubmitting(false);
    }
  }, [practice, mode, dayKey, todayKey, onAchievements]);

  if (loading) return <p className="text-sm text-slate-400">Loading Little Dicks Toolbox…</p>;
  if (error && !game) return <p className="text-sm text-rose-300">{error}</p>;

  const alreadyDone = game?.status === 'won';
  const modeLabel = game?.mode === 'allOrNothing' ? 'All or nothing' : '3 goes';

  return (
    <div className="space-y-3">
      <FunDayPicker
        dayKey={dayKey}
        todayKey={todayKey}
        onChange={setDayKey}
        allowFuture={Boolean(isAdmin)}
      />

      {practice ? (
        <p className="text-xs text-amber-200/90 border border-amber-500/30 bg-amber-500/10 rounded-md px-3 py-2">
          Practice day — scores won’t count on the leaderboard.
        </p>
      ) : (
        <p className="text-sm text-slate-400">
          One competitive round per London day. Furthest distance wins. Leaderboard resets each weekday.
        </p>
      )}

      {error ? <p className="text-sm text-rose-300">{error}</p> : null}

      <IntroBubble open={introOpen} onClose={() => setIntroOpen(false)} />

      {alreadyDone ? (
        <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 space-y-1">
          <p className="text-sm text-emerald-100 font-medium">
            Today’s kick logged · {formatDistance(game.distanceM)}
            {submitting ? ' · Saving…' : ''}
          </p>
          <p className="text-xs text-slate-400">
            Mode: {modeLabel}
            {Array.isArray(game.attempts) && game.attempts.length > 1
              ? ` · attempts ${game.attempts.map((n) => formatDistance(n)).join(', ')}`
              : ''}
          </p>
        </div>
      ) : null}

      {!alreadyDone && !mode ? (
        <ModeSelect competitive={!practice} onPick={setMode} />
      ) : null}

      {!alreadyDone && mode ? (
        <ToolboxKickGame
          key={`${dayKey}-${mode}`}
          mode={mode}
          competitive={!practice}
          onRoundComplete={practice ? null : submitRound}
        />
      ) : null}

      {!practice && leaderboard.length ? (
        <div className="rounded-xl border border-[#1a2540] overflow-hidden">
          <div className="px-4 py-3 border-b border-[#1a2540]">
            <h4 className="text-sm font-semibold text-indigo-200">
              Today’s leaderboard · furthest distance
            </h4>
          </div>
          <ol className="divide-y divide-[#1a2540] px-4 py-2 space-y-0">
            {leaderboard.slice(0, 15).map((row) => (
              <FunLeaderboardRow
                key={row.uid || row.rank}
                row={row}
                currentUserUid={currentUserUid}
                resultText={row.resultLabel || formatDistance(row.distanceM)}
                metaText={row.mode === 'allOrNothing' ? 'All or nothing' : '3 goes'}
              />
            ))}
          </ol>
        </div>
      ) : !practice && alreadyDone ? (
        <p className="text-sm text-slate-500 text-center py-4">You’re on the board — waiting for more kicks.</p>
      ) : null}
    </div>
  );
}

export default ToolboxKickSandbox;
