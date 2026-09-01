/**
 * Letter Box — client helpers (mirrors functions/letterbox.js rules).
 */

import puzzleBank from './letterboxPuzzles.json';

export const MIN_WORD_LENGTH = 3;
export const LETTERBOX_LIVE_FROM = '2026-08-05';

export const LETTERBOX_SEED_PUZZLES = puzzleBank.map((entry) => ({
  id: entry.id,
  sides: entry.sides,
  par: entry.par,
  solution: entry.solution,
  title: `${entry.id} · par ${entry.par}`,
}));

/** Five Fun-tab practice boards (level 1 is the easy intro). */
export const LETTERBOX_PRACTICE_LEVELS = puzzleBank.slice(0, 5).map((entry, index) => ({
  id: entry.id,
  sides: entry.sides,
  par: entry.par,
  solution: entry.solution,
  practiceLevel: index + 1,
  title: index === 0 ? 'Practice level 1 · easy' : `Practice level ${index + 1}`,
}));

export function normalizeWord(word) {
  return String(word || '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z]/g, '');
}

export function normalizeSides(sides) {
  return (Array.isArray(sides) ? sides : []).map((side) => normalizeWord(side));
}

export function sideIndexOf(sides, letter) {
  const ch = normalizeWord(letter);
  for (let i = 0; i < sides.length; i += 1) {
    if (sides[i].includes(ch)) return i;
  }
  return -1;
}

export function boardLetterSet(sides) {
  return new Set(normalizeSides(sides).join('').split('').filter(Boolean));
}

/**
 * Whether `letter` can be appended to the current draft under Letter Box rules.
 * @returns {{ ok: boolean, reason?: string }}
 */
export function canAppendLetter(sides, draft, letter, requiredStart = null) {
  const ch = normalizeWord(letter);
  if (!ch || ch.length !== 1) return { ok: false, reason: 'letter' };
  const normalized = normalizeSides(sides);
  const letters = boardLetterSet(normalized);
  if (!letters.has(ch)) return { ok: false, reason: 'board' };

  const current = normalizeWord(draft);
  if (!current) {
    if (requiredStart && ch !== requiredStart) {
      return { ok: false, reason: 'chain' };
    }
    return { ok: true };
  }

  const prev = current[current.length - 1];
  if (ch === prev) return { ok: false, reason: 'same' };
  if (sideIndexOf(normalized, ch) === sideIndexOf(normalized, prev)) {
    return { ok: false, reason: 'side' };
  }
  return { ok: true };
}

/** Keep only a valid prefix of typed input (stops at first illegal letter). */
export function filterDraftInput(sides, draftSoFar, nextRaw, requiredStart = null) {
  const incoming = normalizeWord(nextRaw);
  // Prefer treating nextRaw as the full new draft value from an input.
  let built = '';
  for (const ch of incoming) {
    const check = canAppendLetter(sides, built, ch, requiredStart);
    if (!check.ok) break;
    built += ch;
  }
  // If user is extending draftSoFar (common typing), also try append-only from previous.
  if (incoming.startsWith(normalizeWord(draftSoFar))) {
    built = normalizeWord(draftSoFar);
    for (const ch of incoming.slice(built.length)) {
      const check = canAppendLetter(sides, built, ch, requiredStart);
      if (!check.ok) break;
      built += ch;
    }
  }
  return built;
}

export function wordValidOnSides(sides, word) {
  const w = normalizeWord(word);
  if (w.length < MIN_WORD_LENGTH) return false;
  if (/(.)\1/.test(w)) return false;
  const normalized = normalizeSides(sides);
  const letters = boardLetterSet(normalized);
  for (let i = 0; i < w.length; i += 1) {
    if (!letters.has(w[i])) return false;
    if (i > 0 && sideIndexOf(normalized, w[i]) === sideIndexOf(normalized, w[i - 1])) {
      return false;
    }
  }
  return true;
}

export function usedLettersFromWords(words) {
  const used = new Set();
  for (const word of words || []) {
    for (const ch of normalizeWord(word)) used.add(ch);
  }
  return used;
}

export function coversAllLetters(sides, words) {
  const need = boardLetterSet(sides);
  const used = usedLettersFromWords(words);
  if (used.size < need.size) return false;
  for (const ch of need) {
    if (!used.has(ch)) return false;
  }
  return true;
}

export function nextRequiredLetter(words) {
  if (!words?.length) return null;
  const last = normalizeWord(words[words.length - 1]);
  return last ? last[last.length - 1] : null;
}

export function getPuzzleById(puzzleId) {
  return LETTERBOX_SEED_PUZZLES.find((p) => p.id === puzzleId) || null;
}

export function getLocalPuzzleForDay(dayKey) {
  let h = 2166136261;
  const s = `letterbox:v2:${dayKey}`;
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  const index = (h >>> 0) % LETTERBOX_SEED_PUZZLES.length;
  const base = LETTERBOX_SEED_PUZZLES[index];
  return {
    ...base,
    dayKey,
    sides: [...base.sides],
    solution: [...base.solution],
  };
}
