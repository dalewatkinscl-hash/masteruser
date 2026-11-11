'use strict';

/**
 * Multiplayer 1v1 lobbies + game state (server-authoritative).
 * Games: connect4, reaction, rps, penalty, plainsight.
 */

const COLLECTION = 'multiplayer_matches';
const WAITING_TTL_MS = 5 * 60 * 1000;
const GAME_KEYS = ['connect4', 'reaction', 'rps', 'penalty', 'plainsight'];

const PLAINSIGHT = {
  worldW: 1000,
  worldH: 420,
  finishX: 72,
  startX: 900,
  hitR: 48,
  walk: 52,
  sprint: 96,
  countdownMs: 3500,
};

const GAME_META = {
  connect4: { label: 'Connect Four', description: 'Drop discs — get four in a row.' },
  reaction: { label: 'Reaction Duel', description: 'Wait for green — first valid click wins the round.' },
  rps: { label: 'Rock–Paper–Scissors', description: 'Best of 5. Lock in at the same time.' },
  penalty: { label: 'Penalty Kick', description: 'Best of 5. Aim or dive left, centre, or right.' },
  plainsight: {
    label: 'Plain Sight',
    description: 'Blend into the crowd and escape — or snipe the odd one out. One bullet.',
  },
};

function isGameKey(key) {
  return GAME_KEYS.includes(key);
}

function displayName(profile) {
  return profile.fullName || profile.email || 'Colleague';
}

function emptyConnect4Board() {
  return Array.from({ length: 6 }, () => Array(7).fill(0));
}

function initState(gameKey) {
  if (gameKey === 'connect4') {
    return {
      board: emptyConnect4Board(),
      turnUid: null,
      winnerUid: null,
      draw: false,
      lastCol: null,
    };
  }
  if (gameKey === 'reaction') {
    return {
      round: 1,
      maxRounds: 3,
      scores: {},
      phase: 'ready',
      ready: {},
      goAt: null,
      clicks: {},
      roundWinnerUid: null,
      falseStartUid: null,
      matchWinnerUid: null,
    };
  }
  if (gameKey === 'rps') {
    return {
      targetWins: 3,
      scores: {},
      phase: 'choose',
      choices: {},
      lastReveal: null,
      matchWinnerUid: null,
      point: 1,
    };
  }
  if (gameKey === 'penalty') {
    return {
      targetWins: 3,
      kick: 1,
      scores: {},
      phase: 'choose',
      takerUid: null,
      keeperUid: null,
      choices: {},
      lastReveal: null,
      matchWinnerUid: null,
    };
  }
  if (gameKey === 'plainsight') {
    return {
      phase: 'countdown',
      seed: 0,
      goAt: null,
      runnerUid: null,
      sniperUid: null,
      runner: { x: PLAINSIGHT.startX, y: 210, sprinting: false, updatedAt: 0 },
      bulletsLeft: 1,
      shot: null,
      matchWinnerUid: null,
      winReason: null,
      worldW: PLAINSIGHT.worldW,
      worldH: PLAINSIGHT.worldH,
      finishX: PLAINSIGHT.finishX,
    };
  }
  return {};
}

