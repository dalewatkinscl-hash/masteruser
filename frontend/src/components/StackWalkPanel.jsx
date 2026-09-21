import { useCallback, useEffect, useRef, useState } from 'react';
import FunDayPicker, { getLondonDayKey } from './FunDayPicker';
import FunLeaderboardRow from './FunLeaderboardRow';
import StackWalkTutorialModal, { hasSeenStackWalkTutorial } from './StackWalkTutorialModal';
import { STACK_WALK_LIVE_FROM } from '../lib/funRotation';

async function readJsonResponse(res) {
  const contentType = res.headers.get('content-type') || '';
  if (!contentType.includes('application/json')) {
    const text = await res.text();
    throw new Error(text || `Request failed (${res.status})`);
  }
  return res.json();
}

function formatMetres(metres) {
  const m = Math.max(0, Math.floor(Number(metres) || 0));
  if (m < 1000) return `${m.toLocaleString('en-GB')} m`;
  const km = m / 1000;
  if (km >= 10) return `${Math.round(km).toLocaleString('en-GB')} km`;
  return `${km.toFixed(1)} km`;
}

const BOX_PALETTES = [
  { top: '#e8d5b5', front: '#c4a574', side: '#a68a5b', tape: '#232f3e' },
  { top: '#f0e0c4', front: '#d2b48c', side: '#b8956c', tape: '#ff9900' },
  { top: '#e2c9a0', front: '#c9a66b', side: '#a8844f', tape: '#232f3e' },
  { top: '#f5e6cc', front: '#dbb87c', side: '#b89155', tape: '#ff9900' },
  { top: '#decca8', front: '#c2a06a', side: '#9e7f4e', tape: '#232f3e' },
  { top: '#ead7b3', front: '#d0ae78', side: '#ad8c58', tape: '#ff9900' },
];

const PARCEL_EVERY_M = 10;
const MAX_PARCELS = 24;

function roundRectPath(ctx, x, y, w, h, r) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

