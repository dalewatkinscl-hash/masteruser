import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  NONOGRAM_MAX_LIVES,
  NONOGRAM_SIZE,
  applyLineAutoComplete,
  buildStarterHintMarks,
  cloneMarks,
  emptyMarks,
  formatDuration,
  getLondonDayKey,
  isBoardSolved,
  isHarderNonogram,
  loadLocalGame,
  saveLocalGame,
} from '../lib/nonogram';
import FunDayPicker from './FunDayPicker';
import FunLeaderboardRow from './FunLeaderboardRow';
import NonogramTutorialModal, { hasSeenNonogramTutorial } from './NonogramTutorialModal';

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

function cellKey(row, col) {
  return `${row}:${col}`;
}

function cellClass(value, { won, lost, isWrong, isHint, isPulse } = {}) {
  if (isWrong) return 'bg-rose-500/80 border-rose-400 text-white';
  if (value === 1) {
    if (won || lost) return `text-white${isPulse ? ' nonogram-cell-pulse' : ''}`;
    return `bg-slate-100 border-slate-200${isPulse ? ' nonogram-cell-pulse' : ''}`;
  }
  if (value === -1) {
    if (isHint) return `bg-[#060e1a] border-amber-500/35 text-amber-400/90${isPulse ? ' nonogram-cell-pulse' : ''}`;
    return `bg-[#060e1a] border-[#1a2540] text-slate-500${isPulse ? ' nonogram-cell-pulse' : ''}`;
  }
  return `bg-[#0b1220] border-[#1a2540] hover:border-indigo-400/50${isPulse ? ' nonogram-cell-pulse' : ''}`;
}

function getRevealCellStyle(revealColors, row, col, filled, inactive = false) {
  if (!filled) return undefined;
  const tone = revealColors?.[row]?.[col];
  if (!tone) return undefined;
  return {
    backgroundColor: tone,
    borderColor: inactive ? 'rgba(148, 163, 184, 0.65)' : tone,
    opacity: inactive ? 0.78 : 1,
  };
}

function LivesDisplay({ lives, maxLives }) {
  const total = maxLives || 3;
  const remaining = Math.max(0, lives ?? total);
  return (
    <div className="inline-flex items-center gap-1.5 h-6" aria-label={`${remaining} of ${total} lives remaining`}>
      {Array.from({ length: total }).map((_, index) => (
        <span
          key={`life-${index}`}
          className={`text-sm leading-none ${index < remaining ? 'text-rose-400' : 'text-slate-700'}`}
          aria-hidden="true"
        >
          ♥
        </span>
      ))}
      <span className="text-[11px] text-slate-500 ml-1">{remaining}/{total}</span>
    </div>
  );
}

