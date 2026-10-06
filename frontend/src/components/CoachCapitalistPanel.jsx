import { useEffect, useMemo, useReducer, useRef, useState } from 'react';
import {
  DEPOTS,
  applyNameOverrides,
  buyAngelUpgrade,
  buyBusinesses,
  buyCashUpgrade,
  buyCost,
  buyManager,
  computeMultipliers,
  draftNameConfig,
  formatDuration,
  formatMoney,
  getDepot,
  loadState,
  maxAffordable,
  nextUnlockAt,
  normalizeNameConfig,
  pendingAngels,
  resetDepot,
  saveState,
  startCycle,
  syncDepotUnlocks,
  tickDepot,
  totalLifetimeEarnings,
  totalRevenuePerSecond,
} from '../lib/coachCapitalist';
import { GameUiBadge, GameUiButton, GameUiModal, GameUiPanel, GameUiProgress } from './gameUi';

const BUY_MODES = [1, 10, 100, 'max'];
const EMPTY_NAMES = { depots: {} };

async function readJsonResponse(res) {
  const contentType = res.headers.get('content-type') || '';
  if (!contentType.includes('application/json')) return null;
  try {
    return await res.json();
  } catch {
    return null;
  }
}

function reducer(state, action) {
  switch (action.type) {
    case 'replace':
      return action.state;
    case 'patchDepot': {
      const id = action.depotId;
      const next = {
        ...state,
        depots: {
          ...state.depots,
          [id]: action.depotState,
        },
      };
      return syncDepotUnlocks(next);
    }
    case 'setBuyMode':
      return { ...state, buyMode: action.mode };
    case 'setActiveDepot':
      return { ...state, activeDepot: action.depotId };
    default:
      return state;
  }
}

function BusIcon({ colour = '#38bdf8', className = 'w-10 h-10' }) {
  return (
    <svg className={className} viewBox="0 0 64 64" fill="none" aria-hidden>
      <rect x="8" y="14" width="48" height="28" rx="6" fill={colour} stroke="#0f172a" strokeWidth="2" />
      <rect x="12" y="18" width="14" height="10" rx="2" fill="#e2e8f0" opacity="0.9" />
      <rect x="28" y="18" width="14" height="10" rx="2" fill="#e2e8f0" opacity="0.9" />
      <rect x="44" y="18" width="8" height="10" rx="2" fill="#bae6fd" opacity="0.95" />
      <circle cx="20" cy="44" r="5" fill="#0f172a" />
      <circle cx="44" cy="44" r="5" fill="#0f172a" />
      <circle cx="20" cy="44" r="2.2" fill="#94a3b8" />
      <circle cx="44" cy="44" r="2.2" fill="#94a3b8" />
      <path d="M8 34h48" stroke="#0f172a" strokeWidth="1.5" opacity="0.35" />
    </svg>
  );
}

