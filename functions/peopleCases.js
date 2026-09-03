/**
 * People Cases — disciplinary, grievance, and vehicle-accident workflows.
 * Guide/ACAS copy is data-driven so HR can update without code changes later.
 */

const CASES_PORTAL = 'cases_app';
const ACAS_CODE_URL =
  'https://www.acas.org.uk/acas-code-of-practice-on-disciplinary-and-grievance-procedures/html';

const PROCESS_FAMILIES = new Set(['disciplinary', 'grievance', 'vehicle_accident']);

const DISCIPLINARY_STAGES = [
  'fact_finding',
  'hearing_invite',
  'hearing',
  'outcome_pack',
  'closed',
  'appeal',
];

const GRIEVANCE_STAGES = [
  'acknowledged',
  'investigation',
  'meeting',
  'outcome_pack',
  'closed',
  'appeal',
];

const ACCIDENT_STAGES = [
  'triage',
  'investigation',
  'training_decision',
  'closed',
];

function toTrimmedString(value) {
  if (value === undefined || value === null) return '';
  return String(value).trim();
}

/** Map legacy stage names onto the current wizard. */
function normalizeStage(processFamily, stage) {
  const raw = toTrimmedString(stage).toLowerCase() || '';
  if (processFamily === 'grievance') {
    if (raw === 'intake' || raw === 'minutes_signoff') return raw === 'minutes_signoff' ? 'meeting' : 'acknowledged';
    return GRIEVANCE_STAGES.includes(raw) ? raw : 'acknowledged';
  }
  if (processFamily === 'vehicle_accident') {
    if (raw === 'reported' || raw === 'minutes_signoff') return raw === 'minutes_signoff' ? 'investigation' : 'triage';
    return ACCIDENT_STAGES.includes(raw) ? raw : 'triage';
  }
  // disciplinary
  if (raw === 'intake' || raw === 'investigation' || raw === 'minutes_signoff') return 'fact_finding';
  return DISCIPLINARY_STAGES.includes(raw) ? raw : 'fact_finding';
}

const CASE_TYPES = new Set([
  'attendance',
  'conduct',
  'performance',
  'policy',
  'capability',
  'grievance',
  'vehicle_accident',
  'other',
]);

const OUTCOME_PRESETS = [
  { id: 'informal_action', label: 'Informal action (recorded)', warning: false },
  { id: 'file_note_for_improvement', label: 'File note for improvement', warning: false },
  { id: 'no_further_action', label: 'No further action', warning: false },
  { id: 'verbal_warning', label: 'Verbal warning', warning: true, suggestedExpiryMonths: 6 },
  { id: 'written_warning', label: 'Written warning', warning: true, suggestedExpiryMonths: 6 },
  { id: 'final_written_warning', label: 'Final written warning', warning: true, suggestedExpiryMonths: 12 },
  { id: 'pip', label: 'Performance improvement plan', warning: false },
  { id: 'training_required', label: 'Training required', warning: false },
  { id: 'suspension', label: 'Suspension', warning: false },
  { id: 'dismissal', label: 'Dismissal', warning: false },
];

const INFORMAL_RESOLUTION_PATHS = new Set([
  'resolve_informally',
  'proceed_formal',
  'not_appropriate',
  'informal_action_taken',
]);

const DOCUMENT_TYPES = new Set([
  'evidence',
  'letter',
  'minutes',
  'warning',
  'outcome',
  'invite',
  'suspension_letter',
  'training_outline',
  'pip_plan',
  'other',
]);

