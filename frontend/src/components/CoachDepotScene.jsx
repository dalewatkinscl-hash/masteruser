/**
 * Coach Depot — 12×12 isometric yard. Owned starter 3×3 + entrance road.
 * Editor mode uses diamond-accurate screen→tile picking (not AABB hit boxes).
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  TILE_H,
  TILE_W,
  GRID_SIZE,
  GROUND,
  buildingFootY,
  buildingSprite,
  calibrationYardLayout,
  characterScreenLayout,
  decorationScreenLayout,
  groundForAge,
  isoToScreen,
  officeSprite,
  resolveBuildingPlacement,
  screenToTile,
  tileKey,
  vehicleDisplayWidth,
  vehicleFilterStyle,
  vehicleSprite,
} from '../lib/coachDepotAssets';

const FACINGS = ['SE', 'SW', 'NE', 'NW'];
const ROAM_SPEED = 0.55; // tiles per second

function hashId(id) {
  let h = 0;
  const s = String(id || '');
  for (let i = 0; i < s.length; i += 1) h = ((h << 5) - h) + s.charCodeAt(i);
  return Math.abs(h);
}

/** Tiles staff must not cut through (HQ / buildings / solid props). */
function roamBlockedKeys(placements = []) {
  const set = new Set();
  for (const p of placements || []) {
    if (!p || !Number.isFinite(p.x) || !Number.isFinite(p.y)) continue;
    if (p.type === 'hq' || p.type === 'building') {
      set.add(tileKey(p.x, p.y));
      continue;
    }
    // Edge fences share a pad; solid decorations block walking.
    if (p.type === 'decoration' && p.key !== 'fence') {
      set.add(tileKey(p.x, p.y));
    }
  }
  return set;
}

/** Owned pads + roads that aren't blocked by structures. */
function walkableRoamKeys(ownedKeys = [], placements = [], roadTiles = []) {
  const blocked = roamBlockedKeys(placements);
  const keys = new Set();
  for (const k of ownedKeys) {
    if (k && !blocked.has(k)) keys.add(k);
  }
  for (const raw of roadTiles || []) {
    const k = typeof raw === 'string' ? raw : tileKey(raw.x, raw.y);
    if (k && !blocked.has(k)) keys.add(k);
  }
  return [...keys];
}

/** Prefer an adjacent walkable pad so paths never cut through buildings. */
function pickRoamTarget(walkableKeys, fromKey, rnd) {
  if (!walkableKeys.length) return null;
  const walkable = new Set(walkableKeys);
  const [fx, fy] = String(fromKey || '').split(',').map(Number);
  const neighbors = Number.isFinite(fx) && Number.isFinite(fy)
    ? [
      tileKey(fx + 1, fy),
      tileKey(fx - 1, fy),
      tileKey(fx, fy + 1),
      tileKey(fx, fy - 1),
    ].filter((k) => walkable.has(k) && k !== fromKey)
    : [];
  const pool = neighbors.length
    ? neighbors
    : walkableKeys.filter((k) => k !== fromKey);
  if (!pool.length) return null;
  return pool[Math.floor(rnd() * pool.length)] || pool[0];
}

function hqFallback(placements) {
  return placements.find((p) => p.type === 'hq') || { x: 5, y: 6 };
}

function facingToward(fromGx, fromGy, toGx, toGy) {
  const dx = toGx - fromGx;
  const dy = toGy - fromGy;
  if (Math.abs(dx) >= Math.abs(dy)) return dx >= 0 ? 'SE' : 'NW';
  return dy >= 0 ? 'SW' : 'NE';
}

/** Subtle hit target on claimable land — no FOR SALE sign; hover shows amber pad. */
function ClaimPad({
  left,
  top,
  z,
  title,
  hover = false,
  onClick,
}) {
  return (
    <button
      type="button"
      title={title}
      data-interactive="claim-pad"
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => {
        e.stopPropagation();
        e.preventDefault();
        onClick?.(e);
      }}
      className={`absolute border-0 p-0 cursor-pointer pointer-events-auto transition-colors ${
        hover ? 'bg-amber-300/40' : 'bg-transparent hover:bg-amber-300/30'
      }`}
      style={{
        left,
        top,
        zIndex: z,
        width: TILE_W,
        height: TILE_H,
        transform: 'translate(-50%, -50%)',
        clipPath: 'polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%)',
        boxShadow: hover
          ? 'inset 0 0 0 2px rgba(251, 191, 36, 0.9)'
          : 'inset 0 0 0 1px rgba(251, 191, 36, 0.25)',
      }}
    />
  );
}

function Sprite({
  src,
  left,
  top,
  z,
  width,
  className = '',
  style = {},
  title,
  onClick,
  pick,
  ring = false,
}) {
  const common = {
    className: `absolute origin-bottom ${pick ? 'pointer-events-auto cursor-pointer' : 'pointer-events-none'} border-0 bg-transparent p-0 ${className}`,
    style: {
      left,
      top,
      zIndex: z,
      width,
      transform: 'translate(-50%, -100%)',
      ...style,
    },
  };
  const img = (
    <img
      src={src}
      alt=""
      draggable={false}
      className={`block max-w-none select-none pointer-events-none ${ring ? 'drop-shadow-[0_0_12px_rgba(99,102,241,0.95)]' : ''}`}
      style={{ width: '100%', height: 'auto' }}
    />
  );
  if (!pick) return <div {...common} title={title}>{img}</div>;
  return (
    <button
      type="button"
      title={title}
      data-interactive="sprite"
      onPointerDown={(e) => e.stopPropagation()}
      onClick={onClick}
      {...common}
    >
      {img}
    </button>
  );
}