function BusinessRow({
  biz,
  index,
  owned,
  managed,
  cash,
  buyMode,
  stats,
  progress,
  running,
  onRun,
  onBuy,
  adminMode = false,
  onRename,
}) {
  const costQty = buyMode === 'max'
    ? maxAffordable(biz.baseCost, biz.coefficient, owned, cash)
    : Math.max(1, Number(buyMode) || 1);
  const cost = buyCost(biz.baseCost, biz.coefficient, owned, Math.max(1, costQty || 1));
  const canBuy = owned > 0
    ? (buyMode === 'max' ? costQty > 0 : cash >= cost)
    : cash >= buyCost(biz.baseCost, biz.coefficient, 0, 1);
  const unlockAt = nextUnlockAt(owned);
  const locked = owned <= 0 && cash < biz.baseCost && index > 0;
  const showCost = owned <= 0
    ? buyCost(biz.baseCost, biz.coefficient, 0, 1)
    : (buyMode === 'max' && costQty > 0 ? cost : buyCost(biz.baseCost, biz.coefficient, owned, Math.max(1, Number(buyMode) || 1)));

  return (
    <div
      className={`rounded-xl border-2 overflow-hidden transition-opacity ${
        locked ? 'opacity-45 border-slate-600/60 bg-slate-900/40' : 'border-slate-700/80 bg-slate-900/70'
      }`}
    >
      <div className="flex items-stretch gap-0">
        <button
          type="button"
          disabled={owned <= 0 || running || managed}
          onClick={onRun}
          className="relative w-[5.5rem] sm:w-28 shrink-0 flex flex-col items-center justify-center gap-1 p-2 border-r-2 border-slate-700/80 hover:bg-white/5 disabled:cursor-default disabled:hover:bg-transparent"
          title={managed ? 'Manager running' : running ? 'On a job…' : 'Send on a job'}
        >
          <BusIcon colour={biz.colour} className="w-12 h-12 sm:w-14 sm:h-14" />
          <span className="gui-font-narrow text-[10px] sm:text-xs text-slate-200 tabular-nums">{owned}</span>
        </button>

        <div className="flex-1 min-w-0 p-2.5 sm:p-3 space-y-2">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              {adminMode ? (
                <input
                  type="text"
                  value={biz.name}
                  maxLength={80}
                  onChange={(e) => onRename?.(biz.id, e.target.value)}
                  className="gui-font w-full text-[11px] sm:text-sm text-white bg-slate-950/80 border border-amber-400/40 rounded-md px-2 py-1"
                  title="Rename vehicle (admin)"
                />
              ) : (
                <p className="gui-font text-[11px] sm:text-sm text-white truncate">{biz.name}</p>
              )}
              <p className="text-[10px] sm:text-xs text-slate-400 mt-0.5">
                {owned > 0
                  ? `${formatMoney(stats.cycleRevenue)} / ${formatDuration(stats.time)}`
                  : `Unlock ${formatMoney(biz.baseCost)}`}
              </p>
              {owned > 0 ? (
                <p className="gui-font-narrow text-sm sm:text-base text-amber-300 tabular-nums mt-0.5">
                  {formatMoney(stats.revenuePerSecond)}/s
                </p>
              ) : null}
            </div>
            {managed ? (
              <GameUiBadge tone="green" className="shrink-0 text-[10px]">Auto</GameUiBadge>
            ) : null}
          </div>

          <div className="relative">
            <GameUiProgress
              value={owned > 0 && (running || managed) ? progress : 0}
              max={1}
              colour={managed ? 'green' : 'blue'}
              className="h-5 sm:h-6"
            />
          </div>

          <div className="flex items-center justify-between gap-2">
            <p className="text-[10px] text-slate-500">
              {unlockAt ? `Next unlock @ ${unlockAt}` : 'Max early unlocks'}
            </p>
            <GameUiButton
              size="md"
              variant={canBuy ? 'success' : 'neutral'}
              disabled={!canBuy && owned > 0}
              onClick={onBuy}
              className="!min-w-[8.5rem] !px-3 !py-2"
            >
              <span className="flex flex-col items-center leading-tight">
                <span className="text-[10px] uppercase tracking-wide opacity-80">
                  {owned <= 0 ? 'Buy' : `x${buyMode === 'max' ? (costQty || 0) : buyMode}`}
                </span>
                <span className="gui-font text-base sm:text-lg tabular-nums">
                  {formatMoney(showCost)}
                </span>
              </span>
            </GameUiButton>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function CoachCapitalistPanel({ sandbox = false, isAdmin = false }) {
  const [state, dispatch] = useReducer(reducer, null, loadState);
  const [tab, setTab] = useState('fleet'); // fleet | managers | upgrades | angels
  const [resetOpen, setResetOpen] = useState(false);
  const [toast, setToast] = useState('');
  const [adminMode, setAdminMode] = useState(false);
  const [nameConfig, setNameConfig] = useState(EMPTY_NAMES);
  const [namesDirty, setNamesDirty] = useState(false);
  const [namesSaving, setNamesSaving] = useState(false);
  const [namesError, setNamesError] = useState('');
  const [leaderboard, setLeaderboard] = useState([]);
  const [leaderboardLoading, setLeaderboardLoading] = useState(false);
  const [leaderboardError, setLeaderboardError] = useState('');
  const lastSyncedEarnings = useRef(0);
  const stateRef = useRef(state);
  stateRef.current = state;

  const baseDepot = getDepot(state.activeDepot);
  const depot = useMemo(
    () => applyNameOverrides(baseDepot, nameConfig),
    [baseDepot, nameConfig],
  );
  const depotState = state.depots[state.activeDepot];
  const mult = computeMultipliers(depot, depotState);
  const rps = totalRevenuePerSecond(depot, depotState);
  const pending = pendingAngels(depot, depotState);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const response = await fetch('/api/getCoachCapitalistConfig', { credentials: 'include' });
        const payload = (await readJsonResponse(response)) || {};
        if (!response.ok) throw new Error(payload.error || 'Failed to load names.');
        if (!cancelled) {
          setNameConfig(draftNameConfig(payload.names));
          setNamesDirty(false);
        }
      } catch {
        // Keep defaults if config unavailable.
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Tick loop + persistence
  useEffect(() => {
    const id = window.setInterval(() => {
      const cur = stateRef.current;
      const d = applyNameOverrides(getDepot(cur.activeDepot), nameConfig);
      const nextDepot = tickDepot(d, cur.depots[cur.activeDepot]);
      dispatch({ type: 'patchDepot', depotId: cur.activeDepot, depotState: nextDepot });
    }, 100);
    return () => window.clearInterval(id);
  }, [nameConfig]);

  useEffect(() => {
    // Also tick inactive depots slowly for offline managers when switching
    const id = window.setInterval(() => {
      const cur = stateRef.current;
      let changed = false;
      const depots = { ...cur.depots };
      for (const d of DEPOTS) {
        if (d.id === cur.activeDepot) continue;
        if (!depots[d.id]?.unlocked) continue;
        if (!depots[d.id].managers?.some(Boolean)) continue;
        depots[d.id] = tickDepot(applyNameOverrides(d, nameConfig), depots[d.id]);
        changed = true;
      }
      if (changed) {
        dispatch({ type: 'replace', state: syncDepotUnlocks({ ...cur, depots }) });
      }
    }, 2000);
    return () => window.clearInterval(id);
  }, [nameConfig]);

  useEffect(() => {
    saveState(state);
  }, [state]);

  const syncScore = async () => {
    const total = totalLifetimeEarnings(stateRef.current);
    if (!(total > 0) || total <= lastSyncedEarnings.current) {
      return { ok: true, lifetimeEarnings: lastSyncedEarnings.current, skipped: true };
    }
    const response = await fetch('/api/syncCoachCapitalistScore', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lifetimeEarnings: total }),
    });
    const payload = (await readJsonResponse(response)) || {};
    if (!response.ok) {
      throw new Error(payload.error || 'Failed to sync score.');
    }
    const next = Math.max(
      lastSyncedEarnings.current,
      Number(payload.lifetimeEarnings) || total,
    );
    lastSyncedEarnings.current = next;
    return { ok: true, lifetimeEarnings: next, skipped: false };
  };

  // Periodic sync — independent of the 100ms tick so the timer is not constantly reset.
  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      try {
        if (!cancelled) await syncScore();
      } catch {
        /* ignore background sync failures */
      }
    };
    run();
    const id = window.setInterval(run, 15000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!toast) return undefined;
    const t = window.setTimeout(() => setToast(''), 2200);
    return () => window.clearTimeout(t);
  }, [toast]);

  const loadLeaderboard = async () => {
    if (!isAdmin) return;
    try {
      setLeaderboardLoading(true);
      setLeaderboardError('');
      // Push this browser's score first so the board isn't empty for the current admin.
      try {
        await syncScore();
      } catch (syncErr) {
        setLeaderboardError(syncErr.message || 'Score sync failed.');
      }
      const response = await fetch('/api/adminCoachCapitalistLeaderboard', { credentials: 'include' });
      const payload = (await readJsonResponse(response)) || {};
      if (!response.ok) throw new Error(payload.error || 'Failed to load leaderboard.');
      setLeaderboard(Array.isArray(payload.leaderboard) ? payload.leaderboard : []);
    } catch (err) {
      setLeaderboardError(err.message || 'Failed to load leaderboard.');
    } finally {
      setLeaderboardLoading(false);
    }
  };

  useEffect(() => {
    if (isAdmin && tab === 'leaderboard') {
      loadLeaderboard();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reload when opening the tab
  }, [isAdmin, tab]);

  const patch = (nextDepotState) => {
    dispatch({ type: 'patchDepot', depotId: state.activeDepot, depotState: nextDepotState });
  };

  const patchDepotNames = (mutator) => {
    setNameConfig((prev) => {
      const next = draftNameConfig(prev);
      const entry = {
        ...(Object.prototype.hasOwnProperty.call(next.depots[state.activeDepot] || {}, 'name')
          ? { name: next.depots[state.activeDepot].name }
          : {}),
        businesses: { ...(next.depots[state.activeDepot]?.businesses || {}) },
        upgrades: { ...(next.depots[state.activeDepot]?.upgrades || {}) },
      };
      mutator(entry, baseDepot);
      next.depots[state.activeDepot] = entry;
      return next;
    });
    setNamesDirty(true);
    setNamesError('');
  };

  const renameBusiness = (businessId, name) => {
    patchDepotNames((entry) => {
      entry.businesses[businessId] = String(name ?? '').slice(0, 80);
    });
  };

  const renameDepot = (name) => {
    patchDepotNames((entry) => {
      entry.name = String(name ?? '').slice(0, 80);
    });
  };

  const renameUpgrade = (upgradeId, name) => {
    patchDepotNames((entry) => {
      entry.upgrades[upgradeId] = String(name ?? '').slice(0, 80);
    });
  };

  const saveNames = async () => {
    try {
      setNamesSaving(true);
      setNamesError('');
      const cleaned = normalizeNameConfig(nameConfig);
      const response = await fetch('/api/saveCoachCapitalistConfig', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ names: cleaned }),
      });
      const payload = (await readJsonResponse(response)) || {};
      if (!response.ok) throw new Error(payload.error || 'Failed to save names.');
      setNameConfig(draftNameConfig(payload.names));
      setNamesDirty(false);
      setToast('Titles saved for everyone');
    } catch (err) {
      setNamesError(err.message || 'Failed to save names.');
    } finally {
      setNamesSaving(false);
    }
  };

  const affordables = depot.cashUpgrades.filter(
    (u) => !(depotState.upgrades || []).includes(u.id) && depotState.cash >= u.cost * 0.01,
  ).slice(0, 40);

  const angelAfford = depot.angelUpgrades.filter(
    (u) => !(depotState.angelUpgrades || []).includes(u.id),
  );

  return (
    <div className={`w-full space-y-3 ${sandbox ? 'max-w-5xl mx-auto' : ''}`}>
      <GameUiPanel title="Coach Capitalist" header="blue" dark className="overflow-visible relative">
        <div className="space-y-3">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="gui-font text-2xl sm:text-3xl text-amber-300 tabular-nums tracking-wide">
                {formatMoney(depotState.cash)}
              </p>
              <p className="text-xs text-slate-400 mt-1">
                {rps > 0 ? `${formatMoney(rps)}/s with managers` : 'Click a vehicle to send it on a job'}
                {' · '}
                Lifetime {formatMoney(depotState.lifetimeEarnings)}
              </p>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {isAdmin ? (
                <GameUiButton
                  size="sm"
                  variant={adminMode ? 'warning' : 'neutral'}
                  pressed={adminMode}
                  onClick={() => setAdminMode((v) => !v)}
                >
                  {adminMode ? 'Admin on' : 'Admin'}
                </GameUiButton>
              ) : null}
              {BUY_MODES.map((mode) => (
                <GameUiButton
                  key={String(mode)}
                  size="sm"
                  variant={state.buyMode === mode ? 'accent' : 'neutral'}
                  pressed={state.buyMode === mode}
                  onClick={() => dispatch({ type: 'setBuyMode', mode })}
                >
                  x{mode === 'max' ? 'Max' : mode}
                </GameUiButton>
              ))}
            </div>
          </div>

          {adminMode && isAdmin ? (
            <div className="rounded-xl border-2 border-amber-400/40 bg-amber-500/10 px-3 py-2 flex flex-wrap items-center gap-2">
              <p className="text-xs text-amber-100 flex-1 min-w-[12rem]">
                Admin rename mode — edit fleet / depot / upgrade titles. Saves for all players.
              </p>
              <GameUiButton
                size="sm"
                variant="accent"
                disabled={!namesDirty || namesSaving}
                onClick={saveNames}
              >
                {namesSaving ? 'Saving…' : namesDirty ? 'Save titles' : 'Saved'}
              </GameUiButton>
              {namesError ? <p className="text-xs text-rose-300 w-full">{namesError}</p> : null}
            </div>
          ) : null}

          {/* Depot pages */}
          <div className="flex flex-wrap gap-2">
            {DEPOTS.map((d) => {
              const ds = state.depots[d.id];
              const locked = !ds.unlocked;
              const labeled = applyNameOverrides(d, nameConfig);
              const active = state.activeDepot === d.id;
              return (
                <div
                  key={d.id}
                  className={`rounded-lg px-3 py-2 text-left border-2 min-w-[8.5rem] ${
                    active
                      ? 'border-sky-400 bg-sky-500/20 text-white'
                      : locked
                        ? 'border-slate-700 bg-slate-900/50 text-slate-500'
                        : 'border-slate-600 bg-slate-800/60 text-slate-200'
                  }`}
                >
                  {adminMode && isAdmin && active ? (
                    <input
                      type="text"
                      value={labeled.name}
                      maxLength={80}
                      onChange={(e) => renameDepot(e.target.value)}
                      className="gui-font-narrow w-full text-xs uppercase tracking-wider bg-slate-950/70 border border-amber-400/40 rounded px-1.5 py-0.5 text-white"
                    />
                  ) : (
                    <button
                      type="button"
                      disabled={locked}
                      onClick={() => dispatch({ type: 'setActiveDepot', depotId: d.id })}
                      className="w-full text-left disabled:cursor-not-allowed"
                      title={locked ? d.unlockHint : d.blurb}
                    >
                      <p className="gui-font-narrow text-xs uppercase tracking-wider">{labeled.name}</p>
                    </button>
                  )}
                  <button
                    type="button"
                    disabled={locked}
                    onClick={() => dispatch({ type: 'setActiveDepot', depotId: d.id })}
                    className="w-full text-left disabled:cursor-not-allowed"
                    title={locked ? d.unlockHint : d.blurb}
                  >
                    <p className="text-[10px] mt-0.5 opacity-80 truncate">
                      {locked ? 'Locked' : d.blurb}
                    </p>
                  </button>
                </div>
              );
            })}
          </div>

          <div className="flex flex-wrap gap-1.5 border-b border-slate-700 pb-2">
            {[
              ['fleet', 'Fleet'],
              ['managers', 'Managers'],
              ['upgrades', 'Upgrades'],
              ['angels', 'Backers'],
              ...(isAdmin ? [['leaderboard', 'Leaderboard']] : []),
            ].map(([id, label]) => (
              <GameUiButton
                key={id}
                size="sm"
                variant={tab === id ? 'primary' : 'neutral'}
                pressed={tab === id}
                onClick={() => setTab(id)}
              >
                {label}
              </GameUiButton>
            ))}
            <div className="flex-1" />
            <GameUiButton size="sm" variant="warning" onClick={() => setResetOpen(true)}>
              Claim {pending > 0 ? formatMoney(pending, { symbol: '' }) : '0'} backers
            </GameUiButton>
          </div>

          {tab === 'fleet' ? (
            <div className="space-y-2 max-h-[min(70vh,720px)] overflow-y-auto pr-1">
              {depot.businesses.map((biz, i) => (
                <BusinessRow
                  key={biz.id}
                  biz={biz}
                  index={i}
                  owned={depotState.owned[i] || 0}
                  managed={depotState.managers[i]}
                  cash={depotState.cash}
                  buyMode={state.buyMode}
                  stats={mult.perBusiness[i]}
                  progress={depotState.progress[i] || 0}
                  running={depotState.running[i]}
                  adminMode={adminMode && isAdmin}
                  onRename={renameBusiness}
                  onRun={() => patch(startCycle(depot, depotState, i))}
                  onBuy={() => {
                    const next = buyBusinesses(depot, depotState, i, state.buyMode);
                    if (next.owned[i] !== depotState.owned[i]) {
                      setToast(`Bought ${biz.name}`);
                    }
                    patch(next);
                  }}
                />
              ))}
            </div>
          ) : null}

          {tab === 'managers' ? (
            <div className="grid sm:grid-cols-2 gap-2 max-h-[min(70vh,720px)] overflow-y-auto">
              {depot.managers.map((mgr, i) => {
                const owned = depotState.owned[i] || 0;
                const have = depotState.managers[i];
                const can = !have && owned > 0 && depotState.cash >= mgr.cost;
                return (
                  <div
                    key={mgr.name}
                    className="rounded-xl border-2 border-slate-700 bg-slate-900/60 p-3 flex items-center gap-3"
                  >
                    <BusIcon colour={depot.businesses[i]?.colour} className="w-10 h-10 shrink-0" />
                    <div className="min-w-0 flex-1">
                      <p className="gui-font text-sm text-white truncate">{mgr.name}</p>
                      <p className="text-[11px] text-slate-400 truncate">
                        Runs {depot.businesses[i]?.name}
                      </p>
                    </div>
                    {have ? (
                      <GameUiBadge tone="green">Hired</GameUiBadge>
                    ) : (
                      <GameUiButton
                        size="md"
                        variant={can ? 'success' : 'neutral'}
                        disabled={!can}
                        onClick={() => {
                          patch(buyManager(depot, depotState, i));
                          setToast(`Hired ${mgr.name}`);
                        }}
                        className="!px-3"
                      >
                        <span className="gui-font text-base tabular-nums">{formatMoney(mgr.cost)}</span>
                      </GameUiButton>
                    )}
                  </div>
                );
              })}
            </div>
          ) : null}

          {tab === 'upgrades' ? (
            <div className="space-y-2 max-h-[min(70vh,720px)] overflow-y-auto">
              <p className="text-xs text-slate-400">
                Cash upgrades (Adventure Capitalist pricing). Showing near-affordable and owned tiers.
              </p>
              {affordables.length === 0 ? (
                <p className="text-sm text-slate-500 py-6 text-center">Keep earning — upgrades unlock as you grow.</p>
              ) : null}
              {affordables.map((up) => {
                const can = depotState.cash >= up.cost;
                const target = up.business === 'all'
                  ? 'All fleet'
                  : up.business === 'angel'
                    ? 'Backer power'
                    : depot.businesses[up.business]?.name;
                return (
                  <div
                    key={up.id}
                    className="rounded-xl border-2 border-slate-700 bg-slate-900/60 p-3 flex items-center justify-between gap-3"
                  >
                    <div className="min-w-0 flex-1">
                      {adminMode && isAdmin ? (
                        <input
                          type="text"
                          value={up.name}
                          maxLength={80}
                          onChange={(e) => renameUpgrade(up.id, e.target.value)}
                          className="gui-font w-full text-sm text-white bg-slate-950/80 border border-amber-400/40 rounded-md px-2 py-1 mb-1"
                        />
                      ) : (
                        <p className="gui-font text-sm text-white">{up.name}</p>
                      )}
                      <p className="text-[11px] text-slate-400">
                        {target}
                        {up.multiplier ? ` · ×${up.multiplier}` : ''}
                        {up.angelBonus ? ` · +${(up.angelBonus * 100).toFixed(0)}% backer strength` : ''}
                      </p>
                    </div>
                    <GameUiButton
                      size="md"
                      variant={can ? 'accent' : 'neutral'}
                      disabled={!can}
                      onClick={() => {
                        patch(buyCashUpgrade(depot, depotState, up.id));
                        setToast(up.name);
                      }}
                      className="!px-3"
                    >
                      <span className="gui-font text-base tabular-nums">{formatMoney(up.cost)}</span>
                    </GameUiButton>
                  </div>
                );
              })}
            </div>
          ) : null}

          {tab === 'angels' ? (
            <div className="space-y-3 max-h-[min(70vh,720px)] overflow-y-auto">
              <div className="rounded-xl border-2 border-amber-500/40 bg-amber-500/10 p-4">
                <p className="gui-font text-amber-200 text-sm">Silent partners (backers)</p>
                <p className="text-2xl gui-font text-amber-300 mt-1 tabular-nums">
                  {formatMoney(depotState.angels, { symbol: '' })}
                </p>
                <p className="text-xs text-amber-100/80 mt-2">
                  Each backer boosts all profits by {(mult.angelRate * 100).toFixed(0)}%.
                  Pending on reset: {formatMoney(pending, { symbol: '' })}.
                  Spent: {formatMoney(depotState.angelsSpent || 0, { symbol: '' })}.
                </p>
              </div>
              {angelAfford.map((up) => {
                const can = depotState.angels >= up.cost;
                return (
                  <div
                    key={up.id}
                    className="rounded-xl border-2 border-slate-700 bg-slate-900/60 p-3 flex items-center justify-between gap-3"
                  >
                    <div className="min-w-0">
                      <p className="gui-font text-sm text-white">{up.name}</p>
                      <p className="text-[11px] text-slate-400">
                        {up.multiplier ? `Profits ×${up.multiplier}` : ''}
                        {up.angelBonus ? `+${(up.angelBonus * 100).toFixed(0)}% backer strength` : ''}
                        {up.flatOwned ? `+${up.flatOwned} vehicles` : ''}
                      </p>
                    </div>
                    <GameUiButton
                      size="sm"
                      variant={can ? 'warning' : 'neutral'}
                      disabled={!can}
                      onClick={() => {
                        patch(buyAngelUpgrade(depot, depotState, up.id));
                        setToast(up.name);
                      }}
                    >
                      {formatMoney(up.cost, { symbol: '' })} backers
                    </GameUiButton>
                  </div>
                );
              })}
            </div>
          ) : null}

          {tab === 'leaderboard' && isAdmin ? (
            <div className="space-y-3 max-h-[min(70vh,720px)] overflow-y-auto">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs text-slate-400">
                  All-time lifetime earnings across depots. Admin only. Opens sync your score, then loads the board.
                  Other players sync automatically every 15s while the game is open.
                </p>
                <GameUiButton size="sm" variant="neutral" disabled={leaderboardLoading} onClick={loadLeaderboard}>
                  {leaderboardLoading ? 'Loading…' : 'Refresh'}
                </GameUiButton>
              </div>
              {leaderboardError ? <p className="text-xs text-rose-300">{leaderboardError}</p> : null}
              {leaderboardLoading && !leaderboard.length ? (
                <p className="text-sm text-slate-500 py-6 text-center">Loading leaderboard…</p>
              ) : !leaderboard.length ? (
                <p className="text-sm text-slate-500 py-6 text-center">No scores yet — play and wait a few seconds for sync.</p>
              ) : (
                <ol className="space-y-1.5">
                  {leaderboard.map((row, i) => (
                    <li
                      key={row.uid}
                      className="rounded-xl border-2 border-slate-700 bg-slate-900/60 px-3 py-2.5 flex items-center gap-3"
                    >
                      <span className="gui-font-narrow text-sm text-slate-400 w-7 tabular-nums">{i + 1}</span>
                      <div className="min-w-0 flex-1">
                        <p className="gui-font text-sm text-white truncate">{row.fullName}</p>
                        {row.updatedAt ? (
                          <p className="text-[10px] text-slate-500">
                            Updated {new Date(row.updatedAt).toLocaleString()}
                          </p>
                        ) : null}
                      </div>
                      <span className="gui-font text-sm sm:text-base text-amber-300 tabular-nums shrink-0">
                        {formatMoney(row.lifetimeEarnings)}
                      </span>
                    </li>
                  ))}
                </ol>
              )}
              <p className="text-[10px] text-slate-500">
                Your current total: {formatMoney(totalLifetimeEarnings(state))}
              </p>
            </div>
          ) : null}

          {toast ? (
            <p className="text-center text-xs text-sky-300 gui-font-narrow uppercase tracking-wider">{toast}</p>
          ) : null}
        </div>
      </GameUiPanel>

      <GameUiModal
        open={resetOpen}
        onClose={() => setResetOpen(false)}
        title="Claim backers?"
        header="yellow"
        dark
        confirmLabel="Reset & claim"
        confirmVariant="warning"
        cancelLabel="Cancel"
        onConfirm={() => {
          const claimed = pendingAngels(depot, depotState);
          patch(resetDepot(depot, depotState));
          setResetOpen(false);
          setToast(`Claimed ${formatMoney(claimed, { symbol: '' })} backers`);
        }}
      >
        <p className="text-sm text-slate-200">
          Reset <strong>{depot.name}</strong> to claim{' '}
          <strong>{formatMoney(pending, { symbol: '' })}</strong> silent partners.
          Cash, vehicles, managers, and cash upgrades reset. Backers and backer upgrades stay.
        </p>
        <p className="text-xs text-slate-400">
          Same prestige loop as Adventure Capitalist angel investors — formula uses lifetime earnings.
        </p>
      </GameUiModal>
    </div>
  );
}

export function CoachCapitalistSandbox() {
  return (
    <div className="space-y-3">
      <p className="text-sm text-slate-400">
        Dev sandbox — progress saves in this browser under <code className="text-slate-300">coach-capitalist-v1</code>.
      </p>
      <CoachCapitalistPanel sandbox isAdmin />
    </div>
  );
}
