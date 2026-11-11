import { firstName, opponentName, sendMove } from '../../lib/multiplayerApi';

export default function ConnectFourMatch({
  match, onMatch, busy, setBusy, setError, opponentLabel,
}) {
  const state = match.state || {};
  const board = state.board || [];
  const yourTurn = match.status === 'playing' && state.turnUid === match.yourUid;
  const hostIsYou = match.youAreHost;
  const opp = opponentLabel || opponentName(match);
  const oppFirst = firstName(opp);

  const drop = async (col) => {
    if (!yourTurn || busy) return;
    setBusy(true);
    setError('');
    try {
      const next = await sendMove(match.id, 'drop', { col });
      onMatch(next);
    } catch (err) {
      setError(err.message || 'Move failed.');
    } finally {
      setBusy(false);
    }
  };

  const finished = match.status === 'finished';
  const youWon = finished && !state.draw && state.winnerUid === match.yourUid;

  return (
    <div className="space-y-3">
      <p className="text-center text-xs text-slate-500">Playing {opp}</p>

      {finished ? (
        <div
          className={`rounded-2xl px-4 py-5 text-center shadow-lg ${
            state.draw
              ? 'border border-white/20 bg-slate-700/40'
              : youWon
                ? 'border border-emerald-400/50 bg-emerald-500/20'
                : 'border border-rose-400/40 bg-rose-500/15'
          }`}
        >
          <div className="text-2xl sm:text-3xl font-black tracking-tight text-white">
            {state.draw
              ? 'It’s a draw!'
              : youWon
                ? 'You win!'
                : `${oppFirst} wins!`}
          </div>
          <p className="mt-1 text-sm text-white/75">
            {state.draw
              ? 'Board is full — no four in a row.'
              : youWon
                ? `Nice one against ${oppFirst}.`
                : `${oppFirst} got four in a row.`}
          </p>
        </div>
      ) : (
        <p className="text-sm text-slate-300 text-center">
          {yourTurn ? 'Your turn — tap a column.' : `Waiting for ${oppFirst}…`}
        </p>
      )}

      <div className="mx-auto w-full max-w-sm rounded-2xl bg-[#1a3a6b] p-3 shadow-inner">
        <div className="mb-2 grid grid-cols-7 gap-1.5">
          {Array.from({ length: 7 }, (_, col) => (
            <button
              key={`h-${col}`}
              type="button"
              disabled={!yourTurn || busy || finished}
              onClick={() => drop(col)}
              className="h-8 rounded-lg bg-sky-400/20 text-xs font-semibold text-sky-100 hover:bg-sky-400/35 disabled:opacity-40"
            >
              ↓
            </button>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-1.5">
          {board.flatMap((row, r) => row.map((cell, c) => {
            const isHostDisc = cell === 1;
            const isGuestDisc = cell === 2;
            const yours = (hostIsYou && isHostDisc) || (!hostIsYou && isGuestDisc);
            return (
              <div
                key={`${r}-${c}`}
                className="aspect-square rounded-full border border-black/20 bg-[#0c2448]"
              >
                {cell ? (
                  <div
                    className={`h-full w-full rounded-full shadow ${
                      yours ? 'bg-amber-400' : 'bg-rose-500'
                    }`}
                  />
                ) : null}
              </div>
            );
          }))}
        </div>
      </div>
      <div className="flex justify-center gap-4 text-xs text-slate-400">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-3 w-3 rounded-full bg-amber-400" /> You
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-3 w-3 rounded-full bg-rose-500" /> {oppFirst}
        </span>
      </div>
    </div>
  );
}
