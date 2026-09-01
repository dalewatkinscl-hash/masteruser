const nodemailer = require('nodemailer');
const {
  UPCOMING_HIGHLIGHT_DAYS,
  formatDaysUntilLabel,
  formatIsoDate,
  formatMilestoneDate,
  getNextSpecialBirthday,
  getNextWorkAnniversary,
} = require('./milestones');

const NOTIFICATIONS_COLLECTION = 'hrMilestoneNotifications';
const DEFAULT_HR_EMAIL = 'hradmin@countrylion.co.uk';
const EMPLOYEE_PORTAL_URL = 'https://employee.countrylion.co.uk';

function createTransporter(gmailUser, gmailPass) {
  return nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: gmailUser,
      pass: gmailPass,
    },
  });
}

function buildNotificationId(type, employeeUid, eventDateIso) {
  return `${type}_${employeeUid}_${eventDateIso}`;
}

async function wasNotificationSent(db, notificationId) {
  const snapshot = await db.collection(NOTIFICATIONS_COLLECTION).doc(notificationId).get();
  return snapshot.exists;
}

async function recordNotification(db, admin, notificationId, payload) {
  await db.collection(NOTIFICATIONS_COLLECTION).doc(notificationId).set({
    ...payload,
    sentAt: admin.firestore.FieldValue.serverTimestamp(),
  });
}

function employeeSummary(employee) {
  const profile = employee.employeeProfile || {};
  return {
    name: employee.fullName || 'Unknown employee',
    department: profile.department || '—',
    jobRole: profile.jobRole || '—',
    email: employee.email || employee.contactEmail || '—',
    phone: profile.phoneNumber || '—',
  };
}

function buildAlertEmail(alert) {
  const summary = employeeSummary(alert.employee);
  const whenLabel = formatDaysUntilLabel(alert.milestone.daysUntil);
  const dateLabel = formatMilestoneDate(alert.milestone.date);
  const profileUrl = `${EMPLOYEE_PORTAL_URL}/dashboard/employees/${alert.employee.uid}`;

  if (alert.type === 'special_birthday') {
    const milestoneAge = alert.milestone.milestoneAge;
    const subject = `Special birthday ${whenLabel}: ${summary.name} turns ${milestoneAge}`;
    const text = [
      'A special birthday is coming up within the next 30 days.',
      '',
      `Employee: ${summary.name}`,
      `Milestone: ${milestoneAge}th birthday`,
      `Date: ${dateLabel}`,
      `Timing: ${whenLabel}`,
      `Department: ${summary.department}`,
      `Job title: ${summary.jobRole}`,
      `Work email: ${summary.email}`,
      `Phone: ${summary.phone}`,
      '',
      `View profile: ${profileUrl}`,
    ].join('\n');

    const html = buildEmailHtml({
      title: 'Special birthday reminder',
      intro: `A milestone birthday is coming up <strong>${whenLabel}</strong>.`,
      rows: [
        ['Employee', summary.name],
        ['Milestone', `${milestoneAge}th birthday`],
        ['Date', dateLabel],
        ['Department', summary.department],
        ['Job title', summary.jobRole],
        ['Work email', summary.email],
        ['Phone', summary.phone],
      ],
      profileUrl,
    });

    return { subject, text, html };
  }

  const yearsServed = alert.milestone.yearsServed;
  const subject = `Work anniversary ${whenLabel}: ${summary.name} - ${yearsServed} years`;
  const text = [
    'A milestone work anniversary is coming up within the next 30 days.',
    '',
    `Employee: ${summary.name}`,
    `Milestone: ${yearsServed} years of service`,
    `Date: ${dateLabel}`,
    `Timing: ${whenLabel}`,
    `Department: ${summary.department}`,
    `Job title: ${summary.jobRole}`,
    `Work email: ${summary.email}`,
    `Phone: ${summary.phone}`,
    '',
    `View profile: ${profileUrl}`,
  ].join('\n');

  const html = buildEmailHtml({
    title: 'Work anniversary reminder',
    intro: `A milestone work anniversary is coming up <strong>${whenLabel}</strong>.`,
    rows: [
      ['Employee', summary.name],
      ['Milestone', `${yearsServed} years of service`],
      ['Date', dateLabel],
      ['Department', summary.department],
      ['Job title', summary.jobRole],
      ['Work email', summary.email],
      ['Phone', summary.phone],
    ],
    profileUrl,
  });

  return { subject, text, html };
}

