'use strict';

const admin = require('firebase-admin');

if (!admin.apps.length) {
  admin.initializeApp({ projectId: 'master-user-management' });
}

const db = admin.firestore();

const SCORES_COL = 'coach_capitalist_scores';
const SAVES_COL = 'coach_capitalist_saves';
const GIFT_TOKEN = 'gift-10-backers-20261103';

async function main() {
  console.log('--- Step 1: Identifying 1st Place ---');
  const scoresSnap = await db.collection(SCORES_COL).get();
  const scoreDocs = scoresSnap.docs.map((d) => ({ uid: d.id, ...d.data() }));

  // Sort by lifetime earnings descending to find current 1st place
  scoreDocs.sort((a, b) => (Number(b.lifetimeEarnings) || 0) - (Number(a.lifetimeEarnings) || 0));

  if (scoreDocs.length === 0) {
    throw new Error('No scores found in coach_capitalist_scores!');
  }

  const firstPlace = scoreDocs[0];
  console.log(`1st Place: ${firstPlace.fullName || firstPlace.uid} (UID: ${firstPlace.uid})`);
  console.log(`Lifetime Earnings: ${firstPlace.lifetimeEarnings}`);
  console.log(`Current Backers: ${firstPlace.claimedAngels}`);
  console.log('>>> 1st Place will be EXCLUDED from the gift <<<\n');

  console.log('--- Step 2: Fetching All Players & Saves ---');
  const savesSnap = await db.collection(SAVES_COL).get();
  const savesMap = new Map();
  savesSnap.docs.forEach((d) => savesMap.set(d.id, d.data()));

  const scoresMap = new Map();
  scoresSnap.docs.forEach((d) => scoresMap.set(d.id, d.data()));

  const allUids = new Set([...scoresMap.keys(), ...savesMap.keys()]);
  console.log(`Total unique players found: ${allUids.size}`);

  const recipients = [];
  for (const uid of allUids) {
    if (uid === firstPlace.uid) {
      continue;
    }
    recipients.push(uid);
  }

  console.log(`Total recipients to receive +10 backers: ${recipients.length}\n`);

  console.log('--- Step 3: Granting 10 Backers to Recipients ---');
  const batchLimit = 250;
  let batch = db.batch();
  let operationCount = 0;
  let totalCommitted = 0;

  const results = [];

  for (const uid of recipients) {
    const scoreData = scoresMap.get(uid);
    const saveData = savesMap.get(uid);

    const name = scoreData?.fullName || saveData?.updatedByName || uid;

    // Calculate updated save state
    const saveRef = db.collection(SAVES_COL).doc(uid);
    const existingState = saveData?.state || {};
    const oldSaveAngels = Number(existingState.angels) || 0;
    const oldAngelsSpent = Number(existingState.angelsSpent) || 0;
    const newSaveAngels = oldSaveAngels + 10;
    const newClaimedAngels = newSaveAngels + oldAngelsSpent;

    const updatedState = {
      ...existingState,
      angels: newSaveAngels,
      angelsSpent: oldAngelsSpent,
    };

    const saveUpdate = {
      state: updatedState,
      claimedAngels: newClaimedAngels,
      forceResetToken: GIFT_TOKEN,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedByName: 'Gift: 10 Backers',
    };

    batch.set(saveRef, saveUpdate, { merge: true });
    operationCount++;

    // Calculate updated score doc if exists
    if (scoreData) {
      const scoreRef = db.collection(SCORES_COL).doc(uid);
      const oldScoreAngels = Number(scoreData.claimedAngels) || 0;
      const newScoreAngels = oldScoreAngels + 10;

      batch.set(
        scoreRef,
        {
          claimedAngels: newScoreAngels,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
      operationCount++;

      results.push({
        uid,
        name,
        oldSaveAngels,
        newSaveAngels,
        oldScoreAngels,
        newScoreAngels,
      });
    } else {
      results.push({
        uid,
        name,
        oldSaveAngels,
        newSaveAngels,
        oldScoreAngels: null,
        newScoreAngels: null,
      });
    }

    if (operationCount >= batchLimit) {
      await batch.commit();
      totalCommitted += operationCount;
      batch = db.batch();
      operationCount = 0;
    }
  }

  if (operationCount > 0) {
    await batch.commit();
    totalCommitted += operationCount;
  }

  console.log(`Successfully committed ${totalCommitted} write operations.\n`);

  console.log('--- Summary of Updated Players ---');
  results.forEach((r, idx) => {
    console.log(
      `${(idx + 1).toString().padStart(2, ' ')}. ${r.name.padEnd(25, ' ')} | Save Angels: ${r.oldSaveAngels} -> ${r.newSaveAngels} | Score Backers: ${r.oldScoreAngels} -> ${r.newScoreAngels}`
    );
  });

  console.log('\n--- Step 4: Verification Check ---');
  const verifyScoresSnap = await db.collection(SCORES_COL).get();
  const verifyFirst = verifyScoresSnap.docs.find((d) => d.id === firstPlace.uid);
  console.log(`1st place (${firstPlace.fullName}) claimedAngels: ${verifyFirst?.data()?.claimedAngels} (must be unchanged: ${firstPlace.claimedAngels})`);

  console.log('Done!');
}

main().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
