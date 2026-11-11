/**
 * HTTP handlers for saved Roll call lists.
 */

const nodemailer = require('nodemailer');

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

function normalizeMemberStatus(status, ticked) {
  const s = toTrimmedString(status).toLowerCase();
  if (s === 'confirmed' || s === 'available') return 'confirmed';
  if (s === 'rejected' || s === 'not_available' || s === 'unavailable') return 'rejected';
  if (s === 'seen') return 'seen';
  if (s === 'sent') return 'sent';
  if (ticked) return 'confirmed';
  return 'sent';
}

function serializeMember(member) {
  const ticked = Boolean(member?.ticked);
  const status = normalizeMemberStatus(member?.status, ticked);
  return {
    uid: toTrimmedString(member?.uid),
    fullName: toTrimmedString(member?.fullName) || toTrimmedString(member?.email) || 'Unknown',
    email: toTrimmedString(member?.email),
    ticked,
    tickedAt: serializeTimestamp(member?.tickedAt),
    tickedByUid: toTrimmedString(member?.tickedByUid) || null,
    tickedByName: toTrimmedString(member?.tickedByName) || null,
    status,
    sentAt: serializeTimestamp(member?.sentAt),
    seenAt: serializeTimestamp(member?.seenAt),
    respondedAt: serializeTimestamp(member?.respondedAt),
    responseNote: toTrimmedString(member?.responseNote) || null,
    responseMethod: toTrimmedString(member?.responseMethod) || null,
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
  const confirmed = members.filter((member) => member?.status === 'confirmed' || member?.ticked).length;
  const rejected = members.filter((member) => member?.status === 'rejected').length;
  const seen = members.filter((member) => member?.status === 'seen').length;
  const sent = members.filter((member) => !member?.status || member?.status === 'sent').length;
  const done = confirmed;

  return {
    id,
    title: toTrimmedString(data.title) || 'Untitled roll call',
    message: toTrimmedString(data.message) || '',
    confirmLabel: toTrimmedString(data.confirmLabel) || 'I am available',
    rejectLabel: toTrimmedString(data.rejectLabel) || 'I am not available',
    distributed: Boolean(data.distributed),
    distributedAt: serializeTimestamp(data.distributedAt),
    distributedByUid: toTrimmedString(data.distributedByUid) || null,
    distributedByName: toTrimmedString(data.distributedByName) || null,
    totalCount: total,
    doneCount: done,
    confirmedCount: confirmed,
    rejectedCount: rejected,
    seenCount: seen,
    sentCount: sent,
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

async function sendRollCallDistributionEmails({
  list,
  members,
  senderName,
  getGmailCredentials,
}) {
  const creds = typeof getGmailCredentials === 'function' ? getGmailCredentials() : null;
  if (!creds?.user || !creds?.pass) {
    console.warn('Gmail credentials not configured. Skipping roll call distribution emails.');
    return { attempted: 0, sent: 0, skipped: members.length };
  }

  let transporter;
  try {
    transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: creds.user,
        pass: creds.pass,
      },
    });
  } catch (error) {
    console.error('Failed to create mail transporter for roll call distribution', error);
    return { attempted: 0, sent: 0, skipped: members.length };
  }

  const portalUrl = 'https://employee.countrylion.co.uk/dashboard/profile';
  const cleanTitle = toTrimmedString(list.title) || 'Roll Call';
  const cleanMessage = toTrimmedString(list.message);
  const confirmLabel = toTrimmedString(list.confirmLabel) || 'I am available';
  const rejectLabel = toTrimmedString(list.rejectLabel) || 'I am not available';

  let sentCount = 0;
  let attemptedCount = 0;

  const emailPromises = members
    .filter((member) => member?.email && member.email.includes('@'))
    .map(async (member) => {
      attemptedCount++;
      const safeName = toTrimmedString(member.fullName) || 'there';
      const toEmail = toTrimmedString(member.email).toLowerCase();

      const text = [
        `Hello ${safeName},`,
        '',
        `You have received a new roll call confirmation request from ${senderName}:`,
        `"${cleanTitle}"`,
        '',
        ...(cleanMessage ? [`Details / Message:`, cleanMessage, ''] : []),
        `Please log in to the Country Lion Employee Portal to respond with "${confirmLabel}" or "${rejectLabel}":`,
        portalUrl,
        '',
        `Thank you,`,
        `Country Lion Management`,
      ].join('\n');

      const html = `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Roll Call: ${cleanTitle}</title>
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f1f5f9; margin: 0; padding: 24px; color: #1e293b; }
            .card { max-width: 580px; margin: 0 auto; background-color: #ffffff; border-radius: 12px; border: 1px solid #e2e8f0; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05); }
            .header { background-color: #0b1220; color: #ffffff; padding: 24px 32px; border-bottom: 3px solid #6366f1; }
            .header h1 { margin: 0; font-size: 20px; font-weight: 700; letter-spacing: -0.025em; color: #ffffff; }
            .header p { margin: 6px 0 0; font-size: 13px; color: #94a3b8; }
            .content { padding: 32px; }
            .prompt-box { background-color: #f8fafc; border-left: 4px solid #6366f1; border-radius: 0 8px 8px 0; padding: 16px 20px; margin: 20px 0; }
            .prompt-title { font-size: 16px; font-weight: 600; color: #0f172a; margin-bottom: 6px; }
            .prompt-msg { font-size: 14px; color: #475569; white-space: pre-wrap; line-height: 1.5; }
            .btn-container { margin: 28px 0 20px; text-align: center; }
            .btn { display: inline-block; background-color: #4f46e5; color: #ffffff !important; text-decoration: none; padding: 14px 32px; border-radius: 8px; font-weight: 600; font-size: 15px; box-shadow: 0 2px 4px rgba(79, 70, 229, 0.25); }
            .footer { padding: 20px 32px; background-color: #f8fafc; border-top: 1px solid #e2e8f0; font-size: 12px; color: #64748b; text-align: center; }
          </style>
        </head>
        <body>
          <div class="card">
            <div class="header">
              <h1>Country Lion Employee Portal</h1>
              <p>Staff Roll Call &amp; Availability Confirmation</p>
            </div>
            <div class="content">
              <p style="font-size: 16px; margin-top: 0;">Hello <strong>${safeName}</strong>,</p>
              <p style="font-size: 14px; line-height: 1.6; color: #334155;">
                <strong>${senderName}</strong> has issued a roll call request and requested your confirmation:
              </p>
              <div class="prompt-box">
                <div class="prompt-title">${cleanTitle}</div>
                ${cleanMessage ? `<div class="prompt-msg">${cleanMessage}</div>` : ''}
              </div>
              <p style="font-size: 14px; line-height: 1.6; color: #334155;">
                Please open your Employee Portal to respond with <strong>&ldquo;${confirmLabel}&rdquo;</strong> or <strong>&ldquo;${rejectLabel}&rdquo;</strong>:
              </p>
              <div class="btn-container">
                <a href="${portalUrl}" class="btn" target="_blank" rel="noopener noreferrer">Respond on Employee Portal</a>
              </div>
              <p style="font-size: 12px; color: #94a3b8; text-align: center; margin-bottom: 0;">
                Direct link: <a href="${portalUrl}" style="color: #6366f1;">${portalUrl}</a>
              </p>
            </div>
            <div class="footer">
              This automated message was sent from Country Lion Employee Management.
            </div>
          </div>
        </body>
        </html>
      `;

      try {
        await transporter.sendMail({
          from: `"Country Lion HR" <${creds.user}>`,
          to: toEmail,
          subject: `Action Required: Roll Call – ${cleanTitle}`,
          text,
          html,
        });
        sentCount++;
      } catch (err) {
        console.error(`Failed to send roll call email to ${toEmail}:`, err.message);
      }
    });

  await Promise.allSettled(emailPromises);
  return { attempted: attemptedCount, sent: sentCount, skipped: members.length - attemptedCount };
}

