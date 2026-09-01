'use strict';

/**
 * Daily Boggle — board is deterministic per day; play is local; one Firestore write on submit.
 * Dictionary lives in Firebase Storage (cached in-memory on warm instances).
 */

const fs = require('fs');
const path = require('path');

const BOARD_SIZE = 4;
const MIN_WORD_LENGTH = 3;
const MAX_DICTIONARY_WORD_LENGTH = 15;
const ROUND_SECONDS = 180;
const STORAGE_BUCKET = 'master-user-management.firebasestorage.app';
/** Shared Fun dictionary (Boggle + Letter Box). v2 includes 9–15 letter words. */
const DICTIONARY_OBJECT = 'boggle/dictionary-v2.txt';
const DICTIONARY_TOKEN = '8f3c2a91-boggle-dict-v2-7e4d9c2b';
const DICTIONARY_URL = `https://firebasestorage.googleapis.com/v0/b/${STORAGE_BUCKET}/o/${encodeURIComponent(DICTIONARY_OBJECT)}?alt=media&token=${DICTIONARY_TOKEN}`;
const DICTIONARY_VERSION = 'v2';
const LOCAL_FALLBACK = path.join(__dirname, 'data', 'funDictionary-v2.txt');

// Classic Boggle dice (Q = Qu).
const DICE = [
  'AAEEGN', 'ABBJOO', 'ACHOPS', 'AFFKPS',
  'AOOTTW', 'CIMOTU', 'DEILRX', 'DELRVY',
  'DISTTY', 'EEGHNW', 'EEINSU', 'EHRTVW',
  'EIOSST', 'ELRTTY', 'HIMNQU', 'HLNNRZ',
];

let wordSetCache = null;
let wordSetLoadPromise = null;

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

function mulberry32(seed) {
  let t = seed >>> 0;
  return () => {
    t += 0x6D2B79F5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffleInPlace(arr, rand) {
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rand() * (i + 1));
    const tmp = arr[i];
    arr[i] = arr[j];
    arr[j] = tmp;
  }
  return arr;
}

function faceToLetter(face) {
  const ch = String(face || 'A').toUpperCase();
  return ch === 'Q' ? 'Qu' : ch;
}

function getBoardForDay(dayKey) {
  const rand = mulberry32(hashString(`boggle:v1:${dayKey}`));
  const dice = shuffleInPlace([...DICE], rand);
  const cells = dice.map((die) => {
    const face = die[Math.floor(rand() * die.length)];
    return faceToLetter(face);
  });
  const grid = [];
  for (let r = 0; r < BOARD_SIZE; r += 1) {
    grid.push(cells.slice(r * BOARD_SIZE, (r + 1) * BOARD_SIZE));
  }
  return grid;
}

function normalizeWord(word) {
  return String(word || '')
    .toLowerCase()
    .replace(/[^a-z]/g, '');
}

function scoreWord(word) {
  const len = normalizeWord(word).length;
  if (len < MIN_WORD_LENGTH) return 0;
  // 3→1, 4→2, 5→3, …
  return len - MIN_WORD_LENGTH + 1;
}

function cellLetters(grid) {
  return (grid || []).map((row) => (row || []).map((cell) => normalizeWord(cell)));
}

/** Check word can be formed on board via adjacent steps (8-dir), no reuse. */
function wordOnBoard(grid, word) {
  const target = normalizeWord(word);
  if (target.length < MIN_WORD_LENGTH) return false;
  const board = cellLetters(grid);
  const rows = board.length;
  const cols = board[0]?.length || 0;

  function dfs(r, c, index, used) {
    if (index >= target.length) return true;
    for (let dr = -1; dr <= 1; dr += 1) {
      for (let dc = -1; dc <= 1; dc += 1) {
        if (dr === 0 && dc === 0) continue;
        const nr = r + dr;
        const nc = c + dc;
        if (nr < 0 || nc < 0 || nr >= rows || nc >= cols) continue;
        const key = nr * cols + nc;
        if (used.has(key)) continue;
        const cell = board[nr][nc];
        if (!target.startsWith(cell, index)) continue;
        used.add(key);
        if (dfs(nr, nc, index + cell.length, used)) return true;
        used.delete(key);
      }
    }
    return false;
  }

  for (let r = 0; r < rows; r += 1) {
    for (let c = 0; c < cols; c += 1) {
      const cell = board[r][c];
      if (!target.startsWith(cell)) continue;
      const used = new Set([r * cols + c]);
      if (dfs(r, c, cell.length, used)) return true;
    }
  }
  return false;
}

function parseDictionaryText(text) {
  const set = new Set();
  const pattern = new RegExp(`^[a-z]{${MIN_WORD_LENGTH},${MAX_DICTIONARY_WORD_LENGTH}}$`);
  String(text || '').split(/\r?\n/).forEach((line) => {
    const word = line.trim().toLowerCase();
    if (pattern.test(word)) set.add(word);
  });
  return set;
}

