'use strict';

const nodemailer = require('nodemailer');
const { restrictionLabel } = require('./peopleCases');

const SETTINGS_DOC = 'settings/caseStakeholderNotifications';
const EMPLOYEE_PORTAL_URL = 'https://employee.countrylion.co.uk';
const DEFAULT_TEST_EMAIL = 'dalewatkins@countrylion.co.uk';

const CHANNELS = [
  {
    id: 'restriction',
    label: 'Work restriction applied',
    description: 'Email when a work restriction is placed on an employee (e.g. no tour work).',
  },
  {
    id: 'written_warning',
    label: 'Written warning issued',
    description: 'Email when a written warning outcome is finalized.',
  },
  {
    id: 'final_written_warning',
    label: 'Final written warning issued',
    description: 'Email when a final written warning outcome is finalized.',
  },
];

function defaultChannelConfig() {
  return {
    enabled: true,
    emails: [DEFAULT_TEST_EMAIL],
  };
}

function defaultSettings() {
  return {
    restriction: defaultChannelConfig(),
    written_warning: defaultChannelConfig(),
    final_written_warning: defaultChannelConfig(),
  };
}

function normalizeEmailList(value) {
  const raw = Array.isArray(value) ? value : String(value || '').split(/[\n,;]+/);
  const seen = new Set();
  const emails = [];
  for (const item of raw) {
    const email = String(item || '').trim().toLowerCase();
    if (!email || !email.includes('@') || seen.has(email)) continue;
    seen.add(email);
    emails.push(email);
  }
  return emails;
}

function normalizeChannel(input) {
  const source = input && typeof input === 'object' ? input : {};
  return {
    enabled: source.enabled !== false,
    emails: normalizeEmailList(source.emails),
  };
}

function normalizeSettings(raw) {
  const base = defaultSettings();
  const data = raw && typeof raw === 'object' ? raw : {};
  return {
    restriction: normalizeChannel(data.restriction ?? base.restriction),
    written_warning: normalizeChannel(data.written_warning ?? base.written_warning),
    final_written_warning: normalizeChannel(data.final_written_warning ?? base.final_written_warning),
  };
}

async function loadCaseNotificationSettings(db) {
  const snap = await db.doc(SETTINGS_DOC).get();
  if (!snap.exists) {
    return { ...defaultSettings(), isDefault: true };
  }
  return { ...normalizeSettings(snap.data()), isDefault: false };
}

async function saveCaseNotificationSettings(db, admin, input, actor = {}) {
  const settings = normalizeSettings(input);
  await db.doc(SETTINGS_DOC).set({
    ...settings,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedByUid: actor.uid || '',
    updatedByName: actor.fullName || actor.email || '',
  }, { merge: true });
  return settings;
}

function createTransporter(gmailUser, gmailPass) {
  return nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: gmailUser,
      pass: gmailPass,
    },
  });
}

function formatUkDate(value) {
  const text = String(value || '').trim();
  const iso = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[3]}/${iso[2]}/${iso[1]}`;
  return text || '—';
}

function caseUrl(caseId) {
  return `${EMPLOYEE_PORTAL_URL}/dashboard/hr/cases/${caseId}`;
}

function buildEmailShell({ title, intro, rows, linkUrl, linkLabel }) {
  const rowHtml = rows.map(([label, value]) => (
    `<tr>
      <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;color:#64748b;font-size:13px;width:160px;">${label}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;color:#0f172a;font-size:14px;">${value}</td>
    </tr>`
  )).join('');
  return `<!DOCTYPE html>
<html><body style="margin:0;padding:24px;background:#f8fafc;font-family:Segoe UI,Arial,sans-serif;">
  <div style="max-width:640px;margin:0 auto;background:#ffffff;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;">
    <div style="padding:20px 24px;background:#0f172a;color:#fff;">
      <div style="font-size:12px;letter-spacing:0.08em;text-transform:uppercase;opacity:0.7;">Country Lion Employee Portal</div>
      <h1 style="margin:8px 0 0;font-size:20px;font-weight:600;">${title}</h1>
    </div>
    <div style="padding:20px 24px;">
      <p style="margin:0 0 16px;color:#334155;font-size:14px;line-height:1.5;">${intro}</p>
      <table style="width:100%;border-collapse:collapse;">${rowHtml}</table>
      <p style="margin:20px 0 0;">
        <a href="${linkUrl}" style="display:inline-block;padding:10px 16px;background:#4f46e5;color:#fff;text-decoration:none;border-radius:8px;font-size:14px;">${linkLabel}</a>
      </p>
    </div>
  </div>