const STAGE_GUIDES = {
  disciplinary: {
    fact_finding: {
      title: 'Fact-finding interview',
      howTo: [
        'Review unexpired disciplinary history for this employee.',
        'Hold an initial fact-finding interview (not a formal hearing).',
        'Issue interview minutes for the employee to approve or amend.',
        'Then either close with notes, or schedule a formal disciplinary hearing.',
      ],
      doNext: 'Complete the fact-finding interview and minutes, then choose close with notes or schedule a hearing.',
      acasTip:
        'Carry out necessary investigations without unreasonable delay. An investigatory meeting should not itself result in disciplinary action.',
      checklist: ['history_reviewed', 'fact_finding_minutes'],
    },
    hearing_invite: {
      title: 'Schedule formal hearing',
      howTo: [
        'Choose a hearing date and time that gives reasonable notice.',
        'Send the invite through the employee portal (and print a copy if handing over in person).',
        'Attach the evidence bundle and confirm the right to be accompanied.',
      ],
      doNext: 'Pick the hearing date, send the portal invite, then continue to the hearing.',
      acasTip:
        'Acas does not set a fixed number of days’ notice, but it must be reasonable so the employee can prepare and arrange a companion. Many employers allow around 5 working days; very short notice is rarely appropriate. Notify the employee in writing with enough information and evidence to prepare, and advise their right to be accompanied.',
      checklist: ['hearing_date_set', 'hearing_invite_issued', 'evidence_bundle', 'companion_offered'],
    },
    hearing: {
      title: 'Formal hearing',
      howTo: [
        'Hold the hearing; allow the employee to respond.',
        'Record companion attendance; postpone up to 5 working days if needed.',
        'Issue hearing minutes for sign-off.',
      ],
      doNext: 'Complete the hearing and minutes, then decide the outcome.',
      acasTip:
        'Explain the complaint and evidence. Allow the employee to set out their case. Workers have a statutory right to be accompanied at formal disciplinary meetings.',
      checklist: ['hearing_held', 'hearing_minutes'],
    },
    outcome_pack: {
      title: 'Outcome',
      howTo: [
        'Select an outcome and complete the document pack.',
        'Issue letters via the portal, then close the case.',
      ],
      doNext: 'Select outcome, finish pack steps, and close.',
      acasTip:
        'Inform the employee of the decision in writing. Warnings should state the issue, improvement required, how long the warning remains current, and the right of appeal.',
      checklist: ['outcome_selected', 'outcome_pack_complete'],
    },
    closed: {
      title: 'Closed',
      howTo: [
        'Case is closed. Appeal window: 5 working days after a formal outcome.',
        'A manager may reopen if an appeal is logged.',
      ],
      doNext: 'Export the case pack if needed, or log an appeal.',
      acasTip:
        'Employees should be allowed to appeal against any formal decision. Appeals should be heard without unreasonable delay.',
      checklist: [],
    },
    appeal: {
      title: 'Appeal',
      howTo: [
        'Assign an appeal owner different from the original decision-maker where practicable.',
        'Hold the appeal, record the outcome, then close again.',
      ],
      doNext: 'Complete the appeal and close the case.',
      acasTip: 'Where possible, appeal should be heard by a manager not previously involved.',
      checklist: ['appeal_owner_set', 'appeal_outcome_complete'],
    },
  },
  grievance: {
    intake: {
      title: 'Grievance intake',
      howTo: [
        'Log the grievance raised off-portal (date received, summary).',
        'Assign an owner manager who is not the subject of the grievance where possible.',
      ],
      doNext: 'Acknowledge the grievance and arrange a meeting without unreasonable delay.',
      acasTip:
        'Employees should raise grievances formally in writing. Employers should arrange a formal meeting without unreasonable delay and allow the employee to be accompanied.',
      checklist: ['off_portal_raise_noted', 'owner_set'],
    },
    acknowledged: {
      title: 'Acknowledged',
      howTo: ['Confirm written acknowledgement details and meeting arrangements.'],
      doNext: 'Investigate and hold the grievance meeting.',
      acasTip: 'Hold the meeting without unreasonable delay — ideally within five working days — allowing enough time to prepare.',
      checklist: ['acknowledged'],
    },
    investigation: {
      title: 'Investigation',
      howTo: ['Gather facts; hold any investigatory meetings with minutes sign-off.'],
      doNext: 'Proceed to grievance meeting.',
      acasTip: 'Consider information from all sides and act consistently with similar grievances.',
      checklist: [],
    },
    meeting: {
      title: 'Grievance meeting',
      howTo: ['Hold meeting with companion rights; then minutes sign-off.'],
      doNext: 'Issue minutes, then decide outcome.',
      acasTip: 'Allow the employee to explain the grievance and how they think it should be resolved.',
      checklist: ['meeting_held', 'companion_offered'],
    },
    minutes_signoff: {
      title: 'Minutes sign-off',
      howTo: ['Same minutes approve/amend/disputed flow as disciplinary.'],
      doNext: 'Obtain sign-off then select outcome.',
      acasTip: 'Keep written records of the grievance procedure.',
      checklist: ['minutes_signed_or_disputed'],
    },
    outcome_pack: {
      title: 'Outcome',
      howTo: ['Issue written outcome and allow appeal.'],
      doNext: 'Complete outcome pack and close.',
      acasTip: 'Communicate the decision in writing and allow the employee to appeal.',
      checklist: ['outcome_selected', 'outcome_pack_complete'],
    },
    closed: {
      title: 'Closed',
      howTo: ['Appeal window 5 working days; manager may reopen on appeal.'],
      doNext: 'Monitor appeal window.',
      acasTip: 'Appeals should be heard without unreasonable delay.',
      checklist: [],
    },
    appeal: {
      title: 'Appeal',
      howTo: ['Different/more senior appeal owner; complete appeal pack; close.'],
      doNext: 'Complete appeal outcome.',
      acasTip: 'Where possible, appeal should be heard by a manager not previously involved.',
      checklist: ['appeal_owner_set', 'appeal_outcome_complete'],
    },
  },
  vehicle_accident: {
    reported: {
      title: 'Reported',
      howTo: ['Driver completes bump card, or manager prompts the driver to complete one.'],
      doNext: 'Triage the report and begin investigation.',
      acasTip: 'If the matter later becomes disciplinary, follow a fair disciplinary process — do not shortcut.',
      checklist: ['bump_card_complete'],
    },
    triage: {
      title: 'Triage',
      howTo: ['Record injuries, third parties, and initial notes without ranking the person.'],
      doNext: 'Investigate with meetings and evidence.',
      acasTip: null,
      checklist: ['triage_complete'],
    },
    investigation: {
      title: 'Investigation',
      howTo: ['Gather statements, photos, dashcam; hold meetings with minutes sign-off.'],
      doNext: 'Complete minutes then training-team decision.',
      acasTip: null,
      checklist: [],
    },
    minutes_signoff: {
      title: 'Minutes sign-off',
      howTo: ['Issue investigation meeting minutes for sign-off or disputed path.'],
      doNext: 'Move to training decision.',
      acasTip: null,
      checklist: ['minutes_signed_or_disputed'],
    },
    training_decision: {
      title: 'Training / disciplinary decision',
      howTo: [
        'Training team reviews the case (no special role — use the queue).',
        'Choose training required (outline + review), open linked disciplinary, or close with no further action.',
      ],
      doNext: 'Record decision and complete any training pack or linked case.',
      acasTip: 'If initiating disciplinary action, open a linked disciplinary case and follow the full fair process.',
      checklist: ['training_decision_made'],
    },
    closed: {
      title: 'Closed',
      howTo: ['Accident case closed. Linked disciplinary continues separately if opened.'],
      doNext: 'Complete any scheduled reviews.',
      acasTip: null,
      checklist: [],
    },
  },
};

