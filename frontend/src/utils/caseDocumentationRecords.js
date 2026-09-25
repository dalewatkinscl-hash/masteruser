import {
  formatInterviewWhen,
  formatInterviewee,
  interviewDisplayStatus,
  interviewIsOtherEmployee,
  interviewStatusLabel,
} from './interviewNotes';
import { stageLabel } from './peopleCasesAccess';

function formatUkDate(value) {
  if (!value) return '';
  const text = String(value).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
  const [y, m, d] = text.split('-');
  return `${d}/${m}/${y}`;
}

export function interviewSummary(minute = {}, caseData = {}) {
  const name = formatInterviewee(minute, caseData) || 'employee';
  const when = formatInterviewWhen(minute);
  const other = interviewIsOtherEmployee(minute, caseData);
  const who = other ? `${name} (other employee)` : name;
  if (when) return `Interview with ${who} on ${when}`;
  const created = formatUkDate(minute.createdAt);
  return created ? `Interview with ${who} on ${created}` : `Interview with ${who}`;
}

export function documentSummary(doc = {}) {
  const when = formatUkDate(doc.createdAt);
  return when ? `${doc.fileName || 'Document'} uploaded ${when}` : (doc.fileName || 'Document');
}

export function buildDocumentationRecords({ minutes = [], documents = [], caseData = {} }) {
  const linkedDocIds = new Set(minutes.map((item) => item.documentId).filter(Boolean));
  const records = [];

  for (const minute of minutes) {
    const isDocumentReview = Boolean(minute.documentId);
    records.push({
      id: `minutes-${minute.id}`,
      kind: isDocumentReview ? 'document_review' : 'interview',
      summary: isDocumentReview
        ? `Document for ${formatInterviewee(minute, caseData) || 'employee'}: ${minute.fileName || 'file'}`
        : interviewSummary(minute, caseData),
      status: interviewDisplayStatus(minute),
      statusLabel: interviewStatusLabel(interviewDisplayStatus(minute)),
      stageKey: minute.stageKey || '',
      stageLabel: minute.stageKey ? stageLabel(minute.stageKey) : '',
      at: minute.interviewAt || minute.createdAt || '',
      minute,
      document: isDocumentReview ? { id: minute.documentId, fileName: minute.fileName, sharePointWebUrl: minute.sharePointWebUrl } : null,
    });
  }

  for (const doc of documents) {
    if (linkedDocIds.has(doc.id)) continue;
    const pendingSign = doc.employeeSignStatus === 'pending';
    const signed = doc.employeeSignStatus === 'signed';
    const sent = Boolean(doc.issuedToEmployeeAt || doc.issuedMinutesId);
    let status = 'uploaded';
    let statusLabel = 'Uploaded';
    if (pendingSign) {
      status = 'pending_employee';
      statusLabel = 'Awaiting employee signature';
    } else if (signed) {
      status = 'signed';
      statusLabel = 'Signed';
    } else if (sent) {
      status = interviewDisplayStatus({ status: doc.employeeReviewStatus || 'issued' });
      statusLabel = interviewStatusLabel(status);
    }
    records.push({
      id: `doc-${doc.id}`,
      kind: 'upload',
      summary: documentSummary(doc),
      status,
      statusLabel,
      stageKey: doc.stageKey || '',
      stageLabel: doc.stageKey ? stageLabel(doc.stageKey) : '',
      at: doc.createdAt || '',
      document: doc,
      minute: null,
    });
  }

  return records.sort((left, right) => String(right.at || '').localeCompare(String(left.at || '')));
}
