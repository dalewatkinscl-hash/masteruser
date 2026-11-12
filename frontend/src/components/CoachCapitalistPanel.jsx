import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import {
  COACH_CAP_ART_CATALOGUE,
  DEPOTS,
  applyAwayEarnings,
  applyNameOverrides,
  isCoachCapQuietHours,
  buyAllAffordableCashUpgrades,
  buyAllAffordableManagers,
  buyAngelUpgrade,
  buyBusinesses,
  buyCashUpgrade,
  buyCost,
  buyManager,
  claimBackers,
  claimUnderdogBoost,
  claimVipCharterReward,
  DEFAULT_EVENTS,
  rollEventOffer,
  resolveEventAction,
  applyNegativeEventPenalty,
  computeFleetRecommendations,
  computeMultipliers,
  computePrestigePreview,
  depotLifetimeWeight,
  depotPriceMult,
  describeAngelUpgradeEffect,
  detectCrossedMilestones,
  draftNameConfig,
  formatCoachCapTitleCase,
  formatDuration,
  formatMoney,
  acknowledgeForceReset,
  currentForceResetAck,
  getAffordableCashUpgrades,
  getAffordableManagers,
  getBusinessArtValue,
  getBusinessCostMultiplier,
  getDepot,
  getManagerPromotionInfo,
  getMilestoneRoadmap,
  isCoachCapSoundMuted,
  loadState,
  maxAffordable,
  nextGlobalUnlockInfo,
  nextUnlockAtForBusiness,
  nextUnlockInfoForBusiness,
  nextUnlockQty,
  normalizeGameState,
  normalizeNameConfig,
  pendingAngels,
  pickRicherState,
  playCoachCapSfx,
  promoteManager,
  rollUnderdogGrantOffer,
  rollVipCharterOffer,
  saveState,
  setCoachCapSoundMuted,
  startCycle,
  syncDepotUnlocks,
  tickDepot,
  totalLifetimeEarnings,
  totalRevenuePerSecond,
  getSyndicateMultiplier,
  isCoachCapWeekend,
  getNextMondayMorningMs,
} from '../lib/coachCapitalist';
import { GameUiBadge, GameUiButton, GameUiModal, GameUiPanel } from './gameUi';
import { SHOW_COACH_CAPITALIST } from '../utils/featureFlags';
import CoachCapitalistEventsAdmin from './CoachCapitalistEventsAdmin';
import CoachCapitalistPlayTimeAdmin from './CoachCapitalistPlayTimeAdmin';
import CoachCapitalistSyndicatePanel from './CoachCapitalistSyndicatePanel';

const BUY_MODES = [1, 10, 100, 'next', 'max'];
const EMPTY_NAMES = { depots: {} };
const CLOUD_SAVE_DEBOUNCE_MS = 4000;
const HEARTBEAT_INTERVAL_MS = 45_000;
const SEASON_INTRO_ACK_PREFIX = 'coach-capitalist-season-intro:';

function seasonIntroAckKey(seasonId) {
  return `${SEASON_INTRO_ACK_PREFIX}${String(seasonId || '').trim() || 'default'}`;
}

function hasAcknowledgedSeasonIntro(seasonId) {
  try {
    return localStorage.getItem(seasonIntroAckKey(seasonId)) === '1';
  } catch {
    return false;
  }
}

function acknowledgeSeasonIntro(seasonId) {
  try {
    localStorage.setItem(seasonIntroAckKey(seasonId), '1');
  } catch {
    /* ignore */
  }
}

function depotLabel(depot) {
  if (depot === 'national') return 'National';
  if (depot === 'regional') return 'Regional';
  if (depot === 'local') return 'Local';
  return depot || '—';
}

