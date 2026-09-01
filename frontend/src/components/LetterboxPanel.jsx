import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import FunDayPicker, { getLondonDayKey } from './FunDayPicker';
import FunLeaderboardRow from './FunLeaderboardRow';
import LetterboxTutorialModal, {
  hasSeenLetterboxTutorial,
} from './LetterboxTutorialModal';
import {
  ensureDictionary,
  isDictionaryReady,
  isDictionaryWord,
} from '../lib/boggle';
import {
  LETTERBOX_LIVE_FROM,
  LETTERBOX_PRACTICE_LEVELS,
  LETTERBOX_SEED_PUZZLES,
  MIN_WORD_LENGTH,
  boardLetterSet,
  canAppendLetter,
  coversAllLetters,
  filterDraftInput,
  getLocalPuzzleForDay,
  getPuzzleById,
  nextRequiredLetter,
  normalizeWord,
  usedLettersFromWords,
  wordValidOnSides,
} from '../lib/letterbox';

async function readJsonResponse(res) {
  const contentType = res.headers.get('content-type') || '';
  if (!contentType.includes('application/json')) return null;
  try {
    return await res.json();
  } catch {
    return null;
  }
}

/** Positions for 3 letters along each edge of a 0–100 square (NYT-style). */
function letterLayout(sides) {
  const normalized = (sides || []).map((s) => String(s || '').toUpperCase());
  const positions = [];
  const byLetter = new Map();

  const place = (sideIndex, ch, indexOnSide, x, y) => {
    const entry = {
      id: `${sideIndex}-${indexOnSide}-${ch}`,
      sideIndex,
      indexOnSide,
      ch,
      x,
      y,
    };
    positions.push(entry);
    byLetter.set(ch, entry);
  };

  // Top: left → right
  (normalized[0] || '').split('').forEach((ch, i) => place(0, ch, i, 25 + i * 25, 0));
  // Right: top → bottom
  (normalized[1] || '').split('').forEach((ch, i) => place(1, ch, i, 100, 25 + i * 25));
  // Bottom: left → right
  (normalized[2] || '').split('').forEach((ch, i) => place(2, ch, i, 25 + i * 25, 100));
  // Left: top → bottom
  (normalized[3] || '').split('').forEach((ch, i) => place(3, ch, i, 0, 25 + i * 25));

  return { positions, byLetter };
}

function pathPointsForWord(word, byLetter) {
  const w = normalizeWord(word);
  const pts = [];
  for (const ch of w) {
    const pos = byLetter.get(ch);
    if (!pos) return null;
    pts.push(pos);
  }
  return pts;
}

