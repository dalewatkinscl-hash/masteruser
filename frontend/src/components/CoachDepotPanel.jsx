import { useEffect, useMemo, useRef, useState } from 'react';
import { notifyCoinAwards } from '../utils/coinAwards';
import { buildingSprite, GROUND, normalizeSpriteAnchor, normalizeSpriteAnchors, officeSprite, vehicleFilterStyle, vehicleSprite } from '../lib/coachDepotAssets';
import CoachDepotScene from './CoachDepotScene';

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

const TOOLBAR = [
  { id: 'build', label: 'Build', Icon: IconBuild, color: 'text-sky-300', active: 'bg-sky-500 text-white border-sky-300/50' },
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
  const [dock, setDock] = useState(null);
  const [fx, setFx] = useState(null);
  const [viewSize, setViewSize] = useState('tall');
  const [mapDraft, setMapDraft] = useState(null);
  const [mapTool, setMapTool] = useState('buildable');
  const [mapDirty, setMapDirty] = useState(false);
  const [pendingLand, setPendingLand] = useState(null);
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
    if (payload?.coinsAwarded?.length) {
      notifyCoinAwards(payload.coinsAwarded);
      const total = payload.coinsAwarded.reduce((sum, row) => sum + (Number(row.amount) || 0), 0);
      if (total > 0) setToast(`+${total} coins · job complete`);
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
  const activeJobKey = (depot?.activeJobs || []).map((j) => `${j.id}:${j.readyAt}`).join('|');
  useEffect(() => {
    if (!depot || editorMode) return undefined;
    const id = window.setInterval(() => {
      if (busy || settlingRef.current) return;
      const ready = (depot.activeJobs || []).filter((j) => remainingMs(j.readyAt) <= 0);
      if (!ready.length) return;
      settlingRef.current = true;
      playFx('return', ready[0]?.driverSlot ?? 0);
      window.setTimeout(async () => {
        try {
          await refresh();
        } catch (err) {
          setError(err.message || 'Failed to settle jobs.');
        } finally {
          settlingRef.current = false;
        }
      }, 900);
    }, 1000);
    return () => window.clearInterval(id);
    // playFx is stable enough per render; refresh/busy/editorMode gate the settle.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeJobKey, busy, editorMode, refresh]);

  useEffect(() => {
    if (!toast) return undefined;
    const id = window.setTimeout(() => setToast(''), 2800);
    return () => window.clearTimeout(id);
  }, [toast]);

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
      if (body.kind === 'building' || body.kind === 'bay' || body.kind === 'plot' || body.kind === 'charger') {
        setPlaceBuildingKey(null);
        setPlaceBay(false);
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

  const resetProgress = async ({ skipConfirm = false } = {}) => {
    if (!sandbox || busy) return;
    if (!skipConfirm
      && !window.confirm('Reset Coach Depot to starter yard? This clears buildings, fleet extras, and jobs.')) {
      return;
    }
    setBusy(true);
    setError('');
    try {
      const response = await fetch('/api/adminResetCoachDepot', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const payload = (await readJsonResponse(response)) || {};
      if (!response.ok) throw new Error(payload.error || 'Reset failed.');
      setDepot(payload.depot || null);
      setPlaceBuildingKey(null);
      setPlaceBay(false);
      setSelectedBuildingKey(null);
      setSelectedVehicleId(null);
      setDock(null);
      setToast('Depot reset to starter yard');
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
      } else {
        file = buildingSprite(pick.key, pick.level || 1).split('/').pop();
      }
    }
    if (!file) return;
    setCalibrateTarget({
      file,
      key: pick.key || (pick.type === 'bay' ? 'bay' : 'office'),
      type: pick.type,
      label: pick.label || null,
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
    setSelectedVehicleId(null);
    setDock('inspect');
  };

  const onPick = (pick) => {
    if (!pick || busy) return;

    if (calibrateMode && (pick.type === 'building' || pick.type === 'office' || pick.type === 'bay')) {
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
      setSelectedBuildingKey(null);
      setDock(null);
      return;
    }

    if (pick.type === 'empty') {
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
      openUpgrade(pick.key);
      return;
    }

    if (pick.type === 'office') {
      openUpgrade('office');
      return;
    }

    if (pick.type === 'staff') {
      setSelectedBuildingKey(null);
      setSelectedBayId(null);
      setSelectedVehicleId(null);
      setPlaceBuildingKey(null);
      setPlaceBay(false);
      setDock('staff');
      return;
    }

    if (pick.type === 'coach' || pick.type === 'bay' || pick.type === 'vehicle') {
      if (pick.type === 'bay' && placeBay) return;
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
        setDock('bay');
        return;
      }
      setSelectedVehicleId(vehicle?.id || null);
      setSelectedBuildingKey(null);
      setSelectedBayId(null);
      setPlaceBuildingKey(null);
      setPlaceBay(false);
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
      if (next !== 'inspect') setSelectedBuildingKey(null);
      if (next !== 'bay') setSelectedBayId(null);
      return next;
    });
  };

  const newBuildings = useMemo(() => (
    (depot?.buildingShop || []).filter((b) => !b.maxed && (b.level || 0) === 0 && !b.locked)
  ), [depot]);

  const selectedBay = useMemo(() => {
    if (!selectedBayId || !depot?.grid?.placements) return null;
    return depot.grid.placements.find((p) => p.type === 'bay' && p.id === selectedBayId) || null;
  }, [depot, selectedBayId]);

  const chargerShop = depot?.chargerShop || null;

  if (loading) {
    return (
      <div className="rounded-2xl border border-[#1a2540] bg-[#0b1220] h-[560px] flex items-center justify-center">
        <p className="text-sm text-slate-400">Loading depot…</p>
      </div>
    );
  }
  if (error && !depot) {
    return (
      <div className="rounded-2xl border border-rose-500/30 bg-rose-500/10 px-4 py-6">
        <p className="text-sm text-rose-200">{error}</p>
      </div>
    );
  }
  if (!depot) return null;

  const unlockedJobs = (depot.jobTypes || []).filter((j) => !j.locked);
  const lockedJobs = (depot.jobTypes || []).filter((j) => j.locked);

  const inspectBuilding = selectedBuildingKey === 'office'
    ? depot.officeShop
    : (depot.buildingShop || []).find((b) => b.key === selectedBuildingKey);

  const hint = (() => {
    if (calibrateMode) return 'Calibration yard · click HQ / building / bay · amber diamond = tile lock';
    if (editorMode) return `Map editor · ${mapTool}${mapDirty ? ' · unsaved' : ''}`;
    if (pendingLand) return `Confirm buy · ${pendingLand.cost} coins`;
    if (claimLandMode) return 'Click a FOR SALE sign to buy adjacent land';
    if (placeBay) return 'Click a free owned pad to place a parking bay';
    if (buildMode && placeBuildingKey) return 'Click a free owned pad to place the building';
    if (buildMode) return 'Pick a building or bay below, then click a free pad';
    if (dock === 'bay') return 'Upgrade this parking bay, or click elsewhere';
    if (dock === 'inspect') return 'Upgrade this building, or click another on the map';
    if (dock === 'vehicles') return 'Buy a coach — needs a free parking bay';
    if (dock === 'jobs') return 'Pick a job — coach leaves the yard';
    return 'Click buildings to upgrade · FOR SALE signs for land · Vehicles to buy coaches';
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
          buildMode={buildMode}
          placeBuildingKey={placeBuildingKey}
          placeBay={placeBay}
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
        <div className="pointer-events-none absolute inset-x-0 top-0 p-3 flex items-start justify-between gap-2">
          <div className="pointer-events-auto rounded-xl bg-[#0b1220]/92 border border-white/10 px-3 py-2 backdrop-blur-sm">
            <p className="text-[10px] uppercase tracking-wider text-slate-400">Coach Depot</p>
            <p className="text-sm text-white font-semibold">{depot.officeLabel || depot.ageName}</p>
            <p className="text-[11px] text-slate-400">
              {depot.bays}/{depot.bayCap || depot.bays} bays · {depot.jobsCompleted || 0} jobs
            </p>
          </div>
          <div className="pointer-events-auto flex items-center gap-2">
            <div className="flex rounded-xl overflow-hidden border border-white/10 bg-[#0b1220]/90">
              {Object.keys(VIEW_HEIGHTS).map((key) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setViewSize(key)}
                  className={`px-2.5 py-2 text-[10px] font-semibold uppercase tracking-wide ${
                    viewSize === key ? 'bg-white/15 text-white' : 'text-slate-400 hover:text-slate-200'
                  }`}
                  title={`Viewport: ${key}`}
                >
                  {key === 'comfortable' ? 'S' : key === 'tall' ? 'M' : 'L'}
                </button>
              ))}
            </div>
            <div className="rounded-xl bg-amber-500/95 px-3 py-2 text-sm font-bold text-[#1c1917] border border-amber-200/40 shadow">
              {depot.coinBalance ?? 0}
              <span className="text-[10px] font-semibold ml-1 opacity-80">coins</span>
            </div>
          </div>
        </div>
        ) : null}

        {!editorMode ? (
        <div className="pointer-events-none absolute inset-x-0 top-[4.75rem] flex justify-center px-3">
          <p className="rounded-full bg-black/45 text-[11px] text-slate-100 px-3 py-1 border border-white/10">
            {hint}
          </p>
        </div>
        ) : null}

        {(toast || error) ? (
          <div className="pointer-events-none absolute left-1/2 -translate-x-1/2 top-1/2 -mt-8 z-20">
            <p className={`rounded-xl px-4 py-2 text-sm font-semibold shadow-lg border ${
              error
                ? 'bg-rose-600/95 text-white border-rose-300/30'
                : 'bg-emerald-600/95 text-white border-emerald-200/30'
            }`}
            >
              {error || toast}
            </p>
          </div>
        ) : null}

        {(depot.activeJobs || []).length > 0 && !editorMode ? (
          <div className="absolute bottom-[6.5rem] left-3 right-3 flex flex-wrap gap-1.5 pointer-events-auto z-10">
            {(depot.activeJobs || []).map((job) => {
              const left = remainingMs(job.readyAt);
              const ready = left <= 0;
              return (
                <button
                  key={job.id}
                  type="button"
                  disabled={busy || ready || !sandbox}
                  onClick={() => {
                    if (sandbox && !ready) forceComplete(job.id);
                    else if (!ready) setToast(`Back in ${formatDuration(left)}`);
                  }}
                  className={`rounded-full px-2.5 py-1 text-[11px] font-semibold border ${
                    ready
                      ? 'bg-emerald-500/90 text-white border-emerald-200/40'
                      : 'bg-black/55 text-slate-200 border-white/15'
                  }`}
                >
                  {job.label}
                  {ready ? ' · returning…' : ` · ${formatDuration(left)}`}
                </button>
              );
            })}
          </div>
        ) : null}

        {/* Buy-land popover at the clicked sign */}
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
              <div className="rounded-xl border border-amber-400/40 bg-[#0b1220]/98 shadow-2xl shadow-black/60 px-3 py-2.5 space-y-2 backdrop-blur-md">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-amber-300">For sale</p>
                <p className="text-sm font-bold text-white leading-tight">
                  Plot ({pendingLand.x}, {pendingLand.y})
                </p>
                <p className="text-[11px] text-slate-400">
                  {pendingLand.cost} coins{sandbox ? ' · free in sandbox' : ''}
                </p>
                {depot.plotShop?.lockReason && !sandbox ? (
                  <p className="text-[11px] text-amber-200">{depot.plotShop.lockReason}</p>
                ) : null}
                <div className="flex gap-1.5 pt-0.5">
                  <button
                    type="button"
                    disabled={busy || (depot.plotShop?.locked && !sandbox)}
                    onClick={() => buy({ kind: 'plot', x: pendingLand.x, y: pendingLand.y })}
                    className="flex-1 rounded-lg bg-amber-500 hover:bg-amber-400 text-[#1c1917] text-xs font-bold px-2 py-2 disabled:opacity-40"
                  >
                    Confirm
                  </button>
                  <button
                    type="button"
                    onClick={() => setPendingLand(null)}
                    className="rounded-lg bg-white/10 hover:bg-white/15 text-slate-200 text-xs font-semibold px-2.5 py-2"
                  >
                    Cancel
                  </button>
                </div>
              </div>
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
                      : 'Full catalog yard — click any building or parking bay'}
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
            <div className="pointer-events-auto mx-auto max-w-4xl rounded-2xl border border-white/15 bg-[#0b1220]/96 backdrop-blur-md shadow-2xl shadow-black/50 max-h-[48%] overflow-hidden flex flex-col">
              <div className="flex items-center justify-between px-3 py-2 border-b border-white/10 shrink-0">
                <p className="text-xs font-semibold text-white tracking-wide uppercase">
                  {dock === 'inspect'
                    ? (inspectBuilding?.label || 'Upgrade building')
                    : dock === 'bay'
                      ? 'Parking bay'
                      : (TOOLBAR.find((m) => m.id === dock)?.label || dock)}
                </p>
                <button
                  type="button"
                  className="text-xs text-slate-400 hover:text-white"
                  onClick={() => {
                    setDock(null);
                    setPlaceBuildingKey(null);
                    setSelectedBuildingKey(null);
                    setSelectedBayId(null);
                    setPendingLand(null);
                  }}
                >
                  Close
                </button>
              </div>
              <div className="overflow-y-auto p-3 space-y-2">
                {dock === 'build' ? (
                  <>
                    <p className="text-[11px] text-slate-400">
                      Free pads: {depot.freePlots}. Select something, then click a free owned tile.
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
                            className={`rounded-xl border px-2 py-2 text-left transition disabled:opacity-40 ${
                              selected
                                ? 'border-sky-400 bg-sky-500/20'
                                : 'border-[#1a2540] bg-[#0f172a]/95 hover:border-sky-500/40'
                            }`}
                          >
                            <img
                              src={buildingSprite(b.key, 1)}
                              alt=""
                              className="h-14 w-auto mx-auto mb-1 object-contain"
                            />
                            <p className="text-xs font-semibold text-white truncate">{b.label}</p>
                            <p className="text-[10px] text-slate-400 truncate">
                              {b.cost != null ? `${b.cost} coins` : '—'}
                            </p>
                            {(b.requirements || b.lockReason) ? (
                              <p className="text-[10px] text-rose-400 leading-snug mt-0.5">
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
                        className={`rounded-xl border px-2 py-2 text-left transition disabled:opacity-40 ${
                          placeBay
                            ? 'border-sky-400 bg-sky-500/20'
                            : 'border-[#1a2540] bg-[#0f172a]/95 hover:border-sky-500/40'
                        }`}
                      >
                        <div className="h-14 flex items-center justify-center text-[11px] text-slate-300">Bay pad</div>
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
                      <p className="text-xs text-slate-500">All building types placed — click one on the map to upgrade.</p>
                    ) : null}
                  </>
                ) : null}

                {dock === 'money' ? (
                  <>
                    <p className="text-[11px] text-slate-400">
                      Owned {(depot.grid?.ownedTiles || []).length}/{depot.plotShop?.max || 9} tiles ·
                      Wallet {depot.coinBalance ?? 0}
                    </p>
                    <p className="text-[11px] text-amber-100/80">
                      FOR SALE signs mark adjacent land. First tile 50 coins, then +50 each
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
                          onClick={resetProgress}
                          className="rounded-lg bg-rose-600/90 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50"
                        >
                          Reset progress
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
                          className="rounded-xl bg-[#1e293b]/95 border border-emerald-500/35 px-3 py-2.5 text-left hover:bg-emerald-500/15 disabled:opacity-50"
                        >
                          <p className="text-sm font-bold text-white">{job.label}</p>
                          <p className="text-[11px] text-emerald-100/90 mt-0.5">
                            {formatDuration(job.durationMs)} · +{job.reward}
                          </p>
                          {job.needs ? (
                            <p className="text-[10px] text-slate-400 mt-1">{job.needs}</p>
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

                {dock === 'staff' ? (
                  <>
                    <p className="text-[11px] text-slate-400">
                      Roster {depot.staff?.length || 0}/{depot.staffCap} · train drivers when Training centre unlocks the next grade
                    </p>
                    <div className="space-y-2 mb-3">
                      {(depot.staff || []).map((s) => (
                        <div
                          key={s.id}
                          className="rounded-xl border border-[#1a2540] bg-[#0f172a]/95 px-3 py-2 flex flex-wrap items-center gap-2 justify-between"
                        >
                          <div className="min-w-0">
                            <p className="text-sm font-semibold text-white truncate">{s.name}</p>
                            <p className="text-[11px] text-slate-400">
                              {s.gradeLabel}{s.busy ? ' · out on job' : ' · in yard'}
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
                    </div>
                    <p className="text-[11px] text-slate-500 uppercase tracking-wide">Hire new</p>
                    {(depot.hireShop || []).map((h) => (
                      <ShopRow
                        key={h.grade}
                        title={h.label}
                        sub={`Drives up to tier ${h.maxVehicleTier}`}
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

                {dock === 'vehicles' ? (
                  <>
                    <p className="text-[11px] text-slate-400">
                      Fleet {(depot.fleet || []).length}/{depot.bays || 1}
                      {depot.bayCap ? ` (cap ${depot.bayCap})` : ''} ·
                      {depot.inspectionInfo?.blurb || 'Workshop inspections after jobs.'}
                    </p>
                    <div className="space-y-2 mb-3">
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
                            <p className="text-[10px] text-slate-400">
                              {v.inspecting
                                ? `In workshop · ${formatDuration(v.inspectRemainingMs)} left`
                                : v.onJob
                                  ? 'Out on job'
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
                    <p className="text-[11px] text-slate-500 uppercase tracking-wide">Buy coach</p>
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
                        <button
                          type="button"
                          disabled={busy || inspectBuilding.locked || inspectBuilding.cost == null}
                          onClick={() => buy(
                            selectedBuildingKey === 'office'
                              ? { kind: 'office' }
                              : { kind: 'building', key: selectedBuildingKey },
                          )}
                          className="rounded-xl bg-indigo-500 hover:bg-indigo-400 text-white text-sm font-semibold px-4 py-2 disabled:opacity-40"
                        >
                          Upgrade · {inspectBuilding.cost} coins{sandbox ? ' (free)' : ''}
                        </button>
                      )}
                    </div>
                  </div>
                ) : null}

                {dock === 'bay' && selectedBay ? (
                  <div className="space-y-3">
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
                        <button
                          type="button"
                          disabled={busy || chargerShop.locked || chargerShop.cost == null}
                          onClick={() => buy({
                            kind: 'charger',
                            bayId: selectedBay.id,
                            x: selectedBay.x,
                            y: selectedBay.y,
                          })}
                          className="rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold px-4 py-2 disabled:opacity-40"
                        >
                          Install charger · {chargerShop.cost} coins{sandbox ? ' (free)' : ''}
                        </button>
                      </>
                    ) : (
                      <p className="text-xs text-slate-500">
                        Reach Ops Lv 4 to electrify parking bays.
                      </p>
                    )}
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        ) : null}

        {/* Planet Coaster / C:S icon toolbar */}
        <div className="absolute inset-x-0 bottom-0 z-30">
          <div className="flex justify-center pb-2 pt-1 px-2 bg-gradient-to-t from-black/80 via-black/40 to-transparent">
            <div className="flex items-end gap-1 sm:gap-1.5 rounded-2xl border border-white/15 bg-[#0a0f1a]/95 backdrop-blur-md px-2 py-1.5 shadow-2xl shadow-black/50">
              {TOOLBAR.map((item) => {
                const active = dock === item.id;
                const Icon = item.Icon;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => toggleDock(item.id)}
                    title={item.label}
                    className={`flex flex-col items-center justify-center gap-0.5 min-w-[3.4rem] sm:min-w-[4rem] rounded-xl px-2 py-1.5 border transition ${
                      active
                        ? item.active
                        : `bg-white/5 border-white/10 ${item.color} hover:bg-white/10 hover:text-white`
                    }`}
                  >
                    <Icon className="w-7 h-7" />
                    <span className="text-[9px] sm:text-[10px] font-semibold tracking-wide uppercase">
                      {item.label}
                    </span>
                  </button>
                );
              })}
              {sandbox ? (
                <>
                  <div className="w-px self-stretch bg-white/15 mx-0.5" aria-hidden />
                  <button
                    type="button"
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
                    className={`flex flex-col items-center justify-center gap-0.5 min-w-[3.4rem] sm:min-w-[4rem] rounded-xl px-2 py-1.5 border transition ${
                      calibrateMode
                        ? 'bg-amber-500 text-[#1c1917] border-amber-200/50'
                        : 'bg-white/5 border-white/10 text-amber-300 hover:bg-white/10 hover:text-white'
                    }`}
                  >
                    <IconCalibrate className="w-7 h-7" />
                    <span className="text-[9px] sm:text-[10px] font-semibold tracking-wide uppercase">Lock</span>
                  </button>
                  <button
                    type="button"
                    onClick={loadMapEditor}
                    title="Map editor"
                    className={`flex flex-col items-center justify-center gap-0.5 min-w-[3.4rem] sm:min-w-[4rem] rounded-xl px-2 py-1.5 border transition ${
                      dock === 'map'
                        ? 'bg-teal-500 text-white border-teal-300/50'
                        : 'bg-white/5 border-white/10 text-teal-300 hover:bg-white/10 hover:text-white'
                    }`}
                  >
                    <IconMap className="w-7 h-7" />
                    <span className="text-[9px] sm:text-[10px] font-semibold tracking-wide uppercase">Map</span>
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={resetProgress}
                    title="Reset progress"
                    className="flex flex-col items-center justify-center gap-0.5 min-w-[3.4rem] sm:min-w-[4rem] rounded-xl px-2 py-1.5 border bg-white/5 border-white/10 text-rose-300 hover:bg-rose-500/30 hover:text-white disabled:opacity-40"
                  >
                    <IconReset className="w-7 h-7" />
                    <span className="text-[9px] sm:text-[10px] font-semibold tracking-wide uppercase">Reset</span>
                  </button>
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
    <div className="rounded-xl border border-[#1a2540] bg-[#0f172a]/95 px-3 py-2 flex items-center justify-between gap-2">
      <div className="min-w-0">
        <p className="text-sm font-semibold text-white truncate">{title}</p>
        {sub ? <p className="text-[11px] text-slate-400 truncate">{sub}</p> : null}
        {requirements ? (
          <p className="text-[11px] text-rose-400 font-medium">{formatRequired(requirements)}</p>
        ) : null}
      </div>
      {locked || cost == null ? (
        <span className="text-[11px] text-rose-400/80 shrink-0">Locked</span>
      ) : (
        <button
          type="button"
          disabled={busy || !canBuy}
          onClick={onBuy}
          className="shrink-0 rounded-lg bg-indigo-500 hover:bg-indigo-400 text-white text-xs font-semibold px-2.5 py-1.5 disabled:opacity-40"
          title={sandbox ? `Catalog price ${cost} (sandbox: free)` : undefined}
        >
          {cost}
        </button>
      )}
    </div>
  );
}

export function CoachDepotSandbox() {
  return (
    <div className="space-y-3 w-full">
      <p className="text-sm text-slate-400 px-1">
        Sandbox toolbar: <span className="text-amber-300">Lock</span> calibrates each building on its tile
        (nudge scale/X/Y, Save for everyone), Map paints the starter yard, Reset wipes progress.
      </p>
      <CoachDepotPanel sandbox />
    </div>
  );
}