function getCasesRole(profile, getEffectivePortalRole) {
  if (profile?.portalsAccess?.master_admin === 'admin') return 'admin';
  const role = getEffectivePortalRole(profile, CASES_PORTAL);
  if (role === 'admin' || role === 'manager' || role === 'hr') return role;
  // HR managers/admins can oversee cases.
  const hrRole = getEffectivePortalRole(profile, 'hr_app');
  if (hrRole === 'manager' || hrRole === 'admin') return 'hr';
  return '';
}

function canManageCases(profile, getEffectivePortalRole) {
  const role = getCasesRole(profile, getEffectivePortalRole);
  return role === 'manager' || role === 'admin' || role === 'hr';
}

function canHrOverseeCases(profile, getEffectivePortalRole) {
  const role = getCasesRole(profile, getEffectivePortalRole);
  return role === 'admin' || role === 'hr';
}

function stagesForFamily(processFamily) {
  if (processFamily === 'grievance') return GRIEVANCE_STAGES;
  if (processFamily === 'vehicle_accident') return ACCIDENT_STAGES;
  return DISCIPLINARY_STAGES;
}

function guideFor(processFamily, stage) {
  const familyGuides = STAGE_GUIDES[processFamily] || STAGE_GUIDES.disciplinary;
  const guide = familyGuides[stage] || {
    title: stage,
    howTo: [],
    doNext: 'Continue the case checklist.',
    acasTip: null,
    checklist: [],
  };
  return {
    ...guide,
    acasUrl: ACAS_CODE_URL,
    disclaimer:
      'This summarises Acas principles for managers. Follow Country Lion policy and seek HR advice on complex cases. Tribunals may adjust awards by up to 25% for unreasonable failure to follow the Acas Code.',
  };
}

