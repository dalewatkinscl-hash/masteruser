import { useState } from 'react';
import { isZeroHoursContractMode } from '../utils/contractModes';

function formatUkDate(value) {
  const text = String(value || '').slice(0, 10);
  const match = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return text || '—';
  return `${match[3]}/${match[2]}/${match[1]}`;
}

function formatGbp(amount, { pence = false } = {}) {
  const value = Number(amount) || 0;
  return `£${value.toLocaleString('en-GB', {
    minimumFractionDigits: pence ? 2 : 0,
    maximumFractionDigits: pence ? 2 : 0,
  })}`;
}

function formatServiceLength(completedMonths) {
  const total = Math.max(0, Math.floor(Number(completedMonths) || 0));
  const years = Math.floor(total / 12);
  const months = total % 12;
  const yearLabel = years === 1 ? '1 yr' : `${years} yrs`;
  const monthLabel = months === 1 ? '1 mo' : `${months} mo`;
  return `${yearLabel}, ${monthLabel}`;
}

function formatProRataPercent(factor) {
  const value = Number(factor);
  if (!Number.isFinite(value)) return '—';
  const pct = value * 100;
  return `${pct % 1 === 0 ? pct.toFixed(0) : pct.toFixed(1)}%`;
}

export function isSharePointDeduction(item) {
  return item?.source === 'sharepoint_absence'
    || item?.source === 'sharepoint_lateness'
    || item?.outcomePreset === 'absence'
    || item?.outcomePreset === 'lateness';
}

export function isManualAdjustment(item) {
  return item?.source === 'manual'
    || item?.isManual
    || item?.outcomePreset === 'manual_addition'
    || item?.outcomePreset === 'manual_deduction';
}

export function isManualAddition(item) {
  return item?.kind === 'addition' || item?.outcomePreset === 'manual_addition';
}

export function isLatenessDeduction(item) {
  return item?.source === 'sharepoint_lateness' || item?.outcomePreset === 'lateness';
}

/** Clean display label — lateness = last/most specific only; absence = Absence — reason. */
export function sharePointDeductionLabel(item) {
  if (!item) return 'Deduction';
  if (isLatenessDeduction(item)) {
    const latenessType = String(item.latenessType || '').trim();
    if (latenessType) return latenessType;
    const reason = String(item.reason || '').trim();
    if (reason) {
      const parts = reason.split(/[·—–|-]+/).map((part) => part.trim()).filter(Boolean);
      if (parts.length) return parts[parts.length - 1];
    }
    const warning = String(item.warningLabel || '').trim();
    if (warning) {
      const parts = warning.split(/[·—–|-]+/).map((part) => part.trim()).filter(Boolean);
      if (parts.length) return parts[parts.length - 1];
    }
    return 'Lateness';
  }
  if (item.outcomePreset === 'absence' || item.source === 'sharepoint_absence') {
    const reason = String(item.reason || item.absenceReason || '').trim();
    if (reason && reason.toLowerCase() !== 'absence' && reason.toLowerCase() !== 'record of absence') {
      return `Absence — ${reason}`;
    }
    return 'Absence';
  }
  return String(item.warningLabel || item.reason || 'Deduction').trim() || 'Deduction';
}

function paymentHalfLabel(paymentOfYear) {
  const half = Number(paymentOfYear) === 2 ? 2 : 1;
  return `Payment ${half} of 2 this year`;
}

