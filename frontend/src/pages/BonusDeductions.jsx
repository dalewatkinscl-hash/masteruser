import { useCallback, useEffect, useMemo, useState, Fragment } from 'react';
import { useNavigate } from 'react-router-dom';
import { readJsonResponse } from '../utils/employeeProfile';

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

function ContractBadge({ row }) {
  if (row.isPartTime) {
    const annual = row.annualContractedHours || row.proRata?.annualContractedHours;
    const missing = row.proRata?.missingHours;
    return (
      <span className="inline-flex items-center gap-1.5">
        <span className="rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide bg-amber-500/15 text-amber-200 border border-amber-500/30">
          Part-time
        </span>
        {missing ? (
          <span className="text-[10px] text-amber-300">set annual hours</span>
        ) : annual ? (
          <span className="text-[10px] text-slate-500">{annual} hrs/yr</span>
        ) : null}
      </span>
    );
  }
  return (
    <span className="rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide bg-slate-500/15 text-slate-300 border border-slate-500/25">
      Full-time
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

function EmployeeBreakdown({ row, fullTimeAnnualHours, onOpenCase }) {
  const bonus = row.bonus || {};
  const proRata = row.proRata || {};
  const showProRata = Boolean(row.isPartTime);
  const factorPct = Number.isFinite(Number(proRata.factor))
    ? `${(Number(proRata.factor) * 100).toFixed(2)}%`
    : '—';
  const annual = proRata.annualContractedHours || row.annualContractedHours || '—';
  const denominator = proRata.fullTimeAnnualHours || fullTimeAnnualHours;
  const halfYear = formatGbp(row.bonusPaymentAmountGross ?? bonus.paymentAmount, { pence: true });
  const preDeduction = formatGbp(row.preDeductionPot, { pence: true });

  return (
    <div className="grid gap-6 md:grid-cols-2 px-5 py-4 bg-[#060e1a]/80 border-t border-[#1a2540]">
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
            value={formatGbp(bonus.loyaltyBonus, { pence: true })}
          />
        ) : (
          <BreakdownRow
            label={`Service (${bonus.completedMonths || 0} full months)`}
            value={`${bonus.completedMonths || 0} / 12 of year`}
            muted
          />
        )}
        <BreakdownRow
          label="Accrued pot (base + loyalty)"
          value={formatGbp(bonus.accruedPot, { pence: true })}
        />
        <BreakdownRow
          label={showProRata ? 'Half-year payment (before pro-rata)' : 'Half-year payment'}
          value={halfYear}
        />
        {showProRata ? (
          <>
            <BreakdownRow
              label={`Annual contracted hours ÷ FT (${denominator})`}
              value={`${annual} ÷ ${denominator} = ${factorPct}`}
            />
            {proRata.calculation ? (
              <p className="text-[11px] text-slate-500 mt-2">{proRata.calculation}</p>
            ) : null}
            {proRata.missingHours ? (
              <p className="text-[11px] text-amber-300 mt-2">
                Part-time — add annual contracted hours on the employee profile to pro-rata.
              </p>
            ) : null}
            <BreakdownRow
              label="Pre-deduction pot"
              value={`${halfYear} × ${factorPct} = ${preDeduction}`}
              emphasize
            />
          </>
        ) : (
          <BreakdownRow
            label="Pre-deduction pot"
            value={preDeduction}
            emphasize
          />
        )}
      </div>
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-widest text-slate-500 mb-2">
          Deductions ({row.deductionCount || 0})
        </p>
        {row.deductions.length === 0 ? (
          <p className="text-sm text-slate-500 italic py-2">No warning deductions for this employee.</p>
        ) : (
          <ul className="space-y-2 mb-3">
            {row.deductions.map((item) => {
              const inactive = item.countsTowardPayment === false;
              return (
                <li
                  key={`${row.employeeUid}-${item.caseId}`}
                  className="rounded-lg border border-[#1a2540] bg-[#0b1220] px-3 py-2"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
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
                      {item.reason ? (
                        <p className="text-xs text-slate-500 mt-0.5">{item.reason}</p>
                      ) : null}
                      <p className="text-[11px] text-slate-500 mt-1">
                        {formatUkDate(item.givenAt)}
                        {item.superseded ? ' · Superseded' : ''}
                        {item.cleared ? ' · Cleared' : ''}
                        {inactive ? ' · not taken from payment' : ''}
                      </p>
                    </div>
                    <span className={`text-sm font-medium whitespace-nowrap ${inactive ? 'text-slate-500 line-through' : 'text-rose-200'}`}>
                      −{formatGbp(item.amount)}
                    </span>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
        <BreakdownRow
          label="Deduction total (applied)"
          value={formatGbp(row.totalAmount)}
        />
        <BreakdownRow
          label="Final payment"
          value={formatGbp(row.finalPayment, { pence: true })}
          emphasize
        />
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
  const [paymentOptions, setPaymentOptions] = useState([]);
  const [baseBonus, setBaseBonus] = useState(1100);
  const [fullTimeAnnualHours, setFullTimeAnnualHours] = useState(2210);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const [contractFilter, setContractFilter] = useState('all');
  const [onlyWithDeductions, setOnlyWithDeductions] = useState(false);
  const [sortKey, setSortKey] = useState('employeeName');
  const [sortDir, setSortDir] = useState('asc');
  const [expandedUids, setExpandedUids] = useState(() => new Set());

  const load = useCallback(async (selectedPaymentDate = '') => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams();
      if (selectedPaymentDate) params.set('paymentDate', selectedPaymentDate);
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
      setPaymentOptions(Array.isArray(data.paymentOptions) ? data.paymentOptions : []);
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

      if (onlyWithDeductions && deductions.length === 0) continue;
      if (typeFilter !== 'all' && deductions.length === 0) continue;

      const totalAmount = deductions
        .filter((item) => item.countsTowardPayment !== false)
        .reduce((sum, item) => sum + (Number(item.amount) || 0), 0);
      filtered.push({
        employeeUid: row.employeeUid,
        employeeName: name,
        department,
        startDate: row.startDate || '',
        contractType: row.contractType || '',
        annualContractedHours: row.annualContractedHours,
        hoursPerWeek: row.hoursPerWeek,
        isPartTime: Boolean(row.isPartTime),
        isFullTime: Boolean(row.isFullTime),
        proRata: row.proRata || null,
        bonus: row.bonus || null,
        bonusPaymentAmountGross: Number(row.bonusPaymentAmountGross) || 0,
        preDeductionPot: Number(row.preDeductionPot ?? row.bonusPaymentAmount) || 0,
        bonusPaymentAmount: Number(row.preDeductionPot ?? row.bonusPaymentAmount) || 0,
        bonusAccruedPot: Number(row.bonusAccruedPot) || 0,
        finalPayment: Number(row.finalPayment) || 0,
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
      } else if (sortKey === 'finalPayment') {
        leftVal = left.finalPayment;
        rightVal = right.finalPayment;
      } else if (sortKey === 'startDate') {
        leftVal = left.startDate || '';
        rightVal = right.startDate || '';
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
  }, [rows, search, typeFilter, contractFilter, onlyWithDeductions, sortKey, sortDir]);

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
            Pre-deduction pot uses annual contracted hours ÷ {fullTimeAnnualHours} (42.5h × 52 weeks), then warning deductions, then final payment.
            Expand any row for the full breakdown. Base {formatGbp(baseBonus)}.
          </p>
          {!loading && !error && (
            <div className="text-sm text-white mt-2 space-y-1">
              <p>
                Payment date:{' '}
                <span className="font-semibold text-indigo-200">{formatUkDate(paymentDate)}</span>
                {' · '}
                Part-time staff:{' '}
                <span className="font-semibold text-amber-200">{partTimeCount}</span>
              </p>
              <p>
                Pre-deduction pots:{' '}
                <span className="font-semibold text-indigo-200">{formatGbp(bonusPaymentsTotal, { pence: true })}</span>
                {filteredBonusTotal !== bonusPaymentsTotal ? (
                  <span className="text-slate-400 font-normal">
                    {' '}(filtered {formatGbp(filteredBonusTotal, { pence: true })})
                  </span>
                ) : null}
                {' · '}
                Deductions:{' '}
                <span className="font-semibold text-indigo-200">{formatGbp(grandTotal)}</span>
                {filteredTotal !== grandTotal ? (
                  <span className="text-slate-400 font-normal">
                    {' '}(filtered {formatGbp(filteredTotal)})
                  </span>
                ) : null}
                {' · '}
                Final payments:{' '}
                <span className="font-semibold text-emerald-200">{formatGbp(finalPaymentsTotal, { pence: true })}</span>
                {filteredFinalTotal !== finalPaymentsTotal ? (
                  <span className="text-slate-400 font-normal">
                    {' '}(filtered {formatGbp(filteredFinalTotal, { pence: true })})
                  </span>
                ) : null}
              </p>
            </div>
          )}
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <select
            value={paymentDate}
            onChange={(e) => load(e.target.value)}
            className="bg-[#060e1a] border border-[#1a2540] text-slate-100 text-sm rounded-lg px-3 py-2.5"
            aria-label="Bonus payment date"
          >
            {paymentOptions.length === 0 && paymentDate ? (
              <option value={paymentDate}>{formatUkDate(paymentDate)}</option>
            ) : null}
            {paymentOptions.map((option) => (
              <option key={option.date} value={option.date}>
                {option.label ? `${option.label} ${option.date.slice(0, 4)}` : formatUkDate(option.date)}
              </option>
            ))}
          </select>
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
            <option value="part">Part-time only</option>
          </select>
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="bg-[#060e1a] border border-[#1a2540] text-slate-100 text-sm rounded-lg px-3 py-2.5"
          >
            <option value="all">All deduction types</option>
            <option value="written_warning">Written warning ({formatGbp(amounts.written_warning)})</option>
            <option value="final_written_warning">Final written warning ({formatGbp(amounts.final_written_warning)})</option>
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
                      <td colSpan={6} className="px-5 py-6 text-sm text-slate-500">
                        No employees match the current filters.
                      </td>
                    </tr>
                  ) : tableRows.map((row) => {
                    const open = expandedUids.has(row.employeeUid);
                    const factor = Number(row.proRata?.factor);
                    const showProRata = row.isPartTime && Number.isFinite(factor) && factor < 0.999;
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
                          <td className="px-5 py-4 text-sm">
                            {row.startDate ? (
                              <div>
                                <p className="text-white font-medium">
                                  {formatGbp(row.preDeductionPot, { pence: true })}
                                </p>
                                <p className="text-xs text-slate-500 mt-0.5">
                                  {showProRata ? (
                                    <span className="text-amber-300">
                                      × {(factor * 100).toFixed(1)}% pro-rata
                                    </span>
                                  ) : (
                                    <>pot {formatGbp(row.bonusAccruedPot, { pence: true })} ÷ 2</>
                                  )}
                                  {row.proRata?.missingHours ? (
                                    <span className="text-amber-300"> · hours needed</span>
                                  ) : null}
                                </p>
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
                            <td colSpan={6} className="p-0">
                              <EmployeeBreakdown
                                row={row}
                                fullTimeAnnualHours={fullTimeAnnualHours}
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
    </div>
  );
}