function startPlayingState(gameKey, hostUid, guestUid, state) {
  const next = { ...(state || initState(gameKey)) };
  if (gameKey === 'connect4') {
    next.turnUid = hostUid;
  } else if (gameKey === 'reaction') {
    next.scores = { [hostUid]: 0, [guestUid]: 0 };
    next.ready = { [hostUid]: false, [guestUid]: false };
    next.clicks = {};
    next.phase = 'ready';
  } else if (gameKey === 'rps') {
    next.scores = { [hostUid]: 0, [guestUid]: 0 };
    next.choices = {};
    next.phase = 'choose';
  } else if (gameKey === 'penalty') {
    next.scores = { [hostUid]: 0, [guestUid]: 0 };
    next.takerUid = hostUid;
    next.keeperUid = guestUid;
    next.choices = {};
    next.phase = 'choose';
  } else if (gameKey === 'plainsight') {
    // Random roles — fair coin flip from host/guest ids + time
    const flip = (String(hostUid).length + String(guestUid).length + Date.now()) % 2 === 0;
    next.runnerUid = flip ? hostUid : guestUid;
    next.sniperUid = flip ? guestUid : hostUid;
    next.seed = (Math.floor(Math.random() * 1e9) ^ Date.now()) >>> 0;
    next.goAt = Date.now() + PLAINSIGHT.countdownMs;
    next.phase = 'countdown';
    // Spawn somewhere in the right-side crowd band — different every match
    const spawnX = PLAINSIGHT.startX - 30 + Math.random() * 200;
    const spawnY = 70 + Math.random() * (PLAINSIGHT.worldH - 140);
    // Same outfit pool as NPCs (not a fixed “suspect blue”)
    const PALETTES = [
      { body: '#3b82f6', pants: '#1e3a5f' },
      { body: '#ef4444', pants: '#7f1d1d' },
      { body: '#22c55e', pants: '#14532d' },
      { body: '#a855f7', pants: '#4c1d95' },
      { body: '#f59e0b', pants: '#78350f' },
      { body: '#64748b', pants: '#1e293b' },
      { body: '#ec4899', pants: '#831843' },
      { body: '#14b8a6', pants: '#134e4a' },
      { body: '#eab308', pants: '#713f12' },
      { body: '#f97316', pants: '#7c2d12' },
      { body: '#06b6d4', pants: '#164e63' },
      { body: '#84cc16', pants: '#3f6212' },
    ];
    const palette = PALETTES[Math.floor(Math.random() * PALETTES.length)];
    const scale = 0.9 + Math.random() * 0.28;
    next.runner = {
      x: spawnX,
      y: spawnY,
      sprinting: false,
      moving: false,
      palette,
      scale,
      updatedAt: Date.now(),
    };
    next.runnerTrail = [{ x: spawnX, y: spawnY, at: Date.now() }];
    next.bulletsLeft = 1;
    next.shot = null;
    next.matchWinnerUid = null;
    next.winReason = null;
  }
  return next;
}

function sanitizeStateForClient(gameKey, state, uid) {
  const s = JSON.parse(JSON.stringify(state || {}));
  if ((gameKey === 'rps' || gameKey === 'penalty') && s.phase === 'choose' && s.choices) {
    const scrubbed = {};
    for (const [k, v] of Object.entries(s.choices)) {
      scrubbed[k] = k === uid ? v : 'locked';
    }
    s.choices = scrubbed;
  }
  if (gameKey === 'reaction' && s.phase === 'waiting') {
    s.clicks = {};
  }
  if (gameKey === 'plainsight') {
    delete s.runnerHighlight;
    delete s.runnerTrail; // server-only hit assist
  }
  return s;
}

function serializeMatch(raw, { uid = null, serverNow = Date.now() } = {}) {
  const data = raw && typeof raw.data === 'function' ? { id: raw.id, ...raw.data() } : { ...raw };
  return {
    id: data.id,
    gameKey: data.gameKey,
    status: data.status,
    hostUid: data.hostUid,
    hostName: data.hostName,
    guestUid: data.guestUid || null,
    guestName: data.guestName || null,
    winnerUid: data.winnerUid || null,
    createdAt: data.createdAt?.toDate?.()?.toISOString?.() || data.createdAt || null,
    updatedAt: data.updatedAt?.toDate?.()?.toISOString?.() || data.updatedAt || null,
    expiresAt: data.expiresAt || null,
    state: sanitizeStateForClient(data.gameKey, data.state || {}, uid),
    serverNow,
    youAreHost: uid ? uid === data.hostUid : false,
    youAreGuest: uid ? uid === data.guestUid : false,
    yourUid: uid || null,
  };
}

function dropConnect4(board, col, player) {
  if (col < 0 || col > 6) return null;
  for (let row = 5; row >= 0; row -= 1) {
    if (board[row][col] === 0) {
      const next = board.map((r) => r.slice());
      next[row][col] = player;
      return { board: next, row };
    }
  }
  return null;
}

function connect4Winner(board, player) {
  const dirs = [[0, 1], [1, 0], [1, 1], [1, -1]];
  for (let r = 0; r < 6; r += 1) {
    for (let c = 0; c < 7; c += 1) {
      if (board[r][c] !== player) continue;
      for (const [dr, dc] of dirs) {
        let n = 1;
        for (let k = 1; k < 4; k += 1) {
          const rr = r + dr * k;
          const cc = c + dc * k;
          if (rr < 0 || rr >= 6 || cc < 0 || cc >= 7 || board[rr][cc] !== player) break;
          n += 1;
        }
        if (n >= 4) return true;
      }
    }
  }
  return false;
}