/** Diamond-accurate pad hit target — used while placing/moving so tall ghost sprites don't miss clicks. */
function PlacePad({
  left,
  top,
  z,
  title,
  active = false,
  hover = false,
  onClick,
}) {
  return (
    <button
      type="button"
      title={title}
      data-interactive="place-pad"
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => {
        e.stopPropagation();
        e.preventDefault();
        onClick?.(e);
      }}
      className={`absolute border-0 p-0 cursor-pointer pointer-events-auto transition-colors ${
        hover
          ? 'bg-sky-300/45'
          : active
            ? 'bg-emerald-300/35 hover:bg-emerald-300/55'
            : 'bg-white/10 hover:bg-white/25'
      }`}
      style={{
        left,
        top,
        zIndex: z,
        width: TILE_W,
        height: TILE_H,
        transform: 'translate(-50%, -50%)',
        clipPath: 'polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%)',
        boxShadow: active || hover
          ? 'inset 0 0 0 2px rgba(255,255,255,0.85)'
          : 'inset 0 0 0 1px rgba(255,255,255,0.35)',
      }}
    />
  );
}

export default function CoachDepotScene({
  depot,
  selectedVehicleId = null,
  selectedBuildingKey = null,
  selectedBayId = null,
  buildMode = false,
  placeBuildingKey = null,
  placeBay = false,
  moveBuildingKey = null,
  claimLandMode = false,
  editorMode = false,
  calibrateMode = false,
  calibrateTarget = null,
  spriteAnchors = {},
  mapDraft = null,
  editorTool = 'buildable',
  fx = null,
  onPick = null,
  onEditorPaint = null,
  height = 640,
}) {
  const wrapRef = useRef(null);
  const paintingRef = useRef(false);
  const panningRef = useRef(null);
  const spaceDownRef = useRef(false);
  const lastPaintRef = useRef('');
  const panRef = useRef({ x: 0, y: 0 });
  const zoomRef = useRef(1);
  const roamRef = useRef(new Map());
  /** Left-click candidate while placing — becomes a pan if the pointer moves. */
  const placeClickRef = useRef(null);
  const [now, setNow] = useState(() => Date.now());
  const [roamTick, setRoamTick] = useState(0);
  const [hoverTile, setHoverTile] = useState(null);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 200);
    return () => window.clearInterval(id);
  }, []);

  // Idle staff roam walkable pads (not through HQ / buildings) until dispatched.
  useEffect(() => {
    if (editorMode) return undefined;
    let raf = 0;
    let last = performance.now();
    let acc = 0;
    const step = (t) => {
      const dt = Math.min(0.05, (t - last) / 1000);
      last = t;
      acc += dt;
      const ownedKeys = (depot?.grid?.ownedTiles || depot?.ownedTiles || [])
        .map((tile) => (typeof tile === 'string' ? tile : tileKey(tile.x, tile.y)))
        .filter(Boolean);
      const roadTiles = depot?.grid?.roadTiles || depot?.roadTiles || [];
      const placements = depot?.grid?.placements || depot?.placements || [];
      const walkKeys = walkableRoamKeys(ownedKeys, placements, roadTiles);
      const walkSet = new Set(walkKeys);
      const idle = (depot?.staff || []).filter((s) => !s.busy);
      const map = roamRef.current;
      const live = new Set(idle.map((s) => s.id));
      for (const id of [...map.keys()]) {
        if (!live.has(id)) map.delete(id);
      }
      idle.forEach((s, index) => {
        let st = map.get(s.id);
        if (!st) {
          const seed = hashId(s.id);
          const startKey = walkKeys[seed % Math.max(1, walkKeys.length)]
            || ownedKeys[seed % Math.max(1, ownedKeys.length)]
            || '5,6';
          const [sx, sy] = startKey.split(',').map(Number);
          const jitter = ((seed % 7) - 3) * 0.04;
          st = {
            gx: sx + jitter,
            gy: sy + ((seed % 5) - 2) * 0.04,
            tx: sx,
            ty: sy,
            facing: FACINGS[seed % FACINGS.length],
            pause: (seed % 10) * 0.12 + index * 0.2,
          };
          map.set(s.id, st);
        }
        // If standing on a blocked pad (e.g. after a new build), hop to nearest walkable.
        const hereKey = tileKey(Math.round(st.gx), Math.round(st.gy));
        if (walkKeys.length && !walkSet.has(hereKey) && Math.hypot(st.tx - st.gx, st.ty - st.gy) < 0.04) {
          const rescue = walkKeys[hashId(s.id) % walkKeys.length];
          const [rx, ry] = rescue.split(',').map(Number);
          st.gx = rx;
          st.gy = ry;
          st.tx = rx;
          st.ty = ry;
          st.pause = 0.2;
          return;
        }
        if (st.pause > 0) {
          st.pause -= dt;
          return;
        }
        const dx = st.tx - st.gx;
        const dy = st.ty - st.gy;
        const dist = Math.hypot(dx, dy);
        if (dist < 0.04) {
          st.gx = st.tx;
          st.gy = st.ty;
          const next = pickRoamTarget(
            walkKeys.length ? walkKeys : ownedKeys,
            tileKey(Math.round(st.gx), Math.round(st.gy)),
            Math.random,
          );
          if (next) {
            const [nx, ny] = next.split(',').map(Number);
            // Small jitter only — keeps them on the pad, not through walls.
            st.tx = nx + (Math.random() - 0.5) * 0.2;
            st.ty = ny + (Math.random() - 0.5) * 0.2;
            st.facing = facingToward(st.gx, st.gy, st.tx, st.ty);
            st.pause = 0.4 + Math.random() * 1.8;
          } else {
            st.pause = 1.2 + Math.random();
          }
          return;
        }
        const stepLen = ROAM_SPEED * dt;
        const u = Math.min(1, stepLen / dist);
        st.gx += dx * u;
        st.gy += dy * u;
        st.facing = facingToward(0, 0, dx, dy);
      });
      if (acc >= 1 / 20) {
        acc = 0;
        setRoamTick((n) => (n + 1) % 1_000_000);
      }
      raf = window.requestAnimationFrame(step);
    };
    raf = window.requestAnimationFrame(step);
    return () => window.cancelAnimationFrame(raf);
  }, [
    editorMode,
    depot?.staff,
    depot?.grid?.ownedTiles,
    depot?.ownedTiles,
    depot?.grid?.placements,
    depot?.placements,
    depot?.grid?.roadTiles,
    depot?.roadTiles,
  ]);

  useEffect(() => {
    panRef.current = pan;
  }, [pan]);

  useEffect(() => {
    zoomRef.current = zoom;
  }, [zoom]);

  useEffect(() => {
    if (!editorMode) {
      paintingRef.current = false;
      lastPaintRef.current = '';
      setHoverTile(null);
    }
  }, [editorMode]);

  useEffect(() => {
    const onKeyDown = (e) => {
      if (e.code === 'Space' && !e.repeat) {
        spaceDownRef.current = true;
        e.preventDefault();
      }
    };
    const onKeyUp = (e) => {
      if (e.code === 'Space') spaceDownRef.current = false;
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, []);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return undefined;
    const onWheel = (e) => {
      e.preventDefault();
      if (e.ctrlKey || e.metaKey) {
        const next = Math.min(2.5, Math.max(0.45, zoomRef.current * (e.deltaY < 0 ? 1.08 : 1 / 1.08)));
        zoomRef.current = next;
        setZoom(next);
        return;
      }
      const next = {
        x: panRef.current.x - e.deltaX,
        y: panRef.current.y - e.deltaY,
      };
      panRef.current = next;
      setPan(next);
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  const age = depot?.age || 1;
  const grid = depot?.grid || {};
  const calibYard = useMemo(
    () => (calibrateMode && !editorMode ? calibrationYardLayout(undefined, { cols: 6, gap: 1, originX: 1, originY: 1 }) : null),
    [calibrateMode, editorMode],
  );
  const ownedList = calibYard
    ? calibYard.map((p) => ({ x: p.x, y: p.y }))
    : (editorMode && mapDraft
      ? (mapDraft.starterOwned || [])
      : (grid.ownedTiles || []));
  const roadList = calibYard
    ? []
    : (editorMode && mapDraft
      ? (mapDraft.roadTiles || [])
      : (grid.roadTiles || [
        { x: 5, y: 8 }, { x: 5, y: 9 }, { x: 5, y: 10 }, { x: 5, y: 11 },
      ]));
  const buildableList = calibYard
    ? []
    : (editorMode && mapDraft
      ? (mapDraft.buildable || [])
      : (grid.buildableTiles || []));
  const blockedList = calibYard
    ? []
    : (editorMode && mapDraft
      ? (mapDraft.blocked || [])
      : (grid.blockedTiles || []));
  const placements = calibYard
    ? calibYard.map((p) => ({
      id: p.id,
      type: p.type === 'office' ? 'hq' : p.type,
      key: p.key,
      level: p.level,
      facing: p.facing || null,
      x: p.x,
      y: p.y,
      src: p.src,
      file: p.file,
      label: p.label,
      calib: true,
    }))
    : (editorMode && mapDraft
      ? (mapDraft.starterPlacements || [])
      : (grid.placements || []));
  const claimable = calibYard ? [] : (grid.claimable || []);
  const fleet = editorMode || calibYard ? [] : (depot?.fleet || []);
  const staff = editorMode || calibYard ? [] : (depot?.staff || []);
  const jobs = editorMode || calibYard ? [] : (depot?.activeJobs || []);
  const ownedGround = calibYard ? GROUND.concrete : groundForAge(age);

  const owned = useMemo(
    () => new Set(ownedList.map((t) => (typeof t === 'string' ? t : tileKey(t.x, t.y)))),
    [ownedList],
  );
  const roads = useMemo(
    () => new Set(roadList.map((t) => (typeof t === 'string' ? t : tileKey(t.x, t.y)))),
    [roadList],
  );
  const buildable = useMemo(
    () => new Set(buildableList.map((t) => (typeof t === 'string' ? t : tileKey(t.x, t.y)))),
    [buildableList],
  );
  const blocked = useMemo(
    () => new Set(blockedList.map((t) => (typeof t === 'string' ? t : tileKey(t.x, t.y)))),
    [blockedList],
  );
  const claimSet = useMemo(
    () => new Set(claimable.map((t) => tileKey(t.x, t.y))),
    [claimable],
  );

  const bayPlacements = placements.filter((p) => p.type === 'bay');

  const tiles = useMemo(() => {
    const list = [];
    for (let gy = 0; gy < GRID_SIZE; gy += 1) {
      for (let gx = 0; gx < GRID_SIZE; gx += 1) {
        const key = tileKey(gx, gy);
        const { x, y } = isoToScreen(gx, gy);
        let src = GROUND.dirtPatch;
        let opacity = 0.28;
        let tint = null;
        if (roads.has(key)) {
          src = gy >= 10 ? GROUND.roadEndSE : GROUND.roadSE;
          opacity = 1;
        } else if (blocked.has(key)) {
          src = GROUND.dirt;
          opacity = 0.45;
          tint = 'blocked';
        } else if (owned.has(key)) {
          src = ownedGround;
          opacity = 1;
          tint = editorMode ? 'owned' : null;
        } else if (buildable.has(key) || (!buildable.size && !blocked.has(key))) {
          src = GROUND.grass;
          opacity = editorMode ? 0.75 : 0.4;
          tint = editorMode ? 'buildable' : null;
        }
        list.push({ key, gx, gy, x, y, src, opacity, tint, z: gx + gy });
      }
    }
    return list;
  }, [owned, roads, blocked, buildable, ownedGround, editorMode]);

  const origin = useMemo(() => isoToScreen((GRID_SIZE - 1) / 2, (GRID_SIZE - 1) / 2), []);

  const worldW = TILE_W * GRID_SIZE * 0.55 + 160;
  const worldH = TILE_H * GRID_SIZE * 0.55 + 280;
  const baseScale = Math.min(1, (height - 40) / (worldH * 0.55));
  const viewScale = baseScale * zoom;
  const worldTx = worldW / 2 - origin.x;
  const worldTy = worldH * 0.22 - origin.y;

  /** Map a pointer event to a grid tile using diamond-accurate iso maths. */
  const pointerToTile = (clientX, clientY) => {
    const wrap = wrapRef.current;
    if (!wrap) return null;
    const rect = wrap.getBoundingClientRect();
    const localX = clientX - rect.left;
    const localY = clientY - rect.top;
    const centerX = rect.width / 2;
    const centerY = rect.height * 0.48;
    const panNow = panRef.current;
    const scaleNow = baseScale * zoomRef.current;
    // Undo pan (screen px) then scale (origin = world centre)
    const inWorldX = worldW / 2 + (localX - centerX - panNow.x) / scaleNow;
    const inWorldY = worldH / 2 + (localY - centerY - panNow.y) / scaleNow;
    // Undo inner translate to iso space (tile centres)
    const isoX = inWorldX - worldTx;
    const isoY = inWorldY - worldTy;
    const tile = screenToTile(isoX, isoY);
    if (tile.x < 0 || tile.y < 0 || tile.x >= GRID_SIZE || tile.y >= GRID_SIZE) return null;
    return tile;
  };

  const shouldPanGesture = (e) => (
    e.button === 1
    || e.button === 2
    || spaceDownRef.current
    || e.altKey
  );

  const resetView = () => {
    panRef.current = { x: 0, y: 0 };
    zoomRef.current = 1;
    setPan({ x: 0, y: 0 });
    setZoom(1);
  };

  const paintAt = (clientX, clientY, force = false) => {
    if (!editorMode || !onEditorPaint) return;
    const tile = pointerToTile(clientX, clientY);
    if (!tile) return;
    const key = tileKey(tile.x, tile.y);
    if (!force && lastPaintRef.current === key) return;
    lastPaintRef.current = key;
    onEditorPaint(tile.x, tile.y, editorTool);
  };

  const handlePick = (pick) => {
    if (onPick && pick) onPick(pick);
  };

  const moving = Boolean(moveBuildingKey);
  const placingActive = Boolean((buildMode && placeBuildingKey) || placeBay || moving);
  const freeTileKeys = new Set((grid.freeTiles || []).map((t) => tileKey(t.x, t.y)));

  const tryPlaceAtPointer = (clientX, clientY) => {
    if (!placingActive || editorMode) return false;
    const tile = pointerToTile(clientX, clientY);
    if (!tile || !freeTileKeys.has(tileKey(tile.x, tile.y))) return false;
    const moveOffice = moveBuildingKey === 'office';
    const ghostKey = placeBuildingKey || (moving && !moveOffice ? moveBuildingKey : null);
    handlePick({
      type: 'empty',
      x: tile.x,
      y: tile.y,
      placeKey: ghostKey || (placeBay ? 'bay' : null),
      moveKey: moveBuildingKey || null,
      clientX,
      clientY,
    });
    return true;
  };

  /** Tap an unowned tile → buy popup (if adjacent) or a short hint. */
  const tryClaimAtPointer = (clientX, clientY) => {
    if (placingActive || editorMode) return false;
    const tile = pointerToTile(clientX, clientY);
    if (!tile) return false;
    const key = tileKey(tile.x, tile.y);
    if (roads.has(key) || blocked.has(key)) return false;
    if (owned.has(key)) {
      handlePick({
        type: 'owned',
        x: tile.x,
        y: tile.y,
        occupied: !freeTileKeys.has(key),
        clientX,
        clientY,
      });
      return true;
    }
    if (claimSet.has(key)) {
      const spot = claimable.find((t) => t.x === tile.x && t.y === tile.y);
      const cost = spot?.cost ?? depot?.plotShop?.cost ?? 50;
      handlePick({
        type: 'claim',
        x: tile.x,
        y: tile.y,
        cost,
        clientX,
        clientY,
      });
      return true;
    }
    if (buildable.has(key)) {
      handlePick({
        type: 'unowned',
        x: tile.x,
        y: tile.y,
        clientX,
        clientY,
      });
      return true;
    }
    return false;
  };

  const entities = [];

  // Invisible claim pads on adjacent unowned land (popup on click — no FOR SALE signs)
  if (!editorMode && !placingActive) {
    claimable.forEach((t) => {
      const { x, y } = isoToScreen(t.x, t.y);
      const cost = t.cost ?? depot?.plotShop?.cost ?? 50;
      entities.push({
        key: `claim-pad-${t.x}-${t.y}`,
        claimPad: true,
        left: x,
        top: y,
        z: 220 + t.x + t.y,
        pick: { type: 'claim', x: t.x, y: t.y, cost },
        title: `Buy land · ${cost} coins`,
      });
    });
  }

  // Owned pads — click opens build / decorate menu (free or occupied).
  // Skip in Lock mode so short sprites (drivers) stay clickable above the diamond.
  const freeTiles = calibYard ? [] : (grid.freeTiles || []);
  if (!editorMode && !placingActive && !calibrateMode) {
    ownedList.forEach((raw) => {
      const t = typeof raw === 'string'
        ? (() => {
          const [xs, ys] = raw.split(',');
          return { x: Number(xs), y: Number(ys) };
        })()
        : raw;
      if (!t || !Number.isFinite(t.x) || !Number.isFinite(t.y)) return;
      const key = tileKey(t.x, t.y);
      if (roads.has(key)) return;
      const { x, y } = isoToScreen(t.x, t.y);
      const isFree = freeTileKeys.has(key);
      entities.push({
        key: `owned-pad-${t.x}-${t.y}`,
        claimPad: true,
        left: x,
        top: y,
        z: 210 + t.x + t.y,
        pick: { type: 'owned', x: t.x, y: t.y, occupied: !isFree },
        title: isFree ? 'Build here' : 'Decorate edges',
      });
    });
  }
  freeTiles.forEach((t) => {
    if (!placingActive && !buildMode) return;
    const { x, y } = isoToScreen(t.x, t.y);
    const moveOffice = moveBuildingKey === 'office';
    const ghostKey = placeBuildingKey || (moving && !moveOffice ? moveBuildingKey : null);
    const ghostSrc = moveOffice
      ? officeSprite(depot?.officeLevel || 1)
      : (ghostKey
        ? buildingSprite(ghostKey, 1)
        : (placeBay ? GROUND.concrete : GROUND.dirtPatch));
    const layout = (ghostKey || moveOffice)
      ? resolveBuildingPlacement(x, y, ghostSrc, spriteAnchors)
      : { left: x, top: buildingFootY(y), width: TILE_W };
    const title = moving
      ? 'Move here · 25 coins'
      : (ghostKey
        ? `Place ${ghostKey}`
        : (placeBay ? 'Place parking bay' : 'Empty pad'));
    const emptyPick = placingActive
      ? {
        type: 'empty',
        x: t.x,
        y: t.y,
        placeKey: ghostKey || (placeBay ? 'bay' : null),
        moveKey: moveBuildingKey || null,
      }
      : null;
    // Ghost sprite is visual only — hit testing uses the tile diamond (PlacePad).
    entities.push({
      key: `free-ghost-${t.x}-${t.y}`,
      src: ghostSrc,
      left: layout.left,
      top: layout.top,
      z: 8 + t.x + t.y,
      width: layout.width,
      pick: null,
      title,
      className: placingActive
        ? 'opacity-55 animate-pulse'
        : 'opacity-40',
    });
    if (placingActive) {
      entities.push({
        key: `free-pad-${t.x}-${t.y}`,
        placePad: true,
        left: x,
        top: y,
        z: 260 + t.x + t.y,
        pick: emptyPick,
        title,
        padActive: true,
      });
    }
  });

  // Placed structures — layout from sprite anchors (calibrator)
  placements.forEach((p) => {
    const { x, y } = isoToScreen(p.x, p.y);
    if (p.type === 'hq') {
      const src = p.src || officeSprite(p.level || depot?.officeLevel || 1);
      const layout = resolveBuildingPlacement(x, y, src, spriteAnchors);
      entities.push({
        key: p.id || 'hq',
        src,
        left: layout.left,
        top: layout.top,
        z: 40 + p.x + p.y,
        width: layout.width,
        // Don't let tall HQ sprites steal free-pad clicks while placing.
        pick: placingActive && !calibrateMode
          ? null
          : {
            type: 'office',
            key: 'office',
            x: p.x,
            y: p.y,
            sprite: layout.file,
            label: p.label,
            level: p.level,
          },
        title: calibrateMode ? `Calibrate ${p.label || layout.file}` : 'HQ — click to upgrade',
        ring: selectedBuildingKey === 'office' || (calibrateTarget?.file === layout.file),
      });
    } else if (p.type === 'bay') {
      const src = p.src || GROUND.concrete;
      const layout = resolveBuildingPlacement(x, y, src, spriteAnchors);
      const charged = Boolean(p.charged) || Math.floor(Number(p.level) || 1) >= 2;
      const baySlot = bayPlacements.findIndex((b) => b.id === p.id);
      const bayVehicle = baySlot >= 0 ? fleet[baySlot] : null;
      const bayReg = bayVehicle?.reg || null;
      entities.push({
        key: p.id || `bay-${p.x}-${p.y}`,
        src,
        left: layout.left,
        top: layout.top,
        z: 10 + p.x + p.y,
        width: layout.width,
        pick: placingActive && !calibrateMode
          ? null
          : {
            type: 'bay',
            x: p.x,
            y: p.y,
            id: p.id,
            sprite: layout.file,
            label: p.label || 'Parking bay',
            slot: baySlot,
            vehicleId: bayVehicle?.id || null,
          },
        title: calibrateMode
          ? `Calibrate ${p.label || layout.file}`
          : (bayReg
            ? `Bay · ${bayReg}${charged ? ' · charger' : ''}`
            : (charged ? 'Parking bay · charger' : 'Parking bay — empty')),
        ring: selectedBayId === p.id || (calibrateTarget?.file === layout.file),
        className: charged && !calibrateMode ? 'drop-shadow-[0_0_10px_rgba(52,211,153,0.85)]' : '',
      });
    } else if (p.type === 'building') {
      const src = p.src || buildingSprite(p.key, p.level || 1);
      const layout = resolveBuildingPlacement(x, y, src, spriteAnchors);
      entities.push({
        key: p.id || `${p.key}-${p.x}-${p.y}`,
        src,
        left: layout.left,
        top: layout.top,
        z: 30 + p.x + p.y,
        width: layout.width,
        pick: placingActive && !calibrateMode
          ? null
          : {
            type: 'building',
            key: p.key,
            x: p.x,
            y: p.y,
            sprite: layout.file,
            label: p.label,
            level: p.level,
          },
        title: calibrateMode ? `Calibrate ${p.label || layout.file}` : `${p.key} — click to upgrade`,
        ring: selectedBuildingKey === p.key || (calibrateTarget?.file === layout.file),
        className: buildMode ? 'opacity-70' : '',
      });
    } else if (p.type === 'road') {
      if (!placingActive && !calibrateMode) {
        entities.push({
          key: p.id || `road-${p.x}-${p.y}`,
          claimPad: true,
          left: x,
          top: y,
          z: 216 + p.x + p.y,
          pick: { type: 'road', id: p.id, x: p.x, y: p.y },
          title: 'Road — click to sell',
        });
      }
    } else if (p.type === 'decoration') {
      const layout = decorationScreenLayout(p.key, p.facing || 'SE', x, y, spriteAnchors);
      entities.push({
        key: p.id || `decor-${p.key}-${p.facing || 'SE'}-${p.x}-${p.y}`,
        src: layout.src,
        left: layout.left,
        top: layout.top,
        // Above owned-pad hit targets so decorations stay clickable.
        z: 240 + p.x + p.y,
        width: layout.width,
        pick: placingActive
          ? null
          : (calibrateMode
            ? {
              type: 'decoration',
              key: p.key,
              facing: p.facing || 'SE',
              x: p.x,
              y: p.y,
              sprite: layout.file,
              label: p.label || p.key,
            }
            : {
              type: 'decoration',
              id: p.id,
              key: p.key,
              facing: p.facing || 'SE',
              x: p.x,
              y: p.y,
            }),
        title: calibrateMode
          ? `Calibrate ${p.label || layout.file}`
          : (p.key === 'fence'
            ? `Fence · ${(p.facing || 'SE')} edge — click to edit`
            : 'Decoration — click to edit'),
        ring: calibrateTarget?.file === layout.file,
        className: 'opacity-95',
        style: layout.flipX ? { transform: 'translate(-50%, -100%) scaleX(-1)' } : undefined,
      });
    } else if (p.type === 'character') {
      const layout = characterScreenLayout(p.facing || 'SE', x, y, spriteAnchors);
      entities.push({
        key: p.id || `char-${p.facing || 'SE'}-${p.x}-${p.y}`,
        src: layout.src,
        left: layout.left,
        top: layout.top,
        // Above ground/labels so Lock clicks hit the driver, not the pad under him.
        z: 250 + p.x + p.y,
        width: Math.max(layout.width, 36),
        pick: {
          type: 'character',
          key: 'character',
          facing: p.facing || 'SE',
          x: p.x,
          y: p.y,
          sprite: layout.file,
          label: p.label || `Driver ${p.facing || 'SE'}`,
        },
        title: `Calibrate ${p.label || layout.file}`,
        ring: calibrateTarget?.file === layout.file,
      });
    }
  });

  // Tiny labels under each calib pad
  if (calibYard) {
    calibYard.forEach((p) => {
      const { x, y } = isoToScreen(p.x, p.y);
      entities.push({
        key: `calib-label-${p.id}`,
        saleSign: false,
        labelChip: true,
        labelText: p.label,
        left: x,
        top: y + TILE_H * 0.55,
        z: 90 + p.x + p.y,
        width: TILE_W * 0.95,
        pick: null,
      });
    });
  }

  // Idle staff roam the yard (busy drivers are out on jobs)
  void roamTick;
  const idleStaff = staff.filter((s) => !s.busy);
  idleStaff.forEach((s) => {
    const st = roamRef.current.get(s.id);
    const gx = st?.gx ?? hqFallback(placements).x;
    const gy = st?.gy ?? hqFallback(placements).y + 0.35;
    const facing = st?.facing || 'SE';
    const { x, y } = isoToScreen(gx, gy);
    const layout = characterScreenLayout(facing, x, y, spriteAnchors);
    entities.push({
      key: `staff-${s.id}`,
      src: layout.src,
      left: layout.left,
      top: layout.top,
      z: (calibrateMode ? 250 : 55) + Math.round(gx + gy),
      width: calibrateMode ? Math.max(layout.width, 36) : layout.width,
      pick: placingActive
        ? null
        : (calibrateMode
          ? {
            type: 'character',
            key: 'character',
            facing,
            sprite: layout.file,
            label: `${s.name || 'Driver'} ${facing}`,
            x: Math.round(gx),
            y: Math.round(gy),
          }
          : { type: 'staff', staffId: s.id }),
      title: calibrateMode
        ? `Calibrate driver ${facing}`
        : `${s.name || 'Driver'} — roster`,
      ring: calibrateTarget?.file === layout.file,
    });
  });

  // Decorative light at entrance (uses same light-pole anchor as placeable decoration)
  if (!calibYard) {
    const { x, y } = isoToScreen(6, 10);
    const layout = decorationScreenLayout('light', 'SE', x, y, spriteAnchors);
    entities.push({
      key: 'lamp',
      src: layout.src,
      left: layout.left,
      top: layout.top,
      z: 25,
      width: layout.width,
      pick: null,
    });
  }

  // Fleet on bay tiles
  fleet.forEach((vehicle, index) => {
    const bay = bayPlacements[index] || bayPlacements[0];
    if (!bay) return;
    const screen = isoToScreen(bay.x, bay.y);
    const job = jobs.find((j) => j.vehicleId === vehicle.id || j.driverSlot === index);
    const thisFx = fx && fx.slot === index ? fx : null;
    const selected = selectedVehicleId === vehicle.id;

    let left = screen.x;
    let top = screen.y + 2;
    let opacity = 1;
    let facing = 'SE';

    if (thisFx?.type === 'depart') {
      const t = Math.min(1, (now - thisFx.startedAt) / 1400);
      left += t * 70;
      top += t * 90;
      opacity = 1 - t * 0.85;
    } else if (thisFx?.type === 'return') {
      const t = Math.min(1, (now - thisFx.startedAt) / 1400);
      left += (1 - t) * 70;
      top += (1 - t) * 90;
      opacity = 0.2 + t * 0.8;
      facing = 'NW';
    } else if (job) {
      // On the road (or waiting auto-settle) — hide until return FX
      opacity = 0;
    } else if (vehicle.inspecting) {
      opacity = 0.55;
      facing = 'SW';
    }

    entities.push({
      key: `veh-${vehicle.id}`,
      src: vehicleSprite(vehicle.tier || 1, facing),
      left,
      top: selected ? top - 4 : top,
      z: 70 + bay.x + bay.y,
      width: vehicleDisplayWidth(vehicle.tier || 1),
      pick: placingActive ? null : { type: 'vehicle', slot: index, vehicleId: vehicle.id },
      title: vehicle.inspecting
        ? `${vehicle.reg || 'Coach'} · workshop`
        : (vehicle.reg || vehicle.tierLabel || vehicle.label || 'Coach'),
      className: [
        opacity <= 0 ? 'invisible' : '',
        selected ? 'brightness-110' : '',
        vehicle.inspecting ? 'brightness-75 saturate-50' : '',
      ].join(' '),
      style: { opacity, ...vehicleFilterStyle(vehicle.tier || 1) },
    });
  });

  const hoverScreen = hoverTile ? isoToScreen(hoverTile.x, hoverTile.y) : null;
  const panning = Boolean(panningRef.current);

  return (
    <div
      ref={wrapRef}
      className={`relative w-full overflow-hidden select-none ${
        editorMode
          ? (panning || spaceDownRef.current ? 'cursor-grabbing' : 'cursor-crosshair')
          : placingActive
            ? (panning ? 'cursor-grabbing' : 'cursor-pointer')
            : 'cursor-grab'
      }`}
      style={{
        height,
        backgroundImage: `
          radial-gradient(ellipse at 30% 15%, rgba(255,255,255,0.16), transparent 45%),
          linear-gradient(180deg, #7ea0bc 0%, #5f7f6a 55%, #3f5a45 100%)
        `,
        touchAction: 'none',
      }}
      onContextMenu={(e) => e.preventDefault()}
      onPointerDown={(e) => {
        // Don't steal clicks from sale signs / buildings / other UI inside the scene
        if (e.target.closest?.('[data-interactive], button')) {
          return;
        }
        // Explicit pan gestures always win.
        if (shouldPanGesture(e)) {
          e.preventDefault();
          paintingRef.current = false;
          placeClickRef.current = null;
          panningRef.current = {
            pointerId: e.pointerId,
            lastX: e.clientX,
            lastY: e.clientY,
          };
          try {
            e.currentTarget.setPointerCapture?.(e.pointerId);
          } catch {
            /* ignore */
          }
          return;
        }
        // Left-click may be a pad/land pick (or become a pan if dragged).
        if (!editorMode && e.button === 0) {
          e.preventDefault();
          paintingRef.current = false;
          placeClickRef.current = {
            pointerId: e.pointerId,
            x: e.clientX,
            y: e.clientY,
            kind: placingActive ? 'place' : 'world',
          };
          try {
            e.currentTarget.setPointerCapture?.(e.pointerId);
          } catch {
            /* ignore */
          }
          return;
        }
        if (!editorMode) return;
        if (e.button !== 0) return;
        e.preventDefault();
        paintingRef.current = true;
        lastPaintRef.current = '';
        try {
          e.currentTarget.setPointerCapture?.(e.pointerId);
        } catch {
          /* ignore */
        }
        paintAt(e.clientX, e.clientY, true);
      }}
      onPointerMove={(e) => {
        if (placeClickRef.current && placeClickRef.current.pointerId === e.pointerId) {
          const dx = e.clientX - placeClickRef.current.x;
          const dy = e.clientY - placeClickRef.current.y;
          if ((dx * dx) + (dy * dy) > 64) {
            panningRef.current = {
              pointerId: e.pointerId,
              lastX: e.clientX,
              lastY: e.clientY,
            };
            placeClickRef.current = null;
          }
        }
        if (panningRef.current && panningRef.current.pointerId === e.pointerId) {
          const dx = e.clientX - panningRef.current.lastX;
          const dy = e.clientY - panningRef.current.lastY;
          panningRef.current.lastX = e.clientX;
          panningRef.current.lastY = e.clientY;
          const next = {
            x: panRef.current.x + dx,
            y: panRef.current.y + dy,
          };
          panRef.current = next;
          setPan(next);
          return;
        }
        if (editorMode || placingActive || !panningRef.current) {
          const tile = pointerToTile(e.clientX, e.clientY);
          setHoverTile(tile);
        }
        if (!editorMode) return;
        if (paintingRef.current) paintAt(e.clientX, e.clientY);
      }}
      onPointerUp={(e) => {
        if (placeClickRef.current?.pointerId === e.pointerId) {
          const click = placeClickRef.current;
          placeClickRef.current = null;
          if (click.kind === 'place') tryPlaceAtPointer(click.x, click.y);
          else tryClaimAtPointer(click.x, click.y);
        }
        if (panningRef.current?.pointerId === e.pointerId) panningRef.current = null;
        paintingRef.current = false;
        lastPaintRef.current = '';
      }}
      onPointerCancel={() => {
        panningRef.current = null;
        placeClickRef.current = null;
        paintingRef.current = false;
        lastPaintRef.current = '';
      }}
      onPointerLeave={() => {
        if (!paintingRef.current && !panningRef.current && !placeClickRef.current) setHoverTile(null);
      }}
    >
      <div
        className="absolute left-1/2 top-[48%] pointer-events-none"
        style={{
          width: worldW,
          height: worldH,
          marginLeft: -worldW / 2,
          marginTop: -worldH / 2,
          transform: `translate(${pan.x}px, ${pan.y}px) scale(${viewScale})`,
          transformOrigin: 'center center',
        }}
      >
        <div
          className="absolute inset-0"
          style={{
            transform: `translate(${worldTx}px, ${worldTy}px)`,
          }}
        >
          {tiles.map((t) => (
            <div
              key={t.key}
              className="absolute border-0 bg-transparent p-0 pointer-events-none"
              style={{
                left: t.x,
                top: t.y,
                width: TILE_W,
                height: TILE_H,
                zIndex: t.z,
                transform: 'translate(-50%, -50%)',
                opacity: t.opacity,
                filter: t.tint === 'owned'
                  ? 'brightness(1.15) saturate(1.2)'
                  : t.tint === 'buildable'
                    ? 'hue-rotate(70deg) brightness(1.05)'
                    : t.tint === 'blocked'
                      ? 'grayscale(0.8) brightness(0.7)'
                      : undefined,
              }}
            >
              <img
                src={t.src}
                alt=""
                draggable={false}
                className="block w-full h-full select-none pointer-events-none"
              />
            </div>
          ))}

          {(editorMode || placingActive) && hoverScreen ? (
            <div
              className={`absolute pointer-events-none border-2 ${
                placingActive
                  && hoverTile
                  && freeTileKeys.has(tileKey(hoverTile.x, hoverTile.y))
                  ? 'border-emerald-200 bg-emerald-300/35'
                  : 'border-white/90 bg-white/20'
              }`}
              style={{
                left: hoverScreen.x,
                top: hoverScreen.y,
                width: TILE_W,
                height: TILE_H,
                zIndex: 270,
                transform: 'translate(-50%, -50%) rotate(0deg)',
                clipPath: 'polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%)',
              }}
            />
          ) : null}

          {!editorMode && calibrateMode && calibrateTarget
            && Number.isFinite(calibrateTarget.x) && Number.isFinite(calibrateTarget.y) ? (
            (() => {
              const spot = isoToScreen(calibrateTarget.x, calibrateTarget.y);
              return (
                <div
                  className="absolute pointer-events-none border-2 border-amber-300 bg-amber-300/25"
                  style={{
                    left: spot.x,
                    top: spot.y,
                    width: TILE_W,
                    height: TILE_H,
                    zIndex: 200,
                    transform: 'translate(-50%, -50%)',
                    clipPath: 'polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%)',
                  }}
                  title="Tile lock diamond"
                />
              );
            })()
          ) : null}

          {!editorMode ? entities.map((e) => (
            e.claimPad ? (
              e.pick ? (
                <ClaimPad
                  key={e.key}
                  left={e.left}
                  top={e.top}
                  z={e.z}
                  title={e.title}
                  hover={Boolean(
                    hoverTile
                    && e.pick
                    && hoverTile.x === e.pick.x
                    && hoverTile.y === e.pick.y,
                  )}
                  onClick={(ev) => handlePick({ ...e.pick, clientX: ev.clientX, clientY: ev.clientY })}
                />
              ) : null
            ) : e.placePad ? (
              <PlacePad
                key={e.key}
                left={e.left}
                top={e.top}
                z={e.z}
                title={e.title}
                active={e.padActive}
                hover={Boolean(
                  hoverTile
                  && e.pick
                  && hoverTile.x === e.pick.x
                  && hoverTile.y === e.pick.y,
                )}
                onClick={(ev) => handlePick({
                  ...e.pick,
                  clientX: ev.clientX,
                  clientY: ev.clientY,
                })}
              />
            ) : e.labelChip ? (
              <div
                key={e.key}
                className="absolute pointer-events-none text-center"
                style={{
                  left: e.left,
                  top: e.top,
                  zIndex: e.z,
                  width: e.width,
                  transform: 'translate(-50%, 0)',
                }}
              >
                <span className="inline-block rounded bg-black/70 px-1.5 py-0.5 text-[9px] font-semibold text-amber-100/95 leading-tight">
                  {e.labelText}
                </span>
              </div>
            ) : (
              <Sprite
                key={e.key}
                src={e.src}
                left={e.left}
                top={e.top}
                z={e.z}
                width={e.width}
                className={e.className}
                style={e.style}
                title={e.title}
                pick={e.pick}
                ring={e.ring}
                onClick={e.pick ? (ev) => handlePick({
                  ...e.pick,
                  clientX: ev.clientX,
                  clientY: ev.clientY,
                }) : undefined}
              />
            )
          )) : placements.map((p) => {
            const { x, y } = isoToScreen(p.x, p.y);
            if (p.type === 'bay') {
              return (
                <Sprite
                  key={`ed-${p.id || p.type}`}
                  src={GROUND.concrete}
                  left={x}
                  top={buildingFootY(y)}
                  z={40 + p.x + p.y}
                  width={TILE_W}
                  pick={null}
                  title={p.type}
                />
              );
            }
            const src = p.type === 'hq' ? officeSprite(0) : buildingSprite(p.key, 1);
            const layout = resolveBuildingPlacement(x, y, src, spriteAnchors);
            return (
              <Sprite
                key={`ed-${p.id || p.type}`}
                src={src}
                left={layout.left}
                top={layout.top}
                z={40 + p.x + p.y}
                width={layout.width}
                pick={null}
                title={p.type}
              />
            );
          })}
        </div>
      </div>

      <div className="pointer-events-none absolute left-3 bottom-3 flex flex-wrap gap-1.5">
        <div className="gui-pill">
          {editorMode
            ? (hoverTile
              ? `Tile ${hoverTile.x},${hoverTile.y} · ${editorTool}`
              : 'Paint · scroll/drag to pan · Ctrl+scroll zoom')
            : 'Scroll or drag (right / Space) to pan · Ctrl+scroll zoom'}
        </div>
        {(pan.x !== 0 || pan.y !== 0 || zoom !== 1) ? (
          <button
            type="button"
            className="pointer-events-auto gui-btn gui-btn--sm gui-btn--grey gui-btn--line"
            onClick={resetView}
          >
            Reset view
          </button>
        ) : null}
      </div>
    </div>
  );
}
