'use strict';

/**
 * Wipe today's Little Dicks Toolbox competitive rounds so everyone gets a fresh
 * 3-goes (or all-or-nothing) attempt — used when launching Toolbox 2.0 mid-day.
 *
 * Run from repo root (ADC / firebase login):
 *   node functions/scripts/resetToolboxKickDay.js
 *   node functions/scripts/resetToolboxKickDay.js 2026-09-24
 */
const admin = require('firebase-admin');

admin.initializeApp({
  projectId: 'master-user-management',
});

const db = admin.firestore();

function londonDayKey(d = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/London',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d);
}

async function deleteDay(dayKey) {
  const col = db.collection('toolbox_kick_games');
  let deleted = 0;
  // Paginate in case the day has more than one batch
  for (;;) {
    const snap = await col.where('dayKey', '==', dayKey).limit(400).get();
    if (snap.empty) break;
    const batch = db.batch();
    snap.docs.forEach((doc) => {
      batch.delete(doc.ref);
      deleted += 1;
    });
    await batch.commit();
    if (snap.size < 400) break;
  }
  return deleted;
}

(async () => {
  const dayKey = String(process.argv[2] || londonDayKey()).trim();
  try {
    const deleted = await deleteDay(dayKey);
    console.log(JSON.stringify({ ok: true, dayKey, deleted }, null, 2));
    process.exit(0);
  } catch (error) {
    console.error(error);
    process.exit(1);
  }
})();
