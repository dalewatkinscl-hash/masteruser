/**
 * Daily Wanted — emoji spotter (Wantedle-style).
 * Deterministic puzzles from Europe/London dayKey + challenge.
 */

export const WANTED_CHALLENGES = ['standard', 'impossible'];
export const PENALTY_MS = 3000;
export const STANDARD_COUNT = 140;
export const IMPOSSIBLE_COUNT = 160;

const EMOJI_POOL = [
  '😀', '😁', '😂', '🤣', '😃', '😄', '😅', '😆', '😉', '😊',
  '😋', '😎', '😍', '😘', '😗', '😙', '😚', '🙂', '🤗', '🤩',
  '🤔', '🤨', '😐', '😑', '😶', '🙄', '😏', '😣', '😥', '😮',
  '🤐', '😯', '😪', '😫', '🥱', '😴', '😌', '😛', '😜', '😝',
  '🤤', '😒', '😓', '😔', '😕', '🙃', '🤑', '😲', '☹️', '🙁',
  '😖', '😞', '😟', '😤', '😢', '😭', '😦', '😧', '😨', '😩',
  '🤯', '😬', '😰', '😱', '🥵', '🥶', '😳', '🤪', '😵', '😡',
  '😠', '🤬', '😷', '🤒', '🤕', '🤢', '🤮', '🤧', '😇', '🥳',
  '🥺', '🤠', '🤡', '🤥', '🤫', '🤭', '🧐', '🤓', '😈', '👿',
  '👹', '👺', '💀', '☠️', '👻', '👽', '👾', '🤖', '💩', '😺',
  '🐶', '🐱', '🐭', '🐹', '🐰', '🦊', '🐻', '🐼', '🐨', '🐯',
  '🦁', '🐮', '🐷', '🐸', '🐵', '🙈', '🙉', '🙊', '🐒', '🐔',
  '🐧', '🐦', '🐤', '🐣', '🐥', '🦆', '🦅', '🦉', '🦇', '🐺',
  '🐗', '🐴', '🦄', '🐝', '🐛', '🦋', '🐌', '🐞', '🐜', '🦟',
  '🍎', '🍊', '🍋', '🍌', '🍉', '🍇', '🍓', '🍈', '🍒', '🍑',
  '🥭', '🍍', '🥥', '🥝', '🍅', '🍆', '🥑', '🥦', '🥬', '🥒',
  '⚽', '🏀', '🏈', '⚾', '🎾', '🏐', '🏉', '🥏', '🎱', '🏓',
  '🚗', '🚕', '🚙', '🚌', '🚎', '🏎️', '🚓', '🚑', '🚒', '🚐',
  '🍕', '🍔', '🍟', '🌭', '🍿', '🧂', '🥓', '🥚', '🍳', '🧇',
  '⭐', '🌟', '✨', '⚡', '🔥', '💧', '☀️', '🌙', '❄️', '🌈',
  '🎸', '🎹', '🎺', '🎻', '🥁', '🎤', '🎧', '🎬', '🎮', '🕹️',
  '💎', '💍', '👑', '🎩', '🎓', '👓', '🕶️', '🧣', '🧤', '🧥',
];

function hashString(input) {
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
    t += 0x6D2B79F5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

export function shuffleInPlace(arr, rand) {
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rand() * (i + 1));
    const tmp = arr[i];
    arr[i] = arr[j];
    arr[j] = tmp;
  }
  return arr;
}

export function pickUnique(pool, count, rand) {
  const copy = [...pool];
  shuffleInPlace(copy, rand);
  return copy.slice(0, Math.min(count, copy.length));
}

export function gradeForTimeMs(timeMs) {
  const s = Number(timeMs) / 1000;
  if (!Number.isFinite(s) || s < 0) return 'F';
  if (s <= 3) return 'S';
  if (s <= 5) return 'A';
  if (s <= 8) return 'B';
  if (s <= 12) return 'C';
  if (s <= 20) return 'D';
  return 'F';
}

