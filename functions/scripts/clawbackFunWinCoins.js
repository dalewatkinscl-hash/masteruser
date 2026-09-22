'use strict';

/**
 * One-shot: reverse historic fun_win coin awards in production.
 * Uses Application Default Credentials (firebase login / gcloud auth).
 *
 * Run from repo root:
 *   node functions/scripts/clawbackFunWinCoins.js
 */

const admin = require('firebase-admin');
const { clawbackFunWinAwards } = require('../coins');

admin.initializeApp({
  projectId: 'master-user-management',
});

const db = admin.firestore();

(async () => {
  try {
    const result = await clawbackFunWinAwards(db, {
      FieldValue: admin.firestore.FieldValue,
    });
    console.log('clawbackFunWinAwards', result);
    process.exit(0);
  } catch (error) {
    console.error(error);
    process.exit(1);
  }
})();
