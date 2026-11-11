import React, { useEffect, useMemo, useState } from 'react';
import { formatMoney } from '../lib/coachCapitalist';
import { GameUiBadge, GameUiButton } from './gameUi';

const HOUR_MS = 60 * 60 * 1000;
const MIN_MS = 60 * 1000;

const PRESET_GRANTS = [
  { label: '+30 mins', hours: 0.5, ms: 30 * MIN_MS },
  { label: '+1 Hour', hours: 1, ms: 1 * HOUR_MS },
  { label: '+2 Hours', hours: 2, ms: 2 * HOUR_MS },
  { label: '+3 Hours', hours: 3, ms: 3 * HOUR_MS },
  { label: '+4 Hours', hours: 4, ms: 4 * HOUR_MS },
];

function formatMinsOrHours(ms) {
  const mins = Math.max(0, Number(ms) || 0) / MIN_MS;
  if (mins === 0) return '0m';
  if (mins >= 60 && mins % 60 === 0) {
    const hrs = mins / 60;
    return `${hrs}h (${mins}m)`;
  }
  if (mins >= 60) {
    const hrs = (mins / 60).toFixed(1).replace(/\.0$/, '');
    return `${ Math.round(mins) }m (${hrs}h)`;
  }
  return `${mins % 1 === 0 ? mins : mins.toFixed(1)}m`;
}

