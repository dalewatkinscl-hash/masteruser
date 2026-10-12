/**
 * Country Holes — Daily Holes–style 9-hole golf (Profile tab + Fun Admin sandbox).
 * Canvas course + aim / swing meter / carry-roll / putt rings.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import FunDayPicker, { getLondonDayKey } from './FunDayPicker';
import FunLeaderboardRow from './FunLeaderboardRow';
import {
  CLUBS,
  METER_MAX,
  METER_SPEED,
  PURE_BAND,
  angleToGreen,
  distanceToPin,
  generateCourse,
  holeResultLabel,
  pinPowerForClub,
  puttRingRadii,
  simulateShot,
  previewShot,
  clubsForLie,
  suggestClub,
  surfaceAt,
  worldBounds,
  formatScoreToPar,
  ZERO_SPIN,
  clampSpin,
  spinLimitsForClub,
} from '../lib/countryHoles';
import { snoozeDeployRefresh } from '../utils/deployRefresh';
import useGameUiSound from './gameUi/useGameUiSound';

const LOCAL_BEST_KEY = 'country-holes-sandbox-best-v1';
const ROUND_SAVE_KEY = 'country-holes-round-v1';
const INTRO_DISMISS_KEY = 'country-holes-ea-dismissed-v1';
const TIPS_SEEN_KEY = 'country-holes-tips-seen-v1';

/** Tiny WebAudio beeps — no asset pack required. */
function playGolfTone(kind = 'hit') {
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    if (!playGolfTone.ctx) playGolfTone.ctx = new Ctx();
    const ctx = playGolfTone.ctx;
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.connect(g);
    g.connect(ctx.destination);
    const now = ctx.currentTime;
    if (kind === 'pure') {
      o.type = 'triangle';
      o.frequency.setValueAtTime(520, now);
      o.frequency.exponentialRampToValueAtTime(780, now + 0.08);
      g.gain.setValueAtTime(0.0001, now);
      g.gain.exponentialRampToValueAtTime(0.12, now + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, now + 0.22);
      o.start(now);
      o.stop(now + 0.24);
    } else if (kind === 'water' || kind === 'ob') {
      o.type = 'sine';
      o.frequency.setValueAtTime(180, now);
      o.frequency.exponentialRampToValueAtTime(70, now + 0.28);
      g.gain.setValueAtTime(0.0001, now);
      g.gain.exponentialRampToValueAtTime(0.1, now + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, now + 0.35);
      o.start(now);
      o.stop(now + 0.38);
    } else if (kind === 'putt') {
      o.type = 'sine';
      o.frequency.setValueAtTime(340, now);
      g.gain.setValueAtTime(0.0001, now);
      g.gain.exponentialRampToValueAtTime(0.08, now + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, now + 0.12);
      o.start(now);
      o.stop(now + 0.14);
    } else {
      // hit / weak
      o.type = 'square';
      o.frequency.setValueAtTime(kind === 'weak' ? 140 : 220, now);
      o.frequency.exponentialRampToValueAtTime(90, now + 0.1);
      g.gain.setValueAtTime(0.0001, now);
      g.gain.exponentialRampToValueAtTime(0.09, now + 0.015);
      g.gain.exponentialRampToValueAtTime(0.0001, now + 0.16);
      o.start(now);
      o.stop(now + 0.18);
    }
  } catch {
    /* ignore */
  }
}

function readTipsSeen() {
  try {
    return JSON.parse(localStorage.getItem(TIPS_SEEN_KEY) || '{}') || {};
  } catch {
    return {};
  }
}

function markTipSeen(id) {
  try {
    const all = readTipsSeen();
    all[id] = true;
    localStorage.setItem(TIPS_SEEN_KEY, JSON.stringify(all));
  } catch {
    /* ignore */
  }
}

function readRoundSave(dayKey) {
  try {
    const raw = JSON.parse(localStorage.getItem(ROUND_SAVE_KEY) || 'null');
    if (!raw || raw.dayKey !== dayKey) return null;
    return raw;
  } catch {
    return null;
  }
}

function writeRoundSave(payload) {
  try {
    localStorage.setItem(ROUND_SAVE_KEY, JSON.stringify(payload));
  } catch {
    /* ignore */
  }
}

function clearRoundSave() {
  try {
    localStorage.removeItem(ROUND_SAVE_KEY);
  } catch {
    /* ignore */
  }
}

function readLocalBest(dayKey) {
  try {
    const all = JSON.parse(localStorage.getItem(LOCAL_BEST_KEY) || '{}') || {};
    return all[dayKey] || null;
  } catch {
    return null;
  }
}

function writeLocalBest(dayKey, result) {
  try {
    const all = JSON.parse(localStorage.getItem(LOCAL_BEST_KEY) || '{}') || {};
    const prev = all[dayKey];
    if (!prev || result.strokes < prev.strokes) {
      all[dayKey] = result;
      localStorage.setItem(LOCAL_BEST_KEY, JSON.stringify(all));
    }
  } catch {
    /* ignore */
  }
}

const PHASE = {
  aim: 'aim',
  swing: 'swing',
  flying: 'flying',
  result: 'result',
  puttPop: 'puttPop',
  holeEnd: 'holeEnd',
  roundEnd: 'roundEnd',
};

function puttPopupLabel(putts) {
  if (putts === 0) return { main: 'CHIP-IN!', sub: '0 putts' };
  if (putts === 1) return { main: '1 PUTT', sub: 'from here' };
  return { main: `${putts} PUTTS`, sub: 'from here' };
}

function lieLabel(lie) {
  switch (lie) {
    case 'tee': return 'Tee';
    case 'fairway': return 'Fairway';
    case 'rough': return 'Rough';
    case 'deepRough': return 'Deep rough';
    case 'bunker': return 'Bunker';
    case 'green': return 'Green';
    case 'water': return 'Water';
    case 'ob': return 'Out of bounds';
    default: return lie;
  }
}

function ScorecardStrip({ course, scorecard, holeIndex, holeStrokes, compact = false }) {
  const total = scorecard.every(Boolean)
    ? scorecard.reduce((s, h) => s + h.strokes, 0)
    : scorecard.reduce((s, h, i) => {
      if (h) return s + h.strokes;
      if (i === holeIndex && holeStrokes) return s + holeStrokes;
      return s;
    }, 0);
  return (
    <div className={`inline-flex min-w-full gap-0.5 rounded-lg bg-black/40 p-1 border border-white/15 ${compact ? '' : ''}`}>
      {course.holes.map((h, i) => {
        const sc = scorecard[i];
        const active = i === holeIndex;
        return (
          <div
            key={h.number}
            className={`min-w-[1.85rem] flex-1 rounded-md px-0.5 py-1 text-center ${
              active ? 'bg-emerald-500/35 text-white' : 'text-white/70'
            }`}
          >
            <div className="text-[9px] uppercase tracking-wide opacity-70">{h.number}</div>
            <div className="text-[10px] text-white/45">{h.par}</div>
            <div className="text-[12px] font-semibold text-white">
              {sc ? sc.strokes : (active && holeStrokes ? holeStrokes : '·')}
            </div>
          </div>
        );
      })}
      <div className="min-w-[2.2rem] rounded-md px-1 py-1 text-center text-emerald-200">
        <div className="text-[9px] uppercase tracking-wide opacity-70">Tot</div>
        <div className="text-[10px] text-white/45">{course.totalPar}</div>
        <div className="text-[12px] font-semibold">{total || '·'}</div>
      </div>
    </div>
  );
}

/** Map world yards → canvas with camera. */
function makeCamera(hole, cssW, cssH, cam) {
  const bounds = worldBounds(hole);
  const worldW = bounds.maxX - bounds.minX;
  const worldH = bounds.maxY - bounds.minY;
  const zoom = cam?.zoom ?? Math.min(cssW / worldW, cssH / worldH) * 0.92;
  const cx = cam?.x ?? (bounds.minX + bounds.maxX) / 2;
  const cy = cam?.y ?? (bounds.minY + bounds.maxY) / 2;
  return {
    zoom,
    x: cx,
    y: cy,
    toScreen(p) {
      return {
        x: cssW / 2 + (p.x - cx) * zoom,
        y: cssH / 2 - (p.y - cy) * zoom,
      };
    },
    toWorld(sx, sy) {
      return {
        x: cx + (sx - cssW / 2) / zoom,
        y: cy - (sy - cssH / 2) / zoom,
      };
    },
  };
}

/** HUD covers top/bottom of the game window — frame play into the clear band. */
const CAM_SAFE = { top: 0.16, bottom: 0.34 };

function camWithSafeArea(midX, midY, zoom, cssW, cssH) {
  const safeCy = cssH * (CAM_SAFE.top + (1 - CAM_SAFE.top - CAM_SAFE.bottom) * 0.5);
  // Shift world centre so midY lands on the safe-band centre (not under the controls)
  const camY = midY - (cssH / 2 - safeCy) / Math.max(0.01, zoom);
  return {
    x: midX,
    y: camY,
    zoom,
  };
}

/**
 * Progressive play camera: frame ball → pin so the tee drops away
 * after the first shot, and tighten hard once on/near the green.
 */
