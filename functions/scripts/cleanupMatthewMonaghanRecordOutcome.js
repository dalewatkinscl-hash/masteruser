'use strict';

/**
 * One-shot: remove wrongly generated outcome letters from Matthew Monaghan
 * record (or recent) cases, and clear outcome fields on those cases.
 *
 * Run from repo root:
 *   node functions/scripts/cleanupMatthewMonaghanRecordOutcome.js
 */

const admin = require('firebase-admin');

admin.initializeApp({
  projectId: 'master-user-management',
});

const db = admin.firestore();

function serializeTs(value) {
  if (!value) return null;
  if (typeof value.toDate === 'function') return value.toDate().toISOString();
  if (value._seconds) return new Date(value._seconds * 1000).toISOString();
  return String(value);
}

(async () => {
  try {
    const usersSnap = await db.collection('users').get();
    const matches = usersSnap.docs.filter((doc) => {
      const data = doc.data() || {};
      const name = String(data.fullName || '').toLowerCase();
      return name.includes('matthew') && name.includes('monaghan');
    });

    if (!matches.length) {
      console.error('No user found matching Matthew Monaghan');
      process.exit(1);
    }

    for (const userDoc of matches) {
      const user = userDoc.data() || {};
      console.log('User', userDoc.id, user.fullName || user.email);

      const casesSnap = await db.collection('disciplinary_cases')
        .where('employeeUid', '==', userDoc.id)
        .get();

      console.log('Cases found:', casesSnap.size);

      for (const caseDoc of casesSnap.docs) {
        const caseData = caseDoc.data() || {};
        const family = caseData.processFamily || 'disciplinary';
        console.log(
          'Case',
          caseDoc.id,
          family,
          caseData.title || '',
          'stage=',
          caseData.stage,
          'opened=',
          serializeTs(caseData.openedAt || caseData.createdAt),
        );

        const docsSnap = await db.collection('disciplinary_documents')
          .where('caseId', '==', caseDoc.id)
          .get();

        const outcomeDocs = docsSnap.docs.filter((doc) => {
          const data = doc.data() || {};
          const type = String(data.documentType || '');
          const name = String(data.fileName || '').toLowerCase();
          const template = String(data.templateId || '');
          return type === 'outcome'
            || template === 'outcome_letter'
            || name.startsWith('outcome letter');
        });

        console.log('  documents=', docsSnap.size, 'outcomeDocs=', outcomeDocs.length);

        for (const outcomeDoc of outcomeDocs) {
          const data = outcomeDoc.data() || {};
          console.log('  DELETE outcome doc', outcomeDoc.id, data.fileName, data.source || '');
          await outcomeDoc.ref.delete();
        }

        // Clear outcome fields on record cases, or any case that only got a letter from this bug.
        if (family === 'record' || outcomeDocs.length) {
          const patch = {
            outcomePreset: family === 'record' ? '' : (caseData.outcomePreset || ''),
            outcomePackSteps: family === 'record' ? [] : (caseData.outcomePackSteps || []),
            outcomeDetails: family === 'record' ? '' : (caseData.outcomeDetails || ''),
            evidenceConsideration: family === 'record' ? '' : (caseData.evidenceConsideration || ''),
            expectedStandard: family === 'record' ? '' : (caseData.expectedStandard || ''),
            supportMonitoringRetraining: family === 'record' ? '' : (caseData.supportMonitoringRetraining || ''),
            appealWindowEndsAt: family === 'record' ? '' : (caseData.appealWindowEndsAt || ''),
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          };
          if (family === 'record') {
            patch.outcomePreset = '';
            patch.outcomePackSteps = [];
            patch.outcomeDetails = '';
            patch.evidenceConsideration = '';
            patch.expectedStandard = '';
            patch.supportMonitoringRetraining = '';
            patch.appealWindowEndsAt = '';
            patch.decisionMakerUid = '';
          }
          await caseDoc.ref.update(patch);
          console.log('  Cleared outcome fields on case', caseDoc.id);
        }
      }
    }

    console.log('Done');
    process.exit(0);
  } catch (error) {
    console.error(error);
    process.exit(1);
  }
})();
