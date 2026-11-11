import { firstName, opponentName, playerName, sendMove } from '../../lib/multiplayerApi';

const DIRS = [
  { id: 'L', label: 'Left' },
  { id: 'C', label: 'Centre' },
  { id: 'R', label: 'Right' },
];

function PenaltyPitch({
  isTaker,
  myChoice,
  reveal,
  highlightDir,
}) {
  const ballX = reveal
    ? (reveal.takerDir === 'L' ? 22 : reveal.takerDir === 'R' ? 78 : 50)
    : (myChoice === 'L' ? 28 : myChoice === 'R' ? 72 : 50);
  const ballY = reveal ? 38 : (myChoice ? 52 : 78);
  const keeperX = reveal
    ? (reveal.keeperDir === 'L' ? 24 : reveal.keeperDir === 'R' ? 76 : 50)
    : (!isTaker && myChoice
      ? (myChoice === 'L' ? 28 : myChoice === 'R' ? 72 : 50)
      : 50);

  return (
    <svg viewBox="0 0 100 100" className="w-full max-w-md mx-auto rounded-2xl overflow-hidden shadow-lg">
      <defs>
        <linearGradient id="pitch" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#2d6a3e" />
          <stop offset="100%" stopColor="#1e4d2b" />
        </linearGradient>
        <linearGradient id="net" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#e8eef5" />
          <stop offset="100%" stopColor="#b8c4d4" />
        </linearGradient>
      </defs>
      <rect width="100" height="100" fill="url(#pitch)" />
      {[18, 36, 54, 72, 90].map((y) => (
        <rect key={y} x="0" y={y} width="100" height="9" fill="rgba(255,255,255,0.04)" />
      ))}
      {/* Goal mouth */}
      <rect x="12" y="8" width="76" height="28" fill="url(#net)" opacity="0.35" />
      <path d="M14 36 V10 H86 V36" fill="none" stroke="#f5f7fa" strokeWidth="2.2" />
      <path d="M20 36 V14 H80 V36" fill="none" stroke="rgba(255,255,255,0.35)" strokeWidth="0.6" />
      {[26, 38, 50, 62, 74].map((x) => (
        <line key={x} x1={x} y1="12" x2={x} y2="36" stroke="rgba(255,255,255,0.25)" strokeWidth="0.5" />
      ))}
      {[18, 24, 30].map((y) => (
        <line key={y} x1="14" y1={y} x2="86" y2={y} stroke="rgba(255,255,255,0.2)" strokeWidth="0.5" />
      ))}
      {/* Penalty box */}
      <rect x="22" y="36" width="56" height="40" fill="none" stroke="rgba(255,255,255,0.55)" strokeWidth="1.2" />
      <circle cx="50" cy="78" r="1.6" fill="#fff" />
      {/* Zone hints */}
      {['L', 'C', 'R'].map((d, i) => {
        const x = i === 0 ? 22 : i === 1 ? 50 : 78;
        const active = highlightDir === d;
        return (
          <g key={d}>
            <circle
              cx={x}
              cy="24"
              r={active ? 7 : 5}
              fill={active ? 'rgba(251,191,36,0.55)' : 'rgba(255,255,255,0.12)'}
              stroke={active ? '#fbbf24' : 'rgba(255,255,255,0.25)'}
              strokeWidth="1"
            />
          </g>
        );
      })}
      {/* Keeper */}
      <g transform={`translate(${keeperX}, 30)`}>
        <circle cx="0" cy="-6" r="3.2" fill="#f2d2b6" />
        <rect x="-4" y="-2" width="8" height="9" rx="2" fill="#1d4ed8" />
        <rect x="-5.5" y="6" width="3" height="7" rx="1" fill="#0f172a" />
        <rect x="2.5" y="6" width="3" height="7" rx="1" fill="#0f172a" />
        <rect x="-7" y="0" width="3" height="6" rx="1" fill="#f2d2b6" />
        <rect x="4" y="0" width="3" height="6" rx="1" fill="#f2d2b6" />
      </g>
      {/* Ball */}
      <g transform={`translate(${ballX}, ${ballY})`}>
        <circle r="3.4" fill="#f8fafc" stroke="#94a3b8" strokeWidth="0.4" />
        <path d="M-1.5 -2 L0 0 L1.8 -1.2 L0.5 1.5 L-1.8 0.8 Z" fill="#0f172a" opacity="0.55" />
      </g>
      {reveal ? (
        <text
          x="50"
          y="94"
          textAnchor="middle"
          fill={reveal.goal ? '#86efac' : '#fde68a'}
          fontSize="6"
          fontWeight="700"
        >
          {reveal.goal ? 'GOAL!' : 'SAVED!'}
        </text>
      ) : null}
    </svg>
  );
}

