import { useEffect, useMemo, useRef, useState } from 'react';
import { notifyCoinAwards } from '../utils/coinAwards';
import {
  buildingSprite,
  DECOR_FACING_LABELS,
  DECOR_FACINGS,
  decorationSprite,
  GROUND,
  normalizeSpriteAnchor,
  normalizeSpriteAnchors,
  officeSprite,
  spriteAnchorKey,
  vehicleFilterStyle,
  vehicleSprite,
} from '../lib/coachDepotAssets';
import CoachDepotScene from './CoachDepotScene';
import { GameUiBadge, GameUiButton, GameUiPanel } from './gameUi';

const GROUND_CONCRETE_FILE = String(GROUND.concrete || '').split('/').pop();

async function readJsonResponse(res) {
  const contentType = res.headers.get('content-type') || '';
  if (!contentType.includes('application/json')) return null;
  try {
    return await res.json();
  } catch {
    return null;
  }
}

function formatDuration(ms) {
  const n = Math.max(0, Math.floor(Number(ms) || 0));
  const totalSec = Math.floor(n / 1000);
  const days = Math.floor(totalSec / 86400);
  const hours = Math.floor((totalSec % 86400) / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (days > 0) return hours > 0 ? `${days}d ${hours}h` : `${days}d`;
  if (hours > 0) return m > 0 ? `${hours}h ${m}m` : `${hours}h`;
  if (m <= 0) return `${s}s`;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function remainingMs(readyAt) {
  const t = Date.parse(readyAt || '');
  if (!Number.isFinite(t)) return 0;
  return Math.max(0, t - Date.now());
}

function formatRequired(text) {
  const t = String(text || '').trim();
  if (!t) return null;
  return /^required\s*:/i.test(t) ? t.replace(/^required\s*:/i, 'Required:') : `Required: ${t}`;
}

/** Cities Skylines / Planet Coaster style toolbar icons (inline SVG). */
function IconBuild({ className = 'w-7 h-7' }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M4 20V10l8-5 8 5v10" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
      <path d="M9 20v-6h6v6" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
      <path d="M4 10h16" stroke="currentColor" strokeWidth="1.7" />
    </svg>
  );
}
function IconMoney({ className = 'w-7 h-7' }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="8.25" stroke="currentColor" strokeWidth="1.7" />
      <path d="M12 7.5v9M14.5 9.2c-.7-.8-1.5-1.1-2.5-1.1-1.6 0-2.7.9-2.7 2.1 0 2.8 5.4 1.4 5.4 4.1 0 1.3-1.2 2.2-3 2.2-1.1 0-2-.3-2.7-1" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
}
function IconJobs({ className = 'w-7 h-7' }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M4 15.5c1.2-2.2 3.4-3.5 8-3.5s6.8 1.3 8 3.5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
      <rect x="5.5" y="8" width="13" height="6.5" rx="1.5" stroke="currentColor" strokeWidth="1.7" />
      <path d="M8 8V6.8A1.8 1.8 0 0 1 9.8 5h4.4A1.8 1.8 0 0 1 16 6.8V8" stroke="currentColor" strokeWidth="1.7" />
      <circle cx="8.5" cy="16.5" r="1.4" fill="currentColor" />
      <circle cx="15.5" cy="16.5" r="1.4" fill="currentColor" />
    </svg>
  );
}
function IconStaff({ className = 'w-7 h-7' }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="9" cy="8" r="2.4" stroke="currentColor" strokeWidth="1.7" />
      <circle cx="16" cy="9" r="2" stroke="currentColor" strokeWidth="1.7" />
      <path d="M3.8 18.5c.6-2.8 2.7-4.3 5.2-4.3s4.6 1.5 5.2 4.3" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
      <path d="M13.2 14.8c.7-.5 1.6-.8 2.8-.8 2.2 0 3.8 1.2 4.4 3.4" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
}
function IconVehicles({ className = 'w-7 h-7' }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M4 15.5V10l2.2-4.2A2 2 0 0 1 8 5h8a2 2 0 0 1 1.8.8L20 10v5.5" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
      <path d="M4 10h16" stroke="currentColor" strokeWidth="1.7" />
      <circle cx="7.5" cy="16.5" r="1.6" stroke="currentColor" strokeWidth="1.7" />
      <circle cx="16.5" cy="16.5" r="1.6" stroke="currentColor" strokeWidth="1.7" />
      <path d="M9.2 16.5h5.6" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
}
function IconMap({ className = 'w-7 h-7' }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M4 6.5 9.5 4l5 2.5L20 4v13.5L14.5 20l-5-2.5L4 20V6.5Z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
      <path d="M9.5 4v13.5M14.5 6.5V20" stroke="currentColor" strokeWidth="1.7" />
    </svg>
  );
}
function IconReset({ className = 'w-7 h-7' }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M4.5 12a7.5 7.5 0 1 0 2.2-5.3" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
      <path d="M4 5.5V10h4.5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function IconCalibrate({ className = 'w-7 h-7' }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M12 3v18M3 12h18" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M7 7l10 10M17 7 7 17" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" opacity="0.55" />
      <circle cx="12" cy="12" r="3.2" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  );
}
function IconLevels({ className = 'w-7 h-7' }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M4 18h16M6 14h12M8 10h8M10 6h4" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
      <path d="M12 18V4" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" opacity="0.45" />
    </svg>
  );
}

const TOOLBAR = [
  { id: 'build', label: 'Build', Icon: IconBuild, color: 'text-sky-300', active: 'bg-sky-500 text-white border-sky-300/50' },
  { id: 'levels', label: 'Levels', Icon: IconLevels, color: 'text-teal-300', active: 'bg-teal-500 text-white border-teal-200/50' },
  { id: 'money', label: 'Money', Icon: IconMoney, color: 'text-amber-300', active: 'bg-amber-500 text-[#1c1917] border-amber-200/50' },
  { id: 'jobs', label: 'Jobs', Icon: IconJobs, color: 'text-emerald-300', active: 'bg-emerald-500 text-white border-emerald-200/50' },
  { id: 'staff', label: 'Staff', Icon: IconStaff, color: 'text-violet-300', active: 'bg-violet-500 text-white border-violet-200/50' },
  { id: 'vehicles', label: 'Vehicles', Icon: IconVehicles, color: 'text-indigo-300', active: 'bg-indigo-500 text-white border-indigo-200/50' },
];

const MAP_TOOLS = [
  { id: 'owned', label: 'Starter', hint: 'Players start owning these tiles' },
  { id: 'buildable', label: 'Buildable', hint: 'Can be claimed / built on later' },
  { id: 'blocked', label: 'Blocked', hint: 'Never buildable' },
  { id: 'road', label: 'Road', hint: 'Entrance / roads' },
  { id: 'hq', label: 'HQ', hint: 'Place starter HQ (one)' },
  { id: 'bay', label: 'Bay', hint: 'Place starter parking bay' },
  { id: 'clear', label: 'Clear', hint: 'Wipe tile back to empty dirt' },
];

function tileKey(x, y) {
  return `${x},${y}`;
}

function tileTouchesRoad(x, y, roadTiles = []) {
  const roads = new Set(
    (roadTiles || []).map((t) => (typeof t === 'string' ? t : tileKey(t.x, t.y))),
  );
  return [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => roads.has(tileKey(x + dx, y + dy)));
}

function toTileList(list) {
  return (list || []).map((t) => (typeof t === 'string' ? t : tileKey(t.x, t.y)));
}

function keysToCoords(keys) {
  return keys.map((k) => {
    const [xs, ys] = String(k).split(',');
    return { x: Number(xs), y: Number(ys) };
  }).filter((t) => Number.isFinite(t.x) && Number.isFinite(t.y));
}

const VIEW_HEIGHTS = {
  comfortable: 560,
  tall: 720,
  cinema: 860,
};

