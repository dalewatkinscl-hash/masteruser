import { useCallback, useEffect, useRef, useState } from 'react';
import {
  HOTWIRE_FILL_PER_TAP,
  HOTWIRE_MIN_TAP_GAP_MS,
  HOTWIRE_WINDOW_MS,
  LINE_BASE_SPEED,
  REV_BASE_SPEED,
  REV_OVERREV_START,
  REV_SWEET_CENTER,
  REV_SWEET_HALF,
  cleanIntel,
  grabDurationMs,
  hotwireGradeFromFill,
  hotwireGradeLabel,
  hotwireRevMods,
  itemValue,
  lineQuality,
  pickLootType,
  revQuality,
  rollIntel,
  smashDepth,
  smashGradeFromDepth,
  spawnIntervalMs,
  totalLootValue,
} from '../lib/smashGrab';

const PHASE = {
  TITLE: 'title',
  INTEL: 'intel',
  HOTWIRE: 'hotwire',
  HOTWIRE_RESULT: 'hotwire_result',
  REV: 'rev',
  LINE: 'line',
  SMASH: 'smash',
  GRAB: 'grab',
  SCORE: 'score',
};

const INTRO_KEY = 'smash-grab-intro-seen-v1';
const LOCAL_BEST_KEY = 'smash-grab-sandbox-best-v1';

function hasSeenIntro() {
  try {
    return localStorage.getItem(INTRO_KEY) === '1';
  } catch {
    return false;
  }
}

function markIntroSeen() {
  try {
    localStorage.setItem(INTRO_KEY, '1');
  } catch {
    /* ignore */
  }
}

function readLocalBest() {
  try {
    return JSON.parse(localStorage.getItem(LOCAL_BEST_KEY) || 'null');
  } catch {
    return null;
  }
}

function writeLocalBest(score) {
  try {
    const prev = readLocalBest();
    if (!prev || score > prev.lootValue) {
      localStorage.setItem(LOCAL_BEST_KEY, JSON.stringify({ lootValue: score, at: Date.now() }));
    }
  } catch {
    /* ignore */
  }
}

function IntroBubble({ open, onClose }) {
  if (!open) return null;
  return (
    <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 space-y-2">
      <p className="text-sm font-semibold text-amber-100">Daz’s tip</p>
      <p className="text-sm text-slate-300">
        Mash to hotwire — faster wire steadies the revs. Lock the needle near redline, aim for the
        glass, then grab everything before the alarm.
      </p>
      <button
        type="button"
        onClick={onClose}
        className="text-xs font-medium text-amber-200 hover:text-amber-100"
      >
        Got it
      </button>
    </div>
  );
}

