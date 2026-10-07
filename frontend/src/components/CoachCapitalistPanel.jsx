import { useEffect, useMemo, useReducer, useRef, useState } from 'react';
import {
  DEPOTS,
  applyAwayEarnings,
  applyNameOverrides,
  isCoachCapQuietHours,
  buyAngelUpgrade,
  buyBusinesses,
  buyCashUpgrade,
  buyCost,
  buyManager,
  claimBackers,
  computeMultipliers,
  depotLifetimeWeight,
  depotPriceMult,
  draftNameConfig,
  formatDuration,
  formatMoney,
  acknowledgeForceReset,
  currentForceResetAck,
  getDepot,
  loadState,
  maxAffordable,
  nextUnlockAtForBusiness,
  normalizeGameState,
  normalizeNameConfig,
  pendingAngels,
  pickRicherState,
  saveState,
  startCycle,
  syncDepotUnlocks,
  tickDepot,
  totalLifetimeEarnings,
  totalRevenuePerSecond,
} from '../lib/coachCapitalist';
import { GameUiBadge, GameUiButton, GameUiModal, GameUiPanel } from './gameUi';

const BUY_MODES = [1, 10, 100, 'max'];
const EMPTY_NAMES = { depots: {} };
const CLOUD_SAVE_DEBOUNCE_MS = 4000;

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

/** AdCap switches to marching stripes when a cycle is under ~1s (bar would just flicker). */
const STRIPE_TIME_SEC = 1;

