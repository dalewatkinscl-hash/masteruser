'use strict';

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

function aggregatePollResults(poll, votes) {
  const type = poll.type || 'ab';

  if (type === 'ab') {
    const optionA = poll.optionA || 'A';
    const optionB = poll.optionB || 'B';
    const votersA = [];
    const votersB = [];
    votes.forEach((vote) => {
      const name = vote.fullName || vote.email || 'Colleague';
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
          votes: a,
          percent: total ? Math.round((a / total) * 100) : 0,
          voters: votersA,
        },
        {
          key: 'b',
          label: optionB,
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

module.exports = {
  aggregatePollResults,
  canManagePolls,
  displayAnswer,
  normalizeAnswerKey,
};
