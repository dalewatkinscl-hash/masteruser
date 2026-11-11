/**
 * Little Dick's Toolbox — Christmas ("Miracle on Lion Way" / "Santa Dick's Workshop") theme layer.
 * Provides festive snowy canvas environments, reskinned winter obstacles, character costume overlays,
 * and zero-dependency Web Audio sleigh-bell / festive chime sound effects.
 */

let christmasAudioCtx = null;

function getChristmasAudioCtx() {
  if (typeof window === 'undefined') return null;
  const Ctx = window.AudioContext || window.webkitAudioContext;
  if (!Ctx) return null;
  if (!christmasAudioCtx) {
    christmasAudioCtx = new Ctx();
  }
  if (christmasAudioCtx.state === 'suspended') {
    christmasAudioCtx.resume().catch(() => {});
  }
  return christmasAudioCtx;
}

/**
 * Procedural festive sound effects to layer with standard SFX when Christmas mode is active.
 */
export function playChristmasSfx(type, muted = false) {
  if (muted) return;
  try {
    const ctx = getChristmasAudioCtx();
    if (!ctx) return;
    const now = ctx.currentTime;

    if (type === 'launch') {
      // Sleigh-bell & glockenspiel festive major arpeggio (C5 - E5 - G5 - C6 - E6)
      const notes = [523.25, 659.25, 783.99, 1046.5, 1318.5];
      notes.forEach((f, idx) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        const t0 = now + idx * 0.045;
        osc.type = 'sine';
        osc.frequency.setValueAtTime(f, t0);
        gain.gain.setValueAtTime(0.001, t0);
        gain.gain.linearRampToValueAtTime(0.055, t0 + 0.015);
        gain.gain.exponentialRampToValueAtTime(0.0008, t0 + 0.42);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(t0);
        osc.stop(t0 + 0.45);
      });
    } else if (type === 'elf') {
      // Magical elf twinkle chime cascade
      const freqs = [1046.5, 1174.66, 1318.5, 1567.98, 2093.0];
      freqs.forEach((f, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        const t0 = now + i * 0.055;
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(f, t0);
        gain.gain.setValueAtTime(0.06, t0);
        gain.gain.exponentialRampToValueAtTime(0.001, t0 + 0.18);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(t0);
        osc.stop(t0 + 0.2);
      });
    } else if (type === 'santa') {
      // Jolly "Ho-Ho-Ho!" brassy 3-note festive sting
      const notes = [
        { f: 392.0, t: 0, d: 0.1 },
        { f: 392.0, t: 0.12, d: 0.1 },
        { f: 523.25, t: 0.24, d: 0.28 },
      ];
      notes.forEach(({ f, t, d }) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(f, now + t);
        gain.gain.setValueAtTime(0.075, now + t);
        gain.gain.exponentialRampToValueAtTime(0.001, now + t + d);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now + t);
        osc.stop(now + t + d + 0.02);
      });
    } else if (type === 'reindeer') {
      // High sleigh-bell jingle shimmer
      const freqs = [2093, 2637, 3136];
      freqs.forEach((f, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        const t0 = now + i * 0.03;
        osc.type = 'sine';
        osc.frequency.setValueAtTime(f, t0);
        gain.gain.setValueAtTime(0.05, t0);
        gain.gain.exponentialRampToValueAtTime(0.001, t0 + 0.12);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(t0);
        osc.stop(t0 + 0.13);
      });
    } else if (type === 'ice') {
      // Crystalline ice slide shimmer
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(880, now);
      osc.frequency.exponentialRampToValueAtTime(1760, now + 0.12);
      osc.frequency.exponentialRampToValueAtTime(1320, now + 0.2);
      gain.gain.setValueAtTime(0.07, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.22);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.23);
    }
  } catch {
    // ignore audio context errors
  }
}

/**
 * Draws the Festive Winter Wonderland Depot background:
 * Crisp starry winter night sky, Northern Lights (Aurora Borealis), full winter moon with
 * Santa's sleigh silhouette, snow-capped hills, decorated lit pine trees, and falling snow.
 */
