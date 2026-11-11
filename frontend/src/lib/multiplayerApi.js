const GAMES = [
  { key: 'connect4', label: 'Connect Four', description: 'Drop discs — get four in a row.' },
  { key: 'reaction', label: 'Reaction Duel', description: 'Wait for green — first valid click wins the round.' },
  { key: 'rps', label: 'Rock–Paper–Scissors', description: 'Best of 5. Lock in at the same time.' },
  { key: 'penalty', label: 'Penalty Kick', description: 'Best of 5. Aim or dive left, centre, or right.' },
  {
    key: 'plainsight',
    label: 'Plain Sight',
    description: 'Blend into the crowd and escape — or snipe the odd one out. One bullet.',
  },
];

async function readJson(res) {
  try {
    return await res.json();
  } catch {
    return {};
  }
}

export function listLocalGames() {
  return GAMES;
}

export function firstName(fullName) {
  const raw = String(fullName || '').trim();
  if (!raw) return 'Opponent';
  return raw.split(/\s+/)[0];
}

export async function listGames() {
  const response = await fetch('/api/listMultiplayerGames', { credentials: 'include' });
  const payload = await readJson(response);
  if (!response.ok) throw new Error(payload.error || 'Failed to load games.');
  return payload;
}

export async function listLobbies(gameKey) {
  const response = await fetch(`/api/listMultiplayerLobbies?gameKey=${encodeURIComponent(gameKey)}`, {
    credentials: 'include',
  });
  const payload = await readJson(response);
  if (!response.ok) throw new Error(payload.error || 'Failed to load lobbies.');
  return payload;
}

export async function createMatch(gameKey) {
  const response = await fetch('/api/createMultiplayerMatch', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ gameKey }),
  });
  const payload = await readJson(response);
  if (!response.ok) throw new Error(payload.error || 'Failed to create match.');
  return payload.match;
}

export async function joinMatch(matchId) {
  const response = await fetch('/api/joinMultiplayerMatch', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ matchId }),
  });
  const payload = await readJson(response);
  if (!response.ok) throw new Error(payload.error || 'Failed to join.');
  return payload.match;
}

export async function leaveMatch(matchId) {
  const response = await fetch('/api/leaveMultiplayerMatch', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ matchId }),
  });
  const payload = await readJson(response);
  if (!response.ok) throw new Error(payload.error || 'Failed to leave.');
  return payload;
}

export async function getMatch(matchId) {
  const response = await fetch(`/api/getMultiplayerMatch?matchId=${encodeURIComponent(matchId)}`, {
    credentials: 'include',
  });
  const payload = await readJson(response);
  if (!response.ok) throw new Error(payload.error || 'Failed to load match.');
  return payload.match;
}

export async function sendMove(matchId, action, payload = {}) {
  const response = await fetch('/api/multiplayerMove', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ matchId, action, payload }),
  });
  const body = await readJson(response);
  if (!response.ok) throw new Error(body.error || 'Move failed.');
  return body.match;
}

export function opponentName(match) {
  if (!match) return 'Opponent';
  if (match.youAreHost) return match.guestName || 'Opponent';
  return match.hostName || 'Opponent';
}

export function playerName(match, uid) {
  if (!match || !uid) return 'Player';
  if (uid === match.hostUid) return match.hostName || 'Host';
  if (uid === match.guestUid) return match.guestName || 'Guest';
  return 'Player';
}
