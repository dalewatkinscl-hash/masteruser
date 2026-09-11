/**
 * Minimal iCalendar (.ics) helpers + web calendar deeplinks for People Cases.
 * New Outlook often does not open downloaded .ics files as a default action,
 * so Outlook/Google compose links are preferred for managers.
 */

function pad(value) {
  return String(value).padStart(2, '0');
}

function formatIcsUtc(date) {
  return [
    date.getUTCFullYear(),
    pad(date.getUTCMonth() + 1),
    pad(date.getUTCDate()),
    'T',
    pad(date.getUTCHours()),
    pad(date.getUTCMinutes()),
    pad(date.getUTCSeconds()),
    'Z',
  ].join('');
}

function formatIcsDateOnly(isoDate) {
  return String(isoDate || '').replace(/-/g, '').slice(0, 8);
}

function escapeIcsText(value) {
  return String(value || '')
    .replace(/\\/g, '\\\\')
    .replace(/\n/g, '\\n')
    .replace(/,/g, '\\,')
    .replace(/;/g, '\\;');
}

function foldIcsLine(line) {
  const text = String(line || '');
  if (text.length <= 75) return text;
  const parts = [];
  let remaining = text;
  parts.push(remaining.slice(0, 75));
  remaining = remaining.slice(75);
  while (remaining.length) {
    parts.push(` ${remaining.slice(0, 74)}`);
    remaining = remaining.slice(74);
  }
  return parts.join('\r\n');
}

function parseEventWindow(options = {}) {
  const startDate = String(options.startDate || '').slice(0, 10);
  const startTime = options.startTime ? String(options.startTime).slice(0, 5) : '';
  const durationMinutes = Number(options.durationMinutes) || 60;
  const allDay = !startTime;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate)) {
    return null;
  }
  if (allDay) {
    const end = new Date(`${startDate}T00:00:00Z`);
    end.setUTCDate(end.getUTCDate() + 1);
    return {
      allDay: true,
      startDate,
      endDate: end.toISOString().slice(0, 10),
      startLocal: null,
      endLocal: null,
    };
  }
  const [year, month, day] = startDate.split('-').map(Number);
  const [hour, minute] = startTime.split(':').map(Number);
  const startLocal = new Date(year, month - 1, day, hour, minute, 0, 0);
  const endLocal = new Date(startLocal.getTime() + durationMinutes * 60 * 1000);
  return {
    allDay: false,
    startDate,
    endDate: null,
    startLocal,
    endLocal,
  };
}

function formatLocalDateTime(date) {
  return [
    date.getFullYear(),
    '-',
    pad(date.getMonth() + 1),
    '-',
    pad(date.getDate()),
    'T',
    pad(date.getHours()),
    ':',
    pad(date.getMinutes()),
    ':',
    pad(date.getSeconds()),
  ].join('');
}

function formatGoogleStamp(date) {
  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate()),
    'T',
    pad(date.getHours()),
    pad(date.getMinutes()),
    pad(date.getSeconds()),
  ].join('');
}

function buildOutlookComposeUrl(host, options = {}, window = null) {
  const params = new URLSearchParams({
    path: '/calendar/action/compose',
    rru: 'addevent',
    subject: options.summary || 'People Cases reminder',
    body: options.description || '',
    location: options.location || '',
  });
  if (!window) return `https://${host}/calendar/0/deeplink/compose?${params.toString()}`;
  if (window.allDay) {
    params.set('startdt', window.startDate);
    params.set('enddt', window.endDate);
    params.set('allday', 'true');
  } else {
    params.set('startdt', formatLocalDateTime(window.startLocal));
    params.set('enddt', formatLocalDateTime(window.endLocal));
  }
  return `https://${host}/calendar/0/deeplink/compose?${params.toString()}`;
}

function buildGoogleCalendarUrl(options = {}, window = null) {
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: options.summary || 'People Cases reminder',
    details: options.description || '',
    location: options.location || '',
  });
  if (!window) return `https://calendar.google.com/calendar/render?${params.toString()}`;
  if (window.allDay) {
    params.set('dates', `${formatIcsDateOnly(window.startDate)}/${formatIcsDateOnly(window.endDate)}`);
  } else {
    params.set(
      'dates',
      `${formatGoogleStamp(window.startLocal)}/${formatGoogleStamp(window.endLocal)}`,
    );
  }
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

/**
 * @param {{
 *  uid: string,
 *  summary: string,
 *  description?: string,
 *  location?: string,
 *  startDate: string, // YYYY-MM-DD
 *  startTime?: string, // HH:MM — omit for all-day
 *  durationMinutes?: number,
 * }} options
 */
function buildIcsEvent(options = {}) {
  const uid = String(options.uid || `${Date.now()}@countrylion.co.uk`);
  const summary = escapeIcsText(options.summary || 'People Cases reminder');
  const description = escapeIcsText(options.description || '');
  const location = escapeIcsText(options.location || '');
  const stamp = formatIcsUtc(new Date());
  const window = parseEventWindow(options);
  let dtStart;
  let dtEnd;
  if (!window || window.allDay) {
    const start = formatIcsDateOnly(options.startDate);
    const endDate = new Date(`${String(options.startDate).slice(0, 10)}T00:00:00Z`);
    endDate.setUTCDate(endDate.getUTCDate() + 1);
    dtStart = `DTSTART;VALUE=DATE:${start}`;
    dtEnd = `DTEND;VALUE=DATE:${formatIcsUtc(endDate).slice(0, 8)}`;
  } else {
    // Floating local time (UK wall clock as entered) — avoids UTC shift on import.
    const startStamp = formatLocalDateTime(window.startLocal).replace(/[-:]/g, '');
    const endStamp = formatLocalDateTime(window.endLocal).replace(/[-:]/g, '');
    dtStart = `DTSTART:${startStamp}`;
    dtEnd = `DTEND:${endStamp}`;
  }

  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Country Lion//People Cases//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `DTSTAMP:${stamp}`,
    dtStart,
    dtEnd,
    `SUMMARY:${summary}`,
  ];
  if (description) lines.push(`DESCRIPTION:${description}`);
  if (location) lines.push(`LOCATION:${location}`);
  lines.push('END:VEVENT', 'END:VCALENDAR');
  return `${lines.map(foldIcsLine).join('\r\n')}\r\n`;
}

function buildWebCalendarLinks(options = {}) {
  const window = parseEventWindow(options);
  return {
    outlookUrl: buildOutlookComposeUrl('outlook.office.com', options, window),
    outlookPersonalUrl: buildOutlookComposeUrl('outlook.live.com', options, window),
    googleUrl: buildGoogleCalendarUrl(options, window),
  };
}

function icsAsDownloadPayload(fileName, icsText) {
  return {
    fileName: fileName || 'people-case-event.ics',
    mimeType: 'text/calendar',
    contentBase64: Buffer.from(String(icsText || ''), 'utf8').toString('base64'),
  };
}

function calendarEventFromOptions(fileName, options = {}) {
  const links = buildWebCalendarLinks(options);
  return {
    ...icsAsDownloadPayload(fileName, buildIcsEvent(options)),
    summary: options.summary || 'People Cases reminder',
    startDate: options.startDate || '',
    startTime: options.startTime || '',
    ...links,
  };
}

module.exports = {
  buildIcsEvent,
  buildWebCalendarLinks,
  icsAsDownloadPayload,
  calendarEventFromOptions,
};