async function readJsonSafe(response) {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

export default function CoachCapitalistPlayTimeAdmin({ onPlayTimeUpdated }) {
  const [players, setPlayers] = useState([]);
  const [dayKey, setDayKey] = useState('');
  const [seasonId, setSeasonId] = useState('');
  const [baseCapMs, setBaseCapMs] = useState(HOUR_MS);
  const [loading, setLoading] = useState(true);
  const [busyKey, setBusyKey] = useState('');
  const [error, setError] = useState('');
  const [banner, setBanner] = useState('');

  // Search, filter & selection state
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all'); // all | active | locked | boosted | coachcap
  const [selectedUids, setSelectedUids] = useState([]);
  const [customHours, setCustomHours] = useState('1');
  const [grantReason, setGrantReason] = useState('');

  const loadStatuses = async () => {
    setLoading(true);
    setError('');
    try {
      const response = await fetch('/api/saveCoachCapitalistConfig', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'listPlayTime' }),
      });
      const payload = (await readJsonSafe(response)) || {};
      if (!response.ok) throw new Error(payload.error || 'Failed to load player play times.');
      setPlayers(Array.isArray(payload.players) ? payload.players : []);
      if (payload.dayKey) setDayKey(payload.dayKey);
      if (payload.seasonId) setSeasonId(payload.seasonId);
      if (payload.dailyPlayCapMs) setBaseCapMs(Number(payload.dailyPlayCapMs) || HOUR_MS);
    } catch (err) {
      setError(err.message || 'Failed to load player play times.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadStatuses();
  }, []);

  const showSuccess = (msg) => {
    setBanner(msg);
    window.setTimeout(() => {
      setBanner((prev) => (prev === msg ? '' : prev));
    }, 4500);
  };

  const applyGrantAction = async ({
    uids,
    deltaBonusMs = 0,
    mode = 'add',
    resetPlayed = false,
    resetWeeklyBoosts = false,
    reason = '',
    key = 'batch',
    summaryLabel = 'Updated play time',
  }) => {
    const cleanUids = (Array.isArray(uids) ? uids : [uids]).filter(Boolean);
    if (!cleanUids.length) {
      setError('Select at least one player first.');
      return;
    }
    setBusyKey(key);
    setError('');
    try {
      const response = await fetch('/api/saveCoachCapitalistConfig', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'grantPlayTime',
          uids: cleanUids,
          deltaBonusMs,
          mode,
          resetPlayed,
          resetWeeklyBoosts,
          reason: reason || grantReason || '',
        }),
      });
      const payload = (await readJsonSafe(response)) || {};
      if (!response.ok) throw new Error(payload.error || 'Failed to update play time.');
      if (Array.isArray(payload.players)) {
        setPlayers(payload.players);
      } else {
        await loadStatuses();
      }
      showSuccess(summaryLabel);
      if (onPlayTimeUpdated) {
        onPlayTimeUpdated(payload);
      }
    } catch (err) {
      setError(err.message || 'Failed to update play time.');
    } finally {
      setBusyKey('');
    }
  };

  // Summary metrics
  const stats = useMemo(() => {
    let activeToday = 0;
    let lockedCount = 0;
    let boostedCount = 0;
    let coachCapCount = 0;
    for (const p of players) {
      const played = Number(p.play?.playedMs) || 0;
      const bonus = Number(p.play?.bonusMs) || 0;
      const locked = Boolean(p.play?.locked);
      if (p.hasCoachCap) coachCapCount += 1;
      if (played > 0 || bonus > 0) activeToday += 1;
      if (played > 0 && locked) lockedCount += 1;
      if (bonus > 0) boostedCount += 1;
    }
    return { activeToday, lockedCount, boostedCount, coachCapCount, total: players.length };
  }, [players]);

  const filteredPlayers = useMemo(() => {
    const q = search.trim().toLowerCase();
    return players.filter((p) => {
      if (q && !String(p.fullName || '').toLowerCase().includes(q)) return false;
      const played = Number(p.play?.playedMs) || 0;
      const bonus = Number(p.play?.bonusMs) || 0;
      const locked = Boolean(p.play?.locked);
      if (filter === 'active') return played > 0 || bonus > 0;
      if (filter === 'locked') return played > 0 && locked;
      if (filter === 'boosted') return bonus > 0;
      if (filter === 'coachcap') return Boolean(p.hasCoachCap);
      return true;
    });
  }, [players, search, filter]);

  const toggleSelect = (uid) => {
    setSelectedUids((prev) =>
      prev.includes(uid) ? prev.filter((id) => id !== uid) : [...prev, uid],
    );
  };

  const selectGroup = (groupType) => {
    if (groupType === 'none') {
      setSelectedUids([]);
      return;
    }
    if (groupType === 'locked') {
      setSelectedUids(
        players.filter((p) => (p.play?.playedMs || 0) > 0 && p.play?.locked).map((p) => p.uid),
      );
      return;
    }
    if (groupType === 'active') {
      setSelectedUids(
        players
          .filter((p) => (p.play?.playedMs || 0) > 0 || (p.play?.bonusMs || 0) > 0)
          .map((p) => p.uid),
      );
      return;
    }
    if (groupType === 'filtered') {
      setSelectedUids(filteredPlayers.map((p) => p.uid));
    }
  };

  const parsedCustomHours = useMemo(() => {
    const num = Number(customHours);
    if (!Number.isFinite(num) || num <= 0) return 1;
    return Math.min(24, Math.max(0.25, num));
  }, [customHours]);

  const handleBatchAward = () => {
    if (!selectedUids.length) {
      setError('Tick one or more players below (or use a Quick Select button) to award play hours.');
      return;
    }
    const ms = Math.round(parsedCustomHours * HOUR_MS);
    const selectedNames = players
      .filter((p) => selectedUids.includes(p.uid))
      .map((p) => p.fullName);
    const labelNames =
      selectedNames.length <= 3
        ? selectedNames.join(', ')
        : `${selectedNames.slice(0, 2).join(', ')} +${selectedNames.length - 2} more`;

    applyGrantAction({
      uids: selectedUids,
      deltaBonusMs: ms,
      mode: 'add',
      reason: grantReason || `+${parsedCustomHours}h admin award`,
      key: 'batch-award',
      summaryLabel: `Awarded +${parsedCustomHours} hour${parsedCustomHours === 1 ? '' : 's'} (+${Math.round(parsedCustomHours * 60)} mins) to ${labelNames}!`,
    });
  };

  return (
    <div className="space-y-4">
      {/* Header & Summary Card */}
      <div className="rounded-xl border border-slate-700 bg-slate-900/75 p-3.5 sm:p-4 space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="gui-font text-base sm:text-lg text-amber-300 flex items-center gap-2">
              <span>⏱️ Coach Capitalist — Play Hours &amp; Daily Cap Admin</span>
            </h3>
            <p className="text-xs text-slate-300 mt-0.5">
              Grant extra daily play hours to individual users or groups. Awards take effect immediately on their next heartbeat or page refresh.
            </p>
          </div>
          <div className="flex items-center gap-2">
            {dayKey ? (
              <span className="rounded-md border border-slate-700 bg-slate-950/80 px-2.5 py-1 text-[11px] text-slate-300 font-mono">
                📅 {dayKey} {seasonId ? `· ${seasonId}` : ''}
              </span>
            ) : null}
            <GameUiButton
              size="sm"
              variant="neutral"
              disabled={loading || Boolean(busyKey)}
              onClick={loadStatuses}
            >
              {loading ? 'Loading…' : '↻ Refresh'}
            </GameUiButton>
          </div>
        </div>

        {/* Stat tiles */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <div className="rounded-lg border border-slate-700/80 bg-slate-950/60 px-3 py-2">
            <p className="text-[10px] uppercase tracking-wider text-slate-400">Active Today</p>
            <p className="gui-font text-base text-sky-300 tabular-nums mt-0.5">
              {stats.activeToday} <span className="text-xs text-slate-500 font-normal">/ {stats.coachCapCount} players</span>
            </p>
          </div>
          <div className="rounded-lg border border-rose-500/35 bg-rose-950/20 px-3 py-2">
            <p className="text-[10px] uppercase tracking-wider text-rose-300/90">Capped / Locked Today</p>
            <p className="gui-font text-base text-rose-300 tabular-nums mt-0.5">
              {stats.lockedCount} <span className="text-xs text-rose-200/60 font-normal">at 0m left</span>
            </p>
          </div>
          <div className="rounded-lg border border-emerald-500/35 bg-emerald-950/20 px-3 py-2">
            <p className="text-[10px] uppercase tracking-wider text-emerald-300/90">Boosted Today</p>
            <p className="gui-font text-base text-emerald-300 tabular-nums mt-0.5">
              {stats.boostedCount} <span className="text-xs text-emerald-200/60 font-normal">with bonus hrs</span>
            </p>
          </div>
          <div className="rounded-lg border border-amber-500/35 bg-amber-950/20 px-3 py-2">
            <p className="text-[10px] uppercase tracking-wider text-amber-300/90">Standard Daily Cap</p>
            <p className="gui-font text-base text-amber-300 tabular-nums mt-0.5">
              {formatMinsOrHours(baseCapMs)} <span className="text-xs text-amber-200/60 font-normal">/ London day</span>
            </p>
          </div>
        </div>
      </div>

      {/* Multi-Select / Batch Award Bar */}
      <div className="rounded-xl border-2 border-amber-400/40 bg-gradient-to-r from-amber-500/10 via-slate-900/80 to-emerald-500/10 p-3.5 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="gui-font text-sm text-amber-200">
              🎁 Batch Award Extra Play Hours ({selectedUids.length} player{selectedUids.length === 1 ? '' : 's'} selected)
            </p>
            <p className="text-[11px] text-slate-300">
              Tick players below or use quick-select, choose how many hours to add, and click Award. (Or use the instant <strong>+1h</strong> button on any row!)
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
            <span className="text-slate-400 mr-1">Quick select:</span>
            <button
              type="button"
              onClick={() => selectGroup('locked')}
              className="rounded border border-rose-400/50 bg-rose-500/15 hover:bg-rose-500/25 px-2 py-1 text-rose-200 font-semibold transition"
            >
              🔴 Capped Today ({stats.lockedCount})
            </button>
            <button
              type="button"
              onClick={() => selectGroup('active')}
              className="rounded border border-sky-400/50 bg-sky-500/15 hover:bg-sky-500/25 px-2 py-1 text-sky-200 font-semibold transition"
            >
              🟢 Active Today ({stats.activeToday})
            </button>
            <button
              type="button"
              onClick={() => selectGroup('filtered')}
              className="rounded border border-slate-600 bg-slate-800 hover:bg-slate-700 px-2 py-1 text-slate-200 transition"
            >
              All Shown ({filteredPlayers.length})
            </button>
            {selectedUids.length > 0 ? (
              <button
                type="button"
                onClick={() => selectGroup('none')}
                className="rounded border border-slate-700 bg-slate-900 hover:bg-slate-800 px-2 py-1 text-slate-400 hover:text-white transition"
              >
                ✕ Clear ({selectedUids.length})
              </button>
            ) : null}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 pt-1">
          <div className="flex flex-wrap items-center gap-1.5">
            {PRESET_GRANTS.map((preset) => {
              const active = Number(customHours) === preset.hours;
              return (
                <button
                  key={preset.label}
                  type="button"
                  onClick={() => setCustomHours(String(preset.hours))}
                  className={`rounded-lg px-2.5 py-1.5 text-xs font-bold border transition ${
                    active
                      ? 'border-amber-300 bg-amber-400 text-slate-950 shadow'
                      : 'border-slate-700 bg-slate-900/90 text-slate-200 hover:border-amber-400/50'
                  }`}
                >
                  {preset.label}
                </button>
              );
            })}
          </div>

          <div className="flex items-center gap-1.5 bg-slate-950/80 border border-slate-700 rounded-lg px-2.5 py-1">
            <label className="text-[11px] text-slate-400">Hours:</label>
            <input
              type="number"
              step="0.5"
              min="0.25"
              max="24"
              value={customHours}
              onChange={(e) => setCustomHours(e.target.value)}
              className="w-16 bg-transparent text-xs font-bold text-amber-300 focus:outline-none tabular-nums"
            />
            <span className="text-[10px] text-slate-500">
              ({Math.round(parsedCustomHours * 60)}m)
            </span>
          </div>

          <input
            type="text"
            value={grantReason}
            maxLength={120}
            onChange={(e) => setGrantReason(e.target.value)}
            placeholder="Optional note (e.g. Bonus hour)"
            className="flex-1 min-w-[11rem] rounded-lg border border-slate-700 bg-slate-950/80 px-2.5 py-1.5 text-xs text-white placeholder-slate-500 focus:border-amber-400 focus:outline-none"
          />

          <GameUiButton
            size="sm"
            variant="success"
            disabled={!selectedUids.length || Boolean(busyKey)}
            onClick={handleBatchAward}
          >
            {busyKey === 'batch-award'
              ? 'Awarding…'
              : `⏱️ Award +${parsedCustomHours}h to Selected (${selectedUids.length})`}
          </GameUiButton>
        </div>
      </div>

      {/* Feedback banners */}
      {banner ? (
        <div className="rounded-xl border border-emerald-400/50 bg-emerald-500/20 px-3.5 py-2.5 text-xs font-semibold text-emerald-100 flex items-center justify-between gap-2">
          <span>✓ {banner}</span>
          <button
            type="button"
            onClick={() => setBanner('')}
            className="text-emerald-200 hover:text-white text-xs px-1"
          >
            ✕
          </button>
        </div>
      ) : null}

      {error ? (
        <div className="rounded-xl border border-rose-400/50 bg-rose-500/20 px-3.5 py-2.5 text-xs font-semibold text-rose-100 flex items-center justify-between gap-2">
          <span>⚠️ {error}</span>
          <button
            type="button"
            onClick={() => setError('')}
            className="text-rose-200 hover:text-white text-xs px-1"
          >
            ✕
          </button>
        </div>
      ) : null}

      {/* Search & Filter Controls */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1.5 text-xs">
          {[
            ['all', `All Staff (${stats.total})`],
            ['coachcap', `Coach Cap Players (${stats.coachCapCount})`],
            ['active', `Played / Boosted Today (${stats.activeToday})`],
            ['locked', `🔴 Capped Today (${stats.lockedCount})`],
            ['boosted', `⚡ Boosted Today (${stats.boostedCount})`],
          ].map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setFilter(key)}
              className={`rounded-md px-2.5 py-1 font-medium transition ${
                filter === key
                  ? 'bg-amber-500/25 text-amber-200 border border-amber-400/50'
                  : 'bg-slate-800/80 text-slate-400 hover:text-slate-200 border border-slate-700/60'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="relative min-w-[14rem] flex-1 sm:flex-initial">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search user by name…"
            className="w-full rounded-lg border border-slate-700 bg-slate-950/90 pl-3 pr-7 py-1.5 text-xs text-white placeholder-slate-500 focus:border-amber-400 focus:outline-none"
          />
          {search ? (
            <button
              type="button"
              onClick={() => setSearch('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-slate-400 hover:text-white"
            >
              ✕
            </button>
          ) : null}
        </div>
      </div>

      {/* Players Table / List */}
      {loading && !players.length ? (
        <div className="rounded-xl border border-slate-800 bg-slate-900/50 py-10 text-center text-sm text-slate-400">
          Loading player play-time records…
        </div>
      ) : filteredPlayers.length === 0 ? (
        <div className="rounded-xl border border-slate-800 bg-slate-900/50 py-8 text-center text-sm text-slate-400">
          No users match the current filter.
        </div>
      ) : (
        <div className="space-y-2 max-h-[min(68vh,700px)] overflow-y-auto pr-1">
          {filteredPlayers.map((row) => {
            const play = row.play || {};
            const playedMs = Math.max(0, Number(play.playedMs) || 0);
            const bonusMs = Math.max(0, Number(play.bonusMs) || 0);
            const effectiveCapMs = Math.max(baseCapMs, Number(play.effectiveCapMs) || baseCapMs + bonusMs);
            const remainingMs = Math.max(0, Number(play.remainingMs) ?? effectiveCapMs - playedMs);
            const isLocked = playedMs > 0 && (play.locked || remainingMs <= 0);
            const isSelected = selectedUids.includes(row.uid);
            const pctUsed = effectiveCapMs > 0 ? Math.min(100, Math.round((playedMs / effectiveCapMs) * 100)) : 0;
            const weeklyUsed = Number(play.timeBoost?.weeklyUsed) || 0;
            const weeklyLimit = Number(play.timeBoost?.weeklyLimit) || 2;
            const rowBusy = busyKey.startsWith(`row:${row.uid}:`);

            return (
              <div
                key={row.uid}
                className={`rounded-xl border-2 px-3 py-2.5 transition flex flex-col lg:flex-row lg:items-center justify-between gap-3 ${
                  isSelected
                    ? 'border-amber-400/70 bg-amber-500/10'
                    : isLocked
                      ? 'border-rose-500/45 bg-rose-950/20'
                      : bonusMs > 0
                        ? 'border-emerald-500/40 bg-emerald-950/15'
                        : 'border-slate-700/80 bg-slate-900/65'
                }`}
              >
                {/* Left: Checkbox + Player Identity + Status Badges */}
                <div className="flex items-start sm:items-center gap-3 min-w-0 flex-1">
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => toggleSelect(row.uid)}
                    className="mt-1 sm:mt-0 h-4 w-4 rounded border-slate-600 bg-slate-950 text-amber-400 focus:ring-amber-400 cursor-pointer shrink-0"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="gui-font text-sm text-white truncate">{row.fullName}</span>
                      {row.rank ? (
                        <span className="rounded bg-slate-800 border border-slate-600 px-1.5 py-0.2 text-[10px] font-bold text-amber-300 tabular-nums">
                          #{row.rank} · {formatMoney(row.lifetimeEarnings)}
                        </span>
                      ) : row.hasCoachCap ? (
                        <span className="rounded bg-slate-800/80 px-1.5 py-0.2 text-[10px] text-slate-400">
                          Player
                        </span>
                      ) : (
                        <span className="rounded bg-slate-800/50 px-1.5 py-0.2 text-[10px] text-slate-500">
                          Staff
                        </span>
                      )}

                      {isLocked ? (
                        <GameUiBadge tone="red">🔴 Capped (0m left)</GameUiBadge>
                      ) : playedMs > 0 ? (
                        <GameUiBadge tone="green">🟢 {formatMinsOrHours(remainingMs)} left</GameUiBadge>
                      ) : (
                        <GameUiBadge tone="slate">⚪ {formatMinsOrHours(remainingMs)} available</GameUiBadge>
                      )}

                      {bonusMs > 0 ? (
                        <span className="rounded bg-emerald-500/20 border border-emerald-400/40 px-1.5 py-0.5 text-[10px] font-bold text-emerald-200 tabular-nums">
                          ⚡ +{formatMinsOrHours(bonusMs)} bonus today
                        </span>
                      ) : null}
                    </div>

                    {/* Progress bar + detailed breakdown */}
                    <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-300">
                      <div className="w-28 sm:w-36 h-2 rounded-full bg-slate-950 overflow-hidden border border-slate-700 shrink-0">
                        <div
                          className={`h-full transition-all duration-300 ${
                            isLocked
                              ? 'bg-rose-500'
                              : pctUsed >= 75
                                ? 'bg-amber-400'
                                : 'bg-emerald-400'
                          }`}
                          style={{ width: `${pctUsed}%` }}
                        />
                      </div>
                      <span className="tabular-nums">
                        Played: <strong className="text-white">{formatMinsOrHours(playedMs)}</strong> / Cap:{' '}
                        <strong className="text-amber-200">{formatMinsOrHours(effectiveCapMs)}</strong>
                      </span>
                      <span className="tabular-nums">
                        Remaining:{' '}
                        <strong className={isLocked ? 'text-rose-300' : 'text-emerald-300'}>
                          {formatMinsOrHours(remainingMs)}
                        </strong>
                      </span>
                      <span className="text-slate-400 tabular-nums">
                        Wk coin boosts: <strong>{weeklyUsed}/{weeklyLimit}</strong>
                      </span>
                      {row.lastGrantedByName ? (
                        <span className="text-[10px] text-sky-300/90">
                          · Awarded by {row.lastGrantedByName}
                          {row.lastGrantReason ? ` (${row.lastGrantReason})` : ''}
                        </span>
                      ) : null}
                    </div>
                  </div>
                </div>

                {/* Right: Quick Action Buttons */}
                <div className="flex flex-wrap items-center gap-1.5 shrink-0 pl-7 lg:pl-0">
                  <GameUiButton
                    size="sm"
                    variant="neutral"
                    disabled={Boolean(busyKey)}
                    onClick={() =>
                      applyGrantAction({
                        uids: [row.uid],
                        deltaBonusMs: 30 * MIN_MS,
                        mode: 'add',
                        reason: '+30m admin grant',
                        key: `row:${row.uid}:30m`,
                        summaryLabel: `Granted +30 mins extra play time to ${row.fullName}!`,
                      })
                    }
                    title={`Add +30 minutes of play time for ${row.fullName}`}
                  >
                    {busyKey === `row:${row.uid}:30m` ? '…' : '+30m'}
                  </GameUiButton>

                  <GameUiButton
                    size="sm"
                    variant="success"
                    disabled={Boolean(busyKey)}
                    onClick={() =>
                      applyGrantAction({
                        uids: [row.uid],
                        deltaBonusMs: HOUR_MS,
                        mode: 'add',
                        reason: '+1h admin grant',
                        key: `row:${row.uid}:1h`,
                        summaryLabel: `Granted +1 hour (+60 mins) extra play time to ${row.fullName}!`,
                      })
                    }
                    title={`Add +1 hour (+60 minutes) of play time for ${row.fullName}`}
                  >
                    {busyKey === `row:${row.uid}:1h` ? '…' : '+1 hr'}
                  </GameUiButton>

                  <GameUiButton
                    size="sm"
                    variant="primary"
                    disabled={Boolean(busyKey)}
                    onClick={() =>
                      applyGrantAction({
                        uids: [row.uid],
                        deltaBonusMs: 2 * HOUR_MS,
                        mode: 'add',
                        reason: '+2h admin grant',
                        key: `row:${row.uid}:2h`,
                        summaryLabel: `Granted +2 hours (+120 mins) extra play time to ${row.fullName}!`,
                      })
                    }
                    title={`Add +2 hours (+120 minutes) of play time for ${row.fullName}`}
                  >
                    {busyKey === `row:${row.uid}:2h` ? '…' : '+2 hrs'}
                  </GameUiButton>

                  {playedMs > 0 ? (
                    <GameUiButton
                      size="sm"
                      variant="warning"
                      disabled={Boolean(busyKey)}
                      onClick={() =>
                        applyGrantAction({
                          uids: [row.uid],
                          deltaBonusMs: 0,
                          mode: 'add',
                          resetPlayed: true,
                          reason: 'Reset played time today',
                          key: `row:${row.uid}:resetPlayed`,
                          summaryLabel: `Reset today's used play time to 0m for ${row.fullName}!`,
                        })
                      }
                      title="Reset today's used play time back to 0 minutes"
                    >
                      ↺ Reset Used
                    </GameUiButton>
                  ) : null}

                  {bonusMs > 0 ? (
                    <button
                      type="button"
                      disabled={Boolean(busyKey) || rowBusy}
                      onClick={() =>
                        applyGrantAction({
                          uids: [row.uid],
                          deltaBonusMs: 0,
                          mode: 'set',
                          reason: 'Cleared bonus time',
                          key: `row:${row.uid}:clearBonus`,
                          summaryLabel: `Cleared bonus play time for ${row.fullName}.`,
                        })
                      }
                      className="rounded-md border border-rose-500/40 bg-rose-950/40 hover:bg-rose-900/50 px-2 py-1 text-[11px] font-semibold text-rose-200 transition disabled:opacity-50"
                      title="Remove bonus time granted today"
                    >
                      ✕ Clear Bonus
                    </button>
                  ) : null}

                  {weeklyUsed > 0 ? (
                    <button
                      type="button"
                      disabled={Boolean(busyKey) || rowBusy}
                      onClick={() =>
                        applyGrantAction({
                          uids: [row.uid],
                          deltaBonusMs: 0,
                          mode: 'add',
                          resetWeeklyBoosts: true,
                          reason: 'Reset weekly coin boost limit',
                          key: `row:${row.uid}:resetWk`,
                          summaryLabel: `Reset weekly coin boost limit (0/2) for ${row.fullName}!`,
                        })
                      }
                      className="rounded-md border border-sky-500/40 bg-sky-950/40 hover:bg-sky-900/50 px-2 py-1 text-[11px] font-semibold text-sky-200 transition disabled:opacity-50"
                      title="Reset weekly 2× portal coin boost counter back to 0/2"
                    >
                      🪙 Reset Wk
                    </button>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
