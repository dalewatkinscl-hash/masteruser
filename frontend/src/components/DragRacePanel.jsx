import { useEffect, useMemo, useRef, useState } from 'react';
import {
  BOT_OPPONENTS,
  CAR_PAINT_PALETTE,
  DRAG_CARS,
  QUARTER_MILE_METERS,
  UPGRADE_CATEGORIES,
  buildMatchedBot,
  computeCarStats,
  createInitialDragState,
  evaluateLaunch,
  evaluateShift,
  getCarById,
  getUpgradeCost,
  isDragSoundMuted,
  loadDragState,
  normalizeDragState,
  playDragSfx,
  playExhaustPopsAndBangs,
  saveDragState,
  setDragSoundMuted,
  updateDragEngineAudio,
  updateWheelspinAudio,
} from '../lib/dragRacing';
import { GameUiBadge, GameUiButton, GameUiModal, GameUiPanel } from './gameUi';

async function readJsonResponse(res) {
  const ct = res.headers.get('content-type') || '';
  if (!ct.includes('application/json')) return null;
  try {
    return await res.json();
  } catch {
    return null;
  }
}

/**
 * High-detail 2D Cartoon Car SVG Renderer (used in Garage, Showroom & Matchup Cards)
 */
export function CartoonCarSvg({
  carId = 'fiesta-mk6',
  paint = 'blue',
  stripes = false,
  upgradeLevel = 0,
  className = 'w-full h-24',
  flip = false,
}) {
  const car = getCarById(carId);
  const swatch = CAR_PAINT_PALETTE.find((p) => p.id === paint) || CAR_PAINT_PALETTE[1];
  const bodyHex = swatch.hex;
  const darkHex = swatch.accent;
  const style = car.bodyStyle;
  const hasBigWing = style === 'civic_wing' || style === 'rally_saloon' || style === 'super_coupe' || upgradeLevel >= 3;
  const hasScoop = style === 'rally_saloon' || style === 'muscle_coupe';
  const hasChute = style === 'wedge_exotic' || upgradeLevel >= 5;
  const wheelColour = style === 'rally_saloon'
    ? '#facc15'
    : style === 'hatch_basic' && upgradeLevel < 2
      ? '#cbd5e1'
      : '#e2e8f0';
  const caliperColour = style === 'hatch_basic' ? '#64748b' : '#ef4444';

  // Distinct cartoon body path per car archetype (facing right: x=20 rear, x=220 front)
  let bodyPath = '';
  let windowPath = '';
  let roofHighlight = '';

  if (style === 'hatch_basic') {
    // 2004 Ford Fiesta 1.25 — tall cute 3-door supermini hatchback
    bodyPath = 'M 26 76 L 26 52 Q 28 30 52 24 L 122 22 Q 148 23 172 44 L 208 50 Q 218 53 220 64 L 220 76 Z';
    windowPath = 'M 54 28 L 120 26 Q 142 28 163 44 L 50 44 Z';
    roofHighlight = 'M 52 25 L 122 23';
  } else if (style === 'hatch_hot') {
    // VW Golf GTI Mk5 — muscular rounded hot hatch with roof spoiler
    bodyPath = 'M 22 76 L 24 46 L 18 36 L 34 36 Q 44 22 68 21 L 130 21 Q 156 23 178 43 L 214 49 Q 223 52 224 65 L 224 76 Z';
    windowPath = 'M 58 26 L 128 25 Q 150 27 170 43 L 52 43 Z';
    roofHighlight = 'M 64 22 L 130 22';
  } else if (style === 'civic_wing') {
    // Honda Civic Type R FK8 — angular fastback with aggressive front splitter
    bodyPath = 'M 20 76 L 20 48 L 46 25 Q 72 19 124 22 Q 156 25 182 44 L 220 50 L 226 66 L 228 76 Z';
    windowPath = 'M 56 28 L 126 26 Q 152 29 174 43 L 48 43 Z';
    roofHighlight = 'M 60 23 L 126 23';
  } else if (style === 'rally_saloon') {
    // Subaru Impreza WRX STI — classic 3-box rally saloon
    bodyPath = 'M 20 76 L 22 48 L 48 45 L 68 23 L 134 23 L 166 43 L 214 47 Q 223 50 224 64 L 224 76 Z';
    windowPath = 'M 72 27 L 131 27 L 159 43 L 56 43 Z';
    roofHighlight = 'M 70 24 L 133 24';
  } else if (style === 'sports_saloon') {
    // BMW M3 Competition — long low bonnet, muscular Hofmeister kink
    bodyPath = 'M 18 76 L 20 47 L 46 44 L 72 23 L 136 22 L 170 42 L 220 46 Q 226 50 226 65 L 226 76 Z';
    windowPath = 'M 76 27 L 134 26 L 163 42 L 58 42 Z';
    roofHighlight = 'M 74 24 L 135 23';
  } else if (style === 'muscle_coupe') {
    // Shelby GT500 — long muscular fastback coupe
    bodyPath = 'M 18 76 L 20 46 L 74 22 L 128 22 L 166 41 L 222 45 Q 228 49 228 66 L 228 76 Z';
    windowPath = 'M 76 26 L 125 26 L 158 41 L 54 41 Z';
    roofHighlight = 'M 75 23 L 127 23';
  } else if (style === 'super_coupe') {
    // Nissan GT-R R35 Nismo — iconic visor roof & blocky rear tail
    bodyPath = 'M 18 76 L 18 45 L 42 43 L 78 21 L 134 21 L 174 41 L 222 47 L 228 65 L 228 76 Z';
    windowPath = 'M 80 25 L 132 25 L 168 41 L 62 41 Z';
    roofHighlight = 'M 78 22 L 133 22';
  } else {
    // Lamborghini Huracán Twin-Turbo — ultra-low wedge exotic
    bodyPath = 'M 16 76 L 20 46 L 92 22 L 146 22 L 196 44 L 230 54 L 232 76 Z';
    windowPath = 'M 96 26 L 144 26 L 188 43 L 78 43 Z';
    roofHighlight = 'M 94 23 L 145 23';
  }

  return (
    <svg
      viewBox="0 0 250 96"
      className={className}
      style={flip ? { transform: 'scaleX(-1)' } : undefined}
    >
      <defs>
        <linearGradient id={`paint-${carId}-${paint}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={bodyHex} />
          <stop offset="65%" stopColor={bodyHex} />
          <stop offset="100%" stopColor={darkHex} />
        </linearGradient>
        <linearGradient id="glass-grad" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#38bdf8" stopOpacity="0.85" />
          <stop offset="45%" stopColor="#0f172a" stopOpacity="0.92" />
          <stop offset="100%" stopColor="#1e293b" stopOpacity="0.96" />
        </linearGradient>
      </defs>

      {/* Ground shadow */}
      <ellipse cx="125" cy="84" rx="104" ry="6" fill="rgba(0,0,0,0.55)" />

      {/* Drag Parachute pack (Tier 8 or max weight upgrade) */}
      {hasChute ? (
        <g>
          <rect x="6" y="48" width="14" height="14" rx="3" fill="#334155" stroke="#0f172a" strokeWidth="2" />
          <line x1="12" y1="62" x2="22" y2="68" stroke="#94a3b8" strokeWidth="2" />
        </g>
      ) : null}

      {/* Rear GT Wing */}
      {hasBigWing ? (
        <g>
          <path d="M 26 46 L 18 27 L 24 27 L 32 46 Z" fill="#0f172a" />
          <rect x="12" y="23" width="22" height="5" rx="2" fill={bodyHex} stroke="#0f172a" strokeWidth="1.8" />
        </g>
      ) : null}

      {/* Hood Scoop (STI / Muscle blower) */}
      {hasScoop ? (
        <path
          d="M 168 42 L 174 34 L 195 36 L 195 44 Z"
          fill="#0f172a"
          stroke={bodyHex}
          strokeWidth="1.5"
        />
      ) : null}

      {/* Main Car Body */}
      <path
        d={bodyPath}
        fill={`url(#paint-${carId}-${paint})`}
        stroke="#0f172a"
        strokeWidth="2.8"
        strokeLinejoin="round"
      />

      {/* Racing Stripes / Livery */}
      {stripes || style === 'muscle_coupe' ? (
        <path
          d="M 32 58 L 218 58 L 218 63 L 32 63 Z"
          fill="rgba(255,255,255,0.82)"
        />
      ) : null}

      {/* GTI / Nismo Red Pinstripe */}
      {(style === 'hatch_hot' || style === 'super_coupe') ? (
        <line x1="24" y1="73" x2="222" y2="73" stroke="#ef4444" strokeWidth="2.5" />
      ) : null}

      {/* Side Skirts & Front Splitter */}
      <rect x="20" y="72" width="206" height="4" rx="2" fill="#0f172a" />
      {upgradeLevel >= 2 || car.tier >= 3 ? (
        <path d="M 214 73 L 233 73 L 230 77 L 214 77 Z" fill="#ef4444" stroke="#0f172a" strokeWidth="1.2" />
      ) : null}

      {/* Cabin Windows */}
      <path
        d={windowPath}
        fill="url(#glass-grad)"
        stroke="#0f172a"
        strokeWidth="2.2"
        strokeLinejoin="round"
      />
      {/* Window B-pillar & Driver Helmet Silhouette */}
      <line x1="108" y1="26" x2="104" y2="43" stroke="#0f172a" strokeWidth="3.5" />
      <circle cx="122" cy="35" r="5.5" fill="#f8fafc" stroke="#0f172a" strokeWidth="1.5" />
      <path d="M 123 33 L 128 33 L 127 36 L 123 36 Z" fill="#38bdf8" />

      {/* Glossy Roof Specular Highlight */}
      <path d={roofHighlight} stroke="rgba(255,255,255,0.55)" strokeWidth="2.2" strokeLinecap="round" />

      {/* Headlight & Taillight */}
      <path d="M 212 52 L 224 55 L 223 62 L 210 60 Z" fill="#fef08a" stroke="#0f172a" strokeWidth="1.5" />
      <path d="M 20 50 L 28 50 L 28 60 L 20 60 Z" fill="#ef4444" stroke="#0f172a" strokeWidth="1.5" />

      {/* Front Mount Intercooler (visible on turbo/upgraded cars) */}
      {(car.tier >= 2 || upgradeLevel >= 2) ? (
        <rect x="215" y="64" width="9" height="7" rx="1" fill="#94a3b8" stroke="#0f172a" strokeWidth="1.2" />
      ) : null}

      {/* Door Handle & Side Mirror */}
      <rect x="104" y="49" width="10" height="2.5" rx="1" fill="#0f172a" />
      <path d="M 152 41 L 160 38 L 160 44 L 152 44 Z" fill={bodyHex} stroke="#0f172a" strokeWidth="1.5" />

      {/* Exhaust Pipe */}
      <rect x="14" y="69" width="8" height="4" rx="1.5" fill="#94a3b8" stroke="#0f172a" strokeWidth="1.2" />

      {/* Rear & Front Wheels */}
      {[58, 184].map((cx, idx) => (
        <g key={cx}>
          {/* Tyre */}
          <circle cx={cx} cy="72" r={idx === 0 && car.tier >= 6 ? 16.5 : 15.5} fill="#0f172a" stroke="#1e293b" strokeWidth="2" />
          <circle cx={cx} cy="72" r="12.5" fill="#1e293b" />
          {/* Brake Disc & Calliper */}
          <circle cx={cx} cy="72" r="9.5" fill="#475569" />
          <path d={`M ${cx - 8} 67 A 9 9 0 0 1 ${cx - 4} 63`} stroke={caliperColour} strokeWidth="3.5" fill="none" />
          {/* Alloy Rim */}
          <circle cx={cx} cy="72" r="10.5" fill="none" stroke={wheelColour} strokeWidth="2.2" />
          {[0, 60, 120, 180, 240, 300].map((deg) => {
            const rad = (deg * Math.PI) / 180;
            const x2 = cx + Math.cos(rad) * 10;
            const y2 = 72 + Math.sin(rad) * 10;
            return <line key={deg} x1={cx} y1="72" x2={x2} y2={y2} stroke={wheelColour} strokeWidth="1.8" />;
          })}
          <circle cx={cx} cy="72" r="3" fill="#0f172a" stroke={wheelColour} strokeWidth="1.2" />
        </g>
      ))}
    </svg>
  );
}

/**
 * Draw a 2D cartoon car directly onto the 60fps HTML5 Canvas during the race.
 */
function drawCanvasCar(ctx, {
  x,
  y,
  carId,
  paint,
  stripes,
  upgradeLevel = 0,
  wheelAngle = 0,
  pitchDeg = 0,
  flameKind = null, // 'shift' | 'pop' | 'nitrous' | null
  isWheelspinning = false,
  parachuteOpen = false,
  label = '',
  mph = 0,
}) {
  const car = getCarById(carId);
  const swatch = CAR_PAINT_PALETTE.find((p) => p.id === paint) || CAR_PAINT_PALETTE[1];
  const style = car.bodyStyle;

  ctx.save();
  // Subtle axle hop judder when wheels are spinning
  const hopY = isWheelspinning ? Math.sin(performance.now() * 0.085) * 1.4 : 0;
  ctx.translate(x, y + hopY);

  // Ground shadow
  ctx.fillStyle = 'rgba(0,0,0,0.48)';
  ctx.beginPath();
  ctx.ellipse(90, 66 - hopY, 82, 5.5, 0, 0, Math.PI * 2);
  ctx.fill();

  // Deployed Drag Parachute during post-finish shutdown deceleration
  if (parachuteOpen && mph > 18) {
    ctx.save();
    const chuteDist = 48 + Math.sin(performance.now() * 0.025) * 3;
    const chuteY = 34 + Math.cos(performance.now() * 0.03) * 2;
    // Shroud cables
    ctx.strokeStyle = 'rgba(226, 232, 240, 0.75)';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(14, 48);
    ctx.lineTo(14 - chuteDist, chuteY - 14);
    ctx.moveTo(14, 48);
    ctx.lineTo(14 - chuteDist, chuteY);
    ctx.moveTo(14, 48);
    ctx.lineTo(14 - chuteDist, chuteY + 14);
    ctx.stroke();

    // Canopy dome
    ctx.fillStyle = '#ef4444';
    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(14 - chuteDist, chuteY, 16, Math.PI * 0.55, Math.PI * 1.45);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#f8fafc';
    ctx.fillRect(14 - chuteDist - 14, chuteY - 5, 13, 10);
    ctx.restore();
  }

  // Apply squat/pitch around rear axle when launching, shifting, or braking
  ctx.translate(45, 56);
  ctx.rotate((pitchDeg * Math.PI) / 180);
  ctx.translate(-45, -56);

  // Exhaust Flame / Multi-Pop Backfire & Sparks
  if (flameKind) {
    const isN2o = flameKind === 'nitrous';
    const isPop = flameKind === 'pop' || flameKind === 'shift';
    const len = isN2o ? 36 + Math.random() * 18 : 26 + Math.random() * 20;
    const grad = ctx.createLinearGradient(10, 52, 10 - len, 52);
    if (isN2o) {
      grad.addColorStop(0, '#ffffff');
      grad.addColorStop(0.35, '#38bdf8');
      grad.addColorStop(0.75, '#a855f7');
      grad.addColorStop(1, 'rgba(168,85,247,0)');
    } else {
      grad.addColorStop(0, '#ffffff');
      grad.addColorStop(0.28, '#fef08a');
      grad.addColorStop(0.62, '#f97316');
      grad.addColorStop(1, 'rgba(239,68,68,0)');
    }
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.moveTo(12, 47);
    ctx.lineTo(12 - len * 0.65, 44 + (Math.random() - 0.5) * 4);
    ctx.lineTo(12 - len, 52 + (Math.random() - 0.5) * 6);
    ctx.lineTo(12 - len * 0.6, 59 + (Math.random() - 0.5) * 4);
    ctx.lineTo(12, 56);
    ctx.closePath();
    ctx.fill();

    // Secondary pop fireball & flying glowing exhaust sparks
    if (isPop) {
      const popX = 4 - Math.random() * 18;
      const popY = 51 + (Math.random() - 0.5) * 6;
      ctx.fillStyle = 'rgba(251, 146, 60, 0.85)';
      ctx.beginPath();
      ctx.arc(popX, popY, 5 + Math.random() * 5, 0, Math.PI * 2);
      ctx.fill();

      // Flying orange/yellow sparks
      for (let sp = 0; sp < 4; sp += 1) {
        ctx.fillStyle = sp % 2 === 0 ? '#fef08a' : '#f97316';
        ctx.fillRect(
          6 - Math.random() * 38,
          44 + Math.random() * 16,
          3,
          2,
        );
      }
    }
  }

  // Rear Wing
  if (style === 'civic_wing' || style === 'rally_saloon' || style === 'super_coupe' || upgradeLevel >= 3) {
    ctx.fillStyle = '#0f172a';
    ctx.beginPath();
    ctx.moveTo(20, 36);
    ctx.lineTo(12, 20);
    ctx.lineTo(18, 20);
    ctx.lineTo(25, 36);
    ctx.fill();
    ctx.fillStyle = swatch.hex;
    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = 1.6;
    ctx.fillRect(8, 17, 17, 4);
    ctx.strokeRect(8, 17, 17, 4);
  }

  // Hood Scoop
  if (style === 'rally_saloon' || style === 'muscle_coupe') {
    ctx.fillStyle = '#0f172a';
    ctx.beginPath();
    ctx.moveTo(128, 33);
    ctx.lineTo(133, 26);
    ctx.lineTo(150, 28);
    ctx.lineTo(150, 35);
    ctx.closePath();
    ctx.fill();
  }

  // Car Body Silhouette
  const bodyGrad = ctx.createLinearGradient(0, 14, 0, 62);
  bodyGrad.addColorStop(0, swatch.hex);
  bodyGrad.addColorStop(0.68, swatch.hex);
  bodyGrad.addColorStop(1, swatch.accent);
  ctx.fillStyle = bodyGrad;
  ctx.strokeStyle = '#0f172a';
  ctx.lineWidth = 2.4;

  ctx.beginPath();
  if (style === 'hatch_basic' || style === 'hatch_hot' || style === 'civic_wing') {
    ctx.moveTo(16, 58);
    ctx.lineTo(17, 36);
    ctx.quadraticCurveTo(22, 18, 46, 16);
    ctx.lineTo(98, 16);
    ctx.quadraticCurveTo(120, 18, 138, 34);
    ctx.lineTo(168, 39);
    ctx.quadraticCurveTo(176, 42, 177, 52);
    ctx.lineTo(177, 58);
    ctx.closePath();
  } else if (style === 'wedge_exotic') {
    ctx.moveTo(12, 58);
    ctx.lineTo(16, 36);
    ctx.lineTo(72, 17);
    ctx.lineTo(116, 17);
    ctx.lineTo(154, 34);
    ctx.lineTo(182, 43);
    ctx.lineTo(183, 58);
    ctx.closePath();
  } else {
    // Saloon / Coupe
    ctx.moveTo(14, 58);
    ctx.lineTo(16, 36);
    ctx.lineTo(36, 34);
    ctx.lineTo(58, 17);
    ctx.lineTo(106, 17);
    ctx.lineTo(134, 33);
    ctx.lineTo(172, 37);
    ctx.quadraticCurveTo(179, 40, 180, 52);
    ctx.lineTo(180, 58);
    ctx.closePath();
  }
  ctx.fill();
  ctx.stroke();

  // Racing stripe
  if (stripes || style === 'muscle_coupe') {
    ctx.fillStyle = 'rgba(255,255,255,0.82)';
    ctx.fillRect(22, 44, 152, 4);
  }

  // Cabin Window
  ctx.fillStyle = '#0f172a';
  ctx.beginPath();
  if (style === 'wedge_exotic') {
    ctx.moveTo(64, 33);
    ctx.lineTo(75, 20);
    ctx.lineTo(113, 20);
    ctx.lineTo(146, 33);
  } else {
    ctx.moveTo(42, 33);
    ctx.lineTo(58, 20);
    ctx.lineTo(103, 20);
    ctx.lineTo(129, 33);
  }
  ctx.closePath();
  ctx.fill();

  // Driver Helmet inside cabin
  ctx.fillStyle = '#f8fafc';
  ctx.beginPath();
  ctx.arc(96, 27, 4.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#38bdf8';
  ctx.fillRect(96, 25, 4, 2.5);

  // Headlight + Taillight (glows brighter when braking after finish!)
  ctx.fillStyle = '#fef08a';
  ctx.fillRect(168, 41, 9, 6);
  ctx.fillStyle = parachuteOpen || pitchDeg > 0.8 ? '#ff2a2a' : '#ef4444';
  ctx.fillRect(14, 39, 6, 8);
  if (parachuteOpen || pitchDeg > 0.8) {
    ctx.fillStyle = 'rgba(239, 68, 68, 0.45)';
    ctx.beginPath();
    ctx.arc(15, 43, 11, 0, Math.PI * 2);
    ctx.fill();
  }

  // Side skirt
  ctx.fillStyle = '#0f172a';
  ctx.fillRect(16, 55, 162, 3.5);

  // Wheels with rotating spokes & wheelspin slip halo
  const wheelColour = style === 'rally_saloon' ? '#facc15' : '#e2e8f0';
  [45, 146].forEach((wx, idx) => {
    const isDrivenWheel =
      car.drivetrain === 'AWD'
      || (car.drivetrain === 'FWD' && idx === 1)
      || (car.drivetrain === 'RWD' && idx === 0);
    const wheelSpinningHere = isWheelspinning && isDrivenWheel;

    ctx.save();
    ctx.translate(wx, 56);
    // Tyre
    ctx.fillStyle = '#0f172a';
    ctx.beginPath();
    ctx.arc(0, 0, 12.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = wheelSpinningHere ? '#94a3b8' : '#334155';
    ctx.lineWidth = wheelSpinningHere ? 2.2 : 1.5;
    ctx.stroke();

    // Rim & Rotating Spokes
    ctx.rotate(wheelSpinningHere ? wheelAngle * 2.4 : wheelAngle);
    ctx.strokeStyle = wheelColour;
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.arc(0, 0, 8, 0, Math.PI * 2);
    ctx.stroke();
    for (let s = 0; s < 5; s += 1) {
      const a = (s * Math.PI * 2) / 5;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(Math.cos(a) * 8, Math.sin(a) * 8);
      ctx.stroke();
    }

    // White-hot tyre friction blur arc when wheelspinning
    if (wheelSpinningHere) {
      ctx.strokeStyle = 'rgba(248, 250, 252, 0.78)';
      ctx.lineWidth = 2.4;
      ctx.beginPath();
      ctx.arc(0, 0, 11.5, 0.4, 2.7);
      ctx.stroke();
    }
    ctx.restore();
  });

  // Floating Name & Live Speed Tag above car
  if (label) {
    ctx.font = 'bold 11px system-ui, sans-serif';
    ctx.fillStyle = 'rgba(15,23,42,0.82)';
    const text = `${label} · ${Math.round(mph)} MPH`;
    const tw = ctx.measureText(text).width + 12;
    ctx.fillRect(28, -6, tw, 17);
    ctx.strokeStyle = 'rgba(148,163,184,0.45)';
    ctx.lineWidth = 1;
    ctx.strokeRect(28, -6, tw, 17);
    ctx.fillStyle = '#f8fafc';
    ctx.fillText(text, 34, 6);
  }

  ctx.restore();
}

function polarToCartesian(cx, cy, r, angleDeg) {
  const rad = (angleDeg * Math.PI) / 180;
  return {
    x: cx + r * Math.cos(rad),
    y: cy + r * Math.sin(rad),
  };
}

function describeGaugeArc(cx, cy, r, startDeg, endDeg) {
  const start = polarToCartesian(cx, cy, r, startDeg);
  const end = polarToCartesian(cx, cy, r, endDeg);
  const largeArc = Math.abs(endDeg - startDeg) > 180 ? 1 : 0;
  return `M ${start.x.toFixed(2)} ${start.y.toFixed(2)} A ${r} ${r} 0 ${largeArc} 1 ${end.x.toFixed(2)} ${end.y.toFixed(2)}`;
}

/**
 * Twin Circular Analogue Tachometer & Speedometer Cluster
 */
function AnalogueGaugeCluster({
  rpm,
  redlineRpm,
  sweetSpot,
  perfectShiftZone,
  mph,
  topSpeedMph,
  gear,
  maxGears,
  raceMode,
  elapsedSec,
  inWheelspin,
}) {
  const START_DEG = -210;
  const END_DEG = 30;
  const SWEEP_DEG = END_DEG - START_DEG; // 240 deg

  // Tachometer math
  const maxDialRpm = Math.ceil((redlineRpm + 350) / 1000) * 1000;
  const clampedRpm = Math.max(0, Math.min(maxDialRpm, rpm));
  const rpmToDeg = (val) => START_DEG + (Math.max(0, Math.min(maxDialRpm, val)) / maxDialRpm) * SWEEP_DEG;
  const tachoNeedleDeg = rpmToDeg(clampedRpm);
  const [sweetLow, sweetHigh] = sweetSpot;
  const [shiftLow, shiftHigh] = perfectShiftZone;
  const isPreLaunch = raceMode === 'idle' || raceMode === 'staging' || raceMode === 'countdown';

  const inPerfectZone = !isPreLaunch && rpm >= shiftLow && rpm <= shiftHigh;
  const inSweetZone = isPreLaunch && rpm >= sweetLow && rpm <= sweetHigh;
  const inRedline = rpm > (isPreLaunch ? sweetHigh + 400 : shiftHigh);

  const majorRpmCount = Math.round(maxDialRpm / 1000);
  const tachoTicks = [];
  for (let i = 0; i <= majorRpmCount * 5; i += 1) {
    const val = (i / 5) * 1000;
    const isMajor = i % 5 === 0;
    const deg = rpmToDeg(val);
    const pOuter = polarToCartesian(110, 108, 76, deg);
    const pInner = polarToCartesian(110, 108, isMajor ? 64 : 70, deg);
    const pLabel = polarToCartesian(110, 108, 52, deg);
    tachoTicks.push({
      key: i,
      isMajor,
      label: isMajor ? Math.round(val / 1000) : null,
      val,
      pOuter,
      pInner,
      pLabel,
    });
  }

  // Speedometer math
  const maxDialMph = topSpeedMph <= 125 ? 140 : topSpeedMph <= 165 ? 180 : topSpeedMph <= 205 ? 220 : 260;
  const mphStep = maxDialMph <= 180 ? 20 : 40;
  const clampedMph = Math.max(0, Math.min(maxDialMph, mph));
  const mphToDeg = (val) => START_DEG + (Math.max(0, Math.min(maxDialMph, val)) / maxDialMph) * SWEEP_DEG;
  const speedoNeedleDeg = mphToDeg(clampedMph);

  const speedoTicks = [];
  const totalSpeedSteps = Math.round(maxDialMph / (mphStep / 4));
  for (let i = 0; i <= totalSpeedSteps; i += 1) {
    const val = i * (mphStep / 4);
    const isMajor = i % 4 === 0;
    const deg = mphToDeg(val);
    const pOuter = polarToCartesian(110, 108, 76, deg);
    const pInner = polarToCartesian(110, 108, isMajor ? 64 : 70, deg);
    const pLabel = polarToCartesian(110, 108, 51, deg);
    speedoTicks.push({
      key: i,
      isMajor,
      label: isMajor ? Math.round(val) : null,
      pOuter,
      pInner,
      pLabel,
    });
  }

  const tachoTip = polarToCartesian(110, 108, 68, tachoNeedleDeg);
  const tachoTail = polarToCartesian(110, 108, -14, tachoNeedleDeg);
  const speedoTip = polarToCartesian(110, 108, 68, speedoNeedleDeg);
  const speedoTail = polarToCartesian(110, 108, -14, speedoNeedleDeg);

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-center">
      {/* LEFT DIAL: ANALOGUE TACHOMETER (RPM x 1000) */}
      <div className="relative rounded-2xl border border-slate-700/90 bg-slate-950/90 p-2 flex flex-col items-center shadow-inner">
        {/* Top Shift-Light / Launch Indicator Pill */}
        <div
          className={`mb-0.5 rounded-full px-3 py-0.5 text-[11px] font-extrabold tracking-wider uppercase border transition-colors ${
            inPerfectZone
              ? 'border-emerald-300 bg-emerald-500 text-slate-950 shadow-[0_0_16px_#10b981]'
              : inSweetZone
                ? 'border-amber-300 bg-amber-400 text-slate-950 shadow-[0_0_14px_#fbbf24]'
                : inRedline
                  ? 'border-rose-400 bg-rose-600 text-white animate-pulse shadow-[0_0_16px_#f43f5e]'
                  : 'border-slate-700 bg-slate-900 text-slate-300'
          }`}
        >
          {isPreLaunch
            ? inSweetZone
              ? '🎯 SWEET SPOT LOCKED!'
              : `🎯 LAUNCH ZONE: ${sweetLow}–${sweetHigh} RPM`
            : inPerfectZone
              ? '⚡ SHIFT NOW! (PERFECT)'
              : inRedline
                ? '🚨 REDLINE LIMITER — SHIFT!'
                : `⚡ PERFECT SHIFT: ${shiftLow}–${shiftHigh} RPM`}
        </div>

        <svg viewBox="0 0 220 176" className="w-full max-w-[260px] h-auto select-none">
          {/* Outer Bezel Ring */}
          <circle cx="110" cy="108" r="82" fill="#090d16" stroke="#334155" strokeWidth="3" />
          <path
            d={describeGaugeArc(110, 108, 76, START_DEG, END_DEG)}
            fill="none"
            stroke="#1e293b"
            strokeWidth="8"
            strokeLinecap="round"
          />

          {/* Launch Sweet-Spot Arc (visible during countdown/idle) */}
          {isPreLaunch ? (
            <path
              d={describeGaugeArc(110, 108, 76, rpmToDeg(sweetLow), rpmToDeg(sweetHigh))}
              fill="none"
              stroke="#fbbf24"
              strokeWidth="8"
            />
          ) : null}

          {/* Tight Green Perfect Shift Zone Arc */}
          <path
            d={describeGaugeArc(110, 108, 76, rpmToDeg(shiftLow), rpmToDeg(shiftHigh))}
            fill="none"
            stroke="#10b981"
            strokeWidth="9"
          />

          {/* Redline Danger Zone Arc */}
          <path
            d={describeGaugeArc(110, 108, 76, rpmToDeg(shiftHigh), END_DEG)}
            fill="none"
            stroke="#ef4444"
            strokeWidth="8"
          />

          {/* Tick Marks & Labels */}
          {tachoTicks.map((t) => (
            <g key={t.key}>
              <line
                x1={t.pInner.x}
                y1={t.pInner.y}
                x2={t.pOuter.x}
                y2={t.pOuter.y}
                stroke={t.val >= redlineRpm ? '#ef4444' : t.isMajor ? '#f8fafc' : '#64748b'}
                strokeWidth={t.isMajor ? 2.2 : 1.2}
              />
              {t.label != null ? (
                <text
                  x={t.pLabel.x}
                  y={t.pLabel.y + 3.5}
                  textAnchor="middle"
                  fill={t.val >= redlineRpm ? '#f87171' : '#e2e8f0'}
                  fontSize="11"
                  fontWeight="800"
                >
                  {t.label}
                </text>
              ) : null}
            </g>
          ))}

          <text x="110" y="76" textAnchor="middle" fill="#64748b" fontSize="8.5" fontWeight="700" letterSpacing="1">
            RPM × 1000
          </text>

          {/* Sweeping Analogue Needle */}
          <line
            x1={tachoTail.x}
            y1={tachoTail.y}
            x2={tachoTip.x}
            y2={tachoTip.y}
            stroke="#f43f5e"
            strokeWidth="3.2"
            strokeLinecap="round"
          />
          <circle cx="110" cy="108" r="7.5" fill="#1e293b" stroke="#f43f5e" strokeWidth="2.5" />

          {/* Digital Gear & RPM Pod */}
          <rect x="64" y="124" width="92" height="42" rx="8" fill="#0f172a" stroke="#334155" strokeWidth="1.5" />
          <text x="86" y="149" textAnchor="middle" fill="#fbbf24" fontSize="20" fontWeight="900">
            {isPreLaunch ? 'N' : `${gear}/${maxGears}`}
          </text>
          <text x="132" y="142" textAnchor="middle" fill="#f8fafc" fontSize="11" fontWeight="800">
            {Math.round(rpm)}
          </text>
          <text x="132" y="154" textAnchor="middle" fill="#64748b" fontSize="8" fontWeight="700">
            RPM
          </text>
        </svg>
      </div>

      {/* RIGHT DIAL: ANALOGUE SPEEDOMETER (MPH) */}
      <div className="relative rounded-2xl border border-slate-700/90 bg-slate-950/90 p-2 flex flex-col items-center shadow-inner">
        <div
          className={`mb-0.5 rounded-full px-3 py-0.5 text-[11px] font-extrabold tracking-wider uppercase border ${
            inWheelspin
              ? 'border-rose-400 bg-rose-500/25 text-rose-200 animate-pulse'
              : 'border-slate-700 bg-slate-900 text-sky-300'
          }`}
        >
          {inWheelspin ? '🛞 WHEELSPIN — TRACTION LOSS!' : `⏱️ LIVE ET: ${elapsedSec.toFixed(2)}s`}
        </div>

        <svg viewBox="0 0 220 176" className="w-full max-w-[260px] h-auto select-none">
          <circle cx="110" cy="108" r="82" fill="#090d16" stroke="#334155" strokeWidth="3" />
          <path
            d={describeGaugeArc(110, 108, 76, START_DEG, END_DEG)}
            fill="none"
            stroke="#1e293b"
            strokeWidth="8"
            strokeLinecap="round"
          />
          {clampedMph > 1 ? (
            <path
              d={describeGaugeArc(110, 108, 76, START_DEG, speedoNeedleDeg)}
              fill="none"
              stroke="#38bdf8"
              strokeWidth="7"
              strokeLinecap="round"
            />
          ) : null}

          {speedoTicks.map((t) => (
            <g key={t.key}>
              <line
                x1={t.pInner.x}
                y1={t.pInner.y}
                x2={t.pOuter.x}
                y2={t.pOuter.y}
                stroke={t.isMajor ? '#f8fafc' : '#64748b'}
                strokeWidth={t.isMajor ? 2.2 : 1.2}
              />
              {t.label != null ? (
                <text
                  x={t.pLabel.x}
                  y={t.pLabel.y + 3.5}
                  textAnchor="middle"
                  fill="#e2e8f0"
                  fontSize="9.5"
                  fontWeight="800"
                >
                  {t.label}
                </text>
              ) : null}
            </g>
          ))}

          <text x="110" y="76" textAnchor="middle" fill="#64748b" fontSize="8.5" fontWeight="700" letterSpacing="1">
            SPEED · MPH
          </text>

          {/* Sweeping Analogue Speedo Needle */}
          <line
            x1={speedoTail.x}
            y1={speedoTail.y}
            x2={speedoTip.x}
            y2={speedoTip.y}
            stroke="#38bdf8"
            strokeWidth="3.2"
            strokeLinecap="round"
          />
          <circle cx="110" cy="108" r="7.5" fill="#1e293b" stroke="#38bdf8" strokeWidth="2.5" />

          {/* Digital MPH Readout Pod */}
          <rect x="64" y="124" width="92" height="42" rx="8" fill="#0f172a" stroke="#334155" strokeWidth="1.5" />
          <text x="110" y="148" textAnchor="middle" fill="#38bdf8" fontSize="20" fontWeight="900">
            {Math.round(mph)}
          </text>
          <text x="110" y="160" textAnchor="middle" fill="#64748b" fontSize="8" fontWeight="700">
            MPH
          </text>
        </svg>
      </div>
    </div>
  );
}

export function DragRaceSandbox() {
  return <DragRacePanel sandbox isAdmin />;
}

export default function DragRacePanel({ sandbox = false, isAdmin = false }) {
  const [state, setState] = useState(() => loadDragState());
  const [tab, setTab] = useState('strip'); // 'strip' | 'garage' | 'dealership' | 'multiplayer'
  const [soundMuted, setSoundMuted] = useState(() => isDragSoundMuted());
  const [toast, setToast] = useState('');

  // Multiplayer & Leaderboard state
  const [mpProfiles, setMpProfiles] = useState([]);
  const [mpChallenges, setMpChallenges] = useState([]);
  const [mpLoading, setMpLoading] = useState(false);
  const [stakeAmount, setStakeAmount] = useState(1000);

  // Active Race UI State
  const [raceMode, setRaceMode] = useState('idle'); // 'idle' | 'staging' | 'countdown' | 'racing' | 'finished'
  const [opponent, setOpponent] = useState(() => BOT_OPPONENTS[0]);
  const [hud, setHud] = useState({
    rpm: 850,
    gear: 1,
    mph: 0,
    distM: 0,
    visualDistM: 0,
    oppDistM: 0,
    oppVisualDistM: 0,
    oppMph: 0,
    elapsedSec: 0,
    treeStep: 0, // 0=prestage, 1=amber1, 2=amber2, 3=amber3, 4=GREEN
    bannerText: '',
    bannerColour: '#38bdf8',
    n2oRemainingPct: 100,
    n2oActive: false,
    inWheelspin: false,
    decelerating: false,
  });
  const [timeSlip, setTimeSlip] = useState(null);

  const canvasRef = useRef(null);
  const raceRef = useRef(null);
  const throttleHeldRef = useRef(false);
  const stateRef = useRef(state);
  stateRef.current = state;

  const activeCarEntry = state.ownedCars[state.activeCarId] || {
    paint: 'blue',
    stripes: false,
    upgrades: { power: 0, grip: 0, gearbox: 0, nitrous: 0, weight: 0 },
  };
  const playerStats = useMemo(
    () => computeCarStats(state.activeCarId, activeCarEntry.upgrades),
    [state.activeCarId, activeCarEntry.upgrades],
  );
  const matchedBot = useMemo(() => buildMatchedBot(playerStats), [playerStats]);

  // Save state to localStorage whenever it changes
  useEffect(() => {
    saveDragState(state);
  }, [state]);

  useEffect(() => {
    if (!toast) return undefined;
    const t = window.setTimeout(() => setToast(''), 3200);
    return () => window.clearTimeout(t);
  }, [toast]);

  // Load cloud profile & multiplayer paddock
  const loadMultiplayerPaddock = async () => {
    setMpLoading(true);
    try {
      const res = await fetch('/api/getDragRacePaddock', { credentials: 'include' });
      const payload = (await readJsonResponse(res)) || {};
      if (res.ok) {
        if (Array.isArray(payload.leaderboard)) setMpProfiles(payload.leaderboard);
        if (Array.isArray(payload.challenges)) setMpChallenges(payload.challenges);
        if (payload.myState) {
          const cloudNorm = normalizeDragState(payload.myState);
          if ((cloudNorm.stats.totalEarnings || 0) > (stateRef.current.stats.totalEarnings || 0)) {
            setState(cloudNorm);
          }
        }
      }
    } catch {
      /* fallback to local/seeded rivals */
    } finally {
      setMpLoading(false);
    }
  };

  useEffect(() => {
    loadMultiplayerPaddock();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const syncRunToCloud = async (nextState, slip) => {
    try {
      await fetch('/api/saveDragRaceRun', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          state: nextState,
          bestRun: slip
            ? {
                etSec: slip.playerEt,
                trapMph: slip.playerTrapMph,
                sixtyFtSec: slip.player60Ft,
                eighthSec: slip.playerEighth,
                carId: nextState.activeCarId,
                paint: nextState.ownedCars[nextState.activeCarId]?.paint || 'blue',
                stripes: Boolean(nextState.ownedCars[nextState.activeCarId]?.stripes),
                upgrades: nextState.ownedCars[nextState.activeCarId]?.upgrades || {},
                hp: playerStats.hp,
                pi: playerStats.pi,
              }
            : null,
        }),
      });
    } catch {
      /* ignore offline */
    }
  };

  const postOpenChallenge = async () => {
    if (!state.stats.bestEtSec) {
      setToast('Set a 1/4-mile time on the strip first!');
      return;
    }
    if (state.cash < stakeAmount) {
      setToast('Not enough cash for that wager stake!');
      return;
    }
    try {
      const res = await fetch('/api/createDragRaceChallenge', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          stake: stakeAmount,
          carId: state.activeCarId,
          paint: activeCarEntry.paint,
          stripes: activeCarEntry.stripes,
          upgrades: activeCarEntry.upgrades,
          hp: playerStats.hp,
          pi: playerStats.pi,
          targetEtSec: state.stats.bestEtSec,
          targetTrapMph: state.stats.bestTrapMph,
        }),
      });
      const payload = (await readJsonResponse(res)) || {};
      if (res.ok && payload.challenge) {
        setMpChallenges((prev) => [payload.challenge, ...prev]);
        setToast(`Posted £${stakeAmount.toLocaleString()} Open Strip Challenge!`);
      } else {
        // Local fallback in dev sandbox if function not yet deployed
        const localChallenge = {
          id: `local-${Date.now()}`,
          challengerName: 'You (Open Stake)',
          carId: state.activeCarId,
          carName: playerStats.car.name,
          paint: activeCarEntry.paint,
          stripes: activeCarEntry.stripes,
          upgrades: activeCarEntry.upgrades,
          hp: playerStats.hp,
          pi: playerStats.pi,
          targetEtSec: state.stats.bestEtSec,
          targetTrapMph: state.stats.bestTrapMph,
          stake: stakeAmount,
          purse: stakeAmount * 2,
        };
        setMpChallenges((prev) => [localChallenge, ...prev]);
        setToast(`Posted £${stakeAmount.toLocaleString()} Open Challenge!`);
      }
    } catch {
      /* ignore */
    }
  };

  // Line cars up at the start line (or immediately launch the Christmas Tree countdown when beginCountdown = true)
  const prepareStrip = (oppConfig, beginCountdown = false, keepThrottle = false) => {
    if (typeof document !== 'undefined' && document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
    const targetOpp = oppConfig || opponent || BOT_OPPONENTS[0];
    const oppStats = computeCarStats(targetOpp.carId, targetOpp.upgrades || {});
    setOpponent(targetOpp);
    setTab('strip');
    setTimeSlip(null);
    const nextPhase = beginCountdown ? 'countdown' : 'staging';
    setRaceMode(nextPhase);
    if (!keepThrottle) throttleHeldRef.current = false;

    const now = performance.now();
    const initialRpm = keepThrottle && raceRef.current ? raceRef.current.rpm : playerStats.car.idleRpm;
    raceRef.current = {
      phase: nextPhase, // 'staging' (lined up) -> 'countdown' (lights dropping) -> 'racing' -> 'finished'
      phaseStartMs: now,
      lastFrameMs: now,
      treeStep: 0,
      greenDropMs: 0,
      rpm: initialRpm,
      gear: 1,
      speedMps: 0,
      distM: 0,
      visualDistM: 0,
      wheelAngle: 0,
      pitchDeg: 0,
      shiftLockUntilMs: 0,
      wheelspinUntilMs: 0,
      flameUntilMs: 0,
      flameKind: null,
      n2oRemainingSec: playerStats.nitrousDurationSec,
      n2oActive: false,
      launchGrade: null,
      perfectShifts: 0,
      goodShifts: 0,
      skillBonusCash: 0,
      reactionTimeSec: null,
      sixtyFtSec: null,
      eighthSec: null,
      eighthMph: null,
      playerEtSec: null,
      playerTrapMph: null,
      playerFinishMs: null,

      // Opponent simulation state
      oppConfig: targetOpp,
      oppStats,
      oppDistM: 0,
      oppVisualDistM: 0,
      oppSpeedMps: 0,
      oppWheelAngle: 0,
      oppPitchDeg: 0,
      oppEtSec: null,
      oppTrapMph: null,
      // Target ET if racing a real player's recorded run
      oppTargetEtSec: targetOpp.targetEtSec || null,
      smokeParticles: [],
      skidmarks: [],
    };

    if (beginCountdown) {
      playDragSfx('beep_amber');
    }

    setHud({
      rpm: initialRpm,
      gear: 1,
      mph: 0,
      distM: 0,
      visualDistM: 0,
      oppDistM: 0,
      oppVisualDistM: 0,
      oppMph: 0,
      elapsedSec: 0,
      treeStep: 0,
      bannerText: beginCountdown
        ? '🚦 LIGHTS DROPPING — FEATHER SPACEBAR TO HOLD REVS IN LAUNCH ZONE!'
        : 'CLICK "START RACE" THEN USE SPACEBAR TO SET REVS AS THE LIGHTS CHANGE!',
      bannerColour: '#fbbf24',
      n2oRemainingPct: playerStats.nitrousDurationSec > 0 ? 100 : 0,
      n2oActive: false,
      inWheelspin: false,
      decelerating: false,
    });
  };

  // Single-button race start: immediately starts the Christmas Tree countdown!
  const startRace = (oppConfig, keepThrottle = false) => {
    prepareStrip(oppConfig, true, keepThrottle);
  };

  // Select opponent & line up at start line without starting countdown yet
  const selectOpponent = (oppConfig) => {
    prepareStrip(oppConfig, false, false);
  };

  // Line up on initial mount so cars are staged at the start line
  useEffect(() => {
    if (!raceRef.current) {
      prepareStrip(BOT_OPPONENTS[0], false, false);
    }
    return () => {
      updateDragEngineAudio(850, 6500, false);
      updateWheelspinAudio(false, 0);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Shift Up handler (with launch lockout guard + exhaust pops & bangs!)
  const handleShiftUp = () => {
    const r = raceRef.current;
    if (!r || r.phase !== 'racing') return;
    // Once player crosses the finish line, car is decelerating — ignore shifts
    if (r.playerEtSec != null) return;
    const maxGears = playerStats.car.gears;
    if (r.gear >= maxGears) return;
    const now = performance.now();
    if (now < r.shiftLockUntilMs) return;

    // Anti-Accidental-Shift Guard: prevent feathering Space at launch from instantly shifting into 2nd gear!
    const sinceLaunchMs = now - r.greenDropMs;
    const minFirstGearRpm = playerStats.car.idleRpm + (playerStats.car.redlineRpm - playerStats.car.idleRpm) * 0.62;
    if (sinceLaunchMs < 850 || (r.gear === 1 && r.rpm < minFirstGearRpm)) {
      return;
    }

    const result = evaluateShift(r.rpm, playerStats);
    r.gear += 1;
    r.shiftLockUntilMs = now + playerStats.shiftMs * result.shiftDelayMult;
    r.speedMps = Math.max(2, r.speedMps + result.speedBoostMps);
    r.skillBonusCash += result.cashBonus;

    // Trigger exhaust pops & bangs visual flame + audio crackle on every gear change!
    r.flameUntilMs = now + (result.code === 'perfect' ? 430 : 280);
    r.flameKind = 'pop';
    playExhaustPopsAndBangs(result.code === 'perfect' ? 'perfect' : 'good');

    // Spawn tailpipe backfire soot/smoke puffs
    for (let i = 0; i < 4; i += 1) {
      r.smokeParticles.push({
        x: 74,
        y: 242 + (Math.random() - 0.5) * 6,
        vx: -95 - Math.random() * 55,
        vy: -6 + (Math.random() - 0.5) * 14,
        radius: 4 + Math.random() * 5,
        alpha: 0.62,
        colour: i % 2 === 0 ? '251,146,60' : '148,163,184',
      });
    }

    // Brief 2nd-gear tyre chirp/wheelspin when shifting hard from 1st -> 2nd
    if (r.gear === 2 && (result.code === 'perfect' || result.code === 'good')) {
      const chirpFactor = (playerStats.powerToWeight / 300) - (playerStats.grip - 0.7);
      if (chirpFactor > 0.12) {
        r.wheelspinUntilMs = Math.max(r.wheelspinUntilMs, now + Math.min(480, 220 + chirpFactor * 240));
      }
    }

    if (result.code === 'perfect') {
      r.perfectShifts += 1;
      r.pitchDeg = -2.6;
      playDragSfx('shift_perfect');
    } else {
      if (result.code === 'good') r.goodShifts += 1;
      r.pitchDeg = -1.4;
      playDragSfx('shift_good');
    }

    setHud((prev) => ({
      ...prev,
      gear: r.gear,
      bannerText: `${result.grade} · 💥 POPS & BANGS (${r.gear}${r.gear === 2 ? 'ND' : r.gear === 3 ? 'RD' : 'TH'} GEAR)`,
      bannerColour: result.colour,
    }));
  };

  // Trigger Nitrous Oxide
  const handleActivateNitrous = () => {
    const r = raceRef.current;
    if (!r || r.phase !== 'racing' || r.playerEtSec != null) return;
    if (r.n2oRemainingSec <= 0 || r.n2oActive) return;
    r.n2oActive = true;
    playDragSfx('nitrous');
    setHud((prev) => ({
      ...prev,
      n2oActive: true,
      bannerText: '🧪 NITROUS OXIDE PURGE ENGAGED!',
      bannerColour: '#c084fc',
    }));
  };

  // Keyboard shortcuts (Space = Rev engine as lights drop, Shift Up during race; N = Nitrous)
  useEffect(() => {
    const onKeyDown = (e) => {
      if (tab !== 'strip') return;
      const tag = e.target?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

      if (e.code === 'Space' || e.code === 'ArrowUp' || e.code === 'KeyW') {
        e.preventDefault();
        if (typeof document !== 'undefined' && document.activeElement instanceof HTMLElement) {
          document.activeElement.blur();
        }
        const r = raceRef.current;
        if (!r || r.phase === 'staging' || r.phase === 'countdown') {
          throttleHeldRef.current = true;
        } else if (r.phase === 'racing' && !e.repeat) {
          handleShiftUp();
        }
      } else if ((e.code === 'KeyN' || e.code === 'ShiftLeft' || e.code === 'ShiftRight') && raceRef.current?.phase === 'racing') {
        e.preventDefault();
        handleActivateNitrous();
      } else if (e.code === 'Enter' && (!raceRef.current || raceRef.current.phase === 'staging' || raceRef.current.phase === 'finished')) {
        e.preventDefault();
        startRace(opponent, true);
      }
    };
    const onKeyUp = (e) => {
      if (e.code === 'Space' || e.code === 'ArrowUp' || e.code === 'KeyW') {
        throttleHeldRef.current = false;
      }
    };
    window.addEventListener('keydown', onKeyDown, { capture: true });
    window.addEventListener('keyup', onKeyUp, { capture: true });
    return () => {
      window.removeEventListener('keydown', onKeyDown, { capture: true });
      window.removeEventListener('keyup', onKeyUp, { capture: true });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, playerStats, opponent]);

  // Main 60fps Canvas & Quarter-Mile Physics Loop
  useEffect(() => {
    let rafId = 0;

    const stepFrame = (now) => {
      rafId = window.requestAnimationFrame(stepFrame);
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const r = raceRef.current;
      const dt = r ? Math.min(0.05, Math.max(0.001, (now - r.lastFrameMs) / 1000)) : 0.016;
      if (r) r.lastFrameMs = now;

      // --- 1. UPDATE PHYSICS ---
      if (r && (r.phase === 'staging' || r.phase === 'countdown')) {
        const idle = playerStats.car.idleRpm;
        const redline = playerStats.car.redlineRpm;
        if (throttleHeldRef.current) {
          r.rpm = Math.min(redline, r.rpm + (redline - idle) * 1.55 * dt);
          r.pitchDeg = -1.6;
          // Rev-limiter bounce & exhaust pop at redline
          if (r.rpm >= redline - 40) {
            r.rpm = redline - 150 + Math.random() * 150;
            r.flameUntilMs = now + 70;
            r.flameKind = 'pop';
          }
          // Staging burnout smoke puffs
          if (Math.random() < 0.45) {
            r.smokeParticles.push({
              x: 92,
              y: 235 + (Math.random() - 0.5) * 8,
              vx: -35 - Math.random() * 35,
              vy: -8 - Math.random() * 12,
              radius: 5 + Math.random() * 6,
              alpha: 0.48,
            });
          }
        } else {
          r.rpm = Math.max(idle, r.rpm - (redline - idle) * 1.2 * dt);
          r.pitchDeg *= 0.9;
        }

        updateDragEngineAudio(r.rpm, redline, tab === 'strip' && (r.phase === 'countdown' || throttleHeldRef.current || r.rpm > idle + 80));
        updateWheelspinAudio(false, 0);

        // Keep HUD Tachometer & RPM readout synced every frame during staging & countdown!
        setHud((prev) => (
          Math.abs(prev.rpm - r.rpm) > 3 || prev.treeStep !== r.treeStep
            ? { ...prev, rpm: r.rpm, treeStep: r.treeStep }
            : prev
        ));

        if (r.phase === 'countdown') {
          const cElapsed = (now - r.phaseStartMs) / 1000;
          // 0.0-0.8s: Stage (0) -> 0.8-1.6s: Amber 1 (1) -> 1.6-2.4s: Amber 2 (2) -> 2.4-3.2s: Amber 3 (3) -> 3.2s: GREEN (4)
          const nextStep = cElapsed < 0.8 ? 0 : cElapsed < 1.6 ? 1 : cElapsed < 2.4 ? 2 : cElapsed < 3.2 ? 3 : 4;
          if (nextStep !== r.treeStep) {
            r.treeStep = nextStep;
            if (nextStep >= 1 && nextStep <= 3) {
              playDragSfx('beep_amber');
            } else if (nextStep === 4) {
              // GREEN LIGHT DROPS — EVALUATE LAUNCH!
              playDragSfx('beep_green');
              r.phase = 'racing';
              r.greenDropMs = now;
              const launch = evaluateLaunch(r.rpm, playerStats);
              r.launchGrade = launch;
              r.skillBonusCash += launch.cashBonus;
              r.reactionTimeSec = +(0.045 + Math.random() * 0.09).toFixed(3);
              if (launch.wheelspinSec > 0) {
                r.wheelspinUntilMs = now + launch.wheelspinSec * 1000;
              }
              // Clutch engagement launch impulse proportional to launch quality & power-to-weight
              const ptwRatio = Math.max(0.05, playerStats.hp / playerStats.weightKg);
              const baseImpulse = launch.code === 'perfect'
                ? 4.2
                : launch.code === 'good'
                  ? 3.0
                  : launch.code === 'wheelspin'
                    ? 2.1
                    : 1.1;
              r.speedMps = baseImpulse * (0.75 + Math.min(1.4, ptwRatio * 4.5));
              r.pitchDeg = launch.code === 'perfect' ? -3.6 : launch.code === 'good' ? -2.3 : -0.9;
              setRaceMode('racing');
              setHud((prev) => ({
                ...prev,
                treeStep: 4,
                inWheelspin: launch.wheelspinSec > 0,
                bannerText: `${launch.grade} (${Math.round(r.rpm)} RPM)`,
                bannerColour: launch.colour,
              }));
            }
          }
        }
      } else if (r && r.phase === 'racing') {
        const raceElapsedSec = (now - r.greenDropMs) / 1000;
        const maxGears = playerStats.car.gears;
        const topSpeedMps = (playerStats.topSpeedMph * 1.12) / 2.23694;

        // Gear speed brackets (smooth progression from 1st gear up to top gear)
        const gearTopMps = [];
        for (let g = 1; g <= maxGears; g += 1) {
          const frac = 0.25 + 0.75 * (((g - 1) / Math.max(1, maxGears - 1)) ** 0.86);
          gearTopMps.push(topSpeedMps * frac);
        }
        const curGearTop = gearTopMps[r.gear - 1];
        const prevGearTop = r.gear > 1 ? gearTopMps[r.gear - 2] * 0.68 : 0;

        const inShiftPause = now < r.shiftLockUntilMs;
        const inWheelspin = r.playerEtSec == null && now < r.wheelspinUntilMs;
        const atLimiter = r.playerEtSec == null && r.speedMps >= curGearTop * 0.995;

        // --- A) BEFORE FINISH LINE: FULL THROTTLE ACCELERATION ---
        if (r.playerEtSec == null) {
          // Nitrous tick
          let n2oPowerAdd = 0;
          if (r.n2oActive && r.n2oRemainingSec > 0) {
            r.n2oRemainingSec = Math.max(0, r.n2oRemainingSec - dt);
            n2oPowerAdd = playerStats.nitrousHpBonus;
            r.flameUntilMs = now + 80;
            r.flameKind = 'nitrous';
            if (r.n2oRemainingSec <= 0) {
              r.n2oActive = false;
            }
          }

          // Powerband torque curve (peaks around 70-92% of redline)
          const rpmNorm = (r.rpm - playerStats.car.idleRpm) / (playerStats.car.redlineRpm - playerStats.car.idleRpm);
          const torqueCurve = rpmNorm < 0.35 ? 0.74 + rpmNorm * 0.65 : rpmNorm <= 0.94 ? 0.97 + (rpmNorm - 0.35) * 0.28 : 0.76;

          // Mechanical torque multiplication per gear (1st gear pulls hardest, tapering in top gears)
          const gearTorqueTable = [2.25, 1.68, 1.32, 1.1, 0.95, 0.85, 0.78];
          const gearTorqueMult = gearTorqueTable[Math.min(gearTorqueTable.length - 1, r.gear - 1)] || 0.85;

          if (!inShiftPause && !atLimiter) {
            const effectiveHp = playerStats.hp + n2oPowerAdd;
            const powerToMass = effectiveHp / playerStats.weightKg; // bhp/kg
            const launchGripMult = r.launchGrade ? r.launchGrade.gripMult : 1;
            const tractionMult = inWheelspin
              ? 0.52
              : r.gear === 1
                ? Math.min(1.25, playerStats.grip * launchGripMult)
                : Math.min(1.2, 0.86 + playerStats.grip * 0.28);
            const aeroDrag = 0.00022 * r.speedMps * r.speedMps;
            const accelMps2 = Math.max(0.8, powerToMass * 40 * gearTorqueMult * torqueCurve * tractionMult - aeroDrag);
            r.speedMps = Math.min(curGearTop, r.speedMps + accelMps2 * dt);
          } else if (atLimiter && r.gear < maxGears) {
            // Bouncing off rev limiter holds speed at gear ceiling & pops exhaust!
            r.speedMps = curGearTop * (0.988 + Math.random() * 0.01);
            if (Math.random() < 0.25) {
              r.flameUntilMs = now + 60;
              r.flameKind = 'pop';
            }
          }

          // Compute live RPM from current gear speed (plus wheelspin flare when spinning tyres!)
          const gearSpan = Math.max(1, curGearTop - prevGearTop);
          const gearProg = Math.max(0, Math.min(1.02, (r.speedMps - prevGearTop) / gearSpan));
          const spinRpmFlare = inWheelspin ? 650 + Math.sin(now * 0.045) * 220 : 0;
          r.rpm = Math.min(
            playerStats.car.redlineRpm,
            playerStats.car.idleRpm + gearProg * (playerStats.car.redlineRpm - playerStats.car.idleRpm) + spinRpmFlare,
          );
          if (atLimiter) {
            r.rpm = playerStats.car.redlineRpm - 110 + Math.random() * 110;
          }

          r.distM += r.speedMps * dt;
          r.visualDistM = r.distM;
          r.wheelAngle += ((inWheelspin ? r.speedMps * 2.1 : r.speedMps) * dt) / 0.32;
          r.pitchDeg = r.n2oActive ? -2.8 : r.pitchDeg * 0.94;

          // Visible Wheelspin: Lay down dual black rubber skidmarks + billowing tyre smoke from driven axle(s)!
          if (inWheelspin) {
            const drive = playerStats.car.drivetrain;
            r.skidmarks.push({
              m: r.visualDistM,
              drive,
            });
            if (r.skidmarks.length > 260) r.skidmarks.shift();

            const curPlayerX = 64 + Math.min(44, (r.speedMps * 2.23694) * 0.22);
            const smokeAxles = drive === 'AWD' ? [45, 146] : drive === 'FWD' ? [146] : [45];
            for (const axleX of smokeAxles) {
              r.smokeParticles.push({
                x: curPlayerX + axleX - 8 + (Math.random() - 0.5) * 10,
                y: 246 + (Math.random() - 0.5) * 6,
                vx: -85 - Math.random() * 65,
                vy: -12 - Math.random() * 18,
                radius: 8 + Math.random() * 8,
                alpha: 0.68,
              });
            }
          }

          if (r.sixtyFtSec == null && r.distM >= 18.288) {
            r.sixtyFtSec = +raceElapsedSec.toFixed(3);
          }
          if (r.eighthSec == null && r.distM >= QUARTER_MILE_METERS / 2) {
            r.eighthSec = +raceElapsedSec.toFixed(3);
            r.eighthMph = +(r.speedMps * 2.23694).toFixed(1);
          }
          if (r.distM >= QUARTER_MILE_METERS) {
            // CROSSED 1/4-MILE FINISH LINE — IMMEDIATELY BACK OFF THROTTLE & DECELERATE!
            r.distM = QUARTER_MILE_METERS;
            r.playerEtSec = +raceElapsedSec.toFixed(3);
            r.playerTrapMph = +(r.speedMps * 2.23694).toFixed(1);
            r.playerFinishMs = now;
            r.n2oActive = false;
            r.wheelspinUntilMs = 0;
            r.flameUntilMs = now + 520;
            r.flameKind = 'pop';
            playExhaustPopsAndBangs('decel');
          }
        } else {
          // --- B) POST-FINISH SHUTDOWN ZONE: THROTTLE OFF, OVERRUN POPS & BRAKING DECELERATION ---
          const decelMps2 = 14.5 + r.speedMps * 0.28;
          r.speedMps = Math.max(2.2, r.speedMps - decelMps2 * dt);
          r.rpm = Math.max(
            playerStats.car.idleRpm,
            r.rpm - (playerStats.car.redlineRpm - playerStats.car.idleRpm) * 0.92 * dt,
          );
          r.visualDistM += r.speedMps * dt;
          r.wheelAngle += (r.speedMps * dt) / 0.32;
          r.pitchDeg = 1.65; // Front-end nose dive under braking

          // Occasional overrun exhaust pop & flame as revs drop
          if (Math.random() < 0.07 && r.rpm > playerStats.car.idleRpm + 500) {
            r.flameUntilMs = now + 130;
            r.flameKind = 'pop';
          }
        }

        // --- Opponent Simulation (with post-finish deceleration) ---
        if (r.oppEtSec == null) {
          const targetEt = r.oppTargetEtSec || (r.oppStats.estEtSec / Math.max(0.65, r.oppConfig.skill || 0.8));
          const progressRatio = Math.max(0, raceElapsedSec / Math.max(5.5, targetEt));
          const nextOppDist = QUARTER_MILE_METERS * (progressRatio ** 1.56);
          r.oppSpeedMps = Math.max(0, (nextOppDist - r.oppDistM) / dt);
          r.oppDistM = Math.min(QUARTER_MILE_METERS, nextOppDist);
          r.oppVisualDistM = r.oppDistM;
          r.oppWheelAngle += (r.oppSpeedMps * dt) / 0.32;
          r.oppPitchDeg = raceElapsedSec < 1.2 ? -2.2 : -0.5;

          if (r.oppDistM >= QUARTER_MILE_METERS) {
            r.oppDistM = QUARTER_MILE_METERS;
            r.oppEtSec = +raceElapsedSec.toFixed(3);
            r.oppTrapMph = +(r.oppSpeedMps * 2.23694 * 0.88).toFixed(1);
          }
        } else {
          // Opponent backs off and decelerates past the finish line too
          r.oppSpeedMps = Math.max(2.2, r.oppSpeedMps - (13.5 + r.oppSpeedMps * 0.25) * dt);
          r.oppVisualDistM = (r.oppVisualDistM ?? QUARTER_MILE_METERS) + r.oppSpeedMps * dt;
          r.oppWheelAngle += (r.oppSpeedMps * dt) / 0.32;
          r.oppPitchDeg = 1.4;
        }

        // Complete race after player has decelerated through the shutdown zone (~1.8s after crossing finish)
        const playerShutdownDone = r.playerFinishMs != null && now - r.playerFinishMs >= 1800;
        if (
          (playerShutdownDone && (r.oppEtSec != null || now - r.playerFinishMs >= 2400))
          || (r.oppEtSec != null && raceElapsedSec - r.oppEtSec > 3.5)
        ) {
          if (r.playerEtSec == null) {
            r.playerEtSec = +(raceElapsedSec + (QUARTER_MILE_METERS - r.distM) / Math.max(10, r.speedMps)).toFixed(3);
            r.playerTrapMph = +(r.speedMps * 2.23694).toFixed(1);
          }
          if (r.oppEtSec == null) {
            const targetEt = r.oppTargetEtSec || (r.oppStats.estEtSec / Math.max(0.65, r.oppConfig.skill || 0.8));
            r.oppEtSec = +Math.max(r.playerEtSec + 0.12, targetEt).toFixed(3);
            r.oppTrapMph = +(r.oppSpeedMps * 2.23694 * 0.88).toFixed(1);
          }

          r.phase = 'finished';
          updateDragEngineAudio(850, playerStats.car.redlineRpm, false);
          updateWheelspinAudio(false, 0);
          const playerWon = r.playerEtSec <= r.oppEtSec;
          const basePrize = playerWon
            ? (r.oppConfig.purse || 500)
            : (r.oppConfig.runnerUpPurse || 100);
          const totalPrize = basePrize + r.skillBonusCash;

          if (playerWon) playDragSfx('win');

          const slip = {
            playerWon,
            isMultiplayer: Boolean(r.oppConfig.isMultiplayer),
            oppName: r.oppConfig.name,
            oppCarName: getCarById(r.oppConfig.carId).name,
            reactionTimeSec: r.reactionTimeSec || 0.085,
            player60Ft: r.sixtyFtSec || +(r.playerEtSec * 0.16).toFixed(3),
            playerEighth: r.eighthSec || +(r.playerEtSec * 0.64).toFixed(3),
            playerEighthMph: r.eighthMph || +(r.playerTrapMph * 0.79).toFixed(1),
            playerEt: r.playerEtSec,
            playerTrapMph: r.playerTrapMph,
            oppEt: r.oppEtSec,
            oppTrapMph: r.oppTrapMph,
            marginSec: +Math.abs(r.playerEtSec - r.oppEtSec).toFixed(3),
            launchGrade: r.launchGrade?.grade || 'GOOD LAUNCH',
            perfectShifts: r.perfectShifts,
            basePrize,
            skillBonusCash: r.skillBonusCash,
            totalPrize,
          };

          setTimeSlip(slip);
          setRaceMode('finished');

          // Credit player wallet & update personal best stats
          setState((prev) => {
            const prevBest = prev.stats.bestEtSec;
            const isNewBest = prevBest == null || slip.playerEt < prevBest;
            const nextState = {
              ...prev,
              cash: prev.cash + totalPrize,
              stats: {
                ...prev.stats,
                racesRun: (prev.stats.racesRun || 0) + 1,
                botWins: (prev.stats.botWins || 0) + (playerWon && !slip.isMultiplayer ? 1 : 0),
                multiplayerWins: (prev.stats.multiplayerWins || 0) + (playerWon && slip.isMultiplayer ? 1 : 0),
                bestEtSec: isNewBest ? slip.playerEt : prevBest,
                bestTrapMph: Math.max(prev.stats.bestTrapMph || 0, slip.playerTrapMph),
                bestCarId: isNewBest ? prev.activeCarId : prev.stats.bestCarId,
                bestCarName: isNewBest ? playerStats.car.name : prev.stats.bestCarName,
                totalEarnings: (prev.stats.totalEarnings || 0) + totalPrize,
              },
            };
            syncRunToCloud(nextState, slip);
            return nextState;
          });
        }

        updateDragEngineAudio(r.rpm, playerStats.car.redlineRpm, tab === 'strip' && r.phase === 'racing');
        updateWheelspinAudio(
          tab === 'strip' && r.phase === 'racing' && inWheelspin,
          r.launchGrade?.code === 'wheelspin' ? 0.95 : 0.65,
        );

        // Update HUD every frame
        setHud((prev) => ({
          ...prev,
          rpm: r.rpm,
          gear: r.gear,
          mph: r.speedMps * 2.23694,
          distM: r.distM,
          visualDistM: r.visualDistM,
          oppDistM: r.oppDistM,
          oppVisualDistM: r.oppVisualDistM,
          oppMph: r.oppSpeedMps * 2.23694,
          elapsedSec: r.playerEtSec != null ? r.playerEtSec : raceElapsedSec,
          inWheelspin,
          decelerating: r.playerEtSec != null,
          bannerText:
            r.playerEtSec != null
              ? `🏁 FINISH ${r.playerEtSec.toFixed(3)}s @ ${r.playerTrapMph} MPH — SHUTTING DOWN & BRAKING!`
              : atLimiter && r.gear < maxGears
                ? `⚠️ REV LIMITER IN ${r.gear}${r.gear === 1 ? 'ST' : r.gear === 2 ? 'ND' : r.gear === 3 ? 'RD' : 'TH'} GEAR — TAP SPACE TO SHIFT UP!`
                : prev.bannerText,
          bannerColour:
            r.playerEtSec != null
              ? '#34d399'
              : atLimiter && r.gear < maxGears
                ? '#f97316'
                : prev.bannerColour,
          n2oRemainingPct:
            playerStats.nitrousDurationSec > 0
              ? Math.round((r.n2oRemainingSec / playerStats.nitrousDurationSec) * 100)
              : 0,
          n2oActive: r.n2oActive,
        }));
      }

      // --- 2. RENDER 2D DRAG STRIP CANVAS ---
      const W = canvas.width;
      const H = canvas.height;
      const PX_PER_METER = 28; // 28 px per world meter
      const worldScrollM = r ? (r.visualDistM ?? r.distM) : 0;
      const camWorldX = worldScrollM * PX_PER_METER;
      const currentMps = r && r.phase === 'racing' ? r.speedMps : 0;
      const currentMph = currentMps * 2.23694;
      const playerScreenX = 64 + Math.min(44, currentMph * 0.22);

      // Dusk Stadium Sky Gradient
      const skyGrad = ctx.createLinearGradient(0, 0, 0, 115);
      skyGrad.addColorStop(0, '#090d16');
      skyGrad.addColorStop(0.6, '#1e1b4b');
      skyGrad.addColorStop(1, '#312e81');
      ctx.fillStyle = skyGrad;
      ctx.fillRect(0, 0, W, 115);

      // Distant Horizon Skyline Silhouette (Parallax 0.14x, 480px period)
      const horizonPeriod = 480;
      const horizonOffset = -((camWorldX * 0.14) % horizonPeriod);
      ctx.fillStyle = 'rgba(15, 23, 42, 0.72)';
      for (let hx = horizonOffset - horizonPeriod; hx < W + horizonPeriod; hx += horizonPeriod) {
        ctx.fillRect(hx + 20, 44, 70, 54);
        ctx.fillRect(hx + 115, 32, 48, 66);
        ctx.fillRect(hx + 190, 50, 95, 48);
        ctx.fillRect(hx + 310, 38, 62, 60);
        ctx.fillRect(hx + 395, 48, 65, 50);
      }

      // Stadium Floodlights & Distant Grandstands (Parallax 0.42x, 360px period)
      const standPeriod = 360;
      const standOffset = -((camWorldX * 0.42) % standPeriod);
      for (let sx = standOffset - standPeriod; sx < W + standPeriod; sx += standPeriod) {
        // Floodlight tower
        ctx.fillStyle = '#334155';
        ctx.fillRect(sx + 150, 14, 6, 82);
        ctx.fillStyle = '#fef9c3';
        ctx.fillRect(sx + 132, 8, 42, 10);
        // Glow halo
        const halo = ctx.createRadialGradient(sx + 153, 14, 2, sx + 153, 14, 54);
        halo.addColorStop(0, 'rgba(254,249,195,0.38)');
        halo.addColorStop(1, 'rgba(254,249,195,0)');
        ctx.fillStyle = halo;
        ctx.beginPath();
        ctx.arc(sx + 153, 14, 54, 0, Math.PI * 2);
        ctx.fill();

        // Grandstand bleachers with tiered roof
        ctx.fillStyle = '#1e293b';
        ctx.fillRect(sx + 18, 56, 265, 40);
        ctx.fillStyle = '#475569';
        ctx.fillRect(sx + 14, 54, 273, 5);
        ctx.fillStyle = '#38bdf8';
        ctx.fillRect(sx + 26, 72, 248, 3);
      }

      // Track Sponsor Wall & Catch Fence (Parallax 0.78x, 640px period with 4 distinct boards)
      const wallPeriod = 640;
      const wallOffset = -((camWorldX * 0.78) % wallPeriod);
      ctx.fillStyle = '#0f172a';
      ctx.fillRect(0, 96, W, 24);
      const sponsors = [
        { bg: '#1d4ed8', fg: '#f8fafc', text: 'COUNTRY LION DRAGWAY' },
        { bg: '#b91c1c', fg: '#fef08a', text: 'QUARTER-MILE CLASH · 1320 FT' },
        { bg: '#047857', fg: '#ecfdf5', text: 'STAGE 5 PERFORMANCE GARAGE' },
        { bg: '#6d28d9', fg: '#f3e8ff', text: 'NITRO OXIDE PRO SERIES' },
      ];
      for (let wx = wallOffset - wallPeriod; wx < W + wallPeriod; wx += wallPeriod) {
        sponsors.forEach((sp, idx) => {
          const bx = wx + idx * 160;
          ctx.fillStyle = sp.bg;
          ctx.fillRect(bx + 6, 99, 148, 18);
          ctx.fillStyle = sp.fg;
          ctx.font = 'bold 9.5px system-ui, sans-serif';
          ctx.fillText(sp.text, bx + 13, 112);
          // Vertical catch-fence stanchion post
          ctx.fillStyle = '#64748b';
          ctx.fillRect(bx + 156, 88, 3, 32);
        });
      }

      // Asphalt 2-Lane Drag Strip
      const roadGrad = ctx.createLinearGradient(0, 120, 0, H);
      roadGrad.addColorStop(0, '#1e293b');
      roadGrad.addColorStop(0.5, '#0f172a');
      roadGrad.addColorStop(1, '#1e293b');
      ctx.fillStyle = roadGrad;
      ctx.fillRect(0, 120, W, H - 120);

      // Rubber Launch Groove & Speed-Scaled Asphalt Grain Streaks (1.0x world speed)
      const grainPeriod = 340;
      const grainOffset = -(camWorldX % grainPeriod);
      const streakLen = Math.min(115, 10 + currentMps * 1.45);
      const streakAlpha = Math.min(0.42, 0.1 + currentMps * 0.004);
      ctx.fillStyle = `rgba(148, 163, 184, ${streakAlpha.toFixed(3)})`;
      const grainSeeds = [
        { x: 18, y: 138 },
        { x: 96, y: 228 },
        { x: 154, y: 164 },
        { x: 218, y: 244 },
        { x: 276, y: 148 },
        { x: 312, y: 212 },
      ];
      for (let gx = grainOffset - grainPeriod; gx < W + grainPeriod; gx += grainPeriod) {
        for (const gs of grainSeeds) {
          ctx.fillRect(gx + gs.x, gs.y, streakLen, 2);
        }
      }

      // Concrete Track Expansion Joints every 15m (420px apart — zero strobe aliasing at any speed)
      const jointSpacingPx = 15 * PX_PER_METER; // 420px
      const jointOffset = -(camWorldX % jointSpacingPx);
      ctx.strokeStyle = 'rgba(71, 85, 105, 0.48)';
      ctx.lineWidth = 2;
      for (let jx = jointOffset - jointSpacingPx; jx < W + jointSpacingPx; jx += jointSpacingPx) {
        ctx.beginPath();
        ctx.moveTo(jx, 125);
        ctx.lineTo(jx, H - 6);
        ctx.stroke();
      }

      // Wide Non-Aliasing Red & White Track Kerbs (180px period = 90px red + 90px white)
      const kerbPeriod = 180;
      const kerbHalf = kerbPeriod / 2;
      const kerbOffset = -(camWorldX % kerbPeriod);
      for (let kx = kerbOffset - kerbPeriod; kx < W + kerbPeriod; kx += kerbPeriod) {
        ctx.fillStyle = '#ef4444';
        ctx.fillRect(kx, 120, kerbHalf, 6);
        ctx.fillRect(kx, H - 6, kerbHalf, 6);
        ctx.fillStyle = '#f8fafc';
        ctx.fillRect(kx + kerbHalf, 120, kerbHalf, 6);
        ctx.fillRect(kx + kerbHalf, H - 6, kerbHalf, 6);
      }

      // Wide Non-Aliasing Centre Lane Dashed Line (160px period = 96px dash + 64px gap)
      const dashPeriod = 160;
      const dashOffset = -(camWorldX % dashPeriod);
      ctx.fillStyle = '#facc15';
      for (let dx = dashOffset - dashPeriod; dx < W + dashPeriod; dx += dashPeriod) {
        ctx.fillRect(dx, 191, 96, 3);
      }

      // Frequent World-Space Distance Markers & Trackside Boards (every ~25m so motion is unmistakable)
      const markers = [
        { m: 0, label: 'START LINE', major: true },
        { m: 18.288, label: '60 FT', major: false },
        { m: 50, label: '165 FT', major: false },
        { m: 100.584, label: '330 FT', major: true },
        { m: 150, label: '500 FT', major: false },
        { m: 201.168, label: '1/8 MILE · 660 FT', major: true },
        { m: 250, label: '820 FT', major: false },
        { m: 304.8, label: '1000 FT', major: true },
        { m: 350, label: '1150 FT', major: false },
        { m: QUARTER_MILE_METERS, label: 'FINISH · 1/4 MILE', major: true },
      ];
      for (const mk of markers) {
        const mx = playerScreenX + 165 + (mk.m - worldScrollM) * PX_PER_METER;
        if (mx < -120 || mx > W + 120) continue;
        if (mk.m === QUARTER_MILE_METERS || mk.m === 0) {
          // Chequered Start / Finish Strip
          for (let row = 0; row < 10; row += 1) {
            ctx.fillStyle = row % 2 === 0 ? '#f8fafc' : '#0f172a';
            ctx.fillRect(mx, 125 + row * 14, 8, 14);
            ctx.fillStyle = row % 2 === 1 ? '#f8fafc' : '#0f172a';
            ctx.fillRect(mx + 8, 125 + row * 14, 8, 14);
          }
        } else {
          ctx.strokeStyle = mk.major ? 'rgba(250,204,21,0.45)' : 'rgba(255,255,255,0.22)';
          ctx.lineWidth = mk.major ? 2.5 : 1.5;
          ctx.beginPath();
          ctx.moveTo(mx, 125);
          ctx.lineTo(mx, H - 6);
          ctx.stroke();
        }
        // Trackside distance marker bollard sign
        ctx.fillStyle = mk.major ? '#facc15' : '#1e293b';
        ctx.fillRect(mx - 26, H - 24, 68, 15);
        ctx.fillStyle = mk.major ? '#0f172a' : '#e2e8f0';
        ctx.font = 'bold 9.5px system-ui, sans-serif';
        ctx.fillText(mk.label, mx - 21, H - 13);
      }

      // Christmas Tree at Start Line
      const treeX = playerScreenX + 185 - camWorldX;
      if (treeX > -60 && treeX < W + 60) {
        ctx.fillStyle = '#0f172a';
        ctx.strokeStyle = '#475569';
        ctx.lineWidth = 2;
        ctx.fillRect(treeX - 14, 126, 28, 72);
        ctx.strokeRect(treeX - 14, 126, 28, 72);

        const step = r ? r.treeStep : 0;
        // Pre-stage & Stage bulbs
        ctx.fillStyle = '#fde047';
        ctx.beginPath();
        ctx.arc(treeX - 5, 134, 3, 0, Math.PI * 2);
        ctx.arc(treeX + 5, 134, 3, 0, Math.PI * 2);
        ctx.fill();

        // 3 Amber Bulbs
        [1, 2, 3].forEach((idx, i) => {
          ctx.fillStyle = step >= idx ? '#f59e0b' : '#334155';
          ctx.beginPath();
          ctx.arc(treeX, 146 + i * 12, 4.2, 0, Math.PI * 2);
          ctx.fill();
        });
        // Green Bulb
        ctx.fillStyle = step === 4 ? '#22c55e' : '#1e293b';
        ctx.beginPath();
        ctx.arc(treeX, 184, 5, 0, Math.PI * 2);
        ctx.fill();
      }

      // Draw Dual Black Rubber Wheelspin Skidmarks on Player Lane Tarmac
      if (r && r.skidmarks && r.skidmarks.length > 0) {
        ctx.fillStyle = 'rgba(9, 13, 22, 0.72)';
        for (const sk of r.skidmarks) {
          const sxBase = playerScreenX + (sk.m - worldScrollM) * PX_PER_METER;
          if (sxBase < -60 || sxBase > W + 40) continue;
          const axles = sk.drive === 'AWD' ? [45, 146] : sk.drive === 'FWD' ? [146] : [45];
          for (const ax of axles) {
            ctx.fillRect(sxBase + ax - 14, 245, 18, 3);
            ctx.fillRect(sxBase + ax - 14, 250, 18, 2.5);
          }
        }
      }

      // Draw Opponent Car in Far Lane (top lane)
      const oppCarId = r ? r.oppConfig.carId : opponent.carId;
      const oppPaint = r ? r.oppConfig.paint : opponent.paint;
      const oppScrollM = r ? (r.oppVisualDistM ?? r.oppDistM) : 0;
      const oppDeltaM = oppScrollM - worldScrollM;
      const oppScreenX = Math.max(-220, Math.min(W + 40, playerScreenX + oppDeltaM * 16));
      drawCanvasCar(ctx, {
        x: oppScreenX,
        y: 122,
        carId: oppCarId,
        paint: oppPaint,
        stripes: Boolean(r?.oppConfig?.stripes),
        upgradeLevel: r?.oppConfig?.upgrades?.power || 0,
        wheelAngle: r ? r.oppWheelAngle : 0,
        pitchDeg: r ? r.oppPitchDeg : 0,
        flameKind: null,
        isWheelspinning: false,
        parachuteOpen: Boolean(r && r.oppEtSec != null && r.oppTrapMph > 125),
        label: r ? r.oppConfig.name : opponent.name,
        mph: r ? r.oppSpeedMps * 2.23694 : 0,
      });

      // Draw Tire & Exhaust Smoke Particles
      if (r && r.smokeParticles.length) {
        for (let i = r.smokeParticles.length - 1; i >= 0; i -= 1) {
          const p = r.smokeParticles[i];
          p.x += p.vx * dt;
          p.y += p.vy * dt;
          p.radius += 22 * dt;
          p.alpha -= 0.58 * dt;
          if (p.alpha <= 0) {
            r.smokeParticles.splice(i, 1);
            continue;
          }
          const rgb = p.colour || '226,232,240';
          ctx.fillStyle = `rgba(${rgb},${p.alpha.toFixed(2)})`;
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      // Draw Player Car in Near Lane (bottom lane)
      const showFlame = r && now < r.flameUntilMs ? r.flameKind : null;
      const playerWheelspinning = Boolean(r && r.phase === 'racing' && r.playerEtSec == null && now < r.wheelspinUntilMs);
      const playerParachute = Boolean(
        r && r.playerEtSec != null && (playerStats.car.tier >= 6 || (activeCarEntry.upgrades.weight || 0) >= 4 || r.playerTrapMph > 120),
      );
      drawCanvasCar(ctx, {
        x: playerScreenX,
        y: 192,
        carId: stateRef.current.activeCarId,
        paint: activeCarEntry.paint,
        stripes: activeCarEntry.stripes,
        upgradeLevel: activeCarEntry.upgrades.power || 0,
        wheelAngle: r ? r.wheelAngle : 0,
        pitchDeg: r ? r.pitchDeg : 0,
        flameKind: showFlame,
        isWheelspinning: playerWheelspinning,
        parachuteOpen: playerParachute,
        label: `YOU (${playerStats.car.shortName})`,
        mph: r ? r.speedMps * 2.23694 : 0,
      });

      // High-Speed Aerodynamic Wind / Motion Blur Streaks (scales above 50 MPH & during Nitrous)
      if (currentMph > 50 || r?.n2oActive) {
        const speedFactor = Math.min(1, Math.max(0, (currentMph - 45) / 140));
        const windAlpha = r?.n2oActive ? Math.max(0.38, speedFactor * 0.5) : speedFactor * 0.32;
        const windLen = 35 + speedFactor * 110 + (r?.n2oActive ? 45 : 0);
        ctx.strokeStyle = r?.n2oActive
          ? `rgba(56, 189, 248, ${windAlpha.toFixed(2)})`
          : `rgba(248, 250, 252, ${windAlpha.toFixed(2)})`;
        ctx.lineWidth = r?.n2oActive ? 2 : 1.4;
        const windLines = [132, 168, 206, 248];
        windLines.forEach((wy, idx) => {
          const wx = W - (((camWorldX * 1.35 + idx * 230) % (W + 200)) - 100);
          ctx.beginPath();
          ctx.moveTo(wx, wy);
          ctx.lineTo(wx + windLen, wy);
          ctx.stroke();
        });
      }
    };

    rafId = window.requestAnimationFrame(stepFrame);
    return () => window.cancelAnimationFrame(rafId);
  }, [playerStats, activeCarEntry, opponent]);

  // Garage Upgrade Purchase
  const buyUpgrade = (categoryId) => {
    const curLv = activeCarEntry.upgrades[categoryId] || 0;
    const cost = getUpgradeCost(playerStats.car, categoryId, curLv);
    if (curLv >= 5 || state.cash < cost) return;
    playDragSfx('upgrade');
    setState((prev) => {
      const entry = prev.ownedCars[prev.activeCarId];
      return {
        ...prev,
        cash: prev.cash - cost,
        ownedCars: {
          ...prev.ownedCars,
          [prev.activeCarId]: {
            ...entry,
            upgrades: {
              ...entry.upgrades,
              [categoryId]: curLv + 1,
            },
          },
        },
      };
    });
    const cat = UPGRADE_CATEGORIES.find((c) => c.id === categoryId);
    setToast(`Installed ${cat?.levels?.[curLv + 1] || cat?.name} on ${playerStats.car.shortName}!`);
  };

  // Dealership Car Purchase / Equip
  const buyOrSelectCar = (car) => {
    if (state.ownedCars[car.id]) {
      setState((prev) => ({ ...prev, activeCarId: car.id }));
      setToast(`Equipped ${car.name}`);
      return;
    }
    if (state.cash < car.cost) {
      setToast(`Need £${(car.cost - state.cash).toLocaleString()} more to buy ${car.shortName}`);
      return;
    }
    playDragSfx('win');
    setState((prev) => ({
      ...prev,
      cash: prev.cash - car.cost,
      activeCarId: car.id,
      ownedCars: {
        ...prev.ownedCars,
        [car.id]: {
          paint: car.defaultPaint,
          stripes: false,
          upgrades: { power: 0, grip: 0, gearbox: 0, nitrous: 0, weight: 0 },
        },
      },
    }));
    setToast(`🎉 Purchased ${car.name}!`);
  };

  // Redline RPM for Analogue Tachometer
  const redline = playerStats.car.redlineRpm;

  return (
    <div className="w-full max-w-6xl mx-auto space-y-4">
      <GameUiPanel title="Quarter-Mile Clash · 2D Drag Racing" header="blue" dark className="overflow-visible">
        <div className="space-y-4">
          {/* Top Status & Garage Summary Bar */}
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-700/80 bg-slate-900/80 px-4 py-3">
            <div className="flex flex-wrap items-center gap-4">
              <div>
                <p className="text-[11px] uppercase tracking-wider text-slate-400">Race Wallet</p>
                <p className="gui-font text-2xl sm:text-3xl text-amber-300 tabular-nums">
                  £{state.cash.toLocaleString()}
                </p>
              </div>
              <div className="h-9 w-px bg-slate-700 hidden sm:block" />
              <div>
                <div className="flex items-center gap-2">
                  <span className="gui-font text-sm sm:text-base text-white">{playerStats.car.name}</span>
                  <GameUiBadge tone="blue">PI {playerStats.pi}</GameUiBadge>
                  <GameUiBadge tone="amber">{playerStats.hp} BHP</GameUiBadge>
                </div>
                <p className="text-xs text-slate-400 mt-0.5">
                  Est. 1/4 Mile: <strong className="text-emerald-300">{playerStats.estEtSec}s</strong>
                  {' · '}
                  Best ET:{' '}
                  <strong className="text-sky-300">
                    {state.stats.bestEtSec ? `${state.stats.bestEtSec.toFixed(3)}s @ ${state.stats.bestTrapMph} mph` : 'Unset'}
                  </strong>
                  {' · '}
                  Wins: <strong>{state.stats.botWins} Bot / {state.stats.multiplayerWins} MP</strong>
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-1.5">
              <GameUiButton
                size="sm"
                variant={tab === 'strip' ? 'primary' : 'neutral'}
                pressed={tab === 'strip'}
                onClick={() => setTab('strip')}
              >
                🚦 Drag Strip
              </GameUiButton>
              <GameUiButton
                size="sm"
                variant={tab === 'garage' ? 'primary' : 'neutral'}
                pressed={tab === 'garage'}
                onClick={() => setTab('garage')}
              >
                🔧 Upgrades &amp; Paint
              </GameUiButton>
              <GameUiButton
                size="sm"
                variant={tab === 'dealership' ? 'primary' : 'neutral'}
                pressed={tab === 'dealership'}
                onClick={() => setTab('dealership')}
              >
                🚗 Car Showroom ({Object.keys(state.ownedCars).length}/{DRAG_CARS.length})
              </GameUiButton>
              <GameUiButton
                size="sm"
                variant={tab === 'multiplayer' ? 'accent' : 'neutral'}
                pressed={tab === 'multiplayer'}
                onClick={() => {
                  setTab('multiplayer');
                  loadMultiplayerPaddock();
                }}
              >
                🏁 Multiplayer Matchups
              </GameUiButton>
              <GameUiButton
                size="sm"
                variant="neutral"
                onClick={() => {
                  const next = !soundMuted;
                  setSoundMuted(next);
                  setDragSoundMuted(next);
                }}
              >
                {soundMuted ? '🔇 Muted' : '🔊 SFX'}
              </GameUiButton>
            </div>
          </div>

          {/* Admin / Dev Area Test Toolbar */}
          {isAdmin || sandbox ? (
            <div className="rounded-xl border border-amber-400/35 bg-amber-500/10 px-3 py-2 flex flex-wrap items-center justify-between gap-2 text-xs">
              <span className="text-amber-200 font-medium">
                🛠️ Dev Sandbox Controls — test progression, upgrades, and supercars:
              </span>
              <div className="flex flex-wrap gap-1.5">
                <GameUiButton
                  size="sm"
                  variant="warning"
                  onClick={() => {
                    setState((prev) => ({ ...prev, cash: prev.cash + 5000 }));
                    setToast('+£5,000 test cash added');
                  }}
                >
                  +£5,000
                </GameUiButton>
                <GameUiButton
                  size="sm"
                  variant="warning"
                  onClick={() => {
                    setState((prev) => ({ ...prev, cash: prev.cash + 100000 }));
                    setToast('+£100,000 test cash added');
                  }}
                >
                  +£100,000
                </GameUiButton>
                <GameUiButton
                  size="sm"
                  variant="neutral"
                  onClick={() => {
                    const all = {};
                    for (const c of DRAG_CARS) {
                      all[c.id] = state.ownedCars[c.id] || {
                        paint: c.defaultPaint,
                        stripes: false,
                        upgrades: { power: 0, grip: 0, gearbox: 0, nitrous: 0, weight: 0 },
                      };
                    }
                    setState((prev) => ({ ...prev, ownedCars: all }));
                    setToast('Unlocked all 8 cars in garage!');
                  }}
                >
                  Unlock All Cars
                </GameUiButton>
                <GameUiButton
                  size="sm"
                  variant="neutral"
                  onClick={() => {
                    const fresh = createInitialDragState();
                    setState(fresh);
                    setRaceMode('idle');
                    setTimeSlip(null);
                    setToast('Reset to bog-standard 2004 Fiesta 1.25 Zetec + £500');
                  }}
                >
                  Reset to Starter Fiesta
                </GameUiButton>
              </div>
            </div>
          ) : null}

          {toast ? (
            <div className="rounded-lg border border-sky-400/40 bg-sky-500/15 px-3 py-1.5 text-center text-xs font-semibold text-sky-200">
              {toast}
            </div>
          ) : null}

          {/* ================= TAB 1: DRAG STRIP ================= */}
          {tab === 'strip' ? (
            <div className="space-y-3">
              {/* Consistent 60fps Overhead Quarter-Mile + Shutdown Tracker */}
              {(() => {
                // Full map covers 0m..465m (402.336m 1/4-mile race + 62.6m post-finish braking shutdown zone)
                const TOTAL_TRACK_M = 465;
                const finishLinePct = (QUARTER_MILE_METERS / TOTAL_TRACK_M) * 100; // ~86.5%
                const playerTrackM = Math.max(0, Math.min(TOTAL_TRACK_M, hud.visualDistM || hud.distM || 0));
                const oppTrackM = Math.max(0, Math.min(TOTAL_TRACK_M, hud.oppVisualDistM || hud.oppDistM || 0));
                const playerPct = Math.min(96.5, (playerTrackM / TOTAL_TRACK_M) * 96.5);
                const oppPct = Math.min(96.5, (oppTrackM / TOTAL_TRACK_M) * 96.5);
                const playerProgress1320 = Math.min(100, Math.round(((hud.distM || 0) / QUARTER_MILE_METERS) * 100));

                return (
                  <div className="rounded-xl border border-slate-700 bg-slate-950/95 px-3 py-2.5 space-y-1.5">
                    <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-300 tabular-nums">
                      <span className="font-bold text-slate-400">🚦 START (0 FT)</span>
                      <span className="text-sky-300 font-semibold">
                        {raceMode === 'racing' || raceMode === 'finished'
                          ? `1/4 MILE: ${playerProgress1320}% (${Math.round((hud.distM || 0) * 3.28084)} / 1,320 FT) · ET ${hud.elapsedSec.toFixed(2)}s · ${Math.round(hud.mph)} MPH`
                          : `Staged vs ${opponent.name} (${getCarById(opponent.carId).shortName}) · Prize £${(opponent.purse || 500).toLocaleString()}`}
                      </span>
                      <span className="font-bold text-amber-300">🏁 1/4 MILE (1,320 FT) + SHUTDOWN</span>
                    </div>

                    <div className="relative h-11 rounded-lg bg-slate-900 border border-slate-700 overflow-hidden select-none">
                      {/* Post-Finish Braking Shutdown Zone Shading */}
                      <div
                        className="absolute inset-y-0 right-0 bg-amber-500/10 border-l-2 border-dashed border-amber-400/70"
                        style={{ left: `${finishLinePct}%` }}
                      >
                        <span className="absolute right-1.5 top-1/2 -translate-y-1/2 text-[9px] font-bold tracking-wider text-amber-300/80 uppercase">
                          BRAKE ZONE
                        </span>
                      </div>

                      {/* Milestone Tick Lines (60ft, 330ft, 1/8 Mile, 1000ft) */}
                      {[
                        { m: 18.288, lbl: '60ft' },
                        { m: 100.584, lbl: '330ft' },
                        { m: 201.168, lbl: '1/8 MI' },
                        { m: 304.8, lbl: '1000ft' },
                      ].map((mk) => {
                        const pct = (mk.m / TOTAL_TRACK_M) * 100;
                        return (
                          <div
                            key={mk.lbl}
                            className="absolute inset-y-0 border-l border-slate-700/80 pointer-events-none"
                            style={{ left: `${pct}%` }}
                          >
                            <span className="pl-1 text-[8px] text-slate-500 font-semibold">{mk.lbl}</span>
                          </div>
                        );
                      })}

                      {/* Centre Lane Divider */}
                      <div className="absolute inset-x-0 top-1/2 border-t border-dashed border-slate-700" />

                      {/* Opponent Car Marker (Top Lane) — NO CSS transition so 60fps updates never lag */}
                      <div
                        className="absolute top-1 h-3.5 px-1.5 rounded bg-rose-500 text-[9px] font-extrabold text-white flex items-center gap-1 shadow"
                        style={{ left: `${oppPct}%` }}
                      >
                        <span>OPP</span>
                      </div>

                      {/* Player Car Marker (Bottom Lane) — NO CSS transition so 60fps updates never lag */}
                      <div
                        className="absolute bottom-1 h-4 px-1.5 rounded bg-emerald-400 text-[9px] font-extrabold text-slate-950 flex items-center gap-1 shadow-[0_0_8px_#34d399]"
                        style={{ left: `${playerPct}%` }}
                      >
                        <span>YOU</span>
                      </div>
                    </div>
                  </div>
                );
              })()}

              {/* 2D Drag Strip Canvas */}
              <div
                className="relative rounded-2xl border-2 border-slate-700 bg-slate-950 overflow-hidden shadow-2xl"
                onMouseDown={() => {
                  if (raceRef.current && (raceRef.current.phase === 'staging' || raceRef.current.phase === 'countdown')) {
                    throttleHeldRef.current = true;
                  }
                }}
                onMouseUp={() => { throttleHeldRef.current = false; }}
                onMouseLeave={() => { throttleHeldRef.current = false; }}
                onTouchStart={() => {
                  if (raceRef.current && (raceRef.current.phase === 'staging' || raceRef.current.phase === 'countdown')) {
                    throttleHeldRef.current = true;
                  }
                }}
                onTouchEnd={() => { throttleHeldRef.current = false; }}
              >
                <canvas
                  ref={canvasRef}
                  width={920}
                  height={272}
                  className="w-full h-[230px] sm:h-[272px] block select-none"
                />

                {/* Live Banner Overlay */}
                {hud.bannerText ? (
                  <div
                    className="pointer-events-none absolute top-3 left-1/2 -translate-x-1/2 rounded-full bg-slate-950/90 border border-slate-700 px-4 py-1 text-xs sm:text-sm font-extrabold tracking-wider uppercase shadow-lg text-center max-w-[92%] truncate"
                    style={{ color: hud.bannerColour }}
                  >
                    {hud.bannerText}
                  </div>
                ) : null}
              </div>

              {/* Interactive Cockpit Dashboard: Twin Analogue Gauges & Single-Button Race Control */}
              <div className="rounded-2xl border-2 border-slate-700 bg-gradient-to-b from-slate-900 to-slate-950 p-4 space-y-3">
                <AnalogueGaugeCluster
                  rpm={hud.rpm}
                  redlineRpm={redline}
                  sweetSpot={playerStats.launchSweetSpot}
                  perfectShiftZone={playerStats.perfectShiftZone}
                  mph={hud.mph}
                  topSpeedMph={playerStats.topSpeedMph}
                  gear={hud.gear}
                  maxGears={playerStats.car.gears}
                  raceMode={raceMode}
                  elapsedSec={hud.elapsedSec}
                  inWheelspin={hud.inWheelspin}
                />

                {/* Primary Race Controls */}
                {raceMode === 'racing' ? (
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
                    <button
                      type="button"
                      disabled={hud.decelerating || hud.gear >= playerStats.car.gears}
                      onClick={handleShiftUp}
                      className="sm:col-span-2 rounded-xl border-2 border-emerald-400 bg-emerald-500/25 hover:bg-emerald-500/35 active:scale-[0.99] disabled:opacity-40 py-3.5 px-4 text-center gui-font text-base sm:text-lg text-emerald-100 shadow-lg"
                    >
                      {hud.decelerating
                        ? '🏁 CROSSED 1/4 MILE FINISH — DECELERATING IN SHUTDOWN ZONE…'
                        : hud.gear >= playerStats.car.gears
                          ? `TOP GEAR (${hud.gear}TH) — FULL THROTTLE TO FINISH!`
                          : `⇧ SHIFT UP TO ${hud.gear + 1}${hud.gear + 1 === 2 ? 'ND' : hud.gear + 1 === 3 ? 'RD' : 'TH'} GEAR (SPACE / ↑)`}
                    </button>
                    <button
                      type="button"
                      disabled={hud.decelerating || playerStats.nitrousDurationSec <= 0 || hud.n2oRemainingPct <= 0 || hud.n2oActive}
                      onClick={handleActivateNitrous}
                      className="rounded-xl border-2 border-fuchsia-400 bg-fuchsia-500/25 hover:bg-fuchsia-500/35 disabled:opacity-35 py-3.5 px-4 text-center gui-font text-sm sm:text-base text-fuchsia-100 shadow-lg"
                    >
                      {playerStats.nitrousDurationSec <= 0
                        ? '🧪 NO N2O INSTALLED'
                        : hud.n2oActive
                          ? `🔥 N2O FIRING (${hud.n2oRemainingPct}%)`
                          : hud.n2oRemainingPct > 0
                            ? `🧪 FIRE NITROUS (${hud.n2oRemainingPct}% · N)`
                            : '🧪 N2O EMPTY'}
                    </button>
                  </div>
                ) : (
                  <div className="space-y-3 pt-1">
                    {/* Single Primary Button: START RACE (then feather Spacebar as lights change!) */}
                    {raceMode !== 'countdown' ? (
                      <button
                        type="button"
                        onClick={() => startRace(opponent, false)}
                        className="w-full rounded-xl border-2 border-emerald-400 bg-emerald-500/25 hover:bg-emerald-500/35 active:scale-[0.99] py-4 px-5 text-center gui-font text-lg sm:text-xl text-emerald-100 shadow-lg"
                      >
                        🚦 START RACE vs {opponent.name.toUpperCase()} (£{(opponent.purse || 500).toLocaleString()} PURSE)
                      </button>
                    ) : (
                      <div
                        onMouseDown={() => { throttleHeldRef.current = true; }}
                        onMouseUp={() => { throttleHeldRef.current = false; }}
                        onMouseLeave={() => { throttleHeldRef.current = false; }}
                        onTouchStart={(e) => { e.preventDefault(); throttleHeldRef.current = true; }}
                        onTouchEnd={() => { throttleHeldRef.current = false; }}
                        className="w-full rounded-xl border-2 border-amber-400 bg-amber-500/20 py-4 px-5 text-center font-extrabold text-amber-200 select-none shadow-lg cursor-pointer"
                      >
                        ⏳ LIGHTS CHANGING — HOLD / FEATHER <span className="underline">SPACEBAR</span> TO SET LAUNCH REVS IN THE TARGET ARC!
                      </div>
                    )}

                    {/* Opponent Selection Strip */}
                    <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-800">
                      <p className="text-xs font-semibold uppercase tracking-wider text-slate-300">
                        🤖 Choose Opponent (Selected: <span className="text-amber-300">{opponent.name}</span>):
                      </p>
                      <GameUiButton size="sm" variant="success" onClick={() => selectOpponent(matchedBot)}>
                        ⚡ Select Matched Bot ({matchedBot.name} · £{matchedBot.purse.toLocaleString()})
                      </GameUiButton>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
                      {[matchedBot, ...BOT_OPPONENTS].map((bot) => {
                        const botCar = getCarById(bot.carId);
                        const botStats = computeCarStats(bot.carId, bot.upgrades);
                        const selected = opponent.id === bot.id;
                        return (
                          <div
                            key={bot.id}
                            className={`rounded-xl border-2 p-2.5 flex flex-col justify-between gap-2 transition-colors ${
                              selected
                                ? 'border-sky-400 bg-sky-500/15'
                                : 'border-slate-700/80 bg-slate-900/70 hover:border-slate-600'
                            }`}
                          >
                            <div>
                              <div className="flex items-center justify-between gap-1">
                                <span className="gui-font text-xs text-white truncate">{bot.name}</span>
                                <GameUiBadge tone={bot.difficulty === 'Matched' ? 'blue' : 'amber'}>
                                  {bot.difficulty}
                                </GameUiBadge>
                              </div>
                              <p className="text-[11px] text-slate-400">
                                {botCar.shortName} · {botStats.hp} BHP · Est. ~{(botStats.estEtSec / bot.skill).toFixed(1)}s
                              </p>
                              <CartoonCarSvg
                                carId={bot.carId}
                                paint={bot.paint}
                                upgradeLevel={bot.upgrades?.power || 0}
                                className="w-full h-14 my-1"
                              />
                            </div>
                            <div className="flex items-center justify-between gap-2 pt-1 border-t border-slate-800">
                              <span className="text-xs font-bold text-amber-300 tabular-nums">
                                🏆 £{bot.purse.toLocaleString()} Purse
                              </span>
                              <GameUiButton
                                size="sm"
                                variant={selected ? 'accent' : 'primary'}
                                onClick={() => selectOpponent(bot)}
                              >
                                {selected ? '✓ Selected' : 'Select Opponent'}
                              </GameUiButton>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            </div>
          ) : null}

          {/* ================= TAB 2: GARAGE UPGRADES & PAINT ================= */}
          {tab === 'garage' ? (
            <div className="space-y-4">
              {/* Current Car Showcase & Paint Shop */}
              <div className="rounded-2xl border-2 border-slate-700 bg-slate-900/85 p-4 grid grid-cols-1 lg:grid-cols-3 gap-4 items-center">
                <div className="lg:col-span-1 bg-slate-950/90 rounded-xl border border-slate-800 p-3 text-center">
                  <CartoonCarSvg
                    carId={state.activeCarId}
                    paint={activeCarEntry.paint}
                    stripes={activeCarEntry.stripes}
                    upgradeLevel={activeCarEntry.upgrades.power || 0}
                    className="w-full h-28"
                  />
                  <p className="gui-font text-base text-white mt-1">{playerStats.car.name}</p>
                  <p className="text-xs text-slate-400">{playerStats.car.blurb}</p>
                </div>

                <div className="lg:col-span-2 space-y-3">
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                    <div className="rounded-lg border border-slate-700 bg-slate-950/70 p-2.5">
                      <span className="text-slate-400 block">Power Output</span>
                      <strong className="text-base text-amber-300">{playerStats.hp} BHP</strong>
                      {playerStats.nitrousHpBonus > 0 ? (
                        <span className="block text-[10px] text-fuchsia-300">+{playerStats.nitrousHpBonus} BHP N2O</span>
                      ) : null}
                    </div>
                    <div className="rounded-lg border border-slate-700 bg-slate-950/70 p-2.5">
                      <span className="text-slate-400 block">Launch Grip &amp; Weight</span>
                      <strong className="text-base text-emerald-300">{playerStats.grip}G · {playerStats.weightKg}kg</strong>
                      <span className="block text-[10px] text-slate-400">{playerStats.car.drivetrain} Drivetrain</span>
                    </div>
                    <div className="rounded-lg border border-slate-700 bg-slate-950/70 p-2.5">
                      <span className="text-slate-400 block">Shift Time</span>
                      <strong className="text-base text-sky-300">{playerStats.shiftMs} ms</strong>
                      <span className="block text-[10px] text-slate-400">{playerStats.car.gears}-Speed Box</span>
                    </div>
                    <div className="rounded-lg border border-slate-700 bg-slate-950/70 p-2.5">
                      <span className="text-slate-400 block">Est. 1/4 Mile ET</span>
                      <strong className="text-base text-white">{playerStats.estEtSec}s</strong>
                      <span className="block text-[10px] text-slate-400">Top ~{playerStats.topSpeedMph} MPH</span>
                    </div>
                  </div>

                  {/* Paint & Racing Stripes Customizer */}
                  <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="text-xs text-slate-400 mr-1">Paint:</span>
                      {CAR_PAINT_PALETTE.map((sw) => (
                        <button
                          key={sw.id}
                          type="button"
                          onClick={() => {
                            setState((prev) => ({
                              ...prev,
                              ownedCars: {
                                ...prev.ownedCars,
                                [prev.activeCarId]: {
                                  ...prev.ownedCars[prev.activeCarId],
                                  paint: sw.id,
                                },
                              },
                            }));
                          }}
                          className={`w-6 h-6 rounded-full border-2 transition-transform ${
                            activeCarEntry.paint === sw.id ? 'border-white scale-110' : 'border-slate-700'
                          }`}
                          style={{ backgroundColor: sw.hex }}
                          title={sw.name}
                        />
                      ))}
                    </div>
                    <GameUiButton
                      size="sm"
                      variant={activeCarEntry.stripes ? 'accent' : 'neutral'}
                      onClick={() => {
                        setState((prev) => ({
                          ...prev,
                          ownedCars: {
                            ...prev.ownedCars,
                            [prev.activeCarId]: {
                              ...prev.ownedCars[prev.activeCarId],
                              stripes: !prev.ownedCars[prev.activeCarId]?.stripes,
                            },
                          },
                        }));
                      }}
                    >
                      {activeCarEntry.stripes ? '✓ Racing Stripes On' : 'Add Racing Stripes'}
                    </GameUiButton>
                  </div>
                </div>
              </div>

              {/* 5 Upgrade Tracks */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {UPGRADE_CATEGORIES.map((cat) => {
                  const curLv = activeCarEntry.upgrades[cat.id] || 0;
                  const maxed = curLv >= cat.maxLevel;
                  const cost = getUpgradeCost(playerStats.car, cat.id, curLv);
                  const canAfford = state.cash >= cost && !maxed;
                  return (
                    <div
                      key={cat.id}
                      className="rounded-xl border-2 border-slate-700 bg-slate-900/75 p-3.5 flex flex-col justify-between gap-3"
                    >
                      <div>
                        <div className="flex items-center justify-between gap-2">
                          <span className="gui-font text-sm text-white">
                            {cat.icon} {cat.name}
                          </span>
                          <span className="text-xs font-bold text-sky-300">
                            Stage {curLv} / {cat.maxLevel}
                          </span>
                        </div>
                        <p className="text-xs text-slate-400 mt-0.5">{cat.desc}</p>
                        <p className="text-xs text-emerald-300 mt-1">
                          Current: <strong>{cat.levels[curLv]}</strong>
                          {!maxed ? (
                            <>
                              {' → '}
                              <span className="text-amber-200">Next: {cat.levels[curLv + 1]}</span>
                            </>
                          ) : null}
                        </p>
                      </div>

                      <div className="flex items-center justify-between gap-3 pt-2 border-t border-slate-800">
                        <div className="flex gap-1">
                          {Array.from({ length: cat.maxLevel }).map((_, idx) => (
                            <span
                              key={idx}
                              className={`h-2.5 w-6 rounded-sm ${
                                idx < curLv ? 'bg-emerald-400' : 'bg-slate-800 border border-slate-700'
                              }`}
                            />
                          ))}
                        </div>
                        <GameUiButton
                          size="sm"
                          variant={maxed ? 'neutral' : canAfford ? 'success' : 'neutral'}
                          disabled={maxed || !canAfford}
                          onClick={() => buyUpgrade(cat.id)}
                        >
                          {maxed ? 'MAXED OUT' : `Upgrade · £${cost.toLocaleString()}`}
                        </GameUiButton>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : null}

          {/* ================= TAB 3: CAR SHOWROOM / DEALERSHIP ================= */}
          {tab === 'dealership' ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
              {DRAG_CARS.map((car) => {
                const owned = Boolean(state.ownedCars[car.id]);
                const equipped = state.activeCarId === car.id;
                const savedEntry = state.ownedCars[car.id];
                const stats = computeCarStats(car.id, savedEntry?.upgrades || {});
                const canAfford = state.cash >= car.cost;
                return (
                  <div
                    key={car.id}
                    className={`rounded-2xl border-2 p-3.5 flex flex-col justify-between gap-3 ${
                      equipped
                        ? 'border-sky-400 bg-sky-500/15'
                        : owned
                          ? 'border-emerald-500/40 bg-slate-900/80'
                          : 'border-slate-700 bg-slate-900/60'
                    }`}
                  >
                    <div>
                      <div className="flex items-center justify-between gap-2">
                        <div>
                          <span className="text-[10px] uppercase tracking-wider text-amber-300 font-bold">
                            Tier {car.tier} · {car.badge}
                          </span>
                          <h4 className="gui-font text-base text-white">{car.name}</h4>
                        </div>
                        <GameUiBadge tone={owned ? 'green' : 'amber'}>
                          {equipped ? 'EQUIPPED' : owned ? 'OWNED' : `£${car.cost.toLocaleString()}`}
                        </GameUiBadge>
                      </div>
                      <CartoonCarSvg
                        carId={car.id}
                        paint={savedEntry?.paint || car.defaultPaint}
                        stripes={Boolean(savedEntry?.stripes)}
                        upgradeLevel={savedEntry?.upgrades?.power || 0}
                        className="w-full h-24 my-1.5"
                      />
                      <p className="text-xs text-slate-300">{car.blurb}</p>
                    </div>

                    <div className="space-y-2 pt-2 border-t border-slate-800">
                      <div className="flex flex-wrap items-center justify-between text-xs text-slate-300">
                        <span><strong>{stats.hp}</strong> BHP · <strong>{car.drivetrain}</strong></span>
                        <span><strong>{car.gears}</strong> Gears · Redline <strong>{car.redlineRpm}</strong></span>
                        <span className="text-emerald-300 font-semibold">Est. ET ~{stats.estEtSec}s</span>
                      </div>
                      <div className="flex justify-end">
                        <GameUiButton
                          size="sm"
                          variant={equipped ? 'neutral' : owned ? 'primary' : canAfford ? 'success' : 'neutral'}
                          disabled={equipped || (!owned && !canAfford)}
                          onClick={() => buyOrSelectCar(car)}
                        >
                          {equipped
                            ? 'Currently Driving'
                            : owned
                              ? 'Equip Car'
                              : `Buy Car · £${car.cost.toLocaleString()}`}
                        </GameUiButton>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : null}

          {/* ================= TAB 4: MULTIPLAYER MATCHUPS & STAKE BOARD ================= */}
          {tab === 'multiplayer' ? (
            <div className="space-y-4">
              {/* Post an Open Stake Challenge */}
              <div className="rounded-xl border-2 border-indigo-400/40 bg-indigo-500/10 p-3.5 flex flex-wrap items-center justify-between gap-3">
                <div className="space-y-0.5">
                  <p className="gui-font text-sm text-white">
                    🏁 Post an Open Quarter-Mile Challenge (Big Multiplayer Purse)
                  </p>
                  <p className="text-xs text-slate-300">
                    Put your fastest 1/4-mile time ({state.stats.bestEtSec ? `${state.stats.bestEtSec}s` : 'run a race first'}) on the board for colleagues to challenge!
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {[1000, 5000, 20000].map((amt) => (
                    <GameUiButton
                      key={amt}
                      size="sm"
                      variant={stakeAmount === amt ? 'accent' : 'neutral'}
                      pressed={stakeAmount === amt}
                      onClick={() => setStakeAmount(amt)}
                    >
                      £{amt.toLocaleString()} Stake
                    </GameUiButton>
                  ))}
                  <GameUiButton size="sm" variant="success" onClick={postOpenChallenge}>
                    Post Challenge (Pot £{(stakeAmount * 2).toLocaleString()})
                  </GameUiButton>
                </div>
              </div>

              {/* Active Open Wager Challenges */}
              {mpChallenges.length > 0 ? (
                <div className="space-y-2">
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-amber-300">
                    🔥 Open Wager Challenges (Winner Takes 2× Pot)
                  </h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                    {mpChallenges.map((ch) => (
                      <div
                        key={ch.id}
                        className="rounded-xl border-2 border-amber-400/50 bg-slate-900/85 p-3 flex items-center justify-between gap-3"
                      >
                        <div>
                          <p className="gui-font text-sm text-white">
                            {ch.challengerName} · <span className="text-amber-300">{getCarById(ch.carId).shortName}</span>
                          </p>
                          <p className="text-xs text-slate-300">
                            Target 1/4 Mile: <strong className="text-emerald-300">{Number(ch.targetEtSec).toFixed(3)}s</strong> @ {ch.targetTrapMph} MPH
                          </p>
                          <p className="text-xs font-bold text-amber-300 mt-0.5">
                            💰 Winner Purse: £{Number(ch.purse || ch.stake * 2).toLocaleString()}
                          </p>
                        </div>
                        <GameUiButton
                          size="sm"
                          variant="success"
                          onClick={() =>
                            startRace({
                              id: `mp-ch-${ch.id}`,
                              name: ch.challengerName,
                              carId: ch.carId,
                              paint: ch.paint || 'red',
                              stripes: Boolean(ch.stripes),
                              upgrades: ch.upgrades || { power: 2, grip: 2, gearbox: 2, nitrous: 1, weight: 2 },
                              targetEtSec: Number(ch.targetEtSec),
                              purse: Number(ch.purse || ch.stake * 2),
                              runnerUpPurse: 200,
                              isMultiplayer: true,
                            })
                          }
                        >
                          Accept Matchup
                        </GameUiButton>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}

              {/* Real Player Leaderboard & Head-to-Head Matchups */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-sky-300">
                    🏆 Company Quarter-Mile Standings &amp; Direct Player Matchups
                  </h4>
                  <GameUiButton size="sm" variant="neutral" disabled={mpLoading} onClick={loadMultiplayerPaddock}>
                    {mpLoading ? 'Refreshing…' : 'Refresh Paddock'}
                  </GameUiButton>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                  {(mpProfiles.length > 0
                    ? mpProfiles
                    : [
                        {
                          uid: 'seed-1',
                          fullName: 'Paul Shaw (Ghost)',
                          carId: 'impreza-sti',
                          paint: 'blue',
                          hp: 465,
                          pi: 540,
                          bestEtSec: 11.42,
                          bestTrapMph: 126.4,
                          upgrades: { power: 2, grip: 3, gearbox: 2, nitrous: 1, weight: 2 },
                        },
                        {
                          uid: 'seed-2',
                          fullName: 'Cameron Illing (Ghost)',
                          carId: 'civic-type-r',
                          paint: 'white',
                          hp: 390,
                          pi: 465,
                          bestEtSec: 12.58,
                          bestTrapMph: 115.2,
                          upgrades: { power: 2, grip: 2, gearbox: 2, nitrous: 1, weight: 1 },
                        },
                        {
                          uid: 'seed-3',
                          fullName: 'Adam B (Ghost)',
                          carId: 'golf-gti',
                          paint: 'red',
                          hp: 265,
                          pi: 360,
                          bestEtSec: 13.94,
                          bestTrapMph: 103.8,
                          upgrades: { power: 2, grip: 1, gearbox: 1, nitrous: 0, weight: 1 },
                        },
                        {
                          uid: 'seed-4',
                          fullName: 'Emily Cox (Ghost)',
                          carId: 'fiesta-mk6',
                          paint: 'green',
                          hp: 95,
                          pi: 215,
                          bestEtSec: 16.45,
                          bestTrapMph: 84.5,
                          upgrades: { power: 2, grip: 1, gearbox: 1, nitrous: 0, weight: 1 },
                        },
                      ]
                  ).map((row, idx) => {
                    const car = getCarById(row.carId || 'fiesta-mk6');
                    const mpPurse = Math.max(1200, Math.round((22000 / Math.max(7.5, Number(row.bestEtSec) || 15)) / 50) * 50);
                    return (
                      <div
                        key={row.uid || idx}
                        className="rounded-xl border-2 border-slate-700 bg-slate-900/80 p-3 flex items-center justify-between gap-3"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <span className="gui-font text-base text-slate-400 w-6">#{idx + 1}</span>
                          <div className="w-24 shrink-0">
                            <CartoonCarSvg
                              carId={row.carId || 'fiesta-mk6'}
                              paint={row.paint || car.defaultPaint}
                              stripes={Boolean(row.stripes)}
                              className="w-full h-12"
                            />
                          </div>
                          <div className="min-w-0">
                            <p className="gui-font text-sm text-white truncate">{row.fullName}</p>
                            <p className="text-xs text-slate-300 truncate">
                              {car.shortName} · <strong>{row.hp || car.baseHp} BHP</strong>
                            </p>
                            <p className="text-xs text-emerald-300 font-semibold tabular-nums">
                              ⏱ {Number(row.bestEtSec).toFixed(3)}s @ {Number(row.bestTrapMph || 95).toFixed(1)} MPH
                            </p>
                          </div>
                        </div>
                        <div className="text-right shrink-0 space-y-1">
                          <span className="block text-xs font-bold text-amber-300">
                            🏆 £{mpPurse.toLocaleString()}
                          </span>
                          <GameUiButton
                            size="sm"
                            variant="accent"
                            onClick={() =>
                              startRace({
                                id: `mp-${row.uid || idx}`,
                                name: row.fullName,
                                carId: row.carId || 'fiesta-mk6',
                                paint: row.paint || car.defaultPaint,
                                stripes: Boolean(row.stripes),
                                upgrades: row.upgrades || { power: 1, grip: 1, gearbox: 1, nitrous: 0, weight: 1 },
                                targetEtSec: Number(row.bestEtSec) || 14.5,
                                purse: mpPurse,
                                runnerUpPurse: Math.round(mpPurse * 0.2),
                                isMultiplayer: true,
                              })
                            }
                          >
                            🏁 Race Player
                          </GameUiButton>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          ) : null}
        </div>
      </GameUiPanel>

      {/* Post-Race Quarter-Mile Time Slip Modal */}
      <GameUiModal
        open={Boolean(timeSlip)}
        onClose={() => setTimeSlip(null)}
        title={timeSlip?.playerWon ? '🏆 QUARTER-MILE VICTORY!' : '🏁 QUARTER-MILE TIME SLIP'}
        header={timeSlip?.playerWon ? 'yellow' : 'blue'}
        dark
        confirmLabel="Race Again"
        confirmVariant="success"
        cancelLabel="Go to Garage"
        onConfirm={() => {
          const lastOpp = opponent;
          setTimeSlip(null);
          startRace(lastOpp);
        }}
      >
        {timeSlip ? (
          <div className="space-y-3 text-xs text-slate-200">
            <div
              className={`rounded-xl border-2 p-3 text-center ${
                timeSlip.playerWon
                  ? 'border-emerald-400/60 bg-emerald-500/15 text-emerald-100'
                  : 'border-rose-400/50 bg-rose-500/15 text-rose-100'
              }`}
            >
              <p className="gui-font text-lg">
                {timeSlip.playerWon
                  ? `YOU BEAT ${timeSlip.oppName.toUpperCase()} BY ${timeSlip.marginSec}s!`
                  : `${timeSlip.oppName.toUpperCase()} WON BY ${timeSlip.marginSec}s`}
              </p>
              <p className="text-sm font-bold text-amber-300 mt-1">
                Prize Purse Earned: +£{timeSlip.totalPrize.toLocaleString()}
                {timeSlip.skillBonusCash > 0
                  ? ` (includes +£${timeSlip.skillBonusCash} Launch/Shift Skill Bonus)`
                  : ''}
              </p>
            </div>

            {/* Authentic Drag Strip Time Slip Table */}
            <div className="rounded-xl border border-slate-700 bg-slate-950 p-3 font-mono text-xs space-y-1.5">
              <div className="grid grid-cols-3 border-b border-slate-800 pb-1 text-slate-400 font-bold">
                <span>SPLIT</span>
                <span className="text-right text-emerald-300">YOU</span>
                <span className="text-right text-rose-300">{timeSlip.oppName}</span>
              </div>
              <div className="grid grid-cols-3">
                <span className="text-slate-400">R/T (Reaction)</span>
                <span className="text-right">{timeSlip.reactionTimeSec}s</span>
                <span className="text-right">0.112s</span>
              </div>
              <div className="grid grid-cols-3">
                <span className="text-slate-400">60-Foot</span>
                <span className="text-right">{timeSlip.player60Ft}s</span>
                <span className="text-right">{(timeSlip.oppEt * 0.162).toFixed(3)}s</span>
              </div>
              <div className="grid grid-cols-3">
                <span className="text-slate-400">1/8 Mile ET</span>
                <span className="text-right">{timeSlip.playerEighth}s</span>
                <span className="text-right">{(timeSlip.oppEt * 0.642).toFixed(3)}s</span>
              </div>
              <div className="grid grid-cols-3 border-t border-slate-800 pt-1.5 font-bold text-sm">
                <span className="text-white">1/4 MILE ET</span>
                <span className="text-right text-emerald-300">{timeSlip.playerEt.toFixed(3)}s</span>
                <span className="text-right text-rose-300">{timeSlip.oppEt.toFixed(3)}s</span>
              </div>
              <div className="grid grid-cols-3 font-bold">
                <span className="text-slate-400">TRAP SPEED</span>
                <span className="text-right text-amber-300">{timeSlip.playerTrapMph} MPH</span>
                <span className="text-right text-slate-300">{timeSlip.oppTrapMph} MPH</span>
              </div>
            </div>

            <div className="flex items-center justify-between text-[11px] text-slate-400 px-1">
              <span>Launch: <strong className="text-white">{timeSlip.launchGrade}</strong></span>
              <span>Perfect Shifts: <strong className="text-emerald-300">{timeSlip.perfectShifts}</strong></span>
              <button
                type="button"
                onClick={() => {
                  setTimeSlip(null);
                  setTab('garage');
                }}
                className="text-sky-300 hover:underline font-semibold"
              >
                Spend Prize in Garage →
              </button>
            </div>
          </div>
        ) : null}
      </GameUiModal>
    </div>
  );
}
