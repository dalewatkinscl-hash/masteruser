const { wrapWithLetterhead } = require('./letterTemplate');
const { formatSignatureBlock } = require('./fileNoteForImprovement');

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function paragraphHtml(value) {
  const text = String(value || '').trim();
  if (!text) return '<span style="color:#888;font-style:italic;">None recorded</span>';
  return escapeHtml(text).replace(/\n/g, '<br/>');
}

const RETURN_TO_WORK_QUESTIONS = [
  {
    id: 'q1_feeling',
    number: 1,
    question: 'How are you feeling today about being back at work?',
  },
  {
    id: 'q2_fit_note',
    number: 2,
    question: "Are you feeling well enough to resume your duties today, or did your GP/medical professional provide a 'fit note' with specific recommendations?",
  },
  {
    id: 'q3_work_contribution',
    number: 3,
    question: "Without sharing anything you aren't comfortable with, do you feel any aspects of your work contributed to your absence?",
  },
  {
    id: 'q4_worries_tasks',
    number: 4,
    question: 'Are there any specific tasks or situations you are particularly worried about facing as you return?',
  },
  {
    id: 'q5_adjustments',
    number: 5,
    question: 'Are there any temporary or permanent adjustments can we put in place to help you transition back smoothly?',
  },
  {
    id: 'q6_medical_appointments',
    number: 6,
    question: 'Do you have any upcoming medical appointments or therapy sessions that we need to accommodate in your schedule?',
  },
  {
    id: 'q7_external_support',
    number: 7,
    question: 'Are you aware of the external support available to you?',
  },
  {
    id: 'q8_check_ins',
    number: 8,
    question: 'How often would you like us to check in with you over the next few weeks?',
  },
];

function buildReturnToWorkHtml({
  employeeName,
  department = '',
  managerName = 'Lead Manager',
  secondManagerName = '',
  interviewDate = '',
  interviewTime = '',
  answers = {},
  additionalNotes = '',
  issuedAtLabel,
  managerSignature = null,
  employeeSignature = null,
}) {
  const formattedDate = interviewDate
    ? (interviewDate.includes('-') ? interviewDate.split('-').reverse().join('/') : interviewDate)
    : (issuedAtLabel || new Date().toLocaleDateString('en-GB'));
  const dateTimeStr = interviewTime ? `${formattedDate} at ${interviewTime}` : formattedDate;

  const manager1Block = formatSignatureBlock(managerSignature, {
    roleLabel: 'Conducting Manager (Lead)',
    personName: managerName,
    pendingLabel: 'Manager digital signature',
  });

  const employeeBlock = formatSignatureBlock(employeeSignature, {
    roleLabel: 'Employee',
    personName: employeeName,
    pendingLabel: 'Awaiting digital signature via Employee Portal',
  });

  const questionsHtml = RETURN_TO_WORK_QUESTIONS.map((q) => {
    const ans = answers[q.id] || answers[q.question] || '';
    return `
      <div style="margin-bottom:18px;padding:12px 14px;border:1px solid #dbe2ea;background:#f8fafc;border-radius:6px;page-break-inside:avoid;break-inside:avoid;">
        <p style="margin:0 0 6px;font-weight:700;color:#0f172a;font-size:10.5pt;">
          ${q.number}. ${escapeHtml(q.question)}
        </p>
        <div style="margin:0;color:#334155;font-size:10pt;background:#ffffff;padding:8px 10px;border:1px solid #cbd5e1;border-radius:4px;">
          ${paragraphHtml(ans)}
        </div>
      </div>
    `;
  }).join('');

  const extraNotesHtml = additionalNotes?.trim() ? `
    <div style="margin-top:20px;padding:12px 14px;border:1px solid #cbd5e1;background:#f1f5f9;border-radius:6px;page-break-inside:avoid;break-inside:avoid;">
      <h3 style="margin:0 0 6px;font-size:10.5pt;text-transform:uppercase;color:#334155;letter-spacing:0.04em;">Additional Notes / Agreed Actions</h3>
      <p style="margin:0;color:#1e293b;font-size:10pt;">${paragraphHtml(additionalNotes)}</p>
    </div>
  ` : '';

  const bodyHtml = `
    <div style="margin-bottom:20px;border-bottom:2px solid #0f172a;padding-bottom:12px;">
      <h1 style="margin:0 0 4px;font-size:16pt;color:#0f172a;font-weight:800;text-transform:uppercase;letter-spacing:0.02em;">
        Return to Work Interview
      </h1>
      <p style="margin:0;font-size:9.5pt;color:#475569;">
        Official record of return to work discussion and agreed support.
      </p>
    </div>

    <div class="meeting-details" style="margin-bottom:22px;display:table;width:100%;box-sizing:border-box;">
      <div style="display:table-row;">
        <div style="display:table-cell;width:50%;padding:4px 8px 4px 0;">
          <p style="margin:0 0 4px;"><strong>Employee:</strong> ${escapeHtml(employeeName)}${department ? ` (${escapeHtml(department)})` : ''}</p>
          <p style="margin:0;"><strong>Date &amp; Time:</strong> ${escapeHtml(dateTimeStr)}</p>
        </div>
        <div style="display:table-cell;width:50%;padding:4px 0 4px 8px;">
          <p style="margin:0 0 4px;"><strong>Conducting Manager (Lead):</strong> ${escapeHtml(managerName)}</p>
          <p style="margin:0;"><strong>Second Manager Present:</strong> ${escapeHtml(secondManagerName || 'None recorded')}</p>
        </div>
      </div>
    </div>

    <div style="margin-bottom:20px;">
      <h2 style="font-size:11pt;color:#0f172a;margin:0 0 12px;text-transform:uppercase;letter-spacing:0.04em;">
        Interview Questions &amp; Discussion Notes
      </h2>
      ${questionsHtml}
      ${extraNotesHtml}
    </div>

    <div style="margin-top:24px;padding:12px 14px;border:1px solid #e2e8f0;background:#f8fafc;border-radius:6px;page-break-inside:avoid;break-inside:avoid;">
      <p style="margin:0;font-size:9pt;color:#475569;line-height:1.45;">
        <strong>Acknowledgment:</strong> Both parties confirm that this Return to Work discussion took place with two managers present. The recorded notes represent an accurate reflection of the discussion and any agreed adjustments. Once digitally signed by both parties, this document is permanently stored on the employee's personnel file.
      </p>
    </div>

    <div class="signatures" style="margin-top:28px;page-break-inside:avoid;break-inside:avoid;">
      <div class="row">
        <div class="cell">${manager1Block}</div>
        <div class="cell">${employeeBlock}</div>
      </div>
      ${secondManagerName ? `
        <div class="row" style="margin-top:14px;">
          <div class="cell" style="padding-top:12px;">
            <p><strong>Second Manager Present:</strong> ${escapeHtml(secondManagerName)}</p>
            <p style="font-size:9pt;color:#555;margin:4px 0 0;">Recorded as attending manager</p>
          </div>
          <div class="cell"></div>
        </div>
      ` : ''}
    </div>
  `;

  return wrapWithLetterhead({
    title: `Return to Work Interview - ${employeeName}`,
    bodyHtml,
    addresseeName: employeeName,
  });
}

module.exports = {
  RETURN_TO_WORK_QUESTIONS,
  buildReturnToWorkHtml,
};
