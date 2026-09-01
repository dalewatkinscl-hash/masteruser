'use strict';

/**
 * Letter Box — NYT Letter Boxed–style daily puzzle.
 * 12 unique letters on a square (3 per side). Chain words (≥3 letters)
 * without consecutive letters from the same side; use every letter at least once.
 */

const fs = require('fs');
const path = require('path');
const { ensureWordSet } = require('./boggle');

const MIN_WORD_LENGTH = 3;
const SIDE_COUNT = 4;
const LETTERS_PER_SIDE = 3;
const BOARD_LETTERS = SIDE_COUNT * LETTERS_PER_SIDE;

/** Competitive Letter Box starts this Europe/London day (inclusive). */
const LETTERBOX_LIVE_FROM = '2026-08-05';

function getLondonDayKey(date = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/London',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

function hashString(input) {
  let h = 2166136261;
  const s = String(input || '');
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function normalizeWord(word) {
  return String(word || '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z]/g, '');
}

function normalizeSides(sides) {
  return (Array.isArray(sides) ? sides : []).map((side) => normalizeWord(side));
}

function sideIndexOf(sides, letter) {
  const ch = normalizeWord(letter);
  for (let i = 0; i < sides.length; i += 1) {
    if (sides[i].includes(ch)) return i;
  }
  return -1;
}

function boardLetters(sides) {
  return new Set(normalizeSides(sides).join('').split('').filter(Boolean));
}

function isValidBoard(sides) {
  const normalized = normalizeSides(sides);
  if (normalized.length !== SIDE_COUNT) return false;
  if (normalized.some((side) => side.length !== LETTERS_PER_SIDE)) return false;
  const letters = boardLetters(normalized);
  return letters.size === BOARD_LETTERS;
}

/** Consecutive letters must exist on the board and come from different sides. */
function wordValidOnSides(sides, word) {
  const w = normalizeWord(word);
  if (w.length < MIN_WORD_LENGTH) return false;
  if (/(.)\1/.test(w)) return false;
  const normalized = normalizeSides(sides);
  const letters = boardLetters(normalized);
  for (let i = 0; i < w.length; i += 1) {
    if (!letters.has(w[i])) return false;
    if (i > 0 && sideIndexOf(normalized, w[i]) === sideIndexOf(normalized, w[i - 1])) {
      return false;
    }
  }
  return true;
}

function coversAllLetters(sides, words) {
  const need = boardLetters(sides);
  const used = new Set();
  for (const word of words || []) {
    for (const ch of normalizeWord(word)) used.add(ch);
  }
  if (used.size < need.size) return false;
  for (const ch of need) {
    if (!used.has(ch)) return false;
  }
  return true;
}

function chainIsValid(words) {
  const list = (words || []).map(normalizeWord).filter(Boolean);
  for (let i = 1; i < list.length; i += 1) {
    const prev = list[i - 1];
    const next = list[i];
    if (!prev || !next || prev[prev.length - 1] !== next[0]) return false;
  }
  return true;
}

function usedLettersFromWords(words) {
  const used = new Set();
  for (const word of words || []) {
    for (const ch of normalizeWord(word)) used.add(ch);
  }
  return [...used].sort().join('');
}

function loadPuzzleBank() {
  const filePath = path.join(__dirname, 'data', 'letterboxPuzzles.json');
  const raw = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  if (!Array.isArray(raw) || !raw.length) {
    throw new Error('Letter Box puzzle bank is empty.');
  }
  return raw.map((entry, index) => {
    const sides = normalizeSides(entry.sides);
    const solution = (entry.solution || []).map(normalizeWord);
    const id = String(entry.id || `lb${String(index + 1).padStart(3, '0')}`);
    const par = Number.isFinite(entry.par) ? Math.max(1, Math.floor(entry.par)) : solution.length;
    if (!isValidBoard(sides)) {
      throw new Error(`Letter Box puzzle ${id} has an invalid board.`);
    }
    if (!solution.length || !chainIsValid(solution)) {
      throw new Error(`Letter Box puzzle ${id} has an invalid solution chain.`);
    }
    if (!solution.every((word) => wordValidOnSides(sides, word))) {
      throw new Error(`Letter Box puzzle ${id} solution breaks side rules.`);
    }
    if (!coversAllLetters(sides, solution)) {
      throw new Error(`Letter Box puzzle ${id} solution does not cover all letters.`);
    }
    if (par < solution.length) {
      throw new Error(`Letter Box puzzle ${id} par is below its known solution.`);
    }
    return { id, sides, solution, par };
  });
}

const PUZZLES = loadPuzzleBank();

function getPuzzleById(puzzleId) {
  return PUZZLES.find((p) => p.id === puzzleId) || null;
}

function getPuzzleForDay(dayKey = getLondonDayKey()) {
  const key = String(dayKey || getLondonDayKey());
  const index = hashString(`letterbox:v2:${key}`) % PUZZLES.length;
  const base = PUZZLES[index];
  return {
    id: base.id,
    dayKey: key,
    sides: base.sides.map((side) => side),
    par: base.par,
    solution: base.solution.map((word) => word),
  };
}

function publicPuzzle(puzzle, { reveal = false } = {}) {
  return {
    id: puzzle.id,
    dayKey: puzzle.dayKey,
    sides: puzzle.sides,
    par: puzzle.par,
    minWordLength: MIN_WORD_LENGTH,
    solution: reveal ? puzzle.solution : undefined,
  };
}

async function validateWord(sides, word, { bucket = null, wordSet = null } = {}) {
  const normalized = normalizeWord(word);
  if (normalized.length < MIN_WORD_LENGTH) {
    return { ok: false, reason: 'length', word: normalized };
  }
  if (!wordValidOnSides(sides, normalized)) {
    return { ok: false, reason: 'sides', word: normalized };
  }
  const set = wordSet || await ensureWordSet(bucket);
  const lower = normalized.toLowerCase();
  if (!set.has(lower)) {
    return { ok: false, reason: 'dictionary', word: normalized };
  }
  return { ok: true, word: normalized };
}

/**
 * Validate a full submitted chain. Returns status won when all letters covered.
 */
async function evaluateChain(puzzle, words, { bucket = null } = {}) {
  const wordSet = await ensureWordSet(bucket);
  const chain = [];
  const history = [];

  for (const raw of words || []) {
    const check = await validateWord(puzzle.sides, raw, { wordSet });
    if (!check.ok) {
      history.push({ word: check.word, ok: false, reason: check.reason });
      return {
        status: 'invalid',
        words: chain,
        history,
        usedLetters: usedLettersFromWords(chain),
        wordCount: chain.length,
        letterCount: chain.join('').length,
        solved: false,
        reason: check.reason,
      };
    }
    if (chain.length) {
      const prev = chain[chain.length - 1];
      if (prev[prev.length - 1] !== check.word[0]) {
        history.push({ word: check.word, ok: false, reason: 'chain' });
        return {
          status: 'invalid',
          words: chain,
          history,
          usedLetters: usedLettersFromWords(chain),
          wordCount: chain.length,
          letterCount: chain.join('').length,
          solved: false,
          reason: 'chain',
        };
      }
    }
    chain.push(check.word);
    history.push({ word: check.word, ok: true });
  }

  const solved = coversAllLetters(puzzle.sides, chain);
  return {
    status: solved ? 'won' : 'in_progress',
    words: chain,
    history,
    usedLetters: usedLettersFromWords(chain),
    wordCount: chain.length,
    letterCount: chain.join('').length,
    solved,
    atOrUnderPar: solved && chain.length <= (puzzle.par || chain.length),
  };
}

function serializeLetterboxGame(data = {}, { includeSolution = false, puzzle = null } = {}) {
  const status = data.status || 'in_progress';
  const words = Array.isArray(data.words) ? data.words.map(normalizeWord) : [];
  const reveal = includeSolution && status === 'won' && puzzle;
  return {
    dayKey: data.dayKey || '',
    status,
    words,
    wordCount: Number.isFinite(data.wordCount) ? data.wordCount : words.length,
    letterCount: Number.isFinite(data.letterCount)
      ? data.letterCount
      : words.join('').length,
    usedLetters: data.usedLetters || usedLettersFromWords(words),
    par: data.par ?? puzzle?.par ?? null,
    startedAt: data.startedAt?.toDate?.()?.toISOString?.() || data.startedAt || null,
    completedAt: data.completedAt?.toDate?.()?.toISOString?.() || data.completedAt || null,
    durationMs: Number.isFinite(data.durationMs) ? data.durationMs : null,
    solution: reveal ? puzzle.solution : undefined,
  };
}

function compareLetterboxRows(a, b) {
  const aw = Number(a.wordCount) || 99;
  const bw = Number(b.wordCount) || 99;
  if (aw !== bw) return aw - bw;
  const al = Number(a.letterCount) || 1e9;
  const bl = Number(b.letterCount) || 1e9;
  if (al !== bl) return al - bl;
  const ad = Number.isFinite(a.durationMs) ? a.durationMs : 1e15;
  const bd = Number.isFinite(b.durationMs) ? b.durationMs : 1e15;
  if (ad !== bd) return ad - bd;
  return String(a.completedAt || '').localeCompare(String(b.completedAt || ''));
}

function resultLabel(row) {
  const words = Number(row.wordCount) || 0;
  const par = Number(row.par) || 0;
  if (par > 0 && words > 0 && words <= par) return `${words} words (par ${par})`;
  if (words > 0) return `${words} words`;
  return 'Solved';
}

module.exports = {
  MIN_WORD_LENGTH,
  LETTERBOX_LIVE_FROM,
  PUZZLES,
  getLondonDayKey,
  hashString,
  normalizeWord,
  normalizeSides,
  sideIndexOf,
  boardLetters,
  isValidBoard,
  wordValidOnSides,
  coversAllLetters,
  chainIsValid,
  usedLettersFromWords,
  getPuzzleById,
  getPuzzleForDay,
  publicPuzzle,
  validateWord,
  evaluateChain,
  serializeLetterboxGame,
  compareLetterboxRows,
  resultLabel,
};
