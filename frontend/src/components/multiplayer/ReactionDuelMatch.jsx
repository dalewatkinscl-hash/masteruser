import { useEffect, useRef, useState } from 'react';
import { firstName, opponentName, playerName, sendMove } from '../../lib/multiplayerApi';

export default function ReactionDuelMatch({ match, onMatch, busy, setBusy, setError, opponentLabel }) {
  const state = match.state || {};
  const [green, setGreen] = useState(false);
  const timerRef = useRef(0);
  const clickedRef = useRef(false);

  useEffect(() => {
    clickedRef.current = false;
    setGreen(false);
    if (timerRef.current) window.clearTimeout(timerRef.current);
    if (state.phase !== 'waiting' || !state.goAt || !match.serverNow) return undefined;
    const delay = Math.max(0, Number(state.goAt) - Number(match.serverNow));
    timerRef.current = window.setTimeout(() => setGreen(true), delay);
    return () => {
      if (timerRef.current) window.clearTimeout(timerRef.current);
    };
  }, [state.phase, state.goAt, match.serverNow, state.round]);

  const ready = async () => {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      onMatch(await sendMove(match.id, 'ready'));
    } catch (err) {
      setError(err.message || 'Ready failed.');
    } finally {
      setBusy(false);
    }
  };

  const click = async () => {
    if (busy || clickedRef.current || state.phase !== 'waiting') return;
    clickedRef.current = true;
    setBusy(true);
    setError('');
    try {
      onMatch(await sendMove(match.id, 'click'));
    } catch (err) {
      setError(err.message || 'Click failed.');
      clickedRef.current = false;
    } finally {
      setBusy(false);
    }
  };

  const youReady = Boolean(state.ready?.[match.yourUid]);
  const hostScore = state.scores?.[match.hostUid] || 0;
  const guestScore = state.scores?.[match.guestUid] || 0;
  const oppFirst = firstName(opponentLabel || opponentName(match));

  return (
    <div className="space-y-4">
      <div className="flex justify-center gap-6 text-sm text-slate-300">
        <span>{match.hostName}: <strong className="text-white">{hostScore}</strong></span>
        <span>{match.guestName}: <strong className="text-white">{guestScore}</strong></span>
      </div>
      <p className="text-center text-xs text-slate-500">
        vs {oppFirst} · Best of 3 · Round {state.round || 1}
      </p>

      {(state.phase === 'ready' || state.phase === 'roundResult') && match.status === 'playing' ? (
        <div className="rounded-2xl border border-white/10 bg-black/30 px-4 py-6 text-center space-y-3">
          {state.phase === 'roundResult' ? (
            <p className="text-sm text-slate-200">
              {state.falseStartUid
                ? `${playerName(match, state.falseStartUid)} false-started.`
                : null}
              {' '}
              {state.roundWinnerUid === match.yourUid ? 'You took the round.' : `${oppFirst} took the round.`}
            </p>
          ) : (
            <p className="text-sm text-slate-300">Both players ready up. Then wait for green — don’t jump early.</p>
          )}
          <button
            type="button"
            disabled={busy || (state.phase === 'ready' && youReady)}
            onClick={ready}
            className="rounded-xl bg-emerald-500 px-5 py-3 text-sm font-semibold text-white hover:bg-emerald-400 disabled:opacity-40"
          >
            {youReady ? `Waiting for ${oppFirst}…` : state.phase === 'roundResult' ? 'Ready for next round' : 'Ready'}
          </button>
        </div>
      ) : null}

      {state.phase === 'waiting' ? (
        <button
          type="button"
          onClick={click}
          disabled={busy}
          className={`mx-auto flex h-48 w-full max-w-md items-center justify-center rounded-3xl text-2xl font-bold shadow-lg transition-colors ${
            green
              ? 'bg-emerald-400 text-slate-900 animate-pulse'
              : 'bg-rose-700 text-white'
          }`}
        >
          {green ? 'GO — tap!' : 'Wait…'}
        </button>
      ) : null}

      {match.status === 'finished' ? (
        <p className="text-center text-lg font-semibold text-emerald-200">
          {state.matchWinnerUid === match.yourUid ? 'You win the duel!' : `${oppFirst} wins the duel.`}
        </p>
      ) : null}
    </div>
  );
}
