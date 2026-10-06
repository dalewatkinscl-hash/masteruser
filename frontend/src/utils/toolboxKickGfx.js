/**
 * Little Dick's Toolbox — high-impact graphics & SFX layer.
 * Assets: Kenney.nl CC0 (see public/toolbox-kick/assets/README.txt).
 */

const ASSET_BASE = '/toolbox-kick/assets';
/** Bump when replacing public sprites so browsers skip stale PNG cache. */
const ASSET_VER = 'chelle-d-v1';

const GFX_FILES = {
  bgSky: 'gfx/bg_sky.png',
  bgHills: 'gfx/bg_hills.png',
  bgClouds: 'gfx/bg_clouds.png',
  grassTop: 'gfx/grass_top.png',
  grassMid: 'gfx/grass_mid.png',
  dirt: 'gfx/dirt.png',
  // hill.png intentionally unused — it is a green square tile, not rolling hills
  sign: 'gfx/sign.png',
  toolboxCrate: 'gfx/toolbox_crate.png',
  toolboxBlock: 'gfx/toolbox_block.png',
  mechIdle: 'gfx/human_mech_idle.png',
  mechKick: 'gfx/human_mech_kick.png',
  mechWalkA: 'gfx/human_mech_walk_a.png',
  mechWalkB: 'gfx/human_mech_walk_b.png',
  smokerIdle: 'gfx/human_smoker_idle.png',
  smokerDuck: 'gfx/human_smoker_duck.png',
  dickIdle: 'gfx/human_dick_idle.png',
  dickHit: 'gfx/human_dick_hit.png',
  dickKick: 'gfx/human_dick_kick.png',
  chelleIdle: 'gfx/chelle_blonde_idle.png',
  chelleRead: 'gfx/chelle_blonde_read.png',
  chelleLaunch: 'gfx/chelle_blonde_launch.png',
  busTop: 'gfx/bus_top.png',
  busSchool: 'gfx/bus_school_top.png',
  suvTop: 'gfx/suv_top.png',
  sportsTop: 'gfx/sports_top.png',
  vanTop: 'gfx/van_top.png',
};

const SFX_FILES = {
  kick: 'sfx/kick.ogg',
  bounce: 'sfx/bounce.ogg',
  boost: 'sfx/boost.ogg',
  bump: 'sfx/bump.ogg',
  coach: 'sfx/coach.ogg',
  grass: 'sfx/grass.ogg',
  land: 'sfx/land.ogg',
  lock: 'sfx/lock.ogg',
  perfect: 'sfx/perfect.ogg',
  qte: 'sfx/qte.ogg',
  qteOk: 'sfx/qte_ok.ogg',
  qteFail: 'sfx/qte_fail.ogg',
  rare: 'sfx/rare.ogg',
  select: 'sfx/select.ogg',
  coin: 'sfx/coin.ogg',
  jingleHit: 'sfx/jingle_hit.ogg',
  jingleWin: 'sfx/jingle_win.ogg',
  metalHeavy: 'sfx/metal_heavy.ogg',
  ui: 'sfx/ui.ogg',
};

