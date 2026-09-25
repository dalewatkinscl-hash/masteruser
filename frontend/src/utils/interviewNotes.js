/** Map case_minutes.status to manager-facing labels. */
export const MIN_INTERVIEW_MANAGERS = 2;

export function interviewDisplayStatus(minutes = {}) {
  if (minutes.status === 'signed_off') return 'confirmed';
  if (minutes.status === 'uploaded') return 'uploaded';
  if (minutes.status === 'amendment_requested') return 'amendment_requested';
  if (minutes.disputed || minutes.status === 'disputed') return 'amendment_requested';
  if (minutes.status === 'issued') return 'pending';
  return 'pending';
}

export function interviewStatusLabel(displayStatus) {
  const labels = {
    pending: 'Pending employee',
    confirmed: 'Confirmed',
    amendment_requested: 'Amendment requested',
    uploaded: 'Uploaded',
  };
  return labels[displayStatus] || displayStatus || 'Pending employee';
}

export function interviewStatusTone(displayStatus) {
  const tones = {
    pending: 'bg-amber-500/15 text-amber-200 border-amber-500/30',
    confirmed: 'bg-emerald-500/15 text-emerald-200 border-emerald-500/30',
    amendment_requested: 'bg-orange-500/15 text-orange-200 border-orange-500/30',
    uploaded: 'bg-slate-500/15 text-slate-300 border-slate-500/30',
  };
  return tones[displayStatus] || tones.pending;
}

export function isAmendmentPending(item = {}) {
  return item.status === 'amendment_requested'
    || item.status === 'disputed'
    || item.disputed === true;
}

export function pendingAmendmentRequests(item = {}) {
  const list = Array.isArray(item.amendmentRequests) ? item.amendmentRequests : [];
  return list.filter((entry) => !entry.status || entry.status === 'pending');
}

export function formatInterviewWhen(item = {}) {
  const date = item.interviewAt || '';
  const time = item.interviewTime || '';
  if (date) {
    const formatted = formatUkDate(date);
    return time ? `${formatted} at ${time}` : formatted;
  }
  return item.createdAt?.slice?.(0, 16)?.replace('T', ' ') || '';
}

function formatUkDate(value) {
  if (!value) return '';
  const text = String(value).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
  const [y, m, d] = text.split('-');
  return `${d}/${m}/${y}`;
}

export function formatManagersPresent(item = {}) {
  const list = Array.isArray(item.managersPresent) ? item.managersPresent : [];
  if (!list.length) return '';
  return list.map((person) => person.name || person.uid).filter(Boolean).join(', ');
}

export function formatInterviewee(item = {}, caseData = {}) {
  const name = item.intervieweeNameSnapshot
    || item.intervieweeName
    || '';
  if (name) return name;
  if (item.employeeUid && item.employeeUid === caseData?.employeeUid) {
    return caseData?.employeeNameSnapshot || '';
  }
  // Older records / fallbacks: if this interview is for someone other than the case
  // subject, avoid mis-labelling them as the case employee.
  if (item.employeeUid && caseData?.employeeUid && item.employeeUid !== caseData.employeeUid) {
    return 'Another employee';
  }
  return caseData?.employeeNameSnapshot || '';
}

export function interviewIsOtherEmployee(item = {}, caseData = {}) {
  const intervieweeUid = item.employeeUid || item.intervieweeUid || '';
  const caseUid = caseData?.employeeUid || item.caseEmployeeUid || '';
  return Boolean(intervieweeUid && caseUid && intervieweeUid !== caseUid);
}

export function buildInterviewContent({ content, interviewAt, interviewTime, employeeName, managersLabel, stageLabelText }) {
  const header = [
    stageLabelText ? `Stage: ${stageLabelText}` : '',
    employeeName ? `Employee interviewed: ${employeeName}` : '',
    interviewAt ? `Date: ${interviewAt}${interviewTime ? ` at ${interviewTime}` : ''}` : '',
    managersLabel ? `Managers present: ${managersLabel}` : '',
  ].filter(Boolean).join('\n');

  const body = String(content || '').trim();
  return header ? `${header}\n\n${body}` : body;
}
