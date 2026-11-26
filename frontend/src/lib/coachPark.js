/**
 * Coach Park — 2D top-down coach parking simulator engine & deterministic daily maps.
 *
 * Key gameplay contract:
 *  - Steering wheel (Left/Right) and Throttle (Up/Down) DO NOT auto-reset on release.
 *  - Authentic rear-axle Ackermann/bicycle coach kinematics with front & rear overhang sweep.
 *  - Daily deterministic maps seeded per Europe/London YYYY-MM-DD key, validated for solvability.
 */

export const WORLD_W = 64;
export const WORLD_H = 40;

export const COACH_LENGTH = 12.4;
export const COACH_WIDTH = 2.55;
export const COACH_WHEELBASE = 6.4;
export const FRONT_OVERHANG = 2.7;
export const REAR_OVERHANG = 3.3;
export const REAR_TO_CENTER = (COACH_WHEELBASE + FRONT_OVERHANG - REAR_OVERHANG) / 2; // 2.9 m
export const COACH_HITBOX_INSET = 0.06;

export const MAX_WHEEL_STEER_DEG = 44;
export const MAX_WHEEL_STEER_RAD = (MAX_WHEEL_STEER_DEG * Math.PI) / 180;
export const STEER_WHEEL_MAX_DEG = 540; // 1.5 turns each side
export const STEER_RATE = 1.15; // normalized steer units/sec (~0.87s center -> full lock)

export const THROTTLE_RATE = 0.85; // normalized throttle units/sec
export const NEUTRAL_GATE_SEC = 0.18; // brief detent when pushing across 0
export const MAX_FWD_SPEED = 7.2; // m/s (~16 mph yard speed)
export const MAX_REV_SPEED = 4.5; // m/s (~10 mph reverse)
export const COACH_ACCEL = 4.6; // m/s^2
export const COACH_DECEL = 6.4; // m/s^2

export const BAY_LENGTH = 14.2;
export const BAY_WIDTH = 3.9;
export const PARK_ANGLE_TOL_DEG = 14;
export const PARK_ANGLE_TOL_RAD = (PARK_ANGLE_TOL_DEG * Math.PI) / 180;
export const PARK_SPEED_TOL = 0.18; // m/s
export const PARK_THROTTLE_TOL = 0.08;
export const PARK_HOLD_SEC = 0.65;

export const BUMP_PENALTY_MS = 5000;
export const MAX_BUMPS = 5;
export const MAX_DAILY_TRIES = 3;

const SUB_STEPS = 4;
const MAX_TRAIL_POINTS = 260;

export function clamp(val, min, max) {
  return Math.max(min, Math.min(max, val));
}

export function wrapAngle(rad) {
  let a = rad % (Math.PI * 2);
  if (a > Math.PI) a -= Math.PI * 2;
  if (a <= -Math.PI) a += Math.PI * 2;
  return a;
}

