/** Shared Plain Sight world helpers (crowd from seed). */

export const WORLD_W = 1000;
export const WORLD_H = 420;
export const FINISH_X = 72;
export const START_X = 900;
export const HIT_RADIUS = 44;
export const WALK_SPEED = 52;
export const SPRINT_SPEED = 96;
export const NPC_COUNT = 16;
export const COUNTDOWN_MS = 3500;

export const PALETTES = [
  { body: '#3b82f6', pants: '#1e3a5f' },
  { body: '#ef4444', pants: '#7f1d1d' },
  { body: '#22c55e', pants: '#14532d' },
  { body: '#a855f7', pants: '#4c1d95' },
  { body: '#f59e0b', pants: '#78350f' },
  { body: '#64748b', pants: '#1e293b' },
  { body: '#ec4899', pants: '#831843' },
  { body: '#14b8a6', pants: '#134e4a' },
  { body: '#eab308', pants: '#713f12' },
  { body: '#f97316', pants: '#7c2d12' },
  { body: '#06b6d4', pants: '#164e63' },
  { body: '#84cc16', pants: '#3f6212' },
];

function mulberry32(a) {
  let t = (a >>> 0) || 1;
  return function rand() {
    t += 0x6d2b79f5;
    let x = Math.imul(t ^ (t >>> 15), t | 1);
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

/** Same outfit pool as the crowd — never a fixed “suspect colour”. */
export function pickPalette(seed, salt = 0) {
  const rand = mulberry32(((Number(seed) || 1) ^ (salt * 0x9e3779b9)) >>> 0);
  return PALETTES[Math.floor(rand() * PALETTES.length)];
}

export function pickScale(seed, salt = 1) {
  const rand = mulberry32(((Number(seed) || 1) ^ (salt * 0x85ebca6b)) >>> 0);
  return 0.9 + rand() * 0.28;
}

function scheduleForNpc(rand) {
  const segments = [];
  let total = 0;
  const horizon = 180000;
  let lastWasMoving = false;

  // Stagger initial pause so the crowd doesn't all start walking at once
  const initialIdle = 400 + rand() * 2400;
  segments.push({ kind: 'idle', duration: initialIdle, speed: 0 });
  total += initialIdle;

  while (total < horizon) {
    const roll = rand();
    let kind;
    let duration;
    let speed = 0;

    if (lastWasMoving) {
      // After moving, NPCs almost always stop (88% chance)
      if (roll < 0.88) {
        kind = 'idle';
        duration = 1000 + rand() * 2400; // 1.0s to 3.4s pause
        lastWasMoving = false;
      } else {
        // Rarely continue walking in a second burst (12% chance)
        kind = 'walk';
        duration = 600 + rand() * 1200;
        speed = WALK_SPEED * (0.75 + rand() * 0.35);
        lastWasMoving = true;
      }
    } else {
      // Currently idle: decide whether to extend idle or take a walk burst (AI never sprints)
      if (roll < 0.35) {
        // Extended pause (35% chance)
        kind = 'idle';
        duration = 1000 + rand() * 2400; // 1.0s to 3.4s pause
        lastWasMoving = false;
      } else {
        // Walk in a short burst (65% chance) - AI only walks, never sprints
        kind = 'walk';
        duration = 700 + rand() * 1600; // 0.7s to 2.3s
        speed = WALK_SPEED * (0.75 + rand() * 0.4);
        lastWasMoving = true;
      }
    }

    segments.push({ kind, duration, speed });
    total += duration;
  }
  return segments;
}

function poseFromSchedule(segments, elapsedMs, startX) {
  const t = Math.max(0, Math.min(Number(elapsedMs) || 0, 180000));
  let remaining = t;
  let dist = 0;
  let moving = false;
  let sprinting = false;
  for (const seg of segments) {
    const use = Math.min(remaining, seg.duration);
    if (seg.kind === 'walk' || seg.kind === 'sprint') {
      dist += (seg.speed * use) / 1000;
      if (use > 0 && remaining <= seg.duration) {
        moving = true;
        sprinting = seg.kind === 'sprint';
      }
    }
    remaining -= use;
    if (remaining <= 0) break;
  }
  return { x: startX - dist, moving, sprinting };
}

/** Cache static NPC defs so we don’t rebuild schedules every frame. */
const blueprintCache = new Map();

function getBlueprint(seed) {
  const key = String(Number(seed) || 1);
  if (blueprintCache.has(key)) return blueprintCache.get(key);
  const rand = mulberry32(Number(seed) || 1);
  const list = [];
  for (let i = 0; i < NPC_COUNT; i += 1) {
    list.push({
      id: `npc-${i}`,
      y: 64 + rand() * (WORLD_H - 128),
      startX: START_X - 40 + rand() * 220,
      segments: scheduleForNpc(rand),
      palette: PALETTES[Math.floor(rand() * PALETTES.length)],
      scale: 0.9 + rand() * 0.28,
      phase: i * 0.85,
    });
  }
  blueprintCache.set(key, list);
  if (blueprintCache.size > 20) {
    const first = blueprintCache.keys().next().value;
    blueprintCache.delete(first);
  }
  return list;
}

/** Deterministic crowd at a smooth elapsed time (ms). */
export function buildCrowd(seed, elapsedMs = 0) {
  const capped = Math.max(0, Math.min(Number(elapsedMs) || 0, 180000));
  return getBlueprint(seed).map((npc) => {
    const pose = poseFromSchedule(npc.segments, capped, npc.startX);
    return {
      id: npc.id,
      x: pose.x,
      y: npc.y,
      moving: pose.moving,
      sprinting: false, // AI never sprints
      palette: npc.palette,
      scale: npc.scale,
      phase: npc.phase,
    };
  });
}

export function drawPerson(ctx, {
  x, y, sprinting, moving = true, palette, scale = 1, highlight = false, bob = 0,
}) {
  const s = 14 * scale;
  const legSwing = moving ? Math.sin(bob * 2.2 + (sprinting ? 6 : 3.2)) * (sprinting ? 4.5 : 2.8) : 0;
  ctx.save();
  ctx.translate(x, y + (moving ? bob : 0));
  if (highlight) {
    ctx.beginPath();
    ctx.arc(0, -s * 1.1, s * 1.35, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(250,204,21,0.4)';
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.beginPath();
  ctx.save();
  ctx.translate(0, s * 0.95);
  ctx.scale(1, 0.32);
  ctx.arc(0, 0, s * 0.7, 0, Math.PI * 2);
  ctx.restore();
  ctx.fill();
  ctx.strokeStyle = palette?.pants || '#1e293b';
  ctx.lineWidth = 3.2;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(-2, s * 0.15);
  ctx.lineTo(-4 - legSwing, s * 0.9);
  ctx.moveTo(2, s * 0.15);
  ctx.lineTo(4 + legSwing, s * 0.9);
  ctx.stroke();
  ctx.fillStyle = palette?.body || '#64748b';
  ctx.fillRect(-s * 0.45, -s * 0.55, s * 0.9, s * 0.85);
  ctx.fillStyle = '#f0c9a6';
  ctx.beginPath();
  ctx.arc(0, -s * 0.85, s * 0.32, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#d4a574';
  ctx.beginPath();
  ctx.arc(-s * 0.28, -s * 0.82, s * 0.1, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

let audioCtx = null;

function getAudioContext() {
  if (typeof window === 'undefined') return null;
  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  if (!AudioCtx) return null;
  if (!audioCtx) {
    audioCtx = new AudioCtx();
  }
  if (audioCtx.state === 'suspended') {
    audioCtx.resume().catch(() => {});
  }
  return audioCtx;
}

/**
 * Procedural rifle gunshot sound effect via Web Audio API.
 * Combines a high-frequency bandpassed noise crack with pitch-plunging sub/triangle oscillators.
 */
export function playGunshotSound() {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;
    const now = ctx.currentTime;

    const master = ctx.createGain();
    master.gain.setValueAtTime(0.95, now);
    master.connect(ctx.destination);

    // 1. Initial sharp crack / whip (bandpassed white noise burst)
    const bufferSize = Math.floor(ctx.sampleRate * 0.35);
    const noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const output = noiseBuffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i += 1) {
      output[i] = Math.random() * 2 - 1;
    }

    const noiseSource = ctx.createBufferSource();
    noiseSource.buffer = noiseBuffer;

    const noiseFilter = ctx.createBiquadFilter();
    noiseFilter.type = 'bandpass';
    noiseFilter.frequency.setValueAtTime(2600, now);
    noiseFilter.frequency.exponentialRampToValueAtTime(750, now + 0.12);
    noiseFilter.Q.setValueAtTime(1.6, now);

    const noiseGain = ctx.createGain();
    noiseGain.gain.setValueAtTime(1.0, now);
    noiseGain.gain.exponentialRampToValueAtTime(0.015, now + 0.07);
    noiseGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.32);

    noiseSource.connect(noiseFilter);
    noiseFilter.connect(noiseGain);
    noiseGain.connect(master);

    noiseSource.start(now);
    noiseSource.stop(now + 0.35);

    // 2. Muzzle blast / body thump (pitch plunge)
    const osc = ctx.createOscillator();
    const oscGain = ctx.createGain();

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(280, now);
    osc.frequency.exponentialRampToValueAtTime(45, now + 0.08);

    oscGain.gain.setValueAtTime(0.95, now);
    oscGain.gain.exponentialRampToValueAtTime(0.01, now + 0.1);
    oscGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.2);

    osc.connect(oscGain);
    oscGain.connect(master);

    osc.start(now);
    osc.stop(now + 0.22);

    // 3. Low thump body
    const subOsc = ctx.createOscillator();
    const subGain = ctx.createGain();
    subOsc.type = 'sine';
    subOsc.frequency.setValueAtTime(140, now);
    subOsc.frequency.exponentialRampToValueAtTime(32, now + 0.07);

    subGain.gain.setValueAtTime(0.85, now);
    subGain.gain.exponentialRampToValueAtTime(0.001, now + 0.14);

    subOsc.connect(subGain);
    subGain.connect(master);

    subOsc.start(now);
    subOsc.stop(now + 0.15);
  } catch {
    // Graceful fallback if audio is not supported or blocked
  }
}