function playFocusCam(hole, focus, cssW, cssH) {
  const pin = hole.green;
  const dPin = Math.hypot(focus.x - pin.x, focus.y - pin.y);
  const onGreen = dPin <= hole.green.r * 1.2;
  const safeW = cssW * 0.94;
  const safeH = cssH * (1 - CAM_SAFE.top - CAM_SAFE.bottom);

  const greenR = hole.green.r;
  const sceneryR = hole.sceneryR || (hole.apronR || greenR + 8) + 18;
  if (onGreen) {
    // Frame green + scenery pad so edges aren't empty sky
    const span = sceneryR * 2.15;
    const zoom = Math.min(safeW / span, safeH / span) * 0.92;
    const midX = pin.x * 0.72 + focus.x * 0.28;
    const midY = pin.y * 0.72 + focus.y * 0.28;
    return camWithSafeArea(midX, midY, Math.max(3.8, Math.min(12, zoom)), cssW, cssH);
  }

  // Small look-behind so the ball isn't glued to the edge; never pull tee back in
  const awayX = focus.x - pin.x;
  const awayY = focus.y - pin.y;
  const alen = Math.hypot(awayX, awayY) || 1;
  const back = Math.min(36, 12 + dPin * 0.08);
  const behind = {
    x: focus.x + (awayX / alen) * back,
    y: focus.y + (awayY / alen) * back,
  };

  const pad = Math.max(24, Math.min(55, 16 + dPin * 0.14));
  // Always include green + scenery around the pin
  const greenPad = sceneryR * 1.05;
  const minX = Math.min(behind.x, focus.x, pin.x - greenPad) - pad * 0.35;
  const maxX = Math.max(behind.x, focus.x, pin.x + greenPad) + pad * 0.35;
  const minY = Math.min(behind.y, focus.y, pin.y - greenPad) - pad * 0.35;
  const maxY = Math.max(behind.y, focus.y, pin.y + greenPad) + pad * 0.35;
  const midX = (minX + maxX) / 2;
  const midY = (minY + maxY) / 2;
  const worldW = Math.max(maxX - minX, (hole.fairwayHalf + greenR) * 2);
  const worldH = maxY - minY;
  const zoom = Math.min(safeW / worldW, safeH / worldH) * 0.88;

  return camWithSafeArea(midX, midY, Math.max(1.15, Math.min(10, zoom)), cssW, cssH);
}

function focusPointForPlay(ball, phase, flightPath, flightIndex) {
  if (phase === PHASE.flying && flightPath?.length) {
    const idx = Math.min(flightIndex, flightPath.length - 1);
    const p = flightPath[idx];
    return { x: p.x, y: p.y };
  }
  return { x: ball.x, y: ball.y };
}

function drawPoly(ctx, cam, poly, fill, stroke) {
  if (!poly?.length) return;
  ctx.beginPath();
  poly.forEach((p, i) => {
    const s = cam.toScreen(p);
    if (i === 0) ctx.moveTo(s.x, s.y);
    else ctx.lineTo(s.x, s.y);
  });
  ctx.closePath();
  if (fill) {
    ctx.fillStyle = fill;
    ctx.fill();
  }
  if (stroke) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = 1.2;
    ctx.stroke();
  }
}

