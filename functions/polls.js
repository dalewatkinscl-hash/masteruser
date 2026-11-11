'use strict';

const WORLD_CUP_COLLECTION = 'world_cups';
const POLL_VOTES_COLLECTION = 'poll_votes';
const CONFIRMATION_HOUR_LONDON = 17;
const CONFIRMATION_TIME_LABEL = '17:00';

const ROUND_DEFS = [
  { round: 1, name: 'Round of 32', shortName: 'R32', matchCount: 16, startMatch: 1, endMatch: 16 },
  { round: 2, name: 'Round of 16', shortName: 'R16', matchCount: 8, startMatch: 17, endMatch: 24 },
  { round: 3, name: 'Quarter-Finals', shortName: 'QF', matchCount: 4, startMatch: 25, endMatch: 28 },
  { round: 4, name: 'Semi-Finals', shortName: 'SF', matchCount: 2, startMatch: 29, endMatch: 30 },
  { round: 5, name: 'Grand Final', shortName: 'Final', matchCount: 1, startMatch: 31, endMatch: 31 },
];

function normalizeAnswerKey(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .slice(0, 80);
}

function displayAnswer(value) {
  return String(value || '')
    .trim()
    .replace(/\s+/g, ' ')
    .slice(0, 80);
}

function canManagePolls(profile, canManagePortalAccess, canViewAllEmployeeProfiles, getEffectivePortalRole) {
  return canManagePortalAccess(profile)
    || canViewAllEmployeeProfiles(profile, getEffectivePortalRole);
}

const WORLD_CUP_OWNER_UIDS = new Set([
  'R42J0IYo6OR9QvVEXcyVYCpZ8EF3', // Dale Watkins
]);
const WORLD_CUP_OWNER_EMAILS = new Set([
  'dalewatkins@countrylion.co.uk',
]);

function isWorldCupOwner(profile) {
  if (!profile) return false;
  const uid = String(profile.uid || '').trim();
  const email = String(profile.email || profile.workEmail || '').trim().toLowerCase();
  return WORLD_CUP_OWNER_UIDS.has(uid) || WORLD_CUP_OWNER_EMAILS.has(email);
}

function shiftDayKey(dayKey, deltaDays) {
  if (!dayKey || !/^\d{4}-\d{2}-\d{2}$/.test(String(dayKey))) return null;
  const [year, month, day] = String(dayKey).split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day, 12));
  date.setUTCDate(date.getUTCDate() + Number(deltaDays || 0));
  return date.toISOString().slice(0, 10);
}

function getDayOfWeekUtc(dayKey) {
  if (!dayKey || !/^\d{4}-\d{2}-\d{2}$/.test(String(dayKey))) return null;
  const [year, month, day] = String(dayKey).split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day, 12)).getUTCDay();
}

function isWeekendDayKey(dayKey) {
  const dow = getDayOfWeekUtc(dayKey);
  return dow === 0 || dow === 6;
}

/**
 * If `dayKey` falls on Saturday (6) or Sunday (0), advances it to the following Monday.
 */
function ensureWeekdayDayKey(dayKey) {
  if (!dayKey || !/^\d{4}-\d{2}-\d{2}$/.test(String(dayKey))) return null;
  const dow = getDayOfWeekUtc(dayKey);
  if (dow === 6) return shiftDayKey(dayKey, 2);
  if (dow === 0) return shiftDayKey(dayKey, 1);
  return String(dayKey);
}

/**
 * Advances `startDayKey` by `deltaWeekdays` business days (Monday–Friday), skipping Saturdays and Sundays.
 */
function shiftWeekdays(startDayKey, deltaWeekdays) {
  let cursor = ensureWeekdayDayKey(startDayKey);
  if (!cursor) return null;
  let remaining = Math.max(0, Math.floor(Number(deltaWeekdays) || 0));
  while (remaining > 0) {
    cursor = ensureWeekdayDayKey(shiftDayKey(cursor, 1));
    remaining -= 1;
  }
  return cursor;
}

function getLondonTimeParts(date = new Date()) {
  const formatter = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/London',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  });
  const parts = {};
  formatter.formatToParts(date).forEach((part) => {
    parts[part.type] = part.value;
  });
  const dayKey = `${parts.year}-${parts.month}-${parts.day}`;
  const hour = Number(parts.hour || 0);
  const minute = Number(parts.minute || 0);
  const second = Number(parts.second || 0);
  const isPast1700 = hour >= CONFIRMATION_HOUR_LONDON;
  return {
    dayKey,
    hour,
    minute,
    second,
    isPast1700,
    isWeekend: isWeekendDayKey(dayKey),
  };
}

/**
 * Returns the YYYY-MM-DD weekday (Mon–Fri) on which the next 17:00 Europe/London confirmation occurs.
 * - On Saturday/Sunday: returns Monday (`ensureWeekdayDayKey(londonNow.dayKey)`).
 * - Before 17:00 on a weekday: confirms today at 17:00 (`londonNow.dayKey`).
 * - At or after 17:00 on a weekday: confirms on the next weekday at 17:00 (e.g. Friday 17:00+ -> Monday).
 */
