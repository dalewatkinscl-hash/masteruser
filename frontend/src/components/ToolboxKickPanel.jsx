import { useCallback, useEffect, useRef, useState } from 'react';
import FunDayPicker, { getLondonDayKey } from './FunDayPicker';
import FunLeaderboardRow from './FunLeaderboardRow';
import { TOOLBOX_KICK_LIVE_FROM } from '../lib/funRotation';
import {
  TOOLBOX_V2_FEATURE_LIST,
  FLIGHT_COIN_AMOUNT,
  buildFlightCoinPlan,
  buildRecordMarkers,
  sampleWind,
  windProfileForAttempt,
} from '../utils/toolboxKickV2';

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
/** Gameplay is authored at 60 Hz — lock sim to this so 120/144 Hz screens don’t run faster. */
const TOOLBOX_SIM_HZ = 60;
const TOOLBOX_SIM_DT = 1 / TOOLBOX_SIM_HZ;
const TOOLBOX_MAX_SIM_STEPS = 5;

function captureToolboxRenderPose(st) {
  const box = st?.box || {};
  return {
    boxX: Number(box.x) || 0,
    boxY: Number(box.y) || GROUND_Y - 12,
    boxRot: Number(box.rot) || 0,
    camX: Number(st?.camX) || 0,
    zoom: Number(st?.zoom) || 1,
    mechX: Number(st?.mechX) || MECH_START_X,
  };
}

function lerpToolboxRenderPose(prev, curr, alpha) {
  if (!prev) return curr;
  if (!curr) return prev;
  const t = clamp(alpha, 0, 1);
  return {
    boxX: prev.boxX + (curr.boxX - prev.boxX) * t,
    boxY: prev.boxY + (curr.boxY - prev.boxY) * t,
    boxRot: prev.boxRot + (curr.boxRot - prev.boxRot) * t,
    camX: prev.camX + (curr.camX - prev.camX) * t,
    zoom: prev.zoom + (curr.zoom - prev.zoom) * t,
    mechX: prev.mechX + (curr.mechX - prev.mechX) * t,
  };
}

const CHUNK_SIZE = 4000;
const AHEAD_BUFFER = 2800;
const INTRO_STORAGE_KEY = 'toolbox-kick-intro-seen-v4';
const MAX_ATTEMPTS = 3;
/** Fun Admin sandbox + Toolbox 2.0: extra 4th go dedicated to Little Dick QTE practice. */
const MAX_ATTEMPTS_DEV_V2 = 4;
const DEV_QTE_PRACTICE_ATTEMPT = 4;
const TOOLBOX_PENDING_SCORE_KEY = 'toolbox-kick-pending-score';

