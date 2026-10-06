/**
 * Fun Admin–only art preview: expanded Isometric City assets for Coach Depot.
 * Does not change the live Coach Depot game.
 */
import { useMemo, useRef, useState } from 'react';
import { TILE_H, TILE_W, isoToScreen } from '../lib/coachDepotAssets';

const BASE = '/coach-depot-preview/iso';
const u = (...parts) => `${BASE}/${parts.join('/')}`;

const GROUND = {
  dirt: u('grounds', 'tile_ground_dirt.png'),
  grass: u('grounds', 'tile_ground_grass.png'),
  asphalt: u('grounds', 'tile_ground_asphalt.png'),
  concrete: u('grounds', 'tile_ground_concrete.png'),
  dirtPatch: u('grounds', 'tile_ground_dirt_grasspatch.png'),
  roadSE: u('grounds', 'tile_road_straight_SE_normal.png'),
  roadSW: u('grounds', 'tile_road_straight_SW_normal.png'),
  roadEndSE: u('grounds', 'tile_road_end_SE_normal.png'),
  cross: u('grounds', 'tile_road_xsing_normal.png'),
  pelicanSE: u('grounds', 'tile_road_pelican_SE_normal.png'),
  cornerS: u('grounds', 'tile_road_corner_S_normal.png'),
  cornerE: u('grounds', 'tile_road_corner_E_normal.png'),
};

/** Current live mapping (for comparison labels). */
const CURRENT_MAP = [
  { role: 'HQ Lv1–4', current: 'small gray → med brown → tall blue → apartments white', proposed: 'small gray → med brickred → tall yellow → apartments brown + white B' },
  { role: 'Operations', current: 'office med white / blue', proposed: 'office med green / brickred (+ taller unlocks)' },
  { role: 'Workshop', current: 'autoshop a/b', proposed: 'autoshop a/b + firestation for late tier' },
  { role: 'Wash', current: 'gas station a/b', proposed: 'gas station a/b (keep) + water tower prop dressing' },
  { role: 'Break room', current: 'cafe a/b', proposed: 'cafe a/b + pizza / ice cream as flavour variants' },
  { role: 'Training', current: 'clinic → tall brown office', proposed: 'clinic a/b → police station → hospital' },
  { role: 'Paint shop', current: 'warehouse blue/green', proposed: 'warehouse blue/green/brown B variants' },
  { role: 'Tour office', current: 'hospital → tall yellow', proposed: 'church / hospital B / tall offices' },
  { role: 'Fleet art', current: 'school bus + tinted vans', proposed: 'bus + box trucks + pickups per tier (no CSS tint)' },
  { role: 'Yard dressing', current: 'one lamp', proposed: 'lights, trees, fences, signs, trash, tires, traffic lights' },
];

const SHOWCASE_BUILDINGS = [
  { key: 'hq', file: 'bld_office_medium_brickred_a.png', x: 5, y: 5, label: 'HQ (proposed Lv2+)', w: 110 },
  { key: 'ops', file: 'bld_office_medium_green_a.png', x: 3, y: 5, label: 'Operations', w: 100 },
  { key: 'workshop', file: 'bld_autoshop_b.png', x: 7, y: 5, label: 'Workshop', w: 96 },
  { key: 'wash', file: 'bld_gasstation_a.png', x: 3, y: 3, label: 'Wash', w: 110 },
  { key: 'break', file: 'bld_cafe_b.png', x: 7, y: 3, label: 'Break room', w: 90 },
  { key: 'training', file: 'bld_policestation_a.png', x: 4, y: 2, label: 'Training (proposed)', w: 110 },
  { key: 'paint', file: 'bld_warehouse_brown_b.png', x: 6, y: 2, label: 'Paint shop', w: 100 },
  { key: 'tour', file: 'bld_hospital_b.png', x: 8, y: 4, label: 'Tour office', w: 110 },
];

