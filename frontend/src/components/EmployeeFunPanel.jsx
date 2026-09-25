import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import WordlePanel from './WordlePanel';
import NonogramPanel from './NonogramPanel';
import SokobanPanel from './SokobanPanel';
import BogglePanel from './BogglePanel';
import ConnectionsPanel from './ConnectionsPanel';
import { EncloseDailyPanel, EnclosePracticePanel } from './EnclosePanel';
import { LetterboxDailyPanel, LetterboxPracticePanel } from './LetterboxPanel';
import { PipesDailyPanel } from './PipesPanel';
import { ToolboxKickDailyPanel } from './ToolboxKickPanel';
import { WantedDailyPanel } from './WantedPanel';
import { StackWalkDailyPanel } from './StackWalkPanel';
import CoachDepotPanel from './CoachDepotPanel';
import AchievementsPanel from './AchievementsPanel';
import FunDayPicker, { getLondonDayKey } from './FunDayPicker';
import FunLeaderboardRow from './FunLeaderboardRow';
import {
  ENCLOSE_LIVE_FROM,
  LETTERBOX_LIVE_FROM,
  PERMANENT_FUN_FROM,
  FUN_GAME_ROSTER,
  STACK_WALK_LIVE_FROM,
  getFunRotationForDay,
  setClientRotationSettings,
  isStackWalkPreviewDay,
} from '../lib/funRotation';

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

function formatElapsedMs(ms) {
  const n = Math.max(0, Math.floor(Number(ms) || 0));
  if (n < 1000) return `${(n / 1000).toFixed(2)}s`;
  const totalSec = n / 1000;
  if (totalSec < 60) return `${totalSec.toFixed(1)}s`;
  const min = Math.floor(totalSec / 60);
  const sec = Math.round(totalSec % 60);
  return `${min}:${String(sec).padStart(2, '0')}`;
}

function TrophyIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M8 21h8M12 17v4M7 4h10v4a5 5 0 0 1-10 0V4Z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M7 6H4a2 2 0 0 0 2 4h1M17 6h3a2 2 0 0 1-2 4h-1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

const FUN_SECTION_STORAGE_KEY = 'employee-fun-open-sections';

const DEFAULT_OPEN_SECTIONS = {
  trivia: false,
  wordle: false,
  nonogram: false,
  sokoban: false,
  boggle: false,
  connections: false,
  enclose: true,
  enclosePractice: true,
  letterbox: true,
  letterboxPractice: true,
  pipes: true,
  toolboxkick: true,
  wanted: true,
  stackwalk: true,
  coachdepot: true,
  achievements: false,
};

function loadOpenSections() {
  try {
    const raw = localStorage.getItem(FUN_SECTION_STORAGE_KEY);
    if (!raw) return { ...DEFAULT_OPEN_SECTIONS };
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return { ...DEFAULT_OPEN_SECTIONS };
    }
    return { ...DEFAULT_OPEN_SECTIONS, ...parsed };
  } catch {
    return { ...DEFAULT_OPEN_SECTIONS };
  }
}

function normalizeRotation(raw, fallbackDayKey) {
  if (!raw || typeof raw !== 'object') {
    return getFunRotationForDay(fallbackDayKey);
  }
  return {
    ...raw,
    closed: Boolean(raw.closed),
    games: Array.isArray(raw.games) ? raw.games.map(String) : [],
    sitOuts: Array.isArray(raw.sitOuts)
      ? raw.sitOuts.map(String)
      : (raw.sitOut ? [String(raw.sitOut)] : []),
    sitOut: raw.sitOut || null,
  };
}

function FunSection({ title, open, onToggle, children }) {
  return (
    <div className="bg-[#0b1220] border border-[#1a2540] rounded-xl overflow-hidden">
      <button
        type="button"
        onClick={onToggle}
        className="w-full px-5 py-4 flex items-center justify-between gap-3 text-left hover:bg-white/[0.02] transition-colors"
        aria-expanded={open}
      >
        <p className="text-lg sm:text-xl font-semibold text-indigo-300 truncate">{title}</p>
        <span className="flex-shrink-0 text-xs font-medium text-indigo-300/80 border border-indigo-500/30 rounded-md px-2.5 py-1">
          {open ? 'Hide' : 'Show'}
        </span>
      </button>
      {open ? (
        <div className="px-5 pb-5 pt-2 border-t border-[#1a2540] space-y-4">
          {children}
        </div>
      ) : null}
    </div>
  );
}

