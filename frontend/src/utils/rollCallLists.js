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

export function fetchRollCallLists() {
  return apiJson('/api/getRollCallLists');
}

export function fetchRollCallList(listId) {
  return apiJson(`/api/getRollCallList/${encodeURIComponent(listId)}`);
}

export function createRollCallList({ title, memberUids }) {
  return apiJson('/api/createRollCallList', {
    method: 'POST',
    body: JSON.stringify({ title, memberUids }),
  });
}

export function updateRollCallList({ listId, title, memberUids }) {
  const body = { listId };
  if (title !== undefined) body.title = title;
  if (memberUids !== undefined) body.memberUids = memberUids;
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

export function setRollCallListArchived(listId, archived = true) {
  return apiJson('/api/deleteRollCallList', {
    method: 'POST',
    body: JSON.stringify({ listId, archived }),
  });
}