export function drawChristmasWorldBackground(ctx, {
  W,
  H,
  groundY,
  camX = 0,
  wet = false,
  frame = 0,
}) {
  ctx.save();

  // 1. Starry Winter Night Sky Gradient
  const skyGrad = ctx.createLinearGradient(0, 0, 0, groundY);
  if (wet) {
    // Blizzard twilight sky
    skyGrad.addColorStop(0, '#06101e');
    skyGrad.addColorStop(0.45, '#0f2942');
    skyGrad.addColorStop(0.8, '#1e3a5f');
    skyGrad.addColorStop(1, '#334155');
  } else {
    skyGrad.addColorStop(0, '#020617');
    skyGrad.addColorStop(0.35, '#0b1938');
    skyGrad.addColorStop(0.7, '#0f2d4a');
    skyGrad.addColorStop(0.92, '#134e4a');
    skyGrad.addColorStop(1, '#1e3a8a');
  }
  ctx.fillStyle = skyGrad;
  ctx.fillRect(0, 0, W, groundY);

  // 2. Shimmering Northern Lights (Aurora Borealis) Ribbons
  ctx.save();
  for (let band = 0; band < 2; band += 1) {
    const auroraGrad = ctx.createLinearGradient(0, 20 + band * 28, W, 90 + band * 32);
    if (band === 0) {
      auroraGrad.addColorStop(0, 'rgba(16, 185, 129, 0)');
      auroraGrad.addColorStop(0.3, 'rgba(52, 211, 153, 0.18)');
      auroraGrad.addColorStop(0.65, 'rgba(34, 211, 238, 0.2)');
      auroraGrad.addColorStop(1, 'rgba(16, 185, 129, 0)');
    } else {
      auroraGrad.addColorStop(0, 'rgba(56, 189, 248, 0)');
      auroraGrad.addColorStop(0.4, 'rgba(167, 243, 208, 0.14)');
      auroraGrad.addColorStop(0.75, 'rgba(244, 63, 94, 0.12)');
      auroraGrad.addColorStop(1, 'rgba(56, 189, 248, 0)');
    }
    ctx.fillStyle = auroraGrad;
    ctx.beginPath();
    const baseY = 38 + band * 34;
    ctx.moveTo(0, baseY);
    for (let x = 0; x <= W; x += 32) {
      const wave = Math.sin(x * 0.009 + frame * 0.025 + band * 1.8) * 14
        + Math.cos(x * 0.018 - frame * 0.018) * 6;
      ctx.lineTo(x, baseY + wave);
    }
    for (let x = W; x >= 0; x -= 32) {
      const wave = Math.sin(x * 0.009 + frame * 0.025 + band * 1.8) * 14
        + Math.cos(x * 0.018 - frame * 0.018) * 6;
      ctx.lineTo(x, baseY + wave + 28);
    }
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();

  // 3. Twinkling Winter Stars & North Star
  for (let i = 0; i < 32; i += 1) {
    const sx = ((i * 137.5 - camX * 0.02) % W + W) % W;
    const sy = 12 + ((i * 73) % Math.floor(groundY * 0.55));
    const twinkle = 0.4 + 0.6 * Math.abs(Math.sin(frame * 0.06 + i * 1.7));
    ctx.fillStyle = i % 6 === 0 ? `rgba(254, 240, 138, ${twinkle})` : `rgba(241, 245, 249, ${twinkle})`;
    ctx.beginPath();
    ctx.arc(sx, sy, i % 5 === 0 ? 1.8 : 1.1, 0, Math.PI * 2);
    ctx.fill();
  }

  // 4. Frosted Full Winter Moon with Santa Sleigh Silhouette
  const moonX = W * 0.78 - (((camX * 0.015) % 240 + 240) % 240) * 0.25;
  const moonY = 74;
  const moonR = 42;

  const moonGlow = ctx.createRadialGradient(moonX, moonY, moonR * 0.4, moonX, moonY, moonR * 2.5);
  moonGlow.addColorStop(0, 'rgba(224, 242, 254, 0.45)');
  moonGlow.addColorStop(0.5, 'rgba(125, 211, 252, 0.16)');
  moonGlow.addColorStop(1, 'rgba(125, 211, 252, 0)');
  ctx.fillStyle = moonGlow;
  ctx.beginPath();
  ctx.arc(moonX, moonY, moonR * 2.5, 0, Math.PI * 2);
  ctx.fill();

  const moonDisc = ctx.createRadialGradient(moonX - 10, moonY - 10, 6, moonX, moonY, moonR);
  moonDisc.addColorStop(0, '#ffffff');
  moonDisc.addColorStop(0.65, '#e0f2fe');
  moonDisc.addColorStop(1, '#bae6fd');
  ctx.fillStyle = moonDisc;
  ctx.beginPath();
  ctx.arc(moonX, moonY, moonR, 0, Math.PI * 2);
  ctx.fill();

  // Santa Sleigh + Reindeer silhouette gliding across the moon
  const sleighX = moonX - 28 + ((frame * 0.35) % 56);
  const sleighY = moonY - 4 + Math.sin(frame * 0.08) * 3;
  ctx.fillStyle = '#0f172a';
  ctx.strokeStyle = '#0f172a';
  ctx.lineWidth = 1.4;
  // Sleigh body
  ctx.fillRect(sleighX - 12, sleighY - 3, 12, 6);
  ctx.beginPath();
  ctx.moveTo(sleighX - 14, sleighY + 5);
  ctx.lineTo(sleighX + 2, sleighY + 5);
  ctx.stroke();
  // Reindeer dots + harness line
  for (let r = 1; r <= 3; r += 1) {
    const rx = sleighX + r * 9;
    const ry = sleighY - r * 1.5 + Math.sin(frame * 0.25 + r) * 1.8;
    ctx.beginPath();
    ctx.ellipse(rx, ry, 3.2, 1.8, 0, 0, Math.PI * 2);
    ctx.fill();
    if (r === 3) {
      // Rudolph's glowing red nose!
      ctx.fillStyle = '#ef4444';
      ctx.beginPath();
      ctx.arc(rx + 4, ry - 0.5, 1.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#0f172a';
    }
  }

  // 5. Distant Snow-Covered Hills
  const hillScroll = camX * 0.16;
  const hillGrad = ctx.createLinearGradient(0, groundY - 80, 0, groundY);
  hillGrad.addColorStop(0, '#dbeafe');
  hillGrad.addColorStop(0.5, '#93c5fd');
  hillGrad.addColorStop(1, '#3b82f6');
  ctx.fillStyle = hillGrad;
  ctx.beginPath();
  ctx.moveTo(0, groundY);
  for (let x = 0; x <= W + 40; x += 40) {
    const wx = x + hillScroll;
    const hy = groundY - 40 - Math.sin(wx * 0.008) * 22 - Math.cos(wx * 0.019) * 11;
    ctx.lineTo(x, hy);
  }
  ctx.lineTo(W, groundY);
  ctx.closePath();
  ctx.fill();

  // 6. Decorated Pine Trees & Candy Cane Posts on Horizon
  const propStride = 150;
  const firstProp = Math.floor((hillScroll - 80) / propStride) * propStride;
  for (let px = firstProp; px < hillScroll + W + propStride; px += propStride) {
    const sx = px - hillScroll;
    const baseH = groundY - 34 - Math.sin(px * 0.008) * 16;
    const kind = Math.abs(Math.floor(px / propStride)) % 3;

    if (kind === 0 || kind === 1) {
      // Snow-dusted pine tree with twinkling fairy lights
      ctx.fillStyle = '#064e3b';
      for (let tier = 0; tier < 3; tier += 1) {
        const ty = baseH - tier * 11;
        const tw = 16 - tier * 3.5;
        ctx.beginPath();
        ctx.moveTo(sx, ty - 16);
        ctx.lineTo(sx + tw, ty + 4);
        ctx.lineTo(sx - tw, ty + 4);
        ctx.closePath();
        ctx.fill();
      }
      // Star on top
      ctx.fillStyle = '#facc15';
      ctx.beginPath();
      ctx.arc(sx, baseH - 38, 2.8, 0, Math.PI * 2);
      ctx.fill();
      // Twinkling lights on tree
      const lightColors = ['#ef4444', '#facc15', '#38bdf8', '#4ade80'];
      for (let l = 0; l < 4; l += 1) {
        const lx = sx + (l % 2 === 0 ? -5 : 5) * (1 - l * 0.15);
        const ly = baseH - 4 - l * 7;
        ctx.fillStyle = lightColors[(l + Math.floor(frame * 0.1)) % lightColors.length];
        ctx.beginPath();
        ctx.arc(lx, ly, 1.8, 0, Math.PI * 2);
        ctx.fill();
      }
    } else {
      // North Pole Candy-Cane Milepost
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(sx, baseH + 10);
      ctx.lineTo(sx, baseH - 18);
      ctx.arc(sx + 5, baseH - 18, 5, Math.PI, 0, false);
      ctx.stroke();
      ctx.strokeStyle = '#ef4444';
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.moveTo(sx, baseH + 10);
      ctx.lineTo(sx, baseH - 18);
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }

  // 7. Crisp Packed Snowfield Ground
  const snowSoil = ctx.createLinearGradient(0, groundY - 6, 0, H);
  snowSoil.addColorStop(0, '#ffffff');
  snowSoil.addColorStop(0.18, '#e0f2fe');
  snowSoil.addColorStop(0.55, '#bae6fd');
  snowSoil.addColorStop(1, '#7dd3fc');
  ctx.fillStyle = snowSoil;
  ctx.fillRect(0, groundY - 4, W, H - groundY + 4);

  // Sparkling Frost Lip along Ground
  ctx.fillStyle = '#f8fafc';
  ctx.fillRect(0, groundY - 3, W, 4);
  ctx.fillStyle = '#38bdf8';
  ctx.globalAlpha = 0.45;
  ctx.fillRect(0, groundY + 1, W, 2);
  ctx.globalAlpha = 1;

  // 8. Gentle Falling Snowflakes in Background
  ctx.fillStyle = 'rgba(255, 255, 255, 0.82)';
  for (let s = 0; s < 38; s += 1) {
    const sx = (((s * 97.3 - camX * 0.12 + Math.sin(frame * 0.03 + s) * 18) % W) + W) % W;
    const sy = ((frame * (1.1 + (s % 4) * 0.35) + s * 43) % (groundY + 10));
    const sr = 1.2 + (s % 3) * 0.7;
    ctx.beginPath();
    ctx.arc(sx, sy, sr, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();
  return true;
}

/**
 * Draws Christmas Blizzard storm effects: heavy swirling snow streaks and icy frost flashes.
 */
export function drawChristmasStormWeather(ctx, W, H, groundY, frame = 0, wind = null) {
  const gust = Number(wind?.angleDeg) || 0;
  const shear = Math.sin((gust * Math.PI) / 180) * 14 + Math.cos(frame * 0.08) * 5;

  ctx.save();
  ctx.fillStyle = 'rgba(186, 230, 253, 0.16)';
  ctx.fillRect(0, 0, W, groundY);

  // Swirling blizzard snow streaks
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.75)';
  ctx.lineWidth = 1.8;
  ctx.lineCap = 'round';
  const cols = 64;
  for (let i = 0; i < cols; i += 1) {
    const seed = i * 89.17;
    const xBase = ((i / cols) * W + frame * (4.2 + (i % 5) * 0.45) + seed) % (W + 40) - 20;
    const yOff = (frame * (10 + (i % 6)) + seed * 3) % (groundY + 60);
    const len = 8 + (i % 4) * 3;
    ctx.globalAlpha = 0.45 + (i % 4) * 0.12;
    ctx.beginPath();
    ctx.moveTo(xBase, yOff - len);
    ctx.lineTo(xBase + shear, yOff);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;

  // Periodic Arctic Frost Shimmer Flash
  const flashCycle = Math.floor(frame) % 180;
  if (flashCycle === 14 || flashCycle === 15 || flashCycle === 96) {
    ctx.fillStyle = 'rgba(224, 242, 254, 0.28)';
    ctx.fillRect(0, 0, W, H);
  }
  ctx.restore();
}

/**
 * Draws the Festive Gift-Wrapped Tool Chest with gold ribbon and bow.
 */
export function drawChristmasToolbox(ctx, x, y, rot, flying, oiled = false, frame = 0) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rot);

  // Shadow
  ctx.fillStyle = 'rgba(15, 23, 42, 0.28)';
  ctx.beginPath();
  ctx.ellipse(0, 12, 18, 5, 0, 0, Math.PI * 2);
  ctx.fill();

  // Golden tinsel / snowflake trail when flying
  if (flying) {
    const wave = Math.sin(frame * 0.6) * 4;
    ctx.strokeStyle = oiled ? 'rgba(56, 189, 248, 0.85)' : 'rgba(250, 204, 21, 0.85)';
    ctx.lineWidth = 2.8;
    ctx.beginPath();
    ctx.moveTo(-18, -3);
    ctx.lineTo(-36 + wave, 3);
    ctx.moveTo(-18, 4);
    ctx.lineTo(-32 - wave, 10);
    ctx.stroke();

    ctx.strokeStyle = 'rgba(239, 68, 68, 0.75)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-16, -7);
    ctx.lineTo(-30, -8 + wave * 0.5);
    ctx.stroke();
  }

  const w = 36;
  const h = 28;
  const bodyGrad = ctx.createLinearGradient(0, -h / 2, 0, h / 2);
  if (oiled) {
    // Ice-frosted diamond gift box
    bodyGrad.addColorStop(0, '#67e8f9');
    bodyGrad.addColorStop(0.5, '#06b6d4');
    bodyGrad.addColorStop(1, '#0e7490');
  } else {
    // Classic Santa crimson gift wrap
    bodyGrad.addColorStop(0, '#ef4444');
    bodyGrad.addColorStop(0.5, '#dc2626');
    bodyGrad.addColorStop(1, '#991b1b');
  }
  ctx.fillStyle = bodyGrad;
  ctx.strokeStyle = oiled ? '#155e75' : '#450a0a';
  ctx.lineWidth = 2.2;
  ctx.beginPath();
  ctx.roundRect(-w / 2, -h / 2, w, h, 5);
  ctx.fill();
  ctx.stroke();

  // Green Holly Trim Corners
  ctx.fillStyle = oiled ? '#e0f2fe' : '#15803d';
  ctx.fillRect(-w / 2, -h / 2, 5, h);
  ctx.fillRect(w / 2 - 5, -h / 2, 5, h);

  // Shiny Gold Cross Ribbon
  ctx.fillStyle = oiled ? '#fef08a' : '#facc15';
  ctx.fillRect(-3.5, -h / 2, 7, h);
  ctx.fillRect(-w / 2, -3, w, 6);

  // Festive Ribbon Bow on Top
  ctx.strokeStyle = '#facc15';
  ctx.lineWidth = 2.6;
  ctx.beginPath();
  ctx.ellipse(-6, -h / 2 - 4, 6, 3.5, -0.35, 0, Math.PI * 2);
  ctx.ellipse(6, -h / 2 - 4, 6, 3.5, 0.35, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = '#eab308';
  ctx.beginPath();
  ctx.arc(0, -h / 2 - 2, 3, 0, Math.PI * 2);
  ctx.fill();

  // Icicle drips when coated in black ice
  if (oiled) {
    ctx.fillStyle = 'rgba(224, 242, 254, 0.9)';
    ctx.beginPath();
    ctx.moveTo(-9, h / 2);
    ctx.lineTo(-7, h / 2 + 6);
    ctx.lineTo(-5, h / 2);
    ctx.moveTo(5, h / 2);
    ctx.lineTo(7, h / 2 + 5);
    ctx.lineTo(9, h / 2);
    ctx.fill();
  }

  ctx.restore();
  return true;
}

/**
 * Draws the "Holiday Express" Festive Coach with fairy lights & snow roof.
 */
export function drawChristmasCoach(ctx, x, y, w, h, frame = 0) {
  ctx.save();
  ctx.translate(x, y);

  // Shadow on snow
  ctx.fillStyle = 'rgba(15, 23, 42, 0.22)';
  ctx.beginPath();
  ctx.ellipse(w * 0.5, 4, w * 0.5, 8, 0, 0, Math.PI * 2);
  ctx.fill();

  // Festive Coach Body (Deep Holly Crimson & Pine Green)
  const grad = ctx.createLinearGradient(0, -h, 0, 0);
  grad.addColorStop(0, '#dc2626');
  grad.addColorStop(0.55, '#991b1b');
  grad.addColorStop(1, '#14532d');
  ctx.fillStyle = grad;
  ctx.strokeStyle = '#facc15';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.roundRect(0, -h, w, h, 10);
  ctx.fill();
  ctx.stroke();

  // Fluffy White Snow Cap along the Roof
  ctx.fillStyle = '#f8fafc';
  ctx.beginPath();
  ctx.roundRect(2, -h - 3, w - 4, 7, 4);
  ctx.fill();

  // Gold & Green Festive Livery Stripe
  ctx.fillStyle = '#facc15';
  ctx.fillRect(0, -h + h * 0.42, w, 5);
  ctx.fillStyle = '#16a34a';
  ctx.fillRect(0, -h + h * 0.42 + 5, w, 3);

  // Warm Golden Lit Passenger Windows
  const winCount = Math.max(3, Math.floor(w / 30));
  const winW = Math.min(16, (w - 24) / winCount - 4);
  for (let i = 0; i < winCount; i += 1) {
    const wx = 12 + i * ((w - 24) / winCount);
    ctx.fillStyle = 'rgba(254, 240, 138, 0.9)';
    ctx.beginPath();
    ctx.roundRect(wx, -h + 14, winW, 15, 3);
    ctx.fill();
  }

  // Twinkling Fairy Lights Strung Along the Roofline
  const bulbColors = ['#ef4444', '#22c55e', '#facc15', '#38bdf8'];
  const bulbCount = Math.max(5, Math.floor(w / 16));
  for (let b = 0; b < bulbCount; b += 1) {
    const bx = 8 + b * ((w - 16) / (bulbCount - 1));
    const color = bulbColors[(b + Math.floor(frame * 0.12)) % bulbColors.length];
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(bx, -h + 8, 2.3, 0, Math.PI * 2);
    ctx.fill();
  }

  // Holly Wreath on Front Grille
  ctx.strokeStyle = '#16a34a';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(w - 10, -h * 0.35, 6, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = '#ef4444';
  ctx.beginPath();
  ctx.arc(w - 10, -h * 0.35 - 6, 2, 0, Math.PI * 2);
  ctx.fill();

  // Wheels with Gold Rims
  const wheels = [22, w - 22];
  if (w > 90) wheels.splice(1, 0, w * 0.42);
  for (const cx of wheels) {
    ctx.fillStyle = '#0f172a';
    ctx.beginPath();
    ctx.arc(cx, 0, 11, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#facc15';
    ctx.beginPath();
    ctx.arc(cx, 0, 5, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();
}

/**
 * Replaces the sandbag/sack with Santa's Bulging Velvet Toy Sack.
 */
export function drawChristmasSack(ctx, x, y, r) {
  ctx.save();
  ctx.translate(x, y);

  // Shadow
  ctx.fillStyle = 'rgba(15, 23, 42, 0.25)';
  ctx.beginPath();
  ctx.ellipse(0, 2, r * 1.15, 4, 0, 0, Math.PI * 2);
  ctx.fill();

  // Crimson Velvet Sack Body
  const grad = ctx.createRadialGradient(-r * 0.25, -r * 0.5, 2, 0, -r * 0.35, r * 1.2);
  grad.addColorStop(0, '#f87171');
  grad.addColorStop(0.6, '#dc2626');
  grad.addColorStop(1, '#7f1d1d');
  ctx.fillStyle = grad;
  ctx.strokeStyle = '#450a0a';
  ctx.lineWidth = 1.8;
  ctx.beginPath();
  ctx.ellipse(0, -r * 0.38, r * 1.15, r * 0.92, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  // Gold Rope Tie & Frill at Top
  ctx.fillStyle = '#dc2626';
  ctx.beginPath();
  ctx.moveTo(-6, -r * 1.15);
  ctx.lineTo(-10, -r * 1.48);
  ctx.lineTo(0, -r * 1.32);
  ctx.lineTo(10, -r * 1.48);
  ctx.lineTo(6, -r * 1.15);
  ctx.closePath();
  ctx.fill();

  ctx.strokeStyle = '#facc15';
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.moveTo(-7, -r * 1.15);
  ctx.lineTo(7, -r * 1.15);
  ctx.stroke();

  // White Fur Patch / Snow Accent
  ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
  ctx.font = 'bold 8px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('TOYS', 0, -r * 0.28);

  ctx.restore();
}

/**
 * Replaces the traffic cone with a Mini Decorated Christmas Tree.
 */
export function drawChristmasCone(ctx, x, y) {
  ctx.save();
  ctx.translate(x, y);

  // Tree trunk pot
  ctx.fillStyle = '#78350f';
  ctx.fillRect(-5, -6, 10, 6);

  // Evergreen cone tiers
  ctx.fillStyle = '#15803d';
  ctx.strokeStyle = '#052e16';
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.moveTo(0, -32);
  ctx.lineTo(12, -5);
  ctx.lineTo(-12, -5);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // White snow Garland Stripe
  ctx.strokeStyle = '#f8fafc';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(-6, -19);
  ctx.quadraticCurveTo(0, -15, 7, -18);
  ctx.moveTo(-9, -11);
  ctx.quadraticCurveTo(0, -7, 9, -10);
  ctx.stroke();

  // Baubles
  ctx.fillStyle = '#ef4444';
  ctx.beginPath();
  ctx.arc(-4, -14, 2.2, 0, Math.PI * 2);
  ctx.arc(4, -9, 2.2, 0, Math.PI * 2);
  ctx.fill();

  // Golden Star Topper
  ctx.fillStyle = '#facc15';
  ctx.beginPath();
  ctx.arc(0, -33, 3.2, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

/**
 * Replaces the oil drum with a Festive Candy-Striped Nog Barrel.
 */
export function drawChristmasDrum(ctx, x, y, spilled = false, frame = 0) {
  ctx.save();
  ctx.translate(x, y);

  if (spilled) {
    // Sparkling ice sheet puddle
    ctx.fillStyle = 'rgba(56, 189, 248, 0.68)';
    ctx.beginPath();
    ctx.ellipse(10, 1, 40, 10, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(224, 242, 254, 0.78)';
    ctx.beginPath();
    ctx.ellipse(14, 0, 22, 5, 0.1, 0, Math.PI * 2);
    ctx.fill();

    ctx.rotate(1.1);
  }

  // Festive Red & White Striped Barrel
  ctx.fillStyle = '#dc2626';
  ctx.strokeStyle = '#7f1d1d';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.roundRect(-12, -28, 24, 28, 4);
  ctx.fill();
  ctx.stroke();

  // White & Gold Bands
  ctx.fillStyle = '#f8fafc';
  ctx.fillRect(-11, -22, 22, 4);
  ctx.fillRect(-11, -11, 22, 4);
  ctx.fillStyle = '#facc15';
  ctx.fillRect(-12, -28, 24, 3);
  ctx.fillRect(-12, -3, 24, 3);

  // Frosted snowflakes rising
  if (!spilled) {
    for (let b = 0; b < 3; b += 1) {
      const by = -30 - ((frame * 0.22 + b * 5) % 12);
      const bx = -5 + b * 5 + Math.sin(frame * 0.15 + b) * 2;
      ctx.fillStyle = 'rgba(224, 242, 254, 0.9)';
      ctx.beginPath();
      ctx.arc(bx, by, 2, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  ctx.restore();
}

/**
 * Replaces the oil spill with a Sparkling Sheet of Black Ice.
 */
export function drawChristmasOilSpill(ctx, x, y, frame = 0) {
  ctx.save();
  ctx.translate(x, y);
  const shimmer = 0.12 * Math.sin(frame * 0.2);
  ctx.fillStyle = `rgba(14, 165, 233, ${0.65 + shimmer})`;
  ctx.beginPath();
  ctx.ellipse(0, 0, 44, 12, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = `rgba(224, 242, 254, ${0.75 + shimmer})`;
  ctx.beginPath();
  ctx.ellipse(6, -1, 24, 6, 0.1, 0, Math.PI * 2);
  ctx.ellipse(-14, 2, 14, 4, -0.15, 0, Math.PI * 2);
  ctx.fill();

  // Glinting ice stars
  ctx.fillStyle = '#ffffff';
  for (let i = 0; i < 3; i += 1) {
    const bx = -16 + i * 16;
    const r = 1.8 + Math.abs(Math.sin(frame * 0.15 + i)) * 1.5;
    ctx.beginPath();
    ctx.arc(bx, -2, r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

/**
 * Replaces flying birds with Flying Reindeer (Rudolph with glowing red nose & antlers).
 */
export function drawChristmasBird(ctx, x, y, frame = 0, dir = 1) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(dir, 1);
  const gallop = Math.sin(frame * 0.45) * 5;

  // Reindeer Body
  ctx.fillStyle = '#92400e';
  ctx.strokeStyle = '#451a03';
  ctx.lineWidth = 1.3;
  ctx.beginPath();
  ctx.ellipse(0, 0, 9, 5, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  // Galloping Legs
  ctx.strokeStyle = '#78350f';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(-5, 3);
  ctx.lineTo(-9 - gallop * 0.5, 9);
  ctx.moveTo(5, 3);
  ctx.lineTo(9 + gallop * 0.5, 9);
  ctx.stroke();

  // Head
  ctx.fillStyle = '#b45309';
  ctx.beginPath();
  ctx.arc(8, -3, 4.2, 0, Math.PI * 2);
  ctx.fill();

  // Golden Antlers
  ctx.strokeStyle = '#fde047';
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.moveTo(7, -6);
  ctx.lineTo(5, -13);
  ctx.moveTo(6, -10);
  ctx.lineTo(9, -12);
  ctx.stroke();

  // Glowing Red Rudolph Nose!
  ctx.fillStyle = '#ef4444';
  ctx.shadowColor = '#ef4444';
  ctx.shadowBlur = 8;
  ctx.beginPath();
  ctx.arc(12.5, -3, 2, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowBlur = 0;

  ctx.restore();
}

/**
 * Replaces the Hot Air Balloon with a Giant Floating Christmas Bauble Ornament.
 */
export function drawChristmasBalloon(ctx, x, y, frame = 0, opts = {}) {
  const scale = Number(opts.scale) || 1;
  const bob = Math.sin(frame * 0.08 + (opts.bobPhase || 0)) * 3.5;
  const deflated = Boolean(opts.hit);

  ctx.save();
  ctx.translate(x, y + bob);
  ctx.scale(scale, scale);

  if (!deflated) {
    // Festive golden aura
    ctx.fillStyle = 'rgba(250, 204, 21, 0.18)';
    ctx.beginPath();
    ctx.arc(0, -32, 32, 0, Math.PI * 2);
    ctx.fill();

    // Metallic Crimson Bauble Sphere
    const grad = ctx.createRadialGradient(-8, -38, 4, 0, -32, 26);
    grad.addColorStop(0, '#fca5a5');
    grad.addColorStop(0.35, '#ef4444');
    grad.addColorStop(0.8, '#b91c1c');
    grad.addColorStop(1, '#7f1d1d');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(0, -32, 24, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#facc15';
    ctx.lineWidth = 1.8;
    ctx.stroke();

    // Decorative Gold Zig-Zag Band Around Equator
    ctx.strokeStyle = '#fde047';
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let zx = -21; zx <= 21; zx += 7) {
      const zy = -32 + (Math.abs(zx / 7) % 2 === 0 ? -4 : 4);
      if (zx === -21) ctx.moveTo(zx, zy);
      else ctx.lineTo(zx, zy);
    }
    ctx.stroke();

    // Gold Bauble Cap & Ring on Top
    ctx.fillStyle = '#eab308';
    ctx.fillRect(-5, -60, 10, 5);
    ctx.strokeStyle = '#facc15';
    ctx.beginPath();
    ctx.arc(0, -63, 3.5, 0, Math.PI * 2);
    ctx.stroke();

    // Rigging Cords
    ctx.strokeStyle = '#fef08a';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(-9, -9);
    ctx.lineTo(-5, 5);
    ctx.moveTo(9, -9);
    ctx.lineTo(5, 5);
    ctx.stroke();

    // Gift-Box Basket
    ctx.fillStyle = '#15803d';
    ctx.strokeStyle = '#facc15';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.roundRect(-7, 4, 14, 10, 2);
    ctx.fill();
    ctx.stroke();
  } else {
    // Cracked bauble shell
    ctx.fillStyle = '#b91c1c';
    ctx.globalAlpha = 0.65;
    ctx.beginPath();
    ctx.ellipse(0, -8, 17, 8, 0.25, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  ctx.restore();
}

/**
 * Replaces the Porsche Macan with "Julie's Turbo Santa Sleigh-Macan".
 */
export function drawChristmasMacan(ctx, x, y, frame = 0) {
  ctx.save();
  ctx.translate(x, y);
  const w = 94;
  const h = 38;

  // Festive Gold & Emerald Aura
  ctx.fillStyle = `rgba(250, 204, 21, ${0.18 + 0.08 * Math.sin(frame * 0.2)})`;
  ctx.beginPath();
  ctx.ellipse(w * 0.45, -h * 0.4, 62, 30, 0, 0, Math.PI * 2);
  ctx.fill();

  // Golden Sleigh Runner Skis underneath
  ctx.strokeStyle = '#facc15';
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.moveTo(2, 2);
  ctx.lineTo(86, 2);
  ctx.quadraticCurveTo(96, 2, 98, -6);
  ctx.stroke();

  // Candy-Apple Red Chassis with Gold Trim
  ctx.fillStyle = '#dc2626';
  ctx.strokeStyle = '#facc15';
  ctx.lineWidth = 1.8;
  ctx.beginPath();
  ctx.moveTo(4, -8);
  ctx.lineTo(10, -22);
  ctx.lineTo(28, -34);
  ctx.lineTo(58, -36);
  ctx.lineTo(78, -28);
  ctx.lineTo(88, -14);
  ctx.lineTo(90, -6);
  ctx.lineTo(4, -6);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // Frosted Ice Windows
  ctx.fillStyle = 'rgba(186, 230, 253, 0.65)';
  ctx.beginPath();
  ctx.moveTo(30, -32);
  ctx.lineTo(62, -33);
  ctx.lineTo(70, -22);
  ctx.lineTo(28, -20);
  ctx.closePath();
  ctx.fill();

  // Reindeer Antler Roof Rack
  ctx.strokeStyle = '#fde047';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(46, -36);
  ctx.lineTo(42, -45);
  ctx.moveTo(44, -41);
  ctx.lineTo(49, -43);
  ctx.stroke();

  // Glowing Red Rudolph Headlights
  ctx.fillStyle = '#fef08a';
  ctx.shadowColor = '#facc15';
  ctx.shadowBlur = 10;
  ctx.fillRect(82, -16, 7, 4);
  ctx.shadowBlur = 0;

  // Wheels with Peppermint Hubs
  ctx.fillStyle = '#0f172a';
  ctx.beginPath();
  ctx.arc(22, -2, 9, 0, Math.PI * 2);
  ctx.arc(70, -2, 9, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#facc15';
  ctx.beginPath();
  ctx.arc(22, -2, 4, 0, Math.PI * 2);
  ctx.arc(70, -2, 4, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = '#fef08a';
  ctx.font = 'bold 8px Kenney Future Narrow, Kenney Future, system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('SLEIGH-MACAN', w * 0.45, -12);

  ctx.restore();
}

/**
 * Replaces the flight coin with a Spinning Festive Gold Star / Chocolate Coin.
 */
export function drawChristmasFlightCoin(ctx, sx, groundY, frame = 0) {
  const bob = Math.sin(frame * 0.12) * 4;
  const y = groundY - 52 + bob;
  ctx.save();
  ctx.translate(sx, y);
  ctx.rotate(Math.sin(frame * 0.08) * 0.25);

  // Holly leaf wings
  ctx.fillStyle = '#16a34a';
  ctx.beginPath();
  ctx.ellipse(-16, 0, 7, 4, -0.2, 0, Math.PI * 2);
  ctx.ellipse(16, 0, 7, 4, 0.2, 0, Math.PI * 2);
  ctx.fill();

  // Glowing Gold Foil Coin
  ctx.shadowColor = '#facc15';
  ctx.shadowBlur = 14;
  ctx.fillStyle = '#facc15';
  ctx.beginPath();
  ctx.arc(0, 0, 14, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.strokeStyle = '#dc2626';
  ctx.lineWidth = 2.2;
  ctx.stroke();

  // Red Star Emblem in Center
  ctx.fillStyle = '#dc2626';
  ctx.font = 'bold 14px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('★', 0, 1);

  ctx.restore();
}

/**
 * Costume overlay for the Kicker Mechanic: Fluffy Red Santa Hat & White Beard.
 */
export function drawChristmasMechanicOverlay(ctx, x, y, frame = 0, { running = false } = {}) {
  ctx.save();
  ctx.translate(x, y);
  const bob = running ? Math.abs(Math.sin(frame * 0.55)) * -3 : 0;
  const headY = -52 + bob;

  // Fluffy White Beard
  ctx.fillStyle = '#f8fafc';
  ctx.beginPath();
  ctx.arc(2, headY + 7, 8, 0, Math.PI);
  ctx.fill();

  // Red Santa Hat with White Fur Brim & Pom-Pom
  ctx.fillStyle = '#dc2626';
  ctx.beginPath();
  ctx.moveTo(-12, headY - 8);
  ctx.quadraticCurveTo(-2, headY - 26, 14, headY - 14);
  ctx.lineTo(11, headY - 8);
  ctx.closePath();
  ctx.fill();

  // White Fur Trim
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.roundRect(-13, headY - 11, 26, 5, 2.5);
  ctx.fill();

  // Pom-pom
  ctx.beginPath();
  ctx.arc(15, headY - 13, 4, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

/**
 * Costume overlay for the Smoker: Jolly Snowman companion & Warm Mulled Steam.
 */
export function drawChristmasSmokerOverlay(ctx, sx, groundY, frame = 0) {
  ctx.save();
  ctx.translate(sx, groundY);

  // Jolly Snowman next to him
  ctx.save();
  ctx.translate(-24, 0);
  ctx.fillStyle = '#f8fafc';
  ctx.strokeStyle = '#94a3b8';
  ctx.lineWidth = 1.4;
  // Bottom, middle, head snowballs
  ctx.beginPath();
  ctx.arc(0, -10, 10, 0, Math.PI * 2);
  ctx.arc(0, -23, 7.5, 0, Math.PI * 2);
  ctx.arc(0, -34, 5.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  // Red Scarf
  ctx.fillStyle = '#dc2626';
  ctx.fillRect(-6, -29, 12, 3);
  // Carrot nose
  ctx.fillStyle = '#f97316';
  ctx.beginPath();
  ctx.moveTo(0, -34);
  ctx.lineTo(7, -33);
  ctx.lineTo(0, -32);
  ctx.fill();
  // Top Hat
  ctx.fillStyle = '#0f172a';
  ctx.fillRect(-7, -40, 14, 2);
  ctx.fillRect(-4.5, -47, 9, 7);
  ctx.restore();

  // Rising Warm Golden Cinnamon Steam Puffs
  const t = frame * 0.12;
  for (let i = 0; i < 4; i += 1) {
    const py = -54 - i * 11 - ((t * 4 + i * 3) % 14);
    const px = 14 + i * 4 + Math.sin(t + i) * 4;
    ctx.fillStyle = `rgba(253, 224, 71, ${0.5 - i * 0.1})`;
    ctx.beginPath();
    ctx.arc(px, py, 4.5 + i * 1.3, 0, Math.PI * 2);
    ctx.fill();
  }

  // Festive nameplate
  ctx.fillStyle = 'rgba(6, 78, 59, 0.9)';
  ctx.strokeStyle = '#facc15';
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.roundRect(-42, -96, 84, 16, 4);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#fef08a';
  ctx.font = 'bold 10px Kenney Future Narrow, Kenney Future, system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('FESTIVE BREAK', 0, -85);

  ctx.restore();
}

/**
 * Costume overlay for Chelle: Elf Hat, stack of wrapped gifts, and festive speech bubble.
 */
export function drawChristmasChelleOverlay(ctx, sx, groundY, frame = 0, reacting = false, reactFrame = 0) {
  ctx.save();
  ctx.translate(sx, groundY);

  // Pointed Green & Red Elf Hat on Chelle's Head
  ctx.save();
  ctx.translate(0, -72);
  ctx.rotate(-0.08);
  ctx.fillStyle = '#16a34a';
  ctx.strokeStyle = '#dc2626';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(-11, 0);
  ctx.quadraticCurveTo(-2, -24, 10, -22);
  ctx.lineTo(11, 0);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  // Redzig-zag brim
  ctx.fillStyle = '#dc2626';
  ctx.fillRect(-12, -4, 24, 4);
  // Gold Jingle Bell on Tip
  ctx.fillStyle = '#facc15';
  ctx.beginPath();
  ctx.arc(11, -22, 3, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // Mini Wrapped Present Box beside her
  ctx.fillStyle = '#dc2626';
  ctx.fillRect(16, -16, 14, 14);
  ctx.fillStyle = '#facc15';
  ctx.fillRect(22, -16, 3, 14);
  ctx.fillRect(16, -10, 14, 3);

  if (reacting && reactFrame < 22) {
    ctx.fillStyle = 'rgba(6, 78, 59, 0.95)';
    ctx.strokeStyle = '#facc15';
    ctx.lineWidth = 2;
    const bw = 148;
    const bh = 28;
    const bx = -bw / 2;
    const by = -124;
    ctx.beginPath();
    ctx.roundRect(bx, by, bw, bh, 8);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#fef08a';
    ctx.font = 'bold 11px Kenney Future Narrow, Kenney Future, system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText("I'm wrapping gifts!", 0, by + bh / 2);
  } else if (!reacting) {
    ctx.fillStyle = 'rgba(6, 78, 59, 0.9)';
    ctx.strokeStyle = '#4ade80';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.roundRect(-38, -106, 76, 16, 4);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#bbf7d0';
    ctx.font = 'bold 10px Kenney Future Narrow, Kenney Future, system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('ELF CHELLE', 0, -95);
  }

  ctx.restore();
}

/**
 * Costume overlay for Little Dick: Santa Dick Hat, Bushy White Beard & Nameplate.
 */
export function drawChristmasDickOverlay(ctx, sx, groundY, frame = 0, { face = 1, catching = false } = {}) {
  ctx.save();
  ctx.translate(sx, groundY);

  ctx.save();
  ctx.scale(face < 0 ? -1 : 1, 1);

  // Santa Coat White Fur Collar
  ctx.fillStyle = '#ffffff';
  ctx.strokeStyle = '#dc2626';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.roundRect(-16, -42, 32, 6, 3);
  ctx.fill();
  ctx.stroke();

  // Bushy White Santa Beard
  ctx.fillStyle = '#f8fafc';
  ctx.beginPath();
  ctx.arc(0, -44, 9, 0, Math.PI);
  ctx.fill();

  // Santa Hat on Top of Head
  ctx.fillStyle = '#dc2626';
  ctx.beginPath();
  ctx.moveTo(-12, -62);
  ctx.quadraticCurveTo(0, -80, 15, -66);
  ctx.lineTo(12, -62);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(-13, -64, 26, 4);
  ctx.beginPath();
  ctx.arc(16, -66, 3.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  if (!catching) {
    ctx.fillStyle = 'rgba(127, 29, 29, 0.9)';
    ctx.strokeStyle = '#facc15';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.roundRect(-44, -98, 88, 16, 4);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#fef08a';
    ctx.font = 'bold 10px Kenney Future Narrow, Kenney Future, system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('SANTA DICK', 0, -87);
  }

  ctx.restore();
}