function getNextConfirmationDayKey(londonNow = getLondonTimeParts()) {
  const effectiveNow = (londonNow && londonNow.dayKey) ? londonNow : getLondonTimeParts();
  if (isWeekendDayKey(effectiveNow.dayKey)) {
    return ensureWeekdayDayKey(effectiveNow.dayKey);
  }
  const candidate = effectiveNow.isPast1700
    ? shiftDayKey(effectiveNow.dayKey, 1)
    : effectiveNow.dayKey;
  return ensureWeekdayDayKey(candidate);
}

/**
 * Checks whether an open match has reached its 17:00 Europe/London weekday confirmation cutoff.
 */
function isMatchConfirmationDue(matchDayKey, londonNow = getLondonTimeParts()) {
  if (!matchDayKey || !londonNow?.dayKey) return false;
  const targetDay = ensureWeekdayDayKey(matchDayKey);
  if (!targetDay) return false;
  const currentDay = String(londonNow.dayKey);
  if (currentDay > targetDay) return true;
  if (currentDay === targetDay && londonNow.isPast1700) return true;
  return false;
}

function aggregatePollResults(poll, votes) {
  const type = poll.type || 'ab';

  if (type === 'ab') {
    const optionA = poll.optionA || 'A';
    const optionB = poll.optionB || 'B';
    const votersA = [];
    const votersB = [];
    votes.forEach((vote) => {
      const baseName = vote.fullName || vote.email || 'Colleague';
      const name = vote.isTiebreaker ? `${baseName} (⚡ Tie-breaker)` : baseName;
      if (vote.optionKey === 'a') votersA.push(name);
      if (vote.optionKey === 'b') votersB.push(name);
    });
    votersA.sort((left, right) => left.localeCompare(right));
    votersB.sort((left, right) => left.localeCompare(right));
    const a = votersA.length;
    const b = votersB.length;
    const total = a + b;
    return {
      type: 'ab',
      totalVotes: total,
      options: [
        {
          key: 'a',
          label: optionA,
          imageUrl: poll.imageA || null,
          votes: a,
          percent: total ? Math.round((a / total) * 100) : 0,
          voters: votersA,
        },
        {
          key: 'b',
          label: optionB,
          imageUrl: poll.imageB || null,
          votes: b,
          percent: total ? Math.round((b / total) * 100) : 0,
          voters: votersB,
        },
      ],
    };
  }

  const counts = new Map();
  votes.forEach((vote) => {
    const key = vote.optionKey || normalizeAnswerKey(vote.optionLabel);
    if (!key) return;
    const existing = counts.get(key) || {
      key,
      label: vote.optionLabel || key,
      votes: 0,
      voters: [],
    };
    existing.votes += 1;
    existing.voters.push(vote.fullName || vote.email || 'Colleague');
    if (!existing.label && vote.optionLabel) existing.label = vote.optionLabel;
    counts.set(key, existing);
  });

  const ranked = [...counts.values()]
    .map((row) => ({
      ...row,
      voters: [...row.voters].sort((left, right) => left.localeCompare(right)),
    }))
    .sort((left, right) => {
      if (right.votes !== left.votes) return right.votes - left.votes;
      return String(left.label).localeCompare(String(right.label));
    });

  const total = votes.length;
  return {
    type: 'text',
    totalVotes: total,
    topAnswers: ranked.slice(0, 5).map((row) => ({
      key: row.key,
      label: row.label,
      votes: row.votes,
      percent: total ? Math.round((row.votes / total) * 100) : 0,
      voters: row.voters,
    })),
    allAnswers: ranked.map((row) => ({
      key: row.key,
      label: row.label,
      votes: row.votes,
      percent: total ? Math.round((row.votes / total) * 100) : 0,
      voters: row.voters,
    })),
    options: ranked.map((row) => ({
      key: row.key,
      label: row.label,
      votes: row.votes,
      percent: total ? Math.round((row.votes / total) * 100) : 0,
      voters: row.voters,
    })),
  };
}

function sanitizeContenderItem(raw, index) {
  const seed = index + 1;
  const name = displayAnswer(raw?.name || `Contender #${seed}`) || `Contender #${seed}`;
  const imageUrl = String(raw?.imageUrl || '').trim().slice(0, 250000);
  return {
    id: `item_${seed}`,
    seed,
    name,
    imageUrl: imageUrl || '',
  };
}

