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
import AchievementsPanel from './AchievementsPanel';
import FunDayPicker, { getLondonDayKey } from './FunDayPicker';
import FunLeaderboardRow from './FunLeaderboardRow';
import {
  ENCLOSE_LIVE_FROM,
  LETTERBOX_LIVE_FROM,
  PERMANENT_FUN_FROM,
  FUN_GAME_ROSTER,
  getFunRotationForDay,
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

function TrophyIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M8 21h8M12 17v4M7 4h10v4a5 5 0 0 1-10 0V4Z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M7 6H4a2 2 0 0 0 2 4h1M17 6h3a2 2 0 0 1-2 4h-1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

const FUN_SECTION_STORAGE_KEY = 'employee-fun-open-sections';

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
  const [error, setError] = useState('');
  const [data, setData] = useState(null);
  const [selectedIndex, setSelectedIndex] = useState(null);

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
  const answered = Boolean(data?.answered || data?.myAnswer);
  const correctIndex = data?.correctIndex;
  const leaderboard = data?.leaderboard || [];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-indigo-300/80">
          {practice
            ? 'Practice mode · Europe/London'
            : 'One go per day · Europe/London'}
          {' · '}
          {data?.dayKey || dayKey}
        </p>
        <FunDayPicker dayKey={dayKey} todayKey={todayKey} onChange={setDayKey} />
      </div>

      <div className="space-y-4">
          <p className="text-base text-slate-100 font-medium leading-relaxed">
            {question?.prompt}
          </p>

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

          {!answered && (
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
                  ? 'Nice one — correct. Practice only, so it doesn’t count.'
                  : 'Nice one — that’s correct. You’re on today’s leaderboard.'
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
            <span className="text-xs text-slate-500">{data?.totalCorrect ?? 0} correct · {data?.totalFailed ?? 0} wrong</span>
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
                  metaText={formatTime(row.answeredAt)}
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
  const [rotation, setRotation] = useState(() => getFunRotationForDay(todayKey));
  const [openSections, setOpenSections] = useState(() => {
    try {
      const raw = localStorage.getItem(FUN_SECTION_STORAGE_KEY);
      if (raw) return JSON.parse(raw);
    } catch {
      // ignore
    }
    return {
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
      achievements: false,
    };
  });
  const [achievements, setAchievements] = useState([]);

  useEffect(() => {
    try {
      localStorage.setItem(FUN_SECTION_STORAGE_KEY, JSON.stringify(openSections));
    } catch {
      // ignore
    }
  }, [openSections]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const response = await fetch('/api/getFunRotation', { credentials: 'include' });
        const payload = (await readJsonResponse(response)) || {};
        if (cancelled) return;
        if (payload.rotation && typeof payload.rotation === 'object') {
          setRotation(payload.rotation);
        }
        if (Array.isArray(payload.achievements)) {
          setAchievements(payload.achievements);
        }
      } catch {
        // soft-fail — keep local rotation estimate
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const toggle = (id) => {
    setOpenSections((prev) => ({ ...prev, [id]: !prev[id] }));
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
  ].filter((section) => rotation.closed || rotation.games.includes(section.id));

  const sitOutKeys = Array.isArray(rotation.sitOuts) && rotation.sitOuts.length
    ? rotation.sitOuts
    : (rotation.sitOut ? [rotation.sitOut] : []);
  const sitOutLabel = sitOutKeys
    .map((key) => FUN_GAME_ROSTER.find((g) => g.key === key)?.label || key)
    .join(', ') || null;

  const showEnclosePractice = Boolean(rotation.enclosePractice);
  const showLetterboxPractice = Boolean(rotation.letterboxPractice);

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
          {todayKey >= PERMANENT_FUN_FROM
            ? ' Wordle, Little Dicks Toolbox, and Daily Wanted stay in rotation every weekday.'
            : todayKey >= '2026-08-26'
              ? ` From ${PERMANENT_FUN_FROM}, Wordle and Little Dicks Toolbox stay in rotation every weekday.`
              : ''}
        </p>
      )}

      <FunSection
        title="Trophy case"
        open={Boolean(openSections.achievements)}
        onToggle={() => toggle('achievements')}
      >
        {openSections.achievements ? (
          <AchievementsPanel achievements={achievements} isAdmin={isAdmin} />
        ) : null}
      </FunSection>

      {showEnclosePractice ? (
        <FunSection
          title="Enclose practice · new game"
          open={openSections.enclosePractice !== false}
          onToggle={() => toggle('enclosePractice')}
        >
          {openSections.enclosePractice !== false ? <EnclosePracticePanel /> : null}
        </FunSection>
      ) : null}

      {showLetterboxPractice ? (
        <FunSection
          title="Letter Box · new puzzle · try today"
          open={openSections.letterboxPractice !== false}
          onToggle={() => toggle('letterboxPractice')}
        >
          {openSections.letterboxPractice !== false ? <LetterboxPracticePanel /> : null}
        </FunSection>
      ) : null}

      {!rotation.closed && gameSections.map((section) => (
        <FunSection
          key={section.id}
          title={section.title}
          open={Boolean(openSections[section.id])}
          onToggle={() => toggle(section.id)}
        >
          {openSections[section.id] ? section.render() : null}
        </FunSection>
      ))}
    </div>
  );
}