function loadLocalFallbackSet() {
  if (!fs.existsSync(LOCAL_FALLBACK)) {
    throw new Error('Boggle dictionary unavailable (Storage and local fallback missing).');
  }
  return parseDictionaryText(fs.readFileSync(LOCAL_FALLBACK, 'utf8'));
}

/**
 * Load dictionary once per warm instance (Storage first, packaged file fallback).
 * @param {import('@google-cloud/storage').Bucket | null} bucket
 */
async function ensureWordSet(bucket = null) {
  if (wordSetCache) return wordSetCache;
  if (!wordSetLoadPromise) {
    wordSetLoadPromise = (async () => {
      // Prefer the packaged v2 list so deploys pick up longer Letter Box words
      // even before Storage is updated.
      try {
        wordSetCache = loadLocalFallbackSet();
        if (wordSetCache.size) return wordSetCache;
      } catch (localError) {
        console.warn('fun dictionary local load failed; trying Storage', localError?.message || localError);
      }
      try {
        if (bucket) {
          const [buf] = await bucket.file(DICTIONARY_OBJECT).download();
          wordSetCache = parseDictionaryText(buf.toString('utf8'));
        } else {
          const res = await fetch(DICTIONARY_URL);
          if (!res.ok) throw new Error(`Dictionary HTTP ${res.status}`);
          wordSetCache = parseDictionaryText(await res.text());
        }
        if (!wordSetCache.size) throw new Error('Dictionary empty');
        return wordSetCache;
      } catch (error) {
        console.warn('fun dictionary storage load failed', error?.message || error);
        wordSetCache = loadLocalFallbackSet();
        return wordSetCache;
      }
    })().catch((error) => {
      wordSetLoadPromise = null;
      throw error;
    });
  }
  return wordSetLoadPromise;
}

function isDictionaryWord(word, wordSet = wordSetCache) {
  if (!wordSet) return false;
  return wordSet.has(normalizeWord(word));
}

async function evaluateWords(grid, words, { bucket = null } = {}) {
  const wordSet = await ensureWordSet(bucket);
  const accepted = [];
  const rejected = [];
  const seen = new Set();
  let score = 0;

  for (const raw of words || []) {
    const word = normalizeWord(raw);
    if (!word) continue;
    if (seen.has(word)) {
      rejected.push({ word, reason: 'duplicate' });
      continue;
    }
    seen.add(word);
    if (word.length < MIN_WORD_LENGTH) {
      rejected.push({ word, reason: 'too_short' });
      continue;
    }
    if (!isDictionaryWord(word, wordSet)) {
      rejected.push({ word, reason: 'not_in_dictionary' });
      continue;
    }
    if (!wordOnBoard(grid, word)) {
      rejected.push({ word, reason: 'not_on_board' });
      continue;
    }
    const points = scoreWord(word);
    accepted.push({ word, points });
    score += points;
  }

  accepted.sort((a, b) => b.word.length - a.word.length || a.word.localeCompare(b.word));
  return {
    accepted,
    rejected,
    score,
    wordCount: accepted.length,
  };
}

function serializeBoggleGame(data = {}, { includeWords = true } = {}) {
  const status = data.status || 'in_progress';
  return {
    dayKey: data.dayKey || '',
    status,
    score: Number.isFinite(data.score) ? data.score : 0,
    wordCount: Number.isFinite(data.wordCount) ? data.wordCount : 0,
    durationMs: Number.isFinite(data.durationMs) ? data.durationMs : null,
    words: includeWords && Array.isArray(data.words) ? data.words : [],
    completedAt: data.completedAt?.toDate?.()?.toISOString?.() || data.completedAt || null,
  };
}

function publicPuzzle(dayKey) {
  return {
    dayKey,
    size: BOARD_SIZE,
    board: getBoardForDay(dayKey),
    roundSeconds: ROUND_SECONDS,
    minWordLength: MIN_WORD_LENGTH,
    dictionaryUrl: DICTIONARY_URL,
    dictionaryVersion: DICTIONARY_VERSION,
  };
}

function getDictionaryUrl() {
  return DICTIONARY_URL;
}

module.exports = {
  BOARD_SIZE,
  MIN_WORD_LENGTH,
  MAX_DICTIONARY_WORD_LENGTH,
  ROUND_SECONDS,
  DICTIONARY_OBJECT,
  DICTIONARY_URL,
  DICTIONARY_VERSION,
  getLondonDayKey,
  getBoardForDay,
  normalizeWord,
  scoreWord,
  wordOnBoard,
  isDictionaryWord,
  ensureWordSet,
  evaluateWords,
  serializeBoggleGame,
  publicPuzzle,
  getDictionaryUrl,
  hashString,
};