function TriviaContent({ currentUserUid, onAchievements }) {
  const todayKey = getLondonDayKey();
  const [dayKey, setDayKey] = useState(todayKey);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [revealing, setRevealing] = useState(false);
  const [error, setError] = useState('');
  const [data, setData] = useState(null);
  const [selectedIndex, setSelectedIndex] = useState(null);
  const [practiceRevealedAt, setPracticeRevealedAt] = useState(null);
  const [timerMs, setTimerMs] = useState(0);

  const practice = dayKey !== todayKey;

  const load = async (key) => {
    const query = key && key !== todayKey ? `?dayKey=${encodeURIComponent(key)}` : '';
    const response = await fetch(`/api/getDailyTrivia${query}`, { credentials: 'include' });
    const payload = (await readJsonResponse(response)) || {};
    if (!response.ok) throw new Error(payload.error || 'Failed to load trivia.');
    setData(payload);
    if (typeof payload.myAnswer?.selectedIndex === 'number') {
      setSelectedIndex(payload.myAnswer.selectedIndex);
    } else {
      setSelectedIndex(null);
    }
    setPracticeRevealedAt(null);
    setTimerMs(0);
    if (!payload.practice && Array.isArray(payload.achievements) && onAchievements) {
      onAchievements(payload.achievements);
    }
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
          setError(err.message || 'Failed to load trivia.');
          setData(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [dayKey]);

  const answered = Boolean(data?.answered || data?.myAnswer);
  const revealed = practice
    ? Boolean(practiceRevealedAt)
    : Boolean(data?.revealed || answered);
  const revealedAtIso = practice
    ? practiceRevealedAt
    : (data?.revealedAt || data?.myAnswer?.revealedAt || null);

  useEffect(() => {
    if (!revealed || answered || !revealedAtIso) {
      setTimerMs(0);
      return undefined;
    }
    const start = new Date(revealedAtIso).getTime();
    if (Number.isNaN(start)) return undefined;
    const tick = () => setTimerMs(Math.max(0, Date.now() - start));
    tick();
    const id = window.setInterval(tick, 50);
    return () => window.clearInterval(id);
  }, [revealed, answered, revealedAtIso]);

  const revealQuestion = async () => {
    if (revealed || answered) return;
    setRevealing(true);
    setError('');
    try {
      if (practice) {
        const now = new Date().toISOString();
        setPracticeRevealedAt(now);
        setData((prev) => ({
          ...prev,
          revealed: true,
          revealedAt: now,
        }));
        return;
      }
      const response = await fetch('/api/startTriviaRound', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const payload = (await readJsonResponse(response)) || {};
      if (!response.ok) throw new Error(payload.error || 'Failed to reveal question.');
      setData((prev) => ({
        ...prev,
        revealed: true,
        revealedAt: payload.revealedAt,
        question: payload.question || prev?.question,
      }));
    } catch (err) {
      setError(err.message || 'Failed to reveal question.');
    } finally {
      setRevealing(false);
    }
  };

  const submit = async () => {
    if (selectedIndex == null || data?.answered || data?.myAnswer) return;
    setSubmitting(true);
    setError('');
    try {
      const response = await fetch('/api/submitTriviaAnswer', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          selectedIndex,
          ...(practice ? { dayKey } : {}),
        }),
      });
      const payload = (await readJsonResponse(response)) || {};
      if (!response.ok) throw new Error(payload.error || 'Failed to submit answer.');
      setData({
        ...payload,
        answered: true,
        myAnswer: payload.myAnswer
          ? {
              ...payload.myAnswer,
              elapsedMs: practice ? timerMs : payload.myAnswer.elapsedMs,
              revealedAt: practice ? practiceRevealedAt : payload.myAnswer.revealedAt,
            }
          : payload.myAnswer,
      });
      if (Array.isArray(payload.achievements) && onAchievements) {
        onAchievements(payload.achievements);
      }
    } catch (err) {
      setError(err.message || 'Failed to submit answer.');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return <p className="text-sm text-slate-400 text-center py-4">Loading trivia…</p>;
  }

  if (error && !data) {
    return <p className="text-sm text-red-300">{error}</p>;
  }

  const question = data?.question;
  const correctIndex = data?.correctIndex;
  const leaderboard = data?.leaderboard || [];
  const showQuestion = revealed || answered;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-indigo-300/80">
          {practice
            ? 'Practice mode · Europe/London'
            : 'One go per day · fastest correct answer wins'}
          {' · '}
          {data?.dayKey || dayKey}
        </p>
        <FunDayPicker dayKey={dayKey} todayKey={todayKey} onChange={setDayKey} gameKey="trivia" />
      </div>

      <div className="space-y-4">
          {!showQuestion && !answered ? (
            <div className="rounded-xl border border-indigo-500/30 bg-indigo-500/10 px-5 py-8 text-center space-y-4">
              <p className="text-sm text-slate-300">
                Today&apos;s quiz is ready. Reveal the question to start the timer — quickest correct answer tops the board.
              </p>
              <button
                type="button"
                onClick={revealQuestion}
                disabled={revealing}
                className="px-5 py-2.5 rounded-lg text-sm font-medium bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white"
              >
                {revealing ? 'Starting…' : 'Reveal question & start timer'}
              </button>
            </div>
          ) : null}

          {showQuestion && !answered ? (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-2">
              <p className="text-xs font-semibold uppercase tracking-wider text-amber-200/90">
                Timer running
              </p>
              <p className="text-lg font-mono font-semibold tabular-nums text-amber-50">
                {formatElapsedMs(timerMs)}
              </p>
            </div>
          ) : null}

          {showQuestion ? (
            <p className="text-base text-slate-100 font-medium leading-relaxed">
              {question?.prompt}
            </p>
          ) : null}

          {showQuestion ? (
          <div className="space-y-2">
            {(question?.options || []).map((option, index) => {
              const isSelected = selectedIndex === index;
              let tone = 'border-[#1a2540] bg-[#060e1a] hover:border-indigo-500/40';
              if (answered && correctIndex === index) {
                tone = 'border-emerald-500/50 bg-emerald-500/10';
              } else if (answered && isSelected && correctIndex !== index) {
                tone = 'border-rose-500/50 bg-rose-500/10';
              } else if (!answered && isSelected) {
                tone = 'border-indigo-500/60 bg-indigo-500/10';
              }

              return (
                <button
                  key={`${question?.questionId}-${index}`}
                  type="button"
                  disabled={answered || submitting}
                  onClick={() => setSelectedIndex(index)}
                  className={`w-full text-left rounded-lg border px-4 py-3 text-sm transition-colors ${tone} disabled:cursor-default`}
                >
                  <span className="inline-flex items-center gap-3">
                    <span className="text-[10px] font-mono uppercase tracking-wider text-slate-500">
                      {String.fromCharCode(65 + index)}
                    </span>
                    <span className="text-slate-100">{option}</span>
                  </span>
                </button>
              );
            })}
          </div>
          ) : null}

          {showQuestion && !answered && (
            <button
              type="button"
              onClick={submit}
              disabled={selectedIndex == null || submitting}
              className="px-5 py-2.5 rounded-lg text-sm font-medium bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white"
            >
              {submitting ? 'Submitting…' : 'Submit answer'}
            </button>
          )}

          {answered && (
            <div
              className={`rounded-lg border px-4 py-3 text-sm ${
                data?.myAnswer?.correct
                  ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-200'
                  : 'border-rose-500/40 bg-rose-500/10 text-rose-200'
              }`}
            >
              {data?.myAnswer?.correct
                ? practice
                  ? `Nice one — correct in ${formatElapsedMs(data?.myAnswer?.elapsedMs ?? timerMs)}. Practice only, so it doesn’t count.`
                  : `Nice one — correct in ${formatElapsedMs(data?.myAnswer?.elapsedMs ?? timerMs)}. You’re on today’s leaderboard.`
                : `Not this time. The correct answer was ${String.fromCharCode(65 + (correctIndex ?? 0))}.`}
            </div>
          )}

          {error && <p className="text-rose-300 text-sm">{error}</p>}
      </div>

      {!practice && (
        <div className="rounded-xl border border-[#1a2540] overflow-hidden">
          <div className="px-4 py-3 border-b border-[#1a2540] flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <TrophyIcon className="w-4 h-4 text-amber-300" />
              <h4 className="text-sm font-semibold text-indigo-200">Today’s leaderboard</h4>
            </div>
            <span className="text-xs text-slate-500">{data?.totalCorrect ?? 0} correct · {data?.totalFailed ?? 0} wrong · fastest wins</span>
          </div>

          {!leaderboard.length ? (
            <p className="px-5 py-8 text-sm text-slate-500 text-center">
              No answers yet — be the first.
            </p>
          ) : (
            <ol className="divide-y divide-[#1a2540]">
              {leaderboard.map((row) => (
                <FunLeaderboardRow
                  key={row.uid || row.rank}
                  row={row}
                  currentUserUid={currentUserUid}
                  resultText={row.resultLabel || (row.correct ? 'Correct' : '💩 Wrong')}
                  metaText={row.correct && typeof row.elapsedMs === 'number'
                    ? formatElapsedMs(row.elapsedMs)
                    : formatTime(row.answeredAt)}
                />
              ))}
            </ol>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Company-wide daily Fun games (six live each weekday from the rotation).
 * Weekdays only (Europe/London). Extra roster games sit out on a rolling window.
 * Pipes joins from PIPES_LIVE_FROM. Sections sit behind show/hide buttons.
 */
export default function EmployeeFunPanel({ currentUserUid, isAdmin = false }) {
  const navigate = useNavigate();
  const todayKey = getLondonDayKey();
  const [rotation, setRotation] = useState(() => ({
    ...getFunRotationForDay(todayKey),
    // Hide game accordions until /api/getFunRotation confirms today's list —
    // client defaults can disagree with live Fun Admin settings.
    games: [],
  }));
  const [rotationReady, setRotationReady] = useState(false);
  const [openSections, setOpenSections] = useState(loadOpenSections);
  const [achievements, setAchievements] = useState([]);
  const [stackWalkSecret, setStackWalkSecret] = useState(false);

  useEffect(() => {
    if (!openSections || typeof openSections !== 'object' || Array.isArray(openSections)) {
      setOpenSections({ ...DEFAULT_OPEN_SECTIONS });
      return;
    }
    try {
      localStorage.setItem(FUN_SECTION_STORAGE_KEY, JSON.stringify(openSections));
    } catch {
      // ignore
    }
  }, [openSections]);

  useEffect(() => {
    if (!isStackWalkPreviewDay(todayKey)) return undefined;
    let presses = 0;
    let lastAt = 0;
    const onKeyDown = (event) => {
      if (event.repeat) return;
      const tag = String(event.target?.tagName || '').toLowerCase();
      if (tag === 'input' || tag === 'textarea' || event.target?.isContentEditable) return;
      if (event.key !== 'o' && event.key !== 'O') {
        presses = 0;
        return;
      }
      const now = Date.now();
      if (now - lastAt > 2500) presses = 0;
      lastAt = now;
      presses += 1;
      if (presses < 5) return;
      presses = 0;
      setStackWalkSecret(true);
      setOpenSections((prev) => ({ ...prev, stackwalk: true }));
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [todayKey]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const response = await fetch('/api/getFunRotation', { credentials: 'include' });
        const payload = (await readJsonResponse(response)) || {};
        if (cancelled) return;
        if (payload.settings) {
          setClientRotationSettings(payload.settings);
        }
        if (payload.rotation && typeof payload.rotation === 'object') {
          setRotation(normalizeRotation(payload.rotation, todayKey));
        } else {
          setRotation(getFunRotationForDay(todayKey, payload.settings || null));
        }
        if (Array.isArray(payload.achievements)) {
          setAchievements(payload.achievements);
        }
      } catch {
        // soft-fail — fall back to local estimate (after applying any cached settings)
        if (!cancelled) setRotation(getFunRotationForDay(todayKey));
      } finally {
        if (!cancelled) setRotationReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [todayKey]);

  const toggle = (id) => {
    setOpenSections((prev) => {
      const base = prev && typeof prev === 'object' && !Array.isArray(prev)
        ? prev
        : DEFAULT_OPEN_SECTIONS;
      return { ...base, [id]: !base[id] };
    });
  };

  const refreshAchievements = (next) => {
    if (Array.isArray(next)) setAchievements(next);
  };

  const gameSections = [
    {
      id: 'trivia',
      title: 'Daily Trivia',
      render: () => <TriviaContent currentUserUid={currentUserUid} onAchievements={refreshAchievements} />,
    },
    {
      id: 'wordle',
      title: 'Daily Wordle',
      render: () => <WordlePanel currentUserUid={currentUserUid} onAchievements={refreshAchievements} />,
    },
    {
      id: 'nonogram',
      title: 'Daily Nonogram',
      render: () => <NonogramPanel currentUserUid={currentUserUid} onAchievements={refreshAchievements} />,
    },
    {
      id: 'sokoban',
      title: 'Daily Sokoban',
      render: () => (
        <SokobanPanel
          currentUserUid={currentUserUid}
          onAchievements={refreshAchievements}
          isAdmin={isAdmin}
        />
      ),
    },
    {
      id: 'boggle',
      title: 'Daily Boggle',
      render: () => (
        <BogglePanel
          currentUserUid={currentUserUid}
          onAchievements={refreshAchievements}
          isAdmin={isAdmin}
        />
      ),
    },
    {
      id: 'connections',
      title: 'Daily Connections',
      render: () => (
        <ConnectionsPanel
          currentUserUid={currentUserUid}
          onAchievements={refreshAchievements}
          isAdmin={isAdmin}
        />
      ),
    },
    {
      id: 'enclose',
      title: 'Daily Enclose',
      render: () => (
        <EncloseDailyPanel
          currentUserUid={currentUserUid}
          onAchievements={refreshAchievements}
        />
      ),
    },
    {
      id: 'letterbox',
      title: 'Daily Letter Box',
      render: () => (
        <LetterboxDailyPanel
          currentUserUid={currentUserUid}
          onAchievements={refreshAchievements}
        />
      ),
    },
    {
      id: 'pipes',
      title: 'Daily Pipes',
      render: () => (
        <PipesDailyPanel
          currentUserUid={currentUserUid}
          onAchievements={refreshAchievements}
          isAdmin={isAdmin}
        />
      ),
    },
    {
      id: 'toolboxkick',
      title: 'Little Dicks Toolbox',
      render: () => (
        <ToolboxKickDailyPanel
          currentUserUid={currentUserUid}
          onAchievements={refreshAchievements}
          isAdmin={isAdmin}
        />
      ),
    },
    {
      id: 'wanted',
      title: 'Daily Wanted',
      render: () => (
        <WantedDailyPanel
          currentUserUid={currentUserUid}
          onAchievements={refreshAchievements}
          isAdmin={isAdmin}
        />
      ),
    },
    {
      id: 'stackwalk',
      title: "O Dell's Amazon Run",
      render: () => (
        <StackWalkDailyPanel
          currentUserUid={currentUserUid}
          onAchievements={refreshAchievements}
          isAdmin={isAdmin}
        />
      ),
    },
  ].filter((section) => (
    rotationReady
    && !rotation.closed
    && Array.isArray(rotation.games)
    && rotation.games.includes(section.id)
    && !(Array.isArray(rotation.sitOuts) && rotation.sitOuts.includes(section.id))
  ));

  const sitOutKeys = Array.isArray(rotation.sitOuts) && rotation.sitOuts.length
    ? rotation.sitOuts
    : (rotation.sitOut ? [rotation.sitOut] : []);
  const sitOutLabel = sitOutKeys
    .map((key) => FUN_GAME_ROSTER.find((g) => g.key === key)?.label || key)
    .join(', ') || null;

  const showEnclosePractice = Boolean(rotationReady && rotation.enclosePractice);
  const showLetterboxPractice = Boolean(rotationReady && rotation.letterboxPractice);
  const showStackWalkSecret = Boolean(
    rotationReady
    && isStackWalkPreviewDay(todayKey)
    && stackWalkSecret
    && !rotation.games?.includes('stackwalk'),
  );

  return (
    <div className="space-y-3 w-full">
      {isAdmin ? (
        <div className="flex justify-end px-1">
          <button
            type="button"
            onClick={() => navigate('/dashboard/fun-admin')}
            className="text-xs text-slate-500 hover:text-indigo-300 transition-colors"
          >
            Fun admin
          </button>
        </div>
      ) : null}
      {rotation.closed ? (
        <div className="rounded-xl border border-indigo-500/30 bg-indigo-500/10 px-5 py-6 space-y-2">
          <p className="text-lg font-semibold text-indigo-200">Fun is off for the weekend</p>
          <p className="text-sm text-slate-300">
            {rotation.message || 'Daily puzzles come back Monday.'}
          </p>
          <p className="text-xs text-slate-500">
            Streaks skip Saturday and Sunday, so a Friday win can continue on Monday.
          </p>
        </div>
      ) : !rotationReady ? (
        <p className="text-sm text-slate-400 px-1">Loading today’s Fun games…</p>
      ) : (
        <p className="text-sm text-slate-400 px-1">
          {rotation.rotationActive
            ? `${rotation.games?.length === 6 ? 'Six' : rotation.games?.length === 5 ? 'Five' : `${rotation.games?.length || 6}`} games today${sitOutLabel ? ` (${sitOutLabel} sit out)` : ''}. Fresh daily puzzles each weekday · Europe/London.`
            : 'Pick a game to open. Fresh daily puzzles each weekday · Europe/London.'}
          {' '}
          Use the day picker inside a game to replay past weekday puzzles for fun — those don’t count for
          leaderboards or streaks.
          {showEnclosePractice
            ? ` Enclose practice is open — competitive from ${ENCLOSE_LIVE_FROM}.`
            : ''}
          {showLetterboxPractice
            ? ` Letter Box is open to try — it joins the rotation from ${LETTERBOX_LIVE_FROM} (no leaderboard until then).`
            : ''}
          {rotation.games?.includes('pipes')
            ? ' Pipes: rotate until every tile fills with water — score is your time.'
            : ''}
          {rotation.games?.includes('toolboxkick')
            ? ' Little Dicks Toolbox: one round a day (all or nothing or 3 goes) — furthest distance wins.'
            : ''}
          {rotation.games?.includes('wanted')
            ? ' Wanted: one attempt — Standard then Impossible; fastest combined time wins.'
            : ''}
          {rotation.games?.includes('stackwalk')
            ? " O Dell's Amazon Run: deliver parcels on foot — one more every 10 m; furthest wins."
            : ''}
          {showStackWalkSecret
            ? ` O Dell's Amazon Run unlocked early — joins the rotation from ${STACK_WALK_LIVE_FROM}.`
            : ''}
          {todayKey >= PERMANENT_FUN_FROM
            ? ' Wordle, Boggle, Connections, Little Dicks Toolbox, and Daily Wanted stay in rotation every weekday.'
            : todayKey >= '2026-08-26'
              ? ` From ${PERMANENT_FUN_FROM}, Wordle and Little Dicks Toolbox stay in rotation every weekday.`
              : ''}
        </p>
      )}

      <FunSection
        title="Trophy case"
        open={Boolean(openSections?.achievements)}
        onToggle={() => toggle('achievements')}
      >
        {openSections?.achievements ? (
          <AchievementsPanel achievements={achievements} isAdmin={isAdmin} />
        ) : null}
      </FunSection>

      {isAdmin ? (
        <FunSection
          title="Coach Depot · admin preview"
          open={openSections?.coachdepot !== false}
          onToggle={() => toggle('coachdepot')}
        >
          {openSections?.coachdepot !== false ? (
            <CoachDepotPanel currentUserUid={currentUserUid} />
          ) : null}
        </FunSection>
      ) : null}

      {showEnclosePractice ? (
        <FunSection
          title="Enclose practice · new game"
          open={openSections?.enclosePractice !== false}
          onToggle={() => toggle('enclosePractice')}
        >
          {openSections?.enclosePractice !== false ? <EnclosePracticePanel /> : null}
        </FunSection>
      ) : null}

      {showLetterboxPractice ? (
        <FunSection
          title="Letter Box · new puzzle · try today"
          open={openSections?.letterboxPractice !== false}
          onToggle={() => toggle('letterboxPractice')}
        >
          {openSections?.letterboxPractice !== false ? <LetterboxPracticePanel /> : null}
        </FunSection>
      ) : null}

      {showStackWalkSecret ? (
        <FunSection
          title="O Dell's Amazon Run · early peek"
          open={openSections?.stackwalk !== false}
          onToggle={() => toggle('stackwalk')}
        >
          {openSections?.stackwalk !== false ? (
            <StackWalkDailyPanel
              preview
              currentUserUid={currentUserUid}
              onAchievements={refreshAchievements}
              isAdmin={isAdmin}
            />
          ) : null}
        </FunSection>
      ) : null}

      {!rotation.closed && gameSections.map((section) => (
        <FunSection
          key={section.id}
          title={section.title}
          open={Boolean(openSections?.[section.id])}
          onToggle={() => toggle(section.id)}
        >
          {openSections?.[section.id] ? section.render() : null}
        </FunSection>
      ))}
    </div>
  );
}