function mulberry32(seed) {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

function buildWorldProps(seed = 42) {
  const rng = mulberry32(seed);
  const props = [];
  for (let i = 0; i < 28; i += 1) {
    props.push({
      side: rng() > 0.5 ? 1 : -1,
      z: rng(),
      kind: rng() > 0.55 ? 'tree' : rng() > 0.45 ? 'lamp' : 'bush',
      h: 0.55 + rng() * 0.9,
      phase: rng() * Math.PI * 2,
    });
  }
  return props;
}

/**
 * O Dell's Amazon Run — behind-the-driver walk balancing a growing parcel stack.
 * Meter drifts over time and with each new parcel; fall locks metres.
 * Difficulty stays manageable into the ~100 m range, then gets sharp.
 */
function StackWalkCanvas({
  playing,
  onFall,
  resetKey = 0,
}) {
  const canvasRef = useRef(null);
  const wrapRef = useRef(null);
  const inputRef = useRef({ left: false, right: false });
  const stateRef = useRef(null);
  const onFallRef = useRef(onFall);
  const playingRef = useRef(playing);
  const [hud, setHud] = useState({ metres: 0, balance: 0, falling: false, parcels: 1 });

  useEffect(() => {
    onFallRef.current = onFall;
  }, [onFall]);

  useEffect(() => {
    playingRef.current = playing;
  }, [playing]);

  useEffect(() => {
    const onKeyDown = (e) => {
      if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') {
        e.preventDefault();
        inputRef.current.left = true;
      }
      if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') {
        e.preventDefault();
        inputRef.current.right = true;
      }
    };
    const onKeyUp = (e) => {
      if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') inputRef.current.left = false;
      if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') inputRef.current.right = false;
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    const ctx = canvas.getContext('2d');
    let raf = 0;
    let last = performance.now();
    let disposed = false;
    const worldProps = buildWorldProps(18);

    const resize = () => {
      const wrap = wrapRef.current;
      const w = Math.min(720, wrap?.clientWidth || 640);
      const h = Math.round(w * 0.78);
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      if (stateRef.current) {
        stateRef.current.W = w;
        stateRef.current.H = h;
      }
    };

    const makeState = () => {
      const wrap = wrapRef.current;
      const W = Math.min(720, wrap?.clientWidth || 640);
      const H = Math.round(W * 0.78);
      return {
        W,
        H,
        balance: 0,
        vel: (Math.random() * 0.02 - 0.01),
        metres: 0,
        scroll: 0,
        walkPhase: 0,
        falling: false,
        fallT: 0,
        fallSide: 1,
        shake: 0,
        startedAt: performance.now(),
        reported: false,
        boxCount: 1,
        nextParcelAt: PARCEL_EVERY_M,
        parcelFlash: 0,
        dust: [],
        debris: [],
        sparks: [],
        boxSway: Array.from({ length: MAX_PARCELS }, () => 0),
      };
    };

    stateRef.current = makeState();
    resize();
    window.addEventListener('resize', resize);

    const spawnDust = (st, x, y, count = 3) => {
      for (let i = 0; i < count; i += 1) {
        st.dust.push({
          x: x + (Math.random() - 0.5) * 18,
          y: y + Math.random() * 6,
          vx: (Math.random() - 0.5) * 40,
          vy: -20 - Math.random() * 35,
          life: 0.35 + Math.random() * 0.4,
          age: 0,
          r: 2 + Math.random() * 4,
        });
      }
    };

    const drawCrate = (ctx2, x, y, w, h, depth, palette, leanBoost = 0) => {
      const d = Math.max(0, Number(depth) || 0);
      const pal = palette || BOX_PALETTES[0];
      if (![x, y, w, h].every(Number.isFinite)) return;
      // top face
      ctx2.fillStyle = pal.top;
      ctx2.beginPath();
      ctx2.moveTo(x, y);
      ctx2.lineTo(x + w, y);
      ctx2.lineTo(x + w + d * 0.55 + leanBoost, y - d);
      ctx2.lineTo(x + d * 0.55 + leanBoost, y - d);
      ctx2.closePath();
      ctx2.fill();
      // side face
      ctx2.fillStyle = pal.side;
      ctx2.beginPath();
      ctx2.moveTo(x + w, y);
      ctx2.lineTo(x + w + d * 0.55 + leanBoost, y - d);
      ctx2.lineTo(x + w + d * 0.55 + leanBoost, y - d + h);
      ctx2.lineTo(x + w, y + h);
      ctx2.closePath();
      ctx2.fill();
      // front face
      ctx2.fillStyle = pal.front;
      roundRectPath(ctx2, x, y, w, h, 2);
      ctx2.fill();
      // tape
      ctx2.fillStyle = pal.tape;
      ctx2.globalAlpha = 0.55;
      ctx2.fillRect(x + w * 0.42, y + 2, w * 0.16, h - 4);
      ctx2.globalAlpha = 1;
      // edge
      ctx2.strokeStyle = 'rgba(0,0,0,0.28)';
      ctx2.lineWidth = 1;
      roundRectPath(ctx2, x, y, w, h, 2);
      ctx2.stroke();
    };

    const draw = (st, now) => {
      const { W, H } = st;
      const cx = W * 0.5;
      const horizonY = H * 0.42;
      const shakeX = st.shake > 0 ? (Math.random() - 0.5) * st.shake * 10 : 0;
      const shakeY = st.shake > 0 ? (Math.random() - 0.5) * st.shake * 6 : 0;

      ctx.save();
      ctx.translate(shakeX, shakeY);

      // Sky
      const sky = ctx.createLinearGradient(0, 0, 0, horizonY + 40);
      sky.addColorStop(0, '#07101f');
      sky.addColorStop(0.45, '#12253f');
      sky.addColorStop(1, '#2a4060');
      ctx.fillStyle = sky;
      ctx.fillRect(0, 0, W, H);

      // Soft sun glow
      const sunX = W * 0.72;
      const sunY = H * 0.18;
      const sunGrad = ctx.createRadialGradient(sunX, sunY, 4, sunX, sunY, 90);
      sunGrad.addColorStop(0, 'rgba(251, 191, 36, 0.55)');
      sunGrad.addColorStop(0.4, 'rgba(251, 146, 60, 0.18)');
      sunGrad.addColorStop(1, 'rgba(251, 146, 60, 0)');
      ctx.fillStyle = sunGrad;
      ctx.fillRect(0, 0, W, horizonY + 20);

      // Clouds (parallax)
      for (let i = 0; i < 5; i += 1) {
        const cScroll = (st.scroll * 0.04 + i * 160) % (W + 200);
        const cxCloud = W + 40 - cScroll;
        const cyCloud = 28 + i * 18 + Math.sin(now / 1800 + i) * 4;
        ctx.fillStyle = `rgba(148, 163, 184, ${0.12 + i * 0.03})`;
        ctx.beginPath();
        ctx.ellipse(cxCloud, cyCloud, 48 + i * 6, 14, 0, 0, Math.PI * 2);
        ctx.ellipse(cxCloud - 28, cyCloud + 4, 30, 12, 0, 0, Math.PI * 2);
        ctx.ellipse(cxCloud + 26, cyCloud + 2, 26, 11, 0, 0, Math.PI * 2);
        ctx.fill();
      }

      // Far hills
      ctx.fillStyle = '#152238';
      ctx.beginPath();
      ctx.moveTo(0, horizonY + 8);
      for (let x = 0; x <= W; x += 24) {
        const y = horizonY - 8 + Math.sin((x + st.scroll * 0.08) * 0.018) * 22
          + Math.sin((x + st.scroll * 0.05) * 0.04) * 10;
        ctx.lineTo(x, y);
      }
      ctx.lineTo(W, H);
      ctx.lineTo(0, H);
      ctx.fill();

      // Mid hills
      ctx.fillStyle = '#1c2f4a';
      ctx.beginPath();
      ctx.moveTo(0, horizonY + 28);
      for (let x = 0; x <= W; x += 20) {
        const y = horizonY + 10 + Math.sin((x + st.scroll * 0.18) * 0.03) * 16;
        ctx.lineTo(x, y);
      }
      ctx.lineTo(W, H);
      ctx.lineTo(0, H);
      ctx.fill();

      // Road
      const roadBottomW = W * 0.78;
      const roadTopW = W * 0.1;
      const roadGrad = ctx.createLinearGradient(0, horizonY, 0, H);
      roadGrad.addColorStop(0, '#3f4554');
      roadGrad.addColorStop(1, '#272b35');
      ctx.fillStyle = roadGrad;
      ctx.beginPath();
      ctx.moveTo(cx - roadTopW / 2, horizonY);
      ctx.lineTo(cx + roadTopW / 2, horizonY);
      ctx.lineTo(cx + roadBottomW / 2, H + 2);
      ctx.lineTo(cx - roadBottomW / 2, H + 2);
      ctx.closePath();
      ctx.fill();

      // Road edge lines
      ctx.strokeStyle = 'rgba(248, 250, 252, 0.35)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(cx - roadTopW / 2, horizonY);
      ctx.lineTo(cx - roadBottomW / 2, H);
      ctx.moveTo(cx + roadTopW / 2, horizonY);
      ctx.lineTo(cx + roadBottomW / 2, H);
      ctx.stroke();

      // Centre dashes with perspective
      for (let i = 0; i < 22; i += 1) {
        const raw = (i / 20 + (st.scroll * 0.0045) % 1) % 1;
        const t = raw * raw;
        const y = horizonY + t * (H - horizonY);
        const scale = 0.15 + t * 0.95;
        const len = 5 + scale * 28;
        const halfGap = 1.2 * scale;
        ctx.fillStyle = `rgba(250, 204, 21, ${0.25 + t * 0.55})`;
        ctx.fillRect(cx - halfGap, y, Math.max(2, 3 * scale), len);
      }

      // Roadside grass strips
      const grassL = ctx.createLinearGradient(0, horizonY, cx - roadBottomW / 2, H);
      grassL.addColorStop(0, 'rgba(34, 197, 94, 0.08)');
      grassL.addColorStop(1, 'rgba(22, 101, 52, 0.35)');
      ctx.fillStyle = grassL;
      ctx.beginPath();
      ctx.moveTo(0, horizonY);
      ctx.lineTo(cx - roadTopW / 2, horizonY);
      ctx.lineTo(cx - roadBottomW / 2, H);
      ctx.lineTo(0, H);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(W, horizonY);
      ctx.lineTo(cx + roadTopW / 2, horizonY);
      ctx.lineTo(cx + roadBottomW / 2, H);
      ctx.lineTo(W, H);
      ctx.fill();

      // Roadside props (trees / lamps) with depth scroll
      const propScroll = (st.scroll * 0.0022) % 1;
      [...worldProps]
        .map((p) => ({ ...p, depth: (p.z + propScroll) % 1 }))
        .sort((a, b) => a.depth - b.depth)
        .forEach((p) => {
          const t = p.depth * p.depth;
          if (t < 0.02) return;
          const y = horizonY + t * (H - horizonY) * 0.92;
          const roadHalf = roadTopW / 2 + t * ((roadBottomW - roadTopW) / 2);
          const scale = 0.2 + t * 1.1;
          const x = cx + p.side * (roadHalf + 28 * scale + 10);
          if (p.kind === 'tree') {
            const trunkH = 28 * scale * p.h;
            const canopyR = 16 * scale * p.h;
            ctx.fillStyle = '#5b3a29';
            ctx.fillRect(x - 2.5 * scale, y - trunkH, 5 * scale, trunkH);
            ctx.fillStyle = '#166534';
            ctx.beginPath();
            ctx.arc(x, y - trunkH - canopyR * 0.2, canopyR, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = '#22c55e';
            ctx.beginPath();
            ctx.arc(x - 4 * scale, y - trunkH - canopyR * 0.35, canopyR * 0.7, 0, Math.PI * 2);
            ctx.fill();
          } else if (p.kind === 'lamp') {
            const hLamp = 50 * scale;
            ctx.strokeStyle = '#94a3b8';
            ctx.lineWidth = Math.max(1.5, 2.5 * scale);
            ctx.beginPath();
            ctx.moveTo(x, y);
            ctx.lineTo(x, y - hLamp);
            ctx.lineTo(x + p.side * -8 * scale, y - hLamp - 4 * scale);
            ctx.stroke();
            const glow = ctx.createRadialGradient(x, y - hLamp, 0, x, y - hLamp, 18 * scale);
            glow.addColorStop(0, 'rgba(253, 224, 71, 0.55)');
            glow.addColorStop(1, 'rgba(253, 224, 71, 0)');
            ctx.fillStyle = glow;
            ctx.beginPath();
            ctx.arc(x, y - hLamp, 18 * scale, 0, Math.PI * 2);
            ctx.fill();
          } else {
            ctx.fillStyle = '#15803d';
            ctx.beginPath();
            ctx.ellipse(x, y - 6 * scale, 14 * scale, 8 * scale, 0, 0, Math.PI * 2);
            ctx.fill();
          }
        });

      // Danger vignette when near fall
      const danger = Math.max(0, Math.abs(st.balance) - 0.55) / 0.45;
      if (danger > 0 || st.falling) {
        const vig = ctx.createRadialGradient(cx, H * 0.55, W * 0.2, cx, H * 0.55, W * 0.75);
        vig.addColorStop(0, 'rgba(0,0,0,0)');
        vig.addColorStop(1, `rgba(127, 29, 29, ${Math.max(0, Math.min(1, 0.15 + danger * 0.45 + (st.falling ? 0.25 : 0)))})`);
        ctx.fillStyle = vig;
        ctx.fillRect(0, 0, W, H);
      }

      const lean = st.falling
        ? st.fallSide * Math.min(1.35, 0.4 + st.fallT * 1.6)
        : st.balance * 0.62;
      const charX = cx + lean * W * 0.07;
      const charY = H * 0.74;
      const bob = playingRef.current && !st.falling ? Math.abs(Math.sin(st.walkPhase)) * 3.5 : 0;
      const stepC = Math.cos(st.walkPhase);

      // Ground shadow
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.beginPath();
      ctx.ellipse(charX, charY + 46, 34 + Math.abs(lean) * 10, 10, 0, 0, Math.PI * 2);
      ctx.fill();

      // Dust
      st.dust.forEach((d) => {
        const a = 1 - d.age / d.life;
        if (a <= 0) return;
        ctx.fillStyle = `rgba(203, 213, 225, ${a * 0.45})`;
        ctx.beginPath();
        ctx.arc(d.x, d.y, d.r * (0.7 + a), 0, Math.PI * 2);
        ctx.fill();
      });

      // Speed lines when moving
      if (playingRef.current && !st.falling) {
        ctx.strokeStyle = 'rgba(148, 163, 184, 0.18)';
        ctx.lineWidth = 1.5;
        for (let i = 0; i < 8; i += 1) {
          const ly = 40 + ((i * 47 + st.scroll * 0.6) % (H - 80));
          const lx = 12 + (i % 3) * 18;
          ctx.beginPath();
          ctx.moveTo(lx, ly);
          ctx.lineTo(lx + 18 + (i % 4) * 6, ly + 10);
          ctx.stroke();
          ctx.beginPath();
          ctx.moveTo(W - lx, ly);
          ctx.lineTo(W - lx - 18 - (i % 4) * 6, ly + 10);
          ctx.stroke();
        }
      }

      ctx.save();
      ctx.translate(charX, charY - bob);
      ctx.rotate(lean * 0.85);

      // Legs with proper opposite walk cycle (rear view)
      const legSpread = 11;
      const drawLeg = (side, phase) => {
        const hipX = side * legSpread;
        const kneeBend = Math.max(0, -Math.sin(phase)) * 10;
        const footY = 44 + Math.sin(phase) * 6;
        const footX = hipX + Math.sin(phase) * 14;
        const kneeX = hipX + Math.sin(phase) * 7;
        const kneeY = 22 + kneeBend;
        ctx.strokeStyle = '#64748b';
        ctx.lineWidth = 6;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.beginPath();
        ctx.moveTo(hipX, 6);
        ctx.lineTo(kneeX, kneeY);
        ctx.lineTo(footX, footY);
        ctx.stroke();
        // shoe
        ctx.fillStyle = '#1e293b';
        ctx.beginPath();
        ctx.ellipse(footX + side * 3, footY + 2, 8, 4, 0, 0, Math.PI * 2);
        ctx.fill();
      };
      drawLeg(-1, st.walkPhase);
      drawLeg(1, st.walkPhase + Math.PI);

      // Hips / torso — Amazon delivery navy + orange stripe
      const shoulderSway = stepC * 3;
      ctx.fillStyle = '#232f3e';
      roundRectPath(ctx, -15, -18, 30, 28, 8);
      ctx.fill();
      // orange hi-vis stripe
      ctx.fillStyle = '#ff9900';
      roundRectPath(ctx, -12, -6, 24, 5, 2);
      ctx.fill();
      // vest panel
      ctx.fillStyle = '#37475a';
      roundRectPath(ctx, -11, -16, 22, 10, 4);
      ctx.fill();
      // smile logo badge (stylised)
      ctx.strokeStyle = '#ff9900';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(0, -10, 5, 0.15 * Math.PI, 0.85 * Math.PI);
      ctx.stroke();

      // Arms holding stack (rear) — navy sleeves
      ctx.strokeStyle = '#232f3e';
      ctx.lineWidth = 5;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(-14 + shoulderSway * 0.3, -8);
      ctx.quadraticCurveTo(-22, -28, -16 - lean * 8, -52);
      ctx.moveTo(14 + shoulderSway * 0.3, -8);
      ctx.quadraticCurveTo(22, -28, 16 - lean * 8, -52);
      ctx.stroke();
      // hands
      ctx.fillStyle = '#fcd9b0';
      ctx.beginPath();
      ctx.arc(-16 - lean * 8, -52, 5, 0, Math.PI * 2);
      ctx.arc(16 - lean * 8, -52, 5, 0, Math.PI * 2);
      ctx.fill();

      // Head + delivery cap
      ctx.fillStyle = '#fcd9b0';
      ctx.beginPath();
      ctx.ellipse(shoulderSway * 0.2, -34, 11, 12, 0, 0, Math.PI * 2);
      ctx.fill();
      // cap
      ctx.fillStyle = '#232f3e';
      ctx.beginPath();
      ctx.ellipse(shoulderSway * 0.2, -42, 12, 7, 0, Math.PI, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#ff9900';
      ctx.fillRect(-6 + shoulderSway * 0.2, -44, 12, 3);
      // ears
      ctx.fillStyle = '#fcd9b0';
      ctx.beginPath();
      ctx.ellipse(-12, -36, 3, 4, 0, 0, Math.PI * 2);
      ctx.ellipse(12, -36, 3, 4, 0, 0, Math.PI * 2);
      ctx.fill();

      // Parcel tower with lagged sway
      if (!st.falling || st.fallT < 0.12) {
        for (let i = 0; i < st.boxCount; i += 1) {
          const target = lean * (i + 1) * 3.4
            + Math.sin(now / 140 + i * 0.55) * Math.abs(st.balance) * (1.8 + i * 0.45);
          st.boxSway[i] = (st.boxSway[i] || 0) + (target - (st.boxSway[i] || 0)) * 0.18;
          const sway = st.boxSway[i] || 0;
          const shrink = Math.min(10, i * 0.7);
          const boxW = 36 - shrink;
          const boxH = 15;
          const depth = 8 - Math.min(4, i * 0.2);
          const y = -58 - i * (boxH - 1.5);
          const x = sway - boxW / 2;
          const pal = BOX_PALETTES[i % BOX_PALETTES.length];
          drawCrate(ctx, x, y, boxW, boxH, depth, pal, lean * i * 0.4);
        }
      }

      ctx.restore();

      // Fall debris crates
      if (st.falling) {
        (st.debris || []).forEach((b) => {
          if (!b || !Number.isFinite(b.x) || !Number.isFinite(b.y)) return;
          ctx.save();
          ctx.translate(b.x, b.y);
          ctx.rotate(b.rot || 0);
          drawCrate(ctx, -b.w / 2, -b.h / 2, b.w, b.h, 6, b.pal, 0);
          ctx.restore();
        });
        (st.sparks || []).forEach((sp) => {
          const a = Math.max(0, Math.min(1, 1 - sp.age / sp.life));
          if (a <= 0) return;
          ctx.fillStyle = `rgba(251, 191, 36, ${a})`;
          ctx.beginPath();
          ctx.arc(sp.x, sp.y, Math.max(0.5, sp.r * a), 0, Math.PI * 2);
          ctx.fill();
        });
      }

      // Balance meter
      const meterW = Math.min(300, W * 0.72);
      const meterH = 22;
      const meterX = (W - meterW) / 2;
      const meterY = 16;
      ctx.fillStyle = 'rgba(7, 16, 31, 0.82)';
      roundRectPath(ctx, meterX - 4, meterY - 4, meterW + 8, meterH + 8, 12);
      ctx.fill();
      ctx.strokeStyle = 'rgba(148, 163, 184, 0.35)';
      ctx.lineWidth = 1.5;
      roundRectPath(ctx, meterX, meterY, meterW, meterH, 10);
      ctx.stroke();

      const dangerW = meterW * 0.16;
      const dangGrad = ctx.createLinearGradient(meterX, 0, meterX + dangerW, 0);
      dangGrad.addColorStop(0, 'rgba(248, 113, 113, 0.55)');
      dangGrad.addColorStop(1, 'rgba(248, 113, 113, 0)');
      ctx.fillStyle = dangGrad;
      ctx.fillRect(meterX + 2, meterY + 2, dangerW, meterH - 4);
      const dangGradR = ctx.createLinearGradient(meterX + meterW - dangerW, 0, meterX + meterW, 0);
      dangGradR.addColorStop(0, 'rgba(248, 113, 113, 0)');
      dangGradR.addColorStop(1, 'rgba(248, 113, 113, 0.55)');
      ctx.fillStyle = dangGradR;
      ctx.fillRect(meterX + meterW - dangerW - 2, meterY + 2, dangerW, meterH - 4);

      ctx.fillStyle = 'rgba(52, 211, 153, 0.28)';
      ctx.fillRect(meterX + meterW * 0.44, meterY + 2, meterW * 0.12, meterH - 4);
      // ticks
      ctx.strokeStyle = 'rgba(148, 163, 184, 0.35)';
      ctx.lineWidth = 1;
      for (let t = -2; t <= 2; t += 1) {
        const tx = meterX + meterW / 2 + t * (meterW / 5);
        ctx.beginPath();
        ctx.moveTo(tx, meterY + 4);
        ctx.lineTo(tx, meterY + meterH - 4);
        ctx.stroke();
      }

      const needleX = meterX + meterW / 2 + (st.balance * (meterW / 2 - 10));
      const hot = Math.abs(st.balance) > 0.72;
      ctx.shadowColor = hot ? 'rgba(248, 113, 113, 0.8)' : 'rgba(251, 191, 36, 0.55)';
      ctx.shadowBlur = 10;
      ctx.fillStyle = hot ? '#f87171' : '#fbbf24';
      ctx.beginPath();
      ctx.moveTo(needleX, meterY - 3);
      ctx.lineTo(needleX + 8, meterY + meterH / 2);
      ctx.lineTo(needleX, meterY + meterH + 3);
      ctx.lineTo(needleX - 8, meterY + meterH / 2);
      ctx.closePath();
      ctx.fill();
      ctx.shadowBlur = 0;

      ctx.fillStyle = '#f8fafc';
      ctx.font = '700 18px ui-sans-serif, system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(formatMetres(st.metres), W / 2, meterY + meterH + 26);
      ctx.font = '600 12px ui-sans-serif, system-ui, sans-serif';
      ctx.fillStyle = '#ff9900';
      ctx.fillText(
        `${st.boxCount} parcel${st.boxCount === 1 ? '' : 's'}`,
        W / 2,
        meterY + meterH + 42,
      );

      if (st.parcelFlash > 0) {
        ctx.globalAlpha = Math.min(1, st.parcelFlash * 2);
        ctx.fillStyle = '#ff9900';
        ctx.font = '700 16px ui-sans-serif, system-ui, sans-serif';
        ctx.fillText('+1 parcel', W / 2, meterY + meterH + 62);
        ctx.globalAlpha = 1;
      }

      if (!playingRef.current && !st.falling && st.metres === 0) {
        ctx.fillStyle = 'rgba(7, 16, 31, 0.55)';
        ctx.fillRect(0, 0, W, H);
        ctx.fillStyle = '#f8fafc';
        ctx.font = '700 20px ui-sans-serif, system-ui, sans-serif';
        ctx.fillText("O Dell's Amazon Run", W / 2, H * 0.38);
        ctx.font = '500 13px ui-sans-serif, system-ui, sans-serif';
        ctx.fillStyle = '#94a3b8';
        ctx.fillText('Start with 1 parcel · another every 10 m', W / 2, H * 0.38 + 26);
        ctx.fillText('Keep the needle centred — the stack gets wild', W / 2, H * 0.38 + 46);
      }

      ctx.restore();
    };

    const tick = (now) => {
      if (disposed) return;
      const st = stateRef.current;
      if (!st) return;
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;

      if (playingRef.current && !st.falling) {
        const elapsed = (now - st.startedAt) / 1000;
        // Stretch difficulty so ~100 m feels like the old ~60 m cliff.
        const load = 1 + (st.boxCount - 1) * 0.09;
        const ramp = (1 + elapsed * 0.15 + (elapsed * elapsed) * 0.0045) * load;
        const driftAmp = 0.2 * ramp;
        st.vel += (Math.random() - 0.5) * 0.55 * dt * ramp;
        st.vel += Math.sign(st.balance || (Math.random() - 0.5)) * 0.07 * ramp * dt;

        const input = inputRef.current;
        let steer = 0;
        if (input.left) steer -= 1;
        if (input.right) steer += 1;
        // Stronger player control for longer; load softens it slowly
        const control = Math.max(0.55, (1.95 - elapsed * 0.014) / (1 + (load - 1) * 0.2));
        st.vel += steer * 3.8 * control * dt;
        st.vel *= Math.max(0.92, 0.985 - elapsed * 0.00045 - (st.boxCount - 1) * 0.0009);

        st.balance += st.vel * dt * driftAmp * 1.0;
        st.balance = Math.max(-1.2, Math.min(1.2, st.balance));

        const walkSpeed = 2.55 + Math.min(2.0, elapsed * 0.055);
        st.metres += walkSpeed * dt;
        st.scroll += walkSpeed * 28 * dt;
        st.walkPhase += walkSpeed * 3.4 * dt;

        // New parcel every 10 m — tower grows, control gets worse
        while (st.boxCount < MAX_PARCELS && st.metres >= st.nextParcelAt) {
          st.boxCount += 1;
          st.nextParcelAt += PARCEL_EVERY_M;
          st.boxSway[st.boxCount - 1] = st.boxSway[st.boxCount - 2] || 0;
          st.parcelFlash = 1;
          // Small wobble kick when a parcel lands on the stack
          st.vel += (Math.random() - 0.5) * 0.18 * load;
        }
        if (st.parcelFlash > 0) st.parcelFlash = Math.max(0, st.parcelFlash - dt * 1.4);

        // Footfall dust
        if (Math.sin(st.walkPhase) > 0.92 && Math.sin(st.walkPhase - walkSpeed * 3.4 * dt) <= 0.92) {
          spawnDust(st, st.W * 0.5 + st.balance * st.W * 0.05 - 12, st.H * 0.74 + 42, 2);
        }
        if (Math.sin(st.walkPhase) < -0.92 && Math.sin(st.walkPhase - walkSpeed * 3.4 * dt) >= -0.92) {
          spawnDust(st, st.W * 0.5 + st.balance * st.W * 0.05 + 12, st.H * 0.74 + 42, 2);
        }

        if (Math.abs(st.balance) >= 1.05) {
          st.falling = true;
          st.fallT = 0;
          st.fallSide = st.balance >= 0 ? 1 : -1;
          st.shake = 1;
          const charX = st.W * 0.5 + st.balance * st.W * 0.07;
          const charY = st.H * 0.74;
          st.debris = [];
          st.sparks = [];
          for (let i = 0; i < st.boxCount; i += 1) {
            st.debris.push({
              x: charX + (st.boxSway[i] || 0),
              y: charY - 58 - i * 14,
              vx: st.fallSide * (80 + i * 35 + Math.random() * 60),
              vy: -120 - Math.random() * 160 - i * 20,
              rot: 0,
              rotV: st.fallSide * (2 + Math.random() * 4),
              w: 34 - Math.min(10, i * 0.7),
              h: 15,
              pal: BOX_PALETTES[i % BOX_PALETTES.length],
            });
          }
          for (let i = 0; i < 18; i += 1) {
            st.sparks.push({
              x: charX,
              y: charY - 40,
              vx: (Math.random() - 0.5) * 280,
              vy: -80 - Math.random() * 220,
              life: 0.4 + Math.random() * 0.5,
              age: 0,
              r: 1.5 + Math.random() * 2.5,
            });
          }
          spawnDust(st, charX, charY + 40, 10);
        }
      } else if (st.falling) {
        st.fallT += dt;
        st.shake = Math.max(0, 1 - st.fallT * 1.8);
        (st.debris || []).forEach((b) => {
          b.vy += 780 * dt;
          b.x += b.vx * dt;
          b.y += b.vy * dt;
          b.rot += b.rotV * dt;
          b.vx *= 0.995;
        });
        (st.sparks || []).forEach((sp) => {
          sp.age += dt;
          sp.vy += 400 * dt;
          sp.x += sp.vx * dt;
          sp.y += sp.vy * dt;
        });
        if (!st.reported && st.fallT > 0.85) {
          st.reported = true;
          const distanceM = Math.floor(st.metres);
          const durationMs = Math.floor(now - st.startedAt);
          const report = onFallRef.current;
          if (report) setTimeout(() => report({ distanceM, durationMs }), 0);
        }
      }

      st.dust = (st.dust || []).filter((d) => {
        d.age += dt;
        d.x += d.vx * dt;
        d.y += d.vy * dt;
        d.vy += 60 * dt;
        return d.age < d.life;
      });

      try {
        draw(st, now);
      } catch (err) {
        console.error("O Dell's Amazon Run draw failed", err);
      }
      setHud({
        metres: Math.floor(st.metres),
        balance: st.balance,
        falling: st.falling,
        parcels: st.boxCount,
      });
      raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);
    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
    };
  }, [resetKey]);

  const setHold = (side, down) => {
    if (side === 'left') inputRef.current.left = down;
    if (side === 'right') inputRef.current.right = down;
  };

  return (
    <div className="space-y-3" ref={wrapRef}>
      <canvas
        ref={canvasRef}
        className="w-full rounded-xl border border-[#1a2540] bg-[#0b1220] touch-none"
        aria-label="O Dell's Amazon Run game view"
      />
      <div className="flex gap-3 justify-center">
        <button
          type="button"
          disabled={!playing || hud.falling}
          onPointerDown={(e) => { e.preventDefault(); setHold('left', true); }}
          onPointerUp={() => setHold('left', false)}
          onPointerLeave={() => setHold('left', false)}
          onPointerCancel={() => setHold('left', false)}
          className="flex-1 max-w-[160px] px-4 py-3 rounded-xl text-sm font-semibold bg-[#ff9900] text-[#232f3e] hover:bg-[#ffb84d] disabled:opacity-40 select-none"
        >
          ← Left
        </button>
        <button
          type="button"
          disabled={!playing || hud.falling}
          onPointerDown={(e) => { e.preventDefault(); setHold('right', true); }}
          onPointerUp={() => setHold('right', false)}
          onPointerLeave={() => setHold('right', false)}
          onPointerCancel={() => setHold('right', false)}
          className="flex-1 max-w-[160px] px-4 py-3 rounded-xl text-sm font-semibold bg-[#ff9900] text-[#232f3e] hover:bg-[#ffb84d] disabled:opacity-40 select-none"
        >
          Right →
        </button>
      </div>
      <p className="text-center text-xs text-slate-500">
        Arrow keys or A / D · one parcel every {PARCEL_EVERY_M} m · stack gets harder to hold
      </p>
    </div>
  );
}

function StackWalkPlay({
  competitive = false,
  sandbox = false,
  preview = false,
  currentUserUid = null,
  onAchievements = null,
  dayKey = null,
  initialGame = null,
  initialLeaderboard = [],
  practice = false,
}) {
  const todayKey = getLondonDayKey();
  const playDayKey = dayKey || todayKey;
  const [playing, setPlaying] = useState(false);
  const [resetKey, setResetKey] = useState(0);
  const [game, setGame] = useState(initialGame);
  const [leaderboard, setLeaderboard] = useState(initialLeaderboard);
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [lastRun, setLastRun] = useState(null);
  const [tutorialOpen, setTutorialOpen] = useState(false);
  const submittedRef = useRef(false);
  const startedAtRef = useRef(null);

  useEffect(() => {
    setGame(initialGame);
    setLeaderboard(initialLeaderboard || []);
    submittedRef.current = initialGame?.status === 'won';
  }, [initialGame, initialLeaderboard]);

  useEffect(() => {
    if (!hasSeenStackWalkTutorial()) setTutorialOpen(true);
  }, []);

  const alreadyWon = competitive && !sandbox && !practice && game?.status === 'won';

  const submitScore = useCallback(async ({ distanceM, durationMs }) => {
    setLastRun({ distanceM, durationMs });
    setPlaying(false);
    setMessage(`Fell at ${formatMetres(distanceM)}.`);

    if (!competitive) {
      setMessage(`Practice fall · ${formatMetres(distanceM)}. Hit Start to try again.`);
      return;
    }
    if (submittedRef.current && !sandbox && !practice) {
      setMessage(`Already recorded today · best ${formatMetres(game?.distanceM)}.`);
      return;
    }

    try {
      setSubmitting(true);
      const response = await fetch('/api/submitStackWalkResult', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          distanceM,
          durationMs,
          startedAt: startedAtRef.current,
          dayKey: playDayKey !== todayKey ? playDayKey : undefined,
          sandbox: sandbox ? true : undefined,
          preview: preview ? true : undefined,
        }),
      });
      const payload = (await readJsonResponse(response)) || {};
      if (!response.ok) throw new Error(payload.error || 'Failed to submit score.');
      if (payload.game) setGame(payload.game);
      if (Array.isArray(payload.leaderboard)) setLeaderboard(payload.leaderboard);
      if (!sandbox && !practice && !payload.practice) {
        submittedRef.current = true;
      }
      if (Array.isArray(payload.achievements) && onAchievements) {
        onAchievements(payload.achievements);
      }
      setMessage(
        sandbox || practice || payload.practice
          ? `Sandbox · ${formatMetres(distanceM)} (not on the board).`
          : `Recorded · ${formatMetres(payload.game?.distanceM ?? distanceM)}.`,
      );
    } catch (err) {
      setMessage(err.message || 'Could not submit your score.');
    } finally {
      setSubmitting(false);
    }
  }, [competitive, sandbox, preview, practice, game?.distanceM, playDayKey, todayKey, onAchievements]);

  const start = () => {
    if (alreadyWon) return;
    startedAtRef.current = new Date().toISOString();
    setMessage('');
    setLastRun(null);
    setResetKey((k) => k + 1);
    setPlaying(true);
  };

  return (
    <div className="space-y-3">
      <StackWalkTutorialModal open={tutorialOpen} onClose={() => setTutorialOpen(false)} />

      <p className="text-sm text-slate-400">
        Help the Amazon delivery driver carry O Dell’s parcels. Start with one — another lands every{' '}
        {PARCEL_EVERY_M} m. Keep the balance; furthest delivery wins.
      </p>

      <div className="flex flex-wrap gap-2 items-center">
        <button
          type="button"
          onClick={() => setTutorialOpen(true)}
          className="text-xs text-amber-200/90 border border-amber-500/30 rounded-md px-2.5 py-1 hover:bg-amber-500/10"
        >
          How to play
        </button>
      </div>

      {practice ? (
        <p className="text-xs text-amber-200/90 border border-amber-500/30 bg-amber-500/10 rounded-md px-3 py-2">
          Practice day — scores won’t count on the leaderboard.
        </p>
      ) : null}

      {alreadyWon ? (
        <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 space-y-1">
          <p className="text-sm font-semibold text-emerald-200">
            Today’s delivery · {formatMetres(game.distanceM)}
          </p>
          <p className="text-xs text-slate-400">One competitive run per London day. Come back tomorrow.</p>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2 items-center">
          <button
            type="button"
            onClick={start}
            disabled={playing || submitting}
            className="px-4 py-2 rounded-lg text-sm font-semibold bg-[#ff9900] text-[#232f3e] hover:bg-[#ffb84d] disabled:opacity-40"
          >
            {playing ? 'Delivering…' : lastRun ? 'Run again' : 'Start delivery'}
          </button>
          {submitting ? <span className="text-xs text-slate-400">Saving…</span> : null}
        </div>
      )}

      {!alreadyWon ? (
        <StackWalkCanvas
          key={resetKey}
          playing={playing}
          onFall={submitScore}
          resetKey={resetKey}
        />
      ) : null}

      {message ? (
        <p className={`text-sm ${alreadyWon || submittedRef.current ? 'text-emerald-300' : 'text-amber-200'}`}>
          {message}
        </p>
      ) : null}

      {competitive && !sandbox && !practice && leaderboard.length > 0 ? (
        <div className="space-y-2">
          <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
            Today’s leaderboard · furthest delivery
          </h4>
          <ol className="space-y-1.5">
            {leaderboard.map((row) => (
              <FunLeaderboardRow
                key={row.uid || row.rank}
                row={row}
                currentUserUid={currentUserUid}
                resultText={row.resultLabel || formatMetres(row.distanceM)}
              />
            ))}
          </ol>
        </div>
      ) : null}
    </div>
  );
}