function readPendingToolboxScore() {
  try {
    const raw = sessionStorage.getItem(TOOLBOX_PENDING_SCORE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    if (!parsed.dayKey || !Number.isFinite(Number(parsed.distanceM))) return null;
    return parsed;
  } catch {
    return null;
  }
}

function writePendingToolboxScore(payload) {
  try {
    sessionStorage.setItem(TOOLBOX_PENDING_SCORE_KEY, JSON.stringify({
      ...payload,
      savedAt: Date.now(),
    }));
  } catch {
    /* ignore quota / private mode */
  }
}

function clearPendingToolboxScore(dayKey = null) {
  try {
    if (!dayKey) {
      sessionStorage.removeItem(TOOLBOX_PENDING_SCORE_KEY);
      return;
    }
    const pending = readPendingToolboxScore();
    if (!pending || pending.dayKey === dayKey) {
      sessionStorage.removeItem(TOOLBOX_PENDING_SCORE_KEY);
    }
  } catch {
    /* ignore */
  }
}
/** World X where rare smoker drivers can appear (12 km of flight). */
const SMOKER_FROM_X = BOX_REST_X + 12 * 1000 * PX_PER_METRE;
/** Even rarer Macan — starts a bit further out than the smoker. */
const MACAN_FROM_X = BOX_REST_X + 18 * 1000 * PX_PER_METRE;
/** Ultra-rare Little Dick cameo — further still. */
const LITTLE_DICK_FROM_X = BOX_REST_X + 25 * 1000 * PX_PER_METRE;
/** Ultra-rare Chelle (bold lady with a book) — between Macan and Little Dick range. */
const CHELLE_FROM_X = BOX_REST_X + 22 * 1000 * PX_PER_METRE;
/** Sea-level-ish: mph ÷ this ≈ Mach. */
const MPH_PER_MACH = 767.269;
const MACH_DISPLAY_FROM_MPH = 250;
/** How far the camera can pull out at top speed. */
const MIN_ZOOM = 0.42;
/** Oil spill coating, birds, Julies Car and the Little Dick cameo — live everywhere. */
export const TOOLBOX_NEW_PROPS_LIVE = true;
/**
 * Chelle natural world spawns — bold lady with a book (softkey C still works in Fun Admin).
 */
export const CHELLE_NATURAL_SPAWN = true;
/**
 * Dick's Toolbox 2.0 — live for Fun Admin sandbox and daily Fun.
 */
export const TOOLBOX_V2_DEV = true;
export const TOOLBOX_V2_LIVE = true;
/** Caught mid-round reload → keep only 10% of toolbox speed. */
const CAUGHT_CHEAT_SPEED_FACTOR = 0.1;
/** Punishment: wait this long after landing (Nelson GIF) before Little Dick walks in. */
const PUNISH_HAHA_WAIT_FRAMES = 180; // ~3s at 60fps
/** Mach 2 in game px/frame (matches speedMphFromBox: mph ≈ px * 2.1). */
const MACH2_SPEED_PX = (2 * MPH_PER_MACH) / 2.1;

/**
 * Real-ish road distances south from Northampton (game km = real km),
 * then polar / orbital / solar-system fantasy after the South Pole.
 * Corridor: A508 / M1 south → Europe → Africa → Antarctica → space.
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
  { km: 700, label: 'Lyon!', sub: '700 km south — deep into France' },
  { km: 1000, label: 'Marseille!', sub: '1,000 km — Mediterranean shore' },
  { km: 1600, label: 'Algiers!', sub: '1,600 km — crossed into Africa' },
  { km: 2500, label: 'Sahara!', sub: '2,500 km — endless sand' },
  { km: 4000, label: 'Sahel!', sub: '4,000 km south of Northampton' },
  { km: 5800, label: 'Equator!', sub: '5,800 km — halfway round the planet' },
  { km: 7500, label: 'Congo!', sub: '7,500 km — rainforest belt' },
  { km: 9200, label: 'Namibia!', sub: '9,200 km — southern Africa' },
  { km: 10500, label: 'Cape Town!', sub: '10,500 km — tip of Africa' },
  { km: 12500, label: 'Southern Ocean!', sub: '12,500 km — nothing but swell' },
  { km: 14500, label: 'Antarctica!', sub: '14,500 km — ice shelf ahead' },
  { km: 15800, label: 'South Pole!', sub: '15,800 km — end of the Earth… almost' },
  // Space
  { km: 20000, label: 'Leaving Earth!', sub: '20,000 km — atmosphere thinning fast' },
  { km: 42000, label: 'Orbit!', sub: '42,000 km — geostationary height' },
  { km: 384400, label: 'The Moon!', sub: '384,400 km — one small kick for Dick-kind' },
  { km: 58_000_000, label: 'Mercury!', sub: '~58 million km — scorched inner planet' },
  { km: 108_000_000, label: 'Venus!', sub: '~108 million km — cloudy and furious' },
  { km: 150_000_000, label: '1 AU!', sub: '~150 million km — Earth–Sun distance' },
  { km: 228_000_000, label: 'Mars!', sub: '~228 million km — the red planet' },
  { km: 400_000_000, label: 'Asteroid Belt!', sub: '~400 million km — watch the rocks' },
  { km: 778_000_000, label: 'Jupiter!', sub: '~778 million km — king of the giants' },
  { km: 1_430_000_000, label: 'Saturn!', sub: '~1.43 billion km — rings and all' },
  { km: 2_870_000_000, label: 'Uranus!', sub: '~2.87 billion km — ice giant' },
  { km: 4_500_000_000, label: 'Neptune!', sub: '~4.5 billion km — deep blue' },
  { km: 5_900_000_000, label: 'Pluto!', sub: '~5.9 billion km — still counts' },
  { km: 18_000_000_000, label: 'Heliosphere!', sub: '~18 billion km — edge of the solar wind' },
  { km: 23_000_000_000, label: 'Voyager!', sub: '~23 billion km — interstellar space' },
];

/**
 * Hardcoded gameplay values (tuned in Dev, then locked in).
 */
export const DEFAULT_TUNING = {
  launchSpeed100: 45,
  launchSpeedMin: 5,
  sackBounce: 14,
  sackBoost: 1.28,
  groundDrag: 0.935,
  friction: 0.985,
  /** After oil coating — slides further, but still settles. */
  oilGroundDrag: 0.972,
  oilFriction: 0.992,
  /** Dry grass rebound — turf, not a trampoline. */
  bounceDamp: 0.36,
  /** Need this much downward speed (px/tick) to leave the grass again. */
  grassBounceMinVy: 2.35,
  /** Storm / wet grass — dead thump, kills hop and forward speed. */
  wetGrassBounceDamp: 0.1,
  wetGrassFriction: 0.62,
  wetGrassGroundDrag: 0.82,
  wetGrassBounceMinVy: 4.2,
  gravity: 0.2,
  airDrag: 0.9994,
  stopSpeed: 0.18,
  /** Tailwind / wind push while scraping the ground (keeps floor slides finite). */
  groundWindScale: 0.06,
  coachSlow: 0.84,
  coachDrag: 0.985,
  birdSlow: 0.93,
  /** Hot-air balloon envelope — chunky speed tax. */
  balloonSlow: 0.68,
  balloonVyDamp: 0.55,
};

/**
 * Bar oscillation speeds in units/second.
 * Tuned to match the old per-frame rates at 60fps, so 120Hz screens feel the same.
 */
const BAR_SPEED = {
  careful: { power: 0.0225 * 60, angle: 0.02 * 60 },
  allOrNothing: { power: 0.011 * 60, angle: 0.01 * 60 },
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
 * Epic scales: millions / billions of km, then AU.
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
  let label;
  if (km >= 149_597_870) {
    const au = km / 149_597_870;
    label = `${sign}${au >= 10 ? au.toFixed(1) : au.toFixed(2)} AU`;
  } else if (km >= 1_000_000_000) {
    label = `${sign}${(km / 1_000_000_000).toFixed(2)} billion km`;
  } else if (km >= 1_000_000) {
    label = `${sign}${(km / 1_000_000).toFixed(1)} million km`;
  } else if (km >= 10_000) {
    label = `${sign}${Math.round(km).toLocaleString('en-GB')} km`;
  } else {
    label = `${sign}${km.toFixed(1)} km`;
  }
  const bangs = neg || kmWhole >= 1000 ? '' : '!'.repeat(Math.min(5, Math.max(0, kmWhole - 1)));
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
  'balloon',
  'smoker',
  'macan',
  'chelle',
  'littleDick',
  'oilSpill',
  'flightCoin',
];

const HIT_TALLY_LABELS = {
  coach: 'Coach',
  sack: 'Sack',
  cone: 'Cone',
  drum: 'Drum',
  bird: 'Bird',
  balloon: 'Balloon',
  smoker: 'Smoker',
  macan: 'Julies Car',
  chelle: 'Chelle',
  littleDick: 'Little Dick',
  oilSpill: 'Oil',
  flightCoin: 'Coin',
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

/** Windsock HUD — speed + direction for Toolbox 2.0. */
function drawWindSock(ctx, wind, frame = 0) {
  if (!wind) return;
  const x = W - 78;
  const y = STAT_BAR_H + 36;
  const speed = Number(wind.speed) || 0;
  const angleDeg = Number(wind.angleDeg) || 0;
  const flap = Math.sin(frame * 0.18) * Math.min(0.35, 0.08 + speed * 0.12);

  ctx.save();
  ctx.translate(x, y);

  // Pole
  ctx.strokeStyle = 'rgba(226,232,240,0.85)';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(0, -28);
  ctx.lineTo(0, 22);
  ctx.stroke();
  ctx.fillStyle = '#94a3b8';
  ctx.beginPath();
  ctx.arc(0, -28, 3.5, 0, Math.PI * 2);
  ctx.fill();

  // Sock cone pointed with the wind (0° = +x / downrange)
  const rad = ((angleDeg + flap * 25) * Math.PI) / 180;
  ctx.save();
  ctx.rotate(rad);
  const sockLen = 22 + Math.min(18, speed * 14);
  const grad = ctx.createLinearGradient(0, 0, sockLen, 0);
  if (wind.mode === 'storm') {
    grad.addColorStop(0, '#f87171');
    grad.addColorStop(1, '#fbbf24');
  } else if (wind.mode === 'steady') {
    grad.addColorStop(0, '#38bdf8');
    grad.addColorStop(1, '#a5f3fc');
  } else {
    grad.addColorStop(0, '#94a3b8');
    grad.addColorStop(1, '#cbd5e1');
  }
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.moveTo(2, -7);
  ctx.lineTo(sockLen, -3 + flap * 4);
  ctx.lineTo(sockLen, 3 + flap * 4);
  ctx.lineTo(2, 7);
  ctx.closePath();
  ctx.fill();
  ctx.restore();

  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.font = '800 10px system-ui, Segoe UI, sans-serif';
  ctx.fillStyle = 'rgba(226,232,240,0.9)';
  ctx.fillText((wind.label || 'Wind').toUpperCase(), 0, 26);
  ctx.font = '900 12px system-ui, Segoe UI, sans-serif';
  ctx.fillStyle = wind.mode === 'storm' ? '#fbbf24' : '#e2e8f0';
  const mphApprox = Math.round(speed * 28);
  ctx.fillText(wind.mode === 'calm' ? '0 mph' : `${mphApprox} mph`, 0, 38);
  ctx.restore();
}

function drawRecordFlag(ctx, sx, marker) {
  const poleH = 58;
  ctx.save();
  ctx.strokeStyle = 'rgba(226,232,240,0.85)';
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.moveTo(sx, GROUND_Y);
  ctx.lineTo(sx, GROUND_Y - poleH);
  ctx.stroke();
  ctx.fillStyle = marker.color || '#fbbf24';
  ctx.beginPath();
  ctx.moveTo(sx, GROUND_Y - poleH);
  ctx.lineTo(sx + 34, GROUND_Y - poleH + 10);
  ctx.lineTo(sx, GROUND_Y - poleH + 20);
  ctx.closePath();
  ctx.fill();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'bottom';
  ctx.font = '800 11px system-ui, Segoe UI, sans-serif';
  ctx.lineWidth = 3;
  ctx.strokeStyle = 'rgba(11,18,32,0.85)';
  ctx.strokeText(marker.title || 'Record', sx + 8, GROUND_Y - poleH - 6);
  ctx.fillStyle = '#f8fafc';
  ctx.fillText(marker.title || 'Record', sx + 8, GROUND_Y - poleH - 6);
  if (marker.sub) {
    ctx.font = '700 10px system-ui, Segoe UI, sans-serif';
    ctx.fillStyle = 'rgba(226,232,240,0.85)';
    ctx.fillText(marker.sub, sx + 8, GROUND_Y - poleH - 18);
  }
  ctx.font = '800 10px system-ui, Segoe UI, sans-serif';
  ctx.fillStyle = marker.color || '#fbbf24';
  ctx.fillText(formatDistance(marker.distanceM), sx + 8, GROUND_Y - 4);
  ctx.restore();
}

function drawFlightCoin(ctx, sx, frame = 0) {
  const bob = Math.sin(frame * 0.12) * 4;
  const y = GROUND_Y - 52 + bob;
  ctx.save();
  ctx.translate(sx, y);
  ctx.rotate(Math.sin(frame * 0.08) * 0.25);
  ctx.shadowColor = '#f59e0b';
  ctx.shadowBlur = 12;
  ctx.fillStyle = '#fbbf24';
  ctx.beginPath();
  ctx.arc(0, 0, 14, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.strokeStyle = '#b45309';
  ctx.lineWidth = 2.5;
  ctx.stroke();
  ctx.fillStyle = '#78350f';
  ctx.font = '900 14px system-ui, Segoe UI, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('£', 0, 1);
  ctx.restore();
}

function drawComboHud(ctx, combo, frame = 0) {
  if (!(combo >= 2)) return;
  const pulse = combo >= 3 ? 1 + 0.06 * Math.sin(frame * 0.25) : 1;
  ctx.save();
  ctx.translate(W * 0.5, STAT_BAR_H + 28);
  ctx.scale(pulse, pulse);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = '900 22px system-ui, Segoe UI, sans-serif';
  ctx.lineWidth = 4;
  ctx.strokeStyle = 'rgba(11,18,32,0.85)';
  const label = combo >= 3 ? `COMBO ×${combo}` : `HIT ×${combo}`;
  ctx.strokeText(label, 0, 0);
  ctx.fillStyle = combo >= 3 ? '#fbbf24' : '#e2e8f0';
  ctx.shadowColor = combo >= 3 ? '#f59e0b' : '#64748b';
  ctx.shadowBlur = combo >= 3 ? 14 : 6;
  ctx.fillText(label, 0, 0);
  ctx.restore();
}

/** Little Dick kickback QTE — sim frames @ 60 Hz (~1.1s tap window). */
const DICK_QTE_READY_UNTIL = 12;
const DICK_QTE_OPEN = 12;
const DICK_QTE_CLOSE = 78;
const DICK_QTE_TURN = 82;
const DICK_QTE_FLASH = 88;
const DICK_QTE_BOOT = 94;

function dickQteEnabled(st) {
  return Boolean(st && (st.v2 || st.qtePractice));
}

function dickQteWindowOpen(catchSt) {
  if (!catchSt || catchSt.qteResolved) return false;
  const f = catchSt.frame || 0;
  return f >= DICK_QTE_OPEN && f <= DICK_QTE_CLOSE;
}

function drawDickQtePrompt(ctx, catchSt, frame = 0) {
  if (!catchSt || catchSt.qteResolved) return;
  const f = catchSt.frame || 0;
  const open = dickQteWindowOpen(catchSt);
  const pulse = 1 + 0.08 * Math.sin(frame * 0.35);
  ctx.save();
  ctx.translate(W * 0.5, H * 0.42);
  ctx.scale(pulse, pulse);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = '900 28px system-ui, Segoe UI, sans-serif';
  ctx.lineWidth = 5;
  ctx.strokeStyle = 'rgba(11,18,32,0.9)';
  const text = open ? 'TAP NOW!' : (f < DICK_QTE_READY_UNTIL ? 'Get ready…' : 'Too late!');
  ctx.strokeText(text, 0, 0);
  ctx.fillStyle = open ? '#fbbf24' : '#94a3b8';
  ctx.shadowColor = open ? '#f59e0b' : 'transparent';
  ctx.shadowBlur = open ? 18 : 0;
  ctx.fillText(text, 0, 0);
  ctx.shadowBlur = 0;
  ctx.font = '800 13px system-ui, Segoe UI, sans-serif';
  ctx.fillStyle = 'rgba(226,232,240,0.9)';
  ctx.fillText('Stop the kickback — boost forward!', 0, 28);
  ctx.restore();
}

function registerAirCombo(st, box, popupFn) {
  if (!st?.v2 || !box || box.onGround) return;
  st.airCombo = (st.airCombo || 0) + 1;
  st.maxAirCombo = Math.max(st.maxAirCombo || 0, st.airCombo);
  if (st.airCombo >= 3) {
    const boost = 1 + Math.min(0.12, 0.03 + (st.airCombo - 3) * 0.015);
    box.vx *= boost;
    if (box.vy > -2) box.vy -= 1.2;
    if (st.airCombo === 3 || st.airCombo === 5 || st.airCombo === 8 || st.airCombo % 10 === 0) {
      popupFn?.({
        label: `COMBO ×${st.airCombo}!`,
        sub: 'Airborne chain',
        gold: true,
        color: '#fbbf24',
        glow: '#f59e0b',
      }, 1100);
    }
  }
}

function applyDickQteBoost(box, speedFactor = 1) {
  const f = Number.isFinite(speedFactor) ? speedFactor : 1;
  box.vy = -36 * (0.95 + Math.random() * 0.12) * f;
  box.vx = Math.max(Math.abs(box.vx) * 2.4, 38) * f;
  box.spin = (Math.random() > 0.5 ? 1 : -1) * 1.05;
  box.onGround = false;
}

function dickQteSuccessGrade() {
  return {
    label: 'DODGED!',
    sub: 'Little Dick misfires — forward boost!',
    gold: true,
    color: '#fbbf24',
    glow: '#f59e0b',
  };
}

function flightCoinGrade(amount) {
  return {
    label: `+${amount} COINS`,
    sub: 'Flight pickup → wallet',
    gold: true,
    color: '#fde68a',
    glow: '#f59e0b',
  };
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

/** World-X → kilometres past kick-off (for density scaling). */
function kmAtWorldX(x) {
  return Math.max(0, (Number(x) - BOX_REST_X) / PX_PER_METRE / 1000);
}

/**
 * Every full km past kick-off, slowdown hazards get denser (capped).
 * Hot-air balloons only from 1,000 km onward.
 */
function slowdownDensityAtKm(km) {
  const rawKm = Math.max(0, Math.floor(Number(km) || 0));
  const tier = Math.min(200, rawKm);
  const balloonTier = rawKm >= 1000 ? Math.min(120, rawKm - 999) : 0;
  return {
    tier,
    // Fewer empty gaps as distance grows
    skipChance: Math.max(0.04, 0.2 - Math.min(80, tier) * 0.0025),
    // Balloons from 1,000 km; denser every km after that
    balloonChance: balloonTier < 1
      ? 0
      : Math.min(0.32, 0.02 + (balloonTier - 1) * 0.0075),
    // More birds / coaches in the regular roll mix
    birdBias: Math.min(0.22, 0.1 + Math.min(80, tier) * 0.002),
    coachBias: Math.min(0.42, 0.28 + Math.min(80, tier) * 0.0025),
  };
}

const BALLOON_COLORS = [
  ['#ef4444', '#b91c1c'],
  ['#3b82f6', '#1d4ed8'],
  ['#f59e0b', '#b45309'],
  ['#22c55e', '#15803d'],
  ['#a855f7', '#7e22ce'],
  ['#ec4899', '#be185d'],
  ['#06b6d4', '#0e7490'],
];

/** Append randomised props from `fromX` up to `toX`. Returns new cursor x. */
function appendProps(items, fromX, toX, next, features = {}) {
  const newProps = Boolean(features.newProps);
  const skipRare = Boolean(features.skipRare);
  let x = Math.max(fromX, 0);
  while (x < toX) {
    const dens = slowdownDensityAtKm(kmAtWorldX(x));
    if (next() < dens.skipChance) {
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
    // Ultra-rare Chelle — bold lady with a book (2× prior spawn rate)
    if (
      !skipRare
      && newProps
      && CHELLE_NATURAL_SPAWN
      && x >= CHELLE_FROM_X
      && next() < 0.0024
    ) {
      items.push({
        type: 'chelle',
        x,
        id: `chelle-${items.length}-${x | 0}`,
      });
      x += 560 + next() * 960;
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
    // Hot-air balloons — airborne slowdown from 1,000 km; denser thereafter
    if (newProps && dens.balloonChance > 0 && next() < dens.balloonChance) {
      const palette = BALLOON_COLORS[Math.floor(next() * BALLOON_COLORS.length)] || BALLOON_COLORS[0];
      items.push({
        type: 'balloon',
        x,
        y: GROUND_Y - (90 + next() * 140),
        bobPhase: next() * Math.PI * 2,
        color: palette[0],
        colorDark: palette[1],
        scale: 0.85 + next() * 0.45,
        id: `balloon-${items.length}-${x | 0}`,
      });
      // Pack tighter at higher tiers
      const gapScale = Math.max(0.45, 1 - dens.tier * 0.008);
      x += (160 + next() * 280) * gapScale;
      continue;
    }
    const roll = next();
    if (newProps && roll < dens.birdBias) {
      // Airborne birds — small speed tax if hit
      items.push({
        type: 'bird',
        x,
        y: GROUND_Y - (55 + next() * 110),
        dir: next() > 0.5 ? 1 : -1,
        id: `bird-${items.length}-${x | 0}`,
      });
      x += 90 + next() * 180;
    } else if (roll < dens.coachBias) {
      items.push({
        type: 'coach',
        x,
        w: 100 + next() * 70,
        h: 48 + next() * 16,
        id: `coach-${items.length}-${x | 0}`,
      });
      x += 140 + next() * 200;
    } else if (roll < dens.coachBias + 0.24) {
      items.push({
        type: 'sack',
        x,
        r: 14 + next() * 10,
        id: `sack-${items.length}-${x | 0}`,
      });
      x += 70 + next() * 160;
    } else if (roll < dens.coachBias + 0.44) {
      items.push({ type: 'cone', x, id: `cone-${items.length}-${x | 0}` });
      x += 50 + next() * 110;
    } else if (roll < dens.coachBias + 0.6) {
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
    st.items = st.items.filter((it) => {
      if (it.type === 'recordFlag') return true;
      if (it.type === 'flightCoin') {
        return it.x >= keepMin - 200 && it.x <= keepMax + 2400;
      }
      return it.x >= keepMin && it.x <= keepMax;
    });
  }
}

function ensureFlightCoinsNear(st, boxX) {
  if (!st?.v2 || !Array.isArray(st.flightCoinPlan)) return;
  if (!st.collectedCoinSlots) st.collectedCoinSlots = new Set();
  for (const coin of st.flightCoinPlan) {
    if (st.collectedCoinSlots.has(coin.slot)) continue;
    const x = BOX_REST_X + coin.km * 1000 * PX_PER_METRE;
    if (x < boxX - 500 || x > boxX + AHEAD_BUFFER + 800) continue;
    const id = `flight-coin-${coin.slot}`;
    if (st.items.some((it) => it.id === id)) continue;
    st.items.push({
      type: 'flightCoin',
      x,
      amount: coin.amount || FLIGHT_COIN_AMOUNT,
      slot: coin.slot,
      id,
    });
  }
}

function ensurePropsAround(st, box) {
  ensurePropsAhead(st, box.x + AHEAD_BUFFER);
  if (st.v2) ensureFlightCoinsNear(st, box.x);
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
  if (type === 'macan') st.message = 'CHEAT · Julies Car spawned ahead';
  else if (type === 'chelle') st.message = 'CHEAT · Chelle spawned ahead';
  else if (type === 'littleDick') st.message = 'CHEAT · Little Dick spawned ahead';
  else st.message = `CHEAT · ${type} spawned ahead`;
}

/** Sandbox run 4 — place Little Dicks close so you can practice the kickback QTE. */
function spawnQtePracticeDicks(st) {
  if (!st) return;
  st.items = (st.items || []).filter((it) => !String(it.id || '').startsWith('qte-practice-dick'));
  // Several short-range spots so soft or strong kicks still land on him
  const offsets = [360, 560, 820, 1120];
  for (let i = 0; i < offsets.length; i += 1) {
    st.items.push({
      type: 'littleDick',
      x: BOX_REST_X + offsets[i],
      id: `qte-practice-dick-${i}`,
    });
  }
  st.items.sort((a, b) => a.x - b.x);
}

/** Punishment: flood the flight path with coaches so the toolbox keeps getting slowed. */
function spawnPunishmentCoachSwarm(st) {
  if (!st) return;
  // Clear any previous punishment swarm so re-kicks don't stack forever.
  st.items = (st.items || []).filter((it) => !String(it.id || '').startsWith('punish-coach-'));
  const startX = BOX_REST_X + 70;
  // Tight pack right after the boot, then a long corridor of more buses.
  const nearCount = 22;
  const farCount = 36;
  for (let i = 0; i < nearCount; i += 1) {
    const x = startX + i * 52 + (i % 2) * 10;
    st.items.push({
      type: 'coach',
      x,
      w: 92 + (i % 4) * 14,
      h: 46 + (i % 3) * 8,
      id: `punish-coach-near-${i}-${x | 0}`,
    });
  }
  const farStart = startX + nearCount * 52 + 40;
  for (let i = 0; i < farCount; i += 1) {
    const x = farStart + i * 78 + (i % 3) * 12;
    st.items.push({
      type: 'coach',
      x,
      w: 100 + (i % 5) * 12,
      h: 48 + (i % 3) * 6,
      id: `punish-coach-far-${i}-${x | 0}`,
    });
  }
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
/** Weekly power-up: +80% launch speed for one kick. */
const SUPER_RAGE_BOOST = 1.8;

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

function superRageGrade() {
  return {
    label: 'ENERGY DRINK!!!',
    sub: 'Dick chugged it · +80% launch speed',
    gold: true,
    epic: true,
    color: '#fecaca',
    glow: '#ef4444',
  };
}

function launchSpeedForPower(power01, tuning) {
  const p = clamp(power01, 0, 1);
  return tuning.launchSpeedMin + p * (tuning.launchSpeed100 - tuning.launchSpeedMin);
}

function drawSky(ctx, camX, weather = 'calm') {
  const g = ctx.createLinearGradient(0, 0, 0, H);
  if (weather === 'storm') {
    g.addColorStop(0, '#1e293b');
    g.addColorStop(0.45, '#334155');
    g.addColorStop(0.75, '#475569');
    g.addColorStop(1, '#64748b');
  } else if (weather === 'steady') {
    g.addColorStop(0, '#5b8fb8');
    g.addColorStop(0.55, '#a8c5d6');
    g.addColorStop(1, '#d4c9b4');
  } else {
    g.addColorStop(0, '#7eb6d9');
    g.addColorStop(0.55, '#c5dce8');
    g.addColorStop(1, '#e8dcc8');
  }
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);

  if (weather === 'storm') {
    // Heavy overcast banks
    ctx.fillStyle = 'rgba(15, 23, 42, 0.55)';
    for (let i = 0; i < 7; i += 1) {
      const cx = ((i * 170 - camX * 0.22) % (W + 260)) - 60;
      const cy = 28 + (i % 4) * 14;
      ctx.beginPath();
      ctx.ellipse(cx, cy, 58, 22, 0, 0, Math.PI * 2);
      ctx.ellipse(cx + 36, cy + 6, 48, 18, 0, 0, Math.PI * 2);
      ctx.ellipse(cx - 30, cy + 4, 40, 16, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  } else {
    ctx.fillStyle = weather === 'steady' ? 'rgba(255,255,255,0.4)' : 'rgba(255,255,255,0.55)';
    for (let i = 0; i < 5; i += 1) {
      const cx = ((i * 220 - camX * 0.15) % (W + 200)) - 40;
      ctx.beginPath();
      ctx.ellipse(cx, 48 + (i % 3) * 12, 42, 16, 0, 0, Math.PI * 2);
      ctx.ellipse(cx + 28, 52, 34, 14, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

/** Screen-space rain + lightning for storm attempt (drawn after world, before HUD). */
function drawStormWeather(ctx, frame = 0, wind = null) {
  const gust = Number(wind?.angleDeg) || 0;
  const shear = Math.sin((gust * Math.PI) / 180) * 10 + Math.cos(frame * 0.07) * 4;

  // Dim veil
  ctx.fillStyle = 'rgba(15, 23, 42, 0.18)';
  ctx.fillRect(0, 0, W, GROUND_Y);

  // Rain streaks
  ctx.save();
  ctx.strokeStyle = 'rgba(186, 230, 253, 0.55)';
  ctx.lineWidth = 1.25;
  ctx.lineCap = 'round';
  const cols = 56;
  for (let i = 0; i < cols; i += 1) {
    const seed = i * 97.13;
    const xBase = ((i / cols) * W + frame * (3.2 + (i % 5) * 0.35) + seed) % (W + 40) - 20;
    const yOff = (frame * (14 + (i % 7)) + seed * 3) % (GROUND_Y + 60);
    const len = 10 + (i % 5) * 3;
    ctx.globalAlpha = 0.35 + (i % 4) * 0.12;
    ctx.beginPath();
    ctx.moveTo(xBase, yOff - len);
    ctx.lineTo(xBase + shear, yOff);
    ctx.stroke();
  }
  ctx.restore();

  // Occasional lightning flash + bolt
  const flashCycle = frame % 180;
  const boltOn = flashCycle === 12 || flashCycle === 14 || flashCycle === 92 || flashCycle === 94;
  const afterglow = flashCycle === 13 || flashCycle === 15 || flashCycle === 93 || flashCycle === 95;
  if (boltOn || afterglow) {
    ctx.fillStyle = boltOn ? 'rgba(255,255,255,0.42)' : 'rgba(186,230,253,0.18)';
    ctx.fillRect(0, 0, W, H);

    if (boltOn) {
      const bx = 120 + ((Math.floor(frame / 180) * 137) % (W - 240));
      ctx.save();
      ctx.strokeStyle = 'rgba(255,255,255,0.95)';
      ctx.lineWidth = 2.5;
      ctx.shadowColor = '#93c5fd';
      ctx.shadowBlur = 18;
      ctx.beginPath();
      ctx.moveTo(bx, 0);
      ctx.lineTo(bx + 18, 55);
      ctx.lineTo(bx - 8, 95);
      ctx.lineTo(bx + 22, 150);
      ctx.lineTo(bx + 4, 210);
      ctx.stroke();
      // fork
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(bx - 8, 95);
      ctx.lineTo(bx - 36, 140);
      ctx.stroke();
      ctx.restore();
    }
  }

  // Distant thunder rumble bar (subtle vignette pulse)
  if (flashCycle > 12 && flashCycle < 40) {
    const fade = 1 - (flashCycle - 12) / 28;
    ctx.fillStyle = `rgba(30, 41, 59, ${0.12 * fade})`;
    ctx.fillRect(0, 0, W, H);
  }
}

function drawGround(ctx, camX, weather = 'calm') {
  const wet = weather === 'storm';
  ctx.fillStyle = wet ? '#243528' : '#3d5c3a';
  ctx.fillRect(0, GROUND_Y, W, H - GROUND_Y);
  ctx.fillStyle = wet ? '#2f4a36' : '#4a6b45';
  ctx.fillRect(0, GROUND_Y, W, 8);

  if (wet) {
    // Slick patches — wet grass sheen
    ctx.fillStyle = 'rgba(148, 163, 184, 0.14)';
    for (let x = -((camX * 0.45) % 56); x < W; x += 56) {
      ctx.beginPath();
      ctx.ellipse(x + 18, GROUND_Y + 14, 22, 5, -0.15, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = 'rgba(15, 23, 42, 0.28)';
    ctx.fillRect(0, GROUND_Y, W, 3);
  }

  ctx.strokeStyle = wet ? 'rgba(0,0,0,0.22)' : 'rgba(0,0,0,0.12)';
  ctx.lineWidth = 1;
  for (let x = -((camX * 0.5) % 40); x < W; x += 40) {
    ctx.beginPath();
    ctx.moveTo(x, GROUND_Y + 10);
    ctx.lineTo(x + 20, H);
    ctx.stroke();
  }

  ctx.fillStyle = wet ? '#3f3f46' : '#5a5a5a';
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

function drawHotAirBalloon(ctx, x, y, frame = 0, opts = {}) {
  const scale = Number(opts.scale) || 1;
  const color = opts.color || '#ef4444';
  const colorDark = opts.colorDark || '#b91c1c';
  const bob = Math.sin(frame * 0.08 + (opts.bobPhase || 0)) * 3;
  const deflated = Boolean(opts.hit);

  ctx.save();
  ctx.translate(x, y + bob);
  ctx.scale(scale, scale);

  if (!deflated) {
    // Envelope
    const grad = ctx.createRadialGradient(-6, -38, 4, 0, -28, 28);
    grad.addColorStop(0, color);
    grad.addColorStop(1, colorDark);
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.ellipse(0, -32, 22, 26, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(15,23,42,0.35)';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Panels
    ctx.strokeStyle = 'rgba(255,255,255,0.25)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, -56);
    ctx.lineTo(0, -8);
    ctx.moveTo(-16, -44);
    ctx.lineTo(0, -8);
    ctx.moveTo(16, -44);
    ctx.lineTo(0, -8);
    ctx.stroke();

    // Rigging
    ctx.strokeStyle = '#78716c';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(-10, -10);
    ctx.lineTo(-6, 6);
    ctx.moveTo(10, -10);
    ctx.lineTo(6, 6);
    ctx.moveTo(0, -8);
    ctx.lineTo(0, 6);
    ctx.stroke();

    // Basket
    ctx.fillStyle = '#a16207';
    ctx.strokeStyle = '#713f12';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.roundRect(-7, 4, 14, 10, 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#854d0e';
    ctx.fillRect(-7, 7, 14, 2);
  } else {
    // Popped — limp envelope
    ctx.fillStyle = colorDark;
    ctx.globalAlpha = 0.55;
    ctx.beginPath();
    ctx.ellipse(0, -8, 16, 8, 0.3, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.fillStyle = '#a16207';
    ctx.fillRect(-5, 4, 10, 7);
  }

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

/**
 * Chelle — bold lady in a business suit.
 * pose: 'reading' (default sit) | 'startled' | 'launch'
 */
function drawChelle(ctx, x, y, frame = 0, pose = 'reading') {
  ctx.save();
  ctx.translate(x, y);

  // soft rare shimmer
  ctx.fillStyle = `rgba(196, 181, 253, ${0.1 + 0.05 * Math.sin(frame * 0.18)})`;
  ctx.beginPath();
  ctx.ellipse(0, -40, 36, 48, 0, 0, Math.PI * 2);
  ctx.fill();

  // shadow
  ctx.fillStyle = 'rgba(0,0,0,0.28)';
  ctx.beginPath();
  ctx.ellipse(0, 2, pose === 'reading' ? 26 : 18, 5, 0, 0, Math.PI * 2);
  ctx.fill();

  const skin = '#e8b4a0';
  const suit = '#1e293b';
  const blouse = '#f8fafc';
  const hair = '#f5d76e';

  if (pose === 'reading') {
    // bench
    ctx.fillStyle = '#78716c';
    ctx.fillRect(-22, -14, 44, 6);
    ctx.fillRect(-20, -8, 5, 10);
    ctx.fillRect(15, -8, 5, 10);

    // seated legs (skirt)
    ctx.fillStyle = suit;
    ctx.beginPath();
    ctx.moveTo(-12, -16);
    ctx.lineTo(14, -16);
    ctx.lineTo(18, -4);
    ctx.lineTo(-14, -4);
    ctx.closePath();
    ctx.fill();
    // shoes
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(-16, -4, 10, 4);
    ctx.fillRect(8, -4, 10, 4);

    // torso / blazer
    ctx.fillStyle = suit;
    ctx.beginPath();
    ctx.roundRect(-12, -48, 24, 34, 4);
    ctx.fill();
    ctx.fillStyle = blouse;
    ctx.fillRect(-3, -46, 6, 28);
    // lapels
    ctx.strokeStyle = '#334155';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(-4, -46);
    ctx.lineTo(-10, -28);
    ctx.moveTo(4, -46);
    ctx.lineTo(10, -28);
    ctx.stroke();

    // arms holding book
    ctx.strokeStyle = skin;
    ctx.lineWidth = 4.5;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(-10, -36);
    ctx.lineTo(-4, -26);
    ctx.moveTo(10, -36);
    ctx.lineTo(4, -26);
    ctx.stroke();

    // book
    ctx.fillStyle = '#7c3aed';
    ctx.fillRect(-10, -30, 20, 14);
    ctx.fillStyle = '#ede9fe';
    ctx.fillRect(-1, -30, 2, 14);
    ctx.fillStyle = '#c4b5fd';
    ctx.font = 'bold 6px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('HR', 0, -21);

    // head looking down at book
    ctx.fillStyle = skin;
    ctx.beginPath();
    ctx.arc(0, -56, 9, 0, Math.PI * 2);
    ctx.fill();
    // bold bob
    ctx.fillStyle = hair;
    ctx.beginPath();
    ctx.ellipse(0, -60, 11, 8, 0, Math.PI, 0);
    ctx.fill();
    ctx.fillRect(-11, -60, 22, 8);
    ctx.beginPath();
    ctx.ellipse(-10, -52, 4, 7, 0.2, 0, Math.PI * 2);
    ctx.ellipse(10, -52, 4, 7, -0.2, 0, Math.PI * 2);
    ctx.fill();
  } else {
    // standing startled / launch
    const armsUp = pose === 'startled';
    const launching = pose === 'launch';

    // legs
    ctx.strokeStyle = suit;
    ctx.lineWidth = 6;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(-5, -18);
    ctx.lineTo(-8, 0);
    ctx.moveTo(5, -18);
    ctx.lineTo(launching ? 14 : 9, launching ? -4 : 0);
    ctx.stroke();
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(-12, -2, 9, 4);
    ctx.fillRect(launching ? 10 : 5, launching ? -6 : -2, 9, 4);

    // skirt / hips
    ctx.fillStyle = suit;
    ctx.beginPath();
    ctx.moveTo(-11, -22);
    ctx.lineTo(11, -22);
    ctx.lineTo(13, -12);
    ctx.lineTo(-13, -12);
    ctx.closePath();
    ctx.fill();

    // torso
    ctx.fillStyle = suit;
    ctx.beginPath();
    ctx.roundRect(-11, -52, 22, 32, 4);
    ctx.fill();
    ctx.fillStyle = blouse;
    ctx.fillRect(-3, -50, 6, 26);

    // arms
    ctx.strokeStyle = skin;
    ctx.lineWidth = 4.5;
    ctx.beginPath();
    if (armsUp) {
      ctx.moveTo(-9, -40);
      ctx.lineTo(-22, -62);
      ctx.moveTo(9, -40);
      ctx.lineTo(20, -64);
    } else {
      // wind-up / shove
      ctx.moveTo(-9, -40);
      ctx.lineTo(-18, -28);
      ctx.moveTo(9, -40);
      ctx.lineTo(28, -46);
    }
    ctx.stroke();

    // flying book when startled
    if (armsUp || launching) {
      const bx = armsUp ? 26 + Math.sin(frame * 0.4) * 2 : 34;
      const by = armsUp ? -70 : -58;
      const rot = armsUp ? 0.55 : 1.1;
      ctx.save();
      ctx.translate(bx, by);
      ctx.rotate(rot);
      ctx.fillStyle = '#7c3aed';
      ctx.fillRect(-8, -5, 16, 11);
      ctx.fillStyle = '#ede9fe';
      ctx.fillRect(-1, -5, 2, 11);
      ctx.restore();
    }

    // head
    ctx.fillStyle = skin;
    ctx.beginPath();
    ctx.arc(0, -60, 9, 0, Math.PI * 2);
    ctx.fill();
    // wide eyes / mouth for startled
    if (armsUp) {
      ctx.fillStyle = '#0f172a';
      ctx.beginPath();
      ctx.arc(-3.5, -60, 1.6, 0, Math.PI * 2);
      ctx.arc(3.5, -60, 1.6, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(0, -56, 2.2, 0, Math.PI * 2);
      ctx.fill();
    }
    // hair
    ctx.fillStyle = hair;
    ctx.beginPath();
    ctx.ellipse(0, -64, 11, 8, 0, Math.PI, 0);
    ctx.fill();
    ctx.fillRect(-11, -64, 22, 9);
    ctx.beginPath();
    ctx.ellipse(-10, -56, 4, 7, 0.2, 0, Math.PI * 2);
    ctx.ellipse(10, -56, 4, 7, -0.2, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();
}

function applySmokerBoost(box, speedFactor = 1) {
  const f = Number.isFinite(speedFactor) ? speedFactor : 1;
  box.vy = -48 * (0.95 + Math.random() * 0.15) * f;
  box.vx = Math.max(Math.abs(box.vx) * 3.1, 42) * f;
  box.spin = (Math.random() > 0.5 ? 1 : -1) * 1.15;
  box.onGround = false;
}

/** Roughly 2× smoker launch — ultra rare Macan hit. */
function applyMacanBoost(box, speedFactor = 1) {
  const f = Number.isFinite(speedFactor) ? speedFactor : 1;
  box.vy = -96 * (0.95 + Math.random() * 0.15) * f;
  box.vx = Math.max(Math.abs(box.vx) * 6.2, 84) * f;
  box.spin = (Math.random() > 0.5 ? 1 : -1) * 1.45;
  box.onGround = false;
}

/** 3× Julies Car — Chelle yeets the toolbox after the startled stand-up. */
function applyChelleBoost(box, speedFactor = 1) {
  const f = Number.isFinite(speedFactor) ? speedFactor : 1;
  box.vy = -288 * (0.95 + Math.random() * 0.15) * f;
  box.vx = Math.max(Math.abs(box.vx) * 18.6, 252) * f;
  box.spin = (Math.random() > 0.5 ? 1 : -1) * 1.85;
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

function chelleStartledGrade() {
  return {
    label: "I'm trying to read!",
    sub: 'Chelle stands up startled…',
    gold: true,
    epic: true,
    color: '#ddd6fe',
    glow: '#8b5cf6',
  };
}

function chelleBoostGrade() {
  return {
    label: 'CHELLE!',
    sub: '3× Julies Car — startled launch!',
    gold: true,
    epic: true,
    color: '#ddd6fe',
    glow: '#8b5cf6',
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

function littleDickMach2Grade() {
  return {
    label: 'HAVE THAT!',
    sub: 'you dirty cheat',
    gold: true,
    epic: true,
    color: '#fecaca',
    glow: '#ef4444',
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

function balloonHitGrade() {
  return {
    label: 'Balloon!',
    sub: 'Envelope burst — big slowdown',
    gold: false,
    color: '#f87171',
    glow: '#ef4444',
  };
}

function milestoneGrade(m) {
  const space = m.km >= 20000;
  const big = m.km >= 110;
  return {
    label: m.label,
    sub: m.sub,
    gold: big,
    epic: space || m.km >= 110,
    color: space ? '#c4b5fd' : big ? '#fbbf24' : '#fde68a',
    glow: space ? '#8b5cf6' : big ? '#f59e0b' : '#eab308',
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

function EnergyDrinkBanner({ practice = false, superRage = null, alreadyDone = false }) {
  if (practice) {
    return (
      <div className="rounded-xl border border-lime-500/35 bg-lime-500/10 px-4 py-3 space-y-1">
        <p className="text-sm font-semibold text-lime-100">Dick’s energy drink · practice</p>
        <p className="text-xs text-slate-300 leading-relaxed">
          Free to try here. In the real daily game you get <span className="text-white font-medium">one drink per week</span>
          {' '}(+80% launch speed on one kick). Everyone’s fridge refills on Monday.
        </p>
      </div>
    );
  }

  const ready = Boolean(superRage?.available);
  const refill = superRage?.refillDayKey || 'Monday';

  return (
    <div
      className={`rounded-xl border px-4 py-3 space-y-1 ${
        ready
          ? 'border-rose-500/40 bg-rose-500/10'
          : 'border-slate-500/35 bg-slate-500/10'
      }`}
    >
      <p className={`text-sm font-semibold ${ready ? 'text-rose-100' : 'text-slate-200'}`}>
        {ready ? 'Dick’s energy drink · ready' : 'Dick’s energy drink · empty'}
      </p>
      <p className="text-xs text-slate-300 leading-relaxed">
        {ready ? (
          <>
            One can this week. Tap <span className="text-white font-medium">Drink energy drink</span> before a kick
            for <span className="text-white font-medium">+80% speed</span> on that kick only.
            After that it’s gone until Monday — same for everyone.
          </>
        ) : (
          <>
            You’ve already had this week’s can
            {alreadyDone ? ' (or it’s used up)' : ''}.
            {' '}Everyone gets a fresh energy drink on <span className="text-white font-medium">Monday</span>
            {refill && refill !== 'Monday' ? ` (${refill})` : ''}.
          </>
        )}
      </p>
    </div>
  );
}

function ToolboxKickGame({
  mode = 'careful',
  onChangeMode,
  competitive = false,
  onRoundComplete = null,
  devCheats = false,
  superRageAvailable = false,
  onActivateSuperRage = null,
  caughtCheating = false,
  punished = false,
  /** Toolbox 2.0 — sandbox / preview only when TOOLBOX_V2_DEV && (devCheats or forceV2). */
  forceV2 = false,
  dayKey = null,
  recordMarkers = null,
  onFlightCoin = null,
}) {
  const canvasRef = useRef(null);
  const stageRef = useRef(null);
  const stateRef = useRef(null);
  const tuningRef = useRef(DEFAULT_TUNING);
  const modeRef = useRef(mode);
  const competitiveRef = useRef(competitive);
  const devCheatsRef = useRef(devCheats);
  const v2Ref = useRef(Boolean(TOOLBOX_V2_LIVE || (TOOLBOX_V2_DEV && (devCheats || forceV2))));
  const dayKeyRef = useRef(dayKey || getLondonDayKey());
  const markersRef = useRef(Array.isArray(recordMarkers) ? recordMarkers : []);
  const onFlightCoinRef = useRef(onFlightCoin);
  const caughtCheatingRef = useRef(caughtCheating);
  const punishedRef = useRef(punished);
  const onRoundCompleteRef = useRef(onRoundComplete);
  const rageUiRef = useRef({ onConsumed: null });
  const popupIdRef = useRef(0);
  const [hud, setHud] = useState({
    phase: PHASE.READY,
    distance: 0,
    speedMph: 0,
    altitudeM: 0,
    best: Number(localStorage.getItem('toolbox-kick-best') || 0),
    attempt: 1,
    roundBest: 0,
    airCombo: 0,
    windLabel: 'Calm',
    message: mode === 'allOrNothing'
      ? 'All or nothing — one shot. Tap to set POWER'
      : `Attempt 1/${MAX_ATTEMPTS} — tap to set POWER`,
  });
  const [popup, setPopup] = useState(null);
  const [haHaFlash, setHaHaFlash] = useState(false);
  /** Little Dick QTE HUD: null | 'ready' | 'go' */
  const [qteFlash, setQteFlash] = useState(null);
  const [cheatPunished, setCheatPunished] = useState(false);
  const [roundDone, setRoundDone] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [rageAvailable, setRageAvailable] = useState(Boolean(superRageAvailable));
  const [rageArmed, setRageArmed] = useState(false);
  const [rageBusy, setRageBusy] = useState(false);
  const [rageError, setRageError] = useState('');

  useEffect(() => {
    modeRef.current = mode;
  }, [mode]);

  useEffect(() => {
    competitiveRef.current = competitive;
  }, [competitive]);

  useEffect(() => {
    devCheatsRef.current = devCheats;
    v2Ref.current = Boolean(TOOLBOX_V2_LIVE || (TOOLBOX_V2_DEV && (devCheats || forceV2)));
  }, [devCheats, forceV2]);

  useEffect(() => {
    dayKeyRef.current = dayKey || getLondonDayKey();
  }, [dayKey]);

  useEffect(() => {
    markersRef.current = Array.isArray(recordMarkers) ? recordMarkers : [];
  }, [recordMarkers]);

  useEffect(() => {
    onFlightCoinRef.current = onFlightCoin;
  }, [onFlightCoin]);

  useEffect(() => {
    caughtCheatingRef.current = Boolean(caughtCheating);
    const st = stateRef.current;
    if (st) st.caughtCheating = Boolean(caughtCheating);
  }, [caughtCheating]);

  useEffect(() => {
    const on = Boolean(punished || cheatPunished);
    punishedRef.current = on;
    const st = stateRef.current;
    if (st) st.punished = on;
  }, [punished, cheatPunished]);

  useEffect(() => {
    onRoundCompleteRef.current = onRoundComplete;
  }, [onRoundComplete]);

  useEffect(() => {
    setRageAvailable(Boolean(superRageAvailable));
  }, [superRageAvailable]);

  useEffect(() => {
    rageUiRef.current.onConsumed = () => {
      setRageArmed(false);
      // Sandbox / practice: free Super Rage every kick.
      if (typeof onActivateSuperRage !== 'function') {
        setRageAvailable(true);
      }
    };
  }, [onActivateSuperRage]);

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

  const armSuperRage = useCallback(async () => {
    if (rageBusy || rageArmed || roundDone) return;
    const st = stateRef.current;
    if (st && (st.phase === PHASE.FLIGHT || st.phase === PHASE.RUNUP || st.phase === PHASE.LANDED)) {
      setRageError('Drink the energy drink before you kick.');
      return;
    }
    setRageError('');
    setRageBusy(true);
    try {
      if (typeof onActivateSuperRage === 'function') {
        await onActivateSuperRage();
      }
      setRageAvailable(false);
      setRageArmed(true);
      if (stateRef.current) stateRef.current.superRageArmed = true;
      showRpgPopup(superRageGrade(), 1400);
    } catch (err) {
      setRageError(err?.message || 'Could not drink energy drink.');
    } finally {
      setRageBusy(false);
    }
  }, [rageBusy, rageArmed, roundDone, onActivateSuperRage, showRpgPopup]);

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
    const sandboxV2 = Boolean(v2Ref.current && devCheatsRef.current);
    const attempts = modeRef.current === 'allOrNothing'
      ? 1
      : (sandboxV2 ? MAX_ATTEMPTS_DEV_V2 : MAX_ATTEMPTS);
    const v2 = Boolean(v2Ref.current);
    const windDayKey = dayKeyRef.current || getLondonDayKey();
    const qtePractice = sandboxV2 && attempt === DEV_QTE_PRACTICE_ATTEMPT;
    const windProfile = v2
      ? windProfileForAttempt({ dayKey: windDayKey, attempt, maxAttempts: attempts })
      : { mode: 'calm', label: 'Calm', angleDeg: 0, speed: 0 };
    if (v2) {
      // Coins spawn lazily near the toolbox (see ensureFlightCoinsNear).
      const markers = markersRef.current || [];
      for (const marker of markers) {
        items.push({
          type: 'recordFlag',
          x: BOX_REST_X + marker.distanceM * PX_PER_METRE,
          marker,
          id: `flag-${marker.kind}-${marker.distanceM}`,
        });
      }
      items.sort((a, b) => a.x - b.x);
    }
    const windHint = qtePractice
      ? ' · QTE PRACTICE — land on Little Dick & TAP!'
      : (v2 && windProfile.mode !== 'calm'
        ? ` · ${windProfile.label}`
        : (v2 ? ' · calm skies' : ''));
    const message = attempts === 1
      ? `All or nothing — one shot. Tap to set POWER${windHint}`
      : `Attempt ${attempt}/${attempts} — tap to set POWER${windHint}`;
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
      lastSubmittedAttempt: 0,
      perfectLaunch: false,
      message,
      kickFlash: 0,
      zoom: 1,
      hitMilestones: new Set(),
      launchSpeed: 0,
      launchAngleDeg: 45,
      dickCatch: null,
      chelleReact: null,
      punishRevenge: null,
      caughtCheating: Boolean(caughtCheatingRef.current),
      punished: Boolean(punishedRef.current),
      superRageArmed: opts.freshRound
        ? false
        : Boolean(opts.keepRageArmed || (stateRef.current && stateRef.current.superRageArmed)),
      superRageUsed: false,
      roundBestUsedEnergyDrink: opts.freshRound
        ? false
        : Boolean(opts.roundBestUsedEnergyDrink
          ?? (stateRef.current && stateRef.current.roundBestUsedEnergyDrink)),
      landThump: 0,
      _wetThumpNoted: false,
      v2,
      windProfile,
      windNow: sampleWind(windProfile, 0),
      airCombo: 0,
      maxAirCombo: 0,
      coinsGrabbed: 0,
      flightCoinPlan: v2 ? buildFlightCoinPlan(windDayKey) : null,
      collectedCoinSlots: new Set(),
      qtePractice: Boolean(qtePractice),
    };
    setHud({
      phase: PHASE.READY,
      distance: 0,
      speedMph: 0,
      altitudeM: 0,
      best,
      attempt,
      roundBest,
      airCombo: 0,
      windLabel: windProfile.label || 'Calm',
      message,
    });
    setQteFlash(null);
  }, []);

  const doSpace = useCallback(() => {
    const st = stateRef.current;
    if (!st) return;
    const attempts = st.maxAttempts || (modeRef.current === 'allOrNothing' ? 1 : MAX_ATTEMPTS);

    // Toolbox 2.0 — Little Dick kickback QTE (Space / tap / overlay button)
    if (dickQteEnabled(st) && st.phase === PHASE.FLIGHT && st.dickCatch && !st.dickCatch.qteResolved) {
      const f = st.dickCatch.frame || 0;
      if (f >= DICK_QTE_OPEN && f <= DICK_QTE_CLOSE) {
        st.dickCatch.qteResolved = true;
        st.dickCatch.qteSuccess = true;
        st.message = 'Nice! You broke free — boost incoming…';
        setQteFlash(null);
        showRpgPopup(dickQteSuccessGrade(), 1600);
        setHud((h) => ({ ...h, message: st.message }));
        return;
      }
      if (f < DICK_QTE_OPEN) {
        st.message = 'Too early — wait for TAP NOW!';
        setHud((h) => ({ ...h, message: st.message }));
        return;
      }
      st.dickCatch.qteResolved = true;
      st.dickCatch.qteSuccess = false;
      setQteFlash(null);
      st.message = 'Missed the QTE — here comes the boot-back…';
      setHud((h) => ({ ...h, message: st.message }));
      return;
    }

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
      if (st.punishRevenge && st.punishRevenge.stage !== 'done') return;
      if (st.attempt < attempts) {
        initShot({
          keepBest: true,
          attempt: st.attempt + 1,
          roundBest: st.roundBest,
          attemptDistances: st.attemptDistances || [],
          roundBestUsedEnergyDrink: st.roundBestUsedEnergyDrink,
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
      if (st.dickCatch || st.chelleReact) return;
      applySmokerBoost(st.box, (st.caughtCheating || st.punished) ? CAUGHT_CHEAT_SPEED_FACTOR : 1);
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
    if (!st || st.phase !== PHASE.FLIGHT || st.dickCatch || st.chelleReact) return;
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
    if (st.phase === PHASE.FLIGHT && (st.dickCatch || st.chelleReact)) return;
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
    let lastTs = 0;
    let simAccum = 0;

    const syncHud = (st) => {
      setHud({
        phase: st.phase,
        distance: Math.floor(st.distance),
        speedMph: speedMphFromBox(st.box),
        altitudeM: Math.floor(altitudeMetresFromBox(st.box)),
        best: st.best,
        attempt: st.attempt || 1,
        roundBest: st.roundBest || 0,
        airCombo: st.airCombo || 0,
        windLabel: st.windNow?.label || st.windProfile?.label || 'Calm',
        message: st.message,
      });
    };

    const step = (ts) => {
      const st = stateRef.current;
      const tun = tuningRef.current || DEFAULT_TUNING;
      const bar = BAR_SPEED[modeRef.current] || BAR_SPEED.careful;
      if (!st) {
        raf = requestAnimationFrame(step);
        return;
      }
      const rawDt = lastTs ? (ts - lastTs) / 1000 : TOOLBOX_SIM_DT;
      lastTs = ts;
      // Cap so a backgrounded tab doesn't spiral when it returns
      const dt = Math.min(0.05, Math.max(0, rawDt));

      // Power / angle meters are already wall-clock (Hz-independent).
      if (st.phase === PHASE.POWER) {
        st.powerT += bar.power * dt;
        st.power = meterValue(st.powerT);
      } else if (st.phase === PHASE.ANGLE) {
        st.angleT += bar.angle * dt;
        st.angleDeg = 15 + meterValue(st.angleT) * 60;
      }

      // Fixed-timestep gameplay @ 60 Hz; display still paints every monitor refresh.
      simAccum += dt;
      let simSteps = 0;
      while (simAccum >= TOOLBOX_SIM_DT && simSteps < TOOLBOX_MAX_SIM_STEPS) {
        st._renderPrev = captureToolboxRenderPose(st);
        simAccum -= TOOLBOX_SIM_DT;
        simSteps += 1;
        st.frame += 1;

        if (st.phase === PHASE.RUNUP) {
        st.runup += 1;
        const t = Math.min(1, st.runup / RUNUP_FRAMES);
        const eased = t * t;
        st.mechX = MECH_START_X + (MECH_KICK_X - MECH_START_X) * eased;
        if (st.runup === KICK_FRAME) st.kickFlash = 10;
        if (st.runup >= LAUNCH_FRAME) {
          const rad = (st.angleDeg * Math.PI) / 180;
          const speedFactor = (st.caughtCheating || st.punished) ? CAUGHT_CHEAT_SPEED_FACTOR : 1;
          let speed = launchSpeedForPower(st.power, tun);
          if (st.perfectLaunch) {
            speed *= PERFECT_LAUNCH_BOOST;
            popupFnRef.current?.(perfectLaunchGrade(), 1700);
          }
          if (st.superRageArmed) {
            speed *= SUPER_RAGE_BOOST;
            st.superRageArmed = false;
            st.superRageUsed = true;
            popupFnRef.current?.(superRageGrade(), 1800);
            if (typeof rageUiRef.current?.onConsumed === 'function') {
              rageUiRef.current.onConsumed();
            }
          }
          speed *= speedFactor;
          st.launchSpeed = speed;
          st.launchAngleDeg = st.angleDeg;
          st.box.x = BOX_REST_X;
          st.box.y = GROUND_Y - 12;
          st.box.vx = Math.cos(rad) * speed;
          st.box.vy = -Math.sin(rad) * speed;
          st.box.spin = 0.2 + st.power * 0.3;
          st.box.onGround = false;
          st.dickCatch = null;
          st.chelleReact = null;
          if (st.punished) spawnPunishmentCoachSwarm(st);
          if (st.qtePractice) {
            spawnQtePracticeDicks(st);
            st.message = 'QTE PRACTICE — land on Little Dick, then TAP NOW!';
          }
          st.phase = PHASE.FLIGHT;
          if (!st.qtePractice) {
            st.message = st.punished
              ? 'Punishment — coaches everywhere!'
              : st.caughtCheating
                ? 'Caught cheating — toolbox is sluggish…'
                : st.perfectLaunch
                  ? 'Perfect launch!!! Fly, toolbox, fly…'
                  : 'Fly, toolbox, fly…';
          }
          syncHud(st);
        }
      } else if (st.phase === PHASE.FLIGHT && st.dickCatch) {
        const box = st.box;
        const catchSt = st.dickCatch;
        const qteOn = dickQteEnabled(st);
        catchSt.frame += 1;
        const f = catchSt.frame;
        // Hold toolbox while he catches / winds up / boots
        box.vx = 0;
        box.vy = 0;
        box.onGround = false;
        box.x = catchSt.x + (catchSt.facing < 0 ? -8 : 8);
        box.y = GROUND_Y - (f < 14 ? 28 : 18);
        box.rot = f < 14 ? -0.4 : 0.15;
        box.spin = 0;

        if (f === 1) {
          st.message = qteOn
            ? 'Little Dick caught the toolbox — get ready to TAP!'
            : 'Little Dick caught the toolbox!';
          // Short popup so it doesn’t cover the whole QTE window
          popupFnRef.current?.(littleDickRebootGrade(), qteOn ? 900 : 2000);
          if (qteOn) setQteFlash('ready');
          syncHud(st);
        }
        if (qteOn && !catchSt.qteResolved) {
          if (f === DICK_QTE_OPEN) {
            setQteFlash('go');
            st.message = 'TAP NOW — Space / tap the screen!';
            syncHud(st);
          }
          if (f === DICK_QTE_CLOSE + 1) {
            catchSt.qteResolved = true;
            catchSt.qteSuccess = false;
            setQteFlash(null);
            st.message = 'Missed the QTE — here comes the boot-back…';
            syncHud(st);
          }
        }
        if (f === DICK_QTE_TURN) {
          if (qteOn && catchSt.qteSuccess) {
            catchSt.facing = 1;
            st.message = 'He winds up… but you wriggle free!';
          } else {
            catchSt.facing = -1; // betrayal — turns and boots BACK toward the start
            st.message = 'Oh no — he boots it BACK toward the start!';
          }
          syncHud(st);
        }
        if (f === DICK_QTE_FLASH) {
          st.kickFlash = 10;
        }
        if (f >= DICK_QTE_BOOT) {
          const rad = ((st.launchAngleDeg || 45) * Math.PI) / 180;
          const speedFactor = (st.caughtCheating || st.punished) ? CAUGHT_CHEAT_SPEED_FACTOR : 1;
          const speed = (st.launchSpeed || launchSpeedForPower(st.power, tun)) * speedFactor;
          setQteFlash(null);
          if (qteOn && catchSt.qteSuccess) {
            box.x = catchSt.x + 14;
            box.y = GROUND_Y - 18;
            applyDickQteBoost(box, speedFactor);
            st.kickFlash = 12;
            st.dickCatch = null;
            st.hitIds = new Set();
            st.message = 'QTE! Little Dick whiffs — toolbox rockets onward!';
            popupFnRef.current?.(dickQteSuccessGrade(), 1800);
            syncHud(st);
          } else {
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
        }
        st.distance = (box.x - BOX_REST_X) / PX_PER_METRE;
        st.camX = box.x - W * 0.35;
        if (st.frame % 6 === 0) syncHud(st);
      } else if (st.phase === PHASE.FLIGHT && st.chelleReact) {
        const box = st.box;
        const react = st.chelleReact;
        react.frame += 1;
        const f = react.frame;
        // Hold on her lap / in front while she stands startled, then yeets
        box.vx = 0;
        box.vy = 0;
        box.onGround = false;
        box.x = react.x + (f < 18 ? 6 : 18);
        box.y = GROUND_Y - (f < 18 ? 22 : 36);
        box.rot = f < 18 ? -0.25 : 0.55;
        box.spin = 0;

        if (f === 1) {
          st.message = "Chelle: I'm trying to read!";
          popupFnRef.current?.(chelleStartledGrade(), 1800);
          syncHud(st);
        }
        if (f === 18) {
          st.message = 'Chelle recovers and launches the toolbox!';
          popupFnRef.current?.(chelleBoostGrade(), 2200);
          syncHud(st);
        }
        if (f === 28) {
          st.kickFlash = 12;
        }
        if (f >= 34) {
          const speedFactor = (st.caughtCheating || st.punished) ? CAUGHT_CHEAT_SPEED_FACTOR : 1;
          applyChelleBoost(box, speedFactor);
          box.x = react.x + 24;
          box.y = GROUND_Y - 40;
          st.chelleReact = null;
          st.message = st.caughtCheating
            ? 'CHELLE! (but you’re sluggish…)'
            : 'CHELLE! 3× Julies Car!';
          syncHud(st);
        }
        st.distance = (box.x - BOX_REST_X) / PX_PER_METRE;
        st.camX = box.x - W * 0.35;
        if (st.frame % 6 === 0) syncHud(st);
      } else if (st.phase === PHASE.FLIGHT) {
        const box = st.box;
        const nearGround = box.y >= GROUND_Y - 14 || box.onGround;
        if (st.v2 && st.windProfile) {
          const wind = sampleWind(st.windProfile, st.frame);
          st.windNow = wind;
          if (nearGround) {
            // Ground contact kills most wind push so a tailwind can't perpetual-slide.
            const gScale = tun.groundWindScale ?? 0.06;
            box.vx += wind.ax * gScale;
            // No vertical loft while scraping asphalt
          } else {
            box.vx += wind.ax;
            box.vy += wind.ay;
          }
        }
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

        // Birds + balloons drift slowly while you're in flight
        for (let i = 0; i < st.items.length; i += 1) {
          const it = st.items[i];
          if (it.type === 'bird' && !it.hit) {
            it.x += (it.dir || 1) * 0.35;
          } else if (it.type === 'balloon' && !it.hit) {
            it.x += 0.12;
            it.y += Math.sin(st.frame * 0.05 + (it.bobPhase || 0)) * 0.15;
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
                registerAirCombo(st, box, popupFnRef.current);
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
                registerAirCombo(st, box, popupFnRef.current);
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
                registerAirCombo(st, box, popupFnRef.current);
                applySmokerBoost(box, (st.caughtCheating || st.punished) ? CAUGHT_CHEAT_SPEED_FACTOR : 1);
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
                registerAirCombo(st, box, popupFnRef.current);
                applyMacanBoost(box, (st.caughtCheating || st.punished) ? CAUGHT_CHEAT_SPEED_FACTOR : 1);
                st.message = 'JULIES CAR!';
                popupFnRef.current?.(macanBoostGrade(), 2000);
                syncHud(st);
              }
            }
          } else if (it.type === 'chelle') {
            // Must land on her (descending) — she stands startled, then yeets 3× Macan
            const dx = box.x - it.x;
            const dy = box.y - (GROUND_Y - 24);
            if (dx * dx + dy * dy < 38 ** 2 && box.vy > 0 && !st.hitIds.has(id)) {
              st.hitIds.add(id);
              bumpHitTally(st, 'chelle');
              registerAirCombo(st, box, popupFnRef.current);
              st.chelleReact = { x: it.x, frame: 0 };
              box.vx = 0;
              box.vy = 0;
              box.x = it.x + 6;
              box.y = GROUND_Y - 22;
              st.message = "Chelle: I'm trying to read!";
              syncHud(st);
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
                qteResolved: false,
                qteSuccess: false,
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
              registerAirCombo(st, box, popupFnRef.current);
              it.hit = true;
              box.vx *= tun.birdSlow;
              box.vy *= 0.96;
              box.spin *= -0.8;
              st.message = 'Bird strike — feathers everywhere!';
              popupFnRef.current?.(birdHitGrade(), 900);
              syncHud(st);
            }
          } else if (it.type === 'balloon') {
            const by = it.y ?? (GROUND_Y - 120);
            const scale = Number(it.scale) || 1;
            const hitR = 26 * scale;
            const dx = box.x - it.x;
            const dy = box.y - (by - 18 * scale);
            if (dx * dx + dy * dy < hitR * hitR && !st.hitIds.has(id)) {
              st.hitIds.add(id);
              bumpHitTally(st, 'balloon');
              registerAirCombo(st, box, popupFnRef.current);
              it.hit = true;
              box.vx *= tun.balloonSlow ?? 0.68;
              box.vy *= tun.balloonVyDamp ?? 0.55;
              box.spin *= -0.7;
              st.message = 'Hot-air balloon — slowed right down!';
              popupFnRef.current?.(balloonHitGrade(), 1100);
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
              registerAirCombo(st, box, popupFnRef.current);
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
          } else if (it.type === 'flightCoin' && st.v2 && !it.collected) {
            const dx = box.x - it.x;
            const dy = box.y - (GROUND_Y - 52);
            if (dx * dx + dy * dy < 28 ** 2) {
              it.collected = true;
              st.hitIds.add(id);
              bumpHitTally(st, 'flightCoin');
              if (!st.collectedCoinSlots) st.collectedCoinSlots = new Set();
              st.collectedCoinSlots.add(it.slot);
              st.coinsGrabbed = (st.coinsGrabbed || 0) + 1;
              const amount = it.amount || FLIGHT_COIN_AMOUNT;
              st.message = `Flight coin! +${amount} to your wallet`;
              popupFnRef.current?.(flightCoinGrade(amount), 1200);
              onFlightCoinRef.current?.({
                slot: it.slot,
                amount,
                dayKey: dayKeyRef.current,
              });
              syncHud(st);
            }
          }
        }

        if (box.y >= GROUND_Y - 10) {
          box.y = GROUND_Y - 10;
          if (st.v2 && st.airCombo) {
            st.airCombo = 0;
          }
          const wetGrass = Boolean(st.v2 && st.windProfile?.mode === 'storm');
          const bounceDamp = wetGrass
            ? (tun.wetGrassBounceDamp ?? 0.1)
            : (tun.bounceDamp ?? 0.36);
          const bounceFric = wetGrass
            ? (tun.wetGrassFriction ?? 0.62)
            : (box.oiled ? tun.oilFriction : tun.friction);
          const slideDrag = wetGrass
            ? (tun.wetGrassGroundDrag ?? 0.82)
            : (box.oiled ? tun.oilGroundDrag : tun.groundDrag);
          const bounceMinVy = wetGrass
            ? (tun.wetGrassBounceMinVy ?? 4.2)
            : (tun.grassBounceMinVy ?? 2.35);
          const impactVy = Math.abs(box.vy);
          if (impactVy > bounceMinVy) {
            box.vy = -box.vy * bounceDamp;
            box.vx *= bounceFric;
            box.spin *= wetGrass ? 0.55 : 0.92;
            if (wetGrass && impactVy > 3.2) {
              st.landThump = Math.max(st.landThump || 0, Math.min(14, 6 + Math.floor(impactVy)));
              if (!st._wetThumpNoted) {
                st._wetThumpNoted = true;
                st.message = 'Wet grass — THUMP!';
                syncHud(st);
              }
            }
          } else {
            box.vy = 0;
            box.vx *= slideDrag;
            // Extra bite once it's truly sliding (kills leftover tailwind crawl)
            if (Math.abs(box.vx) > 0) {
              box.vx *= wetGrass ? 0.96 : (box.oiled ? 0.995 : 0.988);
            }
            box.spin *= wetGrass ? 0.85 : (box.oiled ? 0.97 : 0.94);
            box.onGround = true;
            if (Math.abs(box.vx) < tun.stopSpeed) {
              box.vx = 0;
              const afterMachBoot = Boolean(st.punishRevenge?.afterBoot);
              st.phase = PHASE.LANDED;
              const dist = Math.floor(st.distance);

              if (afterMachBoot) {
                st.punishRevenge = null;
                const maxAttempts = st.maxAttempts || MAX_ATTEMPTS;
                if (st.attempt < maxAttempts) {
                  st.message = `Mach 2 boot done · scored ${formatDistance(st.roundBest)}. Tap for attempt ${st.attempt + 1}/${maxAttempts}`;
                } else if (competitiveRef.current) {
                  st.message = `Mach 2 boot done · scored ${formatDistance(st.roundBest)}. Round locked.`;
                } else {
                  st.message = `Mach 2 boot done · scored ${formatDistance(st.roundBest)}. Tap for a new round`;
                }
                syncHud(st);
              } else {
                if (!Array.isArray(st.attemptDistances)) st.attemptDistances = [];
                // Highest distance wins — negatives are valid (and hilarious)
                const prevBest = st.attemptDistances.length === 0 ? null : st.roundBest;
                if (prevBest === null || dist > prevBest) {
                  st.roundBest = dist;
                  st.roundBestUsedEnergyDrink = Boolean(st.superRageUsed);
                }
                st.attemptDistances = [...st.attemptDistances, dist];
                if (dist > st.best) {
                  st.best = dist;
                  localStorage.setItem('toolbox-kick-best', String(dist));
                }
                if (st.punished) {
                  setHaHaFlash(true);
                  st.punishRevenge = {
                    stage: 'wait',
                    frame: 0,
                    x: 0,
                    facing: -1,
                  };
                  st.message = `Attempt ${st.attempt} · ${formatDistance(dist)}. HA-HA…`;
                  const maxAttempts = st.maxAttempts || MAX_ATTEMPTS;
                  const finalize = st.attempt >= maxAttempts;
                  if (competitiveRef.current && st.lastSubmittedAttempt !== st.attempt) {
                    st.lastSubmittedAttempt = st.attempt;
                    if (finalize) {
                      st.roundReported = true;
                      setRoundDone(true);
                    }
                    onRoundCompleteRef.current?.({
                      distanceM: st.roundBest,
                      attempts: [...st.attemptDistances],
                      energyDrinkUsed: Boolean(st.roundBestUsedEnergyDrink),
                      finalize,
                    });
                  }
                } else {
                  const maxAttempts = st.maxAttempts || MAX_ATTEMPTS;
                  const finalize = st.attempt >= maxAttempts;
                  // Save every attempt (not only the last) so a reload cannot wipe a finished kick.
                  if (competitiveRef.current && st.lastSubmittedAttempt !== st.attempt) {
                    st.lastSubmittedAttempt = st.attempt;
                    if (finalize) {
                      st.roundReported = true;
                      setRoundDone(true);
                    }
                    onRoundCompleteRef.current?.({
                      distanceM: st.roundBest,
                      attempts: [...st.attemptDistances],
                      energyDrinkUsed: Boolean(st.roundBestUsedEnergyDrink),
                      finalize,
                    });
                  }
                  if (st.attempt < maxAttempts) {
                    st.message = competitiveRef.current
                      ? `Attempt ${st.attempt} · ${formatDistance(dist)}. Saving… Tap for attempt ${st.attempt + 1}/${maxAttempts}`
                      : `Attempt ${st.attempt} · ${formatDistance(dist)}. Tap for attempt ${st.attempt + 1}/${maxAttempts}`;
                  } else if (competitiveRef.current) {
                    st.message = `Round locked · best ${formatDistance(st.roundBest)}. Saving score…`;
                  } else {
                    st.message = dist < 0
                      ? `Round over · best ${formatDistance(st.roundBest)}. (Yes, negative is allowed.) Tap for a new round`
                      : `Round over · best ${formatDistance(st.roundBest)}. Tap for a new round`;
                  }
                }
                syncHud(st);
              }
            }
          }
        }

        st.camX = box.x - W * 0.35;
        if (st.frame % 6 === 0) syncHud(st);
      } else if (st.phase === PHASE.LANDED && st.punishRevenge && st.punishRevenge.stage !== 'done') {
        const pr = st.punishRevenge;
        const box = st.box;
        pr.frame += 1;

        if (pr.stage === 'wait') {
          if (pr.frame >= PUNISH_HAHA_WAIT_FRAMES) {
            setHaHaFlash(false);
            pr.stage = 'walk';
            pr.frame = 0;
            pr.x = box.x + 440;
            pr.facing = -1;
            st.message = 'Little Dick walks in from the right…';
            syncHud(st);
          }
        } else if (pr.stage === 'walk') {
          pr.x -= 5.2;
          st.camX += ((pr.x - W * 0.55) - st.camX) * 0.08;
          if (pr.x <= box.x + 18) {
            pr.stage = 'grab';
            pr.frame = 0;
            pr.x = box.x + 10;
            st.message = 'Little Dick picks up the toolbox…';
            popupFnRef.current?.(littleDickRebootGrade(), 1800);
            syncHud(st);
          }
        } else if (pr.stage === 'grab') {
          box.vx = 0;
          box.vy = 0;
          box.onGround = false;
          box.x = pr.x - 8;
          box.y = GROUND_Y - (pr.frame < 18 ? 28 : 18);
          box.rot = pr.frame < 18 ? -0.35 : 0.2;
          box.spin = 0;
          if (pr.frame === 22) {
            pr.facing = -1;
            st.message = 'Little Dick winds up — MACH 2!';
            syncHud(st);
          }
          if (pr.frame === 34) st.kickFlash = 14;
          if (pr.frame >= 40) {
            const rad = (38 * Math.PI) / 180;
            const speed = MACH2_SPEED_PX;
            box.x = pr.x - 14;
            box.y = GROUND_Y - 16;
            box.vx = -Math.cos(rad) * speed;
            box.vy = -Math.sin(rad) * speed;
            box.spin = -0.85;
            box.onGround = false;
            st.hitIds = new Set();
            ensureReturnPathProps(st, box.x);
            pr.stage = 'flight';
            pr.afterBoot = true;
            pr.shout = true;
            pr.shoutFrame = 0;
            st.phase = PHASE.FLIGHT;
            st.message = 'Little Dick: “Have that you dirty cheat!”';
            popupFnRef.current?.(littleDickMach2Grade(), 2800);
            syncHud(st);
          }
        }
      }

      // Keep the scream bubble alive a beat after the Mach 2 boot.
      if (st.punishRevenge?.shout && st.punishRevenge.stage === 'flight') {
        st.punishRevenge.shoutFrame = (st.punishRevenge.shoutFrame || 0) + 1;
        if (st.punishRevenge.shoutFrame > 90) st.punishRevenge.shout = false;
      }

      if (st.kickFlash > 0) st.kickFlash -= 1;

      // Camera pulls out as the toolbox speeds up (per sim tick @ 60 Hz)
      const zoomTarget = st.phase === PHASE.FLIGHT
        ? clamp(Math.sqrt(30 / Math.max(8, Math.hypot(st.box.vx, st.box.vy))), MIN_ZOOM, 1)
        : 1;
      st.zoom = (st.zoom || 1) + (zoomTarget - (st.zoom || 1)) * 0.06;
      } // end fixed-timestep while
      if (simSteps >= TOOLBOX_MAX_SIM_STEPS) simAccum = 0;

      // Interpolate between sim ticks so high-Hz monitors stay butter-smooth
      // while gameplay speed stays locked at 60 Hz.
      if (!st._renderPrev) st._renderPrev = captureToolboxRenderPose(st);
      const poseNow = captureToolboxRenderPose(st);
      const renderAlpha = simSteps >= TOOLBOX_MAX_SIM_STEPS
        ? 1
        : (simAccum / TOOLBOX_SIM_DT);
      const pose = lerpToolboxRenderPose(st._renderPrev, poseNow, renderAlpha);
      const zoom = pose.zoom || 1;
      const cam = pose.camX;
      const boxDrawX = pose.boxX;
      const boxDrawY = pose.boxY;
      const boxDrawRot = pose.boxRot;
      const mechDrawX = pose.mechX;
      // Sub-frame for decorative animation (wings, sock flap) on high-Hz displays
      const animFrame = st.frame + (Number.isFinite(renderAlpha) ? renderAlpha : 0);
      const weatherMode = st.v2 && st.windProfile?.mode === 'storm'
        ? 'storm'
        : (st.v2 && st.windProfile?.mode === 'steady' ? 'steady' : 'calm');
      drawSky(ctx, cam, weatherMode);
      drawGround(ctx, cam, weatherMode);

      const thump = Math.max(0, st.landThump || 0);
      if (thump > 0) {
        st.landThump = thump - 1;
        const mag = Math.min(7, thump * 0.55);
        ctx.save();
        ctx.translate(
          (Math.random() - 0.5) * mag * 2,
          mag * 0.85 + (Math.random() - 0.5) * mag,
        );
      }

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
        else if (it.type === 'oilSpill') drawOilSpill(ctx, sx, GROUND_Y, animFrame);
        else if (it.type === 'smoker') drawSmoker(ctx, sx, GROUND_Y, animFrame);
        else if (it.type === 'macan') drawMacan(ctx, sx, GROUND_Y, animFrame);
        else if (it.type === 'chelle') {
          const reacting = st.chelleReact && st.chelleReact.x === it.x;
          let poseChelle = 'reading';
          if (reacting) {
            poseChelle = st.chelleReact.frame < 18 ? 'startled' : 'launch';
          }
          drawChelle(ctx, sx, GROUND_Y, animFrame, poseChelle);
          if (reacting && st.chelleReact.frame < 22) {
            ctx.save();
            ctx.fillStyle = 'rgba(255,255,255,0.95)';
            ctx.strokeStyle = 'rgba(139,92,246,0.7)';
            ctx.lineWidth = 2;
            const bw = 132;
            const bh = 28;
            const bx = sx - bw / 2;
            const by = GROUND_Y - 118;
            ctx.beginPath();
            ctx.roundRect(bx, by, bw, bh, 8);
            ctx.fill();
            ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(sx - 6, by + bh);
            ctx.lineTo(sx, by + bh + 8);
            ctx.lineTo(sx + 6, by + bh);
            ctx.closePath();
            ctx.fill();
            ctx.fillStyle = '#5b21b6';
            ctx.font = 'bold 11px system-ui, sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText("I'm trying to read!", sx, by + bh / 2);
            ctx.restore();
          } else if (!reacting) {
            ctx.fillStyle = 'rgba(15, 23, 42, 0.75)';
            ctx.beginPath();
            ctx.roundRect(sx - 28, GROUND_Y - 92, 56, 16, 4);
            ctx.fill();
            ctx.fillStyle = '#ddd6fe';
            ctx.font = 'bold 10px system-ui, sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText('CHELLE', sx, GROUND_Y - 81);
          }
        }
        else if (it.type === 'littleDick') {
          const catching = st.dickCatch && st.dickCatch.x === it.x;
          const face = catching ? (st.dickCatch.facing || 1) : 1;
          const kicking = catching && st.dickCatch.frame >= DICK_QTE_FLASH && st.dickCatch.frame < DICK_QTE_BOOT + 8;
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
          drawBird(ctx, sx, it.y ?? (GROUND_Y - 80), animFrame, it.dir || 1);
        }
        else if (it.type === 'balloon') {
          drawHotAirBalloon(ctx, sx, it.y ?? (GROUND_Y - 120), animFrame, {
            scale: it.scale,
            color: it.color,
            colorDark: it.colorDark,
            bobPhase: it.bobPhase,
            hit: Boolean(it.hit),
          });
        }
        else if (it.type === 'flightCoin' && !it.collected) {
          drawFlightCoin(ctx, sx, animFrame);
        }
        else if (it.type === 'recordFlag' && it.marker) {
          drawRecordFlag(ctx, sx, it.marker);
        }
      }

      const running = st.phase === PHASE.RUNUP && st.runup < KICK_FRAME;
      const kicking = st.phase === PHASE.RUNUP && st.runup >= KICK_FRAME;
      if (mechDrawX - cam > visMinSx && mechDrawX - cam < visMaxSx) {
        drawMechanic(ctx, mechDrawX - cam, GROUND_Y, animFrame, { kicking, running });
      }

      // Punishment revenge: Little Dick walks in / grabs / boots Mach 2
      if (
        st.punishRevenge
        && (
          st.punishRevenge.stage === 'walk'
          || st.punishRevenge.stage === 'grab'
          || (st.punishRevenge.stage === 'flight' && st.punishRevenge.shout)
        )
      ) {
        const pr = st.punishRevenge;
        const sx = pr.x - cam;
        if (sx > visMinSx && sx < visMaxSx) {
          const kickingRevenge = pr.stage === 'grab' && pr.frame >= 30 && pr.frame < 42;
          const runningRevenge = pr.stage === 'walk';
          ctx.save();
          ctx.translate(sx, GROUND_Y);
          ctx.scale(pr.facing < 0 ? -1 : 1, 1);
          drawMechanic(ctx, 0, 0, st.frame, {
            kicking: kickingRevenge,
            running: runningRevenge,
          });
          ctx.restore();

          const shouting = Boolean(pr.shout) || (pr.stage === 'grab' && pr.frame >= 34);
          if (shouting) {
            ctx.save();
            ctx.fillStyle = 'rgba(255,255,255,0.96)';
            ctx.strokeStyle = 'rgba(234,88,12,0.75)';
            ctx.lineWidth = 2;
            const lines = ['Have that you', 'dirty cheat!'];
            const bw = 168;
            const bh = 40;
            const bx = sx - bw / 2;
            const by = GROUND_Y - 128;
            ctx.beginPath();
            ctx.roundRect(bx, by, bw, bh, 8);
            ctx.fill();
            ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(sx - 6, by + bh);
            ctx.lineTo(sx, by + bh + 8);
            ctx.lineTo(sx + 6, by + bh);
            ctx.closePath();
            ctx.fill();
            ctx.fillStyle = '#9a3412';
            ctx.font = 'bold 12px system-ui, sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(lines[0], sx, by + 13);
            ctx.fillText(lines[1], sx, by + 28);
            ctx.restore();
          } else {
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
      }

      const oiled = Boolean(st.box.oiled);
      if (st.phase === PHASE.READY || st.phase === PHASE.POWER || st.phase === PHASE.ANGLE) {
        drawToolbox(ctx, boxDrawX - cam, boxDrawY, -0.15, false, oiled);
      } else if (st.phase === PHASE.RUNUP && st.runup < LAUNCH_FRAME) {
        drawToolbox(ctx, BOX_REST_X - cam, GROUND_Y - 12, -0.2, false, oiled);
      } else {
        drawToolbox(ctx, boxDrawX - cam, boxDrawY, boxDrawRot, st.phase === PHASE.FLIGHT, oiled);
      }

      if (st.kickFlash > 0) {
        const flashX = st.punishRevenge && (st.punishRevenge.stage === 'grab' || st.punishRevenge.stage === 'flight')
          ? st.punishRevenge.x - 18 - cam
          : st.dickCatch
            ? st.dickCatch.x - 18 - cam
            : st.chelleReact
              ? st.chelleReact.x + 22 - cam
              : MECH_KICK_X + 18 - cam;
        ctx.fillStyle = `rgba(255,220,120,${st.kickFlash / 10})`;
        ctx.beginPath();
        ctx.arc(flashX, GROUND_Y - 16, 22, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.restore();

      if (thump > 0) {
        ctx.restore();
      }

      if (weatherMode === 'storm') {
        drawStormWeather(ctx, animFrame, st.windNow || st.windProfile);
      }

      if (st.v2 && (st.phase === PHASE.READY || st.phase === PHASE.POWER || st.phase === PHASE.ANGLE)) {
        drawWindSock(ctx, st.windNow || sampleWind(st.windProfile, animFrame), animFrame);
      }

      if (st.phase === PHASE.FLIGHT || st.phase === PHASE.LANDED) {
        drawTopStatsBar(ctx, st);
        if (st.v2) {
          drawWindSock(ctx, st.windNow || sampleWind(st.windProfile, animFrame), animFrame);
          drawComboHud(ctx, st.airCombo || 0, animFrame);
        }
        if (st.phase === PHASE.FLIGHT && dickQteEnabled(st) && st.dickCatch) {
          drawDickQtePrompt(ctx, st.dickCatch, animFrame);
        }
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
        const rage = Boolean(st.superRageArmed);
        let speed = launchSpeedForPower(st.power, tun);
        if (rage) speed *= SUPER_RAGE_BOOST;
        let gx = BOX_REST_X;
        let gy = GROUND_Y - 12;
        let vx = Math.cos(rad) * speed;
        let vy = -Math.sin(rad) * speed;
        const points = [{ x: gx - cam, y: gy }];
        for (let i = 0; i < 55; i += 1) {
          vy += tun.gravity;
          gx += vx;
          gy += vy;
          if (gy > GROUND_Y - 10) break;
          points.push({ x: gx - cam, y: gy });
        }
        // Soft under-glow so the arc reads against sky/ground
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.setLineDash([]);
        ctx.strokeStyle = rage ? 'rgba(239,68,68,0.35)' : 'rgba(255,255,255,0.55)';
        ctx.lineWidth = 7;
        ctx.beginPath();
        points.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
        ctx.stroke();
        // Bright dashed aim line
        ctx.strokeStyle = rage ? 'rgba(248,113,113,0.98)' : 'rgba(14,165,233,0.95)';
        ctx.lineWidth = 3.5;
        ctx.setLineDash([10, 7]);
        ctx.beginPath();
        points.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
        ctx.stroke();
        ctx.setLineDash([]);
        // Origin marker
        ctx.fillStyle = rage ? '#f87171' : '#38bdf8';
        ctx.beginPath();
        ctx.arc(points[0].x, points[0].y, 5, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = 'rgba(11,18,32,0.7)';
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }

      raf = requestAnimationFrame(step);
    };

    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, []);

  /** Dev cheat (sandbox only): P = toggle punishment (10% power + HA-HA on land). */
  const doCheatPunish = useCallback(() => {
    if (!devCheatsRef.current || competitiveRef.current) return;
    setCheatPunished((prev) => {
      const next = !prev;
      const st = stateRef.current;
      if (st) {
        st.punished = next || Boolean(punished);
        st.message = next
          ? 'CHEAT · punishment ON — 10% power, coaches on kick, HA-HA on land'
          : 'CHEAT · punishment OFF';
        setHud((h) => ({ ...h, message: st.message }));
      }
      return next;
    });
  }, [punished]);

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
      if (e.key === 'c' || e.key === 'C' || e.code === 'KeyC') {
        if (e.repeat) return;
        e.preventDefault();
        doCheatSpawn('chelle');
        return;
      }
      if (e.key === 'l' || e.key === 'L' || e.code === 'KeyL') {
        if (e.repeat) return;
        e.preventDefault();
        doCheatSpawn('littleDick');
        return;
      }
      if (e.key === 'p' || e.key === 'P' || e.code === 'KeyP') {
        if (e.repeat) return;
        e.preventDefault();
        doCheatPunish();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [doSpace, doCheatY, doCheatU, doCheatSpawn, doCheatPunish]);

  return (
    <div className="space-y-3">
      {devCheats && cheatPunished ? (
        <div className="rounded-xl border border-rose-500/40 bg-rose-500/10 px-4 py-2 text-xs text-rose-100">
          Punishment cheat ON (P to toggle) — 10% · coaches · HA-HA · Little Dick Mach 2
        </div>
      ) : null}
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
        <p className="text-slate-300">{hud.message}</p>
        <div className="flex flex-wrap gap-3 text-xs text-slate-400">
          <span>
            Attempt{' '}
            <span className="text-orange-200 font-semibold tabular-nums">
              {hud.attempt || 1}/{mode === 'allOrNothing' ? 1 : (TOOLBOX_V2_DEV && (devCheats || forceV2) ? MAX_ATTEMPTS_DEV_V2 : MAX_ATTEMPTS)}
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
          {TOOLBOX_V2_LIVE || (TOOLBOX_V2_DEV && (devCheats || forceV2)) ? (
            <>
              <span>
                Wind{' '}
                <span className="text-sky-200 font-semibold">{hud.windLabel || 'Calm'}</span>
              </span>
              {(hud.airCombo || 0) >= 2 ? (
                <span>
                  Combo{' '}
                  <span className="text-amber-200 font-semibold tabular-nums">×{hud.airCombo}</span>
                </span>
              ) : null}
            </>
          ) : null}
        </div>
      </div>

      <div
        ref={stageRef}
        className="relative overflow-hidden rounded-xl border border-[#1a2540] bg-[#0b1220] [&:fullscreen]:flex [&:fullscreen]:items-center [&:fullscreen]:justify-center [&:fullscreen]:rounded-none [&:fullscreen]:border-0 [&:fullscreen]:min-h-screen [&:fullscreen]:w-screen"
      >
        <RpgPopup popup={popup} />
        {haHaFlash ? (
          <div className="absolute inset-0 z-30 flex items-center justify-center pointer-events-none bg-black/35">
            <img
              src="/toolbox-kick/nelson-ha-ha.gif"
              alt="HA-HA!"
              className="max-h-[85%] max-w-[90%] object-contain drop-shadow-2xl"
            />
          </div>
        ) : null}
        {qteFlash ? (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              doSpace();
            }}
            className={`absolute inset-0 z-40 flex flex-col items-center justify-center gap-2 cursor-pointer border-0 ${
              qteFlash === 'go'
                ? 'bg-amber-500/25 animate-pulse'
                : 'bg-black/40'
            }`}
          >
            <span
              className={`text-4xl sm:text-5xl font-black tracking-tight drop-shadow-lg ${
                qteFlash === 'go' ? 'text-amber-200' : 'text-slate-200'
              }`}
            >
              {qteFlash === 'go' ? 'TAP NOW!' : 'Get ready…'}
            </span>
            <span className="text-sm font-semibold text-slate-100/90 px-4 text-center">
              {qteFlash === 'go'
                ? 'Space / tap here — stop the kickback!'
                : 'Little Dick has the toolbox…'}
            </span>
          </button>
        ) : null}
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
        {(rageAvailable || rageArmed) && !roundDone ? (
          <button
            type="button"
            onClick={armSuperRage}
            disabled={rageBusy || rageArmed || (competitive && !rageAvailable && !rageArmed)}
            className={`px-3 py-2 rounded-lg text-sm font-semibold border disabled:opacity-50 ${
              rageArmed
                ? 'border-rose-400/60 bg-rose-500/25 text-rose-100'
                : 'border-rose-500/45 text-rose-100 hover:bg-rose-500/15'
            }`}
          >
            {rageBusy
              ? 'Chugging…'
              : rageArmed
                ? 'Energy drink active · next kick'
                : 'Drink energy drink (+80%)'}
          </button>
        ) : null}
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
                Dev keys: Y perfect/smoker boost · U nudge · M Julies Car · C Chelle · L Little Dick
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
      {rageError ? <p className="text-xs text-rose-300">{rageError}</p> : null}
      {rageArmed ? (
        <p className="text-xs text-rose-200/90">
          Energy drink active — next kick gets +80% speed. One drink per week; everyone refills Monday.
        </p>
      ) : null}
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
            <p className="text-sm text-rose-200/90 leading-relaxed mt-2">
              Once a week he can chug an energy drink for Super Rage (+80% speed on one kick).
              Everyone&apos;s fridge refills on Monday.
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

function ModeSelect({ onPick, competitive = false, busy = false }) {
  return (
    <div className="rounded-xl border border-[#1a2540] p-5 space-y-4">
      <p className="text-sm text-slate-300">
        How do you want to boot Dick&apos;s toolbox?
        {competitive
          ? ' One competitive round per day — pick a mode, then your best distance hits today’s leaderboard. One energy drink per week (refills Monday).'
          : ''}
      </p>
      <div className="grid sm:grid-cols-2 gap-3">
        <button
          type="button"
          disabled={busy}
          onClick={() => onPick('allOrNothing')}
          className="text-left rounded-xl border border-rose-500/40 bg-rose-500/10 hover:bg-rose-500/15 px-4 py-4 space-y-1 transition-colors disabled:opacity-50"
        >
          <p className="text-base font-semibold text-rose-100">All or nothing</p>
          <p className="text-xs text-slate-400 leading-relaxed">
            One chance only. Slower power and angle bars — be careful.
          </p>
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => onPick('careful')}
          className="text-left rounded-xl border border-sky-500/40 bg-sky-500/10 hover:bg-sky-500/15 px-4 py-4 space-y-1 transition-colors disabled:opacity-50"
        >
          <p className="text-base font-semibold text-sky-100">3 goes</p>
          <p className="text-xs text-slate-400 leading-relaxed">
            Three attempts. Normal-speed bars. Best of three counts.
          </p>
        </button>
      </div>
      {busy ? <p className="text-xs text-slate-500">Locking today’s round…</p> : null}
    </div>
  );
}

export function ToolboxKickSandbox() {
  const [introOpen, setIntroOpen] = useState(() => !hasSeenIntro());
  const [mode, setMode] = useState(null);
  /** Preview what staff see in Fun daily (not practice). */
  const [drinkPreview, setDrinkPreview] = useState('ready'); // ready | empty
  const todayKey = getLondonDayKey();
  const previewRage = drinkPreview === 'ready'
    ? { available: true, refillDayKey: '2026-09-14', boostPct: 80 }
    : { available: false, usedThisWeek: true, refillDayKey: '2026-09-14', boostPct: 80 };

  const sandboxMarkers = useCallback(() => {
    const pr = Math.max(0, Math.floor(Number(localStorage.getItem('toolbox-kick-best') || 0)));
    const today = Math.max(pr, Math.floor(pr * 1.08) || 2500);
    const allTime = Math.max(today + 1800, 12000);
    return buildRecordMarkers({
      personalBestM: pr || 1800,
      personalBestLabel: 'Your PR',
      todayBestM: today || 4200,
      todayBestName: 'Today’s board leader',
      allTimeBestM: allTime,
      allTimeBestName: 'Wall of fame #1',
    });
  }, []);

  const claimFlightCoin = useCallback(async ({ slot, amount, dayKey }) => {
    try {
      const response = await fetch('/api/claimToolboxKickFlightCoin', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          slot,
          amount: amount || FLIGHT_COIN_AMOUNT,
          dayKey: dayKey || todayKey,
        }),
      });
      await readJsonResponse(response);
    } catch {
      /* sandbox still shows the pickup FX even if wallet call fails */
    }
  }, [todayKey]);

  return (
    <div className="space-y-4">
      <IntroBubble open={introOpen} onClose={() => setIntroOpen(false)} />

      {TOOLBOX_V2_DEV ? (
        <div className="rounded-xl border border-amber-500/40 bg-gradient-to-br from-amber-500/15 via-[#0b1220] to-orange-500/10 px-4 py-4 space-y-3">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h3 className="text-lg font-semibold text-amber-100 tracking-tight">
              Dick&apos;s Toolbox 2.0
            </h3>
            <span className="text-[11px] font-semibold uppercase tracking-wider text-amber-200/80">
              Dev preview
            </span>
          </div>
          <p className="text-xs text-slate-300 leading-relaxed">
            New features below are live in Fun Admin sandbox and on daily Fun.
          </p>
          <ul className="space-y-2.5">
            {TOOLBOX_V2_FEATURE_LIST.map((feat) => (
              <li key={feat.id} className="text-sm">
                <p className="font-semibold text-amber-50">{feat.title}</p>
                <p className="text-xs text-slate-400 leading-relaxed">{feat.blurb}</p>
              </li>
            ))}
          </ul>
          <p className="text-[11px] text-slate-500">
            Tip: pick <span className="text-slate-300">3 goes</span> — run 1 calm · 2 wind · 3 storm ·
            {' '}<span className="text-amber-200/90">run 4 QTE practice</span> (Little Dicks spawned close — land & tap).
            Softkey L still works any time.
          </p>
        </div>
      ) : null}

      <div className="rounded-xl border border-sky-500/35 bg-sky-500/10 px-4 py-3 space-y-2">
        <p className="text-sm font-semibold text-sky-100">Daily Fun preview</p>
        <p className="text-xs text-slate-300 leading-relaxed">
          Layout below matches what players see on the Fun tab (competitive copy, energy-drink banner,
          drink button). Dev cheats still work. Toggle ready/empty to preview both states.
        </p>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setDrinkPreview('ready')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold border ${
              drinkPreview === 'ready'
                ? 'border-rose-400/60 bg-rose-500/25 text-rose-100'
                : 'border-[#1a2540] text-slate-300 hover:bg-white/[0.04]'
            }`}
          >
            Preview · drink ready
          </button>
          <button
            type="button"
            onClick={() => setDrinkPreview('empty')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold border ${
              drinkPreview === 'empty'
                ? 'border-slate-400/50 bg-slate-500/25 text-slate-100'
                : 'border-[#1a2540] text-slate-300 hover:bg-white/[0.04]'
            }`}
          >
            Preview · drink empty
          </button>
          {!introOpen ? (
            <button
              type="button"
              onClick={() => setIntroOpen(true)}
              className="px-3 py-1.5 rounded-lg text-xs text-orange-200/90 border border-orange-500/30 hover:bg-orange-500/10"
            >
              Show intro again
            </button>
          ) : null}
        </div>
        <p className="text-[11px] text-slate-500">
          Dev keys: Y · U · M · C · L · P (punish) · Fullscreen on canvas. Cheats only in this sandbox.
        </p>
      </div>

      <p className="text-sm text-slate-400">
        One competitive round per London day. Furthest distance wins. Leaderboard resets each weekday.
      </p>

      <EnergyDrinkBanner practice={false} superRage={previewRage} />

      {!mode ? (
        <ModeSelect competitive onPick={setMode} />
      ) : (
        <ToolboxKickGame
          key={`${mode}-${drinkPreview}-v2`}
          mode={mode}
          competitive={false}
          devCheats
          forceV2
          dayKey={todayKey}
          recordMarkers={sandboxMarkers()}
          onFlightCoin={claimFlightCoin}
          superRageAvailable={drinkPreview === 'ready'}
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
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState('');
  const [game, setGame] = useState(null);
  const [leaderboard, setLeaderboard] = useState([]);
  const [allTimeRecord, setAllTimeRecord] = useState(null);
  const [allTimeTop10, setAllTimeTop10] = useState([]);
  const [superRage, setSuperRage] = useState(null);
  const [mode, setMode] = useState(null);
  const [introOpen, setIntroOpen] = useState(() => !hasSeenIntro());
  const practice = dayKey !== todayKey;
  const roundLockedRef = useRef(false);

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
      setAllTimeRecord(null);
      setAllTimeTop10([]);
      setSuperRage(null);
      setMode(null);
      roundLockedRef.current = false;
      setError(payload.message || 'Little Dicks Toolbox isn’t in today’s Fun rotation.');
      return;
    }
    setError('');
    setGame(payload.game || null);
    setLeaderboard(payload.leaderboard || []);
    setAllTimeRecord(payload.allTimeRecord || null);
    setAllTimeTop10(Array.isArray(payload.allTimeTop10) ? payload.allTimeTop10 : []);
    setSuperRage(payload.superRage || null);
    if (payload.game?.status === 'won' && payload.game?.roundComplete !== false) {
      setMode(payload.game.mode || 'careful');
      roundLockedRef.current = false;
    } else if (
      payload.game?.status === 'in_progress'
      || (payload.game?.status === 'won' && payload.game?.roundComplete === false)
    ) {
      // Mid-round reload: resume the same mode (extra runs are logged server-side; no auto-nerf).
      setMode(payload.game.mode || 'careful');
      roundLockedRef.current = !practice;
    } else {
      setMode(null);
      roundLockedRef.current = false;
    }
  }, [todayKey, practice]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        await load(dayKey);
        if (cancelled || practice) return;

        const pending = readPendingToolboxScore();
        if (!pending || pending.dayKey !== dayKey) return;

        try {
          setSubmitting(true);
          const response = await fetch('/api/submitToolboxKickResult', {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              mode: pending.mode || 'careful',
              distanceM: pending.distanceM,
              attempts: Array.isArray(pending.attempts) ? pending.attempts : [pending.distanceM],
              energyDrinkUsed: Boolean(pending.energyDrinkUsed),
              finalize: Boolean(pending.finalize),
              dayKey: dayKey !== todayKey ? dayKey : undefined,
            }),
          });
          const payload = (await readJsonResponse(response)) || {};
          if (cancelled) return;
          if (response.ok || payload.alreadySubmitted) {
            clearPendingToolboxScore(dayKey);
            if (payload.game) setGame(payload.game);
            if (Array.isArray(payload.leaderboard)) setLeaderboard(payload.leaderboard);
            if (payload.allTimeRecord !== undefined) setAllTimeRecord(payload.allTimeRecord || null);
            if (payload.allTimeTop10 !== undefined) {
              setAllTimeTop10(Array.isArray(payload.allTimeTop10) ? payload.allTimeTop10 : []);
            }
            if (payload.superRage) setSuperRage(payload.superRage);
            if (payload.game?.status === 'won' && payload.game?.roundComplete !== false) {
              setMode(payload.game.mode || pending.mode || 'careful');
              roundLockedRef.current = false;
            }
            setError('');
          } else if (!payload.needStart) {
            setError(payload.error || 'Could not recover your saved score. Keep this tab open and try again.');
          }
        } catch (flushErr) {
          if (!cancelled) {
            setError(flushErr.message || 'Could not recover your saved score.');
          }
        } finally {
          if (!cancelled) setSubmitting(false);
        }
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
  }, [dayKey, load, practice, todayKey]);

  const startRound = useCallback(async (pickedMode) => {
    if (practice) {
      setMode(pickedMode);
      return;
    }
    try {
      setStarting(true);
      setError('');
      const response = await fetch('/api/startToolboxKickRound', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: pickedMode,
          dayKey: dayKey !== todayKey ? dayKey : undefined,
        }),
      });
      const payload = (await readJsonResponse(response)) || {};
      if (!response.ok) throw new Error(payload.error || 'Failed to lock today’s round.');
      if (Array.isArray(payload.leaderboard)) setLeaderboard(payload.leaderboard);
      if (payload.allTimeRecord !== undefined) setAllTimeRecord(payload.allTimeRecord || null);
      if (payload.allTimeTop10 !== undefined) {
        setAllTimeTop10(Array.isArray(payload.allTimeTop10) ? payload.allTimeTop10 : []);
      }
      if (payload.game) setGame(payload.game);

      if (payload.alreadySubmitted || (payload.game?.status === 'won' && payload.game?.roundComplete !== false)) {
        roundLockedRef.current = false;
        setMode(payload.game?.mode || pickedMode);
        return;
      }

      roundLockedRef.current = true;
      setMode(payload.game?.mode || pickedMode);

      // If a kick finished before the server round was open, flush the stashed score now.
      const pending = readPendingToolboxScore();
      if (pending && pending.dayKey === dayKey) {
        try {
          setSubmitting(true);
          const submitResponse = await fetch('/api/submitToolboxKickResult', {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              mode: pending.mode || pickedMode,
              distanceM: pending.distanceM,
              attempts: Array.isArray(pending.attempts) ? pending.attempts : [pending.distanceM],
              energyDrinkUsed: Boolean(pending.energyDrinkUsed),
              finalize: Boolean(pending.finalize),
              dayKey: dayKey !== todayKey ? dayKey : undefined,
            }),
          });
          const submitPayload = (await readJsonResponse(submitResponse)) || {};
          if (submitResponse.ok || submitPayload.alreadySubmitted) {
            clearPendingToolboxScore(dayKey);
            if (submitPayload.game) setGame(submitPayload.game);
            if (Array.isArray(submitPayload.leaderboard)) setLeaderboard(submitPayload.leaderboard);
            if (submitPayload.allTimeRecord !== undefined) setAllTimeRecord(submitPayload.allTimeRecord || null);
            if (submitPayload.allTimeTop10 !== undefined) {
              setAllTimeTop10(Array.isArray(submitPayload.allTimeTop10) ? submitPayload.allTimeTop10 : []);
            }
            if (submitPayload.superRage) setSuperRage(submitPayload.superRage);
            if (submitPayload.game?.status === 'won' && submitPayload.game?.roundComplete !== false) {
              roundLockedRef.current = false;
            }
          }
        } catch {
          /* pending kept for next load */
        } finally {
          setSubmitting(false);
        }
      }
    } catch (err) {
      setError(err.message || 'Could not start your round.');
      setMode(null);
      roundLockedRef.current = false;
    } finally {
      setStarting(false);
    }
  }, [practice, dayKey, todayKey]);

  const submitRound = useCallback(async ({
    distanceM,
    attempts,
    energyDrinkUsed = false,
    finalize = true,
  }) => {
    if (practice) return;
    const submitMode = mode || 'careful';
    writePendingToolboxScore({
      dayKey,
      mode: submitMode,
      distanceM,
      attempts: Array.isArray(attempts) ? attempts : [distanceM],
      energyDrinkUsed: Boolean(energyDrinkUsed),
      finalize: Boolean(finalize),
    });
    try {
      setSubmitting(true);
      setError('');
      const response = await fetch('/api/submitToolboxKickResult', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: submitMode,
          distanceM,
          attempts,
          energyDrinkUsed: Boolean(energyDrinkUsed),
          finalize: Boolean(finalize),
          dayKey: dayKey !== todayKey ? dayKey : undefined,
        }),
        keepalive: true,
      });
      const payload = (await readJsonResponse(response)) || {};
      if (!response.ok) throw new Error(payload.error || 'Failed to submit score.');
      clearPendingToolboxScore(dayKey);
      setGame(payload.game || null);
      if (finalize || payload.game?.roundComplete !== false) {
        roundLockedRef.current = false;
      }
      if (Array.isArray(payload.leaderboard)) setLeaderboard(payload.leaderboard);
      if (payload.allTimeRecord !== undefined) setAllTimeRecord(payload.allTimeRecord || null);
      if (payload.allTimeTop10 !== undefined) {
        setAllTimeTop10(Array.isArray(payload.allTimeTop10) ? payload.allTimeTop10 : []);
      }
      if (payload.superRage) setSuperRage(payload.superRage);
      if (finalize && Array.isArray(payload.achievements) && onAchievements) {
        onAchievements(payload.achievements);
      }
    } catch (err) {
      // Keep the round open and leave the pending stash so reload can recover the score.
      setError(`${err.message || 'Could not submit your score.'} Your kick is saved on this device — leave the tab open or refresh to retry.`);
    } finally {
      setSubmitting(false);
    }
  }, [practice, mode, dayKey, todayKey, onAchievements]);

  const activateSuperRage = useCallback(async () => {
    if (practice) return;
    const response = await fetch('/api/activateToolboxSuperRage', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    const payload = (await readJsonResponse(response)) || {};
    if (!response.ok) throw new Error(payload.error || 'Could not activate Super Rage.');
    if (payload.superRage) setSuperRage(payload.superRage);
  }, [practice]);

  const claimFlightCoin = useCallback(async ({ slot, amount, dayKey: coinDay }) => {
    if (practice) return;
    try {
      await fetch('/api/claimToolboxKickFlightCoin', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          slot,
          amount: amount || FLIGHT_COIN_AMOUNT,
          dayKey: coinDay || dayKey,
        }),
      });
    } catch {
      /* pickup FX still shows; wallet claim is best-effort */
    }
  }, [practice, dayKey]);

  const v2Markers = (() => {
    const pr = Math.max(
      0,
      Math.floor(Number(localStorage.getItem('toolbox-kick-best') || 0)),
      Math.floor(Number(game?.distanceM) || 0),
    );
    const todayBest = leaderboard[0];
    return buildRecordMarkers({
      personalBestM: pr,
      personalBestLabel: 'Your PR',
      todayBestM: todayBest?.distanceM || 0,
      todayBestName: todayBest?.fullName || '',
      allTimeBestM: allTimeRecord?.distanceM || 0,
      allTimeBestName: allTimeRecord?.fullName || '',
    });
  })();

  if (loading) return <p className="text-sm text-slate-400">Loading Little Dicks Toolbox…</p>;
  if (error && !game) return <p className="text-sm text-rose-300">{error}</p>;

  const alreadyDone = game?.status === 'won' && game?.roundComplete !== false;
  const forfeited = Boolean(game?.forfeited);
  const punished = Boolean(game?.punished);
  const investigate = Boolean(game?.investigate) || (Number(game?.runCount) || 1) > 3;
  const runCount = Math.max(1, Math.floor(Number(game?.runCount) || 1));
  const speedNerfed = punished;
  const modeLabel = game?.mode === 'allOrNothing' || mode === 'allOrNothing' ? 'All or nothing' : '3 goes';
  const rageReady = practice || Boolean(superRage?.available);

  return (
    <div className="space-y-3">
      <FunDayPicker
        dayKey={dayKey}
        todayKey={todayKey}
        onChange={setDayKey}
        allowFuture={Boolean(isAdmin)}
        gameKey="toolboxkick"
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

      <EnergyDrinkBanner practice={practice} superRage={superRage} alreadyDone={alreadyDone} />

      {error ? <p className="text-sm text-rose-300">{error}</p> : null}

      <IntroBubble open={introOpen} onClose={() => setIntroOpen(false)} />

      {!alreadyDone && punished ? (
        <div className="rounded-xl border border-rose-500/40 bg-rose-500/10 px-4 py-3 space-y-1">
          <p className="text-sm text-rose-100 font-medium">Punishment active</p>
          <p className="text-xs text-slate-400">
            10% toolbox power. Coaches on kick. HA-HA on landing, then Little Dick boots it Mach 2
            backwards. Each attempt is logged to today’s board as you go.
          </p>
        </div>
      ) : null}

      {!alreadyDone && runCount > 1 && !punished ? (
        <div className="rounded-xl border border-slate-500/40 bg-slate-500/10 px-4 py-3 space-y-1">
          <p className="text-sm text-slate-200 font-medium">
            Run {runCount} today
          </p>
          <p className="text-xs text-slate-400">
            Reload/restart detected earlier. Your best distance still counts — no speed penalty.
          </p>
        </div>
      ) : null}

      {alreadyDone && forfeited ? (
        <div className="rounded-xl border border-rose-500/40 bg-rose-500/10 px-4 py-3 space-y-1">
          <p className="text-sm text-rose-100 font-medium">
            Forfeit · quit/reload · 0 m
          </p>
          <p className="text-xs text-slate-400">
            Today’s go was forfeited.
          </p>
        </div>
      ) : null}

      {alreadyDone && !forfeited ? (
        <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 space-y-1">
          <p className="text-sm text-emerald-100 font-medium">
            Today’s kick logged · {formatDistance(game.distanceM)}
            {punished ? ' · punished (10% speed)' : ''}
            {investigate ? ' · investigate (4+ runs)' : ''}
            {submitting ? ' · Saving…' : ''}
          </p>
          <p className="text-xs text-slate-400">
            Mode: {modeLabel}
            {game.energyDrinkUsed ? ' · energy drink' : ''}
            {runCount > 1 ? ` · ${runCount} runs` : ''}
            {Array.isArray(game.attempts) && game.attempts.length > 1
              ? ` · attempts ${game.attempts.map((n) => formatDistance(n)).join(', ')}`
              : ''}
          </p>
        </div>
      ) : null}

      {!alreadyDone && !mode ? (
        <ModeSelect competitive={!practice} onPick={startRound} busy={starting} />
      ) : null}

      {!alreadyDone && mode ? (
        <ToolboxKickGame
          key={`${dayKey}-${mode}-${speedNerfed ? 'nerf' : 'clean'}-${punished ? 'pun' : 'free'}-${runCount}`}
          mode={mode}
          competitive={!practice}
          onRoundComplete={practice ? null : submitRound}
          superRageAvailable={rageReady}
          onActivateSuperRage={practice ? null : activateSuperRage}
          caughtCheating={false}
          punished={punished}
          forceV2
          dayKey={dayKey}
          recordMarkers={v2Markers}
          onFlightCoin={practice ? null : claimFlightCoin}
        />
      ) : null}

      {!practice && allTimeRecord ? (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-amber-200/90">
            All-time record
          </p>
          <p className="text-sm text-amber-50 mt-1">
            <span className="font-semibold">{allTimeRecord.resultLabel || formatDistance(allTimeRecord.distanceM)}</span>
            {' · '}
            {allTimeRecord.fullName}
            {allTimeRecord.uid === currentUserUid ? ' (you)' : ''}
            {allTimeRecord.dayKey ? ` · ${allTimeRecord.dayKey}` : ''}
          </p>
        </div>
      ) : null}

      {!practice && alreadyDone && allTimeTop10.length ? (
        <div className="rounded-xl border border-[#1a2540] overflow-hidden">
          <div className="px-4 py-3 border-b border-[#1a2540]">
            <h4 className="text-sm font-semibold text-amber-200">
              Wall of fame · top 10 all-time kicks
            </h4>
          </div>
          <ol className="divide-y divide-[#1a2540] px-4 py-2">
            {allTimeTop10.map((row) => (
              <FunLeaderboardRow
                key={`${row.uid}-${row.dayKey}-${row.rank}`}
                row={{
                  ...row,
                  rank: row.rank,
                  medal: row.rank === 1 ? 'gold' : row.rank === 2 ? 'silver' : row.rank === 3 ? 'bronze' : null,
                }}
                currentUserUid={currentUserUid}
                resultText={row.resultLabel || formatDistance(row.distanceM)}
                metaText={[
                  row.dayKey || null,
                  row.mode === 'allOrNothing' ? 'All or nothing' : '3 goes',
                  row.energyDrinkUsed ? '⚡ energy drink' : null,
                ].filter(Boolean).join(' · ')}
              />
            ))}
          </ol>
        </div>
      ) : null}

      {!practice && leaderboard.length ? (
        <div className="rounded-xl border border-[#1a2540] overflow-hidden">
          <div className="px-4 py-3 border-b border-[#1a2540]">
            <h4 className="text-sm font-semibold text-indigo-200">
              Today’s leaderboard · furthest distance · {leaderboard.length} player{leaderboard.length === 1 ? '' : 's'}
            </h4>
          </div>
          <ol className="divide-y divide-[#1a2540] px-4 py-2 space-y-0">
            {leaderboard.map((row) => (
              <FunLeaderboardRow
                key={row.uid || row.rank}
                row={row}
                currentUserUid={currentUserUid}
                resultText={row.resultLabel || formatDistance(row.distanceM)}
                metaText={[
                  row.forfeited ? 'quit/reload' : null,
                  row.investigate ? `investigate · ${row.runCount || 0} runs` : null,
                  row.punished ? 'punished' : null,
                  row.mode === 'allOrNothing' ? 'All or nothing' : '3 goes',
                  row.energyDrinkUsed ? '⚡ energy drink' : null,
                ].filter(Boolean).join(' · ')}
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