/** Combined Standard + Impossible score bands (roughly ~2× single). */
export function gradeForCombinedTimeMs(timeMs) {
  const s = Number(timeMs) / 1000;
  if (!Number.isFinite(s) || s < 0) return 'F';
  if (s <= 6) return 'S';
  if (s <= 10) return 'A';
  if (s <= 16) return 'B';
  if (s <= 24) return 'C';
  if (s <= 40) return 'D';
  return 'F';
}

export function formatWantedTime(timeMs) {
  const ms = Math.max(0, Math.floor(Number(timeMs) || 0));
  const whole = Math.floor(ms / 1000);
  const tenths = Math.floor((ms % 1000) / 100);
  return `${whole}.${tenths}s`;
}

export function correctedTimeMs(elapsedMs, penalties) {
  const elapsed = Math.max(0, Math.floor(Number(elapsedMs) || 0));
  const pens = Math.max(0, Math.floor(Number(penalties) || 0));
  return elapsed + pens * PENALTY_MS;
}

/**
 * Daily target + emoji mix are seeded from dayKey.
 * Positions / velocities are assigned fresh each attempt via scramblePieceMotion.
 * @param {'standard'|'impossible'} challenge
 */
export function buildWantedPuzzle(dayKey, challenge = 'standard') {
  const mode = challenge === 'impossible' ? 'impossible' : 'standard';
  const seed = hashString(`wanted:${dayKey}:${mode}`);
  const rand = mulberry32(seed);

  if (mode === 'standard') {
    const decoyCount = 16 + Math.floor(rand() * 10);
    const picked = pickUnique(EMOJI_POOL, decoyCount + 1, rand);
    const target = picked[0];
    const decoys = picked.slice(1);
    const pieces = [];
    pieces.push(makePieceIdentity(`t-0`, target, true));
    while (pieces.length < STANDARD_COUNT) {
      const emoji = decoys[Math.floor(rand() * decoys.length)];
      pieces.push(makePieceIdentity(`d-${pieces.length}`, emoji, false));
    }
    shuffleInPlace(pieces, rand);
    return {
      dayKey,
      challenge: mode,
      target,
      pieces: scramblePieceMotion(pieces),
      hideTarget: false,
    };
  }

  // Impossible: exactly one singleton; every other emoji appears ≥2 times
  const decoyTypes = 14 + Math.floor(rand() * 8);
  const picked = pickUnique(EMOJI_POOL, decoyTypes + 1, rand);
  const target = picked[0];
  const decoys = picked.slice(1);
  const pieces = [makePieceIdentity('t-0', target, true)];
  for (const emoji of decoys) {
    const copies = 2 + Math.floor(rand() * 4);
    for (let i = 0; i < copies; i += 1) {
      pieces.push(makePieceIdentity(`d-${emoji}-${i}`, emoji, false));
    }
  }
  while (pieces.length < IMPOSSIBLE_COUNT) {
    const emoji = decoys[Math.floor(rand() * decoys.length)];
    pieces.push(makePieceIdentity(`d-fill-${pieces.length}`, emoji, false));
  }
  shuffleInPlace(pieces, rand);
  return {
    dayKey,
    challenge: mode,
    target,
    pieces: scramblePieceMotion(pieces),
    hideTarget: true,
  };
}

function makePieceIdentity(id, emoji, isTarget) {
  return { id, emoji, isTarget };
}

/** Fresh random spawn positions + drift paths for one attempt (uses Math.random). */
export function scramblePieceMotion(pieces, rand = Math.random) {
  const sizes = [18, 20, 22, 24, 26];
  return (pieces || []).map((p) => {
    const angle = rand() * Math.PI * 2;
    const speed = 22 + rand() * 55;
    return {
      ...p,
      x: 3 + rand() * 94,
      y: 3 + rand() * 94,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      size: sizes[Math.floor(rand() * sizes.length)],
    };
  });
}

export function wantedResultLabel(row) {
  const ms = Number(row?.timeMs);
  const grade = row?.grade || gradeForCombinedTimeMs(ms);
  if (!Number.isFinite(ms)) return '—';
  return `${grade} · ${formatWantedTime(ms)}`;
}
