'use strict';

/**
 * Admin-authored Fun content (Connections, trivia, Sokoban).
 * Collection: fun_content/{docId} — type: connections | trivia | sokoban
 */

const { normalizeWord, groupHash, DIFFICULTIES } = require('./connections');
const { parseLayout } = require('./sokoban');

function slugify(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48) || `item-${Date.now()}`;
}

function validateConnectionsPayload(body = {}) {
  const title = String(body.title || '').trim().slice(0, 120);
  const groupsIn = Array.isArray(body.groups) ? body.groups : [];
  if (groupsIn.length !== 4) {
    throw Object.assign(new Error('Connections puzzles need exactly 4 groups.'), { status: 400 });
  }
  const groups = groupsIn.map((group, difficulty) => {
    const groupTitle = String(group?.title || '').trim().slice(0, 80);
    const words = (Array.isArray(group?.words) ? group.words : [])
      .map(normalizeWord)
      .filter(Boolean);
    if (!groupTitle) {
      throw Object.assign(new Error(`Group ${difficulty + 1} needs a title.`), { status: 400 });
    }
    if (words.length !== 4) {
      throw Object.assign(new Error(`Group “${groupTitle}” needs exactly 4 words.`), { status: 400 });
    }
    if (new Set(words).size !== 4) {
      throw Object.assign(new Error(`Group “${groupTitle}” has duplicate words.`), { status: 400 });
    }
    return { title: groupTitle, words };
  });

  const allWords = groups.flatMap((g) => g.words);
  if (new Set(allWords).size !== 16) {
    throw Object.assign(new Error('All 16 Connections words must be unique.'), { status: 400 });
  }

  const scheduledFor = String(body.scheduledFor || '').trim() || null;
  if (scheduledFor && !/^\d{4}-\d{2}-\d{2}$/.test(scheduledFor)) {
    throw Object.assign(new Error('scheduledFor must be YYYY-MM-DD.'), { status: 400 });
  }

  return {
    type: 'connections',
    title: title || groups[0].title,
    groups,
    scheduledFor,
    status: body.status === 'draft' ? 'draft' : 'published',
    active: body.active !== false,
  };
}

function validateTriviaPayload(body = {}) {
  const prompt = String(body.prompt || '').trim();
  const options = (Array.isArray(body.options) ? body.options : []).map((o) => String(o || '').trim());
  const correctIndex = Number(body.correctIndex);
  if (!prompt) {
    throw Object.assign(new Error('Trivia prompt is required.'), { status: 400 });
  }
  if (options.length !== 4 || options.some((o) => !o)) {
    throw Object.assign(new Error('Trivia needs exactly 4 non-empty options.'), { status: 400 });
  }
  if (!Number.isInteger(correctIndex) || correctIndex < 0 || correctIndex > 3) {
    throw Object.assign(new Error('correctIndex must be 0–3.'), { status: 400 });
  }
  const scheduledFor = String(body.scheduledFor || '').trim() || null;
  if (scheduledFor && !/^\d{4}-\d{2}-\d{2}$/.test(scheduledFor)) {
    throw Object.assign(new Error('scheduledFor must be YYYY-MM-DD.'), { status: 400 });
  }
  return {
    type: 'trivia',
    prompt,
    title: prompt.slice(0, 80),
    options,
    correctIndex,
    scheduledFor,
    status: body.status === 'draft' ? 'draft' : 'published',
    active: body.active !== false,
  };
}

function validateSokobanPayload(body = {}) {
  const title = String(body.title || '').trim().slice(0, 120) || 'Custom Sokoban';
  const difficulty = String(body.difficulty || 'custom').trim().slice(0, 32) || 'custom';
  const layoutIn = Array.isArray(body.layout) ? body.layout.map((row) => String(row ?? '')) : [];
  if (!layoutIn.length) {
    throw Object.assign(new Error('Sokoban layout is required.'), { status: 400 });
  }
  if (layoutIn.length > 16 || layoutIn.some((row) => row.length > 16)) {
    throw Object.assign(new Error('Sokoban layout max size is 16×16.'), { status: 400 });
  }
  let parsed;
  try {
    parsed = parseLayout(layoutIn);
  } catch (err) {
    throw Object.assign(new Error(err.message || 'Invalid Sokoban layout.'), { status: 400 });
  }
  if (parsed.boxes.length < 1) {
    throw Object.assign(new Error('Sokoban needs at least one box.'), { status: 400 });
  }
  if (parsed.boxes.length !== parsed.targets.length) {
    throw Object.assign(new Error('Number of boxes must equal number of goals.'), { status: 400 });
  }

  const scheduledFor = String(body.scheduledFor || '').trim() || null;
  if (scheduledFor && !/^\d{4}-\d{2}-\d{2}$/.test(scheduledFor)) {
    throw Object.assign(new Error('scheduledFor must be YYYY-MM-DD.'), { status: 400 });
  }

  return {
    type: 'sokoban',
    title,
    difficulty,
    layout: layoutIn,
    width: parsed.width,
    height: parsed.height,
    scheduledFor,
    status: body.status === 'draft' ? 'draft' : 'published',
    active: body.active !== false,
  };
}

