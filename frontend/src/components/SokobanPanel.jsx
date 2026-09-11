import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import FunDayPicker, { formatFunDayLabel, getLondonDayKey } from './FunDayPicker';
import FunLeaderboardRow from './FunLeaderboardRow';
import {
  cellKey,
  createLocalGame,
  localMove,
  localReset,
  localUndo,
} from '../lib/sokoban';
import {
  CrateTile,
  FloorTile,
  PlayerSprite,
  SokobanLegend,
  TargetTile,
  WallTile,
} from './sokobanGraphics';
import SokobanTutorialModal, { hasSeenSokobanTutorial } from './SokobanTutorialModal';

async function readJsonResponse(res) {
  const contentType = res.headers.get('content-type') || '';
  if (!contentType.includes('application/json')) return null;
  try {
    return await res.json();
  } catch {
    return null;
  }
}

function formatTime(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleTimeString('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function SokobanPanel({
  currentUserUid,
  onAchievements,
  isAdmin = false,
  sandbox = false,
  forcedDayKey = null,
  forceTutorial = false,
}) {
  const todayKey = getLondonDayKey();
  const [dayKey, setDayKey] = useState(forcedDayKey || todayKey);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState('');
  const [puzzle, setPuzzle] = useState(null);
  const [game, setGame] = useState(null);
  const [leaderboard, setLeaderboard] = useState([]);
  const [totalSolved, setTotalSolved] = useState(0);
  const [canPreviewFuture, setCanPreviewFuture] = useState(Boolean(isAdmin || sandbox));
  const [schedule, setSchedule] = useState([]);
  const [showSchedule, setShowSchedule] = useState(false);
  const [tutorialOpen, setTutorialOpen] = useState(false);
  const isSandbox = Boolean(sandbox);
  const practice = isSandbox || dayKey !== todayKey;
  const finished = game?.status === 'won';
  const saveTimer = useRef(null);
  const winSynced = useRef(false);

  useEffect(() => {
    if (forcedDayKey) setDayKey(forcedDayKey);
  }, [forcedDayKey]);

  useEffect(() => {
    if (forceTutorial || !hasSeenSokobanTutorial()) {
      if (!hasSeenSokobanTutorial()) setTutorialOpen(true);
    }
  }, [forceTutorial]);

  const hydrateGame = useCallback((nextPuzzle, savedGame = null) => {
    const priorMoves = savedGame?.status === 'won'
      ? (savedGame.moves || [])
      : (savedGame?.moves || []);
    const local = createLocalGame(nextPuzzle, priorMoves);
    // Move count tracks the current attempt only (resets clear it).
    local.moveCount = local.moves.length;
    local.resetCount = Number.isFinite(savedGame?.resetCount) ? savedGame.resetCount : 0;
    local.maxResets = Number.isFinite(savedGame?.maxResets) ? savedGame.maxResets : null;
    local.undoCount = Number.isFinite(savedGame?.undoCount) ? savedGame.undoCount : 0;
    local.maxUndos = Number.isFinite(savedGame?.maxUndos) ? savedGame.maxUndos : null;
    if (savedGame?.status === 'won') {
      local.status = 'won';
      local.completedAt = savedGame.completedAt || null;
      if (Number.isFinite(savedGame?.moveCount)) {
        local.moveCount = savedGame.moveCount;
      }
    }
    return local;
  }, []);

  const load = async (key) => {
    const params = new URLSearchParams();
    if (key && key !== todayKey) params.set('dayKey', key);
    if (isSandbox) params.set('sandbox', '1');
    const query = params.toString() ? `?${params.toString()}` : '';
    const response = await fetch(`/api/getDailySokoban${query}`, { credentials: 'include' });
    const payload = (await readJsonResponse(response)) || {};
    if (!response.ok) throw new Error(payload.error || 'Failed to load Sokoban.');
    if (payload.weekend || payload.sittingOut || !payload.puzzle) {
      setPuzzle(null);
      setGame(null);
      setLeaderboard([]);
      setTotalSolved(0);
      throw new Error(
        payload.message
          || (payload.sittingOut
            ? 'Sokoban isn’t in today’s Fun rotation.'
            : payload.weekend
              ? 'Fun games come back Monday.'
              : 'Sokoban puzzle unavailable.'),
      );
    }
    const nextPuzzle = payload.puzzle;
    const local = hydrateGame(nextPuzzle, payload.game);
    setPuzzle(nextPuzzle);
    setGame(local);
    setLeaderboard(payload.leaderboard || []);
    setTotalSolved(payload.totalSolved || 0);
    setCanPreviewFuture(Boolean(payload.canPreviewFuture || isAdmin || isSandbox));
    winSynced.current = local.status === 'won';
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        setError('');
        await load(dayKey);
      } catch (err) {
        if (!cancelled) {
          setError(err.message || 'Failed to load Sokoban.');
          setPuzzle(null);
          setGame(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, [dayKey, isSandbox]);

  useEffect(() => {
    if (!isAdmin && !canPreviewFuture && !isSandbox) return undefined;
    let cancelled = false;
    (async () => {
      try {
        const response = await fetch('/api/getSokobanPreview?days=21', { credentials: 'include' });
        const payload = (await readJsonResponse(response)) || {};
        if (!response.ok) return;
        if (!cancelled) setSchedule(payload.schedule || []);
      } catch {
        // soft-fail preview list
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isAdmin, canPreviewFuture, isSandbox]);

  const walls = useMemo(() => new Set(puzzle?.walls || []), [puzzle]);
  const targets = useMemo(() => new Set(puzzle?.targets || []), [puzzle]);
  const boxes = useMemo(
    () => new Set((game?.boxes || []).map((box) => cellKey(box.r, box.c))),
    [game],
  );

  const syncToServer = useCallback(async (nextGame, { force = false } = {}) => {
    if (practice || !nextGame || !puzzle) return;
    if (nextGame.status !== 'won' && !force) return;
    if (nextGame.status === 'won' && winSynced.current) return;
    setSyncing(true);
    setError('');
    try {
      const response = await fetch('/api/submitSokobanMove', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'sync',
          moves: nextGame.moves || [],
          ...(practice ? { dayKey, ...(isSandbox ? { sandbox: true } : {}) } : {}),
        }),
      });
      const payload = (await readJsonResponse(response)) || {};
      if (!response.ok) throw new Error(payload.error || 'Failed to save progress.');
      setLeaderboard(payload.leaderboard || []);
      setTotalSolved(payload.totalSolved || 0);
      if (payload.game?.status === 'won') {
        winSynced.current = true;
        setGame((prev) => (prev ? {
          ...prev,
          status: 'won',
          moveCount: payload.game.moveCount ?? prev.moveCount,
          completedAt: payload.game.completedAt || prev.completedAt,
        } : prev));
      }
      if (Array.isArray(payload.achievements) && onAchievements) {
        onAchievements(payload.achievements);
      }
    } catch (err) {
      setError(err.message || 'Failed to save progress.');
    } finally {
      setSyncing(false);
    }
  }, [practice, puzzle, onAchievements]);

  const scheduleProgressSave = useCallback((nextGame) => {
    if (practice || !nextGame || nextGame.status === 'won') return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      syncToServer(nextGame, { force: true });
    }, 1200);
  }, [practice, syncToServer]);

  const applyLocal = useCallback((updater) => {
    setGame((prev) => {
      if (!puzzle || !prev || prev.status === 'won') return prev;
      const next = updater(prev);
      if (!next || next === prev) return prev;
      if (next.status === 'won') {
        if (saveTimer.current) clearTimeout(saveTimer.current);
        // Fire sync after state commit.
        queueMicrotask(() => syncToServer(next));
      } else {
        scheduleProgressSave(next);
      }
      return next;
    });
  }, [puzzle, syncToServer, scheduleProgressSave]);

  const onDirection = useCallback((direction) => {
    applyLocal((prev) => localMove(puzzle, prev, direction));
  }, [applyLocal, puzzle]);

  const onUndo = useCallback(async () => {
    if (!puzzle || finished) return;
    if (!(game?.moves || []).length) return;

    // Unlimited days / practice: undo stays local.
    if (practice || !Number.isFinite(game?.maxUndos)) {
      applyLocal((prev) => localUndo(puzzle, prev));
      return;
    }

    if ((game?.undoCount || 0) >= game.maxUndos) {
      setError(`Undo limit reached (${game.maxUndos}/${game.maxUndos}).`);
      return;
    }

    setSyncing(true);
    setError('');
    try {
      const response = await fetch('/api/submitSokobanMove', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'undo' }),
      });
      const payload = (await readJsonResponse(response)) || {};
      if (!response.ok) throw new Error(payload.error || 'Failed to undo.');
      if (payload.blocked) {
        throw new Error(payload.message || 'Undo limit reached.');
      }
      setLeaderboard(payload.leaderboard || []);
      setTotalSolved(payload.totalSolved || 0);
      setGame(hydrateGame(puzzle, payload.game));
    } catch (err) {
      setError(err.message || 'Failed to undo.');
    } finally {
      setSyncing(false);
    }
  }, [puzzle, finished, practice, game, applyLocal, hydrateGame]);

  const resetDisabled = finished
    || loading
    || !(game?.moves || []).length
    || (
      !practice
      && Number.isFinite(game?.maxResets)
      && (game?.resetCount || 0) >= game.maxResets
    );

  const undoDisabled = finished
    || loading
    || !(game?.moves || []).length
    || (
      !practice
      && Number.isFinite(game?.maxUndos)
      && (game?.undoCount || 0) >= game.maxUndos
    );

  const onReset = useCallback(async () => {
    if (!puzzle || finished) return;
    if (practice) {
      const next = localReset(puzzle, game);
      // Practice: still count resets locally, but never block.
      next.resetCount = (Number.isFinite(game?.resetCount) ? game.resetCount : 0) + 1;
      setGame(next);
      return;
    }

    setSyncing(true);
    setError('');
    try {
      const response = await fetch('/api/submitSokobanMove', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'reset' }),
      });
      const payload = (await readJsonResponse(response)) || {};
      if (!response.ok) throw new Error(payload.error || 'Failed to reset puzzle.');
      if (payload.blocked) {
        throw new Error(payload.message || 'Reset was blocked.');
      }
      setLeaderboard(payload.leaderboard || []);
      setTotalSolved(payload.totalSolved || 0);
      setGame(hydrateGame(puzzle, payload.game));
    } catch (err) {
      setError(err.message || 'Failed to reset puzzle.');
    } finally {
      setSyncing(false);
    }
  }, [puzzle, finished, practice, game, hydrateGame]);

  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (loading || finished) return;
      const tag = event.target?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || event.target?.isContentEditable) return;
      const key = event.key;
      if (key === 'ArrowUp' || key === 'w' || key === 'W') {
        event.preventDefault();
        onDirection('up');
      } else if (key === 'ArrowDown' || key === 's' || key === 'S') {
        event.preventDefault();
        onDirection('down');
      } else if (key === 'ArrowLeft' || key === 'a' || key === 'A') {
        event.preventDefault();
        onDirection('left');
      } else if (key === 'ArrowRight' || key === 'd' || key === 'D') {
        event.preventDefault();
        onDirection('right');
      } else if (key === 'z' || key === 'Z' || key === 'Backspace') {
        event.preventDefault();
        onUndo();
      } else if (key === 'r' || key === 'R') {
        event.preventDefault();
        onReset();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [loading, finished, onDirection, onUndo, onReset]);

  const width = puzzle?.width || 0;
  const height = puzzle?.height || 0;
  const player = game?.player;
  const facing = game?.facing || 'down';

  return (
    <div className="space-y-4">
      <SokobanTutorialModal open={tutorialOpen} onClose={() => setTutorialOpen(false)} />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium text-indigo-200">
            {puzzle?.title || 'Warehouse puzzle'}
            {puzzle?.difficulty ? (
              <span className="ml-2 text-xs font-normal text-indigo-300/80 capitalize">
                {puzzle.difficulty}
              </span>
            ) : null}
          </p>
          <p className="text-xs text-indigo-300/70 mt-0.5">
            Push every crate onto a button · Arrow keys / WASD · Z undo · R reset
            {!practice && Number.isFinite(game?.maxResets)
              ? ` · up to ${game.maxResets} resets · ${game.maxUndos ?? game.maxResets} undos max`
              : ''}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setTutorialOpen(true)}
            className="px-3 py-1.5 rounded-lg text-xs font-medium border border-sky-500/35 text-sky-100 hover:bg-sky-500/10"
          >
            How to play
          </button>
          <FunDayPicker
            dayKey={dayKey}
            todayKey={todayKey}
            onChange={setDayKey}
            allowFuture={canPreviewFuture || isSandbox}
            maxFutureDays={60}
          />
        </div>
      </div>

      {canPreviewFuture ? (
        <div className="rounded-xl border border-indigo-500/20 bg-indigo-500/5 overflow-hidden">
          <button
            type="button"
            onClick={() => setShowSchedule((open) => !open)}
            className="w-full px-4 py-2.5 flex items-center justify-between gap-3 text-left"
          >
            <span className="text-sm font-medium text-indigo-200">Coming days (admin preview)</span>
            <span className="text-xs text-indigo-300/80">{showSchedule ? 'Hide' : 'Show'}</span>
          </button>
          {showSchedule ? (
            <div className="border-t border-indigo-500/20 max-h-64 overflow-auto">
              <table className="w-full text-left text-xs">
                <thead className="sticky top-0 bg-[#0b1220] text-indigo-300/80">
                  <tr>
                    <th className="px-4 py-2 font-medium">Day</th>
                    <th className="px-4 py-2 font-medium">Puzzle</th>
                    <th className="px-4 py-2 font-medium">Difficulty</th>
                    <th className="px-4 py-2 font-medium" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#1a2540]">
                  {schedule.map((row) => {
                    const active = row.dayKey === dayKey;
                    return (
                      <tr key={row.dayKey} className={active ? 'bg-indigo-500/10' : ''}>
                        <td className="px-4 py-2 text-slate-300 whitespace-nowrap">
                          {formatFunDayLabel(row.dayKey, todayKey)}
                          {row.pinned ? (
                            <span className="ml-2 text-[10px] text-amber-300">pinned</span>
                          ) : null}
                        </td>
                        <td className="px-4 py-2 text-slate-100">
                          {row.title}
                          <span className="ml-2 text-slate-500">{row.width}×{row.height}</span>
                        </td>
                        <td className="px-4 py-2 text-slate-400 capitalize">{row.difficulty}</td>
                        <td className="px-4 py-2 text-right">
                          <button
                            type="button"
                            onClick={() => setDayKey(row.dayKey)}
                            className="text-indigo-300 hover:text-indigo-200"
                          >
                            {active ? 'Playing' : 'Open'}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : null}
        </div>
      ) : null}

      {practice ? (
        <p className="text-xs text-amber-300/90 bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-2">
          Practice mode — past puzzles don’t count for the leaderboard or streak.
        </p>
      ) : null}

      {loading ? (
        <p className="text-sm text-slate-400">Loading puzzle…</p>
      ) : error && !puzzle ? (
        <p className="text-sm text-rose-300">{error}</p>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-4">
            <div className="rounded-lg border border-indigo-500/30 bg-indigo-500/10 px-4 py-2.5 min-w-[8rem]">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-indigo-300">Moves</p>
              <p className="text-4xl font-bold tabular-nums text-indigo-200 leading-none mt-1">
                {game?.moveCount || 0}
              </p>
            </div>
            {!practice && Number.isFinite(game?.maxResets) ? (
              <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-2.5 min-w-[8rem]">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-amber-200">Resets</p>
                <p className="text-2xl font-bold tabular-nums text-amber-100 leading-none mt-1">
                  {game?.resetCount || 0}
                  {(game?.resetCount || 0) <= game.maxResets
                    ? <span className="text-sm font-semibold text-amber-200/70">/{game.maxResets}</span>
                    : null}
                </p>
              </div>
            ) : null}
            {!practice && Number.isFinite(game?.maxUndos) ? (
              <div className="rounded-lg border border-sky-500/30 bg-sky-500/10 px-4 py-2.5 min-w-[8rem]">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-sky-200">Undos</p>
                <p className="text-2xl font-bold tabular-nums text-sky-100 leading-none mt-1">
                  {game?.undoCount || 0}/{game.maxUndos}
                </p>
              </div>
            ) : null}
            {finished ? (
              <span className="text-emerald-400 font-medium text-sm">Solved in {game?.moveCount || 0} moves!</span>
            ) : syncing ? (
              <span className="text-xs text-indigo-300/80">Saving…</span>
            ) : null}
            {error ? <span className="text-xs text-rose-300">{error}</span> : null}
          </div>

          <div className="sokoban-play-row">
            <div className={`sokoban-board-frame ${finished ? 'sokoban-board-frame--won' : ''}`}>
              <div
                className="sokoban-board-grid"
                style={{
                  gridTemplateColumns: `repeat(${width}, minmax(1.75rem, 2.15rem))`,
                }}
              >
                {Array.from({ length: height }).flatMap((_, r) => (
                  Array.from({ length: width }).map((__, c) => {
                    const key = cellKey(r, c);
                    const isWall = walls.has(key);
                    const isTarget = targets.has(key);
                    const isBox = boxes.has(key);
                    const isPlayer = player && player.r === r && player.c === c;

                    return (
                      <div
                        key={key}
                        className={`sokoban-cell ${isWall ? 'sokoban-cell--wall' : 'sokoban-cell--floor'} ${
                          isTarget && !isWall ? 'sokoban-cell--target' : ''
                        } ${isBox && isTarget ? 'sokoban-cell--done' : ''}`}
                      >
                        {isWall ? (
                          <WallTile r={r} c={c} />
                        ) : isTarget ? (
                          <TargetTile done={isBox} />
                        ) : (
                          <FloorTile r={r} c={c} />
                        )}
                        {!isWall && isBox ? (
                          <span className="sokoban-cell__piece">
                            <CrateTile onTarget={isTarget} />
                          </span>
                        ) : null}
                        {!isWall && isPlayer && !isBox ? (
                          <span className="sokoban-cell__piece">
                            <PlayerSprite facing={facing} className="w-[88%] h-[88%]" />
                          </span>
                        ) : null}
                      </div>
                    );
                  })
                ))}
              </div>
            </div>
            <SokobanLegend />
          </div>

          <div className="flex flex-wrap gap-2 items-center">
            <div className="grid grid-cols-3 gap-1 w-[8.5rem]">
              <div />
              <button
                type="button"
                disabled={finished || loading}
                onClick={() => onDirection('up')}
                className="h-10 rounded-lg bg-neutral text-neutral-content hover:brightness-110 disabled:opacity-40 text-lg"
              >
                ↑
              </button>
              <div />
              <button
                type="button"
                disabled={finished || loading}
                onClick={() => onDirection('left')}
                className="h-10 rounded-lg bg-neutral text-neutral-content hover:brightness-110 disabled:opacity-40 text-lg"
              >
                ←
              </button>
              <button
                type="button"
                disabled={finished || loading}
                onClick={() => onDirection('down')}
                className="h-10 rounded-lg bg-neutral text-neutral-content hover:brightness-110 disabled:opacity-40 text-lg"
              >
                ↓
              </button>
              <button
                type="button"
                disabled={finished || loading}
                onClick={() => onDirection('right')}
                className="h-10 rounded-lg bg-neutral text-neutral-content hover:brightness-110 disabled:opacity-40 text-lg"
              >
                →
              </button>
            </div>
            <button
              type="button"
              disabled={undoDisabled}
              onClick={onUndo}
              className="px-3 h-10 rounded-lg bg-neutral text-neutral-content hover:brightness-110 disabled:opacity-40 text-xs font-medium"
            >
              Undo
            </button>
            <button
              type="button"
              disabled={resetDisabled}
              onClick={onReset}
              className="px-3 h-10 rounded-lg bg-neutral text-neutral-content hover:brightness-110 disabled:opacity-40 text-xs font-medium"
            >
              Reset
            </button>
          </div>

          <div className="rounded-xl border border-[#1a2540] overflow-hidden">
            <div className="px-4 py-3 border-b border-[#1a2540] flex justify-between gap-2">
              <p className="text-sm font-semibold text-indigo-200">
                Today’s solvers
              </p>
              <p className="text-xs text-slate-500">{totalSolved} solved</p>
            </div>
            {practice ? (
              <p className="px-4 py-3 text-xs text-slate-500">Leaderboard hidden in practice mode.</p>
            ) : leaderboard.length === 0 ? (
              <p className="px-4 py-3 text-xs text-slate-500">Nobody has solved today’s Sokoban yet.</p>
            ) : (
              <ol className="divide-y divide-[#1a2540]">
                {leaderboard.map((row) => (
                  <FunLeaderboardRow
                    key={row.uid || row.rank}
                    row={row}
                    currentUserUid={currentUserUid}
                    resultText={row.resultLabel || `${row.moveCount} moves`}
                    metaText={row.completedAt ? formatTime(row.completedAt) : ''}
                  />
                ))}
              </ol>
            )}
          </div>
        </>
      )}
    </div>
  );
}
