/** People Cases hub access requires an explicit cases_app role (or master admin). Headcount/HR does not grant it. */
export function getCasesRole(user) {
  if (user?.portalsAccess?.master_admin === 'admin') return 'admin';
  const role = user?.portalsAccess?.cases_app;
  if (role === 'manager' || role === 'admin' || role === 'hr') return role;
  return '';
}

export function canManagePeopleCases(user) {
  const role = getCasesRole(user);
  return role === 'manager' || role === 'admin' || role === 'hr';
}

/** Roles a manager already held on this case (for appeal-recipient conflict warnings). */
export function describePriorCaseInvolvement(caseData, uid) {
  if (!caseData || !uid) return [];
  const roles = [];
  if (caseData.createdByUid === uid) roles.push('opened the case');
  if (
    caseData.ownerManagerUid === uid
    || caseData.managerUid === uid
  ) {
    roles.push('case owner / assigned manager');
  }
  if (caseData.investigatorUid === uid) roles.push('investigator');
  if (caseData.hearingManagerUid === uid) roles.push('hearing manager');
  if (caseData.decisionMakerUid === uid) roles.push('decision-maker (outcome)');
  if (caseData.fileNoteIssuedByUid === uid) roles.push('issued the file note');
  return [...new Set(roles)];
}

export const ACTIVE_DISCIPLINARY_MEASURE_PRESETS = [
  'informal_action',
  'file_note_for_improvement',
  'verbal_warning',
  'written_warning',
  'final_written_warning',
  'pip',
];

export const RESTRICTION_OPTIONS = [
  { id: 'no_tour_work', label: 'No Tour Work' },
  { id: 'no_vip_sports', label: 'No VIP/Sports' },
  { id: 'no_large_vehicles', label: 'No Large Vehicles' },
  { id: 'other', label: 'Other' },
];

export function restrictionLabel(type, otherDetail = '') {
  const match = RESTRICTION_OPTIONS.find((item) => item.id === type);
  if (!match) return type || '';
  if (type === 'other') {
    const detail = String(otherDetail || '').trim();
    return detail ? `Other — ${detail}` : 'Other';
  }
  return match.label;
}

export const PROCESS_FAMILIES = [
  { id: 'disciplinary', label: 'Disciplinary' },
  { id: 'grievance', label: 'Grievance' },
  { id: 'vehicle_accident', label: 'Vehicle accident' },
];

export const DISCIPLINARY_STAGES = [
  'fact_finding',
  'hearing_invite',
  'hearing',
  'outcome_pack',
  'closed',
  'appeal',
];

export const GRIEVANCE_STAGES = [
  'acknowledged',
  'investigation',
  'meeting',
  'outcome_pack',
  'closed',
  'appeal',
];

export const ACCIDENT_STAGES = [
  'triage',
  'investigation',
  'training_decision',
  'closed',
];

export function stagesForFamily(processFamily) {
  if (processFamily === 'grievance') return GRIEVANCE_STAGES;
  if (processFamily === 'vehicle_accident') return ACCIDENT_STAGES;
  return DISCIPLINARY_STAGES;
}

/** Informal / file-note closures skip hearing + outcome stages — don't show them as completed. */
export function isEarlyInformalStyleClose(caseItem = {}) {
  const preset = caseItem.outcomePreset || '';
  if (preset === 'informal_action' || preset === 'file_note_for_improvement') return true;
  const closed = caseItem.stage === 'closed' || caseItem.status === 'closed';
  if (!closed) return false;
  const wentFormal = Boolean(
    caseItem.hearingInviteIssuedAt
    || caseItem.hearingScheduledAt
    || (preset && !['informal_action', 'file_note_for_improvement', 'no_further_action'].includes(preset)),
  );
  return !wentFormal;
}

/** Stages to show on the progress rail for this case's actual path. */
export function stagesForCaseDisplay(processFamily, caseItem = {}) {
  const all = stagesForFamily(processFamily);
  if (!isEarlyInformalStyleClose(caseItem)) return all;
  const first = all[0] || 'fact_finding';
  const stages = [first, 'closed'];
  if (caseItem.stage === 'appeal' || caseItem.appealedAt) stages.push('appeal');
  return stages;
}