function loadImage(src) {
  return new Promise((resolve) => {
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

function loadAudio(src) {
  return new Promise((resolve) => {
    const a = new Audio();
    a.preload = 'auto';
    const done = () => resolve(a);
    a.addEventListener('canplaythrough', done, { once: true });
    a.addEventListener('error', () => resolve(null), { once: true });
    a.src = src;
    a.load();
    // Safari sometimes never fires canplaythrough for short oggs
    window.setTimeout(() => resolve(a), 2500);
  });
}

export function createToolboxKickGfx() {
  const images = {};
  const buffers = {};
  let ready = false;
  let muted = false;
  let volume = 0.55;
  let unlocked = false;
  const particles = [];
  let shake = 0;
  let shakeX = 0;
  let shakeY = 0;
  let speedLines = 0;

  async function preload() {
    const imgEntries = Object.entries(GFX_FILES);
    const sfxEntries = Object.entries(SFX_FILES);
    const imgs = await Promise.all(
      imgEntries.map(([, file]) => loadImage(`${ASSET_BASE}/${file}?v=${ASSET_VER}`)),
    );
    imgEntries.forEach(([key], i) => {
      images[key] = imgs[i];
    });
    const auds = await Promise.all(
      sfxEntries.map(([, file]) => loadAudio(`${ASSET_BASE}/${file}?v=${ASSET_VER}`)),
    );
    sfxEntries.forEach(([key], i) => {
      buffers[key] = auds[i];
    });
    ready = Object.values(images).some(Boolean);
    return ready;
  }

  function unlock() {
    if (unlocked) return;
    unlocked = true;
    // Warm one silent play after user gesture
    try {
      const a = buffers.select || buffers.lock;
      if (a) {
        a.volume = 0.001;
        a.play().then(() => {
          a.pause();
          a.currentTime = 0;
        }).catch(() => {});
      }
    } catch {
      /* ignore */
    }
  }

  function setMuted(next) {
    muted = Boolean(next);
  }

  function isMuted() {
    return muted;
  }

  function play(name, { vol = 1, rate = 1 } = {}) {
    if (muted || !unlocked) return;
    const src = buffers[name];
    if (!src) return;
    try {
      const a = src.cloneNode();
      a.volume = Math.max(0, Math.min(1, volume * vol));
      if (rate !== 1 && a.playbackRate !== undefined) a.playbackRate = rate;
      a.play().catch(() => {});
    } catch {
      /* ignore */
    }
  }

  function burst(x, y, {
    count = 10,
    color = '#fbbf24',
    speed = 3.5,
    life = 28,
    gravity = 0.12,
    size = 3,
  } = {}) {
    for (let i = 0; i < count; i += 1) {
      const ang = (Math.PI * 2 * i) / count + Math.random() * 0.4;
      const sp = speed * (0.45 + Math.random());
      particles.push({
        x,
        y,
        vx: Math.cos(ang) * sp,
        vy: Math.sin(ang) * sp - 1.2,
        life,
        max: life,
        color,
        gravity,
        size: size * (0.6 + Math.random() * 0.8),
      });
    }
  }

  function dust(x, y, facing = 1) {
    for (let i = 0; i < 8; i += 1) {
      particles.push({
        x: x + (Math.random() - 0.5) * 18,
        y: y + Math.random() * 4,
        vx: -facing * (1.2 + Math.random() * 2.2),
        vy: -0.6 - Math.random() * 1.4,
        life: 20 + Math.random() * 12,
        max: 32,
        color: 'rgba(180,160,120,0.85)',
        gravity: 0.08,
        size: 2 + Math.random() * 3,
      });
    }
  }

  function addShake(amount = 6) {
    shake = Math.max(shake, amount);
  }

  function setSpeedLines(amount) {
    speedLines = Math.max(0, Math.min(1, amount));
  }

  function tickVfx() {
    if (shake > 0) {
      shake *= 0.82;
      if (shake < 0.35) shake = 0;
      shakeX = (Math.random() - 0.5) * shake * 2;
      shakeY = (Math.random() - 0.5) * shake * 2;
    } else {
      shakeX = 0;
      shakeY = 0;
    }
    for (let i = particles.length - 1; i >= 0; i -= 1) {
      const p = particles[i];
      p.life -= 1;
      p.x += p.vx;
      p.y += p.vy;
      p.vy += p.gravity;
      if (p.life <= 0) particles.splice(i, 1);
    }
  }

  function getShake() {
    return { x: shakeX, y: shakeY };
  }

  function img(key) {
    return images[key] || null;
  }

  function drawTiled(ctx, image, x0, y, width, tileW, tileH, scrollX = 0) {
    if (!image || !image.width) return false;
    const tw = tileW || image.width;
    const th = tileH || image.height;
    const offset = ((scrollX % tw) + tw) % tw;
    for (let x = x0 - offset; x < x0 + width + tw; x += tw) {
      ctx.drawImage(image, x, y, tw, th);
    }
    return true;
  }

  /** Parallax sky / hills / clouds / grass strip. Returns true if assets drew. */
  function drawWorldBackground(ctx, {
    W,
    H,
    groundY,
    camX = 0,
    wet = false,
    frame = 0,
  }) {
    const sky = img('bgSky');
    const hills = img('bgHills');
    const clouds = img('bgClouds');

    if (sky) {
      // Stretch sky across upper half
      ctx.drawImage(sky, 0, 0, W, groundY);
    } else {
      const g = ctx.createLinearGradient(0, 0, 0, groundY);
      g.addColorStop(0, wet ? '#64748b' : '#7dd3fc');
      g.addColorStop(1, wet ? '#94a3b8' : '#bae6fd');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, groundY);
    }

    if (hills) {
      const hillScroll = camX * 0.18;
      const hH = Math.min(160, groundY * 0.55);
      ctx.globalAlpha = wet ? 0.55 : 0.85;
      drawTiled(ctx, hills, 0, groundY - hH + 8, W, hills.width * (hH / hills.height), hH, hillScroll);
      ctx.globalAlpha = 1;
    }

    if (clouds) {
      const cScroll = camX * 0.08 + frame * 0.15;
      const cH = 90;
      ctx.globalAlpha = wet ? 0.35 : 0.7;
      drawTiled(ctx, clouds, 0, 18, W, clouds.width * (cH / clouds.height), cH, cScroll);
      ctx.globalAlpha = wet ? 0.25 : 0.45;
      drawTiled(ctx, clouds, 0, 70, W, clouds.width * 0.7, 70, cScroll * 1.4 + 120);
      ctx.globalAlpha = 1;
    }

    // Soft continuous ground — skip chunky Kenney grass/dirt tiles (read as green boxes).
    // Rolling hills come from bgHills above; do NOT draw hill.png (green squares with dark edges).
    const soil = ctx.createLinearGradient(0, groundY - 8, 0, H);
    soil.addColorStop(0, wet ? '#6b8f4e' : '#7cb342');
    soil.addColorStop(0.08, wet ? '#4a6b3a' : '#5a9a45');
    soil.addColorStop(0.35, wet ? '#3a5534' : '#3f6b38');
    soil.addColorStop(1, wet ? '#2a3a28' : '#2f4a2c');
    ctx.fillStyle = soil;
    ctx.fillRect(0, groundY - 4, W, H - groundY + 4);
    // Thin grass lip
    ctx.fillStyle = wet ? 'rgba(107,143,78,0.9)' : 'rgba(124,179,66,0.95)';
    ctx.fillRect(0, groundY - 3, W, 5);
    ctx.fillStyle = 'rgba(0,0,0,0.12)';
    ctx.fillRect(0, groundY + 2, W, 2);

    if (wet) {
      ctx.fillStyle = 'rgba(30,50,70,0.18)';
      ctx.fillRect(0, 0, W, H);
    }
    return Boolean(sky || hills);
  }

  function drawToolboxSprite(ctx, x, y, rot, flying, oiled = false) {
    const crate = img('toolboxCrate') || img('toolboxBlock');
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rot);
    // shadow
    ctx.fillStyle = 'rgba(0,0,0,0.22)';
    ctx.beginPath();
    ctx.ellipse(0, 12, 18, 5, 0, 0, Math.PI * 2);
    ctx.fill();
    if (crate) {
      const w = 40;
      const h = 34;
      if (oiled) ctx.filter = 'sepia(0.55) saturate(0.7) brightness(0.75)';
      else ctx.filter = 'sepia(0.35) saturate(1.4) hue-rotate(-8deg) brightness(1.05)';
      ctx.drawImage(crate, -w / 2, -h / 2 - 2, w, h);
      ctx.filter = 'none';
      // metal latch
      ctx.fillStyle = '#1f2937';
      ctx.fillRect(-5, -h / 2 - 6, 10, 7);
      ctx.strokeStyle = '#111';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, -h / 2 - 6, 6, Math.PI, 0);
      ctx.stroke();
    } else {
      return false;
    }
    if (flying) {
      ctx.strokeStyle = oiled ? 'rgba(80,70,20,0.45)' : 'rgba(255,220,100,0.55)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(-22, 0);
      ctx.lineTo(-38, 6);
      ctx.moveTo(-20, 4);
      ctx.lineTo(-34, 12);
      ctx.stroke();
    }
    if (oiled) {
      ctx.fillStyle = 'rgba(180,160,40,0.35)';
      ctx.beginPath();
      ctx.ellipse(4, -4, 6, 3, 0.3, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
    return true;
  }

  /** Side-view coach — painted bus (Kenney vehicles are top-down). */
  function drawSideCoach(ctx, x, y, w, h, variant = 0) {
    ctx.save();
    ctx.translate(x, y);
    const bodyTop = -h;
    const colors = [
      { body: '#7f1d1d', stripe: '#fef3c7', window: '#93c5fd' },
      { body: '#1e3a5f', stripe: '#e2e8f0', window: '#bae6fd' },
      { body: '#14532d', stripe: '#fde68a', window: '#a5f3fc' },
    ];
    const c = colors[variant % colors.length];
    // shadow
    ctx.fillStyle = 'rgba(0,0,0,0.2)';
    ctx.beginPath();
    ctx.ellipse(w * 0.5, 4, w * 0.48, 7, 0, 0, Math.PI * 2);
    ctx.fill();
    // body
    const grad = ctx.createLinearGradient(0, bodyTop, 0, 0);
    grad.addColorStop(0, c.body);
    grad.addColorStop(1, '#3f0f14');
    ctx.fillStyle = grad;
    ctx.strokeStyle = '#1a0508';
    ctx.lineWidth = 2;
    roundRectPath(ctx, 0, bodyTop, w, h, 10);
    ctx.fill();
    ctx.stroke();
    // roof lip
    ctx.fillStyle = 'rgba(255,255,255,0.12)';
    ctx.fillRect(6, bodyTop + 4, w - 12, 6);
    // cream stripe
    ctx.fillStyle = c.stripe;
    ctx.fillRect(0, bodyTop + h * 0.38, w, 7);
    // windows
    const winCount = Math.max(3, Math.floor(w / 30));
    const winW = Math.min(16, (w - 24) / winCount - 4);
    for (let i = 0; i < winCount; i += 1) {
      const wx = 12 + i * ((w - 24) / winCount);
      ctx.fillStyle = c.window;
      roundRectPath(ctx, wx, bodyTop + 16, winW, 16, 3);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.35)';
      ctx.fillRect(wx + 2, bodyTop + 17, winW * 0.35, 5);
    }
    // door
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    roundRectPath(ctx, w - 28, bodyTop + 14, 16, h - 28, 3);
    ctx.fill();
    // wheels
    drawWheel(ctx, 22, 0, 11);
    drawWheel(ctx, w - 22, 0, 11);
    if (w > 90) drawWheel(ctx, w * 0.42, 0, 10);
    ctx.restore();
  }

  function drawWheel(ctx, cx, cy, r) {
    ctx.fillStyle = '#111';
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#64748b';
    ctx.beginPath();
    ctx.arc(cx, cy, r * 0.45, 0, Math.PI * 2);
    ctx.fill();
  }

  function roundRectPath(ctx, x, y, w, h, r) {
    const rr = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + rr, y);
    ctx.arcTo(x + w, y, x + w, y + h, rr);
    ctx.arcTo(x + w, y + h, x, y + h, rr);
    ctx.arcTo(x, y + h, x, y, rr);
    ctx.arcTo(x, y, x + w, y, rr);
    ctx.closePath();
  }

  function drawCharSprite(ctx, key, x, y, {
    flip = false,
    scale = 1,
    bob = 0,
  } = {}) {
    const image = img(key);
    if (!image) return false;
    // Kenney Toon Characters are taller humans — give them a bit more presence.
    const h = 78 * scale;
    const w = (image.width / image.height) * h;
    ctx.save();
    ctx.translate(x, y + bob);
    if (flip) ctx.scale(-1, 1);
    ctx.drawImage(image, -w / 2, -h, w, h);
    ctx.restore();
    return true;
  }

  function drawParticles(ctx, camX) {
    for (const p of particles) {
      const alpha = Math.max(0, p.life / p.max);
      ctx.globalAlpha = alpha;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x - camX, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  function drawSpeedLines(ctx, W, H, groundY, intensity) {
    if (intensity < 0.08) return;
    ctx.save();
    ctx.strokeStyle = `rgba(255,255,255,${0.12 + intensity * 0.25})`;
    ctx.lineWidth = 2;
    const n = Math.floor(8 + intensity * 18);
    for (let i = 0; i < n; i += 1) {
      const y = 20 + Math.random() * (groundY - 40);
      const len = 40 + intensity * 90 * Math.random();
      const x = Math.random() * W;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x - len, y + (Math.random() - 0.5) * 4);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawTrailGhosts(ctx, box, camX, drawFn) {
    if (!box || Math.hypot(box.vx, box.vy) < 8) return;
    const steps = 3;
    for (let i = steps; i >= 1; i -= 1) {
      const t = i / (steps + 1);
      ctx.globalAlpha = 0.12 * (1 - t);
      drawFn(
        box.x - box.vx * i * 1.8 - camX,
        box.y - box.vy * i * 1.8,
        box.rot - box.spin * i * 0.4,
      );
    }
    ctx.globalAlpha = 1;
  }

  return {
    preload,
    unlock,
    play,
    setMuted,
    isMuted,
    burst,
    dust,
    addShake,
    setSpeedLines,
    tickVfx,
    getShake,
    img,
    ready: () => ready,
    drawWorldBackground,
    drawToolboxSprite,
    drawSideCoach,
    drawCharSprite,
    drawParticles,
    drawSpeedLines,
    drawTrailGhosts,
  };
}

export const TOOLBOX_KICK_GFX_ENABLED = true;
