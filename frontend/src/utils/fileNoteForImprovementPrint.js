import { wrapWithLetterhead } from './letterTemplate';

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function paragraphHtml(value) {
  return escapeHtml(value).replace(/\n/g, '<br/>');
}

function formatSignatureBlock(signature, {
  roleLabel,
  personName,
  pendingLabel = 'Awaiting digital signature via Employee Portal',
}) {
  if (signature?.signedAtLabel && signature?.signedByName) {
    return `
      <p><strong>${escapeHtml(roleLabel)}:</strong> ${escapeHtml(personName || signature.signedByName)}</p>
      <div class="digital-sig">
        <p class="sig-name">${escapeHtml(signature.signedByName)}</p>
        <p class="sig-meta">Digitally signed via Employee Portal</p>
        <p class="sig-meta">${escapeHtml(signature.signedAtLabel)}</p>
      </div>
    `;
  }
  return `
    <p><strong>${escapeHtml(roleLabel)}:</strong> ${escapeHtml(personName || '')}</p>
    <div class="sig-line"></div>
    <p class="sig-label">${escapeHtml(pendingLabel)}</p>
    <div class="sig-line"></div>
    <p class="sig-label">Date</p>
  `;
}

export function formatUkDateTime(date = new Date()) {
  const d = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString('en-GB', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function buildFileNoteForImprovementHtml({
  employeeName,
  managerName,
  reason,
  actionRequired,
  issuedAtLabel,
  managerSignature = null,
  employeeSignature = null,
}) {
  const issuedDate = issuedAtLabel || new Date().toLocaleDateString('en-GB');
  const managerBlock = formatSignatureBlock(managerSignature, {
    roleLabel: 'Issued by',
    personName: managerName || 'Manager',
    pendingLabel: 'Manager signature',
  });
  const employeeBlock = formatSignatureBlock(employeeSignature, {
    roleLabel: 'Issued to',
    personName: employeeName || 'Employee',
    pendingLabel: 'Awaiting digital signature via Employee Portal',
  });

  const bodyHtml = `
  <p class="date">${escapeHtml(issuedDate)}</p>
  <p class="body-text">
    I am writing to confirm that I am issuing you with this File Note for Improvement. This is to advise you
    that improvement is required, and the File Note has been issued for the following reason:
  </p>
  <p class="body-text">${paragraphHtml(reason)}</p>
  <h2>Improvement or action required</h2>
  <p>The following improvement or action is now required from you:</p>
  <p class="body-text">${paragraphHtml(actionRequired)}</p>
  <h2>Purpose of report</h2>
  <p>
    The aim of this File Note is to communicate the standards required and to encourage all employees to meet
    these standards. This notice does not form part of the formal disciplinary procedure but will be kept on your
    personnel file and if further incidents arise, may be taken into consideration should formal action be taken
    or in deciding whether formal action should be taken.
  </p>
  <p>
    If you have any concerns about this report, you should raise this with your Manager as soon as possible.
  </p>
  <div class="signatures">
    <div class="row">
      <div class="cell">${managerBlock}</div>
      <div class="cell">${employeeBlock}</div>
    </div>
  </div>`;

  return wrapWithLetterhead({
    title: 'File Note for Improvement',
    bodyHtml,
    addresseeName: employeeName,
  });
}

export { printHearingInvite as printHtmlDocument } from './hearingInvitePrint';
