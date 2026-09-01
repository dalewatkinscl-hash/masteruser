import { useEffect, useMemo, useState } from 'react';
import FunDayPicker, { getLondonDayKey } from './FunDayPicker';
import FunLeaderboardRow from './FunLeaderboardRow';
import WordleTutorialModal, { hasSeenWordleTutorial } from './WordleTutorialModal';
import { useTheme } from '../context/ThemeContext';
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

const KEYBOARD_ROWS = [
  'qwertyuiop'.split(''),
  'asdfghjkl'.split(''),
  ['enter', ...'zxcvbnm'.split(''), 'back'],
];

function tileClass(state) {
  if (state === 'correct') return 'bg-emerald-600 border-emerald-500 text-white';
  if (state === 'present') return 'bg-amber-500 border-amber-400 text-white';
  if (state === 'absent') return 'bg-slate-700 border-slate-600 text-slate-200';
  if (state === 'filled') return 'bg-[#0b1220] border-indigo-400/70 text-white';
  return 'bg-[#060e1a] border-[#1a2540] text-slate-300';
}

function keyClass(state, isLight, isKawaii) {
  if (state === 'correct') return 'bg-emerald-600 text-white';
  if (state === 'present') return 'bg-amber-500 text-white';
  if (isKawaii && state === 'absent') return 'bg-pink-100 text-pink-700 border border-pink-200';
  if (state === 'absent') return isLight ? 'bg-slate-400 text-white' : 'bg-slate-700 text-slate-300';
  if (isKawaii) return 'bg-white text-pink-800 hover:bg-pink-50 border border-pink-200 shadow-sm';
  if (isLight) return 'bg-slate-200 text-slate-800 hover:bg-slate-300 border border-slate-300';
  return 'bg-[#1a2540] text-slate-100 hover:bg-[#243050]';
}
function bestKeyState(current, next) {
  const rank = { correct: 3, present: 2, absent: 1 };
  if (!current) return next;
  return (rank[next] || 0) >= (rank[current] || 0) ? next : current;
}

