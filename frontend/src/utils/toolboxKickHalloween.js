/**
 * Little Dick's Toolbox — Halloween ("Nightmare on Lion Way" / "The Haunted Depot") theme layer.
 * Provides spooky canvas environments, reskinned obstacles, character costume overlays,
 * and zero-dependency Web Audio gothic/spooky sound effects.
 */

let halloweenAudioCtx = null;

function getHalloweenAudioCtx() {
  if (typeof window === 'undefined') return null;
  const Ctx = window.AudioContext || window.webkitAudioContext;
  if (!Ctx) return null;
  if (!halloweenAudioCtx) {
    halloweenAudioCtx = new Ctx();
  }
  if (halloweenAudioCtx.state === 'suspended') {
    halloweenAudioCtx.resume().catch(() => {});
  }
  return halloweenAudioCtx;
}

/**
 * Procedural spooky sound effects to layer with standard SFX when Halloween mode is active.
 */
export function playHalloweenSfx(type, muted = false) {
  if (muted) return;
  try {
    const ctx = getHalloweenAudioCtx();
    if (!ctx) return;
    const now = ctx.currentTime;

    if (type === 'launch') {
      // Eerie Phantom Pipe Organ D-minor/diminished chord swell
      const freqs = [146.83, 174.61, 220.0, 277.18, 293.66];
      freqs.forEach((f, idx) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = idx % 2 === 0 ? 'sawtooth' : 'triangle';
        osc.frequency.setValueAtTime(f, now);
        gain.gain.setValueAtTime(0.001, now);
        gain.gain.linearRampToValueAtTime(0.045, now + 0.06);
        gain.gain.exponentialRampToValueAtTime(0.0008, now + 0.65);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now);
        osc.stop(now + 0.66);
      });
    } else if (type === 'witch') {
      // Witch cackle + arcane sweep
      for (let i = 0; i < 5; i += 1) {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        const t0 = now + i * 0.075;
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(680 + i * 90, t0);
        osc.frequency.exponentialRampToValueAtTime(420 + i * 40, t0 + 0.065);
        gain.gain.setValueAtTime(0.06, t0);
        gain.gain.exponentialRampToValueAtTime(0.001, t0 + 0.07);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(t0);
        osc.stop(t0 + 0.072);
      }
    } else if (type === 'vampire') {
      // Dramatic Count Dickula organ sting (Toccata-style)
      const notes = [
        { f: 440, t: 0, d: 0.09 },
        { f: 392, t: 0.09, d: 0.09 },
        { f: 440, t: 0.18, d: 0.35 },
      ];
      notes.forEach(({ f, t, d }) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(f, now + t);
        gain.gain.setValueAtTime(0.06, now + t);
        gain.gain.exponentialRampToValueAtTime(0.001, now + t + d);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now + t);
        osc.stop(now + t + d + 0.01);
      });
    } else if (type === 'bat') {
      // Ultrasonic bat squeak
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(1600, now);
      osc.frequency.exponentialRampToValueAtTime(920, now + 0.09);
      gain.gain.setValueAtTime(0.08, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.095);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.1);
    } else if (type === 'slime') {
      // Bubbly cauldron slime squelch
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(220, now);
      osc.frequency.exponentialRampToValueAtTime(520, now + 0.08);
      osc.frequency.exponentialRampToValueAtTime(160, now + 0.16);
      gain.gain.setValueAtTime(0.1, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.17);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.18);
    }
  } catch {
    // ignore audio context errors
  }
}

/**
 * Draws the Haunted Depot background: twilight purple/blood-orange sky, harvest moon,
 * flying witch silhouette, graveyard horizon hills, and rolling ground mist.
 */