const SHOWCASE_PROPS = [
  { file: 'prop_lightpole_a.png', x: 5, y: 7, w: 28 },
  { file: 'prop_lightpole_b.png', x: 6, y: 8, w: 28 },
  { file: 'prop_trafficlight_a.png', x: 5, y: 8, w: 26 },
  { file: 'prop_tree_common_medium.png', x: 2, y: 4, w: 48 },
  { file: 'prop_tree_pine_tall.png', x: 9, y: 3, w: 42 },
  { file: 'prop_fence_wood_a.png', x: 2, y: 6, w: 40 },
  { file: 'prop_fence_wood_b.png', x: 2, y: 7, w: 40 },
  { file: 'prop_sign_stop_a.png', x: 4, y: 7, w: 24 },
  { file: 'prop_sign_caution_a.png', x: 7, y: 7, w: 24 },
  { file: 'prop_trashcan_green_a.png', x: 3, y: 6, w: 22 },
  { file: 'prop_trashcan_blue_a.png', x: 8, y: 6, w: 22 },
  { file: 'prop_tires.png', x: 7, y: 6, w: 30 },
  { file: 'prop_box_cardboard_closed.png', x: 8, y: 5, w: 26 },
  { file: 'prop_flowers_yellow.png', x: 4, y: 4, w: 22 },
  { file: 'prop_flowers_pink.png', x: 6, y: 4, w: 22 },
];

const SHOWCASE_VEHICLES = [
  { file: 'veh_bus_school_SE.png', x: 4, y: 6, w: 72, label: 'Minibus / school' },
  { file: 'veh_box_yellow_SE.png', x: 5, y: 6, w: 70, label: 'Coach tier' },
  { file: 'veh_box_green_SW.png', x: 6, y: 6, w: 70, label: 'Exec tier' },
  { file: 'veh_pickup_orange_SE.png', x: 8, y: 7, w: 58, label: 'Utility' },
];

const GALLERY = [
  {
    title: 'Buildings unlocked by the pack',
    folder: 'buildings',
    files: [
      'bld_office_small_gray_a.png', 'bld_office_medium_brickred_a.png', 'bld_office_tall_yellow_a.png',
      'bld_apartments_brickbrown_a.png', 'bld_apartments_brickwhite_b.png', 'bld_policestation_a.png',
      'bld_hospital_b.png', 'bld_firestation_b.png', 'bld_church_a.png', 'bld_pizza_a.png',
      'bld_icecream_a.png', 'bld_warehouse_brown_b.png', 'bld_office_medium_green_a.png', 'bld_clinic_b.png',
    ],
  },
  {
    title: 'Yard props',
    folder: 'props',
    files: [
      'prop_lightpole_a.png', 'prop_trafficlight_a.png', 'prop_tree_common_medium.png', 'prop_tree_pine_tall.png',
      'prop_fence_wood_a.png', 'prop_sign_stop_a.png', 'prop_trashcan_green_a.png', 'prop_tires.png',
      'prop_flowers_red.png', 'prop_box_cardboard_open.png',
    ],
  },
  {
    title: 'Fleet sprites (no colour-tint hacks)',
    folder: 'vehicles',
    files: [
      'veh_bus_school_SE.png', 'veh_box_yellow_SE.png', 'veh_box_green_SE.png', 'veh_box_red_SE.png',
      'veh_pickup_orange_SE.png', 'veh_pickup_black_SE.png', 'veh_police_SE.png', 'veh_firetruck_SE.png',
    ],
  },
];

function footY(tileCenterY) {
  return tileCenterY + TILE_H * 0.22;
}

function Sprite({ src, left, top, z, width, title, opacity = 1 }) {
  return (
    <div
      className="absolute origin-bottom pointer-events-none"
      style={{
        left,
        top,
        zIndex: z,
        width,
        transform: 'translate(-50%, -100%)',
        opacity,
      }}
      title={title}
    >
      <img src={src} alt="" draggable={false} className="block w-full h-auto select-none" />
    </div>
  );
}

