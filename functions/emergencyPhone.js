'use strict';

const COLLECTION = 'emergency_phone_shifts';
const EMERGENCY_PHONE_NUMBER = '07734560791';
const EMERGENCY_PHONE_TEL = 'tel:+447734560791';

function pad2(value) {
  return String(value).padStart(2, '0');
}

function toDateKey(date) {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

function parseDateKey(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || '').trim());
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(year, month - 1, day);
  if (
    date.getFullYear() !== year
    || date.getMonth() !== month - 1
    || date.getDate() !== day
  ) {
    return null;
  }
  return { year, month, day, key: toDateKey(date), date };
}

function startOfDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0, 0);
}

function endOfDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59, 999);
}

function formatDateLabel(dateKey) {
  const parsed = parseDateKey(dateKey);
  if (!parsed) return dateKey || '';
  return parsed.date.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

function weeksBetween(fromDate, toDate) {
  if (!fromDate || !toDate) return null;
  const ms = toDate.getTime() - fromDate.getTime();
  if (ms < 0) return 0;
  return Math.floor(ms / (7 * 24 * 60 * 60 * 1000));
}

function shiftCoversInstant(shift, instant = new Date()) {
  const start = parseDateKey(shift.startDate);
  const end = parseDateKey(shift.endDate);
  if (!start || !end) return false;
  const t = instant.getTime();
  return t >= startOfDay(start.date).getTime() && t <= endOfDay(end.date).getTime();
}

function findCurrentShift(shifts, now = new Date()) {
  const active = (shifts || []).filter((shift) => shiftCoversInstant(shift, now));
  if (!active.length) return null;
  active.sort((a, b) => String(b.startDate).localeCompare(String(a.startDate)));
  return active[0];
}

function weeksSinceLastCover(uid, shifts, now = new Date()) {
  const mine = (shifts || [])
    .filter((shift) => shift.uid === uid && parseDateKey(shift.endDate))
    .sort((a, b) => String(b.endDate).localeCompare(String(a.endDate)));

  if (!mine.length) {
    return { weeksSinceLast: null, lastEndDate: null, onCoverNow: false };
  }

  const onNow = mine.find((shift) => shiftCoversInstant(shift, now));
  if (onNow) {
    return { weeksSinceLast: 0, lastEndDate: onNow.endDate, onCoverNow: true };
  }

  const past = mine.find((shift) => {
    const end = parseDateKey(shift.endDate);
    return end && endOfDay(end.date) <= now;
  });

  if (!past) {
    return { weeksSinceLast: null, lastEndDate: null, onCoverNow: false };
  }

  const end = parseDateKey(past.endDate);
  return {
    weeksSinceLast: weeksBetween(endOfDay(end.date), now),
    lastEndDate: past.endDate,
    onCoverNow: false,
  };
}

function serializeShift(doc) {
  const data = doc.data ? doc.data() : doc;
  const id = doc.id || data.id || '';
  return {
    id,
    uid: data.uid || '',
    fullName: data.fullName || '',
    email: data.email || '',
    startDate: data.startDate || '',
    endDate: data.endDate || '',
    startLabel: formatDateLabel(data.startDate),
    endLabel: formatDateLabel(data.endDate),
    assignedBy: data.assignedBy || '',
    assignedByName: data.assignedByName || '',
    assignedAt: data.assignedAt || null,
    notes: data.notes || '',
  };
}

function canManageEmergencyPhone(profile, canManagePortalAccess, canViewAllEmployeeProfiles, getEffectivePortalRole) {
  return canManagePortalAccess(profile)
    || canViewAllEmployeeProfiles(profile, getEffectivePortalRole);
}

module.exports = {
  COLLECTION,
  EMERGENCY_PHONE_NUMBER,
  EMERGENCY_PHONE_TEL,
  parseDateKey,
  toDateKey,
  formatDateLabel,
  shiftCoversInstant,
  findCurrentShift,
  weeksSinceLastCover,
  serializeShift,
  canManageEmergencyPhone,
};