export function drawHalloweenWorldBackground(ctx, {
  W,
  H,
  groundY,
  camX = 0,
  wet = false,
  frame = 0,
}) {
  ctx.save();

  // 1. Haunted Twilight Sky Gradient
  const skyGrad = ctx.createLinearGradient(0, 0, 0, groundY);
  if (wet) {
    skyGrad.addColorStop(0, '#05010a');
    skyGrad.addColorStop(0.45, '#160729');
    skyGrad.addColorStop(0.8, '#2e0f38');
    skyGrad.addColorStop(1, '#4c1d4b');
  } else {
    skyGrad.addColorStop(0, '#070210');
    skyGrad.addColorStop(0.38, '#1b0836');
    skyGrad.addColorStop(0.72, '#4a1240');
    skyGrad.addColorStop(0.92, '#882918');
    skyGrad.addColorStop(1, '#c2410c');
  }
  ctx.fillStyle = skyGrad;
  ctx.fillRect(0, 0, W, groundY);

  // 2. Twinkling Stars in upper sky
  for (let i = 0; i < 28; i += 1) {
    const sx = ((i * 137.5 - camX * 0.02) % W + W) % W;
    const sy = 14 + ((i * 73) % Math.floor(groundY * 0.52));
    const twinkle = 0.35 + 0.55 * Math.abs(Math.sin(frame * 0.05 + i * 1.7));
    ctx.fillStyle = i % 5 === 0 ? `rgba(253, 224, 71, ${twinkle})` : `rgba(248, 250, 252, ${twinkle})`;
    ctx.beginPath();
    ctx.arc(sx, sy, i % 4 === 0 ? 1.6 : 1.0, 0, Math.PI * 2);
    ctx.fill();
  }

  // 3. Giant Harvest Blood Moon
  const moonX = W * 0.78 - (((camX * 0.015) % 240 + 240) % 240) * 0.25;
  const moonY = 76;
  const moonR = 44;

  // Outer eerie aura
  const moonGlow = ctx.createRadialGradient(moonX, moonY, moonR * 0.5, moonX, moonY, moonR * 2.6);
  moonGlow.addColorStop(0, 'rgba(251, 146, 60, 0.42)');
  moonGlow.addColorStop(0.5, 'rgba(234, 88, 12, 0.16)');
  moonGlow.addColorStop(1, 'rgba(234, 88, 12, 0)');
  ctx.fillStyle = moonGlow;
  ctx.beginPath();
  ctx.arc(moonX, moonY, moonR * 2.6, 0, Math.PI * 2);
  ctx.fill();

  // Moon disc
  const moonDisc = ctx.createRadialGradient(moonX - 10, moonY - 10, 6, moonX, moonY, moonR);
  moonDisc.addColorStop(0, '#fef08a');
  moonDisc.addColorStop(0.55, '#fb923c');
  moonDisc.addColorStop(1, '#ea580c');
  ctx.fillStyle = moonDisc;
  ctx.beginPath();
  ctx.arc(moonX, moonY, moonR, 0, Math.PI * 2);
  ctx.fill();

  // Moon craters
  ctx.fillStyle = 'rgba(154, 52, 18, 0.22)';
  ctx.beginPath();
  ctx.arc(moonX - 14, moonY - 8, 9, 0, Math.PI * 2);
  ctx.arc(moonX + 16, moonY + 10, 12, 0, Math.PI * 2);
  ctx.arc(moonX + 6, moonY - 18, 6, 0, Math.PI * 2);
  ctx.arc(moonX - 8, moonY + 18, 7, 0, Math.PI * 2);
  ctx.fill();

  // Silhouette of tiny bats fluttering past the moon
  for (let b = 0; b < 3; b += 1) {
    const bx = moonX - 30 + ((frame * (0.4 + b * 0.15) + b * 28) % 72);
    const by = moonY - 16 + b * 14 + Math.sin(frame * 0.12 + b) * 4;
    const wing = Math.sin(frame * 0.4 + b * 2) * 4;
    ctx.strokeStyle = '#090214';
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.moveTo(bx - 5, by - wing);
    ctx.quadraticCurveTo(bx - 2, by - 3, bx, by);
    ctx.quadraticCurveTo(bx + 2, by - 3, bx + 5, by - wing);
    ctx.stroke();
  }

  // 4. Drifting Dark Violet Cloud Banks
  ctx.fillStyle = wet ? 'rgba(15, 5, 29, 0.72)' : 'rgba(46, 16, 101, 0.52)';
  for (let i = 0; i < 6; i += 1) {
    const cx = (((i * 190 - camX * 0.08 - frame * 0.18) % (W + 240)) + (W + 240)) % (W + 240) - 80;
    const cy = 44 + (i % 3) * 22;
    ctx.beginPath();
    ctx.ellipse(cx, cy, 56, 16, 0, 0, Math.PI * 2);
    ctx.ellipse(cx + 34, cy + 4, 42, 13, 0, 0, Math.PI * 2);
    ctx.ellipse(cx - 28, cy + 5, 36, 12, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  // 5. Distant Haunted Hills & Graveyard Silhouette
  const hillScroll = camX * 0.16;
  ctx.fillStyle = '#140726';
  ctx.beginPath();
  ctx.moveTo(0, groundY);
  for (let x = 0; x <= W + 40; x += 40) {
    const wx = x + hillScroll;
    const hy = groundY - 42 - Math.sin(wx * 0.008) * 24 - Math.cos(wx * 0.019) * 12;
    ctx.lineTo(x, hy);
  }
  ctx.lineTo(W, groundY);
  ctx.closePath();
  ctx.fill();

  // Spooky Dead Trees & Graveyard Spires on the horizon
  const propStride = 160;
  const firstProp = Math.floor((hillScroll - 80) / propStride) * propStride;
  ctx.fillStyle = '#090214';
  ctx.strokeStyle = '#090214';
  for (let px = firstProp; px < hillScroll + W + propStride; px += propStride) {
    const sx = px - hillScroll;
    const baseH = groundY - 36 - Math.sin(px * 0.008) * 18;
    const kind = Math.abs(Math.floor(px / propStride)) % 3;

    if (kind === 0) {
      // Twisted dead tree silhouette
      ctx.lineWidth = 3.5;
      ctx.beginPath();
      ctx.moveTo(sx, groundY);
      ctx.lineTo(sx, baseH - 28);
      ctx.moveTo(sx, baseH - 18);
      ctx.lineTo(sx - 14, baseH - 32);
      ctx.moveTo(sx, baseH - 22);
      ctx.lineTo(sx + 15, baseH - 35);
      ctx.stroke();
    } else if (kind === 1) {
      // Crooked tombstone + cross on hill
      ctx.save();
      ctx.translate(sx, baseH + 8);
      ctx.rotate(0.12);
      ctx.beginPath();
      ctx.roundRect(-8, -22, 16, 24, [8, 8, 0, 0]);
      ctx.fill();
      ctx.restore();
    } else {
      // Haunted iron fence section
      ctx.lineWidth = 1.5;
      for (let f = -16; f <= 16; f += 8) {
        ctx.beginPath();
        ctx.moveTo(sx + f, baseH + 14);
        ctx.lineTo(sx + f, baseH - 6);
        ctx.stroke();
      }
      ctx.beginPath();
      ctx.moveTo(sx - 18, baseH);
      ctx.lineTo(sx + 18, baseH);
      ctx.stroke();
    }
  }

  // 6. Cursed Graveyard Ground
  const soil = ctx.createLinearGradient(0, groundY - 6, 0, H);
  soil.addColorStop(0, '#2a183b');
  soil.addColorStop(0.12, '#1b281e');
  soil.addColorStop(0.45, '#111a14');
  soil.addColorStop(1, '#080c0a');
  ctx.fillStyle = soil;
  ctx.fillRect(0, groundY - 4, W, H - groundY + 4);

  // Eerie purple-green grass lip
  ctx.fillStyle = wet ? '#4c1d95' : '#581c87';
  ctx.fillRect(0, groundY - 3, W, 4);
  ctx.fillStyle = '#22c55e';
  ctx.globalAlpha = 0.35;
  ctx.fillRect(0, groundY - 3, W, 2);
  ctx.globalAlpha = 1;

  // 7. Rolling Ground Mist / Fog
  for (let m = 0; m < 7; m += 1) {
    const mx = (((m * 165 - camX * 0.32 + frame * (0.45 + (m % 3) * 0.15)) % (W + 220)) + (W + 220)) % (W + 220) - 90;
    const my = groundY - 6 + (m % 3) * 5;
    ctx.fillStyle = m % 2 === 0 ? 'rgba(168, 85, 247, 0.13)' : 'rgba(203, 213, 225, 0.11)';
    ctx.beginPath();
    ctx.ellipse(mx, my, 78, 11, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();
  return true;
}

/**
 * Draws Halloween storm effects: eerie purple lightning and crimson/violet rain.
 */
export function drawHalloweenStormWeather(ctx, W, H, groundY, frame = 0, wind = null) {
  const gust = Number(wind?.angleDeg) || 0;
  const shear = Math.sin((gust * Math.PI) / 180) * 10 + Math.cos(frame * 0.07) * 4;

  ctx.save();
  ctx.fillStyle = 'rgba(24, 6, 44, 0.24)';
  ctx.fillRect(0, 0, W, groundY);

  // Violet-tinted rain streaks
  ctx.strokeStyle = 'rgba(216, 180, 254, 0.5)';
  ctx.lineWidth = 1.25;
  ctx.lineCap = 'round';
  const cols = 56;
  for (let i = 0; i < cols; i += 1) {
    const seed = i * 97.13;
    const xBase = ((i / cols) * W + frame * (3.2 + (i % 5) * 0.35) + seed) % (W + 40) - 20;
    const yOff = (frame * (14 + (i % 7)) + seed * 3) % (groundY + 60);
    const len = 10 + (i % 5) * 3;
    ctx.globalAlpha = 0.35 + (i % 4) * 0.12;
    ctx.beginPath();
    ctx.moveTo(xBase, yOff - len);
    ctx.lineTo(xBase + shear, yOff);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;

  // Purple / green arcane lightning flash
  const flashCycle = Math.floor(frame) % 180;
  const boltOn = flashCycle === 12 || flashCycle === 14 || flashCycle === 92 || flashCycle === 94;
  const afterglow = flashCycle === 13 || flashCycle === 15 || flashCycle === 93 || flashCycle === 95;
  if (boltOn || afterglow) {
    ctx.fillStyle = boltOn ? 'rgba(192, 132, 252, 0.38)' : 'rgba(134, 239, 172, 0.16)';
    ctx.fillRect(0, 0, W, H);

    if (boltOn) {
      const bx = 120 + ((Math.floor(frame / 180) * 137) % (W - 240));
      ctx.strokeStyle = '#f3e8ff';
      ctx.lineWidth = 2.8;
      ctx.shadowColor = '#a855f7';
      ctx.shadowBlur = 20;
      ctx.beginPath();
      ctx.moveTo(bx, 0);
      ctx.lineTo(bx + 18, 55);
      ctx.lineTo(bx - 8, 95);
      ctx.lineTo(bx + 22, 150);
      ctx.lineTo(bx + 4, 210);
      ctx.stroke();
    }
  }
  ctx.restore();
}

/**
 * Draws the Cursed Jack-o'-Lantern Tool Chest (replaces standard toolbox).
 */
export function drawHalloweenToolbox(ctx, x, y, rot, flying, oiled = false, frame = 0) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rot);

  // Shadow
  ctx.fillStyle = 'rgba(0, 0, 0, 0.32)';
  ctx.beginPath();
  ctx.ellipse(0, 12, 18, 5, 0, 0, Math.PI * 2);
  ctx.fill();

  // Eerie flame trail when flying
  if (flying) {
    const flicker = Math.sin(frame * 0.6) * 4;
    ctx.strokeStyle = oiled ? 'rgba(74, 222, 128, 0.75)' : 'rgba(251, 146, 60, 0.75)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(-18, -2);
    ctx.lineTo(-36 + flicker, 4);
    ctx.moveTo(-18, 4);
    ctx.lineTo(-32 - flicker, 11);
    ctx.stroke();

    ctx.strokeStyle = 'rgba(168, 85, 247, 0.6)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-16, -6);
    ctx.lineTo(-30, -8 + flicker * 0.5);
    ctx.stroke();
  }

  // Main Haunted Pumpkin-Crate Body
  const w = 36;
  const h = 28;
  const bodyGrad = ctx.createLinearGradient(0, -h / 2, 0, h / 2);
  if (oiled) {
    bodyGrad.addColorStop(0, '#4ade80');
    bodyGrad.addColorStop(0.5, '#16a34a');
    bodyGrad.addColorStop(1, '#14532d');
  } else {
    bodyGrad.addColorStop(0, '#fb923c');
    bodyGrad.addColorStop(0.5, '#ea580c');
    bodyGrad.addColorStop(1, '#9a3412');
  }
  ctx.fillStyle = bodyGrad;
  ctx.strokeStyle = oiled ? '#052e16' : '#431407';
  ctx.lineWidth = 2.2;
  ctx.beginPath();
  ctx.roundRect(-w / 2, -h / 2, w, h, 6);
  ctx.fill();
  ctx.stroke();

  // Iron corner straps
  ctx.fillStyle = '#1e1b4b';
  ctx.fillRect(-w / 2, -h / 2, 5, h);
  ctx.fillRect(w / 2 - 5, -h / 2, 5, h);

  // Carved glowing Jack-o'-Lantern Eyes & Jagged Grin
  const eyeGlow = 0.85 + 0.15 * Math.sin(frame * 0.35);
  ctx.fillStyle = oiled ? `rgba(217, 249, 157, ${eyeGlow})` : `rgba(254, 240, 138, ${eyeGlow})`;
  ctx.shadowColor = oiled ? '#4ade80' : '#f59e0b';
  ctx.shadowBlur = 8;

  // Left eye triangle
  ctx.beginPath();
  ctx.moveTo(-10, -4);
  ctx.lineTo(-6, -10);
  ctx.lineTo(-2, -4);
  ctx.closePath();
  ctx.fill();

  // Right eye triangle
  ctx.beginPath();
  ctx.moveTo(2, -4);
  ctx.lineTo(6, -10);
  ctx.lineTo(10, -4);
  ctx.closePath();
  ctx.fill();

  // Jagged grin
  ctx.beginPath();
  ctx.moveTo(-10, 2);
  ctx.lineTo(-6, 6);
  ctx.lineTo(-2, 3);
  ctx.lineTo(2, 6);
  ctx.lineTo(6, 3);
  ctx.lineTo(10, 2);
  ctx.lineTo(7, 8);
  ctx.lineTo(0, 7);
  ctx.lineTo(-7, 8);
  ctx.closePath();
  ctx.fill();
  ctx.shadowBlur = 0;

  // Curled pumpkin stem / iron handle on top
  ctx.strokeStyle = oiled ? '#4ade80' : '#15803d';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(0, -h / 2);
  ctx.quadraticCurveTo(4, -h / 2 - 8, -3, -h / 2 - 9);
  ctx.stroke();

  // Dripping green ectoplasm when oiled
  if (oiled) {
    ctx.fillStyle = 'rgba(74, 222, 128, 0.8)';
    ctx.beginPath();
    ctx.arc(-6, h / 2 + 2, 3, 0, Math.PI * 2);
    ctx.arc(8, h / 2 + 3, 2.5, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();
  return true;
}

/**
 * Draws the "Phantom Express" Ghost Coach.
 */
export function drawHalloweenCoach(ctx, x, y, w, h, frame = 0) {
  ctx.save();
  ctx.translate(x, y);

  // Eerie green underglow shadow
  ctx.fillStyle = 'rgba(34, 197, 94, 0.22)';
  ctx.beginPath();
  ctx.ellipse(w * 0.5, 4, w * 0.5, 9, 0, 0, Math.PI * 2);
  ctx.fill();

  // Coach Body (Midnight gothic purple-black)
  const grad = ctx.createLinearGradient(0, -h, 0, 0);
  grad.addColorStop(0, '#2e1065');
  grad.addColorStop(0.5, '#1e1b4b');
  grad.addColorStop(1, '#090414');
  ctx.fillStyle = grad;
  ctx.strokeStyle = '#4c1d95';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.roundRect(0, -h, w, h, 10);
  ctx.fill();
  ctx.stroke();

  // Roof highlight
  ctx.fillStyle = 'rgba(168, 85, 247, 0.18)';
  ctx.fillRect(6, -h + 4, w - 12, 5);

  // Ectoplasm Green & Orange Halloween Stripe
  ctx.fillStyle = '#4ade80';
  ctx.fillRect(0, -h + h * 0.38, w, 6);
  ctx.fillStyle = '#f97316';
  ctx.fillRect(0, -h + h * 0.38 + 6, w, 2.5);

  // Haunted Glowing Windows
  const winCount = Math.max(3, Math.floor(w / 30));
  const winW = Math.min(16, (w - 24) / winCount - 4);
  for (let i = 0; i < winCount; i += 1) {
    const wx = 12 + i * ((w - 24) / winCount);
    const pulse = 0.75 + 0.25 * Math.sin(frame * 0.1 + i);
    ctx.fillStyle = i % 2 === 0
      ? `rgba(134, 239, 172, ${pulse})`
      : `rgba(253, 186, 116, ${pulse})`;
    ctx.beginPath();
    ctx.roundRect(wx, -h + 15, winW, 16, 3);
    ctx.fill();

    // Little ghost silhouette in every second window
    if (i % 2 === 0) {
      ctx.fillStyle = 'rgba(15, 23, 42, 0.65)';
      ctx.beginPath();
      ctx.arc(wx + winW * 0.5, -h + 22, 3.5, Math.PI, 0);
      ctx.lineTo(wx + winW * 0.5 + 3.5, -h + 29);
      ctx.lineTo(wx + winW * 0.5 - 3.5, -h + 29);
      ctx.closePath();
      ctx.fill();
    }
  }

  // Cobweb lines on top-left corner of coach
  ctx.strokeStyle = 'rgba(226, 232, 240, 0.45)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, -h);
  ctx.lineTo(22, -h + 6);
  ctx.moveTo(0, -h);
  ctx.lineTo(18, -h + 16);
  ctx.moveTo(0, -h);
  ctx.lineTo(6, -h + 22);
  ctx.arc(0, -h, 12, 0, Math.PI * 0.5);
  ctx.arc(0, -h, 20, 0, Math.PI * 0.5);
  ctx.stroke();

  // Wheels with orange rims
  const wheels = [22, w - 22];
  if (w > 90) wheels.splice(1, 0, w * 0.42);
  for (const cx of wheels) {
    ctx.fillStyle = '#09090b';
    ctx.beginPath();
    ctx.arc(cx, 0, 11, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#f97316';
    ctx.beginPath();
    ctx.arc(cx, 0, 5, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();
}

/**
 * Replaces the sandbag/sack with a Giant Carved Jack-o'-Lantern Bouncer.
 */
export function drawHalloweenSack(ctx, x, y, r, frame = 0) {
  ctx.save();
  ctx.translate(x, y);

  // Shadow
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.beginPath();
  ctx.ellipse(0, 2, r * 1.15, 4, 0, 0, Math.PI * 2);
  ctx.fill();

  // Pumpkin Body
  const grad = ctx.createRadialGradient(-r * 0.25, -r * 0.5, 2, 0, -r * 0.3, r * 1.2);
  grad.addColorStop(0, '#fb923c');
  grad.addColorStop(0.7, '#ea580c');
  grad.addColorStop(1, '#9a3412');
  ctx.fillStyle = grad;
  ctx.strokeStyle = '#431407';
  ctx.lineWidth = 1.8;
  ctx.beginPath();
  ctx.ellipse(0, -r * 0.35, r * 1.15, r * 0.92, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  // Pumpkin ribs
  ctx.strokeStyle = 'rgba(124, 45, 18, 0.5)';
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.ellipse(0, -r * 0.35, r * 0.55, r * 0.9, 0, 0, Math.PI * 2);
  ctx.stroke();

  // Green stem
  ctx.fillStyle = '#15803d';
  ctx.beginPath();
  ctx.moveTo(-3, -r * 1.2);
  ctx.lineTo(2, -r * 1.55);
  ctx.lineTo(5, -r * 1.2);
  ctx.closePath();
  ctx.fill();

  // Glowing carved face
  const glow = 0.8 + 0.2 * Math.sin(frame * 0.25 + x);
  ctx.fillStyle = `rgba(254, 240, 138, ${glow})`;
  ctx.beginPath();
  // Eyes
  ctx.moveTo(-r * 0.55, -r * 0.45);
  ctx.lineTo(-r * 0.3, -r * 0.75);
  ctx.lineTo(-r * 0.1, -r * 0.45);
  ctx.moveTo(r * 0.1, -r * 0.45);
  ctx.lineTo(r * 0.3, -r * 0.75);
  ctx.lineTo(r * 0.55, -r * 0.45);
  ctx.fill();

  // Mouth
  ctx.beginPath();
  ctx.arc(0, -r * 0.25, r * 0.45, 0.15, Math.PI - 0.15);
  ctx.fill();

  ctx.restore();
}

/**
 * Replaces the traffic cone with a Striped Candy-Corn Witch Hat.
 */
export function drawHalloweenCone(ctx, x, y) {
  ctx.save();
  ctx.translate(x, y);

  // Witch hat brim
  ctx.fillStyle = '#3b0764';
  ctx.beginPath();
  ctx.ellipse(0, -2, 14, 4, 0, 0, Math.PI * 2);
  ctx.fill();

  // Candy corn cone
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(0, -30);
  ctx.lineTo(10, -2);
  ctx.lineTo(-10, -2);
  ctx.closePath();
  ctx.clip();

  // Yellow bottom
  ctx.fillStyle = '#facc15';
  ctx.fillRect(-12, -11, 24, 10);
  // Orange middle
  ctx.fillStyle = '#f97316';
  ctx.fillRect(-12, -21, 24, 10);
  // White tip
  ctx.fillStyle = '#f8fafc';
  ctx.fillRect(-12, -32, 24, 11);
  ctx.restore();

  ctx.strokeStyle = '#581c87';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(0, -30);
  ctx.lineTo(10, -2);
  ctx.lineTo(-10, -2);
  ctx.closePath();
  ctx.stroke();

  ctx.restore();
}

/**
 * Replaces the oil drum with a Bubbling Witch's Cauldron.
 */
export function drawHalloweenDrum(ctx, x, y, spilled = false, frame = 0) {
  ctx.save();
  ctx.translate(x, y);

  if (spilled) {
    // Glowing green ectoplasm puddle
    ctx.fillStyle = 'rgba(22, 163, 74, 0.72)';
    ctx.beginPath();
    ctx.ellipse(10, 1, 40, 10, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(134, 239, 172, 0.55)';
    ctx.beginPath();
    ctx.ellipse(14, 0, 20, 5, 0.1, 0, Math.PI * 2);
    ctx.fill();

    // Tipped cauldron
    ctx.rotate(1.1);
  }

  // Cauldron belly
  ctx.fillStyle = '#18181b';
  ctx.strokeStyle = '#3f3f46';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(0, -13, 14, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  // Cauldron rim
  ctx.fillStyle = '#27272a';
  ctx.beginPath();
  ctx.roundRect(-14, -27, 28, 5, 2.5);
  ctx.fill();

  // Glowing green potion top
  ctx.fillStyle = '#4ade80';
  ctx.beginPath();
  ctx.ellipse(0, -25, 11, 3, 0, 0, Math.PI * 2);
  ctx.fill();

  // Rising bubbles
  if (!spilled) {
    for (let b = 0; b < 3; b += 1) {
      const by = -28 - ((frame * 0.25 + b * 5) % 14);
      const bx = -5 + b * 5 + Math.sin(frame * 0.15 + b) * 2;
      ctx.fillStyle = 'rgba(134, 239, 172, 0.85)';
      ctx.beginPath();
      ctx.arc(bx, by, 2.2, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // Green rune symbol on front
  ctx.fillStyle = '#4ade80';
  ctx.font = 'bold 8px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('HEX', 0, -10);

  ctx.restore();
}

/**
 * Replaces the oil spill with a Radioactive Green Ectoplasm Slime Puddle.
 */
export function drawHalloweenOilSpill(ctx, x, y, frame = 0) {
  ctx.save();
  ctx.translate(x, y);
  const pulse = 0.12 * Math.sin(frame * 0.18);
  ctx.fillStyle = `rgba(21, 128, 61, ${0.78 + pulse})`;
  ctx.beginPath();
  ctx.ellipse(0, 0, 44, 12, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = `rgba(74, 222, 128, ${0.55 + pulse})`;
  ctx.beginPath();
  ctx.ellipse(8, -1, 18, 5, 0.15, 0, Math.PI * 2);
  ctx.ellipse(-12, 2, 12, 3.5, -0.2, 0, Math.PI * 2);
  ctx.fill();

  // Slime bubbles
  for (let i = 0; i < 3; i += 1) {
    const bx = -16 + i * 16;
    const br = 2 + Math.abs(Math.sin(frame * 0.12 + i)) * 2;
    ctx.fillStyle = '#bbf7d0';
    ctx.beginPath();
    ctx.arc(bx, -2, br, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

/**
 * Replaces flying birds with Vampire Bats (leathery wings + glowing red eyes).
 */
export function drawHalloweenBird(ctx, x, y, frame = 0, dir = 1) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(dir, 1);
  const flap = Math.sin(frame * 0.5) * 8;

  // Bat Wings
  ctx.fillStyle = '#1e1b4b';
  ctx.strokeStyle = '#4c1d95';
  ctx.lineWidth = 1.5;

  // Left/back wing
  ctx.beginPath();
  ctx.moveTo(-2, 0);
  ctx.quadraticCurveTo(-10, -14 - flap, -18, -4 - flap * 0.6);
  ctx.quadraticCurveTo(-12, 2, -6, 3);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // Right/front wing
  ctx.beginPath();
  ctx.moveTo(2, 0);
  ctx.quadraticCurveTo(-4, -16 - flap, -12, -6 - flap * 0.6);
  ctx.quadraticCurveTo(-6, 2, 0, 3);
  ctx.closePath();
  ctx.fill();

  // Bat Body & Head
  ctx.fillStyle = '#0f172a';
  ctx.beginPath();
  ctx.ellipse(0, 0, 7, 4.5, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(6, -2, 4, 0, Math.PI * 2);
  ctx.fill();

  // Pointy Bat Ears
  ctx.beginPath();
  ctx.moveTo(5, -5);
  ctx.lineTo(7, -10);
  ctx.lineTo(8, -5);
  ctx.moveTo(2, -5);
  ctx.lineTo(4, -9);
  ctx.lineTo(5, -5);
  ctx.fill();

  // Glowing Red Eyes
  ctx.fillStyle = '#ef4444';
  ctx.beginPath();
  ctx.arc(8, -2.5, 1.3, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

/**
 * Replaces the Hot Air Balloon with a Giant Floating Jack-o'-Lantern Dirigible.
 */
export function drawHalloweenBalloon(ctx, x, y, frame = 0, opts = {}) {
  const scale = Number(opts.scale) || 1;
  const bob = Math.sin(frame * 0.08 + (opts.bobPhase || 0)) * 3.5;
  const deflated = Boolean(opts.hit);

  ctx.save();
  ctx.translate(x, y + bob);
  ctx.scale(scale, scale);

  if (!deflated) {
    // Eerie outer glow
    ctx.fillStyle = 'rgba(249, 115, 22, 0.18)';
    ctx.beginPath();
    ctx.arc(0, -32, 32, 0, Math.PI * 2);
    ctx.fill();

    // Giant Pumpkin Envelope
    const grad = ctx.createRadialGradient(-6, -38, 4, 0, -30, 28);
    grad.addColorStop(0, '#fb923c');
    grad.addColorStop(0.7, '#ea580c');
    grad.addColorStop(1, '#7c2d12');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.ellipse(0, -32, 23, 25, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#431407';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Carved Glowing Face on the Balloon
    ctx.fillStyle = '#fef08a';
    ctx.beginPath();
    // Left eye
    ctx.moveTo(-11, -35);
    ctx.lineTo(-6, -43);
    ctx.lineTo(-2, -35);
    // Right eye
    ctx.moveTo(2, -35);
    ctx.lineTo(6, -43);
    ctx.lineTo(11, -35);
    ctx.fill();

    // Wicked grin
    ctx.beginPath();
    ctx.moveTo(-12, -26);
    ctx.quadraticCurveTo(0, -16, 12, -26);
    ctx.quadraticCurveTo(0, -22, -12, -26);
    ctx.fill();

    // Green stem on top
    ctx.fillStyle = '#15803d';
    ctx.fillRect(-3, -61, 6, 5);

    // Rigging
    ctx.strokeStyle = '#cbd5e1';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(-9, -9);
    ctx.lineTo(-5, 5);
    ctx.moveTo(9, -9);
    ctx.lineTo(5, 5);
    ctx.stroke();

    // Skull/Coffin Basket
    ctx.fillStyle = '#1e1b4b';
    ctx.strokeStyle = '#a855f7';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.roundRect(-7, 4, 14, 10, 2);
    ctx.fill();
    ctx.stroke();
  } else {
    // Splat pumpkin envelope
    ctx.fillStyle = '#9a3412';
    ctx.globalAlpha = 0.65;
    ctx.beginPath();
    ctx.ellipse(0, -8, 17, 8, 0.25, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  ctx.restore();
}

/**
 * Replaces the Porsche Macan with "Julie's Bat-Macan / Gothic Hearse".
 */
export function drawHalloweenMacan(ctx, x, y, frame = 0) {
  ctx.save();
  ctx.translate(x, y);
  const w = 94;
  const h = 38;

  // Purple vampire aura
  ctx.fillStyle = `rgba(168, 85, 247, ${0.18 + 0.08 * Math.sin(frame * 0.2)})`;
  ctx.beginPath();
  ctx.ellipse(w * 0.45, -h * 0.4, 62, 30, 0, 0, Math.PI * 2);
  ctx.fill();

  // Neon purple underglow
  ctx.fillStyle = 'rgba(192, 132, 252, 0.45)';
  ctx.beginPath();
  ctx.ellipse(w * 0.45, 2, 46, 6, 0, 0, Math.PI * 2);
  ctx.fill();

  // Bat-wing rear tailfin
  ctx.fillStyle = '#090414';
  ctx.strokeStyle = '#dc2626';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(6, -18);
  ctx.lineTo(-10, -34);
  ctx.lineTo(4, -28);
  ctx.lineTo(-6, -22);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // Main Chassis with crimson pinstripe
  ctx.fillStyle = '#09090b';
  ctx.strokeStyle = '#ef4444';
  ctx.lineWidth = 1.6;
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

  // Tinted crimson windows
  ctx.fillStyle = 'rgba(220, 38, 38, 0.45)';
  ctx.beginPath();
  ctx.moveTo(30, -32);
  ctx.lineTo(62, -33);
  ctx.lineTo(70, -22);
  ctx.lineTo(28, -20);
  ctx.closePath();
  ctx.fill();

  // Glowing blood-red headlights
  ctx.fillStyle = '#ef4444';
  ctx.shadowColor = '#ef4444';
  ctx.shadowBlur = 10;
  ctx.fillRect(82, -16, 7, 4);
  ctx.shadowBlur = 0;

  // Wheels
  ctx.fillStyle = '#18181b';
  ctx.beginPath();
  ctx.arc(22, -2, 9, 0, Math.PI * 2);
  ctx.arc(70, -2, 9, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#ef4444';
  ctx.beginPath();
  ctx.arc(22, -2, 4, 0, Math.PI * 2);
  ctx.arc(70, -2, 4, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = '#fca5a5';
  ctx.font = 'bold 8px Kenney Future Narrow, Kenney Future, system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('BAT-MACAN', w * 0.45, -12);

  ctx.restore();
}

/**
 * Replaces the flight coin with a Glowing Trick-or-Treat Pumpkin Candy Coin.
 */
export function drawHalloweenFlightCoin(ctx, sx, groundY, frame = 0) {
  const bob = Math.sin(frame * 0.12) * 4;
  const y = groundY - 52 + bob;
  ctx.save();
  ctx.translate(sx, y);
  ctx.rotate(Math.sin(frame * 0.08) * 0.25);

  // Candy wrapper wings
  ctx.fillStyle = '#a855f7';
  ctx.beginPath();
  ctx.moveTo(-12, 0);
  ctx.lineTo(-20, -7);
  ctx.lineTo(-20, 7);
  ctx.closePath();
  ctx.moveTo(12, 0);
  ctx.lineTo(20, -7);
  ctx.lineTo(20, 7);
  ctx.closePath();
  ctx.fill();

  // Glowing pumpkin coin disc
  ctx.shadowColor = '#f97316';
  ctx.shadowBlur = 14;
  ctx.fillStyle = '#fb923c';
  ctx.beginPath();
  ctx.arc(0, 0, 14, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.strokeStyle = '#7c2d12';
  ctx.lineWidth = 2.2;
  ctx.stroke();

  // Glowing face on coin
  ctx.fillStyle = '#fef08a';
  ctx.beginPath();
  ctx.arc(-4.5, -3, 2, 0, Math.PI * 2);
  ctx.arc(4.5, -3, 2, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(0, 2, 5.5, 0.15, Math.PI - 0.15);
  ctx.fill();

  ctx.restore();
}

/**
 * Costume overlay for the Kicker Mechanic: Frankenstein neck bolts + forehead stitches + undead glow.
 */
export function drawHalloweenMechanicOverlay(ctx, x, y, frame = 0, { kicking = false, running = false } = {}) {
  ctx.save();
  ctx.translate(x, y);
  const bob = running ? Math.abs(Math.sin(frame * 0.55)) * -3 : 0;

  // Eerie green zombie aura at feet
  ctx.fillStyle = 'rgba(74, 222, 128, 0.16)';
  ctx.beginPath();
  ctx.ellipse(0, -2, 24, 7, 0, 0, Math.PI * 2);
  ctx.fill();

  // Silver Frankenstein Neck Bolts
  const headY = -52 + bob;
  ctx.fillStyle = '#cbd5e1';
  ctx.strokeStyle = '#334155';
  ctx.lineWidth = 1.5;
  // Left bolt
  ctx.fillRect(-19, headY + 4, 6, 4);
  ctx.fillRect(-21, headY + 2, 3, 8);
  // Right bolt
  ctx.fillRect(13, headY + 4, 6, 4);
  ctx.fillRect(18, headY + 2, 3, 8);

  // Forehead Stitches
  ctx.strokeStyle = '#14532d';
  ctx.lineWidth = 1.8;
  ctx.beginPath();
  ctx.moveTo(-7, headY - 12);
  ctx.lineTo(7, headY - 10);
  ctx.stroke();
  for (let s = -5; s <= 5; s += 5) {
    ctx.beginPath();
    ctx.moveTo(s, headY - 14);
    ctx.lineTo(s, headY - 8);
    ctx.stroke();
  }

  ctx.restore();
}

/**
 * Costume overlay for the Smoker: Graveyard tombstone, Mummy wraps, and green ectoplasm smoke.
 */
export function drawHalloweenSmokerOverlay(ctx, sx, groundY, frame = 0) {
  ctx.save();
  ctx.translate(sx, groundY);

  // Crooked RIP Tombstone beside him
  ctx.save();
  ctx.translate(-24, 0);
  ctx.rotate(-0.08);
  ctx.fillStyle = '#475569';
  ctx.strokeStyle = '#1e293b';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.roundRect(-12, -34, 24, 34, [12, 12, 0, 0]);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#0f172a';
  ctx.font = 'bold 8px serif';
  ctx.textAlign = 'center';
  ctx.fillText('R.I.P.', 0, -18);
  ctx.restore();

  // Rising Green Ectoplasm Smoke Puffs
  const t = frame * 0.12;
  for (let i = 0; i < 4; i += 1) {
    const py = -54 - i * 11 - ((t * 4 + i * 3) % 14);
    const px = 14 + i * 4 + Math.sin(t + i) * 4;
    ctx.fillStyle = `rgba(74, 222, 128, ${0.55 - i * 0.1})`;
    ctx.beginPath();
    ctx.arc(px, py, 4.5 + i * 1.3, 0, Math.PI * 2);
    ctx.fill();
  }

  // Spooky nameplate
  ctx.fillStyle = 'rgba(24, 6, 44, 0.88)';
  ctx.strokeStyle = '#4ade80';
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.roundRect(-40, -96, 80, 16, 4);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#4ade80';
  ctx.font = 'bold 10px Kenney Future Narrow, Kenney Future, system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('GRAVE BREAK', 0, -85);

  ctx.restore();
}

/**
 * Costume overlay for Chelle: Wicked Witch Hat, bubbling mini cauldron, and arcane sparks.
 */
export function drawHalloweenChelleOverlay(ctx, sx, groundY, frame = 0, reacting = false, reactFrame = 0) {
  ctx.save();
  ctx.translate(sx, groundY);

  // Witch Hat sitting on top of Chelle's head
  ctx.save();
  ctx.translate(0, -72);
  ctx.rotate(-0.08);
  // Brim
  ctx.fillStyle = '#2e1065';
  ctx.strokeStyle = '#a855f7';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.ellipse(0, 0, 20, 5, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  // Pointed Cone
  ctx.beginPath();
  ctx.moveTo(-11, -1);
  ctx.quadraticCurveTo(-2, -26, 8, -28);
  ctx.lineTo(11, -1);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  // Gold Hat Buckle
  ctx.fillStyle = '#facc15';
  ctx.fillRect(-4, -6, 8, 5);
  ctx.restore();

  // Mini Bubbling Cauldron next to her
  ctx.fillStyle = '#18181b';
  ctx.beginPath();
  ctx.arc(24, -10, 10, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#4ade80';
  ctx.beginPath();
  ctx.ellipse(24, -18, 8, 2.5, 0, 0, Math.PI * 2);
  ctx.fill();

  if (reacting && reactFrame < 22) {
    // Speech bubble: "I'm casting a hex!"
    ctx.fillStyle = 'rgba(24, 6, 44, 0.95)';
    ctx.strokeStyle = '#a855f7';
    ctx.lineWidth = 2;
    const bw = 138;
    const bh = 28;
    const bx = -bw / 2;
    const by = -124;
    ctx.beginPath();
    ctx.roundRect(bx, by, bw, bh, 8);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#e9d5ff';
    ctx.font = 'bold 11px Kenney Future Narrow, Kenney Future, system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText("I'm casting a hex!", 0, by + bh / 2);
  } else if (!reacting) {
    ctx.fillStyle = 'rgba(24, 6, 44, 0.88)';
    ctx.strokeStyle = '#c084fc';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.roundRect(-42, -106, 84, 16, 4);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#e9d5ff';
    ctx.font = 'bold 10px Kenney Future Narrow, Kenney Future, system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('WITCH CHELLE', 0, -95);
  }

  ctx.restore();
}

/**
 * Costume overlay for Little Dick: Count Dickula Vampire Cape, Fangs & Nameplate.
 */
export function drawHalloweenDickOverlay(ctx, sx, groundY, frame = 0, { face = 1, catching = false } = {}) {
  ctx.save();
  ctx.translate(sx, groundY);

  // High-collared Dracula Cape behind/around shoulders
  ctx.save();
  ctx.scale(face < 0 ? -1 : 1, 1);
  // Popped red-lined vampire collar behind head
  ctx.fillStyle = '#991b1b';
  ctx.strokeStyle = '#09090b';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(-18, -36);
  ctx.lineTo(-24, -58);
  ctx.lineTo(0, -46);
  ctx.lineTo(24, -58);
  ctx.lineTo(18, -36);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // Vampire Fangs under his moustache
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.moveTo(-5, -45);
  ctx.lineTo(-3, -40);
  ctx.lineTo(-1, -45);
  ctx.moveTo(1, -45);
  ctx.lineTo(3, -40);
  ctx.lineTo(5, -45);
  ctx.fill();
  ctx.restore();

  if (!catching) {
    ctx.fillStyle = 'rgba(24, 6, 44, 0.88)';
    ctx.strokeStyle = '#ef4444';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.roundRect(-48, -98, 96, 16, 4);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#fca5a5';
    ctx.font = 'bold 10px Kenney Future Narrow, Kenney Future, system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('COUNT DICKULA', 0, -87);
  }

  ctx.restore();
}
