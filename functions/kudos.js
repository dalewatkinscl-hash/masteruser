'use strict';

const BADGE_TYPES = {
  great_learning: {
    key: 'great_learning',
    label: 'Great learning',
    description: 'Scholar’s cap — picked up new skills or shared knowledge',
  },
  great_performance: {
    key: 'great_performance',
    label: 'Great performance',
    description: 'Gold star — delivered excellent work',
  },
  dependability: {
    key: 'dependability',
    label: 'Dependability',
    description: 'Shield — someone you can always count on',
  },
  teamwork: {
    key: 'teamwork',
    label: 'Teamwork',
    description: 'Handshake — helped the team succeed',
  },
  customer_care: {
    key: 'customer_care',
    label: 'Oh well! you tried!',
    description: 'Participation award — for showing up and giving it a go',
  },
  going_above_beyond: {
    key: 'going_above_beyond',
    label: 'Above & beyond',
    description: 'Rocket — exceeded expectations',
  },
  leadership: {
    key: 'leadership',
    label: 'Leadership',
    description: 'Crown — stepped up and guided others',
  },
  positivity: {
    key: 'positivity',
    label: 'Positivity',
    description: 'Sunshine — brought energy and encouragement',
  },
};

const BADGE_KEYS = new Set(Object.keys(BADGE_TYPES));
const MAX_MESSAGE_LENGTH = 280;
const MAX_KUDOS_PER_DAY = 10;
const MAX_KUDOS_RECIPIENTS_PER_SEND = 10;
const MAX_GIF_BYTES = 2 * 1024 * 1024;
const ALLOWED_GIF_MIME = new Set(['image/gif']);

function listBadgeTypes() {
  return Object.values(BADGE_TYPES);
}

function isValidBadgeType(value) {
  return BADGE_KEYS.has(String(value || '').trim());
}

function normalizeMessage(value) {
  return String(value || '')
    .trim()
    .replace(/\s+/g, ' ')
    .slice(0, MAX_MESSAGE_LENGTH);
}

function normalizeRecipientUids(body = {}) {
  const fromArray = Array.isArray(body.toUids) ? body.toUids : [];
  const single = body.toUid != null ? [body.toUid] : [];
  const seen = new Set();
  const uids = [];
  for (const raw of [...fromArray, ...single]) {
    const uid = String(raw || '').trim();
    if (!uid || seen.has(uid)) continue;
    seen.add(uid);
    uids.push(uid);
  }
  return uids;
}

function decodeGifPayload(contentBase64, mimeType) {
  const mime = String(mimeType || '').trim().toLowerCase() || 'image/gif';
  if (!ALLOWED_GIF_MIME.has(mime)) {
    const error = new Error('Only GIF images are supported.');
    error.status = 400;
    throw error;
  }
  const raw = String(contentBase64 || '').trim();
  if (!raw) return null;
  const cleaned = raw.replace(/^data:image\/gif;base64,/i, '');
  let buffer;
  try {
    buffer = Buffer.from(cleaned, 'base64');
  } catch {
    const error = new Error('GIF data is invalid.');
    error.status = 400;
    throw error;
  }
  if (!buffer.length) {
    const error = new Error('GIF file is empty.');
    error.status = 400;
    throw error;
  }
  if (buffer.length > MAX_GIF_BYTES) {
    const error = new Error('GIF must be 2MB or smaller.');
    error.status = 400;
    throw error;
  }
  // Soft magic-byte check for GIF87a / GIF89a
  const header = buffer.subarray(0, 6).toString('ascii');
  if (header !== 'GIF87a' && header !== 'GIF89a') {
    const error = new Error('File does not look like a valid GIF.');
    error.status = 400;
    throw error;
  }
  return { buffer, mimeType: 'image/gif' };
}

function serializeKudos(doc) {
  const data = doc.data ? (doc.data() || {}) : (doc || {});
  const id = doc.id || data.id || '';
  const badgeType = data.badgeType || 'great_performance';
  const badge = BADGE_TYPES[badgeType] || BADGE_TYPES.great_performance;
  return {
    id,
    fromUid: data.fromUid || '',
    fromName: data.fromName || 'Colleague',
    toUid: data.toUid || '',
    toName: data.toName || 'Colleague',
    badgeType,
    badgeLabel: badge.label,
    message: data.message || '',
    gifUrl: data.gifUrl || null,
    dayKey: data.dayKey || '',
    createdAt: data.createdAt?.toDate?.()?.toISOString?.() || data.createdAt || null,
  };
}

async function loadKudosForRecipient(db, toUid, dayKey) {
  if (!toUid || !dayKey) return [];
  const snap = await db
    .collection('kudos')
    .where('toUid', '==', toUid)
    .limit(100)
    .get();
  const rows = snap.docs
    .map(serializeKudos)
    .filter((row) => row.dayKey === dayKey);
  rows.sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
  return rows;
}

