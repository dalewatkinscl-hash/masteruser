const SPECIAL_BIRTHDAY_AGES = [18, 21, 30, 40, 50, 60, 65, 70, 75, 80, 85, 90, 95, 100];
const WORK_ANNIVERSARY_YEARS = [10, 15, 20, 25, 30, 35, 40, 45, 50];
const UPCOMING_HIGHLIGHT_DAYS = 30;

function parseIsoDate(value) {
  if (!value) return null;
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function startOfToday() {
  const today = new Date();
  return new Date(today.getFullYear(), today.getMonth(), today.getDate());
}

function daysBetween(fromDate, toDate) {
  return Math.round((toDate - fromDate) / 86400000);
}

function nextAnnualOccurrence(month, day, fromDate = startOfToday()) {
  let next = new Date(fromDate.getFullYear(), month, day);
  if (next < fromDate) {
    next = new Date(fromDate.getFullYear() + 1, month, day);
  }
  return next;
}

function buildMilestoneEntry(employee, date, extra = {}) {
  const today = startOfToday();
  const daysUntil = daysBetween(today, date);

  return {
    employee,
    date,
    daysUntil,
    isUpcoming: daysUntil <= UPCOMING_HIGHLIGHT_DAYS,
    ...extra,
  };
}

function getNextSpecialBirthday(employee) {
  const dob = parseIsoDate(employee?.employeeProfile?.dateOfBirth);
  if (!dob) return null;

  const today = startOfToday();
  const birthYear = dob.getFullYear();
  const birthMonth = dob.getMonth();
  const birthDay = dob.getDate();

  let nearest = null;

  for (const milestoneAge of SPECIAL_BIRTHDAY_AGES) {
    const milestoneDate = new Date(birthYear + milestoneAge, birthMonth, birthDay);
    if (milestoneDate < today) continue;

    if (!nearest || milestoneDate < nearest.date) {
      nearest = buildMilestoneEntry(employee, milestoneDate, { milestoneAge });
    }
  }

  return nearest;
}

function getNextWorkAnniversary(employee) {
  const startDate = parseIsoDate(employee?.employeeProfile?.startDate);
  if (!startDate) return null;

  const today = startOfToday();
  const startYear = startDate.getFullYear();
  const startMonth = startDate.getMonth();
  const startDay = startDate.getDate();

  let nearest = null;

  for (const yearsServed of WORK_ANNIVERSARY_YEARS) {
    const anniversaryDate = new Date(startYear + yearsServed, startMonth, startDay);
    if (anniversaryDate < today) continue;

    if (!nearest || anniversaryDate < nearest.date) {
      nearest = buildMilestoneEntry(employee, anniversaryDate, { yearsServed });
    }
  }

  return nearest;
}

function formatMilestoneDate(date) {
  if (!date) return '—';
  return date.toLocaleDateString('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

function formatIsoDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function formatDaysUntilLabel(daysUntil) {
  if (daysUntil === 0) return 'today';
  if (daysUntil === 1) return 'tomorrow';
  return `in ${daysUntil} days`;
}

module.exports = {
  SPECIAL_BIRTHDAY_AGES,
  UPCOMING_HIGHLIGHT_DAYS,
  WORK_ANNIVERSARY_YEARS,
  formatDaysUntilLabel,
  formatIsoDate,
  formatMilestoneDate,
  getNextSpecialBirthday,
  getNextWorkAnniversary,
};
