import { useCallback, useEffect, useRef, useState } from 'react';
import FunDayPicker, { getLondonDayKey } from './FunDayPicker';
import FunLeaderboardRow from './FunLeaderboardRow';

/**
 * Coin Flip Streak — call heads/tails; one miss ends the run.
 * Competitive Fun: 3 runs per London day. Sandbox: unlimited runs, best-ever in localStorage.
 */

const BEST_KEY = 'coin-flip-best-streak-v2';
const DAILY_MAX_RUNS = 3;
const HEADS_SRC = '/coin-flip/heads.png';
const TAILS_SRC = '/coin-flip/tails.png';

async function readJsonResponse(res) {
  const contentType = res.headers.get('content-type') || '';
  if (!contentType.includes('application/json')) return null;
  try {
    return await res.json();
  } catch {
    return null;
  }
}

function readBest() {
  try {
    return Math.max(0, Number(localStorage.getItem(BEST_KEY) || 0) || 0);
  } catch {
    return 0;
  }
}

function writeBest(n) {
  try {
    localStorage.setItem(BEST_KEY, String(Math.max(0, Math.floor(n))));
  } catch {
    // ignore
  }
}

function flipCoin() {
  return Math.random() < 0.5 ? 'heads' : 'tails';
}

function CoinFlipPlay({
  blurb,
  bestLabel = 'Best ever',
  initialBest = 0,
  persistLocalBest = false,
  onBestImproved = null,
  onRunComplete = null,
  maxRuns = null,
  initialRunsUsed = 0,
  disabled = false,
}) {
  const limited = Number.isFinite(maxRuns) && maxRuns > 0;
  const startUsed = Math.max(0, Math.floor(Number(initialRunsUsed) || 0));
  const startDone = limited && startUsed >= maxRuns;

  const [call, setCall] = useState(null);
  const [result, setResult] = useState(null);
  const [flipping, setFlipping] = useState(false);
  const [spin, setSpin] = useState(0);
  const [streak, setStreak] = useState(0);
  const [runOver, setRunOver] = useState(startDone);
  const [dayDone, setDayDone] = useState(startDone);
  const [runsUsed, setRunsUsed] = useState(startUsed);
  const [best, setBest] = useState(() => Math.max(0, Number(initialBest) || 0));
  const [history, setHistory] = useState([]);
  const [message, setMessage] = useState(() => (
    startDone
      ? `That’s your ${maxRuns} runs for today.`
      : limited
        ? `Run ${startUsed + 1} of ${maxRuns} — call heads or tails. One miss ends the run.`
        : 'Call heads or tails. One miss ends the run.'
  ));

  const streakRef = useRef(0);
  const bestRef = useRef(Math.max(0, Number(initialBest) || 0));
  const runsUsedRef = useRef(startUsed);
  const flipIdRef = useRef(0);
  const flippingRef = useRef(false);

  useEffect(() => {
    const next = Math.max(0, Number(initialBest) || 0);
    if (next > bestRef.current) {
      bestRef.current = next;
      setBest(next);
    }
  }, [initialBest]);

  useEffect(() => {
    const next = Math.max(0, Math.floor(Number(initialRunsUsed) || 0));
    if (next > runsUsedRef.current) {
      runsUsedRef.current = next;
      setRunsUsed(next);
      if (limited && next >= maxRuns) {
        setDayDone(true);
        setRunOver(true);
        setMessage(`That’s your ${maxRuns} runs for today.`);
      }
    }
  }, [initialRunsUsed, limited, maxRuns]);

  const startNewRun = useCallback(() => {
    if (flippingRef.current || disabled) return;
    if (limited && runsUsedRef.current >= maxRuns) return;
    flipIdRef.current += 1;
    streakRef.current = 0;
    setStreak(0);
    setRunOver(false);
    setCall(null);
    setResult(null);
    setFlipping(false);
    flippingRef.current = false;
    const runNumber = runsUsedRef.current + 1;
    setMessage(
      limited
        ? `Run ${runNumber} of ${maxRuns} — call heads or tails. One miss ends the run.`
        : 'Call heads or tails. One miss ends the run.',
    );
  }, [disabled, limited, maxRuns]);

  const play = useCallback((guess) => {
    if (disabled || dayDone || runOver || flippingRef.current) return;

    const flipId = flipIdRef.current + 1;
    flipIdRef.current = flipId;
    flippingRef.current = true;

    setCall(guess);
    setFlipping(true);
    setResult(null);
    setMessage('Flipping…');
    setSpin((s) => s + 720 + Math.floor(Math.random() * 360));

    window.setTimeout(() => {
      if (flipIdRef.current !== flipId) return;

      const outcome = flipCoin();
      const won = outcome === guess;

      flippingRef.current = false;
      setFlipping(false);
      setResult(outcome);

      if (won) {
        const nextStreak = streakRef.current + 1;
        streakRef.current = nextStreak;
        setStreak(nextStreak);

        if (nextStreak > bestRef.current) {
          bestRef.current = nextStreak;
          if (persistLocalBest) writeBest(nextStreak);
          setBest(nextStreak);
          if (typeof onBestImproved === 'function') onBestImproved(nextStreak);
        }

        setMessage(
          nextStreak === 1
            ? 'Nice! Streak starts at 1.'
            : `Correct! Streak ${nextStreak}.`,
        );
      } else {
        streakRef.current = 0;
        setStreak(0);

        const nextRuns = runsUsedRef.current + 1;
        runsUsedRef.current = nextRuns;
        setRunsUsed(nextRuns);
        setRunOver(true);

        const finishedDay = limited && nextRuns >= maxRuns;
        if (finishedDay) setDayDone(true);

        if (typeof onRunComplete === 'function') {
          onRunComplete(bestRef.current);
        }

        if (finishedDay) {
          setMessage(`Wrong — it was ${outcome}. That’s your ${maxRuns} runs for today.`);
        } else if (limited) {
          const left = maxRuns - nextRuns;
          setMessage(
            `Wrong — it was ${outcome}. Run over — ${left} run${left === 1 ? '' : 's'} left.`,
          );
        } else {
          setMessage(`Wrong — it was ${outcome}. Run over — start a new run.`);
        }
      }

      setHistory((prev) => [
        { guess, outcome, won, at: Date.now() },
        ...prev,
      ].slice(0, 12));
    }, 750);
  }, [disabled, dayDone, runOver, limited, maxRuns, persistLocalBest, onBestImproved, onRunComplete]);

  const face = result || 'heads';
  const won = Boolean(result && call && result === call);
  const faceSrc = face === 'heads' ? HEADS_SRC : TAILS_SRC;
  const canStartAnother = runOver && !dayDone && (!limited || runsUsed < maxRuns);
  const runsLeft = limited ? Math.max(0, maxRuns - runsUsed) : null;

  return (
    <div className="space-y-4">
      {blurb ? (
        <div className="rounded-xl border border-[#1a2540] p-4 space-y-2">
          {blurb}
        </div>
      ) : null}

      <div className="rounded-xl border border-[#1a2540] bg-[#060e1a] p-6 flex flex-col items-center gap-5">
        <div className="flex flex-wrap gap-6 justify-center text-center">
          <div>
            <p className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">Streak</p>
            <p className="text-3xl font-black tabular-nums text-amber-200">{streak}</p>
          </div>
          {limited ? (
            <div>
              <p className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">Runs</p>
              <p className="text-3xl font-black tabular-nums text-sky-200">
                {Math.min(runsUsed + (runOver || dayDone ? 0 : 1), maxRuns)}
                <span className="text-lg text-slate-500 font-semibold">/{maxRuns}</span>
              </p>
            </div>
          ) : null}
          <div>
            <p className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">{bestLabel}</p>
            <p className="text-3xl font-black tabular-nums text-emerald-200">{best}</p>
          </div>
        </div>

        <div className="relative w-36 h-36" style={{ perspective: '800px' }} aria-hidden>
          <div
            className="w-full h-full transition-transform duration-700 ease-out"
            style={{
              transformStyle: 'preserve-3d',
              transform: `rotateY(${spin}deg)`,
            }}
          >
            <img
              src={HEADS_SRC}
              alt=""
              className="absolute inset-0 w-full h-full object-cover rounded-full border-2 border-amber-500/40 shadow-[0_0_28px_rgba(245,158,11,0.35)]"
              style={{ backfaceVisibility: 'hidden' }}
              draggable={false}
            />
            <img
              src={TAILS_SRC}
              alt=""
              className="absolute inset-0 w-full h-full object-cover rounded-full border-2 border-slate-400/40 shadow-[0_0_28px_rgba(148,163,184,0.35)]"
              style={{
                backfaceVisibility: 'hidden',
                transform: 'rotateY(180deg)',
              }}
              draggable={false}
            />
          </div>
          {!flipping && result ? (
            <img
              src={faceSrc}
              alt={face}
              className="absolute inset-0 w-full h-full object-cover rounded-full border-2 border-amber-500/40 pointer-events-none"
              draggable={false}
            />
          ) : null}
        </div>

        <div className="flex gap-3 items-center text-xs text-slate-500">
          <span className="inline-flex items-center gap-1.5">
            <img src={HEADS_SRC} alt="" className="w-6 h-6 rounded-full object-cover border border-amber-500/40" />
            Heads
          </span>
          <span className="inline-flex items-center gap-1.5">
            <img src={TAILS_SRC} alt="" className="w-6 h-6 rounded-full object-cover border border-slate-400/40" />
            Tails
          </span>
        </div>

        <p
          className={`text-sm font-medium text-center max-w-md ${
            dayDone
              ? 'text-slate-300'
              : result
                ? (won ? 'text-emerald-300' : 'text-rose-300')
                : 'text-slate-300'
          }`}
        >
          {message}
        </p>

        {dayDone ? (
          <p className="text-xs text-slate-500 text-center">
            Come back next weekday for 3 fresh runs.
            {best > 0 ? ` Best today: ${best}.` : ''}
          </p>
        ) : canStartAnother ? (
          <button
            type="button"
            onClick={startNewRun}
            disabled={disabled}
            className="px-4 py-2.5 rounded-lg text-sm font-semibold bg-indigo-600 text-white hover:bg-indigo-500 disabled:opacity-40"
          >
            {limited
              ? `Next run (${runsLeft} left)`
              : 'New run'}
          </button>
        ) : (
          <div className="flex flex-wrap gap-3 justify-center">
            <button
              type="button"
              disabled={disabled || flipping}
              onClick={() => play('heads')}
              className="min-w-[7rem] px-4 py-2.5 rounded-lg text-sm font-semibold border border-amber-500/40 bg-amber-500/15 text-amber-100 hover:bg-amber-500/25 disabled:opacity-40 inline-flex items-center justify-center gap-2"
            >
              <img src={HEADS_SRC} alt="" className="w-7 h-7 rounded-full object-cover" />
              Heads
            </button>
            <button
              type="button"
              disabled={disabled || flipping}
              onClick={() => play('tails')}
              className="min-w-[7rem] px-4 py-2.5 rounded-lg text-sm font-semibold border border-slate-400/40 bg-slate-400/10 text-slate-100 hover:bg-slate-400/20 disabled:opacity-40 inline-flex items-center justify-center gap-2"
            >
              <img src={TAILS_SRC} alt="" className="w-7 h-7 rounded-full object-cover" />
              Tails
            </button>
          </div>
        )}
      </div>

      {history.length ? (
        <div className="rounded-xl border border-[#1a2540] overflow-hidden">
          <div className="px-4 py-2.5 border-b border-[#1a2540] text-xs font-semibold uppercase tracking-wider text-slate-500">
            Recent flips
          </div>
          <ul className="divide-y divide-[#1a2540]">
            {history.map((row) => (
              <li
                key={row.at}
                className="px-4 py-2 text-sm flex justify-between gap-3 items-center"
              >
                <span className="text-slate-400 inline-flex items-center gap-2">
                  Called{' '}
                  <img
                    src={row.guess === 'heads' ? HEADS_SRC : TAILS_SRC}
                    alt={row.guess}
                    className="w-5 h-5 rounded-full object-cover"
                  />
                  {' → '}
                  <img
                    src={row.outcome === 'heads' ? HEADS_SRC : TAILS_SRC}
                    alt={row.outcome}
                    className="w-5 h-5 rounded-full object-cover"
                  />
                </span>
                <span className={row.won ? 'text-emerald-300' : 'text-rose-300'}>
                  {row.won ? 'Hit' : 'Miss'}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

export function CoinFlipSandbox() {
  const [best] = useState(() => readBest());

  return (
    <CoinFlipPlay
      initialBest={best}
      persistLocalBest
      bestLabel="Best ever"
      blurb={(
        <p className="text-sm text-slate-300">
          <span className="text-white font-medium">Coin Flip Streak</span>
          {' '}— Dev sandbox. Unlimited runs; one miss ends the run.
          Best ever is saved in this browser only.
        </p>
      )}
    />
  );
}

export function CoinFlipDailyPanel({ currentUserUid = null, onAchievements = null, isAdmin = false }) {
  const todayKey = getLondonDayKey();
  const [dayKey, setDayKey] = useState(todayKey);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [game, setGame] = useState(null);
  const [leaderboard, setLeaderboard] = useState([]);
  const practice = dayKey !== todayKey;
  const submittingRef = useRef(false);

  const applyPayload = useCallback((payload) => {
    if (payload.game) setGame(payload.game);
    if (Array.isArray(payload.leaderboard)) setLeaderboard(payload.leaderboard);
    if (Array.isArray(payload.achievements) && onAchievements) {
      onAchievements(payload.achievements);
    }
  }, [onAchievements]);

  const load = useCallback(async (key) => {
    const params = new URLSearchParams();
    if (key && key !== todayKey) params.set('dayKey', key);
    const query = params.toString() ? `?${params}` : '';
    const response = await fetch(`/api/getDailyCoinFlip${query}`, { credentials: 'include' });
    const payload = (await readJsonResponse(response)) || {};
    if (!response.ok) throw new Error(payload.error || 'Failed to load Coin Flip.');
    if (payload.weekend || payload.sittingOut) {
      setGame(null);
      setLeaderboard([]);
      setError(payload.message || 'Coin Flip isn’t in today’s Fun rotation.');
      return;
    }
    setError('');
    setGame(payload.game || null);
    setLeaderboard(payload.leaderboard || []);
  }, [todayKey]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        await load(dayKey);
      } catch (err) {
        if (!cancelled) {
          setError(err.message || 'Failed to load Coin Flip.');
          setGame(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [dayKey, load]);

  const postResult = useCallback(async ({ bestStreak, runComplete = false }) => {
    if (practice || submittingRef.current) return;
    const n = Math.max(0, Math.floor(Number(bestStreak) || 0));
    if (!runComplete && n < 1) return;
    if (!runComplete && n <= (game?.bestStreak || 0)) return;

    try {
      submittingRef.current = true;
      setSubmitting(true);
      const response = await fetch('/api/submitCoinFlipResult', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bestStreak: n,
          runComplete: Boolean(runComplete),
          dayKey: dayKey !== todayKey ? dayKey : undefined,
        }),
      });
      const payload = (await readJsonResponse(response)) || {};
      if (!response.ok) throw new Error(payload.error || 'Failed to submit.');
      applyPayload(payload);
      setError('');
    } catch (err) {
      setError(err.message || 'Could not save your progress.');
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  }, [practice, game?.bestStreak, dayKey, todayKey, applyPayload]);

  const submitBest = useCallback((bestStreak) => {
    postResult({ bestStreak, runComplete: false });
  }, [postResult]);

  const completeRun = useCallback((bestStreak) => {
    postResult({ bestStreak, runComplete: true });
  }, [postResult]);

  if (loading) return <p className="text-sm text-slate-400">Loading Coin Flip…</p>;
  if (error && !game) return <p className="text-sm text-rose-300">{error}</p>;

  const maxRuns = game?.maxRuns || DAILY_MAX_RUNS;
  const runsUsed = game?.runsUsed || 0;
  const dayComplete = Boolean(game?.dayComplete) || runsUsed >= maxRuns;

  return (
    <div className="space-y-3">
      <FunDayPicker
        dayKey={dayKey}
        todayKey={todayKey}
        onChange={setDayKey}
        allowFuture={Boolean(isAdmin)}
      />

      {practice ? (
        <p className="text-xs text-amber-200/90 border border-amber-500/30 bg-amber-500/10 rounded-md px-3 py-2">
          Practice day — streaks won’t count on the leaderboard (still limited to {maxRuns} runs).
        </p>
      ) : (
        <p className="text-sm text-slate-400">
          {maxRuns} runs today — one miss ends a run. Best streak auto-submits.
          {submitting ? ' · Saving…' : ''}
        </p>
      )}

      {error ? <p className="text-sm text-rose-300">{error}</p> : null}

      <CoinFlipPlay
        key={`${dayKey}-${runsUsed >= maxRuns ? 'done' : 'play'}`}
        initialBest={game?.bestStreak || 0}
        initialRunsUsed={runsUsed}
        maxRuns={maxRuns}
        bestLabel="Best today"
        onBestImproved={practice || dayComplete ? null : submitBest}
        onRunComplete={practice ? null : completeRun}
        blurb={(
          <p className="text-sm text-slate-300">
            <span className="text-white font-medium">Coin Flip Streak</span>
            {' '}— {maxRuns} runs per London day. One miss ends the run. Highest streak wins.
          </p>
        )}
      />

      {!practice && leaderboard.length ? (
        <div className="rounded-xl border border-[#1a2540] overflow-hidden">
          <div className="px-4 py-2.5 border-b border-[#1a2540] text-xs font-semibold uppercase tracking-wider text-slate-500">
            Today’s leaderboard
          </div>
          <ul className="divide-y divide-[#1a2540]">
            {leaderboard.slice(0, 15).map((row) => (
              <FunLeaderboardRow
                key={row.uid || row.rank}
                row={row}
                currentUserUid={currentUserUid}
                resultText={row.resultLabel || `streak ${row.bestStreak || 0}`}
              />
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

export default CoinFlipSandbox;