function ShowcaseYard() {
  const wrapRef = useRef(null);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const panRef = useRef(null);

  const { tiles, entities, worldW, worldH, origin } = useMemo(() => {
    const tileList = [];
    const entityList = [];
    const owned = new Set();
    for (let x = 2; x <= 8; x += 1) {
      for (let y = 2; y <= 7; y += 1) owned.add(`${x},${y}`);
    }
    // Ground
    for (let x = 0; x < 11; x += 1) {
      for (let y = 0; y < 11; y += 1) {
        const key = `${x},${y}`;
        const { x: sx, y: sy } = isoToScreen(x, y);
        let src = GROUND.grass;
        if (owned.has(key)) src = GROUND.concrete;
        if (y === 8 && x >= 4 && x <= 6) src = GROUND.roadSE;
        if (x === 5 && y === 9) src = GROUND.roadSE;
        if (x === 5 && y === 10) src = GROUND.roadEndSE;
        if (x === 5 && y === 8) src = GROUND.pelicanSE;
        if (!owned.has(key) && y < 8 && (x < 2 || x > 8 || y < 2)) src = GROUND.dirt;
        tileList.push({
          key: `t-${key}`,
          src,
          left: sx,
          top: sy,
          z: x + y,
        });
      }
    }
    // Bay pads
    ;[[4, 6], [5, 6], [6, 6], [8, 7]].forEach(([x, y], i) => {
      const { x: sx, y: sy } = isoToScreen(x, y);
      entityList.push({
        key: `bay-${i}`,
        src: GROUND.concrete,
        left: sx,
        top: footY(sy),
        z: 12 + x + y,
        width: TILE_W * 0.92,
        title: 'Parking bay',
      });
    });
    SHOWCASE_BUILDINGS.forEach((b) => {
      const { x: sx, y: sy } = isoToScreen(b.x, b.y);
      entityList.push({
        key: b.key,
        src: u('buildings', b.file),
        left: sx,
        top: footY(sy),
        z: 40 + b.x + b.y,
        width: b.w,
        title: b.label,
      });
    });
    SHOWCASE_PROPS.forEach((p, i) => {
      const { x: sx, y: sy } = isoToScreen(p.x, p.y);
      entityList.push({
        key: `prop-${i}`,
        src: u('props', p.file),
        left: sx,
        top: footY(sy),
        z: 50 + p.x + p.y,
        width: p.w,
      });
    });
    SHOWCASE_VEHICLES.forEach((v, i) => {
      const { x: sx, y: sy } = isoToScreen(v.x, v.y);
      entityList.push({
        key: `veh-${i}`,
        src: u('vehicles', v.file),
        left: sx,
        top: footY(sy) + 2,
        z: 70 + v.x + v.y,
        width: v.w,
        title: v.label,
      });
    });

    const originPt = isoToScreen(5, 5);
    return {
      tiles: tileList,
      entities: entityList.sort((a, b) => a.z - b.z),
      worldW: TILE_W * 11 * 0.55 + 200,
      worldH: TILE_H * 11 * 0.55 + 320,
      origin: originPt,
    };
  }, []);

  const scale = 0.92;
  const worldTx = worldW / 2 - origin.x;
  const worldTy = worldH * 0.2 - origin.y;

  return (
    <div
      ref={wrapRef}
      className="relative w-full overflow-hidden rounded-xl border border-[#1a2540] cursor-grab active:cursor-grabbing select-none"
      style={{
        height: 520,
        backgroundImage: `
          radial-gradient(ellipse at 30% 15%, rgba(255,255,255,0.16), transparent 45%),
          linear-gradient(180deg, #7ea0bc 0%, #5f7f6a 55%, #3f5a45 100%)
        `,
        touchAction: 'none',
      }}
      onPointerDown={(e) => {
        if (e.button !== 0) return;
        panRef.current = { id: e.pointerId, x: e.clientX, y: e.clientY };
        e.currentTarget.setPointerCapture?.(e.pointerId);
      }}
      onPointerMove={(e) => {
        if (!panRef.current || panRef.current.id !== e.pointerId) return;
        const dx = e.clientX - panRef.current.x;
        const dy = e.clientY - panRef.current.y;
        panRef.current.x = e.clientX;
        panRef.current.y = e.clientY;
        setPan((p) => ({ x: p.x + dx, y: p.y + dy }));
      }}
      onPointerUp={(e) => {
        if (panRef.current?.id === e.pointerId) panRef.current = null;
      }}
      onPointerCancel={() => { panRef.current = null; }}
    >
      <div
        className="absolute left-1/2 top-[48%] pointer-events-none"
        style={{
          width: worldW,
          height: worldH,
          marginLeft: -worldW / 2,
          marginTop: -worldH / 2,
          transform: `translate(${pan.x}px, ${pan.y}px) scale(${scale})`,
          transformOrigin: 'center center',
        }}
      >
        <div className="absolute inset-0" style={{ transform: `translate(${worldTx}px, ${worldTy}px)` }}>
          {tiles.map((t) => (
            <div
              key={t.key}
              className="absolute pointer-events-none"
              style={{
                left: t.left,
                top: t.top,
                width: TILE_W,
                height: TILE_H,
                zIndex: t.z,
                transform: 'translate(-50%, -50%)',
              }}
            >
              <img src={t.src} alt="" draggable={false} className="block w-full h-full select-none" />
            </div>
          ))}
          {entities.map((e) => (
            <Sprite
              key={e.key}
              src={e.src}
              left={e.left}
              top={e.top}
              z={e.z}
              width={e.width}
              title={e.title}
            />
          ))}
        </div>
      </div>
      <p className="absolute left-3 bottom-3 text-[11px] font-semibold uppercase tracking-wide text-white/90 bg-black/50 rounded px-2 py-1 pointer-events-none">
        Drag to pan · preview yard (not live game)
      </p>
    </div>
  );
}

