import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import FunDayPicker, { getLondonDayKey } from './FunDayPicker';
import FunLeaderboardRow from './FunLeaderboardRow';
import PipesTutorialModal, { hasSeenPipesTutorial } from './PipesTutorialModal';
import {
  E,
  N,
  PIPES_SEED_PUZZLES,
  PIPES_SIZES,
  S,
  W,
  analyzeBoard,
  clonePuzzle,
  formatDuration,
  generatePipesPuzzle,
  getEffectiveMasks,
  getPuzzleById,
  getPuzzleForDay,
  isSolved,
} from '../lib/pipes';
import { PIPES_LIVE_FROM } from '../lib/funRotation';

async function readJsonResponse(res) {
  const contentType = res.headers.get('content-type') || '';
  if (!contentType.includes('application/json')) {
    const text = await res.text();
    throw new Error(text || `Request failed (${res.status})`);
  }
  return res.json();
}

function PipeGlyph({ mask, connectedBits = 0, live = false, pinned = false, cellSize = 56 }) {
  const stroke = live ? '#34d399' : '#64748b';
  const glow = live ? '#6ee7b7' : '#94a3b8';
  const cx = cellSize / 2;
  const cy = cellSize / 2;
  const thick = Math.max(6, cellSize * 0.22);
  const half = thick / 2;
  const arm = cellSize / 2;

  const segment = (bit, x2, y2) => {
    const on = Boolean(mask & bit);
    if (!on) return null;
    const active = Boolean(connectedBits & bit);
    return (
      <line
        key={bit}
        x1={cx}
        y1={cy}
        x2={x2}
        y2={y2}
        stroke={active ? glow : stroke}
        strokeWidth={thick}
        strokeLinecap="butt"
      />
    );
  };

  return (
    <svg
      width={cellSize}
      height={cellSize}
      viewBox={`0 0 ${cellSize} ${cellSize}`}
      className="block pointer-events-none"
      aria-hidden
    >
      <rect
        x="1"
        y="1"
        width={cellSize - 2}
        height={cellSize - 2}
        rx="6"
        fill="#060e1a"
        stroke={pinned ? '#fbbf24' : '#1a2540'}
        strokeWidth={pinned ? 2 : 1.25}
      />
      {segment(N, cx, cy - arm)}
      {segment(E, cx + arm, cy)}
      {segment(S, cx, cy + arm)}
      {segment(W, cx - arm, cy)}
      <circle
        cx={cx}
        cy={cy}
        r={half}
        fill={live ? glow : stroke}
      />
    </svg>
  );
}

/** Bits that currently form a mutual connection with a neighbor. */
function connectedBitsForCell(size, masks, index) {
  const row = Math.floor(index / size);
  const col = index % size;
  const mask = masks[index] & 0xf;
  let bits = 0;
  const tryDir = (bit, opp, nr, nc) => {
    if (!(mask & bit)) return;
    if (nr < 0 || nc < 0 || nr >= size || nc >= size) return;
    const j = nr * size + nc;
    if (masks[j] & opp) bits |= bit;
  };
  tryDir(N, S, row - 1, col);
  tryDir(E, W, row, col + 1);
  tryDir(S, N, row + 1, col);
  tryDir(W, E, row, col - 1);
  return bits;
}