function createRollCallListsApi({
  admin,
  db,
  onRequest,
  withCors,
  getVerifiedSessionUser,
  getEffectivePortalRole,
  canViewAllEmployeeProfiles,
  gmailSecrets = [],
  getGmailCredentials = null,
}) {
  const secretOpts = Array.isArray(gmailSecrets) && gmailSecrets.length > 0 ? { secrets: gmailSecrets } : {};

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
            status: existing.status || (existing.ticked ? 'confirmed' : 'sent'),
            sentAt: existing.sentAt || null,
            seenAt: existing.seenAt || null,
            respondedAt: existing.respondedAt || null,
            responseNote: existing.responseNote || null,
            responseMethod: existing.responseMethod || null,
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
          status: existing.status || (existing.ticked ? 'confirmed' : 'sent'),
          sentAt: existing.sentAt || null,
          seenAt: existing.seenAt || null,
          respondedAt: existing.respondedAt || null,
          responseNote: existing.responseNote || null,
          responseMethod: existing.responseMethod || null,
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
          status: 'sent',
          sentAt: null,
          seenAt: null,
          respondedAt: null,
          responseNote: null,
          responseMethod: null,
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
    { region: 'europe-west2', ...secretOpts },
    withCors(async (req, res) => {
      if (req.method !== 'POST') {
        res.status(405).json({ error: 'Method not allowed.' });
        return;
      }

      const session = await getVerifiedSessionUser(req);
      if (!assertAccess(session, res)) return;

      const title = toTrimmedString(req.body?.title);
      const message = toTrimmedString(req.body?.message);
      const confirmLabel = toTrimmedString(req.body?.confirmLabel) || 'I am available';
      const rejectLabel = toTrimmedString(req.body?.rejectLabel) || 'I am not available';
      const distribute = Boolean(req.body?.distribute);
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
        const rawMembers = await resolveMembers(memberUids);
        if (rawMembers.length === 0) {
          res.status(400).json({ error: 'None of the selected employees were found.' });
          return;
        }

        const name = actorName(session.profile);
        const now = admin.firestore.Timestamp.now();

        const members = rawMembers.map((m) => ({
          ...m,
          status: 'sent',
          sentAt: distribute ? now : null,
          seenAt: null,
          respondedAt: null,
          responseNote: null,
          ticked: false,
          tickedAt: null,
          tickedByUid: null,
          tickedByName: null,
        }));

        const docPayload = {
          title,
          message,
          confirmLabel,
          rejectLabel,
          members,
          distributed: distribute,
          distributedAt: distribute ? now : null,
          distributedByUid: distribute ? session.profile.uid : null,
          distributedByName: distribute ? name : null,
          archived: false,
          archivedAt: null,
          createdByUid: session.profile.uid,
          createdByName: name,
          updatedByUid: session.profile.uid,
          updatedByName: name,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        };

        const ref = await db.collection(COLLECTION).add(docPayload);
        const snap = await ref.get();
        const serialized = serializeList(snap);

        if (distribute) {
          // Send distribution emails asynchronously
          sendRollCallDistributionEmails({
            list: { title, message, confirmLabel, rejectLabel },
            members,
            senderName: name,
            getGmailCredentials,
          }).catch((err) => {
            console.error('Error dispatching distribution emails:', err);
          });
        }

        res.status(201).json({ list: serialized });
      } catch (error) {
        console.error('createRollCallList failed', error);
        res.status(500).json({ error: 'Failed to create roll call list.' });
      }
    }),
  );

  const distributeRollCallList = onRequest(
    { region: 'europe-west2', ...secretOpts },
    withCors(async (req, res) => {
      if (req.method !== 'POST') {
        res.status(405).json({ error: 'Method not allowed.' });
        return;
      }

      const session = await getVerifiedSessionUser(req);
      if (!assertAccess(session, res)) return;

      const listId = toTrimmedString(req.body?.listId);
      const message = req.body?.message !== undefined ? toTrimmedString(req.body.message) : null;
      const resendAll = Boolean(req.body?.resendAll);

      if (!listId) {
        res.status(400).json({ error: 'listId is required.' });
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
        const name = actorName(session.profile);
        const now = admin.firestore.Timestamp.now();

        const currentMembers = Array.isArray(data.members) ? data.members : [];
        const updatedMembers = currentMembers.map((member) => {
          const currentStatus = normalizeMemberStatus(member.status, member.ticked);
          if (resendAll || (currentStatus !== 'confirmed' && currentStatus !== 'rejected')) {
            return {
              ...member,
              status: 'sent',
              sentAt: now,
              seenAt: null,
              respondedAt: null,
              responseNote: null,
              ticked: false,
              tickedAt: null,
              tickedByUid: null,
              tickedByName: null,
            };
          }
          return member;
        });

        const patch = {
          distributed: true,
          distributedAt: now,
          distributedByUid: session.profile.uid,
          distributedByName: name,
          updatedByUid: session.profile.uid,
          updatedByName: name,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          members: updatedMembers,
        };

        if (message !== null) {
          patch.message = message;
        }
        if (req.body?.confirmLabel !== undefined) {
          patch.confirmLabel = toTrimmedString(req.body.confirmLabel) || 'I am available';
        }
        if (req.body?.rejectLabel !== undefined) {
          patch.rejectLabel = toTrimmedString(req.body.rejectLabel) || 'I am not available';
        }

        await ref.update(patch);
        const updatedSnap = await ref.get();
        const serialized = serializeList(updatedSnap);

        // Send distribution emails
        const recipients = resendAll
          ? updatedMembers
          : updatedMembers.filter((m) => m.status === 'sent');

        sendRollCallDistributionEmails({
          list: {
            title: data.title || '',
            message: message !== null ? message : data.message || '',
            confirmLabel: patch.confirmLabel || data.confirmLabel || 'I am available',
            rejectLabel: patch.rejectLabel || data.rejectLabel || 'I am not available',
          },
          members: recipients,
          senderName: name,
          getGmailCredentials,
        }).catch((err) => {
          console.error('Error dispatching distribution emails:', err);
        });

        res.status(200).json({ list: serialized });
      } catch (error) {
        console.error('distributeRollCallList failed', error);
        res.status(500).json({ error: 'Failed to distribute roll call list.' });
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
      const hasMessage = Object.prototype.hasOwnProperty.call(req.body || {}, 'message');
      const hasMembers = Object.prototype.hasOwnProperty.call(req.body || {}, 'memberUids');
      const hasConfirmLabel = Object.prototype.hasOwnProperty.call(req.body || {}, 'confirmLabel');
      const hasRejectLabel = Object.prototype.hasOwnProperty.call(req.body || {}, 'rejectLabel');
      if (!hasTitle && !hasMessage && !hasMembers && !hasConfirmLabel && !hasRejectLabel) {
        res.status(400).json({ error: 'Provide title, message, memberUids, or response labels to update.' });
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
        if (hasMessage) patch.message = toTrimmedString(req.body.message);
        if (hasConfirmLabel) patch.confirmLabel = toTrimmedString(req.body.confirmLabel) || 'I am available';
        if (hasRejectLabel) patch.rejectLabel = toTrimmedString(req.body.rejectLabel) || 'I am not available';

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
        const name = actorName(session.profile);
        const now = admin.firestore.Timestamp.now();

        if (ticked) {
          members[index] = {
            ...current,
            uid,
            fullName: current.fullName || uid,
            email: current.email || '',
            ticked: true,
            tickedAt: now,
            tickedByUid: session.profile.uid,
            tickedByName: name,
            status: 'confirmed',
            respondedAt: current.respondedAt || now,
            responseMethod: 'admin',
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
            status: current.seenAt ? 'seen' : 'sent',
            respondedAt: null,
            responseNote: null,
            responseMethod: null,
          };
        }

        await ref.update({
          members,
          updatedByUid: session.profile.uid,
          updatedByName: name,
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

  const setRollCallMemberStatus = onRequest(
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
      const rawStatus = toTrimmedString(req.body?.status).toLowerCase();
      const note = req.body?.note !== undefined ? toTrimmedString(req.body.note) : null;

      if (!listId || !uid || !rawStatus) {
        res.status(400).json({ error: 'listId, uid, and status are required.' });
        return;
      }

      const status = normalizeMemberStatus(rawStatus, false);

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
        const name = actorName(session.profile);
        const now = admin.firestore.Timestamp.now();

        const isConfirmed = status === 'confirmed';
        const isRejected = status === 'rejected';

        members[index] = {
          ...current,
          uid,
          fullName: current.fullName || uid,
          email: current.email || '',
          status,
          ticked: isConfirmed,
          tickedAt: isConfirmed ? now : null,
          tickedByUid: isConfirmed ? session.profile.uid : null,
          tickedByName: isConfirmed ? name : null,
          respondedAt: (isConfirmed || isRejected) ? now : null,
          seenAt: (status === 'seen' || isConfirmed || isRejected) ? (current.seenAt || now) : current.seenAt,
          responseNote: note !== null ? note : current.responseNote || null,
          responseMethod: 'admin',
        };

        await ref.update({
          members,
          updatedByUid: session.profile.uid,
          updatedByName: name,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });

        const updated = await ref.get();
        res.status(200).json({ list: serializeList(updated) });
      } catch (error) {
        console.error('setRollCallMemberStatus failed', error);
        res.status(500).json({ error: 'Failed to update member status.' });
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

  // --- EMPLOYEE-FACING ENDPOINTS ---

  const getMyPendingRollCalls = onRequest(
    { region: 'europe-west2' },
    withCors(async (req, res) => {
      if (req.method !== 'GET') {
        res.status(405).json({ error: 'Method not allowed.' });
        return;
      }

      const session = await getVerifiedSessionUser(req);
      if (!session) {
        res.status(401).json({ error: 'Authentication required.' });
        return;
      }

      const myUid = session.profile.uid;

      try {
        const snap = await db.collection(COLLECTION)
          .where('archived', '==', false)
          .where('distributed', '==', true)
          .get();

        const rollCalls = [];

        for (const doc of snap.docs) {
          const data = doc.data() || {};
          const members = Array.isArray(data.members) ? data.members : [];
          const memberEntry = members.find((m) => toTrimmedString(m?.uid) === myUid);
          if (!memberEntry) continue;

          rollCalls.push({
            id: doc.id,
            title: toTrimmedString(data.title) || 'Untitled roll call',
            message: toTrimmedString(data.message) || '',
            confirmLabel: toTrimmedString(data.confirmLabel) || 'I am available',
            rejectLabel: toTrimmedString(data.rejectLabel) || 'I am not available',
            distributedAt: serializeTimestamp(data.distributedAt),
            distributedByName: toTrimmedString(data.distributedByName) || 'Admin',
            createdAt: serializeTimestamp(data.createdAt),
            myMember: {
              status: normalizeMemberStatus(memberEntry.status, memberEntry.ticked),
              sentAt: serializeTimestamp(memberEntry.sentAt),
              seenAt: serializeTimestamp(memberEntry.seenAt),
              respondedAt: serializeTimestamp(memberEntry.respondedAt),
              responseNote: toTrimmedString(memberEntry.responseNote) || '',
            },
          });
        }

        // Sort by distributedAt descending
        rollCalls.sort((a, b) => String(b.distributedAt || '').localeCompare(String(a.distributedAt || '')));

        res.status(200).json({ rollCalls });
      } catch (error) {
        console.error('getMyPendingRollCalls failed', error);
        res.status(500).json({ error: 'Failed to load roll calls.' });
      }
    }),
  );

  const markRollCallSeen = onRequest(
    { region: 'europe-west2' },
    withCors(async (req, res) => {
      if (req.method !== 'POST') {
        res.status(405).json({ error: 'Method not allowed.' });
        return;
      }

      const session = await getVerifiedSessionUser(req);
      if (!session) {
        res.status(401).json({ error: 'Authentication required.' });
        return;
      }

      const listId = toTrimmedString(req.body?.listId);
      if (!listId) {
        res.status(400).json({ error: 'listId is required.' });
        return;
      }

      const myUid = session.profile.uid;

      try {
        const ref = db.collection(COLLECTION).doc(listId);
        const snap = await ref.get();
        if (!snap.exists) {
          res.status(404).json({ error: 'Roll call list not found.' });
          return;
        }

        const data = snap.data() || {};
        const members = Array.isArray(data.members) ? [...data.members] : [];
        const index = members.findIndex((m) => toTrimmedString(m?.uid) === myUid);
        if (index < 0) {
          res.status(403).json({ error: 'You are not on this roll call.' });
          return;
        }

        const current = members[index];
        const currentStatus = normalizeMemberStatus(current.status, current.ticked);

        // Only update to seen if it is currently 'sent'
        if (currentStatus === 'sent') {
          members[index] = {
            ...current,
            status: 'seen',
            seenAt: admin.firestore.Timestamp.now(),
          };

          await ref.update({
            members,
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          });
        }

        res.status(200).json({ ok: true, status: currentStatus === 'sent' ? 'seen' : currentStatus });
      } catch (error) {
        console.error('markRollCallSeen failed', error);
        res.status(500).json({ error: 'Failed to mark roll call seen.' });
      }
    }),
  );

  const respondRollCall = onRequest(
    { region: 'europe-west2' },
    withCors(async (req, res) => {
      if (req.method !== 'POST') {
        res.status(405).json({ error: 'Method not allowed.' });
        return;
      }

      const session = await getVerifiedSessionUser(req);
      if (!session) {
        res.status(401).json({ error: 'Authentication required.' });
        return;
      }

      const listId = toTrimmedString(req.body?.listId);
      const rawStatus = toTrimmedString(req.body?.status || req.body?.response).toLowerCase();
      const note = toTrimmedString(req.body?.note);

      if (!listId || !rawStatus) {
        res.status(400).json({ error: 'listId and status are required.' });
        return;
      }

      const status = normalizeMemberStatus(rawStatus, false);
      if (status !== 'confirmed' && status !== 'rejected') {
        res.status(400).json({ error: 'Status must be confirmed (available) or rejected (not available).' });
        return;
      }

      const myUid = session.profile.uid;

      try {
        const ref = db.collection(COLLECTION).doc(listId);
        const snap = await ref.get();
        if (!snap.exists) {
          res.status(404).json({ error: 'Roll call list not found.' });
          return;
        }

        const data = snap.data() || {};
        const members = Array.isArray(data.members) ? [...data.members] : [];
        const index = members.findIndex((m) => toTrimmedString(m?.uid) === myUid);
        if (index < 0) {
          res.status(403).json({ error: 'You are not on this roll call.' });
          return;
        }

        const current = members[index];
        const now = admin.firestore.Timestamp.now();
        const isConfirmed = status === 'confirmed';

        members[index] = {
          ...current,
          status,
          ticked: isConfirmed,
          tickedAt: isConfirmed ? now : null,
          tickedByUid: isConfirmed ? myUid : null,
          tickedByName: isConfirmed ? actorName(session.profile) : null,
          respondedAt: now,
          seenAt: current.seenAt || now,
          responseNote: note || current.responseNote || null,
          responseMethod: 'portal',
        };

        await ref.update({
          members,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });

        res.status(200).json({
          ok: true,
          status,
          respondedAt: now.toDate().toISOString(),
          responseNote: note || current.responseNote || null,
        });
      } catch (error) {
        console.error('respondRollCall failed', error);
        res.status(500).json({ error: 'Failed to submit response.' });
      }
    }),
  );

  return {
    getRollCallLists,
    getRollCallList,
    createRollCallList,
    distributeRollCallList,
    updateRollCallList,
    setRollCallMemberTick,
    setRollCallMemberStatus,
    deleteRollCallList,
    getMyPendingRollCalls,
    markRollCallSeen,
    respondRollCall,
  };
}

module.exports = {
  COLLECTION,
  createRollCallListsApi,
};