function buildInitialMatches(items, startDayKey) {
  if (!Array.isArray(items) || items.length !== 32) {
    throw new Error('Exactly 32 contenders are required for a World Cup tournament.');
  }
  const normalizedItems = items.map((item, idx) => sanitizeContenderItem(item, idx));
  const initialConfirmDayKey = getNextConfirmationDayKey(getLondonTimeParts()) || startDayKey;
  const matches = [];

  // Round 1: Round of 32 (Matches 1..16)
  for (let i = 0; i < 16; i += 1) {
    const matchNumber = i + 1;
    const slotA = normalizedItems[i * 2];
    const slotB = normalizedItems[i * 2 + 1];
    matches.push({
      matchNumber,
      round: 1,
      roundName: 'Round of 32',
      shortRound: 'R32',
      roundMatchIndex: i,
      status: matchNumber === 1 ? 'open' : 'upcoming',
      dayKey: matchNumber === 1 ? initialConfirmDayKey : null,
      slotA,
      slotB,
      sourceMatchA: null,
      sourceMatchB: null,
      nextMatchNumber: 17 + Math.floor(i / 2),
      nextMatchSlot: i % 2 === 0 ? 'a' : 'b',
      votesA: 0,
      votesB: 0,
      votersA: [],
      votersB: [],
      tiebreaker: false,
      tiebreakerTiedScore: null,
      tiebreakerStartedAt: null,
      tiebreakerWinnerKey: null,
      tiebreakerVotedBy: null,
      winnerKey: null,
      winner: null,
      completedAt: null,
    });
  }

  // Round 2: Round of 16 (Matches 17..24)
  for (let i = 0; i < 8; i += 1) {
    const matchNumber = 17 + i;
    matches.push({
      matchNumber,
      round: 2,
      roundName: 'Round of 16',
      shortRound: 'R16',
      roundMatchIndex: i,
      status: 'upcoming',
      dayKey: null,
      slotA: null,
      slotB: null,
      sourceMatchA: 1 + i * 2,
      sourceMatchB: 2 + i * 2,
      nextMatchNumber: 25 + Math.floor(i / 2),
      nextMatchSlot: i % 2 === 0 ? 'a' : 'b',
      votesA: 0,
      votesB: 0,
      votersA: [],
      votersB: [],
      tiebreaker: false,
      tiebreakerTiedScore: null,
      tiebreakerStartedAt: null,
      tiebreakerWinnerKey: null,
      tiebreakerVotedBy: null,
      winnerKey: null,
      winner: null,
      completedAt: null,
    });
  }

  // Round 3: Quarter-Finals (Matches 25..28)
  for (let i = 0; i < 4; i += 1) {
    const matchNumber = 25 + i;
    matches.push({
      matchNumber,
      round: 3,
      roundName: 'Quarter-Finals',
      shortRound: 'QF',
      roundMatchIndex: i,
      status: 'upcoming',
      dayKey: null,
      slotA: null,
      slotB: null,
      sourceMatchA: 17 + i * 2,
      sourceMatchB: 18 + i * 2,
      nextMatchNumber: 29 + Math.floor(i / 2),
      nextMatchSlot: i % 2 === 0 ? 'a' : 'b',
      votesA: 0,
      votesB: 0,
      votersA: [],
      votersB: [],
      tiebreaker: false,
      tiebreakerTiedScore: null,
      tiebreakerStartedAt: null,
      tiebreakerWinnerKey: null,
      tiebreakerVotedBy: null,
      winnerKey: null,
      winner: null,
      completedAt: null,
    });
  }

  // Round 4: Semi-Finals (Matches 29..30)
  for (let i = 0; i < 2; i += 1) {
    const matchNumber = 29 + i;
    matches.push({
      matchNumber,
      round: 4,
      roundName: 'Semi-Finals',
      shortRound: 'SF',
      roundMatchIndex: i,
      status: 'upcoming',
      dayKey: null,
      slotA: null,
      slotB: null,
      sourceMatchA: 25 + i * 2,
      sourceMatchB: 26 + i * 2,
      nextMatchNumber: 31,
      nextMatchSlot: i === 0 ? 'a' : 'b',
      votesA: 0,
      votesB: 0,
      votersA: [],
      votersB: [],
      tiebreaker: false,
      tiebreakerTiedScore: null,
      tiebreakerStartedAt: null,
      tiebreakerWinnerKey: null,
      tiebreakerVotedBy: null,
      winnerKey: null,
      winner: null,
      completedAt: null,
    });
  }

  // Round 5: Grand Final (Match 31)
  matches.push({
    matchNumber: 31,
    round: 5,
    roundName: 'Grand Final',
    shortRound: 'Final',
    roundMatchIndex: 0,
    status: 'upcoming',
    dayKey: null,
    slotA: null,
    slotB: null,
    sourceMatchA: 29,
    sourceMatchB: 30,
    nextMatchNumber: null,
    nextMatchSlot: null,
    votesA: 0,
    votesB: 0,
    votersA: [],
    votersB: [],
    tiebreaker: false,
    tiebreakerTiedScore: null,
    tiebreakerStartedAt: null,
    tiebreakerWinnerKey: null,
    tiebreakerVotedBy: null,
    winnerKey: null,
    winner: null,
    completedAt: null,
  });

  return {
    items: normalizedItems,
    matches,
  };
}

function getWorldCupMatchPollId(tournamentId, matchNumber, isTiebreaker = false) {
  return isTiebreaker
    ? `wc_${tournamentId}_m${matchNumber}_tb`
    : `wc_${tournamentId}_m${matchNumber}`;
}

