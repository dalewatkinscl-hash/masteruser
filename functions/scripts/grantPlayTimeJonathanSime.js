'use strict';

const admin = require('firebase-admin');
if (!admin.apps.length) admin.initializeApp({ projectId: 'master-user-management' });
const db = admin.firestore();

function getLondonDayKey(date = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/London',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

async function main() {
  const targetUid = 'Db83VPj3VNPm7ZEhTPBt4RON7nw1';
  let fullName = 'Jonathan Sime';

  // Check score doc
  const scoreSnap = await db.collection('coach_capitalist_scores').doc(targetUid).get();
  if (scoreSnap.exists) {
    fullName = scoreSnap.data()?.fullName || fullName;
    console.log('Found score doc:', targetUid, scoreSnap.data());
  } else {
    console.log('Score doc does not exist for UID', targetUid);
  }

  // Check user doc
  const userSnap = await db.collection('users').doc(targetUid).get();
  if (userSnap.exists) {
    console.log('Found user doc:', targetUid, userSnap.data());
  } else {
    console.log('User doc does not exist directly with id', targetUid);
  }

  // Check auth user
  try {
    const authUser = await admin.auth().getUser(targetUid);
    console.log('Found auth user:', authUser.uid, authUser.email, authUser.displayName);
    if (authUser.displayName) fullName = authUser.displayName;
  } catch (e) {
    console.log('Auth check error:', e.message);
  }

  const dayKey = getLondonDayKey();
  console.log(`London Day Key: ${dayKey}`);

  const playDocRef = db.collection('coach_capitalist_play').doc(`${targetUid}_${dayKey}`);
  const snap = await playDocRef.get();
  const prev = snap.exists ? snap.data() : {};
  console.log('Current play doc state:', prev);

  const prevBonusMs = Math.max(0, Math.floor(Number(prev.bonusMs) || 0));
  const addMs = 60 * 60 * 1000; // 1 hour = 3600000 ms
  const newBonusMs = prevBonusMs + addMs;

  await playDocRef.set({
    dayKey,
    uid: targetUid,
    seasonId: prev.seasonId || '2026-S2',
    bonusMs: newBonusMs,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    adminBonusReason: 'Granted 1 additional hour play today',
  }, { merge: true });

  const updatedSnap = await playDocRef.get();
  const updatedData = updatedSnap.data();
  const baseCap = 60 * 60 * 1000;
  const effectiveCap = baseCap + updatedData.bonusMs;
  const played = Math.max(0, Math.floor(Number(updatedData.playedMs) || 0));
  const remaining = Math.max(0, effectiveCap - played);

  console.log('--- Successfully granted play time ---');
  console.log(`User: ${fullName} (${targetUid})`);
  console.log(`Base Cap: ${baseCap / 60000} mins`);
  console.log(`Bonus Granted Total: ${updatedData.bonusMs / 60000} mins`);
  console.log(`Effective Cap: ${effectiveCap / 60000} mins`);
  console.log(`Played So Far Today: ${(played / 60000).toFixed(1)} mins`);
  console.log(`Remaining Play Time Today: ${(remaining / 60000).toFixed(1)} mins`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
