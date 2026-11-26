'use strict';

/**
 * Configure Season 5 scheduled wipe & launch for 2026-11-25 10:00:00 Europe/London (GMT)
 * and permanently block Kerry Cox from Coach Capitalist.
 *
 *   node functions/scripts/configureSeason5Launch.js
 */
const admin = require('firebase-admin');

if (!admin.apps.length) {
  admin.initializeApp({ projectId: 'master-user-management' });
}

const db = admin.firestore();

const KERRY_COX_UID = 'i0wKLRuVwfbNAa7SL113m19kf6F3';
const LAUNCH_AT_ISO = '2026-11-25T10:00:00Z';
const LAUNCH_AT_MS = Date.parse(LAUNCH_AT_ISO);

async function main() {
  if (!Number.isFinite(LAUNCH_AT_MS) || LAUNCH_AT_MS <= 0) {
    throw new Error('Invalid LAUNCH_AT_ISO timestamp');
  }

  const configRef = db.doc('coach_capitalist/config');
  const kerryUserRef = db.collection('users').doc(KERRY_COX_UID);
  const kerryScoreRef = db.collection('coach_capitalist_scores').doc(KERRY_COX_UID);

  await configRef.set({
    scheduledSeasonLaunch: {
      seasonId: '2026-S5',
      previousSeasonLabel: 'Pre-Season 5',
      launchAtMs: LAUNCH_AT_MS,
      launchAtIso: LAUNCH_AT_ISO,
      executedAtMs: null,
      inProgressAtMs: null,
      dailyPlayCapMs: 60 * 60 * 1000,
      awayEarningsEnabled: true,
      archiveScores: true,
    },
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  }, { merge: true });

  await kerryUserRef.set({
    funFlags: {
      coachCapitalistBlocked: true,
    },
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  }, { merge: true });

  await kerryScoreRef.delete();

  const [cfgSnap, userSnap, scoreSnap] = await Promise.all([
    configRef.get(),
    kerryUserRef.get(),
    kerryScoreRef.get(),
  ]);

  console.log(JSON.stringify({
    ok: true,
    scheduledSeasonLaunch: cfgSnap.data()?.scheduledSeasonLaunch || null,
    kerryFunFlags: userSnap.data()?.funFlags || null,
    kerryScoreExists: scoreSnap.exists,
  }, null, 2));
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