async function loadWorldCupMatchVotes(db, tournamentId, matchNumber) {
  const regularPollId = getWorldCupMatchPollId(tournamentId, matchNumber, false);
  const tbPollId = getWorldCupMatchPollId(tournamentId, matchNumber, true);

  const [regSnap, tbSnap] = await Promise.all([
    db.collection(POLL_VOTES_COLLECTION).where('pollId', '==', regularPollId).limit(1000).get(),
    db.collection(POLL_VOTES_COLLECTION).where('pollId', '==', tbPollId).limit(100).get(),
  ]);

  const regularVotes = regSnap.docs.map((doc) => {
    const d = doc.data() || {};
    return {
      uid: d.uid || '',
      fullName: d.fullName || '',
      email: d.email || '',
      optionKey: d.optionKey || '',
      optionLabel: d.optionLabel || '',
      isTiebreaker: false,
    };
  });

  const tiebreakerVotes = tbSnap.docs.map((doc) => {
    const d = doc.data() || {};
    return {
      uid: d.uid || '',
      fullName: d.fullName || '',
      email: d.email || '',
      optionKey: d.optionKey || '',
      optionLabel: d.optionLabel || '',
      isTiebreaker: true,
    };
  });

  return {
    regularVotes,
    tiebreakerVotes,
    allVotes: [...regularVotes, ...tiebreakerVotes],
  };
}

function applyMatchWinnerToBracket(matches, matchIndex, winnerKey, extra = {}) {
  const updated = matches.map((m) => ({ ...m }));
  const match = { ...updated[matchIndex] };
  const winnerItem = winnerKey === 'a' ? match.slotA : match.slotB;
  const nowIso = extra.nowIso || new Date().toISOString();

  match.status = 'completed';
  match.winnerKey = winnerKey;
  match.winner = winnerItem ? { ...winnerItem } : null;
  match.completedAt = nowIso;
  if (typeof extra.votesA === 'number') match.votesA = extra.votesA;
  if (typeof extra.votesB === 'number') match.votesB = extra.votesB;
  if (Array.isArray(extra.votersA)) match.votersA = extra.votersA;
  if (Array.isArray(extra.votersB)) match.votersB = extra.votersB;
  if (extra.tiebreakerWinnerKey) {
    match.tiebreakerWinnerKey = extra.tiebreakerWinnerKey;
  }
  if (extra.tiebreakerVotedBy) {
    match.tiebreakerVotedBy = extra.tiebreakerVotedBy;
  }

  updated[matchIndex] = match;

  if (match.nextMatchNumber && winnerItem) {
    const nextIdx = updated.findIndex((m) => Number(m.matchNumber) === Number(match.nextMatchNumber));
    if (nextIdx !== -1) {
      const nextMatch = { ...updated[nextIdx] };
      if (match.nextMatchSlot === 'a') {
        nextMatch.slotA = { ...winnerItem };
      } else {
        nextMatch.slotB = { ...winnerItem };
      }
      updated[nextIdx] = nextMatch;
    }
  }

  return {
    matches: updated,
    resolvedMatch: match,
    winnerItem,
  };
}

/**
 * Checks if the active match has reached its 17:00 Europe/London confirmation cutoff (or if forceAdvance is requested).
 * - If votesA !== votesB: declares winner, advances winner into next round slot, and opens next match for the next 17:00 cutoff.
 * - If votesA === votesB: transitions match to 'tiebreaker' (Sudden Death), announcing the tie so everyone gets another vote and first vote wins.
 */