function LetterSquare({
  sides,
  usedLetters,
  currentWord,
  committedWords = [],
  requiredStart,
  onPick,
  onPopLast,
  disabled,
}) {
  const used = usedLetters instanceof Set ? usedLetters : new Set(usedLetters || []);
  const draft = normalizeWord(currentWord);
  const lastDraftLetter = draft.slice(-1) || null;
  const { positions, byLetter } = useMemo(() => letterLayout(sides), [sides]);

  const committedPaths = useMemo(() => (
    (committedWords || [])
      .map((word) => pathPointsForWord(word, byLetter))
      .filter((pts) => pts && pts.length >= 2)
  ), [committedWords, byLetter]);

  const draftPath = useMemo(() => pathPointsForWord(draft, byLetter), [draft, byLetter]);

  const selectable = useMemo(() => {
    const map = new Map();
    for (const pos of positions) {
      map.set(pos.ch, canAppendLetter(sides, draft, pos.ch, requiredStart).ok);
    }
    return map;
  }, [positions, sides, draft, requiredStart]);

  const circleClass = (ch) => {
    const inDraft = draft.includes(ch);
    const isUsed = used.has(ch);
    const canPick = selectable.get(ch);
    const isLast = lastDraftLetter === ch;
    if (isLast) return { fill: '#6366f1', stroke: '#c7d2fe', text: '#fff', muted: false };
    if (inDraft) return { fill: '#6366f1', stroke: '#a5b4fc', text: '#fff', muted: false };
    if (!canPick && !disabled) {
      return { fill: '#0b1220', stroke: '#1e293b', text: '#475569', muted: true };
    }
    if (isUsed) return { fill: '#059669', stroke: '#6ee7b7', text: '#ecfdf5', muted: false };
    if (requiredStart && ch === requiredStart && !draft) {
      return { fill: '#78350f', stroke: '#fbbf24', text: '#fef3c7', muted: false };
    }
    return { fill: '#060e1a', stroke: '#334155', text: '#f1f5f9', muted: false };
  };

  return (
    <div className="mx-auto w-full max-w-sm select-none">
      <svg
        viewBox="-14 -14 128 128"
        className="w-full h-auto"
        role="img"
        aria-label="Letter Box square"
      >
        <rect
          x="0"
          y="0"
          width="100"
          height="100"
          fill="#0b1220"
          stroke="#1e293b"
          strokeWidth="1.5"
          rx="1"
        />

        {committedPaths.map((pts, pathIndex) => (
          <polyline
            key={`done-${pathIndex}`}
            fill="none"
            stroke="#34d399"
            strokeWidth="1.4"
            strokeOpacity="0.35"
            strokeLinecap="round"
            strokeLinejoin="round"
            points={pts.map((p) => `${p.x},${p.y}`).join(' ')}
          />
        ))}

        {draftPath && draftPath.length >= 2 ? (
          <polyline
            fill="none"
            stroke="#818cf8"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
            points={draftPath.map((p) => `${p.x},${p.y}`).join(' ')}
          />
        ) : null}

        {positions.map((pos) => {
          const colors = circleClass(pos.ch);
          const isLast = !disabled && lastDraftLetter === pos.ch;
          const canPick = !disabled && selectable.get(pos.ch);
          const clickable = isLast || canPick;
          return (
            <g key={pos.id} opacity={colors.muted ? 0.45 : 1}>
              <circle
                cx={pos.x}
                cy={pos.y}
                r="11"
                fill="transparent"
                className={clickable ? 'cursor-pointer' : 'cursor-not-allowed'}
                onClick={() => {
                  if (isLast) {
                    onPopLast?.();
                    return;
                  }
                  if (canPick) onPick?.(pos.ch);
                }}
              />
              <circle
                cx={pos.x}
                cy={pos.y}
                r="7.5"
                fill={colors.fill}
                stroke={colors.stroke}
                strokeWidth="1.4"
                className="pointer-events-none"
              />
              <text
                x={pos.x}
                y={pos.y}
                textAnchor="middle"
                dominantBaseline="central"
                fill={colors.text}
                fontSize="7.5"
                fontWeight="700"
                className="pointer-events-none"
                style={{ fontFamily: 'ui-sans-serif, system-ui, sans-serif' }}
              >
                {pos.ch}
              </text>
            </g>
          );
        })}
      </svg>
      <p className="text-[11px] text-slate-500 text-center mt-2">
        Same-side letters are dimmed · tap the last letter to undo it
      </p>
    </div>
  );
}

