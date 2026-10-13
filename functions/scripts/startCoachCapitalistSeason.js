'use strict';

/**
 * Wipe Coach Capitalist scores + saves and start a new season with wrap-up stats.
 *
 *   node functions/scripts/startCoachCapitalistSeason.js
 *   node functions/scripts/startCoachCapitalistSeason.js 2026-S2 "Season 1"
 */
const admin = require('firebase-admin');
const { startCoachCapitalistSeason } = require('../coachCapitalistPlay');

admin.initializeApp({
  projectId: 'master-user-management',
});

const db = admin.firestore();

async function main() {
  const seasonId = String(process.argv[2] || '2026-S2').trim();
  const previousSeasonLabel = String(process.argv[3] || 'Season 1').trim();
  console.log(`Starting Coach Capitalist season ${seasonId} (from ${previousSeasonLabel})…`);
  const result = await startCoachCapitalistSeason(db, {
    seasonId,
    dailyPlayCapMs: 60 * 60 * 1000,
    awayEarningsEnabled: true,
    archiveScores: true,
    previousSeasonLabel,
    FieldValue: admin.firestore.FieldValue,
    adminUid: 'script',
    adminName: 'startCoachCapitalistSeason.js',
  });
  console.log(JSON.stringify({
    seasonId: result.seasonId,
    forceResetToken: result.forceResetToken,
    savesReset: result.savesReset,
    scoresCleared: result.scoresCleared,
    archived: result.archived,
    wrapup: result.previousSeasonWrapup,
  }, null, 2));
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