export default function CoachDepotArtPreview() {
  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 space-y-1">
        <h2 className="text-lg font-semibold text-amber-100">Coach Depot · expanded art preview</h2>
        <p className="text-sm text-slate-300 leading-relaxed">
          Fun Admin only. Live Coach Depot / Coach Depot tab are unchanged. This preview uses a fuller
          slice of the <span className="text-amber-100/90">Isometric City</span> pack (buildings, props,
          roads, fleet) already in your Downloads — same style as today, just more of it.
        </p>
        <p className="text-xs text-slate-400">
          KayKit City Builder Bits is 3D-only, so it is not in this preview. That would be a separate
          in-browser 3D prototype if you choose that direction later.
        </p>
      </div>

      <section className="space-y-2">
        <h3 className="text-sm font-semibold text-indigo-200 uppercase tracking-wide">Showcase yard</h3>
        <p className="text-xs text-slate-400">
          Proposed look: dressed yard, pelican crossing entrance, distinct fleet sprites, props around
          bays and buildings.
        </p>
        <ShowcaseYard />
      </section>

      <section className="space-y-2">
        <h3 className="text-sm font-semibold text-indigo-200 uppercase tracking-wide">Mapping comparison</h3>
        <div className="overflow-x-auto rounded-xl border border-[#1a2540]">
          <table className="w-full text-left text-sm">
            <thead className="bg-[#0f172a] text-[11px] uppercase tracking-wide text-slate-400">
              <tr>
                <th className="px-3 py-2 font-semibold">Role</th>
                <th className="px-3 py-2 font-semibold">Live now</th>
                <th className="px-3 py-2 font-semibold">Proposed with pack</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#1a2540]">
              {CURRENT_MAP.map((row) => (
                <tr key={row.role} className="bg-[#060e1a]/80">
                  <td className="px-3 py-2 font-medium text-slate-100 whitespace-nowrap">{row.role}</td>
                  <td className="px-3 py-2 text-slate-400">{row.current}</td>
                  <td className="px-3 py-2 text-emerald-200/90">{row.proposed}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {GALLERY.map((section) => (
        <section key={section.title} className="space-y-2">
          <h3 className="text-sm font-semibold text-indigo-200 uppercase tracking-wide">{section.title}</h3>
          <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-7 gap-2">
            {section.files.map((file) => (
              <div
                key={file}
                className="rounded-lg border border-[#1a2540] bg-[#0b1220] px-2 py-2 flex flex-col items-center gap-1"
              >
                <img
                  src={u(section.folder, file)}
                  alt=""
                  className="h-16 w-auto object-contain"
                  draggable={false}
                />
                <p className="text-[9px] text-slate-500 text-center leading-tight break-all">{file.replace(/\.(png)$/, '')}</p>
              </div>
            ))}
          </div>
        </section>
      ))}

      <p className="text-xs text-slate-500">
        Assets staged under <code className="text-slate-400">/coach-depot-preview/iso</code> (~259 PNGs).
        Promoting this to live would mean remapping sprites in <code className="text-slate-400">coachDepotAssets.js</code>
        and copying chosen files into <code className="text-slate-400">/coach-depot/iso</code>.
      </p>
    </div>
  );
}