async function loadKudosSentBy(db, fromUid, dayKey) {
  if (!fromUid || !dayKey) return [];
  const snap = await db
    .collection('kudos')
    .where('fromUid', '==', fromUid)
    .limit(100)
    .get();
  const rows = snap.docs
    .map(serializeKudos)
    .filter((row) => row.dayKey === dayKey);
  rows.sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
  return rows;
}

async function loadKudosHistoryForRecipient(db, toUid, { limit = 50 } = {}) {
  if (!toUid) return [];
  const snap = await db
    .collection('kudos')
    .where('toUid', '==', toUid)
    .limit(Math.min(200, Math.max(1, limit * 2)))
    .get();
  const rows = snap.docs.map(serializeKudos);
  rows.sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
  return rows.slice(0, limit);
}

async function countKudosSentToday(db, fromUid, dayKey) {
  const rows = await loadKudosSentBy(db, fromUid, dayKey);
  return rows.length;
}

function serializeKudosGif(doc) {
  const data = doc.data ? (doc.data() || {}) : (doc || {});
  return {
    id: doc.id || data.id || '',
    url: data.url || '',
    storagePath: data.storagePath || '',
    fileName: data.fileName || 'kudos.gif',
    uploadedByUid: data.uploadedByUid || '',
    uploadedByName: data.uploadedByName || 'Manager',
    createdAt: data.createdAt?.toDate?.()?.toISOString?.() || data.createdAt || null,
  };
}

async function loadKudosGifLibrary(db, { limit = 60 } = {}) {
  const snap = await db.collection('kudos_gifs').limit(Math.min(120, Math.max(1, limit * 2))).get();
  const byUrl = new Map();
  snap.docs.map(serializeKudosGif).filter((row) => row.url).forEach((row) => {
    byUrl.set(row.url, row);
  });

  // Backfill any older kudos GIFs that predate the shared library collection.
  if (byUrl.size < limit) {
    try {
      const kudosSnap = await db.collection('kudos').orderBy('createdAt', 'desc').limit(100).get();
      kudosSnap.docs.forEach((doc) => {
        const data = doc.data() || {};
        const url = String(data.gifUrl || '').trim();
        if (!url || byUrl.has(url)) return;
        byUrl.set(url, {
          id: `legacy-${doc.id}`,
          url,
          storagePath: '',
          fileName: 'kudos.gif',
          uploadedByUid: data.fromUid || '',
          uploadedByName: data.fromName || 'Manager',
          createdAt: data.createdAt?.toDate?.()?.toISOString?.() || data.createdAt || null,
        });
      });
    } catch (error) {
      console.warn('kudos gif library backfill skipped', error?.message || error);
    }
  }

  const rows = Array.from(byUrl.values());
  rows.sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
  return rows.slice(0, limit);
}

async function findKudosGifByUrl(db, gifUrl) {
  const url = String(gifUrl || '').trim();
  if (!url) return null;
  const snap = await db.collection('kudos_gifs').where('url', '==', url).limit(1).get();
  if (!snap.empty) return serializeKudosGif(snap.docs[0]);

  // Allow reuse of GIFs already attached to prior kudos (before library existed).
  const kudosSnap = await db.collection('kudos').where('gifUrl', '==', url).limit(1).get();
  if (kudosSnap.empty) return null;
  const data = kudosSnap.docs[0].data() || {};
  return {
    id: `legacy-${kudosSnap.docs[0].id}`,
    url,
    storagePath: '',
    fileName: 'kudos.gif',
    uploadedByUid: data.fromUid || '',
    uploadedByName: data.fromName || 'Manager',
    createdAt: data.createdAt?.toDate?.()?.toISOString?.() || data.createdAt || null,
  };
}

async function saveKudosGifToLibrary(db, {
  url,
  storagePath,
  fileName,
  uploadedByUid,
  uploadedByName,
  FieldValue,
}) {
  const existing = await findKudosGifByUrl(db, url);
  if (existing) return existing;
  const ref = await db.collection('kudos_gifs').add({
    url,
    storagePath: storagePath || '',
    fileName: fileName || 'kudos.gif',
    uploadedByUid: uploadedByUid || '',
    uploadedByName: uploadedByName || 'Manager',
    createdAt: FieldValue.serverTimestamp(),
  });
  const snap = await ref.get();
  return serializeKudosGif(snap);
}

module.exports = {
  BADGE_TYPES,
  BADGE_KEYS,
  MAX_MESSAGE_LENGTH,
  MAX_KUDOS_PER_DAY,
  MAX_KUDOS_RECIPIENTS_PER_SEND,
  MAX_GIF_BYTES,
  listBadgeTypes,
  isValidBadgeType,
  normalizeMessage,
  normalizeRecipientUids,
  decodeGifPayload,
  serializeKudos,
  serializeKudosGif,
  loadKudosForRecipient,
  loadKudosSentBy,
  loadKudosHistoryForRecipient,
  countKudosSentToday,
  loadKudosGifLibrary,
  findKudosGifByUrl,
  saveKudosGifToLibrary,
};
