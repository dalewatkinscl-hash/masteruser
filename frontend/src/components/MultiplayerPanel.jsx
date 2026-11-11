import { useCallback, useEffect, useRef, useState } from 'react';
import {
  createMatch,
  firstName,
  getMatch,
  joinMatch,
  leaveMatch,
  listGames,
  listLobbies,
  listLocalGames,
  opponentName,
  sendMove,
} from '../lib/multiplayerApi';
import ConnectFourMatch from './multiplayer/ConnectFourMatch';
import ReactionDuelMatch from './multiplayer/ReactionDuelMatch';
import RpsMatch from './multiplayer/RpsMatch';
import PenaltyMatch from './multiplayer/PenaltyMatch';
import PlainSightMatch from './multiplayer/PlainSightMatch';

const LOBBY_POLL_MS = 1500;
const MATCH_POLL_MS = 500;
const GAMES_POLL_MS = 2500;

function formatAge(createdAt) {
  if (!createdAt) return '';
  const ms = Date.now() - new Date(createdAt).getTime();
  if (!Number.isFinite(ms) || ms < 0) return 'just now';
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s ago`;
  return `${Math.floor(s / 60)}m ago`;
}

export default function MultiplayerPanel() {
  const fallbackGames = listLocalGames();
  const [view, setView] = useState('games'); // games | lobby | match
  const [gameKey, setGameKey] = useState(null);
  const [games, setGames] = useState(fallbackGames);
  const [lobbies, setLobbies] = useState([]);
  const [match, setMatch] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [loadingLobbies, setLoadingLobbies] = useState(false);
  const [joinBanner, setJoinBanner] = useState('');
  const sawGuestRef = useRef(false);

  const meta = games.find((g) => g.key === gameKey) || fallbackGames.find((g) => g.key === gameKey);

  const refreshGames = useCallback(async () => {
    try {
      const payload = await listGames();
      if (Array.isArray(payload.games) && payload.games.length) {
        setGames(payload.games);
      }
    } catch {
      /* keep local list */
    }
  }, []);

  const refreshLobbies = useCallback(async (key = gameKey) => {
    if (!key) return;
    setLoadingLobbies(true);
    try {
      const payload = await listLobbies(key);
      setLobbies(Array.isArray(payload.lobbies) ? payload.lobbies : []);
      setError('');
    } catch (err) {
      setError(err.message || 'Failed to load lobbies.');
    } finally {
      setLoadingLobbies(false);
    }
  }, [gameKey]);

  useEffect(() => {
    if (view !== 'games') return undefined;
    refreshGames();
    const id = window.setInterval(refreshGames, GAMES_POLL_MS);
    return () => window.clearInterval(id);
  }, [view, refreshGames]);

  useEffect(() => {
    if (view !== 'lobby' || !gameKey) return undefined;
    refreshLobbies(gameKey);
    const id = window.setInterval(() => refreshLobbies(gameKey), LOBBY_POLL_MS);
    return () => window.clearInterval(id);
  }, [view, gameKey, refreshLobbies]);

  useEffect(() => {
    if (view !== 'match' || !match?.id) return undefined;
    let cancelled = false;
    const isFast = match?.gameKey === 'plainsight' && match?.status === 'playing';
    const interval = isFast ? 200 : MATCH_POLL_MS;
    const tick = async () => {
      try {
        const next = await getMatch(match.id);
        if (!cancelled) setMatch(next);
      } catch {
        /* keep last */
      }
    };
    const id = window.setInterval(tick, interval);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [view, match?.id, match?.gameKey, match?.status]);

  useEffect(() => {
    if (view === 'match' && match?.status === 'abandoned') {
      setError('Lobby was cancelled.');
      setView('lobby');
      setMatch(null);
      setJoinBanner('');
      sawGuestRef.current = false;
    }
  }, [view, match?.status]);

  // Show "{Name} joined!" when the opponent seat fills
  useEffect(() => {
    if (view !== 'match' || !match) return;
    if (match.status === 'waiting') {
      sawGuestRef.current = false;
      return;
    }
    if ((match.status === 'playing' || match.status === 'finished') && match.guestUid && !sawGuestRef.current) {
      sawGuestRef.current = true;
      const name = match.youAreHost
        ? firstName(match.guestName)
        : firstName(match.hostName);
      setJoinBanner(`${name} joined!`);
      const t = window.setTimeout(() => setJoinBanner(''), 4500);
      return () => window.clearTimeout(t);
    }
    return undefined;
  }, [view, match?.status, match?.guestUid, match?.guestName, match?.hostName, match?.youAreHost]);

  const openGame = (key) => {
    setGameKey(key);
    setMatch(null);
    setError('');
    setJoinBanner('');
    sawGuestRef.current = false;
    setView('lobby');
  };

  const backToGames = () => {
    setView('games');
    setGameKey(null);
    setMatch(null);
    setError('');
    setJoinBanner('');
    sawGuestRef.current = false;
  };

  const backToLobby = () => {
    setView('lobby');
    setMatch(null);
    setError('');
    setJoinBanner('');
    sawGuestRef.current = false;
    refreshLobbies(gameKey);
  };

  const onCreate = async () => {
    if (!gameKey || busy) return;
    setBusy(true);
    setError('');
    setJoinBanner('');
    sawGuestRef.current = false;
    try {
      const created = await createMatch(gameKey);
      setMatch(created);
      setView('match');
      window.dispatchEvent(new CustomEvent('cl-multiplayer-changed'));
    } catch (err) {
      setError(err.message || 'Could not create lobby.');
    } finally {
      setBusy(false);
    }
  };

  const onJoin = async (matchId) => {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      const joined = await joinMatch(matchId);
      setMatch(joined);
      setView('match');
      // Joiner already knows host — still celebrate
      setJoinBanner(`Joined ${firstName(joined.hostName)}!`);
      sawGuestRef.current = true;
      window.setTimeout(() => setJoinBanner(''), 4500);
      window.dispatchEvent(new CustomEvent('cl-multiplayer-changed'));
    } catch (err) {
      setError(err.message || 'Could not join.');
      refreshLobbies(gameKey);
    } finally {
      setBusy(false);
    }
  };

  const onLeave = async () => {
    if (!match?.id || busy) return;
    setBusy(true);
    setError('');
    try {
      await leaveMatch(match.id);
      setMatch(null);
      setView('lobby');
      setJoinBanner('');
      sawGuestRef.current = false;
      refreshLobbies(gameKey);
      window.dispatchEvent(new CustomEvent('cl-multiplayer-changed'));
    } catch (err) {
      setError(err.message || 'Could not leave.');
    } finally {
      setBusy(false);
    }
  };

  const onForfeit = async () => {
    if (!match?.id || busy) return;
    setBusy(true);
    setError('');
    try {
      const next = await sendMove(match.id, 'forfeit');
      setMatch(next);
      window.dispatchEvent(new CustomEvent('cl-multiplayer-changed'));
    } catch (err) {
      setError(err.message || 'Forfeit failed.');
    } finally {
      setBusy(false);
    }
  };

  if (view === 'games') {
    return (
      <div className="space-y-4 w-full max-w-3xl mx-auto">
        <div>
          <h2 className="text-lg font-semibold text-white">Multiplayer</h2>
          <p className="text-sm text-slate-400 mt-1">
            1v1 minigames. Create a lobby or join one that’s waiting for an opponent.
          </p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          {games.map((g) => {
            const open = Number(g.openLobbies) || 0;
            const lit = open > 0;
            return (
              <button
                key={g.key}
                type="button"
                onClick={() => openGame(g.key)}
                className={`relative rounded-2xl border px-4 py-5 text-left transition-colors ${
                  lit
                    ? 'border-amber-400/70 bg-amber-500/15 shadow-[0_0_24px_rgba(251,191,36,0.25)] hover:bg-amber-500/20'
                    : 'border-[#243352] bg-[#0d1524] hover:border-sky-500/50 hover:bg-[#121c2e]'
                }`}
              >
                {lit ? (
                  <span className="absolute right-3 top-3 inline-flex items-center gap-1.5 rounded-full bg-amber-400 px-2.5 py-1 text-[11px] font-bold text-slate-900 animate-pulse">
                    <span className="h-1.5 w-1.5 rounded-full bg-slate-900" />
                    {open} waiting
                  </span>
                ) : null}
                <div className={`text-base font-semibold ${lit ? 'text-amber-50' : 'text-white'}`}>
                  {g.label}
                </div>
                <div className={`mt-1 text-sm ${lit ? 'text-amber-100/80' : 'text-slate-400'}`}>
                  {g.description}
                </div>
                {lit ? (
                  <div className="mt-3 text-xs font-semibold uppercase tracking-wide text-amber-300">
                    Open lobby — tap to join
                  </div>
                ) : null}
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  if (view === 'lobby') {
    const openSeats = lobbies.filter((m) => !m.youAreHost);
    return (
      <div className="space-y-4 w-full max-w-2xl mx-auto">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <button
              type="button"
              onClick={backToGames}
              className="text-xs text-slate-500 hover:text-sky-300"
            >
              ← All games
            </button>
            <h2 className="mt-1 text-lg font-semibold text-white">{meta?.label || 'Lobby'}</h2>
            <p className="text-sm text-slate-400">{meta?.description}</p>
          </div>
          <button
            type="button"
            disabled={busy}
            onClick={onCreate}
            className="rounded-xl bg-emerald-500 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-400 disabled:opacity-40"
          >
            Create game
          </button>
        </div>

        {error ? <p className="text-sm text-rose-300">{error}</p> : null}

        <div className={`rounded-2xl border overflow-hidden ${
          openSeats.length
            ? 'border-amber-400/50 shadow-[0_0_20px_rgba(251,191,36,0.15)]'
            : 'border-[#243352]'
        }`}
        >
          <div className="px-4 py-3 border-b border-[#243352] flex items-center justify-between bg-amber-500/5">
            <h3 className="text-sm font-semibold text-sky-200">Open seats</h3>
            <span className="text-[11px] text-slate-500">
              {loadingLobbies ? 'Refreshing…' : `${openSeats.length} waiting`}
            </span>
          </div>
          {!openSeats.length ? (
            <p className="px-5 py-10 text-sm text-slate-500 text-center">
              Nobody waiting — create a game and hang on for a challenger.
            </p>
          ) : (
            <ul className="divide-y divide-[#1a2540]">
              {openSeats.map((m) => (
                <li
                  key={m.id}
                  className="px-4 py-4 flex flex-wrap items-center justify-between gap-3 bg-amber-500/10"
                >
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-amber-200 animate-pulse">
                      Waiting for opponent
                    </div>
                    <div className="text-sm text-white truncate">{m.hostName}</div>
                    <div className="text-[11px] text-slate-500">{formatAge(m.createdAt)}</div>
                  </div>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => onJoin(m.id)}
                    className="shrink-0 rounded-xl bg-amber-400 px-5 py-3 text-sm font-bold text-slate-900 hover:bg-amber-300 disabled:opacity-40 shadow-lg"
                  >
                    Join
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    );
  }

  const waiting = match?.status === 'waiting';
  const playing = match?.status === 'playing';
  const finished = match?.status === 'finished';
  const GameBody = {
    connect4: ConnectFourMatch,
    reaction: ReactionDuelMatch,
    rps: RpsMatch,
    penalty: PenaltyMatch,
    plainsight: PlainSightMatch,
  }[match?.gameKey];
  const opp = opponentName(match);

  return (
    <div className="space-y-4 w-full max-w-2xl mx-auto">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <button
            type="button"
            onClick={waiting ? onLeave : backToLobby}
            className="text-xs text-slate-500 hover:text-sky-300"
          >
            ← {waiting ? 'Cancel lobby' : 'Back to lobby'}
          </button>
          <h2 className="mt-1 text-lg font-semibold text-white">{meta?.label || 'Match'}</h2>
          <p className="text-sm text-slate-400">
            {waiting
              ? 'Waiting for an opponent to join…'
              : `vs ${opp}`}
          </p>
        </div>
        {playing ? (
          <button
            type="button"
            disabled={busy}
            onClick={onForfeit}
            className="rounded-lg border border-rose-400/40 px-3 py-1.5 text-xs text-rose-200 hover:bg-rose-500/10"
          >
            Forfeit
          </button>
        ) : null}
        {finished ? (
          <button
            type="button"
            onClick={backToLobby}
            className="rounded-xl bg-sky-500 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-400"
          >
            Play again
          </button>
        ) : null}
      </div>

      {joinBanner ? (
        <div className="fixed sm:absolute top-16 left-1/2 -translate-x-1/2 z-50 pointer-events-none rounded-xl border border-emerald-400/40 bg-emerald-600/90 backdrop-blur-md px-6 py-2.5 text-center text-sm font-semibold text-white shadow-[0_10px_25px_rgba(0,0,0,0.5)] animate-pulse">
          {joinBanner}
        </div>
      ) : null}

      {error ? <p className="text-sm text-rose-300">{error}</p> : null}

      {waiting ? (
        <div className="rounded-2xl border-2 border-dashed border-amber-400/50 bg-amber-500/10 px-6 py-12 text-center">
          <div className="text-amber-200 text-lg font-semibold">Waiting for opponent</div>
          <p className="mt-2 text-sm text-slate-300">
            Your lobby is open. Someone can join from the {meta?.label} list.
          </p>
          <button
            type="button"
            disabled={busy}
            onClick={onLeave}
            className="mt-6 rounded-lg border border-white/20 px-4 py-2 text-sm text-white/80 hover:bg-white/5"
          >
            Cancel
          </button>
        </div>
      ) : null}

      {(playing || finished) && GameBody ? (
        <div className="rounded-2xl border border-[#243352] bg-[#0d1524] p-4 sm:p-5">
          <GameBody
            match={match}
            onMatch={setMatch}
            busy={busy}
            setBusy={setBusy}
            setError={setError}
            opponentLabel={opp}
          />
        </div>
      ) : null}
      {(playing || finished) && !GameBody ? (
        <p className="text-sm text-rose-300 text-center py-8">
          Unknown game type ({match?.gameKey || '—'}).
        </p>
      ) : null}
    </div>
  );
}
