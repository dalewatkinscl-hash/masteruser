/**
 * Fun-tab streak achievements (weekday win streaks).
 */
import { useState } from 'react';

export default function AchievementsPanel({ achievements = [], isAdmin = false }) {
  const [backfilling, setBackfilling] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const runBackfill = async () => {
    if (!isAdmin || backfilling) return;
    if (!window.confirm('Admin: recompute Fun medals for everyone from history?')) return;
    setBackfilling(true);
    setError('');
    setMessage('');
    try {
      const response = await fetch('/api/adminBackfillFunMedals', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      });
      const contentType = response.headers.get('content-type') || '';
      const payload = contentType.includes('application/json') ? await response.json() : {};
      if (!response.ok) throw new Error(payload.error || 'Backfill failed.');
      setMessage(`Medals rebuilt — ${payload.users || 0} players, ${payload.dayDocs || 0} day boards.`);
    } catch (err) {
      setError(err.message || 'Backfill failed.');
    } finally {
      setBackfilling(false);
    }
  };

  if (!achievements.length) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-slate-500 text-center py-2">
          Win weekday games to build streaks. Fails reset them; missed days don’t.
        </p>
        {isAdmin ? (
          <button
            type="button"
            disabled={backfilling}
            onClick={runBackfill}
            className="w-full px-3 py-2 rounded-lg text-xs border border-amber-500/40 text-amber-200 hover:bg-amber-500/10 disabled:opacity-50"
          >
            {backfilling ? 'Rebuilding medals…' : 'Admin: backfill medal totals'}
          </button>
        ) : null}
        {message ? <p className="text-xs text-emerald-300">{message}</p> : null}
        {error ? <p className="text-xs text-rose-300">{error}</p> : null}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-indigo-300/80">
        Weekday win streaks · fails reset · missed days don’t break them. Reach 5 for a star.
      </p>
      <ul className="divide-y divide-[#1a2540] rounded-xl border border-[#1a2540] overflow-hidden">
        {achievements.map((item) => {
          const best = item.best || 0;
          const current = item.current || 0;
          const target = item.target || 5;
          const progress = Math.min(target, best);
          const pct = Math.round((progress / target) * 100);
          return (
            <li key={item.gameKey} className="px-4 py-4 space-y-2">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-indigo-100">{item.label}</p>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Best {best} · current {current}
                    {item.doneToday ? ' · won today' : ''}
                  </p>
                </div>
                <span
                  className={`flex-shrink-0 text-[11px] font-semibold px-2 py-1 rounded-md border ${
                    item.unlocked
                      ? 'border-amber-500/40 bg-amber-500/15 text-amber-200'
                      : 'border-[#1a2540] text-slate-500'
                  }`}
                >
                  {item.unlocked ? '★ 5+' : `${best}/${target}`}
                </span>
              </div>
              <div className="h-1.5 rounded-full bg-[#060e1a] overflow-hidden">
                <div
                  className={`h-full rounded-full ${item.unlocked ? 'bg-amber-400' : 'bg-indigo-500'}`}
                  style={{ width: `${item.unlocked ? 100 : pct}%` }}
                />
              </div>
            </li>
          );
        })}
      </ul>
      {isAdmin ? (
        <button
          type="button"
          disabled={backfilling}
          onClick={runBackfill}
          className="w-full px-3 py-2 rounded-lg text-xs border border-amber-500/40 text-amber-200 hover:bg-amber-500/10 disabled:opacity-50"
        >
          {backfilling ? 'Rebuilding medals…' : 'Admin: backfill medal totals'}
        </button>
      ) : null}
      {message ? <p className="text-xs text-emerald-300">{message}</p> : null}
      {error ? <p className="text-xs text-rose-300">{error}</p> : null}
    </div>
  );
}