function drawCourse(ctx, hole, cam, tSec) {
  const { cssW, cssH } = cam;
  // Sky / apron
  const bg = ctx.createLinearGradient(0, 0, 0, cssH);
  bg.addColorStop(0, '#87b5c9');
  bg.addColorStop(0.35, '#c5d9a8');
  bg.addColorStop(1, '#6a8f4a');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, cssW, cssH);

  // Scenery pad under/around the green — fills any overspill so the pin never sits on void
  {
    const g0 = hole.green;
    const gs0 = cam.toScreen(g0);
    const scenR = (hole.sceneryR || (hole.apronR || g0.r + 8) + 18) * cam.zoom;
    ctx.beginPath();
    ctx.arc(gs0.x, gs0.y, scenR, 0, Math.PI * 2);
    const scrub = ctx.createRadialGradient(gs0.x, gs0.y, scenR * 0.25, gs0.x, gs0.y, scenR);
    scrub.addColorStop(0, '#4a6b34');
    scrub.addColorStop(0.55, '#3a5628');
    scrub.addColorStop(1, '#2d4420');
    ctx.fillStyle = scrub;
    ctx.fill();
  }

  // Deep rough (inside OB)
  drawPoly(ctx, cam, hole.roughOuter, '#4a6b32', '#3a5528');
  // White OB stakes along the rough boundary
  if (hole.roughOuter?.length) {
    ctx.save();
    for (let i = 0; i < hole.roughOuter.length; i += 3) {
      const p = hole.roughOuter[i];
      const s = cam.toScreen(p);
      ctx.fillStyle = '#f4f4f0';
      ctx.fillRect(s.x - 1.5, s.y - 7, 3, 8);
      ctx.fillStyle = 'rgba(255,255,255,0.35)';
      ctx.beginPath();
      ctx.arc(s.x, s.y - 8, 2.2, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }
  // Fairway with stripe hint
  drawPoly(ctx, cam, hole.fairway, '#6f9a45', '#5a8236');
  const stripes = hole.centerline;
  ctx.save();
  ctx.globalAlpha = 0.12;
  ctx.strokeStyle = '#dfe8c8';
  ctx.lineWidth = 6;
  for (let i = 0; i < stripes.length - 1; i += 2) {
    const a = cam.toScreen(stripes[i]);
    const b = cam.toScreen(stripes[i + 1]);
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
  }
  ctx.restore();

  // Water
  if (hole.water?.type === 'burn') {
    const y0 = hole.water.y0;
    const y1 = hole.water.y1;
    const skew = hole.water.skew || 0;
    const band = [
      { x: -100 + y0 * skew, y: y0 },
      { x: 100 + y0 * skew, y: y0 },
      { x: 100 + y1 * skew, y: y1 },
      { x: -100 + y1 * skew, y: y1 },
    ];
    drawPoly(ctx, cam, band, `rgba(40,110,160,${0.75 + Math.sin(tSec * 2) * 0.05})`, '#1e4f72');
    ctx.save();
    ctx.globalAlpha = 0.35;
    ctx.strokeStyle = 'rgba(180,220,255,0.55)';
    ctx.lineWidth = 1;
    for (let i = 0; i < 4; i += 1) {
      const yy = y0 + ((y1 - y0) * (i + 0.5)) / 4;
      const a = cam.toScreen({ x: -90 + yy * skew + Math.sin(tSec * 3 + i) * 2, y: yy });
      const b = cam.toScreen({ x: 90 + yy * skew + Math.sin(tSec * 3 + i + 1) * 2, y: yy });
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    }
    ctx.restore();
    const midY = (y0 + y1) / 2;
    const bx = hole.water.bridgeX + midY * skew * 0.15;
    const hw = hole.water.bridgeW / 2;
    drawPoly(ctx, cam, [
      { x: bx - hw, y: y0 - 1 },
      { x: bx + hw, y: y0 - 1 },
      { x: bx + hw, y: y1 + 1 },
      { x: bx - hw, y: y1 + 1 },
    ], '#8a7355', '#5c4a36');
  }
  if (hole.water?.type === 'island') {
    const g = hole.green;
    const s = cam.toScreen(g);
    const r = hole.water.waterR * cam.zoom;
    ctx.beginPath();
    ctx.arc(s.x, s.y, r, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(35,105,155,${0.78 + Math.sin(tSec * 2.2) * 0.04})`;
    ctx.fill();
    ctx.strokeStyle = '#1a4a6a';
    ctx.stroke();
    ctx.save();
    ctx.globalAlpha = 0.4;
    ctx.strokeStyle = 'rgba(200,230,255,0.5)';
    for (let i = 0; i < 3; i += 1) {
      const rr = r * (0.45 + i * 0.18);
      ctx.beginPath();
      ctx.ellipse(s.x + Math.sin(tSec + i) * 2, s.y, rr, rr * 0.35, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
    // Drop marker
    if (hole.water.drop) {
      const d = cam.toScreen(hole.water.drop);
      ctx.fillStyle = 'rgba(255,220,120,0.85)';
      ctx.beginPath();
      ctx.arc(d.x, d.y, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#fff8e0';
      ctx.font = '10px system-ui';
      ctx.fillText('DROP', d.x + 8, d.y + 3);
    }
  }

  // Bunkers
  for (const b of hole.bunkers || []) {
    const s = cam.toScreen(b);
    const r = b.r * cam.zoom;
    ctx.beginPath();
    ctx.ellipse(s.x, s.y, r * 1.15, r * 0.85, 0, 0, Math.PI * 2);
    const sand = ctx.createRadialGradient(s.x - r * 0.2, s.y - r * 0.2, 2, s.x, s.y, r);
    sand.addColorStop(0, '#e8d4a8');
    sand.addColorStop(1, '#c4a574');
    ctx.fillStyle = sand;
    ctx.fill();
    ctx.strokeStyle = '#a8844e';
    ctx.stroke();
    ctx.save();
    ctx.globalAlpha = 0.22;
    ctx.fillStyle = '#9a7a4a';
    for (let i = 0; i < 10; i += 1) {
      const ang = (i / 10) * Math.PI * 2 + tSec * 0.05;
      const rr = r * (0.25 + (i % 3) * 0.18);
      ctx.fillRect(s.x + Math.cos(ang) * rr - 1, s.y + Math.sin(ang) * rr * 0.7 - 1, 2, 2);
    }
    ctx.restore();
  }

  // Trees / scrub in the scenery ring (outside the putting surface)
  for (const blob of hole.scenery || []) {
    const s = cam.toScreen(blob);
    const r = blob.r * cam.zoom;
    if (blob.kind === 'tree') {
      ctx.beginPath();
      ctx.ellipse(s.x, s.y, r * 0.85, r * 1.05, 0, 0, Math.PI * 2);
      ctx.fillStyle = '#2a4a22';
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(s.x - r * 0.15, s.y - r * 0.2, r * 0.45, r * 0.5, 0, 0, Math.PI * 2);
      ctx.fillStyle = '#3a6a30';
      ctx.fill();
    } else {
      ctx.beginPath();
      ctx.ellipse(s.x, s.y, r * 1.2, r * 0.7, 0, 0, Math.PI * 2);
      ctx.fillStyle = '#455c2c';
      ctx.fill();
    }
  }

  // Collar / apron — full circle; pin is always dead centre of the green
  const g = hole.green;
  const gs = cam.toScreen(g);
  const gr = g.r * cam.zoom;
  const apronWorld = hole.apronR || (g.r + 8);
  const collarR = apronWorld * cam.zoom;
  ctx.beginPath();
  ctx.arc(gs.x, gs.y, collarR, 0, Math.PI * 2);
  ctx.fillStyle = '#6f9a48';
  ctx.fill();
  ctx.strokeStyle = '#4d7530';
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // Putting green disc — pin is always the centre; radius owns all putt rings
  ctx.beginPath();
  ctx.arc(gs.x, gs.y, gr, 0, Math.PI * 2);
  const greenGrad = ctx.createRadialGradient(gs.x - gr * 0.15, gs.y - gr * 0.15, 2, gs.x, gs.y, gr);
  greenGrad.addColorStop(0, '#9ad86f');
  greenGrad.addColorStop(0.55, '#6fbc4e');
  greenGrad.addColorStop(1, '#4f9a38');
  ctx.fillStyle = greenGrad;
  ctx.fill();
  ctx.strokeStyle = '#2f6a28';
  ctx.lineWidth = 2;
  ctx.stroke();

  // Filled putt rings: outer=3, pale=2, gold=1
  const rings = puttRingRadii(hole);
  const rGreen = rings.green * cam.zoom;
  const rPale = rings.pale * cam.zoom;
  const rGold = rings.gold * cam.zoom;

  // Outer band (3 putts) — cool rim
  ctx.beginPath();
  ctx.arc(gs.x, gs.y, rGreen, 0, Math.PI * 2);
  ctx.arc(gs.x, gs.y, rPale, 0, Math.PI * 2, true);
  ctx.fillStyle = 'rgba(30, 90, 140, 0.22)';
  ctx.fill();

  // Pale band (2 putts)
  ctx.beginPath();
  ctx.arc(gs.x, gs.y, rPale, 0, Math.PI * 2);
  ctx.arc(gs.x, gs.y, rGold, 0, Math.PI * 2, true);
  ctx.fillStyle = 'rgba(245, 248, 255, 0.38)';
  ctx.fill();

  // Gold band (1 putt)
  ctx.beginPath();
  ctx.arc(gs.x, gs.y, rGold, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(255, 200, 60, 0.42)';
  ctx.fill();

  ctx.lineWidth = Math.max(1.5, cam.zoom * 0.08);
  ctx.beginPath();
  ctx.arc(gs.x, gs.y, rGreen, 0, Math.PI * 2);
  ctx.strokeStyle = 'rgba(255,255,255,0.55)';
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(gs.x, gs.y, rPale, 0, Math.PI * 2);
  ctx.strokeStyle = 'rgba(255,255,255,0.75)';
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(gs.x, gs.y, rGold, 0, Math.PI * 2);
  ctx.strokeStyle = 'rgba(255, 210, 70, 0.95)';
  ctx.lineWidth = Math.max(2, cam.zoom * 0.1);
  ctx.stroke();

  // Ring labels (1 / 2 / 3 putts) — scale with zoom
  if (cam.zoom > 2.2) {
    const labelR = (r) => ({ x: gs.x, y: gs.y - r * 0.72 });
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `bold ${Math.max(11, Math.min(18, cam.zoom * 0.55))}px system-ui, sans-serif`;
    ctx.lineWidth = 3;
    ctx.strokeStyle = 'rgba(10,20,10,0.55)';
    ctx.fillStyle = '#ffe28a';
    const g1 = labelR(rGold);
    ctx.strokeText('1', g1.x, g1.y);
    ctx.fillText('1', g1.x, g1.y);
    ctx.fillStyle = '#f4f7ff';
    const g2 = labelR((rGold + rPale) / 2);
    ctx.strokeText('2', g2.x, g2.y);
    ctx.fillText('2', g2.x, g2.y);
    ctx.fillStyle = '#d6e8ff';
    const g3 = labelR((rPale + rGreen) / 2);
    ctx.strokeText('3', g3.x, g3.y);
    ctx.fillText('3', g3.x, g3.y);
    ctx.restore();
  }

  // Cup (the hole) — dark circle at green centre
  const cupR = Math.max(3, Math.min(7, cam.zoom * 0.22));
  ctx.beginPath();
  ctx.arc(gs.x, gs.y, cupR, 0, Math.PI * 2);
  ctx.fillStyle = '#1a1a18';
  ctx.fill();
  ctx.strokeStyle = '#444';
  ctx.lineWidth = 1;
  ctx.stroke();

  // Pin flag
  const flagH = Math.max(16, Math.min(28, cam.zoom * 0.85));
  ctx.beginPath();
  ctx.moveTo(gs.x, gs.y);
  ctx.lineTo(gs.x, gs.y - flagH);
  ctx.strokeStyle = '#222';
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(gs.x, gs.y - flagH);
  ctx.lineTo(gs.x + flagH * 0.55, gs.y - flagH + 5);
  ctx.lineTo(gs.x, gs.y - flagH + 10);
  ctx.fillStyle = '#e23d3d';
  ctx.fill();

  // Tee marker
  const tee = cam.toScreen(hole.tee);
  ctx.fillStyle = '#f0f4e8';
  ctx.beginPath();
  ctx.arc(tee.x, tee.y, 4, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#333';
  ctx.stroke();

  // Gust band
  if (hole.gust) {
    const a = cam.toScreen({ x: -90, y: hole.gust.y0 });
    const b = cam.toScreen({ x: 90, y: hole.gust.y1 });
    const top = Math.min(a.y, b.y);
    const bot = Math.max(a.y, b.y);
    const left = Math.min(a.x, b.x);
    const width = Math.abs(b.x - a.x);
    ctx.fillStyle = 'rgba(180,210,255,0.16)';
    ctx.fillRect(left, top, width, bot - top);
    ctx.save();
    ctx.strokeStyle = 'rgba(220,235,255,0.35)';
    ctx.lineWidth = 1;
    const drift = (tSec * 40) % 28;
    for (let x = left + drift; x < left + width; x += 28) {
      ctx.beginPath();
      ctx.moveTo(x, top + 4);
      ctx.lineTo(x + 12, (top + bot) / 2);
      ctx.lineTo(x, bot - 4);
      ctx.stroke();
    }
    ctx.restore();
    ctx.fillStyle = 'rgba(220,235,255,0.65)';
    ctx.font = '11px system-ui';
    ctx.fillText('GUST', left + 8, (top + bot) / 2 + 3);
  }

  // Fall-line shading + slope arrow (stronger when zoomed)
  const sx = g.slope.x;
  const sy = g.slope.y;
  const slopeMag = Math.hypot(sx, sy);
  if (slopeMag > 0.12) {
    const nx = sx / slopeMag;
    const ny = sy / slopeMag;
    ctx.save();
    if (cam.zoom > 2) {
      const shade = ctx.createLinearGradient(
        gs.x - nx * gr * 0.7,
        gs.y - ny * gr * 0.7,
        gs.x + nx * gr * 0.7,
        gs.y + ny * gr * 0.7,
      );
      shade.addColorStop(0, 'rgba(255,255,255,0.14)');
      shade.addColorStop(0.5, 'rgba(0,0,0,0)');
      shade.addColorStop(1, 'rgba(0,0,0,0.18)');
      ctx.beginPath();
      ctx.arc(gs.x, gs.y, gr, 0, Math.PI * 2);
      ctx.fillStyle = shade;
      ctx.fill();
    }
    const tip = cam.toScreen({ x: g.x + sx * 10, y: g.y + sy * 10 });
    ctx.strokeStyle = 'rgba(255,255,255,0.75)';
    ctx.lineWidth = Math.max(1.5, cam.zoom * 0.08);
    ctx.beginPath();
    ctx.moveTo(gs.x, gs.y);
    ctx.lineTo(tip.x, tip.y);
    ctx.stroke();
    // Arrowhead
    const ang = Math.atan2(tip.y - gs.y, tip.x - gs.x);
    ctx.beginPath();
    ctx.moveTo(tip.x, tip.y);
    ctx.lineTo(tip.x - Math.cos(ang - 0.45) * 7, tip.y - Math.sin(ang - 0.45) * 7);
    ctx.lineTo(tip.x - Math.cos(ang + 0.45) * 7, tip.y - Math.sin(ang + 0.45) * 7);
    ctx.closePath();
    ctx.fillStyle = 'rgba(255,255,255,0.8)';
    ctx.fill();
    if (cam.zoom > 2.4) {
      ctx.fillStyle = 'rgba(255,255,255,0.7)';
      ctx.font = '10px system-ui';
      ctx.fillText('breaks', tip.x + 6, tip.y - 4);
    }
    ctx.restore();
  }
}

function CountryHolesCanvas({
  hole,
  ball,
  phase,
  aimAngle,
  club,
  spin = ZERO_SPIN,
  powerMeter,
  powerMeterRef = null,
  flightPath,
  flightIndex,
  onAim,
  onSwingTap,
  camOverride = null,
  camKick = 0,
  chipsRef = null,
}) {
  const wrapRef = useRef(null);
  const canvasRef = useRef(null);
  const rafRef = useRef(0);
  const stateRef = useRef({});
  const onAimRef = useRef(onAim);
  const onSwingTapRef = useRef(onSwingTap);
  onAimRef.current = onAim;
  onSwingTapRef.current = onSwingTap;

  stateRef.current = {
    hole, ball, phase, aimAngle, club, spin, powerMeter, powerMeterRef, flightPath, flightIndex, camOverride, camKick,
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return undefined;
    const ctx = canvas.getContext('2d');
    let running = true;
    let lastCssW = 0;
    let lastCssH = 0;
    let lastDpr = 0;

    const resize = () => {
      const cssW = Math.max(320, Math.floor(wrap.clientWidth || 320));
      const cssH = Math.max(400, Math.floor(wrap.clientHeight || cssW * 0.8));
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      // Setting canvas.width clears the bitmap — only do it when size actually changes
      if (cssW !== lastCssW || cssH !== lastCssH || dpr !== lastDpr) {
        canvas.width = Math.floor(cssW * dpr);
        canvas.height = Math.floor(cssH * dpr);
        canvas.style.width = `${cssW}px`;
        canvas.style.height = `${cssH}px`;
        lastCssW = cssW;
        lastCssH = cssH;
        lastDpr = dpr;
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      return { cssW, cssH };
    };

    let size = resize();
    const onResize = () => { size = resize(); };
    window.addEventListener('resize', onResize);
    const ro = typeof ResizeObserver !== 'undefined'
      ? new ResizeObserver(() => { size = resize(); })
      : null;
    ro?.observe(wrap);

    const tick = (ts) => {
      if (!running) return;
      const s = stateRef.current;
      const { cssW, cssH } = size;
      const tSec = ts / 1000;
      let camSpec = s.camOverride;
      if (!camSpec) {
        const focus = focusPointForPlay(s.ball, s.phase, s.flightPath, s.flightIndex);
        camSpec = playFocusCam(s.hole, focus, cssW, cssH);
      }
      let cam = makeCamera(s.hole, cssW, cssH, camSpec);
      cam.cssW = cssW;
      cam.cssH = cssH;
      // Screen punch on strike
      const kick = Number(s.camKick) || 0;
      if (kick) {
        ctx.save();
        ctx.translate((Math.random() - 0.5) * kick, (Math.random() - 0.5) * kick);
      }

      ctx.clearRect(0, 0, cssW, cssH);
      drawCourse(ctx, s.hole, cam, tSec);

      // Aim: dashed = carry, solid ghost = expected stop (wind + roll)
      if (s.phase === PHASE.aim || s.phase === PHASE.swing) {
        const lie = s.ball.lie || surfaceAt(s.hole, s.ball);
        const previewPower = s.phase === PHASE.swing
          ? (s.powerMeterRef?.current ?? s.powerMeter)
          : (PURE_BAND.lo + PURE_BAND.hi) / 2;
        const prev = previewShot({
          hole: s.hole,
          ball: s.ball,
          aimAngle: s.aimAngle,
          power: previewPower,
          clubId: s.club.id,
          spin: s.spin,
        });
        const a = cam.toScreen(s.ball);
        const b = cam.toScreen(prev.land);
        const c = cam.toScreen(prev.stop);
        ctx.strokeStyle = s.phase === PHASE.swing ? 'rgba(255,210,90,0.85)' : 'rgba(255,255,255,0.55)';
        ctx.lineWidth = 2;
        ctx.setLineDash([6, 5]);
        ctx.beginPath();
        if (prev.guide?.length) {
          prev.guide.forEach((p, i) => {
            const sc = cam.toScreen(p);
            if (i === 0) ctx.moveTo(sc.x, sc.y);
            else ctx.lineTo(sc.x, sc.y);
          });
        } else {
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(b.x, b.y);
        }
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.strokeStyle = 'rgba(125, 211, 252, 0.9)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(b.x, b.y);
        ctx.lineTo(c.x, c.y);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(b.x, b.y, 4, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255,255,255,0.75)';
        ctx.fill();
        ctx.beginPath();
        ctx.arc(c.x, c.y, 6, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(125, 211, 252, 0.85)';
        ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,0.5)';
        ctx.stroke();

        const pinP = pinPowerForClub(s.club, distanceToPin(s.ball, s.hole), lie, {
          hole: s.hole,
          aimAngle: s.aimAngle,
          ball: s.ball,
        });
        // Flag on aim line at true pin distance (not the roll-stop marker)
        const pinDist = distanceToPin(s.ball, s.hole);
        const pinAim = {
          x: s.ball.x + Math.sin(s.aimAngle) * pinDist,
          y: s.ball.y + Math.cos(s.aimAngle) * pinDist,
        };
        const pinSc = cam.toScreen(pinAim);
        ctx.beginPath();
        ctx.moveTo(pinSc.x, pinSc.y - 8);
        ctx.lineTo(pinSc.x, pinSc.y + 2);
        ctx.strokeStyle = 'rgba(226,61,61,0.95)';
        ctx.lineWidth = 1.5;
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(pinSc.x, pinSc.y - 8);
        ctx.lineTo(pinSc.x + 7, pinSc.y - 5);
        ctx.lineTo(pinSc.x, pinSc.y - 2);
        ctx.fillStyle = 'rgba(226,61,61,0.9)';
        ctx.fill();

        ctx.fillStyle = 'rgba(255,255,255,0.65)';
        ctx.font = '10px system-ui';
        ctx.fillText('carry', b.x + 8, b.y - 10);
        ctx.fillStyle = 'rgba(186,230,253,0.95)';
        ctx.fillText(
          prev.spinLabel && prev.spinLabel !== 'no spin'
            ? `roll stop · ${prev.spinLabel}`
            : 'roll stop',
          c.x + 8,
          c.y + 4,
        );
        ctx.fillStyle = 'rgba(255,180,180,0.9)';
        ctx.fillText(`PIN power ~${pinP}`, pinSc.x + 8, pinSc.y - 10);
      }

      // Landing chips
      const chips = chipsRef?.current;
      if (chips?.length) {
        for (let i = chips.length - 1; i >= 0; i -= 1) {
          const p = chips[i];
          p.life -= 0.035;
          p.x += p.vx;
          p.y += p.vy;
          p.vy += 0.08;
          if (p.life <= 0) {
            chips.splice(i, 1);
            continue;
          }
          const sc = cam.toScreen(p);
          ctx.globalAlpha = Math.max(0, p.life);
          ctx.fillStyle = p.color;
          ctx.fillRect(sc.x, sc.y, 2.5, 2.5);
          ctx.globalAlpha = 1;
        }
      }

      // Flight path
      if (s.phase === PHASE.flying && s.flightPath?.length) {
        const idx = Math.min(s.flightIndex, s.flightPath.length - 1);
        ctx.strokeStyle = 'rgba(255,255,255,0.35)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        s.flightPath.forEach((p, i) => {
          if (i > idx) return;
          const sc = cam.toScreen(p);
          const lift = (p.z || 0) * cam.zoom * 0.35;
          if (i === 0) ctx.moveTo(sc.x, sc.y - lift);
          else ctx.lineTo(sc.x, sc.y - lift);
        });
        ctx.stroke();
        const cur = s.flightPath[idx];
        const sc = cam.toScreen(cur);
        const lift = (cur.z || 0) * cam.zoom * 0.35;
        // Shadow
        ctx.beginPath();
        ctx.ellipse(sc.x, sc.y, 4, 2, 0, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(0,0,0,0.25)';
        ctx.fill();
        // Ball
        ctx.beginPath();
        ctx.arc(sc.x, sc.y - lift, 4.5, 0, Math.PI * 2);
        ctx.fillStyle = '#f7f7f2';
        ctx.fill();
        ctx.strokeStyle = '#bbb';
        ctx.stroke();
      } else {
        // Resting ball
        const sc = cam.toScreen(s.ball);
        ctx.beginPath();
        ctx.ellipse(sc.x, sc.y + 2, 5, 2.5, 0, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(0,0,0,0.22)';
        ctx.fill();
        ctx.beginPath();
        ctx.arc(sc.x, sc.y, 5, 0, Math.PI * 2);
        ctx.fillStyle = '#f4f4ee';
        ctx.fill();
        ctx.strokeStyle = '#aaa';
        ctx.stroke();
      }

      if (kick) ctx.restore();
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);

    const onPointer = (e) => {
      const s = stateRef.current;
      if (s.phase !== PHASE.aim) return;
      const rect = canvas.getBoundingClientRect();
      const sx = e.clientX - rect.left;
      const sy = e.clientY - rect.top;
      let camSpec = s.camOverride;
      if (!camSpec) {
        camSpec = playFocusCam(
          s.hole,
          focusPointForPlay(s.ball, s.phase, s.flightPath, s.flightIndex),
          rect.width,
          rect.height,
        );
      }
      const cam = makeCamera(s.hole, rect.width, rect.height, camSpec);
      const world = cam.toWorld(sx, sy);
      const ang = Math.atan2(world.x - s.ball.x, world.y - s.ball.y);
      onAimRef.current?.(ang);
    };

    const onClick = (e) => {
      const s = stateRef.current;
      if (s.phase === PHASE.swing) {
        onSwingTapRef.current?.();
        return;
      }
      if (s.phase === PHASE.aim) onPointer(e);
    };

    const onMove = (e) => {
      if (e.buttons === 1 && stateRef.current.phase === PHASE.aim) onPointer(e);
    };

    canvas.addEventListener('pointerdown', onClick);
    canvas.addEventListener('pointermove', onMove);

    return () => {
      running = false;
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener('resize', onResize);
      ro?.disconnect();
      canvas.removeEventListener('pointerdown', onClick);
      canvas.removeEventListener('pointermove', onMove);
    };
  }, []);

  return (
    <div ref={wrapRef} className="absolute inset-0">
      <canvas ref={canvasRef} className="block w-full h-full touch-none select-none" />
    </div>
  );
}

function SwingMeter({ power, pinPower, active, fillRef }) {
  const pureLo = PURE_BAND.lo;
  const pureHi = PURE_BAND.hi;
  const barRef = useRef(null);
  const labelRef = useRef(null);

  // Direct DOM updates during swing — no React/CSS lag between eye and Stop
  useEffect(() => {
    if (!fillRef) return undefined;
    fillRef.current = (p) => {
      const el = barRef.current;
      if (el) el.style.width = `${clampPct(p)}%`;
      if (labelRef.current) labelRef.current.textContent = String(Math.round(p));
    };
    return () => {
      fillRef.current = null;
    };
  }, [fillRef]);

  return (
    <div className="space-y-1">
      <div className="flex justify-between text-[10px] uppercase tracking-wide text-white/55">
        <span>Swing meter</span>
        <span className="normal-case tracking-normal" ref={labelRef}>
          {active ? `${Math.round(power)}` : 'Stop in the green band'}
        </span>
      </div>
      <div className="relative h-3.5 rounded-full bg-black/55 border border-white/20 overflow-hidden">
        <div
          ref={barRef}
          className="absolute inset-y-0 bg-amber-400/90"
          style={{ width: `${clampPct(power)}%` }}
        />
        <div
          className="absolute inset-y-0 bg-emerald-400/45"
          style={{
            left: `${pureLo}%`,
            width: `${pureHi - pureLo}%`,
          }}
          title="Pure timing — ideal stop"
        />
        {pinPower != null ? (
          <div
            className="absolute top-0 bottom-0 w-0.5 bg-sky-300"
            style={{ left: `${clampPct(pinPower)}%` }}
            title="PIN — power for carry to the flag (roll is extra)"
          />
        ) : null}
      </div>
      <div className="flex justify-between text-[10px] text-white/45">
        <span>Weak</span>
        <span className="text-emerald-300/90">Green = pure (ideal)</span>
        <span className="text-sky-300/80">Blue = PIN (carry to flag)</span>
        <span>Over</span>
      </div>
    </div>
  );
}

function clampPct(n) {
  return Math.max(0, Math.min(100, Number(n) || 0));
}

function initialBall(hole) {
  return {
    x: hole.tee.x,
    y: hole.tee.y,
    lie: 'tee',
  };
}

/**
 * Golf Clash–style spin pad: drag the ball up/down for top/backspin,
 * left/right for curl. Tap the ball icon to open.
 */
function GolfClashSpinPad({ spin, club, onChange, disabled = false }) {
  const [open, setOpen] = useState(false);
  const padRef = useRef(null);
  const dragging = useRef(false);
  const limits = spinLimitsForClub(club);
  const sp = clampSpin(spin, club);
  const hasSpin = Math.abs(sp.top) > 0.08 || Math.abs(sp.side) > 0.08;

  const applyFromPointer = (clientX, clientY) => {
    const el = padRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const R = Math.min(rect.width, rect.height) * 0.42;
    let dx = clientX - cx;
    let dy = clientY - cy;
    const len = Math.hypot(dx, dy);
    if (len > R) {
      dx = (dx / len) * R;
      dy = (dy / len) * R;
    }
    // Screen: +x right, +y down → side +, top = −dy
    const side = (dx / R) * limits.side;
    const top = (-dy / R) * limits.top;
    onChange(clampSpin({ top, side }, club));
  };

  const onPointerDown = (e) => {
    if (disabled) return;
    dragging.current = true;
    e.currentTarget.setPointerCapture?.(e.pointerId);
    applyFromPointer(e.clientX, e.clientY);
  };
  const onPointerMove = (e) => {
    if (!dragging.current) return;
    applyFromPointer(e.clientX, e.clientY);
  };
  const onPointerUp = () => { dragging.current = false; };

  const ballX = (sp.side / Math.max(0.01, limits.side)) * 42;
  const ballY = (-sp.top / Math.max(0.01, limits.top)) * 42;

  if (!open) {
    return (
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen(true)}
        className={`pointer-events-auto flex h-12 w-12 flex-col items-center justify-center rounded-full border shadow-lg disabled:opacity-40 ${
          hasSpin
            ? 'border-sky-300/60 bg-sky-500/25 text-sky-50'
            : 'border-white/25 bg-black/55 text-white/90'
        }`}
        title="Spin — topspin, backspin, curl"
      >
        <span className="text-[15px] leading-none">◉</span>
        <span className="text-[8px] uppercase tracking-wide opacity-80">Spin</span>
      </button>
    );
  }

  return (
    <div className="pointer-events-auto w-[11.5rem] rounded-2xl border border-sky-300/35 bg-[#0a1520]/95 p-2.5 shadow-2xl backdrop-blur-sm">
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <div className="text-[10px] font-semibold uppercase tracking-wide text-sky-100/90">Ball spin</div>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="rounded-md px-1.5 py-0.5 text-[10px] text-white/70 hover:bg-white/10"
        >
          Done
        </button>
      </div>
      <div
        ref={padRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        className="relative mx-auto h-36 w-36 touch-none select-none rounded-full border-2 border-sky-400/40 bg-[radial-gradient(circle_at_50%_45%,#2a4a62_0%,#0d1a28_70%)]"
        style={{ cursor: 'grab' }}
      >
        <div className="pointer-events-none absolute inset-x-0 top-1 text-center text-[9px] font-semibold uppercase tracking-wider text-emerald-200/80">
          Top
        </div>
        <div className="pointer-events-none absolute inset-x-0 bottom-1 text-center text-[9px] font-semibold uppercase tracking-wider text-amber-200/80">
          Back
        </div>
        <div className="pointer-events-none absolute left-1 top-1/2 -translate-y-1/2 text-[9px] font-semibold uppercase text-white/55">
          L
        </div>
        <div className="pointer-events-none absolute right-1 top-1/2 -translate-y-1/2 text-[9px] font-semibold uppercase text-white/55">
          R
        </div>
        {/* Crosshair */}
        <div className="pointer-events-none absolute left-1/2 top-3 bottom-3 w-px -translate-x-1/2 bg-white/15" />
        <div className="pointer-events-none absolute top-1/2 left-3 right-3 h-px -translate-y-1/2 bg-white/15" />
        {/* Draggable ball */}
        <div
          className="pointer-events-none absolute left-1/2 top-1/2 h-9 w-9 -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/50 bg-[radial-gradient(circle_at_35%_30%,#fff,#d8d8d0_55%,#a8a89e)] shadow-md"
          style={{ transform: `translate(calc(-50% + ${ballX}px), calc(-50% + ${ballY}px))` }}
        />
      </div>
      <div className="mt-1.5 flex items-center justify-between gap-2 text-[10px] text-white/70">
        <span>
          {sp.top > 0.1 ? 'Topspin' : sp.top < -0.1 ? 'Backspin' : 'Flat'}
          {Math.abs(sp.side) > 0.1 ? (sp.side > 0 ? ' · Curl R' : ' · Curl L') : ''}
        </span>
        <button
          type="button"
          onClick={() => onChange({ ...ZERO_SPIN })}
          className="rounded px-1.5 py-0.5 text-sky-200/90 hover:bg-white/10"
        >
          Reset
        </button>
      </div>
      <p className="mt-1 text-[9px] leading-snug text-white/45">
        Drag ball: up = more roll, down = check/stop, sides = curl flight + bounce.
      </p>
    </div>
  );
}

export default function CountryHolesPanel({
  sandbox = true,
  allowFuture = false,
  onRoundComplete = null,
  leaderboard = [],
  currentUserUid = null,
  streakLabel = null,
}) {
  const todayKey = getLondonDayKey();
  const [dayKey, setDayKey] = useState(todayKey);
  const course = useMemo(() => generateCourse(dayKey), [dayKey]);
  const [holeIndex, setHoleIndex] = useState(0);
  const hole = course.holes[holeIndex];

  const [ball, setBall] = useState(() => initialBall(course.holes[0]));
  const [aimAngle, setAimAngle] = useState(0);
  const [clubId, setClubId] = useState('7i');
  const [spin, setSpin] = useState(() => ({ ...ZERO_SPIN }));
  const [phase, setPhase] = useState(PHASE.aim);
  const [powerMeter, setPowerMeter] = useState(0);
  const [meterDir, setMeterDir] = useState(1);
  const [flightPath, setFlightPath] = useState([]);
  const [flightIndex, setFlightIndex] = useState(0);
  const [holeStrokes, setHoleStrokes] = useState(0);
  const [scorecard, setScorecard] = useState(() => Array(9).fill(null));
  const [lastShot, setLastShot] = useState(null);
  const [message, setMessage] = useState('Tap the course to aim, then Swing.');
  const [localBest, setLocalBest] = useState(() => readLocalBest(dayKey));
  const [camOverride, setCamOverride] = useState(null);
  const [flyover, setFlyover] = useState(false);
  const [camKick, setCamKick] = useState(0);
  const [coachTip, setCoachTip] = useState(null);
  const [puttPopup, setPuttPopup] = useState(null);
  const [hydrated, setHydrated] = useState(false);
  const pendingResultRef = useRef(null);
  const powerMeterRef = useRef(0);
  const meterFillRef = useRef(null);
  const swingLockedRef = useRef(false);
  const chipsRef = useRef([]);
  const skipDayResetRef = useRef(false);
  const { play: playUi } = useGameUiSound();

  const club = CLUBS.find((c) => c.id === clubId) || CLUBS[3];

  const spawnChips = useCallback((world, color) => {
    const list = chipsRef.current;
    for (let i = 0; i < 10; i += 1) {
      list.push({
        x: world.x + (Math.random() - 0.5) * 2,
        y: world.y + (Math.random() - 0.5) * 2,
        vx: (Math.random() - 0.5) * 1.2,
        vy: -0.6 - Math.random() * 1.2,
        life: 0.7 + Math.random() * 0.4,
        color,
      });
    }
  }, []);

  const showTip = useCallback((id, text) => {
    const seen = readTipsSeen();
    if (seen[id]) return;
    markTipSeen(id);
    setCoachTip(text);
    window.setTimeout(() => setCoachTip((cur) => (cur === text ? null : cur)), 4200);
  }, []);

  const startFlyover = useCallback((h) => {
    const startZoom = 2.4;
    const endZoom = 1.2;
    setFlyover(true);
    setCamOverride({ x: h.tee.x, y: h.tee.y, zoom: startZoom });
    setMessage(`Hole ${h.number} · Par ${h.par} · ${h.lengthYds} yds · ${h.shapeLabel || ''}`);
    const t0 = performance.now();
    const duration = 1400;
    let raf = 0;
    const step = (now) => {
      const u = Math.min(1, (now - t0) / duration);
      const ease = u * u * (3 - 2 * u);
      setCamOverride({
        x: h.tee.x + (h.green.x - h.tee.x) * ease,
        y: h.tee.y + (h.green.y - h.tee.y) * ease,
        zoom: startZoom + (endZoom - startZoom) * ease,
      });
      if (u < 1) {
        raf = requestAnimationFrame(step);
      } else {
        setCamOverride(null);
        setFlyover(false);
        setMessage(`Hole ${h.number} · Par ${h.par} · ${h.lengthYds} yds · ${h.shapeLabel || ''} — tap to aim.`);
      }
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, []);

  const resetHole = useCallback((idx, c = course, { fly = true } = {}) => {
    const h = c.holes[idx];
    const b = initialBall(h);
    setBall(b);
    setAimAngle(angleToGreen(b, h));
    const d = distanceToPin(b, h);
    const sug = suggestClub(d, 'tee');
    setClubId(sug.id);
    setPhase(PHASE.aim);
    setPowerMeter(0);
    setFlightPath([]);
    setFlightIndex(0);
    setHoleStrokes(0);
    setLastShot(null);
    setPuttPopup(null);
    setSpin({ ...ZERO_SPIN });
    if (fly) startFlyover(h);
    else setMessage(`Hole ${h.number} · Par ${h.par} — tap to aim.`);
  }, [course, startFlyover]);

  // Restore in-progress round or start fresh when day changes
  useEffect(() => {
    setLocalBest(readLocalBest(dayKey));
    const saved = readRoundSave(dayKey);
    if (saved && Array.isArray(saved.scorecard) && saved.phase !== PHASE.roundEnd) {
      skipDayResetRef.current = true;
      setHoleIndex(saved.holeIndex || 0);
      setScorecard(saved.scorecard);
      setHoleStrokes(saved.holeStrokes || 0);
      setBall(saved.ball || initialBall(course.holes[saved.holeIndex || 0]));
      setAimAngle(saved.aimAngle ?? 0);
      setClubId(saved.clubId || '7i');
      setPhase(
        saved.phase === PHASE.flying || saved.phase === PHASE.swing
          ? PHASE.aim
          : (saved.phase || PHASE.aim),
      );
      setMessage(saved.message || 'Round restored — tap to aim.');
      setHydrated(true);
      return;
    }
    setHoleIndex(0);
    setScorecard(Array(9).fill(null));
    resetHole(0, course);
    setHydrated(true);
  }, [dayKey, course, resetHole]);

  // Autosave mid-round
  useEffect(() => {
    if (!hydrated) return;
    if (phase === PHASE.roundEnd) {
      clearRoundSave();
      return;
    }
    writeRoundSave({
      dayKey,
      holeIndex,
      scorecard,
      holeStrokes,
      ball,
      aimAngle,
      clubId,
      phase,
      message,
    });
  }, [hydrated, dayKey, holeIndex, scorecard, holeStrokes, ball, aimAngle, clubId, phase, message]);

  // Decay camera kick
  useEffect(() => {
    if (!camKick) return undefined;
    const id = window.setInterval(() => {
      setCamKick((k) => (k <= 0.4 ? 0 : k * 0.7));
    }, 40);
    return () => window.clearInterval(id);
  }, [camKick]);

  // Auto-pick a lie-appropriate club when the ball moves / lie changes
  useEffect(() => {
    if (phase !== PHASE.aim) return;
    const sug = suggestClub(distanceToPin(ball, hole), ball.lie || 'fairway');
    setClubId(sug.id);
    const lie = ball.lie || 'tee';
    if (lie === 'rough' || lie === 'deepRough') {
      showTip('rough', 'Rough cuts distance — longest club is limited. Chip out if needed.');
    }
  }, [ball.x, ball.y, ball.lie, hole, phase, showTip]);

  // Keep spin within the current club’s limits (wedges get more check)
  useEffect(() => {
    setSpin((prev) => clampSpin(prev, club));
  }, [club.id]);

  // Swing meter
  useEffect(() => {
    if (phase !== PHASE.swing) return undefined;
    swingLockedRef.current = false;
    let raf = 0;
    let last = performance.now();
    let p = 0;
    let dir = 1;
    powerMeterRef.current = 0;
    setPowerMeter(0);
    meterFillRef.current?.(0);
    const step = (now) => {
      if (swingLockedRef.current) return;
      const dt = Math.min(0.032, (now - last) / 1000);
      last = now;
      p += dir * dt * METER_SPEED;
      if (p >= METER_MAX) {
        p = METER_MAX;
        dir = -1;
      } else if (p <= 0) {
        p = 0;
        dir = 1;
      }
      powerMeterRef.current = p;
      meterFillRef.current?.(p);
      setMeterDir(dir);
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [phase]);

  // Flight playback
  useEffect(() => {
    if (phase !== PHASE.flying || !flightPath.length) return undefined;
    let i = 0;
    const id = setInterval(() => {
      i += 1;
      if (i >= flightPath.length) {
        clearInterval(id);
        setFlightIndex(flightPath.length - 1);
        return;
      }
      setFlightIndex(i);
    }, 28);
    return () => clearInterval(id);
  }, [phase, flightPath]);

  const beginHoleOut = useCallback((total, putts) => {
    setHoleStrokes(total);
    setScorecard((prev) => {
      const next = [...prev];
      next[holeIndex] = { strokes: total, par: hole.par };
      return next;
    });
    const pop = puttPopupLabel(putts);
    setPuttPopup({ ...pop, putts });
    setPhase(PHASE.puttPop);
    setMessage(
      `${holeResultLabel(total, hole.par)} · ${total} (incl. ${putts} putt${putts === 1 ? '' : 's'})`,
    );
    playGolfTone('putt');
    playUi('tap');
  }, [hole, holeIndex, playUi]);

  const finishShot = useCallback((result) => {
    pendingResultRef.current = null;
    setBall({ x: result.stop.x, y: result.stop.y, lie: result.lie });
    setLastShot(result);
    const strokes = holeStrokes + result.strokesAdd;
    setHoleStrokes(strokes);

    const chipColor = result.lie === 'bunker'
      ? '#e8d4a8'
      : result.lie === 'green'
        ? '#9ad86f'
        : '#6f9a45';
    spawnChips(result.stop, chipColor);

    if (result.dropFrom === 'ob') {
      playGolfTone('ob');
      showTip('ob', 'Out of bounds — stroke & distance: +2 and replay from the last spot.');
    } else if (result.dropFrom) {
      playGolfTone('water');
    } else if (result.timing === 'pure') {
      playGolfTone('pure');
    } else if (result.timing === 'weak') {
      playGolfTone('weak');
    } else {
      playGolfTone('hit');
    }

    if (hole.gust && !result.holeOut) {
      showTip('gust', 'Gust band mid-hole pushes high-loft clubs sideways.');
    }

    if (result.onGreen && result.putts != null) {
      beginHoleOut(strokes + result.putts, result.putts);
      return;
    }

    setPhase(PHASE.result);
    const bits = [];
    if (result.dropFrom === 'ob') bits.push('OB · stroke & distance (+2)');
    else if (result.dropFrom) bits.push('Water · +1 · dropped');
    bits.push(lieLabel(result.lie));
    bits.push(result.timing);
    setMessage(bits.join(' · '));
  }, [beginHoleOut, hole, holeStrokes, showTip, spawnChips]);

  useEffect(() => {
    if (phase !== PHASE.puttPop) return undefined;
    const id = window.setTimeout(() => {
      setPuttPopup(null);
      setPhase(PHASE.holeEnd);
    }, 1750);
    return () => window.clearTimeout(id);
  }, [phase]);

  useEffect(() => {
    if (phase !== PHASE.flying || !flightPath.length) return undefined;
    if (flightIndex < flightPath.length - 1) return undefined;
    const result = pendingResultRef.current;
    if (!result) return undefined;
    finishShot(result);
    return undefined;
  }, [phase, flightIndex, flightPath, finishShot]);

  const startSwing = () => {
    if (phase !== PHASE.aim) return;
    swingLockedRef.current = false;
    setPowerMeter(0);
    powerMeterRef.current = 0;
    setMeterDir(1);
    setPhase(PHASE.swing);
    setMessage('Tap Stop in the green band.');
  };

  const lockSwing = () => {
    if (phase !== PHASE.swing || swingLockedRef.current) return;
    swingLockedRef.current = true;
    const power = powerMeterRef.current;
    meterFillRef.current?.(power);
    setPowerMeter(power);
    setCamKick(6);
    playGolfTone(power >= PURE_BAND.lo && power <= PURE_BAND.hi ? 'pure' : 'hit');
    playUi('click');
    const result = simulateShot({
      hole,
      ball,
      aimAngle,
      power,
      clubId: club.id,
      spin,
    });
    setFlightPath(result.path);
    setFlightIndex(0);
    pendingResultRef.current = result;
    setPhase(PHASE.flying);
    setMessage(result.spinLabel && result.spinLabel !== 'no spin'
      ? `Ball in flight… (${result.spinLabel})`
      : 'Ball in flight…');
  };

  const continueAfterResult = () => {
    if (phase === PHASE.result) {
      setPhase(PHASE.aim);
      setAimAngle(angleToGreen(ball, hole));
      setMessage('Tap to aim your next shot.');
    }
  };

  const finalizeRound = useCallback((card) => {
    const strokes = card.reduce((s, h) => s + (h?.strokes || 0), 0);
    const par = course.totalPar;
    const result = {
      strokes,
      par,
      toPar: strokes - par,
      dayKey,
      name: course.name,
      scorecard: card,
    };
    writeLocalBest(dayKey, result);
    setLocalBest(readLocalBest(dayKey));
    clearRoundSave();
    setPhase(PHASE.roundEnd);
    setMessage(`Round complete · ${strokes} (${formatScoreToPar(strokes, par)})`);
    onRoundComplete?.(result);
  }, [course.name, course.totalPar, dayKey, onRoundComplete]);

  const commitHoleAndAdvance = () => {
    const card = [...scorecard];
    if (!card[holeIndex]) {
      card[holeIndex] = { strokes: holeStrokes, par: hole.par };
      setScorecard(card);
    }
    if (holeIndex >= 8) {
      finalizeRound(card);
      return;
    }
    const next = holeIndex + 1;
    setHoleIndex(next);
    resetHole(next);
  };

  const skipHole = () => {
    const nextCard = [...scorecard];
    nextCard[holeIndex] = { strokes: hole.par + 3, par: hole.par, skipped: true };
    setScorecard(nextCard);
    if (holeIndex >= 8) {
      finalizeRound(nextCard);
      return;
    }
    const next = holeIndex + 1;
    setHoleIndex(next);
    resetHole(next);
  };

  const pinPower = pinPowerForClub(
    club,
    distanceToPin(ball, hole),
    ball.lie || 'fairway',
    { hole, aimAngle, ball },
  );

  const totalSoFar = scorecard.reduce((s, h, i) => {
    if (i === holeIndex && phase !== PHASE.roundEnd) return s + holeStrokes;
    return s + (h?.strokes || 0);
  }, 0);

  const lieClubs = clubsForLie(ball.lie || 'fairway');
  const clubIdx = Math.max(0, lieClubs.findIndex((c) => c.id === clubId));
  const clubLocked = phase === PHASE.flying || phase === PHASE.swing || flyover;
  const cycleClub = (dir) => {
    if (clubLocked || !lieClubs.length) return;
    const idx = clubIdx >= 0 ? clubIdx : 0;
    const next = (idx + dir + lieClubs.length) % lieClubs.length;
    setClubId(lieClubs[next].id);
  };

  let primaryLabel = 'Swing';
  let primaryAction = startSwing;
  let primaryDisabled = flyover;
  let primaryClass = 'bg-emerald-500 hover:bg-emerald-400 text-white';
  if (phase === PHASE.swing) {
    primaryLabel = 'Stop';
    primaryAction = lockSwing;
    primaryDisabled = false;
    primaryClass = 'bg-amber-400 hover:bg-amber-300 text-slate-900';
  } else if (phase === PHASE.flying || phase === PHASE.result) {
    primaryLabel = '…';
    primaryAction = () => {};
    primaryDisabled = true;
    primaryClass = 'bg-slate-600 text-slate-300';
  }

  const wind = hole.wind;
  const pinYds = Math.round(distanceToPin(ball, hole));
  const slopeMag = Math.hypot(hole.green.slope?.x || 0, hole.green.slope?.y || 0);
  const finalStrokes = scorecard.reduce((s, h) => s + (h?.strokes || 0), 0);

  return (
    <div className="space-y-3 w-full max-w-4xl">
      <div className="flex flex-wrap items-center justify-between gap-2 px-0.5">
        <p className="text-xs text-emerald-200/85">
          {sandbox
            ? 'Admin sandbox · practice any day'
            : 'Daily course · company leaderboard for today’s London score'}
        </p>
        <FunDayPicker
          dayKey={dayKey}
          todayKey={todayKey}
          onChange={setDayKey}
          allowFuture={Boolean(allowFuture || sandbox)}
        />
      </div>

      <div
        className="relative w-full overflow-hidden rounded-2xl border border-[#243352] bg-[#071018] shadow-[0_12px_40px_rgba(0,0,0,0.45)] aspect-[4/5] sm:aspect-[5/4] min-h-[480px] max-h-[720px]"
      >
        <CountryHolesCanvas
          hole={hole}
          ball={ball}
          phase={phase}
          aimAngle={aimAngle}
          club={club}
          spin={spin}
          powerMeter={powerMeter}
          powerMeterRef={powerMeterRef}
          flightPath={flightPath}
          flightIndex={flightIndex}
          onAim={setAimAngle}
          onSwingTap={lockSwing}
          camOverride={camOverride}
          camKick={camKick}
          chipsRef={chipsRef}
        />

        <div className="pointer-events-none absolute inset-x-0 top-0 z-10 bg-gradient-to-b from-black/65 via-black/25 to-transparent px-3 pt-2.5 pb-8">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold text-white drop-shadow">
                {course.name}
              </div>
              <div className="mt-0.5 flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-[11px] text-white/85">
                <span>H{hole.number} · Par {hole.par}</span>
                <span className="text-emerald-200/90">{hole.shapeLabel}</span>
                <span>{pinYds}y</span>
                <span>{lieLabel(ball.lie || 'tee')}</span>
                <span>Str <strong className="text-white">{holeStrokes}</strong></span>
                <span className="inline-flex items-center gap-1 text-sky-100/90">
                  <span
                    className="inline-block"
                    style={{ transform: `rotate(${Math.atan2(wind.x, wind.y)}rad)` }}
                    aria-hidden
                  >
                    ▲
                  </span>
                  {wind.speed.toFixed(1)}
                </span>
                {slopeMag > 0.2 ? (
                  <span className="text-white/70">breaks {slopeMag.toFixed(1)}</span>
                ) : null}
              </div>
            </div>
            <div className="shrink-0 text-right text-[11px] text-white/55">
              <div>Round {totalSoFar || '—'}</div>
              {localBest ? <div>Best {localBest.strokes}</div> : null}
              {streakLabel ? <div className="text-amber-200/80">{streakLabel}</div> : null}
            </div>
          </div>
        </div>

        {/* Golf Clash–style spin control (aim only) */}
        {phase === PHASE.aim || phase === PHASE.swing ? (
          <div className="absolute right-2 top-14 z-20 sm:top-16">
            <GolfClashSpinPad
              spin={spin}
              club={club}
              onChange={setSpin}
              disabled={phase !== PHASE.aim || flyover}
            />
          </div>
        ) : null}

        {coachTip ? (
          <div className="pointer-events-none absolute inset-x-0 top-16 z-20 px-3 text-center">
            <div className="inline-block max-w-[92%] rounded-xl border border-amber-300/30 bg-black/65 px-3 py-2 text-[12px] text-amber-50/95 backdrop-blur-sm">
              {coachTip}
            </div>
          </div>
        ) : null}

        {phase !== PHASE.holeEnd && phase !== PHASE.roundEnd && phase !== PHASE.result ? (
          <div className="pointer-events-none absolute inset-x-0 bottom-[9.5rem] z-10 px-3 text-center sm:bottom-[8.75rem]">
            {message ? (
              <div className="inline-block max-w-[92%] rounded-full bg-black/50 px-3 py-1.5 text-[12px] text-white/90 backdrop-blur-sm border border-white/10 shadow">
                {message}
              </div>
            ) : null}
          </div>
        ) : null}

        {phase === PHASE.puttPop && puttPopup ? (
          <div className="pointer-events-none absolute inset-0 z-40 flex items-center justify-center">
            <style>
              {`@keyframes ch-putt-pop {
                0% { transform: translateY(28px) scale(0.35); opacity: 0; filter: blur(4px); }
                18% { transform: translateY(0) scale(1.35); opacity: 1; filter: blur(0); }
                55% { transform: translateY(-10px) scale(1.1); opacity: 1; }
                100% { transform: translateY(-56px) scale(0.95); opacity: 0; }
              }
              @keyframes ch-putt-burst {
                0% { opacity: 0; transform: scale(0.4); }
                30% { opacity: 1; }
                100% { opacity: 0; transform: scale(1.8); }
              }`}
            </style>
            <div
              className="absolute h-40 w-40 rounded-full border-2 border-amber-300/50"
              style={{ animation: 'ch-putt-burst 1.2s ease-out both' }}
            />
            <div
              className="text-center"
              style={{ animation: 'ch-putt-pop 1.55s cubic-bezier(0.2, 1.4, 0.3, 1) both' }}
            >
              <div
                className="text-5xl sm:text-6xl font-black tracking-tight text-amber-300"
                style={{
                  textShadow: '0 0 18px rgba(251,191,36,0.85), 0 4px 0 #7a4a00, 0 8px 24px rgba(0,0,0,0.55)',
                }}
              >
                {puttPopup.main}
              </div>
              <div className="mt-1 text-sm font-semibold uppercase tracking-[0.2em] text-white/90 drop-shadow">
                {puttPopup.sub}
              </div>
              <div className="mt-2 text-[11px] text-white/60">Putt rings resolve the hole</div>
            </div>
          </div>
        ) : null}

        {phase === PHASE.result ? (
          <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/35 p-4 backdrop-blur-[1px]">
            <div className="w-full max-w-xs rounded-2xl border border-white/15 bg-[#0a1410]/92 px-5 py-5 text-center shadow-2xl">
              <div className="text-sm text-white/85">{message}</div>
              <button
                type="button"
                onClick={continueAfterResult}
                className="mt-4 w-full rounded-xl bg-sky-500 px-4 py-3 text-sm font-semibold text-white hover:bg-sky-400"
              >
                Next shot
              </button>
            </div>
          </div>
        ) : null}

        {phase !== PHASE.holeEnd && phase !== PHASE.roundEnd && phase !== PHASE.result && phase !== PHASE.puttPop ? (
          <div className="absolute inset-x-0 bottom-0 z-20 bg-gradient-to-t from-black/85 via-black/55 to-transparent px-3 pb-3 pt-12 pointer-events-none">
            <div className="pointer-events-auto space-y-2.5">
              <SwingMeter
                power={powerMeter}
                pinPower={pinPower}
                active={phase === PHASE.swing}
                fillRef={meterFillRef}
              />

              <div className="flex items-stretch gap-2">
                <div className="flex flex-1 items-center gap-1 rounded-xl border border-white/15 bg-black/50 p-1 backdrop-blur-sm">
                  <button
                    type="button"
                    aria-label="Previous club"
                    disabled={clubLocked}
                    onClick={() => cycleClub(-1)}
                    className="h-11 w-11 shrink-0 rounded-lg bg-white/10 text-xl font-semibold text-white hover:bg-white/20 disabled:opacity-35"
                  >
                    ‹
                  </button>
                  <div className="min-w-0 flex-1 text-center leading-tight">
                    <div className="truncate text-sm font-semibold text-white">{club.name}</div>
                    <div className="text-[11px] text-white/60">{club.carry}y carry</div>
                  </div>
                  <button
                    type="button"
                    aria-label="Next club"
                    disabled={clubLocked}
                    onClick={() => cycleClub(1)}
                    className="h-11 w-11 shrink-0 rounded-lg bg-white/10 text-xl font-semibold text-white hover:bg-white/20 disabled:opacity-35"
                  >
                    ›
                  </button>
                </div>

                <button
                  type="button"
                  disabled={primaryDisabled}
                  onPointerDown={(e) => {
                    if (primaryDisabled) return;
                    e.preventDefault();
                    primaryAction();
                  }}
                  className={`h-[3.25rem] min-w-[7.5rem] shrink-0 rounded-xl px-5 text-sm font-semibold shadow-lg disabled:opacity-40 ${primaryClass}`}
                >
                  {primaryLabel}
                </button>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex gap-1.5">
                  <button
                    type="button"
                    onClick={() => resetHole(holeIndex)}
                    className="rounded-lg border border-white/15 bg-black/40 px-2.5 py-1.5 text-[11px] text-white/85 hover:bg-black/55"
                  >
                    Replay
                  </button>
                  <button
                    type="button"
                    onClick={skipHole}
                    className="rounded-lg border border-white/15 bg-black/40 px-2.5 py-1.5 text-[11px] text-white/85 hover:bg-black/55"
                  >
                    Skip
                  </button>
                </div>
                <div className="text-[10px] text-white/45">
                  Spin pad · dashed = flight · blue = roll stop · red = pin
                  {phase === PHASE.swing ? ` · meter ${meterDir > 0 ? '↑' : '↓'}` : ''}
                </div>
              </div>
            </div>
          </div>
        ) : null}

        {phase === PHASE.holeEnd ? (
          <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/50 p-4 backdrop-blur-[2px]">
            <div className="w-full max-w-md rounded-2xl border border-white/15 bg-[#0a1410]/95 p-4 shadow-2xl">
              <div className="text-center">
                <div className="text-emerald-200 font-semibold">Hole {hole.number} complete</div>
                <div className="mt-1 text-sm text-white/80">{message}</div>
              </div>
              <div className="mt-3 overflow-x-auto">
                <ScorecardStrip
                  course={course}
                  scorecard={scorecard}
                  holeIndex={holeIndex}
                  holeStrokes={holeStrokes}
                />
              </div>
              <button
                type="button"
                onClick={commitHoleAndAdvance}
                className="mt-4 w-full rounded-xl bg-emerald-500 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-400"
              >
                {holeIndex >= 8 ? 'See final scorecard' : 'Next hole'}
              </button>
            </div>
          </div>
        ) : null}

        {phase === PHASE.roundEnd ? (
          <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/55 p-4 backdrop-blur-[2px]">
            <div className="w-full max-w-md rounded-2xl border border-emerald-400/30 bg-[#0c1a14]/95 p-5 text-center shadow-2xl max-h-[90%] overflow-y-auto">
              <div className="text-emerald-200 font-semibold text-lg">Round complete</div>
              <div className="mt-1 text-white/80 text-sm">{course.name}</div>
              <div className="mt-3 text-3xl font-semibold text-white">{finalStrokes}</div>
              <div className="text-sm text-emerald-200/90">
                {formatScoreToPar(finalStrokes, course.totalPar)} to par
              </div>
              {streakLabel ? (
                <div className="mt-1 text-xs text-amber-200/85">{streakLabel}</div>
              ) : null}
              <div className="mt-3 overflow-x-auto text-left">
                <ScorecardStrip
                  course={course}
                  scorecard={scorecard}
                  holeIndex={holeIndex}
                  holeStrokes={holeStrokes}
                />
              </div>
              {leaderboard?.length > 0 ? (
                <div className="mt-4 text-left rounded-xl border border-white/10 bg-black/30 overflow-hidden">
                  <div className="px-3 py-2 text-[11px] uppercase tracking-wide text-white/50 border-b border-white/10">
                    Today’s leaderboard · lowest score
                  </div>
                  <ul className="divide-y divide-white/5 max-h-48 overflow-y-auto">
                    {leaderboard.slice(0, 12).map((row) => (
                      <FunLeaderboardRow
                        key={row.uid}
                        row={row}
                        currentUserUid={currentUserUid}
                        resultText={row.resultLabel || String(row.strokes)}
                      />
                    ))}
                  </ul>
                </div>
              ) : null}
              <button
                type="button"
                onClick={() => {
                  setScorecard(Array(9).fill(null));
                  setHoleIndex(0);
                  resetHole(0);
                }}
                className="mt-4 w-full rounded-xl bg-emerald-500 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-400"
              >
                Play again
              </button>
            </div>
          </div>
        ) : null}
      </div>

      {phase !== PHASE.roundEnd && leaderboard?.length > 0 ? (
        <div className="rounded-2xl border border-[#243352] bg-[#0a1220] overflow-hidden">
          <div className="px-4 py-2.5 text-[11px] uppercase tracking-wide text-slate-400 border-b border-[#1a2540]">
            Today’s leaderboard · lowest score
          </div>
          <ul className="divide-y divide-[#1a2540]">
            {leaderboard.slice(0, 8).map((row) => (
              <FunLeaderboardRow
                key={row.uid}
                row={row}
                currentUserUid={currentUserUid}
                resultText={row.resultLabel || String(row.strokes)}
              />
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

function CountryHolesTestIntro({ open, onContinue }) {
  if (!open) return null;
  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-2xl border border-amber-400/35 bg-[#12100a]/96 p-5 shadow-2xl">
        <div className="text-[11px] uppercase tracking-[0.16em] text-amber-300/90">Early access</div>
        <h3 className="mt-1 text-lg font-semibold text-white">Country Holes</h3>
        <p className="mt-3 text-sm text-white/80 leading-relaxed">
          Permanent Profile game with a new 9-hole course each London day. Finish a round to post
          on the company leaderboard (lowest score wins). Features may still change.
        </p>
        <p className="mt-2 text-sm text-white/65 leading-relaxed">
          Tap Spin (top right) and drag the ball like Golf Clash: up = topspin, down = backspin,
          sides = curl. Landing on the green resolves putts from the rings.
        </p>
        <button
          type="button"
          onClick={onContinue}
          className="mt-5 w-full rounded-xl bg-amber-400 px-4 py-3 text-sm font-semibold text-slate-900 hover:bg-amber-300"
        >
          Got it — play
        </button>
      </div>
    </div>
  );
}

/** Profile tab — daily competitive when not sandbox. */
export function CountryHolesDailyPanel({ isAdmin = false }) {
  const [introOpen, setIntroOpen] = useState(() => {
    try {
      return localStorage.getItem(INTRO_DISMISS_KEY) !== '1';
    } catch {
      return true;
    }
  });
  const [leaderboard, setLeaderboard] = useState([]);
  const [currentUserUid, setCurrentUserUid] = useState(null);
  const [streakLabel, setStreakLabel] = useState(null);
  const [boardDayKey] = useState(() => getLondonDayKey());

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const response = await fetch(`/api/getDailyCountryHoles?dayKey=${encodeURIComponent(boardDayKey)}`, {
          credentials: 'include',
        });
        if (!response.ok) return;
        const payload = await response.json();
        if (cancelled) return;
        setLeaderboard(payload.leaderboard || []);
        if (payload.uid || payload.game?.uid) setCurrentUserUid(payload.uid || payload.game.uid);
        const ach = Array.isArray(payload.achievements)
          ? payload.achievements.find((a) => a.gameKey === 'countryholes')
          : null;
        if (ach?.current) setStreakLabel(`Streak ${ach.current}`);
      } catch {
        /* ignore */
      }
    })();
    return () => { cancelled = true; };
  }, [boardDayKey]);

  const dismissIntro = () => {
    try {
      localStorage.setItem(INTRO_DISMISS_KEY, '1');
    } catch {
      /* ignore */
    }
    setIntroOpen(false);
  };

  const onRoundComplete = useCallback(async (result) => {
    try {
      const response = await fetch('/api/submitCountryHolesResult', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          strokes: result.strokes,
          par: result.par,
          toPar: result.toPar,
          dayKey: result.dayKey,
          scorecard: result.scorecard,
        }),
      });
      if (!response.ok) return;
      const payload = await response.json();
      if (Array.isArray(payload.leaderboard)) setLeaderboard(payload.leaderboard);
      if (payload.game?.uid) setCurrentUserUid(payload.game.uid);
      const ach = Array.isArray(payload.achievements)
        ? payload.achievements.find((a) => a.gameKey === 'countryholes')
        : null;
      if (ach?.current) setStreakLabel(`Streak ${ach.current}`);
    } catch {
      /* local best already saved */
    }
  }, []);

  return (
    <div className="relative space-y-3 w-full">
      <div className="relative">
        <CountryHolesTestIntro open={introOpen} onContinue={dismissIntro} />
        <CountryHolesPanel
          sandbox={false}
          allowFuture={Boolean(isAdmin)}
          onRoundComplete={onRoundComplete}
          leaderboard={leaderboard}
          currentUserUid={currentUserUid}
          streakLabel={streakLabel}
        />
      </div>
    </div>
  );
}

export function CountryHolesSandbox() {
  useEffect(() => {
    snoozeDeployRefresh(24 * 60 * 60 * 1000);
  }, []);

  return (
    <div className="space-y-3 w-full">
      <p className="text-sm text-slate-400 px-1">
        Admin sandbox · unlimited practice. Live play is on the Country Holes Profile tab.
      </p>
      <CountryHolesPanel sandbox />
    </div>
  );
}