</body></html>`;
}

function buildRestrictionEmail({ caseId, caseData }) {
  const employee = caseData.employeeNameSnapshot || 'Employee';
  const restriction = restrictionLabel(caseData.restrictionType, caseData.restrictionDetail);
  const expires = formatUkDate(caseData.restrictionExpiresAt);
  const subject = `Work restriction applied: ${employee} — ${restriction}`;
  const rows = [
    ['Employee', employee],
    ['Restriction', restriction],
    ['Expires', expires],
    ['Case', caseData.title || caseId],
    ['Family', String(caseData.processFamily || 'disciplinary').replace(/_/g, ' ')],
    ['Owner', caseData.managerNameSnapshot || '—'],
  ];
  const text = [
    'A work restriction has been applied in the Employee Portal.',
    '',
    ...rows.map(([k, v]) => `${k}: ${v}`),
    '',
    `Open case: ${caseUrl(caseId)}`,
  ].join('\n');
  const html = buildEmailShell({
    title: 'Work restriction applied',
    intro: 'A work restriction has been placed on an employee. Planning and other stakeholders may need to update duties accordingly.',
    rows,
    linkUrl: caseUrl(caseId),
    linkLabel: 'Open case',
  });
  return { subject, text, html };
}

function buildWarningEmail({ caseId, caseData, presetId }) {
  const employee = caseData.employeeNameSnapshot || 'Employee';
  const label = presetId === 'final_written_warning' ? 'Final written warning' : 'Written warning';
  const subject = `${label} issued: ${employee}`;
  const rows = [
    ['Employee', employee],
    ['Outcome', label],
    ['Issue', caseData.issue || '—'],
    ['Effective', formatUkDate(caseData.warningEffectiveAt || caseData.eventDate)],
    ['Expires', formatUkDate(caseData.warningExpiresAt)],
    ['Case', caseData.title || caseId],
    ['Owner', caseData.managerNameSnapshot || '—'],
  ];
  if (caseData.restrictionActive) {
    rows.splice(5, 0, [
      'Restriction',
      restrictionLabel(caseData.restrictionType, caseData.restrictionDetail),
    ]);
  }
  const text = [
    `${label} has been issued in the Employee Portal.`,
    '',
    ...rows.map(([k, v]) => `${k}: ${v}`),
    '',
    `Open case: ${caseUrl(caseId)}`,
  ].join('\n');
  const html = buildEmailShell({
    title: `${label} issued`,
    intro: `A ${label.toLowerCase()} has been finalized for an employee.`,
    rows,
    linkUrl: caseUrl(caseId),
    linkLabel: 'Open case',
  });
  return { subject, text, html };
}

async function sendToChannel({
  db,
  getGmailCredentials,
  channelId,
  buildMessage,
}) {
  if (!getGmailCredentials) {
    return { skipped: true, reason: 'mail_not_configured' };
  }
  const settings = await loadCaseNotificationSettings(db);
  const channel = settings[channelId];
  if (!channel || !channel.enabled) {
    return { skipped: true, reason: 'channel_disabled' };
  }
  if (!channel.emails.length) {
    return { skipped: true, reason: 'no_recipients' };
  }

  const creds = getGmailCredentials();
  if (!creds?.user || !creds?.pass) {
    return { skipped: true, reason: 'missing_credentials' };
  }

  const message = buildMessage();
  const transporter = createTransporter(creds.user, creds.pass);
  await transporter.sendMail({
    from: `"Country Lion Portal" <${creds.user}>`,
    to: channel.emails.join(', '),
    subject: message.subject,
    text: message.text,
    html: message.html,
  });
  return { sent: true, channelId, recipients: channel.emails };
}

/**
 * Best-effort stakeholder emails after a case update.
 * Never throws to the caller — logs and returns results.
 */
async function notifyCaseStakeholders(db, {
  getGmailCredentials,
  caseId,
  caseData,
  restrictionAdded = false,
  outcomePreset = '',
  finalizeOutcome = false,
} = {}) {
  const results = [];
  try {
    if (restrictionAdded && caseData?.restrictionActive) {
      results.push(await sendToChannel({
        db,
        getGmailCredentials,
        channelId: 'restriction',
        buildMessage: () => buildRestrictionEmail({ caseId, caseData }),
      }));
    }
    if (finalizeOutcome && outcomePreset === 'written_warning') {
      results.push(await sendToChannel({
        db,
        getGmailCredentials,
        channelId: 'written_warning',
        buildMessage: () => buildWarningEmail({ caseId, caseData, presetId: 'written_warning' }),
      }));
    }
    if (finalizeOutcome && outcomePreset === 'final_written_warning') {
      results.push(await sendToChannel({
        db,
        getGmailCredentials,
        channelId: 'final_written_warning',
        buildMessage: () => buildWarningEmail({ caseId, caseData, presetId: 'final_written_warning' }),
      }));
    }
  } catch (error) {
    console.error('notifyCaseStakeholders failed', error);
    results.push({ error: error.message || 'send_failed' });
  }
  return results;
}

module.exports = {
  CHANNELS,
  DEFAULT_TEST_EMAIL,
  defaultSettings,
  normalizeSettings,
  loadCaseNotificationSettings,
  saveCaseNotificationSettings,
  notifyCaseStakeholders,
};