export default function NonogramPanel({
  currentUserUid,
  onAchievements,
  isAdmin = false,
  sandbox = false,
  forcedDayKey = null,
}) {
  const todayKey = useMemo(() => getLondonDayKey(), []);
  const [dayKey, setDayKey] = useState(forcedDayKey || todayKey);
  const [serverPuzzle, setServerPuzzle] = useState(null);
  const [solution, setSolution] = useState([]);

  const isSandbox = Boolean(sandbox);
  const practice = isSandbox || dayKey !== todayKey;
  const puzzle = serverPuzzle || {
    dayKey,
    size: NONOGRAM_SIZE,
    puzzleId: 'daily',
    title: 'Nonogram',
    difficulty: '',
    rowClues: [],
    colClues: [],
    reveal: [],
  };
  const size = puzzle.size || NONOGRAM_SIZE;
  const puzzleStorageId = puzzle.puzzleId || 'daily';

  const [marks, setMarks] = useState(() => emptyMarks(size));
  const [livesRemaining, setLivesRemaining] = useState(NONOGRAM_MAX_LIVES);
  const [mistakes, setMistakes] = useState(0);
  const [status, setStatus] = useState('in_progress');
  const [startedAt, setStartedAt] = useState(null);
  const [completedAt, setCompletedAt] = useState(null);
  const [durationMs, setDurationMs] = useState(null);
  const [wrongKeys, setWrongKeys] = useState(() => new Set());
  const [leaderboard, setLeaderboard] = useState([]);
  const [totalSolved, setTotalSolved] = useState(0);
  const [totalFailed, setTotalFailed] = useState(0);
  const [mode, setMode] = useState('fill');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [rotationClosed, setRotationClosed] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [ready, setReady] = useState(false);
  const [tutorialOpen, setTutorialOpen] = useState(false);
  const [hintKeys, setHintKeys] = useState(() => new Set());
  const [pulseRows, setPulseRows] = useState(() => new Set());
  const [pulseCols, setPulseCols] = useState(() => new Set());

  const dragRef = useRef(null);
  const wrongTimerRef = useRef(null);
  const pulseTimerRef = useRef(null);
  const marksRef = useRef(marks);
  const hintKeysRef = useRef(hintKeys);
  const reportedMistakesRef = useRef(new Set());
  const syncInFlightRef = useRef(false);
  const pendingSyncRef = useRef(null);

  useEffect(() => {
    if (forcedDayKey) setDayKey(forcedDayKey);
  }, [forcedDayKey]);

  useEffect(() => {
    if (!hasSeenNonogramTutorial()) setTutorialOpen(true);
  }, []);

  const finished = status === 'won' || status === 'lost';
  const won = status === 'won';
  const lost = status === 'lost';

  const maxColClueLen = useMemo(
    () => Math.max(1, ...(puzzle.colClues || []).map((clues) => clues.length)),
    [puzzle],
  );
  const maxRowClueLen = useMemo(
    () => Math.max(1, ...(puzzle.rowClues || []).map((clues) => clues.length)),
    [puzzle],
  );
  const revealColors = puzzle.reveal || [];

  useEffect(() => {
    marksRef.current = marks;
  }, [marks]);

  useEffect(() => {
    hintKeysRef.current = hintKeys;
  }, [hintKeys]);

  useEffect(() => () => {
    if (wrongTimerRef.current) clearTimeout(wrongTimerRef.current);
    if (pulseTimerRef.current) clearTimeout(pulseTimerRef.current);
  }, []);

  const triggerLinePulse = useCallback((rows = [], cols = []) => {
    if (!rows.length && !cols.length) return;
    setPulseRows(new Set(rows));
    setPulseCols(new Set(cols));
    if (pulseTimerRef.current) clearTimeout(pulseTimerRef.current);
    pulseTimerRef.current = setTimeout(() => {
      setPulseRows(new Set());
      setPulseCols(new Set());
    }, 700);
  }, []);

  const makeStarterHints = useCallback((nextPuzzle, nextSolution) => {
    if (!isHarderNonogram(nextPuzzle) || !nextSolution?.length) {
      return { marks: emptyMarks(nextPuzzle.size || NONOGRAM_SIZE), hintKeys: [] };
    }
    return buildStarterHintMarks(nextSolution, {
      dayKey,
      puzzleId: nextPuzzle.puzzleId || 'daily',
      difficulty: nextPuzzle.difficulty || '',
    });
  }, [dayKey]);

  const persistLocal = useCallback((next) => {
    saveLocalGame(dayKey, {
      ...next,
      hintKeys: next.hintKeys || [...hintKeysRef.current],
    }, puzzleStorageId);
  }, [dayKey, puzzleStorageId]);

  const syncToServer = useCallback(async (syncState) => {
    if (practice) return;
    if (syncInFlightRef.current) {
      pendingSyncRef.current = syncState;
      return;
    }

    const {
      marks: nextMarks,
      lives,
      mistakeCount,
      gameStatus,
      started,
      completed,
      duration,
      mistake,
    } = syncState;

    syncInFlightRef.current = true;
    setSyncing(true);
    try {
      const response = await fetch('/api/submitNonogramState', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          dayKey,
          marks: nextMarks,
          livesRemaining: lives,
          mistakes: mistakeCount,
          status: gameStatus,
          startedAt: started,
          completedAt: completed,
          durationMs: duration,
          mistake,
          clientFinal: gameStatus === 'won' || gameStatus === 'lost',
        }),
      });
      const payload = (await readJsonResponse(response)) || {};
      if (!response.ok) throw new Error(payload.error || 'Failed to sync Nonogram.');
      if (Array.isArray(payload.leaderboard)) {
        setLeaderboard(payload.leaderboard);
        setTotalSolved(payload.totalSolved || 0);
        setTotalFailed(payload.totalFailed || 0);
      }
      if (Array.isArray(payload.achievements) && onAchievements) {
        onAchievements(payload.achievements);
      }
      if (payload.message && (payload.correct || payload.game?.status === 'lost' || payload.countedMistake)) {
        setMessage(payload.message);
      }
    } catch (err) {
      setError(err.message || 'Failed to sync Nonogram.');
    } finally {
      syncInFlightRef.current = false;
      const queued = pendingSyncRef.current;
      pendingSyncRef.current = null;
      if (queued) {
        void syncToServer(queued);
      } else {
        setSyncing(false);
      }
    }
  }, [dayKey, onAchievements, practice]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setReady(false);
      setWrongKeys(new Set());
      setMessage('');
      setError('');
      setRotationClosed(false);
      reportedMistakesRef.current = new Set();

      try {
        const query = new URLSearchParams();
        if (dayKey !== todayKey) query.set('dayKey', dayKey);
        if (isSandbox) query.set('sandbox', '1');
        const response = await fetch(`/api/getDailyNonogram${query.toString() ? `?${query.toString()}` : ''}`, {
          credentials: 'include',
        });
        const payload = (await readJsonResponse(response)) || {};
        if (!response.ok) throw new Error(payload.error || 'Failed to load Nonogram.');

        if (cancelled) return;

        if (payload.weekend || payload.sittingOut) {
          setRotationClosed(true);
          setServerPuzzle({});
          setSolution([]);
          setLeaderboard([]);
          setTotalSolved(0);
          setTotalFailed(0);
          setMarks(emptyMarks(NONOGRAM_SIZE));
          setHintKeys(new Set());
          setLivesRemaining(NONOGRAM_MAX_LIVES);
          setMistakes(0);
          setStatus('in_progress');
          setStartedAt(null);
          setCompletedAt(null);
          setDurationMs(null);
          setPulseRows(new Set());
          setPulseCols(new Set());
          setError('');
          setMessage(
            payload.message
              || (payload.sittingOut
                ? 'Nonogram isn’t in today’s Fun rotation.'
                : 'Fun games come back Monday.'),
          );
          return;
        }

        const nextPuzzle = payload.puzzle || {};
        const nextSize = nextPuzzle.size || NONOGRAM_SIZE;
        const storageId = nextPuzzle.puzzleId || 'daily';
        const local = loadLocalGame(dayKey, nextSize, storageId);

        setServerPuzzle(nextPuzzle);
        setSolution(payload.solution || []);
        setLeaderboard(payload.practice ? [] : (payload.leaderboard || []));
        setTotalSolved(payload.practice ? 0 : (payload.totalSolved || 0));
        setTotalFailed(payload.practice ? 0 : (payload.totalFailed || 0));

        if (local) {
          setMarks(local.marks);
          setLivesRemaining(local.livesRemaining);
          setMistakes(local.mistakes);
          setStatus(local.status);
          setStartedAt(local.startedAt);
          setCompletedAt(local.completedAt);
          setDurationMs(local.durationMs);
          reportedMistakesRef.current = new Set(local.mistakenCells || []);
          setHintKeys(new Set(local.hintKeys || []));
        } else {
          const starter = (() => {
            if (!isHarderNonogram(nextPuzzle) || !(payload.solution || []).length) {
              return { marks: emptyMarks(nextSize), hintKeys: [] };
            }
            return buildStarterHintMarks(payload.solution, {
              dayKey,
              puzzleId: storageId,
              difficulty: nextPuzzle.difficulty || '',
            });
          })();
          const initialMarks = (payload.game?.marks && (payload.game.status === 'won' || payload.game.status === 'lost'))
            ? cloneMarks(payload.game.marks, nextSize)
            : starter.marks;
          setMarks(initialMarks);
          setHintKeys(new Set(starter.hintKeys));
          setLivesRemaining(payload.game?.livesRemaining ?? NONOGRAM_MAX_LIVES);
          setMistakes(payload.game?.mistakes ?? 0);
          setStatus(payload.game?.status || 'in_progress');
          setStartedAt(payload.game?.startedAt || null);
          setCompletedAt(payload.game?.completedAt || null);
          setDurationMs(payload.game?.durationMs ?? null);
          if (starter.hintKeys.length && (!payload.game?.marks || payload.game.status === 'in_progress')) {
            persistLocal({
              marks: starter.marks,
              livesRemaining: payload.game?.livesRemaining ?? NONOGRAM_MAX_LIVES,
              mistakes: payload.game?.mistakes ?? 0,
              status: payload.game?.status || 'in_progress',
              startedAt: payload.game?.startedAt || null,
              completedAt: payload.game?.completedAt || null,
              durationMs: payload.game?.durationMs ?? null,
              mistakenCells: [],
              hintKeys: starter.hintKeys,
            });
          }
        }

        setPulseRows(new Set());
        setPulseCols(new Set());

        const serverGame = payload.game;
        if (serverGame?.status === 'won' || serverGame?.status === 'lost') {
          setMarks(cloneMarks(serverGame.marks, nextSize));
          setStatus(serverGame.status);
          setLivesRemaining(serverGame.livesRemaining ?? 0);
          setMistakes(serverGame.mistakes || 0);
          setStartedAt(serverGame.startedAt);
          setCompletedAt(serverGame.completedAt);
          setDurationMs(serverGame.durationMs);
          persistLocal({
            marks: cloneMarks(serverGame.marks, nextSize),
            livesRemaining: serverGame.livesRemaining ?? 0,
            mistakes: serverGame.mistakes || 0,
            status: serverGame.status,
            startedAt: serverGame.startedAt,
            completedAt: serverGame.completedAt,
            durationMs: serverGame.durationMs,
            mistakenCells: [...reportedMistakesRef.current],
            hintKeys: [...hintKeysRef.current],
          });
        } else if (
          local
          && (local.status === 'won' || local.status === 'lost')
          && !payload.practice
        ) {
          syncToServer({
            marks: cloneMarks(local.marks, nextSize),
            lives: local.livesRemaining ?? NONOGRAM_MAX_LIVES,
            mistakeCount: local.mistakes ?? 0,
            gameStatus: local.status,
            started: local.startedAt || null,
            completed: local.completedAt || null,
            duration: local.durationMs ?? null,
          });
        }
      } catch (err) {
        if (!cancelled) setError(err.message || 'Failed to load Nonogram.');
      } finally {
        if (!cancelled) setReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [dayKey, todayKey, persistLocal, syncToServer, isSandbox]);

  const flashWrong = useCallback((row, col) => {
    const key = cellKey(row, col);
    setWrongKeys((prev) => {
      const next = new Set(prev);
      next.add(key);
      return next;
    });
    if (wrongTimerRef.current) clearTimeout(wrongTimerRef.current);
    wrongTimerRef.current = setTimeout(() => {
      setWrongKeys((prev) => {
        const next = new Set(prev);
        next.delete(key);
        return next;
      });
    }, 350);
  }, []);

  const ensureStarted = useCallback(() => {
    if (startedAt) return startedAt;
    const now = new Date().toISOString();
    setStartedAt(now);
    return now;
  }, [startedAt]);

  const paintCell = (row, col, paintValue) => {
    if (finished || !ready) return;

    if (paintValue === 1 && solution?.[row]?.[col] !== 1) {
      const key = cellKey(row, col);
      flashWrong(row, col);
      if (reportedMistakesRef.current.has(key)) return;

      reportedMistakesRef.current.add(key);
      const start = ensureStarted();
      const nextMistakes = mistakes + 1;
      const nextLives = Math.max(0, NONOGRAM_MAX_LIVES - nextMistakes);
      const nextStatus = nextLives <= 0 ? 'lost' : 'in_progress';
      const completed = nextStatus === 'lost' ? new Date().toISOString() : null;
      const duration = nextStatus === 'lost' && start
        ? Math.max(0, Date.now() - new Date(start).getTime())
        : null;

      setMistakes(nextMistakes);
      setLivesRemaining(nextLives);
      setStatus(nextStatus);
      if (completed) {
        setCompletedAt(completed);
        setDurationMs(duration);
      }
      setMessage(
        nextStatus === 'lost'
          ? 'Out of lives — better luck tomorrow.'
          : `Wrong fill — ${nextLives} ${nextLives === 1 ? 'life' : 'lives'} left.`,
      );

      const snapshot = {
        marks: cloneMarks(marksRef.current, size),
        livesRemaining: nextLives,
        mistakes: nextMistakes,
        status: nextStatus,
        startedAt: start,
        completedAt: completed,
        durationMs: duration,
        mistakenCells: [...reportedMistakesRef.current],
      };
      persistLocal(snapshot);
      syncToServer({
        marks: snapshot.marks,
        lives: nextLives,
        mistakeCount: nextMistakes,
        gameStatus: nextStatus,
        started: start,
        completed,
        duration,
        mistake: { row, col },
      });
      return;
    }

    const start = ensureStarted();
    setMarks((prev) => {
      let next = cloneMarks(prev, size);
      next[row][col] = paintValue;

      let pulseRows = [];
      let pulseCols = [];
      if (paintValue === 1) {
        const auto = applyLineAutoComplete(next, solution, row, col);
        next = auto.marks;
        pulseRows = auto.pulseRows;
        pulseCols = auto.pulseCols;
        if (pulseRows.length || pulseCols.length) {
          // Defer pulse so paint commit paints first
          queueMicrotask(() => triggerLinePulse(pulseRows, pulseCols));
        }
      }

      let nextStatus = status;
      let completed = completedAt;
      let duration = durationMs;

      if (isBoardSolved(next, solution)) {
        nextStatus = 'won';
        completed = new Date().toISOString();
        duration = start ? Math.max(0, Date.now() - new Date(start).getTime()) : 0;
        setStatus('won');
        setCompletedAt(completed);
        setDurationMs(duration);
        setMessage('Solved — well done.');
        syncToServer({
          marks: next,
          lives: livesRemaining,
          mistakeCount: mistakes,
          gameStatus: 'won',
          started: start,
          completed,
          duration,
        });
      } else if (pulseRows.length || pulseCols.length) {
        setMessage('Line complete — remaining blanks marked.');
      } else if (status === 'in_progress') {
        setMessage('');
      }

      persistLocal({
        marks: next,
        livesRemaining,
        mistakes,
        status: nextStatus,
        startedAt: start,
        completedAt: completed,
        durationMs: duration,
        mistakenCells: [...reportedMistakesRef.current],
        hintKeys: [...hintKeysRef.current],
      });
      return next;
    });
  };

  const beginPaint = (row, col, event) => {
    if (finished || !ready) return;
    event.preventDefault();
    const current = marks?.[row]?.[col] ?? 0;
    let paintValue;
    if (event.button === 2 || mode === 'mark') {
      paintValue = current === -1 ? 0 : -1;
    } else {
      paintValue = current === 1 ? 0 : 1;
    }
    dragRef.current = { paintValue };
    paintCell(row, col, paintValue);
  };

  const continuePaint = (row, col) => {
    if (!dragRef.current || finished) return;
    const paintValue = dragRef.current.paintValue;
    const current = marksRef.current?.[row]?.[col] ?? 0;
    if (current === paintValue) return;
    paintCell(row, col, paintValue);
  };

  useEffect(() => {
    const endDrag = () => {
      dragRef.current = null;
    };
    window.addEventListener('pointerup', endDrag);
    window.addEventListener('mouseup', endDrag);
    return () => {
      window.removeEventListener('pointerup', endDrag);
      window.removeEventListener('mouseup', endDrag);
    };
  }, []);

  const clearBoard = () => {
    if (finished) return;
    const starter = makeStarterHints(puzzle, solution);
    setMarks(starter.marks);
    setHintKeys(new Set(starter.hintKeys));
    setMessage(starter.hintKeys.length ? 'Cleared — starter X clues restored.' : '');
    setWrongKeys(new Set());
    setPulseRows(new Set());
    setPulseCols(new Set());
    persistLocal({
      marks: starter.marks,
      livesRemaining,
      mistakes,
      status,
      startedAt,
      completedAt,
      durationMs,
      mistakenCells: [...reportedMistakesRef.current],
      hintKeys: starter.hintKeys,
    });
  };

  const revealPracticeSolution = () => {
    if (!practice || finished || !ready) return;
    const start = startedAt || new Date().toISOString();
    const completed = new Date().toISOString();
    const nextMarks = solution.map((row) => row.map((cell) => (cell === 1 ? 1 : -1)));
    setStartedAt(start);
    setCompletedAt(completed);
    setDurationMs(0);
    setMarks(nextMarks);
    setStatus('won');
    setMessage('Practice reveal complete.');
    persistLocal({
      marks: nextMarks,
      livesRemaining,
      mistakes,
      status: 'won',
      startedAt: start,
      completedAt: completed,
      durationMs: 0,
      mistakenCells: [...reportedMistakesRef.current],
    });
  };

  return (
    <div className="space-y-4">
      <NonogramTutorialModal open={tutorialOpen} onClose={() => setTutorialOpen(false)} />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-indigo-300/80">
          {isSandbox ? 'Admin sandbox · ' : practice ? 'Practice · ' : ''}{size}×{size} · 3 lives · {dayKey}
          {puzzle.difficulty ? ` · ${puzzle.difficulty}` : ''}
          {hintKeys.size ? ` · ${hintKeys.size} starter X clues` : ''}
          {syncing ? ' · syncing…' : ''}
        </p>
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
            allowFuture={isAdmin || isSandbox}
          />
        </div>
      </div>

      {rotationClosed ? (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-5 py-6">
          <p className="text-sm text-amber-100">{message || 'This puzzle isn’t available today.'}</p>
        </div>
      ) : (
      <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 min-h-[2.25rem]">
            <div className="flex flex-wrap items-center gap-3">
              <div className="inline-flex items-center gap-2 rounded-md border border-[#1a2540] bg-[#060e1a] px-2.5 py-1.5">
                <span className={`text-xs font-medium ${mode === 'fill' ? 'text-indigo-200' : 'text-slate-500'}`}>
                  Paint
                </span>
                <button
                  type="button"
                  role="switch"
                  aria-checked={mode === 'mark'}
                  aria-label="Toggle between Paint and X"
                  disabled={finished}
                  onClick={() => setMode((prev) => (prev === 'fill' ? 'mark' : 'fill'))}
                  className={`relative h-6 w-11 rounded-full transition-colors disabled:opacity-50 ${
                    mode === 'mark' ? 'bg-amber-500/80' : 'bg-indigo-600'
                  }`}
                >
                  <span
                    className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${
                      mode === 'mark' ? 'translate-x-5' : 'translate-x-0'
                    }`}
                  />
                </button>
                <span className={`text-xs font-medium ${mode === 'mark' ? 'text-amber-200' : 'text-slate-500'}`}>
                  X
                </span>
              </div>
              <button
                type="button"
                disabled={finished}
                onClick={clearBoard}
                className="px-3 py-1.5 rounded-md text-xs font-medium border border-[#1a2540] text-slate-300 hover:bg-white/[0.04] disabled:opacity-50"
              >
                Clear
              </button>
              {practice && (
                <button
                  type="button"
                  disabled={finished || !ready}
                  onClick={revealPracticeSolution}
                  className="px-3 py-1.5 rounded-md text-xs font-medium border border-emerald-500/30 text-emerald-200 hover:bg-emerald-500/10 disabled:opacity-50"
                >
                  Reveal picture
                </button>
              )}
            </div>
            <LivesDisplay lives={livesRemaining} maxLives={NONOGRAM_MAX_LIVES} />
          </div>
          {practice && (
            <p className="text-xs text-slate-500">
              Practice mode lets you replay past days safely. Reveals do not affect the leaderboard or streaks.
            </p>
          )}
          {!practice && hintKeys.size > 0 && !finished && (
            <p className="text-xs text-amber-200/80">
              Harder board — amber × marks are starter clues. Finish every paint on a row or column to auto-fill the rest.
            </p>
          )}
          {practice && isHarderNonogram(puzzle) && hintKeys.size > 0 && !finished && (
            <p className="text-xs text-amber-200/80">
              Amber × marks are starter clues. Completing all paints on a line pulses it and fills remaining blanks with ×.
            </p>
          )}

          <div className="overflow-x-auto pb-2">
            <div
              className="inline-grid gap-0.5 select-none"
              style={{
                gridTemplateColumns: `repeat(${maxRowClueLen}, minmax(0.75rem, 1rem)) repeat(${size}, minmax(1.2rem, ${size >= 18 ? '1.45rem' : size >= 15 ? '1.65rem' : '1.85rem'}))`,
              }}
              onContextMenu={(event) => event.preventDefault()}
            >
              {Array.from({ length: maxRowClueLen }).map((_, i) => (
                <div key={`corner-${i}`} />
              ))}
              {Array.from({ length: size }).map((_, col) => (
                <div
                  key={`col-clue-${col}`}
                  className={`flex flex-col items-center justify-end gap-0.5 pb-1 min-h-[3.5rem] ${
                    pulseCols.has(col) ? 'nonogram-clue-pulse' : ''
                  }`}
                >
                  {Array.from({ length: maxColClueLen - (puzzle.colClues[col]?.length || 0) }).map((_, pad) => (
                    <span key={`col-pad-${col}-${pad}`} className="h-3" />
                  ))}
                  {(puzzle.colClues[col] || [0]).map((n, i) => (
                    <span key={`col-${col}-${i}`} className="text-[10px] font-mono text-slate-400 leading-none">
                      {n}
                    </span>
                  ))}
                </div>
              ))}

              {Array.from({ length: size }).map((_, row) => (
                <div key={`row-${row}`} className="contents">
                  {Array.from({ length: maxRowClueLen - (puzzle.rowClues[row]?.length || 0) }).map((_, pad) => (
                    <div key={`row-pad-${row}-${pad}`} />
                  ))}
                  {(puzzle.rowClues[row] || [0]).map((n, i) => (
                    <div
                      key={`row-clue-${row}-${i}`}
                      className={`flex items-center justify-end pr-1 text-[10px] font-mono text-slate-400 ${
                        pulseRows.has(row) ? 'nonogram-clue-pulse' : ''
                      }`}
                    >
                      {n}
                    </div>
                  ))}
                  {Array.from({ length: size }).map((__, col) => {
                    const playerValue = marks?.[row]?.[col] ?? 0;
                    const solutionFill = lost && solution?.[row]?.[col] === 1;
                    const value = solutionFill ? 1 : playerValue;
                    const isWrong = wrongKeys.has(cellKey(row, col));
                    const isHint = hintKeys.has(cellKey(row, col)) && playerValue === -1;
                    const isPulse = pulseRows.has(row) || pulseCols.has(col);
                    const showRevealArt = won || lost;
                    return (
                      <button
                        key={`cell-${row}-${col}`}
                        type="button"
                        disabled={finished || !ready}
                        onPointerDown={(event) => beginPaint(row, col, event)}
                        onPointerEnter={() => continuePaint(row, col)}
                        className={`aspect-square w-full border rounded-[3px] flex items-center justify-center text-[10px] font-semibold touch-none ${cellClass(value, { won, lost, isWrong, isHint, isPulse })}`}
                        aria-label={`Row ${row + 1} column ${col + 1}`}
                        style={showRevealArt ? getRevealCellStyle(revealColors, row, col, value === 1, lost) : undefined}
                      >
                        {isWrong ? '!' : !solutionFill && playerValue === -1 ? '×' : ''}
                      </button>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>

          <div className="min-h-[1.25rem]">
            {won && (
              <p className="text-sm text-emerald-300">
                Solved{durationMs != null ? ` in ${formatDuration(durationMs)}` : ''}.
                {practice ? ' Practice only — not on the leaderboard.' : ' You’re on today’s leaderboard.'}
              </p>
            )}
            {lost && (
              <p className="text-sm text-rose-300">
                Out of lives. The picture is shown above
                {practice ? '.' : ' — try again tomorrow.'}
              </p>
            )}
            {!finished && message && <p className="text-sm text-amber-200">{message}</p>}
            {error && <p className="text-sm text-rose-300">{error}</p>}
          </div>
      </div>
      )}

      {!practice && !rotationClosed && (
        <div className="rounded-xl border border-[#1a2540] overflow-hidden">
          <div className="px-4 py-3 border-b border-[#1a2540] flex items-center justify-between gap-3">
            <h3 className="text-sm font-semibold text-indigo-200">Today’s leaderboard</h3>
            <span className="text-xs text-slate-500">{totalSolved} solved · {totalFailed} failed</span>
          </div>
          {!leaderboard.length ? (
            <p className="px-5 py-8 text-sm text-slate-500 text-center">Nobody has finished it yet.</p>
          ) : (
            <ol className="divide-y divide-[#1a2540]">
              {leaderboard.map((row) => (
                <FunLeaderboardRow
                  key={row.uid || row.rank}
                  row={row}
                  currentUserUid={currentUserUid}
                  resultText={row.durationLabel || row.resultLabel || formatDuration(row.durationMs)}
                  metaText={row.completedAt ? formatTime(row.completedAt) : ''}
                />
              ))}
            </ol>
          )}
        </div>
      )}
    </div>
  );
}
