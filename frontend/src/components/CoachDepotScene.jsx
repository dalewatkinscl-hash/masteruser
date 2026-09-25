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
  PROP,
  buildingFootY,
  buildingSprite,
  calibrationYardLayout,
  characterSprite,
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

function pickRoamTarget(ownedKeys, fromKey, rnd) {
  if (!ownedKeys.length) return null;
  const others = ownedKeys.filter((k) => k !== fromKey);
  const pool = others.length ? others : ownedKeys;
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

function SaleSign({
  left,
  top,
  z,
  width,
  cost,
  title,
  onClick,
  className = '',
}) {
  return (
    <button
      type="button"
      title={title}
      data-interactive="sale"
      onPointerDown={(e) => {
        e.stopPropagation();
      }}
      onClick={(e) => {
        e.stopPropagation();
        e.preventDefault();
        onClick?.(e);
      }}
      className={`absolute origin-bottom pointer-events-auto cursor-pointer border-0 bg-transparent p-0 ${className}`}
      style={{
        left,
        top,
        zIndex: z,
        width,
        transform: 'translate(-50%, -100%)',
      }}
    >
      <span className="flex flex-col items-center gap-0 drop-shadow-[0_2px_4px_rgba(0,0,0,0.55)]">
        <span className="rounded-sm border-2 border-[#7a3e0c] bg-gradient-to-b from-amber-300 to-amber-500 px-1.5 py-0.5 text-center leading-tight shadow">
          <span className="block text-[8px] font-black tracking-wide text-[#5c2d0a]">FOR SALE</span>
          <span className="block text-[10px] font-bold text-[#1c1917]">{cost}</span>
        </span>
        <span className="h-3 w-1 rounded-b bg-[#6b3f1a]" aria-hidden />
      </span>
    </button>
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

export default function CoachDepotScene({
  depot,
  selectedVehicleId = null,
  selectedBuildingKey = null,
  selectedBayId = null,
  buildMode = false,
  placeBuildingKey = null,
  placeBay = false,
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
  const [now, setNow] = useState(() => Date.now());
  const [roamTick, setRoamTick] = useState(0);
  const [hoverTile, setHoverTile] = useState(null);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 200);
    return () => window.clearInterval(id);
  }, []);

  // Idle staff roam owned pads until dispatched on a job.
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
          const startKey = ownedKeys[seed % Math.max(1, ownedKeys.length)] || '5,6';
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
            ownedKeys,
            tileKey(Math.round(st.gx), Math.round(st.gy)),
            Math.random,
          );
          if (next) {
            const [nx, ny] = next.split(',').map(Number);
            st.tx = nx + (Math.random() - 0.5) * 0.35;
            st.ty = ny + (Math.random() - 0.5) * 0.35;
            st.facing = facingToward(st.gx, st.gy, st.tx, st.ty);
            st.pause = 0.4 + Math.random() * 1.8;
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
  }, [editorMode, depot?.staff, depot?.grid?.ownedTiles, depot?.ownedTiles]);

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

  const entities = [];

  // For-sale signs on claimable adjacent land (not in map editor)
  if (!editorMode) {
    claimable.forEach((t) => {
      const { x, y } = isoToScreen(t.x, t.y);
      const cost = t.cost ?? depot?.plotShop?.cost ?? 50;
      entities.push({
        key: `sale-${t.x}-${t.y}`,
        src: null,
        saleSign: true,
        cost,
        left: x,
        top: y + 4,
        z: 220 + t.x + t.y,
        width: TILE_W * 0.55,
        pick: { type: 'claim', x: t.x, y: t.y, cost },
        title: `For sale · ${cost} coins`,
        className: claimLandMode ? 'brightness-110' : '',
      });
    });
  }

  // Free owned pads for placing buildings / bays
  const freeTiles = calibYard ? [] : (grid.freeTiles || []);
  freeTiles.forEach((t) => {
    const placing = (buildMode && placeBuildingKey) || placeBay;
    if (!placing && !buildMode) return;
    const { x, y } = isoToScreen(t.x, t.y);
    const ghostSrc = placeBuildingKey
      ? buildingSprite(placeBuildingKey, 1)
      : (placeBay ? GROUND.concrete : GROUND.dirtPatch);
    const layout = placeBuildingKey
      ? resolveBuildingPlacement(x, y, ghostSrc, spriteAnchors)
      : { left: x, top: buildingFootY(y), width: TILE_W };
    entities.push({
      key: `free-${t.x}-${t.y}`,
      src: ghostSrc,
      left: layout.left,
      top: layout.top,
      z: 6 + t.x + t.y,
      width: layout.width,
      pick: {
        type: 'empty',
        x: t.x,
        y: t.y,
        placeKey: placeBuildingKey || (placeBay ? 'bay' : null),
      },
      title: placeBuildingKey
        ? `Place ${placeBuildingKey}`
        : (placeBay ? 'Place parking bay' : 'Empty pad'),
      className: placing
        ? 'opacity-50 hover:opacity-90 animate-pulse'
        : 'opacity-40',
    });
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
        pick: {
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
      entities.push({
        key: p.id || `bay-${p.x}-${p.y}`,
        src,
        left: layout.left,
        top: layout.top,
        z: 10 + p.x + p.y,
        width: layout.width,
        pick: {
          type: 'bay',
          x: p.x,
          y: p.y,
          id: p.id,
          sprite: layout.file,
          label: p.label || 'Parking bay',
          slot: bayPlacements.findIndex((b) => b.id === p.id),
        },
        title: calibrateMode
          ? `Calibrate ${p.label || layout.file}`
          : (charged ? 'Parking bay · charger' : 'Parking bay — click to upgrade'),
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
        pick: {
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
    entities.push({
      key: `staff-${s.id}`,
      src: characterSprite(facing),
      left: x,
      top: buildingFootY(y) - 2,
      z: 55 + Math.round(gx + gy),
      width: 28,
      pick: { type: 'staff', staffId: s.id },
      title: `${s.name || 'Driver'} — roster`,
    });
  });

  // Decorative light at entrance
  if (!calibYard) {
    const { x, y } = isoToScreen(6, 10);
    entities.push({
      key: 'lamp',
      src: PROP.light,
      left: x,
      top: buildingFootY(y),
      z: 25,
      width: 26,
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
      pick: { type: 'vehicle', slot: index, vehicleId: vehicle.id },
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
        const panGesture = shouldPanGesture(e) || (!editorMode && e.button === 0);
        if (panGesture) {
          e.preventDefault();
          paintingRef.current = false;
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
        if (!editorMode) return;
        const tile = pointerToTile(e.clientX, e.clientY);
        setHoverTile(tile);
        if (paintingRef.current) paintAt(e.clientX, e.clientY);
      }}
      onPointerUp={(e) => {
        if (panningRef.current?.pointerId === e.pointerId) panningRef.current = null;
        paintingRef.current = false;
        lastPaintRef.current = '';
      }}
      onPointerCancel={() => {
        panningRef.current = null;
        paintingRef.current = false;
        lastPaintRef.current = '';
      }}
      onPointerLeave={() => {
        if (!paintingRef.current && !panningRef.current) setHoverTile(null);
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

          {editorMode && hoverScreen ? (
            <div
              className="absolute pointer-events-none border-2 border-white/90 bg-white/20"
              style={{
                left: hoverScreen.x,
                top: hoverScreen.y,
                width: TILE_W,
                height: TILE_H,
                zIndex: 200,
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
            e.saleSign ? (
              <SaleSign
                key={e.key}
                left={e.left}
                top={e.top}
                z={e.z}
                width={e.width}
                cost={e.cost}
                title={e.title}
                className={e.className}
                onClick={(ev) => handlePick({ ...e.pick, clientX: ev.clientX, clientY: ev.clientY })}
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
                onClick={e.pick ? () => handlePick(e.pick) : undefined}
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
        <div className="rounded-lg bg-black/60 px-2.5 py-1.5 text-[11px] text-white/90 border border-white/15">
          {editorMode
            ? (hoverTile
              ? `Tile ${hoverTile.x},${hoverTile.y} · ${editorTool}`
              : 'Paint · scroll/drag to pan · Ctrl+scroll zoom')
            : 'Scroll or drag (right / Space) to pan · Ctrl+scroll zoom'}
        </div>
        {(pan.x !== 0 || pan.y !== 0 || zoom !== 1) ? (
          <button
            type="button"
            className="pointer-events-auto rounded-lg bg-black/60 px-2.5 py-1.5 text-[11px] font-semibold text-white border border-white/15 hover:bg-black/80"
            onClick={resetView}
          >
            Reset view
          </button>
        ) : null}
      </div>
    </div>
  );
}
