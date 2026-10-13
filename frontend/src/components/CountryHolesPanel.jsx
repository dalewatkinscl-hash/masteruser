import { useEffect, useState } from 'react';
import { GameUiButton, GameUiPanel } from './gameUi';

async function readJsonResponse(res) {
  const contentType = res.headers.get('content-type') || '';
  if (!contentType.includes('application/json')) return null;
  try {
    return await res.json();
  } catch {
    return null;
  }
}

function CountryHolesShell({ sandbox = false }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [game, setGame] = useState(null);
  const [leaderboard, setLeaderboard] = useState([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        setError('');
        const qs = sandbox ? '?sandbox=1' : '';
        const response = await fetch(`/api/getDailyCountryHoles${qs}`, { credentials: 'include' });
        const payload = (await readJsonResponse(response)) || {};
        if (!response.ok) throw new Error(payload.error || 'Failed to load Country Holes.');
        if (cancelled) return;
        setGame(payload.game || null);
        setLeaderboard(Array.isArray(payload.leaderboard) ? payload.leaderboard : []);
      } catch (err) {
        if (!cancelled) setError(err.message || 'Failed to load Country Holes.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [sandbox]);

  return (
    <div className={`w-full space-y-3 ${sandbox ? 'max-w-5xl mx-auto' : ''}`}>
      <GameUiPanel title="Country Holes" header="green" dark>
        <div className="space-y-3 text-sm text-slate-200">
          <p className="text-slate-400">
            Mini-golf course rebuild is in progress. Your daily scoreboard still syncs when a round is submitted.
          </p>
          {loading ? <p className="text-slate-500">Loading…</p> : null}
          {error ? <p className="text-rose-300">{error}</p> : null}
          {game?.status === 'won' ? (
            <p className="text-emerald-200">
              Today&apos;s round · {game.strokes} strokes
              {Number.isFinite(game.toPar) ? ` (${game.toPar > 0 ? '+' : ''}${game.toPar})` : ''}
            </p>
          ) : (
            <p className="text-slate-500">No competitive round submitted for today yet.</p>
          )}
          {leaderboard.length ? (
            <ol className="space-y-1.5">
              {leaderboard.slice(0, 10).map((row, i) => (
                <li
                  key={row.uid || i}
                  className="rounded-lg border border-slate-700 bg-slate-900/50 px-3 py-2 flex justify-between gap-3"
                >
                  <span className="truncate">{i + 1}. {row.fullName || 'Player'}</span>
                  <span className="tabular-nums text-emerald-300 shrink-0">
                    {row.strokes}
                    {Number.isFinite(row.toPar) ? ` (${row.toPar > 0 ? '+' : ''}${row.toPar})` : ''}
                  </span>
                </li>
              ))}
            </ol>
          ) : null}
          {sandbox ? (
            <GameUiButton
              size="sm"
              variant="neutral"
              onClick={async () => {
                try {
                  const response = await fetch('/api/submitCountryHolesResult', {
                    method: 'POST',
                    credentials: 'include',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      sandbox: true,
                      strokes: 72,
                      par: 72,
                      toPar: 0,
                    }),
                  });
                  const payload = (await readJsonResponse(response)) || {};
                  if (!response.ok) throw new Error(payload.error || 'Submit failed.');
                  setGame(payload.game || null);
                } catch (err) {
                  setError(err.message || 'Submit failed.');
                }
              }}
            >
              Sandbox test submit (72)
            </GameUiButton>
          ) : null}
        </div>
      </GameUiPanel>
    </div>
  );
}

export function CountryHolesDailyPanel() {
  return <CountryHolesShell />;
}

export function CountryHolesSandbox() {
  return (
    <div className="space-y-3">
      <p className="text-sm text-slate-400">Dev sandbox — Country Holes board + practice submit.</p>
      <CountryHolesShell sandbox />
    </div>
  );
}

export default CountryHolesDailyPanel;