function LetterboxPlayArea({
  puzzle,
  sandbox = false,
  competitive = false,
  currentUserUid = null,
  onAchievements = null,
  initialWords = [],
  initialSubmitted = false,
  initialLeaderboard = [],
  initialMessage = '',
  dayKey = null,
  showDayPicker = false,
  allowFuture = false,
  onDayKeyChange = null,
  todayKey: todayKeyProp = null,
}) {
  const todayKey = todayKeyProp || getLondonDayKey();
  const [words, setWords] = useState(() => (initialWords || []).map(normalizeWord));
  const [draft, setDraft] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState(initialMessage || '');
  const [submitting, setSubmitting] = useState(false);
  const [leaderboard, setLeaderboard] = useState(initialLeaderboard || []);
  const [submitted, setSubmitted] = useState(Boolean(initialSubmitted));
  const [solution, setSolution] = useState(puzzle?.solution || null);
  const [dictionaryReady, setDictionaryReady] = useState(isDictionaryReady());
  const [tutorialOpen, setTutorialOpen] = useState(false);
  const startedAtRef = useRef(new Date().toISOString());
  const inputRef = useRef(null);

  const sides = puzzle?.sides || [];
  const par = puzzle?.par || 2;
  const used = useMemo(() => usedLettersFromWords(words), [words]);
  const requiredStart = nextRequiredLetter(words);
  const solvedLocal = coversAllLetters(sides, words);
  const allLetters = useMemo(() => boardLetterSet(sides), [sides]);

  useEffect(() => {
    let cancelled = false;
    ensureDictionary('/api/getBoggleDictionary')
      .then(() => {
        if (!cancelled) setDictionaryReady(true);
      })
      .catch(() => {
        if (!cancelled) setDictionaryReady(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    setWords((initialWords || []).map(normalizeWord));
    setDraft('');
    setSubmitted(Boolean(initialSubmitted));
    setLeaderboard(initialLeaderboard || []);
    setMessage(initialMessage || '');
    setSolution(puzzle?.solution || null);
    setError('');
    startedAtRef.current = new Date().toISOString();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [puzzle?.id, dayKey]);

  const appendLetter = useCallback((ch) => {
    if (submitted) return;
    const letter = normalizeWord(ch);
    if (!letter) return;
    setDraft((prev) => {
      const check = canAppendLetter(sides, prev, letter, requiredStart);
      if (!check.ok) {
        if (check.reason === 'side' || check.reason === 'same') {
          setError('Pick a letter from a different side.');
        } else if (check.reason === 'chain') {
          setError(`Next word must start with ${requiredStart}.`);
        } else {
          setError('That letter isn’t available.');
        }
        return prev;
      }
      setError('');
      return normalizeWord(prev + letter);
    });
  }, [requiredStart, sides, submitted]);

  const popLastLetter = useCallback(() => {
    if (submitted) return;
    setDraft((prev) => {
      const next = normalizeWord(prev);
      if (!next) return prev;
      setError('');
      return next.slice(0, -1);
    });
  }, [submitted]);

  const finishSolve = async (chain) => {
    if (sandbox || !competitive) {
      setSubmitted(true);
      setSolution(puzzle.solution || chain);
      setMessage(`Solved in ${chain.length} word${chain.length === 1 ? '' : 's'} (par ${par}).`);
      return;
    }

    setSubmitting(true);
    setError('');
    try {
      const durationMs = Math.max(0, Date.now() - new Date(startedAtRef.current).getTime());
      const response = await fetch('/api/submitLetterboxResult', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          words: chain,
          dayKey: dayKey || todayKey,
          startedAt: startedAtRef.current,
          durationMs,
        }),
      });
      const payload = (await readJsonResponse(response)) || {};
      if (!response.ok) throw new Error(payload.error || 'Submit failed.');
      setSubmitted(true);
      setWords((payload.game?.words || chain).map(normalizeWord));
      setSolution(payload.puzzle?.solution || payload.game?.solution || puzzle.solution || chain);
      setLeaderboard(payload.leaderboard || []);
      setMessage(`Solved in ${payload.game?.wordCount || chain.length} words (par ${par}).`);
      if (Array.isArray(payload.achievements) && onAchievements) onAchievements(payload.achievements);
    } catch (err) {
      setError(err.message || 'Submit failed.');
    } finally {
      setSubmitting(false);
    }
  };

  const commitWord = async () => {
    if (submitted) return;
    const word = normalizeWord(draft);
    if (word.length < MIN_WORD_LENGTH) {
      setError(`Words must be at least ${MIN_WORD_LENGTH} letters.`);
      return;
    }
    if (requiredStart && word[0] !== requiredStart) {
      setError(`Next word must start with ${requiredStart}.`);
      return;
    }
    if (!wordValidOnSides(sides, word)) {
      setError('Letters must be on the square, and consecutive letters cannot share a side.');
      return;
    }
    if (!dictionaryReady) {
      setError('Dictionary still loading…');
      return;
    }
    if (!isDictionaryWord(word)) {
      setError('Not in the dictionary.');
      return;
    }

    const nextWords = [...words, word];
    setWords(nextWords);
    setDraft('');
    setError('');
    setMessage('');
    if (coversAllLetters(sides, nextWords)) {
      await finishSolve(nextWords);
    }
  };

  const undoWord = () => {
    if (submitted || !words.length) return;
    setWords((prev) => prev.slice(0, -1));
    setDraft('');
    setError('');
  };

  const resetChain = () => {
    if (submitted) return;
    setWords([]);
    setDraft('');
    setError('');
    setMessage('');
  };

  return (
    <div className="space-y-4">
      <LetterboxTutorialModal open={tutorialOpen} onClose={() => setTutorialOpen(false)} />

      {showDayPicker ? (
        <FunDayPicker
          dayKey={dayKey || todayKey}
          todayKey={todayKey}
          onChange={onDayKeyChange}
          allowFuture={allowFuture}
        />
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-400">
        <p>
          Par <span className="text-slate-200 font-semibold">{par}</span>
          {' · '}
          {words.length} word{words.length === 1 ? '' : 's'}
          {' · '}
          {used.size}/{allLetters.size} letters
        </p>
        <div className="flex flex-wrap items-center gap-2">
          {sandbox ? (
            <span className="text-amber-200/90 border border-amber-500/30 bg-amber-500/10 rounded-md px-2 py-1">
              Practice · not on the leaderboard
            </span>
          ) : null}
          <button
            type="button"
            onClick={() => setTutorialOpen(true)}
            className="text-indigo-300 hover:text-indigo-200 underline-offset-2 hover:underline"
          >
            How to play
          </button>
        </div>
      </div>

      <LetterSquare
        sides={sides}
        usedLetters={used}
        currentWord={draft}
        committedWords={words}
        requiredStart={requiredStart}
        onPick={appendLetter}
        onPopLast={popLastLetter}
        disabled={submitted}
      />

      <div className="space-y-2">
        <div className="flex flex-wrap gap-2">
          <input
            ref={inputRef}
            className="flex-1 min-w-[10rem] bg-[#060e1a] border border-[#1a2540] rounded-lg px-3 py-2 text-sm text-slate-100 uppercase tracking-wide"
            value={draft}
            disabled={submitted}
            placeholder={requiredStart ? `Starts with ${requiredStart}…` : 'Type or tap letters…'}
            onChange={(e) => {
              const next = filterDraftInput(sides, draft, e.target.value, requiredStart);
              const raw = normalizeWord(e.target.value);
              if (raw.length > next.length) {
                setError('Pick a letter from a different side.');
              } else {
                setError('');
              }
              setDraft(next);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                commitWord();
              }
              if (e.key === 'Backspace' && !draft && words.length) {
                e.preventDefault();
                undoWord();
              }
            }}
            maxLength={16}
            autoCapitalize="characters"
            autoCorrect="off"
            spellCheck={false}
          />
          <button
            type="button"
            disabled={submitted || submitting}
            onClick={commitWord}
            className="px-3 py-2 rounded-lg text-sm bg-indigo-600 hover:bg-indigo-500 text-white disabled:opacity-50"
          >
            Enter word
          </button>
          <button
            type="button"
            disabled={submitted || !words.length}
            onClick={undoWord}
            className="px-3 py-2 rounded-lg text-sm border border-[#1a2540] text-slate-300 hover:bg-white/[0.04] disabled:opacity-40"
          >
            Undo
          </button>
          <button
            type="button"
            disabled={submitted}
            onClick={resetChain}
            className="px-3 py-2 rounded-lg text-sm border border-[#1a2540] text-slate-300 hover:bg-white/[0.04] disabled:opacity-40"
          >
            Reset
          </button>
        </div>
        {!dictionaryReady ? (
          <p className="text-[11px] text-slate-500">Loading dictionary…</p>
        ) : null}
        {error ? <p className="text-sm text-rose-300">{error}</p> : null}
        {message ? <p className="text-sm text-emerald-300">{message}</p> : null}
      </div>

      {words.length > 0 ? (
        <ol className="space-y-1 text-sm text-slate-200">
          {words.map((word, index) => (
            <li key={`${word}-${index}`} className="flex gap-2">
              <span className="text-slate-500 w-5">{index + 1}.</span>
              <span className="font-medium tracking-wide">{word}</span>
            </li>
          ))}
        </ol>
      ) : (
        <p className="text-xs text-slate-500">
          Build a chain of words. Each new word starts with the last letter of the previous one.
        </p>
      )}

      {solvedLocal && !submitted ? (
        <button
          type="button"
          disabled={submitting}
          onClick={() => finishSolve(words)}
          className="w-full sm:w-auto px-4 py-2 rounded-lg text-sm bg-emerald-600 hover:bg-emerald-500 text-white disabled:opacity-50"
        >
          {submitting ? 'Submitting…' : 'Submit solve'}
        </button>
      ) : null}

      {submitted && solution?.length ? (
        <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-100">
          Official solution: {solution.join(' → ')}
        </div>
      ) : null}

      {!sandbox && competitive && leaderboard.length > 0 ? (
        <div className="space-y-2">
          <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-400">Leaderboard</h4>
          <ol className="space-y-1.5">
            {leaderboard.slice(0, 10).map((row) => (
              <FunLeaderboardRow
                key={row.uid || row.rank}
                row={row}
                currentUserUid={currentUserUid}
                resultText={row.resultLabel || `${row.wordCount} words`}
              />
            ))}
          </ol>
        </div>
      ) : null}
    </div>
  );
}

export default function LetterboxPanel({
  currentUserUid = null,
  onAchievements = null,
  isAdmin = false,
  sandbox = false,
  forcedDayKey = null,
}) {
  const todayKey = getLondonDayKey();
  const [dayKey, setDayKey] = useState(forcedDayKey || todayKey);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [puzzle, setPuzzle] = useState(null);
  const [game, setGame] = useState(null);
  const [leaderboard, setLeaderboard] = useState([]);
  const preLive = todayKey < LETTERBOX_LIVE_FROM;

  useEffect(() => {
    if (forcedDayKey) setDayKey(forcedDayKey);
  }, [forcedDayKey]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        setError('');
        if (sandbox || preLive) {
          const local = getLocalPuzzleForDay(dayKey);
          if (!cancelled) {
            setPuzzle(local);
            setGame(null);
            setLeaderboard([]);
          }
          return;
        }
        const params = new URLSearchParams();
        if (dayKey && dayKey !== todayKey) params.set('dayKey', dayKey);
        const query = params.toString() ? `?${params}` : '';
        const response = await fetch(`/api/getDailyLetterbox${query}`, { credentials: 'include' });
        const payload = (await readJsonResponse(response)) || {};
        if (!response.ok) throw new Error(payload.error || 'Failed to load Letter Box.');
        if (cancelled) return;
        if (payload.weekend || payload.sittingOut) {
          setPuzzle(null);
          setGame(null);
          setLeaderboard([]);
          setError(payload.message || 'Letter Box isn’t in today’s Fun rotation.');
          return;
        }
        setPuzzle(payload.puzzle);
        setGame(payload.game || null);
        setLeaderboard(payload.leaderboard || []);
      } catch (err) {
        if (!cancelled) {
          setError(err.message || 'Failed to load Letter Box.');
          setPuzzle(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [dayKey, sandbox, todayKey, preLive]);

  if (loading) return <p className="text-sm text-slate-400">Loading Letter Box…</p>;
  if (error || !puzzle) return <p className="text-sm text-rose-300">{error || 'Puzzle unavailable.'}</p>;

  const done = game?.status === 'won';
  const isSandboxMode = Boolean(sandbox || preLive);
  return (
    <LetterboxPlayArea
      puzzle={puzzle}
      sandbox={isSandboxMode}
      competitive={!isSandboxMode}
      currentUserUid={currentUserUid}
      onAchievements={onAchievements}
      initialWords={game?.words || []}
      initialSubmitted={done}
      initialLeaderboard={leaderboard}
      initialMessage={done ? `Already solved · ${game.wordCount} words.` : ''}
      dayKey={dayKey}
      todayKey={todayKey}
      showDayPicker={!sandbox}
      allowFuture={Boolean(isAdmin)}
      onDayKeyChange={setDayKey}
    />
  );
}

export function LetterboxPracticePanel() {
  const [seedId, setSeedId] = useState(LETTERBOX_PRACTICE_LEVELS[0]?.id || '');
  const [tutorialOpen, setTutorialOpen] = useState(false);
  const puzzle = LETTERBOX_PRACTICE_LEVELS.find((p) => p.id === seedId) || LETTERBOX_PRACTICE_LEVELS[0];

  useEffect(() => {
    if (!hasSeenLetterboxTutorial()) setTutorialOpen(true);
  }, []);

  return (
    <div className="space-y-4">
      <LetterboxTutorialModal open={tutorialOpen} onClose={() => setTutorialOpen(false)} />

      <div className="rounded-xl border border-indigo-500/30 bg-indigo-500/10 px-4 py-3 space-y-2">
        <p className="text-sm font-semibold text-indigo-100">Letter Box · new puzzle</p>
        <p className="text-sm text-slate-300">
          Try five practice levels today. Letter Box enters the Fun rotation from{' '}
          <span className="text-white font-medium">{LETTERBOX_LIVE_FROM}</span>
          {' '}— practice scores stay local and won’t appear on leaderboards or streaks until then.
        </p>
        <button
          type="button"
          onClick={() => setTutorialOpen(true)}
          className="text-xs text-indigo-300 hover:text-indigo-200 underline-offset-2 hover:underline"
        >
          Open how-to tutorial
        </button>
      </div>

      <div className="flex flex-wrap gap-2">
        {LETTERBOX_PRACTICE_LEVELS.map((seed) => (
          <button
            key={seed.id}
            type="button"
            onClick={() => setSeedId(seed.id)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
              seed.id === seedId
                ? 'bg-indigo-600/30 border-indigo-400/50 text-indigo-100'
                : 'border-[#1a2540] text-slate-300 hover:bg-white/[0.03]'
            }`}
          >
            {seed.title}
          </button>
        ))}
      </div>
      {puzzle ? (
        <LetterboxPlayArea key={puzzle.id} puzzle={puzzle} sandbox />
      ) : null}
    </div>
  );
}

export function LetterboxDailyPanel({ currentUserUid = null, onAchievements = null }) {
  return (
    <LetterboxPanel
      currentUserUid={currentUserUid}
      onAchievements={onAchievements}
    />
  );
}

export function LetterboxSandbox() {
  const todayKey = getLondonDayKey();
  const [mode, setMode] = useState('seed');
  const [seedId, setSeedId] = useState(LETTERBOX_SEED_PUZZLES[0]?.id || '');
  const [dayKey, setDayKey] = useState(todayKey);
  const [puzzle, setPuzzle] = useState(() => LETTERBOX_SEED_PUZZLES[0] || getLocalPuzzleForDay(todayKey));

  const loadSeed = () => {
    const next = getPuzzleById(seedId);
    if (next) setPuzzle({ ...next, sides: [...next.sides], solution: [...next.solution] });
  };

  const loadDay = () => {
    setPuzzle(getLocalPuzzleForDay(dayKey || todayKey));
  };

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-[#1a2540] p-4 space-y-3">
        <p className="text-sm text-slate-300">
          Admin sandbox for Letter Box (NYT Letter Boxed–style). Competitive daily + leaderboards from{' '}
          <span className="text-white font-medium">{LETTERBOX_LIVE_FROM}</span>.
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
            </select>
          </label>
          {mode === 'seed' ? (
            <>
              <label className="text-xs text-slate-400 space-y-1">
                Seed
                <select
                  value={seedId}
                  onChange={(e) => setSeedId(e.target.value)}
                  className="block bg-[#060e1a] border border-[#1a2540] rounded-md px-3 py-2 text-sm text-slate-100"
                >
                  {LETTERBOX_SEED_PUZZLES.map((p) => (
                    <option key={p.id} value={p.id}>{p.id} · par {p.par}</option>
                  ))}
                </select>
              </label>
              <button
                type="button"
                onClick={loadSeed}
                className="rounded-lg bg-indigo-600 hover:bg-indigo-500 px-4 py-2 text-sm text-white"
              >
                Load seed
              </button>
            </>
          ) : (
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
              <button
                type="button"
                onClick={loadDay}
                className="rounded-lg bg-indigo-600 hover:bg-indigo-500 px-4 py-2 text-sm text-white"
              >
                Load day
              </button>
            </>
          )}
        </div>
      </div>
      {puzzle ? (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4">
          <LetterboxPlayArea key={`${puzzle.id}-${mode}-${dayKey}`} puzzle={puzzle} sandbox />
        </div>
      ) : null}
    </div>
  );
}