function BusinessRow({
  biz,
  index,
  owned,
  managed,
  cash,
  priceMult = 1,
  buyMode,
  stats,
  progress,
  running,
  lastTick = 0,
  onRun,
  onBuy,
  adminMode = false,
  onRename,
}) {
  const fillRef = useRef(null);
  const timerRef = useRef(null);
  const animRef = useRef({ progress, lastTick, time: stats.time, active: false, stripe: false });

  const mult = priceMult > 0 ? priceMult : 1;
  const affordCash = cash / mult;
  const costQty = buyMode === 'max'
    ? maxAffordable(biz.baseCost, biz.coefficient, owned, affordCash)
    : Math.max(1, Number(buyMode) || 1);
  const rawCost = buyCost(biz.baseCost, biz.coefficient, owned, Math.max(1, costQty || 1));
  const unlockRaw = buyCost(biz.baseCost, biz.coefficient, 0, 1);
  const cost = rawCost * mult;
  const unlockCost = unlockRaw * mult;
  const canBuy = owned > 0
    ? (buyMode === 'max' ? costQty > 0 : cash >= cost)
    : cash >= unlockCost;
  const unlockAt = nextUnlockAtForBusiness(biz, owned);
  const locked = owned <= 0 && cash < unlockCost && index > 0;
  const showCost = owned <= 0
    ? unlockCost
    : (buyMode === 'max' && costQty > 0
      ? cost
      : buyCost(biz.baseCost, biz.coefficient, owned, Math.max(1, Number(buyMode) || 1)) * mult);
  const buyLabel = owned <= 0
    ? 'Buy'
    : `Buy x${buyMode === 'max' ? (costQty || 0) : buyMode}`;

  const active = owned > 0 && (running || managed);
  // Fast businesses: full striped bar (AdCap cash/sec look). Slow: normal fill.
  const stripe = active && stats.time > 0 && stats.time < STRIPE_TIME_SEC;
  animRef.current = {
    progress,
    lastTick,
    time: stats.time,
    active,
    stripe,
  };

  // Imperative rAF: glide the fill / timer between economy ticks (no React 60fps)
  useEffect(() => {
    const fillEl = fillRef.current;
    const timerEl = timerRef.current;
    if (!fillEl) return undefined;

    if (!active) {
      fillEl.classList.remove('ccap-arrow__fill--stripe');
      fillEl.style.width = '0%';
      if (timerEl) timerEl.textContent = formatDuration(stats.time);
      return undefined;
    }

    if (stripe) {
      fillEl.classList.add('ccap-arrow__fill--stripe');
      fillEl.style.width = '100%';
      if (timerEl) timerEl.textContent = formatDuration(stats.time);
      return undefined;
    }

    fillEl.classList.remove('ccap-arrow__fill--stripe');
    let raf = 0;
    const loop = () => {
      const a = animRef.current;
      let p = a.progress;
      if (a.time > 0 && a.lastTick > 0) {
        p = Math.max(0, Math.min(0.999, a.progress + ((Date.now() - a.lastTick) / 1000) / a.time));
      }
      fillEl.style.width = `${p * 100}%`;
      if (timerEl) timerEl.textContent = formatDuration(Math.max(0, a.time * (1 - p)));
      raf = window.requestAnimationFrame(loop);
    };
    raf = window.requestAnimationFrame(loop);
    return () => window.cancelAnimationFrame(raf);
  }, [active, stripe, stats.time]);

  // AdCap shows $/s on the bar once it's in stripe mode; otherwise cycle payout.
  const revenueLabel = owned <= 0
    ? formatMoney(biz.baseCost)
    : stripe
      ? `${formatMoney(stats.revenuePerSecond)}/s`
      : formatMoney(stats.cycleRevenue);

  // AdCap owned badge: "428/500" + green fill = owned / next milestone
  const unlockFill = unlockAt && unlockAt > 0
    ? Math.max(0, Math.min(1, owned / unlockAt))
    : owned > 0 ? 1 : 0;
  const ownedLabel = unlockAt != null ? `${owned}/${unlockAt}` : String(owned);

  const runTitle = managed
    ? `${biz.name} · manager running`
    : running
      ? `${biz.name} · on a job…`
      : owned > 0
        ? `${biz.name} · send on a job`
        : biz.name;

  return (
    <div className={`ccap-row${locked ? ' ccap-row--locked' : ''}`}>
      <button
        type="button"
        className="ccap-side"
        disabled={owned <= 0 || running || managed}
        onClick={onRun}
        title={runTitle}
      >
        <span className="ccap-art">
          {biz.art ? (
            <img src={biz.art} alt="" className="ccap-art__img" draggable={false} />
          ) : (
            <BusIcon colour={biz.colour || '#38bdf8'} className="w-[80%] h-[80%]" />
          )}
        </span>
        <span className="ccap-owned-wrap" title={unlockAt != null ? `Next unlock at ${unlockAt}` : 'Owned'}>
          <span className="ccap-owned-wrap__fill" style={{ width: `${unlockFill * 100}%` }} />
          <span className={`ccap-owned-wrap__n tabular-nums${ownedLabel.length > 7 ? ' ccap-owned-wrap__n--tight' : ''}`}>
            {ownedLabel}
          </span>
        </span>
      </button>

      <div className="ccap-main">
        {adminMode ? (
          <input
            type="text"
            value={biz.name}
            maxLength={80}
            onChange={(e) => onRename?.(biz.id, e.target.value)}
            onClick={(e) => e.stopPropagation()}
            className="ccap-cat"
            title="Rename vehicle (admin)"
          />
        ) : (
          <p className="ccap-cat">{biz.name}</p>
        )}
        <button
          type="button"
          className="ccap-arrow"
          disabled={owned <= 0 || running || managed}
          onClick={onRun}
          title={runTitle}
        >
          <span className="ccap-arrow__outline" aria-hidden />
          <span className="ccap-arrow__inner" aria-hidden>
            <span ref={fillRef} className="ccap-arrow__fill" />
          </span>
          <span className={`ccap-arrow__label tabular-nums${owned <= 0 ? ' ccap-arrow__label--muted' : ''}`}>
            {revenueLabel}
          </span>
        </button>

        <div className="ccap-controls">
          <button
            type="button"
            className={`ccap-buy ${canBuy ? 'ccap-buy--go' : 'ccap-buy--wait'}`}
            disabled={!canBuy && owned > 0}
            onClick={onBuy}
          >
            <span className="ccap-buy__top">{buyLabel}</span>
            <span className="ccap-buy__cost tabular-nums">{formatMoney(showCost)}</span>
          </button>
          <div
            ref={timerRef}
            className="ccap-timer tabular-nums"
            title={formatDuration(stats.time)}
          >
            {formatDuration(stats.time)}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function CoachCapitalistPanel({ sandbox = false, isAdmin = false }) {
  const [state, dispatch] = useReducer(reducer, null, loadState);
  const [tab, setTab] = useState('fleet'); // fleet | managers | upgrades | angels | leaderboard
  const [resetOpen, setResetOpen] = useState(false);
  const [toast, setToast] = useState('');
  const [awayBanner, setAwayBanner] = useState('');
  const [quietHours, setQuietHours] = useState(() => isCoachCapQuietHours());
  const [cloudReady, setCloudReady] = useState(sandbox);
  const [adminMode, setAdminMode] = useState(false);
  const [nameConfig, setNameConfig] = useState(EMPTY_NAMES);
  const [namesDirty, setNamesDirty] = useState(false);
  const [namesSaving, setNamesSaving] = useState(false);
  const [namesError, setNamesError] = useState('');
  const [leaderboard, setLeaderboard] = useState([]);
  const [leaderboardMe, setLeaderboardMe] = useState(null);
  const [leaderboardLoading, setLeaderboardLoading] = useState(false);
  const [leaderboardError, setLeaderboardError] = useState('');
  const lastSyncedEarnings = useRef(0);
  const cloudTimerRef = useRef(null);
  const savingCloudRef = useRef(false);
  const forceResetTokenRef = useRef(currentForceResetAck());
  const stateRef = useRef(state);
  stateRef.current = state;

  const baseDepot = getDepot(state.activeDepot);
  const depot = useMemo(
    () => applyNameOverrides(baseDepot, nameConfig),
    [baseDepot, nameConfig],
  );
  const depotState = state.depots[state.activeDepot];
  const accountCash = Math.max(0, Number(state.cash) || 0);
  const accountAngels = Number(state.angels) || 0;
  const priceMult = depotPriceMult(state.activeDepot);
  const mult = computeMultipliers(depot, depotState, accountAngels);
  const rps = totalRevenuePerSecond(depot, depotState, accountAngels);
  const pending = pendingAngels(state);
  const lifetimeTotal = totalLifetimeEarnings(state);
  const activeWeight = depotLifetimeWeight(state.activeDepot);
  const purchasedUpgrades = (depot.cashUpgrades || []).filter(
    (u) => (depotState.upgrades || []).includes(u.id),
  );

  const showMilestoneToast = (milestones) => {
    if (!Array.isArray(milestones) || !milestones.length) return;
    const first = milestones[0];
    setToast(`+${first.coins} coins · ${first.label}${milestones.length > 1 ? ` (+${milestones.length - 1} more)` : ''}`);
    try {
      window.dispatchEvent(new CustomEvent('cl-coins-awarded', { detail: { milestones } }));
    } catch {
      /* ignore */
    }
  };

  const pushCloudSave = async ({ force = false } = {}) => {
    if (sandbox) return null;
    const cur = stateRef.current;
    const total = totalLifetimeEarnings(cur);
    if (!force && total <= 0 && total <= lastSyncedEarnings.current) return null;
    if (savingCloudRef.current) return null;
    savingCloudRef.current = true;
    try {
      const response = await fetch('/api/saveCoachCapitalistSave', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          state: cur,
          forceResetToken: forceResetTokenRef.current || undefined,
        }),
      });
      const payload = (await readJsonResponse(response)) || {};
      if (!response.ok) throw new Error(payload.error || 'Failed to cloud-save.');
      if (payload.forceResetToken) {
        forceResetTokenRef.current = String(payload.forceResetToken);
        acknowledgeForceReset(payload.forceResetToken);
      }
      const nextLife = Math.max(
        lastSyncedEarnings.current,
        Number(payload.lifetimeEarnings) || total,
      );
      lastSyncedEarnings.current = nextLife;
      if (payload.keptCloud && payload.state) {
        dispatch({ type: 'replace', state: normalizeGameState(payload.state) });
        stateRef.current = normalizeGameState(payload.state);
      }
      if (payload.me?.rank != null || payload.rank != null) {
        setLeaderboardMe((prev) => ({
          ...(prev || {}),
          uid: prev?.uid,
          lifetimeEarnings: nextLife,
          rank: payload.rank ?? payload.me?.rank ?? prev?.rank ?? null,
        }));
      }
      showMilestoneToast(payload.milestones);
      return payload;
    } finally {
      savingCloudRef.current = false;
    }
  };

  const scheduleCloudSave = () => {
    if (sandbox || !cloudReady) return;
    if (cloudTimerRef.current) window.clearTimeout(cloudTimerRef.current);
    cloudTimerRef.current = window.setTimeout(() => {
      pushCloudSave().catch(() => {});
    }, CLOUD_SAVE_DEBOUNCE_MS);
  };

  // Boot: names + cloud save merge + away earnings (skipped in sandbox).
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

      if (sandbox) {
        if (!cancelled) {
          const away = applyAwayEarnings(stateRef.current);
          if (away.awayMs >= 1500 && away.earned > 0) {
            dispatch({ type: 'replace', state: away.state });
            setAwayBanner(
              `While you were away · ${formatMoney(away.earned)} over ${formatDuration(away.awayMs / 1000)}`,
            );
          }
          setCloudReady(true);
        }
        return;
      }

      try {
        const response = await fetch('/api/getCoachCapitalistSave', { credentials: 'include' });
        const payload = (await readJsonResponse(response)) || {};
        if (cancelled) return;
        if (response.ok) {
          const forceToken = payload.forceResetToken ? String(payload.forceResetToken) : '';
          const newlyForced = forceToken ? acknowledgeForceReset(forceToken) : false;
          if (forceToken) forceResetTokenRef.current = forceToken;
          // New admin/claim wipe token: take cloud and drop localStorage. Later loads merge normally.
          const picked = newlyForced
            ? { state: normalizeGameState(payload.state), source: 'cloud' }
            : pickRicherState(
              stateRef.current,
              payload.state,
              payload.updatedAt || null,
            );
          const away = applyAwayEarnings(picked.state);
          dispatch({ type: 'replace', state: away.state });
          stateRef.current = away.state;
          lastSyncedEarnings.current = Math.max(
            totalLifetimeEarnings(away.state),
            Number(payload.lifetimeEarnings) || 0,
          );
          if (away.awayMs >= 1500 && away.earned > 0) {
            setAwayBanner(
              `While you were away · ${formatMoney(away.earned)} over ${formatDuration(away.awayMs / 1000)}`,
            );
          } else if (newlyForced) {
            setToast('Save reset from server — Local & Regional wiped');
          } else if (picked.source === 'cloud') {
            setToast('Progress restored from your account');
          }
        } else {
          const away = applyAwayEarnings(stateRef.current);
          if (away.awayMs >= 1500 && away.earned > 0) {
            dispatch({ type: 'replace', state: away.state });
            setAwayBanner(
              `While you were away · ${formatMoney(away.earned)} over ${formatDuration(away.awayMs / 1000)}`,
            );
          }
        }
      } catch {
        const away = applyAwayEarnings(stateRef.current);
        if (!cancelled && away.awayMs >= 1500 && away.earned > 0) {
          dispatch({ type: 'replace', state: away.state });
          setAwayBanner(
            `While you were away · ${formatMoney(away.earned)} over ${formatDuration(away.awayMs / 1000)}`,
          );
        }
      } finally {
        if (!cancelled) setCloudReady(true);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sandbox]);

  useEffect(() => {
    const id = window.setInterval(() => {
      setQuietHours(isCoachCapQuietHours());
    }, 15_000);
    return () => window.clearInterval(id);
  }, []);

  // Economy tick — cash / cycle completion. Bar fills animate imperatively in BusinessRow.
  useEffect(() => {
    if (!cloudReady) return undefined;
    const id = window.setInterval(() => {
      const cur = stateRef.current;
      const d = applyNameOverrides(getDepot(cur.activeDepot), nameConfig);
      const tick = tickDepot(
        d,
        cur.depots[cur.activeDepot],
        Date.now(),
        cur.angels,
      );
      dispatch({
        type: 'replace',
        state: syncDepotUnlocks({
          ...cur,
          cash: Math.max(0, Number(cur.cash) || 0) + tick.earned,
          depots: {
            ...cur.depots,
            [cur.activeDepot]: tick.depotState,
          },
        }),
      });
    }, 80);
    return () => window.clearInterval(id);
  }, [nameConfig, cloudReady]);

  useEffect(() => {
    if (!cloudReady) return undefined;
    const id = window.setInterval(() => {
      const cur = stateRef.current;
      let changed = false;
      let cashEarned = 0;
      const depots = { ...cur.depots };
      for (const d of DEPOTS) {
        if (d.id === cur.activeDepot) continue;
        if (!depots[d.id]?.unlocked) continue;
        if (!depots[d.id].managers?.some(Boolean)) continue;
        const tick = tickDepot(
          applyNameOverrides(d, nameConfig),
          depots[d.id],
          Date.now(),
          cur.angels,
        );
        depots[d.id] = tick.depotState;
        cashEarned += tick.earned;
        changed = true;
      }
      if (changed) {
        dispatch({
          type: 'replace',
          state: syncDepotUnlocks({
            ...cur,
            cash: Math.max(0, Number(cur.cash) || 0) + cashEarned,
            depots,
          }),
        });
      }
    }, 2000);
    return () => window.clearInterval(id);
  }, [nameConfig, cloudReady]);

  useEffect(() => {
    saveState(state);
    if (cloudReady) scheduleCloudSave();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, cloudReady]);

  // Flush cloud save when leaving the tab / page.
  useEffect(() => {
    if (sandbox) return undefined;
    const flush = () => {
      if (cloudTimerRef.current) {
        window.clearTimeout(cloudTimerRef.current);
        cloudTimerRef.current = null;
      }
      pushCloudSave({ force: true }).catch(() => {});
    };
    const onVis = () => {
      if (document.visibilityState === 'hidden') flush();
    };
    window.addEventListener('pagehide', flush);
    document.addEventListener('visibilitychange', onVis);
    return () => {
      window.removeEventListener('pagehide', flush);
      document.removeEventListener('visibilitychange', onVis);
      flush();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sandbox]);

  useEffect(() => {
    if (!toast) return undefined;
    const t = window.setTimeout(() => setToast(''), 2800);
    return () => window.clearTimeout(t);
  }, [toast]);

  useEffect(() => {
    if (!awayBanner) return undefined;
    const t = window.setTimeout(() => setAwayBanner(''), 8000);
    return () => window.clearTimeout(t);
  }, [awayBanner]);

  const loadLeaderboard = async () => {
    try {
      setLeaderboardLoading(true);
      setLeaderboardError('');
      try {
        await pushCloudSave({ force: true });
      } catch (syncErr) {
        setLeaderboardError(syncErr.message || 'Score sync failed.');
      }
      const response = await fetch('/api/getCoachCapitalistLeaderboard?limit=50', {
        credentials: 'include',
      });
      const payload = (await readJsonResponse(response)) || {};
      if (!response.ok) throw new Error(payload.error || 'Failed to load leaderboard.');
      setLeaderboard(Array.isArray(payload.leaderboard) ? payload.leaderboard : []);
      setLeaderboardMe(payload.me || null);
    } catch (err) {
      setLeaderboardError(err.message || 'Failed to load leaderboard.');
    } finally {
      setLeaderboardLoading(false);
    }
  };

  useEffect(() => {
    if (tab === 'leaderboard') loadLeaderboard();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  // Lightweight rank chip for the header
  useEffect(() => {
    if (sandbox || !cloudReady) return undefined;
    let cancelled = false;
    (async () => {
      try {
        const response = await fetch('/api/getCoachCapitalistLeaderboard?limit=5', {
          credentials: 'include',
        });
        const payload = (await readJsonResponse(response)) || {};
        if (!cancelled && response.ok) {
          setLeaderboardMe(payload.me || null);
          if (Array.isArray(payload.leaderboard) && payload.leaderboard.length) {
            setLeaderboard((prev) => (prev.length ? prev : payload.leaderboard));
          }
        }
      } catch {
        /* ignore */
      }
    })();
    return () => { cancelled = true; };
  }, [sandbox, cloudReady]);

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
    (u) => !(depotState.upgrades || []).includes(u.id)
      && accountCash >= u.cost * priceMult * 0.01,
  ).slice(0, 40);

  const angelAfford = depot.angelUpgrades.filter(
    (u) => !(depotState.angelUpgrades || []).includes(u.id),
  );

  const replaceState = (next) => {
    dispatch({ type: 'replace', state: syncDepotUnlocks(next) });
  };

  return (
    <div className={`w-full space-y-3 ${sandbox ? 'max-w-5xl mx-auto' : ''}`}>
      <GameUiPanel title="Coach Capitalist" header="blue" dark className="overflow-visible relative">
        <div className="space-y-3">
          {awayBanner ? (
            <div className="rounded-xl border-2 border-emerald-400/40 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-100">
              {awayBanner}
            </div>
          ) : null}
          {quietHours ? (
            <div className="rounded-xl border-2 border-slate-500/40 bg-slate-800/60 px-3 py-2 text-sm text-slate-300">
              Night stop · no earnings 10pm–5am (Europe/London). Fleet resumes at 5am.
            </div>
          ) : null}

          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="gui-font text-2xl sm:text-3xl text-amber-300 tabular-nums tracking-wide">
                {formatMoney(accountCash)}
              </p>
              <p className="text-xs text-slate-400 mt-1">
                {rps > 0 ? `${formatMoney(rps)}/s with managers` : 'Click a vehicle to send it on a job'}
                {' · '}
                Shared wallet
                {priceMult !== 1 ? ` · prices ×${priceMult}` : ''}
                {' · '}
                Depot {formatMoney(depotState.lifetimeEarnings)}
                {activeWeight !== 1 ? ` (×${activeWeight} score)` : ''}
                {' · '}
                Account {formatMoney(lifetimeTotal)}
              </p>
              {!sandbox && leaderboardMe?.rank ? (
                <button
                  type="button"
                  onClick={() => setTab('leaderboard')}
                  className="mt-1 text-[11px] text-sky-300 hover:text-sky-200"
                >
                  Rank #{leaderboardMe.rank}
                  {leaderboard.length ? ` · top ${Math.min(5, leaderboard.length)} on Profile too` : ''}
                </button>
              ) : null}
              {!sandbox && !cloudReady ? (
                <p className="text-[10px] text-slate-500 mt-1">Syncing account progress…</p>
              ) : null}
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
              ['leaderboard', 'Leaderboard'],
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
            <div className="ccap-fleet space-y-5 max-h-[min(70vh,720px)] overflow-y-auto pr-1 rounded-lg border-[3px] border-[#0b1218] bg-[#152231] px-2.5 py-3 sm:px-3.5 sm:py-3.5">
              {depot.businesses.map((biz, i) => (
                <BusinessRow
                  key={biz.id}
                  biz={biz}
                  index={i}
                  owned={depotState.owned[i] || 0}
                  managed={depotState.managers[i]}
                  cash={accountCash}
                  priceMult={priceMult}
                  buyMode={state.buyMode}
                  stats={mult.perBusiness[i]}
                  progress={depotState.progress[i] || 0}
                  running={depotState.running[i]}
                  lastTick={depotState.lastTick || 0}
                  adminMode={adminMode && isAdmin}
                  onRename={renameBusiness}
                  onRun={() => patch(startCycle(depot, depotState, i))}
                  onBuy={() => {
                    const prevOwned = depotState.owned[i] || 0;
                    const next = buyBusinesses(state, state.activeDepot, i, state.buyMode);
                    if ((next.depots[state.activeDepot]?.owned[i] || 0) !== prevOwned) {
                      setToast(`Bought ${biz.name}`);
                    }
                    replaceState(next);
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
                const mgrCost = (mgr.cost || 0) * priceMult;
                const can = !have && owned > 0 && accountCash >= mgrCost;
                return (
                  <div
                    key={mgr.name}
                    className="rounded-xl border-2 border-slate-700 bg-slate-900/60 p-3 flex items-center gap-3"
                  >
                    {depot.businesses[i]?.art ? (
                      <img
                        src={depot.businesses[i].art}
                        alt=""
                        className="w-12 h-12 shrink-0 rounded-md object-contain bg-slate-100 border border-slate-600"
                        draggable={false}
                      />
                    ) : (
                      <BusIcon colour={depot.businesses[i]?.colour} className="w-10 h-10 shrink-0" />
                    )}
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
                          replaceState(buyManager(state, state.activeDepot, i));
                          setToast(`Hired ${mgr.name}`);
                        }}
                        className="!px-3"
                      >
                        <span className="gui-font text-base tabular-nums">{formatMoney(mgrCost)}</span>
                      </GameUiButton>
                    )}
                  </div>
                );
              })}
            </div>
          ) : null}

          {tab === 'upgrades' ? (
            <div className="space-y-3 max-h-[min(70vh,720px)] overflow-y-auto">
              <p className="text-xs text-slate-400">
                Cash upgrades (Adventure Capitalist pricing). Near-affordable buys first; purchased stay listed below.
              </p>
              {affordables.length === 0 ? (
                <p className="text-sm text-slate-500 py-4 text-center">Keep earning — upgrades unlock as you grow.</p>
              ) : null}
              {affordables.map((up) => {
                const upCost = up.cost * priceMult;
                const can = accountCash >= upCost;
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
                        replaceState(buyCashUpgrade(state, state.activeDepot, up.id));
                        setToast(up.name);
                      }}
                      className="!px-3"
                    >
                      <span className="gui-font text-base tabular-nums">{formatMoney(upCost)}</span>
                    </GameUiButton>
                  </div>
                );
              })}
              {purchasedUpgrades.length ? (
                <div className="space-y-2 pt-2 border-t border-slate-700">
                  <p className="text-xs font-semibold text-slate-300">
                    Purchased ({purchasedUpgrades.length})
                  </p>
                  {purchasedUpgrades.map((up) => {
                    const target = up.business === 'all'
                      ? 'All fleet'
                      : up.business === 'angel'
                        ? 'Backer power'
                        : depot.businesses[up.business]?.name;
                    return (
                      <div
                        key={`owned-${up.id}`}
                        className="rounded-xl border-2 border-emerald-500/25 bg-emerald-500/5 px-3 py-2 flex items-center justify-between gap-3"
                      >
                        <div className="min-w-0">
                          <p className="gui-font text-sm text-emerald-100 truncate">{up.name}</p>
                          <p className="text-[11px] text-slate-400">
                            {target}
                            {up.multiplier ? ` · ×${up.multiplier}` : ''}
                            {up.angelBonus ? ` · +${(up.angelBonus * 100).toFixed(0)}% backer strength` : ''}
                          </p>
                        </div>
                        <GameUiBadge tone="green">Owned</GameUiBadge>
                      </div>
                    );
                  })}
                </div>
              ) : null}
            </div>
          ) : null}

          {tab === 'angels' ? (
            <div className="space-y-3 max-h-[min(70vh,720px)] overflow-y-auto">
              <div className="rounded-xl border-2 border-amber-500/40 bg-amber-500/10 p-4">
                <p className="gui-font text-amber-200 text-sm">Silent partners (shared)</p>
                <p className="text-2xl gui-font text-amber-300 mt-1 tabular-nums">
                  {formatMoney(accountAngels, { symbol: '' })}
                </p>
                <p className="text-xs text-amber-100/80 mt-2">
                  Shared across all depots. Each backer boosts profits by {(mult.angelRate * 100).toFixed(0)}%.
                  Pending claim: {formatMoney(pending, { symbol: '' })}.
                  Spent: {formatMoney(state.angelsSpent || 0, { symbol: '' })}.
                </p>
                <p className="text-[11px] text-amber-100/70 mt-1.5">
                  Score weights · Local ×1 · Regional ×2.5 · National ×5
                </p>
              </div>
              {angelAfford.map((up) => {
                const can = accountAngels >= up.cost;
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
                        replaceState(buyAngelUpgrade(state, state.activeDepot, up.id));
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

          {tab === 'leaderboard' ? (
            <div className="space-y-3 max-h-[min(70vh,720px)] overflow-y-auto">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs text-slate-400">
                  Shared all-time earnings board (same for everyone). Progress saves to your account so phones
                  and PCs stay in sync.
                </p>
                <GameUiButton size="sm" variant="neutral" disabled={leaderboardLoading} onClick={loadLeaderboard}>
                  {leaderboardLoading ? 'Loading…' : 'Refresh'}
                </GameUiButton>
              </div>
              {leaderboardMe?.rank ? (
                <div className="rounded-xl border-2 border-sky-400/40 bg-sky-500/10 px-3 py-2 text-sm text-sky-100">
                  You are rank #{leaderboardMe.rank}
                  {' · '}
                  {formatMoney(leaderboardMe.lifetimeEarnings || lifetimeTotal)}
                </div>
              ) : null}
              {leaderboardError ? <p className="text-xs text-rose-300">{leaderboardError}</p> : null}
              {leaderboardLoading && !leaderboard.length ? (
                <p className="text-sm text-slate-500 py-6 text-center">Loading leaderboard…</p>
              ) : !leaderboard.length ? (
                <p className="text-sm text-slate-500 py-6 text-center">No scores yet — keep playing; your account syncs automatically.</p>
              ) : (
                <ol className="space-y-1.5">
                  {leaderboard.map((row, i) => {
                    const mine = leaderboardMe?.uid && row.uid === leaderboardMe.uid;
                    return (
                      <li
                        key={row.uid}
                        className={`rounded-xl border-2 px-3 py-2.5 flex items-center gap-3 ${
                          mine
                            ? 'border-sky-400/50 bg-sky-500/15'
                            : 'border-slate-700 bg-slate-900/60'
                        }`}
                      >
                        <span className="gui-font-narrow text-sm text-slate-400 w-7 tabular-nums">{i + 1}</span>
                        <div className="min-w-0 flex-1">
                          <p className="gui-font text-sm text-white truncate">
                            {row.fullName}
                            {mine ? ' (you)' : ''}
                          </p>
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
                    );
                  })}
                </ol>
              )}
              <p className="text-[10px] text-slate-500">
                Your current total: {formatMoney(lifetimeTotal)}
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
          const claimed = pendingAngels(state);
          const next = claimBackers(state, state.activeDepot);
          replaceState(next);
          stateRef.current = next;
          setResetOpen(false);
          setToast(`Claimed ${formatMoney(claimed, { symbol: '' })} shared backers`);
          // Push immediately so a stale tab / delayed save cannot restore old cash.
          pushCloudSave({ force: true }).catch(() => {});
        }}
      >
        <p className="text-sm text-slate-200">
          Claim <strong>{formatMoney(pending, { symbol: '' })}</strong> shared silent partners and
          reset <strong>all depots</strong> — wallet, vehicles, managers, and cash upgrades go back
          to the start. Shared backers and backer upgrades stay.
        </p>
        <p className="text-xs text-slate-400">
          Account lifetime score is kept (Local ×1, Regional ×2.5, National ×5) so you keep earning
          future backers. Unlocks stay; you rebuild from Local.
        </p>
      </GameUiModal>
    </div>
  );
}

export function CoachCapitalistSandbox() {
  return (
    <div className="space-y-3">
      <p className="text-sm text-slate-400">
        Dev sandbox — browser-only (no cloud save). Live game syncs to each staff account across devices.
      </p>
      <CoachCapitalistPanel sandbox isAdmin />
    </div>
  );
}
