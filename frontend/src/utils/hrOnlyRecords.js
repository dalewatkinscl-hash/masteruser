/** Only Dale Watkins and Michelle Cox may mark / view HR-only personnel records. */

const HR_ONLY_RECORD_EMAILS = new Set([
  'dalewatkins@countrylion.co.uk',
  'michellecox@countrylion.co.uk',
  'michelle.cox@countrylion.co.uk',
]);

const HR_ONLY_RECORD_NAMES = new Set([
  'dale watkins',
  'michelle cox',
]);

function normalizeHrOnlyPersonKey(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9@._+\-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function canManageHrOnlyRecords(user) {
  const email = normalizeHrOnlyPersonKey(user?.email);
  const workEmail = normalizeHrOnlyPersonKey(user?.workEmail || user?.companyEmail);
  const name = normalizeHrOnlyPersonKey(user?.fullName);
  if (email && HR_ONLY_RECORD_EMAILS.has(email)) return true;
  if (workEmail && HR_ONLY_RECORD_EMAILS.has(workEmail)) return true;
  if (name && HR_ONLY_RECORD_NAMES.has(name)) return true;
  return false;
}

export function isHrOnlyRecord(caseItem = {}) {
  return Boolean(caseItem?.hrOnly) && (caseItem?.processFamily || '') === 'record';
}
