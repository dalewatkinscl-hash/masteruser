import { useCallback, useEffect, useRef, useState } from 'react';
import FunDayPicker, { getLondonDayKey } from './FunDayPicker';
import FunLeaderboardRow from './FunLeaderboardRow';
import WantedTutorialModal, { hasSeenWantedTutorial } from './WantedTutorialModal';
import {
  buildWantedPuzzle,
  scramblePieceMotion,
  correctedTimeMs,
  formatWantedTime,
  gradeForTimeMs,
  gradeForCombinedTimeMs,
  PENALTY_MS,
  wantedResultLabel,
} from '../lib/wanted';

async function readJsonResponse(res) {
  const contentType = res.headers.get('content-type') || '';
  if (!contentType.includes('application/json')) return null;
  try {
    return await res.json();
  } catch {
    return null;
  }
}

const LOCAL_BEST_KEY = 'wanted-sandbox-best-v2';

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
    if (!prev || result.combinedTimeMs < prev.combinedTimeMs) {
      all[dayKey] = result;
      localStorage.setItem(LOCAL_BEST_KEY, JSON.stringify(all));
    }
  } catch {
    // ignore
  }
}

/**
 * Canvas playfield — sprite-cached emojis + DOM HUD (no React work per frame).
 */
const emojiSpriteCache = new Map();