function connect4Full(board) {
  return board[0].every((c) => c !== 0);
}

function rpsWinner(a, b) {
  if (a === b) return null;
  if (
    (a === 'rock' && b === 'scissors')
    || (a === 'scissors' && b === 'paper')
    || (a === 'paper' && b === 'rock')
  ) return 'a';
  return 'b';
}

function applyMove(match, uid, action, payload, now) {
  const gameKey = match.gameKey;
  const isHost = uid === match.hostUid;
  const isGuest = uid === match.guestUid;

  if (action === 'forfeit') {
    if (match.status === 'waiting') {
      return { status: 'abandoned', winnerUid: null, state: match.state || {} };
    }
    if (match.status !== 'playing') {
      const err = new Error('Cannot forfeit now.');
      err.status = 400;
      throw err;
    }
    if (!isHost && !isGuest) {
      const err = new Error('Not a player in this match.');
      err.status = 403;
      throw err;
    }
    const opponentUid = isHost ? match.guestUid : match.hostUid;
    return {
      status: 'finished',
      winnerUid: opponentUid,
      state: { ...(match.state || {}), matchWinnerUid: opponentUid, forfeitedBy: uid },
    };
  }

  if (match.status === 'finished' || match.status === 'abandoned') {
    const err = new Error('Match is over.');
    err.status = 400;
    throw err;
  }
  if (match.status !== 'playing') {
    const err = new Error('Match has not started.');
    err.status = 400;
    throw err;
  }
  if (!isHost && !isGuest) {
    const err = new Error('Not a player in this match.');
    err.status = 403;
    throw err;
  }

  const opponentUid = isHost ? match.guestUid : match.hostUid;
  const state = JSON.parse(JSON.stringify(match.state || {}));

  if (gameKey === 'connect4') {
    if (action !== 'drop') {
      const err = new Error('Unknown action.');
      err.status = 400;
      throw err;
    }
    if (state.turnUid !== uid) {
      const err = new Error('Not your turn.');
      err.status = 400;
      throw err;
    }
    const col = Number(payload?.col);
    if (!Number.isInteger(col)) {
      const err = new Error('Need a column.');
      err.status = 400;
      throw err;
    }
    const playerNum = isHost ? 1 : 2;
    const dropped = dropConnect4(state.board, col, playerNum);
    if (!dropped) {
      const err = new Error('Column full or invalid.');
      err.status = 400;
      throw err;
    }
    state.board = dropped.board;
    state.lastCol = col;
    if (connect4Winner(dropped.board, playerNum)) {
      state.winnerUid = uid;
      state.turnUid = null;
      return { status: 'finished', winnerUid: uid, state };
    }
    if (connect4Full(dropped.board)) {
      state.draw = true;
      state.turnUid = null;
      return { status: 'finished', winnerUid: null, state };
    }
    state.turnUid = opponentUid;
    return { status: 'playing', winnerUid: null, state };
  }

  if (gameKey === 'reaction') {
    if (action === 'ready') {
      if (state.phase === 'roundResult') {
        state.phase = 'ready';
        state.ready = { [match.hostUid]: false, [match.guestUid]: false };
        state.clicks = {};
        state.goAt = null;
        state.roundWinnerUid = null;
        state.falseStartUid = null;
      }
      if (state.phase !== 'ready') {
        const err = new Error('Cannot ready now.');
        err.status = 400;
        throw err;
      }
      state.ready = { ...(state.ready || {}), [uid]: true };
      if (state.ready[match.hostUid] && state.ready[match.guestUid]) {
        state.phase = 'waiting';
        state.goAt = now + 1500 + Math.floor(Math.random() * 3501);
        state.clicks = {};
      }
      return { status: 'playing', winnerUid: null, state };
    }
    if (action === 'click') {
      if (state.phase !== 'waiting') {
        const err = new Error('Not accepting clicks.');
        err.status = 400;
        throw err;
      }
      if (state.clicks?.[uid]) {
        return { status: 'playing', winnerUid: null, state };
      }
      const goAt = Number(state.goAt) || 0;
      state.clicks = { ...(state.clicks || {}), [uid]: now };
      if (now < goAt) {
        state.falseStartUid = uid;
        state.roundWinnerUid = opponentUid;
        state.scores = { ...state.scores, [opponentUid]: (state.scores[opponentUid] || 0) + 1 };
        state.phase = 'roundResult';
        if ((state.scores[opponentUid] || 0) >= 2) {
          state.phase = 'finished';
          state.matchWinnerUid = opponentUid;
          return { status: 'finished', winnerUid: opponentUid, state };
        }
        state.round = (state.round || 1) + 1;
        return { status: 'playing', winnerUid: null, state };
      }
      state.roundWinnerUid = uid;
      state.scores = { ...state.scores, [uid]: (state.scores[uid] || 0) + 1 };
      state.phase = 'roundResult';
      if ((state.scores[uid] || 0) >= 2) {
        state.phase = 'finished';
        state.matchWinnerUid = uid;
        return { status: 'finished', winnerUid: uid, state };
      }
      state.round = (state.round || 1) + 1;
      return { status: 'playing', winnerUid: null, state };
    }
    const err = new Error('Unknown action.');
    err.status = 400;
    throw err;
  }

  if (gameKey === 'rps') {
    if (action === 'continue') {
      if (state.phase !== 'reveal') {
        const err = new Error('Nothing to continue.');
        err.status = 400;
        throw err;
      }
      state.choices = {};
      state.phase = 'choose';
      state.point = (state.point || 1) + 1;
      return { status: 'playing', winnerUid: null, state };
    }
    if (action !== 'choose') {
      const err = new Error('Unknown action.');
      err.status = 400;
      throw err;
    }
    if (state.phase !== 'choose') {
      const err = new Error('Not choosing now.');
      err.status = 400;
      throw err;
    }
    const choice = String(payload?.choice || '');
    if (!['rock', 'paper', 'scissors'].includes(choice)) {
      const err = new Error('Pick rock, paper, or scissors.');
      err.status = 400;
      throw err;
    }
    if (state.choices?.[uid]) {
      return { status: 'playing', winnerUid: null, state };
    }
    state.choices = { ...(state.choices || {}), [uid]: choice };
    const hostC = state.choices[match.hostUid];
    const guestC = state.choices[match.guestUid];
    if (hostC && guestC) {
      const who = rpsWinner(hostC, guestC);
      let pointWinner = null;
      if (who === 'a') pointWinner = match.hostUid;
      else if (who === 'b') pointWinner = match.guestUid;
      state.lastReveal = {
        choices: { [match.hostUid]: hostC, [match.guestUid]: guestC },
        winnerUid: pointWinner,
      };
      if (pointWinner) {
        state.scores = { ...state.scores, [pointWinner]: (state.scores[pointWinner] || 0) + 1 };
        if ((state.scores[pointWinner] || 0) >= (state.targetWins || 3)) {
          state.phase = 'finished';
          state.matchWinnerUid = pointWinner;
          return { status: 'finished', winnerUid: pointWinner, state };
        }
      }
      state.phase = 'reveal';
    }
    return { status: 'playing', winnerUid: null, state };
  }

  if (gameKey === 'penalty') {
    if (action === 'continue') {
      if (state.phase !== 'reveal') {
        const err = new Error('Nothing to continue.');
        err.status = 400;
        throw err;
      }
      const prevTaker = state.takerUid;
      state.takerUid = state.keeperUid;
      state.keeperUid = prevTaker;
      state.kick = (state.kick || 1) + 1;
      state.choices = {};
      state.phase = 'choose';
      state.lastReveal = null;
      return { status: 'playing', winnerUid: null, state };
    }
    if (action !== 'choose') {
      const err = new Error('Unknown action.');
      err.status = 400;
      throw err;
    }
    if (state.phase !== 'choose') {
      const err = new Error('Not choosing now.');
      err.status = 400;
      throw err;
    }
    const dir = String(payload?.dir || '');
    if (!['L', 'C', 'R'].includes(dir)) {
      const err = new Error('Pick L, C, or R.');
      err.status = 400;
      throw err;
    }
    if (state.choices?.[uid]) {
      return { status: 'playing', winnerUid: null, state };
    }
    state.choices = { ...(state.choices || {}), [uid]: dir };
    const taker = state.takerUid;
    const keeper = state.keeperUid;
    const tChoice = state.choices[taker];
    const kChoice = state.choices[keeper];
    if (tChoice && kChoice) {
      const goal = tChoice !== kChoice;
      const pointWinner = goal ? taker : keeper;
      state.lastReveal = {
        takerDir: tChoice,
        keeperDir: kChoice,
        goal,
        winnerUid: pointWinner,
      };
      state.scores = { ...state.scores, [pointWinner]: (state.scores[pointWinner] || 0) + 1 };
      if ((state.scores[pointWinner] || 0) >= (state.targetWins || 3)) {
        state.phase = 'finished';
        state.matchWinnerUid = pointWinner;
        return { status: 'finished', winnerUid: pointWinner, state };
      }
      state.phase = 'reveal';
    }
    return { status: 'playing', winnerUid: null, state };
  }

  if (gameKey === 'plainsight') {
    if (state.phase === 'countdown' && state.goAt && now >= state.goAt) {
      state.phase = 'playing';
      state.runner = {
        ...(state.runner || {}),
        updatedAt: now,
      };
    }

    if (action === 'tick') {
      // Soft advance countdown → playing for pollers
      if (state.phase === 'countdown' && state.goAt && now >= state.goAt) {
        state.phase = 'playing';
      }
      return { status: 'playing', winnerUid: null, state };
    }

    if (action === 'move') {
      if (uid !== state.runnerUid) {
        const err = new Error('Only the runner can move.');
        err.status = 403;
        throw err;
      }
      if (state.phase === 'countdown') {
        if (state.goAt && now >= state.goAt) state.phase = 'playing';
        else {
          const err = new Error('Still in countdown.');
          err.status = 400;
          throw err;
        }
      }
      if (state.phase !== 'playing') {
        const err = new Error('Match not in play.');
        err.status = 400;
        throw err;
      }
      const sprinting = Boolean(payload?.sprinting);
      const wantX = Number(payload?.x);
      const wantY = Number(payload?.y);
      if (!Number.isFinite(wantX) || !Number.isFinite(wantY)) {
        const err = new Error('Need position.');
        err.status = 400;
        throw err;
      }
      const prev = state.runner || { x: PLAINSIGHT.startX, y: 210, updatedAt: now };
      const dt = Math.max(0, Math.min(0.8, (now - (prev.updatedAt || now)) / 1000));
      const maxSpeed = (sprinting ? PLAINSIGHT.sprint : PLAINSIGHT.walk) * 1.35;
      const maxDist = Math.max(16, maxSpeed * Math.max(dt, 0.12));
      let dx = wantX - prev.x;
      let dy = wantY - prev.y;
      // Must generally move left (negative x)
      if (dx > 2) dx = 2;
      const dist = Math.hypot(dx, dy);
      if (dist > maxDist && dist > 0) {
        dx = (dx / dist) * maxDist;
        dy = (dy / dist) * maxDist;
      }
      const moving = Math.hypot(dx, dy) > 0.5 || sprinting;
      const x = Math.max(PLAINSIGHT.finishX - 10, Math.min(PLAINSIGHT.worldW - 20, prev.x + dx));
      const y = Math.max(50, Math.min(PLAINSIGHT.worldH - 50, prev.y + dy));
      state.runner = {
        ...prev,
        x,
        y,
        sprinting,
        moving,
        updatedAt: now,
      };
      const trail = Array.isArray(state.runnerTrail) ? state.runnerTrail.slice() : [];
      trail.push({ x, y, at: now });
      state.runnerTrail = trail.filter((p) => now - p.at < 1200).slice(-16);
      if (x <= PLAINSIGHT.finishX) {
        state.phase = 'finished';
        state.matchWinnerUid = state.runnerUid;
        state.winReason = 'escaped';
        return { status: 'finished', winnerUid: state.runnerUid, state };
      }
      return { status: 'playing', winnerUid: null, state };
    }

    if (action === 'shoot') {
      if (uid !== state.sniperUid) {
        const err = new Error('Only the sniper can shoot.');
        err.status = 403;
        throw err;
      }
      if (state.phase === 'countdown') {
        if (state.goAt && now >= state.goAt) state.phase = 'playing';
        else {
          const err = new Error('Still in countdown.');
          err.status = 400;
          throw err;
        }
      }
      if (state.phase !== 'playing') {
        const err = new Error('Match not in play.');
        err.status = 400;
        throw err;
      }
      if ((state.bulletsLeft || 0) < 1) {
        const err = new Error('No bullets left.');
        err.status = 400;
        throw err;
      }
      const sx = Number(payload?.x);
      const sy = Number(payload?.y);
      if (!Number.isFinite(sx) || !Number.isFinite(sy)) {
        const err = new Error('Need aim point.');
        err.status = 400;
        throw err;
      }
      const runner = state.runner || { x: 0, y: 0 };
      const samples = [
        runner,
        ...(Array.isArray(state.runnerTrail) ? state.runnerTrail : []),
      ];
      let hitDist = Infinity;
      for (const p of samples) {
        const d = Math.hypot(sx - Number(p.x), sy - Number(p.y));
        if (d < hitDist) hitDist = d;
      }
      const hit = hitDist <= PLAINSIGHT.hitR;
      state.bulletsLeft = 0;
      state.shot = {
        x: sx,
        y: sy,
        hit,
        hitDist,
        at: now,
        byUid: uid,
      };
      if (hit) {
        state.phase = 'finished';
        state.matchWinnerUid = state.sniperUid;
        state.winReason = 'sniped';
        return { status: 'finished', winnerUid: state.sniperUid, state };
      }
      // Miss / hit an NPC — walker is still alive!
      // Sniper is out of bullets (bulletsLeft: 0). The walker can now walk or sprint to the finish line to win.
      return { status: 'playing', winnerUid: null, state };
    }

    const err = new Error('Unknown action.');
    err.status = 400;
    throw err;
  }

  const err = new Error('Unknown game.');
  err.status = 400;
  throw err;
}