function SmashGrabGame({ onFinished = null }) {
  const canvasRef = useRef(null);
  const wrapRef = useRef(null);
  const rafRef = useRef(0);
  const lastTapRef = useRef(0);
  const stateRef = useRef(null);
  const [phase, setPhase] = useState(PHASE.TITLE);
  const [hud, setHud] = useState({
    message: 'Press Start — then mash Space / tap to hotwire',
    fill: 0,
    needle: 0,
    aim: 0.5,
    grabLeftMs: 0,
    bagged: 0,
    popup: '',
  });
  const [scoreCard, setScoreCard] = useState(null);
  const [intelPreview, setIntelPreview] = useState(null);
  const [intelLocked, setIntelLocked] = useState(false);

  const syncPhase = useCallback((next) => {
    setPhase(next);
  }, []);

  const resetRun = useCallback(() => {
    stateRef.current = {
      phase: PHASE.TITLE,
      intel: cleanIntel(),
      hotwireFill: 0,
      hotwireStartedAt: 0,
      hotwireGrade: 'fail',
      revMods: hotwireRevMods('fail'),
      needle: 0.2,
      needleDir: 1,
      revQ: 0,
      aim: 0.5,
      aimDir: 1,
      lineQ: 0,
      depth: 0,
      smash: null,
      grabEndsAt: 0,
      grabStartedAt: 0,
      nextSpawnAt: 0,
      loot: [],
      bagged: [],
      smashAnimT: 0,
      popup: '',
      popupUntil: 0,
      sparks: [],
      shatter: 0,
      vanX: 0.08,
    };
    setScoreCard(null);
    setIntelPreview(null);
    setIntelLocked(false);
    setHud({
      message: 'Press Start — then mash Space / tap to hotwire',
      fill: 0,
      needle: 0.2,
      aim: 0.5,
      grabLeftMs: 0,
      bagged: 0,
      popup: '',
    });
    syncPhase(PHASE.TITLE);
  }, [syncPhase]);

  useEffect(() => {
    resetRun();
  }, [resetRun]);

  const setGamePhase = useCallback((next, extra = {}) => {
    const st = stateRef.current;
    if (!st) return;
    st.phase = next;
    Object.assign(st, extra);
    syncPhase(next);
  }, [syncPhase]);

  const beginHotwire = useCallback(() => {
    setGamePhase(PHASE.HOTWIRE, {
      hotwireFill: 0,
      hotwireStartedAt: performance.now(),
      sparks: [],
      popup: 'MASH — Space / tap!',
      popupUntil: performance.now() + 900,
    });
    setHud((h) => ({ ...h, message: 'HOTWIRE — mash Space / the button!', fill: 0 }));
  }, [setGamePhase]);

  const finishHotwire = useCallback((forcedFail = false) => {
    const st = stateRef.current;
    if (!st || st.phase !== PHASE.HOTWIRE) return;
    const elapsed = performance.now() - st.hotwireStartedAt;
    const grade = forcedFail
      ? 'fail'
      : hotwireGradeFromFill(st.hotwireFill, elapsed, HOTWIRE_WINDOW_MS);
    const mods = hotwireRevMods(grade);
    st.hotwireGrade = grade;
    st.hotwireFill = Math.min(1, st.hotwireFill);
    st.revMods = mods;
    st.popup = mods.label;
    st.popupUntil = performance.now() + 1600;
    setGamePhase(PHASE.HOTWIRE_RESULT);
    setHud((h) => ({
      ...h,
      message: `${hotwireGradeLabel(grade)} — ${mods.label}`,
      fill: st.hotwireFill,
      popup: mods.label,
    }));
  }, [setGamePhase]);

  const beginRev = useCallback(() => {
    setGamePhase(PHASE.REV, {
      needle: 0.15 + Math.random() * 0.2,
      needleDir: 1,
      popup: 'Lock revs near redline',
      popupUntil: performance.now() + 1000,
    });
    setHud((h) => ({ ...h, message: 'REV — Space / tap to lock near redline' }));
  }, [setGamePhase]);

  const lockRev = useCallback(() => {
    const st = stateRef.current;
    if (!st || st.phase !== PHASE.REV) return;
    const sweetHalf = REV_SWEET_HALF * (st.revMods?.sweetWidth || 1);
    st.revQ = revQuality(st.needle, sweetHalf);
    const perfect = st.revQ >= 0.92;
    st.popup = perfect ? 'PERFECT REV' : st.revQ >= 0.7 ? 'Good boost' : 'Weak revs';
    st.popupUntil = performance.now() + 900;
    setGamePhase(PHASE.LINE, {
      aim: 0.15 + Math.random() * 0.7,
      aimDir: Math.random() < 0.5 ? -1 : 1,
      vanX: 0.08,
    });
    setHud((h) => ({
      ...h,
      message: 'AIM — Space / tap to hit the shop window',
      needle: st.needle,
    }));
  }, [setGamePhase]);

  const lockLine = useCallback(() => {
    const st = stateRef.current;
    if (!st || st.phase !== PHASE.LINE) return;
    st.lineQ = lineQuality(st.aim);
    const depth = smashDepth(st.revQ, st.lineQ);
    const smash = smashGradeFromDepth(depth, st.revQ, st.lineQ);
    st.depth = depth;
    st.smash = smash;
    st.smashAnimT = 0;
    st.shatter = 0;
    st.popup = smash.label;
    st.popupUntil = performance.now() + 1200;
    setGamePhase(PHASE.SMASH);
    setHud((h) => ({
      ...h,
      message: `${smash.label} · depth ${depth}`,
      aim: st.aim,
    }));
  }, [setGamePhase]);

  const beginGrab = useCallback(() => {
    const st = stateRef.current;
    if (!st) return;
    const dur = grabDurationMs(st.intel, st.smash?.mult || 0.45);
    const now = performance.now();
    setGamePhase(PHASE.GRAB, {
      grabStartedAt: now,
      grabEndsAt: now + dur,
      nextSpawnAt: now + 120,
      loot: [],
      bagged: [],
      popup: 'GRAB — tap loot!',
      popupUntil: now + 800,
    });
    setHud((h) => ({
      ...h,
      message: 'GRAB — tap falling loot before the alarm!',
      grabLeftMs: dur,
      bagged: 0,
    }));
  }, [setGamePhase]);

  const endGrab = useCallback(() => {
    const st = stateRef.current;
    if (!st) return;
    const lootValue = totalLootValue(st.bagged);
    const card = {
      lootValue,
      bagged: [...st.bagged],
      intel: st.intel,
      hotwireGrade: st.hotwireGrade,
      revQ: st.revQ,
      lineQ: st.lineQ,
      depth: st.depth,
      smash: st.smash,
    };
    writeLocalBest(lootValue);
    setScoreCard(card);
    setGamePhase(PHASE.SCORE);
    setHud((h) => ({
      ...h,
      message: `Scarpered with £${lootValue} loot value`,
      bagged: st.bagged.length,
      grabLeftMs: 0,
    }));
    if (typeof onFinished === 'function') onFinished(card);
  }, [onFinished, setGamePhase]);

  const bagLootAt = useCallback((x, y, cssW, cssH) => {
    const st = stateRef.current;
    if (!st || st.phase !== PHASE.GRAB) return false;
    const nx = x / cssW;
    const ny = y / cssH;
    let hit = null;
    let hitIdx = -1;
    for (let i = st.loot.length - 1; i >= 0; i -= 1) {
      const L = st.loot[i];
      const dx = nx - L.x;
      const dy = ny - L.y;
      if (dx * dx + dy * dy < 0.045 * 0.045) {
        hit = L;
        hitIdx = i;
        break;
      }
    }
    if (!hit) return false;
    st.loot.splice(hitIdx, 1);
    st.bagged.push(hit);
    st.popup = `+${hit.value} ${hit.emoji}`;
    st.popupUntil = performance.now() + 500;
    setHud((h) => ({ ...h, bagged: st.bagged.length, popup: st.popup }));
    return true;
  }, []);

  const doAction = useCallback(() => {
    const st = stateRef.current;
    if (!st) return;
    const now = performance.now();

    if (st.phase === PHASE.TITLE) return;

    if (st.phase === PHASE.HOTWIRE) {
      if (now - lastTapRef.current < HOTWIRE_MIN_TAP_GAP_MS) return;
      lastTapRef.current = now;
      st.hotwireFill = Math.min(1.15, st.hotwireFill + HOTWIRE_FILL_PER_TAP);
      st.sparks.push({
        x: 0.35 + Math.random() * 0.3,
        y: 0.55 - st.hotwireFill * 0.25,
        life: 1,
      });
      setHud((h) => ({ ...h, fill: Math.min(1, st.hotwireFill) }));
      if (st.hotwireFill >= 1) finishHotwire(false);
      return;
    }

    if (st.phase === PHASE.HOTWIRE_RESULT) {
      beginRev();
      return;
    }

    if (st.phase === PHASE.REV) {
      lockRev();
      return;
    }

    if (st.phase === PHASE.LINE) {
      lockLine();
      return;
    }

    if (st.phase === PHASE.GRAB) {
      // mash anywhere = try grab near centre-ish random? No — require tap location via pointer.
      return;
    }
  }, [beginRev, finishHotwire, lockLine, lockRev]);

  // Keyboard
  useEffect(() => {
    const onKey = (e) => {
      if (e.code === 'Space' || e.key === ' ') {
        e.preventDefault();
        doAction();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [doAction]);

  // Game loop + draw
  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return undefined;
    const ctx = canvas.getContext('2d');
    let cssW = 1;
    let cssH = 1;
    let dpr = 1;

    const resize = () => {
      const rect = wrap.getBoundingClientRect();
      cssW = Math.max(320, rect.width);
      cssH = Math.max(280, Math.min(420, rect.width * 0.55));
      dpr = Math.min(2, window.devicePixelRatio || 1);
      canvas.width = Math.floor(cssW * dpr);
      canvas.height = Math.floor(cssH * dpr);
      canvas.style.width = `${cssW}px`;
      canvas.style.height = `${cssH}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(wrap);

    let last = performance.now();
    const tick = (now) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const st = stateRef.current;
      if (!st) {
        rafRef.current = requestAnimationFrame(tick);
        return;
      }

      // Hotwire timeout
      if (st.phase === PHASE.HOTWIRE) {
        const elapsed = now - st.hotwireStartedAt;
        if (elapsed >= HOTWIRE_WINDOW_MS) finishHotwire(st.hotwireFill < 1);
      }

      // Rev oscillation
      if (st.phase === PHASE.REV) {
        const speed = REV_BASE_SPEED * (st.revMods?.needleSpeed || 1);
        st.needle += st.needleDir * speed * dt;
        if (st.needle >= 1) {
          st.needle = 1;
          st.needleDir = -1;
        } else if (st.needle <= 0) {
          st.needle = 0;
          st.needleDir = 1;
        }
      }

      // Line aim
      if (st.phase === PHASE.LINE) {
        st.aim += st.aimDir * LINE_BASE_SPEED * dt;
        if (st.aim >= 0.95) {
          st.aim = 0.95;
          st.aimDir = -1;
        } else if (st.aim <= 0.05) {
          st.aim = 0.05;
          st.aimDir = 1;
        }
        st.vanX = Math.min(0.42, st.vanX + dt * 0.12);
      }

      // Smash anim → grab
      if (st.phase === PHASE.SMASH) {
        st.smashAnimT += dt;
        st.vanX = Math.min(0.55, 0.42 + st.smashAnimT * 0.35);
        st.shatter = Math.min(1, st.smashAnimT / 0.45);
        if (st.smashAnimT >= 1.35) beginGrab();
      }

      // Grab loot physics
      if (st.phase === PHASE.GRAB) {
        const left = Math.max(0, st.grabEndsAt - now);
        if (now >= st.nextSpawnAt && left > 200) {
          const type = pickLootType(st.smash?.mult || 0.45);
          const value = itemValue(type, st.smash?.mult || 0.45, st.intel?.valueMult || 1);
          st.loot.push({
            id: `${now}-${Math.random()}`,
            ...type,
            value,
            x: 0.18 + Math.random() * 0.64,
            y: -0.05,
            vy: 0.18 + Math.random() * 0.12,
            rot: Math.random() * Math.PI,
          });
          st.nextSpawnAt = now + spawnIntervalMs(st.smash?.mult || 0.45);
        }
        for (const L of st.loot) {
          L.y += L.vy * dt;
          L.vy += dt * 0.35;
          L.rot += dt * 2;
        }
        st.loot = st.loot.filter((L) => L.y < 1.12);
        if (left <= 0) endGrab();
        else {
          const bucket = Math.floor(left / 100);
          if (bucket !== st._grabHudBucket) {
            st._grabHudBucket = bucket;
            setHud((h) => ({ ...h, grabLeftMs: left, bagged: st.bagged.length }));
          }
        }
      }

      // Sparks fade
      st.sparks = (st.sparks || [])
        .map((s) => ({ ...s, life: s.life - dt * 2.2, y: s.y - dt * 0.15 }))
        .filter((s) => s.life > 0);

      // Draw
      drawScene(ctx, cssW, cssH, st, now);

      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);

    const onPointer = (e) => {
      const st = stateRef.current;
      if (!st) return;
      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      if (st.phase === PHASE.GRAB) {
        bagLootAt(x, y, rect.width, rect.height);
        return;
      }
      if (st.phase === PHASE.TITLE || st.phase === PHASE.INTEL || st.phase === PHASE.SCORE) return;
      doAction();
    };
    canvas.addEventListener('pointerdown', onPointer);

    return () => {
      cancelAnimationFrame(rafRef.current);
      ro.disconnect();
      canvas.removeEventListener('pointerdown', onPointer);
    };
    // hud.grabLeftMs intentionally read for throttle; finish/begin callbacks stable enough
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bagLootAt, beginGrab, doAction, endGrab, finishHotwire]);

  const startWithIntel = (useTip) => {
    const intel = useTip ? rollIntel() : cleanIntel();
    stateRef.current.intel = intel;
    setIntelPreview(intel);
    setIntelLocked(true);
    if (useTip) {
      stateRef.current.popup = `${intel.label} — ${intel.detail}`;
      stateRef.current.popupUntil = performance.now() + 900;
      setHud((h) => ({
        ...h,
        message: `Intel: ${intel.label} — ${intel.detail}`,
        popup: intel.label,
      }));
      window.setTimeout(() => beginHotwire(), 750);
    } else {
      beginHotwire();
    }
  };

  const best = readLocalBest();

  return (
    <div className="space-y-3">
      <div
        ref={wrapRef}
        className="relative w-full rounded-xl border border-[#1a2540] bg-[#060e1a] overflow-hidden"
      >
        <canvas ref={canvasRef} className="block w-full touch-none select-none" />
        {hud.popup && phase !== PHASE.SCORE ? (
          <div className="pointer-events-none absolute inset-x-0 top-3 flex justify-center">
            <span className="rounded-md bg-black/50 px-3 py-1 text-sm font-semibold text-amber-100 shadow">
              {hud.message}
            </span>
          </div>
        ) : null}
      </div>

      {phase === PHASE.TITLE ? (
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => {
              syncPhase(PHASE.INTEL);
              stateRef.current.phase = PHASE.INTEL;
              setHud((h) => ({ ...h, message: 'Take a tip from Daz’s mate, or go clean?' }));
            }}
            className="px-4 py-2 rounded-md bg-indigo-600 hover:bg-indigo-500 text-sm font-medium text-white"
          >
            Start run
          </button>
          {best ? (
            <span className="self-center text-xs text-slate-400">
              Sandbox best:{' '}
              <span className="text-amber-300 font-semibold">{best.lootValue}</span>
            </span>
          ) : null}
        </div>
      ) : null}

      {phase === PHASE.INTEL ? (
        <div className="flex flex-wrap gap-2">
          {!intelLocked ? (
            <>
              <button
                type="button"
                onClick={() => startWithIntel(false)}
                className="px-4 py-2 rounded-md bg-slate-700 hover:bg-slate-600 text-sm text-white"
              >
                Go clean
              </button>
              <button
                type="button"
                onClick={() => startWithIntel(true)}
                className="px-4 py-2 rounded-md bg-amber-600 hover:bg-amber-500 text-sm font-medium text-white"
              >
                Take Daz’s tip
              </button>
            </>
          ) : null}
          {intelPreview ? (
            <span className="self-center text-xs text-amber-200">
              {intelPreview.label}: {intelPreview.detail}
            </span>
          ) : null}
        </div>
      ) : null}

      {(phase === PHASE.HOTWIRE || phase === PHASE.REV || phase === PHASE.LINE) ? (
        <button
          type="button"
          onClick={doAction}
          className="w-full sm:w-auto min-h-[52px] px-6 py-3 rounded-lg bg-rose-600 hover:bg-rose-500 active:bg-rose-700 text-base font-semibold text-white shadow-lg shadow-rose-900/40"
        >
          {phase === PHASE.HOTWIRE
            ? 'HOTWIRE — mash!'
            : phase === PHASE.REV
              ? 'Lock revs'
              : 'Lock aim'}
        </button>
      ) : null}

      {phase === PHASE.HOTWIRE_RESULT ? (
        <button
          type="button"
          onClick={beginRev}
          className="px-4 py-2 rounded-md bg-indigo-600 hover:bg-indigo-500 text-sm font-medium text-white"
        >
          Set the revs →
        </button>
      ) : null}

      {phase === PHASE.GRAB ? (
        <p className="text-sm text-slate-300">
          Alarm in{' '}
          <span className="text-rose-300 font-semibold tabular-nums">
            {(hud.grabLeftMs / 1000).toFixed(1)}s
          </span>
          {' · '}
          Bagged <span className="text-amber-200 font-semibold">{hud.bagged}</span>
        </p>
      ) : null}

      {phase === PHASE.SCORE && scoreCard ? (
        <ScoreCard card={scoreCard} onReplay={resetRun} />
      ) : null}
    </div>
  );
}

function ScoreCard({ card, onReplay }) {
  const counts = {};
  for (const item of card.bagged) {
    const key = item.id;
    if (!counts[key]) counts[key] = { ...item, n: 0, sum: 0 };
    counts[key].n += 1;
    counts[key].sum += item.value;
  }
  const rows = Object.values(counts);

  return (
    <div className="rounded-xl border border-[#1a2540] bg-[#0b1220] p-4 space-y-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-lg font-semibold text-indigo-100">Scarper score</h3>
        <p className="text-2xl font-bold text-amber-300 tabular-nums">{card.lootValue}</p>
      </div>
      <ul className="text-sm text-slate-300 space-y-1">
        <li>
          Hotwire:{' '}
          <span className="text-slate-100">{hotwireGradeLabel(card.hotwireGrade)}</span>
        </li>
        <li>
          Smash:{' '}
          <span className="text-slate-100">
            {card.smash?.label} (depth {card.depth})
          </span>
        </li>
        <li>
          Intel:{' '}
          <span className="text-slate-100">
            {card.intel?.label} — {card.intel?.detail}
          </span>
        </li>
        <li>
          Rev / aim:{' '}
          <span className="text-slate-100 tabular-nums">
            {(card.revQ * 100).toFixed(0)}% / {(card.lineQ * 100).toFixed(0)}%
          </span>
        </li>
      </ul>
      {rows.length ? (
        <ul className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs">
          {rows.map((r) => (
            <li
              key={r.id}
              className="rounded-md border border-[#1a2540] px-2 py-1.5 text-slate-300"
            >
              <span className="text-base mr-1">{r.emoji}</span>
              ×{r.n} · {r.sum}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-slate-500">Empty bag — next time mash harder.</p>
      )}
      <button
        type="button"
        onClick={onReplay}
        className="px-4 py-2 rounded-md bg-indigo-600 hover:bg-indigo-500 text-sm font-medium text-white"
      >
        Run again
      </button>
    </div>
  );
}

function drawScene(ctx, W, H, st, now) {
  // Atmosphere
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, '#0a1628');
  g.addColorStop(0.55, '#121a2e');
  g.addColorStop(1, '#1a2438');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);

  // Street
  ctx.fillStyle = '#2a3144';
  ctx.fillRect(0, H * 0.72, W, H * 0.28);
  ctx.fillStyle = 'rgba(255,200,80,0.08)';
  for (let i = 0; i < 8; i += 1) {
    ctx.fillRect(i * (W / 8) + 8, H * 0.86, W / 16, 4);
  }

  // Shop block
  const shopX = W * 0.48;
  const shopW = W * 0.46;
  const shopY = H * 0.18;
  const shopH = H * 0.54;
  ctx.fillStyle = '#3d2a28';
  ctx.fillRect(shopX, shopY, shopW, shopH);
  ctx.fillStyle = '#5c3d38';
  ctx.fillRect(shopX, shopY, shopW, H * 0.08);
  ctx.fillStyle = '#e8c96a';
  ctx.font = `bold ${Math.max(12, W * 0.028)}px "Segoe UI",system-ui,sans-serif`;
  ctx.textAlign = 'center';
  ctx.fillText("DAZ'S OFFY", shopX + shopW / 2, shopY + H * 0.055);

  // Glass / brick zones
  const glassX = shopX + shopW * 0.12;
  const glassW = shopW * 0.76;
  const glassY = shopY + H * 0.12;
  const glassH = shopH * 0.55;
  if (st.shatter > 0 && st.smash?.id !== 'brick') {
    ctx.fillStyle = `rgba(160,210,255,${0.25 * (1 - st.shatter)})`;
    ctx.fillRect(glassX, glassY, glassW, glassH);
    ctx.strokeStyle = 'rgba(220,240,255,0.5)';
    ctx.lineWidth = 2;
    for (let i = 0; i < 7; i += 1) {
      ctx.beginPath();
      ctx.moveTo(glassX + (i / 7) * glassW, glassY);
      ctx.lineTo(glassX + ((i + 0.4) / 7) * glassW + st.shatter * 20, glassY + glassH);
      ctx.stroke();
    }
  } else {
    const win = ctx.createLinearGradient(glassX, glassY, glassX, glassY + glassH);
    win.addColorStop(0, 'rgba(120,180,220,0.45)');
    win.addColorStop(1, 'rgba(60,100,140,0.55)');
    ctx.fillStyle = win;
    ctx.fillRect(glassX, glassY, glassW, glassH);
    ctx.strokeStyle = 'rgba(200,230,255,0.35)';
    ctx.strokeRect(glassX, glassY, glassW, glassH);
  }

  // Brick side markers when aiming
  if (st.phase === PHASE.LINE) {
    ctx.fillStyle = 'rgba(180,80,70,0.35)';
    ctx.fillRect(shopX, glassY, glassX - shopX, glassH);
    ctx.fillRect(glassX + glassW, glassY, shopX + shopW - (glassX + glassW), glassH);
    // Aim bracket
    const aimPx = shopX + st.aim * shopW;
    ctx.strokeStyle = '#fbbf24';
    ctx.lineWidth = 3;
    ctx.strokeRect(aimPx - 14, glassY - 6, 28, glassH + 12);
  }

  // Van
  const vanPhase =
    st.phase === PHASE.HOTWIRE ||
    st.phase === PHASE.HOTWIRE_RESULT ||
    st.phase === PHASE.REV ||
    st.phase === PHASE.TITLE ||
    st.phase === PHASE.INTEL;
  const vanX = vanPhase ? W * 0.1 : W * (st.vanX || 0.1);
  const vanY = H * 0.52;
  const vanW = W * 0.28;
  const vanH = H * 0.18;
  drawVan(ctx, vanX, vanY, vanW, vanH, st);

  // Hotwire dashboard overlay
  if (st.phase === PHASE.HOTWIRE || st.phase === PHASE.HOTWIRE_RESULT) {
    drawHotwireHud(ctx, W, H, st);
  }

  // Rev meter
  if (st.phase === PHASE.REV) {
    drawRevMeter(ctx, W, H, st);
  }

  // Grab loot
  if (st.phase === PHASE.GRAB) {
    ctx.fillStyle = 'rgba(255,60,40,0.12)';
    ctx.fillRect(0, 0, W, H);
    for (const L of st.loot) {
      ctx.save();
      ctx.translate(L.x * W, L.y * H);
      ctx.rotate(L.rot * 0.2);
      ctx.font = `${Math.max(22, W * 0.05)}px "Segoe UI Emoji",sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(L.emoji, 0, 0);
      ctx.restore();
    }
    // Alarm flash
    const pulse = 0.5 + 0.5 * Math.sin(now / 90);
    ctx.fillStyle = `rgba(255,40,40,${0.08 * pulse})`;
    ctx.fillRect(0, 0, W, H * 0.08);
    ctx.fillStyle = '#fecaca';
    ctx.font = `bold ${Math.max(14, W * 0.032)}px "Segoe UI",sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillText('ALARM', W / 2, H * 0.05);
  }

  // Popup
  if (st.popup && now < st.popupUntil) {
    const alpha = Math.min(1, (st.popupUntil - now) / 400);
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = '#fde68a';
    ctx.font = `bold ${Math.max(16, W * 0.036)}px "Segoe UI",sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillText(st.popup, W / 2, H * 0.12);
    ctx.restore();
  }

  // Title watermark
  if (st.phase === PHASE.TITLE) {
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#fef3c7';
    ctx.font = `bold ${Math.max(22, W * 0.055)}px "Segoe UI",sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillText("Daz's Smash & Grab", W / 2, H * 0.42);
    ctx.fillStyle = '#94a3b8';
    ctx.font = `${Math.max(12, W * 0.028)}px "Segoe UI",sans-serif`;
    ctx.fillText('Admin sandbox · unlimited practice', W / 2, H * 0.5);
  }
}

function drawVan(ctx, x, y, w, h, st) {
  ctx.fillStyle = '#c4c9d4';
  ctx.beginPath();
  if (typeof ctx.roundRect === 'function') ctx.roundRect(x, y, w, h, 6);
  else ctx.rect(x, y, w, h);
  ctx.fill();
  ctx.fillStyle = '#9aa3b5';
  ctx.fillRect(x + w * 0.55, y + h * 0.1, w * 0.4, h * 0.45);
  ctx.fillStyle = '#1e293b';
  ctx.beginPath();
  ctx.arc(x + w * 0.22, y + h * 0.95, h * 0.22, 0, Math.PI * 2);
  ctx.arc(x + w * 0.78, y + h * 0.95, h * 0.22, 0, Math.PI * 2);
  ctx.fill();
  // Headlights
  ctx.fillStyle = st.phase === PHASE.HOTWIRE ? `rgba(255,220,100,${0.3 + st.hotwireFill * 0.7})` : '#fef08a';
  ctx.fillRect(x + w * 0.92, y + h * 0.35, w * 0.06, h * 0.2);
}

function drawHotwireHud(ctx, W, H, st) {
  const bx = W * 0.12;
  const by = H * 0.78;
  const bw = W * 0.76;
  const bh = H * 0.08;
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  ctx.fillRect(bx - 8, by - 28, bw + 16, bh + 40);
  ctx.fillStyle = '#e2e8f0';
  ctx.font = `bold ${Math.max(12, W * 0.028)}px "Segoe UI",sans-serif`;
  ctx.textAlign = 'left';
  ctx.fillText('IGNITION', bx, by - 10);
  ctx.fillStyle = '#1e293b';
  ctx.fillRect(bx, by, bw, bh);
  const fill = Math.min(1, st.hotwireFill);
  const bar = ctx.createLinearGradient(bx, by, bx + bw, by);
  bar.addColorStop(0, '#f59e0b');
  bar.addColorStop(1, '#ef4444');
  ctx.fillStyle = bar;
  ctx.fillRect(bx, by, bw * fill, bh);
  // Timer
  if (st.phase === PHASE.HOTWIRE && st.hotwireStartedAt) {
    const left = Math.max(0, HOTWIRE_WINDOW_MS - (performance.now() - st.hotwireStartedAt));
    ctx.fillStyle = '#fca5a5';
    ctx.textAlign = 'right';
    ctx.fillText(`${(left / 1000).toFixed(1)}s`, bx + bw, by - 10);
  }
  for (const s of st.sparks || []) {
    ctx.fillStyle = `rgba(255,220,80,${s.life})`;
    ctx.beginPath();
    ctx.arc(s.x * W, s.y * H, 3 + s.life * 3, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawRevMeter(ctx, W, H, st) {
  const cx = W * 0.22;
  const cy = H * 0.38;
  const r = Math.min(W, H) * 0.16;
  ctx.fillStyle = 'rgba(0,0,0,0.5)';
  ctx.beginPath();
  ctx.arc(cx, cy, r + 12, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#334155';
  ctx.lineWidth = 10;
  ctx.beginPath();
  ctx.arc(cx, cy, r, Math.PI * 0.75, Math.PI * 2.25);
  ctx.stroke();

  const sweetHalf = REV_SWEET_HALF * (st.revMods?.sweetWidth || 1);
  const sweetA = Math.PI * 0.75 + (REV_SWEET_CENTER - sweetHalf) * Math.PI * 1.5;
  const sweetB = Math.PI * 0.75 + (REV_SWEET_CENTER + sweetHalf) * Math.PI * 1.5;
  ctx.strokeStyle = '#22c55e';
  ctx.lineWidth = 10;
  ctx.beginPath();
  ctx.arc(cx, cy, r, sweetA, sweetB);
  ctx.stroke();

  const overA = Math.PI * 0.75 + REV_OVERREV_START * Math.PI * 1.5;
  ctx.strokeStyle = '#ef4444';
  ctx.beginPath();
  ctx.arc(cx, cy, r, overA, Math.PI * 2.25);
  ctx.stroke();

  const ang = Math.PI * 0.75 + st.needle * Math.PI * 1.5;
  ctx.strokeStyle = '#f8fafc';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(cx, cy);
  ctx.lineTo(cx + Math.cos(ang) * (r - 8), cy + Math.sin(ang) * (r - 8));
  ctx.stroke();
  ctx.fillStyle = '#e2e8f0';
  ctx.font = `bold ${Math.max(11, W * 0.024)}px "Segoe UI",sans-serif`;
  ctx.textAlign = 'center';
  ctx.fillText('RPM', cx, cy + r + 22);
}

export function SmashGrabSandbox() {
  const [introOpen, setIntroOpen] = useState(() => !hasSeenIntro());

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-[#1a2540] p-4 space-y-2">
        <p className="text-sm text-slate-300">
          Admin sandbox for{' '}
          <span className="text-white font-medium">Daz&apos;s Smash &amp; Grab</span>. Unlimited
          practice runs — scores stay local (not on a competitive board). Staff Fun rotation comes
          later.
        </p>
        <p className="text-xs text-slate-500">
          Desktop: mash Space on hotwire, then Space to lock. Mobile: use the big button / tap the
          canvas (tap loot in the grab phase).
        </p>
      </div>
      <IntroBubble
        open={introOpen}
        onClose={() => {
          markIntroSeen();
          setIntroOpen(false);
        }}
      />
      <SmashGrabGame />
    </div>
  );
}

export default SmashGrabSandbox;
