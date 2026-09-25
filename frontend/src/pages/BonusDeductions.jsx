import { useCallback, useEffect, useMemo, useState, Fragment } from 'react';
import { useNavigate } from 'react-router-dom';
import { readJsonResponse } from '../utils/employeeProfile';
import { contractModeLabel, isZeroHoursContractMode, normalizeContractMode } from '../utils/contractModes';
import {
  isSharePointDeduction,
  sharePointDeductionLabel,
  PreviewStatementButton,
} from '../components/BonusStatementPreview';

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

function SortHeader({ label, active, direction, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-1 text-xs font-semibold uppercase tracking-widest text-slate-400 hover:text-slate-200"
    >
      {label}
      {active && (
        <span className="text-indigo-300">{direction === 'asc' ? '↑' : '↓'}</span>
      )}
    </button>
  );
}

function ChevronIcon({ open }) {
  return (
    <svg
      className={`w-4 h-4 text-slate-400 transition-transform ${open ? 'rotate-90' : ''}`}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path d="m9 6 6 6-6 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function resolveProRataBaseDisplay(base) {
  if (base === 'office') return { label: 'Office', hours: 1950 };
  if (base === 'workshop') return { label: 'Workshop', hours: 2080 };
  return { label: 'Driver', hours: 2210 };
}

function isExcludedFromBonus(row) {
  return Boolean(
    row.doesNotPayBonus
    || row.notPaidBonus
    || isZeroHoursContractMode(row.bonusHoursMode || row.proRata?.bonusHoursMode)
    || row.proRata?.notPaidBonus
    || row.proRata?.doesNotPayBonus,
  );
}

/** Hide the bare "driver" test account — not real names that contain "driver". */
function isDriverTestAccount(row) {
  const name = String(row.employeeName || '').trim().toLowerCase();
  if (name === 'driver') return true;
  const email = String(row.employeeEmail || '').trim().toLowerCase();
  if (!email) return false;
  const local = email.split('@')[0] || '';
  return local === 'driver' || local === 'test.driver' || local === 'testdriver';
}

function csvEscape(value) {
  const text = String(value ?? '');
  if (/[",\n\r]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

function formatServiceLength(completedMonths) {
  const total = Math.max(0, Math.floor(Number(completedMonths) || 0));
  const years = Math.floor(total / 12);
  const months = total % 12;
  const yearLabel = years === 1 ? '1 yr' : `${years} yrs`;
  const monthLabel = months === 1 ? '1 mo' : `${months} mo`;
  return `${yearLabel}, ${monthLabel}`;
}

function downloadBonusDeductionsCsv(rows, paymentDate) {
  const headers = [
    'Employee',
    'Department',
    'Contract',
    'Start date',
    'Service years',
    'Service months',
    'Annual entitlement',
    'Pre-deduction pot',
    'Deductions',
    'Final payment',
  ];
  const lines = [headers.join(',')];
  for (const row of rows) {
    const mode = normalizeContractMode(row.bonusHoursMode || row.proRata?.bonusHoursMode);
    const contract = contractModeLabel(mode) || row.contractType || '';
    const totalMonths = Number(row.completedMonths) || 0;
    const serviceYears = Math.floor(totalMonths / 12);
    const serviceMonths = totalMonths % 12;
    lines.push([
      csvEscape(row.employeeName || ''),
      csvEscape(row.department || ''),
      csvEscape(contract),
      csvEscape(row.startDate || ''),
      csvEscape(row.startDate ? String(serviceYears) : ''),
      csvEscape(row.startDate ? String(serviceMonths) : ''),
      csvEscape((Number(row.annualEntitlement) || 0).toFixed(2)),
      csvEscape((Number(row.preDeductionPot) || 0).toFixed(2)),
      csvEscape((Number(row.totalAmount) || 0).toFixed(2)),
      csvEscape((Number(row.finalPayment) || 0).toFixed(2)),
    ].join(','));
  }
  const dateStamp = String(paymentDate || new Date().toISOString().slice(0, 10)).slice(0, 10);
  const blob = new Blob([`\uFEFF${lines.join('\r\n')}`], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `bonus-deductions-${dateStamp}.csv`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function ContractBadge({ row }) {
  const mode = normalizeContractMode(row.bonusHoursMode || row.proRata?.bonusHoursMode);
  const modeLabel = contractModeLabel(mode) || row.contractType || '';
  const excluded = Boolean(
    row.doesNotPayBonus
    || row.notPaidBonus
    || isZeroHoursContractMode(mode)
    || row.proRata?.notPaidBonus
    || row.proRata?.doesNotPayBonus,
  );
  if (excluded) {
    return (
      <span className="inline-flex items-center gap-1.5 flex-wrap">
        <span className="rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide bg-slate-500/15 text-slate-300 border border-slate-500/25">
          {modeLabel || 'Contract'}
        </span>
        <span className="rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide bg-rose-500/15 text-rose-200 border border-rose-500/30">
          No bonus
        </span>
      </span>
    );
  }
  if (row.isPartTime) {
    const annual = row.annualContractedHours || row.proRata?.annualContractedHours;
    const missing = row.proRata?.missingHours;
    const baseKey = row.proRata?.proRataBase || row.proRataBase || '';
    const fallback = resolveProRataBaseDisplay(baseKey);
    const baseLabel = row.proRata?.proRataBaseLabel || fallback.label;
    const denominator = row.proRata?.fullTimeAnnualHours || fallback.hours;
    return (
      <span className="inline-flex items-center gap-1.5 flex-wrap">
        <span className="rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide bg-amber-500/15 text-amber-200 border border-amber-500/30">
          {modeLabel || 'Part-Time'} · {baseLabel}
        </span>
        {missing ? (
          <span className="text-[10px] text-amber-300">set annual hours</span>
        ) : annual ? (
          <span className="text-[10px] text-slate-500">{annual} / {denominator} hrs</span>
        ) : null}
      </span>
    );
  }
  return (
    <span className="rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide bg-slate-500/15 text-slate-300 border border-slate-500/25">
      {modeLabel || 'Full-Time'}
    </span>
  );
}

function BreakdownRow({ label, value, muted = false, emphasize = false }) {
  return (
    <div className="flex items-start justify-between gap-4 py-1.5 border-b border-[#1a2540]/60 last:border-0">
      <span className={`text-xs ${muted ? 'text-slate-500' : 'text-slate-400'}`}>{label}</span>
      <span className={`text-sm text-right ${emphasize ? 'text-emerald-200 font-semibold' : 'text-slate-200'}`}>
        {value}
      </span>
    </div>
  );
}

function AnnualEntitlementHover({ row, fullTimeAnnualHours, children }) {
  const [open, setOpen] = useState(false);
  const bonus = row.bonus || {};
  const proRata = row.proRata || {};
  const excluded = Boolean(
    row.doesNotPayBonus
    || row.notPaidBonus
    || proRata.notPaidBonus
    || proRata.doesNotPayBonus
    || isZeroHoursContractMode(row.bonusHoursMode),
  );
  const factor = Number(proRata.factor);
  const showProRata = Boolean(row.isPartTime) && Number.isFinite(factor) && factor < 0.999 && !excluded;
  const factorPct = Number.isFinite(factor) ? `${(factor * 100).toFixed(2)}%` : '—';
  const hours = proRata.annualContractedHours || row.annualContractedHours;
  const baseKey = proRata.proRataBase || row.proRataBase || '';
  const fallback = resolveProRataBaseDisplay(baseKey);
  const baseLabel = proRata.proRataBaseLabel || fallback.label;
  const denominator = proRata.fullTimeAnnualHours || fullTimeAnnualHours || fallback.hours;
  const gross = Number(row.annualEntitlementGross ?? bonus.accruedPot) || 0;
  const entitlement = Number(row.annualEntitlement) || 0;

  return (
    <span
      className="relative inline-flex max-w-full"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={() => setOpen(false)}
    >
      <span className="cursor-help border-b border-dotted border-slate-500/60">
        {children}
      </span>
      {open ? (
        <span
          role="tooltip"
          className="absolute z-50 left-0 top-full mt-1.5 w-64 max-w-[min(18rem,85vw)] rounded-lg border border-[#1a2540] bg-[#0b1220] shadow-2xl px-3 py-2.5 text-left"
          onClick={(e) => e.stopPropagation()}
        >
          <span className="block text-[11px] font-semibold text-slate-200 mb-2">
            Annual entitlement breakdown
          </span>
          {excluded ? (
            <span className="block text-[11px] text-rose-300">Excluded from bonus · £0.00</span>
          ) : (
            <ul className="space-y-1.5">
              <li className="flex justify-between gap-3 text-[11px]">
                <span className="text-slate-500">
                  {bonus.underOneYear ? 'Base (under 1 year)' : 'Base bonus'}
                </span>
                <span className="text-slate-200 tabular-nums">
                  {formatGbp(bonus.baseBonus ?? 1100, { pence: true })}
                </span>
              </li>
              {!bonus.underOneYear ? (
                <li className="flex justify-between gap-3 text-[11px]">
                  <span className="text-slate-500">
                    Loyalty ({bonus.completedYears || 0} yrs)
                  </span>
                  <span className="text-emerald-300/90 tabular-nums">
                    +{formatGbp(bonus.loyaltyBonus, { pence: true })}
                  </span>
                </li>
              ) : (
                <li className="flex justify-between gap-3 text-[11px]">
                  <span className="text-slate-500">Service</span>
                  <span className="text-slate-400">
                    {bonus.completedMonths || 0} / 12 months
                  </span>
                </li>
              )}
              <li className="flex justify-between gap-3 text-[11px] border-t border-[#1a2540] pt-1.5">
                <span className="text-slate-400">Base + loyalty</span>
                <span className="text-slate-200 tabular-nums">
                  {formatGbp(gross, { pence: true })}
                </span>
              </li>
              {showProRata ? (
                <li className="flex justify-between gap-3 text-[11px]">
                  <span className="text-slate-500">
                    × rata · {baseLabel}
                    {hours != null && hours !== '' ? ` (${hours} ÷ ${denominator})` : ''}
                  </span>
                  <span className="text-amber-200/90 tabular-nums">{factorPct}</span>
                </li>
              ) : null}
              <li className="flex justify-between gap-3 text-[11px] border-t border-[#1a2540] pt-1.5">
                <span className="text-slate-300">Annual entitlement</span>
                <span className="text-emerald-200 font-semibold tabular-nums">
                  {formatGbp(entitlement, { pence: true })}
                </span>
              </li>
            </ul>
          )}
        </span>
      ) : null}
    </span>
  );
}

function EmployeeBreakdown({
  row,
  fullTimeAnnualHours,
  onOpenCase,
  paymentRunId,
  paymentRunName,
  paymentDate,
  paymentOfYear,
  calculationFrom,
  calculationTo,
  asOfDate,
  onAdjustmentsChanged,
}) {
  const bonus = row.bonus || {};
  const proRata = row.proRata || {};
  const notPaid = Boolean(
    row.doesNotPayBonus
    || row.notPaidBonus
    || proRata.notPaidBonus
    || proRata.doesNotPayBonus
    || isZeroHoursContractMode(row.bonusHoursMode)
    || isZeroHoursContractMode(proRata.bonusHoursMode),
  );
  const showProRata = Boolean(row.isPartTime) && !notPaid;
  const factorPct = Number.isFinite(Number(proRata.factor))
    ? `${(Number(proRata.factor) * 100).toFixed(2)}%`
    : '—';
  const annual = proRata.annualContractedHours || row.annualContractedHours || '—';
  const denominator = proRata.fullTimeAnnualHours || fullTimeAnnualHours;
  const baseLabel = proRata.proRataBaseLabel
    || resolveProRataBaseDisplay(proRata.proRataBase || row.proRataBase).label;
  const preDeduction = formatGbp(row.preDeductionPot, { pence: true });
  const statementProps = {
    row,
    paymentRunName,
    paymentDate,
    paymentOfYear,
    calculationFrom,
    calculationTo,
    asOfDate,
  };

  const [adjKind, setAdjKind] = useState('deduction');
  const [adjAmount, setAdjAmount] = useState('');
  const [adjReason, setAdjReason] = useState('');
  const [adjSaving, setAdjSaving] = useState(false);
  const [adjError, setAdjError] = useState('');
  const [adjDeletingId, setAdjDeletingId] = useState('');

  const isManualLine = (item) => (
    item?.source === 'manual'
    || item?.outcomePreset === 'manual_addition'
    || item?.outcomePreset === 'manual_deduction'
    || item?.isManual
  );
  const isAdditionLine = (item) => (
    item?.kind === 'addition'
    || item?.outcomePreset === 'manual_addition'
  );

  const saveAdjustment = async (event) => {
    event.preventDefault();
    if (!paymentRunId || !row.employeeUid) return;
    setAdjSaving(true);
    setAdjError('');
    try {
      const response = await fetch('/api/saveBonusManualAdjustment', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          employeeUid: row.employeeUid,
          paymentRunId,
          paymentDate,
          kind: adjKind,
          amount: Number(adjAmount),
          reason: adjReason,
        }),
      });
      const data = (await readJsonResponse(response)) || {};
      if (!response.ok) throw new Error(data.error || 'Failed to save adjustment.');
      setAdjAmount('');
      setAdjReason('');
      setAdjKind('deduction');
      await onAdjustmentsChanged?.();
    } catch (err) {
      setAdjError(err.message || 'Failed to save adjustment.');
    } finally {
      setAdjSaving(false);
    }
  };

  const removeAdjustment = async (item) => {
    const id = item?.id || item?.caseId;
    if (!id) return;
    if (!window.confirm('Remove this manual adjustment?')) return;
    setAdjDeletingId(id);
    setAdjError('');
    try {
      const response = await fetch('/api/deleteBonusManualAdjustment', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      });
      const data = (await readJsonResponse(response)) || {};
      if (!response.ok) throw new Error(data.error || 'Failed to delete adjustment.');
      await onAdjustmentsChanged?.();
    } catch (err) {
      setAdjError(err.message || 'Failed to delete adjustment.');
    } finally {
      setAdjDeletingId('');
    }
  };

  if (notPaid) {
    return (
      <div className="px-5 py-4 bg-[#060e1a]/80 border-t border-[#1a2540] space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-sm text-rose-200 font-medium">Does not pay bonus</p>
            <p className="text-xs text-slate-500 mt-1">
              {isZeroHoursContractMode(row.bonusHoursMode)
                ? 'Zero Hours contracts are always excluded.'
                : 'This employee is marked does not pay bonus.'}
              {' '}Pre-deduction pot and final payment are £0.00.
            </p>
          </div>
          <PreviewStatementButton {...statementProps} />
        </div>
        {row.deductions?.length ? (
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-widest text-slate-500 mb-2">
              Deductions ({row.deductionCount || 0}) — listed only
            </p>
            <ul className="space-y-2">
              {row.deductions.map((item) => (
                <li
                  key={`${row.employeeUid}-${item.caseId}`}
                  className="rounded-lg border border-[#1a2540] bg-[#0b1220] px-3 py-2 text-sm text-slate-400"
                >
                  {isSharePointDeduction(item) ? sharePointDeductionLabel(item) : item.warningLabel}
                  <span className="float-right text-slate-500">−{formatGbp(item.amount)}</span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <div className="px-5 py-4 bg-[#060e1a]/80 border-t border-[#1a2540] space-y-4">
      <div className="flex justify-end">
        <PreviewStatementButton {...statementProps} />
      </div>
      <div className="grid gap-6 md:grid-cols-2">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-widest text-slate-500 mb-2">
          Bonus calculation
        </p>
        <BreakdownRow
          label={bonus.underOneYear ? 'Base (pro-rated under 1 year)' : 'Base bonus'}
          value={formatGbp(bonus.baseBonus ?? 1100, { pence: true })}
        />
        {!bonus.underOneYear ? (
          <BreakdownRow
            label={`Loyalty (${bonus.completedYears || 0} completed years)`}
            value={`+${formatGbp(bonus.loyaltyBonus, { pence: true })}`}
          />
        ) : (
          <BreakdownRow
            label={`Service (${bonus.completedMonths || 0} full months)`}
            value={`${bonus.completedMonths || 0} / 12 of year`}
            muted
          />
        )}
        <BreakdownRow
          label="Base + loyalty"
          value={formatGbp(bonus.accruedPot, { pence: true })}
        />
        {showProRata ? (
          <>
            <BreakdownRow
              label={`× rata (${annual} ÷ ${baseLabel} FT ${denominator} = ${factorPct})`}
              value={factorPct}
            />
            {proRata.missingHours ? (
              <p className="text-[11px] text-amber-300 mt-1 mb-1">
                Rata — set contract type, Driver / Office / Workshop base, and annual contracted hours on the employee profile.
              </p>
            ) : null}
          </>
        ) : null}
        <BreakdownRow
          label={showProRata ? 'Annual entitlement ((base + loyalty) × rata)' : 'Annual entitlement'}
          value={formatGbp(row.annualEntitlement ?? bonus.accruedPot, { pence: true })}
          emphasize
        />
        <BreakdownRow
          label="Half-year / pre-deduction pot"
          value={preDeduction}
        />
      </div>
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-widest text-slate-500 mb-2">
          Deductions &amp; adjustments ({row.deductionCount || 0})
        </p>
        {row.deductions.length === 0 ? (
          <p className="text-sm text-slate-500 italic py-2">No deductions for this employee.</p>
        ) : (
          <ul className="space-y-2 mb-3">
            {row.deductions.map((item) => {
              const inactive = item.countsTowardPayment === false;
              const manual = isManualLine(item);
              const addition = isAdditionLine(item);
              return (
                <li
                  key={`${row.employeeUid}-${item.caseId || item.id}`}
                  className="rounded-lg border border-[#1a2540] bg-[#0b1220] px-3 py-2"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      {manual ? (
                        <p className="text-sm text-slate-100">
                          {addition ? 'Manual addition' : 'Manual deduction'}
                          {item.reason ? ` — ${item.reason}` : ''}
                        </p>
                      ) : isSharePointDeduction(item) ? (
                        <p className="text-sm text-slate-100">
                          {sharePointDeductionLabel(item)}
                        </p>
                      ) : (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onOpenCase?.(item.caseId);
                          }}
                          className="text-sm text-left text-slate-100 hover:text-indigo-300"
                        >
                          {item.warningLabel}
                          {item.warningTitle ? ` — ${item.warningTitle}` : ''}
                        </button>
                      )}
                      {!manual && !isSharePointDeduction(item) && item.reason ? (
                        <p className="text-xs text-slate-500 mt-0.5">{item.reason}</p>
                      ) : null}
                      <p className="text-[11px] text-slate-500 mt-1">
                        {formatUkDate(item.givenAt)}
                        {item.superseded ? ' · Superseded' : ''}
                        {item.cleared ? ' · Cleared' : ''}
                        {inactive ? ' · not taken from payment' : ''}
                      </p>
                      {manual ? (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            removeAdjustment(item);
                          }}
                          disabled={adjDeletingId === (item.id || item.caseId)}
                          className="mt-1.5 text-[11px] text-rose-300/90 hover:text-rose-200 disabled:opacity-40"
                        >
                          {adjDeletingId === (item.id || item.caseId) ? 'Removing…' : 'Remove'}
                        </button>
                      ) : null}
                    </div>
                    <span className={`text-sm font-medium whitespace-nowrap ${
                      inactive
                        ? 'text-slate-500 line-through'
                        : addition
                          ? 'text-emerald-200'
                          : 'text-rose-200'
                    }`}
                    >
                      {addition ? '+' : '−'}{formatGbp(item.amount)}
                    </span>
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        {!notPaid && paymentRunId ? (
          <form
            onSubmit={saveAdjustment}
            className="mb-3 rounded-lg border border-dashed border-[#1a2540] bg-[#060e1a]/60 p-3 space-y-2"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="text-[11px] font-semibold uppercase tracking-widest text-slate-500">
              Manual adjustment
            </p>
            <div className="grid gap-2 sm:grid-cols-3">
              <label className="block text-xs text-slate-400">
                Type
                <select
                  value={adjKind}
                  onChange={(e) => setAdjKind(e.target.value)}
                  className="mt-1 w-full bg-[#0b1220] border border-[#1a2540] text-slate-100 text-sm rounded-lg px-2.5 py-2"
                >
                  <option value="deduction">Deduction</option>
                  <option value="addition">Addition</option>
                </select>
              </label>
              <label className="block text-xs text-slate-400">
                Amount (£)
                <input
                  type="number"
                  required
                  min="0.01"
                  step="0.01"
                  value={adjAmount}
                  onChange={(e) => setAdjAmount(e.target.value)}
                  className="mt-1 w-full bg-[#0b1220] border border-[#1a2540] text-slate-100 text-sm rounded-lg px-2.5 py-2"
                />
              </label>
              <label className="block text-xs text-slate-400 sm:col-span-1">
                Reason
                <input
                  type="text"
                  required
                  value={adjReason}
                  onChange={(e) => setAdjReason(e.target.value)}
                  placeholder="e.g. goodwill / recovery"
                  className="mt-1 w-full bg-[#0b1220] border border-[#1a2540] text-slate-100 text-sm rounded-lg px-2.5 py-2"
                />
              </label>
            </div>
            {adjError ? <p className="text-xs text-rose-300">{adjError}</p> : null}
            <button
              type="submit"
              disabled={adjSaving || !adjAmount || !adjReason.trim()}
              className="px-3 py-1.5 rounded-lg bg-indigo-600 text-xs font-medium text-white hover:bg-indigo-500 disabled:opacity-40"
            >
              {adjSaving ? 'Saving…' : adjKind === 'addition' ? 'Add to bonus' : 'Deduct from bonus'}
            </button>
          </form>
        ) : null}

        {Number(row.periodAdditionTotal) > 0 ? (
          <BreakdownRow
            label="Manual additions"
            value={`+${formatGbp(row.periodAdditionTotal)}`}
          />
        ) : null}
        {Number(row.carryForwardIn) > 0 ? (
          <BreakdownRow
            label="Carried from payment 1"
            value={`−${formatGbp(row.carryForwardIn)}`}
          />
        ) : null}
        <BreakdownRow
          label="Net deductions (applied)"
          value={formatGbp(row.totalAmount)}
        />
        {Number(row.carryForwardOut) > 0 ? (
          <BreakdownRow
            label="Carry forward to payment 2"
            value={formatGbp(row.carryForwardOut)}
            muted
          />
        ) : null}
        {Number(row.writtenOff) > 0 ? (
          <BreakdownRow
            label="Excess written off (year reset)"
            value={formatGbp(row.writtenOff)}
            muted
          />
        ) : null}
        <BreakdownRow
          label="Final payment"
          value={formatGbp(row.finalPayment, { pence: true })}
          emphasize
        />
      </div>
      </div>
    </div>
  );
}

function UnmatchedAbsenceModal({
  item,
  index,
  total,
  employees,
  selectedUid,
  onSelectUid,
  onConfirm,
  onSkip,
  saving,
  error,
}) {
  if (!item) return null;
  const absences = Array.isArray(item.absences) ? item.absences : [];
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="unmatched-absence-title"
        className="w-full max-w-lg rounded-xl border border-[#1a2540] bg-[#0b1220] shadow-2xl"
      >
        <div className="border-b border-[#1a2540] px-5 py-4">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-amber-300/90">
            Unmatched deduction {index + 1} of {total}
          </p>
          <h2 id="unmatched-absence-title" className="mt-1 text-lg font-semibold text-white">
            Map SharePoint employee
          </h2>
          <p className="mt-1 text-sm text-slate-400">
            This SharePoint deduction could not be matched automatically. Choose the portal employee to apply it to.
          </p>
        </div>
        <div className="space-y-4 px-5 py-4">
          <div className="rounded-lg border border-[#1a2540] bg-[#060e1a] px-4 py-3 text-sm">
            <p className="font-medium text-white">{item.sharePointName || 'Unknown name'}</p>
            <p className="mt-0.5 text-slate-400">{item.sharePointEmail || 'No email on SharePoint'}</p>
            <p className="mt-2 text-slate-300">
              {item.absenceCount || absences.length} deduction
              {(item.absenceCount || absences.length) === 1 ? '' : 's'}
              {' · '}
              <span className="text-rose-200 font-medium">{formatGbp(item.totalAmount)}</span> total
            </p>
          </div>
          {absences.length > 0 ? (
            <ul className="max-h-36 overflow-y-auto space-y-1.5 text-xs text-slate-400">
              {absences.map((absence) => {
                const label = absence.recordType === 'lateness'
                  ? (absence.latenessType || absence.disciplinaryReason || 'Lateness')
                  : (absence.absenceReason || 'Absence');
                return (
                  <li
                    key={absence.sharePointItemId}
                    className="flex justify-between gap-3 rounded border border-[#1a2540]/80 px-2.5 py-1.5"
                  >
                    <span>
                      {formatUkDate(absence.absenceDate)}
                      {' · '}
                      {label}
                    </span>
                    <span className="text-slate-300 shrink-0">−{formatGbp(absence.amount)}</span>
                  </li>
                );
              })}
            </ul>
          ) : null}
          <label className="block text-xs text-slate-400">
            Portal employee
            <select
              value={selectedUid}
              onChange={(e) => onSelectUid(e.target.value)}
              className="mt-1.5 w-full bg-[#060e1a] border border-[#1a2540] text-slate-100 text-sm rounded-lg px-3 py-2.5"
            >
              <option value="">Select employee…</option>
              {employees.map((employee) => (
                <option key={employee.uid} value={employee.uid}>
                  {employee.fullName}
                  {employee.email ? ` (${employee.email})` : ''}
                </option>
              ))}
            </select>
          </label>
          {error ? (
            <p className="text-sm text-red-300">{error}</p>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2 border-t border-[#1a2540] px-5 py-4">
          <button
            type="button"
            onClick={onSkip}
            disabled={saving}
            className="px-4 py-2 rounded-lg border border-[#1a2540] text-sm text-slate-300 hover:bg-[#060e1a] disabled:opacity-40"
          >
            Skip for now
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={saving || !selectedUid}
            className="px-4 py-2 rounded-lg bg-indigo-600 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {saving ? 'Saving…' : 'Map & apply'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function BonusDeductions() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [rows, setRows] = useState([]);
  const [amounts, setAmounts] = useState({ written_warning: 50, final_written_warning: 100 });
  const [grandTotal, setGrandTotal] = useState(0);
  const [bonusPaymentsTotal, setBonusPaymentsTotal] = useState(0);
  const [finalPaymentsTotal, setFinalPaymentsTotal] = useState(0);
  const [partTimeCount, setPartTimeCount] = useState(0);
  const [paymentDate, setPaymentDate] = useState('');
  const [paymentRunId, setPaymentRunId] = useState('');
  const [paymentRunName, setPaymentRunName] = useState('');
  const [paymentOfYear, setPaymentOfYear] = useState(1);
  const [paymentOptions, setPaymentOptions] = useState([]);
  const [calculationFrom, setCalculationFrom] = useState('');
  const [calculationTo, setCalculationTo] = useState('');
  const [asOfDate, setAsOfDate] = useState('');
  const [baseBonus, setBaseBonus] = useState(1100);
  const [fullTimeAnnualHours, setFullTimeAnnualHours] = useState(2210);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const [contractFilter, setContractFilter] = useState('all');
  const [onlyWithDeductions, setOnlyWithDeductions] = useState(false);
  const [showExcludedBonus, setShowExcludedBonus] = useState(false);
  const [sortKey, setSortKey] = useState('employeeName');
  const [sortDir, setSortDir] = useState('asc');
  const [expandedUids, setExpandedUids] = useState(() => new Set());
  const [syncingAbsences, setSyncingAbsences] = useState(false);
  const [syncMessage, setSyncMessage] = useState('');
  const [mapEmployees, setMapEmployees] = useState([]);
  const [unmatchedQueue, setUnmatchedQueue] = useState([]);
  const [mapSelectedUid, setMapSelectedUid] = useState('');
  const [mapSaving, setMapSaving] = useState(false);
  const [mapError, setMapError] = useState('');

  const load = useCallback(async (selectedRunId = '') => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams();
      if (selectedRunId) params.set('paymentRunId', selectedRunId);
      const response = await fetch(`/api/getBonusDeductions?${params.toString()}`, { credentials: 'include' });
      const data = (await readJsonResponse(response)) || {};
      if (!response.ok) throw new Error(data.error || 'Failed to load bonus deductions.');
      setRows(Array.isArray(data.rows) ? data.rows : []);
      setAmounts(data.amounts || { written_warning: 50, final_written_warning: 100 });
      setGrandTotal(Number(data.grandTotal) || 0);
      setBonusPaymentsTotal(Number(data.bonusPaymentsTotal) || 0);
      setFinalPaymentsTotal(Number(data.finalPaymentsTotal) || 0);
      setPartTimeCount(Number(data.partTimeCount) || 0);
      setPaymentDate(data.paymentDate || '');
      setPaymentRunId(data.paymentRunId || '');
      setPaymentRunName(data.paymentRunName || '');
      setPaymentOfYear(Number(data.paymentOfYear) === 2 ? 2 : 1);
      setPaymentOptions(Array.isArray(data.paymentOptions) ? data.paymentOptions : []);
      setCalculationFrom(data.calculationFrom || '');
      setCalculationTo(data.calculationTo || '');
      setAsOfDate(data.asOfDate || data.calculationTo || data.paymentDate || '');
      setBaseBonus(Number(data.bonusConfig?.baseBonus) || 1100);
      setFullTimeAnnualHours(Number(data.bonusConfig?.fullTimeAnnualHours) || 2210);
    } catch (err) {
      setError(err.message || 'Failed to load bonus deductions.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const currentUnmatched = unmatchedQueue[0] || null;

  const syncAbsences = async () => {
    if (!paymentRunId) {
      setError('Create and select a scheduled payment first (Bonus payments tab).');
      return;
    }
    setSyncingAbsences(true);
    setSyncMessage('');
    setError('');
    setMapError('');
    try {
      const response = await fetch('/api/syncBonusAbsenceDeductions', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ paymentRunId }),
      });
      const data = (await readJsonResponse(response)) || {};
      if (!response.ok) throw new Error(data.error || 'Failed to sync absences.');
      setMapEmployees(Array.isArray(data.employees) ? data.employees : []);
      const unmatched = Array.isArray(data.unmatched) ? data.unmatched : [];
      setUnmatchedQueue(unmatched);
      setMapSelectedUid('');
      setSyncMessage(
        `SharePoint synced: ${data.applied || 0} applied`
        + (data.appliedAbsences != null ? ` (${data.appliedAbsences || 0} absence, ${data.appliedLateness || 0} lateness)` : '')
        + (data.skippedZeroLoyalty ? `, ${data.skippedZeroLoyalty} zero-loyalty skipped` : '')
        + (unmatched.length ? `, ${unmatched.length} people need mapping` : ''),
      );
      await load(paymentRunId);
    } catch (err) {
      setError(err.message || 'Failed to sync absences.');
    } finally {
      setSyncingAbsences(false);
    }
  };

  const confirmUnmatchedMapping = async () => {
    if (!currentUnmatched || !mapSelectedUid) return;
    setMapSaving(true);
    setMapError('');
    try {
      const response = await fetch('/api/mapBonusSharePointEmployee', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          employeeUid: mapSelectedUid,
          sharePointLookupId: currentUnmatched.sharePointLookupId || '',
          sharePointEmail: currentUnmatched.sharePointEmail || '',
          sharePointName: currentUnmatched.sharePointName || '',
          absences: currentUnmatched.absences || [],
          paymentRunId,
          calculationFrom,
          calculationTo,
          paymentDate,
          paymentRunName,
        }),
      });
      const data = (await readJsonResponse(response)) || {};
      if (!response.ok) throw new Error(data.error || 'Failed to save mapping.');
      setUnmatchedQueue((prev) => prev.slice(1));
      setMapSelectedUid('');
      await load(paymentRunId);
    } catch (err) {
      setMapError(err.message || 'Failed to save mapping.');
    } finally {
      setMapSaving(false);
    }
  };

  const skipUnmatchedMapping = () => {
    setMapError('');
    setMapSelectedUid('');
    setUnmatchedQueue((prev) => prev.slice(1));
  };

  const tableRows = useMemo(() => {
    const needle = search.trim().toLowerCase();
    const filtered = [];

    for (const row of rows) {
      const name = row.employeeName || '';
      const department = row.department || '';
      const email = row.employeeEmail || '';
      const deductions = (row.deductions || []).filter((item) => (
        typeFilter === 'all' || item.outcomePreset === typeFilter
      ));

      if (isDriverTestAccount(row)) continue;
      if (!showExcludedBonus && isExcludedFromBonus(row)) continue;

      if (contractFilter === 'part' && !row.isPartTime) continue;
      if (contractFilter === 'full' && row.isPartTime) continue;

      if (needle) {
        const haystack = `${name} ${department} ${email} ${row.contractType || ''}`.toLowerCase();
        const deductionHay = deductions
          .map((item) => `${item.warningLabel} ${item.reason} ${item.title} ${item.warningTitle}`)
          .join(' ')
          .toLowerCase();
        if (!haystack.includes(needle) && !deductionHay.includes(needle)) continue;
      }

      if (onlyWithDeductions && deductions.length === 0 && !(Number(row.carryForwardIn) > 0)) continue;
      if (typeFilter !== 'all' && deductions.length === 0) continue;

      const periodTotal = deductions
        .filter((item) => item.countsTowardPayment !== false)
        .reduce((sum, item) => sum + (Number(item.amount) || 0), 0);
      const carryIn = Number(row.carryForwardIn) || 0;
      const totalAmount = typeFilter === 'all' && row.totalAmount != null
        ? Number(row.totalAmount) || 0
        : periodTotal + carryIn;
      filtered.push({
        employeeUid: row.employeeUid,
        employeeName: name,
        department,
        startDate: row.startDate || '',
        completedYears: Number(row.bonus?.completedYears) || 0,
        completedMonths: Number(row.bonus?.completedMonths) || 0,
        contractType: row.contractType || '',
        bonusHoursMode: row.bonusHoursMode || '',
        proRataBase: row.proRataBase || row.proRata?.proRataBase || '',
        annualContractedHours: row.annualContractedHours,
        hoursPerWeek: row.hoursPerWeek,
        isPartTime: Boolean(row.isPartTime),
        isFullTime: Boolean(row.isFullTime),
        doesNotPayBonus: Boolean(row.doesNotPayBonus || row.notPaidBonus),
        notPaidBonus: Boolean(row.notPaidBonus || row.doesNotPayBonus),
        proRata: row.proRata || null,
        bonus: row.bonus || null,
        bonusPaymentAmountGross: Number(row.bonusPaymentAmountGross) || 0,
        preDeductionPot: Number(row.preDeductionPot ?? row.bonusPaymentAmount) || 0,
        bonusPaymentAmount: Number(row.preDeductionPot ?? row.bonusPaymentAmount) || 0,
        bonusAccruedPot: Number(row.bonusAccruedPot) || 0,
        annualEntitlement: Number(
          row.annualEntitlement
          ?? ((row.doesNotPayBonus || row.notPaidBonus)
            ? 0
            : (Number(row.preDeductionPot ?? row.bonusPaymentAmount) || 0) * 2),
        ) || 0,
        annualEntitlementGross: Number(row.annualEntitlementGross ?? row.bonusAccruedPot) || 0,
        baseAfterProRata: Number(row.baseAfterProRata) || 0,
        finalPayment: Number(row.finalPayment) || 0,
        periodDeductionTotal: Number(row.periodDeductionTotal ?? periodTotal) || 0,
        carryForwardIn: carryIn,
        carryForwardOut: Number(row.carryForwardOut) || 0,
        writtenOff: Number(row.writtenOff) || 0,
        periodAdditionTotal: Number(row.periodAdditionTotal) || 0,
        paymentOfYear: Number(row.paymentOfYear) === 2 ? 2 : paymentOfYear,
        deductions,
        deductionCount: deductions.length,
        totalAmount,
        latestGivenAt: deductions[0]?.givenAt || '',
      });
    }

    const dir = sortDir === 'asc' ? 1 : -1;
    filtered.sort((left, right) => {
      let leftVal = '';
      let rightVal = '';
      if (sortKey === 'deductionCount') {
        leftVal = left.deductionCount;
        rightVal = right.deductionCount;
      } else if (sortKey === 'totalAmount') {
        leftVal = left.totalAmount;
        rightVal = right.totalAmount;
      } else if (sortKey === 'preDeductionPot' || sortKey === 'bonusPaymentAmount') {
        leftVal = left.preDeductionPot;
        rightVal = right.preDeductionPot;
      } else if (sortKey === 'annualEntitlement') {
        leftVal = left.annualEntitlement;
        rightVal = right.annualEntitlement;
      } else if (sortKey === 'finalPayment') {
        leftVal = left.finalPayment;
        rightVal = right.finalPayment;
      } else if (sortKey === 'startDate') {
        leftVal = left.startDate || '';
        rightVal = right.startDate || '';
      } else if (sortKey === 'completedYears' || sortKey === 'completedMonths') {
        leftVal = left.startDate ? (Number(left.completedMonths) || 0) : -1;
        rightVal = right.startDate ? (Number(right.completedMonths) || 0) : -1;
      } else if (sortKey === 'contract') {
        leftVal = left.isPartTime ? 1 : 0;
        rightVal = right.isPartTime ? 1 : 0;
      } else if (sortKey === 'givenAt') {
        leftVal = left.latestGivenAt || '';
        rightVal = right.latestGivenAt || '';
      } else {
        leftVal = String(left.employeeName || '').toLowerCase();
        rightVal = String(right.employeeName || '').toLowerCase();
      }
      if (leftVal < rightVal) return -1 * dir;
      if (leftVal > rightVal) return 1 * dir;
      return String(left.employeeName || '').localeCompare(String(right.employeeName || ''));
    });

    return filtered;
  }, [rows, search, typeFilter, contractFilter, onlyWithDeductions, showExcludedBonus, sortKey, sortDir, paymentOfYear]);

  const filteredTotal = useMemo(
    () => tableRows.reduce((sum, row) => sum + (Number(row.totalAmount) || 0), 0),
    [tableRows],
  );

  const filteredBonusTotal = useMemo(
    () => tableRows.reduce((sum, row) => sum + (Number(row.preDeductionPot) || 0), 0),
    [tableRows],
  );

  const filteredFinalTotal = useMemo(
    () => tableRows.reduce((sum, row) => sum + (Number(row.finalPayment) || 0), 0),
    [tableRows],
  );

  /** Totals for staff who actually receive bonus (excludes zero-hours / does-not-pay / test accounts). */
  const bonusEligibleRows = useMemo(
    () => rows.filter((row) => !isDriverTestAccount(row) && !isExcludedFromBonus(row)),
    [rows],
  );
  const eligibleDeductionTotal = useMemo(
    () => bonusEligibleRows.reduce((sum, row) => sum + (Number(row.totalAmount) || 0), 0),
    [bonusEligibleRows],
  );
  const eligibleBonusTotal = useMemo(
    () => bonusEligibleRows.reduce((sum, row) => sum + (Number(row.preDeductionPot) || 0), 0),
    [bonusEligibleRows],
  );
  const eligibleFinalTotal = useMemo(
    () => bonusEligibleRows.reduce((sum, row) => sum + (Number(row.finalPayment) || 0), 0),
    [bonusEligibleRows],
  );
  const hiddenNoBonusDeductions = useMemo(() => (
    rows
      .filter((row) => (
        !isDriverTestAccount(row)
        && isExcludedFromBonus(row)
        && ((Number(row.totalAmount) || 0) > 0 || (row.deductions || []).length > 0)
      ))
      .map((row) => ({
        employeeUid: row.employeeUid,
        employeeName: row.employeeName || 'Unknown',
        totalAmount: Number(row.totalAmount) || 0,
        deductionCount: (row.deductions || []).length,
      }))
      .sort((a, b) => b.totalAmount - a.totalAmount)
  ), [rows]);
  const hiddenNoBonusTotal = useMemo(
    () => hiddenNoBonusDeductions.reduce((sum, row) => sum + (Number(row.totalAmount) || 0), 0),
    [hiddenNoBonusDeductions],
  );
  const filtersNarrowTable = filteredTotal !== eligibleDeductionTotal
    || filteredBonusTotal !== eligibleBonusTotal
    || filteredFinalTotal !== eligibleFinalTotal;

  const toggleSort = (key) => {
    if (sortKey === key) {
      setSortDir((prev) => (prev === 'asc' ? 'desc' : 'asc'));
      return;
    }
    setSortKey(key);
    setSortDir(key === 'employeeName' || key === 'startDate' ? 'asc' : 'desc');
  };

  const toggleExpanded = (uid) => {
    setExpandedUids((prev) => {
      const next = new Set(prev);
      if (next.has(uid)) next.delete(uid);
      else next.add(uid);
      return next;
    });
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-8 py-5 border-b border-[#1a2540] gap-3 flex-wrap">
        <div>
          <button
            type="button"
            onClick={() => navigate('/dashboard/hr/employees')}
            className="text-xs text-slate-500 hover:text-slate-300 mb-1"
          >
            ← Employees
          </button>
          <h1 className="text-xl font-semibold text-white">Bonus deductions</h1>
          <p className="text-sm text-slate-400 mt-1">
            Select a scheduled payment to load deductions for its calculation period. Bonus and service length are calculated as of the period
            <span className="text-slate-300"> to </span>
            date. Manage schedules on the Bonus payments tab. Base {formatGbp(baseBonus)}.
          </p>
          {syncMessage ? (
            <p className="text-sm text-emerald-300/90 mt-2">{syncMessage}</p>
          ) : null}
          {!loading && !error && (
            <div className="text-sm text-white mt-2 space-y-1">
              <p>
                {paymentRunName ? (
                  <>
                    Payment:{' '}
                    <span className="font-semibold text-indigo-200">{paymentRunName}</span>
                    {' · '}
                  </>
                ) : null}
                Pay date:{' '}
                <span className="font-semibold text-indigo-200">{formatUkDate(paymentDate)}</span>
                {calculationFrom && calculationTo ? (
                  <>
                    {' · '}
                    Calc:{' '}
                    <span className="font-semibold text-indigo-200">
                      {formatUkDate(calculationFrom)} – {formatUkDate(calculationTo)}
                    </span>
                  </>
                ) : null}
                {asOfDate ? (
                  <>
                    {' · '}
                    As of:{' '}
                    <span className="font-semibold text-indigo-200">{formatUkDate(asOfDate)}</span>
                  </>
                ) : null}
                {' · '}
                Rata staff:{' '}
                <span className="font-semibold text-amber-200">{partTimeCount}</span>
              </p>
              <p>
                Pre-deduction pots:{' '}
                <span className="font-semibold text-indigo-200">{formatGbp(eligibleBonusTotal, { pence: true })}</span>
                {filtersNarrowTable ? (
                  <span className="text-slate-400 font-normal">
                    {' '}(visible {formatGbp(filteredBonusTotal, { pence: true })})
                  </span>
                ) : null}
                {' · '}
                Deductions:{' '}
                <span className="font-semibold text-indigo-200">{formatGbp(eligibleDeductionTotal)}</span>
                {filtersNarrowTable ? (
                  <span className="text-slate-400 font-normal">
                    {' '}(visible {formatGbp(filteredTotal)})
                  </span>
                ) : null}
                {' · '}
                Final payments:{' '}
                <span className="font-semibold text-emerald-200">{formatGbp(eligibleFinalTotal, { pence: true })}</span>
                {filtersNarrowTable ? (
                  <span className="text-slate-400 font-normal">
                    {' '}(visible {formatGbp(filteredFinalTotal, { pence: true })})
                  </span>
                ) : null}
              </p>
              {hiddenNoBonusTotal > 0 ? (
                <p className="text-amber-200/90">
                  {formatGbp(hiddenNoBonusTotal)} on no-bonus / zero-hours staff
                  {hiddenNoBonusDeductions.length === 1
                    ? ` (${hiddenNoBonusDeductions[0].employeeName})`
                    : ` (${hiddenNoBonusDeductions.length} people)`}
                  {' — '}
                  <button
                    type="button"
                    onClick={() => setShowExcludedBonus(true)}
                    className="underline hover:text-amber-100"
                  >
                    show no-bonus staff
                  </button>
                  {' '}(listed only; not taken from a payment).
                </p>
              ) : null}
            </div>
          )}
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <label className="flex items-center gap-2 text-xs text-slate-400">
            Payment
            <select
              value={paymentRunId || ''}
              onChange={(e) => {
                const next = e.target.value;
                if (next) load(next);
              }}
              className="bg-[#060e1a] border border-[#1a2540] text-slate-100 text-sm rounded-lg px-3 py-2.5 min-w-[14rem]"
              aria-label="Scheduled bonus payment"
            >
              {paymentOptions.length === 0 ? (
                <option value="">No scheduled payments</option>
              ) : null}
              {paymentOptions.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label || option.name}
                  {Number(option.paymentOfYear) === 2 ? ' · P2' : ' · P1'}
                  {option.paymentDate || option.date
                    ? ` · pay ${formatUkDate(option.paymentDate || option.date)}`
                    : ''}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            onClick={() => navigate('/dashboard/hr/bonus-payments')}
            className="px-4 py-2.5 rounded-lg border border-[#1a2540] text-sm font-medium text-slate-200 hover:bg-[#0b1220]"
          >
            Manage payments
          </button>
          <button
            type="button"
            onClick={syncAbsences}
            disabled={syncingAbsences || !paymentRunId}
            className="px-4 py-2.5 rounded-lg bg-indigo-600 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {syncingAbsences ? 'Syncing SharePoint…' : 'Sync SharePoint'}
          </button>
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search employees…"
            className="w-full sm:w-56 bg-[#060e1a] border border-[#1a2540] text-slate-100 text-sm rounded-lg px-4 py-2.5 focus:outline-none focus:border-indigo-500/60"
          />
          <select
            value={contractFilter}
            onChange={(e) => setContractFilter(e.target.value)}
            className="bg-[#060e1a] border border-[#1a2540] text-slate-100 text-sm rounded-lg px-3 py-2.5"
          >
            <option value="all">All contracts</option>
            <option value="full">Full-time only</option>
            <option value="part">Rata only</option>
          </select>
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="bg-[#060e1a] border border-[#1a2540] text-slate-100 text-sm rounded-lg px-3 py-2.5"
          >
            <option value="all">All deduction types</option>
            <option value="written_warning">Written warning ({formatGbp(amounts.written_warning)})</option>
            <option value="final_written_warning">Final written warning ({formatGbp(amounts.final_written_warning)})</option>
            <option value="absence">Absence (SharePoint)</option>
            <option value="lateness">Lateness / missed clock (SharePoint)</option>
            <option value="manual_deduction">Manual deduction</option>
            <option value="manual_addition">Manual addition</option>
          </select>
          <button
            type="button"
            onClick={() => setOnlyWithDeductions((prev) => !prev)}
            className={`px-4 py-2.5 rounded-lg border text-sm font-medium transition-colors ${
              onlyWithDeductions
                ? 'border-indigo-500/50 bg-indigo-500/15 text-indigo-200'
                : 'border-[#1a2540] text-slate-200 hover:bg-[#0b1220]'
            }`}
          >
            {onlyWithDeductions ? 'Showing staff with deductions only' : 'Only show staff with deductions'}
          </button>
          <button
            type="button"
            onClick={() => setShowExcludedBonus((prev) => !prev)}
            className={`px-4 py-2.5 rounded-lg border text-sm font-medium transition-colors ${
              showExcludedBonus
                ? 'border-amber-500/50 bg-amber-500/15 text-amber-200'
                : 'border-[#1a2540] text-slate-200 hover:bg-[#0b1220]'
            }`}
          >
            {showExcludedBonus ? 'Showing no-bonus staff' : 'Show no-bonus staff'}
          </button>
          <button
            type="button"
            onClick={() => downloadBonusDeductionsCsv(tableRows, paymentDate)}
            disabled={loading || tableRows.length === 0}
            className="px-4 py-2.5 rounded-lg border border-[#1a2540] text-sm font-medium text-slate-200 hover:bg-[#0b1220] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            Export to Excel
          </button>
        </div>
      </div>

      <div className="p-8 overflow-auto space-y-4">
        {error && (
          <div className="bg-red-500/10 border border-red-500/25 rounded-lg p-4 text-sm text-red-300">{error}</div>
        )}
        {loading ? (
          <p className="text-sm text-slate-400">Loading bonus deductions…</p>
        ) : (
          <div className="rounded-xl border border-[#1a2540] bg-[#0b1220] overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-[#1a2540] bg-[#060e1a]/70">
                    <th className="px-5 py-3 text-left">
                      <SortHeader
                        label="Employee"
                        active={sortKey === 'employeeName'}
                        direction={sortDir}
                        onClick={() => toggleSort('employeeName')}
                      />
                    </th>
                    <th className="px-5 py-3 text-left">
                      <SortHeader
                        label="Contract"
                        active={sortKey === 'contract'}
                        direction={sortDir}
                        onClick={() => toggleSort('contract')}
                      />
                    </th>
                    <th className="px-5 py-3 text-left">
                      <SortHeader
                        label="Start date"
                        active={sortKey === 'startDate'}
                        direction={sortDir}
                        onClick={() => toggleSort('startDate')}
                      />
                    </th>
                    <th className="px-5 py-3 text-left">
                      <SortHeader
                        label="Service"
                        active={sortKey === 'completedMonths'}
                        direction={sortDir}
                        onClick={() => toggleSort('completedMonths')}
                      />
                    </th>
                    <th className="px-5 py-3 text-left">
                      <SortHeader
                        label="Annual entitlement"
                        active={sortKey === 'annualEntitlement'}
                        direction={sortDir}
                        onClick={() => toggleSort('annualEntitlement')}
                      />
                    </th>
                    <th className="px-5 py-3 text-left">
                      <SortHeader
                        label="Pre-deduction pot"
                        active={sortKey === 'preDeductionPot'}
                        direction={sortDir}
                        onClick={() => toggleSort('preDeductionPot')}
                      />
                    </th>
                    <th className="px-5 py-3 text-left">
                      <SortHeader
                        label="Deductions"
                        active={sortKey === 'totalAmount'}
                        direction={sortDir}
                        onClick={() => toggleSort('totalAmount')}
                      />
                    </th>
                    <th className="px-5 py-3 text-left">
                      <SortHeader
                        label="Final payment"
                        active={sortKey === 'finalPayment'}
                        direction={sortDir}
                        onClick={() => toggleSort('finalPayment')}
                      />
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#1a2540]">
                  {tableRows.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="px-5 py-6 text-sm text-slate-500">
                        No employees match the current filters.
                      </td>
                    </tr>
                  ) : tableRows.map((row) => {
                    const open = expandedUids.has(row.employeeUid);
                    return (
                      <Fragment key={row.employeeUid}>
                        <tr
                          className="hover:bg-[#060e1a]/40 cursor-pointer"
                          onClick={() => toggleExpanded(row.employeeUid)}
                        >
                          <td className="px-5 py-4 text-sm">
                            <div className="flex items-start gap-2">
                              <span className="mt-0.5 p-0.5">
                                <ChevronIcon open={open} />
                              </span>
                              <div>
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    navigate(`/dashboard/hr/employees/${row.employeeUid}`);
                                  }}
                                  className="text-left font-medium text-white hover:text-indigo-300"
                                >
                                  {row.employeeName || '—'}
                                </button>
                                {row.department ? (
                                  <p className="text-xs text-slate-500 mt-0.5">{row.department}</p>
                                ) : null}
                              </div>
                            </div>
                          </td>
                          <td className="px-5 py-4 text-sm">
                            <ContractBadge row={row} />
                            {row.contractType ? (
                              <p className="text-[10px] text-slate-500 mt-1">{row.contractType}</p>
                            ) : null}
                          </td>
                          <td className="px-5 py-4 text-sm text-slate-300">
                            {row.startDate ? formatUkDate(row.startDate) : (
                              <span className="text-amber-300">Missing start date</span>
                            )}
                          </td>
                          <td className="px-5 py-4 text-sm text-slate-300">
                            {row.startDate ? (
                              formatServiceLength(row.completedMonths)
                            ) : (
                              <span className="text-slate-500">—</span>
                            )}
                          </td>
                          <td className="px-5 py-4 text-sm">
                            {row.startDate ? (
                              <AnnualEntitlementHover row={row} fullTimeAnnualHours={fullTimeAnnualHours}>
                                <p className="text-white font-medium">
                                  {formatGbp(row.annualEntitlement, { pence: true })}
                                </p>
                              </AnnualEntitlementHover>
                            ) : (
                              <span className="text-slate-500">—</span>
                            )}
                          </td>
                          <td className="px-5 py-4 text-sm">
                            {row.startDate ? (
                              <div>
                                <p className="text-white font-medium">
                                  {formatGbp(row.preDeductionPot, { pence: true })}
                                </p>
                                {row.doesNotPayBonus || row.notPaidBonus || isZeroHoursContractMode(row.bonusHoursMode) ? (
                                  <p className="text-xs text-rose-300 mt-0.5">Excluded from bonus</p>
                                ) : row.proRata?.missingHours ? (
                                  <p className="text-xs text-amber-300 mt-0.5">Hours needed on profile</p>
                                ) : null}
                              </div>
                            ) : (
                              <span className="text-slate-500">—</span>
                            )}
                          </td>
                          <td className="px-5 py-4 text-sm">
                            {row.deductionCount > 0 ? (
                              <div>
                                <span className="text-white font-medium">{formatGbp(row.totalAmount)}</span>
                                <span className="block text-xs text-slate-500 mt-0.5">
                                  {row.deductionCount === 1
                                    ? '1 deduction'
                                    : `${row.deductionCount} deductions`}
                                </span>
                              </div>
                            ) : (
                              <span className="text-slate-500 italic">None</span>
                            )}
                          </td>
                          <td className="px-5 py-4 text-sm">
                            <p className="text-emerald-200 font-semibold">
                              {row.startDate ? formatGbp(row.finalPayment, { pence: true }) : '—'}
                            </p>
                            {row.totalAmount > 0 && row.startDate ? (
                              <p className="text-xs text-slate-500 mt-0.5">
                                {formatGbp(row.preDeductionPot, { pence: true })} − {formatGbp(row.totalAmount)}
                              </p>
                            ) : null}
                          </td>
                        </tr>
                        {open ? (
                          <tr>
                            <td colSpan={8} className="p-0">
                              <EmployeeBreakdown
                                row={row}
                                fullTimeAnnualHours={fullTimeAnnualHours}
                                paymentRunId={paymentRunId}
                                paymentRunName={paymentRunName}
                                paymentDate={paymentDate}
                                paymentOfYear={paymentOfYear}
                                calculationFrom={calculationFrom}
                                calculationTo={calculationTo}
                                asOfDate={asOfDate}
                                onAdjustmentsChanged={() => load(paymentRunId)}
                                onOpenCase={(caseId) => navigate(`/dashboard/hr/cases/${caseId}`)}
                              />
                            </td>
                          </tr>
                        ) : null}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      <UnmatchedAbsenceModal
        item={currentUnmatched}
        index={0}
        total={unmatchedQueue.length}
        employees={mapEmployees}
        selectedUid={mapSelectedUid}
        onSelectUid={setMapSelectedUid}
        onConfirm={confirmUnmatchedMapping}
        onSkip={skipUnmatchedMapping}
        saving={mapSaving}
        error={mapError}
      />
    </div>
  );
}
