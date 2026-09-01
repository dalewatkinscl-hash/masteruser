function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function formatHearingWhenLabel(isoDate, time) {
  const date = new Date(`${String(isoDate || '').slice(0, 10)}T00:00:00`);
  if (Number.isNaN(date.getTime())) return String(isoDate || '');
  const datePart = date.toLocaleDateString('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
  const timePart = String(time || '').trim();
  return timePart ? `${datePart} at ${timePart}` : datePart;
}

export function buildHearingInviteHtml({
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
}) {
  const when = formatHearingWhenLabel(hearingScheduledAt, hearingScheduledTime);
  const location = String(hearingLocation || '').trim() || 'To be confirmed';
  const notes = String(extraNotes || '').trim();
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Invitation to disciplinary hearing</title>
  <style>
    @page { size: A4; margin: 18mm; }
    body { font-family: Georgia, "Times New Roman", serif; color: #111; line-height: 1.45; margin: 0; }
    h1 { font-size: 18pt; margin: 0 0 4px; }
    .meta { color: #444; font-size: 10pt; margin-bottom: 22px; }
    p { margin: 0 0 12px; font-size: 11pt; }
    .box { border: 1px solid #ccc; padding: 12px 14px; margin: 16px 0; }
    .box p { margin: 0 0 6px; }
    .box p:last-child { margin: 0; }
    ul { margin: 8px 0 14px; padding-left: 20px; }
    li { margin-bottom: 6px; font-size: 11pt; }
    .footer { margin-top: 28px; font-size: 9pt; color: #555; }
  </style>
</head>
<body>
  <h1>Invitation to a disciplinary hearing</h1>
  <p class="meta">${escapeHtml(companyName)} · Issued ${escapeHtml(issuedAtLabel || new Date().toLocaleDateString('en-GB'))}</p>
  <p>Dear ${escapeHtml(employeeName || 'Colleague')},</p>
  <p>
    You are invited to attend a formal disciplinary hearing. Please read this invitation carefully
    and prepare any response you wish to make.
  </p>
  <div class="box">
    <p><strong>Case:</strong> ${escapeHtml(caseTitle || 'Disciplinary case')}</p>
    <p><strong>Date / time:</strong> ${escapeHtml(when)}</p>
    <p><strong>Location:</strong> ${escapeHtml(location)}</p>
    <p><strong>Hearing manager:</strong> ${escapeHtml(hearingManagerName || 'To be confirmed')}</p>
  </div>
  <p><strong>Summary of the concern</strong></p>
  <p>${escapeHtml(caseSummary || 'See case file / evidence pack for full details.').replace(/\n/g, '<br/>')}</p>
  ${notes ? `<p><strong>Further details</strong></p><p>${escapeHtml(notes).replace(/\n/g, '<br/>')}</p>` : ''}
  <p><strong>Your rights</strong></p>
  <ul>
    <li>You have the right to be accompanied by a work colleague or trade union representative.</li>
    <li>You should be given enough time to prepare and to review any evidence we will rely on.</li>
    <li>If your companion cannot attend, you may ask to postpone by up to five working days.</li>
  </ul>
  <p>
    Please confirm attendance via the Employee Portal where possible. If you cannot attend,
    contact your manager as soon as you can.
  </p>
  <p>Yours sincerely,<br/>${escapeHtml(issuedByName || 'Management')}</p>
  <p class="footer">
    This invitation is issued in line with Acas principles on disciplinary procedures.
    Acas does not set a fixed number of days’ notice; notice must be reasonable in the circumstances.
  </p>
</body>
</html>`;
}

function removePrintFrame(iframe) {
  if (iframe?.parentNode) iframe.parentNode.removeChild(iframe);
}

export function printHearingInvite(html) {
  return new Promise((resolve, reject) => {
    const iframe = document.createElement('iframe');
    iframe.setAttribute('aria-hidden', 'true');
    iframe.style.position = 'fixed';
    iframe.style.right = '0';
    iframe.style.bottom = '0';
    iframe.style.width = '0';
    iframe.style.height = '0';
    iframe.style.border = '0';
    document.body.appendChild(iframe);

    const frameWindow = iframe.contentWindow;
    const frameDocument = frameWindow?.document;
    if (!frameWindow || !frameDocument) {
      removePrintFrame(iframe);
      reject(new Error('Could not prepare the print document.'));
      return;
    }

    const runPrint = () => {
      try {
        frameWindow.focus();
        frameWindow.print();
        resolve();
      } catch (error) {
        reject(error);
      } finally {
        removePrintFrame(iframe);
      }
    };

    frameDocument.open();
    frameDocument.write(html);
    frameDocument.close();
    window.setTimeout(runPrint, 250);
  });
}

export function openHearingInvitePreview(html) {
  const win = window.open('', '_blank');
  if (!win) throw new Error('Pop-up blocked. Allow pop-ups to view the invite.');
  win.document.open();
  win.document.write(html);
  win.document.close();
}
