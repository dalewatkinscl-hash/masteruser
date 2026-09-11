/**
 * Build add-to-calendar links in the browser (Outlook / Google / .ics).
 * Prefer Outlook web compose — New Outlook often ignores downloaded .ics files.
 */

function pad(value) {
  return String(value).padStart(2, '0');
}

function parseEventWindow({ startDate, startTime, durationMinutes = 60 } = {}) {
  const date = String(startDate || '').slice(0, 10);
  const time = startTime ? String(startTime).slice(0, 5) : '';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  if (!time) {
    const end = new Date(`${date}T00:00:00`);
    end.setDate(end.getDate() + 1);
    return {
      allDay: true,
      startDate: date,
      endDate: [
        end.getFullYear(),
        pad(end.getMonth() + 1),
        pad(end.getDate()),
      ].join('-'),
    };
  }
  const [year, month, day] = date.split('-').map(Number);
  const [hour, minute] = time.split(':').map(Number);
  const startLocal = new Date(year, month - 1, day, hour, minute, 0, 0);
  const endLocal = new Date(startLocal.getTime() + (Number(durationMinutes) || 60) * 60 * 1000);
  return { allDay: false, startLocal, endLocal };
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

function buildOutlookUrl(host, options, window) {
  const params = new URLSearchParams({
    path: '/calendar/action/compose',
    rru: 'addevent',
    subject: options.summary || 'People Cases reminder',
    body: options.description || '',
    location: options.location || '',
  });
  if (!window) {
    return `https://${host}/calendar/0/deeplink/compose?${params.toString()}`;
  }
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

function buildGoogleUrl(options, window) {
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: options.summary || 'People Cases reminder',
    details: options.description || '',
    location: options.location || '',
  });
  if (!window) return `https://calendar.google.com/calendar/render?${params.toString()}`;
  if (window.allDay) {
    params.set(
      'dates',
      `${window.startDate.replace(/-/g, '')}/${window.endDate.replace(/-/g, '')}`,
    );
  } else {
    params.set(
      'dates',
      `${formatGoogleStamp(window.startLocal)}/${formatGoogleStamp(window.endLocal)}`,
    );
  }
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

function escapeIcsText(value) {
  return String(value || '')
    .replace(/\\/g, '\\\\')
    .replace(/\n/g, '\\n')
    .replace(/,/g, '\\,')
    .replace(/;/g, '\\;');
}

function buildIcsText(options = {}, window = null) {
  const uid = options.uid || `${Date.now()}@countrylion.co.uk`;
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  let dtStart;
  let dtEnd;
  if (!window || window.allDay) {
    const start = String(options.startDate || '').replace(/-/g, '').slice(0, 8);
    const end = window?.endDate
      ? String(window.endDate).replace(/-/g, '').slice(0, 8)
      : start;
    dtStart = `DTSTART;VALUE=DATE:${start}`;
    dtEnd = `DTEND;VALUE=DATE:${end}`;
  } else {
    const startStamp = formatLocalDateTime(window.startLocal).replace(/[-:]/g, '');
    const endStamp = formatLocalDateTime(window.endLocal).replace(/[-:]/g, '');
    dtStart = `DTSTART:${startStamp}`;
    dtEnd = `DTEND:${endStamp}`;
  }
  return [
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
    `SUMMARY:${escapeIcsText(options.summary || 'People Cases reminder')}`,
    options.description ? `DESCRIPTION:${escapeIcsText(options.description)}` : '',
    options.location ? `LOCATION:${escapeIcsText(options.location)}` : '',
    'END:VEVENT',
    'END:VCALENDAR',
  ].filter(Boolean).join('\r\n') + '\r\n';
}

export function buildCalendarOffer(options = {}) {
  const window = parseEventWindow(options);
  const icsText = buildIcsText(options, window);
  return {
    fileName: options.fileName || 'people-case-event.ics',
    mimeType: 'text/calendar',
    contentBase64: btoa(unescape(encodeURIComponent(icsText))),
    summary: options.summary || 'People Cases reminder',
    startDate: options.startDate || '',
    startTime: options.startTime || '',
    outlookUrl: buildOutlookUrl('outlook.office.com', options, window),
    outlookPersonalUrl: buildOutlookUrl('outlook.live.com', options, window),
    googleUrl: buildGoogleUrl(options, window),
  };
}

export function buildHearingCalendarOffer({
  caseId,
  employeeName,
  caseTitle,
  hearingScheduledAt,
  hearingScheduledTime,
  hearingLocation,
  notes,
}) {
  if (!hearingScheduledAt) return null;
  return buildCalendarOffer({
    uid: `hearing-${caseId || 'case'}-${hearingScheduledAt}@countrylion.co.uk`,
    fileName: `hearing-${caseId || 'case'}-${hearingScheduledAt}.ics`,
    summary: `Disciplinary hearing — ${employeeName || caseTitle || caseId || 'case'}`,
    description: [
      caseTitle ? `Case: ${caseTitle}` : '',
      notes ? `Notes: ${notes}` : '',
      'Hearing scheduled via Employee Portal.',
    ].filter(Boolean).join('\n'),
    location: hearingLocation || 'Country Lion',
    startDate: hearingScheduledAt,
    startTime: hearingScheduledTime || '10:00',
    durationMinutes: 60,
  });
}

export function buildReviewCalendarOffer({
  caseId,
  reviewId,
  title,
  employeeName,
  caseTitle,
  dueAt,
  notes,
}) {
  if (!dueAt) return null;
  return buildCalendarOffer({
    uid: `review-${caseId || 'case'}-${reviewId || dueAt}@countrylion.co.uk`,
    fileName: `review-${caseId || 'case'}-${dueAt}.ics`,
    summary: `${title || 'Review meeting'} — ${employeeName || caseTitle || caseId || 'case'}`,
    description: [
      caseTitle ? `Case: ${caseTitle}` : '',
      notes ? `Notes: ${notes}` : '',
      'Review meeting scheduled via Employee Portal.',
    ].filter(Boolean).join('\n'),
    startDate: dueAt,
  });
}

export function downloadIcsFromOffer(event, index = 0) {
  if (!event?.contentBase64) return;
  try {
    const binary = atob(event.contentBase64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
    const blob = new Blob([bytes], { type: event.mimeType || 'text/calendar' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = event.fileName || `people-case-event-${index + 1}.ics`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  } catch {
    // Ignore download failures.
  }
}