async function syncWorldCupProgress(db, docSnap, todayKey, options = {}) {
  if (!docSnap || !docSnap.exists) return null;
  const data = docSnap.data() || {};
  if (data.status !== 'active') return { id: docSnap.id, ...data };

  const matches = Array.isArray(data.matches) ? data.matches.map((m) => ({ ...m })) : [];
  if (!matches.length) return { id: docSnap.id, ...data };

  const activeIdx = matches.findIndex((m) => m.status === 'open' || m.status === 'tiebreaker');
  if (activeIdx === -1) {
    return { id: docSnap.id, ...data };
  }

  const activeMatch = matches[activeIdx];
  const forceAdvance = Boolean(options.forceAdvance);
  const forceTiebreaker = Boolean(options.forceTiebreaker);
  const londonNow = getLondonTimeParts();

  // If already in tiebreaker, we wait for the first sudden-death vote (unless an admin explicitly forced a resolution).
  if (activeMatch.status === 'tiebreaker' && !forceAdvance) {
    return { id: docSnap.id, ...data };
  }

  const cutoffReached = Boolean(
    activeMatch.status === 'open'
    && activeMatch.dayKey
    && isMatchConfirmationDue(activeMatch.dayKey, londonNow),
  );

  if (!cutoffReached && !forceAdvance && !forceTiebreaker) {
    return { id: docSnap.id, ...data };
  }

  // Load votes for the active match
  const { regularVotes, allVotes } = await loadWorldCupMatchVotes(db, docSnap.id, activeMatch.matchNumber);
  const agg = aggregatePollResults(
    {
      type: 'ab',
      optionA: activeMatch.slotA?.name || 'Option A',
      optionB: activeMatch.slotB?.name || 'Option B',
      imageA: activeMatch.slotA?.imageUrl || null,
      imageB: activeMatch.slotB?.imageUrl || null,
    },
    activeMatch.status === 'tiebreaker' ? allVotes : regularVotes,
  );

  const optA = agg.options.find((o) => o.key === 'a') || { votes: 0, voters: [] };
  const optB = agg.options.find((o) => o.key === 'b') || { votes: 0, voters: [] };
  const votesA = optA.votes;
  const votesB = optB.votes;
  const nowIso = new Date().toISOString();

  // Check for tie (or forced tiebreaker)
  if (forceTiebreaker || votesA === votesB) {
    activeMatch.status = 'tiebreaker';
    activeMatch.tiebreaker = true;
    activeMatch.tiebreakerTiedScore = votesA;
    activeMatch.tiebreakerStartedAt = nowIso;
    activeMatch.votesA = votesA;
    activeMatch.votesB = votesB;
    activeMatch.votersA = optA.voters || [];
    activeMatch.votersB = optB.voters || [];
    matches[activeIdx] = activeMatch;

    const patch = {
      matches,
      currentMatchNumber: activeMatch.matchNumber,
    };
    if (options.FieldValue) {
      patch.updatedAt = options.FieldValue.serverTimestamp();
    }
    await docSnap.ref.update(patch);
    return {
      id: docSnap.id,
      ...data,
      ...patch,
    };
  }

  // We have a winner!
  const winnerKey = votesA > votesB ? 'a' : 'b';
  const applied = applyMatchWinnerToBracket(matches, activeIdx, winnerKey, {
    nowIso,
    votesA,
    votesB,
    votersA: optA.voters || [],
    votersB: optB.voters || [],
  });

  const updatedMatches = applied.matches;
  let nextStatus = 'active';
  let champion = data.champion || null;
  let nextCurrentMatchNumber = activeMatch.matchNumber;

  if (activeMatch.matchNumber === 31) {
    nextStatus = 'completed';
    champion = applied.winnerItem;
  } else {
    const nextSequentialIdx = updatedMatches.findIndex(
      (m) => Number(m.matchNumber) === Number(activeMatch.matchNumber) + 1,
    );
    if (nextSequentialIdx !== -1) {
      const nextConfirmDayKey = getNextConfirmationDayKey(londonNow) || todayKey;
      updatedMatches[nextSequentialIdx] = {
        ...updatedMatches[nextSequentialIdx],
        status: 'open',
        dayKey: nextConfirmDayKey,
      };
      nextCurrentMatchNumber = updatedMatches[nextSequentialIdx].matchNumber;
    }
  }

  const lastResolvedMatch = {
    matchNumber: applied.resolvedMatch.matchNumber,
    roundName: applied.resolvedMatch.roundName,
    slotA: applied.resolvedMatch.slotA,
    slotB: applied.resolvedMatch.slotB,
    votesA,
    votesB,
    winnerKey,
    winner: applied.winnerItem,
    tiebreaker: Boolean(applied.resolvedMatch.tiebreaker),
    tiebreakerVotedBy: applied.resolvedMatch.tiebreakerVotedBy || null,
    completedAt: nowIso,
  };

  const patch = {
    matches: updatedMatches,
    status: nextStatus,
    champion,
    currentMatchNumber: nextCurrentMatchNumber,
    lastResolvedMatch,
  };
  if (options.FieldValue) {
    patch.updatedAt = options.FieldValue.serverTimestamp();
  }

  await docSnap.ref.update(patch);
  return {
    id: docSnap.id,
    ...data,
    ...patch,
  };
}

/**
 * Reverts the World Cup tournament state backwards to a specific target match (or steps back 1 match).
 * Strictly restricted to Dale Watkins. Reopens the target match for today's cutoff, cleans up premature
 * votes on skipped matches, and clears downstream winner slots so the tournament progression is preserved.
 */