export default function CoachDepotPanel({
  sandbox = false,
}) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');
  const [depot, setDepot] = useState(null);
  const [busy, setBusy] = useState(false);
  const [selectedVehicleId, setSelectedVehicleId] = useState(null);
  const [selectedBuildingKey, setSelectedBuildingKey] = useState(null);
  const [selectedBayId, setSelectedBayId] = useState(null);
  const [placeBuildingKey, setPlaceBuildingKey] = useState(null);
  const [placeBay, setPlaceBay] = useState(false);
  /** When set, click a free pad to relocate that building (25 coins). */
  const [moveBuildingKey, setMoveBuildingKey] = useState(null);
  const [dock, setDock] = useState(null);
  /** Sub-view for staff/vehicles: menu | list | hire | buy */
  const [dockPane, setDockPane] = useState(null);
  const [fx, setFx] = useState(null);
  const [viewSize, setViewSize] = useState('tall');
  const [mapDraft, setMapDraft] = useState(null);
  const [mapTool, setMapTool] = useState('buildable');
  const [mapDirty, setMapDirty] = useState(false);
  const [pendingLand, setPendingLand] = useState(null);
  /** Owned tile → build menu popup */
  const [pendingBuild, setPendingBuild] = useState(null);
  /** Decoration: choose facing/edge before placing */
  const [decorDraft, setDecorDraft] = useState(null);
  /** Clicked decoration / road → edit (rotate / sell) */
  const [pendingEdit, setPendingEdit] = useState(null);
  const [spriteAnchors, setSpriteAnchors] = useState({});
  const [anchorsDirty, setAnchorsDirty] = useState(false);
  const [calibrateMode, setCalibrateMode] = useState(false);
  const [calibrateTarget, setCalibrateTarget] = useState(null);
  const depotRootRef = useRef(null);
  const settlingRef = useRef(false);
  const [, setTick] = useState(0);

  const sceneHeight = VIEW_HEIGHTS[viewSize] || VIEW_HEIGHTS.tall;
  const buildMode = dock === 'build';
  const claimLandMode = dock === 'money';
  const editorMode = dock === 'map' && Boolean(mapDraft);

  const applySettlePayload = (payload) => {
    const departed = (payload?.settledJobs || [])
      .map((j) => j.staffDeparted?.name)
      .filter(Boolean);
    if (payload?.coinsAwarded?.length) {
      notifyCoinAwards(payload.coinsAwarded);
      const total = payload.coinsAwarded.reduce((sum, row) => sum + (Number(row.amount) || 0), 0);
      if (total > 0) {
        setToast(
          departed.length
            ? `+${total} coins · ${departed[0]} left after their job`
            : `+${total} coins · job complete`,
        );
      }
    } else if (departed.length) {
      setToast(`${departed[0]} left after their job`);
    }
  };

  const refresh = useMemo(() => async () => {
    const params = new URLSearchParams();
    if (sandbox) params.set('sandbox', '1');
    const query = params.toString() ? `?${params}` : '';
    const response = await fetch(`/api/getCoachDepot${query}`, { credentials: 'include' });
    const payload = (await readJsonResponse(response)) || {};
    if (!response.ok) throw new Error(payload.error || 'Failed to load Coach Depot.');
    setDepot(payload.depot || null);
    setSpriteAnchors(normalizeSpriteAnchors(payload.spriteAnchors || {}));
    setAnchorsDirty(false);
    applySettlePayload(payload);
    return payload;
  }, [sandbox]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        setError('');
        await refresh();
      } catch (err) {
        if (!cancelled) setError(err.message || 'Failed to load.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [refresh]);

  useEffect(() => {
    const id = window.setInterval(() => setTick((n) => n + 1), 500);
    return () => window.clearInterval(id);
  }, []);

  // Auto-return: when a job's wall-clock readyAt passes, settle on the server (cash + free bay).
  // Also refresh when workshop inspections finish so fleet status clears.
  const activeJobKey = (depot?.activeJobs || []).map((j) => `${j.id}:${j.readyAt}`).join('|');
  const inspectKey = (depot?.fleet || [])
    .filter((v) => v.inspecting && v.inspectUntil)
    .map((v) => `${v.id}:${v.inspectUntil}`)
    .join('|');
  useEffect(() => {
    if (!depot || editorMode) return undefined;
    const id = window.setInterval(() => {
      if (busy || settlingRef.current) return;
      const readyJobs = (depot.activeJobs || []).filter((j) => remainingMs(j.readyAt) <= 0);
      const doneInspect = (depot.fleet || []).filter(
        (v) => v.inspecting && remainingMs(v.inspectUntil) <= 0,
      );
      if (!readyJobs.length && !doneInspect.length) return;
      settlingRef.current = true;
      if (readyJobs.length) playFx('return', readyJobs[0]?.driverSlot ?? 0);
      window.setTimeout(async () => {
        try {
          await refresh();
        } catch (err) {
          setError(err.message || 'Failed to settle jobs.');
        } finally {
          settlingRef.current = false;
        }
      }, readyJobs.length ? 900 : 200);
    }, 1000);
    return () => window.clearInterval(id);
    // playFx is stable enough per render; refresh/busy/editorMode gate the settle.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeJobKey, inspectKey, busy, editorMode, refresh]);

  useEffect(() => {
    if (!toast) return undefined;
    const id = window.setTimeout(() => setToast(''), 2800);
    return () => window.clearTimeout(id);
  }, [toast]);

  useEffect(() => {
    // In-game action errors (e.g. Need X coins). Depend only on `error` so depot
    // refreshes don't keep resetting the dismiss timer.
    if (!error || !depot) return undefined;
    const id = window.setTimeout(() => setError(''), 3200);
    return () => window.clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- depot presence gate only
  }, [error]);

  useEffect(() => {
    if (!fx) return undefined;
    const id = window.setTimeout(() => setFx(null), 1500);
    return () => window.clearTimeout(id);
  }, [fx]);

  const playFx = (type, slot) => {
    setFx({ type, slot, startedAt: Date.now() });
  };

  const buy = async (body, { confirmLabel } = {}) => {
    if (busy) return;
    if (confirmLabel && !window.confirm(confirmLabel)) return;
    setBusy(true);
    setError('');
    try {
      const response = await fetch('/api/buyCoachDepotUpgrade', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...body, sandbox: sandbox || undefined }),
      });
      const payload = (await readJsonResponse(response)) || {};
      if (!response.ok) throw new Error(payload.error || 'Purchase failed.');
      setDepot(payload.depot || null);
      setToast(payload.spent
        ? `${payload.label || 'Bought'} · −${payload.spent} coins`
        : payload.refunded
          ? `${payload.label || 'Sold'} · +${payload.refunded} coins`
          : sandbox
            ? `${payload.label || 'Bought'} · free (sandbox)`
            : (payload.label || 'Done'));
      if (body.kind === 'building' || body.kind === 'bay' || body.kind === 'plot' || body.kind === 'charger'
        || body.kind === 'road' || body.kind === 'decoration') {
        setPlaceBuildingKey(null);
        setPlaceBay(false);
        setPendingBuild(null);
        setDecorDraft(null);
        if (body.kind === 'sellPlacement' || body.kind === 'sellDecoration' || body.kind === 'sellRoad') {
          setPendingEdit(null);
        }
        if ((body.kind === 'rotateDecoration' || body.kind === 'setDecorationFacing') && body.placementId) {
          const updated = (payload.depot?.grid?.placements || []).find((p) => p.id === body.placementId);
          if (updated) {
            setPendingEdit((cur) => (cur && cur.id === body.placementId
              ? { ...cur, facing: updated.facing || cur.facing }
              : cur));
          }
        }
      }
      if (body.kind === 'moveBuilding' || body.kind === 'move') {
        setMoveBuildingKey(null);
        setSelectedBuildingKey(null);
        setDock(null);
      }
      if (body.kind === 'charger') {
        setSelectedBayId(null);
        setDock(null);
      }
      if (body.kind === 'plot') {
        setPendingLand(null);
        setDock(null);
      }
    } catch (err) {
      setError(err.message || 'Purchase failed.');
    } finally {
      setBusy(false);
    }
  };

  const dispatch = async (jobType) => {
    if (busy) return;
    setBusy(true);
    setError('');
    const fleet = depot?.fleet || [];
    const vehicle = fleet.find((v) => v.id === selectedVehicleId) || fleet.find((v) => !v.busy);
    const slot = Math.max(0, fleet.findIndex((v) => v.id === vehicle?.id));
    playFx('depart', slot);
    setSelectedVehicleId(null);
    try {
      const response = await fetch('/api/dispatchCoachDepotJob', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jobType,
          vehicleId: vehicle?.id,
          sandbox: sandbox || undefined,
        }),
      });
      const payload = (await readJsonResponse(response)) || {};
      if (!response.ok) throw new Error(payload.error || 'Dispatch failed.');
      window.setTimeout(() => setDepot(payload.depot || null), 1200);
      setToast('Coach away');
    } catch (err) {
      setFx(null);
      setError(err.message || 'Dispatch failed.');
    } finally {
      setBusy(false);
    }
  };

  const claim = async (jobId, slot = 0) => {
    if (busy || settlingRef.current) return;
    settlingRef.current = true;
    setBusy(true);
    setError('');
    playFx('return', slot);
    try {
      const response = await fetch('/api/claimCoachDepotJob', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jobId, sandbox: sandbox || undefined }),
      });
      const payload = (await readJsonResponse(response)) || {};
      if (!response.ok) throw new Error(payload.error || 'Claim failed.');
      applySettlePayload(payload);
      window.setTimeout(() => setDepot(payload.depot || null), 900);
    } catch (err) {
      setFx(null);
      setError(err.message || 'Claim failed.');
    } finally {
      settlingRef.current = false;
      setBusy(false);
    }
  };

  const forceComplete = async (jobId) => {
    if (!sandbox || busy) return;
    setBusy(true);
    try {
      const response = await fetch('/api/adminForceCoachDepotJob', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jobId }),
      });
      const payload = (await readJsonResponse(response)) || {};
      if (!response.ok) throw new Error(payload.error || 'Force failed.');
      applySettlePayload(payload);
      setDepot(payload.depot || null);
      if (!payload.coinsAwarded?.length) setToast('Job returned');
    } catch (err) {
      setError(err.message || 'Force failed.');
    } finally {
      setBusy(false);
    }
  };

  const grantTestCoins = async (amount) => {
    if (!sandbox || busy) return;
    setBusy(true);
    try {
      const response = await fetch('/api/adminGrantCoachDepotCoins', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount }),
      });
      const payload = (await readJsonResponse(response)) || {};
      if (!response.ok) throw new Error(payload.error || 'Grant failed.');
      notifyCoinAwards(payload.coinsAwarded);
      setDepot(payload.depot || null);
      setToast(`+${amount} test coins`);
    } catch (err) {
      setError(err.message || 'Grant failed.');
    } finally {
      setBusy(false);
    }
  };

  const resetProgress = async ({ skipConfirm = false, all = false } = {}) => {
    if (!sandbox || busy) return;
    if (!skipConfirm) {
      const ok = all
        ? window.confirm('Reset Coach Depot for ALL players to the starter yard? This cannot be undone.')
        : window.confirm('Reset Coach Depot to starter yard? This clears buildings, fleet extras, and jobs.');
      if (!ok) return;
    }
    setBusy(true);
    setError('');
    try {
      const response = await fetch('/api/adminResetCoachDepot', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(all ? { all: true } : {}),
      });
      const payload = (await readJsonResponse(response)) || {};
      if (!response.ok) throw new Error(payload.error || 'Reset failed.');
      if (all) {
        setToast(`All depots reset · ${payload.resetDepots || 0} yards · ${payload.cancelledJobs || 0} jobs cancelled`);
        await refresh();
      } else {
        setDepot(payload.depot || null);
        setToast('Depot reset to starter yard');
      }
      setPlaceBuildingKey(null);
      setPlaceBay(false);
      setSelectedBuildingKey(null);
      setSelectedVehicleId(null);
      setDock(null);
    } catch (err) {
      setError(err.message || 'Reset failed.');
    } finally {
      setBusy(false);
    }
  };

  const loadMapEditor = async () => {
    if (!sandbox || busy) return;
    setBusy(true);
    setError('');
    try {
      const response = await fetch('/api/getCoachDepotMapConfig', { credentials: 'include' });
      const payload = (await readJsonResponse(response)) || {};
      if (!response.ok) throw new Error(payload.error || 'Failed to load map.');
      setMapDraft(payload.mapConfig);
      setMapDirty(false);
      setMapTool('buildable');
      setDock('map');
      setPlaceBuildingKey(null);
      setPlaceBay(false);
      setSelectedBuildingKey(null);
    } catch (err) {
      setError(err.message || 'Failed to load map.');
    } finally {
      setBusy(false);
    }
  };

  const saveMapEditor = async ({ resetAfter = false } = {}) => {
    if (!sandbox || busy || !mapDraft) return;
    setBusy(true);
    setError('');
    try {
      const response = await fetch('/api/saveCoachDepotMapConfig', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mapConfig: mapDraft }),
      });
      const payload = (await readJsonResponse(response)) || {};
      if (!response.ok) throw new Error(payload.error || 'Save failed.');
      setMapDraft(payload.mapConfig);
      setMapDirty(false);
      setToast(resetAfter ? 'Map saved — resetting depot…' : 'Starter map saved');
      if (resetAfter) {
        setBusy(false);
        await resetProgress({ skipConfirm: true });
        return;
      }
    } catch (err) {
      setError(err.message || 'Save failed.');
    } finally {
      setBusy(false);
    }
  };

  const saveSpriteAnchors = async () => {
    if (!sandbox || busy) return;
    setBusy(true);
    setError('');
    try {
      const response = await fetch('/api/saveCoachDepotSpriteAnchors', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ anchors: spriteAnchors }),
      });
      const payload = (await readJsonResponse(response)) || {};
      if (!response.ok) throw new Error(payload.error || 'Save anchors failed.');
      setSpriteAnchors(normalizeSpriteAnchors(payload.spriteAnchors || {}));
      setAnchorsDirty(false);
      setToast('Building anchors saved for everyone');
    } catch (err) {
      setError(err.message || 'Save anchors failed.');
    } finally {
      setBusy(false);
    }
  };

  const patchAnchor = (file, patch) => {
    if (!file) return;
    setSpriteAnchors((prev) => {
      const cur = normalizeSpriteAnchor(prev[file]);
      return {
        ...prev,
        [file]: normalizeSpriteAnchor({ ...cur, ...patch }),
      };
    });
    setAnchorsDirty(true);
  };

  const beginCalibrate = (pick) => {
    let file = pick.sprite;
    if (!file) {
      if (pick.type === 'office') {
        file = officeSprite(pick.level || depot?.officeLevel || 1).split('/').pop();
      } else if (pick.type === 'bay') {
        file = GROUND_CONCRETE_FILE;
      } else if (pick.type === 'decoration') {
        file = spriteAnchorKey(decorationSprite(pick.key, pick.facing || 'SE'), pick.facing || 'SE');
      } else if (pick.type === 'character') {
        file = `char_a_idle_${pick.facing || 'SE'}_f01.png`;
      } else {
        file = buildingSprite(pick.key, pick.level || 1).split('/').pop();
      }
    } else if (pick.type === 'decoration' && pick.facing) {
      // Ensure facing-scoped key even if pick.sprite was a plain PNG.
      file = spriteAnchorKey(file, pick.facing);
    }
    if (!file) return;
    setCalibrateTarget({
      file,
      key: pick.key || (pick.type === 'bay' ? 'bay' : 'office'),
      type: pick.type,
      label: pick.label || null,
      facing: pick.facing || null,
      x: pick.x,
      y: pick.y,
    });
    setCalibrateMode(true);
    setDock(null);
    setPlaceBuildingKey(null);
    setPlaceBay(false);
    setSelectedBuildingKey(null);
    setSelectedBayId(null);
  };

  const paintMapTile = (gx, gy, tool) => {
    if (!mapDraft) return;
    const key = tileKey(gx, gy);
    setMapDirty(true);
    setMapDraft((prev) => {
      const next = {
        ...prev,
        starterOwned: toTileList(prev.starterOwned),
        buildable: toTileList(prev.buildable),
        blocked: toTileList(prev.blocked),
        roadTiles: keysToCoords(toTileList(prev.roadTiles)),
        starterPlacements: [...(prev.starterPlacements || [])],
      };
      const dropFrom = (arr) => arr.filter((k) => k !== key);
      const roadKeys = toTileList(next.roadTiles);
      const ensure = (arr) => (arr.includes(key) ? arr : [...arr, key]);

      if (tool === 'clear') {
        next.starterOwned = dropFrom(next.starterOwned);
        next.buildable = dropFrom(next.buildable);
        next.blocked = dropFrom(next.blocked);
        next.roadTiles = keysToCoords(dropFrom(roadKeys));
        next.starterPlacements = next.starterPlacements.filter((p) => !(p.x === gx && p.y === gy));
        return next;
      }
      if (tool === 'road') {
        next.roadTiles = keysToCoords([...dropFrom(roadKeys), key]);
        next.starterOwned = dropFrom(next.starterOwned);
        next.buildable = dropFrom(next.buildable);
        next.blocked = dropFrom(next.blocked);
        next.starterPlacements = next.starterPlacements.filter((p) => !(p.x === gx && p.y === gy));
        return next;
      }
      if (tool === 'blocked') {
        next.blocked = [...dropFrom(next.blocked), key];
        next.starterOwned = dropFrom(next.starterOwned);
        next.buildable = dropFrom(next.buildable);
        next.roadTiles = keysToCoords(dropFrom(roadKeys));
        next.starterPlacements = next.starterPlacements.filter((p) => !(p.x === gx && p.y === gy));
        return next;
      }
      if (tool === 'buildable') {
        next.buildable = [...dropFrom(next.buildable), key];
        next.starterOwned = dropFrom(next.starterOwned);
        next.blocked = dropFrom(next.blocked);
        next.roadTiles = keysToCoords(dropFrom(roadKeys));
        next.starterPlacements = next.starterPlacements.filter((p) => !(p.x === gx && p.y === gy));
        return next;
      }
      if (tool === 'owned') {
        next.starterOwned = [...dropFrom(next.starterOwned), key];
        next.buildable = ensure(next.buildable);
        next.blocked = dropFrom(next.blocked);
        next.roadTiles = keysToCoords(dropFrom(roadKeys));
        return next;
      }
      if (tool === 'hq' || tool === 'bay') {
        next.roadTiles = keysToCoords(dropFrom(roadKeys));
        next.blocked = dropFrom(next.blocked);
        next.buildable = ensure(next.buildable);
        next.starterOwned = ensure(next.starterOwned);
        if (tool === 'hq') {
          next.starterPlacements = [
            { id: 'hq', type: 'hq', key: 'hq', level: 1, x: gx, y: gy },
            ...next.starterPlacements.filter((p) => p.type !== 'hq'),
          ];
        } else {
          next.starterPlacements = [
            ...next.starterPlacements.filter((p) => p.type !== 'bay'),
            { id: 'bay-1', type: 'bay', key: 'bay', level: 1, x: gx, y: gy },
          ];
        }
        return next;
      }
      return next;
    });
  };

  const openUpgrade = (key) => {
    setSelectedBuildingKey(key);
    setSelectedBayId(null);
    setPlaceBuildingKey(null);
    setPlaceBay(false);
    setMoveBuildingKey(null);
    setSelectedVehicleId(null);
    setDock('inspect');
  };

  const beginMoveBuilding = (key) => {
    setMoveBuildingKey(key);
    setPlaceBuildingKey(null);
    setPlaceBay(false);
    setSelectedBayId(null);
    setSelectedVehicleId(null);
    setSelectedBuildingKey(key);
    setPendingLand(null);
    setDock(null);
    setToast('Click a free pad to move · 25 coins development');
  };

  const onPick = (pick) => {
    if (!pick || busy) return;

    if (calibrateMode && (
      pick.type === 'building'
      || pick.type === 'office'
      || pick.type === 'bay'
      || pick.type === 'decoration'
      || pick.type === 'character'
    )) {
      beginCalibrate(pick);
      return;
    }

    if (pick.type === 'claim') {
      const cost = pick.cost ?? depot?.plotShop?.cost ?? 50;
      const root = depotRootRef.current;
      const rect = root?.getBoundingClientRect();
      const cx = Number(pick.clientX);
      const cy = Number(pick.clientY);
      let anchorX = 80;
      let anchorY = 120;
      if (rect && Number.isFinite(cx) && Number.isFinite(cy)) {
        anchorX = Math.min(rect.width - 16, Math.max(16, cx - rect.left));
        anchorY = Math.min(rect.height - 16, Math.max(16, cy - rect.top));
      }
      setPendingLand({ x: pick.x, y: pick.y, cost, anchorX, anchorY });
      setPlaceBuildingKey(null);
      setPlaceBay(false);
      setMoveBuildingKey(null);
      setSelectedBuildingKey(null);
      setDock(null);
      setDockPane(null);
      return;
    }

    if (pick.type === 'unowned') {
      setToast('Land must touch your yard to buy');
      return;
    }

    if (pick.type === 'decoration' || pick.type === 'road') {
      const root = depotRootRef.current;
      const rect = root?.getBoundingClientRect();
      const cx = Number(pick.clientX);
      const cy = Number(pick.clientY);
      let anchorX = 80;
      let anchorY = 120;
      if (rect && Number.isFinite(cx) && Number.isFinite(cy)) {
        anchorX = Math.min(rect.width - 16, Math.max(16, cx - rect.left));
        anchorY = Math.min(rect.height - 16, Math.max(16, cy - rect.top));
      }
      const shop = (depot?.decorationShop || []).find((d) => d.key === pick.key);
      const sellValue = pick.type === 'road'
        ? Math.max(1, Math.floor((depot?.roadShop?.cost ?? 10) * 0.5))
        : Math.max(1, Math.floor((shop?.cost || 0) * 0.5));
      setPendingEdit({
        type: pick.type,
        id: pick.id,
        key: pick.key || (pick.type === 'road' ? 'road' : ''),
        facing: pick.facing || 'SE',
        x: pick.x,
        y: pick.y,
        anchorX,
        anchorY,
        sellValue,
        edge: Boolean(shop?.edge),
        facings: pick.type === 'decoration' ? Boolean(shop?.facings !== false) : false,
        label: pick.type === 'road'
          ? 'Road'
          : (shop?.label || pick.key || 'Decoration'),
      });
      setPendingBuild(null);
      setDecorDraft(null);
      setPendingLand(null);
      setDock(null);
      setDockPane(null);
      return;
    }

    if (pick.type === 'owned') {
      const root = depotRootRef.current;
      const rect = root?.getBoundingClientRect();
      const cx = Number(pick.clientX);
      const cy = Number(pick.clientY);
      let anchorX = 80;
      let anchorY = 120;
      if (rect && Number.isFinite(cx) && Number.isFinite(cy)) {
        anchorX = Math.min(rect.width - 16, Math.max(16, cx - rect.left));
        anchorY = Math.min(rect.height - 16, Math.max(16, cy - rect.top));
      }
      setPendingBuild({
        x: pick.x,
        y: pick.y,
        anchorX,
        anchorY,
        occupied: Boolean(pick.occupied),
      });
      setDecorDraft(null);
      setPendingEdit(null);
      setPendingLand(null);
      setPlaceBuildingKey(null);
      setPlaceBay(false);
      setMoveBuildingKey(null);
      setSelectedBuildingKey(null);
      setDock(null);
      setDockPane(null);
      return;
    }

    if (pick.type === 'empty') {
      if (moveBuildingKey) {
        const purchaseId = (typeof crypto !== 'undefined' && crypto.randomUUID)
          ? crypto.randomUUID()
          : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
        buy({
          kind: 'moveBuilding',
          key: moveBuildingKey,
          x: pick.x,
          y: pick.y,
          purchaseId,
        });
        return;
      }
      if (placeBay || pick.placeKey === 'bay') {
        buy({ kind: 'bay', x: pick.x, y: pick.y });
        return;
      }
      if (placeBuildingKey && (pick.placeKey === placeBuildingKey || !pick.placeKey)) {
        buy({ kind: 'building', key: placeBuildingKey, x: pick.x, y: pick.y });
        return;
      }
      return;
    }

    if (pick.type === 'building') {
      if (moveBuildingKey) {
        setMoveBuildingKey(null);
        setToast('Move cancelled');
      }
      openUpgrade(pick.key);
      return;
    }

    if (pick.type === 'office') {
      if (moveBuildingKey) {
        setMoveBuildingKey(null);
        setToast('Move cancelled');
      }
      openUpgrade('office');
      return;
    }

    if (pick.type === 'staff') {
      setSelectedBuildingKey(null);
      setSelectedBayId(null);
      setSelectedVehicleId(null);
      setPlaceBuildingKey(null);
      setPlaceBay(false);
      setMoveBuildingKey(null);
      setDock('staff');
      setDockPane('menu');
      return;
    }

    if (pick.type === 'coach' || pick.type === 'bay' || pick.type === 'vehicle') {
      if (pick.type === 'bay' && placeBay) return;
      if (pick.type === 'bay') {
        const bays = (depot?.grid?.placements || []).filter((p) => p.type === 'bay');
        const bay = (pick.id && bays.find((p) => p.id === pick.id))
          || bays[pick.slot]
          || bays.find((p) => p.x === pick.x && p.y === pick.y);
        setSelectedBayId(bay?.id || null);
        setSelectedBuildingKey(null);
        setSelectedVehicleId(null);
        setPlaceBuildingKey(null);
        setPlaceBay(false);
        setMoveBuildingKey(null);
        setPendingBuild(null);
        setDock('bay');
        return;
      }
      const vehicleId = pick.vehicleId || pick.id;
      const fleet = depot?.fleet || [];
      const vehicle = fleet.find((v) => v.id === vehicleId) || fleet[pick.slot];
      const job = (depot?.activeJobs || []).find((j) => (
        j.vehicleId === vehicle?.id || j.driverSlot === pick.slot
      ));
      if (job && remainingMs(job.readyAt) > 0) {
        setToast(`Back in ${formatDuration(remainingMs(job.readyAt))}`);
        return;
      }
      setSelectedVehicleId(vehicle?.id || null);
      setSelectedBuildingKey(null);
      setSelectedBayId(null);
      setPlaceBuildingKey(null);
      setPlaceBay(false);
      setMoveBuildingKey(null);
      setDock('jobs');
    }
  };

  const toggleDock = (id) => {
    setDock((cur) => {
      const next = cur === id ? null : id;
      if (next !== 'build') {
        setPlaceBuildingKey(null);
        setPlaceBay(false);
      }
      setMoveBuildingKey(null);
      if (next !== 'inspect') setSelectedBuildingKey(null);
      if (next !== 'bay') setSelectedBayId(null);
      if (next === 'staff' || next === 'vehicles') setDockPane('menu');
      else setDockPane(null);
      return next;
    });
  };

  const newBuildings = useMemo(() => (
    (depot?.buildingShop || []).filter((b) => !b.maxed && (b.level || 0) === 0 && !b.locked)
  ), [depot]);

  /** HQ + every building with a current level (placed / upgradeable / maxed). */
  const levelsRoster = useMemo(() => {
    if (!depot) return [];
    const rows = [];
    if (depot.officeShop) {
      rows.push({
        ...depot.officeShop,
        key: 'office',
        kind: 'office',
        label: 'Headquarters',
      });
    }
    for (const b of depot.buildingShop || []) {
      if ((b.level || 0) <= 0) continue;
      rows.push({ ...b, kind: 'building' });
    }
    return rows;
  }, [depot]);

  const selectedBay = useMemo(() => {
    if (!selectedBayId || !depot?.grid?.placements) return null;
    return depot.grid.placements.find((p) => p.type === 'bay' && p.id === selectedBayId) || null;
  }, [depot, selectedBayId]);

  const chargerShop = depot?.chargerShop || null;

  if (loading) {
    return (
      <div className="gui-panel gui-panel--dark h-[560px] flex items-center justify-center">
        <p className="gui-font-narrow text-sm text-slate-300 uppercase tracking-wide">Loading depot…</p>
      </div>
    );
  }
  if (error && !depot) {
    return (
      <div className="gui-panel px-4 py-6">
        <p className="gui-font-narrow text-sm text-rose-700 uppercase tracking-wide">{error}</p>
      </div>
    );
  }
  if (!depot) return null;

  const unlockedJobs = (depot.jobTypes || []).filter((j) => !j.locked);
  const lockedJobs = (depot.jobTypes || []).filter((j) => j.locked);

  const inspectBuilding = selectedBuildingKey === 'office'
    ? depot.officeShop
    : (depot.buildingShop || []).find((b) => b.key === selectedBuildingKey);

  const dockTitle = (() => {
    if (dock === 'inspect') return inspectBuilding?.label || 'Upgrade building';
    if (dock === 'bay') return 'Parking bay';
    if (dock === 'levels') return 'Building levels';
    if (dock === 'staff') {
      if (dockPane === 'list') return 'Staff list';
      if (dockPane === 'hire') return 'Hire staff';
      return 'Staff';
    }
    if (dock === 'vehicles') {
      if (dockPane === 'list') return 'Fleet list';
      if (dockPane === 'buy') return 'Buy coaches';
      return 'Vehicles';
    }
    return TOOLBAR.find((m) => m.id === dock)?.label || dock;
  })();

  const hint = (() => {
    if (calibrateMode) {
      return 'Calibration yard · click HQ / building / bay / decoration / driver · amber diamond = tile lock';
    }
    if (editorMode) return `Map editor · ${mapTool}${mapDirty ? ' · unsaved' : ''}`;
    if (pendingEdit) {
      return pendingEdit.type === 'road'
        ? 'Road selected — sell back for half price'
        : 'Decoration selected — rotate or sell';
    }
    if (pendingBuild) return 'Choose what to build on this pad';
    if (pendingLand) return `Confirm buy · ${pendingLand.cost} coins`;
    if (claimLandMode) return 'Click adjacent unowned land to buy';
    if (moveBuildingKey) return 'Click a free owned pad to move · 25 coins development · click the building to cancel';
    if (placeBay) return 'Click a free owned pad to place a parking bay';
    if (buildMode && placeBuildingKey) return 'Click a free owned pad to place the building';
    if (buildMode) return 'Pick a building or bay below, then click a free pad';
    if (dock === 'levels') return 'Upgrade any placed building from the list';
    if (dock === 'bay') return 'Upgrade this parking bay, or click elsewhere';
    if (dock === 'inspect') return 'Upgrade or move this building · click another on the map';
    if (dock === 'vehicles' && dockPane === 'buy') return 'Buy a coach — needs a free parking bay';
    if (dock === 'vehicles' && dockPane === 'list') return 'Your fleet — sell coaches you no longer need';
    if (dock === 'staff' && dockPane === 'hire') return 'Hire drivers — casuals last 1 job';
    if (dock === 'staff' && dockPane === 'list') return 'Your roster — train when Training unlocks';
    if (dock === 'jobs') return 'Pick a job — coach leaves the yard';
    return 'Click free owned pads to build · unowned land to buy · bays show assigned coaches';
  })();

  return (
    <div className="w-full space-y-2">
      <div
        ref={depotRootRef}
        className="relative w-full rounded-2xl border border-[#1a2540] overflow-hidden bg-[#0b1220] shadow-lg shadow-black/40"
        data-coach-depot-root
      >
        <CoachDepotScene
          depot={depot}
          selectedVehicleId={selectedVehicleId}
          selectedBuildingKey={selectedBuildingKey}
          selectedBayId={selectedBayId}
          buildMode={buildMode || Boolean(moveBuildingKey)}
          placeBuildingKey={placeBuildingKey || (moveBuildingKey && moveBuildingKey !== 'office' ? moveBuildingKey : null)}
          placeBay={placeBay}
          moveBuildingKey={moveBuildingKey}
          claimLandMode={claimLandMode}
          editorMode={editorMode}
          calibrateMode={calibrateMode}
          calibrateTarget={calibrateTarget}
          spriteAnchors={spriteAnchors}
          mapDraft={mapDraft}
          editorTool={mapTool}
          fx={fx}
          onPick={onPick}
          onEditorPaint={paintMapTile}
          height={sceneHeight}
        />

        {/* Top HUD */}
        {!editorMode ? (
        <div className="pointer-events-none absolute inset-x-0 top-0 p-3 flex items-start justify-between gap-2 z-10">
          <div className="pointer-events-auto">
            <GameUiPanel dark className="!rounded-xl shadow-xl" bodyClassName="!py-2 !px-3 space-y-0.5">
              <p className="gui-font text-[10px] uppercase tracking-wider text-sky-300">Coach Depot</p>
              <p className="gui-font-narrow text-sm text-white font-semibold leading-tight">
                {depot.officeLabel || depot.ageName}
              </p>
              <p className="text-[11px] text-slate-300">
                {depot.bays}/{depot.bayCap || depot.bays} bays · {depot.jobsCompleted || 0} jobs
              </p>
            </GameUiPanel>
          </div>
          <div className="pointer-events-auto flex items-start gap-2">
            <div className="gui-status-hud">
              <div className="gui-status-hud__row">
                <span className="gui-status-hud__label">Drivers</span>
                <span className="gui-status-hud__value">
                  {(depot.staff || []).length} hired
                  <span className="gui-status-hud__sep">·</span>
                  {(depot.staff || []).filter((s) => s.busy).length} out
                </span>
              </div>
              <div className="gui-status-hud__row">
                <span className="gui-status-hud__label">Coaches</span>
                <span className="gui-status-hud__value">
                  {(depot.fleet || []).length} owned
                  <span className="gui-status-hud__sep">·</span>
                  {(depot.fleet || []).filter((v) => v.onJob).length} out
                  {(depot.fleet || []).some((v) => v.inspecting && remainingMs(v.inspectUntil) > 0) ? (
                    <>
                      <span className="gui-status-hud__sep">·</span>
                      {(depot.fleet || []).filter((v) => v.inspecting && remainingMs(v.inspectUntil) > 0).length} workshop
                    </>
                  ) : null}
                </span>
              </div>
            </div>
            <div className="flex items-center gap-1">
              {Object.keys(VIEW_HEIGHTS).map((key) => (
                <GameUiButton
                  key={key}
                  size="sm"
                  variant={viewSize === key ? 'primary' : 'neutral'}
                  pressed={viewSize === key}
                  sound="switch"
                  onClick={() => setViewSize(key)}
                  title={`Viewport: ${key}`}
                  className="!min-w-[2.1rem] !px-2"
                >
                  {key === 'comfortable' ? 'S' : key === 'tall' ? 'M' : 'L'}
                </GameUiButton>
              ))}
            </div>
            <GameUiBadge star className="shadow-lg">
              {depot.coinBalance ?? 0}
              <span className="text-[10px] opacity-80 ml-0.5">coins</span>
            </GameUiBadge>
          </div>
        </div>
        ) : null}

        {!editorMode ? (
        <div className="pointer-events-none absolute inset-x-0 top-[5.1rem] flex justify-center px-3 z-10">
          <p className="gui-pill">{hint}</p>
        </div>
        ) : null}

        {(toast || error) ? (
          <div className="pointer-events-none absolute left-1/2 -translate-x-1/2 top-1/2 -mt-8 z-20">
            <p className={`gui-toast ${error ? 'gui-toast--err' : 'gui-toast--ok'}`}>
              {error || toast}
            </p>
          </div>
        ) : null}

        {((depot.activeJobs || []).length > 0
          || (depot.fleet || []).some((v) => v.inspecting && remainingMs(v.inspectUntil) > 0))
          && !editorMode ? (
          <div className="absolute bottom-[6.5rem] left-3 right-3 flex flex-wrap gap-1.5 pointer-events-auto z-10">
            {(depot.activeJobs || []).map((job) => {
              const left = remainingMs(job.readyAt);
              const ready = left <= 0;
              const vehicle = (depot.fleet || []).find((v) => v.id === job.vehicleId);
              const vehicleLabel = vehicle?.reg || vehicle?.tierLabel || vehicle?.label || null;
              const interactive = Boolean(sandbox && !ready && !busy);
              return (
                <button
                  key={job.id}
                  type="button"
                  disabled={busy}
                  title={
                    ready
                      ? 'Returning to the yard…'
                      : (sandbox ? 'Sandbox · click to force complete' : `Back in ${formatDuration(left)}`)
                  }
                  className={[
                    'gui-job-chip',
                    ready ? 'gui-job-chip--ready' : '',
                    interactive ? 'gui-job-chip--interactive' : '',
                  ].filter(Boolean).join(' ')}
                  onClick={() => {
                    if (busy) return;
                    if (sandbox && !ready) forceComplete(job.id);
                    else if (!ready) setToast(`Back in ${formatDuration(left)}`);
                  }}
                >
                  <span className="gui-job-chip__title truncate max-w-full">{job.label}</span>
                  <span className="gui-job-chip__meta">
                    {ready ? 'Returning…' : (
                      <>
                        Back in{' '}
                        <span className="gui-job-chip__time">{formatDuration(left)}</span>
                      </>
                    )}
                  </span>
                  {vehicleLabel ? (
                    <span className="gui-job-chip__sub truncate max-w-full">{vehicleLabel}</span>
                  ) : null}
                </button>
              );
            })}
            {(depot.fleet || [])
              .filter((v) => v.inspecting && remainingMs(v.inspectUntil) > 0)
              .map((v) => {
                const left = remainingMs(v.inspectUntil);
                const label = v.reg || v.tierLabel || v.label || 'Coach';
                return (
                  <button
                    key={`inspect-${v.id}`}
                    type="button"
                    disabled={busy}
                    title={`Workshop · back in ${formatDuration(left)}`}
                    className="gui-job-chip gui-job-chip--inspect"
                    onClick={() => {
                      if (busy) return;
                      setToast(`Workshop · back in ${formatDuration(left)}`);
                    }}
                  >
                    <span className="gui-job-chip__title truncate max-w-full">Workshop</span>
                    <span className="gui-job-chip__meta">
                      Back in{' '}
                      <span className="gui-job-chip__time">{formatDuration(left)}</span>
                    </span>
                    <span className="gui-job-chip__sub truncate max-w-full">{label}</span>
                  </button>
                );
              })}
          </div>
        ) : null}

        {/* Edit decoration / road */}
        {pendingEdit && !editorMode ? (
          <>
            <button
              type="button"
              aria-label="Dismiss edit"
              className="absolute inset-0 z-40 cursor-default bg-black/25 border-0 p-0"
              onClick={() => setPendingEdit(null)}
            />
            <div
              role="dialog"
              aria-label="Edit item"
              className="absolute z-50 w-[15.5rem] -translate-x-1/2 -translate-y-full pointer-events-auto"
              style={{
                left: pendingEdit.anchorX ?? '50%',
                top: Math.max(72, (pendingEdit.anchorY ?? 120) - 8),
              }}
              onClick={(e) => e.stopPropagation()}
              onPointerDown={(e) => e.stopPropagation()}
            >
              <GameUiPanel
                title={pendingEdit.label}
                header="blue"
                dark
                onClose={() => setPendingEdit(null)}
              >
                <div className="space-y-2">
                  {pendingEdit.type === 'decoration' ? (
                    <>
                      <div className="flex items-center gap-2">
                        <img
                          src={decorationSprite(pendingEdit.key, pendingEdit.facing)}
                          alt=""
                          className="h-10 w-auto object-contain shrink-0"
                        />
                        <div className="min-w-0">
                          <p className="text-xs font-bold text-white">{pendingEdit.label}</p>
                          <p className="text-[11px] text-slate-300">
                            {pendingEdit.edge
                              ? `${pendingEdit.facing} edge · ${DECOR_FACING_LABELS[pendingEdit.facing] || ''}`
                              : `Facing ${pendingEdit.facing}`}
                          </p>
                        </div>
                      </div>
                      {pendingEdit.facings ? (
                        <div className="grid grid-cols-2 gap-1.5">
                          {DECOR_FACINGS.map((facing) => (
                            <button
                              key={facing}
                              type="button"
                              disabled={busy}
                              onClick={() => buy({
                                kind: 'setDecorationFacing',
                                placementId: pendingEdit.id,
                                facing,
                              })}
                              className={`rounded-lg border px-2 py-1.5 text-left text-[11px] font-semibold disabled:opacity-40 ${
                                pendingEdit.facing === facing
                                  ? 'border-violet-300 bg-violet-500/40 text-white'
                                  : 'border-white/15 bg-black/20 text-slate-200 hover:bg-white/10'
                              }`}
                            >
                              <span className="block font-bold">{facing}</span>
                              <span className="block text-[9px] font-normal text-slate-300">
                                {DECOR_FACING_LABELS[facing] || facing}
                              </span>
                            </button>
                          ))}
                        </div>
                      ) : null}
                      <GameUiButton
                        variant="primary"
                        disabled={busy || !pendingEdit.facings}
                        className="w-full"
                        onClick={() => buy({
                          kind: 'rotateDecoration',
                          placementId: pendingEdit.id,
                        })}
                      >
                        Rotate
                      </GameUiButton>
                    </>
                  ) : (
                    <p className="text-[11px] text-slate-300">
                      Service road at ({pendingEdit.x}, {pendingEdit.y})
                    </p>
                  )}
                  <GameUiButton
                    variant="danger"
                    disabled={busy}
                    className="w-full"
                    onClick={() => {
                      if (!window.confirm(
                        `Sell ${pendingEdit.label} for ${pendingEdit.sellValue} coins?`,
                      )) return;
                      buy({
                        kind: 'sellPlacement',
                        placementId: pendingEdit.id,
                      });
                    }}
                  >
                    Sell · {pendingEdit.sellValue} coins{sandbox ? ' (sandbox)' : ''}
                  </GameUiButton>
                </div>
              </GameUiPanel>
            </div>
          </>
        ) : null}

        {/* Build menu on owned free pad */}
        {pendingBuild && !editorMode ? (
          <>
            <button
              type="button"
              aria-label="Dismiss build menu"
              className="absolute inset-0 z-40 cursor-default bg-black/25 border-0 p-0"
              onClick={() => {
                setPendingBuild(null);
                setDecorDraft(null);
              }}
            />
            <div
              role="dialog"
              aria-label="Build here"
              className="absolute z-50 w-[16.5rem] -translate-x-1/2 -translate-y-full pointer-events-auto"
              style={{
                left: pendingBuild.anchorX ?? '50%',
                top: Math.max(72, (pendingBuild.anchorY ?? 120) - 8),
              }}
              onClick={(e) => e.stopPropagation()}
              onPointerDown={(e) => e.stopPropagation()}
            >
              <GameUiPanel
                title={pendingBuild.occupied ? 'Decorate pad' : 'Build here'}
                header="blue"
                dark
                onClose={() => {
                  setPendingBuild(null);
                  setDecorDraft(null);
                }}
              >
                <div className="space-y-2 max-h-[min(50vh,22rem)] overflow-y-auto">
                  <p className="text-[11px] text-slate-400">
                    Pad ({pendingBuild.x}, {pendingBuild.y})
                  </p>
                  {!pendingBuild.occupied ? (
                    <>
                      {(() => {
                        const roadOk = tileTouchesRoad(
                          pendingBuild.x,
                          pendingBuild.y,
                          depot.grid?.roadTiles || [],
                        );
                        const bayCost = depot.bayShop?.cost;
                        const bayLocked = Boolean(depot.bayShop?.locked) || (!sandbox && !roadOk);
                        const bayReason = depot.bayShop?.locked
                          ? depot.bayShop.lockReason
                          : (!roadOk ? 'Needs a road next to this pad' : null);
                        return (
                          <button
                            type="button"
                            disabled={busy || bayLocked || bayCost == null}
                            onClick={() => buy({ kind: 'bay', x: pendingBuild.x, y: pendingBuild.y })}
                            className="gui-card gui-card--dark w-full px-2.5 py-2 text-left disabled:opacity-40"
                          >
                            <p className="text-xs font-bold text-white">Parking bay</p>
                            <p className="text-[11px] text-slate-300">
                              {bayCost != null ? `${bayCost} coins` : '—'}
                              {sandbox ? ' · free in sandbox' : ''}
                            </p>
                            {bayReason ? (
                              <p className="text-[10px] text-rose-300 mt-0.5">{formatRequired(bayReason)}</p>
                            ) : (
                              <p className="text-[10px] text-slate-400 mt-0.5">Must touch a road</p>
                            )}
                          </button>
                        );
                      })()}
                      <button
                        type="button"
                        disabled={busy || depot.roadShop?.cost == null}
                        onClick={() => buy({ kind: 'road', x: pendingBuild.x, y: pendingBuild.y })}
                        className="gui-card gui-card--dark w-full px-2.5 py-2 text-left disabled:opacity-40"
                      >
                        <p className="text-xs font-bold text-white">Road</p>
                        <p className="text-[11px] text-slate-300">
                          {depot.roadShop?.cost ?? 10} coins
                          {sandbox ? ' · free in sandbox' : ''}
                        </p>
                        <p className="text-[10px] text-amber-200/90 mt-0.5">
                          Service road — bays must connect to road
                        </p>
                      </button>
                      <p className="text-[10px] uppercase tracking-wide text-slate-500 pt-1">
                        Buildings
                      </p>
                      {newBuildings.map((b) => (
                        <button
                          key={b.key}
                          type="button"
                          disabled={busy || b.locked}
                          onClick={() => buy({
                            kind: 'building',
                            key: b.key,
                            x: pendingBuild.x,
                            y: pendingBuild.y,
                          })}
                          className="gui-card gui-card--dark w-full px-2.5 py-2 text-left disabled:opacity-40 flex gap-2 items-center"
                        >
                          <img
                            src={buildingSprite(b.key, 1)}
                            alt=""
                            className="h-10 w-auto object-contain shrink-0"
                          />
                          <div className="min-w-0">
                            <p className="text-xs font-bold text-white truncate">{b.label}</p>
                            <p className="text-[11px] text-slate-300">
                              {b.cost != null ? `${b.cost} coins` : '—'}
                            </p>
                            {(b.requirements || b.lockReason) ? (
                              <p className="text-[10px] text-rose-300">
                                {formatRequired(b.requirements || b.lockReason)}
                              </p>
                            ) : null}
                          </div>
                        </button>
                      ))}
                      {!newBuildings.length ? (
                        <p className="text-[11px] text-slate-500">No new buildings unlocked — upgrade HQ / Ops.</p>
                      ) : null}
                    </>
                  ) : null}
                  <p className="text-[10px] uppercase tracking-wide text-slate-500 pt-1">
                    Decorations · cosmetic only
                  </p>
                  {pendingBuild.occupied ? (
                    <p className="text-[11px] text-amber-200/90">
                      Pad occupied — you can still add edge fences around it.
                    </p>
                  ) : null}
                  {decorDraft ? (
                    <div className="rounded-xl border border-violet-400/40 bg-violet-500/10 px-2.5 py-2 space-y-2">
                      <div className="flex items-center gap-2">
                        <img
                          src={decorationSprite(decorDraft.key, decorDraft.facing)}
                          alt=""
                          className="h-9 w-auto object-contain shrink-0"
                        />
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-bold text-white truncate">
                            {(depot.decorationShop || []).find((d) => d.key === decorDraft.key)?.label || decorDraft.key}
                          </p>
                          <p className="text-[10px] text-violet-200">
                            {decorDraft.edge
                              ? 'Choose which edge to fence'
                              : 'Choose facing'}
                          </p>
                        </div>
                        <button
                          type="button"
                          className="text-[11px] text-slate-400 hover:text-white"
                          onClick={() => setDecorDraft(null)}
                        >
                          Back
                        </button>
                      </div>
                      <div className="grid grid-cols-2 gap-1.5">
                        {(decorDraft.facingOptions || DECOR_FACINGS).map((facing) => (
                          <button
                            key={facing}
                            type="button"
                            onClick={() => setDecorDraft((cur) => (cur ? { ...cur, facing } : cur))}
                            className={`rounded-lg border px-2 py-1.5 text-left text-[11px] font-semibold ${
                              decorDraft.facing === facing
                                ? 'border-violet-300 bg-violet-500/40 text-white'
                                : 'border-white/15 bg-black/20 text-slate-200 hover:bg-white/10'
                            }`}
                          >
                            <span className="block font-bold">{facing}</span>
                            <span className="block text-[9px] font-normal text-slate-300">
                              {DECOR_FACING_LABELS[facing] || facing}
                            </span>
                          </button>
                        ))}
                      </div>
                      <GameUiButton
                        variant="primary"
                        disabled={busy}
                        className="w-full"
                        onClick={() => buy({
                          kind: 'decoration',
                          key: decorDraft.key,
                          facing: decorDraft.facing,
                          x: pendingBuild.x,
                          y: pendingBuild.y,
                        })}
                      >
                        Place · {(depot.decorationShop || []).find((d) => d.key === decorDraft.key)?.cost ?? '—'} coins
                        {sandbox ? ' (free)' : ''}
                      </GameUiButton>
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 gap-1.5">
                      {(depot.decorationShop || [])
                        .filter((d) => !pendingBuild.occupied || d.edge)
                        .map((d) => (
                          <button
                            key={d.key}
                            type="button"
                            disabled={busy}
                            onClick={() => {
                              if (d.facings) {
                                setDecorDraft({
                                  key: d.key,
                                  facing: 'SE',
                                  edge: Boolean(d.edge),
                                  facingOptions: d.facingOptions || DECOR_FACINGS,
                                });
                                return;
                              }
                              buy({
                                kind: 'decoration',
                                key: d.key,
                                x: pendingBuild.x,
                                y: pendingBuild.y,
                              });
                            }}
                            className="gui-card gui-card--dark px-2 py-2 text-left disabled:opacity-40"
                          >
                            <img
                              src={decorationSprite(d.key)}
                              alt=""
                              className="h-8 w-auto mx-auto object-contain mb-1"
                            />
                            <p className="text-[11px] font-bold text-white truncate">{d.label}</p>
                            <p className="text-[10px] text-violet-200">{d.cost} coins</p>
                            <p className="text-[9px] text-slate-400">
                              {d.edge ? 'Pick an edge' : 'Decoration only'}
                            </p>
                          </button>
                        ))}
                    </div>
                  )}
                </div>
              </GameUiPanel>
            </div>
          </>
        ) : null}

        {/* Buy-land popover at the clicked tile */}
        {pendingLand && !editorMode ? (
          <>
            <button
              type="button"
              aria-label="Dismiss land purchase"
              className="absolute inset-0 z-40 cursor-default bg-black/25 border-0 p-0"
              onClick={() => setPendingLand(null)}
            />
            <div
              role="dialog"
              aria-label="Buy land"
              className="absolute z-50 w-[11.5rem] -translate-x-1/2 -translate-y-full pointer-events-auto"
              style={{
                left: pendingLand.anchorX ?? '50%',
                top: Math.max(72, (pendingLand.anchorY ?? 120) - 8),
              }}
              onClick={(e) => e.stopPropagation()}
              onPointerDown={(e) => e.stopPropagation()}
            >
              <GameUiPanel title="Buy land" header="yellow" dark>
                <p className="gui-font-narrow text-sm font-bold text-white leading-tight">
                  Plot ({pendingLand.x}, {pendingLand.y})
                </p>
                <p className="text-[11px] text-slate-300 mt-1">
                  {pendingLand.cost} coins{sandbox ? ' · free in sandbox' : ''}
                </p>
                {depot.plotShop?.lockReason && !sandbox ? (
                  <p className="text-[11px] text-amber-200 mt-1">{depot.plotShop.lockReason}</p>
                ) : null}
                <div className="flex gap-1.5 pt-2">
                  <GameUiButton
                    variant="accent"
                    size="sm"
                    block
                    disabled={busy || (depot.plotShop?.locked && !sandbox)}
                    onClick={() => buy({ kind: 'plot', x: pendingLand.x, y: pendingLand.y })}
                  >
                    Confirm
                  </GameUiButton>
                  <GameUiButton
                    variant="neutral"
                    size="sm"
                    line
                    onClick={() => setPendingLand(null)}
                  >
                    Cancel
                  </GameUiButton>
                </div>
              </GameUiPanel>
              <div
                className="mx-auto -mt-px h-0 w-0 border-x-8 border-x-transparent border-t-8 border-t-[#0b1220]/98"
                aria-hidden
              />
            </div>
          </>
        ) : null}

        {/* Map editor chrome — top strip so the whole yard stays clickable */}
        {calibrateMode ? (
          <div className="absolute inset-x-0 top-0 z-30 p-2 pointer-events-none">
            <div className="pointer-events-auto mx-auto max-w-xl rounded-2xl border border-amber-400/40 bg-[#0b1220]/96 backdrop-blur-md shadow-2xl shadow-black/50 p-3 space-y-2">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-amber-300">Tile lock calibrator</p>
                  <p className="text-xs text-slate-300 truncate">
                    {calibrateTarget?.file
                      ? `${calibrateTarget.label || ''} · ${calibrateTarget.file}`.trim()
                      : 'Full catalog yard — click HQ / building / bay / decoration / driver'}
                  </p>
                </div>
                <button
                  type="button"
                  className="text-xs text-slate-400 hover:text-white shrink-0"
                  onClick={() => {
                    setCalibrateMode(false);
                    setCalibrateTarget(null);
                  }}
                >
                  Close
                </button>
              </div>
              {calibrateTarget?.file ? (
                (() => {
                  const a = normalizeSpriteAnchor(spriteAnchors[calibrateTarget.file]);
                  return (
                    <div className="space-y-2">
                      <label className="block text-[11px] text-slate-400">
                        Scale {a.scale.toFixed(2)}
                        <input
                          type="range"
                          min="0.35"
                          max="2.2"
                          step="0.01"
                          value={a.scale}
                          onChange={(e) => patchAnchor(calibrateTarget.file, { scale: Number(e.target.value) })}
                          className="w-full accent-amber-400"
                        />
                      </label>
                      <label className="block text-[11px] text-slate-400">
                        Offset X {a.ox}px
                        <input
                          type="range"
                          min="-64"
                          max="64"
                          step="1"
                          value={a.ox}
                          onChange={(e) => patchAnchor(calibrateTarget.file, { ox: Number(e.target.value) })}
                          className="w-full accent-amber-400"
                        />
                      </label>
                      <label className="block text-[11px] text-slate-400">
                        Offset Y {a.oy}px
                        <input
                          type="range"
                          min="-64"
                          max="64"
                          step="1"
                          value={a.oy}
                          onChange={(e) => patchAnchor(calibrateTarget.file, { oy: Number(e.target.value) })}
                          className="w-full accent-amber-400"
                        />
                      </label>
                      <div className="flex flex-wrap gap-1.5">
                        {[
                          ['←', { ox: a.ox - 1 }],
                          ['→', { ox: a.ox + 1 }],
                          ['↑', { oy: a.oy - 1 }],
                          ['↓', { oy: a.oy + 1 }],
                          ['−', { scale: Math.max(0.35, +(a.scale - 0.05).toFixed(2)) }],
                          ['+', { scale: Math.min(2.2, +(a.scale + 0.05).toFixed(2)) }],
                        ].map(([label, patch]) => (
                          <button
                            key={label}
                            type="button"
                            onClick={() => patchAnchor(calibrateTarget.file, patch)}
                            className="rounded-lg bg-white/10 hover:bg-white/15 text-white text-xs font-bold px-2.5 py-1.5"
                          >
                            {label}
                          </button>
                        ))}
                        <button
                          type="button"
                          onClick={() => patchAnchor(calibrateTarget.file, { scale: 1, ox: 0, oy: 0 })}
                          className="rounded-lg bg-white/10 hover:bg-white/15 text-slate-200 text-xs font-semibold px-2.5 py-1.5"
                        >
                          Reset sprite
                        </button>
                      </div>
                      <div className="flex flex-wrap gap-1.5 pt-1">
                        <button
                          type="button"
                          disabled={busy || !anchorsDirty}
                          onClick={saveSpriteAnchors}
                          className="rounded-lg bg-amber-500 hover:bg-amber-400 text-[#1c1917] text-xs font-bold px-3 py-2 disabled:opacity-40"
                        >
                          Save for everyone{anchorsDirty ? ' *' : ''}
                        </button>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={async () => {
                            await refresh();
                            setToast('Reloaded anchors');
                          }}
                          className="rounded-lg bg-white/10 hover:bg-white/15 text-slate-200 text-xs font-semibold px-3 py-2"
                        >
                          Reload
                        </button>
                      </div>
                    </div>
                  );
                })()
              ) : null}
            </div>
          </div>
        ) : null}

        {editorMode && mapDraft ? (
          <div className="absolute inset-x-0 top-0 z-30 px-2 pt-2 pointer-events-none">
            <div className="pointer-events-auto mx-auto max-w-4xl rounded-xl border border-teal-400/30 bg-[#0b1220]/95 backdrop-blur-md shadow-xl px-3 py-2 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-teal-300">Starter world editor</p>
                  <p className="text-[11px] text-slate-400 truncate">
                    Every player gets this map on first play / reset · paint the yard below
                  </p>
                </div>
                <button
                  type="button"
                  className="shrink-0 text-xs text-slate-400 hover:text-white px-2 py-1"
                  onClick={() => setDock(null)}
                >
                  Close
                </button>
              </div>
              <div className="flex flex-wrap gap-1">
                {MAP_TOOLS.map((tool) => (
                  <button
                    key={tool.id}
                    type="button"
                    onClick={() => setMapTool(tool.id)}
                    title={tool.hint}
                    className={`rounded-md px-2 py-1 text-[11px] font-semibold border ${
                      mapTool === tool.id
                        ? 'bg-teal-500 text-white border-teal-300/40'
                        : 'bg-white/5 text-slate-300 border-white/10 hover:bg-white/10'
                    }`}
                  >
                    {tool.label}
                  </button>
                ))}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-[11px] text-slate-500 flex-1 min-w-[8rem]">
                  {MAP_TOOLS.find((t) => t.id === mapTool)?.hint}
                  {' · '}
                  starter {toTileList(mapDraft.starterOwned).length}
                  {' / '}
                  buildable {toTileList(mapDraft.buildable).length}
                  {mapDirty ? ' · unsaved' : ''}
                </p>
                <button
                  type="button"
                  disabled={busy || !mapDirty}
                  onClick={() => saveMapEditor()}
                  className="rounded-md bg-teal-500 px-2.5 py-1 text-[11px] font-semibold text-white disabled:opacity-40"
                >
                  Save map
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => saveMapEditor({ resetAfter: true })}
                  className="rounded-md bg-teal-700 px-2.5 py-1 text-[11px] font-semibold text-white disabled:opacity-40"
                >
                  Save &amp; reset
                </button>
              </div>
            </div>
          </div>
        ) : null}

        {/* Flyout ABOVE toolbar (not used for map — keeps yard free to paint) */}
        {dock && dock !== 'map' && dock !== 'land' ? (
          <div className="absolute inset-x-0 bottom-[4.25rem] z-20 px-2 sm:px-3 pb-1 pointer-events-none">
            <div className="pointer-events-auto mx-auto max-w-4xl max-h-[48%] overflow-hidden">
              <GameUiPanel
                dark
                header={
                  dock === 'jobs' ? 'green'
                    : dock === 'money' ? 'yellow'
                      : dock === 'levels' ? 'green'
                        : dock === 'staff' ? 'blue'
                          : dock === 'vehicles' ? 'blue'
                            : 'blue'
                }
                title={dockTitle}
                onClose={() => {
                  setDock(null);
                  setDockPane(null);
                  setPlaceBuildingKey(null);
                  setSelectedBuildingKey(null);
                  setSelectedBayId(null);
                  setPendingLand(null);
                  setPendingBuild(null);
                }}
                bodyClassName="!p-0"
                className="shadow-2xl shadow-black/50"
              >
              <div className="overflow-y-auto p-3 space-y-2 max-h-[min(42vh,22rem)]">
                {dock === 'build' ? (
                  <>
                    <p className="text-[11px] text-slate-400">
                      Free pads: {depot.freePlots}. Tip: click a free owned pad for the full build menu (road, decorations, buildings).
                      Or select below, then click a pad.
                    </p>
                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
                      {newBuildings.map((b) => {
                        const selected = placeBuildingKey === b.key && !placeBay;
                        return (
                          <button
                            key={b.key}
                            type="button"
                            disabled={busy || b.locked}
                            onClick={() => {
                              setPlaceBay(false);
                              setPlaceBuildingKey(b.key);
                            }}
                            className={`gui-card gui-card--dark px-2 py-2 text-left disabled:opacity-40 ${
                              selected ? 'gui-card--selected' : ''
                            }`}
                          >
                            <img
                              src={buildingSprite(b.key, 1)}
                              alt=""
                              className="h-14 w-auto mx-auto mb-1 object-contain"
                            />
                            <p className="gui-font-narrow text-xs font-semibold text-white truncate">{b.label}</p>
                            <p className="text-[10px] text-slate-300 truncate">
                              {b.cost != null ? `${b.cost} coins` : '—'}
                            </p>
                            {(b.requirements || b.lockReason) ? (
                              <p className="text-[10px] text-rose-300 leading-snug mt-0.5">
                                {formatRequired(b.requirements || b.lockReason)}
                              </p>
                            ) : null}
                          </button>
                        );
                      })}
                      <button
                        type="button"
                        disabled={busy || depot.bayShop?.locked}
                        onClick={() => {
                          setPlaceBuildingKey(null);
                          setPlaceBay(true);
                        }}
                        className={`gui-card gui-card--dark px-2 py-2 text-left disabled:opacity-40 ${
                          placeBay ? 'gui-card--selected' : ''
                        }`}
                      >
                        <div className="h-14 flex items-center justify-center text-[11px] text-slate-300 gui-font-narrow uppercase">Bay pad</div>
                        <p className="text-xs font-semibold text-white truncate">Parking bay</p>
                        <p className="text-[10px] text-slate-400 truncate">
                          {depot.bayShop?.cost != null ? `${depot.bayShop.cost} coins` : '—'}
                        </p>
                        {depot.bayShop?.lockReason ? (
                          <p className="text-[10px] text-rose-400 leading-snug mt-0.5">
                            {formatRequired(depot.bayShop.lockReason)}
                          </p>
                        ) : null}
                      </button>
                    </div>
                    {!newBuildings.length ? (
                      <p className="text-xs text-slate-500">
                        All building types placed — open Levels to upgrade, or click one on the map.
                      </p>
                    ) : null}
                  </>
                ) : null}

                {dock === 'levels' ? (
                  <>
                    <p className="text-[11px] text-slate-400">
                      Current levels for every placed building. Upgrade here without hunting around the yard.
                    </p>
                    {!levelsRoster.length ? (
                      <p className="text-xs text-slate-500 py-2">No buildings placed yet.</p>
                    ) : (
                      <ul className="space-y-2">
                        {levelsRoster.map((b) => {
                          const sprite = b.kind === 'office'
                            ? officeSprite(b.level || 1)
                            : buildingSprite(b.key, b.level || 1);
                          const canUpgrade = !b.maxed && !b.locked && b.cost != null;
                          return (
                            <li
                              key={b.key}
                              className="rounded-xl border border-[#1a2540] bg-[#0b1220] px-3 py-2.5 flex items-center gap-3"
                            >
                              <img
                                src={sprite}
                                alt=""
                                className="h-14 w-auto object-contain shrink-0"
                                draggable={false}
                              />
                              <div className="min-w-0 flex-1 space-y-0.5">
                                <p className="gui-font-narrow text-sm font-semibold text-white truncate">
                                  {b.label}
                                </p>
                                <p className="text-[11px] text-teal-300/90">
                                  {b.levelLabel || `Level ${b.level || 0}`}
                                  {b.maxLevel ? ` / ${b.maxLevel}` : ''}
                                </p>
                                <p className="text-[10px] text-slate-400 leading-snug">
                                  {b.maxed
                                    ? 'Fully upgraded'
                                    : (b.nextLabel
                                      ? `Next: ${b.nextLabel}`
                                      : (b.effect || ''))}
                                </p>
                                {(b.requirements || b.lockReason) && !b.maxed ? (
                                  <p className="text-[10px] text-rose-300 leading-snug">
                                    {formatRequired(b.requirements || b.lockReason)}
                                  </p>
                                ) : null}
                              </div>
                              <div className="shrink-0">
                                {b.maxed ? (
                                  <GameUiBadge tone="green">Max</GameUiBadge>
                                ) : (
                                  <GameUiButton
                                    size="sm"
                                    variant={canUpgrade ? 'success' : 'neutral'}
                                    disabled={busy || !canUpgrade}
                                    onClick={() => buy(
                                      b.kind === 'office'
                                        ? { kind: 'office' }
                                        : { kind: 'building', key: b.key },
                                    )}
                                    title={canUpgrade ? undefined : 'Requirements not met'}
                                  >
                                    {b.cost != null
                                      ? `Upgrade · ${b.cost}${sandbox ? ' (free)' : ''}`
                                      : 'Locked'}
                                  </GameUiButton>
                                )}
                              </div>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </>
                ) : null}

                {dock === 'money' ? (
                  <>
                    <p className="text-[11px] text-slate-400">
                      Owned {(depot.grid?.ownedTiles || []).length}/{depot.plotShop?.max || 9} tiles ·
                      Wallet {depot.coinBalance ?? 0}
                    </p>
                    <p className="text-[11px] text-amber-100/80">
                      Click adjacent unowned land to buy. First tile 50 coins, then +50 each
                      {depot.plotShop?.cost != null ? ` · next ${depot.plotShop.cost}` : ''}.
                    </p>
                    {sandbox ? (
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => grantTestCoins(1000)}
                          className="rounded-lg bg-indigo-500/90 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50"
                        >
                          +1k test coins
                        </button>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => grantTestCoins(10000)}
                          className="rounded-lg bg-indigo-500/90 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50"
                        >
                          +10k test coins
                        </button>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => resetProgress()}
                          className="rounded-lg bg-rose-600/90 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50"
                        >
                          Reset my progress
                        </button>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => resetProgress({ all: true })}
                          className="rounded-lg bg-rose-800/90 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50"
                        >
                          Reset ALL players
                        </button>
                      </div>
                    ) : null}
                    <ShopRow
                      title="Claim next adjacent tile"
                      sub={depot.plotShop?.effect}
                      cost={depot.plotShop?.cost}
                      locked={depot.plotShop?.locked}
                      busy={busy}
                      balance={depot.coinBalance}
                      sandbox={sandbox}
                      requirements={depot.plotShop?.lockReason}
                      onBuy={() => buy({ kind: 'plot' })}
                    />
                  </>
                ) : null}

                {dock === 'jobs' ? (
                  <>
                    <div className="grid grid-cols-2 lg:grid-cols-3 gap-2">
                      {unlockedJobs.map((job) => (
                        <button
                          key={job.key}
                          type="button"
                          disabled={busy}
                          onClick={() => dispatch(job.key)}
                          className="gui-card gui-card--dark px-3 py-2.5 text-left disabled:opacity-50 border-emerald-400/40"
                        >
                          <p className="gui-font-narrow text-sm font-bold text-white">{job.label}</p>
                          <p className="text-[11px] text-emerald-200/90 mt-0.5">
                            {formatDuration(job.durationMs)} · +{job.reward}
                          </p>
                          {job.needs ? (
                            <p className="text-[10px] text-slate-300 mt-1">{job.needs}</p>
                          ) : null}
                        </button>
                      ))}
                    </div>
                    {lockedJobs.length ? (
                      <div className="space-y-1">
                        {lockedJobs.map((j) => (
                          <p key={j.key} className="text-[11px] text-rose-400">
                            {j.label}: {formatRequired(j.requirements || j.lockReason || j.needs || 'Locked')}
                          </p>
                        ))}
                      </div>
                    ) : null}
                  </>
                ) : null}

                {dock === 'staff' && (!dockPane || dockPane === 'menu') ? (
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setDockPane('list')}
                      className="gui-card gui-card--dark px-3 py-4 text-left"
                    >
                      <p className="gui-font-narrow text-sm font-bold text-white">Staff list</p>
                      <p className="text-[11px] text-slate-300 mt-1">
                        {depot.staff?.length || 0}/{depot.staffCap} hired · train &amp; check status
                      </p>
                    </button>
                    <button
                      type="button"
                      onClick={() => setDockPane('hire')}
                      className="gui-card gui-card--dark px-3 py-4 text-left"
                    >
                      <p className="gui-font-narrow text-sm font-bold text-white">Hire staff</p>
                      <p className="text-[11px] text-slate-300 mt-1">
                        Casuals 2 coins · 1 job only
                      </p>
                    </button>
                  </div>
                ) : null}

                {dock === 'staff' && dockPane === 'list' ? (
                  <>
                    <button
                      type="button"
                      onClick={() => setDockPane('menu')}
                      className="text-[11px] text-sky-300 hover:text-sky-200 font-semibold"
                    >
                      ← Staff menu
                    </button>
                    <p className="text-[11px] text-slate-400">
                      Roster {depot.staff?.length || 0}/{depot.staffCap} · casuals last 1 job · train for permanent grades
                    </p>
                    <div className="space-y-2">
                      {(depot.staff || []).map((s) => (
                        <div
                          key={s.id}
                          className="rounded-xl border border-[#1a2540] bg-[#0f172a]/95 px-3 py-2 flex flex-wrap items-center gap-2 justify-between"
                        >
                          <div className="min-w-0">
                            <p className="text-sm font-semibold text-white truncate">{s.name}</p>
                            <p className="text-[11px] text-slate-400">
                              {s.gradeLabel}
                              {s.tempHire
                                ? ` · ${s.jobsRemaining} job${s.jobsRemaining === 1 ? '' : 's'} left`
                                : ''}
                              {s.busy ? ' · out on job' : ' · in yard'}
                            </p>
                            {s.trainLockReason && s.nextGrade ? (
                              <p className="text-[10px] text-rose-400 mt-0.5">
                                {formatRequired(s.trainLockReason)}
                              </p>
                            ) : null}
                          </div>
                          {s.nextGrade ? (
                            <button
                              type="button"
                              disabled={busy || s.busy || !s.canTrain || s.trainCost == null}
                              onClick={() => buy({ kind: 'trainStaff', staffId: s.id, grade: s.nextGrade })}
                              className="rounded-lg bg-amber-500/90 hover:bg-amber-400 text-[#1c1917] text-[11px] font-bold px-2.5 py-1.5 disabled:opacity-40 shrink-0"
                            >
                              Train → {s.nextGradeLabel}
                              {s.trainCost != null ? ` · ${s.trainCost}` : ''}
                              {sandbox ? ' (free)' : ''}
                            </button>
                          ) : (
                            <span className="text-[10px] text-emerald-300/90 shrink-0">Max grade</span>
                          )}
                        </div>
                      ))}
                      {!depot.staff?.length ? (
                        <p className="text-xs text-slate-500">No drivers — hire staff to send jobs.</p>
                      ) : null}
                    </div>
                  </>
                ) : null}

                {dock === 'staff' && dockPane === 'hire' ? (
                  <>
                    <button
                      type="button"
                      onClick={() => setDockPane('menu')}
                      className="text-[11px] text-sky-300 hover:text-sky-200 font-semibold"
                    >
                      ← Staff menu
                    </button>
                    <p className="text-[11px] text-slate-400">
                      Roster {depot.staff?.length || 0}/{depot.staffCap} · casuals leave after 1 job
                    </p>
                    {(depot.hireShop || []).map((h) => (
                      <ShopRow
                        key={h.grade}
                        title={h.label}
                        sub={h.blurb || (
                          h.contractJobs === 1
                            ? `Lasts 1 job only — then leaves · drives up to tier ${h.maxVehicleTier}`
                            : `Permanent · drives up to tier ${h.maxVehicleTier}`
                        )}
                        cost={h.cost}
                        locked={h.locked}
                        busy={busy}
                        balance={depot.coinBalance}
                        sandbox={sandbox}
                        requirements={h.requirements || h.lockReason}
                        onBuy={() => buy({ kind: 'staff', grade: h.grade })}
                      />
                    ))}
                  </>
                ) : null}

                {dock === 'vehicles' && (!dockPane || dockPane === 'menu') ? (
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setDockPane('list')}
                      className="gui-card gui-card--dark px-3 py-4 text-left"
                    >
                      <p className="gui-font-narrow text-sm font-bold text-white">Fleet list</p>
                      <p className="text-[11px] text-slate-300 mt-1">
                        {(depot.fleet || []).length} owned · status &amp; sell
                      </p>
                    </button>
                    <button
                      type="button"
                      onClick={() => setDockPane('buy')}
                      className="gui-card gui-card--dark px-3 py-4 text-left"
                    >
                      <p className="gui-font-narrow text-sm font-bold text-white">Buy coaches</p>
                      <p className="text-[11px] text-slate-300 mt-1">
                        Needs a free parking bay
                      </p>
                    </button>
                  </div>
                ) : null}

                {dock === 'vehicles' && dockPane === 'list' ? (
                  <>
                    <button
                      type="button"
                      onClick={() => setDockPane('menu')}
                      className="text-[11px] text-sky-300 hover:text-sky-200 font-semibold"
                    >
                      ← Vehicles menu
                    </button>
                    <p className="text-[11px] text-slate-400">
                      Fleet {(depot.fleet || []).length}/{depot.bays || 1}
                      {depot.bayCap ? ` (cap ${depot.bayCap})` : ''} ·
                      {depot.inspectionInfo?.blurb || 'Workshop inspections after jobs.'}
                    </p>
                    <div className="space-y-2">
                      {(depot.fleet || []).map((v) => (
                        <div
                          key={v.id}
                          className="rounded-xl border border-[#1a2540] bg-[#0f172a]/95 px-3 py-2 flex gap-2 items-center"
                        >
                          <img
                            src={vehicleSprite(v.tier, 'SE')}
                            alt=""
                            className="w-auto object-contain shrink-0"
                            style={{
                              height: v.tier === 1 ? 28 : 48,
                              ...vehicleFilterStyle(v.tier),
                            }}
                            draggable={false}
                          />
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-semibold text-white truncate">
                              {v.tierLabel || v.label}
                            </p>
                            <p className="text-[11px] font-mono text-amber-200/90 tracking-wide">
                              {v.reg || '—— ——'}
                            </p>
                            <p className={`text-[11px] font-semibold ${
                              v.inspecting && remainingMs(v.inspectUntil) > 0
                                ? 'text-sky-200'
                                : v.onJob
                                  ? 'text-amber-200'
                                  : 'text-slate-300'
                            }`}
                            >
                              {v.inspecting && remainingMs(v.inspectUntil) > 0
                                ? `In workshop · back in ${formatDuration(remainingMs(v.inspectUntil))}`
                                : v.onJob
                                  ? (() => {
                                    const job = (depot.activeJobs || []).find((j) => j.vehicleId === v.id);
                                    const left = job ? remainingMs(job.readyAt) : 0;
                                    if (job && left > 0) {
                                      return `Out on ${job.label} · back in ${formatDuration(left)}`;
                                    }
                                    return job ? `Out on ${job.label} · returning…` : 'Out on job';
                                  })()
                                  : (v.jobsUntilInspection != null
                                    ? `${v.jobsUntilInspection} job${v.jobsUntilInspection === 1 ? '' : 's'} until inspection`
                                    : 'In yard')}
                            </p>
                          </div>
                          <div className="flex flex-col gap-1 shrink-0">
                            {v.inspecting && sandbox ? (
                              <button
                                type="button"
                                disabled={busy}
                                onClick={() => buy({ kind: 'skipInspection', vehicleId: v.id })}
                                className="rounded-lg bg-sky-600/90 text-white text-[10px] font-semibold px-2 py-1 disabled:opacity-40"
                              >
                                Skip inspect
                              </button>
                            ) : null}
                            <button
                              type="button"
                              disabled={busy || !v.canSell}
                              onClick={() => {
                                if (!window.confirm(`Sell ${v.reg || v.label} for ${v.sellValue} coins?`)) return;
                                buy({ kind: 'sellVehicle', vehicleId: v.id });
                              }}
                              className="rounded-lg border border-rose-400/40 text-rose-200 text-[10px] font-semibold px-2 py-1 disabled:opacity-40 hover:bg-rose-500/15"
                            >
                              Sell · {v.sellValue ?? '—'}
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </>
                ) : null}

                {dock === 'vehicles' && dockPane === 'buy' ? (
                  <>
                    <button
                      type="button"
                      onClick={() => setDockPane('menu')}
                      className="text-[11px] text-sky-300 hover:text-sky-200 font-semibold"
                    >
                      ← Vehicles menu
                    </button>
                    <p className="text-[11px] text-slate-400">
                      Fleet {(depot.fleet || []).length}/{depot.bays || 1}
                      {depot.bayCap ? ` (cap ${depot.bayCap})` : ''} · needs a free bay to buy
                    </p>
                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
                      {(depot.fleetShop || []).map((v) => (
                        <button
                          key={v.tier}
                          type="button"
                          disabled={busy || v.locked}
                          onClick={() => buy({ kind: 'vehicle', tier: v.tier })}
                          className={`rounded-xl border p-2 text-left transition disabled:opacity-40 ${
                            v.locked
                              ? 'border-white/10 bg-white/5'
                              : 'border-indigo-400/40 bg-indigo-500/15 hover:bg-indigo-500/25'
                          }`}
                        >
                          <div className="h-14 flex items-center justify-center mb-1">
                            <img
                              src={vehicleSprite(v.tier, 'SE')}
                              alt=""
                              className="w-auto object-contain"
                              style={{
                                maxHeight: v.tier === 1 ? 34 : 56,
                                ...vehicleFilterStyle(v.tier),
                              }}
                              draggable={false}
                            />
                          </div>
                          <p className="text-xs font-semibold text-white truncate">{v.label}</p>
                          <p
                            className="text-[10px] truncate font-medium"
                            style={{
                              color: v.tier === 3 ? '#38bdf8'
                                : v.tier === 4 ? '#34d399'
                                  : v.tier === 5 ? '#a78bfa'
                                    : v.tier === 2 ? '#fbbf24'
                                      : '#d6d3d1',
                            }}
                          >
                            {v.cost} coins{sandbox ? ' (free)' : ''}
                          </p>
                          {(v.requirements || v.lockReason) ? (
                            <p className="text-[10px] text-rose-400 mt-0.5 leading-snug">
                              {formatRequired(v.requirements || v.lockReason)}
                            </p>
                          ) : null}
                        </button>
                      ))}
                    </div>
                  </>
                ) : null}

                {dock === 'inspect' && inspectBuilding ? (
                  <div className="flex gap-3 items-start">
                    <img
                      src={selectedBuildingKey === 'office'
                        ? officeSprite(depot.officeLevel || 1)
                        : buildingSprite(selectedBuildingKey, inspectBuilding.level || 1)}
                      alt=""
                      className="h-20 w-auto object-contain shrink-0"
                    />
                    <div className="min-w-0 flex-1 space-y-2">
                      <p className="text-sm font-bold text-white">{inspectBuilding.label}</p>
                      <p className="text-xs text-slate-400">
                        {inspectBuilding.maxed
                          ? 'Fully upgraded'
                          : (inspectBuilding.nextLabel || inspectBuilding.effect || inspectBuilding.levelLabel)}
                      </p>
                      {selectedBuildingKey === 'office' && (inspectBuilding.unlocks || []).length ? (
                        <div className="space-y-1">
                          <p className="text-[11px] font-semibold text-amber-300">Unlocks:</p>
                          <ul className="text-[11px] text-amber-300/90 space-y-0.5 list-disc pl-4">
                            {inspectBuilding.unlocks.map((line) => (
                              <li key={line}>{line}</li>
                            ))}
                          </ul>
                        </div>
                      ) : null}
                      {(inspectBuilding.requirements || inspectBuilding.lockReason) ? (
                        <p className="text-xs text-rose-400 font-medium">
                          {formatRequired(inspectBuilding.requirements || inspectBuilding.lockReason)}
                        </p>
                      ) : null}
                      {inspectBuilding.maxed ? (
                        <p className="text-xs text-emerald-300">Max level</p>
                      ) : (
                        <GameUiButton
                          variant="primary"
                          disabled={busy || inspectBuilding.locked || inspectBuilding.cost == null}
                          onClick={() => buy(
                            selectedBuildingKey === 'office'
                              ? { kind: 'office' }
                              : { kind: 'building', key: selectedBuildingKey },
                          )}
                        >
                          Upgrade · {inspectBuilding.cost} coins{sandbox ? ' (free)' : ''}
                        </GameUiButton>
                      )}
                      <GameUiButton
                        variant="accent"
                        disabled={busy || !(depot.grid?.freeTiles || []).length}
                        onClick={() => beginMoveBuilding(selectedBuildingKey)}
                      >
                        Move · 25 coins{sandbox ? ' (free)' : ''}
                      </GameUiButton>
                      {!(depot.grid?.freeTiles || []).length ? (
                        <p className="text-[10px] text-slate-500">
                          Need a free owned pad to move (buy land or sell/clear space).
                        </p>
                      ) : (
                        <p className="text-[10px] text-slate-500">
                          Development cost — relocate on any free owned pad.
                        </p>
                      )}
                    </div>
                  </div>
                ) : null}

                {dock === 'bay' && selectedBay ? (
                  <div className="space-y-3">
                    {(() => {
                      const bays = (depot.grid?.placements || []).filter((p) => p.type === 'bay');
                      const baySlot = Math.max(0, bays.findIndex((p) => p.id === selectedBay.id));
                      const bayVehicle = (depot.fleet || [])[baySlot] || null;
                      const job = bayVehicle
                        ? (depot.activeJobs || []).find((j) => j.vehicleId === bayVehicle.id)
                        : null;
                      return (
                        <div className="rounded-xl border border-[#1a2540] bg-[#0f172a]/95 px-3 py-2 flex gap-2 items-center">
                          {bayVehicle ? (
                            <img
                              src={vehicleSprite(bayVehicle.tier, 'SE')}
                              alt=""
                              className="w-auto object-contain shrink-0"
                              style={{
                                height: bayVehicle.tier === 1 ? 28 : 44,
                                ...vehicleFilterStyle(bayVehicle.tier),
                              }}
                              draggable={false}
                            />
                          ) : (
                            <div className="h-10 w-12 rounded-lg bg-white/5 shrink-0" />
                          )}
                          <div className="min-w-0">
                            <p className="text-sm font-bold text-white">
                              {bayVehicle
                                ? (bayVehicle.reg || '—— ——')
                                : 'Empty bay'}
                            </p>
                            <p className="text-[11px] text-slate-300">
                              {bayVehicle
                                ? `${bayVehicle.tierLabel || bayVehicle.label || 'Coach'}${
                                  bayVehicle.inspecting && remainingMs(bayVehicle.inspectUntil) > 0
                                    ? ' · in workshop'
                                    : job
                                      ? ` · out on ${job.label}`
                                      : ' · in yard'
                                }`
                                : 'No coach assigned to this bay'}
                            </p>
                          </div>
                        </div>
                      );
                    })()}
                    <p className="text-sm font-bold text-white">
                      Parking bay{(selectedBay.charged || selectedBay.level >= 2) ? ' · charger fitted' : ''}
                    </p>
                    <p className="text-xs text-slate-400">
                      {(selectedBay.charged || selectedBay.level >= 2)
                        ? 'This bay can host electric coaches.'
                        : (chargerShop?.visible
                          ? (chargerShop.effect || 'Install a charger to unlock electric coaches.')
                          : 'Bay chargers unlock after Operations Lv 4.')}
                    </p>
                    {(selectedBay.charged || selectedBay.level >= 2) ? (
                      <p className="text-xs text-emerald-300">Charger installed</p>
                    ) : chargerShop?.visible ? (
                      <>
                        {chargerShop.lockReason ? (
                          <p className="text-xs text-rose-400 font-medium">
                            {formatRequired(chargerShop.lockReason)}
                          </p>
                        ) : null}
                        <GameUiButton
                          variant="success"
                          disabled={busy || chargerShop.locked || chargerShop.cost == null}
                          onClick={() => buy({
                            kind: 'charger',
                            bayId: selectedBay.id,
                            x: selectedBay.x,
                            y: selectedBay.y,
                          })}
                        >
                          Install charger · {chargerShop.cost} coins{sandbox ? ' (free)' : ''}
                        </GameUiButton>
                      </>
                    ) : (
                      <p className="text-xs text-slate-500">
                        Reach Ops Lv 4 to electrify parking bays.
                      </p>
                    )}
                  </div>
                ) : null}
              </div>
              </GameUiPanel>
            </div>
          </div>
        ) : null}

        {/* Planet Coaster / C:S icon toolbar — Kenney square buttons */}
        <div className="absolute inset-x-0 bottom-0 z-30">
          <div className="flex justify-center pb-2 pt-1 px-2 bg-gradient-to-t from-black/80 via-black/40 to-transparent">
            <div className="flex items-end gap-1 sm:gap-1.5 rounded-2xl border border-white/15 bg-[#0a0f1a]/92 backdrop-blur-md px-2 py-1.5 shadow-2xl shadow-black/50">
              {TOOLBAR.map((item) => {
                const active = dock === item.id;
                const Icon = item.Icon;
                const variant = item.id === 'money'
                  ? 'accent'
                  : item.id === 'jobs' || item.id === 'levels'
                    ? 'success'
                      : 'primary';
                return (
                  <GameUiButton
                    key={item.id}
                    shape="square"
                    variant={active ? variant : 'neutral'}
                    pressed={active}
                    sound="switch"
                    onClick={() => toggleDock(item.id)}
                    title={item.label}
                    icon={<Icon className="w-6 h-6" />}
                    className="!min-w-[3.35rem] sm:!min-w-[3.75rem] !w-auto !h-auto !px-1.5 !py-1"
                  >
                    {item.label}
                  </GameUiButton>
                );
              })}
              {sandbox ? (
                <>
                  <div className="w-px self-stretch bg-white/15 mx-0.5" aria-hidden />
                  <GameUiButton
                    shape="square"
                    variant={calibrateMode ? 'accent' : 'neutral'}
                    pressed={calibrateMode}
                    sound="switch"
                    onClick={() => {
                      setCalibrateMode((v) => {
                        const next = !v;
                        if (!next) setCalibrateTarget(null);
                        return next;
                      });
                      setDock(null);
                      setMapDraft(null);
                      setPlaceBuildingKey(null);
                      setPlaceBay(false);
                    }}
                    title="Calibrate building lock on tiles"
                    icon={<IconCalibrate className="w-6 h-6" />}
                    className="!min-w-[3.35rem] sm:!min-w-[3.75rem] !w-auto !h-auto !px-1.5 !py-1"
                  >
                    Lock
                  </GameUiButton>
                  <GameUiButton
                    shape="square"
                    variant={dock === 'map' ? 'success' : 'neutral'}
                    pressed={dock === 'map'}
                    sound="switch"
                    onClick={loadMapEditor}
                    title="Map editor"
                    icon={<IconMap className="w-6 h-6" />}
                    className="!min-w-[3.35rem] sm:!min-w-[3.75rem] !w-auto !h-auto !px-1.5 !py-1"
                  >
                    Map
                  </GameUiButton>
                  <GameUiButton
                    shape="square"
                    variant="danger"
                    disabled={busy}
                    onClick={resetProgress}
                    title="Reset progress"
                    icon={<IconReset className="w-6 h-6" />}
                    className="!min-w-[3.35rem] sm:!min-w-[3.75rem] !w-auto !h-auto !px-1.5 !py-1"
                  >
                    Reset
                  </GameUiButton>
                </>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function ShopRow({ title, sub, cost, locked, busy, balance, onBuy, sandbox = false, requirements = null }) {
  const canBuy = !locked && cost != null && (sandbox || balance >= cost);
  return (
    <div className="gui-card gui-card--dark px-3 py-2 flex items-center justify-between gap-2">
      <div className="min-w-0">
        <p className="gui-font-narrow text-sm font-semibold text-white truncate">{title}</p>
        {sub ? <p className="text-[11px] text-slate-300 leading-snug">{sub}</p> : null}
        {requirements ? (
          <p className="text-[11px] text-rose-300 font-medium">{formatRequired(requirements)}</p>
        ) : null}
      </div>
      {locked || cost == null ? (
        <span className="gui-font-narrow text-[11px] text-rose-300/90 shrink-0 uppercase">Locked</span>
      ) : (
        <GameUiButton
          size="sm"
          variant="primary"
          disabled={busy || !canBuy}
          onClick={onBuy}
          title={sandbox ? `Catalog price ${cost} (sandbox: free)` : undefined}
          className="shrink-0"
        >
          {cost}
        </GameUiButton>
      )}
    </div>
  );
}

export function CoachDepotSandbox() {
  return (
    <div className="space-y-3 w-full">
      <p className="text-sm text-slate-400 px-1">
        Sandbox toolbar: <span className="text-amber-300">Lock</span> calibrates buildings, decorations, and drivers on the tile
        (nudge scale/X/Y, Save for everyone), Map paints the starter yard, Reset wipes progress.
      </p>
      <CoachDepotPanel sandbox />
    </div>
  );
}