function sanitizeCaseCreateInput(input = {}) {
  const processFamily = toTrimmedString(input.processFamily).toLowerCase() || 'disciplinary';
  const caseType = toTrimmedString(input.caseType).toLowerCase();
  const stages = stagesForFamily(processFamily);
  const initialStage = toTrimmedString(input.stage).toLowerCase() || stages[0];
  return {
    employeeUid: toTrimmedString(input.employeeUid),
    processFamily: PROCESS_FAMILIES.has(processFamily) ? processFamily : 'disciplinary',
    caseType: CASE_TYPES.has(caseType) ? caseType : (processFamily === 'grievance' ? 'grievance' : processFamily === 'vehicle_accident' ? 'vehicle_accident' : 'other'),
    title: toTrimmedString(input.title),
    summary: toTrimmedString(input.summary),
    severity: toTrimmedString(input.severity).toLowerCase() || '',
    ownerManagerUid: toTrimmedString(input.ownerManagerUid || input.managerUid),
    stage: stages.includes(initialStage) ? initialStage : stages[0],
    dueAt: toTrimmedString(input.dueAt),
    informalTried: Boolean(input.informalTried),
    informalNotes: toTrimmedString(input.informalNotes),
    informalNotAppropriateReason: toTrimmedString(input.informalNotAppropriateReason),
    informalResolutionPath: INFORMAL_RESOLUTION_PATHS.has(toTrimmedString(input.informalResolutionPath))
      ? toTrimmedString(input.informalResolutionPath)
      : '',
    informalActionDetails: toTrimmedString(input.informalActionDetails),
    offPortalRaiseDate: toTrimmedString(input.offPortalRaiseDate),
    offPortalRaiseNotes: toTrimmedString(input.offPortalRaiseNotes),
    sourceIncidentId: toTrimmedString(input.sourceIncidentId),
  };
}

function outcomePresetById(id) {
  return OUTCOME_PRESETS.find((item) => item.id === id) || null;
}

function buildOutcomePackSteps(presetId) {
  const base = [
    { id: 'draft_letter', label: 'Draft / generate outcome letter', done: false },
    { id: 'issue_letter', label: 'Issue letter to employee portal', done: false },
  ];
  if (presetId === 'pip') {
    base.push({ id: 'pip_plan', label: 'Attach PIP plan document', done: false });
    base.push({ id: 'set_reviews', label: 'Set PIP review dates', done: false });
  }
  if (presetId === 'training_required') {
    base.push({ id: 'training_outline', label: 'Add training outline document', done: false });
    base.push({ id: 'set_reviews', label: 'Set training review date', done: false });
  }
  if (presetId === 'suspension') {
    base.push({ id: 'suspension_dates', label: 'Set suspension start/end (or open-ended)', done: false });
  }
  if (['verbal_warning', 'written_warning', 'final_written_warning'].includes(presetId)) {
    base.push({ id: 'set_expiry', label: 'Set warning effective and expiry dates', done: false });
  }
  base.push({ id: 'mark_complete', label: 'Mark outcome pack complete and close', done: false });
  return base;
}

function addWorkingDays(fromDate, workingDays) {
  const date = new Date(fromDate);
  let added = 0;
  while (added < workingDays) {
    date.setDate(date.getDate() + 1);
    const day = date.getDay();
    if (day !== 0 && day !== 6) added += 1;
  }
  return date.toISOString().slice(0, 10);
}

