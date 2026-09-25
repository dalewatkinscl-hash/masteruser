import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import PollPieChart from './PollPieChart';
import VotersHover from './VotersHover';
import { KudosBadgeGraphic } from './kudosGraphics';
import { FunRankBadge } from './FunLeaderboardRow';
import { getLondonDayKey } from './FunDayPicker';
import { getFunRotationForDay, setClientRotationSettings } from '../lib/funRotation';
import { coinReasonLabel, visibleCoinEarnActions } from '../utils/coinAwards';
import { useAuth } from '../context/AuthContext';

async function readJsonResponse(res) {
  const contentType = res.headers.get('content-type') || '';
  if (!contentType.includes('application/json')) return null;
  try {
    return await res.json();
  } catch {
    return null;
  }
}

function WidgetLeaderRow({ row, currentUserUid, resultText }) {
  return (
    <li className="flex justify-between gap-2 text-xs items-center">
      <span className={`truncate flex items-center gap-1.5 min-w-0 ${row.uid === currentUserUid ? 'text-indigo-300 font-semibold' : 'text-slate-200'}`}>
        <FunRankBadge row={row} />
        <span className="truncate">
          {row.fullName}{row.uid === currentUserUid ? ' (you)' : ''}
          {row.joint ? <span className="text-slate-500"> · {row.rankLabel}</span> : null}
        </span>
      </span>
      <span className={`flex-shrink-0 ${row.failed || row.status === 'lost' || row.correct === false ? 'text-rose-300' : 'text-slate-500'}`}>
        {resultText}
      </span>
    </li>
  );
}

function WidgetShell({ title, children, empty }) {
  return (
    <div className="bg-[#0b1220] border border-[#1a2540] rounded-xl overflow-visible">
      <div className="px-4 py-3 border-b border-[#1a2540] bg-[#060e1a]/50 rounded-t-xl">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400">{title}</h3>
      </div>
      <div className="px-4 py-3 overflow-visible">
        {empty ? <p className="text-xs text-slate-500">{empty}</p> : children}
      </div>
    </div>
  );
}

function PollVoteWidget({ poll, votingId, onVoteAb, onVoteText, textDraft, onTextDraftChange }) {
  const busy = votingId === poll.id;
  const myKey = poll.myVote?.optionKey || '';

  return (
    <div className="space-y-3 overflow-visible">
      {poll.type === 'ab' ? (
        <>
          <div className="flex flex-col gap-1.5">
            {['a', 'b'].map((key) => {
              const option = (poll.results?.options || []).find((row) => row.key === key)
                || {
                  key,
                  label: key === 'a' ? poll.optionA : poll.optionB,
                  votes: 0,
                  voters: [],
                };
              return (
                <VotersHover
                  key={key}
                  label={option.label}
                  voters={option.voters || []}
                  votes={option.votes || 0}
                  className="w-full"
                >
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => onVoteAb(poll.id, key)}
                    className={`w-full text-left px-2.5 py-1.5 rounded-md text-xs border transition-colors disabled:opacity-50 ${
                      myKey === key
                        ? key === 'a'
                          ? 'border-indigo-500/60 bg-indigo-500/15 text-indigo-200'
                          : 'border-cyan-500/60 bg-cyan-500/15 text-cyan-200'
                        : 'border-[#1a2540] text-slate-300 hover:bg-white/[0.04]'
                    }`}
                  >
                    {option.label}
                  </button>
                </VotersHover>
              );
            })}
          </div>
          <PollPieChart options={poll.results?.options || []} size="sm" />
        </>
      ) : (
        <>
          {(poll.results?.allAnswers || poll.results?.topAnswers || []).length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {(poll.results?.allAnswers || poll.results?.topAnswers || []).map((answer) => (
                <VotersHover
                  key={answer.key}
                  label={answer.label}
                  voters={answer.voters || []}
                  votes={answer.votes || 0}
                >
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => onVoteText(poll.id, { optionKey: answer.key, optionLabel: answer.label })}
                    className={`px-2 py-1 rounded-md text-[11px] border transition-colors disabled:opacity-50 ${
                      myKey === answer.key
                        ? 'border-indigo-500/60 bg-indigo-500/15 text-indigo-200'
                        : 'border-[#1a2540] text-slate-300 hover:bg-white/[0.04]'
                    }`}
                  >
                    {answer.label} ({answer.votes})
                  </button>
                </VotersHover>
              ))}
            </div>
          )}
          <div className="flex gap-1.5">
            <input
              className="flex-1 min-w-0 bg-[#060e1a] border border-[#1a2540] text-slate-100 text-[11px] rounded-md px-2 py-1.5"
              placeholder="Your answer…"
              value={textDraft || ''}
              onChange={(e) => onTextDraftChange(poll.id, e.target.value)}
              maxLength={80}
              disabled={busy}
            />
            <button
              type="button"
              disabled={busy || !(textDraft || '').trim()}
              onClick={() => onVoteText(poll.id, { optionLabel: (textDraft || '').trim() })}
              className="px-2.5 py-1.5 rounded-md text-[11px] font-medium bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white"
            >
              Vote
            </button>
          </div>
          {(poll.results?.options || poll.results?.allAnswers || []).length > 0 && (
            <PollPieChart
              options={poll.results.options || poll.results.allAnswers || []}
              size="sm"
            />
          )}
        </>
      )}

      <p className="text-[10px] text-slate-600">
        {poll.results?.totalVotes || 0} vote{(poll.results?.totalVotes || 0) === 1 ? '' : 's'}
        {poll.myVote ? ` · you chose “${poll.myVote.optionLabel}”` : ' · tap to vote'}
        {busy ? ' · saving…' : ''}
      </p>
    </div>
  );
}

