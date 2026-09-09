import { useMemo } from 'react';
import { stageLabel } from '../utils/peopleCasesAccess';
import { buildStageHistory, stageReachedIndex } from '../utils/caseStageHistory';

function formatEntryWhen(at) {
  if (!at) return '';
  return String(at).slice(0, 16).replace('T', ' ');
}

export default function CaseProgressRail({
  stages = [],
  currentStage,
  viewStage,
  onViewStageChange,
  caseData,
  events = [],
  minutes = [],
  documents = [],
  employees = [],
}) {
  const reachedIndex = stageReachedIndex(stages, currentStage);
  const selectedStage = viewStage || currentStage;

  const historyByStage = useMemo(
    () => buildStageHistory({
      stages,
      caseData: caseData || {},
      events,
      minutes,
      documents,
      employees,
    }),
    [stages, caseData, events, minutes, documents, employees],
  );

  const selectedHistory = historyByStage[selectedStage];

  return (
    <div className="bg-[#0b1220] border border-[#1a2540] rounded-xl p-4 space-y-4">
      <div>
        <p className="text-xs uppercase text-slate-500 mb-1">Case progress</p>
        <p className="text-xs text-slate-400">Click a stage to view dates, choices, and who actioned them.</p>
        {!stages.includes('hearing_invite') && !stages.includes('hearing') && !stages.includes('outcome_pack') && (
          <p className="text-xs text-amber-200/90 mt-1">
            Resolved without a formal hearing — hearing invite, hearing, and outcome pack steps do not apply.
          </p>
        )}
      </div>

      <ol className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
        {stages.map((stage, index) => {
          const done = index < reachedIndex;
          const active = stage === currentStage;
          const viewing = stage === selectedStage;
          const reachable = index <= reachedIndex;

          return (
            <li key={stage} className="flex items-center gap-2">
              <button
                type="button"
                disabled={!reachable}
                onClick={() => reachable && onViewStageChange?.(stage)}
                className={`flex items-center gap-2 rounded-lg px-1 py-0.5 transition ${
                  viewing ? 'ring-1 ring-indigo-400/60 bg-indigo-500/10' : reachable ? 'hover:bg-[#060e1a]' : 'opacity-50 cursor-not-allowed'
                }`}
              >
                <span
                  className={`inline-flex h-7 min-w-7 items-center justify-center rounded-full px-2 text-xs font-medium border ${
                    active
                      ? 'bg-indigo-600 border-indigo-500 text-white'
                      : done
                        ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-200'
                        : 'border-[#1a2540] text-slate-500'
                  }`}
                >
                  {done && !active ? '✓' : index + 1}
                </span>
                <span className={`text-sm text-left ${viewing ? 'text-white font-medium' : active ? 'text-indigo-200' : done ? 'text-slate-300' : 'text-slate-500'}`}>
                  {stageLabel(stage)}
                </span>
              </button>
              {index < stages.length - 1 && (
                <span className="hidden sm:inline text-slate-600 mx-1">→</span>
              )}
            </li>
          );
        })}
      </ol>

      {selectedHistory && (
        <div className="rounded-lg border border-[#1a2540] bg-[#060e1a]/50 p-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-medium text-white">{selectedHistory.label}</p>
            {selectedStage !== currentStage && (
              <button
                type="button"
                className="text-xs text-indigo-300 hover:text-indigo-200"
                onClick={() => onViewStageChange?.(currentStage)}
              >
                Back to current step
              </button>
            )}
          </div>
          {selectedHistory.entries.length === 0 ? (
            <p className="text-sm text-slate-500">No recorded activity for this stage yet.</p>
          ) : (
            <ul className="space-y-2">
              {selectedHistory.entries.map((entry, index) => (
                <li key={`${entry.at}-${index}`} className="text-sm border-l-2 border-indigo-500/40 pl-3">
                  <p className="text-slate-200">{entry.text}</p>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {formatEntryWhen(entry.at) || 'Date not recorded'}
                    {entry.who ? ` · ${entry.who}` : ''}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
