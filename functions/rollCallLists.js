/**
 * HTTP handlers for saved Roll call lists.
 */

const COLLECTION = 'roll_call_lists';

function toTrimmedString(value) {
  return String(value || '').trim();
}

function serializeTimestamp(value) {
  if (!value) return null;
  if (typeof value.toDate === 'function') return value.toDate().toISOString();
  if (value._seconds) return new Date(value._seconds * 1000).toISOString();
  if (typeof value === 'string') return value;
  return null;
}

function actorName(profile) {
  return toTrimmedString(profile?.fullName) || toTrimmedString(profile?.email) || 'Unknown';
}

function serializeMember(member) {
  return {
    uid: toTrimmedString(member?.uid),
    fullName: toTrimmedString(member?.fullName) || toTrimmedString(member?.email) || 'Unknown',
    email: toTrimmedString(member?.email),
    ticked: Boolean(member?.ticked),
    tickedAt: serializeTimestamp(member?.tickedAt),
    tickedByUid: toTrimmedString(member?.tickedByUid) || null,
    tickedByName: toTrimmedString(member?.tickedByName) || null,
  };
}

function percentComplete(done, total) {
  if (!total) return 0;
  return Math.round((done / total) * 100);
}

function serializeListSummary(doc) {
  const data = typeof doc.data === 'function' ? doc.data() : doc;
  const id = doc.id || data.id;
  const members = Array.isArray(data.members) ? data.members : [];
  const total = members.length;
  const done = members.filter((member) => member?.ticked).length;
  return {
    id,
    title: toTrimmedString(data.title) || 'Untitled roll call',
    totalCount: total,
    doneCount: done,
    percentComplete: percentComplete(done, total),
    archived: data.archived === true,
    archivedAt: serializeTimestamp(data.archivedAt),
    createdByUid: toTrimmedString(data.createdByUid),
    createdByName: toTrimmedString(data.createdByName),
    updatedByUid: toTrimmedString(data.updatedByUid),
    updatedByName: toTrimmedString(data.updatedByName),
    createdAt: serializeTimestamp(data.createdAt),
    updatedAt: serializeTimestamp(data.updatedAt),
  };
}

function serializeList(doc) {
  const data = typeof doc.data === 'function' ? doc.data() : doc;
  const summary = serializeListSummary(doc);
  const members = (Array.isArray(data.members) ? data.members : [])
    .map(serializeMember)
    .sort((left, right) => left.fullName.localeCompare(right.fullName, undefined, { sensitivity: 'base' }));
  return {
    ...summary,
    members,
  };
}

function normalizeMemberUids(value) {
  if (!Array.isArray(value)) return [];
  const seen = new Set();
  const uids = [];
  for (const item of value) {
    const uid = toTrimmedString(item);
    if (!uid || seen.has(uid)) continue;
    seen.add(uid);
    uids.push(uid);
  }
  return uids;
}

