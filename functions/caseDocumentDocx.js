/**
 * Word .docx templates with clickable CheckBox content controls (docx npm).
 */

const {
  Document,
  Packer,
  Paragraph,
  TextRun,
  Table,
  TableRow,
  TableCell,
  CheckBox,
  WidthType,
} = require('docx');

const JSZip = require('jszip');

const DOCX_MIME_TYPE = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const DOCUMENT_FONT = 'Century Gothic';
const DOCUMENT_COLOR = '000000';
const FONT_XML = '<w:rFonts w:ascii="Century Gothic" w:hAnsi="Century Gothic" w:cs="Century Gothic" w:eastAsia="Century Gothic"/>';

function fontRunProps(extra = {}) {
  return {
    font: {
      ascii: DOCUMENT_FONT,
      hAnsi: DOCUMENT_FONT,
      cs: DOCUMENT_FONT,
      eastAsia: DOCUMENT_FONT,
    },
    color: DOCUMENT_COLOR,
    ...extra,
  };
}

/** Single body style only — never use built-in or "Heading"-named styles (Word links those to blue Times). */
const DOCUMENT_STYLES = {
  default: {
    document: {
      run: fontRunProps({ size: 22 }),
    },
  },
  paragraphStyles: [
    {
      id: 'CLNormal',
      name: 'CL Body',
      run: fontRunProps({ size: 22 }),
    },
  ],
};

function p(text, opts = {}) {
  return new Paragraph({
    style: 'CLNormal',
    children: [new TextRun({ text: String(text || ''), ...fontRunProps(), ...opts })],
  });
}

function h1(text) {
  return new Paragraph({
    spacing: { before: 200, after: 120 },
    children: [new TextRun({ text, ...fontRunProps({ bold: true, size: 32 }) })],
  });
}

function h2(text) {
  return new Paragraph({
    spacing: { before: 180, after: 100 },
    children: [new TextRun({ text, ...fontRunProps({ bold: true, size: 26 }) })],
  });
}

function blank() {
  return p('________________________________________________________________________');
}

function checkboxRow(label) {
  return new Paragraph({
    style: 'CLNormal',
    children: [
      new CheckBox({ checked: false }),
      new TextRun({ text: ` ${label}`, ...fontRunProps() }),
    ],
  });
}

function checkboxLine(labels = []) {
  const children = [];
  labels.forEach((label, index) => {
    if (index > 0) children.push(new TextRun({ text: '    ', ...fontRunProps() }));
    children.push(new CheckBox({ checked: false }));
    children.push(new TextRun({ text: ` ${label}`, ...fontRunProps() }));
  });
  return new Paragraph({ style: 'CLNormal', children });
}

function patchRunProperties(inner = '') {
  let next = String(inner || '');
  next = next.replace(/<w:themeColor[^>]*\/>/g, '');
  next = next.replace(/<w:themeTint[^>]*\/>/g, '');
  next = next.replace(/<w:themeShade[^>]*\/>/g, '');
  next = next.replace(/<w:color w:val="[^"]*"\/>/g, `<w:color w:val="${DOCUMENT_COLOR}"/>`);
  next = next.replace(/<w:rFonts[^>]*\/>/g, FONT_XML);
  if (!next.includes('<w:color')) {
    next = `<w:color w:val="${DOCUMENT_COLOR}"/>${next}`;
  }
  if (!next.includes('<w:rFonts')) {
    next = `${FONT_XML}${next}`;
  }
  return next;
}

function patchStylesXml(xml) {
  let out = String(xml || '');
  out = out.replace(/<w:rPr>([\s\S]*?)<\/w:rPr>/g, (_match, inner) => `<w:rPr>${patchRunProperties(inner)}</w:rPr>`);
  // Drop any style whose id or name references Word's built-in headings/titles.
  out = out.replace(/<w:style w:type="paragraph" w:styleId="(?:Heading[1-6]|Title|CLHeading[12])">[\s\S]*?<\/w:style>/g, '');
  out = out.replace(/<w:style w:type="character" w:styleId="(?:Heading[1-6]|Title|Hyperlink)">[\s\S]*?<\/w:style>/g, '');
  return out;
}

