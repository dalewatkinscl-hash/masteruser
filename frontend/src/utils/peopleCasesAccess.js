export function getCasesRole(user) {
  if (user?.portalsAccess?.master_admin === 'admin') return 'admin';
  const role = user?.portalsAccess?.cases_app;
  if (role === 'manager' || role === 'admin' || role === 'hr') return role;
  const hrRole = user?.portalsAccess?.hr_app;
  if (hrRole === 'manager' || hrRole === 'admin') return 'hr';
  return '';
}

export function canManagePeopleCases(user) {
  const role = getCasesRole(user);
  return role === 'manager' || role === 'admin' || role === 'hr';
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

function packIncomplete(caseItem) {
  const steps = Array.isArray(caseItem?.outcomePackSteps) ? caseItem.outcomePackSteps : [];
  return steps.some((step) => step.id !== 'mark_complete' && !step.done);
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
    return {
      label: `${prefix} — awaiting employee response`,
      hint: 'Minutes or invite awaiting the employee in the portal',
      tone: 'amber',
      stage,
    };
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
      if (!caseItem.outcomePreset) {
        return { label: `${prefix} — awaiting outcome`, hint: 'Select outcome and create outcome documents', tone: 'amber', stage };
      }
      if (packIncomplete(caseItem)) {
        return { label: `${prefix} — awaiting outcome documents`, hint: 'Complete the outcome document pack', tone: 'amber', stage };
      }
      return { label: `${prefix} — ready to close`, hint: 'Outcome pack complete — close the case', tone: 'emerald', stage };
    }
    if (stage === 'appeal') {
      return { label: `${prefix} — on appeal — awaiting outcome`, hint: 'Complete appeal and close', tone: 'amber', stage };
    }
    if (stage === 'closed') {
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
    return {
      label: `${prefix} — awaiting fact-finding`,
      hint: 'Hold interview, issue minutes, then close with notes or schedule a hearing',
      tone,
      stage,
    };
  }
  if (stage === 'hearing_invite') {
    if (!caseItem.hearingInviteIssuedAt) {
      return {
        label: `${prefix} — awaiting hearing invite`,
        hint: 'Set date and send invite via portal (and print if needed)',
        tone: 'amber',
        stage,
      };
    }
    return {
      label: `${prefix} — hearing invite sent`,
      hint: 'Invite issued — proceed to hold the hearing',
      tone: 'emerald',
      stage,
    };
  }
  if (stage === 'hearing') {
    return {
      label: `${prefix} — awaiting hearing`,
      hint: 'Hold hearing and issue minutes',
      tone,
      stage,
    };
  }
  if (stage === 'outcome_pack') {
    if (!caseItem.outcomePreset) {
      return {
        label: `${prefix} — awaiting outcome`,
        hint: 'Select outcome and create required outcome documents',
        tone: 'amber',
        stage,
      };
    }
    if (packIncomplete(caseItem)) {
      return {
        label: `${prefix} — awaiting outcome documents`,
        hint: 'Finish outcome pack letters / documents before closing',
        tone: 'amber',
        stage,
      };
    }
    return {
      label: `${prefix} — ready to close`,
      hint: 'Outcome and documents complete — close the case',
      tone: 'emerald',
      stage,
    };
  }
  if (stage === 'appeal') {
    return {
      label: `${prefix} — on appeal — awaiting outcome`,
      hint: 'Complete appeal hearing and outcome documents',
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
    const outcome = caseItem.outcomePreset ? stageLabel(caseItem.outcomePreset) : 'no further action';
    const appealNote = caseItem.appealWindowEndsAt
      ? `Appeal window to ${String(caseItem.appealWindowEndsAt).slice(0, 10)}`
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
  if (tone === 'emerald') return 'text-emerald-200 border-emerald-500/30 bg-emerald-500/10';
  if (tone === 'slate') return 'text-slate-300 border-[#1a2540] bg-[#060e1a]/50';
  return 'text-indigo-100 border-indigo-500/30 bg-indigo-500/10';
}

export const OUTCOME_PRESETS = [
  { id: 'informal_action', label: 'Informal action (recorded)', suggestedExpiryMonths: null },
  { id: 'file_note_for_improvement', label: 'File note for improvement', suggestedExpiryMonths: null },
  { id: 'no_further_action', label: 'No further action', suggestedExpiryMonths: null },

  { id: 'written_warning', label: 'Written warning', suggestedExpiryMonths: 6 },
  { id: 'final_written_warning', label: 'Final written warning', suggestedExpiryMonths: 12 },
  { id: 'pip', label: 'Performance improvement plan', suggestedExpiryMonths: null },
  { id: 'training_required', label: 'Training required', suggestedExpiryMonths: null },
  { id: 'suspension', label: 'Suspension', suggestedExpiryMonths: null },
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

/** Acas does not fix a number; 5 working days is a common reasonable target. */
export const RECOMMENDED_HEARING_NOTICE_WORKING_DAYS = 5;
export const MINIMUM_HEARING_NOTICE_WORKING_DAYS = 2;