function buildEmailHtml({ title, intro, rows, profileUrl }) {
  const rowHtml = rows.map(([label, value]) => `
    <tr>
      <td style="padding:10px 12px;border-bottom:1px solid #e2e8f0;color:#64748b;font-size:14px;width:140px;">${label}</td>
      <td style="padding:10px 12px;border-bottom:1px solid #e2e8f0;color:#0f172a;font-size:14px;font-weight:600;">${value}</td>
    </tr>
  `).join('');

  return `
    <div style="font-family:Arial,sans-serif;background:#f8fafc;padding:24px;">
      <div style="max-width:640px;margin:0 auto;background:#ffffff;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;">
        <div style="padding:24px 28px;background:#1e293b;color:#ffffff;">
          <h1 style="margin:0;font-size:22px;">${title}</h1>
          <p style="margin:10px 0 0;font-size:15px;color:#cbd5e1;">${intro}</p>
        </div>
        <div style="padding:8px 0 20px;">
          <table style="width:100%;border-collapse:collapse;">${rowHtml}</table>
        </div>
        <div style="padding:0 28px 28px;">
          <a href="${profileUrl}" style="display:inline-block;background:#4f46e5;color:#ffffff;text-decoration:none;padding:12px 18px;border-radius:8px;font-size:14px;font-weight:600;">
            View employee profile
          </a>
        </div>
        <div style="padding:16px 28px;background:#f8fafc;color:#64748b;font-size:12px;">
          Country Lion Employee Portal · HR milestone alert
        </div>
      </div>
    </div>
  `;
}

async function collectPendingAlerts(db, employees, { force = false } = {}) {
  const pendingAlerts = [];

  for (const employee of employees) {
    const specialBirthday = getNextSpecialBirthday(employee);
    if (
      specialBirthday
      && specialBirthday.daysUntil >= 0
      && specialBirthday.daysUntil <= UPCOMING_HIGHLIGHT_DAYS
    ) {
      const eventDate = formatIsoDate(specialBirthday.date);
      const notificationId = buildNotificationId('special_birthday', employee.uid, eventDate);
      if (force || !(await wasNotificationSent(db, notificationId))) {
        pendingAlerts.push({
          type: 'special_birthday',
          employee,
          milestone: specialBirthday,
          notificationId,
          eventDate,
        });
      }
    }

    const workAnniversary = getNextWorkAnniversary(employee);
    if (
      workAnniversary
      && workAnniversary.daysUntil >= 0
      && workAnniversary.daysUntil <= UPCOMING_HIGHLIGHT_DAYS
    ) {
      const eventDate = formatIsoDate(workAnniversary.date);
      const notificationId = buildNotificationId('work_anniversary', employee.uid, eventDate);
      if (force || !(await wasNotificationSent(db, notificationId))) {
        pendingAlerts.push({
          type: 'work_anniversary',
          employee,
          milestone: workAnniversary,
          notificationId,
          eventDate,
        });
      }
    }
  }

  return pendingAlerts;
}

async function runHrMilestoneAlerts(db, admin, options = {}) {
  const gmailUser = options.gmailUser || process.env.GMAIL_USER || '';
  const gmailPass = options.gmailPass || process.env.GMAIL_PASS || '';
  const hrEmail = options.hrEmail || process.env.HR_NOTIFICATION_EMAIL || DEFAULT_HR_EMAIL;
  const force = options.force === true;

  if (!gmailUser || !gmailPass) {
    console.warn('Gmail credentials not configured; skipping HR milestone alerts.');
    return {
      skipped: true,
      reason: 'missing_gmail_credentials',
      sent: 0,
      alerts: [],
      recipient: hrEmail,
      fromEmail: gmailUser || null,
      forced: force,
    };
  }

  const snapshot = await db.collection('users').get();
  const employees = snapshot.docs.map((doc) => ({ uid: doc.id, ...doc.data() }));
  const pendingAlerts = await collectPendingAlerts(db, employees, { force });

  if (pendingAlerts.length === 0) {
    return {
      sent: 0,
      alerts: [],
      recipient: hrEmail,
      fromEmail: gmailUser,
      forced: force,
    };
  }

  const transporter = createTransporter(gmailUser, gmailPass);
  const sentAlerts = [];

  for (const alert of pendingAlerts) {
    const mail = buildAlertEmail(alert);
    await transporter.sendMail({
      from: `"Country Lion HR" <${gmailUser}>`,
      to: hrEmail,
      subject: mail.subject,
      text: mail.text,
      html: mail.html,
    });

    await recordNotification(db, admin, alert.notificationId, {
      type: alert.type,
      employeeUid: alert.employee.uid,
      employeeName: alert.employee.fullName || '',
      eventDate: alert.eventDate,
      daysUntil: alert.milestone.daysUntil,
      milestoneValue: alert.type === 'special_birthday'
        ? alert.milestone.milestoneAge
        : alert.milestone.yearsServed,
      recipient: hrEmail,
      fromEmail: gmailUser,
      resent: force,
    });

    sentAlerts.push({
      type: alert.type,
      employeeUid: alert.employee.uid,
      employeeName: alert.employee.fullName || '',
      eventDate: alert.eventDate,
      daysUntil: alert.milestone.daysUntil,
    });
  }

  return {
    sent: sentAlerts.length,
    alerts: sentAlerts,
    recipient: hrEmail,
    fromEmail: gmailUser,
    forced: force,
  };
}

module.exports = {
  DEFAULT_HR_EMAIL,
  runHrMilestoneAlerts,
};