function PipesBoard({
  size,
  tiles,
  onRotate,
  onPin,
  disabled = false,
  highlightConnected = true,
}) {
  const masks = useMemo(() => getEffectiveMasks(tiles), [tiles]);
  const analysis = useMemo(() => analyzeBoard(size, masks), [size, masks]);
  const cellSize = size >= 10 ? 40 : size >= 7 ? 48 : 56;

  return (
    <div
      className="inline-grid gap-0.5 p-2 rounded-xl border border-[#1a2540] bg-[#0b1220]"
      style={{ gridTemplateColumns: `repeat(${size}, ${cellSize}px)` }}
      role="grid"
      aria-label={`${size} by ${size} pipes board`}
    >
      {tiles.map((tile, index) => {
        const mask = masks[index];
        const connected = highlightConnected
          ? connectedBitsForCell(size, masks, index)
          : 0;
        const live = analysis.solved || connected === (mask & 0xf);
        return (
          <button
            key={index}
            type="button"
            role="gridcell"
            disabled={disabled || tile.pinned}
            title={tile.pinned ? 'Pinned · right-click to unpin' : 'Click to rotate · right-click to pin'}
            onClick={(e) => {
              e.preventDefault();
              if (disabled || tile.pinned) return;
              onRotate?.(index, e.shiftKey || e.ctrlKey || e.metaKey ? -1 : 1);
            }}
            onContextMenu={(e) => {
              e.preventDefault();
              if (disabled) return;
              onPin?.(index);
            }}
            className={`relative rounded-md transition-transform active:scale-[0.97] ${
              tile.pinned ? 'cursor-default' : 'cursor-pointer hover:brightness-110'
            } disabled:cursor-not-allowed`}
          >
            <PipeGlyph
              mask={mask}
              connectedBits={connected}
              live={Boolean(live && (mask & 0xf))}
              pinned={tile.pinned}
              cellSize={cellSize}
            />
          </button>
        );
      })}
    </div>
  );
}


