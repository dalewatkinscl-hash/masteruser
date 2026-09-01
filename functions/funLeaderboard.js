'use strict';

/**
 * Shared Fun-tab leaderboard ranking helpers.
 * Competition ranking with joint places (1, 2, 3, 3, 5…).
 */

function ordinal(n) {
  const value = Number(n) || 0;
  const mod100 = value % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${value}th`;
  switch (value % 10) {
    case 1: return `${value}st`;
    case 2: return `${value}nd`;
    case 3: return `${value}rd`;
    default: return `${value}th`;
  }
}

function medalForRank(rank) {
  if (rank === 1) return 'gold';
  if (rank === 2) return 'silver';
  if (rank === 3) return 'bronze';
  return null;
}

/**
 * Assign competition ranks to an already-sorted list.
 * @param {object[]} rows
 * @param {(a: object, b: object) => boolean} sameScore
 */
function assignJointRanks(rows, sameScore) {
  let i = 0;
  while (i < rows.length) {
    let j = i + 1;
    while (j < rows.length && sameScore(rows[i], rows[j])) j += 1;
    const rank = i + 1;
    const joint = j - i > 1;
    const medal = medalForRank(rank);
    for (let k = i; k < j; k += 1) {
      rows[k].rank = rank;
      rows[k].joint = joint;
      rows[k].medal = medal;
      rows[k].rankLabel = joint ? `Joint ${ordinal(rank)}` : ordinal(rank);
    }
    i = j;
  }
  return rows;
}

module.exports = {
  ordinal,
  medalForRank,
  assignJointRanks,
};
