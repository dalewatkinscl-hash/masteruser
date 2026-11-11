import { firstName, opponentName, playerName, sendMove } from '../../lib/multiplayerApi';

const CHOICES = [
  { id: 'rock', label: 'Rock' },
  { id: 'paper', label: 'Paper' },
  { id: 'scissors', label: 'Scissors' },
];

export default function RpsMatch({ match, onMatch, busy, setBusy, setError, opponentLabel }) {
  const state = match.state || {};
  const myChoice = state.choices?.[match.yourUid];
  const hostScore = state.scores?.[match.hostUid] || 0;
  const guestScore = state.scores?.[match.guestUid] || 0;
  const oppFirst = firstName(opponentLabel || opponentName(match));

  const choose = async (choice) => {
    if (busy || state.phase !== 'choose' || myChoice) return;
    setBusy(true);
    setError('');
    try {
      onMatch(await sendMove(match.id, 'choose', { choice }));
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
      <p className="text-center text-xs text-slate-500">vs {oppFirst} · First to 3 · Point {state.point || 1}</p>

      {state.phase === 'choose' && match.status === 'playing' ? (
        <div className="space-y-3">
          <p className="text-center text-sm text-slate-300">
            {myChoice ? `Locked in — waiting for ${oppFirst}…` : `Pick your throw vs ${oppFirst}`}
          </p>
          <div className="grid grid-cols-3 gap-2 max-w-md mx-auto">
            {CHOICES.map((c) => (
              <button
                key={c.id}
                type="button"
                disabled={busy || Boolean(myChoice)}
                onClick={() => choose(c.id)}
                className={`rounded-xl border px-3 py-4 text-sm font-semibold disabled:opacity-40 ${
                  myChoice === c.id
                    ? 'border-sky-400 bg-sky-500/30 text-white'
                    : 'border-white/15 bg-black/40 text-white hover:bg-white/10'
                }`}
              >
                {c.label}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {state.phase === 'reveal' && state.lastReveal ? (
        <div className="rounded-2xl border border-white/10 bg-black/30 px-4 py-5 text-center space-y-2">
          <p className="text-sm text-slate-200">
            {match.hostName}: <strong className="capitalize text-white">{state.lastReveal.choices?.[match.hostUid]}</strong>
            {' · '}
            {match.guestName}: <strong className="capitalize text-white">{state.lastReveal.choices?.[match.guestUid]}</strong>
          </p>
          <p className="text-sm text-emerald-200">
            {state.lastReveal.winnerUid
              ? `${playerName(match, state.lastReveal.winnerUid)} wins the point`
              : 'Tie — no point'}
          </p>
          <button
            type="button"
            disabled={busy}
            onClick={cont}
            className="rounded-xl bg-sky-500 px-4 py-2.5 text-sm font-semibold text-white hover:bg-sky-400"
          >
            Next point
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
