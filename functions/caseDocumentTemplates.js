/**
 * Stage document templates for People Cases.
 * Source of truth: SharePoint HR site → Employee Files / HR Form Templates / Disciplinaries
 * Managers download the master template, complete it, then upload into the
 * employee’s Disciplinaries & Grievances case folder.
 */

function toTrimmedString(value) {
  if (value === undefined || value === null) return '';
  return String(value).trim();
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function sanitizePathSegment(value, fallback = 'Case') {
  return String(value || fallback)
    .replace(/[\\/:*?"<>|]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80) || fallback;
}

function toFolderDate(value) {
  if (!value) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value.toDate === 'function') {
    const date = value.toDate();
    return Number.isNaN(date.getTime()) ? null : date;
  }
  if (typeof value._seconds === 'number') {
    const date = new Date(value._seconds * 1000);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  if (typeof value === 'string') {
    const isoDay = value.slice(0, 10);
    const date = /^\d{4}-\d{2}-\d{2}$/.test(isoDay)
      ? new Date(`${isoDay}T12:00:00`)
      : new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  return null;
}

function buildCaseSharePointFolderName(caseData = {}, caseId = '') {
  const stored = toTrimmedString(caseData.sharePointCaseFolderName);
  if (stored) return sanitizePathSegment(stored, 'Case');

  const title = sanitizePathSegment(caseData.title || 'Case');
  const date = toFolderDate(caseData.openedAt)
    || toFolderDate(caseData.createdAt)
    || toFolderDate(caseData.offPortalRaiseDate)
    || toFolderDate(caseData.incidentAt);
  const dateLabel = date ? formatUkDate(date).replace(/\//g, '-') : '';
  const shortId = String(caseId || '').slice(0, 8);
  const withDate = dateLabel ? `${title} (${dateLabel})` : title;
  return shortId ? `${withDate} (${shortId})` : withDate;
}

/**
 * Template catalogue mapped to files in Employee Files/HR Form Templates/Disciplinaries.
 * Prefer exact sharePointFileNames; matching also uses title/id hints.
 */
const CASE_DOCUMENT_TEMPLATES = [
  {
    id: 'fact_finding_notes',
    title: 'Fact-finding interview notes',
    documentType: 'minutes',
    processFamilies: ['disciplinary'],
    stages: ['fact_finding'],
    requiredBeforeAdvance: true,
    sharePointFileNames: [
      'Fact-finding interview notes.docx',
      'Fact-finding interview notes.doc',
      'Fact finding interview notes.docx',
      'Interview Record Template.docx',
    ],
    matchHints: ['fact finding', 'fact-finding', 'interview record'],
    description: 'Meeting minutes template for the initial fact-finding interview.',
  },
  {
    id: 'investigation_notes',
    title: 'Investigation meeting notes',
    documentType: 'minutes',
    processFamilies: ['grievance', 'vehicle_accident'],
    stages: ['investigation'],
    requiredBeforeAdvance: true,
    sharePointFileNames: [
      'Investigation meeting notes.docx',
      'Investigation meeting notes.doc',
      'Investigation notes.docx',
    ],
    matchHints: ['investigation meeting', 'investigation notes'],
    description: 'Meeting minutes template for investigation interviews.',
  },
  {
    id: 'hearing_invite_letter',
    title: 'Hearing invite letter',
    documentType: 'invite',
    processFamilies: ['disciplinary'],
    stages: ['hearing_invite'],
    requiredBeforeAdvance: false,
    sharePointFileNames: [
      'Hearing invite letter.docx',
      'Hearing invite letter.doc',
      'Invitation to disciplinary hearing.docx',
      'Disciplinary Hearing Invitation Letter.docx',
    ],
    matchHints: ['hearing invite', 'invitation letter', 'hearing invitation'],
    description: 'Standard Country Lion disciplinary hearing invitation letter (companion rights, optional gross misconduct / suspension paragraph).',
  },
  {
    id: 'hearing_minutes',
    title: 'Disciplinary hearing minutes',
    documentType: 'minutes',
    processFamilies: ['disciplinary'],
    stages: ['hearing'],
    requiredBeforeAdvance: true,
    sharePointFileNames: [
      'Disciplinary hearing minutes.docx',
      'Disciplinary hearing minutes.doc',
      'Hearing minutes.docx',
    ],
    matchHints: ['hearing minutes', 'disciplinary hearing'],
    description: 'Formal hearing minutes template.',
  },
  {
    id: 'grievance_meeting_notes',
    title: 'Grievance meeting notes',
    documentType: 'minutes',
    processFamilies: ['grievance'],
    stages: ['meeting'],
    requiredBeforeAdvance: true,
    sharePointFileNames: [
      'Grievance meeting notes.docx',
      'Grievance meeting notes.doc',
    ],
    matchHints: ['grievance meeting'],
    description: 'Meeting minutes template for grievance meetings.',
  },
  {
    id: 'appeal_minutes',
    title: 'Appeal hearing minutes',
    documentType: 'minutes',
    processFamilies: ['disciplinary', 'grievance'],
    stages: ['appeal'],
    requiredBeforeAdvance: true,
    sharePointFileNames: [
      'Appeal hearing minutes.docx',
      'Appeal hearing minutes.doc',
      'Appeal minutes.docx',
    ],
    matchHints: ['appeal hearing', 'appeal minutes'],
    description: 'Minutes template for appeal hearings.',
  },
  {
    id: 'outcome_letter',
    title: 'Outcome letter',
    documentType: 'outcome',
    processFamilies: ['disciplinary', 'grievance'],
    stages: ['outcome_pack', 'appeal'],
    requiredBeforeAdvance: true,
    sharePointFileNames: [
      'Outcome letter.docx',
      'Outcome letter.doc',
      'Disciplinary outcome letter.docx',
    ],
    matchHints: ['outcome letter'],
    description: 'Outcome / decision letter template.',
  },
  {
    id: 'warning_letter',
    title: 'Formal warning letter',
    documentType: 'warning',
    processFamilies: ['disciplinary'],
    stages: ['outcome_pack'],
    requiredBeforeAdvance: false,
    requiredWhenOutcomes: ['verbal_warning', 'written_warning', 'final_written_warning'],
    sharePointFileNames: [
      'Formal warning letter.docx',
      'Formal warning letter.doc',
      'Warning letter.docx',
    ],
    matchHints: ['warning letter', 'formal warning'],
    description: 'Warning letter template when a formal warning is issued.',
  },
  {
    id: 'pip_plan',
    title: 'Performance improvement plan',
    documentType: 'pip_plan',
    processFamilies: ['disciplinary'],
    stages: ['outcome_pack'],
    requiredBeforeAdvance: false,
    requiredWhenOutcomes: ['pip'],
    sharePointFileNames: [
      'Performance improvement plan.docx',
      'Performance improvement plan.doc',
      'PIP.docx',
    ],
    matchHints: ['performance improvement', 'pip'],
    description: 'PIP template.',
  },
  {
    id: 'training_outline',
    title: 'Training outline',
    documentType: 'training_outline',
    processFamilies: ['disciplinary', 'vehicle_accident'],
    stages: ['outcome_pack', 'training_decision'],
    requiredBeforeAdvance: false,
    requiredWhenOutcomes: ['training_required'],
    sharePointFileNames: [
      'Training outline.docx',
      'Training outline.doc',
    ],
    matchHints: ['training outline'],
    description: 'Training outline template when training is required.',
  },
  {
    id: 'suspension_letter',
    title: 'Suspension letter',
    documentType: 'suspension_letter',
    processFamilies: ['disciplinary'],
    stages: ['fact_finding', 'hearing_invite', 'hearing', 'outcome_pack'],
    requiredBeforeAdvance: false,
    sharePointFileNames: [
      'Suspension letter.docx',
      'Suspension letter.doc',
    ],
    matchHints: ['suspension letter'],
    description: 'Suspension letter template (precautionary or outcome).',
  },
  {
    id: 'note_on_file',
    title: 'Note on file',
    documentType: 'other',
    processFamilies: ['disciplinary', 'grievance'],
    stages: ['fact_finding', 'outcome_pack'],
    requiredBeforeAdvance: false,
    sharePointFileNames: [
      'Note on File Template.docx',
      'Note on file.docx',
      'Note on File.docx',
    ],
    matchHints: ['note on file'],
    description: 'Short note-on-file record (useful for informal / NFA closures).',
  },
];

function templatesForStage(processFamily, stage, outcomePreset = '', trainingDecision = '') {
  const family = toTrimmedString(processFamily) || 'disciplinary';
  const stageKey = toTrimmedString(stage);
  const outcome = toTrimmedString(outcomePreset) || toTrimmedString(trainingDecision);
  return CASE_DOCUMENT_TEMPLATES.filter((item) => {
    if (!item.processFamilies.includes(family)) return false;
    if (!item.stages.includes(stageKey)) return false;
    if (Array.isArray(item.requiredWhenOutcomes) && item.requiredWhenOutcomes.length) {
      if (!outcome) return stageKey === 'training_decision';
      return item.requiredWhenOutcomes.includes(outcome);
    }
    return true;
  }).map((item) => {
    const requiredByOutcome = Array.isArray(item.requiredWhenOutcomes)
      && item.requiredWhenOutcomes.includes(outcome);
    return {
      ...item,
      required: Boolean(
        item.requiredBeforeAdvance
        || requiredByOutcome
        || (stageKey === 'training_decision' && item.id === 'training_outline' && outcome === 'training_required'),
      ),
    };
  });
}

function isTemplateRequired(template, outcomePreset = '') {
  if (template.requiredBeforeAdvance) return true;
  if (Array.isArray(template.requiredWhenOutcomes) && template.requiredWhenOutcomes.includes(outcomePreset)) {
    return true;
  }
  return false;
}

function formatUkDate(value = new Date()) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const dd = String(date.getDate()).padStart(2, '0');
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const yyyy = date.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
}

/**
 * Build merge-field values for a case document working copy.
 */
function buildTemplateFillContext({
  caseData = {},
  sessionProfile = {},
  investigator = null,
  hearingManager = null,
  appealOwner = null,
  managersPresent = [],
  letterDate = '',
} = {}) {
  const employeeName = toTrimmedString(caseData.employeeNameSnapshot) || '[Employee full name]';
  const investigatorName = toTrimmedString(investigator?.fullName)
    || toTrimmedString(caseData.investigatorNameSnapshot)
    || '';
  const hearingManagerName = toTrimmedString(hearingManager?.fullName)
    || toTrimmedString(caseData.hearingManagerNameSnapshot)
    || '';
  const appealOwnerName = toTrimmedString(appealOwner?.fullName) || '';
  const issuedByName = toTrimmedString(sessionProfile.fullName)
    || toTrimmedString(sessionProfile.email)
    || '';
  const presentNames = (Array.isArray(managersPresent) ? managersPresent : [])
    .map((person) => toTrimmedString(person?.name || person?.fullName || person))
    .filter(Boolean);
  if (!presentNames.length) {
    if (investigatorName) presentNames.push(investigatorName);
    if (hearingManagerName && !presentNames.includes(hearingManagerName)) presentNames.push(hearingManagerName);
    if (issuedByName && !presentNames.includes(issuedByName)) presentNames.push(issuedByName);
  }
  const hearingDate = toTrimmedString(caseData.hearingScheduledAt);
  const hearingTime = toTrimmedString(caseData.hearingScheduledTime);
  const hearingWhen = [
    hearingDate ? formatUkDate(hearingDate) : '',
    hearingTime,
  ].filter(Boolean).join(' at ');

  return {
    letterDate: letterDate || formatUkDate(new Date()),
    employeeName,
    caseTitle: toTrimmedString(caseData.title) || '[Case title]',
    summary: toTrimmedString(caseData.summary) || '',
    investigatorName: investigatorName || issuedByName || '[Investigator name]',
    hearingManagerName: hearingManagerName || '[Hearing manager]',
    appealOwnerName: appealOwnerName || '[Appeal manager]',
    issuedByName: issuedByName || '[Manager name]',
    managersPresentLabel: presentNames.join(', ') || '[Manager name(s)]',
    managersPresent: presentNames.map((name) => ({ name })),
    hearingWhen: hearingWhen || '',
    hearingLocation: toTrimmedString(caseData.hearingLocation) || '',
    hearingScheduledAt: toTrimmedString(caseData.hearingScheduledAt) || '',
    hearingScheduledTime: toTrimmedString(caseData.hearingScheduledTime) || '',
    outcomePreset: toTrimmedString(caseData.outcomePreset) || '',
    suspensionFrom: toTrimmedString(caseData.suspensionFrom) || '',
    suspensionReason: toTrimmedString(caseData.suspensionReason) || '',
    precautionarySuspension: Boolean(caseData.precautionarySuspension || caseData.suspensionActive),
    grossMisconductReason: toTrimmedString(caseData.grossMisconductReason)
      || toTrimmedString(caseData.suspensionReason)
      || toTrimmedString(caseData.summary)
      || '',
    reportLocation: toTrimmedString(caseData.hearingLocation) || '',
  };
}

function applyPlaceholdersToText(rawText, fills = {}) {
  let text = String(rawText || '');
  const replacements = [
    ['[Employee full name]', fills.employeeName],
    ['[Employee name]', fills.employeeName],
    ['[Case title]', fills.caseTitle],
    ['[Brief summary of the concern / allegation]', fills.summary],
    ['[Manager name(s)]', fills.managersPresentLabel],
    ['[Investigator name]', fills.investigatorName],
    ['[Hearing manager]', fills.hearingManagerName],
    ['[Appeal manager]', fills.appealOwnerName],
    ['[Manager name]', fills.issuedByName],
    ['[Date of letter]', fills.letterDate],
    ['[DD/MM/YYYY]', fills.letterDate],
    ['[Hearing date]', fills.hearingScheduledAt || fills.hearingWhen],
    ['[Hearing time]', fills.hearingScheduledTime],
    ['[Date] at [Time]', fills.hearingWhen || `${fills.letterDate}`],
    ['[Location / meeting room]', fills.hearingLocation || '[Location / meeting room]'],
    ['[Location]', fills.hearingLocation || '[Location]'],
    ['[Outcome e.g. written warning / NFA]', fills.outcomePreset || '[Outcome]'],
    ['[Outcome]', fills.outcomePreset || '[Outcome]'],
    ['[Suspension start date]', fills.suspensionFrom || fills.letterDate],
    ['[Suspension reason]', fills.suspensionReason || fills.summary || '[Suspension reason]'],
  ];
  for (const [token, value] of replacements) {
    if (!value) continue;
    text = text.split(token).join(value);
  }
  // Common bare tokens left in older masters
  text = text.replace(/\[Name\]/g, fills.issuedByName || fills.investigatorName || '[Name]');
  return ensureWordFormHtml(text);
}

function looksLikeHtmlDocument(buffer) {
  const head = Buffer.from(buffer).slice(0, 200).toString('utf8').trim().toLowerCase();
  return head.startsWith('<!doctype html') || head.startsWith('<html') || head.includes('<h1');
}

/** Word legacy form checkbox — clickable in desktop Word (not Word Online). */
function wordFormCheckboxField(label) {
  const field = [
    '<span style="mso-element:field-begin"></span>',
    '<span style="mso-spacerun:yes">&nbsp;</span>',
    'FORMCHECKBOX',
    '<span style="mso-element:field-separator"></span>',
    '<span style="mso-spacerun:yes">&nbsp;</span>',
    '<span style="mso-element:field-end"></span>',
  ].join('');
  return `<span class="checkbox-item">${field}&nbsp;${escapeHtml(label)}</span>`;
}

function wordCheckboxRow(label, idSuffix = '') {
  return `<p class="checkbox-row">${wordFormCheckboxField(label)}</p>`;
}

function wordCheckboxLine(labels = []) {
  return `<p class="checkbox-line">${labels.map((label) => wordFormCheckboxField(label)).join('&nbsp;&nbsp;')}</p>`;
}

function wordCheckboxBlock(labels = []) {
  return labels.map((label) => wordCheckboxRow(label)).join('');
}

function convertUnicodeCheckboxesToWordInputs(html) {
  return String(html || '').replace(/☐\s*([^<\n]+?)(?=(\s*(?:&nbsp;|☐|<br\s*\/?>|<\/p>)|$))/gi, (match, label) => {
    const trimmed = String(label).trim();
    if (!trimmed) return match;
    return wordFormCheckboxField(trimmed);
  });
}

function convertHtmlInputCheckboxesToWordFields(html) {
  return String(html || '').replace(
    /<span class="checkbox-item">\s*<input[^>]*type=["']checkbox["'][^>]*\/?>\s*<label[^>]*>([\s\S]*?)<\/label>\s*<\/span>/gi,
    (match, label) => wordFormCheckboxField(label.replace(/<[^>]+>/g, '').trim()),
  );
}

function ensureWordFormHtml(html) {
  let text = String(html || '');
  text = convertHtmlInputCheckboxesToWordFields(text);
  if (text.includes('☐')) {
    text = convertUnicodeCheckboxesToWordInputs(text);
  }
  if (!/ProgId/i.test(text) && /<head[\s>]/i.test(text)) {
    text = text.replace(
      /<head([^>]*)>/i,
      '<head$1>\n  <meta name="ProgId" content="Word.Document" />\n  <meta name="Generator" content="Country Lion Employee Portal" />',
    );
  }
  if (!/xmlns:w=/i.test(text) && /<html[\s>]/i.test(text)) {
    text = text.replace(
      /<html(\s[^>]*)?>/i,
      '<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40"$1>',
    );
  }
  return text;
}

const WORD_DOC_STYLES = `
    body { font-family: "Century Gothic", Calibri, Arial, sans-serif; font-size: 11pt; color: #111; line-height: 1.45; margin: 22px; max-width: 720px; }
    h1 { font-size: 16pt; margin: 0 0 10px; }
    h2 { font-size: 12pt; margin: 18px 0 8px; }
    table { border-collapse: collapse; width: 100%; margin: 8px 0 14px; }
    td { border: 1px solid #ccc; padding: 6px 8px; vertical-align: top; }
    td:first-child { width: 34%; background: #f7f7f7; font-weight: 600; }
    .banner { background: #eef6ff; border: 1px solid #b7d3f0; padding: 10px 12px; margin-bottom: 16px; font-size: 10pt; }
    .note { color: #555; font-size: 9.5pt; margin-top: 16px; }
    ul, ol { margin: 6px 0 10px 22px; }
    .checkbox-row { margin: 4pt 0; }
    .checkbox-line { margin: 6pt 0; }
    .checkbox-item { white-space: nowrap; }
`;

function wrapWordDocumentHtml({ title, body }) {
  return `<!DOCTYPE html>
<html xmlns:o="urn:schemas-microsoft-com:office:office"
      xmlns:w="urn:schemas-microsoft-com:office:word"
      xmlns="http://www.w3.org/TR/REC-html40"
      lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="ProgId" content="Word.Document" />
  <meta name="Generator" content="Country Lion Employee Portal" />
  <title>${escapeHtml(title)}</title>
  <!--[if gte mso 9]><xml>
  <w:WordDocument>
    <w:View>Print</w:View>
    <w:DoNotOptimizeForBrowser/>
  </w:WordDocument>
  </xml><![endif]-->
  <style>${WORD_DOC_STYLES}</style>
</head>
<body>
${body}
</body>
</html>`;
}

/** Bootstrap / filled working-copy HTML for SharePoint masters and downloads. */
function buildTemplateDocHtml({ template, caseData = {}, extras = {}, fills = null }) {
  const mergedFills = fills || buildTemplateFillContext({
    caseData,
    sessionProfile: { fullName: extras.issuedByName || '' },
    managersPresent: extras.managersPresent || [],
    letterDate: extras.letterDate || '',
  });
  const employeeName = mergedFills.employeeName;
  const title = mergedFills.caseTitle;
  const summary = mergedFills.summary || '[Brief summary of the concern / allegation]';
  const hearingWhen = mergedFills.hearingWhen || '[Date] at [Time]';
  const location = mergedFills.hearingLocation || '[Location / meeting room]';
  const outcome = mergedFills.outcomePreset || '[Outcome e.g. written warning / NFA]';
  const managers = mergedFills.managersPresentLabel || '[Manager name(s)]';
  const letterDate = mergedFills.letterDate || formatUkDate(new Date());
  const investigatorName = mergedFills.investigatorName || '[Investigator name]';
  const hearingManagerName = mergedFills.hearingManagerName || '[Hearing manager]';
  const appealOwnerName = mergedFills.appealOwnerName || '[Appeal manager]';
  const issuedByName = mergedFills.issuedByName || '[Manager name]';

  const banner = `<p class="banner"><strong>WORKING COPY — Country Lion</strong><br/>
Pre-filled from the case record where known. Complete any remaining blanks, then upload back to the case.<br/>
Tick boxes by clicking them in <strong>desktop Microsoft Word</strong> (they do not work in Word Online).<br/>
Master templates live in SharePoint: Employee Files / HR Form Templates / Disciplinaries.</p>`;

  const sectionsById = {
    fact_finding_notes: `
      ${banner}
      <h1>Fact-finding interview notes</h1>
      <p><em>This is an investigatory / fact-finding meeting. It is not a formal disciplinary hearing and must not result in a disciplinary sanction by itself.</em></p>
      <h2>1. Meeting details</h2>
      <table>
        <tr><td>Employee</td><td>${escapeHtml(employeeName)}</td></tr>
        <tr><td>Case / concern</td><td>${escapeHtml(title)}</td></tr>
        <tr><td>Date</td><td>${escapeHtml(letterDate)}</td></tr>
        <tr><td>Time</td><td>[HH:MM]</td></tr>
        <tr><td>Location</td><td>[Room / Teams]</td></tr>
        <tr><td>Managers present</td><td>${escapeHtml(managers)}</td></tr>
        <tr><td>Lead interviewer</td><td>${escapeHtml(investigatorName)}</td></tr>
        <tr><td>Note-taker (if different)</td><td>[Name]</td></tr>
        <tr><td>Employee accompanied by</td><td>[Colleague / TU rep / None]</td></tr>
      </table>
      <h2>2. Purpose explained to the employee</h2>
      <p>Explain that the meeting is to gather facts about: ${escapeHtml(summary)}</p>
      ${wordCheckboxRow('Employee confirmed they understand the purpose of the meeting')}
      <h2>3. Questions asked / points covered</h2>
      <ol>
        <li>[Question 1]<br/>Response: ________________________________________________</li>
        <li>[Question 2]<br/>Response: ________________________________________________</li>
        <li>[Question 3]<br/>Response: ________________________________________________</li>
      </ol>
      <h2>4. Documents / evidence referred to</h2>
      <p>[List any CCTV, timesheets, emails, witness notes, etc.]</p>
      <h2>5. Employee’s account / additional comments</h2>
      <p>________________________________________________________________________</p>
      <p>________________________________________________________________________</p>
      <h2>6. Manager assessment / next steps</h2>
      ${wordCheckboxBlock([
        'No case to answer — close with notes',
        'Informal action / coaching sufficient',
        'Proceed to formal disciplinary hearing',
        'Other: ________________________________',
      ])}
      <h2>7. Signatures</h2>
      <p>Manager (${escapeHtml(investigatorName)}): ________________________ Date: ${escapeHtml(letterDate)}</p>
      <p>Employee (${escapeHtml(employeeName)}): _______________________ Date: __________</p>
      <p class="note">Issue a copy via the Employee Portal for the employee to approve / amend / sign off.</p>
    `,
    investigation_notes: `
      ${banner}
      <h1>Investigation meeting notes</h1>
      <table>
        <tr><td>Employee / interviewee</td><td>${escapeHtml(employeeName)}</td></tr>
        <tr><td>Case</td><td>${escapeHtml(title)}</td></tr>
        <tr><td>Date</td><td>${escapeHtml(letterDate)}</td></tr>
        <tr><td>Time / location</td><td>[Details]</td></tr>
        <tr><td>Investigators present</td><td>${escapeHtml(managers)}</td></tr>
        <tr><td>Lead investigator</td><td>${escapeHtml(investigatorName)}</td></tr>
        <tr><td>Accompanied by</td><td>[Name / None]</td></tr>
      </table>
      <h2>1. Matter under investigation</h2>
      <p>${escapeHtml(summary)}</p>
      <h2>2. Interview notes</h2>
      <p>________________________________________________________________________</p>
      <p>________________________________________________________________________</p>
      <h2>3. Evidence discussed</h2>
      <p>[List]</p>
      <h2>4. Findings / recommendations</h2>
      ${wordCheckboxLine(['No further action', 'Training', 'Formal process', 'Other: ________'])}
      <h2>5. Signatures</h2>
      <p>Investigator (${escapeHtml(investigatorName)}): ____________________ Date: ${escapeHtml(letterDate)}</p>
      <p>Interviewee (${escapeHtml(employeeName)}): ____________________ Date: __________</p>
    `,
    hearing_invite_letter: `
      ${banner}
      <p>Dear ${escapeHtml(employeeName)},</p>
      <p>&nbsp;</p>
      <p>I hereby inform you that you will be required to attend a disciplinary hearing on ${escapeHtml(hearingWhen || '[date] at [time]')}.</p>
      <p>&nbsp;</p>
      <p>At the hearing, action will be considered following ${escapeHtml(summary || title || '[nature of the concern / allegation]')}.</p>
      <p>&nbsp;</p>
      ${mergedFills.precautionarySuspension ? `
      <p>You should be aware that due to the nature of the incident and the concerns raised, this may be considered gross misconduct due to ${escapeHtml(mergedFills.grossMisconductReason || mergedFills.suspensionReason || summary || '[nature of the incident / concerns raised]')} and may result in immediate dismissal. In the meantime, you will be suspended on full pay until your disciplinary hearing.</p>
      ` : `
      <p class="note">(Delete this paragraph if not applicable.)</p>
      <p>You should be aware that due to the nature of the incident and the concerns raised, this may be considered gross misconduct due to [reason] and may result in immediate dismissal. In the meantime, you will be suspended on full pay until your disciplinary hearing.</p>
      `}
      <p>&nbsp;</p>
      <p>You are entitled, if you wish, to be accompanied by another work colleague. If this is the case, please inform us of the individual you wish to attend as soon as possible.</p>
      <p>&nbsp;</p>
      <p>You will need to report to ${escapeHtml(location || '[location / room]')} for commencement of this hearing. Failure to attend may result in a decision being made in your absence.</p>
    `,
    hearing_minutes: `
      ${banner}
      <h1>Disciplinary hearing minutes</h1>
      <table>
        <tr><td>Employee</td><td>${escapeHtml(employeeName)}</td></tr>
        <tr><td>Case</td><td>${escapeHtml(title)}</td></tr>
        <tr><td>Date / time</td><td>${escapeHtml(hearingWhen || letterDate)}</td></tr>
        <tr><td>Location</td><td>${escapeHtml(location)}</td></tr>
        <tr><td>Hearing manager</td><td>${escapeHtml(hearingManagerName)}</td></tr>
        <tr><td>Other managers present</td><td>${escapeHtml(managers)}</td></tr>
        <tr><td>Companion</td><td>${escapeHtml(toTrimmedString(caseData.companionName) || '[Name / role / None]')}</td></tr>
        <tr><td>Note-taker</td><td>[Name]</td></tr>
      </table>
      <h2>1. Introductions and process explained</h2>
      ${wordCheckboxLine(['Purpose of hearing explained', 'Right to be accompanied confirmed', 'Evidence pack referred to'])}
      <h2>2. Management case</h2>
      <p>${escapeHtml(summary)}</p>
      <p>Evidence referred to: ________________________________________________</p>
      <h2>3. Employee’s case / response</h2>
      <p>________________________________________________________________________</p>
      <p>________________________________________________________________________</p>
      <h2>4. Questions / clarification</h2>
      <p>________________________________________________________________________</p>
      <h2>5. Adjournment</h2>
      ${wordCheckboxRow('Hearing adjourned for decision')}
      <p>Time resumed: __________</p>
      ${wordCheckboxRow('Decision reserved — employee advised outcome will follow in writing')}
      <h2>6. Signatures</h2>
      <p>Hearing manager (${escapeHtml(hearingManagerName)}): _________________ Date: ${escapeHtml(letterDate)}</p>
      <p>Employee (${escapeHtml(employeeName)}): ______________________ Date: __________</p>
      <p class="note">Issue via Employee Portal for approve / amend / sign-off or dispute.</p>
    `,
    grievance_meeting_notes: `
      ${banner}
      <h1>Grievance meeting notes</h1>
      <table>
        <tr><td>Employee</td><td>${escapeHtml(employeeName)}</td></tr>
        <tr><td>Grievance / case</td><td>${escapeHtml(title)}</td></tr>
        <tr><td>Date</td><td>${escapeHtml(letterDate)}</td></tr>
        <tr><td>Time / location</td><td>[Details]</td></tr>
        <tr><td>Managers present</td><td>${escapeHtml(managers)}</td></tr>
        <tr><td>Accompanied by</td><td>[Name / None]</td></tr>
      </table>
      <h2>1. Grievance as understood</h2>
      <p>${escapeHtml(summary)}</p>
      <h2>2. Employee’s account</h2>
      <p>________________________________________________________________________</p>
      <h2>3. Discussion / clarification</h2>
      <p>________________________________________________________________________</p>
      <h2>4. Desired resolution (employee)</h2>
      <p>________________________________________________________________________</p>
      <h2>5. Next steps</h2>
      ${wordCheckboxLine(['Further investigation', 'Outcome letter to follow', 'Other: ________'])}
      <h2>6. Signatures</h2>
      <p>Manager (${escapeHtml(issuedByName)}): ____________________ Date: ${escapeHtml(letterDate)}</p>
      <p>Employee (${escapeHtml(employeeName)}): ___________________ Date: __________</p>
    `,
    appeal_minutes: `
      ${banner}
      <h1>Appeal hearing minutes</h1>
      <table>
        <tr><td>Employee</td><td>${escapeHtml(employeeName)}</td></tr>
        <tr><td>Original case</td><td>${escapeHtml(title)}</td></tr>
        <tr><td>Original outcome</td><td>${escapeHtml(outcome)}</td></tr>
        <tr><td>Date</td><td>${escapeHtml(letterDate)}</td></tr>
        <tr><td>Time / location</td><td>[Details]</td></tr>
        <tr><td>Appeal manager</td><td>${escapeHtml(appealOwnerName)}</td></tr>
        <tr><td>Others present</td><td>${escapeHtml(managers)}</td></tr>
        <tr><td>Companion</td><td>[Name / None]</td></tr>
      </table>
      <h2>1. Grounds of appeal</h2>
      <p>[As stated by the employee]</p>
      <h2>2. Discussion</h2>
      <p>________________________________________________________________________</p>
      <h2>3. Appeal decision</h2>
      ${wordCheckboxLine(['Uphold original outcome', 'Reduce sanction', 'Overturn', 'Other: ________'])}
      <p>Reasons: ________________________________________________________________</p>
      <h2>4. Signatures</h2>
      <p>Appeal manager (${escapeHtml(appealOwnerName)}): _________________ Date: ${escapeHtml(letterDate)}</p>
      <p>Employee (${escapeHtml(employeeName)}): ______________________ Date: __________</p>
    `,
    outcome_letter: `
      ${banner}
      <h1>Outcome letter</h1>
      <p>${escapeHtml(letterDate)}</p>
      <p>Dear ${escapeHtml(employeeName)},</p>
      <p>I write to confirm the outcome of the process regarding <strong>${escapeHtml(title)}</strong>.</p>
      <h2>Outcome</h2>
      <p><strong>${escapeHtml(outcome)}</strong></p>
      <h2>Reasons</h2>
      <p>Having considered the evidence and your responses, I have reached this decision because:</p>
      <p>1. ________________________________________________</p>
      <p>2. ________________________________________________</p>
      <h2>What happens next</h2>
      <p>[Improvement expectations / review dates / NFA confirmation / dismissal arrangements — amend as needed]</p>
      <h2>Right of appeal</h2>
      <p>You have the right to appeal this decision within <strong>5 working days</strong> of receiving this letter.
      Please submit your appeal in writing, stating your grounds, via the Employee Portal or to [HR / named manager].</p>
      <p>Yours sincerely,</p>
      <p>${escapeHtml(issuedByName)}<br/>[Job title]<br/>Country Lion</p>
    `,
    warning_letter: `
      ${banner}
      <h1>Formal warning letter</h1>
      <p>${escapeHtml(letterDate)}</p>
      <p>Dear ${escapeHtml(employeeName)},</p>
      <p>Following the disciplinary hearing${mergedFills.hearingScheduledAt ? ` on ${escapeHtml(mergedFills.hearingScheduledAt)}` : ''}, this letter confirms that you are receiving a
      <strong>${escapeHtml(outcome || '[verbal / written / final written warning]')}</strong>.</p>
      <h2>Reason for the warning</h2>
      <p>${escapeHtml(summary)}</p>
      <h2>Improvement required</h2>
      <p>[Clear expectations and timescales]</p>
      <h2>Duration</h2>
      <p>This warning is effective from ${escapeHtml(toTrimmedString(caseData.warningEffectiveAt) || letterDate)} and will normally remain live until ${escapeHtml(toTrimmedString(caseData.warningExpiresAt) || '[DD/MM/YYYY]')},
      after which it will expire if there has been no further related misconduct / performance issue.</p>
      <h2>Consequences of further issues</h2>
      <p>Failure to improve, or further related issues while this warning is live, may lead to further disciplinary action,
      up to and including dismissal.</p>
      <h2>Right of appeal</h2>
      <p>You may appeal within 5 working days of receiving this letter.</p>
      <p>Yours sincerely,</p>
      <p>${escapeHtml(issuedByName)}<br/>[Job title]<br/>Country Lion</p>
    `,
    pip_plan: `
      ${banner}
      <h1>Performance improvement plan (PIP)</h1>
      <table>
        <tr><td>Employee</td><td>${escapeHtml(employeeName)}</td></tr>
        <tr><td>Manager</td><td>${escapeHtml(issuedByName)}</td></tr>
        <tr><td>Related case</td><td>${escapeHtml(title)}</td></tr>
        <tr><td>PIP start date</td><td>${escapeHtml(letterDate)}</td></tr>
        <tr><td>Expected end / review</td><td>[DD/MM/YYYY]</td></tr>
      </table>
      <h2>1. Performance concerns</h2>
      <p>${escapeHtml(summary)}</p>
      <h2>2. Objectives (SMART)</h2>
      <ol>
        <li>Objective: ________________ &nbsp; Measure: ________________ &nbsp; By: __________</li>
        <li>Objective: ________________ &nbsp; Measure: ________________ &nbsp; By: __________</li>
        <li>Objective: ________________ &nbsp; Measure: ________________ &nbsp; By: __________</li>
      </ol>
      <h2>3. Support / training to be provided</h2>
      <p>________________________________________________________________________</p>
      <h2>4. Review meetings</h2>
      <p>Review 1: [date] &nbsp; Review 2: [date] &nbsp; Final review: [date]</p>
      <h2>5. Consequences if objectives are not met</h2>
      <p>[e.g. further formal process / possible dismissal — amend to policy]</p>
      <h2>6. Signatures</h2>
      <p>Manager (${escapeHtml(issuedByName)}): ____________________ Date: ${escapeHtml(letterDate)}</p>
      <p>Employee (${escapeHtml(employeeName)}): ___________________ Date: __________</p>
    `,
    training_outline: `
      ${banner}
      <h1>Training outline</h1>
      <table>
        <tr><td>Employee</td><td>${escapeHtml(employeeName)}</td></tr>
        <tr><td>Related case</td><td>${escapeHtml(title)}</td></tr>
        <tr><td>Training owner / trainer</td><td>${escapeHtml(issuedByName)}</td></tr>
        <tr><td>Target completion date</td><td>[DD/MM/YYYY]</td></tr>
      </table>
      <h2>1. Why training is required</h2>
      <p>${escapeHtml(summary)}</p>
      <h2>2. Training to be completed</h2>
      <ul>
        <li>Course / module: ________________</li>
        <li>Delivery method: [classroom / on-road / e-learning / coaching]</li>
        <li>Duration: ________________</li>
      </ul>
      <h2>3. Success measures</h2>
      <p>________________________________________________________________________</p>
      <h2>4. Follow-up</h2>
      <p>Review date: __________ &nbsp; Reviewed by: __________</p>
      <h2>5. Sign-off</h2>
      <p>Training lead (${escapeHtml(issuedByName)}): _________________ Date: ${escapeHtml(letterDate)}</p>
      <p>Employee (${escapeHtml(employeeName)}): ____________________ Date: __________</p>
    `,
    suspension_letter: `
      ${banner}
      <h1>Suspension letter</h1>
      <p>${escapeHtml(letterDate)}</p>
      <p>Dear ${escapeHtml(employeeName)},</p>
      <p>I am writing to confirm that you are suspended from work
      ${mergedFills.precautionarySuspension ? '<strong>on a precautionary basis pending investigation</strong>' : ''}.</p>
      <table>
        <tr><td>Effective from</td><td>${escapeHtml(mergedFills.suspensionFrom || letterDate)}</td></tr>
        <tr><td>Reason</td><td>${escapeHtml(mergedFills.suspensionReason || summary)}</td></tr>
        <tr><td>Related case</td><td>${escapeHtml(title)}</td></tr>
      </table>
      <h2>During suspension</h2>
      <ul>
        <li>You must not attend work or contact colleagues about this matter unless authorised.</li>
        <li>You must remain available to attend investigatory or disciplinary meetings at reasonable notice.</li>
        <li>Suspension is not a disciplinary sanction and does not imply guilt.</li>
        <li>Pay arrangements: [as per contract / company policy — amend].</li>
      </ul>
      <p>We will keep the suspension under review and write to you again when it ends or if arrangements change.</p>
      <p>Yours sincerely,</p>
      <p>${escapeHtml(issuedByName)}<br/>[Job title]<br/>Country Lion</p>
    `,
    note_on_file: `
      ${banner}
      <h1>Note on file</h1>
      <table>
        <tr><td>Employee</td><td>${escapeHtml(employeeName)}</td></tr>
        <tr><td>Date</td><td>${escapeHtml(letterDate)}</td></tr>
        <tr><td>Manager</td><td>${escapeHtml(managers)}</td></tr>
        <tr><td>Related case (if any)</td><td>${escapeHtml(title)}</td></tr>
      </table>
      <h2>Summary of discussion / informal action</h2>
      <p>${escapeHtml(summary)}</p>
      <p>________________________________________________________________________</p>
      <h2>Agreed actions / expectations</h2>
      <p>________________________________________________________________________</p>
      <h2>Signatures</h2>
      <p>Manager (${escapeHtml(issuedByName)}): ____________________ Date: ${escapeHtml(letterDate)}</p>
      <p>Employee (${escapeHtml(employeeName)}): ___________________ Date: __________</p>
      <p class="note">This note is retained on file. It is not a formal warning unless separately confirmed.</p>
    `,
  };

  const body = sectionsById[template.id] || `<p>Complete this document for ${escapeHtml(title)}.</p>`;
  return wrapWordDocumentHtml({
    title: `${template.title} — ${employeeName}`,
    body,
  });
}

function templateSeedFileName(template) {
  const preferred = Array.isArray(template.sharePointFileNames) ? template.sharePointFileNames[0] : '';
  if (preferred) return preferred.replace(/\.doc$/i, '.docx');
  return `${sanitizePathSegment(template.title)}.docx`;
}

function templateFileName(template, caseData = {}) {
  const employee = sanitizePathSegment(caseData.employeeNameSnapshot || 'Employee', 'Employee');
  const date = new Date().toISOString().slice(0, 10);
  const base = sanitizePathSegment(template.title);
  return `${base} - ${employee} - ${date}.docx`;
}

function isPortalInterviewMinute(minute = {}) {
  if (minute.documentId) return false;
  const recordType = toTrimmedString(minute.recordType) || 'interview';
  return recordType === 'interview';
}

/** Portal-recorded interview notes satisfy required minutes templates for a stage. */
function portalInterviewCoversTemplate(minutes = [], stage, template = {}) {
  const stageKey = toTrimmedString(stage);
  if (template.documentType !== 'minutes') return false;
  return minutes.some((minute) => {
    if (!isPortalInterviewMinute(minute)) return false;
    if (!toTrimmedString(minute.content)) return false;
    const minuteStage = toTrimmedString(minute.stageKey);
    if (minuteStage) return minuteStage === stageKey;
    return Array.isArray(template.stages) && template.stages.includes(stageKey);
  });
}

function missingRequiredTemplates({ processFamily, stage, outcomePreset, documents = [], minutes = [], templates }) {
  const list = templates || templatesForStage(processFamily, stage, outcomePreset);
  const uploadedKeys = new Set(
    documents
      .filter((doc) => doc.templateId || doc.documentType)
      .flatMap((doc) => [doc.templateId, doc.documentType].filter(Boolean)),
  );
  return list.filter((item) => {
    if (!isTemplateRequired(item, outcomePreset)) return false;
    if (uploadedKeys.has(item.id) || uploadedKeys.has(item.documentType)) return false;
    if (portalInterviewCoversTemplate(minutes, stage, item)) return false;
    return true;
  });
}

function formatMissingDocumentsError(missing = []) {
  if (!missing.length) return 'Complete required documents before continuing.';
  const parts = missing.map((item) => {
    if (item.documentType === 'minutes') {
      return `${item.title} (record an interview on the portal)`;
    }
    return item.title;
  });
  return `Complete required items before continuing: ${parts.join(', ')}.`;
}

const { buildTemplateDocxBuffer, DOCX_MIME_TYPE } = require('./caseDocumentDocx');

module.exports = {
  CASE_DOCUMENT_TEMPLATES,
  buildCaseSharePointFolderName,
  sanitizePathSegment,
  templatesForStage,
  isTemplateRequired,
  formatUkDate,
  buildTemplateFillContext,
  applyPlaceholdersToText,
  looksLikeHtmlDocument,
  ensureWordFormHtml,
  convertUnicodeCheckboxesToWordInputs,
  buildTemplateDocHtml,
  buildTemplateDocxBuffer,
  DOCX_MIME_TYPE,
  templateSeedFileName,
  templateFileName,
  isPortalInterviewMinute,
  portalInterviewCoversTemplate,
  missingRequiredTemplates,
  formatMissingDocumentsError,
};
