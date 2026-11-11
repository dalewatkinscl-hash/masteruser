import { useEffect, useRef, useState } from 'react';
import { firstName, opponentName, sendMove } from '../../lib/multiplayerApi';
import {
  COUNTDOWN_MS,
  FINISH_X,
  WORLD_H,
  WORLD_W,
  WALK_SPEED,
  SPRINT_SPEED,
  buildCrowd,
  drawPerson,
  pickPalette,
  pickScale,
  playGunshotSound,
} from '../../lib/plainSight';

function canvasToWorld(canvas, clientX, clientY) {
  if (!canvas) return { x: WORLD_W / 2, y: WORLD_H / 2 };
  const rect = canvas.getBoundingClientRect();
  if (!rect.width || !rect.height) return { x: WORLD_W / 2, y: WORLD_H / 2 };
  const localX = Math.max(0, Math.min(rect.width, clientX - rect.left));
  const localY = Math.max(0, Math.min(rect.height, clientY - rect.top));
  return {
    x: (localX / rect.width) * WORLD_W,
    y: (localY / rect.height) * WORLD_H,
  };
}

export default function PlainSightMatch({
  match, onMatch, busy, setBusy, setError, opponentLabel,
}) {
  const state = match?.state || {};
  const canvasRef = useRef(null);
  const wrapRef = useRef(null);
  const aimRef = useRef({ x: WORLD_W / 2, y: WORLD_H / 2 });
  const keysRef = useRef({ walk: false, sprint: false });
  const runnerLocal = useRef({
    x: Number(state.runner?.x) || 900,
    y: Number(state.runner?.y) || 210,
    sprinting: false,
    moving: false,
  });
  const syncedSpawn = useRef('');
  const lastPost = useRef(0);
  const matchRef = useRef(match);
  /** Monotonic reference so crowd elapsed advances smoothly every frame with zero jitter. */
  const clockRef = useRef({ goAt: 0, perfStart: 0 });
  /** Smooth monotonic remote runner for the sniper (never rubberbands or walks backwards). */
  const remoteRunnerRef = useRef({
    x: Number(state.runner?.x) || 900,
    y: Number(state.runner?.y) || 210,
    targetX: Number(state.runner?.x) || 900,
    targetY: Number(state.runner?.y) || 210,
    moving: false,
    sprinting: false,
    targetMoving: false,
    targetSprinting: false,
    lastFrameTime: 0,
    initialized: false,
  });
  const lastShotSoundAt = useRef(0);
  const localShotFiredRef = useRef(false);
  const [countdownLabel, setCountdownLabel] = useState('3');
  const [flash, setFlash] = useState(null);

  matchRef.current = match;

  const youAreRunner = match?.yourUid === state.runnerUid;
  const youAreSniper = match?.yourUid === state.sniperUid;
  const opp = opponentLabel || opponentName(match);
  const oppFirst = firstName(opp);
  const serverNow = Number(match?.serverNow) || Date.now();
  const goAt = Number(state.goAt) || 0;
  const inCountdown = match?.status === 'playing'
    && state.phase === 'countdown'
    && goAt > 0
    && serverNow < goAt;
  const playing = match?.status === 'playing'
    && (state.phase === 'playing' || (state.phase === 'countdown' && goAt > 0 && serverNow >= goAt));
  const finished = match?.status === 'finished' || state.phase === 'finished';

  // Initialize walker and remote runner to server spawn once per match
  useEffect(() => {
    if (!match?.id || !state.runner) return;
    if (syncedSpawn.current === match.id) return;
    syncedSpawn.current = match.id;
    const sx = Number(state.runner.x) || 900;
    const sy = Number(state.runner.y) || 210;
    runnerLocal.current = {
      x: sx,
      y: sy,
      sprinting: false,
      moving: false,
    };
    remoteRunnerRef.current = {
      x: sx,
      y: sy,
      targetX: sx,
      targetY: sy,
      moving: false,
      sprinting: false,
      targetMoving: false,
      targetSprinting: false,
      lastFrameTime: 0,
      initialized: true,
    };
  }, [match?.id, state.runner]);

  // Keep local monotonic clock aligned to server countdown once per goAt timestamp
  useEffect(() => {
    const g = Number(state.goAt) || 0;
    if (!g) return;
    if (clockRef.current.goAt !== g) {
      const sn = Number(matchRef.current?.serverNow) || Date.now();
      const timeToStartMs = g - sn;
      const perfNow = performance.now();
      clockRef.current = {
        goAt: g,
        perfStart: perfNow + timeToStartMs,
      };
    }
  }, [state.goAt]);

  useEffect(() => {
    if (youAreRunner || !state.runner) return;
    const rr = remoteRunnerRef.current;
    const sX = Number(state.runner.x);
    const sY = Number(state.runner.y);
    const validX = !Number.isNaN(sX) && sX > 0 ? sX : rr.x;
    const validY = !Number.isNaN(sY) && sY > 0 ? sY : rr.y;

    if (!rr.initialized) {
      rr.x = validX;
      rr.y = validY;
      rr.targetX = validX;
      rr.targetY = validY;
      rr.initialized = true;
    } else {
      rr.targetX = validX;
      rr.targetY = validY;
    }
    rr.targetMoving = Boolean(state.runner.moving);
    rr.targetSprinting = Boolean(state.runner.sprinting);
  }, [state.runner?.x, state.runner?.y, state.runner?.sprinting, state.runner?.moving, youAreRunner]);

  // 3 · 2 · 1 · GO
  useEffect(() => {
    if (!goAt) return undefined;
    const tick = () => {
      const skew = (Number(matchRef.current?.serverNow) || Date.now()) - Date.now();
      const left = goAt - (Date.now() + skew);
      if (left > 2500) setCountdownLabel('3');
      else if (left > 1500) setCountdownLabel('2');
      else if (left > 400) setCountdownLabel('1');
      else if (left > 0) setCountdownLabel('GO');
      else setCountdownLabel('');
    };
    tick();
    const id = window.setInterval(tick, 50);
    return () => window.clearInterval(id);
  }, [goAt]);

  useEffect(() => {
    if (state.shot) {
      setFlash(state.shot);
      if (state.shot.at && state.shot.at !== lastShotSoundAt.current) {
        lastShotSoundAt.current = state.shot.at;
        if (!localShotFiredRef.current) {
          playGunshotSound();
        }
        localShotFiredRef.current = false;
      }
      const t = window.setTimeout(() => setFlash(null), 900);
      return () => window.clearTimeout(t);
    }
    return undefined;
  }, [state.shot?.at]);

  // Prevent page scroll on touchmove or wheel over the game arena
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return undefined;
    const block = (e) => {
      if (e.cancelable) e.preventDefault();
    };
    el.addEventListener('touchmove', block, { passive: false });
    el.addEventListener('wheel', block, { passive: false });
    return () => {
      el.removeEventListener('touchmove', block);
      el.removeEventListener('wheel', block);
    };
  }, []);

  // Keyboard controls & prevent Space / Arrow keys from scrolling the webpage
  useEffect(() => {
    if (finished) return undefined;

    const blockKeys = new Set(['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'PageUp', 'PageDown']);

    const onKeyDown = (e) => {
      const code = e.code;
      if (blockKeys.has(code)) {
        e.preventDefault();
      }
      if (e.repeat) return;
      if (youAreRunner && playing) {
        if (code === 'Space' || code === 'ArrowLeft' || code === 'KeyA') {
          keysRef.current.walk = true;
        } else if (code === 'ShiftLeft' || code === 'ShiftRight' || code === 'ArrowRight' || code === 'KeyD') {
          keysRef.current.sprint = true;
        }
      }
    };

    const onKeyUp = (e) => {
      const code = e.code;
      if (blockKeys.has(code)) {
        e.preventDefault();
      }
      if (youAreRunner) {
        if (code === 'Space' || code === 'ArrowLeft' || code === 'KeyA') {
          keysRef.current.walk = false;
        } else if (code === 'ShiftLeft' || code === 'ShiftRight' || code === 'ArrowRight' || code === 'KeyD') {
          keysRef.current.sprint = false;
        }
      }
    };

    const onBlur = () => {
      keysRef.current.walk = false;
      keysRef.current.sprint = false;
    };

    window.addEventListener('keydown', onKeyDown, { passive: false });
    window.addEventListener('keyup', onKeyUp, { passive: false });
    window.addEventListener('blur', onBlur);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
      keysRef.current.walk = false;
      keysRef.current.sprint = false;
    };
  }, [youAreRunner, playing, finished]);

  useEffect(() => {
    if (!youAreRunner) return undefined;
    let last = performance.now();
    let raf = 0;
    let alive = true;

    const loop = (now) => {
      if (!alive) return;
      raf = requestAnimationFrame(loop);
      const m = matchRef.current;
      const st = m?.state || {};
      if (m?.status === 'finished' || st.phase === 'finished') return;

      const sn = Number(m?.serverNow) || Date.now();
      const g = Number(st.goAt) || 0;
      const canPlay = m?.status === 'playing'
        && (st.phase === 'playing' || (st.phase === 'countdown' && g > 0 && sn >= g));
      if (!canPlay) return;

      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const walk = keysRef.current.walk || keysRef.current.sprint;
      const sprinting = keysRef.current.sprint;
      if (walk) {
        runnerLocal.current.x -= (sprinting ? SPRINT_SPEED : WALK_SPEED) * dt;
        runnerLocal.current.sprinting = sprinting;
        runnerLocal.current.moving = true;
      } else {
        runnerLocal.current.sprinting = false;
        runnerLocal.current.moving = false;
      }
      runnerLocal.current.x = Math.max(FINISH_X - 5, Math.min(WORLD_W - 20, runnerLocal.current.x));
      runnerLocal.current.y = Math.max(50, Math.min(WORLD_H - 50, runnerLocal.current.y));

      const interval = walk ? 120 : 350;
      if (performance.now() - lastPost.current < interval) return;
      lastPost.current = performance.now();
      sendMove(m.id, 'move', {
        x: runnerLocal.current.x,
        y: runnerLocal.current.y,
        sprinting: runnerLocal.current.sprinting,
      }).then((next) => {
        if (alive && (next?.status === 'finished' || next?.state?.phase === 'finished')) {
          onMatch(next);
        }
      }).catch((err) => {
        if (err?.message && !String(err.message).includes('countdown')) {
          setError(err.message);
        }
      });
    };

    raf = requestAnimationFrame(loop);
    return () => {
      alive = false;
      cancelAnimationFrame(raf);
    };
  }, [youAreRunner, onMatch, setError]);

  // Fixed-camera draw (no world scrolling)
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    let alive = true;
    let raf = 0;

    const draw = () => {
      if (!alive) return;
      raf = requestAnimationFrame(draw);
      try {
        const m = matchRef.current;
        const st = m?.state || {};
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const dpr = Math.min(2, window.devicePixelRatio || 1);
        const cssW = Math.max(320, canvas.clientWidth || 640);
        const cssH = Math.max(200, canvas.clientHeight || 280);
        const tw = Math.floor(cssW * dpr);
        const th = Math.floor(cssH * dpr);
        if (canvas.width !== tw || canvas.height !== th) {
          canvas.width = tw;
          canvas.height = th;
        }
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

        const sx = cssW / WORLD_W;
        const sy = cssH / WORLD_H;

        ctx.fillStyle = '#2a2f38';
        ctx.fillRect(0, 0, cssW, cssH);
        ctx.fillStyle = '#3a414d';
        ctx.fillRect(0, cssH * 0.55, cssW, cssH * 0.45);
        // lane lines — fixed, never scroll
        ctx.strokeStyle = 'rgba(255,255,255,0.06)';
        ctx.lineWidth = 1;
        for (let i = 1; i < 6; i += 1) {
          const y = (cssH * i) / 6;
          ctx.beginPath();
          ctx.moveTo(0, y);
          ctx.lineTo(cssW, y);
          ctx.stroke();
        }
        ctx.fillStyle = 'rgba(52,211,153,0.22)';
        ctx.fillRect(0, 0, FINISH_X * sx, cssH);
        ctx.strokeStyle = 'rgba(52,211,153,0.9)';
        ctx.lineWidth = 2;
        ctx.setLineDash([6, 4]);
        ctx.beginPath();
        ctx.moveTo(FINISH_X * sx, 0);
        ctx.lineTo(FINISH_X * sx, cssH);
        ctx.stroke();
        ctx.setLineDash([]);

        const clock = clockRef.current;
        const perfNow = performance.now();
        const perfStart = clock.perfStart || perfNow;
        const isFinished = m?.status === 'finished' || st.phase === 'finished';
        const isPlaying = m?.status === 'playing'
          && (st.phase === 'playing' || (st.phase === 'countdown' && perfNow >= perfStart));
        const elapsed = (isPlaying || isFinished) && perfNow >= perfStart
          ? Math.max(0, Math.min(180000, perfNow - perfStart))
          : 0;

        const iAmRunner = m?.yourUid === st.runnerUid;
        const iAmSniper = m?.yourUid === st.sniperUid;
        const crowd = buildCrowd(st.seed || 1, elapsed);

        let rx;
        let ry;
        let rSprint;
        let rMoving;
        if (iAmRunner) {
          rx = runnerLocal.current.x;
          ry = runnerLocal.current.y;
          rSprint = runnerLocal.current.sprinting;
          rMoving = runnerLocal.current.moving;
        } else {
          const rr = remoteRunnerRef.current;
          const dt = rr.lastFrameTime ? Math.min(0.05, (perfNow - rr.lastFrameTime) / 1000) : 0.016;
          rr.lastFrameTime = perfNow;

          // Runner only moves left towards FINISH_X (monotonic non-increasing X).
          if (rr.targetMoving) {
            const baseSpeed = rr.targetSprinting ? SPRINT_SPEED : WALK_SPEED;
            const lag = rr.x - rr.targetX;
            let currentSpeed = baseSpeed;
            if (lag > 0) {
              // Smoothly catch up: at most +30% speed boost so it looks completely natural
              const boost = Math.min(0.3, lag / 50);
              currentSpeed = baseSpeed * (1 + boost);
            } else if (lag < 0) {
              // Slightly ahead: gently ease speed, but never move backward (+x)
              const brake = Math.min(0.3, -lag / 30);
              currentSpeed = baseSpeed * (1 - brake);
            }
            // Step forward (left) monotonically
            rr.x -= currentSpeed * dt;
            // Never overshoot target by more than a tiny buffer
            if (rr.x < rr.targetX - 4) {
              rr.x = rr.targetX - 4;
            }
            rr.moving = true;
            rr.sprinting = rr.targetSprinting;
          } else {
            // Player stopped
            if (rr.x > rr.targetX) {
              // Smoothly walk remaining distance to stop target
              rr.x = Math.max(rr.targetX, rr.x - WALK_SPEED * dt);
              rr.moving = rr.x > rr.targetX + 0.5;
              rr.sprinting = false;
            } else {
              // Stopped cleanly: never move backwards
              rr.moving = false;
              rr.sprinting = false;
            }
          }

          rr.x = Math.max(FINISH_X - 5, Math.min(WORLD_W - 20, rr.x));
          rr.y = rr.targetY;

          rx = rr.x;
          ry = rr.y;
          rSprint = rr.sprinting;
          rMoving = rr.moving;
        }

        const runnerPalette = st.runner?.palette?.body
          ? st.runner.palette
          : pickPalette(st.seed || 1, 99);
        const runnerScale = Number(st.runner?.scale) || pickScale(st.seed || 1, 99);

        const runner = {
          id: 'runner',
          x: rx,
          y: ry,
          sprinting: rSprint,
          moving: rMoving,
          palette: runnerPalette,
          scale: runnerScale,
          isRunner: true,
          phase: 0.4,
        };
        const people = [...crowd, runner].sort((a, b) => a.y - b.y);

        ctx.save();
        ctx.scale(sx, sy);
        const tSec = performance.now() / 1000;
        for (const p of people) {
          const bob = p.moving
            ? Math.sin(tSec * (p.sprinting ? 11 : 7.5) + (p.phase || 0)) * (p.sprinting ? 1.8 : 1.05)
            : 0;
          drawPerson(ctx, {
            x: p.x,
            y: p.y,
            sprinting: p.sprinting,
            moving: p.moving,
            palette: p.palette,
            scale: p.scale,
            highlight: Boolean(p.isRunner && iAmRunner && !isFinished),
            bob,
          });
        }
        ctx.restore();

        if (iAmSniper && !isFinished) {
          const hasBullet = (st.bulletsLeft ?? 1) > 0;
          const ax = aimRef.current.x * sx;
          const ay = aimRef.current.y * sy;
          ctx.strokeStyle = hasBullet ? 'rgba(248,113,113,0.95)' : 'rgba(156,163,175,0.45)';
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.arc(ax, ay, 16, 0, Math.PI * 2);
          ctx.moveTo(ax - 26, ay);
          ctx.lineTo(ax - 8, ay);
          ctx.moveTo(ax + 8, ay);
          ctx.lineTo(ax + 26, ay);
          ctx.moveTo(ax, ay - 26);
          ctx.lineTo(ax, ay - 8);
          ctx.moveTo(ax, ay + 8);
          ctx.lineTo(ax, ay + 26);
          ctx.stroke();
          ctx.fillStyle = hasBullet ? '#f87171' : '#9ca3af';
          ctx.beginPath();
          ctx.arc(ax, ay, 2.2, 0, Math.PI * 2);
          ctx.fill();
        }

        if (flash) {
          ctx.fillStyle = 'rgba(255,255,255,0.22)';
          ctx.fillRect(0, 0, cssW, cssH);
          ctx.strokeStyle = flash.hit ? '#4ade80' : '#f87171';
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.arc(Number(flash.x) * sx, Number(flash.y) * sy, 24, 0, Math.PI * 2);
          ctx.stroke();
        }
      } catch (err) {
        console.error('PlainSight draw failed', err);
      }
    };

    raf = requestAnimationFrame(draw);
    return () => {
      alive = false;
      cancelAnimationFrame(raf);
    };
  }, [flash]);

  const onPointerMove = (e) => {
    if (!youAreSniper) return;
    aimRef.current = canvasToWorld(
      canvasRef.current,
      e.clientX,
      e.clientY,
    );
  };

  const onShoot = async (e) => {
    if (!youAreSniper || busy || finished || !playing || (state.bulletsLeft ?? 1) <= 0) return;
    e.preventDefault();
    e.stopPropagation();
    localShotFiredRef.current = true;
    playGunshotSound();
    const pt = canvasToWorld(
      canvasRef.current,
      e.clientX,
      e.clientY,
    );
    aimRef.current = pt;
    setBusy(true);
    setError('');
    try {
      onMatch(await sendMove(match.id, 'shoot', { x: pt.x, y: pt.y }));
    } catch (err) {
      localShotFiredRef.current = false;
      setError(err.message || 'Shot failed.');
    } finally {
      setBusy(false);
    }
  };

  const setHold = (key, on) => {
    keysRef.current[key] = on;
  };

  let resultText = '';
  if (finished) {
    if (state.winReason === 'escaped') {
      resultText = youAreRunner
        ? (state.shot ? 'Sniper missed — you made it across!' : 'You escaped in the crowd!')
        : (state.shot ? `${oppFirst} survived your shot and escaped!` : `${oppFirst} slipped through.`);
    } else if (state.winReason === 'sniped') {
      resultText = youAreSniper ? 'Clean shot — you got them!' : `${oppFirst} spotted you.`;
    } else if (state.winReason === 'miss') {
      resultText = youAreSniper ? 'Missed! Wrong target.' : `${oppFirst} missed — you win!`;
    } else {
      resultText = state.matchWinnerUid === match.yourUid ? 'You win!' : `${oppFirst} wins.`;
    }
  }

  const roleLabel = youAreRunner ? 'walker' : youAreSniper ? 'sniper' : 'player';
  const showCountdown = Boolean(countdownLabel) && !finished && match?.status === 'playing';

  return (
    <div className="space-y-3 select-none">
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
        <div className="text-slate-300">
          You are the <strong className="text-white">{roleLabel}</strong>
          {' · '}vs {oppFirst}
        </div>
        <div className="text-xs text-slate-400">
          {youAreSniper
            ? ((state.bulletsLeft ?? 1) <= 0 ? 'Bullets: 0 (Empty)' : 'Bullets: 1')
            : (state.shot && !state.shot.hit && !finished
                ? 'Sniper missed! Sprint to the green line!'
                : 'Walk, pause, blend in — reach the green line')}
        </div>
      </div>

      {finished ? (
        <div className={`rounded-2xl px-4 py-4 text-center font-semibold ${
          state.matchWinnerUid === match.yourUid
            ? 'border border-emerald-400/40 bg-emerald-500/20 text-emerald-100'
            : 'border border-rose-400/40 bg-rose-500/15 text-rose-100'
        }`}
        >
          <div className="text-xl">{resultText}</div>
        </div>
      ) : null}

      <div
        ref={wrapRef}
        className="relative overflow-hidden rounded-2xl border border-white/15 bg-[#2a2f38] touch-none overscroll-contain select-none min-h-[260px]"
        style={{ touchAction: 'none' }}
      >
        <canvas
          ref={canvasRef}
          className={`block w-full h-[260px] sm:h-[320px] bg-[#2a2f38] touch-none select-none ${
            youAreSniper && (state.bulletsLeft ?? 1) > 0 ? 'cursor-crosshair' : 'cursor-default'
          }`}
          style={{ touchAction: 'none' }}
          onPointerMove={onPointerMove}
          onPointerDown={youAreSniper ? onShoot : undefined}
        />

        {showCountdown ? (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/45">
            <div
              key={countdownLabel}
              className={`font-black text-white drop-shadow-lg ${
                countdownLabel === 'GO' ? 'text-5xl sm:text-6xl text-emerald-300' : 'text-7xl sm:text-8xl'
              }`}
              style={{ animation: 'ps-pop 0.35s ease-out' }}
            >
              {countdownLabel}
            </div>
            <style>
              {`@keyframes ps-pop {
                0% { transform: scale(0.6); opacity: 0.2; }
                100% { transform: scale(1); opacity: 1; }
              }`}
            </style>
          </div>
        ) : null}

        {youAreRunner && playing && !finished && state.shot && !state.shot.hit ? (
          <div className="pointer-events-none absolute inset-x-0 top-3 flex justify-center">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/95 px-3.5 py-1 text-xs font-bold text-white shadow-lg animate-bounce">
              ⚡ Sniper missed! Sprint to the finish line!
            </span>
          </div>
        ) : null}

        {youAreSniper && playing && !finished && (state.bulletsLeft ?? 1) <= 0 ? (
          <div className="pointer-events-none absolute inset-x-0 top-3 flex justify-center">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-rose-500/90 px-3.5 py-1 text-xs font-semibold text-white shadow-lg">
              Missed! Out of bullets — walker is running for the finish!
            </span>
          </div>
        ) : null}

        {youAreRunner && !finished && !inCountdown ? (
          <div className="absolute inset-x-0 bottom-0 flex gap-2 p-3 bg-gradient-to-t from-black/75 to-transparent select-none touch-none">
            <button
              type="button"
              style={{ touchAction: 'none' }}
              onPointerDown={(e) => { e.preventDefault(); e.stopPropagation(); setHold('walk', true); }}
              onPointerUp={(e) => { e.preventDefault(); setHold('walk', false); }}
              onPointerLeave={() => setHold('walk', false)}
              onPointerCancel={() => setHold('walk', false)}
              className="flex-1 select-none rounded-xl bg-sky-500/90 py-3 text-sm font-bold text-white active:bg-sky-400 touch-none shadow-md"
            >
              Walk (Hold)
            </button>
            <button
              type="button"
              style={{ touchAction: 'none' }}
              onPointerDown={(e) => { e.preventDefault(); e.stopPropagation(); setHold('sprint', true); }}
              onPointerUp={(e) => { e.preventDefault(); setHold('sprint', false); }}
              onPointerLeave={() => setHold('sprint', false)}
              onPointerCancel={() => setHold('sprint', false)}
              className={`flex-1 select-none rounded-xl py-3 text-sm font-bold active:bg-amber-300 touch-none shadow-md ${
                state.shot && !state.shot.hit
                  ? 'bg-amber-400 text-slate-900 ring-4 ring-amber-300/60 animate-pulse'
                  : 'bg-amber-400 text-slate-900'
              }`}
            >
              Sprint (Hold) {state.shot && !state.shot.hit ? '— RUN!' : ''}
            </button>
          </div>
        ) : null}

        {youAreSniper && playing && !finished && (state.bulletsLeft ?? 1) > 0 ? (
          <p className="absolute left-0 right-0 top-2 text-center text-[11px] text-white/75 pointer-events-none select-none">
            Aim and tap — one bullet. Camera is fixed; shoot where they are.
          </p>
        ) : null}
      </div>

      <p className="text-[11px] text-slate-500 text-center select-none">
        {youAreRunner
          ? (state.shot && !state.shot.hit && !finished
              ? 'Sniper is out of bullets! Hold Sprint to reach the green line and win.'
              : 'Hold Walk or Space / ← to blend in. AI never sprints — sprinting gives you away! If the sniper misses, sprint for the finish.')
          : 'Watch for who walks when the crowd is stopped, or anyone sprinting (AI never sprints!). Tap to shoot — one bullet.'}
      </p>
    </div>
  );
}