export function BonusStatementPreviewModal({
  row,
  paymentRunName,
  paymentDate,
  paymentOfYear,
  calculationFrom,
  calculationTo,
  asOfDate,
  onClose,
}) {
  if (!row) return null;
  const proRata = row.proRata || {};
  const half = Number(paymentOfYear ?? row.paymentOfYear) === 2 ? 2 : 1;
  const notPaid = Boolean(
    row.doesNotPayBonus
    || row.notPaidBonus
    || proRata.notPaidBonus
    || isZeroHoursContractMode(row.bonusHoursMode),
  );
  const deductions = (row.deductions || []).filter((item) => item.countsTowardPayment !== false);
  const periodLabel = calculationFrom && calculationTo
    ? `${formatUkDate(calculationFrom)} – ${formatUkDate(calculationTo)}`
    : '—';
  const carryIn = Number(row.carryForwardIn) || 0;
  const carryOut = Number(row.carryForwardOut) || 0;
  const writtenOff = Number(row.writtenOff) || 0;
  const proRataPct = formatProRataPercent(proRata.factor ?? (row.isFullTime ? 1 : null));
  const hoursExplanation = String(proRata.calculation || '').trim()
    || (proRata.isFullTime
      ? 'Full-time staff receive 100% of the bonus (no hours adjustment).'
      : 'Your bonus is adjusted by comparing your contracted hours with the full-time hours for your staff group.');

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="bonus-statement-title"
        className="w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-xl border border-[#1a2540] bg-[#0b1220] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="border-b border-[#1a2540] px-5 py-4 flex items-start justify-between gap-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-widest text-indigo-300/90">
              Employee portal preview
            </p>
            <h2 id="bonus-statement-title" className="mt-1 text-lg font-semibold text-white">
              Bonus statement
            </h2>
            <p className="mt-1 text-sm text-slate-400">
              What {row.employeeName || 'this employee'} will see on their profile.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-white text-sm px-2 py-1"
          >
            Close
          </button>
        </div>

        <div className="px-5 py-5 space-y-5">
          <p className="text-xs text-slate-400 leading-relaxed rounded-lg border border-[#1a2540] bg-[#060e1a] px-3 py-2.5">
            Bonus deductions from absence and lateness are updated at 6:30am each day.
          </p>

          <div className="rounded-xl border border-[#1a2540] bg-[#060e1a] px-4 py-4">
            <p className="text-base font-semibold text-white">{row.employeeName || '—'}</p>
            {row.department ? (
              <p className="text-sm text-slate-400 mt-0.5">{row.department}</p>
            ) : null}
            <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
              <div>
                <dt className="text-slate-500 text-xs">Payment</dt>
                <dd className="text-slate-200">{paymentRunName || '—'}</dd>
              </div>
              <div>
                <dt className="text-slate-500 text-xs">Payment date</dt>
                <dd className="text-slate-200">{formatUkDate(paymentDate)}</dd>
              </div>
              <div>
                <dt className="text-slate-500 text-xs">Year half</dt>
                <dd className="text-slate-200">{paymentHalfLabel(half)}</dd>
              </div>
              <div>
                <dt className="text-slate-500 text-xs">
                  Service (as of {formatUkDate(asOfDate || calculationTo)})
                </dt>
                <dd className="text-slate-200">{formatServiceLength(row.completedMonths)}</dd>
              </div>
              <div className="col-span-2">
                <dt className="text-slate-500 text-xs">Calculation period</dt>
                <dd className="text-slate-200">{periodLabel}</dd>
              </div>
            </dl>
          </div>

          {notPaid ? (
            <p className="text-sm text-rose-200">
              This contract does not receive a bonus payment.
            </p>
          ) : (
            <>
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-widest text-slate-500 mb-2">
                  Pro-rata
                </p>
                <ul className="space-y-2 text-sm">
                  <li className="flex justify-between gap-3">
                    <span className="text-slate-400">Percentage</span>
                    <span className="text-slate-100 tabular-nums font-medium">{proRataPct}</span>
                  </li>
                  <li className="flex justify-between gap-3">
                    <span className="text-slate-400">Pro-rated base</span>
                    <span className="text-slate-100 tabular-nums font-medium">
                      {formatGbp(row.preDeductionPot, { pence: true })}
                    </span>
                  </li>
                </ul>
                <p className="mt-2 text-xs text-slate-500 leading-relaxed">
                  {hoursExplanation}
                  {' '}
                  The pro-rated base is your half-year bonus after adjusting for contracted hours.
                </p>
              </div>

              <div>
                <p className="text-[11px] font-semibold uppercase tracking-widest text-slate-500 mb-2">
                  Deductions this period
                </p>
                {carryIn > 0 ? (
                  <div className="mb-2 flex justify-between gap-3 rounded-lg border border-amber-500/25 bg-amber-500/10 px-3 py-2 text-sm">
                    <span className="text-amber-100/90">Carried forward from payment 1</span>
                    <span className="text-amber-100 font-medium tabular-nums whitespace-nowrap">
                      −{formatGbp(carryIn)}
                    </span>
                  </div>
                ) : null}
                {deductions.length === 0 ? (
                  <p className="text-sm text-slate-500 italic">No deductions this period.</p>
                ) : (
                  <ul className="space-y-2">
                    {deductions.map((item) => {
                      const addition = isManualAddition(item);
                      return (
                        <li
                          key={`${row.employeeUid}-stmt-${item.caseId || item.id}`}
                          className="flex justify-between gap-3 rounded-lg border border-[#1a2540] bg-[#060e1a] px-3 py-2 text-sm"
                        >
                          <div>
                            <p className="text-slate-100">
                              {isManualAdjustment(item)
                                ? `${addition ? 'Manual addition' : 'Manual deduction'}${item.reason ? ` — ${item.reason}` : ''}`
                                : isSharePointDeduction(item)
                                  ? sharePointDeductionLabel(item)
                                  : (item.warningLabel || 'Deduction')}
                            </p>
                            <p className="text-[11px] text-slate-500 mt-0.5">
                              {formatUkDate(item.givenAt)}
                            </p>
                          </div>
                          <span className={`font-medium tabular-nums whitespace-nowrap ${
                            addition ? 'text-emerald-200' : 'text-rose-200'
                          }`}
                          >
                            {addition ? '+' : '−'}{formatGbp(item.amount)}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                )}
                {half === 1 && carryOut > 0 ? (
                  <p className="mt-2 text-xs text-amber-200/90 leading-relaxed">
                    Deductions exceed this payment by {formatGbp(carryOut)}. That balance will
                    carry forward to payment 2 of the year.
                  </p>
                ) : null}
                {half === 2 && writtenOff > 0 ? (
                  <p className="mt-2 text-xs text-slate-500 leading-relaxed">
                    Deductions exceed this payment by {formatGbp(writtenOff)}. After the December
                    payment the balance resets — excess does not carry into next July.
                  </p>
                ) : null}
              </div>

              <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 flex justify-between gap-3">
                <span className="text-emerald-100 font-medium">Next payment</span>
                <span className="text-emerald-100 font-semibold tabular-nums text-lg">
                  {formatGbp(row.finalPayment, { pence: true })}
                </span>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export function PreviewStatementButton({
  row,
  paymentRunName,
  paymentDate,
  paymentOfYear,
  calculationFrom,
  calculationTo,
  asOfDate,
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setOpen(true);
        }}
        className="px-3 py-1.5 rounded-lg border border-indigo-500/40 bg-indigo-500/10 text-xs font-medium text-indigo-200 hover:bg-indigo-500/20"
      >
        Preview employee statement
      </button>
      {open ? (
        <BonusStatementPreviewModal
          row={row}
          paymentRunName={paymentRunName}
          paymentDate={paymentDate}
          paymentOfYear={paymentOfYear}
          calculationFrom={calculationFrom}
          calculationTo={calculationTo}
          asOfDate={asOfDate}
          onClose={() => setOpen(false)}
        />
      ) : null}
    </>
  );
}
