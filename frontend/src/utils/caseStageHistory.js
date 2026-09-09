import { stageLabel, INFORMAL_RESOLUTION_OPTIONS } from './peopleCasesAccess';

export function nameForUid(uid, employees = []) {
  if (!uid) return 'Unknown';
  const person = employees.find((item) => item.uid === uid);
  return person?.fullName || person?.email || uid;
}

function formatWhen(value) {
  if (!value) return '';
  const text = String(value);
  if (/^\d{4}-\d{2}-\d{2}$/.test(text.slice(0, 10))) {
    const [y, m, d] = text.slice(0, 10).split('-');
    return `${d}/${m}/${y}${text.length > 10 ? ` ${text.slice(11, 16)}` : ''}`;
  }
  return text.slice(0, 16).replace('T', ' ');
}

function informalPathLabel(pathId) {
  return INFORMAL_RESOLUTION_OPTIONS.find((item) => item.id === pathId)?.label || pathId;
}

function pushEntry(map, stage, entry) {
  if (!stage || !map[stage]) return;
  map[stage].entries.push(entry);
}

/** Build per-stage timeline entries from case data and audit events. */
export function buildStageHistory({
  stages = [],
  caseData = {},
  events = [],
  minutes = [],
  documents = [],
  employees = [],
}) {
  const data = caseData || {};
  const map = Object.fromEntries(stages.map((stage) => [stage, {
    stage,
    label: stageLabel(stage),
    entries: [],
  }]));

  const firstStage = stages[0] || 'fact_finding';

  for (const event of events) {
    const who = nameForUid(event.actorUid, employees);
    const at = event.createdAt;
    const payload = event.payload || {};

    switch (event.eventType) {
      case 'case_created':
        pushEntry(map, firstStage, {
          at,
          who: payload.createdByName || who,
          text: `Case opened by ${payload.createdByName || who}${data.informalResolutionPath
            ? ` — ${informalPathLabel(data.informalResolutionPath)}`
            : ''}`,
        });
        break;
      case 'stage_changed':
        pushEntry(map, payload.to, {
          at,
          who,
          text: `Stage changed from ${stageLabel(payload.from)} to ${stageLabel(payload.to)}`,
        });
        break;
      case 'history_reviewed':
        pushEntry(map, 'fact_finding', { at, who, text: 'Disciplinary history marked as reviewed' });
        break;
      case 'hearing_invite_issued':
        pushEntry(map, 'hearing_invite', {
          at,
          who,
          text: `Hearing invite issued${payload.hearingScheduledAt
            ? `: ${formatWhen(payload.hearingScheduledAt)}${payload.hearingScheduledTime ? ` at ${payload.hearingScheduledTime}` : ''}${payload.hearingLocation ? ` · ${payload.hearingLocation}` : ''}`
            : ''}`,
        });
        break;
      case 'precautionary_suspension_started':
        pushEntry(map, data.stage || 'fact_finding', { at, who, text: 'Precautionary suspension started' });
        break;
      case 'suspension_ended':
        pushEntry(map, data.stage || 'fact_finding', { at, who, text: 'Precautionary suspension ended' });
        break;
      case 'closed_with_notes':
        pushEntry(map, 'closed', {
          at,
          who,
          text: `Case closed — ${payload.outcomePreset || 'no further action'}${payload.notes ? `: ${payload.notes}` : ''}`,
        });
        break;
      case 'informal_action_recorded_and_closed':
        pushEntry(map, 'closed', {
          at,
          who: payload.closedByName || who,
          text: `Closed as informal action${payload.informalActionDetails ? `: ${payload.informalActionDetails}` : ''}`,
        });
        break;
      case 'file_note_for_improvement_issued':
        pushEntry(map, 'fact_finding', {
          at,
          who: payload.closedByName || who,
          text: `File note for improvement issued${payload.reason ? `: ${payload.reason}` : ''} (manager digitally signed; awaiting employee)`,
        });
        pushEntry(map, 'closed', {
          at,
          who: payload.closedByName || who,
          text: 'Case closed — file note for improvement issued to employee portal',
        });
        break;
      case 'file_note_employee_signed':
        pushEntry(map, 'closed', {
          at,
          who,
          text: 'Employee digitally signed the file note for improvement',
        });
        break;
      case 'minutes_issued':
        if (payload.stageKey) {
          pushEntry(map, payload.stageKey, {
            at,
            who,
            text: payload.documentId
              ? `Document sent to ${payload.intervieweeNameSnapshot || 'employee'} for review: ${payload.fileName || 'file'}`
              : `Interview notes sent to ${payload.intervieweeNameSnapshot || 'employee'} for confirmation`,
          });
        }
        break;
      default:
        if (event.eventType?.startsWith('minutes_')) {
          pushEntry(map, data.stage || firstStage, {
            at,
            who,
            text: `Employee ${event.eventType.replace('minutes_', '').replace(/_/g, ' ')} on interview notes`,
          });
        }
        break;
    }
  }

  if (data.createdByUid || data.createdByName) {
    const opener = data.createdByName || nameForUid(data.createdByUid, employees);
    if (opener && opener !== 'Unknown' && !events.some((e) => e.eventType === 'case_created')) {
      pushEntry(map, firstStage, {
        at: data.openedAt || data.createdAt,
        who: opener,
        text: `Case opened by ${opener}${data.informalResolutionPath
          ? ` — ${informalPathLabel(data.informalResolutionPath)}`
          : ''}`,
      });
    }
  }

  if (data.historyReviewedAt && !events.some((e) => e.eventType === 'history_reviewed')) {
    pushEntry(map, 'fact_finding', {
      at: data.historyReviewedAt,
      who: nameForUid(data.historyReviewedByUid, employees),
      text: 'Disciplinary history marked as reviewed',
    });
  }

  if (data.hearingScheduledAt) {
    pushEntry(map, 'hearing_invite', {
      at: data.hearingInviteIssuedAt || data.hearingScheduledAt,
      who: nameForUid(data.hearingManagerUid, employees) || '—',
      text: `Hearing scheduled: ${formatWhen(data.hearingScheduledAt)}${data.hearingScheduledTime ? ` at ${data.hearingScheduledTime}` : ''}${data.hearingLocation ? ` · ${data.hearingLocation}` : ''}`,
    });
  }

  if (data.outcomePreset && data.stage === 'closed' && !events.some((e) => e.eventType === 'closed_with_notes' || e.eventType === 'informal_action_recorded_and_closed')) {
    pushEntry(map, 'closed', {
      at: data.closedAt,
      who: nameForUid(data.decisionMakerUid, employees),
      text: `Outcome: ${data.outcomePreset}${data.closeNotes ? ` — ${data.closeNotes}` : ''}`,
    });
  }

  for (const stage of stages) {
    map[stage].entries.sort((a, b) => String(a.at || '').localeCompare(String(b.at || '')));
  }

  return map;
}

export function stageReachedIndex(stages, currentStage) {
  const index = stages.indexOf(currentStage);
  return index >= 0 ? index : 0;
}