export default function PenaltyMatch({
  match, onMatch, busy, setBusy, setError, opponentLabel,
}) {
  const state = match.state || {};
  const isTaker = state.takerUid === match.yourUid;
  const myChoice = state.choices?.[match.yourUid];
  const hostScore = state.scores?.[match.hostUid] || 0;
  const guestScore = state.scores?.[match.guestUid] || 0;
  const opp = opponentLabel || opponentName(match);
  const oppFirst = firstName(opp);
  const highlightDir = state.phase === 'reveal' && state.lastReveal
    ? state.lastReveal.takerDir
    : myChoice || null;

  const choose = async (dir) => {
    if (busy || state.phase !== 'choose' || myChoice) return;
    setBusy(true);
    setError('');
    try {
      onMatch(await sendMove(match.id, 'choose', { dir }));
    } catch (err) {
      setError(err.message || 'Choice failed.');
    } finally {
      setBusy(false);
    }
  };

  const cont = async () => {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      onMatch(await sendMove(match.id, 'continue'));
    } catch (err) {
      setError(err.message || 'Continue failed.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-center gap-6 text-sm text-slate-300">
        <span>{match.hostName}: <strong className="text-white">{hostScore}</strong></span>
        <span>{match.guestName}: <strong className="text-white">{guestScore}</strong></span>
      </div>
      <p className="text-center text-xs text-slate-500">
        vs {opp} · First to 3 · Kick {state.kick || 1}
      </p>

      <PenaltyPitch
        isTaker={isTaker}
        myChoice={state.phase === 'choose' ? myChoice : null}
        reveal={state.phase === 'reveal' || match.status === 'finished' ? state.lastReveal : null}
        highlightDir={highlightDir}
      />

      {state.phase === 'choose' && match.status === 'playing' ? (
        <div className="space-y-3">
          <p className="text-center text-sm text-slate-200">
            You are the <strong className="text-white">{isTaker ? 'taker' : 'keeper'}</strong>
            {' — '}
            {isTaker ? 'aim your shot' : 'pick your dive'}
            {' against '}
            <strong className="text-white">{oppFirst}</strong>
          </p>
          <p className="text-center text-xs text-slate-500">
            {myChoice ? `Locked in — waiting for ${oppFirst}…` : 'Both choose at the same time'}
          </p>
          <div className="grid grid-cols-3 gap-2 max-w-md mx-auto">
            {DIRS.map((d) => (
              <button
                key={d.id}
                type="button"
                disabled={busy || Boolean(myChoice)}
                onClick={() => choose(d.id)}
                className={`rounded-xl border px-3 py-4 text-sm font-semibold disabled:opacity-40 ${
                  myChoice === d.id
                    ? 'border-emerald-400 bg-emerald-500/30 text-white'
                    : 'border-white/15 bg-black/40 text-white hover:bg-white/10'
                }`}
              >
                {d.label}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {state.phase === 'reveal' && state.lastReveal ? (
        <div className="rounded-2xl border border-white/10 bg-black/30 px-4 py-5 text-center space-y-2">
          <p className="text-sm text-slate-200">
            Shot {state.lastReveal.takerDir} · Dive {state.lastReveal.keeperDir}
          </p>
          <p className="text-sm text-emerald-200">
            {state.lastReveal.goal ? 'Goal!' : 'Saved!'}{' '}
            {playerName(match, state.lastReveal.winnerUid)} scores the point.
          </p>
          <button
            type="button"
            disabled={busy}
            onClick={cont}
            className="rounded-xl bg-sky-500 px-4 py-2.5 text-sm font-semibold text-white hover:bg-sky-400"
          >
            Next kick
          </button>
        </div>
      ) : null}

      {match.status === 'finished' ? (
        <p className="text-center text-lg font-semibold text-emerald-200">
          {state.matchWinnerUid === match.yourUid ? 'You win!' : `${oppFirst} wins.`}
        </p>
      ) : null}
    </div>
  );
}