/** Map legacy stage names onto the current wizard (matches backend). */
export function normalizeStage(processFamily, stage) {
  const raw = String(stage || '').trim().toLowerCase();
  if (processFamily === 'grievance') {
    if (raw === 'intake') return 'acknowledged';
    if (raw === 'minutes_signoff') return 'meeting';
    return GRIEVANCE_STAGES.includes(raw) ? raw : 'acknowledged';
  }
  if (processFamily === 'vehicle_accident') {
    if (raw === 'reported') return 'triage';
    if (raw === 'minutes_signoff') return 'investigation';
    return ACCIDENT_STAGES.includes(raw) ? raw : 'triage';
  }
  if (raw === 'intake' || raw === 'investigation' || raw === 'minutes_signoff') return 'fact_finding';
  return DISCIPLINARY_STAGES.includes(raw) ? raw : 'fact_finding';
}

export function stageLabel(stage) {
  return String(stage || '')
    .split('_')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

/** Stages where interviews / uploads are not part of the workflow (admin steps only). */
export function stageAllowsDocumentation(processFamily, stage) {
  const normalized = normalizeStage(processFamily, stage);
  if (processFamily === 'grievance') return normalized !== 'acknowledged';
  if (processFamily === 'vehicle_accident') return normalized !== 'triage';
  return true;
}

export function documentationEmptyMessage(processFamily, stage, listFilter = 'stage') {
  if (listFilter === 'all') {
    return 'No documentation or interviews on this case yet.';
  }
  const normalized = normalizeStage(processFamily, stage);
  if (!stageAllowsDocumentation(processFamily, normalized)) {
    if (processFamily === 'grievance' && normalized === 'acknowledged') {
      return 'This stage is for acknowledging the grievance only. Documentation and interviews are added from investigation onwards — see the progress panel above for acknowledgement details.';
    }
    if (processFamily === 'vehicle_accident' && normalized === 'triage') {
      return 'This stage is for triage only. Documentation and interviews are added from investigation onwards.';
    }
    return 'Nothing is recorded at this stage.';
  }
  return 'No documentation or interviews recorded for this stage yet.';
}

function formatProgressDateUk(value) {
  const text = String(value || '').slice(0, 10);
  const match = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return text || '—';
  return `${match[3]}/${match[2]}/${match[1]}`;
}

/** Compact hearing date for progress labels (e.g. 8 Sep 2026 at 10:00). */
export function formatHearingScheduleLabel(caseItem = {}) {
  const isoDate = String(caseItem.hearingScheduledAt || '').slice(0, 10);
  const time = String(caseItem.hearingScheduledTime || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) {
    return isoDate || time || '';
  }
  const date = new Date(`${isoDate}T00:00:00`);
  if (Number.isNaN(date.getTime())) return isoDate;
  const datePart = date.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
  return time ? `${datePart} at ${time}` : datePart;
}

export function isHearingScheduleOverdue(caseItem = {}, now = new Date()) {
  const isoDate = String(caseItem.hearingScheduledAt || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) return false;
  const hearingAt = parseHearingDateTime(caseItem.hearingScheduledAt, caseItem.hearingScheduledTime);
  if (!hearingAt) return false;
  return hearingAt.getTime() < now.getTime();
}

function hearingScheduledProgress(prefix, caseItem, stage) {
  const when = formatHearingScheduleLabel(caseItem);
  if (isHearingScheduleOverdue(caseItem)) {
    return {
      label: when
        ? `${prefix} — hearing overdue (scheduled for ${when})`
        : `${prefix} — hearing overdue`,
      hint: 'The hearing date has passed — hold the hearing and record the outcome',
      tone: 'rose',
      stage,
    };
  }
  return {
    label: when
      ? `${prefix} — hearing scheduled for ${when}`
      : `${prefix} — hearing scheduled`,
    hint: 'Invite issued — hold the hearing on the scheduled date',
    tone: 'emerald',
    stage,
  };
}

/**
 * Human-readable case progress for lists / headers.
 * Emphasises what is still outstanding (invite, outcome, documents, etc.).
 */
export function getCaseProgressStatus(caseItem = {}) {
  const family = caseItem.processFamily || 'disciplinary';
  const stage = normalizeStage(family, caseItem.stage);
  const isClosed = stage === 'closed' || caseItem.status === 'closed';
  const prefix = isClosed ? 'Closed' : 'Case open';
  const tone = isClosed ? 'slate' : 'indigo';

  if (!isClosed && caseItem.status === 'pending_employee') {
    // Fact-finding interview notes are non-blocking (employee may amend/sign asynchronously).
    // Keep "awaiting employee response" for true waits — but not once a hearing is scheduled.
    const hearingScheduled = Boolean(caseItem.hearingScheduledAt) && (
      stage === 'hearing_invite' || stage === 'hearing'
    );
    if (stage !== 'fact_finding' && !hearingScheduled) {
      return {
        label: `${prefix} — awaiting employee response`,
        hint: 'Invite or document awaiting the employee in the portal',
        tone: 'amber',
        stage,
      };
    }
  }

  if (family === 'grievance') {
    if (stage === 'acknowledged') {
      return { label: `${prefix} — awaiting acknowledgement / investigation`, hint: 'Confirm and start investigation', tone, stage };
    }
    if (stage === 'investigation') {
      return { label: `${prefix} — awaiting investigation`, hint: 'Investigate and issue minutes', tone, stage };
    }
    if (stage === 'meeting') {
      return { label: `${prefix} — awaiting grievance meeting`, hint: 'Hold meeting and issue minutes', tone, stage };
    }
    if (stage === 'outcome_pack') {
      return {
        label: `${prefix} — awaiting outcome`,
        hint: 'Choose an outcome and complete the outcome letter form',
        tone: 'amber',
        stage,
      };
    }
    if (stage === 'appeal') {
      return { label: `${prefix} — on appeal — awaiting outcome`, hint: 'Complete appeal and close', tone: 'amber', stage };
    }
    if (stage === 'closed') {
      if (caseItem.nextReviewDueAt) {
        const reviewDate = formatProgressDateUk(caseItem.nextReviewDueAt);
        return {
          label: `${prefix} — closed — review scheduled for ${reviewDate}`,
          hint: 'Case closed with follow-up review',
          tone: 'slate',
          stage,
        };
      }
      const outcome = caseItem.outcomePreset ? stageLabel(caseItem.outcomePreset) : 'recorded';
      return { label: `${prefix} — ${outcome}`, hint: 'Case closed', tone: 'slate', stage };
    }
  }

  if (family === 'vehicle_accident') {
    if (stage === 'triage') {
      return { label: `${prefix} — awaiting triage`, hint: 'Confirm incident details', tone, stage };
    }
    if (stage === 'investigation') {
      return { label: `${prefix} — awaiting investigation`, hint: 'Interview and evidence', tone, stage };
    }
    if (stage === 'training_decision') {
      return { label: `${prefix} — awaiting training decision`, hint: 'Training / disciplinary / NFA', tone: 'amber', stage };
    }
    if (stage === 'closed') {
      const decision = caseItem.trainingDecision || caseItem.outcomePreset || 'recorded';
      return { label: `${prefix} — ${stageLabel(decision)}`, hint: 'Case closed', tone: 'slate', stage };
    }
  }

  // disciplinary (default)
  if (stage === 'fact_finding') {
    if (caseItem.interviewNotesIssuedAt) {
      return {
        label: `${prefix} — awaiting outcome after initial fact-finding`,
        hint: 'Choose informal action, file note, NFA, or move to a formal hearing',
        tone: 'amber',
        stage,
      };
    }
    return {
      label: `${prefix} — awaiting fact-finding`,
      hint: 'Hold interview, issue minutes, then close with notes or schedule a hearing',
      tone,
      stage,
    };
  }
  if (stage === 'hearing_invite') {
    if (!caseItem.hearingInviteIssuedAt && !caseItem.hearingScheduledAt) {
      return {
        label: `${prefix} — awaiting hearing invite`,
        hint: 'Set date and send invite via portal (and print if needed)',
        tone: 'amber',
        stage,
      };
    }
    if (caseItem.hearingScheduledAt) {
      return hearingScheduledProgress(prefix, caseItem, stage);
    }
    return {
      label: `${prefix} — hearing invite sent`,
      hint: 'Invite issued — set or confirm the hearing date',
      tone: 'emerald',
      stage,
    };
  }
  if (stage === 'hearing') {
    if (caseItem.hearingScheduledAt) {
      return hearingScheduledProgress(prefix, caseItem, stage);
    }
    return {
      label: `${prefix} — awaiting hearing`,
      hint: 'Hold hearing and issue minutes',
      tone,
      stage,
    };
  }
  if (stage === 'outcome_pack') {
    return {
      label: `${prefix} — awaiting outcome`,
      hint: 'Choose an outcome and complete the outcome letter form',
      tone: 'amber',
      stage,
    };
  }
  if (stage === 'appeal') {
    return {
      label: `${prefix} — on appeal — awaiting outcome`,
      hint: 'Complete appeal hearing and issue outcome letter',
      tone: 'amber',
      stage,
    };
  }
  if (stage === 'closed') {
    if (caseItem.outcomePreset === 'informal_action') {
      return { label: `${prefix} — informal action`, hint: 'Closed with informal action recorded', tone: 'slate', stage };
    }
    if (caseItem.outcomePreset === 'file_note_for_improvement') {
      if (caseItem.fileNoteEmployeeSignStatus === 'pending' || caseItem.status === 'pending_employee') {
        return {
          label: `${prefix} — file note awaiting employee signature`,
          hint: 'File note issued; employee must digitally sign in the portal',
          tone: 'amber',
          stage,
        };
      }
      return { label: `${prefix} — file note for improvement`, hint: 'File note issued and signed', tone: 'slate', stage };
    }
    if (
      ['written_warning', 'final_written_warning', 'pip'].includes(caseItem.outcomePreset)
      && (caseItem.warningEmployeeSignStatus === 'pending' || caseItem.status === 'pending_employee')
    ) {
      const outcomeLabel = stageLabel(caseItem.outcomePreset);
      return {
        label: `${prefix} — ${outcomeLabel} awaiting employee signature`,
        hint: 'Outcome letter issued; employee must digitally sign in the portal',
        tone: 'amber',
        stage,
      };
    }
    if (caseItem.nextReviewDueAt) {
      const reviewDate = formatProgressDateUk(caseItem.nextReviewDueAt);
      return {
        label: `${prefix} — closed — review scheduled for ${reviewDate}`,
        hint: caseItem.appealWindowEndsAt
          ? `Appeal window to ${formatProgressDateUk(caseItem.appealWindowEndsAt)}`
          : 'Case closed with follow-up review',
        tone: 'slate',
        stage,
      };
    }
    const outcome = caseItem.outcomePreset ? stageLabel(caseItem.outcomePreset) : 'no further action';
    const appealNote = caseItem.appealWindowEndsAt
      ? `Appeal window to ${formatProgressDateUk(caseItem.appealWindowEndsAt)}`
      : 'Case closed';
    return { label: `${prefix} — ${outcome}`, hint: appealNote, tone: 'slate', stage };
  }

  return {
    label: `${prefix} — ${stageLabel(stage)}`,
    hint: '',
    tone,
    stage,
  };
}

export function caseProgressToneClass(tone) {
  if (tone === 'amber') return 'text-amber-200 border-amber-500/30 bg-amber-500/10';
  if (tone === 'rose') return 'text-rose-200 border-rose-500/30 bg-rose-500/10';
  if (tone === 'emerald') return 'text-emerald-200 border-emerald-500/30 bg-emerald-500/10';
  if (tone === 'slate') return 'text-slate-300 border-[#1a2540] bg-[#060e1a]/50';
  return 'text-indigo-100 border-indigo-500/30 bg-indigo-500/10';
}

/** Calendar days from case open to close. Null if still open or dates missing. */
export function caseTimeToResolutionDays(caseItem = {}) {
  const isClosed = caseItem.status === 'closed' || caseItem.stage === 'closed';
  if (!isClosed || !caseItem.closedAt) return null;
  const startRaw = caseItem.openedAt || caseItem.createdAt;
  if (!startRaw) return null;
  const start = new Date(startRaw);
  const end = new Date(caseItem.closedAt);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return null;
  const startDay = Date.UTC(start.getFullYear(), start.getMonth(), start.getDate());
  const endDay = Date.UTC(end.getFullYear(), end.getMonth(), end.getDate());
  return Math.max(0, Math.round((endDay - startDay) / 86400000));
}

export function formatCaseTimeToResolution(caseItem = {}) {
  const days = caseTimeToResolutionDays(caseItem);
  if (days === null) return '—';
  if (days === 0) return 'Same day';
  return days === 1 ? '1 day' : `${days} days`;
}

export const OUTCOME_PRESETS = [
  { id: 'informal_action', label: 'Informal action (recorded)', suggestedExpiryMonths: 6 },
  { id: 'file_note_for_improvement', label: 'File note for improvement', suggestedExpiryMonths: 6 },
  { id: 'no_further_action', label: 'No further action', suggestedExpiryMonths: null },

  { id: 'written_warning', label: 'Written warning', suggestedExpiryMonths: 6 },
  { id: 'final_written_warning', label: 'Final written warning', suggestedExpiryMonths: 12 },
  { id: 'pip', label: 'Performance improvement plan', suggestedExpiryMonths: null },
  { id: 'training_required', label: 'Training required', suggestedExpiryMonths: null },
  { id: 'dismissal', label: 'Dismissal', suggestedExpiryMonths: null },
];

export const INFORMAL_RESOLUTION_OPTIONS = [
  {
    id: 'resolve_informally',
    label: 'Try to resolve informally first',
    help: 'Open the case for fact-finding interviews and notes. Close as informal action later if it resolves the matter.',
  },
  {
    id: 'proceed_formal',
    label: 'Informal steps already tried — continue to formal process',
    help: 'Record what was tried, then investigate and proceed formally if needed.',
  },
  {
    id: 'not_appropriate',
    label: 'Informal resolution not appropriate',
    help: 'Explain why the matter must go straight to the formal process.',
  },
];

export function addMonthsIso(isoDate, months) {
  const date = new Date(`${isoDate}T00:00:00`);
  if (Number.isNaN(date.getTime())) return '';
  date.setMonth(date.getMonth() + months);
  return date.toISOString().slice(0, 10);
}

export function addWorkingDaysIso(from = new Date(), workingDays = 5) {
  const date = new Date(from);
  let added = 0;
  while (added < workingDays) {
    date.setDate(date.getDate() + 1);
    const day = date.getDay();
    if (day !== 0 && day !== 6) added += 1;
  }
  return date.toISOString().slice(0, 10);
}

/** Working days' notice from invite/today to hearing (weekdays after from, up to and including to). */
export function countWorkingDaysNotice(fromIso, toIso) {
  const from = new Date(`${String(fromIso).slice(0, 10)}T00:00:00`);
  const to = new Date(`${String(toIso).slice(0, 10)}T00:00:00`);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || to <= from) return 0;
  let count = 0;
  const cursor = new Date(from);
  while (cursor < to) {
    cursor.setDate(cursor.getDate() + 1);
    const day = cursor.getDay();
    if (day !== 0 && day !== 6) count += 1;
  }
  return count;
}

