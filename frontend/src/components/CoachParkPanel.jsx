import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import FunDayPicker, { getLondonDayKey, shiftDayKey } from './FunDayPicker';
import FunLeaderboardRow from './FunLeaderboardRow';
import CoachParkTutorialModal, { hasSeenCoachParkTutorial } from './CoachParkTutorialModal';
import { snoozeDeployRefresh } from '../utils/deployRefresh';
import {
  BUMP_PENALTY_MS,
  COACH_LENGTH,
  COACH_WHEELBASE,
  COACH_WIDTH,
  MAX_BUMPS,
  MAX_DAILY_TRIES,
  MAX_WHEEL_STEER_RAD,
  PARK_HOLD_SEC,
  REAR_TO_CENTER,
  STEER_WHEEL_MAX_DEG,
  WORLD_H,
  WORLD_W,
  clamp,
  createInitialSimState,
  formatCoachParkTime,
  generateCoachParkMap,
  getCoachCorners,
  stepCoachSimulation,
} from '../lib/coachPark';

async function readJsonResponse(res) {
  const contentType = res.headers.get('content-type') || '';
  if (!contentType.includes('application/json')) return null;
  try {
    return await res.json();
  } catch {
    return null;
  }
}

function formatResultMs(ms) {
  return formatCoachParkTime(ms);
}

/** Synthesized WebAudio cues — no asset pack needed. */
function playCoachAudioCue(kind) {
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    if (!playCoachAudioCue.ctx) playCoachAudioCue.ctx = new Ctx();
    const ctx = playCoachAudioCue.ctx;
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    const now = ctx.currentTime;

    if (kind === 'bump') {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(118, now);
      osc.frequency.exponentialRampToValueAtTime(36, now + 0.16);
      gain.gain.setValueAtTime(0.001, now);
      gain.gain.exponentialRampToValueAtTime(0.14, now + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.22);
    } else if (kind === 'notch') {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(520, now);
      osc.frequency.exponentialRampToValueAtTime(240, now + 0.035);
      gain.gain.setValueAtTime(0.001, now);
      gain.gain.exponentialRampToValueAtTime(0.06, now + 0.008);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.045);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.05);
    } else if (kind === 'revBeep') {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(1140, now);
      gain.gain.setValueAtTime(0.001, now);
      gain.gain.exponentialRampToValueAtTime(0.032, now + 0.015);
      gain.gain.setValueAtTime(0.032, now + 0.13);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.2);
    } else if (kind === 'park') {
      // Air brake hiss
      const len = Math.floor(ctx.sampleRate * 0.28);
      const buf = ctx.createBuffer(1, len, ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < len; i += 1) {
        data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (ctx.sampleRate * 0.09));
      }
      const noise = ctx.createBufferSource();
      noise.buffer = buf;
      const filter = ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.value = 1800;
      const nGain = ctx.createGain();
      nGain.gain.setValueAtTime(0.09, now);
      nGain.gain.exponentialRampToValueAtTime(0.001, now + 0.28);
      noise.connect(filter);
      filter.connect(nGain);
      nGain.connect(ctx.destination);
      noise.start(now);

      [523.25, 659.25, 783.99].forEach((freq, idx) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(freq, now + 0.08 + idx * 0.07);
        gain.gain.setValueAtTime(0.001, now + 0.08 + idx * 0.07);
        gain.gain.exponentialRampToValueAtTime(0.09, now + 0.1 + idx * 0.07);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.42 + idx * 0.07);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now + 0.08 + idx * 0.07);
        osc.stop(now + 0.45 + idx * 0.07);
      });
    } else if (kind === 'wreck') {
      [190, 140].forEach((freq, idx) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(freq, now + idx * 0.12);
        gain.gain.setValueAtTime(0.001, now + idx * 0.12);
        gain.gain.exponentialRampToValueAtTime(0.09, now + idx * 0.12 + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.12 + 0.22);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now + idx * 0.12);
        osc.stop(now + idx * 0.12 + 0.24);
      });
    }
  } catch {
    // Ignore audio context blocks
  }
}

function drawRoundedRect(ctx, x, y, w, h, r) {
  const rad = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rad, y);
  ctx.lineTo(x + w - rad, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + rad);
  ctx.lineTo(x + w, y + h - rad);
  ctx.quadraticCurveTo(x + w, y + h, x + w - rad, y + h);
  ctx.lineTo(x + rad, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - rad);
  ctx.lineTo(x, y + rad);
  ctx.quadraticCurveTo(x, y, x + rad, y);
  ctx.closePath();
}

