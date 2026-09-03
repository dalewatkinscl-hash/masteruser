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

function buildFileNoteForImprovementHtml({
  employeeName,
  managerName,
  reason,
  actionRequired,
  issuedAtLabel,
  managerSignature = null,
  employeeSignature = null,
  companyName = 'Country Lion',
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

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>File Note for Improvement</title>
  <style>
    @page { size: A4; margin: 18mm; }
    body { font-family: "Century Gothic", Calibri, Arial, sans-serif; color: #111; line-height: 1.5; margin: 0; font-size: 11pt; }
    h1 { font-size: 16pt; margin: 0 0 6px; text-transform: uppercase; letter-spacing: 0.04em; }
    h2 { font-size: 11pt; margin: 20px 0 8px; text-transform: uppercase; letter-spacing: 0.06em; }
    .meta { color: #444; font-size: 10pt; margin-bottom: 22px; }
    p { margin: 0 0 12px; }
    .body-text { margin: 16px 0; }
    .signatures { margin-top: 36px; display: table; width: 100%; border-collapse: collapse; }
    .signatures .row { display: table-row; }
    .signatures .cell { display: table-cell; width: 50%; vertical-align: top; padding-right: 24px; padding-top: 8px; }
    .sig-line { border-bottom: 1px solid #333; height: 28px; margin: 8px 0 4px; }
    .sig-label { font-size: 9pt; color: #444; }
    .digital-sig { border: 1px solid #1e3a5f; background: #f4f8fc; padding: 10px 12px; margin-top: 8px; border-radius: 4px; }
    .digital-sig .sig-name { font-family: "Brush Script MT", "Segoe Script", Georgia, serif; font-size: 18pt; margin: 0 0 4px; color: #0b1220; }
    .digital-sig .sig-meta { font-size: 9pt; color: #444; margin: 0 0 2px; }
  </style>
</head>
<body>
  <h1>File Note for Improvement</h1>
  <p class="meta">${escapeHtml(companyName)} · ${escapeHtml(issuedDate)}</p>

  <p class="body-text">
    This File Note for Improvement is being issued to: <strong>${escapeHtml(employeeName || 'Employee')}</strong>.
  </p>
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
  </div>
</body>
</html>`;
}

function formatUkDateTime(date = new Date()) {
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

module.exports = {
  buildFileNoteForImprovementHtml,
  formatUkDateTime,
};