export default function WordlePanel({
  currentUserUid,
  onAchievements,
  isAdmin = false,
  sandbox = false,
  forcedDayKey = null,
}) {
  const { isLight, isKawaii } = useTheme();
  const todayKey = getLondonDayKey();
  const [dayKey, setDayKey] = useState(forcedDayKey || todayKey);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [game, setGame] = useState(null);
  const [leaderboard, setLeaderboard] = useState([]);
  const [totalSolved, setTotalSolved] = useState(0);
  const [totalFailed, setTotalFailed] = useState(0);
  const [currentGuess, setCurrentGuess] = useState('');
  const [tutorialOpen, setTutorialOpen] = useState(false);
  const isSandbox = Boolean(sandbox);
  const practice = isSandbox || dayKey !== todayKey;

  const finished = game?.status === 'won' || game?.status === 'lost';
  const maxGuesses = game?.maxGuesses || 6;

  useEffect(() => {
    if (forcedDayKey) setDayKey(forcedDayKey);
  }, [forcedDayKey]);

  useEffect(() => {
    if (!hasSeenWordleTutorial()) setTutorialOpen(true);
  }, []);

  const load = async (key) => {
    const params = new URLSearchParams();
    if (key && key !== todayKey) params.set('dayKey', key);
    if (isSandbox) params.set('sandbox', '1');
    const query = params.toString() ? `?${params.toString()}` : '';
    const response = await fetch(`/api/getDailyWordle${query}`, { credentials: 'include' });
    const payload = (await readJsonResponse(response)) || {};
    if (!response.ok) throw new Error(payload.error || 'Failed to load Wordle.');
    setGame(payload.game);
    setLeaderboard(payload.leaderboard || []);
    setTotalSolved(payload.totalSolved || 0);
    setTotalFailed(payload.totalFailed || 0);
    setCurrentGuess('');
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
          setError(err.message || 'Failed to load Wordle.');
          setGame(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [dayKey, isSandbox]);

  const letterStates = useMemo(() => {
    const map = {};
    (game?.guesses || []).forEach((guess, rowIndex) => {
      const evaluation = game?.evaluations?.[rowIndex] || [];
      guess.split('').forEach((letter, i) => {
        map[letter] = bestKeyState(map[letter], evaluation[i]);
      });
    });
    return map;
  }, [game]);

  const rows = useMemo(() => {
    const built = [];
    const guesses = game?.guesses || [];
    const evaluations = game?.evaluations || [];
    for (let r = 0; r < maxGuesses; r += 1) {
      if (guesses[r]) {
        built.push({
          letters: guesses[r].split(''),
          states: evaluations[r] || [],
        });
      } else if (!finished && r === guesses.length) {
        const letters = currentGuess.padEnd(5, ' ').split('');
        built.push({
          letters,
          states: letters.map((ch) => (ch.trim() ? 'filled' : 'empty')),
        });
      } else {
        built.push({ letters: ['', '', '', '', ''], states: ['empty', 'empty', 'empty', 'empty', 'empty'] });
      }
    }
    return built;
  }, [game, currentGuess, finished, maxGuesses]);

  const submitGuess = async (rawGuess) => {
    if (finished || submitting) return;
    const guess = String(rawGuess || '').trim().toLowerCase();
    if (guess.length !== 5) {
      setError('Enter a 5-letter word.');
      return;
    }

    setSubmitting(true);
    setError('');
    try {
      const response = await fetch('/api/submitWordleGuess', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          guess,
          ...(practice
            ? { dayKey, priorGuesses: game?.guesses || [], ...(isSandbox ? { sandbox: true } : {}) }
            : {}),
        }),
      });
      const payload = (await readJsonResponse(response)) || {};
      if (!response.ok) throw new Error(payload.error || 'Failed to submit guess.');
      setGame(payload.game);
      setLeaderboard(payload.leaderboard || []);
      setTotalSolved(payload.totalSolved || 0);
      setTotalFailed(payload.totalFailed || 0);
      setCurrentGuess('');
      if (Array.isArray(payload.achievements) && onAchievements) {
        onAchievements(payload.achievements);
      }
    } catch (err) {
      setError(err.message || 'Failed to submit guess.');
    } finally {
      setSubmitting(false);
    }
  };

  const onKey = (key) => {
    if (finished || submitting || loading) return;
    if (key === 'enter') {
      submitGuess(currentGuess);
      return;
    }
    if (key === 'back') {
      setCurrentGuess((prev) => prev.slice(0, -1));
      setError('');
      return;
    }
    if (/^[a-z]$/.test(key) && currentGuess.length < 5) {
      setCurrentGuess((prev) => `${prev}${key}`);
      setError('');
    }
  };

  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      const key = event.key;
      if (key === 'Enter') {
        event.preventDefault();
        onKey('enter');
      } else if (key === 'Backspace') {
        event.preventDefault();
        onKey('back');
      } else if (/^[a-zA-Z]$/.test(key)) {
        event.preventDefault();
        onKey(key.toLowerCase());
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  });

  if (loading) {
    return (
      <div className="bg-[#0b1220] border border-[#1a2540] rounded-xl p-8 text-center text-slate-400 text-sm max-w-3xl">
        Loading Wordle…
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <WordleTutorialModal open={tutorialOpen} onClose={() => setTutorialOpen(false)} />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-indigo-300/80">
          {isSandbox ? 'Admin sandbox · ' : practice ? 'Practice · ' : ''}Six tries · {game?.dayKey || dayKey}
          {game?.answer ? ` · answer: ${game.answer}` : ''}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setTutorialOpen(true)}
            className="px-3 py-1.5 rounded-lg text-xs font-medium border border-indigo-500/35 text-indigo-100 hover:bg-indigo-500/10"
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

      <div className="space-y-5">
          <div className="grid gap-1.5 justify-center">
            {rows.map((row, rowIndex) => (
              <div key={`row-${rowIndex}`} className="grid grid-cols-5 gap-1.5">
                {row.letters.map((letter, i) => (
                  <div
                    key={`cell-${rowIndex}-${i}`}
                    className={`w-12 h-12 sm:w-14 sm:h-14 border-2 rounded-md flex items-center justify-center text-lg font-bold uppercase ${tileClass(row.states[i])}`}
                  >
                    {letter.trim()}
                  </div>
                ))}
              </div>
            ))}
          </div>

          {game?.status === 'won' && (
            <p className="text-center text-sm text-emerald-300">
              Solved in {game.guessCount}/{maxGuesses}.
              {practice ? ' Practice only — not on the leaderboard.' : ' Nice one.'}
            </p>
          )}
          {game?.status === 'lost' && (
            <p className="text-center text-sm text-rose-300">
              Out of guesses. The word was <span className="font-semibold uppercase">{game.answer}</span>.
            </p>
          )}
          {error && <p className="text-center text-sm text-rose-300">{error}</p>}

          <div className="space-y-1.5">
            {KEYBOARD_ROWS.map((row) => (
              <div key={row.join('-')} className="flex justify-center gap-1.5">
                {row.map((key) => (
                  <button
                    key={key}
                    type="button"
                    disabled={finished || submitting}
                    onClick={() => onKey(key)}
                    className={`h-11 min-w-[2rem] px-2 rounded-md text-xs font-semibold uppercase disabled:opacity-60 ${
                      key === 'enter' || key === 'back'
                        ? `min-w-[3.2rem] ${
                            isKawaii
                              ? 'bg-pink-200 text-pink-900 border border-pink-300 hover:bg-pink-300 shadow-sm'
                              : isLight
                                ? 'bg-slate-300 text-slate-800 border border-slate-400'
                                : 'bg-[#243050] text-slate-100'
                          }`
                        : keyClass(letterStates[key], isLight, isKawaii)
                    }`}                  >
                    {key === 'back' ? '⌫' : key}
                  </button>
                ))}
              </div>
            ))}
          </div>
      </div>

      {!practice && (
        <div className="rounded-xl border border-[#1a2540] overflow-hidden">
          <div className="px-4 py-3 border-b border-[#1a2540] flex items-center justify-between gap-3">
            <h3 className="text-sm font-semibold text-indigo-200">Today’s leaderboard</h3>
            <span className="text-xs text-slate-500">{totalSolved} solved · {totalFailed} failed</span>
          </div>
          {!leaderboard.length ? (
            <p className="px-5 py-8 text-sm text-slate-500 text-center">Nobody has finished today’s Wordle yet.</p>
          ) : (
            <ol className="divide-y divide-[#1a2540]">
              {leaderboard.map((row) => (
                <FunLeaderboardRow
                  key={row.uid || row.rank}
                  row={row}
                  currentUserUid={currentUserUid}
                  resultText={row.resultLabel || `${row.guessCount}/6`}
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