function formatPlayRemaining(ms) {
  const totalSec = Math.max(0, Math.ceil((Number(ms) || 0) / 1000));
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function normalizeTimeBoost(raw) {
  const weeklyLimit = Math.max(0, Math.floor(Number(raw?.weeklyLimit) || 2));
  const weeklyUsed = Math.max(0, Math.min(weeklyLimit, Math.floor(Number(raw?.weeklyUsed) || 0)));
  const weeklyRemaining = Math.max(
    0,
    Number.isFinite(Number(raw?.weeklyRemaining))
      ? Math.floor(Number(raw.weeklyRemaining))
      : weeklyLimit - weeklyUsed,
  );
  return {
    cost: Math.max(1, Math.floor(Number(raw?.cost) || 100)),
    bonusMs: Math.max(0, Math.floor(Number(raw?.bonusMs) || 30 * 60 * 1000)),
    weeklyLimit,
    weeklyUsed,
    weeklyRemaining,
    weekKey: raw?.weekKey ? String(raw.weekKey) : '',
    canPurchase: raw?.canPurchase != null ? Boolean(raw.canPurchase) : weeklyRemaining > 0,
  };
}

function normalizePlayStatus(play, fallbackCap = 60 * 60 * 1000) {
  if (!play || typeof play !== 'object') {
    return {
      dayKey: '',
      playedMs: 0,
      remainingMs: fallbackCap,
      locked: false,
      dailyPlayCapMs: fallbackCap,
      bonusMs: 0,
      effectiveCapMs: fallbackCap,
      timeBoost: normalizeTimeBoost(null),
    };
  }
  const cap = Number(play.dailyPlayCapMs);
  const dailyPlayCapMs = Number.isFinite(cap) && cap >= 0 ? cap : fallbackCap;
  const bonusMs = Math.max(0, Math.floor(Number(play.bonusMs) || 0));
  const effectiveCapMs = Number.isFinite(Number(play.effectiveCapMs))
    ? Math.max(0, Math.floor(Number(play.effectiveCapMs)))
    : dailyPlayCapMs + bonusMs;
  const playedMs = Math.max(0, Math.floor(Number(play.playedMs) || 0));
  const remainingMs = Math.max(
    0,
    Number.isFinite(Number(play.remainingMs))
      ? Math.floor(Number(play.remainingMs))
      : effectiveCapMs - playedMs,
  );
  return {
    dayKey: play.dayKey ? String(play.dayKey) : '',
    playedMs,
    remainingMs,
    locked: Boolean(play.locked) || remainingMs <= 0,
    dailyPlayCapMs,
    bonusMs,
    effectiveCapMs,
    timeBoost: normalizeTimeBoost(play.timeBoost),
  };
}

function CoachCapitalistMaintenance() {
  return (
    <div className="w-full max-w-lg mx-auto rounded-2xl border border-amber-400/30 bg-[#12100a] px-6 py-10 text-center shadow-xl">
      <div className="text-[11px] uppercase tracking-[0.16em] text-amber-300/90">Coach Capitalist</div>
      <h2 className="mt-2 text-xl font-semibold text-white">Down for maintenance</h2>
      <p className="mt-3 text-sm text-white/70 leading-relaxed">
        Coach Capitalist is temporarily unavailable while we carry out maintenance.
        Please check back later — your progress is saved.
      </p>
    </div>
  );
}

function CoachCapitalistWeekendClosed({ isAdmin = false, onBypass = null }) {
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const timer = setInterval(() => {
      setNow(Date.now());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const reopenMs = getNextMondayMorningMs(now);
  const diffMs = Math.max(0, reopenMs - now);

  const days = Math.floor(diffMs / (24 * 3600 * 1000));
  const hours = Math.floor((diffMs % (24 * 3600 * 1000)) / (3600 * 1000));
  const minutes = Math.floor((diffMs % (3600 * 1000)) / (60 * 1000));
  const seconds = Math.floor((diffMs % (60 * 1000)) / 1000);

  const countdownText = `${days > 0 ? `${days}d ` : ''}${hours}h ${minutes}m ${seconds}s`;

  return (
    <div className="w-full max-w-2xl mx-auto rounded-3xl border-2 border-amber-500/40 bg-gradient-to-b from-[#16130b] via-[#0d0c08] to-[#0a0907] p-6 sm:p-10 text-center shadow-2xl relative overflow-hidden">
      <div className="absolute -top-24 left-1/2 -translate-x-1/2 w-96 h-96 bg-amber-500/10 rounded-full blur-3xl pointer-events-none" />
      <div className="relative space-y-6">
        <div className="inline-flex items-center gap-2 rounded-full border border-amber-500/40 bg-amber-500/10 px-4 py-1.5 text-xs font-bold uppercase tracking-widest text-amber-300">
          <span className="w-2 h-2 rounded-full bg-amber-400 animate-ping" />
          Weekend Depot Stand-Down
        </div>

        <div className="space-y-2">
          <div className="text-4xl sm:text-5xl">🚌 🛑 🔧</div>
          <h1 className="gui-font text-2xl sm:text-3xl font-extrabold text-white tracking-wide">
            Fleet Operations Closed for the Weekend
          </h1>
          <p className="text-sm sm:text-base text-amber-100/75 max-w-lg mx-auto leading-relaxed">
            Coach Capitalist is closed on Saturdays and Sundays so drivers, dispatchers, and depot operators can take a well-deserved rest. Fleets stand down for weekly vehicle inspections and scheduled workshop maintenance.
          </p>
        </div>

        <div className="rounded-2xl border border-amber-500/30 bg-black/40 p-5 max-w-md mx-auto shadow-inner space-y-2">
          <p className="text-[11px] font-bold uppercase tracking-wider text-amber-400/90">
            Operations Reopen Monday 05:00 AM (London Time)
          </p>
          <div className="text-3xl sm:text-4xl font-black font-mono text-amber-300 tracking-wider">
            {countdownText}
          </div>
          <p className="text-[11px] text-white/50">
            All routes, revenue streams, and syndicate contracts unlock automatically at reopening.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-left max-w-xl mx-auto text-xs text-white/80">
          <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3 space-y-1">
            <span className="text-base">💼</span>
            <p className="font-bold text-white">Safe & Saved</p>
            <p className="text-white/60">Your fleet vehicles, balances, and unlocked managers are securely preserved in the cloud.</p>
          </div>
          <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3 space-y-1">
            <span className="text-base">🤝</span>
            <p className="font-bold text-white">Syndicate Multipliers</p>
            <p className="text-white/60">Your permanent syndicate multipliers and silent backers remain 100% active.</p>
          </div>
          <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3 space-y-1">
            <span className="text-base">⏸️</span>
            <p className="font-bold text-white">Fair Competition</p>
            <p className="text-white/60">Away earnings and game clocks pause so no competitor gains an unfair lead over the weekend.</p>
          </div>
        </div>

        {isAdmin && onBypass && (
          <div className="pt-4 border-t border-amber-500/20">
            <p className="text-[11px] text-amber-400/70 mb-2 uppercase tracking-wider">Admin Sandbox Mode</p>
            <button
              type="button"
              onClick={onBypass}
              className="inline-flex items-center gap-2 rounded-lg border border-amber-400/50 bg-amber-500/20 px-4 py-2 text-xs font-bold text-amber-200 hover:bg-amber-500/30 transition shadow"
            >
              ⚡ Enter Admin Weekend Preview
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

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

function DepotBusinessArt({ biz, className = 'w-full h-full' }) {
  const c = biz?.colour || '#38bdf8';
  const type = biz?.iconType || '';
  return (
    <svg className={className} viewBox="0 0 64 64" fill="none" aria-hidden>
      <rect width="64" height="64" rx="10" fill="#0f172a" />
      <circle cx="50" cy="14" r="22" fill={c} opacity="0.18" />
      <path d="M0 48h64v16H0z" fill="#1e293b" />
      <path d="M4 54h12M26 54h12M48 54h12" stroke="#475569" strokeWidth="2" strokeLinecap="round" />

      {type === 'airport' && (
        <>
          <path d="M14 16l22-5 6 4-10 5 8 4 5-1 2 3-11 2-6-4-12 2-4-2 6-5-6-3z" fill="#38bdf8" />
          <rect x="8" y="28" width="48" height="20" rx="5" fill={c} stroke="#0f172a" strokeWidth="2" />
          <rect x="12" y="31" width="12" height="8" rx="1.5" fill="#e0f2fe" />
          <rect x="26" y="31" width="12" height="8" rx="1.5" fill="#e0f2fe" />
          <rect x="40" y="31" width="12" height="8" rx="1.5" fill="#bae6fd" />
          <circle cx="19" cy="49" r="4.5" fill="#020617" stroke="#cbd5e1" strokeWidth="1.5" />
          <circle cx="45" cy="49" r="4.5" fill="#020617" stroke="#cbd5e1" strokeWidth="1.5" />
        </>
      )}

      {type === 'parkride' && (
        <>
          <rect x="8" y="8" width="22" height="16" rx="4" fill="#10b981" stroke="#064e3b" strokeWidth="1.5" />
          <text x="19" y="19" textAnchor="middle" fill="#ffffff" fontSize="9" fontWeight="bold" fontFamily="sans-serif">P+R</text>
          <rect x="10" y="27" width="46" height="21" rx="5" fill={c} stroke="#0f172a" strokeWidth="2" />
          <rect x="14" y="30" width="13" height="8" rx="1.5" fill="#d1fae5" />
          <rect x="29" y="30" width="13" height="8" rx="1.5" fill="#d1fae5" />
          <rect x="44" y="30" width="9" height="8" rx="1.5" fill="#a7f3d0" />
          <circle cx="20" cy="49" r="4.5" fill="#020617" stroke="#cbd5e1" strokeWidth="1.5" />
          <circle cx="44" cy="49" r="4.5" fill="#020617" stroke="#cbd5e1" strokeWidth="1.5" />
        </>
      )}

      {type === 'wedding' && (
        <>
          <path d="M32 22c-3-4.5-9-4.5-9 0 0 4 9 9 9 9s9-5 9-9c0-4.5-6-4.5-9 0z" fill="#f472b6" />
          <rect x="8" y="26" width="48" height="22" rx="7" fill="#fdf2f8" stroke="#db2777" strokeWidth="2" />
          <path d="M8 38h48" stroke="#f472b6" strokeWidth="2.5" />
          <rect x="13" y="29" width="11" height="7" rx="2" fill="#fbcfe8" />
          <rect x="27" y="29" width="11" height="7" rx="2" fill="#fbcfe8" />
          <rect x="41" y="29" width="11" height="7" rx="2" fill="#fbcfe8" />
          <circle cx="20" cy="49" r="4.5" fill="#020617" stroke="#f9a8d4" strokeWidth="1.5" />
          <circle cx="44" cy="49" r="4.5" fill="#020617" stroke="#f9a8d4" strokeWidth="1.5" />
        </>
      )}

      {type === 'touring' && (
        <>
          <path d="M6 28l14-16 11 12 9-9 18 13H6z" fill="#1e293b" stroke="#334155" strokeWidth="1" />
          <circle cx="16" cy="14" r="4" fill="#facc15" />
          <rect x="6" y="24" width="52" height="24" rx="5" fill={c} stroke="#0f172a" strokeWidth="2" />
          <rect x="10" y="27" width="44" height="9" rx="2" fill="#dcfce7" />
          <circle cx="18" cy="49" r="4.5" fill="#020617" stroke="#cbd5e1" strokeWidth="1.5" />
          <circle cx="42" cy="49" r="4.5" fill="#020617" stroke="#cbd5e1" strokeWidth="1.5" />
          <circle cx="50" cy="49" r="4.5" fill="#020617" stroke="#cbd5e1" strokeWidth="1.5" />
        </>
      )}

      {type === 'sleeper' && (
        <>
          <path d="M20 9a7 7 0 1 0 7 9 6 6 0 0 1-7-9z" fill="#fde047" />
          <circle cx="38" cy="12" r="1.3" fill="#fef08a" />
          <circle cx="48" cy="17" r="1.5" fill="#fef08a" />
          <rect x="6" y="24" width="52" height="24" rx="5" fill="#4c1d95" stroke="#c4b5fd" strokeWidth="1.8" />
          <rect x="11" y="27" width="10" height="5" rx="1" fill="#ddd6fe" />
          <rect x="24" y="27" width="10" height="5" rx="1" fill="#ddd6fe" />
          <rect x="37" y="27" width="10" height="5" rx="1" fill="#ddd6fe" />
          <rect x="11" y="34" width="10" height="5" rx="1" fill="#a78bfa" />
          <rect x="24" y="34" width="10" height="5" rx="1" fill="#a78bfa" />
          <rect x="37" y="34" width="10" height="5" rx="1" fill="#a78bfa" />
          <circle cx="18" cy="49" r="4.5" fill="#020617" stroke="#cbd5e1" strokeWidth="1.5" />
          <circle cx="46" cy="49" r="4.5" fill="#020617" stroke="#cbd5e1" strokeWidth="1.5" />
        </>
      )}

      {type === 'artic' && (
        <>
          <rect x="4" y="26" width="24" height="22" rx="4" fill={c} stroke="#0f172a" strokeWidth="1.8" />
          <rect x="28" y="27" width="7" height="20" fill="#334155" stroke="#0f172a" strokeWidth="1.2" />
          <path d="M30 27v20M33 27v20" stroke="#94a3b8" strokeWidth="1" />
          <rect x="35" y="26" width="25" height="22" rx="4" fill={c} stroke="#0f172a" strokeWidth="1.8" />
          <rect x="7" y="29" width="18" height="8" rx="1.5" fill="#ffedd5" />
          <rect x="38" y="29" width="19" height="8" rx="1.5" fill="#ffedd5" />
          <circle cx="14" cy="49" r="4" fill="#020617" stroke="#cbd5e1" strokeWidth="1.4" />
          <circle cx="42" cy="49" r="4" fill="#020617" stroke="#cbd5e1" strokeWidth="1.4" />
          <circle cx="53" cy="49" r="4" fill="#020617" stroke="#cbd5e1" strokeWidth="1.4" />
        </>
      )}

      {type === 'suite' && (
        <>
          <path d="M22 18l4-7 6 5 6-5 4 7H22z" fill="#facc15" stroke="#854d0e" strokeWidth="1" />
          <rect x="6" y="22" width="52" height="26" rx="6" fill="#1e1b4b" stroke="#facc15" strokeWidth="2" />
          <path d="M6 37h52" stroke="#facc15" strokeWidth="2" />
          <rect x="11" y="25" width="42" height="9" rx="2" fill="#fef08a" opacity="0.9" />
          <circle cx="18" cy="49" r="4.5" fill="#020617" stroke="#facc15" strokeWidth="1.5" />
          <circle cx="46" cy="49" r="4.5" fill="#020617" stroke="#facc15" strokeWidth="1.5" />
        </>
      )}

      {type === 'franchise' && (
        <>
          <path d="M8 22L32 10l24 12v26H8V22z" fill="#1e293b" stroke={c} strokeWidth="2" />
          <rect x="13" y="28" width="10" height="20" rx="2" fill="#0f172a" stroke="#2dd4bf" strokeWidth="1.2" />
          <rect x="27" y="28" width="10" height="20" rx="2" fill="#0f172a" stroke="#2dd4bf" strokeWidth="1.2" />
          <rect x="41" y="28" width="10" height="20" rx="2" fill="#0f172a" stroke="#2dd4bf" strokeWidth="1.2" />
          <rect x="15" y="34" width="6" height="10" rx="1" fill={c} />
          <rect x="29" y="34" width="6" height="10" rx="1" fill="#38bdf8" />
          <rect x="43" y="34" width="6" height="10" rx="1" fill="#f59e0b" />
        </>
      )}

      {type === 'crossborder' && (
        <>
          <circle cx="32" cy="16" r="9" stroke="#60a5fa" strokeWidth="1.5" fill="#1e3a8a" />
          <path d="M23 16h18M32 7c3 3 3 15 0 18M32 7c-3 3-3 15 0 18" stroke="#93c5fd" strokeWidth="1.2" />
          <path d="M6 27h46l6 10v11H6V27z" fill={c} stroke="#0f172a" strokeWidth="2" />
          <path d="M10 30h38l5 6H10v-6z" fill="#dbeafe" />
          <circle cx="18" cy="49" r="4.5" fill="#020617" stroke="#cbd5e1" strokeWidth="1.5" />
          <circle cx="46" cy="49" r="4.5" fill="#020617" stroke="#cbd5e1" strokeWidth="1.5" />
        </>
      )}

      {type === 'continental' && (
        <>
          <path d="M12 16l20-6 20 6M12 16l10 12M52 16L42 28" stroke="#f87171" strokeWidth="1.5" strokeDasharray="2 2" />
          <circle cx="12" cy="16" r="3" fill="#f87171" />
          <circle cx="32" cy="10" r="3.5" fill="#facc15" />
          <circle cx="52" cy="16" r="3" fill="#f87171" />
          <rect x="6" y="20" width="52" height="28" rx="5" fill={c} stroke="#0f172a" strokeWidth="2" />
          <rect x="10" y="23" width="44" height="7" rx="1.5" fill="#fee2e2" />
          <rect x="10" y="33" width="44" height="7" rx="1.5" fill="#fecaca" />
          <circle cx="17" cy="49" r="4.5" fill="#020617" stroke="#cbd5e1" strokeWidth="1.5" />
          <circle cx="41" cy="49" r="4.5" fill="#020617" stroke="#cbd5e1" strokeWidth="1.5" />
          <circle cx="50" cy="49" r="4.5" fill="#020617" stroke="#cbd5e1" strokeWidth="1.5" />
        </>
      )}

      {type === 'tickets' && (
        <>
          <rect x="12" y="16" width="40" height="28" rx="4" fill={c} stroke="#0f172a" strokeWidth="2" />
          <circle cx="12" cy="30" r="4" fill="#0f172a" />
          <circle cx="52" cy="30" r="4" fill="#0f172a" />
          <rect x="20" y="21" width="24" height="18" rx="2" fill="#1e293b" stroke="#ecfccb" strokeWidth="1.5" />
          <text x="32" y="33" textAnchor="middle" fill="#ecfccb" fontSize="9" fontWeight="bold" fontFamily="sans-serif">VIP PASS</text>
        </>
      )}

      {type === 'app' && (
        <>
          <rect x="20" y="8" width="24" height="44" rx="5" fill="#1e293b" stroke={c} strokeWidth="2.2" />
          <rect x="23" y="13" width="18" height="31" rx="2" fill="#0ea5e9" opacity="0.25" />
          <path d="M26 28l4 4 8-9" stroke="#38bdf8" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
          <circle cx="32" cy="48" r="2" fill="#bae6fd" />
        </>
      )}

      {type === 'drivers' && (
        <>
          <circle cx="32" cy="32" r="16" stroke={c} strokeWidth="3.5" fill="#1e293b" />
          <circle cx="32" cy="32" r="4.5" fill={c} />
          <path d="M32 16v11M18 39l10-5M46 39l-10-5" stroke={c} strokeWidth="3" strokeLinecap="round" />
          <path d="M20 14h24l-3-6H23l-3 6z" fill="#fbbf24" />
        </>
      )}

      {type === 'workshop' && (
        <>
          <path d="M18 44L42 20M22 18a7 7 0 0 0 9 9l13 13a4 4 0 0 1-6 6L25 33a7 7 0 0 0-9-9" stroke={c} strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" />
          <circle cx="44" cy="20" r="7" stroke="#fda4af" strokeWidth="2.5" fill="#1e293b" />
          <circle cx="44" cy="20" r="2.5" fill="#fda4af" />
        </>
      )}

      {type === 'fuel' && (
        <>
          <rect x="16" y="12" width="26" height="36" rx="4" fill={c} stroke="#0f172a" strokeWidth="2" />
          <rect x="20" y="17" width="18" height="11" rx="2" fill="#ffedd5" />
          <path d="M42 20h6v18a3 3 0 0 1-6 0V28" stroke="#fb923c" strokeWidth="2.8" strokeLinecap="round" />
          <path d="M29 33l-4 7h7l-3 6" stroke="#fef08a" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
        </>
      )}

      {type === 'charter' && (
        <>
          <rect x="16" y="10" width="32" height="40" rx="4" fill="#f8fafc" stroke={c} strokeWidth="2.5" />
          <rect x="24" y="7" width="16" height="6" rx="2" fill={c} />
          <path d="M22 21h20M22 28h20M22 35h12" stroke="#475569" strokeWidth="2.2" strokeLinecap="round" />
          <circle cx="40" cy="39" r="5" fill="#a855f7" />
          <path d="M38 39l1.5 1.5 3-3" stroke="#ffffff" strokeWidth="1.6" strokeLinecap="round" />
        </>
      )}

      {type === 'gov' && (
        <>
          <path d="M10 22L32 10l22 12H10z" fill={c} />
          <rect x="14" y="24" width="5" height="20" fill="#cbd5e1" />
          <rect x="25" y="24" width="5" height="20" fill="#cbd5e1" />
          <rect x="35" y="24" width="5" height="20" fill="#cbd5e1" />
          <rect x="45" y="24" width="5" height="20" fill="#cbd5e1" />
          <rect x="8" y="44" width="48" height="5" rx="1.5" fill={c} />
        </>
      )}

      {type === 'terminal' && (
        <>
          <path d="M6 22c16-10 36-10 52 0v26H6V22z" fill="#1e1b4b" stroke={c} strokeWidth="2.2" />
          <path d="M14 20v28M26 17v31M38 17v31M50 20v28" stroke="#818cf8" strokeWidth="1.5" opacity="0.7" />
          <rect x="12" y="27" width="40" height="8" rx="2" fill="#312e81" stroke="#a5b4fc" strokeWidth="1.2" />
          <path d="M16 31h12M34 31h14" stroke="#fde047" strokeWidth="2" strokeLinecap="round" />
        </>
      )}

      {type === 'global' && (
        <>
          <circle cx="32" cy="30" r="16" fill="#881337" stroke={c} strokeWidth="2.2" />
          <ellipse cx="32" cy="30" rx="24" ry="8" transform="rotate(-18 32 30)" stroke="#fda4af" strokeWidth="2" fill="none" />
          <path d="M16 30h32M32 14c5 5 5 27 0 32M32 14c-5 5-5 27 0 32" stroke="#fecdd3" strokeWidth="1.4" />
          <circle cx="48" cy="18" r="3.5" fill="#facc15" />
        </>
      )}
    </svg>
  );
}

/** AdCap switches to marching stripes when a cycle is under ~1s (bar would just flicker). */
const STRIPE_TIME_SEC = 1;

function BusinessRow({
  playLocked = false,
  depot,
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
  flashingMilestone = false,
  isBestRoi = false,
  isClosestMilestone = false,
  onOpenMilestones,
  onRun,
  onBuy,
  adminMode = false,
  onRename,
  onOpenMapper,
}) {
  const fillRef = useRef(null);
  const timerRef = useRef(null);
  const animRef = useRef({ progress, lastTick, time: stats.time, active: false, stripe: false });
  const prevCycleRef = useRef({ progress, running, owned });
  const [floatPayout, setFloatPayout] = useState(null);

  const mult = priceMult > 0 ? priceMult : 1;
  const affordCash = cash / mult;
  const costQty = buyMode === 'max'
    ? maxAffordable(biz.baseCost, biz.coefficient, owned, affordCash)
    : buyMode === 'next'
      ? nextUnlockQty(biz, owned)
      : Math.max(1, Number(buyMode) || 1);
  const rawCost = buyCost(biz.baseCost, biz.coefficient, owned, Math.max(1, costQty || 1));
  const unlockRaw = buyCost(biz.baseCost, biz.coefficient, 0, 1);
  const cost = rawCost * mult;
  const unlockCost = unlockRaw * mult;
  const canBuy = !playLocked && (owned > 0
    ? (buyMode === 'max' ? costQty > 0 : cash >= cost)
    : cash >= unlockCost);
  const unlockAt = nextUnlockAtForBusiness(biz, owned);
  const nextInfo = useMemo(
    () => nextUnlockInfoForBusiness(depot, biz, owned),
    [depot, biz, owned],
  );
  const locked = owned <= 0 && cash < unlockCost && index > 0;
  const showCost = owned <= 0 ? unlockCost : cost;
  const buyLabel = owned <= 0
    ? 'Buy'
    : buyMode === 'max'
      ? `Buy x${costQty || 0}`
      : buyMode === 'next'
        ? `Next +${costQty}`
        : `Buy x${buyMode}`;

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

  // Detect non-striped cycle completion to show a floating +£X payout popup.
  useEffect(() => {
    const prev = prevCycleRef.current;
    prevCycleRef.current = { progress, running, owned };
    if (owned <= 0 || stripe || stats.cycleRevenue <= 0) return undefined;
    const manualFinished = prev.running && !running && progress === 0;
    const managedWrapped = managed && prev.progress > 0.45 && progress < prev.progress && stats.time >= STRIPE_TIME_SEC;
    if (manualFinished || managedWrapped) {
      const id = Date.now() + index;
      setFloatPayout({ id, text: `+${formatMoney(stats.cycleRevenue)}` });
      const timer = window.setTimeout(() => {
        setFloatPayout((cur) => (cur?.id === id ? null : cur));
      }, 900);
      return () => window.clearTimeout(timer);
    }
    return undefined;
  }, [progress, running, owned, managed, stripe, stats.cycleRevenue, stats.time, index]);

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
    <div
      className={`ccap-row${locked ? ' ccap-row--locked' : ''}${
        flashingMilestone ? ' ccap-row--milestone-flash' : ''
      }`}
    >
      <button
        type="button"
        className="ccap-side"
        disabled={playLocked || owned <= 0 || running || managed}
        onClick={onRun}
        title={playLocked ? 'Daily play time used' : runTitle}
      >
        <span className="ccap-art">
          {biz.iconType ? (
            <DepotBusinessArt biz={biz} className="ccap-art__img" />
          ) : biz.art ? (
            <img src={biz.art} alt="" className="ccap-art__img" draggable={false} />
          ) : (
            <BusIcon colour={biz.colour || '#38bdf8'} className="w-[80%] h-[80%]" />
          )}
        </span>
        <span
          className="ccap-owned-wrap"
          title={
            nextInfo
              ? `Next milestone at ${nextInfo.at} (${nextInfo.remaining} more): ${nextInfo.effectLabel}`
              : 'Owned'
          }
        >
          <span className="ccap-owned-wrap__fill" style={{ width: `${unlockFill * 100}%` }} />
          <span className={`ccap-owned-wrap__n tabular-nums${ownedLabel.length > 7 ? ' ccap-owned-wrap__n--tight' : ''}`}>
            {ownedLabel}
          </span>
        </span>
      </button>

      <div className="ccap-main">
        <div className="flex items-center justify-between gap-1.5 pr-1">
          {adminMode ? (
            <div className="flex items-center gap-1 flex-1 min-w-0">
              <input
                type="text"
                value={biz.name}
                maxLength={80}
                onChange={(e) => onRename?.(biz.id, e.target.value)}
                onClick={(e) => e.stopPropagation()}
                className="ccap-cat flex-1 min-w-0"
                title="Rename vehicle (admin)"
              />
              {onOpenMapper ? (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onOpenMapper(biz.id);
                  }}
                  className="shrink-0 rounded bg-amber-400/20 hover:bg-amber-400/35 border border-amber-300/50 px-1.5 py-0.5 text-[10px] font-bold text-amber-100"
                  title="Change vehicle image or map titles"
                >
                  🖼 Art
                </button>
              ) : null}
            </div>
          ) : (
            <div className="flex items-center gap-1.5 flex-1 min-w-0">
              <p className="ccap-cat truncate">{biz.name}</p>
              {isBestRoi ? (
                <span
                  className="shrink-0 rounded bg-emerald-500/25 border border-emerald-400/50 px-1.5 py-0.2 text-[9px] font-bold uppercase tracking-wide text-emerald-200"
                  title="Best Value: Highest £/sec return per pound spent right now"
                >
                  ⚡ Best ROI
                </span>
              ) : isClosestMilestone ? (
                <span
                  className="shrink-0 rounded bg-amber-500/25 border border-amber-400/50 px-1.5 py-0.2 text-[9px] font-bold uppercase tracking-wide text-amber-200"
                  title="Cheapest path to the next milestone unlock"
                >
                  🎯 Closest
                </span>
              ) : null}
            </div>
          )}
          {owned > 0 && nextInfo ? (
            <button
              type="button"
              onClick={onOpenMilestones}
              className={`ccap-milestone-pill shrink-0 cursor-pointer hover:brightness-110 ${
                nextInfo.isSpeed ? 'ccap-milestone-pill--speed' : ''
              }`}
              title={`Reach ${nextInfo.at} owned (${nextInfo.remaining} more) for ${nextInfo.effectLabel} · Click to view full Milestone Roadmap`}
            >
              @{nextInfo.at} {nextInfo.effectLabel}
            </button>
          ) : null}
        </div>
        <button
          type="button"
          className="ccap-arrow"
          disabled={playLocked || owned <= 0 || running || managed}
          onClick={onRun}
          title={playLocked ? 'Daily play time used' : runTitle}
        >
          <span className="ccap-arrow__outline" aria-hidden />
          <span className="ccap-arrow__inner" aria-hidden>
            <span ref={fillRef} className="ccap-arrow__fill" />
          </span>
          <span className={`ccap-arrow__label tabular-nums${owned <= 0 ? ' ccap-arrow__label--muted' : ''}`}>
            {revenueLabel}
          </span>
          {floatPayout ? (
            <span key={floatPayout.id} className="ccap-float-payout tabular-nums">
              {floatPayout.text}
            </span>
          ) : null}
        </button>

        <div className="ccap-controls">
          <button
            type="button"
            className={`ccap-buy ${canBuy ? 'ccap-buy--go' : 'ccap-buy--wait'}`}
            disabled={playLocked || (!canBuy && owned > 0)}
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
  const [adminWeekendBypass, setAdminWeekendBypass] = useState(false);
  const [weekendActive, setWeekendActive] = useState(() => isCoachCapWeekend());

  useEffect(() => {
    const timer = setInterval(() => {
      setWeekendActive(isCoachCapWeekend());
    }, 10_000);
    return () => clearInterval(timer);
  }, []);

  if (!SHOW_COACH_CAPITALIST && !sandbox) {
    return <CoachCapitalistMaintenance />;
  }
  if (weekendActive && !sandbox && !adminWeekendBypass) {
    return (
      <CoachCapitalistWeekendClosed
        isAdmin={isAdmin}
        onBypass={() => setAdminWeekendBypass(true)}
      />
    );
  }
  return (
    <CoachCapitalistPanelLive
      sandbox={sandbox}
      isAdmin={isAdmin}
      weekendBypassed={adminWeekendBypass}
    />
  );
}

function CoachCapitalistPanelLive({ sandbox = false, isAdmin = false, weekendBypassed = false }) {
  const [state, dispatch] = useReducer(reducer, null, loadState);
  const [tab, setTab] = useState('fleet'); // fleet | managers | upgrades | angels | leaderboard
  const [resetOpen, setResetOpen] = useState(false);
  const [toast, setToast] = useState('');
  const [awayBanner, setAwayBanner] = useState('');
  const [quietHours, setQuietHours] = useState(() => isCoachCapQuietHours());
  const [cloudReady, setCloudReady] = useState(sandbox);
  const [adminMode, setAdminMode] = useState(false);

  useEffect(() => {
    if ((!adminMode || !isAdmin) && tab === 'events') {
      setTab('fleet');
    }
  }, [adminMode, isAdmin, tab]);
  const [mapperOpen, setMapperOpen] = useState(false);
  const [mapperDepotId, setMapperDepotId] = useState('local');
  const [mapperPickerSlot, setMapperPickerSlot] = useState(null);
  const [nameConfig, setNameConfig] = useState(EMPTY_NAMES);
  const [namesDirty, setNamesDirty] = useState(false);
  const [namesSaving, setNamesSaving] = useState(false);
  const [namesError, setNamesError] = useState('');
  const [leaderboard, setLeaderboard] = useState([]);
  const [leaderboardMe, setLeaderboardMe] = useState(null);
  const [leaderboardLoading, setLeaderboardLoading] = useState(false);
  const [leaderboardError, setLeaderboardError] = useState('');
  const [playStatus, setPlayStatus] = useState(() => normalizePlayStatus(null));
  const [pageVisible, setPageVisible] = useState(
    () => typeof document === 'undefined' || document.visibilityState === 'visible',
  );
  const [simulateCap, setSimulateCap] = useState(false);
  const [seasonId, setSeasonId] = useState('');
  const [seasonWrapup, setSeasonWrapup] = useState(null);
  const [seasonIntroOpen, setSeasonIntroOpen] = useState(false);
  const [boostBusy, setBoostBusy] = useState(false);
  const [soundMuted, setSoundMuted] = useState(() => isCoachCapSoundMuted());
  const [flashingRows, setFlashingRows] = useState({});
  const [milestonesOpen, setMilestonesOpen] = useState(false);
  const [activeCharter, setActiveCharter] = useState(null);
  const [charterRemainingSec, setCharterRemainingSec] = useState(0);
  const [activeUnderdogOffer, setActiveUnderdogOffer] = useState(null);
  const [underdogOfferRemainingSec, setUnderdogOfferRemainingSec] = useState(0);
  const [eventsCatalog, setEventsCatalog] = useState(() => DEFAULT_EVENTS);
  const [eventsSaving, setEventsSaving] = useState(false);
  const [syndicateContract, setSyndicateContract] = useState(null);
  const [syndicateBusy, setSyndicateBusy] = useState(false);
  const [syndicateRewardModal, setSyndicateRewardModal] = useState(null);
  const [currentUid, setCurrentUid] = useState('');
  const [isSyndicateDirector, setIsSyndicateDirector] = useState(false);
  const claimedRewardIdRef = useRef(null);

  const checkPendingSyndicateReward = useCallback((reward) => {
    if (!reward || claimedRewardIdRef.current === reward.id) return;
    claimedRewardIdRef.current = reward.id;

    const cashBonus = Math.max(0, Number(reward.payoutCash) || 0);
    const bonusAngels = Math.max(0, Math.floor(Number(reward.bonusAngels) || 0));
    const curState = stateRef.current;
    const newCount = Math.max(
      Number(curState.syndicatesCompleted) || 0,
      Math.floor(Number(reward.syndicatesCompleted) || 1),
    );
    const sponsor = reward.sponsorReward || null;

    // Credit directly into active in-memory game state
    const nextDepots = {};
    for (const [k, d] of Object.entries(curState.depots || {})) {
      nextDepots[k] = { ...d, syndicatesCompleted: newCount };
    }

    // Apply sponsor reward to in-memory state if present
    if (sponsor) {
      if (sponsor.type === 'vehicles' && sponsor.details) {
        const dId = sponsor.details.depotId || 'local';
        const bIdx = Number(sponsor.details.businessIndex) || 0;
        const cnt = Number(sponsor.details.count) || 0;
        if (nextDepots[dId] && Array.isArray(nextDepots[dId].owned)) {
          const nextOwned = [...nextDepots[dId].owned];
          nextOwned[bIdx] = (nextOwned[bIdx] || 0) + cnt;
          nextDepots[dId] = { ...nextDepots[dId], owned: nextOwned };
        }
      } else if (sponsor.type === 'managers' && sponsor.details) {
        for (const [k, d] of Object.entries(nextDepots)) {
          if (Array.isArray(d.managers)) {
            const nextMgrs = [...d.managers];
            const nextRunning = [...(d.running || [])];
            for (let m = 0; m < nextMgrs.length; m++) {
              if (!nextMgrs[m]) {
                nextMgrs[m] = true;
                if ((d.owned?.[m] || 0) > 0) nextRunning[m] = true;
                break;
              }
            }
            nextDepots[k] = { ...d, managers: nextMgrs, running: nextRunning };
          }
        }
      } else if (sponsor.type === 'perks' && sponsor.details) {
        const durMs = (Number(sponsor.details.durationHours) || 24) * 3600 * 1000;
        const spd = Number(sponsor.details.speedMult) || 2;
        const nowMs = Date.now();
        for (const [k, d] of Object.entries(nextDepots)) {
          nextDepots[k] = {
            ...d,
            frenzyUntil: Math.max(Number(d.frenzyUntil) || 0, nowMs) + durMs,
            frenzySpeedMult: spd,
          };
        }
      }
    }

    const nextState = {
      ...curState,
      cash: (Number(curState.cash) || 0) + cashBonus,
      angels: (Number(curState.angels) || 0) + bonusAngels,
      bonusAngels: (Number(curState.bonusAngels) || 0) + bonusAngels,
      syndicatesCompleted: newCount,
      depots: nextDepots,
    };
    dispatch({ type: 'replace', state: nextState });
    stateRef.current = nextState;

    if (reward.playTimeReset && playStatusRef.current) {
      playStatusRef.current = { ...playStatusRef.current, locked: false, playedMs: 0 };
    }

    // Show celebration modal and play sound
    setSyndicateRewardModal(reward);
    playCoachCapSfx('charter_claim');

    // Acknowledge claim to server so it is not returned again and persist bonus state
    fetch('/api/claimCoachCapitalistSyndicateReward', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: reward.id }),
    })
      .then(() => {
        pushCloudSave({ force: true }).catch(() => {});
      })
      .catch((err) => console.error('Failed to claim syndicate reward ack', err));
  }, []);

  const handleAdvanceSyndicateContract = async () => {
    if (!isAdmin) return;
    setSyndicateBusy(true);
    try {
      const response = await fetch('/api/adminAdvanceCoachCapitalistSyndicate', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
      });
      const payload = (await readJsonResponse(response)) || {};
      if (!response.ok) throw new Error(payload.error || 'Failed to advance contract.');
      if (payload.contract) setSyndicateContract(payload.contract);
      setToast(`🚀 Advanced to next tender: ${payload.contract?.title || 'Next Tender'}`);
    } catch (err) {
      setToast(err.message || 'Failed to advance contract.');
    } finally {
      setSyndicateBusy(false);
    }
  };
  const lastSyncedEarnings = useRef(0);
  const cloudTimerRef = useRef(null);
  const savingCloudRef = useRef(false);
  const forceResetTokenRef = useRef(currentForceResetAck());
  const stateRef = useRef(state);
  const playStatusRef = useRef(playStatus);
  const heartbeatInFlightRef = useRef(false);
  stateRef.current = state;
  playStatusRef.current = playStatus;
  // Sandbox bypasses the daily cap unless "simulate cap" is on (Fun Admin testing).
  const bypassPlayCap = (sandbox || weekendBypassed) && !simulateCap;
  const playLocked = !bypassPlayCap && Boolean(playStatus.locked);

  const baseDepot = getDepot(state.activeDepot);
  const depot = useMemo(
    () => applyNameOverrides(baseDepot, nameConfig),
    [baseDepot, nameConfig],
  );
  const depotState = state.depots[state.activeDepot];
  const accountCash = Math.max(0, Number(state.cash) || 0);
  const accountAngels = Number(state.angels) || 0;
  const accountClaimedAngels = Math.max(
    0,
    Math.floor((Number(state.angels) || 0) + (Number(state.angelsSpent) || 0)),
  );
  const priceMult = depotPriceMult(state.activeDepot);
  const mult = computeMultipliers(depot, depotState, accountAngels);
  const rps = totalRevenuePerSecond(depot, depotState, accountAngels);
  const totalRps = useMemo(() => {
    let sum = 0;
    for (const d of DEPOTS) {
      const ds = state.depots?.[d.id];
      if (!ds?.unlocked) continue;
      const dWithOverrides = applyNameOverrides(d, nameConfig);
      sum += totalRevenuePerSecond(dWithOverrides, ds, accountAngels);
    }
    return sum;
  }, [state.depots, nameConfig, accountAngels]);
  const pending = pendingAngels(state);
  const lifetimeTotal = totalLifetimeEarnings(state);
  const activeWeight = depotLifetimeWeight(state.activeDepot);
  const purchasedUpgrades = (depot.cashUpgrades || []).filter(
    (u) => (depotState.upgrades || []).includes(u.id),
  );
  const purchasedAngelUpgrades = (depot.angelUpgrades || []).filter(
    (u) => (depotState.angelUpgrades || []).includes(u.id),
  );

  const affordableManagersList = useMemo(
    () => (playLocked ? [] : getAffordableManagers(state, state.activeDepot)),
    [state, playLocked],
  );
  const affordablePromotionsCount = useMemo(() => {
    if (playLocked || !depot || !depotState) return 0;
    let count = 0;
    for (let i = 0; i < depot.managers.length; i += 1) {
      const info = getManagerPromotionInfo(depot, depotState, i);
      if (info.nextId && accountCash >= info.nextCost) count += 1;
    }
    return count;
  }, [depot, depotState, accountCash, playLocked]);
  const affordableCashUpgradesList = useMemo(
    () => (playLocked ? [] : getAffordableCashUpgrades(state, state.activeDepot)),
    [state, playLocked],
  );
  const affordableAngelUpgradesCount = useMemo(
    () => (playLocked
      ? 0
      : depot.angelUpgrades.filter(
          (u) => !(depotState.angelUpgrades || []).includes(u.id) && accountAngels >= u.cost,
        ).length),
    [depot.angelUpgrades, depotState.angelUpgrades, accountAngels, playLocked],
  );
  const prestigePreview = useMemo(
    () => computePrestigePreview(state, mult.angelRate),
    [state, mult.angelRate],
  );
  const globalUnlock = useMemo(
    () => nextGlobalUnlockInfo(depot, depotState.owned),
    [depot, depotState.owned],
  );
  const fleetRecs = useMemo(
    () => computeFleetRecommendations(depot, depotState, accountCash, accountAngels),
    [depot, depotState, accountCash, accountAngels],
  );
  const milestoneRoadmap = useMemo(
    () => (milestonesOpen ? getMilestoneRoadmap(depot, depotState) : null),
    [milestonesOpen, depot, depotState],
  );
  const rivalInfo = useMemo(() => {
    if (sandbox || !leaderboard.length) return null;
    const myUid = leaderboardMe?.uid || '';
    const myScore = Math.max(lifetimeTotal, Number(leaderboardMe?.lifetimeEarnings) || 0);
    const others = leaderboard.filter((r) => !myUid || r.uid !== myUid);
    if (!others.length) return null;
    const ahead = others.filter((r) => (Number(r.lifetimeEarnings) || 0) > myScore);
    if (ahead.length > 0) {
      const target = ahead[ahead.length - 1];
      const targetScore = Number(target.lifetimeEarnings) || 0;
      const gap = Math.max(0, targetScore - myScore);
      const pct = targetScore > 0
        ? Math.min(99, Math.max(2, Math.round((myScore / targetScore) * 100)))
        : 0;
      return {
        isLeading: false,
        myRank: ahead.length + 1,
        targetRank: ahead.length,
        rivalName: target.fullName || 'Colleague',
        rivalScore: targetScore,
        gap,
        pct,
      };
    }
    const chaser = others[0];
    const chaserScore = Number(chaser.lifetimeEarnings) || 0;
    return {
      isLeading: true,
      myRank: 1,
      targetRank: 2,
      rivalName: chaser.fullName || 'Colleague',
      rivalScore: chaserScore,
      gap: Math.max(0, myScore - chaserScore),
      pct: 100,
    };
  }, [sandbox, leaderboard, leaderboardMe, lifetimeTotal]);

  const toggleSound = () => {
    setSoundMuted((prev) => {
      const next = !prev;
      setCoachCapSoundMuted(next);
      if (!next) playCoachCapSfx('buy');
      return next;
    });
  };

  const celebratePurchase = (depotObj, prevOwned, nextOwned, fallbackToast) => {
    const crossed = detectCrossedMilestones(depotObj, prevOwned, nextOwned);
    if (crossed.length > 0) {
      playCoachCapSfx('milestone');
      const nextFlash = {};
      for (const ev of crossed) {
        if (ev.type === 'global') {
          for (let idx = 0; idx < depotObj.businesses.length; idx += 1) {
            nextFlash[idx] = true;
          }
        } else if (ev.businessIndex >= 0) {
          nextFlash[ev.businessIndex] = true;
        }
      }
      setFlashingRows((prev) => ({ ...prev, ...nextFlash }));
      window.setTimeout(() => {
        setFlashingRows((prev) => {
          const copy = { ...prev };
          for (const k of Object.keys(nextFlash)) delete copy[k];
          return copy;
        });
      }, 1250);
      const topEv = crossed[crossed.length - 1];
      setToast(`🎉 ${topEv.businessName} @ ${topEv.at} · ${topEv.effectLabel}`);
    } else {
      playCoachCapSfx('buy');
      if (fallbackToast) setToast(fallbackToast);
    }
  };

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

  const applyPlayPayload = (payload) => {
    if (!payload?.play) return;
    const next = normalizePlayStatus(payload.play, Number(payload.dailyPlayCapMs) || undefined);
    setPlayStatus(next);
    playStatusRef.current = next;
  };

  const sendPlayHeartbeat = async () => {
    if (sandbox || bypassPlayCap) return null;
    if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return null;
    if (heartbeatInFlightRef.current) return null;
    heartbeatInFlightRef.current = true;
    try {
      const response = await fetch('/api/coachCapitalistHeartbeat', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const payload = (await readJsonResponse(response)) || {};
      if (!response.ok) throw new Error(payload.error || 'Heartbeat failed.');
      applyPlayPayload(payload);
      return payload;
    } catch {
      return null;
    } finally {
      heartbeatInFlightRef.current = false;
    }
  };

  const buyPlayBoost = async () => {
    if (sandbox || bypassPlayCap || boostBusy) return;
    const boost = playStatusRef.current?.timeBoost;
    if (!boost?.canPurchase) {
      setToast('No extra time left this week (2 max).');
      return;
    }
    setBoostBusy(true);
    try {
      const response = await fetch('/api/buyCoachCapitalistPlayBoost', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const payload = (await readJsonResponse(response)) || {};
      if (!response.ok) throw new Error(payload.error || 'Could not buy extra time.');
      applyPlayPayload(payload);
      setToast(`+${formatPlayRemaining(payload.bonusMsGranted || 30 * 60 * 1000)} play time · −${payload.cost || 100} coins`);
      try {
        window.dispatchEvent(new CustomEvent('cl-coins-awarded', { detail: { awards: [] } }));
      } catch {
        /* ignore */
      }
    } catch (err) {
      setToast(err.message || 'Could not buy extra time.');
    } finally {
      setBoostBusy(false);
    }
  };

  const pushCloudSave = async ({ force = false } = {}) => {
    if (sandbox) return null;
    // While daily-capped, skip saves so a keptCloud freeze cannot wipe local away earnings.
    if (playStatusRef.current?.locked && !bypassPlayCap) {
      await sendPlayHeartbeat();
      return null;
    }
    const cur = stateRef.current;
    const total = totalLifetimeEarnings(cur);
    if (!force && total <= 0 && total <= lastSyncedEarnings.current) return null;
    if (savingCloudRef.current) return null;
    savingCloudRef.current = true;
    try {
      await sendPlayHeartbeat();
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
      if (payload.pendingSyndicateReward) {
        checkPendingSyndicateReward(payload.pendingSyndicateReward);
      }
      if (payload.forceResetToken) {
        forceResetTokenRef.current = String(payload.forceResetToken);
        acknowledgeForceReset(payload.forceResetToken);
      }
      applyPlayPayload(payload);
      const nextLife = Math.max(
        lastSyncedEarnings.current,
        Number(payload.lifetimeEarnings) || total,
      );
      lastSyncedEarnings.current = nextLife;
      if (payload.keptCloud && payload.state && !payload.playLocked) {
        dispatch({ type: 'replace', state: normalizeGameState(payload.state) });
        stateRef.current = normalizeGameState(payload.state);
        if (payload.forceResetToken && String(payload.forceResetToken).startsWith('gift-')) {
          setToast('🎁 You received a gift of 10 backers!');
        }
      }
      const curClaimed = Math.max(
        0,
        Math.floor((Number(cur.angels) || 0) + (Number(cur.angelsSpent) || 0)),
      );
      if (payload.me?.rank != null || payload.rank != null) {
        setLeaderboardMe((prev) => ({
          ...(prev || {}),
          uid: prev?.uid,
          lifetimeEarnings: nextLife,
          claimedAngels:
            payload.claimedAngels
            ?? payload.me?.claimedAngels
            ?? curClaimed
            ?? prev?.claimedAngels
            ?? 0,
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
          if (Array.isArray(payload.events) && payload.events.length > 0) {
            setEventsCatalog(payload.events);
          }
          if (payload.syndicateContract) {
            setSyndicateContract(payload.syndicateContract);
          }
          if (payload.uid) setCurrentUid(String(payload.uid));
          if (payload.isSyndicateDirector != null) setIsSyndicateDirector(Boolean(payload.isSyndicateDirector));
          if (payload.seasonId) setSeasonId(String(payload.seasonId));
          if (payload.previousSeasonWrapup) {
            setSeasonWrapup(payload.previousSeasonWrapup);
            const sid = String(payload.seasonId || '');
            if (sid && !hasAcknowledgedSeasonIntro(sid) && !sandbox) {
              setSeasonIntroOpen(true);
            }
          }
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
          if (Array.isArray(payload.events) && payload.events.length > 0) {
            setEventsCatalog(payload.events);
          }
          if (payload.syndicateContract) {
            setSyndicateContract(payload.syndicateContract);
          }
          const forceToken = payload.forceResetToken ? String(payload.forceResetToken) : '';
          const newlyForced = forceToken ? acknowledgeForceReset(forceToken) : false;
          if (forceToken) forceResetTokenRef.current = forceToken;
          applyPlayPayload(payload);
          if (payload.seasonId) setSeasonId(String(payload.seasonId));
          if (payload.previousSeasonWrapup) {
            setSeasonWrapup(payload.previousSeasonWrapup);
            const sid = String(payload.seasonId || '');
            if (sid && !hasAcknowledgedSeasonIntro(sid)) setSeasonIntroOpen(true);
          }
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
          if (payload.pendingSyndicateReward) {
            checkPendingSyndicateReward(payload.pendingSyndicateReward);
          }
          lastSyncedEarnings.current = Math.max(
            totalLifetimeEarnings(away.state),
            Number(payload.lifetimeEarnings) || 0,
          );
          if (away.awayMs >= 1500 && away.earned > 0) {
            setAwayBanner(
              `While you were away · ${formatMoney(away.earned)} over ${formatDuration(away.awayMs / 1000)}`,
            );
            if (forceToken.startsWith('gift-')) {
              setToast('🎁 You received a gift of 10 backers!');
            }
          } else if (newlyForced) {
            setToast(
              forceToken.startsWith('gift-')
                ? '🎁 You received a gift of 10 backers!'
                : 'New season — progress reset. Good luck!'
            );
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

  // Economy tick — pause when tab hidden or daily play budget locked (away earnings apply on return).
  useEffect(() => {
    if (!cloudReady || !pageVisible || playLocked) return undefined;
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
  }, [nameConfig, cloudReady, pageVisible, playLocked]);

  useEffect(() => {
    if (!cloudReady || !pageVisible || playLocked) return undefined;
    const id = window.setInterval(() => {
      const cur = stateRef.current;
      let changed = false;
      let cashEarned = 0;
      const depots = { ...cur.depots };
      for (const d of DEPOTS) {
        if (d.id === cur.activeDepot) continue;
        if (!depots[d.id]?.unlocked) continue;
        if (!depots[d.id].managers?.some(Boolean) && !depots[d.id].running?.some(Boolean)) continue;
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
  }, [nameConfig, cloudReady, pageVisible, playLocked]);

  // Heartbeat every 45s while visible (also on mount / becoming visible).
  useEffect(() => {
    if (sandbox || !cloudReady || bypassPlayCap) return undefined;
    const beat = () => {
      if (document.visibilityState !== 'visible') return;
      sendPlayHeartbeat().catch(() => {});
    };
    beat();
    const id = window.setInterval(beat, HEARTBEAT_INTERVAL_MS);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sandbox, cloudReady, bypassPlayCap]);

  // Fun Admin: local simulate of the 60m cap without cloud heartbeats.
  useEffect(() => {
    if (!sandbox || !simulateCap || playStatus.locked) return undefined;
    const id = window.setInterval(() => {
      setPlayStatus((prev) => {
        const cap = prev.effectiveCapMs || prev.dailyPlayCapMs;
        const playedMs = Math.min(cap, prev.playedMs + HEARTBEAT_INTERVAL_MS);
        const remainingMs = Math.max(0, cap - playedMs);
        const next = { ...prev, playedMs, remainingMs, locked: remainingMs <= 0 };
        playStatusRef.current = next;
        return next;
      });
    }, HEARTBEAT_INTERVAL_MS);
    return () => window.clearInterval(id);
  }, [sandbox, simulateCap, playStatus.locked]);

  // Smooth countdown between server heartbeats (display only).
  useEffect(() => {
    if (bypassPlayCap || playLocked || !pageVisible || !cloudReady) return undefined;
    const id = window.setInterval(() => {
      setPlayStatus((prev) => {
        if (prev.locked || prev.remainingMs <= 0) return prev;
        const remainingMs = Math.max(0, prev.remainingMs - 1000);
        const cap = prev.effectiveCapMs || prev.dailyPlayCapMs;
        const playedMs = Math.min(cap, Math.max(0, cap - remainingMs));
        const next = {
          ...prev,
          remainingMs,
          playedMs,
          locked: remainingMs <= 0,
        };
        playStatusRef.current = next;
        return next;
      });
    }, 1000);
    return () => window.clearInterval(id);
  }, [bypassPlayCap, playLocked, pageVisible, cloudReady]);

  // While daily-locked, keep ~10% away earnings even if the tab stays open.
  useEffect(() => {
    if (!cloudReady || !playLocked) return undefined;
    const id = window.setInterval(() => {
      const away = applyAwayEarnings(stateRef.current);
      if (away.earned > 0 || away.state !== stateRef.current) {
        dispatch({ type: 'replace', state: away.state });
        stateRef.current = away.state;
      }
    }, 60_000);
    return () => window.clearInterval(id);
  }, [cloudReady, playLocked]);

  // Visibility: pause live ticks; on return credit ~10% away earnings and heartbeat.
  useEffect(() => {
    const onVis = () => {
      const visible = document.visibilityState === 'visible';
      setPageVisible(visible);
      if (!visible) {
        // Snapshot exact live progress up to the moment visibility is lost
        if (cloudReady && !playStatusRef.current?.locked) {
          const cur = stateRef.current;
          const now = Date.now();
          let cashEarned = 0;
          const depots = { ...cur.depots };
          for (const d of DEPOTS) {
            if (!depots[d.id]?.unlocked) continue;
            const tick = tickDepot(applyNameOverrides(d, nameConfig), depots[d.id], now, cur.angels);
            depots[d.id] = tick.depotState;
            cashEarned += tick.earned;
          }
          const snapped = syncDepotUnlocks({
            ...cur,
            cash: Math.max(0, Number(cur.cash) || 0) + cashEarned,
            depots,
          });
          stateRef.current = snapped;
          saveState(snapped);
          dispatch({ type: 'replace', state: snapped });
        }
        return;
      }
      const away = applyAwayEarnings(stateRef.current);
      if (away.awayMs >= 1500 && away.earned > 0) {
        dispatch({ type: 'replace', state: away.state });
        stateRef.current = away.state;
        setAwayBanner(
          `While you were away · ${formatMoney(away.earned)} over ${formatDuration(away.awayMs / 1000)}`,
        );
      } else if (away.state !== stateRef.current) {
        // Refresh lastTick & timer progress even if quiet hours / zero completed cycles.
        dispatch({ type: 'replace', state: away.state });
        stateRef.current = away.state;
      }
      if (!sandbox && !bypassPlayCap) {
        sendPlayHeartbeat().catch(() => {});
      }
    };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sandbox, bypassPlayCap, cloudReady, nameConfig]);

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

  const spawnVipCharter = (forcedEvent = null) => {
    const cur = stateRef.current;
    const d = applyNameOverrides(getDepot(cur.activeDepot), nameConfig);
    const isFirstPlace = leaderboardMe?.rank === 1;
    let offer = null;
    if (forcedEvent) {
      offer = rollEventOffer(cur, d, cur.angels, {
        isFirstPlace: false,
        customEvents: [forcedEvent],
      });
    } else {
      offer = rollEventOffer(cur, d, cur.angels, {
        isFirstPlace,
        customEvents: eventsCatalog,
      });
    }
    if (!offer) return;
    if (offer.category === 'negative') {
      playCoachCapSfx('crisis_alert');
    } else {
      playCoachCapSfx('charter_alert');
    }
    setActiveCharter(offer);
    setCharterRemainingSec(Math.max(1, Math.ceil((offer.expiresAt - Date.now()) / 1000)));
  };

  const acceptVipCharter = () => {
    if (!activeCharter || playLocked) return;
    const cur = stateRef.current;
    const d = applyNameOverrides(getDepot(cur.activeDepot), nameConfig);
    const res = resolveEventAction(cur, activeCharter, Date.now());
    setActiveCharter(null);
    if (activeCharter.category === 'negative') {
      playCoachCapSfx('charter_claim');
      if (res.toastMessage) setToast(res.toastMessage);
    } else if (res.prevOwned && res.nextOwned) {
      celebratePurchase(d, res.prevOwned, res.nextOwned, res.toastMessage);
    } else {
      playCoachCapSfx('charter_claim');
      if (res.toastMessage) setToast(res.toastMessage);
    }
    dispatch({ type: 'replace', state: res.state });
    stateRef.current = res.state;
  };

  // Periodic VIP Charter / Crisis active-play event spawner (~60s first offer, then every ~150s of active play).
  useEffect(() => {
    if (!cloudReady || !pageVisible || playLocked || quietHours) return undefined;
    const firstDelay = window.setTimeout(() => {
      spawnVipCharter();
    }, 60_000);
    const interval = window.setInterval(() => {
      spawnVipCharter();
    }, 155_000);
    return () => {
      window.clearTimeout(firstDelay);
      window.clearInterval(interval);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cloudReady, pageVisible, playLocked, quietHours, eventsCatalog, leaderboardMe?.rank]);

  // Countdown for active event / VIP Charter offer.
  useEffect(() => {
    if (!activeCharter) return undefined;
    const tick = () => {
      const rem = Math.ceil((activeCharter.expiresAt - Date.now()) / 1000);
      if (rem <= 0) {
        if (activeCharter.category === 'negative') {
          playCoachCapSfx('crisis_penalty');
          const penaltyRes = applyNegativeEventPenalty(stateRef.current, activeCharter, Date.now());
          dispatch({ type: 'replace', state: penaltyRes.state });
          stateRef.current = penaltyRes.state;
          if (penaltyRes.toastMessage) setToast(penaltyRes.toastMessage);
        }
        setActiveCharter(null);
        setCharterRemainingSec(0);
      } else {
        setCharterRemainingSec(rem);
      }
    };
    tick();
    const id = window.setInterval(tick, 250);
    return () => window.clearInterval(id);
  }, [activeCharter]);

  const isNotFirstPlace = Boolean(rivalInfo && !rivalInfo.isLeading);
  const leaderName = leaderboard[0]?.fullName || rivalInfo?.rivalName || 'the #1 Boss';

  const spawnUnderdogOffer = (force = false) => {
    const cur = stateRef.current;
    const activeDs = cur?.depots?.[cur.activeDepot];
    const alreadyBoosted = Number(activeDs?.underdogBoostUntil) > Date.now();
    if (!force && (!isNotFirstPlace || alreadyBoosted)) return;
    const offer = rollUnderdogGrantOffer(leaderName, rivalInfo?.myRank || null);
    playCoachCapSfx('charter_alert');
    setActiveUnderdogOffer(offer);
    setUnderdogOfferRemainingSec(Math.max(1, Math.ceil((offer.expiresAt - Date.now()) / 1000)));
  };

  const acceptUnderdogOffer = () => {
    if (!activeUnderdogOffer || playLocked) return;
    const cur = stateRef.current;
    const res = claimUnderdogBoost(cur, activeUnderdogOffer.durationSec || 300, Date.now());
    setActiveUnderdogOffer(null);
    playCoachCapSfx('charter_claim');
    if (res.toastMessage) setToast(res.toastMessage);
    dispatch({ type: 'replace', state: res.state });
    stateRef.current = res.state;
  };

  // Automatic Underdog 3× Profit (5m) event popup for any player who is not 1st on the leaderboard.
  useEffect(() => {
    if (!cloudReady || !pageVisible || playLocked || quietHours || !isNotFirstPlace) return undefined;
    const firstDelay = window.setTimeout(() => {
      spawnUnderdogOffer(false);
    }, 25_000);
    const interval = window.setInterval(() => {
      spawnUnderdogOffer(false);
    }, 240_000);
    return () => {
      window.clearTimeout(firstDelay);
      window.clearInterval(interval);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cloudReady, pageVisible, playLocked, quietHours, isNotFirstPlace, leaderName]);

  // Countdown for active Underdog offer popup.
  useEffect(() => {
    if (!activeUnderdogOffer) return undefined;
    const tick = () => {
      const rem = Math.ceil((activeUnderdogOffer.expiresAt - Date.now()) / 1000);
      if (rem <= 0) {
        setActiveUnderdogOffer(null);
        setUnderdogOfferRemainingSec(0);
      } else {
        setUnderdogOfferRemainingSec(rem);
      }
    };
    tick();
    const id = window.setInterval(tick, 250);
    return () => window.clearInterval(id);
  }, [activeUnderdogOffer]);

  const loadLeaderboard = async (isBackground = false) => {
    try {
      if (!isBackground) {
        setLeaderboardLoading(true);
        setLeaderboardError('');
        try {
          await pushCloudSave({ force: true });
        } catch (syncErr) {
          setLeaderboardError(syncErr.message || 'Score sync failed.');
        }
      }
      const response = await fetch('/api/getCoachCapitalistLeaderboard?limit=50', {
        credentials: 'include',
      });
      const payload = (await readJsonResponse(response)) || {};
      if (!response.ok) throw new Error(payload.error || 'Failed to load leaderboard.');
      if (Array.isArray(payload.leaderboard)) {
        setLeaderboard(payload.leaderboard);
      }
      if (payload.me) {
        setLeaderboardMe(payload.me);
      }
    } catch (err) {
      if (!isBackground) setLeaderboardError(err.message || 'Failed to load leaderboard.');
    } finally {
      if (!isBackground) setLeaderboardLoading(false);
    }
  };

  // Poll leaderboard: every 8s while viewing the leaderboard tab, or every 25s in the background for Rival Tracker
  useEffect(() => {
    if (sandbox || !cloudReady) return undefined;
    let cancelled = false;
    const fetchBoard = () => {
      if (cancelled) return;
      loadLeaderboard(true);
    };
    if (tab === 'leaderboard') {
      loadLeaderboard(false);
    } else {
      loadLeaderboard(true);
    }
    const intervalMs = tab === 'leaderboard' ? 8_000 : 25_000;
    const timer = window.setInterval(fetchBoard, intervalMs);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [sandbox, cloudReady, tab]);

  // Poll syndicate contract state every 4s while the syndicate tab is active (or every 20s in background)
  useEffect(() => {
    if (sandbox || !cloudReady) return undefined;
    const fetchSyndicateLive = async () => {
      try {
        const res = await fetch('/api/getCoachCapitalistConfig', { credentials: 'include' });
        const data = (await readJsonResponse(res)) || {};
        if (data.syndicateContract) {
          setSyndicateContract(data.syndicateContract);
        }
        if (data.pendingSyndicateReward) {
          checkPendingSyndicateReward(data.pendingSyndicateReward);
        }
        if (data.uid) setCurrentUid(String(data.uid));
        if (data.isSyndicateDirector != null) setIsSyndicateDirector(Boolean(data.isSyndicateDirector));
      } catch {
        /* ignore polling errors */
      }
    };
    const pollInterval = tab === 'syndicate' ? 4000 : 25000;
    const timer = window.setInterval(fetchSyndicateLive, pollInterval);
    return () => window.clearInterval(timer);
  }, [sandbox, cloudReady, tab]);

  const patch = (nextDepotState) => {
    dispatch({ type: 'patchDepot', depotId: state.activeDepot, depotState: nextDepotState });
  };

  const patchDepotNames = (mutator, targetDepotId = state.activeDepot) => {
    setNameConfig((prev) => {
      const next = draftNameConfig(prev);
      const targetBaseDepot = getDepot(targetDepotId);
      const entry = {
        ...(Object.prototype.hasOwnProperty.call(next.depots[targetDepotId] || {}, 'name')
          ? { name: next.depots[targetDepotId].name }
          : {}),
        businesses: { ...(next.depots[targetDepotId]?.businesses || {}) },
        art: { ...(next.depots[targetDepotId]?.art || {}) },
        upgrades: { ...(next.depots[targetDepotId]?.upgrades || {}) },
      };
      mutator(entry, targetBaseDepot);
      next.depots[targetDepotId] = entry;
      return next;
    });
    setNamesDirty(true);
    setNamesError('');
  };

  const renameBusiness = (businessId, name, targetDepotId = state.activeDepot) => {
    patchDepotNames((entry) => {
      entry.businesses[businessId] = String(name ?? '').slice(0, 80);
    }, targetDepotId);
  };

  const setBusinessArt = (businessId, artValue, targetDepotId = state.activeDepot) => {
    patchDepotNames((entry) => {
      const trimmed = String(artValue ?? '').trim();
      if (!trimmed) {
        delete entry.art[businessId];
      } else {
        entry.art[businessId] = trimmed;
      }
    }, targetDepotId);
  };

  const renameDepot = (name, targetDepotId = state.activeDepot) => {
    patchDepotNames((entry) => {
      entry.name = String(name ?? '').slice(0, 80);
    }, targetDepotId);
  };

  const renameUpgrade = (upgradeId, name, targetDepotId = state.activeDepot) => {
    patchDepotNames((entry) => {
      entry.upgrades[upgradeId] = String(name ?? '').slice(0, 80);
    }, targetDepotId);
  };

  const fixAllTitleCase = () => {
    setNameConfig((prev) => {
      const next = draftNameConfig(prev);
      for (const d of DEPOTS) {
        const cur = next.depots[d.id] || { businesses: {}, art: {}, upgrades: {} };
        const updated = {
          ...(Object.prototype.hasOwnProperty.call(cur, 'name') && cur.name
            ? { name: formatCoachCapTitleCase(cur.name) }
            : {}),
          businesses: { ...(cur.businesses || {}) },
          art: { ...(cur.art || {}) },
          upgrades: { ...(cur.upgrades || {}) },
        };
        for (const b of d.businesses) {
          const currentName = updated.businesses[b.id] || b.name;
          updated.businesses[b.id] = formatCoachCapTitleCase(currentName);
        }
        for (const [upId, upName] of Object.entries(updated.upgrades)) {
          if (upName) updated.upgrades[upId] = formatCoachCapTitleCase(upName);
        }
        next.depots[d.id] = updated;
      }
      return next;
    });
    setNamesDirty(true);
    setNamesError('');
    setToast('Applied Title Case across all titles (click Save to publish)');
  };

  const autoMatchLocalImages = (targetDepotId = 'local') => {
    const targetBase = getDepot(targetDepotId);
    const labeled = applyNameOverrides(targetBase, nameConfig);
    patchDepotNames((entry) => {
      for (const b of labeled.businesses) {
        const title = String(entry.businesses[b.id] || b.name || '').toLowerCase();
        const isUsed = /\b(used|old|vintage|second[-\s]?hand)\b/.test(title);
        const isNew = /\b(new|brand\s+new|modern)\b/.test(title);
        if (title.includes('transit') || title.includes('minibus')) {
          entry.art[b.id] = isNew && !isUsed
            ? '/coach-capitalist/new-transit.jpg'
            : '/coach-capitalist/used-transit.jpg';
        } else if (title.includes('cheetah') || title.includes('midi')) {
          entry.art[b.id] = isNew && !isUsed
            ? '/coach-capitalist/new-cheetah.jpg'
            : '/coach-capitalist/old-cheetah.jpg';
        } else if (title.includes('decker') || title.includes('double')) {
          entry.art[b.id] = isNew && !isUsed
            ? '/coach-capitalist/new-decker.jpg'
            : '/coach-capitalist/old-decker.jpg';
        } else if (title.includes('team') || title.includes('tri-axle') || title.includes('tri axle')) {
          entry.art[b.id] = isNew && !isUsed
            ? '/coach-capitalist/new-team-coach.jpg'
            : '/coach-capitalist/used-team-coach.jpg';
        } else if (title.includes('panther') || title.includes('plaxton') || title.includes('coach')) {
          entry.art[b.id] = isNew && !isUsed
            ? '/coach-capitalist/new-coach.jpg'
            : '/coach-capitalist/old-coach.jpg';
        }
      }
    }, targetDepotId);
    setToast('Matched vehicle photos to titles (click Save to publish)');
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
      setToast('Titles & image mappings saved for everyone');
      return true;
    } catch (err) {
      setNamesError(err.message || 'Failed to save names.');
      return false;
    } finally {
      setNamesSaving(false);
    }
  };

  const handleSaveEventsConfig = async (nextEvents) => {
    try {
      setEventsSaving(true);
      const response = await fetch('/api/saveCoachCapitalistConfig', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ events: nextEvents }),
      });
      const payload = (await readJsonResponse(response)) || {};
      if (!response.ok) throw new Error(payload.error || 'Failed to save events.');
      setEventsCatalog(nextEvents);
      setToast('Events saved to cloud successfully for all players');
      return true;
    } catch (err) {
      console.error(err);
      setToast(err.message || 'Failed to save events.');
      return false;
    } finally {
      setEventsSaving(false);
    }
  };

  const handleContributeSyndicate = async (arg) => {
    if (playLocked || syndicateBusy) return;
    try {
      setSyndicateBusy(true);
      const payloadData = typeof arg === 'number'
        ? { amount: arg, contributionType: 'cash' }
        : (arg && typeof arg === 'object' ? arg : { amount: Number(arg) || 0, contributionType: 'cash' });

      // Flush latest in-memory cash to cloud first so server transaction sees exact current state
      await pushCloudSave({ force: true });
      const response = await fetch('/api/contributeCoachCapitalistSyndicate', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payloadData),
      });
      const payload = (await readJsonResponse(response)) || {};
      if (!response.ok) throw new Error(payload.error || 'Failed to contribute to Syndicate.');
      if (payload.contract) setSyndicateContract(payload.contract);
      if (payload.state) {
        dispatch({ type: 'replace', state: payload.state });
        stateRef.current = payload.state;
      } else if (typeof payload.cash === 'number') {
        const nextState = { ...stateRef.current, cash: payload.cash };
        dispatch({ type: 'replace', state: nextState });
        stateRef.current = nextState;
      }
      playCoachCapSfx('charter_claim');
      if (payloadData.contributionType === 'vehicle') {
        setToast(`🚌 Donated ${payloadData.vehicleCount} vehicles to ${payload.contract?.title || 'Syndicate Tender'}!`);
      } else {
        setToast(`🤝 Pledged ${formatMoney(payloadData.amount)} to ${payload.contract?.title || 'Syndicate Tender'}!`);
      }
    } catch (err) {
      setToast(err.message || 'Contribution failed.');
    } finally {
      setSyndicateBusy(false);
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
          {weekendBypassed ? (
            <div className="rounded-xl border-2 border-amber-500/60 bg-amber-500/10 px-3 py-2 text-xs font-semibold text-amber-200 flex items-center justify-between">
              <span>⚡ Admin Preview: Weekend Stand-Down is active for regular players.</span>
            </div>
          ) : null}
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
          {playLocked ? (
            <div className="rounded-xl border-2 border-rose-400/40 bg-rose-500/10 px-3 py-3 text-sm text-rose-50 space-y-2">
              <p className="gui-font text-base text-rose-100">Daily play time used</p>
              <p className="text-rose-100/85">
                Your active play budget for today (London time) is used up.
                Managed fleets still earn at the reduced away rate while you&apos;re away.
              </p>
              {!bypassPlayCap && playStatus.timeBoost?.canPurchase ? (
                <GameUiButton
                  size="sm"
                  variant="accent"
                  disabled={boostBusy}
                  onClick={buyPlayBoost}
                >
                  {boostBusy
                    ? 'Buying…'
                    : `Buy +30 min · ${playStatus.timeBoost.cost} coins (${playStatus.timeBoost.weeklyRemaining} left this week)`}
                </GameUiButton>
              ) : !bypassPlayCap ? (
                <p className="text-xs text-rose-100/70">
                  Extra time sold out for this week (2 max). Come back after Monday midnight London.
                </p>
              ) : null}
            </div>
          ) : null}

          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <div className="flex flex-wrap items-baseline gap-2.5 sm:gap-3">
                <p className="gui-font text-2xl sm:text-3xl text-amber-300 tabular-nums tracking-wide">
                  {formatMoney(accountCash)}
                </p>
                <span
                  className={`inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-xs sm:text-sm font-semibold tabular-nums border ${
                    playLocked
                      ? 'border-amber-400/40 bg-amber-500/10 text-amber-200'
                      : totalRps > 0
                        ? 'border-emerald-400/40 bg-emerald-500/15 text-emerald-300'
                        : 'border-slate-600/60 bg-slate-800/60 text-slate-400'
                  }`}
                  title={
                    playLocked
                      ? `Play capped for today. Away earnings ticking at ~10% (${formatMoney(totalRps * 0.1)}/s).`
                      : totalRps > rps
                        ? `Total across all hubs: ${formatMoney(totalRps)}/s (${formatMoney(rps)}/s in ${depot.name || 'this hub'})`
                        : `${formatMoney(totalRps)}/s automated cash flow with managers`
                  }
                >
                  <span className="text-[11px] font-normal uppercase tracking-wider opacity-75">
                    / sec:
                  </span>
                  <span>
                    {playLocked
                      ? `${formatMoney(totalRps * 0.1)}/s (away)`
                      : totalRps > 0
                        ? `+${formatMoney(totalRps)}/s`
                        : '£0/s'}
                  </span>
                </span>
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-2">
                {!bypassPlayCap ? (
                  <>
                    <span
                      className={`inline-flex items-center rounded-md border px-2 py-0.5 text-[11px] tabular-nums ${
                        playLocked
                          ? 'border-rose-400/50 bg-rose-500/15 text-rose-100'
                          : 'border-sky-400/40 bg-sky-500/10 text-sky-100'
                      }`}
                      title="Active play budget (Europe/London day). Hidden tabs do not spend time."
                    >
                      {playLocked
                        ? 'Play left today · 0:00'
                        : `Play left today · ${formatPlayRemaining(playStatus.remainingMs)}`}
                      {playStatus.bonusMs > 0 ? ' · boosted' : ''}
                    </span>
                    {playStatus.timeBoost?.canPurchase ? (
                      <GameUiButton
                        size="sm"
                        variant="neutral"
                        disabled={boostBusy}
                        onClick={buyPlayBoost}
                        title={`Spend ${playStatus.timeBoost.cost} portal coins for +30 minutes. Max ${playStatus.timeBoost.weeklyLimit} per London week.`}
                      >
                        {boostBusy
                          ? 'Buying…'
                          : `+30 min · ${playStatus.timeBoost.cost}c (${playStatus.timeBoost.weeklyRemaining}/wk)`}
                      </GameUiButton>
                    ) : (
                      <span className="text-[11px] text-slate-500">
                        Boosts used this week
                      </span>
                    )}
                  </>
                ) : (
                  <span className="inline-flex items-center rounded-md border border-slate-600 bg-slate-800/80 px-2 py-0.5 text-[11px] text-slate-300">
                    Sandbox · cap off
                  </span>
                )}
                {sandbox ? (
                  <label className="inline-flex items-center gap-1.5 text-[11px] text-slate-400 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={simulateCap}
                      onChange={(e) => {
                        setSimulateCap(e.target.checked);
                        if (e.target.checked) {
                          setPlayStatus(normalizePlayStatus({
                            playedMs: 0,
                            remainingMs: 60 * 60 * 1000,
                            locked: false,
                            dailyPlayCapMs: 60 * 60 * 1000,
                          }));
                        }
                      }}
                    />
                    Simulate cap
                  </label>
                ) : null}
                {mult.syndicateProfitMult > 1 ? (
                  <span
                    className="inline-flex items-center gap-1 rounded-md border border-emerald-400/80 bg-emerald-500/20 px-2 py-0.5 text-[11px] font-bold text-emerald-200 tabular-nums shadow-sm"
                    title={`Permanent Syndicate Bonus: ${mult.syndicatesCompleted} completed tender(s). +${Math.round((mult.syndicateProfitMult - 1) * 100)}% fleet profit across all depots!`}
                  >
                    🤝 {mult.syndicateProfitMult.toFixed(1)}× SYNDICATE MULTIPLIER
                  </span>
                ) : null}
                {mult.frenzyActive ? (
                  <span className="inline-flex items-center gap-1 rounded-md border border-amber-400/70 bg-amber-500/20 px-2 py-0.5 text-[11px] font-bold text-amber-200 animate-pulse tabular-nums">
                    🔥 OVERDRIVE {mult.frenzySpeedMult || 2}× SPEED · {mult.frenzyRemainingSec}s
                  </span>
                ) : null}
                {mult.underdogActive ? (
                  <span className="inline-flex items-center gap-1 rounded-md border border-fuchsia-400/70 bg-fuchsia-500/20 px-2 py-0.5 text-[11px] font-bold text-fuchsia-200 animate-pulse tabular-nums">
                    🚀 UNDERDOG 3× PROFIT · {formatDuration(mult.underdogRemainingSec)}
                  </span>
                ) : null}
                {mult.breakdownActive ? (
                  <span className="inline-flex items-center gap-1 rounded-md border border-rose-400/80 bg-rose-500/25 px-2 py-0.5 text-[11px] font-bold text-rose-200 animate-pulse tabular-nums">
                    ⚠️ FLEET BREAKDOWN · {Math.round(mult.breakdownSpeedMult * 100)}% SPEED · {mult.breakdownRemainingSec}s
                  </span>
                ) : null}
              </div>
              <p className="text-xs text-slate-400 mt-1">
                {playLocked
                  ? 'Active play paused — away earnings still tick at ~10%'
                  : totalRps > 0
                    ? totalRps > rps
                      ? `${formatMoney(totalRps)}/s across hubs (${formatMoney(rps)}/s here)`
                      : `${formatMoney(totalRps)}/s with managers`
                    : 'Click a vehicle to send it on a job'}
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
                  {' · '}
                  {formatMoney(leaderboardMe.claimedAngels ?? accountClaimedAngels, { symbol: '' })} claimed backers
                  {leaderboard.length ? ` · top ${Math.min(5, leaderboard.length)} on Profile too` : ''}
                </button>
              ) : null}
              {!sandbox && !cloudReady ? (
                <p className="text-[10px] text-slate-500 mt-1">Syncing account progress…</p>
              ) : null}
            </div>
            <div className="flex flex-wrap gap-1.5 items-center">
              <GameUiButton
                size="sm"
                variant="neutral"
                pressed={!soundMuted}
                onClick={toggleSound}
                title={soundMuted ? 'Unmute game sound effects' : 'Mute game sound effects'}
              >
                {soundMuted ? '🔇 Muted' : '🔊 SFX'}
              </GameUiButton>
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
                  title={mode === 'next' ? 'Buy exact quantity to reach next milestone' : undefined}
                >
                  x{mode === 'max' ? 'Max' : mode === 'next' ? 'Next' : mode}
                </GameUiButton>
              ))}
            </div>
          </div>

          {rivalInfo ? (
            <button
              type="button"
              onClick={() => setTab('leaderboard')}
              className="w-full rounded-xl border border-sky-400/30 bg-slate-900/75 hover:bg-slate-900 px-3 py-1.5 flex flex-wrap items-center justify-between gap-2 text-xs text-left transition-colors"
              title="Click to open Leaderboard"
            >
              <div className="flex items-center gap-2 min-w-0">
                <span className="gui-font-narrow uppercase tracking-wider text-sky-300 shrink-0">
                  {rivalInfo.isLeading ? '👑 #1 Fleet Boss' : `🏁 Chasing #${rivalInfo.targetRank}`}
                </span>
                <span className="text-slate-200 truncate">
                  {rivalInfo.isLeading ? (
                    <>
                      Leading <strong>{rivalInfo.rivalName}</strong> by{' '}
                      <strong className="text-amber-300">{formatMoney(rivalInfo.gap)}</strong>
                    </>
                  ) : (
                    <>
                      <strong>{rivalInfo.rivalName}</strong> ·{' '}
                      <strong className="text-amber-300">{formatMoney(rivalInfo.gap)}</strong> to overtake
                    </>
                  )}
                </span>
              </div>
              {!rivalInfo.isLeading ? (
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-[10px] text-sky-300 tabular-nums">{rivalInfo.pct}%</span>
                  <div className="w-24 sm:w-32 h-2 rounded-full bg-slate-800 overflow-hidden border border-slate-700">
                    <div
                      className="h-full bg-gradient-to-r from-sky-400 to-emerald-400 transition-all duration-300"
                      style={{ width: `${rivalInfo.pct}%` }}
                    />
                  </div>
                </div>
              ) : null}
            </button>
          ) : null}

          {activeCharter && !playLocked ? (
            activeCharter.category === 'negative' ? (
              <div className="rounded-xl border-2 border-rose-500 bg-gradient-to-r from-rose-950/90 via-red-900/70 to-amber-950/80 p-3 sm:p-3.5 flex flex-wrap items-center justify-between gap-3 shadow-xl animate-pulse ring-2 ring-rose-500/30">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="rounded bg-rose-600 px-2 py-0.5 text-[10px] font-black uppercase tracking-wider text-white shadow">
                      🚨 CRISIS ALERT · {charterRemainingSec}s
                    </span>
                    <p className="gui-font text-sm sm:text-base text-rose-100 font-bold truncate">
                      {activeCharter.title}
                    </p>
                  </div>
                  <p className="text-xs text-rose-200/90 mt-1">
                    {activeCharter.subtitle}
                  </p>
                  <p className="text-[11px] text-amber-300 font-semibold mt-0.5">
                    ⚠️ Failure to react in time: <span className="underline">{activeCharter.penaltyLabel}</span>
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <GameUiButton size="sm" variant="danger" onClick={acceptVipCharter}>
                    {activeCharter.actionLabel || '🔧 Resolve Crisis'}
                  </GameUiButton>
                </div>
              </div>
            ) : (
              <div className="rounded-xl border-2 border-amber-400 bg-gradient-to-r from-amber-500/25 via-orange-500/20 to-emerald-500/20 px-3.5 py-2.5 flex flex-wrap items-center justify-between gap-3 shadow-lg">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="rounded bg-amber-400 px-1.5 py-0.5 text-[10px] font-extrabold uppercase tracking-wider text-slate-950">
                      ✨ Urgent Charter · {charterRemainingSec}s
                    </span>
                    <p className="gui-font text-sm text-white truncate">{activeCharter.title}</p>
                  </div>
                  <p className="text-xs text-amber-100/90 mt-0.5 truncate">
                    {activeCharter.subtitle} — <strong className="text-emerald-300">{activeCharter.rewardLabel}</strong>
                  </p>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <GameUiButton size="sm" variant="success" onClick={acceptVipCharter}>
                    {activeCharter.actionLabel || 'Accept Charter'} ({activeCharter.rewardLabel})
                  </GameUiButton>
                  <button
                    type="button"
                    onClick={() => setActiveCharter(null)}
                    className="text-xs text-slate-400 hover:text-white px-1.5 py-1"
                    title="Dismiss charter"
                  >
                    ✕
                  </button>
                </div>
              </div>
            )
          ) : null}

          {adminMode && isAdmin ? (
            <div className="rounded-xl border-2 border-amber-400/40 bg-amber-500/10 px-3 py-2 flex flex-wrap items-center gap-2">
              <p className="text-xs text-amber-100 flex-1 min-w-[12rem]">
                Admin mode — award play hours, edit fleet / depot / upgrade titles, manage events &amp; map vehicle images.
              </p>
              <GameUiButton
                size="sm"
                variant="success"
                onClick={() => setTab('playtime')}
                title="Open the Play Hours Admin Panel to grant extra daily play time to any user"
              >
                ⏱️ Award Play Hours
              </GameUiButton>
              <GameUiButton
                size="sm"
                variant="primary"
                onClick={() => {
                  setMapperDepotId(state.activeDepot);
                  setMapperPickerSlot(null);
                  setMapperOpen(true);
                }}
              >
                🖼 Map Images &amp; Titles
              </GameUiButton>
              <GameUiButton
                size="sm"
                variant="neutral"
                onClick={fixAllTitleCase}
                title="Convert all vehicle, depot, and upgrade titles to proper Title Case"
              >
                Aa Fix Title Case
              </GameUiButton>
              <GameUiButton
                size="sm"
                variant="warning"
                onClick={spawnVipCharter}
                title="Trigger a random VIP Charter bonus event right now"
              >
                ⚡ Spawn Charter
              </GameUiButton>
              <GameUiButton
                size="sm"
                variant="success"
                onClick={() => spawnUnderdogOffer(true)}
                title="Trigger the Underdog 3× Profit (5m) event popup right now"
              >
                🚀 Spawn Underdog 3×
              </GameUiButton>
              <GameUiButton
                size="sm"
                variant="accent"
                disabled={!namesDirty || namesSaving}
                onClick={saveNames}
              >
                {namesSaving ? 'Saving…' : namesDirty ? 'Save titles & images' : 'Saved'}
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
              ['fleet', 'Fleet', 0],
              ['managers', 'Managers', affordableManagersList.length + affordablePromotionsCount],
              ['upgrades', 'Upgrades', affordableCashUpgradesList.length],
              ['angels', 'Backers', affordableAngelUpgradesCount + (prestigePreview.recommended ? 1 : 0)],
              ['syndicate', '🤝 Syndicate', syndicateContract?.status === 'active' ? 1 : 0],
              ['leaderboard', 'Leaderboard', 0],
              ...(adminMode && isAdmin
                ? [
                    ['playtime', '⏱️ Play Time', 0],
                    ['events', '🎪 Events', eventsCatalog.length],
                  ]
                : []),
            ].map(([id, label, badgeCount]) => (
              <GameUiButton
                key={id}
                size="sm"
                variant={tab === id ? 'primary' : 'neutral'}
                pressed={tab === id}
                onClick={() => setTab(id)}
              >
                <span className="inline-flex items-center gap-1.5">
                  <span>{label}</span>
                  {badgeCount > 0 ? (
                    <span className="inline-flex items-center justify-center rounded-full bg-emerald-400 px-1.5 py-0.2 text-[10px] font-bold leading-tight text-slate-950 shadow">
                      {badgeCount}
                    </span>
                  ) : null}
                </span>
              </GameUiButton>
            ))}
            <GameUiButton
              size="sm"
              variant="neutral"
              onClick={() => setMilestonesOpen(true)}
              title="View all upcoming vehicle milestones, All-Fleet bonuses, and cross-fleet synergies"
            >
              🏆 Milestones
            </GameUiButton>
            <div className="flex-1" />
            <GameUiButton
              size="sm"
              variant={prestigePreview.recommended ? 'success' : 'warning'}
              disabled={playLocked}
              onClick={() => {
                if (playLocked) return;
                setResetOpen(true);
              }}
              title={
                prestigePreview.pending > 0
                  ? `Claiming now boosts backer profit multiplier by +${prestigePreview.profitGainPct.toFixed(0)}%`
                  : 'Earn more revenue to attract silent partners'
              }
            >
              <span className="inline-flex items-center gap-1.5">
                <span>
                  Claim {pending > 0 ? formatMoney(pending, { symbol: '' }) : '0'} backers
                </span>
                {prestigePreview.recommended ? (
                  <span className="rounded bg-amber-300 px-1.5 py-0.2 text-[10px] font-bold text-slate-950">
                    ★ +{prestigePreview.profitGainPct >= 1000 ? formatMoney(prestigePreview.profitGainPct, { symbol: '' }) : prestigePreview.profitGainPct.toFixed(0)}%
                  </span>
                ) : null}
              </span>
            </GameUiButton>
          </div>

          {tab === 'fleet' ? (
            <div
              className={`ccap-fleet ccap-fleet--${
                depot.theme || 'local'
              } space-y-3 max-h-[min(74vh,780px)] overflow-y-auto pr-1 rounded-lg border-[3px] border-[#0b1218] bg-[#152231] px-2.5 py-3 sm:px-3.5 sm:py-3.5`}
            >
              {globalUnlock ? (
                <button
                  type="button"
                  onClick={() => setMilestonesOpen(true)}
                  className="w-full rounded-lg border border-black/40 bg-slate-950/60 hover:bg-slate-950/80 px-3 py-1.5 flex flex-wrap items-center justify-between gap-2 text-xs text-left transition-colors"
                  title="Click to inspect full Milestone & Synergy Roadmap"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="gui-font-narrow uppercase tracking-wider text-amber-300 shrink-0">
                      🏆 All-Fleet Unlock
                    </span>
                    <span className="text-slate-200 truncate">
                      Every vehicle at {globalUnlock.currentMin}/{globalUnlock.at} →{' '}
                      <strong className="text-emerald-300">{globalUnlock.effectLabel}</strong>
                    </span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <div className="w-28 sm:w-36 h-2 rounded-full bg-slate-800 overflow-hidden border border-slate-700">
                      <div
                        className="h-full bg-gradient-to-r from-amber-400 to-emerald-400 transition-all duration-300"
                        style={{
                          width: `${Math.min(
                            100,
                            Math.round((globalUnlock.currentMin / globalUnlock.at) * 100),
                          )}%`,
                        }}
                      />
                    </div>
                    <span className="text-[10px] text-sky-300 font-semibold">Roadmap →</span>
                  </div>
                </button>
              ) : null}

              <div className="ccap-fleet-grid">
                {depot.businesses.map((biz, i) => (
                  <BusinessRow
                    key={biz.id}
                    playLocked={playLocked}
                    depot={depot}
                    biz={biz}
                    index={i}
                    owned={depotState.owned[i] || 0}
                    managed={depotState.managers[i]}
                    cash={accountCash}
                    priceMult={getBusinessCostMultiplier(depot, depotState, i)}
                    buyMode={state.buyMode}
                    stats={mult.perBusiness[i]}
                    progress={depotState.progress[i] || 0}
                    running={depotState.running[i]}
                    lastTick={depotState.lastTick || 0}
                    flashingMilestone={Boolean(flashingRows[i])}
                    isBestRoi={fleetRecs.bestRoiIndex === i}
                    isClosestMilestone={fleetRecs.closestMilestoneIndex === i}
                    onOpenMilestones={() => setMilestonesOpen(true)}
                    adminMode={adminMode && isAdmin}
                    onRename={renameBusiness}
                    onOpenMapper={(slotId) => {
                      setMapperDepotId(state.activeDepot);
                      setMapperPickerSlot(slotId);
                      setMapperOpen(true);
                    }}
                    onRun={() => {
                      if (playLocked) return;
                      playCoachCapSfx('run');
                      patch(startCycle(depot, depotState, i));
                    }}
                    onBuy={() => {
                      if (playLocked) return;
                      const prevOwned = [...(depotState.owned || [])];
                      const next = buyBusinesses(state, state.activeDepot, i, state.buyMode);
                      const nextOwned = next.depots[state.activeDepot]?.owned || prevOwned;
                      if ((nextOwned[i] || 0) !== (prevOwned[i] || 0)) {
                        celebratePurchase(depot, prevOwned, nextOwned, `Bought ${biz.name}`);
                      }
                      replaceState(next);
                    }}
                  />
                ))}
              </div>
            </div>
          ) : null}

          {tab === 'managers' ? (
            <div className="space-y-2.5 max-h-[min(70vh,720px)] overflow-y-auto">
              <p className="text-xs text-slate-400">
                Hire managers to automate dispatch, then <strong>promote</strong> them to{' '}
                <span className="text-sky-300">Senior Dispatcher</span> and{' '}
                <span className="text-amber-300">Fleet Director</span> for permanent run speed, profit, and vehicle cost discounts.
              </p>
              {affordableManagersList.length > 0 ? (
                <div className="rounded-xl border-2 border-emerald-400/40 bg-emerald-500/10 px-3 py-2 flex flex-wrap items-center justify-between gap-2">
                  <p className="text-xs text-emerald-100">
                    <strong>{affordableManagersList.length}</strong> manager
                    {affordableManagersList.length === 1 ? '' : 's'} ready to hire right now.
                  </p>
                  <GameUiButton
                    size="sm"
                    variant="success"
                    disabled={playLocked}
                    onClick={() => {
                      if (playLocked) return;
                      const res = buyAllAffordableManagers(state, state.activeDepot);
                      if (res.hiredCount > 0) {
                        playCoachCapSfx('manager');
                        replaceState(res.state);
                        setToast(
                          `Hired ${res.hiredCount} manager${res.hiredCount === 1 ? '' : 's'} (${formatMoney(res.totalCost)})`,
                        );
                      }
                    }}
                  >
                    Hire All Affordable ({affordableManagersList.length}) ·{' '}
                    {formatMoney(affordableManagersList.reduce((s, m) => s + m.cost, 0))}
                  </GameUiButton>
                </div>
              ) : null}
              <div className="grid sm:grid-cols-2 gap-2">
                {depot.managers.map((mgr, i) => {
                  const owned = depotState.owned[i] || 0;
                  const have = depotState.managers[i];
                  const mgrCost = (mgr.cost || 0) * priceMult;
                  const can = !playLocked && !have && owned > 0 && accountCash >= mgrCost;
                  const targetBiz = depot.businesses[i];
                  const promo = getManagerPromotionInfo(depot, depotState, i);
                  const canPromote = !playLocked && have && Boolean(promo.nextId) && accountCash >= promo.nextCost;
                  return (
                    <div
                      key={mgr.name}
                      className={`rounded-xl border-2 p-3 flex items-center gap-3 ${
                        promo.level >= 3
                          ? 'border-amber-400/50 bg-amber-500/10'
                          : promo.level === 2
                            ? 'border-sky-400/40 bg-sky-500/10'
                            : 'border-slate-700 bg-slate-900/60'
                      }`}
                    >
                      {targetBiz?.iconType ? (
                        <div className="w-12 h-12 shrink-0 rounded-md overflow-hidden border border-slate-600">
                          <DepotBusinessArt biz={targetBiz} className="w-full h-full" />
                        </div>
                      ) : targetBiz?.art ? (
                        <img
                          src={targetBiz.art}
                          alt=""
                          className="w-12 h-12 shrink-0 rounded-md object-contain bg-slate-100 border border-slate-600"
                          draggable={false}
                        />
                      ) : (
                        <BusIcon colour={targetBiz?.colour} className="w-10 h-10 shrink-0" />
                      )}
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <p className="gui-font text-sm text-white truncate">{mgr.name}</p>
                          {have ? (
                            <span
                              className={`rounded px-1.5 py-0.2 text-[10px] font-bold ${
                                promo.level >= 3
                                  ? 'bg-amber-400 text-slate-950'
                                  : promo.level === 2
                                    ? 'bg-sky-400 text-slate-950'
                                    : 'bg-emerald-500/30 text-emerald-200 border border-emerald-400/40'
                              }`}
                            >
                              Lv.{promo.level} {promo.title}
                            </span>
                          ) : null}
                        </div>
                        <p className="text-[11px] text-slate-300 truncate">
                          Runs {targetBiz?.name}
                        </p>
                        {have ? (
                          <p className="text-[10px] text-emerald-300/90 mt-0.5 truncate">
                            {promo.activeEffectLabel}
                          </p>
                        ) : null}
                      </div>
                      {have ? (
                        promo.nextId ? (
                          <div className="text-right shrink-0">
                            <GameUiButton
                              size="sm"
                              variant={canPromote ? 'accent' : 'neutral'}
                              disabled={!canPromote}
                              onClick={() => {
                                if (playLocked) return;
                                playCoachCapSfx('upgrade');
                                replaceState(promoteManager(state, state.activeDepot, i));
                                setToast(`Promoted ${mgr.name} to ${promo.nextTitle}!`);
                              }}
                              title={`Promote to ${promo.nextTitle}: ${promo.nextEffectLabel}`}
                            >
                              <span className="block text-[10px] uppercase tracking-wide">
                                Promote → Lv.{promo.nextLevel}
                              </span>
                              <span className="gui-font text-xs tabular-nums">
                                {formatMoney(promo.nextCost)}
                              </span>
                            </GameUiButton>
                          </div>
                        ) : (
                          <GameUiBadge tone="amber">★ Max Rank</GameUiBadge>
                        )
                      ) : (
                        <GameUiButton
                          size="md"
                          variant={can ? 'success' : 'neutral'}
                          disabled={!can}
                          onClick={() => {
                            if (playLocked) return;
                            playCoachCapSfx('manager');
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
            </div>
          ) : null}

          {tab === 'upgrades' ? (
            <div className="space-y-3 max-h-[min(70vh,720px)] overflow-y-auto">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs text-slate-400">
                  Cash upgrades for <strong>{depot.name}</strong>. Near-affordable buys appear first; purchased stay listed below.
                </p>
                {affordableCashUpgradesList.length > 0 ? (
                  <GameUiButton
                    size="sm"
                    variant="accent"
                    disabled={playLocked}
                    onClick={() => {
                      if (playLocked) return;
                      const res = buyAllAffordableCashUpgrades(state, state.activeDepot);
                      if (res.boughtCount > 0) {
                        playCoachCapSfx('upgrade');
                        replaceState(res.state);
                        setToast(
                          `Bought ${res.boughtCount} upgrade${res.boughtCount === 1 ? '' : 's'} (${formatMoney(res.totalCost)})`,
                        );
                      }
                    }}
                  >
                    Buy All Affordable ({affordableCashUpgradesList.length}) ·{' '}
                    {formatMoney(affordableCashUpgradesList.reduce((s, u) => s + u.cost, 0))}
                  </GameUiButton>
                ) : null}
              </div>
              {affordables.length === 0 ? (
                <p className="text-sm text-slate-500 py-4 text-center">Keep earning — upgrades unlock as you grow.</p>
              ) : null}
              {affordables.map((up) => {
                const upCost = up.cost * priceMult;
                const can = !playLocked && accountCash >= upCost;
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
                        if (playLocked) return;
                        playCoachCapSfx('upgrade');
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
              <div className="rounded-xl border-2 border-amber-500/40 bg-amber-500/10 p-4 space-y-2">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="gui-font text-amber-200 text-sm">Silent partners (shared)</p>
                    <p className="text-2xl gui-font text-amber-300 mt-1 tabular-nums">
                      {formatMoney(accountAngels, { symbol: '' })}{' '}
                      <span className="text-xs text-amber-200/80 font-normal">
                        active ({formatMoney(accountClaimedAngels, { symbol: '' })} total claimed)
                      </span>
                    </p>
                  </div>
                  {pending > 0 ? (
                    <GameUiButton
                      size="sm"
                      variant={prestigePreview.recommended ? 'success' : 'warning'}
                      disabled={playLocked}
                      onClick={() => {
                        if (playLocked) return;
                        setResetOpen(true);
                      }}
                    >
                      Claim +{formatMoney(pending, { symbol: '' })} now
                    </GameUiButton>
                  ) : null}
                </div>
                <p className="text-xs text-amber-100/80">
                  Shared across all depots. Each backer boosts profits by {(mult.angelRate * 100).toFixed(0)}%.
                  Pending claim: <strong>{formatMoney(pending, { symbol: '' })}</strong>.
                  Spent on upgrades: <strong>{formatMoney(state.angelsSpent || 0, { symbol: '' })}</strong>.
                </p>
                {pending > 0 ? (
                  <div
                    className={`rounded-lg border px-3 py-2 text-xs ${
                      prestigePreview.recommended
                        ? 'border-emerald-400/50 bg-emerald-500/15 text-emerald-100'
                        : 'border-amber-400/30 bg-slate-950/50 text-amber-100/90'
                    }`}
                  >
                    <p className="font-semibold">
                      {prestigePreview.recommended
                        ? '★ Recommended time to claim backers!'
                        : 'Prestige Preview'}
                    </p>
                    <p className="mt-0.5">
                      Claiming now raises your backer profit bonus from{' '}
                      <strong>×{formatMoney(prestigePreview.currentMult, { symbol: '' })}</strong> to{' '}
                      <strong>×{formatMoney(prestigePreview.afterMult, { symbol: '' })}</strong> (
                      <strong>
                        +{prestigePreview.profitGainPct >= 1000
                          ? formatMoney(prestigePreview.profitGainPct, { symbol: '' })
                          : prestigePreview.profitGainPct.toFixed(0)}%
                      </strong>{' '}
                      faster income on your next run).
                    </p>
                  </div>
                ) : null}
                <p className="text-[11px] text-amber-100/70">
                  Score weights · Local ×1 · Regional ×2.5 · National ×5 · Permanent Backer Perks survive every reset!
                </p>
              </div>
              {angelAfford.map((up) => {
                const can = !playLocked && accountAngels >= up.cost;
                return (
                  <div
                    key={up.id}
                    className={`rounded-xl border-2 p-3 flex items-center justify-between gap-3 ${
                      can
                        ? 'border-amber-400/50 bg-amber-500/10'
                        : 'border-slate-700 bg-slate-900/60'
                    }`}
                  >
                    <div className="min-w-0">
                      <p className="gui-font text-sm text-white">{up.name}</p>
                      <p className="text-[11px] text-slate-300">
                        {describeAngelUpgradeEffect(depot, up)}
                      </p>
                    </div>
                    <GameUiButton
                      size="sm"
                      variant={can ? 'warning' : 'neutral'}
                      disabled={!can}
                      onClick={() => {
                        if (playLocked) return;
                        const prevOwned = [...(depotState.owned || [])];
                        const next = buyAngelUpgrade(state, state.activeDepot, up.id);
                        const nextOwned = next.depots[state.activeDepot]?.owned || prevOwned;
                        if (up.flatOwned || up.bonusOwned) {
                          celebratePurchase(depot, prevOwned, nextOwned, up.name);
                        } else {
                          playCoachCapSfx('upgrade');
                          setToast(up.name);
                        }
                        replaceState(next);
                      }}
                    >
                      {formatMoney(up.cost, { symbol: '' })} backers
                    </GameUiButton>
                  </div>
                );
              })}
              {purchasedAngelUpgrades.length > 0 ? (
                <div className="space-y-2 pt-2 border-t border-slate-700">
                  <p className="text-xs font-semibold text-amber-200">
                    Owned Backer Perks ({purchasedAngelUpgrades.length})
                  </p>
                  {purchasedAngelUpgrades.map((up) => (
                    <div
                      key={`owned-angel-${up.id}`}
                      className="rounded-xl border-2 border-emerald-500/25 bg-emerald-500/5 px-3 py-2 flex items-center justify-between gap-3"
                    >
                      <div className="min-w-0">
                        <p className="gui-font text-sm text-emerald-100 truncate">{up.name}</p>
                        <p className="text-[11px] text-slate-400">
                          {describeAngelUpgradeEffect(depot, up)}
                        </p>
                      </div>
                      <GameUiBadge tone="green">Permanent</GameUiBadge>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}

          {tab === 'syndicate' ? (
            <CoachCapitalistSyndicatePanel
              contract={syndicateContract}
              accountCash={accountCash}
              gameState={state}
              currentUid={currentUid || leaderboardMe?.uid || ''}
              onContribute={handleContributeSyndicate}
              busy={syndicateBusy}
              syndicatesCompleted={state.syndicatesCompleted || 0}
              isAdmin={isAdmin}
              isSyndicateDirector={isSyndicateDirector}
              onAdvanceContract={handleAdvanceSyndicateContract}
            />
          ) : null}

          {tab === 'leaderboard' ? (
            <div className="space-y-3 max-h-[min(70vh,720px)] overflow-y-auto">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <p className="text-xs text-slate-400">
                    Shared all-time earnings &amp; claimed backers board. Scores only increase and never reset on Backer claim!
                  </p>
                  <span className="inline-block w-2 h-2 rounded-full bg-emerald-400 animate-ping" title="Live updating every 8s" />
                </div>
                <GameUiButton size="sm" variant="neutral" disabled={leaderboardLoading} onClick={() => loadLeaderboard(false)}>
                  {leaderboardLoading ? 'Syncing…' : 'Sync Now'}
                </GameUiButton>
              </div>
              {leaderboardMe?.rank ? (
                <div className="rounded-xl border-2 border-sky-400/40 bg-sky-500/10 px-3 py-2 text-sm text-sky-100 flex flex-wrap items-center justify-between gap-2">
                  <span>
                    You are rank <strong>#{leaderboardMe.rank}</strong>
                    {' · '}
                    {formatMoney(leaderboardMe.lifetimeEarnings || lifetimeTotal)}
                  </span>
                  <span className="text-xs text-violet-200 tabular-nums">
                    {formatMoney(
                      leaderboardMe.claimedAngels ?? accountClaimedAngels,
                      { symbol: '' },
                    )}{' '}
                    claimed backers
                  </span>
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
                    const rowClaimed = Math.max(0, Number(row.claimedAngels) || 0);
                    const rowLife = Number(row.lifetimeEarnings) || 0;
                    const rowDepots = Array.isArray(row.unlockedDepots) && row.unlockedDepots.length
                      ? row.unlockedDepots
                      : [
                          'local',
                          ...(rowLife >= 1e12 ? ['regional'] : []),
                          ...(rowLife >= 2.5e16 ? ['national'] : []),
                        ];
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
                          <div className="flex flex-wrap items-center gap-1.5">
                            <p className="gui-font text-sm text-white truncate">
                              {row.fullName}
                              {mine ? ' (you)' : ''}
                            </p>
                            <div className="inline-flex items-center gap-1">
                              {rowDepots.includes('national') ? (
                                <span className="rounded bg-rose-500/25 border border-rose-400/40 px-1.5 py-0.2 text-[9px] font-bold text-rose-200">
                                  National
                                </span>
                              ) : null}
                              {rowDepots.includes('regional') ? (
                                <span className="rounded bg-emerald-500/25 border border-emerald-400/40 px-1.5 py-0.2 text-[9px] font-bold text-emerald-200">
                                  Regional
                                </span>
                              ) : null}
                              <span className="rounded bg-slate-700/80 border border-slate-600 px-1.5 py-0.2 text-[9px] text-slate-300">
                                Local
                              </span>
                            </div>
                          </div>
                          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] mt-0.5">
                            <span className="text-violet-300 font-medium tabular-nums">
                              🤝 {formatMoney(rowClaimed, { symbol: '' })} claimed backers
                            </span>
                            {row.updatedAt ? (
                              <span className="text-[10px] text-slate-500">
                                · Updated {new Date(row.updatedAt).toLocaleString()}
                              </span>
                            ) : null}
                          </div>
                        </div>
                        <div className="text-right shrink-0">
                          <span className="gui-font text-sm sm:text-base text-amber-300 tabular-nums block">
                            {formatMoney(row.lifetimeEarnings)}
                          </span>
                          <span className="text-[10px] text-violet-300/90 tabular-nums block sm:hidden">
                            {formatMoney(rowClaimed, { symbol: '' })} backers
                          </span>
                        </div>
                      </li>
                    );
                  })}
                </ol>
              )}
              <p className="text-[10px] text-slate-500">
                Your current total: {formatMoney(lifetimeTotal)} · Claimed backers: {formatMoney(accountClaimedAngels, { symbol: '' })}
              </p>
            </div>
          ) : null}

          {tab === 'playtime' && adminMode && isAdmin ? (
            <CoachCapitalistPlayTimeAdmin
              onPlayTimeUpdated={() => {
                sendPlayHeartbeat().catch(() => {});
              }}
            />
          ) : null}

          {tab === 'events' && adminMode && isAdmin ? (
            <CoachCapitalistEventsAdmin
              events={eventsCatalog}
              onChangeEvents={setEventsCatalog}
              onSaveConfig={handleSaveEventsConfig}
              saving={eventsSaving}
              onTestSpawn={(evt) => spawnVipCharter(evt)}
            />
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
          playCoachCapSfx('prestige');
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
          reset your current run — wallet, vehicles, managers, and cash upgrades go back
          to the start. Shared backers and permanent backer perks stay!
        </p>
        <div
          className={`rounded-lg border px-3 py-2 text-xs space-y-1 ${
            prestigePreview.recommended
              ? 'border-emerald-400/50 bg-emerald-500/15 text-emerald-100'
              : 'border-amber-400/35 bg-amber-500/10 text-amber-100'
          }`}
        >
          <p className="font-semibold">
            {prestigePreview.recommended
              ? '★ Great time to claim! Big profit multiplier jump:'
              : 'Profit Multiplier Impact:'}
          </p>
          <p>
            Active backers: <strong>{formatMoney(prestigePreview.currentAngels, { symbol: '' })}</strong> →{' '}
            <strong>{formatMoney(prestigePreview.currentAngels + pending, { symbol: '' })}</strong>
          </p>
          <p>
            Profit multiplier: <strong>×{formatMoney(prestigePreview.currentMult, { symbol: '' })}</strong> →{' '}
            <strong>×{formatMoney(prestigePreview.afterMult, { symbol: '' })}</strong> (
            <strong>
              +{prestigePreview.profitGainPct >= 1000
                ? formatMoney(prestigePreview.profitGainPct, { symbol: '' })
                : prestigePreview.profitGainPct.toFixed(0)}%
            </strong>{' '}
            net boost)
          </p>
        </div>
        <p className="text-xs text-slate-400">
          Account lifetime score is kept (Local ×1, Regional ×2.5, National ×5), and any hubs you
          have already unlocked stay unlocked on your next run!
        </p>
      </GameUiModal>

      <MilestonesRoadmapModal
        open={milestonesOpen}
        onClose={() => setMilestonesOpen(false)}
        depot={depot}
        roadmap={milestoneRoadmap}
      />

      <GameUiModal
        open={Boolean(activeUnderdogOffer) && !playLocked}
        onClose={() => setActiveUnderdogOffer(null)}
        title="🚀 Underdog Challenger Event!"
        header="yellow"
        dark
        confirmLabel={`🔥 Activate 3× Profits (5m) · ${underdogOfferRemainingSec}s`}
        confirmVariant="success"
        cancelLabel="Not now"
        className="!w-[min(30rem,calc(100%-1.5rem))]"
        onConfirm={acceptUnderdogOffer}
      >
        {activeUnderdogOffer ? (
          <div className="space-y-3 text-sm text-slate-200">
            <div className="rounded-xl border-2 border-fuchsia-400/50 bg-gradient-to-r from-fuchsia-500/20 via-violet-500/20 to-emerald-500/20 p-3 space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <span className="rounded bg-fuchsia-400 px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wider text-slate-950">
                  Challenger Boost{activeUnderdogOffer.rankTag || ''}
                </span>
                <span className="text-xs font-bold text-amber-300 tabular-nums">
                  Expires in {underdogOfferRemainingSec}s
                </span>
              </div>
              <p className="gui-font text-base text-white">{activeUnderdogOffer.title}</p>
              <p className="text-xs text-slate-200/90">{activeUnderdogOffer.subtitle}</p>
            </div>
            <div className="rounded-lg border border-emerald-400/40 bg-emerald-500/10 px-3 py-2.5 text-xs text-emerald-100 space-y-1">
              <p className="font-bold text-emerald-300 text-sm">
                🎁 Reward: 3× All-Fleet Profits for 5 Minutes
              </p>
              <p>
                Every vehicle across <strong>Local Depot</strong>, <strong>Regional Hub</strong>, and{' '}
                <strong>National Network</strong> earns <strong>triple revenue</strong> for the next 5 minutes
                 to help you close the gap on <strong>{activeUnderdogOffer.leaderName}</strong>!
              </p>
            </div>
          </div>
        ) : null}
      </GameUiModal>

      <GameUiModal
        open={seasonIntroOpen && Boolean(seasonWrapup)}
        onClose={() => {
          if (seasonId) acknowledgeSeasonIntro(seasonId);
          setSeasonIntroOpen(false);
        }}
        title={seasonId ? `Season ${seasonId} is live` : 'New season is live'}
        header="blue"
        dark
        confirmLabel="Let's go"
        confirmVariant="accent"
        cancelLabel="Close"
        className="!w-[min(28rem,calc(100%-1.5rem))]"
        onConfirm={() => {
          if (seasonId) acknowledgeSeasonIntro(seasonId);
          setSeasonIntroOpen(false);
        }}
      >
        <SeasonWrapupBody wrapup={seasonWrapup} />
      </GameUiModal>

      <GameUiModal
        open={Boolean(syndicateRewardModal)}
        onClose={() => setSyndicateRewardModal(null)}
        title={syndicateRewardModal?.modalTitle || '🎪 Syndicate Tender Victory!'}
        header="yellow"
        dark
        confirmLabel={syndicateRewardModal?.confirmLabel || 'Collect Dividend & Expand Fleet'}
        confirmVariant="success"
        className="!w-[min(32rem,calc(100%-1.5rem))]"
        onConfirm={() => {
          if (syndicateRewardModal) {
            setToast(`💰 +${formatMoney(syndicateRewardModal.payoutCash)} credited to your fleet wallet!`);
          }
          setSyndicateRewardModal(null);
        }}
      >
        {syndicateRewardModal && (
          <div className="space-y-4 py-1">
            <div className="text-center space-y-1">
              <span className="inline-block rounded-full bg-emerald-500/20 border border-emerald-400/50 px-3 py-0.5 text-xs font-black uppercase tracking-wider text-emerald-300">
                {syndicateRewardModal.badgeText || 'Tender Won & Paid Out'}
              </span>
              <h3 className="gui-font text-lg font-black text-white">
                {syndicateRewardModal.tenderTitle || 'Collective Syndicate Tender'}
              </h3>
              <p className="text-xs text-slate-300">
                {syndicateRewardModal.customMessage ||
                  'Congratulations Operator! The collective fleet target was achieved and your dividend has been credited!'}
              </p>
            </div>

            <div className="rounded-xl border border-emerald-500/30 bg-emerald-950/30 p-3.5 space-y-2.5">
              {!syndicateRewardModal.hideContribution && (
                <div className="flex items-center justify-between border-b border-emerald-500/20 pb-2 text-xs">
                  <span className="text-slate-400">Your Contribution:</span>
                  <span className="gui-font text-slate-200 font-mono">
                    {formatMoney(syndicateRewardModal.pledged)}
                    {syndicateRewardModal.vehiclesDonated > 0 ? ` + ${syndicateRewardModal.vehiclesDonated} vehicles donated` : ''}
                  </span>
                </div>
              )}
              {Number(syndicateRewardModal.payoutCash) > 0 && (
                <div className="flex items-center justify-between border-b border-emerald-500/20 pb-2">
                  <span className="text-xs text-emerald-400 font-bold">
                    {syndicateRewardModal.cashLabel || `${syndicateRewardModal.cashReturnMult || 10}× Dividend Payout:`}
                  </span>
                  <span className="gui-font text-base sm:text-lg text-emerald-300 font-bold font-mono">
                    +{formatMoney(syndicateRewardModal.payoutCash)}
                  </span>
                </div>
              )}
              {Number(syndicateRewardModal.bonusAngels) > 0 && (
                <div className="flex items-center justify-between border-b border-emerald-500/20 pb-2">
                  <span className="text-xs text-purple-300 font-bold">
                    ✨ Backers (Angels) Awarded:
                  </span>
                  <span className="gui-font text-base sm:text-lg text-purple-300 font-bold font-mono">
                    +{Number(syndicateRewardModal.bonusAngels).toLocaleString('en-GB')} Backers
                  </span>
                </div>
              )}
              {syndicateRewardModal.playTimeReset && (
                <div className="flex items-center justify-between border-b border-emerald-500/20 pb-2 text-xs">
                  <span className="text-sky-300 font-bold">
                    ⏱️ Daily Play Time:
                  </span>
                  <span className="gui-font text-sky-300 font-bold font-mono">
                    Full Reset (0m used today!)
                  </span>
                </div>
              )}

              {syndicateRewardModal.sponsorReward && (
                <div className="rounded-lg border border-amber-400/40 bg-amber-950/40 p-2.5 space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="text-lg">{syndicateRewardModal.sponsorReward.icon || '🎁'}</span>
                    <span className="gui-font text-xs text-amber-300 font-bold">
                      {syndicateRewardModal.sponsorReward.labelPrefix || 'Sponsor Reward Won:'} {syndicateRewardModal.sponsorReward.title}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-300 leading-snug">
                    {syndicateRewardModal.sponsorReward.desc}
                  </p>
                </div>
              )}

              {!syndicateRewardModal.hideCoins && (
                <div className="flex items-center justify-between border-b border-emerald-500/20 pb-2 text-xs">
                  <span className="text-amber-300 font-bold">
                    Portal Coins Awarded:
                  </span>
                  <span className="gui-font text-amber-300 font-bold font-mono">
                    +{syndicateRewardModal.coins || 150} Coins 🪙
                  </span>
                </div>
              )}
              {!syndicateRewardModal.hideMultiplier && (
                <div className="flex items-center justify-between pt-1">
                  <div>
                    <p className="text-xs text-teal-300 font-bold">
                      Permanent Fleet Multiplier:
                    </p>
                    <p className="text-[10px] text-teal-200/70">
                      Boosts profits across ALL depots forever (+0.5× per syndicate)!
                    </p>
                  </div>
                  <span className="gui-font text-lg text-teal-300 font-black font-mono">
                    {Number(syndicateRewardModal.multiplier || 1.5).toFixed(1)}× ⚡
                  </span>
                </div>
              )}
            </div>
          </div>
        )}
      </GameUiModal>

      {isAdmin ? (
        <AdminImageMapperModal
          open={mapperOpen}
          onClose={() => {
            setMapperOpen(false);
            setMapperPickerSlot(null);
          }}
          depotId={mapperDepotId}
          onSelectDepot={(id) => {
            setMapperDepotId(id);
            setMapperPickerSlot(null);
          }}
          pickerSlot={mapperPickerSlot}
          onTogglePickerSlot={(slotId) =>
            setMapperPickerSlot((cur) => (cur === slotId ? null : slotId))
          }
          nameConfig={nameConfig}
          namesDirty={namesDirty}
          namesSaving={namesSaving}
          namesError={namesError}
          onRenameBusiness={renameBusiness}
          onSetBusinessArt={setBusinessArt}
          onFixAllTitleCase={fixAllTitleCase}
          onAutoMatchImages={() => autoMatchLocalImages(mapperDepotId)}
          onSave={async () => {
            const ok = await saveNames();
            if (ok) {
              setMapperOpen(false);
              setMapperPickerSlot(null);
            }
          }}
        />
      ) : null}
    </div>
  );
}

function AdminImageMapperModal({
  open,
  onClose,
  depotId,
  onSelectDepot,
  pickerSlot,
  onTogglePickerSlot,
  nameConfig,
  namesDirty,
  namesSaving,
  namesError,
  onRenameBusiness,
  onSetBusinessArt,
  onFixAllTitleCase,
  onAutoMatchImages,
  onSave,
}) {
  if (!open) return null;
  const targetBaseDepot = getDepot(depotId);
  const labeledDepot = applyNameOverrides(targetBaseDepot, nameConfig);
  const photoOptions = COACH_CAP_ART_CATALOGUE.filter((item) => item.kind === 'photo');
  const svgOptions = COACH_CAP_ART_CATALOGUE.filter((item) => item.kind === 'svg');

  return (
    <GameUiModal
      open={open}
      onClose={onClose}
      title="Map Vehicle Images & Titles"
      header="yellow"
      dark
      confirmLabel={namesSaving ? 'Saving…' : namesDirty ? 'Save for Everyone' : 'Saved'}
      confirmVariant="accent"
      cancelLabel="Close"
      className="!w-[min(52rem,calc(100%-1rem))]"
      onConfirm={onSave}
    >
      <div className="space-y-3 text-xs text-slate-200 max-h-[72vh] overflow-y-auto pr-1">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-700 pb-2.5">
          <div className="flex flex-wrap gap-1.5">
            {DEPOTS.map((d) => {
              const dLabeled = applyNameOverrides(d, nameConfig);
              const active = d.id === depotId;
              return (
                <GameUiButton
                  key={d.id}
                  size="sm"
                  variant={active ? 'primary' : 'neutral'}
                  pressed={active}
                  onClick={() => onSelectDepot(d.id)}
                >
                  {dLabeled.name}
                </GameUiButton>
              );
            })}
          </div>
          <div className="flex flex-wrap gap-1.5">
            <GameUiButton
              size="sm"
              variant="neutral"
              onClick={onFixAllTitleCase}
              title="Convert all vehicle, depot, and upgrade names to Title Case"
            >
              Aa Fix All Title Case
            </GameUiButton>
            <GameUiButton
              size="sm"
              variant="warning"
              onClick={onAutoMatchImages}
              title="Automatically pair vehicle photos with titles based on keywords (Minibus, Cheetah, Decker, Panther, Team Spec)"
            >
              ✨ Auto-Match Photos to Titles
            </GameUiButton>
          </div>
        </div>

        <p className="text-[11px] text-slate-400">
          Assign the right image to each vehicle title in <strong>{labeledDepot.name}</strong>. Use the dropdown or click{' '}
          <strong>Pick Visually</strong> on any row to see all vehicle photos side-by-side.
        </p>

        {namesError ? (
          <div className="rounded-lg border border-rose-400/50 bg-rose-500/15 px-3 py-2 text-xs text-rose-200">
            {namesError}
          </div>
        ) : null}

        <div className="space-y-2.5">
          {labeledDepot.businesses.map((biz, idx) => {
            const currentArtVal = getBusinessArtValue(biz);
            const titleCased = formatCoachCapTitleCase(biz.name);
            const needsTitleCaseFix = biz.name !== titleCased;
            const isPicking = pickerSlot === biz.id;
            const currentCatalogueItem = COACH_CAP_ART_CATALOGUE.find((c) => c.value === currentArtVal);

            return (
              <div
                key={biz.id}
                className="rounded-xl border-2 border-slate-700 bg-slate-900/80 p-2.5 space-y-2"
              >
                <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                  {/* Live image preview */}
                  <button
                    type="button"
                    onClick={() => onTogglePickerSlot(biz.id)}
                    className="w-20 h-16 shrink-0 rounded-lg overflow-hidden border-2 border-amber-400/50 bg-slate-100 flex items-center justify-center relative group"
                    title="Click to pick image visually"
                  >
                    {biz.iconType ? (
                      <DepotBusinessArt biz={biz} className="w-full h-full" />
                    ) : biz.art ? (
                      <img
                        src={biz.art}
                        alt={biz.name}
                        className="w-full h-full object-contain"
                        draggable={false}
                      />
                    ) : (
                      <BusIcon colour={biz.colour || '#38bdf8'} className="w-12 h-12" />
                    )}
                    <span className="absolute inset-x-0 bottom-0 bg-slate-950/80 text-[9px] text-amber-200 text-center py-0.5 opacity-90 group-hover:bg-amber-500 group-hover:text-slate-950 font-semibold">
                      #{idx + 1} Change
                    </span>
                  </button>

                  {/* Title input + Image dropdown */}
                  <div className="flex-1 min-w-0 grid sm:grid-cols-2 gap-2">
                    <div>
                      <label className="block text-[10px] uppercase tracking-wider text-slate-400 mb-0.5">
                        Slot #{idx + 1} Title ({biz.id})
                      </label>
                      <div className="flex items-center gap-1">
                        <input
                          type="text"
                          value={biz.name}
                          maxLength={80}
                          onChange={(e) => onRenameBusiness(biz.id, e.target.value, depotId)}
                          className="w-full rounded-md border border-slate-600 bg-slate-950 px-2.5 py-1.5 text-xs text-white focus:border-amber-400 focus:outline-none"
                        />
                        {needsTitleCaseFix ? (
                          <button
                            type="button"
                            onClick={() => onRenameBusiness(biz.id, titleCased, depotId)}
                            className="shrink-0 rounded-md border border-amber-400/50 bg-amber-500/20 hover:bg-amber-500/35 px-2 py-1.5 text-[11px] font-bold text-amber-200"
                            title={`Fix case to "${titleCased}"`}
                          >
                            Aa
                          </button>
                        ) : null}
                      </div>
                    </div>

                    <div>
                      <label className="block text-[10px] uppercase tracking-wider text-slate-400 mb-0.5">
                        Assigned Image
                      </label>
                      <div className="flex items-center gap-1.5">
                        <select
                          value={currentArtVal}
                          onChange={(e) => onSetBusinessArt(biz.id, e.target.value, depotId)}
                          className="w-full rounded-md border border-slate-600 bg-slate-950 px-2 py-1.5 text-xs text-white focus:border-amber-400 focus:outline-none"
                        >
                          <optgroup label="Vehicle Photos (Local Depot)">
                            {photoOptions.map((opt) => (
                              <option key={opt.id} value={opt.value}>
                                {opt.label}
                              </option>
                            ))}
                          </optgroup>
                          <optgroup label="Vector Graphics (Regional & National)">
                            {svgOptions.map((opt) => (
                              <option key={opt.id} value={opt.value}>
                                {opt.label}
                              </option>
                            ))}
                          </optgroup>
                        </select>
                        <button
                          type="button"
                          onClick={() => onTogglePickerSlot(biz.id)}
                          className={`shrink-0 rounded-md border px-2.5 py-1.5 text-[11px] font-semibold transition ${
                            isPicking
                              ? 'border-amber-300 bg-amber-400 text-slate-950'
                              : 'border-slate-600 bg-slate-800 text-slate-200 hover:border-amber-400/60'
                          }`}
                        >
                          {isPicking ? 'Hide Grid' : 'Pick Visually'}
                        </button>
                      </div>
                      {currentCatalogueItem ? (
                        <p className="text-[10px] text-slate-400 mt-0.5 truncate">
                          {currentCatalogueItem.hint} · <code className="text-slate-500">{currentCatalogueItem.value}</code>
                        </p>
                      ) : null}
                    </div>
                  </div>
                </div>

                {/* Visual thumbnail gallery when expanded */}
                {isPicking ? (
                  <div className="rounded-lg border border-amber-400/40 bg-slate-950/90 p-2.5 space-y-2">
                    <p className="text-[11px] font-semibold text-amber-200">
                      Click an image below to assign it to &ldquo;{biz.name}&rdquo;:
                    </p>
                    <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                      {photoOptions.map((opt) => {
                        const selected = currentArtVal === opt.value;
                        return (
                          <button
                            key={opt.id}
                            type="button"
                            onClick={() => {
                              onSetBusinessArt(biz.id, opt.value, depotId);
                              onTogglePickerSlot(null);
                            }}
                            className={`rounded-lg border-2 p-1.5 text-left transition flex flex-col items-center gap-1 ${
                              selected
                                ? 'border-emerald-400 bg-emerald-500/20'
                                : 'border-slate-700 bg-slate-900 hover:border-amber-400/60'
                            }`}
                          >
                            <div className="w-full h-14 rounded bg-slate-100 overflow-hidden flex items-center justify-center">
                              <img
                                src={opt.value}
                                alt={opt.label}
                                className="w-full h-full object-contain"
                                draggable={false}
                              />
                            </div>
                            <span className="text-[10px] font-semibold text-white text-center leading-tight line-clamp-2">
                              {opt.label}
                            </span>
                            <span className="text-[9px] text-slate-400 text-center leading-tight">
                              {opt.hint}
                            </span>
                          </button>
                        );
                      })}
                    </div>

                    <details className="pt-1">
                      <summary className="cursor-pointer text-[11px] text-sky-300 hover:text-sky-200">
                        Show Regional &amp; National Vector Graphics ({svgOptions.length})
                      </summary>
                      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 mt-2">
                        {svgOptions.map((opt) => {
                          const selected = currentArtVal === opt.value;
                          const iconType = opt.value.slice(4);
                          return (
                            <button
                              key={opt.id}
                              type="button"
                              onClick={() => {
                                onSetBusinessArt(biz.id, opt.value, depotId);
                                onTogglePickerSlot(null);
                              }}
                              className={`rounded-lg border-2 p-1.5 text-left transition flex flex-col items-center gap-1 ${
                                selected
                                  ? 'border-emerald-400 bg-emerald-500/20'
                                  : 'border-slate-700 bg-slate-900 hover:border-amber-400/60'
                              }`}
                            >
                              <div className="w-full h-14 rounded overflow-hidden flex items-center justify-center">
                                <DepotBusinessArt biz={{ iconType }} className="w-full h-full" />
                              </div>
                              <span className="text-[10px] font-semibold text-white text-center leading-tight line-clamp-2">
                                {opt.label}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    </details>
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      </div>
    </GameUiModal>
  );
}

function SeasonWrapupBody({ wrapup }) {
  if (!wrapup) return null;
  const label = wrapup.previousSeasonLabel || 'Season 2';
  const champ = wrapup.champion;
  const unclaimed = wrapup.mostUnclaimedBackers;
  const claimed = wrapup.mostClaimedBackers;
  const cash = wrapup.richestCash;
  const furthest = wrapup.furthestDepot;
  const top = Array.isArray(wrapup.topEarners) ? wrapup.topEarners : [];

  const goldPlayer = top[0] || champ;
  const silverPlayer = top[1] || null;
  const bronzePlayer = top[2] || null;

  return (
    <div className="space-y-3.5 text-sm text-slate-200">
      <div className="rounded-xl border border-amber-400/40 bg-gradient-to-r from-amber-500/15 via-slate-900 to-amber-500/10 p-3 text-center space-y-1">
        <p className="gui-font text-base text-amber-300">🏆 {label} Hall of Fame Podium</p>
        <p className="text-xs text-slate-300">
          Congratulations to our Gold, Silver, and Bronze fleet champions! Everyone starts fresh for <strong>Season 3</strong>.
        </p>
      </div>

      {/* Gold, Silver, Bronze Podium Cards */}
      <div className="grid grid-cols-3 gap-2">
        {/* 1st Place - Gold */}
        <div className="rounded-xl border-2 border-amber-400 bg-gradient-to-b from-amber-500/25 to-slate-900/90 p-2.5 text-center flex flex-col justify-between shadow-lg relative">
          <div className="text-xl">🥇</div>
          <div className="my-1">
            <span className="rounded bg-amber-400 text-slate-950 font-black px-1.5 py-0.5 text-[9px] uppercase tracking-wider">
              GOLD
            </span>
            <p className="gui-font text-xs sm:text-sm text-amber-200 font-bold truncate mt-1">
              {goldPlayer?.fullName || '—'}
            </p>
          </div>
          <p className="text-[10px] text-amber-100 font-mono truncate">
            {goldPlayer ? formatMoney(goldPlayer.lifetimeEarnings) : '£0'}
          </p>
        </div>

        {/* 2nd Place - Silver */}
        <div className="rounded-xl border-2 border-slate-300 bg-gradient-to-b from-slate-400/20 to-slate-900/90 p-2.5 text-center flex flex-col justify-between shadow relative">
          <div className="text-xl">🥈</div>
          <div className="my-1">
            <span className="rounded bg-slate-300 text-slate-950 font-black px-1.5 py-0.5 text-[9px] uppercase tracking-wider">
              SILVER
            </span>
            <p className="gui-font text-xs sm:text-sm text-slate-200 font-bold truncate mt-1">
              {silverPlayer?.fullName || '—'}
            </p>
          </div>
          <p className="text-[10px] text-slate-300 font-mono truncate">
            {silverPlayer ? formatMoney(silverPlayer.lifetimeEarnings) : '£0'}
          </p>
        </div>

        {/* 3rd Place - Bronze */}
        <div className="rounded-xl border-2 border-amber-700/80 bg-gradient-to-b from-amber-900/30 to-slate-900/90 p-2.5 text-center flex flex-col justify-between shadow relative">
          <div className="text-xl">🥉</div>
          <div className="my-1">
            <span className="rounded bg-amber-700 text-amber-100 font-black px-1.5 py-0.5 text-[9px] uppercase tracking-wider">
              BRONZE
            </span>
            <p className="gui-font text-xs sm:text-sm text-amber-300 font-bold truncate mt-1">
              {bronzePlayer?.fullName || '—'}
            </p>
          </div>
          <p className="text-[10px] text-amber-400/90 font-mono truncate">
            {bronzePlayer ? formatMoney(bronzePlayer.lifetimeEarnings) : '£0'}
          </p>
        </div>
      </div>

      {top.length > 3 ? (
        <div className="rounded-lg border border-slate-700 bg-slate-950/60 p-2.5 space-y-1">
          <p className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold">Honourable Mentions (Top 5)</p>
          <ol className="space-y-1">
            {top.slice(3, 5).map((row) => (
              <li key={row.uid || row.rank} className="flex justify-between gap-3 text-xs">
                <span className="truncate text-slate-300">
                  #{row.rank}. {row.fullName}
                </span>
                <span className="tabular-nums text-amber-300 shrink-0">
                  {formatMoney(row.lifetimeEarnings)}
                </span>
              </li>
            ))}
          </ol>
        </div>
      ) : null}

      <div className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 p-2.5 text-xs text-emerald-100 space-y-1">
        <p className="font-bold text-emerald-300 flex items-center gap-1.5">
          <span>🤝 New in Season 3: Depot Contracts &amp; Syndicate Bidding!</span>
        </p>
        <p className="text-[11px] text-emerald-100/90">
          Work together with all Country Lion operators to fund massive corporate contracts (Glastonbury express, Rail Replacements, and Grand Prix shuttles). Hit the collective goal to unlock huge Syndicate Dividends for all players!
        </p>
        <p className="text-[10px] text-emerald-200/70 border-t border-emerald-500/20 pt-1">
          🔧 National Hub economics have been thoroughly rebalanced so competition remains tight and fun.
        </p>
      </div>
    </div>
  );
}

function CoachCapitalistSeasonAdmin() {
  const [seasonId, setSeasonId] = useState('2026-S3');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');

  const startSeason = async () => {
    const id = String(seasonId || '').trim();
    if (!id) {
      setError('seasonId is required.');
      return;
    }
    if (!window.confirm(
      `Start Coach Capitalist season "${id}"?\n\nThis archives Season 2 scores with Gold/Silver/Bronze winners, clears the leaderboard, resets all saves to zero, and resets everyone's daily playtime today.`,
    )) {
      return;
    }
    setBusy(true);
    setError('');
    setResult(null);
    try {
      const response = await fetch('/api/adminStartCoachCapitalistSeason', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          seasonId: id,
          dailyPlayCapMs: 60 * 60 * 1000,
          awayEarningsEnabled: true,
          archiveScores: true,
          previousSeasonLabel: 'Season 2',
        }),
      });
      const payload = (await readJsonResponse(response)) || {};
      if (!response.ok) throw new Error(payload.error || 'Failed to start season.');
      setResult(payload);
    } catch (err) {
      setError(err.message || 'Failed to start season.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 space-y-2">
      <p className="text-sm font-medium text-amber-100">Start new season</p>
      <p className="text-xs text-amber-100/80">
        Wipes leaderboard + all cloud saves, sets daily 60-minute play cap, keeps ~10% away earnings.
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="text"
          value={seasonId}
          maxLength={40}
          onChange={(e) => setSeasonId(e.target.value)}
          className="rounded-md border border-amber-400/40 bg-slate-950/70 px-2 py-1.5 text-sm text-white min-w-[10rem]"
          placeholder="2026-S2"
        />
        <GameUiButton size="sm" variant="warning" disabled={busy} onClick={startSeason}>
          {busy ? 'Starting…' : 'Start season'}
        </GameUiButton>
      </div>
      {error ? <p className="text-xs text-rose-300">{error}</p> : null}
      {result ? (
        <p className="text-xs text-emerald-200">
          Season {result.seasonId} live · saves reset {result.savesReset} · scores cleared {result.scoresCleared}
          {result.archived != null ? ` · archived ${result.archived}` : ''}
          {' · '}
          token {result.forceResetToken}
        </p>
      ) : null}
    </div>
  );
}

function MilestonesRoadmapModal({ open, onClose, depot, roadmap }) {
  if (!open || !depot || !roadmap) return null;
  const upcomingSynergies = (roadmap.newspaperSynergies || []).filter((s) => !s.unlocked).slice(0, 8);
  const unlockedSynergies = (roadmap.newspaperSynergies || []).filter((s) => s.unlocked);

  return (
    <GameUiModal
      open={open}
      onClose={onClose}
      title={`🏆 Milestone & Synergy Roadmap — ${depot.name}`}
      header="yellow"
      dark
      confirmLabel="Done"
      confirmVariant="accent"
      className="!w-[min(46rem,calc(100%-1rem))]"
      onConfirm={onClose}
    >
      <div className="space-y-4 text-xs text-slate-200 max-h-[70vh] overflow-y-auto pr-1">
        {/* Section 1: All-Fleet Global Milestones */}
        <div className="rounded-xl border-2 border-amber-400/40 bg-amber-500/10 p-3 space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="gui-font text-sm text-amber-200">All-Fleet Global Milestones</p>
              <p className="text-[11px] text-amber-100/80">
                Triggered when <strong>every vehicle</strong> in {depot.name} reaches the same level.
              </p>
            </div>
            <span className="rounded-md bg-slate-950/70 border border-amber-400/40 px-2 py-1 text-xs font-bold text-amber-300 tabular-nums">
              Current Min: {roadmap.currentMin} ({roadmap.globalUnlockedCount} unlocked)
            </span>
          </div>
          {roadmap.bottleneckBiz?.length ? (
            <p className="text-[11px] text-slate-300">
              Slowest vehicle{roadmap.bottleneckBiz.length > 1 ? 's' : ''} holding back next All-Fleet bonus:{' '}
              <strong className="text-sky-300">
                {roadmap.bottleneckBiz.map((b) => `${b.name} (${b.owned})`).join(', ')}
              </strong>
            </p>
          ) : null}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5 pt-1">
            {roadmap.globalUpcoming.map((gu) => (
              <div
                key={`gu-${gu.at}`}
                className="rounded-lg border border-slate-700 bg-slate-950/70 px-2.5 py-1.5 flex items-center justify-between gap-2"
              >
                <span className="gui-font text-xs text-amber-300">@{gu.at}</span>
                <span className="text-[11px] text-emerald-300 font-semibold truncate">{gu.effectLabel}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Section 2: Newspaper / Synergy Cross-Buffs */}
        {roadmap.newsBiz ? (
          <div className="rounded-xl border-2 border-sky-400/40 bg-sky-500/10 p-3 space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="gui-font text-sm text-sky-200">
                  ⚡ Fleet Synergy Hub: {roadmap.newsBiz.name}
                </p>
                <p className="text-[11px] text-sky-100/80">
                  Levelling <strong>{roadmap.newsBiz.name}</strong> from 100+ unlocks massive profit multipliers for your other vehicles!
                </p>
              </div>
              <span className="rounded-md bg-slate-950/70 border border-sky-400/40 px-2 py-1 text-xs font-bold text-sky-300 tabular-nums">
                Owned: {roadmap.newsOwned} ({unlockedSynergies.length} active)
              </span>
            </div>
            {upcomingSynergies.length > 0 ? (
              <div className="grid sm:grid-cols-2 gap-1.5 pt-1">
                {upcomingSynergies.map((syn) => (
                  <div
                    key={`syn-${syn.at}`}
                    className="rounded-lg border border-slate-700 bg-slate-950/70 px-2.5 py-1.5 flex items-center justify-between gap-2"
                  >
                    <span className="gui-font text-xs text-sky-300">
                      @{syn.at}{' '}
                      <span className="text-[10px] font-normal text-slate-400">
                        (+{syn.remaining})
                      </span>
                    </span>
                    <span className="text-[11px] text-emerald-300 font-semibold truncate">
                      {syn.effectLabel}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-emerald-300">All cross-fleet synergy buffs unlocked!</p>
            )}
          </div>
        ) : null}

        {/* Section 3: Per-Vehicle Upcoming Unlocks */}
        <div className="space-y-2">
          <p className="gui-font text-sm text-white">Upcoming Per-Vehicle Milestones</p>
          <div className="grid sm:grid-cols-2 gap-2">
            {roadmap.perBusiness.map((row) => (
              <div
                key={row.biz.id}
                className="rounded-xl border border-slate-700 bg-slate-900/70 p-2.5 space-y-1.5"
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="gui-font text-xs text-white truncate">{row.biz.name}</p>
                  <span className="rounded bg-slate-800 px-1.5 py-0.5 text-[10px] text-amber-300 font-bold tabular-nums">
                    Owned: {row.owned}
                  </span>
                </div>
                {row.upcoming.length > 0 ? (
                  <div className="flex flex-wrap gap-1">
                    {row.upcoming.map((u) => (
                      <span
                        key={`${row.biz.id}-${u.at}`}
                        className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${
                          u.isSpeed
                            ? 'bg-sky-500/20 border border-sky-400/40 text-sky-200'
                            : 'bg-emerald-500/20 border border-emerald-400/40 text-emerald-200'
                        }`}
                      >
                        @{u.at}: {u.effectLabel}
                      </span>
                    ))}
                  </div>
                ) : (
                  <p className="text-[10px] text-emerald-300">All milestones reached!</p>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </GameUiModal>
  );
}

export function CoachCapitalistSandbox() {
  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-400">
        Dev sandbox — browser-only (no cloud save). Live game syncs to each staff account across devices.
      </p>
      <CoachCapitalistPlayTimeAdmin />
      <CoachCapitalistSeasonAdmin />
      <CoachCapitalistPanel sandbox isAdmin />
    </div>
  );
}