export function StackWalkDailyPanel({
  currentUserUid = null,
  onAchievements = null,
  isAdmin = false,
  preview = false,
}) {
  const todayKey = getLondonDayKey();
  const [dayKey, setDayKey] = useState(todayKey);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [game, setGame] = useState(null);
  const [leaderboard, setLeaderboard] = useState([]);
  const practice = dayKey !== todayKey;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        setError('');
        const params = new URLSearchParams();
        if (dayKey && dayKey !== todayKey) params.set('dayKey', dayKey);
        if (preview) params.set('preview', '1');
        const query = params.toString() ? `?${params}` : '';
        const response = await fetch(`/api/getDailyStackWalk${query}`, { credentials: 'include' });
        const payload = (await readJsonResponse(response)) || {};
        if (!response.ok) throw new Error(payload.error || "Failed to load O Dell's Amazon Run.");
        if (cancelled) return;
        if (payload.weekend || payload.sittingOut) {
          setGame(null);
          setLeaderboard([]);
          setError(payload.message || "O Dell's Amazon Run isn’t in today’s Fun rotation.");
          return;
        }
        setGame(payload.game || null);
        setLeaderboard(payload.leaderboard || []);
      } catch (err) {
        if (!cancelled) {
          setError(err.message || "Failed to load O Dell's Amazon Run.");
          setGame(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [dayKey, todayKey, preview]);

  if (loading) return <p className="text-sm text-slate-400">Loading O Dell&apos;s Amazon Run…</p>;
  if (error) return <p className="text-sm text-rose-300">{error}</p>;

  return (
    <div className="space-y-3">
      {preview ? (
        <p className="text-xs text-amber-200/90 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2">
          Early peek · scores count for today. Joins the normal Fun rotation from{' '}
          <span className="font-medium text-amber-100">{STACK_WALK_LIVE_FROM}</span>.
        </p>
      ) : (
        <FunDayPicker
          dayKey={dayKey}
          todayKey={todayKey}
          onChange={setDayKey}
          allowFuture={Boolean(isAdmin)}
        />
      )}
      <StackWalkPlay
        key={`${dayKey}-${game?.status || 'ready'}-${game?.distanceM || 0}-${preview ? 'p' : 'n'}`}
        competitive
        preview={preview}
        practice={practice}
        currentUserUid={currentUserUid}
        onAchievements={onAchievements}
        dayKey={dayKey}
        initialGame={game}
        initialLeaderboard={leaderboard}
      />
    </div>
  );
}

export function StackWalkSandbox() {
  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-[#1a2540] p-4 space-y-2">
        <p className="text-sm text-slate-300">
          Admin sandbox for <span className="text-white font-medium">O Dell&apos;s Amazon Run</span>. Unlimited
          deliveries; scores are not written to the competitive board. Live from{' '}
          <span className="text-white font-medium">{STACK_WALK_LIVE_FROM}</span>.
        </p>
      </div>
      <StackWalkPlay competitive sandbox />
    </div>
  );
}

export default StackWalkSandbox;