function drawCoachSprite(ctx, pxPerM, coach, {
  isPlayer = false,
  bodyColor = '#6b1426',
  stripeColor = '#eab308',
  steerRad = 0,
  throttle = 0,
  speed = 0,
  hitFlash = 0,
  tSec = 0,
} = {}) {
  const cx = (coach.rx !== undefined
    ? coach.rx + Math.cos(coach.heading) * REAR_TO_CENTER
    : coach.x) * pxPerM;
  const cy = (coach.ry !== undefined
    ? coach.ry + Math.sin(coach.heading) * REAR_TO_CENTER
    : coach.y) * pxPerM;
  const angle = coach.heading !== undefined ? coach.heading : (coach.angle || 0);
  const len = COACH_LENGTH * pxPerM;
  const wid = COACH_WIDTH * pxPerM;

  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(angle);

  // Soft ground drop shadow
  ctx.fillStyle = 'rgba(2, 6, 14, 0.45)';
  drawRoundedRect(ctx, -len / 2 + 2.5, -wid / 2 + 3.5, len, wid, wid * 0.22);
  ctx.fill();

  // Wheels drawn under arches (relative to coach geometric center: rear axle = -REAR_TO_CENTER)
  const rearAxleLocalX = -REAR_TO_CENTER * pxPerM;
  const frontAxleLocalX = (COACH_WHEELBASE - REAR_TO_CENTER) * pxPerM;
  const tyreHalfTrack = (COACH_WIDTH * 0.47) * pxPerM;
  const tyreLen = 1.15 * pxPerM;
  const tyreWid = 0.34 * pxPerM;

  const drawTyre = (wx, wy, rot) => {
    ctx.save();
    ctx.translate(wx, wy);
    ctx.rotate(rot);
    ctx.fillStyle = '#0f172a';
    ctx.strokeStyle = '#334155';
    ctx.lineWidth = 1;
    drawRoundedRect(ctx, -tyreLen / 2, -tyreWid / 2, tyreLen, tyreWid, 2);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  };

  drawTyre(rearAxleLocalX, -tyreHalfTrack, 0);
  drawTyre(rearAxleLocalX, tyreHalfTrack, 0);
  drawTyre(frontAxleLocalX, -tyreHalfTrack, steerRad);
  drawTyre(frontAxleLocalX, tyreHalfTrack, steerRad);

  // Wing mirrors (cosmetic overhangs at front corners)
  if (isPlayer) {
    const mirrorX = len / 2 - 0.55 * pxPerM;
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(mirrorX, -wid / 2 - 0.22 * pxPerM, 0.35 * pxPerM, 0.24 * pxPerM);
    ctx.fillRect(mirrorX, wid / 2 - 0.02 * pxPerM, 0.35 * pxPerM, 0.24 * pxPerM);
  }

  // Headlight glow beams when forward active
  if (isPlayer && (throttle > 0.02 || speed > 0.15)) {
    const beamLen = 5.4 * pxPerM;
    const beamSpan = 1.15 * pxPerM;
    [-wid * 0.3, wid * 0.3].forEach((ly) => {
      const grad = ctx.createLinearGradient(len / 2, ly, len / 2 + beamLen, ly);
      grad.addColorStop(0, 'rgba(254, 240, 138, 0.38)');
      grad.addColorStop(1, 'rgba(254, 240, 138, 0)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.moveTo(len / 2, ly - 0.14 * pxPerM);
      ctx.lineTo(len / 2 + beamLen, ly - beamSpan);
      ctx.lineTo(len / 2 + beamLen, ly + beamSpan);
      ctx.lineTo(len / 2, ly + 0.14 * pxPerM);
      ctx.closePath();
      ctx.fill();
    });
  }

  // Main coach shell (Country Lion maroon livery)
  const grad = ctx.createLinearGradient(0, -wid / 2, 0, wid / 2);
  grad.addColorStop(0, bodyColor);
  grad.addColorStop(0.5, isPlayer ? '#9f1239' : bodyColor);
  grad.addColorStop(1, '#3b0a16');
  ctx.fillStyle = grad;
  ctx.strokeStyle = hitFlash > 0
    ? `rgba(248, 113, 113, ${0.4 + hitFlash * 0.6})`
    : (isPlayer ? '#fde047' : 'rgba(250, 204, 21, 0.35)');
  ctx.lineWidth = isPlayer ? 1.8 : 1.2;
  drawRoundedRect(ctx, -len / 2, -wid / 2, len, wid, wid * 0.24);
  ctx.fill();
  ctx.stroke();

  // Gold roof & side accent stripe
  ctx.fillStyle = stripeColor;
  ctx.fillRect(-len * 0.42, -wid * 0.42, len * 0.72, wid * 0.08);
  ctx.fillRect(-len * 0.42, wid * 0.34, len * 0.72, wid * 0.08);

  // Tinted roof panel + AC pods + hatches
  ctx.fillStyle = isPlayer ? '#500724' : 'rgba(59, 10, 22, 0.55)';
  drawRoundedRect(ctx, -len * 0.38, -wid * 0.29, len * 0.66, wid * 0.58, wid * 0.1);
  ctx.fill();

  // Twin roof HVAC pods
  ctx.fillStyle = isPlayer ? '#e2e8f0' : '#94a3b8';
  drawRoundedRect(ctx, -len * 0.18, -wid * 0.19, len * 0.13, wid * 0.38, 3);
  ctx.fill();
  drawRoundedRect(ctx, len * 0.06, -wid * 0.19, len * 0.11, wid * 0.38, 3);
  ctx.fill();

  // Panoramic front windscreen (curved at nose = +len/2)
  ctx.fillStyle = '#020617';
  ctx.strokeStyle = isPlayer ? 'rgba(253, 224, 71, 0.55)' : 'rgba(148, 163, 184, 0.35)';
  ctx.lineWidth = 1;
  drawRoundedRect(ctx, len * 0.33, -wid * 0.39, len * 0.13, wid * 0.78, wid * 0.16);
  ctx.fill();
  ctx.stroke();

  // Rear engine vent louvers
  ctx.strokeStyle = 'rgba(148, 163, 184, 0.35)';
  ctx.lineWidth = 1;
  for (let i = 0; i < 4; i += 1) {
    const vx = -len * 0.46 + i * 0.22 * pxPerM;
    ctx.beginPath();
    ctx.moveTo(vx, -wid * 0.24);
    ctx.lineTo(vx, wid * 0.24);
    ctx.stroke();
  }

  // Country Lion roof crest marker on player coach
  if (isPlayer) {
    ctx.fillStyle = '#facc15';
    ctx.font = `bold ${Math.max(8, Math.round(wid * 0.26))}px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('LION', -len * 0.03, 0);
  }

  // Headlight lenses
  ctx.fillStyle = isPlayer ? '#fef9c3' : '#cbd5e1';
  ctx.fillRect(len / 2 - 2.5, -wid * 0.36, 2.5, wid * 0.16);
  ctx.fillRect(len / 2 - 2.5, wid * 0.20, 2.5, wid * 0.16);

  // Rear brake / reverse lamps on player coach
  if (isPlayer) {
    const braking = Math.abs(throttle) < 0.04 || Math.abs(speed) < 0.08;
    const reversing = throttle < -0.02;
    ctx.fillStyle = braking ? '#ef4444' : '#7f1d1d';
    ctx.fillRect(-len / 2, -wid * 0.38, 3, wid * 0.17);
    ctx.fillRect(-len / 2, wid * 0.21, 3, wid * 0.17);

    if (reversing) {
      ctx.fillStyle = '#f8fafc';
      ctx.fillRect(-len / 2, -wid * 0.18, 3.5, wid * 0.12);
      ctx.fillRect(-len / 2, wid * 0.06, 3.5, wid * 0.12);
      const pulse = 0.55 + 0.45 * Math.sin(tSec * 14);
      ctx.fillStyle = `rgba(251, 191, 36, ${pulse})`;
      ctx.beginPath();
      ctx.arc(-len / 2 + 2, -wid * 0.42, 0.24 * pxPerM, 0, Math.PI * 2);
      ctx.arc(-len / 2 + 2, wid * 0.42, 0.24 * pxPerM, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  ctx.restore();
}

function drawMirrorGuides(ctx, pxPerM, coach) {
  const steerRad = (coach.steerInput || 0) * MAX_WHEEL_STEER_RAD;
  const dir = (coach.throttle || 0) < -0.02 ? -1 : 1;
  const corners = getCoachCorners(coach, 0);
  const activeIndices = dir > 0 ? [0, 1] : [2, 3];

  ctx.save();
  ctx.lineWidth = 1.4;
  ctx.setLineDash([4, 4]);
  ctx.strokeStyle = dir > 0 ? 'rgba(56, 189, 248, 0.45)' : 'rgba(251, 191, 36, 0.52)';

  const arcLenM = 7.2;
  if (Math.abs(steerRad) < 0.015) {
    const ux = Math.cos(coach.heading) * dir;
    const uy = Math.sin(coach.heading) * dir;
    activeIndices.forEach((idx) => {
      const p = corners[idx];
      ctx.beginPath();
      ctx.moveTo(p.x * pxPerM, p.y * pxPerM);
      ctx.lineTo((p.x + ux * arcLenM) * pxPerM, (p.y + uy * arcLenM) * pxPerM);
      ctx.stroke();
    });
  } else {
    const turnRadius = COACH_WHEELBASE / Math.tan(steerRad);
    const nx = -Math.sin(coach.heading);
    const ny = Math.cos(coach.heading);
    const icrX = coach.rx + nx * turnRadius;
    const icrY = coach.ry + ny * turnRadius;
    const angularSpan = (arcLenM / Math.abs(turnRadius)) * Math.sign(turnRadius) * dir;
    const steps = 16;

    activeIndices.forEach((idx) => {
      const p = corners[idx];
      const baseAngle = Math.atan2(p.y - icrY, p.x - icrX);
      const rad = Math.hypot(p.x - icrX, p.y - icrY);
      ctx.beginPath();
      for (let s = 0; s <= steps; s += 1) {
        const a = baseAngle + (angularSpan * s) / steps;
        const x = (icrX + Math.cos(a) * rad) * pxPerM;
        const y = (icrY + Math.sin(a) * rad) * pxPerM;
        if (s === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    });
  }
  ctx.restore();
}

/**
 * Full-window Coach Park canvas with safe-area camera framing so top HUD and bottom cockpit
 * controls never cover the 64x40 yard on any screen size.
 */
function CoachParkCanvas({ map, simState, showGuides }) {
  const canvasRef = useRef(null);
  const stateRef = useRef({ map, simState, showGuides });
  stateRef.current = { map, simState, showGuides };

  useEffect(() => {
    const canvas = canvasRef.current;
    const parent = canvas?.parentElement;
    if (!canvas || !parent) return undefined;
    const ctx = canvas.getContext('2d');
    let running = true;
    let rafId = 0;
    let lastW = 0;
    let lastH = 0;
    let lastDpr = 0;

    const resize = () => {
      const cssW = Math.max(300, Math.floor(parent.clientWidth || 640));
      const cssH = Math.max(360, Math.floor(parent.clientHeight || 480));
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      if (cssW !== lastW || cssH !== lastH || dpr !== lastDpr) {
        canvas.width = Math.floor(cssW * dpr);
        canvas.height = Math.floor(cssH * dpr);
        canvas.style.width = `${cssW}px`;
        canvas.style.height = `${cssH}px`;
        lastW = cssW;
        lastH = cssH;
        lastDpr = dpr;
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      return { cssW, cssH };
    };

    let size = resize();
    const ro = typeof ResizeObserver !== 'undefined'
      ? new ResizeObserver(() => { size = resize(); })
      : null;
    ro?.observe(parent);
    const onWinResize = () => { size = resize(); };
    window.addEventListener('resize', onWinResize);

    const draw = (ts) => {
      if (!running) return;
      const tSec = ts / 1000;
      const { map: m, simState: sim, showGuides: guides } = stateRef.current;
      const { cssW, cssH } = size;

      // Reserve safe margins for embedded top HUD & bottom cockpit controls
      const isCompact = cssW < 580;
      const safeTop = isCompact ? 76 : 46;
      const safeBottom = isCompact ? 114 : 110;
      const safeSide = 10;
      const availW = Math.max(160, cssW - safeSide * 2);
      const availH = Math.max(120, cssH - safeTop - safeBottom);
      const pxPerM = Math.min(availW / WORLD_W, availH / WORLD_H);
      const yardW = WORLD_W * pxPerM;
      const yardH = WORLD_H * pxPerM;
      const originX = safeSide + (availW - yardW) / 2;
      const originY = safeTop + (availH - yardH) / 2;

      // Full-window outer dark apron behind HUD & controls
      ctx.fillStyle = '#090e17';
      ctx.fillRect(0, 0, cssW, cssH);

      ctx.save();
      ctx.translate(originX, originY);

      // 1. Yard tarmac surface
      const bg = ctx.createLinearGradient(0, 0, 0, yardH);
      bg.addColorStop(0, '#161f2c');
      bg.addColorStop(1, '#0f1621');
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, yardW, yardH);

      // Concrete slab expansion joints (subtle 8m grid)
      ctx.save();
      ctx.strokeStyle = 'rgba(148, 163, 184, 0.06)';
      ctx.lineWidth = 1;
      for (let gx = 8; gx < WORLD_W; gx += 8) {
        ctx.beginPath();
        ctx.moveTo(gx * pxPerM, 0);
        ctx.lineTo(gx * pxPerM, yardH);
        ctx.stroke();
      }
      for (let gy = 8; gy < WORLD_H; gy += 8) {
        ctx.beginPath();
        ctx.moveTo(0, gy * pxPerM);
        ctx.lineTo(yardW, gy * pxPerM);
        ctx.stroke();
      }
      ctx.restore();

      // Perimeter concrete kerb wall
      const wallPx = 0.35 * pxPerM;
      ctx.save();
      ctx.strokeStyle = '#475569';
      ctx.lineWidth = Math.max(2, wallPx * 2);
      ctx.strokeRect(0, 0, yardW, yardH);
      ctx.strokeStyle = 'rgba(250, 204, 21, 0.28)';
      ctx.lineWidth = 1.4;
      ctx.strokeRect(wallPx, wallPx, yardW - wallPx * 2, yardH - wallPx * 2);
      ctx.restore();

      // Yard lane markings & directional arrows
      (m.markings || []).forEach((mk) => {
        ctx.save();
        if (mk.type === 'line') {
          ctx.strokeStyle = 'rgba(226, 232, 240, 0.2)';
          ctx.lineWidth = 1.5;
          ctx.setLineDash([8, 8]);
          ctx.beginPath();
          ctx.moveTo(mk.x * pxPerM, mk.y * pxPerM);
          ctx.lineTo(mk.x2 * pxPerM, mk.y2 * pxPerM);
          ctx.stroke();
        } else if (mk.type === 'arrow') {
          ctx.translate(mk.x * pxPerM, mk.y * pxPerM);
          ctx.rotate(mk.angle || 0);
          ctx.strokeStyle = 'rgba(226, 232, 240, 0.16)';
          ctx.lineWidth = 2.2;
          ctx.beginPath();
          ctx.moveTo(-1.8 * pxPerM, 0);
          ctx.lineTo(1.6 * pxPerM, 0);
          ctx.moveTo(0.8 * pxPerM, -0.75 * pxPerM);
          ctx.lineTo(1.6 * pxPerM, 0);
          ctx.lineTo(0.8 * pxPerM, 0.75 * pxPerM);
          ctx.stroke();
        }
        ctx.restore();
      });

      // 2. Yellow Box Parking Bay
      const bay = m.bay;
      const holdFrac = clamp((sim.parkHoldSec || 0) / PARK_HOLD_SEC, 0, 1);
      const bayStatus = sim.bayStatus || {};
      ctx.save();
      ctx.translate(bay.x * pxPerM, bay.y * pxPerM);
      ctx.rotate(bay.angle || 0);
      const bw = bay.w * pxPerM;
      const bh = bay.h * pxPerM;

      ctx.fillStyle = holdFrac > 0.02
        ? `rgba(16, 185, 129, ${0.18 + holdFrac * 0.25})`
        : (bayStatus.allCornersIn ? 'rgba(250, 204, 21, 0.24)' : 'rgba(250, 204, 21, 0.14)');
      ctx.fillRect(-bw / 2, -bh / 2, bw, bh);

      ctx.save();
      ctx.beginPath();
      ctx.rect(-bw / 2, -bh / 2, bw, bh);
      ctx.clip();
      ctx.strokeStyle = holdFrac > 0.05 ? 'rgba(52, 211, 153, 0.22)' : 'rgba(250, 204, 21, 0.16)';
      ctx.lineWidth = 4;
      for (let hx = -bw; hx < bw; hx += 14) {
        ctx.beginPath();
        ctx.moveTo(hx, -bh / 2);
        ctx.lineTo(hx + bh, bh / 2);
        ctx.stroke();
      }
      ctx.restore();

      ctx.strokeStyle = holdFrac > 0.05 ? '#34d399' : '#facc15';
      ctx.lineWidth = holdFrac > 0.05 ? 3 : 2.5;
      ctx.strokeRect(-bw / 2, -bh / 2, bw, bh);

      const br = 0.75 * pxPerM;
      ctx.strokeStyle = holdFrac > 0.05 ? '#6ee7b7' : '#fef08a';
      ctx.lineWidth = 3;
      [
        [-bw / 2, -bh / 2, 1, 1],
        [bw / 2, -bh / 2, -1, 1],
        [bw / 2, bh / 2, -1, -1],
        [-bw / 2, bh / 2, 1, -1],
      ].forEach(([cxp, cyp, sx, sy]) => {
        ctx.beginPath();
        ctx.moveTo(cxp, cyp + sy * br);
        ctx.lineTo(cxp, cyp);
        ctx.lineTo(cxp + sx * br, cyp);
        ctx.stroke();
      });

      if (!bayStatus.allCornersIn) {
        ctx.fillStyle = 'rgba(250, 204, 21, 0.75)';
        ctx.font = `bold ${Math.max(8, Math.round(pxPerM * 0.85))}px system-ui, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('YELLOW BOX · PARK HERE', 0, 0);
      }

      if (holdFrac > 0.02) {
        ctx.fillStyle = '#064e3b';
        ctx.fillRect(-bw * 0.35, -0.35 * pxPerM, bw * 0.7, 0.7 * pxPerM);
        ctx.fillStyle = '#34d399';
        ctx.fillRect(-bw * 0.35, -0.35 * pxPerM, bw * 0.7 * holdFrac, 0.7 * pxPerM);
      }
      ctx.restore();

      // 3. Tyre marks from coach path
      if (sim.trails?.length) {
        ctx.save();
        for (let i = 0; i < sim.trails.length; i += 1) {
          const tr = sim.trails[i];
          ctx.fillStyle = tr.rev ? 'rgba(250, 204, 21, 0.16)' : 'rgba(2, 6, 14, 0.28)';
          ctx.fillRect(tr.lx * pxPerM - 1.5, tr.ly * pxPerM - 1.5, 3, 3);
          ctx.fillRect(tr.rx * pxPerM - 1.5, tr.ry * pxPerM - 1.5, 3, 3);
        }
        ctx.restore();
      }

      // 4. Obstacles
      (m.obstacles || []).forEach((obs) => {
        if (obs.kind === 'coach') {
          drawCoachSprite(ctx, pxPerM, obs, {
            isPlayer: false,
            bodyColor: obs.color || '#6b1426',
            stripeColor: 'rgba(250, 204, 21, 0.45)',
          });
          return;
        }
        if (typeof obs.r === 'number') {
          const ox = obs.x * pxPerM;
          const oy = obs.y * pxPerM;
          const or = obs.r * pxPerM;
          ctx.save();
          if (obs.kind === 'planter') {
            ctx.beginPath();
            ctx.arc(ox, oy, or, 0, Math.PI * 2);
            ctx.fillStyle = '#334155';
            ctx.fill();
            ctx.strokeStyle = '#94a3b8';
            ctx.lineWidth = 2;
            ctx.stroke();
            ctx.beginPath();
            ctx.arc(ox, oy, or * 0.82, 0, Math.PI * 2);
            ctx.fillStyle = '#14532d';
            ctx.fill();
            ctx.beginPath();
            ctx.arc(ox - or * 0.2, oy - or * 0.15, or * 0.48, 0, Math.PI * 2);
            ctx.fillStyle = '#166534';
            ctx.fill();
          } else if (obs.kind === 'cone') {
            ctx.beginPath();
            ctx.arc(ox, oy, or, 0, Math.PI * 2);
            ctx.fillStyle = '#ea580c';
            ctx.fill();
            ctx.strokeStyle = '#7c2d12';
            ctx.lineWidth = 1.5;
            ctx.stroke();
            ctx.beginPath();
            ctx.arc(ox, oy, or * 0.56, 0, Math.PI * 2);
            ctx.fillStyle = '#f8fafc';
            ctx.fill();
            ctx.beginPath();
            ctx.arc(ox, oy, or * 0.28, 0, Math.PI * 2);
            ctx.fillStyle = '#ea580c';
            ctx.fill();
          } else {
            ctx.beginPath();
            ctx.arc(ox, oy, or, 0, Math.PI * 2);
            ctx.fillStyle = '#dc2626';
            ctx.fill();
            ctx.strokeStyle = '#f8fafc';
            ctx.lineWidth = 2;
            ctx.stroke();
            ctx.beginPath();
            ctx.arc(ox, oy, or * 0.42, 0, Math.PI * 2);
            ctx.fillStyle = '#f8fafc';
            ctx.fill();
          }
          ctx.restore();
          return;
        }

        const ox = obs.x * pxPerM;
        const oy = obs.y * pxPerM;
        const ow = obs.w * pxPerM;
        const oh = obs.h * pxPerM;
        ctx.save();
        ctx.translate(ox, oy);
        ctx.rotate(obs.angle || 0);
        ctx.fillStyle = 'rgba(2, 6, 14, 0.42)';
        drawRoundedRect(ctx, -ow / 2 + 2.5, -oh / 2 + 3.5, ow, oh, 4);
        ctx.fill();

        if (obs.kind === 'building') {
          ctx.fillStyle = '#273042';
          ctx.strokeStyle = '#64748b';
          ctx.lineWidth = 1.8;
          drawRoundedRect(ctx, -ow / 2, -oh / 2, ow, oh, 4);
          ctx.fill();
          ctx.stroke();
          ctx.strokeStyle = 'rgba(148, 163, 184, 0.16)';
          ctx.lineWidth = 1;
          for (let sx = -ow / 2 + 12; sx < ow / 2; sx += 12) {
            ctx.beginPath();
            ctx.moveTo(sx, -oh / 2 + 2);
            ctx.lineTo(sx, oh / 2 - 2);
            ctx.stroke();
          }
          if (obs.label) {
            ctx.fillStyle = 'rgba(226, 232, 240, 0.55)';
            ctx.font = `bold ${Math.max(8, Math.round(pxPerM * 0.72))}px system-ui, sans-serif`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(obs.label, 0, 0);
          }
        } else if (obs.kind === 'skip') {
          ctx.fillStyle = '#b45309';
          ctx.strokeStyle = '#fbbf24';
          ctx.lineWidth = 1.6;
          drawRoundedRect(ctx, -ow / 2, -oh / 2, ow, oh, 4);
          ctx.fill();
          ctx.stroke();
          ctx.fillStyle = 'rgba(15, 23, 42, 0.45)';
          ctx.fillRect(-ow * 0.34, -oh * 0.3, ow * 0.68, oh * 0.6);
        } else {
          ctx.fillStyle = '#475569';
          ctx.strokeStyle = '#94a3b8';
          ctx.lineWidth = 1.4;
          drawRoundedRect(ctx, -ow / 2, -oh / 2, ow, oh, 5);
          ctx.fill();
          ctx.stroke();
          ctx.fillStyle = 'rgba(250, 204, 21, 0.55)';
          ctx.fillRect(-ow / 2 + 2, -oh / 2 + 2, Math.min(12, ow * 0.25), 2.5);
          ctx.fillRect(ow / 2 - Math.min(14, ow * 0.25), oh / 2 - 4.5, Math.min(12, ow * 0.25), 2.5);
        }
        ctx.restore();
      });

      // 5. Steering projection guide lines
      if (guides && sim.status !== 'parked') {
        drawMirrorGuides(ctx, pxPerM, sim.coach);
      }

      // 6. Player Country Lion coach
      const hitAgeMs = sim.lastHit ? Math.max(0, sim.elapsedMs - sim.lastHit.atMs) : 9999;
      const hitFlash = sim.lastHit && hitAgeMs < 600 ? 1 - hitAgeMs / 600 : 0;
      drawCoachSprite(ctx, pxPerM, sim.coach, {
        isPlayer: true,
        bodyColor: '#881337',
        stripeColor: '#facc15',
        steerRad: (sim.coach.steerInput || 0) * MAX_WHEEL_STEER_RAD,
        throttle: sim.coach.throttle,
        speed: sim.coach.speed,
        hitFlash,
        tSec,
      });

      const corners = getCoachCorners(sim.coach, 0);
      const flags = bayStatus.cornerFlags || [];
      corners.forEach((pt, idx) => {
        if (!flags[idx] && bayStatus.cornersInside === 0) return;
        ctx.beginPath();
        ctx.arc(pt.x * pxPerM, pt.y * pxPerM, flags[idx] ? 3.5 : 3, 0, Math.PI * 2);
        ctx.fillStyle = flags[idx] ? '#34d399' : '#f43f5e';
        ctx.fill();
        ctx.strokeStyle = '#020617';
        ctx.lineWidth = 1;
        ctx.stroke();
      });

      if (sim.lastHit && hitFlash > 0.05) {
        const hx = sim.lastHit.x * pxPerM;
        const hy = sim.lastHit.y * pxPerM;
        ctx.save();
        ctx.beginPath();
        ctx.arc(hx, hy, (0.6 + (1 - hitFlash) * 1.4) * pxPerM, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(248, 113, 113, ${hitFlash})`;
        ctx.lineWidth = 2.5;
        ctx.stroke();
        ctx.fillStyle = `rgba(254, 202, 202, ${hitFlash})`;
        ctx.font = 'bold 11px system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('+5s', hx, hy - 10);
        ctx.restore();
      }

      ctx.restore();
      rafId = window.requestAnimationFrame(draw);
    };

    rafId = window.requestAnimationFrame(draw);
    return () => {
      running = false;
      if (rafId) window.cancelAnimationFrame(rafId);
      ro?.disconnect();
      window.removeEventListener('resize', onWinResize);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="block w-full h-full"
    />
  );
}

/**
 * Compact embedded steering wheel widget: rotates ±540° and NEVER auto-centers on release.
 */
function SteeringWheelControl({
  steerInput,
  onSetSteerHold,
  onDirectSteer,
  disabled,
}) {
  const wheelRef = useRef(null);
  const dragRef = useRef({ active: false, lastAngle: 0, steer: 0 });
  const steerDeg = Math.round(steerInput * STEER_WHEEL_MAX_DEG);

  const handleWheelPointerDown = (e) => {
    if (disabled || !wheelRef.current) return;
    e.preventDefault();
    const rect = wheelRef.current.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const angle = Math.atan2(e.clientY - cy, e.clientX - cx);
    dragRef.current = { active: true, lastAngle: angle, steer: steerInput };
    e.currentTarget.setPointerCapture?.(e.pointerId);
  };

  const handleWheelPointerMove = (e) => {
    if (!dragRef.current.active || !wheelRef.current || disabled) return;
    const rect = wheelRef.current.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const angle = Math.atan2(e.clientY - cy, e.clientX - cx);
    let delta = angle - dragRef.current.lastAngle;
    if (delta > Math.PI) delta -= Math.PI * 2;
    if (delta < -Math.PI) delta += Math.PI * 2;
    dragRef.current.lastAngle = angle;
    const maxRad = (STEER_WHEEL_MAX_DEG * Math.PI) / 180;
    dragRef.current.steer = clamp(dragRef.current.steer + delta / maxRad, -1, 1);
    onDirectSteer(dragRef.current.steer);
  };

  const handleWheelPointerUp = (e) => {
    if (!dragRef.current.active) return;
    dragRef.current.active = false;
    e.currentTarget.releasePointerCapture?.(e.pointerId);
  };

  const dirText = Math.abs(steerDeg) <= 4
    ? '0° Straight'
    : (steerDeg < 0 ? `${steerDeg}° L` : `+${steerDeg}° R`);

  return (
    <div className="rounded-xl border border-[#1f2c4a] bg-[#070d18]/88 backdrop-blur-sm px-2 py-1.5 flex flex-col gap-1 shadow-lg">
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          disabled={disabled}
          aria-label="Steer left (hold)"
          onPointerDown={(e) => { e.preventDefault(); onSetSteerHold(-1); }}
          onPointerUp={() => onSetSteerHold(0)}
          onPointerLeave={() => onSetSteerHold(0)}
          onPointerCancel={() => onSetSteerHold(0)}
          className="h-11 sm:h-12 w-8 sm:w-9 rounded-lg border border-[#1f2c4a] bg-[#0b1322] hover:border-indigo-400/60 active:bg-indigo-600/30 text-slate-100 font-semibold text-sm disabled:opacity-40 select-none touch-none"
        >
          ◄
        </button>

        <div
          ref={wheelRef}
          role="slider"
          aria-label="Steering wheel angle"
          aria-valuemin={-STEER_WHEEL_MAX_DEG}
          aria-valuemax={STEER_WHEEL_MAX_DEG}
          aria-valuenow={steerDeg}
          tabIndex={-1}
          onPointerDown={handleWheelPointerDown}
          onPointerMove={handleWheelPointerMove}
          onPointerUp={handleWheelPointerUp}
          onPointerCancel={handleWheelPointerUp}
          className="relative w-14 h-14 sm:w-16 sm:h-16 flex-shrink-0 cursor-grab active:cursor-grabbing select-none touch-none"
          title="← / → keys or drag wheel — holds angle when released"
        >
          <svg
            viewBox="0 0 120 120"
            className="w-full h-full drop-shadow"
            style={{ transform: `rotate(${steerDeg}deg)` }}
          >
            <circle cx="60" cy="60" r="50" fill="none" stroke="#1e293b" strokeWidth="14" />
            <circle cx="60" cy="60" r="50" fill="none" stroke="#475569" strokeWidth="10" />
            <path d="M 52 10.5 A 50 50 0 0 1 68 10.5" fill="none" stroke="#eab308" strokeWidth="10.5" strokeLinecap="butt" />
            <line x1="16" y1="60" x2="104" y2="60" stroke="#64748b" strokeWidth="9" strokeLinecap="round" />
            <line x1="60" y1="60" x2="60" y2="104" stroke="#64748b" strokeWidth="10" strokeLinecap="round" />
            <circle cx="60" cy="60" r="18" fill="#4c0519" stroke="#facc15" strokeWidth="2" />
            <text x="60" y="63" textAnchor="middle" fill="#fde047" fontSize="9.5" fontWeight="bold" fontFamily="system-ui, sans-serif">
              LION
            </text>
          </svg>
        </div>

        <button
          type="button"
          disabled={disabled}
          aria-label="Steer right (hold)"
          onPointerDown={(e) => { e.preventDefault(); onSetSteerHold(1); }}
          onPointerUp={() => onSetSteerHold(0)}
          onPointerLeave={() => onSetSteerHold(0)}
          onPointerCancel={() => onSetSteerHold(0)}
          className="h-11 sm:h-12 w-8 sm:w-9 rounded-lg border border-[#1f2c4a] bg-[#0b1322] hover:border-indigo-400/60 active:bg-indigo-600/30 text-slate-100 font-semibold text-sm disabled:opacity-40 select-none touch-none"
        >
          ►
        </button>
      </div>

      <div className="h-1 w-full rounded-full bg-slate-800 relative overflow-hidden">
        <div className="absolute left-1/2 top-0 bottom-0 w-px bg-slate-500/70" />
        <div
          className="absolute top-0 bottom-0 bg-amber-400"
          style={{
            left: steerInput >= 0 ? '50%' : `${50 + steerInput * 50}%`,
            width: `${Math.abs(steerInput) * 50}%`,
          }}
        />
      </div>
      <div className="flex items-center justify-between gap-2 text-[10px] text-slate-400 leading-none">
        <span className="font-mono text-slate-200">{dirText}</span>
        <span className="text-amber-300/90 font-medium">←→ holds</span>
      </div>
    </div>
  );
}

/**
 * Compact embedded vertical throttle lever: FWD (+1) <-> N (0) <-> REV (-1).
 * NEVER auto-resets when released!
 */
function ThrottleLeverControl({
  throttle,
  stalledDir,
  onSetThrottleHold,
  onDirectThrottle,
  onSnapNeutral,
  disabled,
}) {
  const railRef = useRef(null);
  const draggingRef = useRef(false);

  const updateFromClientY = (clientY) => {
    if (!railRef.current || disabled) return;
    const rect = railRef.current.getBoundingClientRect();
    const frac = clamp((clientY - rect.top) / Math.max(1, rect.height), 0, 1);
    let val = 1 - frac * 2;
    if (Math.abs(val) < 0.045) val = 0;
    onDirectThrottle(clamp(val, -1, 1));
  };

  const handleRailDown = (e) => {
    if (disabled) return;
    e.preventDefault();
    draggingRef.current = true;
    e.currentTarget.setPointerCapture?.(e.pointerId);
    updateFromClientY(e.clientY);
  };

  const handleRailMove = (e) => {
    if (!draggingRef.current || disabled) return;
    updateFromClientY(e.clientY);
  };

  const handleRailUp = (e) => {
    if (!draggingRef.current) return;
    draggingRef.current = false;
    e.currentTarget.releasePointerCapture?.(e.pointerId);
  };

  const pct = Math.round(throttle * 100);
  const gear = Math.abs(throttle) < 0.02 ? 'N' : (throttle > 0 ? 'FWD' : 'REV');
  const knobTopPct = ((1 - throttle) / 2) * 100;

  return (
    <div className="rounded-xl border border-[#1f2c4a] bg-[#070d18]/88 backdrop-blur-sm px-2 py-1.5 flex flex-col gap-1 shadow-lg">
      <div className="flex items-center gap-1.5">
        <div className="flex flex-col gap-1">
          <button
            type="button"
            disabled={disabled}
            aria-label="Throttle up (hold)"
            onPointerDown={(e) => { e.preventDefault(); onSetThrottleHold(1); }}
            onPointerUp={() => onSetThrottleHold(0)}
            onPointerLeave={() => onSetThrottleHold(0)}
            onPointerCancel={() => onSetThrottleHold(0)}
            className="h-6 w-9 rounded border border-[#1f2c4a] bg-[#0b1322] hover:border-emerald-500/50 active:bg-emerald-600/30 text-emerald-200 font-semibold text-xs leading-none disabled:opacity-40 select-none touch-none"
          >
            ▲
          </button>
          <button
            type="button"
            disabled={disabled}
            onClick={onSnapNeutral}
            className="h-5 w-9 rounded border border-[#1f2c4a] bg-[#0b1322] hover:border-sky-400/50 text-[10px] font-mono font-semibold text-sky-200 leading-none disabled:opacity-40"
            title="Set throttle to Neutral (0%)"
          >
            N
          </button>
          <button
            type="button"
            disabled={disabled}
            aria-label="Throttle down / reverse (hold)"
            onPointerDown={(e) => { e.preventDefault(); onSetThrottleHold(-1); }}
            onPointerUp={() => onSetThrottleHold(0)}
            onPointerLeave={() => onSetThrottleHold(0)}
            onPointerCancel={() => onSetThrottleHold(0)}
            className="h-6 w-9 rounded border border-[#1f2c4a] bg-[#0b1322] hover:border-amber-500/50 active:bg-amber-600/30 text-amber-200 font-semibold text-xs leading-none disabled:opacity-40 select-none touch-none"
          >
            ▼
          </button>
        </div>

        <div className="flex items-center gap-1.5">
          <div
            ref={railRef}
            role="slider"
            aria-label="Coach throttle lever"
            aria-valuemin={-100}
            aria-valuemax={100}
            aria-valuenow={pct}
            tabIndex={-1}
            onPointerDown={handleRailDown}
            onPointerMove={handleRailMove}
            onPointerUp={handleRailUp}
            onPointerCancel={handleRailUp}
            className="relative w-9 h-[74px] rounded-lg border border-[#1f2c4a] bg-[#0b1322] cursor-ns-resize select-none touch-none overflow-hidden"
            title="↑ / ↓ keys or drag lever — holds speed when released"
          >
            {throttle > 0 ? (
              <div
                className="absolute left-0 right-0 bottom-1/2 bg-emerald-500/35"
                style={{ height: `${(throttle / 2) * 100}%` }}
              />
            ) : null}
            {throttle < 0 ? (
              <div
                className="absolute left-0 right-0 top-1/2 bg-amber-500/35"
                style={{ height: `${(Math.abs(throttle) / 2) * 100}%` }}
              />
            ) : null}
            <div className="absolute left-1 right-1 top-1/2 h-0.5 -translate-y-1/2 bg-sky-400/75" />
            <div
              className={`absolute left-1 right-1 h-3 -translate-y-1/2 rounded border shadow ${
                gear === 'N'
                  ? 'bg-sky-500 border-sky-200'
                  : (gear === 'FWD' ? 'bg-emerald-500 border-emerald-200' : 'bg-amber-500 border-amber-200')
              }`}
              style={{ top: `${knobTopPct}%` }}
            />
          </div>

          <div className="text-[9px] font-mono text-slate-500 flex flex-col justify-between h-[74px] py-0.5 select-none leading-none">
            <span className="text-emerald-300/85">F</span>
            <span className="text-sky-300 font-semibold">N</span>
            <span className="text-amber-300/85">R</span>
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between gap-2 text-[10px] text-slate-400 leading-none">
        <span className="font-mono text-slate-200">
          {stalledDir !== 0 ? 'Blocked' : `${gear} ${pct > 0 ? `+${pct}` : pct}%`}
        </span>
        <span className="text-emerald-300/90 font-medium">↑↓ holds</span>
      </div>
    </div>
  );
}

function CoachParkPlay({
  dayKey,
  mapSalt = 0,
  competitive = true,
  practice = false,
  sandbox = false,
  currentUserUid = null,
  onAchievements = null,
  initialGame = null,
  initialLeaderboard = [],
}) {
  const map = useMemo(() => generateCoachParkMap(dayKey, { salt: mapSalt }), [dayKey, mapSalt]);
  const [sim, setSim] = useState(() => createInitialSimState(map));
  const simRef = useRef(sim);
  simRef.current = sim;

  const [showGuides, setShowGuides] = useState(true);
  const [muted, setMuted] = useState(false);
  const [tutorialOpen, setTutorialOpen] = useState(false);
  const tutorialOpenRef = useRef(false);
  tutorialOpenRef.current = tutorialOpen;
  const [confirmRestart, setConfirmRestart] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitNote, setSubmitNote] = useState('');
  const [submitError, setSubmitError] = useState('');
  const [savedGame, setSavedGame] = useState(initialGame);
  const [leaderboard, setLeaderboard] = useState(initialLeaderboard || []);
  const [inActiveTry, setInActiveTry] = useState(false);
  const inActiveTryRef = useRef(false);
  const startTryPromiseRef = useRef(null);

  const keysHeldRef = useRef(new Set());
  const btnSteerRef = useRef(0);
  const btnThrottleRef = useRef(0);
  const directQueueRef = useRef({ directSteer: null, directThrottle: null });
  const prevBumpsRef = useRef(0);
  const prevThrottleZeroRef = useRef(true);
  const prevStatusRef = useRef('ready');
  const prevStartedRef = useRef(false);
  const revBeepTimerRef = useRef(0);
  const submittedRunRef = useRef(false);
  const onAchievementsRef = useRef(onAchievements);
  onAchievementsRef.current = onAchievements;

  const isDailyCompetitive = competitive && !practice && !sandbox;
  const serverTriesUsed = Number.isFinite(Number(savedGame?.triesUsed)) ? savedGame.triesUsed : 0;
  const serverRoundComplete = Boolean(savedGame?.roundComplete) || serverTriesUsed >= MAX_DAILY_TRIES;
  const triesRemaining = Math.max(0, MAX_DAILY_TRIES - serverTriesUsed);
  const outOfTriesLocked = isDailyCompetitive
    && serverRoundComplete
    && !inActiveTry
    && sim.status !== 'parked'
    && sim.status !== 'wrecked';

  // Sync fetched initial state
  useEffect(() => {
    setSavedGame(initialGame || null);
    setLeaderboard(Array.isArray(initialLeaderboard) ? initialLeaderboard : []);
  }, [initialGame, initialLeaderboard]);

  const resetAttempt = useCallback(() => {
    keysHeldRef.current.clear();
    btnSteerRef.current = 0;
    btnThrottleRef.current = 0;
    directQueueRef.current = { directSteer: null, directThrottle: null };
    const fresh = createInitialSimState(map);
    simRef.current = fresh;
    setSim(fresh);
    setInActiveTry(false);
    inActiveTryRef.current = false;
    startTryPromiseRef.current = null;
    setConfirmRestart(false);
    prevBumpsRef.current = 0;
    prevThrottleZeroRef.current = true;
    prevStatusRef.current = 'ready';
    prevStartedRef.current = false;
    revBeepTimerRef.current = 0;
    submittedRunRef.current = false;
    setSubmitNote('');
    setSubmitError('');
  }, [map]);

  useEffect(() => {
    resetAttempt();
  }, [map, resetAttempt]);

  useEffect(() => {
    if (!sandbox && !hasSeenCoachParkTutorial()) {
      setTutorialOpen(true);
    }
  }, [sandbox]);

  useEffect(() => {
    if (!tutorialOpen) return;
    keysHeldRef.current.clear();
    btnSteerRef.current = 0;
    btnThrottleRef.current = 0;
  }, [tutorialOpen]);

  // Reserve a daily try server-side on the first driving input
  const triggerStartTryIfNeeded = useCallback(() => {
    if (!isDailyCompetitive || inActiveTryRef.current) return;
    inActiveTryRef.current = true;
    setInActiveTry(true);
    setConfirmRestart(false);
    const p = (async () => {
      try {
        const res = await fetch('/api/startCoachParkTry', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ dayKey }),
        });
        const payload = (await readJsonResponse(res)) || {};
        if (!res.ok) {
          if (payload.game) setSavedGame(payload.game);
          if (payload.limitReached) {
            inActiveTryRef.current = false;
            setInActiveTry(false);
            const resetFresh = createInitialSimState(map);
            simRef.current = resetFresh;
            setSim(resetFresh);
          }
          return payload;
        }
        if (payload.game) setSavedGame(payload.game);
        return payload;
      } catch {
        return null;
      }
    })();
    startTryPromiseRef.current = p;
  }, [isDailyCompetitive, dayKey, map]);

  // Keyboard bindings (Left/Right steer, Up/Down throttle; R only in practice/sandbox)
  useEffect(() => {
    const isTypingTarget = (el) => {
      const tag = el?.tagName;
      return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el?.isContentEditable;
    };

    const onKeyDown = (e) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (tutorialOpenRef.current) return;
      if (isTypingTarget(document.activeElement) || isTypingTarget(e.target)) return;
      const code = e.code;
      if (code === 'ArrowLeft' || code === 'ArrowRight' || code === 'ArrowUp' || code === 'ArrowDown') {
        e.preventDefault();
        keysHeldRef.current.add(code);
        return;
      }
      if (code === 'KeyA' || code === 'KeyD' || code === 'KeyW' || code === 'KeyS') {
        keysHeldRef.current.add(code);
        return;
      }
      if (code === 'KeyR' && !e.repeat) {
        if (!isDailyCompetitive) {
          resetAttempt();
        } else if ((simRef.current.status === 'parked' || simRef.current.status === 'wrecked') && triesRemaining > 0) {
          resetAttempt();
        }
      }
    };

    const onKeyUp = (e) => {
      keysHeldRef.current.delete(e.code);
    };

    const onBlur = () => {
      keysHeldRef.current.clear();
      btnSteerRef.current = 0;
      btnThrottleRef.current = 0;
    };

    window.addEventListener('keydown', onKeyDown, { passive: false });
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onBlur);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
    };
  }, [resetAttempt, isDailyCompetitive, triesRemaining]);

  // Main 60fps simulation loop
  useEffect(() => {
    let running = true;
    let rafId = 0;
    let lastTs = performance.now();

    const frame = (ts) => {
      if (!running) return;
      const dt = Math.min(0.05, Math.max(0.001, (ts - lastTs) / 1000));
      lastTs = ts;

      const cur = simRef.current;
      const locked = isDailyCompetitive
        && (Boolean(savedGame?.roundComplete) || (Number(savedGame?.triesUsed) || 0) >= MAX_DAILY_TRIES)
        && !inActiveTryRef.current;

      if (!locked && !tutorialOpenRef.current && cur.status !== 'parked' && cur.status !== 'wrecked') {
        const held = keysHeldRef.current;
        let keySteer = 0;
        if (held.has('ArrowLeft') || held.has('KeyA')) keySteer -= 1;
        if (held.has('ArrowRight') || held.has('KeyD')) keySteer += 1;

        let keyThrottle = 0;
        if (held.has('ArrowUp') || held.has('KeyW')) keyThrottle += 1;
        if (held.has('ArrowDown') || held.has('KeyS')) keyThrottle -= 1;

        const steerDir = btnSteerRef.current !== 0 ? btnSteerRef.current : keySteer;
        const throttleDir = btnThrottleRef.current !== 0 ? btnThrottleRef.current : keyThrottle;
        const { directSteer, directThrottle } = directQueueRef.current;
        directQueueRef.current.directSteer = null;
        directQueueRef.current.directThrottle = null;

        const next = stepCoachSimulation(
          cur,
          { steerDir, throttleDir, directSteer, directThrottle },
          map,
          dt,
        );
        simRef.current = next;
        setSim(next);

        if (next.started && !prevStartedRef.current) {
          prevStartedRef.current = true;
          triggerStartTryIfNeeded();
        }

        if (!muted) {
          if (next.bumps > prevBumpsRef.current) {
            playCoachAudioCue(next.status === 'wrecked' ? 'wreck' : 'bump');
          }
          const isNeutral = Math.abs(next.coach.throttle) < 0.005;
          if (isNeutral && !prevThrottleZeroRef.current) {
            playCoachAudioCue('notch');
          }
          prevThrottleZeroRef.current = isNeutral;

          if (next.status === 'parked' && prevStatusRef.current !== 'parked') {
            playCoachAudioCue('park');
          }

          if (next.status === 'driving' && next.coach.throttle < -0.04 && next.stalledDir === 0) {
            revBeepTimerRef.current -= dt;
            if (revBeepTimerRef.current <= 0) {
              playCoachAudioCue('revBeep');
              revBeepTimerRef.current = 0.62;
            }
          } else {
            revBeepTimerRef.current = 0;
          }
        }
        prevBumpsRef.current = next.bumps;
        prevStatusRef.current = next.status;
      }

      rafId = window.requestAnimationFrame(frame);
    };

    rafId = window.requestAnimationFrame(frame);
    return () => {
      running = false;
      if (rafId) window.cancelAnimationFrame(rafId);
    };
  }, [map, muted, isDailyCompetitive, savedGame, triggerStartTryIfNeeded]);

  // Auto-submit result when parked OR wrecked
  useEffect(() => {
    if ((sim.status !== 'parked' && sim.status !== 'wrecked') || submittedRunRef.current) return;
    submittedRunRef.current = true;

    const outcome = sim.status === 'parked' ? 'parked' : 'wrecked';
    const durationMs = outcome === 'parked'
      ? Math.max(1500, Math.round(sim.elapsedMs))
      : Math.max(0, Math.round(sim.elapsedMs));
    const bumps = outcome === 'wrecked' ? MAX_BUMPS : sim.bumps;

    if (sandbox || practice || !competitive) {
      inActiveTryRef.current = false;
      setInActiveTry(false);
      setSubmitNote(
        sandbox
          ? `${outcome === 'parked' ? 'Sandbox parked' : 'Sandbox crashed'} — score not saved.`
          : 'Practice mode — past days do not count for leaderboards or streaks.',
      );
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        setSubmitting(true);
        setSubmitError('');
        if (startTryPromiseRef.current) {
          await startTryPromiseRef.current.catch(() => null);
        }
        const response = await fetch('/api/submitCoachParkResult', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            outcome,
            durationMs,
            bumps,
            dayKey,
          }),
        });
        const payload = (await readJsonResponse(response)) || {};
        if (!response.ok) throw new Error(payload.error || 'Failed to save Coach Park result.');
        if (cancelled) return;
        inActiveTryRef.current = false;
        setInActiveTry(false);
        if (payload.game) setSavedGame(payload.game);
        if (Array.isArray(payload.leaderboard)) setLeaderboard(payload.leaderboard);
        if (Array.isArray(payload.achievements) && typeof onAchievementsRef.current === 'function') {
          onAchievementsRef.current(payload.achievements);
        }
        if (outcome === 'parked') {
          if (payload.improved) {
            setSubmitNote('New personal best posted to today’s leaderboard!');
          } else if (payload.game?.scoreMs) {
            setSubmitNote(`Best today stays ${formatResultMs(payload.game.scoreMs)} (${payload.game.bumps} bumps).`);
          }
        } else if (payload.game?.status === 'won') {
          setSubmitNote(`Best score ${formatResultMs(payload.game.scoreMs)} stays on the board.`);
        } else if (payload.game?.roundComplete) {
          setSubmitNote('All 3 tries used today.');
        }
      } catch (err) {
        if (!cancelled) {
          inActiveTryRef.current = false;
          setInActiveTry(false);
          setSubmitError(err.message || 'Failed to save Coach Park score.');
        }
      } finally {
        if (!cancelled) setSubmitting(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [sim.status, sim.elapsedMs, sim.bumps, dayKey, sandbox, practice, competitive]);

  const speedMph = Math.round(Math.abs(sim.coach.speed || 0) * 2.237);
  const gearChar = Math.abs(sim.coach.throttle) < 0.02 ? 'N' : (sim.coach.throttle > 0 ? 'D' : 'R');
  const bayStatus = sim.bayStatus || {};
  const controlsDisabled = sim.status === 'parked' || sim.status === 'wrecked' || outOfTriesLocked || tutorialOpen;

  const activeTryNum = inActiveTry
    ? Math.max(1, Math.min(MAX_DAILY_TRIES, serverTriesUsed || 1))
    : Math.min(MAX_DAILY_TRIES, serverTriesUsed + 1);

  const statusPrompt = sim.stalledDir !== 0
    ? 'Obstacle hit — pull throttle back to clear'
    : sim.parkHoldSec > 0.05
      ? `Locking park… ${Math.round((sim.parkHoldSec / PARK_HOLD_SEC) * 100)}%`
      : bayStatus.allCornersIn && !bayStatus.throttleOk
        ? 'All corners inside! Pull throttle to N (0%) & stop'
        : bayStatus.allCornersIn && !bayStatus.aligned
          ? 'Inside bay — straighten coach alignment'
          : bayStatus.cornersInside > 0
            ? `${bayStatus.cornersInside}/4 corners in yellow box`
            : 'Drive cleanly into the yellow box';

  const liveScoreMs = Math.round(sim.elapsedMs) + sim.bumps * BUMP_PENALTY_MS;
  const attemptHistory = Array.isArray(savedGame?.attemptHistory) ? savedGame.attemptHistory : [];

  const handleRestartClick = async () => {
    if (!isDailyCompetitive) {
      resetAttempt();
      return;
    }
    if (!sim.started || sim.status === 'parked' || sim.status === 'wrecked') {
      if (triesRemaining > 0) resetAttempt();
      return;
    }
    if (triesRemaining <= 0) return;
    if (!confirmRestart) {
      setConfirmRestart(true);
      return;
    }
    if (startTryPromiseRef.current) {
      await startTryPromiseRef.current.catch(() => null);
    }
    resetAttempt();
  };

  return (
    <div className="space-y-3">
      <CoachParkTutorialModal open={tutorialOpen} onClose={() => setTutorialOpen(false)} />
      {/* Single screen-fitting game window: map canvas + embedded top HUD + embedded cockpit controls */}
      <div className="relative w-full overflow-hidden rounded-2xl border border-[#243352] bg-[#090e17] shadow-[0_12px_40px_rgba(0,0,0,0.45)] h-[min(78dvh,600px)] min-h-[430px] select-none">
        <CoachParkCanvas map={map} simState={sim} showGuides={showGuides} />

        {/* Embedded Top HUD */}
        <div className="pointer-events-none absolute inset-x-0 top-0 z-10 bg-gradient-to-b from-[#050a12]/90 via-[#050a12]/55 to-transparent px-2.5 sm:px-3 pt-2 pb-4">
          <div className="flex items-center justify-between gap-2 pointer-events-auto">
            <div className="flex items-center gap-2 min-w-0">
              <span
                className="text-xs sm:text-sm font-semibold text-indigo-100 truncate"
                title={map.hint}
              >
                {map.title}
              </span>
              {isDailyCompetitive ? (
                <span
                  className={`px-2 py-0.5 rounded-md text-[10px] font-semibold border flex-shrink-0 ${
                    outOfTriesLocked
                      ? 'bg-slate-900/90 border-slate-600 text-slate-300'
                      : 'bg-indigo-950/85 border-indigo-400/40 text-indigo-200'
                  }`}
                >
                  {outOfTriesLocked
                    ? '3/3 tries used'
                    : `Try ${activeTryNum}/${MAX_DAILY_TRIES}`}
                </span>
              ) : (
                <span className="px-2 py-0.5 rounded-md text-[10px] font-medium border border-amber-500/35 bg-amber-950/70 text-amber-200 flex-shrink-0">
                  {sandbox ? 'Sandbox' : 'Practice'}
                </span>
              )}
              {isDailyCompetitive && savedGame?.status === 'won' && savedGame?.scoreMs ? (
                <span className="hidden md:inline-block px-2 py-0.5 rounded-md text-[10px] font-mono font-semibold border border-emerald-500/40 bg-emerald-950/70 text-emerald-200 flex-shrink-0">
                  Best {formatResultMs(savedGame.scoreMs)}
                </span>
              ) : null}
            </div>

            {/* Desktop status pill */}
            {sim.status === 'ready' || sim.status === 'driving' ? (
              <div className="hidden sm:flex items-center justify-center min-w-0">
                <span
                  className={`px-2.5 py-0.5 rounded-full text-[11px] font-medium border backdrop-blur-sm truncate ${
                    sim.stalledDir !== 0
                      ? 'bg-rose-950/90 border-rose-400/60 text-rose-100'
                      : sim.parkHoldSec > 0.05
                        ? 'bg-emerald-950/90 border-emerald-400/60 text-emerald-100'
                        : bayStatus.allCornersIn
                          ? 'bg-amber-950/90 border-amber-400/60 text-amber-100'
                          : 'bg-[#060e1a]/80 border-[#1f2c4a] text-slate-200'
                  }`}
                >
                  {statusPrompt}
                </span>
              </div>
            ) : null}

            {/* Compact right toggles */}
            <div className="flex items-center gap-1 flex-shrink-0">
              <button
                type="button"
                aria-label="How to play"
                title="How to play"
                onClick={() => setTutorialOpen(true)}
                className="px-2 py-1 rounded-md text-[11px] font-semibold border border-[#1f2c4a] bg-[#070d18]/85 hover:border-amber-400/50 text-amber-200 transition-colors"
              >
                ?
              </button>
              <button
                type="button"
                onClick={() => setShowGuides((v) => !v)}
                className={`px-2 py-1 rounded-md text-[11px] border transition-colors ${
                  showGuides
                    ? 'border-sky-500/40 bg-sky-500/20 text-sky-100'
                    : 'border-[#1f2c4a] bg-[#070d18]/85 text-slate-400'
                }`}
              >
                Guides
              </button>
              <button
                type="button"
                onClick={() => setMuted((m) => !m)}
                className={`px-2 py-1 rounded-md text-[11px] border transition-colors ${
                  !muted
                    ? 'border-indigo-500/35 bg-[#070d18]/85 text-slate-200'
                    : 'border-[#1f2c4a] bg-[#070d18]/85 text-slate-500'
                }`}
              >
                {muted ? 'Mute' : 'SFX'}
              </button>
              {!outOfTriesLocked && (!isDailyCompetitive || sim.started) ? (
                confirmRestart ? (
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={handleRestartClick}
                      className="px-2 py-1 rounded-md text-[11px] font-semibold border border-amber-400/60 bg-amber-600/80 text-white"
                      title="Start your next try now"
                    >
                      Use next try?
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmRestart(false)}
                      className="px-1.5 py-1 rounded-md text-[11px] border border-[#1f2c4a] bg-[#070d18]/90 text-slate-300"
                    >
                      No
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    disabled={isDailyCompetitive && triesRemaining <= 0}
                    onClick={handleRestartClick}
                    className="px-2 py-1 rounded-md text-[11px] font-medium border border-[#1f2c4a] bg-[#070d18]/85 hover:border-indigo-400/50 text-slate-200 disabled:opacity-35"
                    title={isDailyCompetitive && triesRemaining <= 0 ? 'Final try — no restarts left' : 'Restart'}
                  >
                    Restart
                  </button>
                )
              ) : null}
            </div>
          </div>

          {/* Mobile telemetry strip */}
          <div className="sm:hidden mt-1.5 flex items-center justify-between gap-2 text-[11px] text-slate-200 pointer-events-none">
            <div className="flex items-center gap-2 font-mono">
              <span>{formatResultMs(sim.elapsedMs)}</span>
              <span className="text-indigo-200">{gearChar}·{speedMph}</span>
              <span className={sim.bumps > 0 ? 'text-amber-300' : 'text-emerald-300'}>
                {formatResultMs(liveScoreMs)}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-0.5">
                {(bayStatus.cornerFlags || [false, false, false, false]).map((ok, i) => (
                  <span
                    key={`mc-${i}`}
                    className={`w-2 h-2 rounded-full border ${
                      ok ? 'bg-emerald-400 border-emerald-200' : 'bg-slate-800 border-slate-600'
                    }`}
                  />
                ))}
              </div>
              <div className="flex items-center gap-0.5">
                {Array.from({ length: MAX_BUMPS }, (_, i) => (
                  <span
                    key={`mb-${i}`}
                    className={`w-2 h-2 rounded-sm border ${
                      i < sim.bumps ? 'bg-rose-500 border-rose-300' : 'bg-slate-800 border-slate-600'
                    }`}
                  />
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Embedded Bottom Cockpit Controls */}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 bg-gradient-to-t from-[#050a12]/95 via-[#050a12]/80 to-transparent px-2.5 sm:px-3 pb-2 pt-3">
          <div className="flex items-end justify-between gap-2 pointer-events-auto">
            <SteeringWheelControl
              steerInput={sim.coach.steerInput}
              disabled={controlsDisabled}
              onSetSteerHold={(dir) => { btnSteerRef.current = dir; }}
              onDirectSteer={(val) => { directQueueRef.current.directSteer = val; }}
            />

            {/* Desktop Center Instrument Pod */}
            <div className="hidden sm:flex flex-col justify-between gap-1.5 rounded-xl border border-[#1f2c4a] bg-[#070d18]/88 backdrop-blur-sm px-3 py-2 min-w-[218px] shadow-lg">
              <div className="grid grid-cols-3 gap-2 text-center">
                <div>
                  <div className="text-[9px] uppercase tracking-wider text-slate-500">Time</div>
                  <div className="text-xs font-mono font-semibold text-slate-100 tabular-nums">
                    {formatResultMs(sim.elapsedMs)}
                  </div>
                </div>
                <div>
                  <div className="text-[9px] uppercase tracking-wider text-slate-500">Gear · Spd</div>
                  <div className="text-xs font-mono font-semibold text-indigo-200 tabular-nums">
                    {gearChar} · {speedMph}mph
                  </div>
                </div>
                <div>
                  <div className="text-[9px] uppercase tracking-wider text-slate-500">Total</div>
                  <div className={`text-xs font-mono font-semibold tabular-nums ${sim.bumps > 0 ? 'text-amber-300' : 'text-emerald-300'}`}>
                    {formatResultMs(liveScoreMs)}
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-between gap-3 pt-0.5 border-t border-[#162038]">
                <div className="flex items-center gap-1" title="4 coach corners inside yellow bay">
                  <span className="text-[10px] text-slate-400">Bay</span>
                  {(bayStatus.cornerFlags || [false, false, false, false]).map((ok, i) => (
                    <span
                      key={`dc-${i}`}
                      className={`w-2 h-2 rounded-full border ${
                        ok
                          ? 'bg-emerald-400 border-emerald-200 shadow-[0_0_5px_rgba(52,211,153,0.7)]'
                          : 'bg-slate-800 border-slate-600'
                      }`}
                    />
                  ))}
                </div>

                <div className="flex items-center gap-1" title="+5s per bump (5 bumps ends try)">
                  <span className="text-[10px] text-slate-400">Bumps</span>
                  {Array.from({ length: MAX_BUMPS }, (_, i) => (
                    <span
                      key={`db-${i}`}
                      className={`w-2 h-2 rounded-sm border ${
                        i < sim.bumps ? 'bg-rose-500 border-rose-300' : 'bg-slate-800 border-slate-600'
                      }`}
                    />
                  ))}
                </div>

                {isDailyCompetitive ? (
                  <div className="flex items-center gap-1" title="3 competitive tries per day">
                    <span className="text-[10px] text-slate-400">Tries</span>
                    {Array.from({ length: MAX_DAILY_TRIES }, (_, i) => {
                      const used = i < serverTriesUsed;
                      return (
                        <span
                          key={`dt-${i}`}
                          className={`w-2 h-2 rounded-full border ${
                            used
                              ? 'bg-amber-400 border-amber-200'
                              : 'bg-indigo-500/40 border-indigo-400/70'
                          }`}
                        />
                      );
                    })}
                  </div>
                ) : null}
              </div>

              <p className="text-[10px] text-center text-slate-500 leading-none">
                Park in yellow box at <strong className="text-sky-300">N</strong> · wheel &amp; throttle hold
              </p>
            </div>

            <ThrottleLeverControl
              throttle={sim.coach.throttle}
              stalledDir={sim.stalledDir}
              disabled={controlsDisabled}
              onSetThrottleHold={(dir) => { btnThrottleRef.current = dir; }}
              onDirectThrottle={(val) => { directQueueRef.current.directThrottle = val; }}
              onSnapNeutral={() => {
                btnThrottleRef.current = 0;
                directQueueRef.current.directThrottle = 0;
              }}
            />
          </div>
        </div>

        {/* Overlay: Parked */}
        {sim.status === 'parked' ? (
          <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/55 backdrop-blur-[2px] p-4">
            <div className="w-full max-w-sm rounded-2xl border border-emerald-400/40 bg-[#0b1815]/95 p-5 text-center shadow-2xl space-y-3">
              <div className="text-xs font-semibold uppercase tracking-wider text-emerald-300">
                Handbrake Applied · Clean Bay Lock
              </div>
              <div className="text-3xl font-mono font-bold text-white tabular-nums">
                {formatResultMs(sim.scoreMs)}
              </div>
              <div className="flex items-center justify-center gap-3 text-xs text-slate-300">
                <span>Drive time: <strong className="text-white">{formatResultMs(sim.elapsedMs)}</strong></span>
                <span>·</span>
                <span>
                  Bumps:{' '}
                  <strong className={sim.bumps === 0 ? 'text-emerald-300' : 'text-amber-300'}>
                    {sim.bumps === 0 ? 'Clean (0)' : `${sim.bumps} (+${sim.bumps * 5}s)`}
                  </strong>
                </span>
              </div>
              {submitting ? <p className="text-xs text-slate-400">Saving score…</p> : null}
              {submitNote ? <p className="text-xs text-emerald-300">{submitNote}</p> : null}
              {submitError ? <p className="text-xs text-rose-300">{submitError}</p> : null}
              {!isDailyCompetitive ? (
                <button
                  type="button"
                  onClick={resetAttempt}
                  className="w-full rounded-xl bg-emerald-600 hover:bg-emerald-500 px-4 py-2.5 text-sm font-semibold text-white transition-colors"
                >
                  Drive again
                </button>
              ) : triesRemaining > 0 ? (
                <button
                  type="button"
                  disabled={submitting}
                  onClick={resetAttempt}
                  className="w-full rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 px-4 py-2.5 text-sm font-semibold text-white transition-colors"
                >
                  Start Try {Math.min(MAX_DAILY_TRIES, serverTriesUsed + 1)} of {MAX_DAILY_TRIES} (beat your time)
                </button>
              ) : (
                <div className="rounded-xl border border-emerald-500/30 bg-emerald-950/50 px-3 py-2 text-xs text-emerald-200">
                  All {MAX_DAILY_TRIES} tries used today — best score locked on the leaderboard.
                </div>
              )}
            </div>
          </div>
        ) : null}

        {/* Overlay: Wrecked */}
        {sim.status === 'wrecked' ? (
          <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/60 backdrop-blur-[2px] p-4">
            <div className="w-full max-w-sm rounded-2xl border border-rose-500/45 bg-[#190c12]/95 p-5 text-center shadow-2xl space-y-3">
              <div className="text-sm font-semibold text-rose-300">Too Many Scrapes ({MAX_BUMPS}/{MAX_BUMPS})</div>
              <p className="text-xs text-slate-300">
                Traffic Office won&apos;t sign off the paintwork on that run!
              </p>
              {submitting ? <p className="text-xs text-slate-400">Updating try count…</p> : null}
              {submitNote ? <p className="text-xs text-amber-200">{submitNote}</p> : null}
              {submitError ? <p className="text-xs text-rose-300">{submitError}</p> : null}
              {!isDailyCompetitive ? (
                <button
                  type="button"
                  onClick={resetAttempt}
                  className="w-full rounded-xl bg-rose-600 hover:bg-rose-500 px-4 py-2.5 text-sm font-semibold text-white transition-colors"
                >
                  Try again (R)
                </button>
              ) : triesRemaining > 0 ? (
                <button
                  type="button"
                  disabled={submitting}
                  onClick={resetAttempt}
                  className="w-full rounded-xl bg-rose-600 hover:bg-rose-500 disabled:opacity-50 px-4 py-2.5 text-sm font-semibold text-white transition-colors"
                >
                  Use Try {Math.min(MAX_DAILY_TRIES, serverTriesUsed + 1)} of {MAX_DAILY_TRIES}
                </button>
              ) : (
                <div className="rounded-xl border border-rose-500/35 bg-rose-950/60 px-3 py-2 text-xs text-rose-200">
                  All {MAX_DAILY_TRIES} daily tries used — better luck tomorrow!
                </div>
              )}
            </div>
          </div>
        ) : null}

        {/* Overlay: Locked out on load (3/3 tries already completed today) */}
        {outOfTriesLocked ? (
          <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/60 backdrop-blur-[2px] p-4">
            <div className="w-full max-w-sm rounded-2xl border border-[#2c3b5e] bg-[#0a1220]/95 p-5 text-center shadow-2xl space-y-3">
              <div className="text-xs font-semibold uppercase tracking-wider text-indigo-300">
                Today&apos;s {MAX_DAILY_TRIES} Tries Complete
              </div>
              {savedGame?.status === 'won' && savedGame?.scoreMs ? (
                <div>
                  <div className="text-3xl font-mono font-bold text-emerald-300 tabular-nums">
                    {formatResultMs(savedGame.scoreMs)}
                  </div>
                  <p className="text-xs text-slate-300 mt-1">
                    Best park ({savedGame.bumps === 0 ? 'Clean' : `${savedGame.bumps} bumps`})
                  </p>
                </div>
              ) : (
                <div className="text-base font-semibold text-rose-300">
                  💩 Did not park
                </div>
              )}
              {attemptHistory.length ? (
                <div className="grid grid-cols-3 gap-1.5 text-[11px]">
                  {attemptHistory.map((item) => (
                    <div
                      key={`hist-${item.tryNumber}`}
                      className="rounded-lg border border-[#1f2c4a] bg-[#060d18] px-1.5 py-1.5"
                    >
                      <div className="text-[10px] text-slate-500">Try {item.tryNumber}</div>
                      <div className={`font-mono font-semibold ${item.outcome === 'parked' ? 'text-emerald-300' : 'text-rose-300'}`}>
                        {item.outcome === 'parked' ? formatResultMs(item.scoreMs) : 'Wrecked'}
                      </div>
                    </div>
                  ))}
                </div>
              ) : null}
              <p className="text-xs text-slate-400">
                New depot map arrives next weekday — use the day picker above to practice past maps.
              </p>
            </div>
          </div>
        ) : null}
      </div>

      {/* Today's competitive leaderboard (outside play window so play stays viewport-fitted) */}
      {!sandbox && !practice && competitive ? (
        <div className="rounded-xl border border-[#1a2540] overflow-hidden">
          <div className="px-4 py-3 border-b border-[#1a2540] flex items-center justify-between gap-2">
            <h4 className="text-sm font-semibold text-indigo-200">Today’s leaderboard</h4>
            <span className="text-xs text-slate-500">3 tries/day · fastest time wins (+5s/bump)</span>
          </div>
          {!leaderboard.length ? (
            <p className="px-5 py-6 text-sm text-slate-500 text-center">
              Nobody has finished today&apos;s bay yet — set the pace.
            </p>
          ) : (
            <ol className="divide-y divide-[#1a2540]">
              {leaderboard.map((row) => (
                <FunLeaderboardRow
                  key={row.uid || row.rank || row.fullName}
                  row={row}
                  currentUserUid={currentUserUid}
                  resultText={row.resultLabel || formatResultMs(row.scoreMs)}
                />
              ))}
            </ol>
          )}
        </div>
      ) : null}
    </div>
  );
}

export function CoachParkDailyPanel({
  currentUserUid = null,
  onAchievements = null,
  isAdmin = false,
  onUnavailable = null,
  onRotationSync = null,
}) {
  const todayKey = getLondonDayKey();
  const [dayKey, setDayKey] = useState(todayKey);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [game, setGame] = useState(null);
  const [leaderboard, setLeaderboard] = useState([]);
  const practice = dayKey !== todayKey;

  const onUnavailableRef = useRef(onUnavailable);
  const onRotationSyncRef = useRef(onRotationSync);
  const onAchievementsRef = useRef(onAchievements);
  onUnavailableRef.current = onUnavailable;
  onRotationSyncRef.current = onRotationSync;
  onAchievementsRef.current = onAchievements;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        setError('');
        const params = new URLSearchParams();
        if (dayKey && dayKey !== todayKey) params.set('dayKey', dayKey);
        const query = params.toString() ? `?${params}` : '';
        const response = await fetch(`/api/getDailyCoachPark${query}`, { credentials: 'include' });
        const payload = (await readJsonResponse(response)) || {};
        if (!response.ok) throw new Error(payload.error || 'Failed to load Coach Park.');
        if (cancelled) return;
        if (payload.rotation && typeof onRotationSyncRef.current === 'function') {
          onRotationSyncRef.current(payload.rotation);
        }
        if (payload.weekend || payload.sittingOut) {
          setGame(null);
          setLeaderboard([]);
          if (!practice && typeof onUnavailableRef.current === 'function') {
            onUnavailableRef.current('coachpark');
            return;
          }
          setError(payload.message || 'Coach Park isn’t in today’s Fun rotation.');
          return;
        }
        setGame(payload.game || null);
        setLeaderboard(payload.leaderboard || []);
        if (!practice && Array.isArray(payload.achievements) && typeof onAchievementsRef.current === 'function') {
          onAchievementsRef.current(payload.achievements);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err.message || 'Failed to load Coach Park.');
          setGame(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [dayKey, todayKey, practice]);

  if (loading) return <p className="text-sm text-slate-400">Loading Coach Park…</p>;
  if (error) return <p className="text-sm text-rose-300">{error}</p>;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <FunDayPicker
          dayKey={dayKey}
          todayKey={todayKey}
          onChange={setDayKey}
          allowFuture={Boolean(isAdmin)}
          gameKey="coachpark"
        />
      </div>
      <CoachParkPlay
        key={`${dayKey}`}
        dayKey={dayKey}
        competitive={!practice}
        practice={practice}
        currentUserUid={currentUserUid}
        onAchievements={onAchievements}
        initialGame={game}
        initialLeaderboard={leaderboard}
      />
    </div>
  );
}

export function CoachParkSandbox() {
  const [dayKey, setDayKey] = useState(getLondonDayKey);
  const [salt, setSalt] = useState(0);

  useEffect(() => {
    snoozeDeployRefresh(24 * 60 * 60 * 1000);
  }, []);

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-[#1a2540] p-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-slate-300">
          Admin sandbox · preview any day&apos;s Coach Park depot layout. Scores are not saved.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => { setDayKey((d) => shiftDayKey(d, -1)); setSalt(0); }}
            className="px-2.5 py-1.5 rounded-md border border-[#1a2540] text-xs text-slate-300 hover:bg-white/[0.04]"
          >
            ‹ Prev map
          </button>
          <input
            type="date"
            value={dayKey}
            onChange={(e) => { if (e.target.value) { setDayKey(e.target.value); setSalt(0); } }}
            className="bg-[#060e1a] border border-[#1a2540] text-slate-200 text-xs rounded-md px-2 py-1.5"
          />
          <button
            type="button"
            onClick={() => { setDayKey((d) => shiftDayKey(d, 1)); setSalt(0); }}
            className="px-2.5 py-1.5 rounded-md border border-[#1a2540] text-xs text-slate-300 hover:bg-white/[0.04]"
          >
            Next map ›
          </button>
          <button
            type="button"
            onClick={() => setSalt((s) => s + 1)}
            className="px-2.5 py-1.5 rounded-md border border-indigo-500/40 text-xs text-indigo-200 hover:bg-indigo-500/10"
          >
            Shuffle layout
          </button>
        </div>
      </div>

      <CoachParkPlay
        key={`${dayKey}-${salt}`}
        dayKey={dayKey}
        mapSalt={salt}
        competitive={false}
        sandbox
      />
    </div>
  );
}

export default CoachParkSandbox;
