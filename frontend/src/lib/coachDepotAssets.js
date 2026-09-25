/** Isometric City starter sprites + 12×12 yard helpers. */

const BASE = '/coach-depot/iso';

export const TILE_W = 128;
export const TILE_H = 64;
export const GRID_SIZE = 12;

export function assetUrl(...parts) {
  return `${BASE}/${parts.join('/')}`;
}

export const GROUND = {
  dirt: assetUrl('grounds', 'tile_ground_dirt.png'),
  grass: assetUrl('grounds', 'tile_ground_grass.png'),
  asphalt: assetUrl('grounds', 'tile_ground_asphalt.png'),
  concrete: assetUrl('grounds', 'tile_ground_concrete.png'),
  dirtPatch: assetUrl('grounds', 'tile_ground_dirt_grasspatch.png'),
  roadSE: assetUrl('grounds', 'tile_road_straight_SE_normal.png'),
  roadSW: assetUrl('grounds', 'tile_road_straight_SW_normal.png'),
  roadEndSE: assetUrl('grounds', 'tile_road_end_SE_normal.png'),
  cross: assetUrl('grounds', 'tile_road_xsing_normal.png'),
};

export function officeSprite(officeLevel = 1) {
  const list = [
    'bld_office_small_gray_a.png',
    'bld_office_medium_brickbrown_a.png',
    'bld_office_tall_blue_a.png',
    'bld_apartments_brickwhite_a.png',
  ];
  const lvl = Math.max(1, Math.min(4, Math.floor(Number(officeLevel) || 1)));
  return assetUrl('buildings', list[lvl - 1]);
}

export const BUILDING_SPRITES = {
  workshop: ['bld_autoshop_a.png', 'bld_autoshop_b.png'],
  wash: ['bld_gasstation_a.png', 'bld_gasstation_b.png'],
  breakRoom: ['bld_cafe_a.png', 'bld_cafe_b.png'],
  opsOffice: ['bld_office_medium_white_a.png', 'bld_office_medium_blue_a.png'],
  paintShop: ['bld_warehouse_blue_a.png', 'bld_warehouse_green_a.png'],
  chargers: ['bld_gasstation_b.png', 'bld_gasstation_a.png'],
  // Clinic → taller brown office (not fire station)
  trainingCentre: ['bld_clinic_a.png', 'bld_office_tall_brown_a.png'],
  tourOffice: ['bld_hospital_a.png', 'bld_office_tall_yellow_a.png'],
};

export function buildingSprite(key, level = 1) {
  const list = BUILDING_SPRITES[key];
  if (!list) return assetUrl('buildings', 'bld_warehouse_brown_a.png');
  const idx = level <= 1 ? 0 : Math.min(list.length - 1, 1);
  return assetUrl('buildings', list[idx]);
}

/** Every HQ / building level / parking bay sprite for the Lock calibrator yard. */
export function calibrationCatalog() {
  const items = [];
  for (let lvl = 1; lvl <= 4; lvl += 1) {
    const src = officeSprite(lvl);
    items.push({
      id: `hq-lv${lvl}`,
      label: `HQ Lv ${lvl}`,
      type: 'office',
      key: 'office',
      level: lvl,
      src,
      file: spriteFileName(src),
    });
  }
  for (const [key, list] of Object.entries(BUILDING_SPRITES)) {
    list.forEach((fileName, idx) => {
      const level = idx + 1;
      const src = assetUrl('buildings', fileName);
      items.push({
        id: `${key}-lv${level}`,
        label: `${key} Lv ${level}`,
        type: 'building',
        key,
        level,
        src,
        file: spriteFileName(src),
      });
    });
  }
  const baySrc = GROUND.concrete;
  items.push({
    id: 'bay',
    label: 'Parking bay',
    type: 'bay',
    key: 'bay',
    level: 1,
    src: baySrc,
    file: spriteFileName(baySrc),
  });
  return items;
}