export function hashString(input) {
  let h = 2166136261;
  const s = String(input || '');
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function mulberry32(seed) {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

export function formatCoachParkTime(ms) {
  const n = Math.max(0, Math.floor(Number(ms) || 0));
  const totalSec = n / 1000;
  if (totalSec < 60) return `${totalSec.toFixed(1)}s`;
  const min = Math.floor(totalSec / 60);
  const sec = (totalSec % 60).toFixed(1).padStart(4, '0');
  return `${min}:${sec}`;
}

export function getCoachCenter(coach) {
  const cos = Math.cos(coach.heading);
  const sin = Math.sin(coach.heading);
  return {
    x: coach.rx + cos * REAR_TO_CENTER,
    y: coach.ry + sin * REAR_TO_CENTER,
  };
}

export function getObbCorners(cx, cy, w, h, angle) {
  const hw = w / 2;
  const hh = h / 2;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  return [
    { x: cx + hw * cos - hh * sin, y: cy + hw * sin + hh * cos }, // front-right
    { x: cx + hw * cos + hh * sin, y: cy + hw * sin - hh * cos }, // front-left
    { x: cx - hw * cos + hh * sin, y: cy - hw * sin - hh * cos }, // rear-left
    { x: cx - hw * cos - hh * sin, y: cy - hw * sin + hh * cos }, // rear-right
  ];
}

export function getCoachCorners(coach, inset = 0) {
  const center = getCoachCenter(coach);
  return getObbCorners(
    center.x,
    center.y,
    COACH_LENGTH - inset * 2,
    COACH_WIDTH - inset * 2,
    coach.heading,
  );
}

export function getCoachObb(coach, inset = COACH_HITBOX_INSET) {
  const center = getCoachCenter(coach);
  return {
    x: center.x,
    y: center.y,
    w: COACH_LENGTH - inset * 2,
    h: COACH_WIDTH - inset * 2,
    angle: coach.heading,
  };
}

export function getFrontWheelPositions(coach) {
  const cos = Math.cos(coach.heading);
  const sin = Math.sin(coach.heading);
  const nx = -sin;
  const ny = cos;
  const trackHalf = COACH_WIDTH * 0.43;
  const fx = coach.rx + cos * COACH_WHEELBASE;
  const fy = coach.ry + sin * COACH_WHEELBASE;
  return {
    left: { x: fx - nx * trackHalf, y: fy - ny * trackHalf },
    right: { x: fx + nx * trackHalf, y: fy + ny * trackHalf },
    rearLeft: { x: coach.rx - nx * trackHalf, y: coach.ry - ny * trackHalf },
    rearRight: { x: coach.rx + nx * trackHalf, y: coach.ry + ny * trackHalf },
    steerAngle: (coach.steerInput || 0) * MAX_WHEEL_STEER_RAD,
  };
}

function projectCornersOnAxis(corners, ax, ay) {
  let min = Infinity;
  let max = -Infinity;
  for (let i = 0; i < corners.length; i += 1) {
    const d = corners[i].x * ax + corners[i].y * ay;
    if (d < min) min = d;
    if (d > max) max = d;
  }
  return { min, max };
}

function isCircleObstacle(obs) {
  return obs && typeof obs.r === 'number';
}

export function obbIntersectsObb(a, b) {
  const cornersA = getObbCorners(a.x, a.y, a.w, a.h, a.angle || 0);
  const cornersB = getObbCorners(b.x, b.y, b.w, b.h, b.angle || 0);
  const axes = [
    { x: Math.cos(a.angle || 0), y: Math.sin(a.angle || 0) },
    { x: -Math.sin(a.angle || 0), y: Math.cos(a.angle || 0) },
    { x: Math.cos(b.angle || 0), y: Math.sin(b.angle || 0) },
    { x: -Math.sin(b.angle || 0), y: Math.cos(b.angle || 0) },
  ];

  let minOverlap = Infinity;
  for (let i = 0; i < axes.length; i += 1) {
    const ax = axes[i];
    const pA = projectCornersOnAxis(cornersA, ax.x, ax.y);
    const pB = projectCornersOnAxis(cornersB, ax.x, ax.y);
    const overlap = Math.min(pA.max, pB.max) - Math.max(pA.min, pB.min);
    if (overlap <= 0) return { hit: false };
    if (overlap < minOverlap) minOverlap = overlap;
  }

  // Estimate contact point cleanly from corners inside the opposing OBB
  const contactPts = [];
  const collectInside = (pts, box) => {
    const cos = Math.cos(box.angle || 0);
    const sin = Math.sin(box.angle || 0);
    const hw = box.w / 2 + 0.05;
    const hh = box.h / 2 + 0.05;
    for (let i = 0; i < pts.length; i += 1) {
      const dx = pts[i].x - box.x;
      const dy = pts[i].y - box.y;
      const lx = dx * cos + dy * sin;
      const ly = -dx * sin + dy * cos;
      if (Math.abs(lx) <= hw && Math.abs(ly) <= hh) {
        contactPts.push(pts[i]);
      }
    }
  };
  collectInside(cornersA, b);
  collectInside(cornersB, a);

  let contactPoint = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  if (contactPts.length) {
    contactPoint = {
      x: contactPts.reduce((s, p) => s + p.x, 0) / contactPts.length,
      y: contactPts.reduce((s, p) => s + p.y, 0) / contactPts.length,
    };
  }
  return { hit: true, overlap: minOverlap, contactPoint };
}

export function obbIntersectsCircle(obb, circle) {
  const cos = Math.cos(obb.angle || 0);
  const sin = Math.sin(obb.angle || 0);
  const dx = circle.x - obb.x;
  const dy = circle.y - obb.y;
  const lx = dx * cos + dy * sin;
  const ly = -dx * sin + dy * cos;
  const hw = obb.w / 2;
  const hh = obb.h / 2;
  const cx = clamp(lx, -hw, hw);
  const cy = clamp(ly, -hh, hh);
  const distSq = (lx - cx) * (lx - cx) + (ly - cy) * (ly - cy);
  if (distSq >= circle.r * circle.r) return { hit: false };
  return {
    hit: true,
    contactPoint: {
      x: obb.x + cx * cos - cy * sin,
      y: obb.y + cx * sin + cy * cos,
    },
  };
}

export function checkCoachCollision(coach, map, { inset = COACH_HITBOX_INSET, boundaryMargin = 0.35 } = {}) {
  const worldW = map?.worldW || WORLD_W;
  const worldH = map?.worldH || WORLD_H;
  const corners = getCoachCorners(coach, inset);
  for (let i = 0; i < corners.length; i += 1) {
    const p = corners[i];
    if (
      p.x <= boundaryMargin
      || p.x >= worldW - boundaryMargin
      || p.y <= boundaryMargin
      || p.y >= worldH - boundaryMargin
    ) {
      return {
        hit: true,
        obstacleKind: 'boundary',
        contactPoint: {
          x: clamp(p.x, boundaryMargin, worldW - boundaryMargin),
          y: clamp(p.y, boundaryMargin, worldH - boundaryMargin),
        },
      };
    }
  }

  const coachObb = getCoachObb(coach, inset);
  const obstacles = map?.obstacles || [];
  for (let i = 0; i < obstacles.length; i += 1) {
    const obs = obstacles[i];
    const res = isCircleObstacle(obs)
      ? obbIntersectsCircle(coachObb, obs)
      : obbIntersectsObb(coachObb, obs);
    if (res.hit) {
      return {
        hit: true,
        obstacleKind: obs.kind || 'obstacle',
        obstacleId: obs.id || null,
        contactPoint: res.contactPoint,
      };
    }
  }
  return { hit: false };
}

export function evaluateBayParking(coach, bay) {
  const corners = getCoachCorners(coach, 0);
  const cos = Math.cos(bay.angle || 0);
  const sin = Math.sin(bay.angle || 0);
  const hw = (bay.w || BAY_LENGTH) / 2;
  const hh = (bay.h || BAY_WIDTH) / 2;

  const cornerFlags = corners.map((p) => {
    const dx = p.x - bay.x;
    const dy = p.y - bay.y;
    const lx = dx * cos + dy * sin;
    const ly = -dx * sin + dy * cos;
    return Math.abs(lx) <= hw && Math.abs(ly) <= hh;
  });

  const cornersInside = cornerFlags.filter(Boolean).length;
  const allCornersIn = cornersInside === 4;

  const diffForward = Math.abs(wrapAngle(coach.heading - (bay.angle || 0)));
  const diffReverse = Math.abs(wrapAngle(coach.heading - ((bay.angle || 0) + Math.PI)));
  const angleDiffRad = Math.min(diffForward, diffReverse);
  const angleDiffDeg = (angleDiffRad * 180) / Math.PI;
  const aligned = angleDiffRad <= PARK_ANGLE_TOL_RAD;

  const speedOk = Math.abs(coach.speed || 0) <= PARK_SPEED_TOL;
  const throttleOk = Math.abs(coach.throttle || 0) <= PARK_THROTTLE_TOL;
  const readyToHold = allCornersIn && aligned && speedOk && throttleOk;

  return {
    cornerFlags,
    cornersInside,
    allCornersIn,
    angleDiffDeg,
    aligned,
    speedOk,
    throttleOk,
    readyToHold,
  };
}

export function createInitialSimState(map) {
  const coach = {
    rx: map.start.rx,
    ry: map.start.ry,
    heading: map.start.heading,
    steerInput: 0,
    throttle: 0,
    speed: 0,
  };
  return {
    coach,
    neutralGateTimer: 0,
    neutralGateBlockedDir: 0,
    prevThrottleDir: 0,
    stalledDir: 0,
    bumps: 0,
    bumpMarkers: [],
    lastHit: null,
    parkHoldSec: 0,
    bayStatus: evaluateBayParking(coach, map.bay),
    started: false,
    elapsedMs: 0,
    scoreMs: 0,
    status: 'ready', // 'ready' | 'driving' | 'parked' | 'wrecked'
    trails: [],
    lastTrailPos: { x: coach.rx, y: coach.ry },
  };
}

/**
 * Step simulation forward by `dtSec`.
 * NEVER auto-resets `coach.steerInput` or `coach.throttle` when `steerDir === 0` or `throttleDir === 0`.
 */
export function stepCoachSimulation(prevState, input = {}, map, dtSec = 1 / 60) {
  if (!prevState || prevState.status === 'parked' || prevState.status === 'wrecked') {
    return prevState;
  }

  const dt = clamp(Number(dtSec) || 0, 0, 0.05);
  if (dt <= 0) return prevState;

  const steerDir = Math.sign(input.steerDir || 0);
  const throttleDir = Math.sign(input.throttleDir || 0);
  const directSteer = typeof input.directSteer === 'number' && Number.isFinite(input.directSteer)
    ? clamp(input.directSteer, -1, 1)
    : null;
  const directThrottle = typeof input.directThrottle === 'number' && Number.isFinite(input.directThrottle)
    ? clamp(input.directThrottle, -1, 1)
    : null;

  let steerInput = prevState.coach.steerInput;
  if (directSteer !== null) {
    steerInput = directSteer;
  } else if (steerDir !== 0) {
    steerInput = clamp(steerInput + steerDir * STEER_RATE * dt, -1, 1);
  }
  // Important: when steerDir === 0 and directSteer === null, steerInput remains held!

  let throttle = prevState.coach.throttle;
  let neutralGateTimer = prevState.neutralGateTimer || 0;
  let neutralGateBlockedDir = prevState.neutralGateBlockedDir || 0;
  const freshTap = prevState.prevThrottleDir === 0 && throttleDir !== 0;

  if (directThrottle !== null) {
    throttle = directThrottle;
    neutralGateTimer = 0;
    neutralGateBlockedDir = 0;
  } else if (throttleDir !== 0) {
    if (neutralGateTimer > 0 && (freshTap || throttleDir !== neutralGateBlockedDir)) {
      // Fresh tap or reversing back out of the gate clears the pause immediately.
      neutralGateTimer = 0;
      neutralGateBlockedDir = 0;
    }
    if (neutralGateTimer > 0 && throttle === 0 && throttleDir === neutralGateBlockedDir) {
      neutralGateTimer = Math.max(0, neutralGateTimer - dt);
      if (neutralGateTimer <= 0) {
        neutralGateBlockedDir = 0;
        throttle = clamp(throttle + throttleDir * THROTTLE_RATE * dt, -1, 1);
      }
    } else {
      const nextT = clamp(throttle + throttleDir * THROTTLE_RATE * dt, -1, 1);
      if ((throttle > 0 && nextT <= 0) || (throttle < 0 && nextT >= 0)) {
        throttle = 0;
        neutralGateTimer = NEUTRAL_GATE_SEC;
        neutralGateBlockedDir = throttleDir;
      } else {
        throttle = nextT;
      }
    }
  }
  // Important: when throttleDir === 0 and directThrottle === null, throttle remains held!

  const started = prevState.started
    || Math.abs(throttle) > 0.001
    || Math.abs(steerInput) > 0.001
    || Math.abs(prevState.coach.speed) > 0.01;

  let elapsedMs = prevState.elapsedMs;
  if (started) {
    elapsedMs += dt * 1000;
  }

  let {
    rx,
    ry,
    heading,
    speed,
  } = prevState.coach;
  let stalledDir = prevState.stalledDir || 0;
  let bumps = prevState.bumps || 0;
  let lastHit = prevState.lastHit;
  let bumpMarkers = prevState.bumpMarkers;
  let trails = prevState.trails;
  let lastTrailPos = prevState.lastTrailPos;
  let status = started ? 'driving' : 'ready';

  // Clear collision stall once driver backs off into Neutral or opposite gear
  if (stalledDir !== 0) {
    if (throttle === 0 && Math.abs(speed) < 0.05) {
      stalledDir = 0;
    } else if (Math.sign(throttle) !== stalledDir) {
      stalledDir = 0;
    }
  }

  const steerAngle = steerInput * MAX_WHEEL_STEER_RAD;
  const canAttemptMove = stalledDir === 0 || Math.sign(throttle) !== stalledDir;

  if (canAttemptMove) {
    const subDt = dt / SUB_STEPS;
    const vTarget = throttle === 0
      ? 0
      : Math.sign(throttle) * Math.pow(Math.abs(throttle), 1.25) * (throttle > 0 ? MAX_FWD_SPEED : MAX_REV_SPEED);

    for (let step = 0; step < SUB_STEPS; step += 1) {
      const acceleratingSameWay = throttle !== 0 && Math.sign(vTarget) === Math.sign(speed)
        && Math.abs(vTarget) >= Math.abs(speed);
      const accelRate = (Math.abs(speed) < 0.05 && throttle !== 0) || acceleratingSameWay
        ? COACH_ACCEL
        : COACH_DECEL;
      const deltaV = vTarget - speed;
      const maxDv = accelRate * subDt;
      if (Math.abs(deltaV) <= maxDv) {
        speed = vTarget;
      } else {
        speed += Math.sign(deltaV) * maxDv;
      }
      if (throttle === 0 && Math.abs(speed) < 0.04) {
        speed = 0;
      }

      if (Math.abs(speed) > 0.0001) {
        const prevPose = { rx, ry, heading };
        const nextPose = {
          rx: rx + Math.cos(heading) * speed * subDt,
          ry: ry + Math.sin(heading) * speed * subDt,
          heading: wrapAngle(heading + (speed / COACH_WHEELBASE) * Math.tan(steerAngle) * subDt),
          steerInput,
          throttle,
          speed,
        };
        const hit = checkCoachCollision(nextPose, map);
        if (hit.hit) {
          rx = prevPose.rx;
          ry = prevPose.ry;
          heading = prevPose.heading;
          stalledDir = Math.sign(speed || throttle || 1);
          speed = 0;
          bumps += 1;
          lastHit = {
            x: hit.contactPoint?.x ?? rx,
            y: hit.contactPoint?.y ?? ry,
            atMs: elapsedMs,
            kind: hit.obstacleKind,
          };
          bumpMarkers = [...bumpMarkers.slice(-11), lastHit];
          if (bumps >= MAX_BUMPS) {
            status = 'wrecked';
          }
          break;
        }
        rx = nextPose.rx;
        ry = nextPose.ry;
        heading = nextPose.heading;
        stalledDir = 0;
      }
    }
  } else {
    speed = 0;
  }

  // Record light rear-axle tyre marks while moving
  if (status !== 'wrecked') {
    const movedDist = Math.hypot(rx - lastTrailPos.x, ry - lastTrailPos.y);
    if (movedDist >= 0.48) {
      const nx = -Math.sin(heading);
      const ny = Math.cos(heading);
      const trackHalf = COACH_WIDTH * 0.42;
      const entry = {
        lx: rx - nx * trackHalf,
        ly: ry - ny * trackHalf,
        rx: rx + nx * trackHalf,
        ry: ry + ny * trackHalf,
        rev: speed < -0.05,
      };
      trails = trails.length >= MAX_TRAIL_POINTS
        ? [...trails.slice(trails.length - MAX_TRAIL_POINTS + 1), entry]
        : [...trails, entry];
      lastTrailPos = { x: rx, y: ry };
    }
  }

  const nextCoach = {
    rx,
    ry,
    heading,
    steerInput,
    throttle,
    speed,
  };

  const bayStatus = evaluateBayParking(nextCoach, map.bay);
  let parkHoldSec = prevState.parkHoldSec || 0;
  let scoreMs = prevState.scoreMs || 0;

  if (status !== 'wrecked') {
    if (bayStatus.readyToHold) {
      parkHoldSec = Math.min(PARK_HOLD_SEC, parkHoldSec + dt);
      if (parkHoldSec >= PARK_HOLD_SEC) {
        status = 'parked';
        scoreMs = Math.round(elapsedMs) + bumps * BUMP_PENALTY_MS;
      }
    } else {
      parkHoldSec = Math.max(0, parkHoldSec - dt * 2.5);
    }
  }

  return {
    coach: nextCoach,
    neutralGateTimer,
    neutralGateBlockedDir,
    prevThrottleDir: throttleDir,
    stalledDir,
    bumps,
    bumpMarkers,
    lastHit,
    parkHoldSec,
    bayStatus,
    started,
    elapsedMs,
    scoreMs,
    status,
    trails,
    lastTrailPos,
  };
}

/**
 * Compute shortest distance from point (px, py) to an obstacle or world boundary.
 */
function distToBox(px, py, box) {
  const cos = Math.cos(box.angle || 0);
  const sin = Math.sin(box.angle || 0);
  const dx = px - box.x;
  const dy = py - box.y;
  const lx = Math.abs(dx * cos + dy * sin) - box.w / 2;
  const ly = Math.abs(-dx * sin + dy * cos) - box.h / 2;
  const ox = Math.max(lx, 0);
  const oy = Math.max(ly, 0);
  if (ox === 0 && oy === 0) return Math.max(lx, ly);
  return Math.hypot(ox, oy);
}

function minClearanceAtPoint(px, py, map) {
  const worldW = map.worldW || WORLD_W;
  const worldH = map.worldH || WORLD_H;
  let minD = Math.min(px - 0.35, worldW - 0.35 - px, py - 0.35, worldH - 0.35 - py);
  if (minD <= 0) return minD;
  const obstacles = map.obstacles || [];
  for (let i = 0; i < obstacles.length; i += 1) {
    const obs = obstacles[i];
    const d = isCircleObstacle(obs)
      ? Math.hypot(px - obs.x, py - obs.y) - obs.r
      : distToBox(px, py, obs);
    if (d < minD) minD = d;
    if (minD <= 0) return minD;
  }
  return minD;
}

/**
 * Validate that a map has clean start & yellow bay placement plus a wide-enough drivable path.
 */
export function validateCoachParkMap(map) {
  if (!map || !map.start || !map.bay) {
    return { valid: false, reason: 'missing_endpoints' };
  }
  const worldW = map.worldW || WORLD_W;
  const worldH = map.worldH || WORLD_H;

  // 1. Start coach must sit well inside yard bounds and clear of every obstacle
  const startCoach = {
    rx: map.start.rx,
    ry: map.start.ry,
    heading: map.start.heading,
    steerInput: 0,
    throttle: 0,
    speed: 0,
  };
  const startCollision = checkCoachCollision(startCoach, map, { inset: -0.45, boundaryMargin: 0.6 });
  if (startCollision.hit) {
    return { valid: false, reason: `start_blocked:${startCollision.obstacleKind}` };
  }

  // 2. Yellow bay corners must stay inside bounds and clear of every obstacle
  const bayCorners = getObbCorners(map.bay.x, map.bay.y, map.bay.w, map.bay.h, map.bay.angle || 0);
  for (let i = 0; i < bayCorners.length; i += 1) {
    const p = bayCorners[i];
    if (p.x < 0.45 || p.x > worldW - 0.45 || p.y < 0.45 || p.y > worldH - 0.45) {
      return { valid: false, reason: 'bay_oob' };
    }
  }
  const bayObb = {
    x: map.bay.x,
    y: map.bay.y,
    w: map.bay.w,
    h: map.bay.h,
    angle: map.bay.angle || 0,
  };
  for (let i = 0; i < (map.obstacles || []).length; i += 1) {
    const obs = map.obstacles[i];
    const hit = isCircleObstacle(obs)
      ? obbIntersectsCircle(bayObb, obs)
      : obbIntersectsObb(bayObb, obs);
    if (hit.hit) {
      return { valid: false, reason: `bay_overlap:${obs.id || i}` };
    }
  }

  // 3. Clearance BFS on a 0.5m grid checking connectivity from start to bay center / approach
  const step = 0.5;
  const cols = Math.floor(worldW / step);
  const rows = Math.floor(worldH / step);
  const MIN_CORRIDOR_RADIUS = 1.65; // >= 3.3m corridor width for 2.55m coach
  const walkable = new Uint8Array(cols * rows);

  for (let r = 0; r < rows; r += 1) {
    const y = (r + 0.5) * step;
    for (let c = 0; c < cols; c += 1) {
      const x = (c + 0.5) * step;
      if (minClearanceAtPoint(x, y, map) >= MIN_CORRIDOR_RADIUS) {
        walkable[r * cols + c] = 1;
      }
    }
  }

  const toCell = (pt) => ({
    c: clamp(Math.floor(pt.x / step), 0, cols - 1),
    r: clamp(Math.floor(pt.y / step), 0, rows - 1),
  });

  const findNearestWalkable = (pt) => {
    const base = toCell(pt);
    if (walkable[base.r * cols + base.c]) return base;
    for (let rad = 1; rad <= 5; rad += 1) {
      for (let dr = -rad; dr <= rad; dr += 1) {
        for (let dc = -rad; dc <= rad; dc += 1) {
          const r = base.r + dr;
          const c = base.c + dc;
          if (r >= 0 && r < rows && c >= 0 && c < cols && walkable[r * cols + c]) {
            return { r, c };
          }
        }
      }
    }
    return null;
  };

  const startCenter = getCoachCenter(startCoach);
  const startCell = findNearestWalkable(startCenter);
  const goalCell = findNearestWalkable(map.approach || { x: map.bay.x, y: map.bay.y });
  const bayCell = findNearestWalkable({ x: map.bay.x, y: map.bay.y });

  if (!startCell || !goalCell || !bayCell) {
    return { valid: false, reason: 'no_walkable_anchor' };
  }

  const visited = new Uint8Array(cols * rows);
  const queue = new Int32Array(cols * rows);
  let head = 0;
  let tail = 0;
  const startIdx = startCell.r * cols + startCell.c;
  visited[startIdx] = 1;
  queue[tail++] = startIdx;

  const dirs = [-1, 1, -cols, cols, -cols - 1, -cols + 1, cols - 1, cols + 1];
  let reachedGoal = false;
  let reachedBay = false;
  const goalIdx = goalCell.r * cols + goalCell.c;
  const bayIdx = bayCell.r * cols + bayCell.c;

  while (head < tail) {
    const idx = queue[head++];
    if (idx === goalIdx) reachedGoal = true;
    if (idx === bayIdx) reachedBay = true;
    if (reachedGoal && reachedBay) break;
    const r = Math.floor(idx / cols);
    const c = idx % cols;
    for (let d = 0; d < dirs.length; d += 1) {
      const nIdx = idx + dirs[d];
      if (nIdx < 0 || nIdx >= cols * rows || visited[nIdx]) continue;
      const nr = Math.floor(nIdx / cols);
      const nc = nIdx % cols;
      if (Math.abs(nr - r) > 1 || Math.abs(nc - c) > 1) continue;
      if (!walkable[nIdx]) continue;
      visited[nIdx] = 1;
      queue[tail++] = nIdx;
    }
  }

  if (!reachedGoal || !reachedBay) {
    return { valid: false, reason: 'path_disconnected' };
  }

  return { valid: true };
}

function makeParkedCoach(id, x, y, angle, rng) {
  const liveries = ['#6b1426', '#7a192c', '#5e1121', '#73162a', '#641323'];
  const idx = Math.floor(rng() * liveries.length);
  return {
    id,
    kind: 'coach',
    x,
    y,
    w: COACH_LENGTH,
    h: COACH_WIDTH,
    angle,
    color: liveries[idx],
  };
}

function mirrorLayout(layout, mirrorX, mirrorY) {
  const worldW = WORLD_W;
  const worldH = WORLD_H;
  const tx = (x) => (mirrorX ? worldW - x : x);
  const ty = (y) => (mirrorY ? worldH - y : y);
  const tang = (a) => {
    let out = a || 0;
    if (mirrorX) out = Math.PI - out;
    if (mirrorY) out = -out;
    return wrapAngle(out);
  };

  return {
    ...layout,
    worldW,
    worldH,
    start: {
      rx: tx(layout.start.rx),
      ry: ty(layout.start.ry),
      heading: tang(layout.start.heading),
    },
    bay: {
      ...layout.bay,
      x: tx(layout.bay.x),
      y: ty(layout.bay.y),
      angle: tang(layout.bay.angle || 0),
    },
    approach: layout.approach
      ? { x: tx(layout.approach.x), y: ty(layout.approach.y) }
      : null,
    obstacles: layout.obstacles.map((obs) => (
      isCircleObstacle(obs)
        ? { ...obs, x: tx(obs.x), y: ty(obs.y) }
        : { ...obs, x: tx(obs.x), y: ty(obs.y), angle: tang(obs.angle || 0) }
    )),
    markings: (layout.markings || []).map((m) => ({
      ...m,
      x: tx(m.x),
      y: ty(m.y),
      ...(typeof m.x2 === 'number' ? { x2: tx(m.x2), y2: ty(m.y2) } : {}),
      ...(typeof m.angle === 'number' ? { angle: tang(m.angle) } : {}),
    })),
  };
}

const ARCHETYPES = [
  {
    id: 'depot_alley',
    name: 'Depot Alley Bays',
    hint: 'Swing past the workshop island and tuck into the yellow bay between the parked fleet.',
    build(rng) {
      const baySlots = [16.5, 24.0, 31.5, 39.0];
      const targetSlot = Math.floor(rng() * baySlots.length);
      const bayX = baySlots[targetSlot] + (rng() - 0.5) * 0.6;
      const obstacles = [
        // Upper workshop office block on north wall
        { id: 'office', kind: 'building', x: 52, y: 4.5, w: 20, h: 6.5, angle: 0, label: 'WORKSHOP' },
        // Mid-yard traffic island forcing an S-swing
        { id: 'island', kind: 'island', x: 24 + (rng() - 0.5) * 5, y: 14.5 + (rng() - 0.5) * 1.5, w: 9.5, h: 2.2, angle: 0 },
        { id: 'bollard-l', kind: 'bollard', x: 10.5, y: 26.5, r: 0.7 },
        { id: 'bollard-r', kind: 'bollard', x: 46.5, y: 26.5, r: 0.7 },
      ];
      for (let i = 0; i < baySlots.length; i += 1) {
        if (i === targetSlot) continue;
        obstacles.push(makeParkedCoach(`parked-${i}`, baySlots[i], 32.0, -Math.PI / 2, rng));
      }
      return {
        start: { rx: 6.5, ry: 7.2 + (rng() - 0.5) * 1.4, heading: 0 },
        bay: { x: bayX, y: 31.8, w: BAY_LENGTH, h: BAY_WIDTH, angle: -Math.PI / 2 },
        approach: { x: bayX, y: 21.0 },
        obstacles,
        markings: [
          { type: 'arrow', x: 16, y: 7.5, angle: 0 },
          { type: 'line', x: 6, y: 19.5, x2: 52, y2: 19.5 },
        ],
      };
    },
  },
  {
    id: 's_bend_chicane',
    name: 'Yard Chicane',
    hint: 'Thread both staggered islands smoothly — lock holds around corners until you straighten.',
    build(rng) {
      const bayAngle = ((rng() - 0.5) * 20 * Math.PI) / 180;
      const bayY = 12 + rng() * 14;
      const obstacles = [
        { id: 'chicane-1', kind: 'kerb', x: 22.5 + (rng() - 0.5) * 2, y: 12.0, w: 4.0, h: 19.0, angle: 0 },
        { id: 'chicane-2', kind: 'kerb', x: 38.5 + (rng() - 0.5) * 2, y: 28.0, w: 4.0, h: 19.0, angle: 0 },
        makeParkedCoach('parked-top', 54.0, 4.2, Math.PI, rng),
        makeParkedCoach('parked-bot', 54.0, 35.8, Math.PI, rng),
        { id: 'cone-1', kind: 'cone', x: 15.5, y: 22.0, r: 0.55 },
        { id: 'cone-2', kind: 'cone', x: 30.5, y: 17.5, r: 0.55 },
      ];
      return {
        start: { rx: 6.0, ry: 31.5 + (rng() - 0.5) * 2, heading: -0.05 },
        bay: { x: 54.2, y: bayY, w: BAY_LENGTH, h: BAY_WIDTH, angle: bayAngle },
        approach: { x: 45.5, y: 12.5 },
        obstacles,
        markings: [
          { type: 'arrow', x: 15, y: 31, angle: -0.25 },
          { type: 'arrow', x: 30, y: 11, angle: 0.25 },
        ],
      };
    },
  },
  {
    id: 'courtyard_uturn',
    name: 'Wash Bay U-Turn',
    hint: 'Loop around the central wash bay and watch your rear overhang on the return.',
    build(rng) {
      const washShift = (rng() - 0.5) * 3;
      const bayX = 16 + rng() * 10;
      const obstacles = [
        { id: 'wash', kind: 'building', x: 20.5 + washShift, y: 20.0, w: 32.0, h: 6.2, angle: 0, label: 'WASH BAY' },
        { id: 'skip', kind: 'skip', x: 58.2, y: 8.0 + (rng() - 0.5) * 3, w: 4.5, h: 3.2, angle: 0.2 },
        { id: 'cone-turn', kind: 'cone', x: 57.5, y: 31.5, r: 0.65 },
        { id: 'bollard-w', kind: 'bollard', x: 37.8 + washShift, y: 17.2, r: 0.65 },
        makeParkedCoach('parked-bottom', bayX + 16.5, 34.5, Math.PI, rng),
      ];
      return {
        start: { rx: 6.5, ry: 8.8, heading: 0 },
        bay: { x: bayX, y: 34.0, w: BAY_LENGTH, h: BAY_WIDTH, angle: Math.PI },
        approach: { x: 46, y: 27 },
        obstacles,
        markings: [
          { type: 'arrow', x: 24, y: 8.8, angle: 0 },
          { type: 'arrow', x: 48, y: 20, angle: Math.PI / 2 },
          { type: 'arrow', x: 32, y: 30, angle: Math.PI },
        ],
      };
    },
  },
  {
    id: 'parallel_squeeze',
    name: 'Curbside Parallel',
    hint: 'Pull alongside the front coach, set full lock, and glide back into the kerb box.',
    build(rng) {
      const bayX = 32 + (rng() - 0.5) * 4;
      const bayY = 34.2;
      const gapOffset = 15.0 + rng() * 1.1; // 14.2 bay + clearance outside bumpers
      const obstacles = [
        makeParkedCoach('lead-coach', bayX + gapOffset, bayY + 0.1, 0, rng),
        makeParkedCoach('tail-coach', bayX - gapOffset, bayY + 0.1, 0, rng),
        { id: 'island-top', kind: 'kerb', x: 32, y: 6.5, w: 42, h: 3.2, angle: 0 },
        { id: 'cone-road-1', kind: 'cone', x: 18 + (rng() - 0.5) * 3, y: 20.5, r: 0.6 },
        { id: 'cone-road-2', kind: 'cone', x: 46 + (rng() - 0.5) * 3, y: 20.5, r: 0.6 },
      ];
      return {
        start: { rx: 6.8, ry: 14.2, heading: 0 },
        bay: { x: bayX, y: bayY, w: BAY_LENGTH, h: BAY_WIDTH, angle: 0 },
        approach: { x: bayX, y: 26.5 },
        obstacles,
        markings: [
          { type: 'line', x: 5, y: 27.5, x2: 59, y2: 27.5 },
          { type: 'arrow', x: 18, y: 14.5, angle: 0 },
        ],
      };
    },
  },
  {
    id: 'workshop_gate',
    name: 'Gate Slalom',
    hint: 'Angle cleanly through the depot security gate before weaving to the far bay.',
    build(rng) {
      const gateY = 14 + rng() * 12;
      const halfGap = 5.4;
      const upperH = Math.max(2, gateY - halfGap);
      const lowerStart = gateY + halfGap;
      const lowerH = Math.max(2, WORLD_H - lowerStart);
      const obstacles = [
        { id: 'wall-top', kind: 'building', x: 25.0, y: upperH / 2, w: 3.0, h: upperH, angle: 0, label: 'GATE' },
        { id: 'wall-bot', kind: 'building', x: 25.0, y: lowerStart + lowerH / 2, w: 3.0, h: lowerH, angle: 0 },
        { id: 'gate-post-1', kind: 'bollard', x: 25.0, y: gateY - halfGap + 0.4, r: 0.55 },
        { id: 'gate-post-2', kind: 'bollard', x: 25.0, y: gateY + halfGap - 0.4, r: 0.55 },
        { id: 'skip-mid', kind: 'skip', x: 40.5, y: gateY > 20 ? 11.5 : 28.5, w: 5.5, h: 3.6, angle: 0.35 },
        makeParkedCoach('fleet-guard', 54.5, gateY > 20 ? 29.0 : 11.0, Math.PI, rng),
      ];
      const bayY = gateY > 20 ? 9.5 : 30.5;
      return {
        start: { rx: 6.0, ry: 20.0 + (rng() - 0.5) * 4, heading: 0 },
        bay: { x: 53.5, y: bayY, w: BAY_LENGTH, h: BAY_WIDTH, angle: 0 },
        approach: { x: 35.0, y: gateY },
        obstacles,
        markings: [
          { type: 'arrow', x: 16, y: 20, angle: 0 },
          { type: 'arrow', x: 36, y: bayY, angle: 0 },
        ],
      };
    },
  },
  {
    id: 'herringbone_station',
    name: 'Coach Station Sawtooth',
    hint: 'Reverse or nose into the angled concourse bay without clipping parked coaches.',
    build(rng) {
      const bayDeg = 35 + rng() * 7;
      const bayAng = (bayDeg * Math.PI) / 180;
      const bayX = 41.5 + (rng() - 0.5) * 2;
      const bayY = 27.5;
      const pitch = 7.4; // perp spacing along bay row
      const perpX = Math.sin(bayAng);
      const perpY = -Math.cos(bayAng);
      const obstacles = [
        { id: 'concourse', kind: 'building', x: 32, y: 3.0, w: 56, h: 4.5, angle: 0, label: 'TERMINAL' },
        { id: 'island', kind: 'island', x: 21.0, y: 12.5, w: 12.0, h: 2.2, angle: 0 },
        makeParkedCoach('sawtooth-l', bayX - perpX * pitch, bayY - perpY * pitch, bayAng, rng),
        makeParkedCoach('sawtooth-r', bayX + perpX * pitch, bayY + perpY * pitch, bayAng, rng),
        { id: 'cone-bay', kind: 'cone', x: 12.0, y: 27.0, r: 0.65 },
      ];
      return {
        start: { rx: 6.2, ry: 20.5, heading: 0 },
        bay: { x: bayX, y: bayY, w: BAY_LENGTH, h: BAY_WIDTH, angle: bayAng },
        approach: { x: bayX - Math.cos(bayAng) * 11, y: bayY - Math.sin(bayAng) * 11 },
        obstacles,
        markings: [
          { type: 'arrow', x: 14, y: 8.5, angle: 0 },
        ],
      };
    },
  },
  {
    id: 'hairpin_compound',
    name: 'Hairpin Compound',
    hint: 'Two tight 90° turns with a corner bollard pinch — ease back on throttle early.',
    build(rng) {
      const offset = (rng() - 0.5) * 3;
      const obstacles = [
        { id: 'baffle-v1', kind: 'kerb', x: 21.5 + offset, y: 14.5, w: 3.2, h: 25.0, angle: 0 },
        { id: 'baffle-v2', kind: 'kerb', x: 43.0 + offset, y: 25.5, w: 3.2, h: 25.0, angle: 0 },
        { id: 'bollard-a', kind: 'bollard', x: 21.5 + offset, y: 28.8, r: 0.6 },
        { id: 'bollard-b', kind: 'bollard', x: 43.0 + offset, y: 11.2, r: 0.6 },
        makeParkedCoach('parked-end', 56.0, 6.2, Math.PI, rng),
      ];
      return {
        start: { rx: 10.5, ry: 28.0, heading: -Math.PI / 2 },
        bay: { x: 54.0, y: 31.8, w: BAY_LENGTH, h: BAY_WIDTH, angle: Math.PI / 2 },
        approach: { x: 54.0, y: 18.0 },
        obstacles,
        markings: [
          { type: 'arrow', x: 10.5, y: 16, angle: -Math.PI / 2 },
          { type: 'arrow', x: 32, y: 8, angle: 0 },
        ],
      };
    },
  },
  {
    id: 'roundabout_dropoff',
    name: 'Turnaround Island',
    hint: 'Top path is blocked for works — swing right around the roundabout into the drop-off box.',
    build(rng) {
      const cx = 30.0 + (rng() - 0.5) * 3;
      const cy = 20.0;
      const r = 4.5 + rng() * 0.6;
      const obstacles = [
        { id: 'planter', kind: 'planter', x: cx, y: cy, r },
        // Roadworks barricade blocking top half so player must take southern loop
        { id: 'roadworks', kind: 'skip', x: cx, y: 7.2, w: 6.0, h: 3.4, angle: 0 },
        { id: 'cone-rw1', kind: 'cone', x: cx - 4.2, y: 11.2, r: 0.65 },
        { id: 'cone-rw2', kind: 'cone', x: cx + 4.2, y: 11.2, r: 0.65 },
        makeParkedCoach('parked-upper', 54.0, 8.2, Math.PI, rng),
        { id: 'kerb-drop', kind: 'kerb', x: 54.0, y: 36.2, w: 15.0, h: 2.2, angle: 0 },
      ];
      return {
        start: { rx: 6.2, ry: 15.0 + (rng() - 0.5) * 2, heading: 0.15 },
        bay: { x: 53.5, y: 29.0, w: BAY_LENGTH, h: BAY_WIDTH, angle: 0 },
        approach: { x: cx, y: 32.0 },
        obstacles,
        markings: [
          { type: 'arrow', x: cx, y: 31.5, angle: 0 },
        ],
      };
    },
  },
];

function pickArchetypeIndex(dayKey) {
  // Deterministic non-repeating daily rotation across the 8 archetypes
  const parts = String(dayKey || '2026-11-25').split('-').map(Number);
  const y = parts[0] || 2026;
  const m = parts[1] || 11;
  const d = parts[2] || 25;
  const epochDays = Math.floor(Date.UTC(y, m - 1, d) / 86400000);
  const block = Math.floor(epochDays / ARCHETYPES.length);
  const posInBlock = ((epochDays % ARCHETYPES.length) + ARCHETYPES.length) % ARCHETYPES.length;
  const buildBaseOrder = (blk) => {
    const rng = mulberry32(hashString(`coachpark:order:v1:${blk}`));
    const indices = ARCHETYPES.map((_, i) => i);
    for (let i = indices.length - 1; i > 0; i -= 1) {
      const j = Math.floor(rng() * (i + 1));
      [indices[i], indices[j]] = [indices[j], indices[i]];
    }
    return indices;
  };
  const order = buildBaseOrder(block);
  const prevLast = buildBaseOrder(block - 1)[ARCHETYPES.length - 1];
  // Swapping indices 0 & 1 never changes index 7, so apply it consistently for the whole block.
  if (order[0] === prevLast) {
    [order[0], order[1]] = [order[1], order[0]];
  }
  return order[posInBlock];
}

export function generateCoachParkMap(dayKey = '2026-11-25', { salt = 0 } = {}) {
  const key = String(dayKey || '2026-11-25');
  const baseArchIdx = pickArchetypeIndex(key);
  const arch = ARCHETYPES[(baseArchIdx + (salt > 8 ? salt - 8 : 0)) % ARCHETYPES.length];

  for (let attempt = 0; attempt < 16; attempt += 1) {
    const rng = mulberry32(hashString(`coachpark:v1:${key}:s${salt}:a${attempt}`));
    const mirrorX = rng() < 0.5;
    const mirrorY = rng() < 0.5;
    const raw = arch.build(rng);
    const layout = mirrorLayout(raw, mirrorX, mirrorY);
    const map = {
      id: `coachpark-${key}`,
      dayKey: key,
      archetype: arch.id,
      title: arch.name,
      hint: arch.hint,
      ...layout,
    };
    const check = validateCoachParkMap(map);
    if (check.valid) return map;
  }

  // Deterministic guaranteed open depot fallback
  const fallback = mirrorLayout({
    start: { rx: 6.5, ry: 8.5, heading: 0 },
    bay: { x: 49.0, y: 31.5, w: BAY_LENGTH, h: BAY_WIDTH, angle: 0 },
    approach: { x: 30.0, y: 20.0 },
    obstacles: [
      { id: 'fb-island', kind: 'island', x: 28.0, y: 17.5, w: 10.0, h: 2.5, angle: 0 },
      { id: 'fb-bollard', kind: 'bollard', x: 40.0, y: 24.5, r: 0.7 },
    ],
    markings: [{ type: 'arrow', x: 18, y: 8.5, angle: 0 }],
  }, false, false);
  return {
    id: `coachpark-${key}`,
    dayKey: key,
    archetype: 'depot_alley',
    title: 'Depot Yard',
    hint: 'Ease the coach into the yellow bay.',
    ...fallback,
  };
}