export default function PipesPanel({
  puzzle: initialPuzzle,
  sandbox = false,
  showDevBadge = false,
  competitive = false,
  currentUserUid = null,
  onAchievements = null,
  dayKey = null,
  initialGame = null,
  initialLeaderboard = [],
}) {
  const [puzzle, setPuzzle] = useState(() => clonePuzzle(initialPuzzle));
  const [moves, setMoves] = useState(0);
  const [message, setMessage] = useState('');
  const [won, setWon] = useState(Boolean(initialGame?.status === 'won'));
  const [submitting, setSubmitting] = useState(false);
  const [leaderboard, setLeaderboard] = useState(initialLeaderboard || []);
  const [tutorialOpen, setTutorialOpen] = useState(false);
  const startedAtRef = useRef(new Date().toISOString());
  const [elapsedMs, setElapsedMs] = useState(initialGame?.durationMs || 0);
  const submittedRef = useRef(Boolean(initialGame?.status === 'won'));

  useEffect(() => {
    if (!hasSeenPipesTutorial()) setTutorialOpen(true);
  }, []);

  useEffect(() => {
    setPuzzle(clonePuzzle(initialPuzzle));
    setMoves(Number(initialGame?.moves) || 0);
    setMessage(initialGame?.status === 'won'
      ? `Solved in ${formatDuration(initialGame.durationMs)}.`
      : '');
    setWon(Boolean(initialGame?.status === 'won'));
    setLeaderboard(initialLeaderboard || []);
    startedAtRef.current = new Date().toISOString();
    setElapsedMs(initialGame?.durationMs || 0);
    submittedRef.current = Boolean(initialGame?.status === 'won');
    if (initialGame?.status === 'won' && Array.isArray(initialGame.rotations)) {
      setPuzzle((prev) => ({
        ...prev,
        tiles: prev.tiles.map((tile, i) => ({
          ...tile,
          rotation: ((Number(initialGame.rotations[i]) % 4) + 4) % 4,
        })),
      }));
    }
  }, [initialPuzzle?.id, initialGame, initialLeaderboard]);

  useEffect(() => {
    if (won) return undefined;
    const id = window.setInterval(() => {
      setElapsedMs(Date.now() - new Date(startedAtRef.current).getTime());
    }, 250);
    return () => window.clearInterval(id);
  }, [won, puzzle?.id]);

  const analysis = useMemo(
    () => analyzeBoard(puzzle.size, getEffectiveMasks(puzzle.tiles)),
    [puzzle],
  );

  const submitWin = useCallback(async (tiles, nextMoves, duration) => {
    if (!competitive || sandbox || submittedRef.current) return;
    submittedRef.current = true;
    setSubmitting(true);
    try {
      const response = await fetch('/api/submitPipesResult', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          dayKey: dayKey || undefined,
          rotations: tiles.map((t) => t.rotation),
          moves: nextMoves,
          startedAt: startedAtRef.current,
          durationMs: duration,
        }),
      });
      const payload = (await readJsonResponse(response)) || {};
      if (!response.ok) throw new Error(payload.error || 'Failed to save Pipes.');
      if (Array.isArray(payload.leaderboard)) setLeaderboard(payload.leaderboard);
      if (Array.isArray(payload.achievements) && onAchievements) {
        onAchievements(payload.achievements);
      }
      const dur = payload.game?.durationMs ?? duration;
      setMessage(`Solved in ${formatDuration(dur)}. Faster times rank higher.`);
    } catch (err) {
      submittedRef.current = false;
      setMessage(err.message || 'Could not save your time.');
    } finally {
      setSubmitting(false);
    }
  }, [competitive, sandbox, dayKey, onAchievements]);

  const rotate = useCallback((index, dir = 1) => {
    setMoves((prevMoves) => {
      const nextMoves = prevMoves + 1;
      setPuzzle((prev) => {
        const tiles = prev.tiles.map((tile, i) => {
          if (i !== index || tile.pinned) return tile;
          return {
            ...tile,
            rotation: (tile.rotation + dir + 4) % 4,
          };
        });
        const solved = isSolved(prev.size, tiles);
        if (solved) {
          const duration = Math.max(0, Date.now() - new Date(startedAtRef.current).getTime());
          setElapsedMs(duration);
          setWon(true);
          setMessage(`Solved in ${formatDuration(duration)}.`);
          void submitWin(tiles, nextMoves, duration);
        } else {
          setWon(false);
          setMessage('');
        }
        return { ...prev, tiles };
      });
      return nextMoves;
    });
  }, [submitWin]);

  const togglePin = useCallback((index) => {
    setPuzzle((prev) => ({
      ...prev,
      tiles: prev.tiles.map((tile, i) => (
        i === index ? { ...tile, pinned: !tile.pinned } : tile
      )),
    }));
  }, []);

  const reset = () => {
    if (competitive && !sandbox && submittedRef.current) return;
    setPuzzle(clonePuzzle(initialPuzzle));
    setMoves(0);
    setMessage('');
    setWon(false);
    startedAtRef.current = new Date().toISOString();
    setElapsedMs(0);
  };

  const revealSolved = () => {
    setPuzzle((prev) => ({
      ...prev,
      tiles: prev.tiles.map((tile) => ({ ...tile, rotation: 0, pinned: false })),
    }));
    setWon(true);
    setMessage('Showing solved layout (Dev).');
  };

  const filled = analysis.componentsVisited;
  const total = puzzle.size * puzzle.size;

  return (
    <div className="space-y-4">
      <PipesTutorialModal open={tutorialOpen} onClose={() => setTutorialOpen(false)} />

      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-400">
        <p>
          <span className="text-slate-200 font-semibold">{puzzle.title || `${puzzle.size}×${puzzle.size} Pipes`}</span>
          {' · '}
          {formatDuration(elapsedMs)}
          {' · '}
          {moves} move{moves === 1 ? '' : 's'}
          {' · '}
          {filled}/{total} tiles with water
        </p>
        <div className="flex flex-wrap items-center gap-2">
          {showDevBadge || (sandbox && !competitive) ? (
            <span className="text-amber-200/90 border border-amber-500/30 bg-amber-500/10 rounded-md px-2 py-1">
              Dev sandbox
            </span>
          ) : null}
          {won ? (
            <span className="text-emerald-200 border border-emerald-500/30 bg-emerald-500/10 rounded-md px-2 py-1">
              {submitting ? 'Saving…' : 'Solved'}
            </span>
          ) : null}
          <button
            type="button"
            onClick={() => setTutorialOpen(true)}
            className="px-2 py-1 rounded-md border border-sky-500/35 text-sky-100 hover:bg-sky-500/10"
          >
            How to play
          </button>
        </div>
      </div>

      <p className="text-sm text-slate-300 max-w-2xl">
        Rotate tiles until <span className="text-white font-medium">every tile fills with water</span>
        {' '}(the whole board turns green). Click to rotate · Shift/Ctrl-click the other way ·
        right-click to pin. {competitive ? 'Leaderboard ranks by fastest time.' : ''}
      </p>

      <div className="overflow-x-auto">
        <PipesBoard
          size={puzzle.size}
          tiles={puzzle.tiles}
          onRotate={rotate}
          onPin={togglePin}
          disabled={won}
        />
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={reset}
          disabled={competitive && !sandbox && submittedRef.current}
          className="px-3 py-2 rounded-lg text-sm border border-[#1a2540] text-slate-300 hover:bg-white/[0.04] disabled:opacity-40"
        >
          Start over
        </button>
        {sandbox ? (
          <button
            type="button"
            onClick={revealSolved}
            className="px-3 py-2 rounded-lg text-sm border border-amber-500/40 text-amber-100 hover:bg-amber-500/10"
          >
            Reveal solution
          </button>
        ) : null}
      </div>

      {message ? <p className={`text-sm ${won ? 'text-emerald-300' : 'text-amber-200'}`}>{message}</p> : null}

      {competitive && !sandbox && leaderboard.length > 0 ? (
        <div className="space-y-2">
          <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
            Today’s leaderboard · fastest time
          </h4>
          <ol className="space-y-1.5">
            {leaderboard.slice(0, 10).map((row) => (
              <FunLeaderboardRow
                key={row.uid || row.rank}
                row={row}
                currentUserUid={currentUserUid}
                resultText={row.resultLabel || row.durationLabel || formatDuration(row.durationMs)}
              />
            ))}
          </ol>
        </div>
      ) : null}
    </div>
  );
}