function getEmojiSprite(emoji, size) {
  const key = `${emoji}@${size}`;
  let sprite = emojiSpriteCache.get(key);
  if (sprite) return sprite;
  const pad = Math.ceil(size * 0.2);
  const dim = size + pad * 2;
  const c = document.createElement('canvas');
  c.width = dim;
  c.height = dim;
  const ctx = c.getContext('2d');
  ctx.font = `${size}px "Segoe UI Emoji","Apple Color Emoji","Noto Color Emoji",sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(emoji, dim / 2, dim / 2 + size * 0.04);
  sprite = { canvas: c, dim, half: dim / 2 };
  emojiSpriteCache.set(key, sprite);
  return sprite;
}

function WantedCanvas({
  dayKey,
  challenge,
  onComplete = null,
  disabled = false,
  headline = 'TAP TO START',
}) {
  const canvasRef = useRef(null);
  const ctxRef = useRef(null);
  const wrapRef = useRef(null);
  const puzzleRef = useRef(null);
  const piecesRef = useRef([]);
  const phaseRef = useRef('ready');
  const startRef = useRef(0);
  const penaltiesRef = useRef(0);
  const rafRef = useRef(0);
  const lastTsRef = useRef(0);
  const flashUntilRef = useRef(0);
  const flashIdRef = useRef('');
  const lastHudMsRef = useRef(-1);
  const cssWRef = useRef(1);
  const cssHRef = useRef(1);

  const gradeRef = useRef(null);
  const timeRef = useRef(null);
  const missesRef = useRef(null);
  const penaltyToastRef = useRef(null);

  const [phase, setPhase] = useState('ready');
  const [result, setResult] = useState(null);
  const [wantedEmoji, setWantedEmoji] = useState('?');
  const [hideTarget, setHideTarget] = useState(false);

  const stopLoop = useCallback(() => {
    cancelAnimationFrame(rafRef.current);
    rafRef.current = 0;
  }, []);

  const writeHud = useCallback((timeMs, penalties, grade, force = false) => {
    const rounded = Math.floor(timeMs / 100) * 100;
    if (!force && rounded === lastHudMsRef.current && !force) return;
    lastHudMsRef.current = rounded;
    if (timeRef.current) timeRef.current.textContent = formatWantedTime(timeMs);
    if (gradeRef.current) gradeRef.current.textContent = grade;
    if (missesRef.current) missesRef.current.textContent = String(penalties);
  }, []);

  const resizeCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;
    // dpr=1 keeps fill/draw cheap; retina sharpness isn't worth the cost here
    const w = Math.max(1, Math.floor(wrap.clientWidth));
    const h = Math.max(1, Math.floor(wrap.clientHeight));
    cssWRef.current = w;
    cssHRef.current = h;
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
      ctxRef.current = canvas.getContext('2d', { alpha: false });
    }
    if (!ctxRef.current) ctxRef.current = canvas.getContext('2d', { alpha: false });
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
  }, []);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const ctx = ctxRef.current || (canvas && canvas.getContext('2d', { alpha: false }));
    if (!canvas || !ctx) return;
    ctxRef.current = ctx;
    const w = cssWRef.current;
    const h = cssHRef.current;
    ctx.fillStyle = '#0a1220';
    ctx.fillRect(0, 0, w, h);

    // Never paint the crowd until the timer is running (stops pre-start scouting).
    if (phaseRef.current === 'ready') return;

    const now = performance.now();
    const flashing = now < flashUntilRef.current ? flashIdRef.current : '';
    const pieces = piecesRef.current;
    const won = phaseRef.current === 'won';

    for (let i = 0; i < pieces.length; i += 1) {
      const p = pieces[i];
      const sprite = getEmojiSprite(p.emoji, p.size);
      const scale = (p.id === flashing || (won && p.isTarget)) ? 1.2 : 1;
      const half = sprite.half * scale;
      const px = (p.x / 100) * w;
      const py = (p.y / 100) * h;
      ctx.drawImage(sprite.canvas, px - half, py - half, sprite.dim * scale, sprite.dim * scale);
    }
  }, []);

  const tick = useCallback((ts) => {
    if (phaseRef.current !== 'playing') return;
    const last = lastTsRef.current || ts;
    let dt = (ts - last) / 1000;
    if (dt > 0.05) dt = 0.05;
    lastTsRef.current = ts;

    const pieces = piecesRef.current;
    const step = dt * 0.32;
    for (let i = 0; i < pieces.length; i += 1) {
      const p = pieces[i];
      let x = p.x + p.vx * step;
      let y = p.y + p.vy * step;
      let { vx, vy } = p;
      if (x < 2) { x = 2; vx = Math.abs(vx); }
      else if (x > 98) { x = 98; vx = -Math.abs(vx); }
      if (y < 2) { y = 2; vy = Math.abs(vy); }
      else if (y > 98) { y = 98; vy = -Math.abs(vy); }
      p.x = x;
      p.y = y;
      p.vx = vx;
      p.vy = vy;
    }

    const elapsed = Math.max(0, Math.floor(performance.now() - startRef.current));
    const pens = penaltiesRef.current;
    const timeMs = correctedTimeMs(elapsed, pens);
    writeHud(timeMs, pens, gradeForTimeMs(timeMs));

    draw();
    rafRef.current = requestAnimationFrame(tick);
  }, [draw, writeHud]);

  /** Set poster / puzzle meta without revealing the crowd. */
  const preparePoster = useCallback((key, mode) => {
    const next = buildWantedPuzzle(key, mode);
    puzzleRef.current = next;
    piecesRef.current = [];
    setWantedEmoji(next.target);
    setHideTarget(Boolean(next.hideTarget));
    resizeCanvas();
    draw();
  }, [draw, resizeCanvas]);

  const spawnCrowd = useCallback((key, mode) => {
    const next = buildWantedPuzzle(key, mode);
    puzzleRef.current = next;
    const laid = scramblePieceMotion(next.pieces);
    for (let i = 0; i < laid.length; i += 1) getEmojiSprite(laid[i].emoji, laid[i].size);
    piecesRef.current = laid;
    setWantedEmoji(next.target);
    setHideTarget(Boolean(next.hideTarget));
    resizeCanvas();
    draw();
  }, [draw, resizeCanvas]);

  const resetBoard = useCallback(() => {
    stopLoop();
    phaseRef.current = 'ready';
    setPhase('ready');
    penaltiesRef.current = 0;
    lastHudMsRef.current = -1;
    writeHud(0, 0, '—', true);
    if (timeRef.current) timeRef.current.textContent = '0.0s';
    if (gradeRef.current) gradeRef.current.textContent = '—';
    setResult(null);
    if (penaltyToastRef.current) {
      penaltyToastRef.current.style.display = 'none';
    }
    preparePoster(dayKey, challenge);
  }, [challenge, dayKey, preparePoster, stopLoop, writeHud]);

  useEffect(() => {
    resetBoard();
  }, [resetBoard]);

  useEffect(() => {
    resizeCanvas();
    const onResize = () => {
      resizeCanvas();
      draw();
    };
    window.addEventListener('resize', onResize);
    return () => {
      window.removeEventListener('resize', onResize);
      stopLoop();
    };
  }, [draw, resizeCanvas, stopLoop]);

  const start = useCallback(() => {
    if (disabled || phaseRef.current === 'playing') return;
    // Spawn + scramble only when the clock starts — no pre-start scouting.
    spawnCrowd(dayKey, challenge);
    phaseRef.current = 'playing';
    setPhase('playing');
    setResult(null);
    penaltiesRef.current = 0;
    startRef.current = performance.now();
    lastTsRef.current = 0;
    lastHudMsRef.current = -1;
    writeHud(0, 0, 'S', true);
    rafRef.current = requestAnimationFrame(tick);
  }, [challenge, dayKey, disabled, spawnCrowd, tick, writeHud]);

  const hitTest = useCallback((clientX, clientY) => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const xPct = ((clientX - rect.left) / rect.width) * 100;
    const yPct = ((clientY - rect.top) / rect.height) * 100;
    const w = rect.width;
    const h = rect.height;
    for (let i = piecesRef.current.length - 1; i >= 0; i -= 1) {
      const p = piecesRef.current[i];
      const radiusPctX = ((p.size * 0.55) / w) * 100;
      const radiusPctY = ((p.size * 0.55) / h) * 100;
      if (Math.abs(xPct - p.x) <= radiusPctX && Math.abs(yPct - p.y) <= radiusPctY) {
        return p;
      }
    }
    return null;
  }, []);

  const onPointerDown = useCallback((event) => {
    if (disabled || phaseRef.current !== 'playing') return;
    event.preventDefault();
    const piece = hitTest(event.clientX, event.clientY);
    if (!piece) return;

    if (piece.isTarget) {
      stopLoop();
      phaseRef.current = 'won';
      setPhase('won');
      const elapsed = Math.max(0, Math.floor(performance.now() - startRef.current));
      const pens = penaltiesRef.current;
      const timeMs = correctedTimeMs(elapsed, pens);
      const grade = gradeForTimeMs(timeMs);
      const target = puzzleRef.current?.target || wantedEmoji;
      const payload = {
        challenge,
        elapsedMs: elapsed,
        penalties: pens,
        timeMs,
        grade,
        target,
      };
      setResult(payload);
      writeHud(timeMs, pens, grade, true);
      draw();
      onComplete?.(payload);
      return;
    }

    penaltiesRef.current += 1;
    flashIdRef.current = piece.id;
    flashUntilRef.current = performance.now() + 180;
    const elapsed = Math.max(0, Math.floor(performance.now() - startRef.current));
    const pens = penaltiesRef.current;
    const timeMs = correctedTimeMs(elapsed, pens);
    writeHud(timeMs, pens, gradeForTimeMs(timeMs), true);
    if (penaltyToastRef.current) {
      const el = penaltyToastRef.current;
      el.style.display = 'block';
      el.textContent = `+${PENALTY_MS / 1000}s`;
      window.clearTimeout(el._hideTimer);
      el._hideTimer = window.setTimeout(() => {
        el.style.display = 'none';
      }, 350);
    }
  }, [challenge, disabled, draw, hitTest, onComplete, stopLoop, wantedEmoji, writeHud]);

  const showTarget = !hideTarget || phase === 'won';

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-stretch gap-3">
        <div className="rounded-xl border-2 border-rose-500/60 bg-[#0b1220] px-4 py-3 min-w-[7.5rem] text-center">
          <p className="text-[10px] font-bold tracking-[0.2em] text-rose-400">WANTED</p>
          <div className="mt-2 mx-auto w-14 h-14 rounded-lg border-2 border-rose-500/50 flex items-center justify-center bg-black/30 text-3xl">
            {showTarget ? wantedEmoji : (
              <span className="text-[10px] font-bold tracking-wider text-slate-300">HIDDEN</span>
            )}
          </div>
        </div>
        <div className="flex-1 min-w-[10rem] rounded-xl border border-[#1a2540] bg-[#0b1220] px-4 py-3 flex flex-wrap gap-6 items-center">
          <div>
            <p className="text-[10px] font-semibold tracking-wider text-slate-500 uppercase">Grade</p>
            <p ref={gradeRef} className="text-3xl font-black text-amber-300 leading-none mt-1">—</p>
          </div>
          <div>
            <p className="text-[10px] font-semibold tracking-wider text-slate-500 uppercase">Time</p>
            <p ref={timeRef} className="text-2xl font-bold tabular-nums text-slate-100 leading-none mt-1">0.0s</p>
          </div>
          <div>
            <p className="text-[10px] font-semibold tracking-wider text-slate-500 uppercase">Misses</p>
            <p ref={missesRef} className="text-2xl font-bold tabular-nums text-rose-300 leading-none mt-1">0</p>
          </div>
        </div>
      </div>

      <div
        ref={wrapRef}
        className="relative w-full aspect-[4/3] max-h-[28rem] rounded-xl border-2 border-[#1a2540] bg-[#0a1220] overflow-hidden shadow-[4px_4px_0_#000] touch-none"
      >
        <canvas
          ref={canvasRef}
          className="absolute inset-0 w-full h-full cursor-crosshair"
          onPointerDown={onPointerDown}
        />

        {phase === 'ready' ? (
          <button
            type="button"
            onClick={start}
            disabled={disabled}
            className="absolute inset-0 z-10 flex items-center justify-center bg-[#0b1220] text-xl sm:text-2xl font-black tracking-wide text-white hover:bg-[#111a2c] disabled:opacity-50"
          >
            {headline}
          </button>
        ) : null}

        <div
          ref={penaltyToastRef}
          className="pointer-events-none absolute top-3 right-3 z-10 rounded-md border border-rose-500/50 bg-rose-500/20 px-2.5 py-1 text-sm font-bold text-rose-200"
          style={{ display: 'none' }}
        />

        {phase === 'won' && result ? (
          <div className="absolute inset-x-0 bottom-0 z-20 border-t border-emerald-500/30 bg-emerald-950/90 px-4 py-3 text-center">
            <p className="text-sm font-semibold text-emerald-200">
              Caught {result.target} · {result.grade} · {formatWantedTime(result.timeMs)}
              {result.penalties ? ` · ${result.penalties} miss${result.penalties === 1 ? '' : 'es'}` : ''}
            </p>
            <button
              type="button"
              onClick={resetBoard}
              className="mt-2 text-xs text-emerald-300/90 hover:text-emerald-200 underline"
            >
              Retry this round
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function StagePill({ stage, standardDone, impossibleDone }) {
  const items = [
    { id: 'standard', label: '1 · Standard', done: standardDone, active: stage === 'standard' },
    { id: 'impossible', label: '2 · Impossible', done: impossibleDone, active: stage === 'impossible' },
  ];
  return (
    <div className="flex flex-wrap gap-2">
      {items.map((item) => (
        <span
          key={item.id}
          className={`px-3 py-1.5 rounded-md text-xs font-semibold ${
            item.done
              ? 'bg-emerald-600/25 text-emerald-200 border border-emerald-500/40'
              : item.active
                ? 'bg-rose-600 text-white'
                : 'text-slate-500 border border-[#1a2540]'
          }`}
        >
          {item.label}{item.done ? ' ✓' : ''}
        </span>
      ))}
    </div>
  );
}

function ImpossibleBriefing({ standardResult, onReady }) {
  return (
    <div className="rounded-xl border border-rose-500/40 bg-[#0b1220] px-5 py-6 space-y-4">
      <div className="text-center space-y-1">
        <p className="text-[10px] font-bold tracking-[0.2em] uppercase text-rose-400">Round 2</p>
        <p className="text-xl font-bold text-white">Impossible</p>
      </div>
      <div className="flex justify-center">
        <div className="rounded-lg border-2 border-rose-500/70 bg-white/5 px-4 py-2 text-center min-w-[6rem]">
          <p className="text-[10px] font-bold tracking-widest text-rose-400">WANTED</p>
          <p className="text-sm font-bold mt-1 tracking-wider text-slate-300">HIDDEN</p>
        </div>
      </div>
      <ul className="text-sm text-slate-300 space-y-2 list-disc pl-5">
        <li>The poster does <span className="text-white font-medium">not</span> show the target.</li>
        <li>Most emojis appear more than once — find the one that appears <span className="text-white font-medium">only once</span>.</li>
        <li>Misses still add +3s. This round locks in for the leaderboard.</li>
      </ul>
      {standardResult ? (
        <p className="text-xs text-slate-500 text-center">
          Standard locked at {formatWantedTime(standardResult.timeMs)} ({standardResult.grade})
        </p>
      ) : null}
      <button
        type="button"
        onClick={onReady}
        className="w-full rounded-lg bg-rose-600 hover:bg-rose-500 text-white font-semibold py-3 transition-colors"
      >
        Got it — play Impossible
      </button>
    </div>
  );
}

function WantedRun({
  dayKey,
  initialStandard = null,
  initialImpossible = null,
  onStageComplete = null,
  disabled = false,
  /** Competitive day: first finish locks; no leaderboard re-runs. */
  lockScores = false,
}) {
  const [stage, setStage] = useState(() => (initialStandard ? (initialImpossible ? 'complete' : 'impossible') : 'standard'));
  const [standardResult, setStandardResult] = useState(initialStandard);
  const [impossibleResult, setImpossibleResult] = useState(initialImpossible);
  const [runKey, setRunKey] = useState(0);
  const [impossibleReady, setImpossibleReady] = useState(() => Boolean(initialImpossible));
  const [practiceReplay, setPracticeReplay] = useState(false);
  const seededDayRef = useRef('');

  useEffect(() => {
    seededDayRef.current = dayKey;
    setStandardResult(initialStandard);
    setImpossibleResult(initialImpossible);
    setStage(initialStandard ? (initialImpossible ? 'complete' : 'impossible') : 'standard');
    setImpossibleReady(Boolean(initialImpossible));
    setPracticeReplay(false);
    setRunKey((k) => k + 1);
    // Intentionally only when the London day changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dayKey]);

  useEffect(() => {
    if (seededDayRef.current !== dayKey) return;
    setStandardResult((prev) => prev || initialStandard || null);
    setImpossibleResult((prev) => prev || initialImpossible || null);
    if (initialStandard && initialImpossible) {
      setStage((prev) => (prev === 'standard' ? 'complete' : prev));
    } else if (initialStandard) {
      setStage((prev) => (prev === 'standard' ? 'impossible' : prev));
      // Returning mid-run: show briefing again unless they already finished Impossible.
      if (!initialImpossible) setImpossibleReady(false);
    }
  }, [dayKey, initialStandard, initialImpossible]);

  const combined = standardResult && impossibleResult
    ? {
      combinedTimeMs: standardResult.timeMs + impossibleResult.timeMs,
      combinedPenalties: (standardResult.penalties || 0) + (impossibleResult.penalties || 0),
      combinedGrade: gradeForCombinedTimeMs(standardResult.timeMs + impossibleResult.timeMs),
    }
    : null;

  const onComplete = useCallback((payload) => {
    if (payload.challenge === 'standard') {
      setStandardResult(payload);
      if (!practiceReplay) onStageComplete?.(payload);
      window.setTimeout(() => {
        setImpossibleReady(false);
        setStage('impossible');
        setRunKey((k) => k + 1);
      }, 650);
      return;
    }
    setImpossibleResult(payload);
    if (!practiceReplay) onStageComplete?.(payload);
    setStage('complete');
  }, [onStageComplete, practiceReplay]);

  if (stage === 'complete' && combined) {
    return (
      <div className="space-y-3">
        <StagePill stage={stage} standardDone impossibleDone />
        <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 px-5 py-5 text-center space-y-2">
          <p className="text-xs font-semibold tracking-[0.18em] uppercase text-amber-200/80">Combined score</p>
          <p className="text-5xl font-black text-amber-300">{combined.combinedGrade}</p>
          <p className="text-2xl font-bold tabular-nums text-white">{formatWantedTime(combined.combinedTimeMs)}</p>
          <p className="text-xs text-slate-400">
            Standard {formatWantedTime(standardResult.timeMs)}
            {' + '}
            Impossible {formatWantedTime(impossibleResult.timeMs)}
            {combined.combinedPenalties
              ? ` · ${combined.combinedPenalties} miss${combined.combinedPenalties === 1 ? '' : 'es'}`
              : ''}
          </p>
          {lockScores && !practiceReplay ? (
            <p className="text-xs text-slate-500 pt-1">
              Today’s leaderboard score is locked — one attempt.
            </p>
          ) : null}
          <button
            type="button"
            onClick={() => {
              setStandardResult(null);
              setImpossibleResult(null);
              setImpossibleReady(false);
              setStage('standard');
              setPracticeReplay(Boolean(lockScores));
              setRunKey((k) => k + 1);
            }}
            className="mt-2 text-sm text-amber-200 hover:text-amber-100 underline"
          >
            {lockScores ? 'Practice again (won’t count)' : 'Play full run again'}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <StagePill
        stage={stage}
        standardDone={Boolean(standardResult)}
        impossibleDone={Boolean(impossibleResult)}
      />
      {stage === 'impossible' && !impossibleReady ? (
        <ImpossibleBriefing
          standardResult={standardResult}
          onReady={() => setImpossibleReady(true)}
        />
      ) : (
        <>
          {standardResult && stage === 'impossible' ? (
            <p className="text-xs text-slate-400">
              Standard locked in at {formatWantedTime(standardResult.timeMs)} ({standardResult.grade}).
            </p>
          ) : (
            <p className="text-xs text-slate-400">
              Round 1: find the WANTED emoji. Clear it to unlock Impossible.
            </p>
          )}
          <WantedCanvas
            key={`${dayKey}-${stage}-${runKey}`}
            dayKey={dayKey}
            challenge={stage}
            disabled={disabled}
            headline={stage === 'impossible' ? 'TAP FOR IMPOSSIBLE' : 'TAP TO START'}
            onComplete={onComplete}
          />
        </>
      )}
    </div>
  );
}

export function WantedSandbox() {
  const todayKey = getLondonDayKey();
  const [dayKey, setDayKey] = useState(todayKey);
  const [tutorialOpen, setTutorialOpen] = useState(false);
  const [localBest, setLocalBest] = useState(null);
  const [standard, setStandard] = useState(null);
  const [impossible, setImpossible] = useState(null);

  useEffect(() => {
    if (!hasSeenWantedTutorial()) setTutorialOpen(true);
  }, []);

  useEffect(() => {
    setLocalBest(readLocalBest(dayKey));
    setStandard(null);
    setImpossible(null);
  }, [dayKey]);

  return (
    <div className="space-y-4">
      <WantedTutorialModal open={tutorialOpen} onClose={() => setTutorialOpen(false)} />
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-lg font-semibold text-rose-200">Wanted (sandbox)</p>
          <p className="text-sm text-slate-400 mt-1">
            Clear Standard, then Impossible. Your score is the combined corrected time.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setTutorialOpen(true)}
          className="text-xs text-slate-400 hover:text-rose-300"
        >
          How to play
        </button>
      </div>

      <FunDayPicker dayKey={dayKey} todayKey={todayKey} onChange={setDayKey} allowFuture />

      {localBest ? (
        <p className="text-xs text-slate-400">
          Sandbox best:{' '}
          <span className="text-amber-300 font-semibold">{localBest.combinedGrade}</span>
          {' · '}
          {formatWantedTime(localBest.combinedTimeMs)}
        </p>
      ) : null}

      <WantedRun
        dayKey={dayKey}
        initialStandard={standard}
        initialImpossible={impossible}
        onStageComplete={(payload) => {
          if (payload.challenge === 'standard') {
            setStandard(payload);
            return;
          }
          setImpossible(payload);
          setStandard((prev) => {
            if (prev) {
              const combo = {
                combinedTimeMs: prev.timeMs + payload.timeMs,
                combinedGrade: gradeForCombinedTimeMs(prev.timeMs + payload.timeMs),
                standard: prev,
                impossible: payload,
              };
              writeLocalBest(dayKey, combo);
              setLocalBest(combo);
            }
            return prev;
          });
        }}
      />
    </div>
  );
}

export function WantedDailyPanel({
  currentUserUid = null,
  onAchievements = null,
  isAdmin = false,
}) {
  const todayKey = getLondonDayKey();
  const [dayKey, setDayKey] = useState(todayKey);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [game, setGame] = useState(null);
  const [leaderboard, setLeaderboard] = useState([]);
  const [practice, setPractice] = useState(false);
  const [tutorialOpen, setTutorialOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!hasSeenWantedTutorial()) setTutorialOpen(true);
  }, []);

  const load = useCallback(async (key) => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (key && key !== todayKey) params.set('dayKey', key);
      const query = params.toString() ? `?${params}` : '';
      const response = await fetch(`/api/getDailyWanted${query}`, { credentials: 'include' });
      const payload = (await readJsonResponse(response)) || {};
      if (!response.ok) throw new Error(payload.error || 'Failed to load Wanted.');
      setGame(payload.game || null);
      setLeaderboard(payload.leaderboard || payload.leaderboards?.combined || []);
      setPractice(Boolean(payload.practice));
      setError('');
    } catch (err) {
      setError(err.message || 'Failed to load Wanted.');
      setGame(null);
      setLeaderboard([]);
    } finally {
      setLoading(false);
    }
  }, [todayKey]);

  useEffect(() => {
    load(dayKey);
  }, [dayKey, load]);

  const submit = useCallback(async (payload) => {
    if (practice || submitting) return;
    setSubmitting(true);
    try {
      const response = await fetch('/api/submitWantedResult', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          dayKey: dayKey !== todayKey ? dayKey : undefined,
          challenge: payload.challenge,
          timeMs: payload.timeMs,
          penalties: payload.penalties,
          elapsedMs: payload.elapsedMs,
          grade: payload.grade,
        }),
      });
      const body = (await readJsonResponse(response)) || {};
      if (!response.ok) throw new Error(body.error || 'Failed to submit.');
      setGame(body.game || null);
      setLeaderboard(body.leaderboard || body.leaderboards?.combined || []);
      if (body.achievements && typeof onAchievements === 'function') {
        onAchievements(body.achievements);
      }
      setError('');
    } catch (err) {
      setError(err.message || 'Could not save result.');
    } finally {
      setSubmitting(false);
    }
  }, [practice, submitting, dayKey, todayKey, onAchievements]);

  if (loading) return <p className="text-sm text-slate-400">Loading Wanted…</p>;
  if (error && !game) return <p className="text-sm text-rose-300">{error}</p>;

  return (
    <div className="space-y-3">
      <WantedTutorialModal open={tutorialOpen} onClose={() => setTutorialOpen(false)} />
      <FunDayPicker
        dayKey={dayKey}
        todayKey={todayKey}
        onChange={setDayKey}
        allowFuture={Boolean(isAdmin)}
      />

      {practice ? (
        <p className="text-xs text-amber-200/90 border border-amber-500/30 bg-amber-500/10 rounded-md px-3 py-2">
          Practice day — results won’t count on the leaderboard.
        </p>
      ) : (
        <p className="text-sm text-slate-400">
          One attempt: Standard then Impossible. Combined corrected time is your score.
          {submitting ? ' · Saving…' : ''}
        </p>
      )}

      {game?.combinedTimeMs != null ? (
        <p className="text-xs text-slate-400">
          Score today:{' '}
          <span className="text-amber-300 font-semibold">{game.combinedGrade}</span>
          {' · '}
          {formatWantedTime(game.combinedTimeMs)}
          {!practice ? ' (locked)' : ''}
        </p>
      ) : null}

      {error ? <p className="text-sm text-rose-300">{error}</p> : null}

      <WantedRun
        dayKey={dayKey}
        initialStandard={game?.standard || null}
        initialImpossible={game?.impossible || null}
        onStageComplete={practice ? null : submit}
        lockScores={!practice}
      />

      {!practice && leaderboard.length ? (
        <div className="rounded-xl border border-[#1a2540] overflow-hidden">
          <div className="px-4 py-2.5 border-b border-[#1a2540] text-xs font-semibold uppercase tracking-wider text-slate-500">
            Combined leaderboard
          </div>
          <ul className="divide-y divide-[#1a2540]">
            {leaderboard.map((row) => (
              <FunLeaderboardRow
                key={row.uid || row.rank}
                row={row}
                currentUserUid={currentUserUid}
                resultText={row.resultLabel || wantedResultLabel(row)}
              />
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

export default WantedSandbox;
