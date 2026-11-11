import { readJsonResponse } from './employeeProfile';

export function formatRollCallDateTime(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function formatRollCallDate(value) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

export function rollCallPercentComplete(list) {
  if (typeof list?.percentComplete === 'number') return list.percentComplete;
  const total = Number(list?.totalCount) || 0;
  const done = Number(list?.doneCount) || 0;
  if (!total) return 0;
  return Math.round((done / total) * 100);
}

async function apiJson(url, options = {}) {
  const response = await fetch(url, {
    credentials: 'include',
    ...options,
    headers: {
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...(options.headers || {}),
    },
  });
  const payload = (await readJsonResponse(response)) || {};
  if (!response.ok) {
    throw new Error(payload.error || 'Request failed.');
  }
  return payload;
}

export const ROLL_CALL_RESPONSE_PRESETS = [
  {
    id: 'availability',
    name: 'Available / Not Available',
    confirmLabel: 'I am available',
    rejectLabel: 'I am not available',
  },
  {
    id: 'yes_no',
    name: 'Yes / No',
    confirmLabel: 'Yes',
    rejectLabel: 'No',
  },
  {
    id: 'attendance',
    name: 'Attending / Cannot Attend',
    confirmLabel: 'I will attend',
    rejectLabel: 'Cannot attend',
  },
  {
    id: 'accept_decline',
    name: 'Accept / Decline',
    confirmLabel: 'Accept',
    rejectLabel: 'Decline',
  },
  {
    id: 'confirm_unable',
    name: 'Confirmed / Unable',
    confirmLabel: 'Confirmed',
    rejectLabel: 'Unable',
  },
  {
    id: 'custom',
    name: 'Custom buttons…',
    confirmLabel: '',
    rejectLabel: '',
  },
];

export function fetchRollCallLists() {
  return apiJson('/api/getRollCallLists');
}

export function fetchRollCallList(listId) {
  return apiJson(`/api/getRollCallList/${encodeURIComponent(listId)}`);
}

export function createRollCallList({
  title,
  message = '',
  memberUids,
  distribute = false,
  confirmLabel = 'I am available',
  rejectLabel = 'I am not available',
}) {
  return apiJson('/api/createRollCallList', {
    method: 'POST',
    body: JSON.stringify({
      title,
      message,
      memberUids,
      distribute,
      confirmLabel,
      rejectLabel,
    }),
  });
}

export function distributeRollCallList({
  listId,
  message = '',
  resendAll = false,
  confirmLabel,
  rejectLabel,
}) {
  const body = { listId, message, resendAll };
  if (confirmLabel !== undefined) body.confirmLabel = confirmLabel;
  if (rejectLabel !== undefined) body.rejectLabel = rejectLabel;
  return apiJson('/api/distributeRollCallList', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export function updateRollCallList({
  listId,
  title,
  message,
  memberUids,
  confirmLabel,
  rejectLabel,
}) {
  const body = { listId };
  if (title !== undefined) body.title = title;
  if (message !== undefined) body.message = message;
  if (memberUids !== undefined) body.memberUids = memberUids;
  if (confirmLabel !== undefined) body.confirmLabel = confirmLabel;
  if (rejectLabel !== undefined) body.rejectLabel = rejectLabel;
  return apiJson('/api/updateRollCallList', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export function setRollCallMemberTick({ listId, uid, ticked }) {
  return apiJson('/api/setRollCallMemberTick', {
    method: 'POST',
    body: JSON.stringify({ listId, uid, ticked }),
  });
}

export function setRollCallMemberStatus({ listId, uid, status, note }) {
  return apiJson('/api/setRollCallMemberStatus', {
    method: 'POST',
    body: JSON.stringify({ listId, uid, status, note }),
  });
}

export function setRollCallListArchived(listId, archived = true) {
  return apiJson('/api/deleteRollCallList', {
    method: 'POST',
    body: JSON.stringify({ listId, archived }),
  });
}

// Employee-facing helpers
export function fetchMyPendingRollCalls() {
  return apiJson('/api/getMyPendingRollCalls');
}

export function markRollCallSeen(listId) {
  return apiJson('/api/markRollCallSeen', {
    method: 'POST',
    body: JSON.stringify({ listId }),
  });
}

export function respondRollCall({ listId, status, note }) {
  return apiJson('/api/respondRollCall', {
    method: 'POST',
    body: JSON.stringify({ listId, status, note }),
  });
}