function createMultiplayerHandlers({ db, admin, onRequest, withCors, getVerifiedSessionUser }) {
  const FieldValue = admin.firestore.FieldValue;

  async function loadMatch(matchId) {
    const ref = db.collection(COLLECTION).doc(matchId);
    const snap = await ref.get();
    if (!snap.exists) return null;
    return { ref, id: snap.id, data: { id: snap.id, ...snap.data() } };
  }

  async function abandonStaleWaiting(gameKey) {
    const now = Date.now();
    // Single-field query avoids a composite index; filter gameKey in memory.
    const snap = await db.collection(COLLECTION)
      .where('status', '==', 'waiting')
      .limit(60)
      .get();
    const batch = db.batch();
    let n = 0;
    snap.docs.forEach((doc) => {
      const data = doc.data() || {};
      if (gameKey && data.gameKey !== gameKey) return;
      const expiresAt = Number(data.expiresAt) || 0;
      if (expiresAt && expiresAt < now) {
        batch.update(doc.ref, {
          status: 'abandoned',
          updatedAt: FieldValue.serverTimestamp(),
        });
        n += 1;
      }
    });
    if (n) await batch.commit();
  }

  const listMultiplayerGames = onRequest(
    { region: 'europe-west2' },
    withCors(async (req, res) => {
      if (req.method !== 'GET') {
        res.status(405).json({ error: 'Method not allowed.' });
        return;
      }
      const session = await getVerifiedSessionUser(req);
      if (!session) {
        res.status(401).json({ error: 'Authentication required.' });
        return;
      }
      const now = Date.now();
      const snap = await db.collection(COLLECTION)
        .where('status', '==', 'waiting')
        .limit(80)
        .get();
      const openCounts = Object.fromEntries(GAME_KEYS.map((k) => [k, 0]));
      snap.docs.forEach((doc) => {
        const data = doc.data() || {};
        if (!isGameKey(data.gameKey)) return;
        if (data.expiresAt && data.expiresAt < now) return;
        // Don't count your own waiting lobby as a joinable seat highlight
        if (data.hostUid === session.profile.uid) return;
        openCounts[data.gameKey] += 1;
      });
      res.status(200).json({
        games: GAME_KEYS.map((k) => ({
          key: k,
          ...GAME_META[k],
          openLobbies: openCounts[k] || 0,
        })),
        openCounts,
        serverNow: now,
      });
    }),
  );

  const listMultiplayerLobbies = onRequest(
    { region: 'europe-west2' },
    withCors(async (req, res) => {
      if (req.method !== 'GET') {
        res.status(405).json({ error: 'Method not allowed.' });
        return;
      }
      const session = await getVerifiedSessionUser(req);
      if (!session) {
        res.status(401).json({ error: 'Authentication required.' });
        return;
      }
      const gameKey = String(req.query?.gameKey || '');
      if (!isGameKey(gameKey)) {
        res.status(400).json({ error: 'Unknown game.' });
        return;
      }
      await abandonStaleWaiting(gameKey);
      const snap = await db.collection(COLLECTION)
        .where('status', '==', 'waiting')
        .limit(60)
        .get();
      const now = Date.now();
      const lobbies = snap.docs
        .map((doc) => serializeMatch(doc, { uid: session.profile.uid, serverNow: now }))
        .filter((m) => m.gameKey === gameKey && (!m.expiresAt || m.expiresAt > now))
        .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')))
        .slice(0, 30);

      res.status(200).json({
        gameKey,
        meta: GAME_META[gameKey],
        lobbies,
        serverNow: now,
      });
    }),
  );

  const createMultiplayerMatch = onRequest(
    { region: 'europe-west2' },
    withCors(async (req, res) => {
      if (req.method !== 'POST') {
        res.status(405).json({ error: 'Method not allowed.' });
        return;
      }
      const session = await getVerifiedSessionUser(req);
      if (!session) {
        res.status(401).json({ error: 'Authentication required.' });
        return;
      }
      const gameKey = String(req.body?.gameKey || '');
      if (!isGameKey(gameKey)) {
        res.status(400).json({ error: 'Unknown game.' });
        return;
      }
      const now = Date.now();
      const ref = db.collection(COLLECTION).doc();
      await ref.set({
        gameKey,
        status: 'waiting',
        hostUid: session.profile.uid,
        hostName: displayName(session.profile),
        guestUid: null,
        guestName: null,
        winnerUid: null,
        state: initState(gameKey),
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
        expiresAt: now + WAITING_TTL_MS,
      });
      const snap = await ref.get();
      res.status(200).json({
        match: serializeMatch(snap, { uid: session.profile.uid, serverNow: now }),
      });
    }),
  );

  const joinMultiplayerMatch = onRequest(
    { region: 'europe-west2' },
    withCors(async (req, res) => {
      if (req.method !== 'POST') {
        res.status(405).json({ error: 'Method not allowed.' });
        return;
      }
      const session = await getVerifiedSessionUser(req);
      if (!session) {
        res.status(401).json({ error: 'Authentication required.' });
        return;
      }
      const matchId = String(req.body?.matchId || '');
      if (!matchId) {
        res.status(400).json({ error: 'Need matchId.' });
        return;
      }
      const loaded = await loadMatch(matchId);
      if (!loaded) {
        res.status(404).json({ error: 'Match not found.' });
        return;
      }
      const { ref } = loaded;
      try {
        const result = await db.runTransaction(async (tx) => {
          const fresh = await tx.get(ref);
          if (!fresh.exists) {
            const err = new Error('Match not found.');
            err.status = 404;
            throw err;
          }
          const m = { id: fresh.id, ...fresh.data() };
          if (m.hostUid === session.profile.uid) {
            const err = new Error('You are already the host.');
            err.status = 400;
            throw err;
          }
          if (m.status !== 'waiting') {
            const err = new Error('This seat is no longer open.');
            err.status = 400;
            throw err;
          }
          if (m.expiresAt && m.expiresAt < Date.now()) {
            tx.update(ref, { status: 'abandoned', updatedAt: FieldValue.serverTimestamp() });
            const err = new Error('Lobby expired.');
            err.status = 400;
            throw err;
          }
          const state = startPlayingState(
            m.gameKey,
            m.hostUid,
            session.profile.uid,
            m.state || initState(m.gameKey),
          );
          const patch = {
            status: 'playing',
            guestUid: session.profile.uid,
            guestName: displayName(session.profile),
            state,
            updatedAt: FieldValue.serverTimestamp(),
            expiresAt: null,
          };
          tx.update(ref, patch);
          return { ...m, ...patch };
        });
        const now = Date.now();
        res.status(200).json({
          match: serializeMatch(result, { uid: session.profile.uid, serverNow: now }),
        });
      } catch (error) {
        res.status(error.status || 500).json({ error: error.message || 'Join failed.' });
      }
    }),
  );

  const leaveMultiplayerMatch = onRequest(
    { region: 'europe-west2' },
    withCors(async (req, res) => {
      if (req.method !== 'POST') {
        res.status(405).json({ error: 'Method not allowed.' });
        return;
      }
      const session = await getVerifiedSessionUser(req);
      if (!session) {
        res.status(401).json({ error: 'Authentication required.' });
        return;
      }
      const matchId = String(req.body?.matchId || '');
      const loaded = await loadMatch(matchId);
      if (!loaded) {
        res.status(404).json({ error: 'Match not found.' });
        return;
      }
      const { ref, data } = loaded;
      const uid = session.profile.uid;
      if (uid !== data.hostUid && uid !== data.guestUid) {
        res.status(403).json({ error: 'Not a player in this match.' });
        return;
      }
      const now = Date.now();
      if (data.status === 'waiting') {
        await ref.update({ status: 'abandoned', updatedAt: FieldValue.serverTimestamp() });
        res.status(200).json({ ok: true, abandoned: true });
        return;
      }
      if (data.status === 'playing') {
        const result = applyMove(data, uid, 'forfeit', {}, now);
        await ref.update({
          status: result.status,
          winnerUid: result.winnerUid,
          state: result.state,
          updatedAt: FieldValue.serverTimestamp(),
        });
        const snap = await ref.get();
        res.status(200).json({
          match: serializeMatch(snap, { uid, serverNow: now }),
        });
        return;
      }
      res.status(200).json({ ok: true });
    }),
  );

  const getMultiplayerMatch = onRequest(
    { region: 'europe-west2' },
    withCors(async (req, res) => {
      if (req.method !== 'GET') {
        res.status(405).json({ error: 'Method not allowed.' });
        return;
      }
      const session = await getVerifiedSessionUser(req);
      if (!session) {
        res.status(401).json({ error: 'Authentication required.' });
        return;
      }
      const matchId = String(req.query?.matchId || '');
      const loaded = await loadMatch(matchId);
      if (!loaded) {
        res.status(404).json({ error: 'Match not found.' });
        return;
      }
      const uid = session.profile.uid;
      if (
        uid !== loaded.data.hostUid
        && uid !== loaded.data.guestUid
        && loaded.data.status !== 'waiting'
      ) {
        res.status(403).json({ error: 'Not a player in this match.' });
        return;
      }
      const now = Date.now();
      res.status(200).json({
        match: serializeMatch(loaded.data, { uid, serverNow: now }),
      });
    }),
  );

  const multiplayerMove = onRequest(
    { region: 'europe-west2' },
    withCors(async (req, res) => {
      if (req.method !== 'POST') {
        res.status(405).json({ error: 'Method not allowed.' });
        return;
      }
      const session = await getVerifiedSessionUser(req);
      if (!session) {
        res.status(401).json({ error: 'Authentication required.' });
        return;
      }
      const matchId = String(req.body?.matchId || '');
      const action = String(req.body?.action || '');
      const payload = req.body?.payload || {};
      if (!matchId || !action) {
        res.status(400).json({ error: 'Need matchId and action.' });
        return;
      }
      const now = Date.now();
      try {
        const result = await db.runTransaction(async (tx) => {
          const ref = db.collection(COLLECTION).doc(matchId);
          const snap = await tx.get(ref);
          if (!snap.exists) {
            const err = new Error('Match not found.');
            err.status = 404;
            throw err;
          }
          const data = { id: snap.id, ...snap.data() };
          const applied = applyMove(data, session.profile.uid, action, payload, now);
          tx.update(ref, {
            status: applied.status,
            winnerUid: applied.winnerUid,
            state: applied.state,
            updatedAt: FieldValue.serverTimestamp(),
          });
          return { ...data, ...applied };
        });
        res.status(200).json({
          match: serializeMatch(result, { uid: session.profile.uid, serverNow: now }),
        });
      } catch (error) {
        res.status(error.status || 500).json({ error: error.message || 'Move failed.' });
      }
    }),
  );

  return {
    listMultiplayerGames,
    listMultiplayerLobbies,
    createMultiplayerMatch,
    joinMultiplayerMatch,
    leaveMultiplayerMatch,
    getMultiplayerMatch,
    multiplayerMove,
  };
}

module.exports = {
  COLLECTION,
  GAME_KEYS,
  GAME_META,
  isGameKey,
  initState,
  startPlayingState,
  serializeMatch,
  applyMove,
  createMultiplayerHandlers,
};