async function revertWorldCupStep(db, docSnap, targetMatchNumber, options = {}) {
  if (!docSnap || !docSnap.exists) return null;
  const data = docSnap.data() || {};
  const tournamentId = docSnap.id;
  const matches = Array.isArray(data.matches) ? data.matches.map((m) => ({ ...m })) : [];
  if (!matches.length) return { id: tournamentId, ...data };

  let currentMatch = matches.find((m) => m.status === 'open' || m.status === 'tiebreaker');
  let currentMatchNum = currentMatch ? Number(currentMatch.matchNumber) : 31;
  if (!currentMatch && data.status === 'completed') {
    currentMatchNum = 32;
  }

  let target = Number(targetMatchNumber);
  if (!Number.isInteger(target) || target < 1 || target > 31) {
    target = Math.max(1, currentMatchNum - 1);
  }

  const londonNow = getLondonTimeParts();
  const todayKey = options.todayKey || londonNow.dayKey;
  const reopenDayKey = getNextConfirmationDayKey(londonNow) || todayKey;

  // Clean up votes for matches >= target being reset
  for (let mNum = target; mNum <= 31; mNum += 1) {
    const isTargetMatch = mNum === target;
    const tbPollId = getWorldCupMatchPollId(tournamentId, mNum, true);
    const regPollId = getWorldCupMatchPollId(tournamentId, mNum, false);

    try {
      const tbSnap = await db.collection(POLL_VOTES_COLLECTION).where('pollId', '==', tbPollId).get();
      if (!tbSnap.empty) {
        const batch = db.batch();
        tbSnap.docs.forEach((d) => batch.delete(d.ref));
        await batch.commit();
      }

      if (!isTargetMatch) {
        const regSnap = await db.collection(POLL_VOTES_COLLECTION).where('pollId', '==', regPollId).get();
        if (!regSnap.empty) {
          const batch = db.batch();
          regSnap.docs.forEach((d) => batch.delete(d.ref));
          await batch.commit();
        }
      }
    } catch (cleanErr) {
      console.warn(`revertWorldCupStep vote cleanup error for M${mNum}`, cleanErr?.message || cleanErr);
    }
  }

  // Load legitimate regular votes for the target match to restore accurate tally
  const { regularVotes } = await loadWorldCupMatchVotes(db, tournamentId, target);
  const targetMatchIdx = matches.findIndex((m) => Number(m.matchNumber) === target);
  const targetMatchObj = targetMatchIdx !== -1 ? matches[targetMatchIdx] : null;

  let restoredVotesA = 0;
  let restoredVotesB = 0;
  let restoredVotersA = [];
  let restoredVotersB = [];

  if (targetMatchObj) {
    const agg = aggregatePollResults(
      {
        type: 'ab',
        optionA: targetMatchObj.slotA?.name || 'Option A',
        optionB: targetMatchObj.slotB?.name || 'Option B',
      },
      regularVotes,
    );
    const optA = agg.options.find((o) => o.key === 'a') || { votes: 0, voters: [] };
    const optB = agg.options.find((o) => o.key === 'b') || { votes: 0, voters: [] };
    restoredVotesA = optA.votes;
    restoredVotesB = optB.votes;
    restoredVotersA = optA.voters || [];
    restoredVotersB = optB.voters || [];
  }

  // Reset matches in bracket
  const updatedMatches = matches.map((m) => {
    const mNum = Number(m.matchNumber);
    if (mNum < target) {
      return { ...m };
    }
    if (mNum === target) {
      return {
        ...m,
        status: 'open',
        dayKey: reopenDayKey,
        votesA: restoredVotesA,
        votesB: restoredVotesB,
        votersA: restoredVotersA,
        votersB: restoredVotersB,
        tiebreaker: false,
        tiebreakerTiedScore: null,
        tiebreakerStartedAt: null,
        tiebreakerWinnerKey: null,
        tiebreakerVotedBy: null,
        winnerKey: null,
        winner: null,
        completedAt: null,
      };
    }
    return {
      ...m,
      status: 'upcoming',
      dayKey: null,
      votesA: 0,
      votesB: 0,
      votersA: [],
      votersB: [],
      tiebreaker: false,
      tiebreakerTiedScore: null,
      tiebreakerStartedAt: null,
      tiebreakerWinnerKey: null,
      tiebreakerVotedBy: null,
      winnerKey: null,
      winner: null,
      completedAt: null,
    };
  });

  // Re-link downstream slots for rounds 2..5 (matches 17..31)
  for (let i = 0; i < updatedMatches.length; i += 1) {
    const m = updatedMatches[i];
    if (m.round > 1) {
      const srcA = updatedMatches.find((x) => Number(x.matchNumber) === Number(m.sourceMatchA));
      const srcB = updatedMatches.find((x) => Number(x.matchNumber) === Number(m.sourceMatchB));
      m.slotA = srcA && srcA.status === 'completed' && srcA.winner ? { ...srcA.winner } : null;
      m.slotB = srcB && srcB.status === 'completed' && srcB.winner ? { ...srcB.winner } : null;
    }
  }

  let lastResolvedMatch = null;
  if (target > 1) {
    const prevMatch = updatedMatches.find((m) => Number(m.matchNumber) === target - 1);
    if (prevMatch && prevMatch.status === 'completed') {
      lastResolvedMatch = {
        matchNumber: prevMatch.matchNumber,
        roundName: prevMatch.roundName,
        slotA: prevMatch.slotA,
        slotB: prevMatch.slotB,
        votesA: prevMatch.votesA,
        votesB: prevMatch.votesB,
        winnerKey: prevMatch.winnerKey,
        winner: prevMatch.winner,
        tiebreaker: Boolean(prevMatch.tiebreaker),
        tiebreakerVotedBy: prevMatch.tiebreakerVotedBy || null,
        completedAt: prevMatch.completedAt || new Date().toISOString(),
      };
    }
  }

  const patch = {
    matches: updatedMatches,
    status: 'active',
    champion: null,
    currentMatchNumber: target,
    lastResolvedMatch,
  };
  if (options.FieldValue) {
    patch.updatedAt = options.FieldValue.serverTimestamp();
  }

  await docSnap.ref.update(patch);

  return {
    id: tournamentId,
    ...data,
    ...patch,
  };
}

