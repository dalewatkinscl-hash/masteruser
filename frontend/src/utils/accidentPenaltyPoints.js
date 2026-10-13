/**
 * Accident triage penalty trigger catalog.
 * Points = highest band among selected triggers.
 */

export const ACCIDENT_PENALTY_TRIGGERS = [
  { id: 'cl_damage_under_400', label: 'Damage to our vehicle under £400', points: 1 },
  { id: 'cl_damage_over_400', label: 'Damage to our vehicle over £400', points: 2 },
  { id: 'potential_injury', label: 'Potential to cause injury', points: 2 },
  { id: 'poor_observation', label: 'Poor observation was major factor', points: 2 },
  { id: 'third_party_damage', label: 'Damage to 3rd party vehicle or property', points: 2 },
  { id: 'excessive_speed', label: 'Excessive speed — significantly exceeding the limit or too fast for conditions', points: 3 },
  { id: 'aggressive_manoeuvring', label: 'Aggressive manoeuvring — weaving, tailgating, or similar', points: 3 },
  { id: 'impairment', label: 'Impairment — alcohol or drugs', points: 3 },
  { id: 'ignoring_traffic_laws', label: 'Ignoring traffic laws — signals, signs, or basic road safety rules', points: 3 },
  { id: 'serious_injury_or_death', label: 'Causing serious injury or death', points: 3 },
  { id: 'significant_vehicle_damage', label: 'Significant damage to vehicle', points: 3 },
];

const TRIGGER_BY_ID = Object.fromEntries(ACCIDENT_PENALTY_TRIGGERS.map((item) => [item.id, item]));

export function sanitizeAccidentPenaltyTriggers(raw) {
  const list = Array.isArray(raw) ? raw : [];
  const seen = new Set();
  const triggers = [];
  for (const item of list) {
    const id = String(item || '').trim();
    if (!id || seen.has(id) || !TRIGGER_BY_ID[id]) continue;
    seen.add(id);
    triggers.push(id);
  }
  return triggers;
}

export function computeAccidentPenaltyPoints(triggerIds) {
  let max = 0;
  for (const id of sanitizeAccidentPenaltyTriggers(triggerIds)) {
    const band = TRIGGER_BY_ID[id]?.points || 0;
    if (band > max) max = band;
  }
  return max;
}

export function accidentPenaltyTriggerLabels(triggerIds) {
  return sanitizeAccidentPenaltyTriggers(triggerIds)
    .map((id) => TRIGGER_BY_ID[id]?.label || id);
}

export function groupAccidentPenaltyTriggers() {
  return [1, 2, 3].map((points) => ({
    points,
    triggers: ACCIDENT_PENALTY_TRIGGERS.filter((item) => item.points === points),
  }));
}

/** Rolling window for active accident penalty points. */
export const ACCIDENT_POINTS_EXPIRY_MONTHS = 12;

function parseIsoDateOnly(value) {
  const text = String(value || '').trim();
  const iso = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const parsed = Date.parse(text);
  if (Number.isNaN(parsed)) return '';
  return new Date(parsed).toISOString().slice(0, 10);
}

/** Date used for the 12-month points clock (accident / event day). */
export function getAccidentPointsDate(caseItem = {}) {
  return parseIsoDateOnly(
    caseItem.eventDate
    || caseItem.convertedFromAccidentAt
    || caseItem.closedAt
    || caseItem.openedAt
    || caseItem.createdAt,
  );
}

export function addMonthsIsoDate(isoDate, months) {
  const key = parseIsoDateOnly(isoDate);
  if (!key) return '';
  const [y, m, d] = key.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  date.setUTCMonth(date.getUTCMonth() + months);
  return date.toISOString().slice(0, 10);
}

export function getAccidentPointsExpiryDate(caseItem = {}) {
  const start = getAccidentPointsDate(caseItem);
  if (!start) return '';
  return addMonthsIsoDate(start, ACCIDENT_POINTS_EXPIRY_MONTHS);
}

/** Raw points recorded on the case (driver-at-fault bands only count). */
export function getRecordedAccidentPoints(caseItem = {}) {
  const fault = String(caseItem.accidentFault || '').toLowerCase();
  if (fault === 'third_party' || fault === 'pending') return 0;
  const points = Number(caseItem.accidentPenaltyPoints) || 0;
  return points > 0 ? points : 0;
}

export function isAccidentPointsActive(caseItem = {}, asOf = new Date()) {
  const points = getRecordedAccidentPoints(caseItem);
  if (points < 1) return false;
  const expiry = getAccidentPointsExpiryDate(caseItem);
  if (!expiry) return false;
  const asOfKey = asOf instanceof Date
    ? asOf.toISOString().slice(0, 10)
    : parseIsoDateOnly(asOf) || new Date().toISOString().slice(0, 10);
  return expiry > asOfKey;
}

export function activeAccidentPoints(caseItem = {}, asOf = new Date()) {
  return isAccidentPointsActive(caseItem, asOf) ? getRecordedAccidentPoints(caseItem) : 0;
}

/** Simple label for the driver's rolling points total. */
export function accidentPointsLevelLabel(totalPoints) {
  const n = Number(totalPoints) || 0;
  if (n <= 0) return 'Clear';
  if (n === 1) return 'Level 1';
  if (n === 2) return 'Level 2';
  if (n === 3) return 'Level 3';
  return `Level ${n}`;
}

/**
 * Group accident cases by driver with rolling 12-month active points.
 * @returns {Array<{ employeeUid: string, employeeName: string, department: string, activePoints: number, levelLabel: string, accidentCount: number, accidents: object[] }>}
 */
export function groupAccidentsByDriver(cases = [], asOf = new Date()) {
  const byUid = new Map();

  for (const item of cases) {
    const uid = String(item.employeeUid || '').trim() || `unknown:${item.employeeNameSnapshot || 'driver'}`;
    if (!byUid.has(uid)) {
      byUid.set(uid, {
        employeeUid: String(item.employeeUid || '').trim(),
        employeeName: item.employeeNameSnapshot || 'Unknown driver',
        department: item.departmentSnapshot || '',
        accidents: [],
      });
    }
    byUid.get(uid).accidents.push(item);
  }

  const rows = [];
  for (const group of byUid.values()) {
    group.accidents.sort((a, b) => {
      const da = getAccidentPointsDate(a) || '';
      const db = getAccidentPointsDate(b) || '';
      if (da !== db) return db.localeCompare(da);
      return String(b.createdAt || '').localeCompare(String(a.createdAt || ''));
    });
    const activePoints = group.accidents.reduce(
      (sum, item) => sum + activeAccidentPoints(item, asOf),
      0,
    );
    rows.push({
      ...group,
      activePoints,
      levelLabel: accidentPointsLevelLabel(activePoints),
      accidentCount: group.accidents.length,
    });
  }

  rows.sort((a, b) => {
    if (a.activePoints !== b.activePoints) return b.activePoints - a.activePoints;
    return String(a.employeeName || '').localeCompare(String(b.employeeName || ''), 'en', { sensitivity: 'base' });
  });
  return rows;
}
