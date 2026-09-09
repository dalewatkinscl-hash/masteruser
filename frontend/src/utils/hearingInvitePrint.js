import { wrapWithLetterhead } from './letterTemplate';

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
  suspensionActive = false,
  precautionarySuspension = false,
  suspensionReason = '',
  evidenceDocumentNames = [],
}) {
  const when = formatHearingWhenLabel(hearingScheduledAt, hearingScheduledTime);
  const location = String(hearingLocation || '').trim() || companyName || 'Country Lion';
  const notes = String(extraNotes || '').trim();
  const showSuspension = Boolean(suspensionActive || precautionarySuspension);
  const signerName = String(hearingManagerName || issuedByName || 'Management').trim() || 'Management';
  const issuedDate = String(issuedAtLabel || new Date().toLocaleDateString('en-GB')).trim();
  const allegationDetails = String(caseSummary || caseTitle || 'the matter under consideration — further particulars will be confirmed at the hearing').trim();
  const evidenceNames = (Array.isArray(evidenceDocumentNames) ? evidenceDocumentNames : [])
    .map((name) => String(name || '').trim())
    .filter(Boolean);
  const evidenceListHtml = evidenceNames.length
    ? `<ul>${evidenceNames.map((name) => `<li>${escapeHtml(name)}</li>`).join('')}</ul>
       <p>Copies of these documents are enclosed with this invitation and/or available via the Employee Portal for you to review before the hearing.</p>`
    : `<p>Copies of any written evidence, investigatory notes, or witness statements that will be discussed at the hearing are enclosed with this invitation and/or available via the Employee Portal. Please review them carefully so you can prepare your response.</p>`;

  const bodyHtml = `
  <p class="date">${escapeHtml(issuedDate)}</p>
  <p>I hereby inform you that you are required to attend a formal disciplinary hearing. The arrangements are as follows:</p>
  <div class="meeting-details">
    <p><strong>Date / time:</strong> ${escapeHtml(when)}</p>
    <p><strong>Location:</strong> ${escapeHtml(location)}</p>
    <p><strong>Hearing manager:</strong> ${escapeHtml(signerName)}</p>
  </div>
  <p><strong>Alleged misconduct / performance issue</strong></p>
  <p>The hearing will consider the following concern(s), so that you can thoroughly prepare a response:</p>
  <p>${escapeHtml(allegationDetails).replace(/\n/g, '<br/>')}</p>
  ${notes ? `<p>${escapeHtml(notes).replace(/\n/g, '<br/>')}</p>` : ''}
  <p><strong>Evidence to be discussed</strong></p>
  ${evidenceListHtml}
  ${showSuspension ? `<p>You should be aware that due to the nature of the concerns raised${suspensionReason ? ` (${escapeHtml(suspensionReason)})` : ''}, you will be suspended on full pay pending the outcome of the disciplinary hearing.</p>` : ''}
  <p><strong>Possible outcomes</strong></p>
  <p>At the hearing, a range of outcomes may be considered. Depending on the findings, this may include no further action, informal action, a written warning, a final written warning, or other appropriate action. <strong>Dismissal is a possible outcome of this hearing.</strong></p>
  <p><strong>Your right to be accompanied</strong></p>
  <p>You have a statutory right to be accompanied at this hearing by a companion. If you wish to be accompanied, please inform us of the individual you wish to attend as soon as possible. If your companion cannot attend, you may ask to postpone the hearing by up to five working days.</p>
  <p>Failure to attend may result in a decision being made in your absence. Please confirm attendance via the Employee Portal where possible. If you cannot attend, contact your manager as soon as you can.</p>
  <div class="closing">
    <p>Yours sincerely,</p>
    <div class="sig-block">
      <p class="sig-name">${escapeHtml(signerName)}</p>
      <p class="sig-printed">${escapeHtml(signerName)}</p>
      <p class="sig-role">Hearing Manager</p>
    </div>
  </div>`;

  return wrapWithLetterhead({
    title: 'Invitation to disciplinary hearing',
    bodyHtml,
    addresseeName: employeeName,
  });
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
    // Allow letterhead images to load before printing
    window.setTimeout(runPrint, 600);
  });
}

export function openHearingInvitePreview(html) {
  const win = window.open('', '_blank');
  if (!win) throw new Error('Pop-up blocked. Allow pop-ups to view the invite.');
  win.document.open();
  win.document.write(html);
  win.document.close();
}