export function PipesDailyPanel({ currentUserUid = null, onAchievements = null, isAdmin = false }) {
  const todayKey = getLondonDayKey();
  const [dayKey, setDayKey] = useState(todayKey);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [puzzle, setPuzzle] = useState(null);
  const [game, setGame] = useState(null);
  const [leaderboard, setLeaderboard] = useState([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        setError('');
        const params = new URLSearchParams();
        if (dayKey && dayKey !== todayKey) params.set('dayKey', dayKey);
        const query = params.toString() ? `?${params}` : '';
        const response = await fetch(`/api/getDailyPipes${query}`, { credentials: 'include' });
        const payload = (await readJsonResponse(response)) || {};
        if (!response.ok) throw new Error(payload.error || 'Failed to load Pipes.');
        if (cancelled) return;
        if (payload.weekend || payload.sittingOut) {
          setPuzzle(null);
          setGame(null);
          setLeaderboard([]);
          setError(payload.message || 'Pipes isn’t in today’s Fun rotation.');
          return;
        }
        setPuzzle(payload.puzzle);
        setGame(payload.game || null);
        setLeaderboard(payload.leaderboard || []);
      } catch (err) {
        if (!cancelled) {
          setError(err.message || 'Failed to load Pipes.');
          setPuzzle(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [dayKey, todayKey]);

  if (loading) return <p className="text-sm text-slate-400">Loading Pipes…</p>;
  if (error || !puzzle) return <p className="text-sm text-rose-300">{error || 'Puzzle unavailable.'}</p>;

  return (
    <div className="space-y-3">
      <FunDayPicker
        dayKey={dayKey}
        todayKey={todayKey}
        onChange={setDayKey}
        allowFuture={Boolean(isAdmin)}
      />
      <PipesPanel
        key={`${puzzle.id}-${game?.status || 'play'}`}
        puzzle={puzzle}
        competitive
        currentUserUid={currentUserUid}
        onAchievements={onAchievements}
        dayKey={dayKey}
        initialGame={game}
        initialLeaderboard={leaderboard}
      />
    </div>
  );
}

export function PipesSandbox() {
  const todayKey = getLondonDayKey();
  const [mode, setMode] = useState('seed');
  const [seedId, setSeedId] = useState(PIPES_SEED_PUZZLES[0]?.id || '');
  const [dayKey, setDayKey] = useState(todayKey);
  const [size, setSize] = useState(5);
  const [puzzle, setPuzzle] = useState(() => PIPES_SEED_PUZZLES[0] || getPuzzleForDay(todayKey, 5));

  const loadSeed = () => {
    const next = getPuzzleById(seedId);
    if (next) setPuzzle(clonePuzzle(next));
  };

  const loadDay = () => {
    setPuzzle(getPuzzleForDay(dayKey || todayKey, size));
  };

  const loadRandom = () => {
    setPuzzle(generatePipesPuzzle({
      size,
      seed: `pipes:rand:${size}:${Date.now()}`,
    }));
  };

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-[#1a2540] p-4 space-y-3">
        <p className="text-sm text-slate-300">
          Admin sandbox for <span className="text-white font-medium">Pipes</span>. Fill every tile
          with water; competitive Fun scores by time from{' '}
          <span className="text-white font-medium">{PIPES_LIVE_FROM}</span>.
        </p>
        <div className="flex flex-wrap gap-3 items-end">
          <label className="text-xs text-slate-400 space-y-1">
            Mode
            <select
              value={mode}
              onChange={(e) => setMode(e.target.value)}
              className="block bg-[#060e1a] border border-[#1a2540] rounded-md px-3 py-2 text-sm text-slate-100"
            >
              <option value="seed">Seed puzzle</option>
              <option value="day">Day key</option>
              <option value="random">Random</option>
            </select>
          </label>
          {mode !== 'seed' ? (
            <label className="text-xs text-slate-400 space-y-1">
              Size
              <select
                value={size}
                onChange={(e) => setSize(Number(e.target.value))}
                className="block bg-[#060e1a] border border-[#1a2540] rounded-md px-3 py-2 text-sm text-slate-100"
              >
                {PIPES_SIZES.map((n) => (
                  <option key={n} value={n}>{n}×{n}</option>
                ))}
              </select>
            </label>
          ) : null}
          {mode === 'seed' ? (
            <>
              <label className="text-xs text-slate-400 space-y-1">
                Seed
                <select
                  value={seedId}
                  onChange={(e) => setSeedId(e.target.value)}
                  className="block bg-[#060e1a] border border-[#1a2540] rounded-md px-3 py-2 text-sm text-slate-100"
                >
                  {PIPES_SEED_PUZZLES.map((p) => (
                    <option key={p.id} value={p.id}>{p.title}</option>
                  ))}
                </select>
              </label>
              <button type="button" onClick={loadSeed} className="px-3 py-2 rounded-lg text-sm border border-[#1a2540] text-slate-200">
                Load seed
              </button>
            </>
          ) : null}
          {mode === 'day' ? (
            <>
              <label className="text-xs text-slate-400 space-y-1">
                Day
                <input
                  type="date"
                  value={dayKey}
                  onChange={(e) => setDayKey(e.target.value)}
                  className="block bg-[#060e1a] border border-[#1a2540] rounded-md px-3 py-2 text-sm text-slate-100"
                />
              </label>
              <button type="button" onClick={loadDay} className="px-3 py-2 rounded-lg text-sm border border-[#1a2540] text-slate-200">
                Load day
              </button>
            </>
          ) : null}
          {mode === 'random' ? (
            <button type="button" onClick={loadRandom} className="px-3 py-2 rounded-lg text-sm border border-[#1a2540] text-slate-200">
              New random board
            </button>
          ) : null}
        </div>
      </div>
      {puzzle ? <PipesPanel key={puzzle.id} puzzle={puzzle} sandbox showDevBadge /> : null}
    </div>
  );
}