/** Clock hours on weekdays (Mon–Fri) between two datetimes — for 24 working hours policy. */
export function countWorkingHoursNotice(fromDate, toDate) {
  const from = fromDate instanceof Date ? new Date(fromDate) : new Date(fromDate);
  const to = toDate instanceof Date ? new Date(toDate) : new Date(toDate);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || to <= from) return 0;
  let hours = 0;
  const cursor = new Date(from);
  while (cursor < to) {
    const day = cursor.getDay();
    const nextHour = new Date(cursor.getTime() + 60 * 60 * 1000);
    const sliceEnd = nextHour < to ? nextHour : to;
    if (day !== 0 && day !== 6) {
      hours += (sliceEnd.getTime() - cursor.getTime()) / (60 * 60 * 1000);
    }
    cursor.setTime(nextHour.getTime());
  }
  return hours;
}

export function parseHearingDateTime(isoDate, time) {
  const datePart = String(isoDate || '').slice(0, 10);
  const timePart = String(time || '09:00').trim() || '09:00';
  const parsed = new Date(`${datePart}T${timePart}:00`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/** Country Lion policy: minimum 24 working hours' notice (weekends excluded). */
export const MINIMUM_HEARING_NOTICE_WORKING_HOURS = 24;
/** @deprecated kept for older call sites; prefer MINIMUM_HEARING_NOTICE_WORKING_HOURS */
export const RECOMMENDED_HEARING_NOTICE_WORKING_DAYS = 5;
export const MINIMUM_HEARING_NOTICE_WORKING_DAYS = 1;