/** Lay catalog items onto a spaced grid for side-by-side calibration. */
export function calibrationYardLayout(catalog = calibrationCatalog(), opts = {}) {
  const cols = Math.max(3, Math.min(8, Math.floor(Number(opts.cols) || 6)));
  const gap = Math.max(1, Math.floor(Number(opts.gap) || 1)); // empty tile between cells
  const originX = Math.max(0, Math.floor(Number(opts.originX) || 1));
  const originY = Math.max(0, Math.floor(Number(opts.originY) || 1));
  const stride = 1 + gap;
  return catalog.map((item, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    return {
      ...item,
      x: originX + col * stride,
      y: originY + row * stride,
    };
  }).filter((p) => p.x < GRID_SIZE && p.y < GRID_SIZE);
}

/**
 * Distinct silhouettes + colours per tier:
 * 1 minibus (school bus, drawn smaller)
 * 2 coach (yellow truck)
 * 3 exec (white van → blue tint)
 * 4 electric (black van → green tint)
 * 5 super exec (purple van)
 */
export const VEHICLE_BASE = {
  1: 'veh_bus_school',
  2: 'veh_truck_yellow',
  3: 'veh_van_white',
  4: 'veh_van_black',
  5: 'veh_van_purple',
};

export function vehicleSprite(tier = 1, facing = 'SE') {
  const base = VEHICLE_BASE[tier] || VEHICLE_BASE[1];
  return assetUrl('vehicles', `${base}_${facing}.png`);
}

/** Minibus is 60% of a full coach footprint. */
export function vehicleDisplayWidth(tier, baseWidth = TILE_W * 0.7) {
  const base = Number(baseWidth) || TILE_W * 0.7;
  return Math.max(1, Math.floor(Number(tier) || 1) === 1 ? base * 0.6 : base);
}

/** CSS filter so coach / exec / electric / super read clearly apart. */
export function vehicleFilterStyle(tier) {
  switch (Math.floor(Number(tier) || 1)) {
    case 1:
      return { filter: 'saturate(1.05)' }; // school-bus yellow, slightly punchy
    case 2:
      return { filter: 'saturate(1.2) brightness(1.05)' }; // amber coach
    case 3:
      return { filter: 'hue-rotate(195deg) saturate(1.35) brightness(1.08)' }; // exec blue
    case 4:
      return { filter: 'hue-rotate(95deg) saturate(1.4) brightness(1.05)' }; // electric green
    case 5:
      return { filter: 'saturate(1.45) brightness(1.08)' }; // purple van as-is, punchier
    default:
      return {};
  }
}

export const PROP = {
  fence: assetUrl('props', 'prop_fence_wood_a.png'),
  light: assetUrl('props', 'prop_lightpole_a.png'),
  box: assetUrl('props', 'prop_box_cardboard_closed.png'),
  flowers: assetUrl('props', 'prop_flowers_yellow.png'),
};

export function characterSprite(facing = 'SE') {
  return assetUrl('characters', `char_a_idle_${facing}_f01.png`);
}

export function groundForAge(ageOrHq = 1) {
  const n = Math.max(1, Math.floor(Number(ageOrHq) || 1));
  if (n >= 4) return GROUND.concrete;
  if (n >= 3) return GROUND.asphalt;
  if (n >= 2) return GROUND.grass;
  return GROUND.dirt;
}

export const groundForHq = groundForAge;

export function isoToScreen(gx, gy, tileW = TILE_W, tileH = TILE_H) {
  return {
    x: (gx - gy) * (tileW / 2),
    y: (gx + gy) * (tileH / 2),
  };
}

/** Inverse of isoToScreen — returns fractional grid coords (tile centres sit on integers). */
export function screenToIso(sx, sy, tileW = TILE_W, tileH = TILE_H) {
  const halfW = tileW / 2;
  const halfH = tileH / 2;
  const u = sx / halfW;
  const v = sy / halfH;
  return {
    gx: (u + v) / 2,
    gy: (v - u) / 2,
  };
}

export function screenToTile(sx, sy, tileW = TILE_W, tileH = TILE_H) {
  const { gx, gy } = screenToIso(sx, sy, tileW, tileH);
  return {
    x: Math.round(gx),
    y: Math.round(gy),
  };
}

