/**
 * Client-side Boggle helpers — play locally; dictionary fetched once from Storage.
 */

export const BOARD_SIZE = 4;
export const MIN_WORD_LENGTH = 3;
export const MAX_DICTIONARY_WORD_LENGTH = 15;
export const ROUND_SECONDS = 180;
export const DICTIONARY_VERSION = 'v2';

let wordSet = null;
let loadPromise = null;

export function normalizeWord(word) {
  return String(word || '')
    .toLowerCase()
    .replace(/[^a-z]/g, '');
}

export function scoreWord(word) {
  const len = normalizeWord(word).length;
  if (len < MIN_WORD_LENGTH) return 0;
  // 3→1, 4→2, 5→3, …
  return len - MIN_WORD_LENGTH + 1;
}

function cellLetters(grid) {
  return (grid || []).map((row) => (row || []).map((cell) => normalizeWord(cell)));
}

export function wordOnBoard(grid, word) {
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

async function readCachedDictionary(version) {
  try {
    const cache = await caches.open('cl-boggle-dict');
    const hit = await cache.match(`boggle-dict-${version}`);
    if (!hit) return null;
    return parseDictionaryText(await hit.text());
  } catch {
    return null;
  }
}

async function writeCachedDictionary(version, text) {
  try {
    const cache = await caches.open('cl-boggle-dict');
    await cache.put(
      `boggle-dict-${version}`,
      new Response(text, { headers: { 'Content-Type': 'text/plain; charset=utf-8' } }),
    );
  } catch {
    // Cache API may be unavailable (private mode); memory cache still works.
  }
}

/** Fetch dictionary once (memory → Cache API → Storage URL). */
export async function ensureDictionary(dictionaryUrl, version = DICTIONARY_VERSION) {
  if (wordSet) return wordSet;
  if (!loadPromise) {
    loadPromise = (async () => {
      const cached = await readCachedDictionary(version);
      if (cached?.size) {
        wordSet = cached;
        return wordSet;
      }
      if (!dictionaryUrl) throw new Error('Dictionary URL missing.');
      const res = await fetch(dictionaryUrl, {
        credentials: dictionaryUrl.startsWith('/') || dictionaryUrl.includes(window.location.host)
          ? 'include'
          : 'omit',
      });
      if (!res.ok) throw new Error(`Failed to load dictionary (${res.status}).`);
      const text = await res.text();
      // Ignore JSON error payloads from auth/proxy failures.
      if (text.trim().startsWith('{')) {
        throw new Error('Dictionary endpoint returned an error. Try refreshing.');
      }
      wordSet = parseDictionaryText(text);
      if (!wordSet.size) throw new Error('Dictionary empty.');
      await writeCachedDictionary(version, text);
      return wordSet;
    })().catch((error) => {
      loadPromise = null;
      throw error;
    });
  }
  return loadPromise;
}

export function isDictionaryReady() {
  return Boolean(wordSet);
}

export function isDictionaryWord(word) {
  if (!wordSet) return false;
  return wordSet.has(normalizeWord(word));
}

export function validateLocalWord(grid, word, alreadyFound) {
  const normalized = normalizeWord(word);
  if (normalized.length < MIN_WORD_LENGTH) return { ok: false, reason: 'Words need at least 3 letters.' };
  if (alreadyFound?.has(normalized)) return { ok: false, reason: 'Already found.' };
  if (!wordSet) return { ok: false, reason: 'Dictionary still loading…' };
  if (!isDictionaryWord(normalized)) return { ok: false, reason: 'Not in dictionary.' };
  if (!wordOnBoard(grid, normalized)) return { ok: false, reason: 'Not on this board.' };
  return { ok: true, word: normalized, points: scoreWord(normalized) };
}

export function areAdjacent(a, b) {
  return Math.abs(a.r - b.r) <= 1 && Math.abs(a.c - b.c) <= 1 && !(a.r === b.r && a.c === b.c);
}

export function pathToWord(board, path) {
  if (!path?.length) return '';
  return path.map(({ r, c }) => normalizeWord(board[r][c])).join('');
}

export function localStorageKey(dayKey) {
  return `boggle-local:${dayKey}`;
}

export function loadLocalGame(dayKey) {
  try {
    const raw = localStorage.getItem(localStorageKey(dayKey));
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function saveLocalGame(dayKey, state) {
  try {
    localStorage.setItem(localStorageKey(dayKey), JSON.stringify(state));
  } catch {
    // ignore quota
  }
}

export function clearLocalGame(dayKey) {
  try {
    localStorage.removeItem(localStorageKey(dayKey));
  } catch {
    // ignore
  }
}
