import { useCallback, useEffect, useMemo, useState } from 'react';
import FunDayPicker, { getLondonDayKey } from './FunDayPicker';
import FunLeaderboardRow from './FunLeaderboardRow';
import {
  GROUP_SIZE,
  MAX_MISTAKES,
  clearLocalGame,
  formatDuration,
  loadLocalGame,
  matchGroup,
  saveLocalGame,
} from '../lib/connections';

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

function durationFromStartedAt(startedAt) {
  if (!startedAt) return 0;
  const startedMs = new Date(startedAt).getTime();
  if (!Number.isFinite(startedMs)) return 0;
  return Math.max(0, Date.now() - startedMs);
}

function formatLiveDuration(startedAt) {
  if (!startedAt) return '0:00';
  const totalSec = Math.floor(durationFromStartedAt(startedAt) / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

export default function ConnectionsPanel({
  currentUserUid,
  onAchievements,
  isAdmin = false,
  sandbox = false,
  adminSandbox = false,
  forcedDayKey = null,
}) {
  const todayKey = getLondonDayKey();
  const [dayKey, setDayKey] = useState(forcedDayKey || todayKey);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [words, setWords] = useState([]);
  const [groupMeta, setGroupMeta] = useState([]);
  const [selected, setSelected] = useState([]);
  const [solved, setSolved] = useState([]);
  const [guesses, setGuesses] = useState([]);
  const [mistakes, setMistakes] = useState(0);
  const [startedAt, setStartedAt] = useState(null);
  const [durationMs, setDurationMs] = useState(null);
  const [finished, setFinished] = useState(false);
  const [solution, setSolution] = useState(null);
  const [leaderboard, setLeaderboard] = useState([]);
  const [totalPlayed, setTotalPlayed] = useState(0);
  const [tick, setTick] = useState(0);
  const isSandbox = Boolean(sandbox || adminSandbox);
  const practice = isSandbox || dayKey !== todayKey;
  const revealed = Boolean(startedAt) || finished;

  useEffect(() => {
    if (forcedDayKey) setDayKey(forcedDayKey);
  }, [forcedDayKey]);

  const solvedWordSet = useMemo(
    () => new Set(solved.flatMap((g) => g.words || [])),
    [solved],
  );
  const remainingWords = useMemo(
    () => words.filter((w) => !solvedWordSet.has(w)),
    [words, solvedWordSet],
  );

  const persist = useCallback((state) => {
    if (practice || isSandbox) return;
    saveLocalGame(dayKey, state);
  }, [dayKey, practice, isSandbox]);

  const syncFinish = useCallback(async (nextGuesses, nextSolved, nextMistakes, startIso) => {
    setSubmitting(true);
    setError('');
    try {
      const start = startIso || startedAt || new Date().toISOString();
      const duration = durationFromStartedAt(start);
      setStartedAt(start);
      setDurationMs(duration);
      if (practice) {
        setFinished(true);
        setMessage(isSandbox ? 'Sandbox run — not saved to live results.' : 'Practice run — not saved.');
        return;
      }
      const response = await fetch('/api/submitConnectionsResult', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          guesses: nextGuesses,
          startedAt: start,
          durationMs: duration,
        }),
      });
      const payload = (await readJsonResponse(response)) || {};
      if (!response.ok) throw new Error(payload.error || 'Failed to submit Connections.');
      setSolved(payload.game?.solved || nextSolved);
      setMistakes(payload.game?.mistakes ?? nextMistakes);
      setSolution(payload.game?.solution || null);
      if (payload.game?.durationMs != null) setDurationMs(payload.game.durationMs);
      if (payload.game?.startedAt) setStartedAt(payload.game.startedAt);
      setFinished(true);
      setLeaderboard(payload.leaderboard || []);
      setTotalPlayed(payload.totalPlayed || 0);
      clearLocalGame(dayKey);
      if (Array.isArray(payload.achievements) && onAchievements) onAchievements(payload.achievements);
    } catch (err) {
      setError(err.message || 'Failed to submit.');
    } finally {
      setSubmitting(false);
    }
  }, [dayKey, onAchievements, practice, isSandbox, startedAt]);

  const load = async (key) => {
    const params = new URLSearchParams();
    if (key && key !== todayKey) params.set('dayKey', key);
    if (isSandbox) params.set('sandbox', '1');
    const query = params.toString() ? `?${params.toString()}` : '';
    const response = await fetch(`/api/getDailyConnections${query}`, { credentials: 'include' });
    const payload = (await readJsonResponse(response)) || {};
    if (!response.ok) throw new Error(payload.error || 'Failed to load Connections.');

    if (payload.weekend) {
      setWords([]);
      setGroupMeta([]);
      setLeaderboard([]);
      setTotalPlayed(0);
      setSelected([]);
      setSolved([]);
      setGuesses([]);
      setMistakes(0);
      setStartedAt(null);
      setDurationMs(null);
      setSolution(null);
      setFinished(false);
      setMessage(payload.message || 'Fun games come back Monday.');
      return;
    }

    setWords(payload.puzzle?.words || []);
    setGroupMeta(payload.puzzle?.groups || []);
    setLeaderboard(payload.leaderboard || []);
    setTotalPlayed(payload.totalPlayed || 0);
    setSelected([]);
    setMessage('');
    setError('');

    const alreadyDone = payload.game?.status === 'won' || payload.game?.status === 'lost';
    if (alreadyDone && !payload.practice) {
      setSolved(payload.game.solved || []);
      setMistakes(payload.game.mistakes || 0);
      setSolution(payload.game.solution || null);
      setStartedAt(payload.game.startedAt || null);
      setDurationMs(payload.game.durationMs ?? null);
      setGuesses([]);
      setFinished(true);
      return;
    }

    const local = payload.practice || isSandbox ? null : loadLocalGame(key);
    if (local) {
      setSolved(local.solved || []);
      setGuesses(local.guesses || []);
      setMistakes(local.mistakes || 0);
      setStartedAt(local.startedAt || null);
      setDurationMs(local.durationMs ?? null);
      const done = (local.solved || []).length >= 4 || (local.mistakes || 0) >= MAX_MISTAKES;
      setFinished(done);
      if (done) {
        await syncFinish(local.guesses || [], local.solved || [], local.mistakes || 0, local.startedAt || null);
      }
    } else {
      setSolved([]);
      setGuesses([]);
      setMistakes(0);
      setStartedAt(null);
      setDurationMs(null);
      setSolution(null);
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
          setError(err.message || 'Failed to load Connections.');
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
    if (!revealed || finished || !startedAt) return undefined;
    const id = window.setInterval(() => setTick((n) => n + 1), 1000);
    return () => window.clearInterval(id);
  }, [revealed, finished, startedAt]);

  const onRevealWords = () => {
    if (startedAt || finished) return;
    const now = new Date().toISOString();
    setStartedAt(now);
    setMessage('Words revealed — timer running.');
    persist({
      solved: [],
      guesses: [],
      mistakes: 0,
      startedAt: now,
    });
  };

  const toggleWord = (word) => {
    if (!revealed || finished || submitting) return;
    setSelected((prev) => {
      if (prev.includes(word)) return prev.filter((w) => w !== word);
      if (prev.length >= GROUP_SIZE) return prev;
      return [...prev, word];
    });
    persist({
      solved,
      guesses,
      mistakes,
      startedAt,
    });
  };

  const onDeselect = () => setSelected([]);

  const onSubmitGuess = async () => {
    if (!revealed || selected.length !== GROUP_SIZE || finished || submitting) return;
    setMessage('');
    const start = startedAt || new Date().toISOString();
    if (!startedAt) setStartedAt(start);
    const matched = await matchGroup(groupMeta, selected);
    const nextGuesses = [...guesses, [...selected]];

    if (matched) {
      const already = solved.some((g) => g.id === matched.id);
      if (already) {
        setMessage('Already found that group.');
        setSelected([]);
        return;
      }
      const revealedGroup = {
        id: matched.id,
        title: matched.title || matched.label || 'Connected!',
        words: [...selected].sort(),
        difficulty: matched.difficulty,
        difficultyKey: matched.difficultyKey,
        color: matched.color,
        label: matched.label,
      };
      const nextSolved = [...solved, revealedGroup];
      const nextMistakes = mistakes;
      setSolved(nextSolved);
      setGuesses(nextGuesses);
      setSelected([]);
      setMessage('Nice — group found.');
      persist({ solved: nextSolved, guesses: nextGuesses, mistakes: nextMistakes, startedAt: start });
      if (nextSolved.length >= 4) {
        await syncFinish(nextGuesses, nextSolved, nextMistakes, start);
      }
      return;
    }

    const nextMistakes = mistakes + 1;
    setMistakes(nextMistakes);
    setGuesses(nextGuesses);
    setSelected([]);
    setMessage('One away… or not. Mistake counted.');
    persist({ solved, guesses: nextGuesses, mistakes: nextMistakes, startedAt: start });
    if (nextMistakes >= MAX_MISTAKES) {
      await syncFinish(nextGuesses, solved, nextMistakes, start);
    }
  };

  if (loading) return <p className="text-sm text-slate-400">Loading Connections…</p>;

  const displayGroups = finished && solution?.length ? solution : solved;
  void tick;

  return (
    <div className="space-y-4">
      {!isSandbox ? (
        <FunDayPicker dayKey={dayKey} todayKey={todayKey} onChange={setDayKey} allowFuture={isAdmin} />
      ) : (
        <p className="text-xs text-amber-200/90 border border-amber-500/30 bg-amber-500/10 rounded-md px-2 py-1 inline-block">
          Admin sandbox — results are not saved to live leaderboards.
        </p>
      )}
      {practice && !isSandbox ? (
        <p className="text-xs text-amber-200/90">Practice day — results aren’t saved.</p>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-slate-300">
        <span>
          Mistakes{' '}
          <span className="font-semibold text-white">{mistakes}/{MAX_MISTAKES}</span>
        </span>
        {revealed && !finished ? (
          <span className="font-mono text-indigo-200">{formatLiveDuration(startedAt)}</span>
        ) : (
          <span className="text-slate-500">
            {revealed ? 'Select 4 related words' : 'Reveal words to start the timer'}
          </span>
        )}
      </div>

      <div className="space-y-2">
        {displayGroups.map((group) => (
          <div
            key={group.id || group.title}
            className="rounded-xl px-3 py-3 text-center"
            style={{ backgroundColor: `${group.color || '#6366f1'}33`, border: `1px solid ${group.color || '#6366f1'}66` }}
          >
            <p className="text-xs font-bold uppercase tracking-wide text-base-content">
              {group.title}
            </p>
            <p className="text-sm text-base-content/80 mt-1">{(group.words || []).join(', ')}</p>
          </div>
        ))}
      </div>

      {!finished && (
        <>
          {!revealed ? (
            <div className="space-y-3">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {(words.length ? words : Array.from({ length: 16 })).map((word, index) => (
                  <div
                    key={typeof word === 'string' ? word : `hidden-${index}`}
                    className="rounded-xl border border-[#1a2540] bg-[#060e1a] px-2 py-3 text-sm font-semibold uppercase tracking-wide text-slate-600 select-none"
                    aria-hidden="true"
                  >
                    ••••
                  </div>
                ))}
              </div>
              <button
                type="button"
                onClick={onRevealWords}
                className="px-4 py-2 rounded-lg text-sm font-medium bg-indigo-600 hover:bg-indigo-500 text-white"
              >
                Reveal words
              </button>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {remainingWords.map((word) => {
                  const isOn = selected.includes(word);
                  return (
                    <button
                      key={word}
                      type="button"
                      onClick={() => toggleWord(word)}
                      className={`rounded-xl border px-2 py-3 text-sm font-semibold uppercase tracking-wide transition-colors ${
                        isOn
                          ? 'bg-indigo-500 border-indigo-300 text-white'
                          : 'bg-[#060e1a] border-[#1a2540] text-slate-100 hover:border-indigo-400/40'
                      }`}
                    >
                      {word}
                    </button>
                  );
                })}
              </div>

              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={selected.length !== GROUP_SIZE || submitting}
                  onClick={onSubmitGuess}
                  className="px-3 py-1.5 rounded-lg text-xs font-medium bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white"
                >
                  {submitting ? 'Saving…' : 'Submit'}
                </button>
                <button
                  type="button"
                  disabled={!selected.length || submitting}
                  onClick={onDeselect}
                  className="px-3 py-1.5 rounded-lg text-xs font-medium border border-[#1a2540] text-slate-300 hover:bg-white/[0.03] disabled:opacity-50"
                >
                  Deselect
                </button>
              </div>
            </>
          )}
        </>
      )}

      {finished && (
        <p className={`text-sm ${solution || solved.length >= 4 ? 'text-emerald-300' : 'text-rose-300'}`}>
          {solved.length >= 4 || (solution && mistakes < MAX_MISTAKES)
            ? `Puzzle complete${durationMs != null ? ` in ${formatDuration(durationMs)}` : ''}.`
            : 'Out of mistakes — better luck next time.'}
        </p>
      )}

      {message ? <p className="text-sm text-slate-300">{message}</p> : null}
      {error ? <p className="text-sm text-rose-300">{error}</p> : null}

      {isAdmin && !isSandbox ? (
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={resetting}
            onClick={async () => {
              if (!window.confirm('Admin: reset your Connections attempt?')) return;
              setResetting(true);
              try {
                const response = await fetch('/api/adminResetFunGame', {
                  method: 'POST',
                  credentials: 'include',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ gameKey: 'connections', scope: 'me', dayKey }),
                });
                const payload = (await readJsonResponse(response)) || {};
                if (!response.ok) throw new Error(payload.error || 'Reset failed.');
                clearLocalGame(dayKey);
                setMessage('Your Connections attempt was reset.');
                await load(dayKey);
              } catch (err) {
                setError(err.message || 'Reset failed.');
              } finally {
                setResetting(false);
              }
            }}
            className="px-2.5 py-1 rounded-md text-[11px] border border-amber-500/40 text-amber-200 hover:bg-amber-500/10 disabled:opacity-50"
          >
            Admin: reset my attempt
          </button>
          <button
            type="button"
            disabled={resetting}
            onClick={async () => {
              if (!window.confirm('Admin: clear today’s entire Connections leaderboard?')) return;
              setResetting(true);
              try {
                const response = await fetch('/api/adminResetFunGame', {
                  method: 'POST',
                  credentials: 'include',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ gameKey: 'connections', scope: 'day', dayKey }),
                });
                const payload = (await readJsonResponse(response)) || {};
                if (!response.ok) throw new Error(payload.error || 'Reset failed.');
                clearLocalGame(dayKey);
                setMessage(`Cleared ${payload.deleted || 0} Connections result(s).`);
                await load(dayKey);
              } catch (err) {
                setError(err.message || 'Reset failed.');
              } finally {
                setResetting(false);
              }
            }}
            className="px-2.5 py-1 rounded-md text-[11px] border border-rose-500/40 text-rose-200 hover:bg-rose-500/10 disabled:opacity-50"
          >
            Admin: clear today
          </button>
        </div>
      ) : null}

      {!practice && !isSandbox && (
        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">
            Today · {totalPlayed} played
          </h3>
          {leaderboard.length === 0 ? (
            <p className="text-sm text-slate-500">No results yet.</p>
          ) : (
            <ol className="space-y-1.5">
              {leaderboard.map((row) => (
                <FunLeaderboardRow
                  key={row.uid || row.rank}
                  row={row}
                  currentUserUid={currentUserUid}
                  resultText={row.resultLabel}
                  metaText={
                    row.durationLabel
                    || (row.durationMs != null ? formatDuration(row.durationMs) : formatTime(row.completedAt))
                  }
                />
              ))}
            </ol>
          )}
        </div>
      )}
    </div>
  );
}