function patchDocumentXml(xml) {
  let out = String(xml || '');
  // Never leave paragraph style refs — Word can link "Heading"-like ids to Normal.dotm blue Times.
  out = out.replace(/<w:pStyle w:val="(?:Heading[1-6]|Title|CLHeading[12])"\/>/g, '');
  out = out.replace(/<w:rPr>([\s\S]*?)<\/w:rPr>/g, (_match, inner) => `<w:rPr>${patchRunProperties(inner)}</w:rPr>`);
  return out;
}

function patchSettingsXml(xml) {
  let out = String(xml || '');
  if (!out.includes('<w:styleLockTheme')) {
    out = out.replace(
      /<\/w:settings>/,
      '<w:styleLockTheme/><w:styleLockQFSet/></w:settings>',
    );
  }
  return out;
}

async function finalizeDocxBuffer(buffer) {
  const zip = await JSZip.loadAsync(buffer);
  const stylesFile = zip.file('word/styles.xml');
  const documentFile = zip.file('word/document.xml');
  const settingsFile = zip.file('word/settings.xml');
  if (stylesFile) {
    const stylesXml = await stylesFile.async('string');
    zip.file('word/styles.xml', patchStylesXml(stylesXml));
  }
  if (documentFile) {
    const documentXml = await documentFile.async('string');
    zip.file('word/document.xml', patchDocumentXml(documentXml));
  }
  if (settingsFile) {
    const settingsXml = await settingsFile.async('string');
    zip.file('word/settings.xml', patchSettingsXml(settingsXml));
  }
  return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
}

function detailTable(rows = []) {
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: rows.map(([label, value]) => new TableRow({
      children: [
        new TableCell({
          width: { size: 34, type: WidthType.PERCENTAGE },
          children: [p(label, { bold: true })],
        }),
        new TableCell({
          width: { size: 66, type: WidthType.PERCENTAGE },
          children: [p(value || '')],
        }),
      ],
    })),
  });
}

function bannerBlocks() {
  return [
    p('WORKING COPY — Country Lion', { bold: true }),
    p('Pre-filled from the case record where known. Complete any remaining blanks, then upload back to the case.'),
    p('Tick boxes: click the square once in desktop Microsoft Word (not Word Online).'),
    p('Master templates: Employee Files / HR Form Templates / Disciplinaries.'),
    p(''),
  ];
}

function hearingInviteLetterBlocks(fills, caseData = {}) {
  const employeeName = fills.employeeName;
  const hearingWhen = fills.hearingWhen || '[date] at [time]';
  const actionFollowing = fills.summary || fills.caseTitle || '[nature of the concern / allegation]';
  const reportLocation = fills.reportLocation || fills.hearingLocation || '[location / room]';
  const showSuspensionWarning = Boolean(
    fills.precautionarySuspension || caseData.suspensionActive || caseData.precautionarySuspension,
  );
  const grossReason = fills.grossMisconductReason || '[nature of the incident / concerns raised]';

  const blocks = [
    p(`Dear ${employeeName},`),
    p(''),
    p(`I hereby inform you that you will be required to attend a disciplinary hearing on ${hearingWhen}.`),
    p(''),
    p(`At the hearing, action will be considered following ${actionFollowing}.`),
    p(''),
  ];

  if (showSuspensionWarning) {
    blocks.push(
      p(
        `You should be aware that due to the nature of the incident and the concerns raised, `
        + `this may be considered gross misconduct due to ${grossReason} and may result in immediate dismissal. `
        + 'In the meantime, you will be suspended on full pay until your disciplinary hearing.',
      ),
      p(''),
    );
  } else {
    blocks.push(
      p('(Delete this paragraph if not applicable.)', { italics: true }),
      p(
        'You should be aware that due to the nature of the incident and the concerns raised, '
        + 'this may be considered gross misconduct due to [reason] and may result in immediate dismissal. '
        + 'In the meantime, you will be suspended on full pay until your disciplinary hearing.',
      ),
      p(''),
    );
  }

  blocks.push(
    p(
      'You are entitled, if you wish, to be accompanied by another work colleague. '
      + 'If this is the case, please inform us of the individual you wish to attend as soon as possible.',
    ),
    p(''),
    p(
      `You will need to report to ${reportLocation} for commencement of this hearing. `
      + 'Failure to attend may result in a decision being made in your absence.',
    ),
  );

  return blocks;
}