function sokobanFromContent(item, dayKey) {
  const layout = Array.isArray(item.layout) ? item.layout : [];
  const parsed = parseLayout(layout);
  return {
    puzzleId: item.id || 'custom-sokoban',
    title: item.title || 'Custom Sokoban',
    difficulty: item.difficulty || 'custom',
    dayKey,
    width: parsed.width,
    height: parsed.height,
    walls: [...parsed.walls],
    targets: parsed.targets,
    initialPlayer: parsed.player,
    initialBoxes: parsed.boxes,
    layout,
    source: 'fun_content',
  };
}

function triviaFromContent(item, dayKey) {
  return {
    dayKey,
    questionId: item.id || item.questionId || 'custom',
    prompt: item.prompt,
    options: item.options,
    correctIndex: item.correctIndex,
    source: 'fun_content',
  };
}

function connectionsFromContent(item, dayKey, difficulties = DIFFICULTIES) {
  const id = item.id || 'custom';
  const groups = (item.groups || []).map((group, difficulty) => ({
    id: `${id}-${difficulty}`,
    title: group.title,
    words: (group.words || []).map(normalizeWord),
    difficulty,
    difficultyKey: difficulties[difficulty].key,
    color: difficulties[difficulty].color,
    label: difficulties[difficulty].label,
    hash: groupHash(group.words),
  }));
  return { id, dayKey, groups, source: 'fun_content' };
}

async function listFunContent(db, { type } = {}) {
  let snap;
  if (type) {
    snap = await db.collection('fun_content').where('type', '==', type).limit(200).get();
  } else {
    snap = await db.collection('fun_content').orderBy('updatedAt', 'desc').limit(200).get()
      .catch(async () => db.collection('fun_content').limit(200).get());
  }
  const rows = snap.docs.map((doc) => {
    const data = doc.data() || {};
    return {
      id: doc.id,
      type: data.type,
      title: data.title || data.prompt || doc.id,
      prompt: data.prompt || null,
      options: data.options || null,
      correctIndex: data.correctIndex ?? null,
      groups: data.groups || null,
      layout: data.layout || null,
      difficulty: data.difficulty || null,
      scheduledFor: data.scheduledFor || null,
      status: data.status || (data.active === false ? 'draft' : 'published'),
      active: data.active !== false,
      updatedAt: data.updatedAt?.toDate?.()?.toISOString?.() || null,
      createdAt: data.createdAt?.toDate?.()?.toISOString?.() || null,
    };
  });
  rows.sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')));
  return rows;
}

async function saveFunContent(db, { id = null, payload, uid, FieldValue }) {
  const validated = payload.type === 'trivia'
    ? validateTriviaPayload(payload)
    : payload.type === 'connections'
      ? validateConnectionsPayload(payload)
      : payload.type === 'sokoban'
        ? validateSokobanPayload(payload)
        : (() => { throw Object.assign(new Error('type must be trivia, connections, or sokoban.'), { status: 400 }); })();

  const docId = String(id || '').trim()
    || (validated.type === 'trivia'
      ? `trivia-${slugify(validated.prompt).slice(0, 24)}-${Date.now().toString(36)}`
      : validated.type === 'sokoban'
        ? `sokoban-${slugify(validated.title)}-${Date.now().toString(36)}`
        : `conn-${slugify(validated.title)}-${Date.now().toString(36)}`);

  const ref = db.collection('fun_content').doc(docId);
  const existing = await ref.get();
  const doc = {
    ...validated,
    updatedAt: FieldValue.serverTimestamp(),
    updatedBy: uid || null,
  };
  if (!existing.exists) {
    doc.createdAt = FieldValue.serverTimestamp();
    doc.createdBy = uid || null;
  }
  await ref.set(doc, { merge: true });
  return {
    id: docId,
    ...validated,
  };
}

async function deleteFunContent(db, id) {
  const ref = db.collection('fun_content').doc(String(id || ''));
  const snap = await ref.get();
  if (!snap.exists) {
    throw Object.assign(new Error('Content not found.'), { status: 404 });
  }
  await ref.delete();
  return { deleted: true, id: ref.id };
}

async function findPublishedForDay(db, type, dayKey) {
  const snap = await db.collection('fun_content')
    .where('type', '==', type)
    .where('scheduledFor', '==', dayKey)
    .limit(10)
    .get()
    .catch(() => ({ empty: true, docs: [] }));

  const live = snap.docs
    .map((doc) => ({ id: doc.id, ...(doc.data() || {}) }))
    .find((row) => row.active !== false && row.status !== 'draft');
  return live || null;
}

module.exports = {
  validateConnectionsPayload,
  validateTriviaPayload,
  validateSokobanPayload,
  triviaFromContent,
  connectionsFromContent,
  sokobanFromContent,
  listFunContent,
  saveFunContent,
  deleteFunContent,
  findPublishedForDay,
};