function createRollCallListsApi({
  admin,
  db,
  onRequest,
  withCors,
  getVerifiedSessionUser,
  getEffectivePortalRole,
  canViewAllEmployeeProfiles,
}) {
  function assertAccess(session, res) {
    if (!session) {
      res.status(401).json({ error: 'Authentication required.' });
      return false;
    }
    if (!canViewAllEmployeeProfiles(session.profile, getEffectivePortalRole)) {
      res.status(403).json({ error: 'Employee directory access required.' });
      return false;
    }
    return true;
  }

  async function resolveMembers(memberUids, existingByUid = new Map()) {
    const members = [];
    for (const uid of memberUids) {
      const existing = existingByUid.get(uid);
      const userSnap = await db.collection('users').doc(uid).get();
      if (!userSnap.exists) {
        if (existing) {
          members.push({
            uid: existing.uid,
            fullName: existing.fullName || existing.email || uid,
            email: existing.email || '',
            ticked: Boolean(existing.ticked),
            tickedAt: existing.tickedAt || null,
            tickedByUid: existing.tickedByUid || null,
            tickedByName: existing.tickedByName || null,
          });
        }
        continue;
      }
      const data = userSnap.data() || {};
      const fullName = toTrimmedString(data.fullName) || toTrimmedString(data.email) || uid;
      const email = toTrimmedString(data.email);
      if (existing) {
        members.push({
          uid,
          fullName,
          email,
          ticked: Boolean(existing.ticked),
          tickedAt: existing.tickedAt || null,
          tickedByUid: existing.tickedByUid || null,
          tickedByName: existing.tickedByName || null,
        });
      } else {
        members.push({
          uid,
          fullName,
          email,
          ticked: false,
          tickedAt: null,
          tickedByUid: null,
          tickedByName: null,
        });
      }
    }
    members.sort((left, right) => left.fullName.localeCompare(right.fullName, undefined, { sensitivity: 'base' }));
    return members;
  }

  const getRollCallLists = onRequest(
    { region: 'europe-west2' },
    withCors(async (req, res) => {
      if (req.method !== 'GET') {
        res.status(405).json({ error: 'Method not allowed.' });
        return;
      }

      const session = await getVerifiedSessionUser(req);
      if (!assertAccess(session, res)) return;

      try {
        const snap = await db.collection(COLLECTION).get();
        const lists = snap.docs
          .map(serializeListSummary)
          .sort((left, right) => String(right.updatedAt || '').localeCompare(String(left.updatedAt || '')));
        res.status(200).json({ lists });
      } catch (error) {
        console.error('getRollCallLists failed', error);
        res.status(500).json({ error: 'Failed to load roll call lists.' });
      }
    }),
  );

  const getRollCallList = onRequest(
    { region: 'europe-west2' },
    withCors(async (req, res) => {
      if (req.method !== 'GET') {
        res.status(405).json({ error: 'Method not allowed.' });
        return;
      }

      const session = await getVerifiedSessionUser(req);
      if (!assertAccess(session, res)) return;

      const listId = toTrimmedString(req.path.split('/').pop());
      if (!listId || listId === 'getRollCallList') {
        res.status(400).json({ error: 'List id is required.' });
        return;
      }

      try {
        const snap = await db.collection(COLLECTION).doc(listId).get();
        if (!snap.exists) {
          res.status(404).json({ error: 'Roll call list not found.' });
          return;
        }
        res.status(200).json({ list: serializeList(snap) });
      } catch (error) {
        console.error('getRollCallList failed', error);
        res.status(500).json({ error: 'Failed to load roll call list.' });
      }
    }),
  );

  const createRollCallList = onRequest(
    { region: 'europe-west2' },
    withCors(async (req, res) => {
      if (req.method !== 'POST') {
        res.status(405).json({ error: 'Method not allowed.' });
        return;
      }

      const session = await getVerifiedSessionUser(req);
      if (!assertAccess(session, res)) return;

      const title = toTrimmedString(req.body?.title);
      const memberUids = normalizeMemberUids(req.body?.memberUids);
      if (!title) {
        res.status(400).json({ error: 'Title is required.' });
        return;
      }
      if (memberUids.length === 0) {
        res.status(400).json({ error: 'Select at least one employee.' });
        return;
      }

      try {
        const members = await resolveMembers(memberUids);
        if (members.length === 0) {
          res.status(400).json({ error: 'None of the selected employees were found.' });
          return;
        }

        const name = actorName(session.profile);
        const ref = await db.collection(COLLECTION).add({
          title,
          members,
          archived: false,
          archivedAt: null,
          createdByUid: session.profile.uid,
          createdByName: name,
          updatedByUid: session.profile.uid,
          updatedByName: name,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        const snap = await ref.get();
        res.status(201).json({ list: serializeList(snap) });
      } catch (error) {
        console.error('createRollCallList failed', error);
        res.status(500).json({ error: 'Failed to create roll call list.' });
      }
    }),
  );

  const updateRollCallList = onRequest(
    { region: 'europe-west2' },
    withCors(async (req, res) => {
      if (req.method !== 'POST') {
        res.status(405).json({ error: 'Method not allowed.' });
        return;
      }

      const session = await getVerifiedSessionUser(req);
      if (!assertAccess(session, res)) return;

      const listId = toTrimmedString(req.body?.listId);
      if (!listId) {
        res.status(400).json({ error: 'listId is required.' });
        return;
      }

      const hasTitle = Object.prototype.hasOwnProperty.call(req.body || {}, 'title');
      const hasMembers = Object.prototype.hasOwnProperty.call(req.body || {}, 'memberUids');
      if (!hasTitle && !hasMembers) {
        res.status(400).json({ error: 'Provide title and/or memberUids to update.' });
        return;
      }

      const title = hasTitle ? toTrimmedString(req.body.title) : null;
      if (hasTitle && !title) {
        res.status(400).json({ error: 'Title cannot be empty.' });
        return;
      }

      try {
        const ref = db.collection(COLLECTION).doc(listId);
        const snap = await ref.get();
        if (!snap.exists) {
          res.status(404).json({ error: 'Roll call list not found.' });
          return;
        }

        const data = snap.data() || {};
        const patch = {
          updatedByUid: session.profile.uid,
          updatedByName: actorName(session.profile),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        };

        if (hasTitle) patch.title = title;

        if (hasMembers) {
          const memberUids = normalizeMemberUids(req.body.memberUids);
          if (memberUids.length === 0) {
            res.status(400).json({ error: 'Select at least one employee.' });
            return;
          }
          const existingByUid = new Map(
            (Array.isArray(data.members) ? data.members : [])
              .filter((member) => member?.uid)
              .map((member) => [toTrimmedString(member.uid), member]),
          );
          const members = await resolveMembers(memberUids, existingByUid);
          if (members.length === 0) {
            res.status(400).json({ error: 'None of the selected employees were found.' });
            return;
          }
          patch.members = members;
        }

        await ref.update(patch);
        const updated = await ref.get();
        res.status(200).json({ list: serializeList(updated) });
      } catch (error) {
        console.error('updateRollCallList failed', error);
        res.status(500).json({ error: 'Failed to update roll call list.' });
      }
    }),
  );

  const setRollCallMemberTick = onRequest(
    { region: 'europe-west2' },
    withCors(async (req, res) => {
      if (req.method !== 'POST') {
        res.status(405).json({ error: 'Method not allowed.' });
        return;
      }

      const session = await getVerifiedSessionUser(req);
      if (!assertAccess(session, res)) return;

      const listId = toTrimmedString(req.body?.listId);
      const uid = toTrimmedString(req.body?.uid);
      const ticked = Boolean(req.body?.ticked);
      if (!listId || !uid) {
        res.status(400).json({ error: 'listId and uid are required.' });
        return;
      }

      try {
        const ref = db.collection(COLLECTION).doc(listId);
        const snap = await ref.get();
        if (!snap.exists) {
          res.status(404).json({ error: 'Roll call list not found.' });
          return;
        }

        const data = snap.data() || {};
        const members = Array.isArray(data.members) ? [...data.members] : [];
        const index = members.findIndex((member) => toTrimmedString(member?.uid) === uid);
        if (index < 0) {
          res.status(404).json({ error: 'Employee is not on this list.' });
          return;
        }

        const current = members[index] || {};
        if (ticked) {
          members[index] = {
            ...current,
            uid,
            fullName: current.fullName || uid,
            email: current.email || '',
            ticked: true,
            tickedAt: admin.firestore.Timestamp.now(),
            tickedByUid: session.profile.uid,
            tickedByName: actorName(session.profile),
          };
        } else {
          members[index] = {
            ...current,
            uid,
            fullName: current.fullName || uid,
            email: current.email || '',
            ticked: false,
            tickedAt: null,
            tickedByUid: null,
            tickedByName: null,
          };
        }

        await ref.update({
          members,
          updatedByUid: session.profile.uid,
          updatedByName: actorName(session.profile),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });

        const updated = await ref.get();
        res.status(200).json({ list: serializeList(updated) });
      } catch (error) {
        console.error('setRollCallMemberTick failed', error);
        res.status(500).json({ error: 'Failed to update tick.' });
      }
    }),
  );

  // Soft-archive (or restore). Kept export name for existing hosting rewrites.
  const deleteRollCallList = onRequest(
    { region: 'europe-west2' },
    withCors(async (req, res) => {
      if (req.method !== 'POST') {
        res.status(405).json({ error: 'Method not allowed.' });
        return;
      }

      const session = await getVerifiedSessionUser(req);
      if (!assertAccess(session, res)) return;

      const listId = toTrimmedString(req.body?.listId);
      if (!listId) {
        res.status(400).json({ error: 'listId is required.' });
        return;
      }

      const archived = req.body?.archived === undefined ? true : Boolean(req.body.archived);

      try {
        const ref = db.collection(COLLECTION).doc(listId);
        const snap = await ref.get();
        if (!snap.exists) {
          res.status(404).json({ error: 'Roll call list not found.' });
          return;
        }

        const name = actorName(session.profile);
        await ref.update({
          archived,
          archivedAt: archived ? admin.firestore.FieldValue.serverTimestamp() : null,
          updatedByUid: session.profile.uid,
          updatedByName: name,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });

        const updated = await ref.get();
        res.status(200).json({ ok: true, listId, list: serializeListSummary(updated) });
      } catch (error) {
        console.error('deleteRollCallList failed', error);
        res.status(500).json({ error: archived ? 'Failed to archive roll call list.' : 'Failed to restore roll call list.' });
      }
    }),
  );

  return {
    getRollCallLists,
    getRollCallList,
    createRollCallList,
    updateRollCallList,
    setRollCallMemberTick,
    deleteRollCallList,
  };
}

module.exports = {
  COLLECTION,
  createRollCallListsApi,
};
