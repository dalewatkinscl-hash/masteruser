import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import FunDayPicker, { getLondonDayKey } from './FunDayPicker';
import FunLeaderboardRow from './FunLeaderboardRow';
import BoggleTutorialModal, { hasSeenBoggleTutorial } from './BoggleTutorialModal';
import {
  ROUND_SECONDS,
  areAdjacent,
  clearLocalGame,
  ensureDictionary,
  isDictionaryReady,
  loadLocalGame,
  pathToWord,
  saveLocalGame,
  scoreWord,
  validateLocalWord,
} from '../lib/boggle';

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
  return date.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}

function formatClock(seconds) {
  const s = Math.max(0, Math.floor(seconds));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${String(r).padStart(2, '0')}`;
}

export default function BogglePanel({
  currentUserUid,
  onAchievements,
  isAdmin = false,
  sandbox = false,
  forcedDayKey = null,
}) {
  const todayKey = getLondonDayKey();
  const [dayKey, setDayKey] = useState(forcedDayKey || todayKey);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [board, setBoard] = useState([]);
  const [roundSeconds, setRoundSeconds] = useState(ROUND_SECONDS);
  const [found, setFound] = useState([]);
  const [path, setPath] = useState([]);
  const [drawing, setDrawing] = useState(false);
  const [remaining, setRemaining] = useState(ROUND_SECONDS);
  const [startedAt, setStartedAt] = useState(null);
  const [finished, setFinished] = useState(false);
  const [serverGame, setServerGame] = useState(null);
  const [leaderboard, setLeaderboard] = useState([]);
  const [totalPlayed, setTotalPlayed] = useState(0);
  const [dictionaryReady, setDictionaryReady] = useState(isDictionaryReady());
  const [tutorialOpen, setTutorialOpen] = useState(false);
  const submittedRef = useRef(false);
  const isSandbox = Boolean(sandbox);
  const practice = isSandbox || dayKey !== todayKey;
  const revealed = Boolean(startedAt) || finished;

  useEffect(() => {
    if (forcedDayKey) setDayKey(forcedDayKey);
  }, [forcedDayKey]);

  useEffect(() => {
    if (!hasSeenBoggleTutorial()) setTutorialOpen(true);
  }, []);

  const foundSet = useMemo(() => new Set(found.map((row) => row.word)), [found]);
  const liveScore = useMemo(
    () => found.reduce((sum, row) => sum + (row.points || scoreWord(row.word)), 0),
    [found],
  );

  const persist = useCallback((next) => {
    if (practice || isSandbox) return;
    saveLocalGame(dayKey, next);
  }, [dayKey, practice, isSandbox]);

  const submitResult = useCallback(async ({ words, durationMs, auto = false }) => {
    if (submittedRef.current) return;
    submittedRef.current = true;
    setSubmitting(true);
    setError('');
    try {
      if (practice) {
        setFinished(true);
        setServerGame({
          status: words.length ? 'won' : 'lost',
          score: words.reduce((s, w) => s + scoreWord(w), 0),
          wordCount: words.length,
          words: words.map((w) => ({ word: w, points: scoreWord(w) })),
        });
        setMessage(isSandbox
          ? 'Admin sandbox — not saved to the leaderboard.'
          : 'Practice run — not saved to the leaderboard.');
        return;
      }
      const response = await fetch('/api/submitBoggleResult', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ words, durationMs, dayKey }),
      });
      const payload = (await readJsonResponse(response)) || {};
      if (!response.ok) throw new Error(payload.error || 'Failed to submit Boggle.');
      setServerGame(payload.game);
      setLeaderboard(payload.leaderboard || []);
      setTotalPlayed(payload.totalPlayed || 0);
      setFinished(true);
      clearLocalGame(dayKey);
      if (Array.isArray(payload.achievements) && onAchievements) onAchievements(payload.achievements);
      setMessage(auto ? 'Time’s up — score submitted.' : 'Score submitted.');
    } catch (err) {
      submittedRef.current = false;
      setError(err.message || 'Failed to submit.');
    } finally {
      setSubmitting(false);
    }
  }, [dayKey, onAchievements, practice, isSandbox]);

  const load = async (key) => {
    submittedRef.current = false;
    const params = new URLSearchParams();
    if (key && key !== todayKey) params.set('dayKey', key);
    if (isSandbox) params.set('sandbox', '1');
    const query = params.toString() ? `?${params.toString()}` : '';
    const response = await fetch(`/api/getDailyBoggle${query}`, { credentials: 'include' });
    const payload = (await readJsonResponse(response)) || {};
    if (!response.ok) throw new Error(payload.error || 'Failed to load Boggle.');

    setBoard(payload.puzzle?.board || []);
    setRoundSeconds(payload.puzzle?.roundSeconds || ROUND_SECONDS);
    setLeaderboard(payload.leaderboard || []);
    setTotalPlayed(payload.totalPlayed || 0);
    setServerGame(payload.game || null);
    setMessage('');
    setError('');
    setPath([]);
    setDrawing(false);

    const dictUrl = payload.dictionaryUrl || payload.puzzle?.dictionaryUrl;
    const dictVersion = payload.dictionaryVersion || payload.puzzle?.dictionaryVersion || 'v1';
    if (dictUrl) {
      await ensureDictionary(dictUrl, dictVersion);
      setDictionaryReady(true);
    }

    const alreadyDone = payload.game?.status === 'won' || payload.game?.status === 'lost';
    if (alreadyDone && !payload.practice) {
      setFinished(true);
      setFound(payload.game.words || []);
      setRemaining(0);
      setStartedAt(Date.now());
      submittedRef.current = true;
      return;
    }

    const local = payload.practice ? null : loadLocalGame(key);
    if (local?.startedAt) {
      setFound(local.found || []);
      setStartedAt(local.startedAt);
      const elapsed = Math.floor((Date.now() - local.startedAt) / 1000);
      const left = Math.max(0, (payload.puzzle?.roundSeconds || ROUND_SECONDS) - elapsed);
      setRemaining(left);
      setFinished(left <= 0);
      if (left <= 0) {
        const words = (local.found || []).map((row) => row.word);
        await submitResult({
          words,
          durationMs: (payload.puzzle?.roundSeconds || ROUND_SECONDS) * 1000,
          auto: true,
        });
      }
    } else {
      setFound([]);
      setStartedAt(null);
      setRemaining(payload.puzzle?.roundSeconds || ROUND_SECONDS);
      setFinished(false);
    }
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        await load(dayKey);
      } catch (err) {
        if (!cancelled) {
          setError(err.message || 'Failed to load Boggle.');
          setBoard([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [dayKey, isSandbox]);

  useEffect(() => {
    if (finished || !startedAt) return undefined;
    const id = setInterval(() => {
      const elapsed = Math.floor((Date.now() - startedAt) / 1000);
      const left = Math.max(0, roundSeconds - elapsed);
      setRemaining(left);
      if (left <= 0) {
        clearInterval(id);
        const words = found.map((row) => row.word);
        submitResult({ words, durationMs: roundSeconds * 1000, auto: true });
      }
    }, 250);
    return () => clearInterval(id);
  }, [finished, startedAt, roundSeconds, found, submitResult]);

  const onStartGame = () => {
    if (startedAt || finished) return;
    const now = Date.now();
    setStartedAt(now);
    setMessage('Go — find as many words as you can!');
    persist({ found: [], startedAt: now });
  };

  const commitPath = (nextPath) => {
    if (!revealed || finished || nextPath.length < 2) {
      pathRef.current = [];
      setPath([]);
      return;
    }
    const word = pathToWord(board, nextPath);
    const result = validateLocalWord(board, word, foundSet);
    pathRef.current = [];
    setPath([]);
    if (!result.ok) {
      setMessage(result.reason);
      return;
    }
    const nextFound = [...found, { word: result.word, points: result.points }];
    setFound(nextFound);
    setMessage(`+${result.points} · ${result.word.toUpperCase()}`);
    persist({ found: nextFound, startedAt });
  };

  const cellInPath = (r, c) => path.findIndex((p) => p.r === r && p.c === c);
  const gridRef = useRef(null);
  const drawingRef = useRef(false);
  const pathRef = useRef([]);

  useEffect(() => {
    pathRef.current = path;
  }, [path]);

  useEffect(() => {
    drawingRef.current = drawing;
  }, [drawing]);

  const extendPathTo = useCallback((r, c) => {
    if (!drawingRef.current || !revealed || finished) return;
    setPath((prev) => {
      if (!prev.length) {
        const next = [{ r, c }];
        pathRef.current = next;
        return next;
      }
      const last = prev[prev.length - 1];
      if (last.r === r && last.c === c) return prev;
      const existing = prev.findIndex((p) => p.r === r && p.c === c);
      let next;
      if (existing >= 0) next = prev.slice(0, existing + 1);
      else if (!areAdjacent(last, { r, c })) return prev;
      else next = [...prev, { r, c }];
      pathRef.current = next;
      return next;
    });
  }, [finished, revealed]);

  const cellFromPoint = useCallback((clientX, clientY) => {
    const el = document.elementFromPoint(clientX, clientY);
    if (!el || !gridRef.current?.contains(el)) return null;
    const cell = el.closest('[data-boggle-cell]');
    if (!cell || !gridRef.current.contains(cell)) return null;
    const r = Number(cell.getAttribute('data-r'));
    const c = Number(cell.getAttribute('data-c'));
    if (!Number.isInteger(r) || !Number.isInteger(c)) return null;
    return { r, c };
  }, []);

  const endDrawing = useCallback(() => {
    if (!drawingRef.current) return;
    drawingRef.current = false;
    setDrawing(false);
    commitPath(pathRef.current);
  }, [commitPath]);

  const onGridPointerDown = (event) => {
    if (!revealed || finished) return;
    event.preventDefault();
    const cell = cellFromPoint(event.clientX, event.clientY);
    if (!cell) return;
    drawingRef.current = true;
    setDrawing(true);
    const next = [cell];
    pathRef.current = next;
    setPath(next);
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // older browsers
    }
  };

  const onGridPointerMove = (event) => {
    if (!drawingRef.current) return;
    event.preventDefault();
    const cell = cellFromPoint(event.clientX, event.clientY);
    if (!cell) return;
    extendPathTo(cell.r, cell.c);
  };

  const onGridPointerUp = (event) => {
    event.preventDefault();
    try {
      if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
    } catch {
      // ignore
    }
    endDrawing();
  };

  const onSubmitClick = () => {
    if (!startedAt || finished || submitting) return;
    const durationMs = Math.min(roundSeconds * 1000, Math.max(0, Date.now() - startedAt));
    submitResult({ words: found.map((row) => row.word), durationMs });
  };

  const adminReset = async (scope) => {
    if (!isAdmin || resetting) return;
    const label = scope === 'day' ? 'clear today’s entire Boggle leaderboard' : 'reset your Boggle attempt';
    if (!window.confirm(`Admin: ${label}?`)) return;
    setResetting(true);
    setError('');
    try {
      const response = await fetch('/api/adminResetFunGame', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gameKey: 'boggle', scope, dayKey }),
      });
      const payload = (await readJsonResponse(response)) || {};
      if (!response.ok) throw new Error(payload.error || 'Reset failed.');
      clearLocalGame(dayKey);
      setMessage(scope === 'day'
        ? `Cleared ${payload.deleted || 0} Boggle result(s) for ${dayKey}.`
        : 'Your Boggle attempt was reset.');
      await load(dayKey);
    } catch (err) {
      setError(err.message || 'Reset failed.');
    } finally {
      setResetting(false);
    }
  };

  if (loading) {
    return (
      <p className="text-sm text-slate-400">
        {dictionaryReady ? 'Loading Boggle…' : 'Loading Boggle dictionary…'}
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <BoggleTutorialModal open={tutorialOpen} onClose={() => setTutorialOpen(false)} />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <button
          type="button"
          onClick={() => setTutorialOpen(true)}
          className="px-3 py-1.5 rounded-lg text-xs font-medium border border-amber-500/35 text-amber-100 hover:bg-amber-500/10"
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
      {isSandbox ? (
        <p className="text-xs text-amber-200/90">Admin sandbox · {dayKey} · not saved</p>
      ) : practice ? (
        <p className="text-xs text-amber-200/90">Practice day — scores aren’t saved.</p>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="text-sm text-slate-300">
          <span className="font-semibold text-indigo-200">
            {revealed ? formatClock(remaining) : formatClock(roundSeconds)}
          </span>
          <span className="text-slate-500 mx-2">·</span>
          Score <span className="font-semibold text-white">{serverGame?.score ?? liveScore}</span>
          <span className="text-slate-500 mx-2">·</span>
          {found.length} word{found.length === 1 ? '' : 's'}
        </div>
        <div className="flex flex-wrap gap-2">
          {!revealed && !finished ? (
            <button
              type="button"
              disabled={submitting || !dictionaryReady}
              onClick={onStartGame}
              className="px-3 py-1.5 rounded-lg text-xs font-medium bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white"
            >
              Start game
            </button>
          ) : null}
          {revealed && !finished ? (
            <button
              type="button"
              disabled={submitting}
              onClick={onSubmitClick}
              className="px-3 py-1.5 rounded-lg text-xs font-medium bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white"
            >
              {submitting ? 'Submitting…' : 'Submit early'}
            </button>
          ) : null}
        </div>
      </div>

      <div className="relative max-w-xs">
        <div
          ref={gridRef}
          className="select-none touch-none grid grid-cols-4 gap-2"
          style={{ touchAction: 'none' }}
          onPointerDown={onGridPointerDown}
          onPointerMove={onGridPointerMove}
          onPointerUp={onGridPointerUp}
          onPointerCancel={onGridPointerUp}
        >
          {board.map((row, r) => row.map((letter, c) => {
            const idx = cellInPath(r, c);
            const active = revealed && idx >= 0;
            return (
              <div
                key={`${r}-${c}`}
                role="gridcell"
                data-boggle-cell="1"
                data-r={r}
                data-c={c}
                className={`aspect-square rounded-xl border text-lg sm:text-xl font-bold transition-colors flex items-center justify-center ${
                  !revealed
                    ? 'bg-[#0b1220] border-[#1a2540] text-transparent'
                    : active
                      ? 'bg-indigo-500 border-indigo-300 text-white'
                      : 'bg-[#060e1a] border-[#1a2540] text-slate-100'
                }`}
                aria-label={revealed ? letter : 'Hidden letter'}
              >
                {revealed ? letter : '?'}
              </div>
            );
          }))}
        </div>
        {!revealed && !finished ? (
          <div className="absolute inset-0 rounded-xl bg-[#060e1a]/70 backdrop-blur-[1px] flex items-center justify-center pointer-events-none">
            <p className="text-xs font-medium text-slate-200 px-3 text-center">
              Letters hidden — click Start game
            </p>
          </div>
        ) : null}
      </div>

      <p className="text-[11px] text-slate-500">
        Drag adjacent letters · Qu = two letters · Open How to play for scoring.
      </p>

      {isAdmin ? (
        <div className="flex flex-wrap gap-2 pt-1">
          <button
            type="button"
            disabled={resetting}
            onClick={() => adminReset('me')}
            className="px-2.5 py-1 rounded-md text-[11px] border border-amber-500/40 text-amber-200 hover:bg-amber-500/10 disabled:opacity-50"
          >
            Admin: reset my attempt
          </button>
          <button
            type="button"
            disabled={resetting}
            onClick={() => adminReset('day')}
            className="px-2.5 py-1 rounded-md text-[11px] border border-rose-500/40 text-rose-200 hover:bg-rose-500/10 disabled:opacity-50"
          >
            Admin: clear today’s board
          </button>
        </div>
      ) : null}

      {message ? <p className="text-sm text-emerald-300">{message}</p> : null}
      {error ? <p className="text-sm text-rose-300">{error}</p> : null}

      {found.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {found.map((row) => (
            <span
              key={row.word}
              className="rounded-md border border-[#1a2540] bg-[#060e1a] px-2 py-0.5 text-[11px] text-slate-200 uppercase"
            >
              {row.word}
              <span className="text-slate-500 ml-1">{row.points}</span>
            </span>
          ))}
        </div>
      )}

      {!practice && (
        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">
            Today’s board · {totalPlayed} played
          </h3>
          {leaderboard.length === 0 ? (
            <p className="text-sm text-slate-500">No scores yet.</p>
          ) : (
            <ol className="space-y-1.5">
              {leaderboard.map((row) => (
                <FunLeaderboardRow
                  key={row.uid || row.rank}
                  row={row}
                  currentUserUid={currentUserUid}
                  resultText={row.resultLabel}
                  metaText={formatTime(row.completedAt)}
                />
              ))}
            </ol>
          )}
        </div>
      )}
    </div>
  );
}