/** Native PNG widths — many pack buildings are 256 with 1-tile art + padding. */
export const BUILDING_NATIVE_WIDTH = {
  'bld_apartments_brickbrown_a.png': 256,
  'bld_apartments_brickwhite_a.png': 256,
  'bld_autoshop_a.png': 128,
  'bld_autoshop_b.png': 129,
  'bld_cafe_a.png': 128,
  'bld_cafe_b.png': 128,
  'bld_clinic_a.png': 128,
  'bld_construction_b.png': 128,
  'bld_contruction_a.png': 128,
  'bld_firestation_a.png': 256,
  'bld_fruitstand_a.png': 128,
  'bld_gasstation_a.png': 256,
  'bld_gasstation_b.png': 257,
  'bld_gunshop_a.png': 129,
  'bld_hospital_a.png': 256,
  'bld_office_medium_blue_a.png': 256,
  'bld_office_medium_brickbrown_a.png': 256,
  'bld_office_medium_white_a.png': 256,
  'bld_office_small_brown_a.png': 256,
  'bld_office_small_gray_a.png': 256,
  'bld_office_small_orange_a.png': 256,
  'bld_office_tall_blue_a.png': 256,
  'bld_office_tall_brown_a.png': 256,
  'bld_office_tall_yellow_a.png': 256,
  'bld_warehouse_blue_a.png': 256,
  'bld_warehouse_brown_a.png': 256,
  'bld_warehouse_green_a.png': 256,
};

export function spriteFileName(url) {
  const s = String(url || '');
  const i = s.lastIndexOf('/');
  return i >= 0 ? s.slice(i + 1) : s;
}

/**
 * All placed buildings occupy one tile by default (scale 1 = TILE_W).
 * Per-sprite anchors (scale / ox / oy) are editable in the admin calibrator
 * and stored in Firestore coach_depot_config/spriteAnchors.
 */
export const DEFAULT_SPRITE_ANCHOR = { scale: 1, ox: 0, oy: 0 };

export function normalizeSpriteAnchor(raw = {}) {
  const scale = Number(raw.scale);
  const ox = Number(raw.ox);
  const oy = Number(raw.oy);
  return {
    scale: Math.min(2.5, Math.max(0.35, Number.isFinite(scale) ? scale : 1)),
    ox: Math.round(Math.min(96, Math.max(-96, Number.isFinite(ox) ? ox : 0))),
    oy: Math.round(Math.min(96, Math.max(-96, Number.isFinite(oy) ? oy : 0))),
  };
}

export function normalizeSpriteAnchors(map = {}) {
  const out = {};
  if (!map || typeof map !== 'object') return out;
  for (const [key, val] of Object.entries(map)) {
    const file = spriteFileName(key);
    if (!file) continue;
    out[file] = normalizeSpriteAnchor(val);
  }
  return out;
}

/** Layout a building sprite on a tile centre, applying saved anchors. */
export function resolveBuildingPlacement(tileCenterX, tileCenterY, src, anchors = {}) {
  const file = spriteFileName(src);
  const anchor = normalizeSpriteAnchor(anchors?.[file] || DEFAULT_SPRITE_ANCHOR);
  return {
    file,
    anchor,
    left: tileCenterX + anchor.ox,
    top: tileCenterY + 2 + anchor.oy,
    width: Math.max(24, Math.round(TILE_W * anchor.scale)),
  };
}

export function buildingDisplayWidth(src, anchors = {}) {
  const file = spriteFileName(src);
  const anchor = normalizeSpriteAnchor(anchors?.[file] || DEFAULT_SPRITE_ANCHOR);
  return Math.max(24, Math.round(TILE_W * anchor.scale));
}

/**
 * Plant the sprite bottom on the tile centre (same origin as ground tiles).
 * Prefer resolveBuildingPlacement when anchors are available.
 */
export function buildingFootY(tileCenterY) {
  return tileCenterY + 2;
}

export function tileKey(x, y) {
  return `${x},${y}`;
}
