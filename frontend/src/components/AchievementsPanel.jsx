/**
 * Fun-tab streak achievements (weekday win streaks).
 */
import { useState } from 'react';

export default function AchievementsPanel({ achievements = [], isAdmin = false }) {
  const [backfilling, setBackfilling] = useState(false);
  const [clawing, setClawing] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const list = Array.isArray(achievements) ? achievements : [];

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

  const runClawback = async () => {
    if (!isAdmin || clawing) return;
    if (!window.confirm('Admin: remove all live “game won” coin awards? (Podium still pays at midnight.)')) return;
    setClawing(true);
    setError('');
    setMessage('');
    try {
      const response = await fetch('/api/adminClawbackFunWinCoins', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      });
      const contentType = response.headers.get('content-type') || '';
      const payload = contentType.includes('application/json') ? await response.json() : {};
      if (!response.ok) throw new Error(payload.error || 'Clawback failed.');
      setMessage(payload.message || `Reversed ${payload.reversed || 0} fun_win awards.`);
    } catch (err) {
      setError(err.message || 'Clawback failed.');
    } finally {
      setClawing(false);
    }
  };

  const adminActions = isAdmin ? (
    <div className="space-y-2">
      <button
        type="button"
        disabled={backfilling || clawing}
        onClick={runBackfill}
        className="w-full px-3 py-2 rounded-lg text-xs border border-amber-500/40 text-amber-200 hover:bg-amber-500/10 disabled:opacity-50"
      >
        {backfilling ? 'Rebuilding medals…' : 'Admin: backfill medal totals'}
      </button>
      <button
        type="button"
        disabled={backfilling || clawing}
        onClick={runClawback}
        className="w-full px-3 py-2 rounded-lg text-xs border border-rose-500/40 text-rose-200 hover:bg-rose-500/10 disabled:opacity-50"
      >
        {clawing ? 'Removing win coins…' : 'Admin: remove live win coins'}
      </button>
    </div>
  ) : null;

  if (!list.length) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-slate-500 text-center py-2">
          Win weekday games to build streaks. Fails reset them; missed days don’t.
        </p>
        {adminActions}
        {message ? <p className="text-xs text-emerald-300">{message}</p> : null}
        {error ? <p className="text-xs text-rose-300">{error}</p> : null}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-indigo-300/80">
        Weekday win streaks. Fails reset; missed days don’t break the streak.
      </p>
      <ul className="space-y-2">
        {list.map((item) => {
          const unlocked = Boolean(item.unlocked);
          return (
            <li
              key={item.gameKey}
              className="flex items-center justify-between gap-2 rounded-lg border border-[#1a2540] bg-[#060e1a] px-3 py-2"
            >
              <div className="min-w-0">
                <p className="text-sm text-slate-100 truncate">{item.label}</p>
                <p className="text-[10px] text-slate-500">
                  best {item.best || 0} · now {item.current || 0}
                  {unlocked ? ' · ★5 unlocked' : ''}
                </p>
              </div>
            </li>
          );
        })}
      </ul>
      {adminActions}
      {message ? <p className="text-xs text-emerald-300">{message}</p> : null}
      {error ? <p className="text-xs text-rose-300">{error}</p> : null}
    </div>
  );
}