function buildTemplateChildren(template, fills, caseData = {}) {
  const employeeName = fills.employeeName;
  const title = fills.caseTitle;
  const summary = fills.summary || '[Brief summary of the concern / allegation]';
  const hearingWhen = fills.hearingWhen || '[Date] at [Time]';
  const location = fills.hearingLocation || '[Location / meeting room]';
  const outcome = fills.outcomePreset || '[Outcome e.g. written warning / NFA]';
  const managers = fills.managersPresentLabel || '[Manager name(s)]';
  const letterDate = fills.letterDate || '';
  const investigatorName = fills.investigatorName || '[Investigator name]';
  const hearingManagerName = fills.hearingManagerName || '[Hearing manager]';
  const appealOwnerName = fills.appealOwnerName || '[Appeal manager]';
  const issuedByName = fills.issuedByName || '[Manager name]';
  const companion = String(caseData.companionName || '').trim() || '[Name / role / None]';

  const sections = {
    fact_finding_notes: [
      ...bannerBlocks(),
      h1('Fact-finding interview notes'),
      p('This is an investigatory / fact-finding meeting. It is not a formal disciplinary hearing and must not result in a disciplinary sanction by itself.', { italics: true }),
      h2('1. Meeting details'),
      detailTable([
        ['Employee', employeeName],
        ['Case / concern', title],
        ['Date', letterDate],
        ['Time', '[HH:MM]'],
        ['Location', '[Room / Teams]'],
        ['Managers present', managers],
        ['Lead interviewer', investigatorName],
        ['Note-taker (if different)', '[Name]'],
        ['Employee accompanied by', '[Colleague / TU rep / None]'],
      ]),
      h2('2. Purpose explained to the employee'),
      p(`Explain that the meeting is to gather facts about: ${summary}`),
      checkboxRow('Employee confirmed they understand the purpose of the meeting'),
      h2('3. Questions asked / points covered'),
      p('1. [Question 1]'),
      p('Response: ________________________________________________'),
      p('2. [Question 2]'),
      p('Response: ________________________________________________'),
      p('3. [Question 3]'),
      p('Response: ________________________________________________'),
      h2('4. Documents / evidence referred to'),
      p('[List any CCTV, timesheets, emails, witness notes, etc.]'),
      h2('5. Employee’s account / additional comments'),
      blank(),
      blank(),
      h2('6. Manager assessment / next steps'),
      checkboxRow('No case to answer — close with notes'),
      checkboxRow('Informal action / coaching sufficient'),
      checkboxRow('Proceed to formal disciplinary hearing'),
      checkboxRow('Other: ________________________________'),
      h2('7. Signatures'),
      p(`Manager (${investigatorName}): ________________________ Date: ${letterDate}`),
      p(`Employee (${employeeName}): _______________________ Date: __________`),
      p('Issue a copy via the Employee Portal for the employee to approve / amend / sign off.', { italics: true, size: 18 }),
    ],
    investigation_notes: [
      ...bannerBlocks(),
      h1('Investigation meeting notes'),
      detailTable([
        ['Employee / interviewee', employeeName],
        ['Case', title],
        ['Date', letterDate],
        ['Time / location', '[Details]'],
        ['Investigators present', managers],
        ['Lead investigator', investigatorName],
        ['Accompanied by', '[Name / None]'],
      ]),
      h2('1. Matter under investigation'),
      p(summary),
      h2('2. Interview notes'),
      blank(),
      blank(),
      h2('3. Evidence discussed'),
      p('[List]'),
      h2('4. Findings / recommendations'),
      checkboxLine(['No further action', 'Training', 'Formal process', 'Other: ________']),
      h2('5. Signatures'),
      p(`Investigator (${investigatorName}): ____________________ Date: ${letterDate}`),
      p(`Interviewee (${employeeName}): ____________________ Date: __________`),
    ],
    hearing_invite_letter: [
      ...bannerBlocks(),
      ...hearingInviteLetterBlocks(fills, caseData),
    ],
    hearing_minutes: [
      ...bannerBlocks(),
      h1('Disciplinary hearing minutes'),
      detailTable([
        ['Employee', employeeName],
        ['Case', title],
        ['Date / time', hearingWhen || letterDate],
        ['Location', location],
        ['Hearing manager', hearingManagerName],
        ['Other managers present', managers],
        ['Companion', companion],
        ['Note-taker', '[Name]'],
      ]),
      h2('1. Introductions and process explained'),
      checkboxLine(['Purpose of hearing explained', 'Right to be accompanied confirmed', 'Evidence pack referred to']),
      h2('2. Management case'),
      p(summary),
      p('Evidence referred to: ________________________________________________'),
      h2('3. Employee’s case / response'),
      blank(),
      blank(),
      h2('4. Questions / clarification'),
      blank(),
      h2('5. Adjournment'),
      checkboxRow('Hearing adjourned for decision'),
      p('Time resumed: __________'),
      checkboxRow('Decision reserved — employee advised outcome will follow in writing'),
      h2('6. Signatures'),
      p(`Hearing manager (${hearingManagerName}): _________________ Date: ${letterDate}`),
      p(`Employee (${employeeName}): ______________________ Date: __________`),
    ],
    grievance_meeting_notes: [
      ...bannerBlocks(),
      h1('Grievance meeting notes'),
      detailTable([
        ['Employee', employeeName],
        ['Grievance / case', title],
        ['Date', letterDate],
        ['Time / location', '[Details]'],
        ['Managers present', managers],
        ['Accompanied by', '[Name / None]'],
      ]),
      h2('1. Grievance as understood'),
      p(summary),
      h2('2. Employee’s account'),
      blank(),
      h2('3. Discussion / clarification'),
      blank(),
      h2('4. Desired resolution (employee)'),
      blank(),
      h2('5. Next steps'),
      checkboxLine(['Further investigation', 'Outcome letter to follow', 'Other: ________']),
      h2('6. Signatures'),
      p(`Manager (${issuedByName}): ____________________ Date: ${letterDate}`),
      p(`Employee (${employeeName}): ___________________ Date: __________`),
    ],
    appeal_minutes: [
      ...bannerBlocks(),
      h1('Appeal hearing minutes'),
      detailTable([
        ['Employee', employeeName],
        ['Original case', title],
        ['Original outcome', outcome],
        ['Date', letterDate],
        ['Time / location', '[Details]'],
        ['Appeal manager', appealOwnerName],
        ['Others present', managers],
        ['Companion', '[Name / None]'],
      ]),
      h2('1. Grounds of appeal'),
      p('[As stated by the employee]'),
      h2('2. Discussion'),
      blank(),
      h2('3. Appeal decision'),
      checkboxLine(['Uphold original outcome', 'Reduce sanction', 'Overturn', 'Other: ________']),
      p('Reasons: ________________________________________________________________'),
      h2('4. Signatures'),
      p(`Appeal manager (${appealOwnerName}): _________________ Date: ${letterDate}`),
      p(`Employee (${employeeName}): ______________________ Date: __________`),
    ],
    outcome_letter: [
      ...bannerBlocks(),
      h1('Outcome letter'),
      p(letterDate),
      p(`Dear ${employeeName},`),
      p(`I write to confirm the outcome of the process regarding ${title}.`),
      h2('Outcome'),
      p(outcome, { bold: true }),
      h2('Reasons'),
      p('Having considered the evidence and your responses, I have reached this decision because:'),
      p('1. ________________________________________________'),
      p('2. ________________________________________________'),
      h2('What happens next'),
      p('[Improvement expectations / review dates / NFA confirmation / dismissal arrangements — amend as needed]'),
      h2('Right of appeal'),
      p('You have the right to appeal this decision within 5 working days of receiving this letter.'),
      p('Yours sincerely,'),
      p(`${issuedByName}\n[Job title]\nCountry Lion`),
    ],
    warning_letter: [
      ...bannerBlocks(),
      h1('Formal warning letter'),
      p(letterDate),
      p(`Dear ${employeeName},`),
      p(`Following the disciplinary hearing, this letter confirms that you are receiving a ${outcome || '[verbal / written / final written warning]'}.`),
      h2('Reason for the warning'),
      p(summary),
      h2('Improvement required'),
      p('[Clear expectations and timescales]'),
      h2('Right of appeal'),
      p('You may appeal within 5 working days of receiving this letter.'),
      p('Yours sincerely,'),
      p(`${issuedByName}\n[Job title]\nCountry Lion`),
    ],
    pip_plan: [
      ...bannerBlocks(),
      h1('Performance improvement plan (PIP)'),
      detailTable([
        ['Employee', employeeName],
        ['Manager', issuedByName],
        ['Related case', title],
        ['PIP start date', letterDate],
        ['Expected end / review', '[DD/MM/YYYY]'],
      ]),
      h2('1. Performance concerns'),
      p(summary),
      h2('2. Objectives (SMART)'),
      p('Objective: ________________   Measure: ________________   By: __________'),
      p('Objective: ________________   Measure: ________________   By: __________'),
      h2('3. Support / training to be provided'),
      blank(),
      h2('4. Signatures'),
      p(`Manager (${issuedByName}): ____________________ Date: ${letterDate}`),
      p(`Employee (${employeeName}): ___________________ Date: __________`),
    ],
    training_outline: [
      ...bannerBlocks(),
      h1('Training outline'),
      detailTable([
        ['Employee', employeeName],
        ['Related case', title],
        ['Training owner / trainer', issuedByName],
        ['Target completion date', '[DD/MM/YYYY]'],
      ]),
      h2('1. Why training is required'),
      p(summary),
      h2('2. Training to be completed'),
      p('Course / module: ________________'),
      p('Delivery method: [classroom / on-road / e-learning / coaching]'),
      h2('3. Sign-off'),
      p(`Training lead (${issuedByName}): _________________ Date: ${letterDate}`),
      p(`Employee (${employeeName}): ____________________ Date: __________`),
    ],
    suspension_letter: [
      ...bannerBlocks(),
      h1('Suspension letter'),
      p(letterDate),
      p(`Dear ${employeeName},`),
      p('I am writing to confirm that you are suspended from work on a precautionary basis pending investigation.'),
      detailTable([
        ['Effective from', fills.suspensionFrom || letterDate],
        ['Reason', fills.suspensionReason || summary],
        ['Related case', title],
      ]),
      p('Suspension is not a disciplinary sanction and does not imply guilt.'),
      p('Yours sincerely,'),
      p(`${issuedByName}\n[Job title]\nCountry Lion`),
    ],
    note_on_file: [
      ...bannerBlocks(),
      h1('Note on file'),
      detailTable([
        ['Employee', employeeName],
        ['Date', letterDate],
        ['Manager', managers],
        ['Related case (if any)', title],
      ]),
      h2('Summary of discussion / informal action'),
      p(summary),
      blank(),
      h2('Agreed actions / expectations'),
      blank(),
      h2('Signatures'),
      p(`Manager (${issuedByName}): ____________________ Date: ${letterDate}`),
      p(`Employee (${employeeName}): ___________________ Date: __________`),
    ],
  };

  return sections[template.id] || [
    ...bannerBlocks(),
    p(`Complete this document for ${title}.`),
  ];
}

async function buildTemplateDocxBuffer({ template, fills, caseData = {} }) {
  const children = buildTemplateChildren(template, fills, caseData);
  const doc = new Document({
    styles: DOCUMENT_STYLES,
    features: { updateFields: false },
    sections: [{ children }],
  });
  const raw = await Packer.toBuffer(doc);
  return finalizeDocxBuffer(raw);
}

module.exports = {
  DOCX_MIME_TYPE,
  buildTemplateDocxBuffer,
};