export default function ProfileWidgets({ currentUserUid }) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [voteError, setVoteError] = useState('');
  const [data, setData] = useState(null);
  const [votingId, setVotingId] = useState('');
  const [textDrafts, setTextDrafts] = useState({});
  const [earnOpen, setEarnOpen] = useState(false);

  const load = async () => {
    const response = await fetch('/api/getProfileWidgets', { credentials: 'include' });
    const payload = (await readJsonResponse(response)) || {};
    if (!response.ok) throw new Error(payload.error || 'Failed to load widgets.');
    if (payload.settings) setClientRotationSettings(payload.settings);
    else if (payload.rotation?.permanentGameKeys) {
      setClientRotationSettings({
        permanentGameKeys: payload.rotation.permanentGameKeys,
        rotatedDailyCount: payload.rotation.rotatedDailyCount,
      });
    }
    setData(payload);
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        await load();
      } catch (err) {
        if (!cancelled) setError(err.message || 'Failed to load widgets.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const onChanged = () => {
      load().catch(() => {});
    };
    window.addEventListener('cl-kudos-changed', onChanged);
    window.addEventListener('cl-coins-awarded', onChanged);
    return () => {
      window.removeEventListener('cl-kudos-changed', onChanged);
      window.removeEventListener('cl-coins-awarded', onChanged);
    };
  }, []);

  const rotation = useMemo(() => {
    if (data?.rotation && typeof data.rotation === 'object') return data.rotation;
    return getFunRotationForDay(data?.dayKey || getLondonDayKey());
  }, [data?.rotation, data?.dayKey]);
  const showGame = (gameKey) => !rotation.closed && Array.isArray(rotation.games) && rotation.games.includes(gameKey);

  const voteAb = async (pollId, optionKey) => {
    setVoteError('');
    setVotingId(pollId);
    try {
      const response = await fetch('/api/submitPollVote', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pollId, optionKey }),
      });
      const payload = (await readJsonResponse(response)) || {};
      if (!response.ok) throw new Error(payload.error || 'Failed to vote.');
      await load();
    } catch (err) {
      setVoteError(err.message || 'Failed to vote.');
    } finally {
      setVotingId('');
    }
  };

  const voteText = async (pollId, { optionKey, optionLabel }) => {
    setVoteError('');
    setVotingId(pollId);
    try {
      const response = await fetch('/api/submitPollVote', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pollId, optionKey, optionLabel }),
      });
      const payload = (await readJsonResponse(response)) || {};
      if (!response.ok) throw new Error(payload.error || 'Failed to vote.');
      setTextDrafts((prev) => ({ ...prev, [pollId]: '' }));
      await load();
    } catch (err) {
      setVoteError(err.message || 'Failed to vote.');
    } finally {
      setVotingId('');
    }
  };

  if (loading) {
    return (
      <div className="text-xs text-slate-500 px-1 py-2">Loading widgets…</div>
    );
  }

  if (error) {
    return <div className="text-xs text-rose-300 px-1 py-2">{error}</div>;
  }

  const trivia = data?.trivia || {};
  const wordle = data?.wordle || {};
  const polls = data?.polls || [];
  const nonogram = data?.nonogram || {};
  const sokoban = data?.sokoban || {};
  const boggle = data?.boggle || {};
  const connections = data?.connections || {};
  const letterbox = data?.letterbox || {};
  const achievements = data?.achievements || [];
  const medals = data?.medals || { gold: 0, silver: 0, bronze: 0, label: 'No medals yet', total: 0 };
  const kudosReceived = data?.kudos?.received || [];
  const coins = data?.coins || { balance: 0, lifetimeEarned: 0, recent: [], completed: [] };
  const recentCoins = Array.isArray(coins.recent) ? coins.recent : [];
  const completedEarnIds = new Set(Array.isArray(coins.completed) ? coins.completed : []);
  const earnActions = visibleCoinEarnActions({ canIssueKudos: Boolean(user?.canIssueKudos) });

  const goEarn = (action) => {
    if (completedEarnIds.has(action.id)) {
      // Still allow jumping to the related form, but no need to force-close.
    }
    if (action.href) {
      window.open(action.href, '_blank', 'noopener,noreferrer');
      return;
    }
    navigate('/dashboard/profile', {
      state: {
        profileTab: action.profileTab || 'profile',
        ...(action.section ? { profileSection: action.section } : {}),
      },
    });
    setEarnOpen(false);
  };

  return (
    <aside className="space-y-4 w-full">
      <WidgetShell title="Coin wallet">
        <div className="space-y-3">
          <div className="flex items-end justify-between gap-3">
            <div>
              <p className="text-2xl font-semibold tabular-nums text-amber-200">
                {Number(coins.balance) || 0}
              </p>
              <p className="text-[11px] text-slate-500">coins available</p>
            </div>
            <p className="text-[11px] text-slate-500 tabular-nums">
              {Number(coins.lifetimeEarned) || 0} earned lifetime
            </p>
          </div>

          <button
            type="button"
            onClick={() => setEarnOpen((open) => !open)}
            className="w-full rounded-lg border border-amber-500/35 bg-amber-500/10 px-3 py-2 text-left text-xs font-semibold text-amber-100 transition-colors hover:bg-amber-500/15"
          >
            {earnOpen ? 'Hide earn options' : 'Earn more coins'}
          </button>

          {earnOpen && (
            <ul className="space-y-1.5 border-t border-[#1a2540] pt-2">
              {earnActions.map((action) => {
                const done = completedEarnIds.has(action.id);
                return (
                  <li key={action.id}>
                    <button
                      type="button"
                      onClick={() => goEarn(action)}
                      className={`flex w-full items-start justify-between gap-2 rounded-lg border px-2.5 py-2 text-left transition-colors ${
                        done
                          ? 'border-emerald-500/40 bg-emerald-500/10 hover:bg-emerald-500/15'
                          : 'border-[#1a2540] bg-[#060e1a] hover:border-amber-500/30 hover:bg-white/[0.03]'
                      }`}
                    >
                      <span className="min-w-0 flex items-start gap-2">
                        <span
                          className={`mt-0.5 flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-full border ${
                            done
                              ? 'border-emerald-400 bg-emerald-500 text-white'
                              : 'border-slate-600 bg-transparent text-transparent'
                          }`}
                          aria-hidden="true"
                        >
                          {done ? (
                            <svg className="h-2.5 w-2.5" viewBox="0 0 12 12" fill="none">
                              <path
                                d="M2.5 6.2 4.8 8.5 9.5 3.5"
                                stroke="currentColor"
                                strokeWidth="1.8"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                              />
                            </svg>
                          ) : null}
                        </span>
                        <span className="min-w-0">
                          <span className={`block text-xs font-medium truncate ${done ? 'text-emerald-100' : 'text-slate-100'}`}>
                            {action.label}
                          </span>
                          <span className={`block text-[10px] leading-snug ${done ? 'text-emerald-300/70' : 'text-slate-500'}`}>
                            {done ? 'Completed' : action.detail}
                          </span>
                        </span>
                      </span>
                      <span
                        className={`flex-shrink-0 text-xs font-semibold tabular-nums ${
                          done ? 'text-emerald-300' : 'text-amber-200'
                        }`}
                      >
                        {done ? '✓' : `+${action.amount}`}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}

          {recentCoins.length > 0 ? (
            <ul className="space-y-1.5 border-t border-[#1a2540] pt-2">
              {recentCoins.slice(0, 5).map((row) => (
                <li
                  key={row.id}
                  className="flex items-center justify-between gap-2 text-xs"
                >
                  <span className="text-slate-300 truncate">{coinReasonLabel(row.reason)}</span>
                  <span className="flex-shrink-0 tabular-nums text-amber-200/90">
                    +{row.amount || 0}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            !earnOpen && (
              <p className="text-xs text-slate-500">
                Earn coins by completing your profile, playing Fun games, voting, and more.
              </p>
            )
          )}
        </div>
      </WidgetShell>

      <WidgetShell
        title="Kudos today"
        empty={!kudosReceived.length ? 'No kudos on your profile today.' : null}
      >
        {kudosReceived.length > 0 && (
          <ul className="space-y-2.5">
            {kudosReceived.slice(0, 5).map((item) => (
              <li key={item.id} className="rounded-lg border border-[#1a2540] bg-[#060e1a] px-2.5 py-2 flex gap-2.5">
                <KudosBadgeGraphic badgeType={item.badgeType} size="sm" gifUrl={item.gifUrl} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2 mb-0.5">
                    <span className="text-[11px] font-semibold text-slate-100 truncate">
                      {item.badgeLabel || item.badgeType}
                    </span>
                    <span className="text-[10px] text-slate-500 flex-shrink-0">
                      {item.fromName}
                    </span>
                  </div>
                  <p className="text-xs text-slate-300 leading-snug line-clamp-3">{item.message}</p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </WidgetShell>

      <WidgetShell
        title="Trophy case"
        empty={
          !medals.total && !achievements.some((a) => (a.best || 0) > 0 || (a.current || 0) > 0)
            ? 'Win Fun games for streaks, and place top 3 for medals.'
            : null
        }
      >
        <div className="space-y-3">
          <div className="space-y-1.5">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Medals</p>
            {medals.total > 0 ? (
              <>
                <p className="text-sm text-slate-100">{medals.label}</p>
                <div className="flex flex-wrap gap-3 text-xs text-slate-400">
                  <span>🥇 {medals.gold || 0}</span>
                  <span>🥈 {medals.silver || 0}</span>
                  <span>🥉 {medals.bronze || 0}</span>
                </div>
              </>
            ) : (
              <p className="text-xs text-slate-500">No podium medals yet.</p>
            )}
          </div>

          <div className="space-y-2 pt-2 border-t border-[#1a2540]">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
              Best weekday win streaks
            </p>
            <p className="text-[10px] text-slate-600 leading-snug">
              Wins stack · fails reset · missed weekdays don’t break the streak
            </p>
            {achievements.length > 0 ? (
              <ul className="space-y-2">
                {achievements.map((item) => (
                  <li key={item.gameKey} className="flex items-center justify-between gap-2 text-xs">
                    <span className="text-slate-200 truncate">{item.label}</span>
                    <span className="flex-shrink-0 tabular-nums text-slate-400">
                      <span className="text-amber-200 font-semibold">best {item.best || 0}</span>
                      <span className="text-slate-600"> · </span>
                      <span>now {item.current || 0}</span>
                      {item.unlocked ? <span className="ml-1.5 text-amber-300">★5</span> : null}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-xs text-slate-500">Play Fun games to start streaks.</p>
            )}
          </div>
        </div>
      </WidgetShell>

      {showGame('trivia') && (
        <WidgetShell
          title="Quiz of the day"
          empty={!trivia.leaderboard?.length ? 'No answers yet today.' : null}
        >
          {trivia.leaderboard?.length > 0 && (
            <ol className="space-y-1.5">
              {trivia.leaderboard.slice(0, 5).map((row) => (
                <WidgetLeaderRow
                  key={row.uid || row.rank}
                  row={row}
                  currentUserUid={currentUserUid}
                  resultText={row.resultLabel || (row.correct ? 'Correct' : '💩 Wrong')}
                />
              ))}
            </ol>
          )}
        </WidgetShell>
      )}

      {showGame('wordle') && (
        <WidgetShell
          title="Wordle today"
          empty={!wordle.leaderboard?.length ? 'Nobody has finished today’s Wordle yet.' : null}
        >
          {wordle.leaderboard?.length > 0 && (
            <ol className="space-y-1.5">
              {wordle.leaderboard.slice(0, 5).map((row) => (
                <WidgetLeaderRow
                  key={row.uid || row.rank}
                  row={row}
                  currentUserUid={currentUserUid}
                  resultText={row.resultLabel || `${row.guessCount}/6`}
                />
              ))}
            </ol>
          )}
        </WidgetShell>
      )}

      {voteError && (
        <p className="text-[11px] text-rose-300 px-1">{voteError}</p>
      )}

      {polls.map((poll) => (
        <WidgetShell key={poll.id} title={poll.title}>
          <PollVoteWidget
            poll={poll}
            votingId={votingId}
            onVoteAb={voteAb}
            onVoteText={voteText}
            textDraft={textDrafts[poll.id]}
            onTextDraftChange={(pollId, value) => setTextDrafts((prev) => ({ ...prev, [pollId]: value }))}
          />
        </WidgetShell>
      ))}

      {showGame('nonogram') && (
        <WidgetShell
          title="Nonogram today"
          empty={!nonogram.leaderboard?.length ? 'Nobody has finished today’s Nonogram yet.' : null}
        >
          {nonogram.leaderboard?.length > 0 && (
            <ol className="space-y-1.5">
              {nonogram.leaderboard.slice(0, 5).map((row) => (
                <WidgetLeaderRow
                  key={row.uid || row.rank}
                  row={row}
                  currentUserUid={currentUserUid}
                  resultText={row.durationLabel || row.resultLabel || '—'}
                />
              ))}
            </ol>
          )}
        </WidgetShell>
      )}

      {showGame('sokoban') && (
        <WidgetShell
          title="Sokoban today"
          empty={!sokoban.leaderboard?.length ? 'Nobody has finished today’s Sokoban yet.' : null}
        >
          {sokoban.leaderboard?.length > 0 && (
            <ol className="space-y-1.5">
              {sokoban.leaderboard.slice(0, 5).map((row) => (
                <WidgetLeaderRow
                  key={row.uid || row.rank}
                  row={row}
                  currentUserUid={currentUserUid}
                  resultText={row.resultLabel || `${row.moveCount} moves`}
                />
              ))}
            </ol>
          )}
        </WidgetShell>
      )}

      {showGame('boggle') && (
        <WidgetShell
          title="Boggle today"
          empty={!boggle.leaderboard?.length ? 'Nobody has finished today’s Boggle yet.' : null}
        >
          {boggle.leaderboard?.length > 0 && (
            <ol className="space-y-1.5">
              {boggle.leaderboard.slice(0, 5).map((row) => (
                <WidgetLeaderRow
                  key={row.uid || row.rank}
                  row={row}
                  currentUserUid={currentUserUid}
                  resultText={row.resultLabel || `${row.score} pts`}
                />
              ))}
            </ol>
          )}
        </WidgetShell>
      )}

      {showGame('connections') && (
        <WidgetShell
          title="Connections today"
          empty={!connections.leaderboard?.length ? 'Nobody has finished today’s Connections yet.' : null}
        >
          {connections.leaderboard?.length > 0 && (
            <ol className="space-y-1.5">
              {connections.leaderboard.slice(0, 5).map((row) => (
                <WidgetLeaderRow
                  key={row.uid || row.rank}
                  row={row}
                  currentUserUid={currentUserUid}
                  resultText={row.resultLabel || '—'}
                />
              ))}
            </ol>
          )}
        </WidgetShell>
      )}

      {showGame('letterbox') && (
        <WidgetShell
          title="Letter Box today"
          empty={!letterbox.leaderboard?.length ? 'Nobody has finished today’s Letter Box yet.' : null}
        >
          {letterbox.leaderboard?.length > 0 && (
            <ol className="space-y-1.5">
              {letterbox.leaderboard.slice(0, 5).map((row) => (
                <WidgetLeaderRow
                  key={row.uid || row.rank}
                  row={row}
                  currentUserUid={currentUserUid}
                  resultText={row.resultLabel || `${row.wordCount} words`}
                />
              ))}
            </ol>
          )}
        </WidgetShell>
      )}
    </aside>
  );
}