function buildMatchSourceLabel(match, side, allMatches) {
  const slot = side === 'a' ? match.slotA : match.slotB;
  if (slot && slot.name) return slot.name;
  const sourceNum = side === 'a' ? match.sourceMatchA : match.sourceMatchB;
  if (!sourceNum) return 'TBD';
  const sourceMatch = Array.isArray(allMatches)
    ? allMatches.find((m) => Number(m.matchNumber) === Number(sourceNum))
    : null;
  if (sourceMatch && sourceMatch.slotA?.name && sourceMatch.slotB?.name) {
    return `Winner of M${sourceNum} (${sourceMatch.slotA.name} vs ${sourceMatch.slotB.name})`;
  }
  return `Winner of Match #${sourceNum}`;
}

async function serializeWorldCup(db, worldCupObj, {
  uid = '',
  todayKey = '',
  canManage = false,
  isOwner = false,
} = {}) {
  if (!worldCupObj) return null;
  const tournamentId = worldCupObj.id;
  const londonNow = getLondonTimeParts();
  const effectiveTodayKey = todayKey || londonNow.dayKey;
  const rawMatches = Array.isArray(worldCupObj.matches) ? worldCupObj.matches : [];
  const activeMatchRaw = rawMatches.find((m) => m.status === 'open' || m.status === 'tiebreaker')
    || rawMatches[rawMatches.length - 1]
    || null;
  const activeMatchNumber = activeMatchRaw ? Number(activeMatchRaw.matchNumber) : 31;
  const activeBaseDayKey = ensureWeekdayDayKey(
    (activeMatchRaw && activeMatchRaw.dayKey)
      || getNextConfirmationDayKey(londonNow)
      || effectiveTodayKey,
  );

  // Load live votes for the active match
  let activeVotesBundle = { regularVotes: [], tiebreakerVotes: [], allVotes: [] };
  let myRegularVote = null;
  let myTiebreakerVote = null;

  if (activeMatchRaw && tournamentId) {
    activeVotesBundle = await loadWorldCupMatchVotes(db, tournamentId, activeMatchRaw.matchNumber);
    if (uid) {
      const regFound = activeVotesBundle.regularVotes.find((v) => v.uid === uid);
      if (regFound) {
        myRegularVote = {
          optionKey: regFound.optionKey,
          optionLabel: regFound.optionLabel,
        };
      }
      const tbFound = activeVotesBundle.tiebreakerVotes.find((v) => v.uid === uid);
      if (tbFound) {
        myTiebreakerVote = {
          optionKey: tbFound.optionKey,
          optionLabel: tbFound.optionLabel,
        };
      }
    }
  }

  const enrichedMatches = rawMatches.map((m) => {
    const isActive = activeMatchRaw && Number(m.matchNumber) === Number(activeMatchRaw.matchNumber);
    const labelA = buildMatchSourceLabel(m, 'a', rawMatches);
    const labelB = buildMatchSourceLabel(m, 'b', rawMatches);

    let scheduledDayKey = m.dayKey ? ensureWeekdayDayKey(m.dayKey) : null;
    if (!scheduledDayKey && activeBaseDayKey && Number(m.matchNumber) >= activeMatchNumber) {
      const offset = Number(m.matchNumber) - activeMatchNumber;
      scheduledDayKey = shiftWeekdays(activeBaseDayKey, offset);
    }

    if (isActive && (m.status === 'open' || m.status === 'tiebreaker')) {
      const results = aggregatePollResults(
        {
          type: 'ab',
          optionA: m.slotA?.name || labelA,
          optionB: m.slotB?.name || labelB,
          imageA: m.slotA?.imageUrl || null,
          imageB: m.slotB?.imageUrl || null,
        },
        m.status === 'tiebreaker' ? activeVotesBundle.allVotes : activeVotesBundle.regularVotes,
      );
      const optA = results.options.find((o) => o.key === 'a') || { votes: 0, voters: [] };
      const optB = results.options.find((o) => o.key === 'b') || { votes: 0, voters: [] };
      return {
        ...m,
        labelA,
        labelB,
        scheduledDayKey: scheduledDayKey || activeBaseDayKey,
        confirmTimeLabel: CONFIRMATION_TIME_LABEL,
        isWeekendBreak: Boolean(londonNow.isWeekend && m.status !== 'tiebreaker'),
        votesA: optA.votes,
        votesB: optB.votes,
        votersA: optA.voters,
        votersB: optB.voters,
        results,
        myVote: m.status === 'tiebreaker' ? myTiebreakerVote : myRegularVote,
        myRegularVote,
        myTiebreakerVote,
        canVoteTiebreaker: m.status === 'tiebreaker',
      };
    }

    const totalVotes = (Number(m.votesA) || 0) + (Number(m.votesB) || 0);
    const votesA = Number(m.votesA) || 0;
    const votesB = Number(m.votesB) || 0;
    return {
      ...m,
      labelA,
      labelB,
      scheduledDayKey,
      confirmTimeLabel: CONFIRMATION_TIME_LABEL,
      results: {
        type: 'ab',
        totalVotes,
        options: [
          {
            key: 'a',
            label: m.slotA?.name || labelA,
            imageUrl: m.slotA?.imageUrl || null,
            votes: votesA,
            percent: totalVotes ? Math.round((votesA / totalVotes) * 100) : 0,
            voters: Array.isArray(m.votersA) ? m.votersA : [],
          },
          {
            key: 'b',
            label: m.slotB?.name || labelB,
            imageUrl: m.slotB?.imageUrl || null,
            votes: votesB,
            percent: totalVotes ? Math.round((votesB / totalVotes) * 100) : 0,
            voters: Array.isArray(m.votersB) ? m.votersB : [],
          },
        ],
      },
    };
  });

  const activeMatch = enrichedMatches.find((m) => m.status === 'open' || m.status === 'tiebreaker') || null;
  const isWeekendBreak = Boolean(londonNow.isWeekend && activeMatch && activeMatch.status !== 'tiebreaker');

  // Build a compatible poll object for ProfileWidgets / legacy consumers
  const activePoll = activeMatch
    ? {
        id: getWorldCupMatchPollId(tournamentId, activeMatch.matchNumber, activeMatch.status === 'tiebreaker'),
        isWorldCup: true,
        worldCupId: tournamentId,
        worldCupTitle: worldCupObj.title || 'World Cup',
        matchNumber: activeMatch.matchNumber,
        round: activeMatch.round,
        roundName: activeMatch.roundName,
        scheduledDayKey: activeMatch.scheduledDayKey || null,
        confirmTimeLabel: CONFIRMATION_TIME_LABEL,
        isWeekendBreak,
        title: `${worldCupObj.title || 'World Cup'} · ${activeMatch.roundName}`,
        description: activeMatch.status === 'tiebreaker'
          ? `⚡ TIE-BREAKER! Tied at ${activeMatch.tiebreakerTiedScore ?? activeMatch.votesA}–${activeMatch.tiebreakerTiedScore ?? activeMatch.votesB}. Everyone gets another vote — first additional vote wins!`
          : isWeekendBreak
            ? `⏸️ Weekend Break — Next matchup (${activeMatch.slotA?.name || 'Contender A'} vs ${activeMatch.slotB?.name || 'Contender B'}) opens Monday!`
            : `${activeMatch.slotA?.name || 'Contender A'} vs ${activeMatch.slotB?.name || 'Contender B'} · Result confirmed at 17:00`,
        type: 'ab',
        optionA: activeMatch.slotA?.name || 'Option A',
        optionB: activeMatch.slotB?.name || 'Option B',
        imageA: activeMatch.slotA?.imageUrl || null,
        imageB: activeMatch.slotB?.imageUrl || null,
        resultsPublic: true,
        status: 'open',
        matchStatus: activeMatch.status,
        tiebreaker: Boolean(activeMatch.status === 'tiebreaker' || activeMatch.tiebreaker),
        tiebreakerTiedScore: activeMatch.tiebreakerTiedScore ?? null,
        myVote: activeMatch.myVote || null,
        myRegularVote: activeMatch.myRegularVote || null,
        results: activeMatch.results,
        canManage,
        isOwner: Boolean(isOwner),
      }
    : null;

  return {
    id: tournamentId,
    title: worldCupObj.title || 'World Cup',
    description: worldCupObj.description || '',
    categoryLabel: worldCupObj.categoryLabel || '',
    status: worldCupObj.status || 'active',
    startDayKey: ensureWeekdayDayKey(worldCupObj.startDayKey || effectiveTodayKey),
    confirmTimeLabel: CONFIRMATION_TIME_LABEL,
    isWeekendBreak,
    currentMatchNumber: activeMatch ? activeMatch.matchNumber : activeMatchNumber,
    champion: worldCupObj.champion || null,
    lastResolvedMatch: worldCupObj.lastResolvedMatch || null,
    items: Array.isArray(worldCupObj.items) ? worldCupObj.items : [],
    matches: enrichedMatches,
    activeMatch,
    activePoll,
    rounds: ROUND_DEFS,
    canManage,
    isOwner: Boolean(isOwner),
  };
}

module.exports = {
  WORLD_CUP_COLLECTION,
  POLL_VOTES_COLLECTION,
  CONFIRMATION_HOUR_LONDON,
  CONFIRMATION_TIME_LABEL,
  ROUND_DEFS,
  aggregatePollResults,
  applyMatchWinnerToBracket,
  buildInitialMatches,
  canManagePolls,
  displayAnswer,
  ensureWeekdayDayKey,
  getLondonTimeParts,
  getNextConfirmationDayKey,
  getWorldCupMatchPollId,
  isMatchConfirmationDue,
  isWeekendDayKey,
  isWorldCupOwner,
  loadWorldCupMatchVotes,
  normalizeAnswerKey,
  revertWorldCupStep,
  sanitizeContenderItem,
  serializeWorldCup,
  shiftDayKey,
  shiftWeekdays,
  syncWorldCupProgress,
};