/** Count weekdays from the day after `fromIso` up to and including `toIso`. */
function countWorkingDaysNotice(fromIso, toIso) {
  const from = new Date(`${String(fromIso).slice(0, 10)}T00:00:00`);
  const to = new Date(`${String(toIso).slice(0, 10)}T00:00:00`);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || to <= from) return 0;
  let count = 0;
  const cursor = new Date(from);
  while (cursor < to) {
    cursor.setDate(cursor.getDate() + 1);
    const day = cursor.getDay();
    if (day !== 0 && day !== 6) count += 1;
  }
  return count;
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatHearingDateLabel(isoDate, time) {
  const date = new Date(`${String(isoDate).slice(0, 10)}T00:00:00`);
  if (Number.isNaN(date.getTime())) return String(isoDate || '');
  const datePart = date.toLocaleDateString('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
  const timePart = toTrimmedString(time);
  return timePart ? `${datePart} at ${timePart}` : datePart;
}

/**
 * Formal hearing invite letter (HTML) for portal delivery / print.
 */
function buildHearingInviteHtml({
  employeeName,
  caseTitle,
  caseSummary,
  hearingScheduledAt,
  hearingScheduledTime,
  hearingLocation,
  hearingManagerName,
  issuedByName,
  issuedAtLabel,
  extraNotes,
  companyName = 'Country Lion',
  suspensionActive = false,
  precautionarySuspension = false,
  suspensionReason = '',
  grossMisconductReason = '',
}) {
  const when = formatHearingDateLabel(hearingScheduledAt, hearingScheduledTime) || '[date] at [time]';
  const reportLocation = toTrimmedString(hearingLocation) || '[location / room]';
  const actionFollowing = toTrimmedString(caseSummary) || toTrimmedString(caseTitle) || '[nature of the concern / allegation]';
  const showSuspensionWarning = Boolean(suspensionActive || precautionarySuspension);
  const grossReason = toTrimmedString(grossMisconductReason)
    || toTrimmedString(suspensionReason)
    || toTrimmedString(caseSummary)
    || '[nature of the incident / concerns raised]';
  const suspensionBlock = showSuspensionWarning
    ? `<p>You should be aware that due to the nature of the incident and the concerns raised, this may be considered gross misconduct due to ${escapeHtml(grossReason)} and may result in immediate dismissal. In the meantime, you will be suspended on full pay until your disciplinary hearing.</p>`
    : `<p class="note">(Delete this paragraph if not applicable.)</p>
  <p>You should be aware that due to the nature of the incident and the concerns raised, this may be considered gross misconduct due to [reason] and may result in immediate dismissal. In the meantime, you will be suspended on full pay until your disciplinary hearing.</p>`;
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Invitation to disciplinary hearing</title>
  <style>
    @page { size: A4; margin: 18mm; }
    body { font-family: "Century Gothic", Calibri, Arial, sans-serif; color: #111; line-height: 1.45; margin: 0; }
    p { margin: 0 0 12px; font-size: 11pt; }
    .note { color: #555; font-style: italic; font-size: 10pt; }
  </style>
</head>
<body>
  <p>Dear ${escapeHtml(employeeName || 'Colleague')},</p>
  <p>&nbsp;</p>
  <p>I hereby inform you that you will be required to attend a disciplinary hearing on ${escapeHtml(when)}.</p>
  <p>&nbsp;</p>
  <p>At the hearing, action will be considered following ${escapeHtml(actionFollowing)}.</p>
  <p>&nbsp;</p>
  ${suspensionBlock}
  <p>&nbsp;</p>
  <p>You are entitled, if you wish, to be accompanied by another work colleague. If this is the case, please inform us of the individual you wish to attend as soon as possible.</p>
  <p>&nbsp;</p>
  <p>You will need to report to ${escapeHtml(reportLocation)} for commencement of this hearing. Failure to attend may result in a decision being made in your absence.</p>
</body>
</html>`;
}

function buildOutcomeLetterHtml({
  employeeName, caseTitle, presetLabel, outcomeDetails,
  warningEffectiveAt, warningExpiresAt, durationLabel,
  issuedByName, issuedAtLabel, companyName = 'Country Lion',
}) {
  const warningBlock = warningEffectiveAt
    ? `<p>This ${escapeHtml(presetLabel.toLowerCase())} is effective from <strong>${escapeHtml(warningEffectiveAt)}</strong>${warningExpiresAt ? ` and will remain on your record until <strong>${escapeHtml(warningExpiresAt)}</strong> (${escapeHtml(durationLabel)})` : ''}.</p>`
    : '';
  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"/><title>Outcome letter</title>
<style>@page{size:A4;margin:18mm}body{font-family:"Century Gothic",Calibri,Arial,sans-serif;color:#111;line-height:1.45;margin:0}p{margin:0 0 12px;font-size:11pt}h1{font-size:16pt;margin:0 0 4px}.meta{color:#444;font-size:10pt;margin-bottom:22px}</style>
</head><body>
<h1>Outcome of disciplinary hearing</h1>
<p class="meta">${escapeHtml(companyName)} · ${escapeHtml(issuedAtLabel)}</p>
<p>Dear ${escapeHtml(employeeName || 'Colleague')},</p>
<p>Following the disciplinary hearing regarding <strong>${escapeHtml(caseTitle || 'the matter under investigation')}</strong>, I am writing to confirm the outcome.</p>
<p><strong>Decision:</strong> ${escapeHtml(presetLabel)}</p>
<p><strong>Reasons for the decision:</strong></p>
<p>${escapeHtml(outcomeDetails || 'See case notes.').replace(/\n/g, '<br/>')}</p>
${warningBlock}
<p>You have the right to appeal this decision. If you wish to appeal, you should do so in writing within five working days of receiving this letter, stating the grounds for your appeal.</p>
<p>Yours sincerely,<br/>${escapeHtml(issuedByName || 'Management')}</p>
<p style="font-size:9pt;color:#555;margin-top:28px">This letter is issued in line with the Acas Code of Practice on disciplinary and grievance procedures.</p>
</body></html>`;
}

function buildWarningDocumentHtml({
  employeeName, caseTitle, presetLabel, presetId, outcomeDetails,
  warningEffectiveAt, warningExpiresAt, durationLabel,
  issuedByName, issuedAtLabel, companyName = 'Country Lion',
}) {
  const isPip = presetId === 'pip';
  const title = isPip ? 'Performance improvement plan' : presetLabel;
  const reviewNote = isPip
    ? '<p>A review meeting will be scheduled to assess progress against the objectives set out in this plan. Failure to demonstrate sufficient improvement may result in further disciplinary action.</p>'
    : '';
  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"/><title>${escapeHtml(title)}</title>
<style>@page{size:A4;margin:18mm}body{font-family:"Century Gothic",Calibri,Arial,sans-serif;color:#111;line-height:1.45;margin:0}p{margin:0 0 12px;font-size:11pt}h1{font-size:16pt;margin:0 0 4px}.meta{color:#444;font-size:10pt;margin-bottom:22px}</style>
</head><body>
<h1>${escapeHtml(title)}</h1>
<p class="meta">${escapeHtml(companyName)} · ${escapeHtml(issuedAtLabel)}</p>
<p><strong>Employee:</strong> ${escapeHtml(employeeName || '—')}</p>
<p><strong>Case:</strong> ${escapeHtml(caseTitle || '—')}</p>
<p><strong>Effective from:</strong> ${escapeHtml(warningEffectiveAt || '—')}</p>
<p><strong>Expires:</strong> ${escapeHtml(warningExpiresAt || '—')} (${escapeHtml(durationLabel || '—')})</p>
<p>&nbsp;</p>
<p><strong>Details:</strong></p>
<p>${escapeHtml(outcomeDetails || 'See outcome letter.').replace(/\n/g, '<br/>')}</p>
${reviewNote}
<p>Any further breach of company standards or failure to improve may result in further disciplinary action up to and including dismissal.</p>
<p>&nbsp;</p>
<p>Issued by: ${escapeHtml(issuedByName || 'Management')}</p>
<p>Date: ${escapeHtml(issuedAtLabel)}</p>
<p>&nbsp;</p>
<p>Employee signature: ____________________________&nbsp;&nbsp;&nbsp;Date: ____________</p>
</body></html>`;
}

function serializeTimestamp(value) {
  if (!value) return null;
  if (typeof value.toDate === 'function') return value.toDate().toISOString();
  if (value._seconds) return new Date(value._seconds * 1000).toISOString();
  if (typeof value === 'string') return value;
  return null;
}

function serializeCase(doc) {
  const data = typeof doc.data === 'function' ? doc.data() : doc;
  const id = doc.id || data.id;
  return {
    id,
    ...data,
    createdAt: serializeTimestamp(data.createdAt) || data.createdAt || null,
    updatedAt: serializeTimestamp(data.updatedAt) || data.updatedAt || null,
    openedAt: serializeTimestamp(data.openedAt) || data.openedAt || null,
    closedAt: serializeTimestamp(data.closedAt) || data.closedAt || null,
    appealedAt: serializeTimestamp(data.appealedAt) || data.appealedAt || null,
    stage: normalizeStage(data.processFamily || 'disciplinary', data.stage),
    guide: guideFor(data.processFamily || 'disciplinary', normalizeStage(data.processFamily || 'disciplinary', data.stage)),
  };
}

module.exports = {
  CASES_PORTAL,
  ACAS_CODE_URL,
  PROCESS_FAMILIES,
  DISCIPLINARY_STAGES,
  GRIEVANCE_STAGES,
  ACCIDENT_STAGES,
  CASE_TYPES,
  OUTCOME_PRESETS,
  INFORMAL_RESOLUTION_PATHS,
  DOCUMENT_TYPES,
  STAGE_GUIDES,
  toTrimmedString,
  getCasesRole,
  canManageCases,
  canHrOverseeCases,
  stagesForFamily,
  normalizeStage,
  guideFor,
  sanitizeCaseCreateInput,
  outcomePresetById,
  buildOutcomePackSteps,
  addWorkingDays,
  countWorkingDaysNotice,
  buildHearingInviteHtml,
  buildOutcomeLetterHtml,
  buildWarningDocumentHtml,
  serializeCase,
  serializeTimestamp,
};
