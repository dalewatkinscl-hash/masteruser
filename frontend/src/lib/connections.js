/**
 * Client-side Connections helpers — check groups via SHA-256 hashes (no solution spoilers).
 */

export const MAX_MISTAKES = 4;
export const GROUP_SIZE = 4;

export function formatDuration(ms) {
  if (!Number.isFinite(ms) || ms < 0) return '—';
  const totalSeconds = Math.round(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

export function normalizeWord(word) {
  return String(word || '').trim().toUpperCase().replace(/[^A-Z]/g, '');
}

export function groupKey(words) {
  return [...words].map(normalizeWord).filter(Boolean).sort().join('|');
}

export async function groupHash(words) {
  const key = groupKey(words);
  const data = new TextEncoder().encode(key);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export async function matchGroup(groups, words) {
  const hash = await groupHash(words);
  return (groups || []).find((g) => g.hash === hash) || null;
}

export function localStorageKey(dayKey) {
  return `connections-local:${dayKey}`;
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
    // ignore
  }
}

export function clearLocalGame(dayKey) {
  try {
    localStorage.removeItem(localStorageKey(dayKey));
  } catch {
    // ignore
  }
}
