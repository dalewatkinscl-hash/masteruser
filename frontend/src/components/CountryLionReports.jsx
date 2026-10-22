import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
  ZAxis,
} from 'recharts';
import { FILTER_PERIODS, formatGbp, formatInt, formatPct, formatUkDate } from '../lib/financeFormat';

const TABS = [
  { id: 'private-hire', label: 'Private Hire' },
  { id: 'contracts', label: 'Contracts' },
  { id: 'by-vehicle', label: 'By vehicle' },
  { id: 'utilisation', label: 'Vehicle utilisation' },
  { id: 'by-driver', label: 'By driver' },
  { id: 'by-job-type', label: 'By job type' },
  { id: 'acceptance', label: 'Acceptance' },
  { id: 'customers', label: 'Customers' },
];

const TRIP_SCOPES = [
  { id: 'both', label: 'Both' },
  { id: 'privateHire', label: 'Private Hire' },
  { id: 'contracts', label: 'Contracts' },
];

export default function CountryLionReports() {
  const [tab, setTab] = useState('private-hire');
  const [period, setPeriod] = useState('12m');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [depot, setDepot] = useState('All');
  const [segment, setSegment] = useState('All');
  const [state, setState] = useState({ status: 'loading' });
  const requestId = useRef(0);

  const load = useCallback(async () => {
    const id = ++requestId.current;
    setState((prev) => ({
      status: 'loading',
      data: prev.data,
    }));

    try {
      const params = new URLSearchParams({ period, depot, segment });
      if (period === 'custom') {
        if (fromDate) params.set('from', fromDate);
        if (toDate) params.set('to', toDate);
      }
      const res = await fetch(`/api/getFinanceReports?${params.toString()}`, {
        credentials: 'include',
        cache: 'no-store',
      });
      const json = await res.json().catch(() => ({}));
      if (id !== requestId.current) return;

      if (res.status === 403) {
        setState({
          status: 'denied',
          message: json.error || 'You do not have access to Country Lion Reports.',
        });
        return;
      }

      if (!res.ok || !json.ok || !json.data) {
        setState((prev) => ({
          status: 'error',
          message: json.error || 'Could not load finance data.',
          data: prev.data,
        }));
        return;
      }

      const data = json.data;
      const vehicleRev = data.byVehicle?.scopes?.both?.kpis?.revenue
        ?? data.byVehicle?.kpis?.revenue
        ?? 0;
      const empty =
        data.privateHire.kpis.revenue === 0
        && data.contracts.kpis.revenue === 0
        && vehicleRev === 0;
      setState(empty ? { status: 'empty', data } : { status: 'ready', data });
    } catch {
      if (id !== requestId.current) return;
      setState((prev) => ({
        status: 'error',
        message: 'Network error while loading Country Lion Reports.',
        data: prev.data,
      }));
    }
  }, [period, depot, segment, fromDate, toDate]);

  useEffect(() => {
    void load();
  }, [load]);

  const data = state.data;
  const displayFrom = period === 'custom' ? fromDate : data?.dateRange?.from || fromDate;
  const displayTo = period === 'custom' ? toDate : data?.dateRange?.to || toDate;
  const depots = data?.depots ?? [];
  const segments = data?.segments ?? [];
  const showInitialLoading = state.status === 'loading' && !data;

  const rangeHint = useMemo(() => {
    if (!displayFrom || !displayTo) return null;
    return `Trip dates: ${formatUkDate(displayFrom)} → ${formatUkDate(displayTo)}`;
  }, [displayFrom, displayTo]);

  function handlePeriodChange(next) {
    if (next === 'custom') {
      setFromDate(displayFrom || data?.dateRange?.from || '');
      setToDate(displayTo || data?.dateRange?.to || '');
    }
    setPeriod(next);
  }

  if (state.status === 'denied') {
    return <AccessDenied message={state.message} />;
  }

  return (
    <div className="cl-reports space-y-8">
      <header className="space-y-5">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-3xl sm:text-4xl font-semibold tracking-tight text-base-content">
              Country Lion Reports
            </p>
            <h1 className="mt-1 text-base sm:text-lg text-base-content/70 font-medium">
              Finance director view for coach hire
            </h1>
            <p className="mt-2 max-w-2xl text-sm text-base-content/60 leading-relaxed">
              Private hire, contracts, revenue by coach (vehicle), and revenue by driver — without Power BI.
            </p>
          </div>
          {data ? (
            <span className="badge badge-outline gap-1 py-3 px-3 text-xs font-normal">
              {data.source === 'redshift' ? 'Live Redshift' : 'Mock data'}
              {' · '}
              {data.currency}
              {state.status === 'loading' ? ' · refreshing…' : ''}
            </span>
          ) : null}
        </div>

        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
            <FieldSelect
              label="Quick range"
              value={period}
              onChange={handlePeriodChange}
              options={FILTER_PERIODS}
            />
            <FieldDate
              label="From"
              value={displayFrom}
              onChange={(v) => {
                setPeriod('custom');
                setFromDate(v);
                if (!toDate && displayTo) setToDate(displayTo);
              }}
              max={displayTo || undefined}
            />
            <FieldDate
              label="To"
              value={displayTo}
              onChange={(v) => {
                setPeriod('custom');
                setToDate(v);
                if (!fromDate && displayFrom) setFromDate(displayFrom);
              }}
              min={displayFrom || undefined}
            />
            <FieldSelect
              label="Depot"
              value={depot}
              onChange={setDepot}
              options={[
                { value: 'All', label: 'All depots' },
                ...depots.map((d) => ({ value: d, label: d })),
              ]}
            />
            <FieldSelect
              label="Customer segment"
              value={segment}
              onChange={setSegment}
              options={[
                { value: 'All', label: 'All segments' },
                ...segments.map((s) => ({ value: s, label: s })),
              ]}
            />
            <button type="button" className="btn btn-outline btn-sm" onClick={() => void load()}>
              Refresh
            </button>
          </div>
          {rangeHint ? <p className="text-xs text-base-content/50">{rangeHint}</p> : null}
        </div>

        {data?.comparisons ? <ComparisonStrip comparisons={data.comparisons} /> : null}

        <nav className="flex flex-wrap gap-1 border-b border-base-300 pb-px" aria-label="Revenue views">
          {TABS.map((t) => {
            const active = tab === t.id;
            return (
              <button
                key={t.id}
                type="button"
                data-tab={t.id}
                onClick={() => setTab(t.id)}
                className={
                  active
                    ? 'rounded-t-lg border border-b-0 border-base-300 bg-base-100 px-4 py-2 text-sm font-medium text-base-content'
                    : 'rounded-t-lg px-4 py-2 text-sm font-medium text-base-content/55 hover:text-base-content'
                }
              >
                {t.label}
              </button>
            );
          })}
        </nav>
      </header>

      {showInitialLoading ? <LoadingState /> : null}
      {state.status === 'error' && !data ? (
        <ErrorState message={state.message} onRetry={() => void load()} />
      ) : null}
      {state.status === 'empty' && data ? (
        <EmptyState note={data.note} onRetry={() => void load()} />
      ) : null}

      {data && (state.status === 'ready' || state.status === 'loading' || state.status === 'error') ? (
        <TabPanel data={data} tab={tab} />
      ) : null}
    </div>
  );
}

export function AccessDenied({ message }) {
  return (
    <div
      className="rounded-xl border border-base-300 bg-base-200/60 px-6 py-10 max-w-xl"
      data-testid="reports-access-denied"
    >
      <p className="text-2xl sm:text-3xl font-semibold tracking-tight text-base-content">
        Country Lion Reports
      </p>
      <h1 className="mt-3 text-lg font-medium text-error">Access denied</h1>
      <p className="mt-2 text-sm text-base-content/65 leading-relaxed">
        {message
          || 'You do not have permission to open finance reports. Ask a portal admin to turn on Finance reports for your account (Portal access → Feature access).'}
      </p>
    </div>
  );
}

function TabPanel({ data, tab }) {
  const rangeLabel = `${formatUkDate(data.dateRange.from)} → ${formatUkDate(data.dateRange.to)}`;

  if (tab === 'private-hire') {
    const t = data.privateHire;
    return (
      <TripTypePanel
        title={t.title}
        description={t.description}
        note={data.note}
        rangeLabel={rangeLabel}
        kpis={t.kpis}
        trend={t.trend}
        byDepot={t.byDepot}
        byCustomer={t.byCustomer}
      />
    );
  }
  if (tab === 'contracts') {
    const t = data.contracts;
    return (
      <TripTypePanel
        title={t.title}
        description={t.description}
        note={data.note}
        rangeLabel={rangeLabel}
        kpis={t.kpis}
        trend={t.trend}
        byDepot={t.byDepot}
        byCustomer={t.byCustomer}
      />
    );
  }
  if (tab === 'by-vehicle') {
    return (
      <AttributionPanel
        mode="vehicle"
        panel={data.byVehicle}
        note={data.note}
        rangeLabel={rangeLabel}
      />
    );
  }
  if (tab === 'utilisation') {
    return (
      <VehicleUtilisationPanel
        panel={data.vehicleUtilisation}
        note={data.note}
        rangeLabel={rangeLabel}
      />
    );
  }
  if (tab === 'by-driver') {
    return (
      <AttributionPanel
        mode="driver"
        panel={data.byDriver}
        note={data.note}
        rangeLabel={rangeLabel}
      />
    );
  }
  if (tab === 'by-job-type') {
    return (
      <JobTypePanel
        panel={data.byJobType}
        note={data.note}
        rangeLabel={rangeLabel}
      />
    );
  }
  if (tab === 'acceptance') {
    return (
      <AcceptancePanel
        panel={data.acceptance}
        note={data.note}
        rangeLabel={rangeLabel}
      />
    );
  }

  return (
    <CustomersPanel
      panel={data.customers}
      note={data.note}
      rangeLabel={rangeLabel}
    />
  );
}

function TripScopeToggle({ value, onChange }) {
  return (
    <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Trip type">
      <span className="text-xs uppercase tracking-wider text-base-content/55">Trip type</span>
      <div className="join">
        {TRIP_SCOPES.map((scope) => (
          <button
            key={scope.id}
            type="button"
            className={`btn btn-sm join-item ${value === scope.id ? 'btn-primary' : 'btn-ghost'}`}
            aria-pressed={value === scope.id}
            onClick={() => onChange(scope.id)}
          >
            {scope.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function AttributionPanel({ mode, panel, note, rangeLabel }) {
  const [scopeId, setScopeId] = useState('both');
  const scope = panel.scopes?.[scopeId] || panel.scopes?.both;
  const rows = mode === 'vehicle' ? (scope?.byVehicle || []) : (scope?.byDriver || []);
  const scopeLabel = scope?.label || 'Both';
  const trendSubtitle =
    scopeId === 'both'
      ? `All operational trip revenue (${rangeLabel}).`
      : `${scopeLabel} trip revenue (${rangeLabel}).`;

  if (!scope) {
    return (
      <div className="rounded-xl border border-base-300 bg-base-200/50 px-5 py-8">
        <p className="text-sm text-base-content/60">
          This report view is missing trip-type data. Refresh and try again.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-8" data-panel={panel.id}>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <PanelIntro title={panel.title} description={panel.description} note={note} />
        <TripScopeToggle value={scopeId} onChange={setScopeId} />
      </div>
      <KpiRow kpis={scope.kpis} />
      <div className="divider my-0" />
      <TrendBlock
        title="Revenue over time"
        subtitle={trendSubtitle}
        trend={scope.trend}
      />
      <div className="divider my-0" />
      <section>
        {mode === 'vehicle' ? (
          <>
            <SectionTitle
              title="Revenue by coach"
              subtitle={`Coach means vehicle — ${formatInt(rows.length)} coaches for ${scopeLabel}, ranked by trip revenue (ex VAT).`}
            />
            <div className="mt-4 overflow-x-auto">
              <SortableTable
                key={`vehicle-${scopeId}`}
                rows={rows}
                rowKey={(row) => `${row.coach}-${row.licensePlate}`}
                defaultSort={{ key: 'revenue', dir: 'desc' }}
                columns={[
                  {
                    key: 'coach',
                    label: 'Coach',
                    render: (row) => <span className="font-medium">{row.coach}</span>,
                  },
                  {
                    key: 'vehicleType',
                    label: 'Type',
                    render: (row) => <span className="text-base-content/70">{row.vehicleType}</span>,
                  },
                  {
                    key: 'licensePlate',
                    label: 'Plate',
                    render: (row) => (
                      <span className="font-mono text-xs text-base-content/70">{row.licensePlate || '—'}</span>
                    ),
                  },
                  {
                    key: 'trips',
                    label: 'Trips',
                    type: 'number',
                    align: 'right',
                    render: (row) => <span className="tabular-nums">{formatInt(row.trips)}</span>,
                  },
                  {
                    key: 'revenue',
                    label: 'Revenue',
                    type: 'number',
                    align: 'right',
                    render: (row) => (
                      <span className="tabular-nums font-medium">{formatGbp(row.revenue)}</span>
                    ),
                  },
                ]}
              />
            </div>
          </>
        ) : (
          <>
            <SectionTitle
              title="Revenue by driver"
              subtitle={`Driver means the person from the employee list — ${formatInt(rows.length)} for ${scopeLabel}, ranked by trip revenue (ex VAT).`}
            />
            <div className="mt-4 overflow-x-auto">
              <SortableTable
                key={`driver-${scopeId}`}
                rows={rows}
                rowKey={(row) => row.driver}
                defaultSort={{ key: 'revenue', dir: 'desc' }}
                columns={[
                  {
                    key: 'driver',
                    label: 'Driver',
                    render: (row) => <span className="font-medium">{row.driver}</span>,
                  },
                  {
                    key: 'trips',
                    label: 'Trips',
                    type: 'number',
                    align: 'right',
                    render: (row) => <span className="tabular-nums">{formatInt(row.trips)}</span>,
                  },
                  {
                    key: 'revenue',
                    label: 'Revenue',
                    type: 'number',
                    align: 'right',
                    render: (row) => (
                      <span className="tabular-nums font-medium">{formatGbp(row.revenue)}</span>
                    ),
                  },
                ]}
              />
            </div>
          </>
        )}
      </section>
    </div>
  );
}


function UtilisationScatterTooltip({ active, payload }) {
  if (!active || !payload || !payload.length) return null;
  const d = payload[0].payload;
  return (
    <div className="rounded-lg border border-base-300 bg-base-100 p-3 shadow-xl text-xs space-y-1.5 min-w-[13rem]">
      <div className="flex items-center justify-between gap-2 border-b border-base-200 pb-1.5">
        <span className="font-bold text-sm text-base-content">{d.coach}</span>
        {d.isFinanced ? (
          <span className="badge badge-warning badge-xs font-medium">Financed</span>
        ) : (
          <span className="badge badge-ghost badge-xs">Owned</span>
        )}
      </div>
      <p className="text-base-content/70">{d.type}</p>
      <div className="pt-1 space-y-1">
        <div className="flex justify-between gap-3">
          <span className="text-base-content/60">Revenue:</span>
          <span className="font-semibold text-base-content">{formatGbp(d.revenue)}</span>
        </div>
        <div className="flex justify-between gap-3">
          <span className="text-base-content/60">Operational Hours:</span>
          <span className="font-semibold text-primary">{d.hours} hrs</span>
        </div>
        <div className="flex justify-between gap-3">
          <span className="text-base-content/60">Idle Hours:</span>
          <span className="font-semibold text-amber-500">{d.idleHours} hrs</span>
        </div>
        <div className="flex justify-between gap-3">
          <span className="text-base-content/60">Utilisation:</span>
          <span className="font-semibold">{formatPct(d.utilisationPct)}</span>
        </div>
        <div className="flex justify-between gap-3 border-t border-base-200 pt-1 font-medium">
          <span className="text-base-content/60">Revenue / Hour:</span>
          <span className="font-bold text-success">£{formatInt(d.revPerHour)}/hr</span>
        </div>
      </div>
    </div>
  );
}

function HoursBarTooltip({ active, payload, label }) {
  if (!active || !payload || !payload.length) return null;
  const operational = payload.find((p) => p.dataKey === 'operational')?.value || 0;
  const idle = payload.find((p) => p.dataKey === 'idle')?.value || 0;
  const total = operational + idle;
  const pct = total > 0 ? (operational / total) * 100 : 0;
  return (
    <div className="rounded-lg border border-base-300 bg-base-100 p-2.5 shadow-lg text-xs space-y-1">
      <p className="font-bold text-base-content">{label}</p>
      <div className="flex justify-between gap-3">
        <span className="text-success font-medium">Operational:</span>
        <span className="font-mono">{operational} hrs ({pct.toFixed(1)}%)</span>
      </div>
      <div className="flex justify-between gap-3">
        <span className="text-base-content/60">Idle:</span>
        <span className="font-mono text-base-content/70">{idle} hrs</span>
      </div>
    </div>
  );
}

function VehicleUtilisationPanel({ panel, note, rangeLabel }) {
  const [scopeId, setScopeId] = useState('both');
  const [filterMode, setFilterMode] = useState('all');
  const [search, setSearch] = useState('');

  const scope = panel?.scopes?.[scopeId] || panel?.scopes?.both;
  const kpis = scope?.kpis;
  const rawVehicles = scope?.vehicles || [];
  const scopeLabel = scope?.label || 'Both';

  const filteredVehicles = useMemo(() => {
    return rawVehicles.filter((v) => {
      if (filterMode === 'financed' && !v.isFinanced) return false;
      if (filterMode === 'underperforming' && (!v.isFinanced || v.utilisationPct >= 0.15)) return false;
      if (search.trim()) {
        const query = search.trim().toLowerCase();
        const matchPlate = (v.licensePlate || '').toLowerCase().includes(query);
        const matchCoach = (v.coach || '').toLowerCase().includes(query);
        const matchType = (v.vehicleType || '').toLowerCase().includes(query);
        if (!matchPlate && !matchCoach && !matchType) return false;
      }
      return true;
    });
  }, [rawVehicles, filterMode, search]);

  function downloadCsv() {
    const headers = [
      'Coach',
      'Plate',
      'Type',
      'Financed',
      'Trips',
      'Operational Hours',
      'Idle Hours',
      'Utilisation Pct',
      'Revenue ex VAT',
      'Rev Per Hour',
      'Avg Hours Per Trip',
    ];
    const rows = filteredVehicles.map((v) => [
      `"${v.coach}"`,
      `"${v.licensePlate}"`,
      `"${v.vehicleType}"`,
      v.isFinanced ? 'Yes' : 'No',
      v.trips,
      v.operationalHours,
      v.idleHours,
      `${(v.utilisationPct * 100).toFixed(1)}%`,
      v.revenue,
      v.revenuePerHour,
      v.avgHoursPerTrip,
    ]);
    const csvContent = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `country-lion-vehicle-utilisation-${scopeId}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  if (!panel || !scope) {
    return (
      <div className="rounded-xl border border-base-300 bg-base-200/50 px-5 py-8">
        <p className="text-sm text-base-content/60">
          Vehicle utilisation data is unavailable. Refresh and try again.
        </p>
      </div>
    );
  }

  const scatterData = filteredVehicles.map((v) => ({
    name: v.licensePlate || v.coach,
    coach: v.coach,
    plate: v.licensePlate,
    type: v.vehicleType,
    isFinanced: v.isFinanced,
    hours: v.operationalHours,
    revenue: v.revenue,
    revPerHour: v.revenuePerHour,
    idleHours: v.idleHours,
    utilisationPct: v.utilisationPct,
  }));

  const barData = rawVehicles.slice(0, 12).map((v) => ({
    name: v.licensePlate || v.coach.slice(0, 8),
    operational: v.operationalHours,
    idle: v.idleHours,
    isFinanced: v.isFinanced,
  }));

  return (
    <div className="space-y-8" data-panel="vehicle-utilisation">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <PanelIntro
          title={panel.title || 'Vehicle Utilisation & Hours'}
          description={
            panel.description ||
            'Operational hours, idle time, and revenue yield per hour by vehicle — calculated directly from trip start to finish.'
          }
          note={note}
        />
        <TripScopeToggle value={scopeId} onChange={setScopeId} />
      </div>

      {kpis ? (
        <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5 rounded-xl border border-base-300 bg-base-200/40 p-4">
          <Kpi
            label="Total Operational Hours"
            value={`${formatInt(kpis.totalOperationalHours || 0)} hrs`}
            hint={`Across ${kpis.activeVehicles || 0} active coaches`}
            hideDelta
          />
          <Kpi
            label="Total Idle Hours"
            value={`${formatInt(kpis.totalIdleHours || 0)} hrs`}
            hint={`Available window: ${formatInt(kpis.availableHoursPerVehicle || 0)} hrs/coach`}
            hideDelta
          />
          <Kpi
            label="Fleet Utilisation"
            value={formatPct(kpis.overallUtilisationPct || 0)}
            hint="Worked vs available capacity"
            hideDelta
          />
          <Kpi
            label="Avg Rev / Hour"
            value={`£${formatInt(kpis.avgRevenuePerHour || 0)}/hr`}
            hint="Total revenue ÷ operational hours"
            hideDelta
          />
          <Kpi
            label="Financed Watchlist"
            value={`${kpis.financedUnderperforming || 0} coach${kpis.financedUnderperforming === 1 ? '' : 'es'}`}
            hint="Financed with low utilisation (<15%)"
            hideDelta
          />
        </section>
      ) : null}

      <div className="divider my-0" />

      {/* Visualisations Grid */}
      <div className="grid gap-8 lg:grid-cols-2">
        {/* Visual 1: Hours Compared to Revenue */}
        <div className="rounded-xl border border-base-300 bg-base-100 p-5 shadow-sm space-y-3">
          <div className="flex items-start justify-between gap-2">
            <div>
              <h4 className="text-base font-semibold text-base-content">Hours Compared to Revenue</h4>
              <p className="text-xs text-base-content/60">
                Operational hours (X) vs Revenue (Y) for {scopeLabel} trips ({rangeLabel}).
              </p>
            </div>
            <span className="badge badge-sm badge-outline text-xs">Hover for details</span>
          </div>

          <div className="h-72 w-full pt-2">
            <ResponsiveContainer width="100%" height="100%">
              <ScatterChart margin={{ top: 10, right: 20, bottom: 20, left: 10 }}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                <XAxis
                  type="number"
                  dataKey="hours"
                  name="Operational Hours"
                  unit="h"
                  tick={{ fontSize: 11 }}
                  label={{ value: 'Operational Hours (h)', position: 'insideBottom', offset: -10, fontSize: 11, fill: 'currentColor', opacity: 0.6 }}
                />
                <YAxis
                  type="number"
                  dataKey="revenue"
                  name="Revenue"
                  tickFormatter={(v) => formatGbp(v, true)}
                  tick={{ fontSize: 11 }}
                  label={{ value: 'Revenue (£)', angle: -90, position: 'insideLeft', offset: 0, fontSize: 11, fill: 'currentColor', opacity: 0.6 }}
                />
                <Tooltip content={<UtilisationScatterTooltip />} />
                <Scatter
                  name="Coaches"
                  data={scatterData}
                  fill="#0ea5e9"
                  shape={(props) => {
                    const { cx, cy, payload } = props;
                    const isFin = payload?.isFinanced;
                    const fill = isFin ? '#f59e0b' : '#3b82f6';
                    return (
                      <g>
                        <circle cx={cx} cy={cy} r={isFin ? 8 : 6} fill={fill} fillOpacity={0.85} stroke="#ffffff" strokeWidth={1.5} />
                        <text x={cx} y={cy - 10} textAnchor="middle" fontSize={10} fontWeight="bold" fill="currentColor" opacity={0.8}>
                          {payload?.plate || ''}
                        </text>
                      </g>
                    );
                  }}
                />
              </ScatterChart>
            </ResponsiveContainer>
          </div>
          <div className="flex items-center justify-center gap-6 text-xs text-base-content/65 pt-1">
            <span className="inline-flex items-center gap-1.5">
              <span className="inline-block h-2.5 w-2.5 rounded-full bg-amber-500" />
              Financed Vehicles (High capital hurdle)
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="inline-block h-2.5 w-2.5 rounded-full bg-blue-500" />
              Owned Fleet
            </span>
          </div>
        </div>

        {/* Visual 2: Operational Hours vs Idle Hours */}
        <div className="rounded-xl border border-base-300 bg-base-100 p-5 shadow-sm space-y-3">
          <div className="flex items-start justify-between gap-2">
            <div>
              <h4 className="text-base font-semibold text-base-content">Operational vs Idle Hours</h4>
              <p className="text-xs text-base-content/60">
                Top coaches by operational volume ({rangeLabel}). Stacked vs 12hr daily availability.
              </p>
            </div>
          </div>

          <div className="h-72 w-full pt-2">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={barData} margin={{ top: 10, right: 10, left: 0, bottom: 25 }}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                <XAxis dataKey="name" angle={-35} textAnchor="end" interval={0} tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} unit="h" />
                <Tooltip content={<HoursBarTooltip />} />
                <Legend wrapperStyle={{ fontSize: 12, paddingTop: 10 }} />
                <Bar dataKey="operational" name="Operational Hours" stackId="a" fill="#10b981" radius={[0, 0, 0, 0]} />
                <Bar dataKey="idle" name="Idle Hours" stackId="a" fill="#cbd5e1" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <div className="divider my-0" />

      {/* Table Section */}
      <section className="space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <SectionTitle
            title="Vehicle Utilisation Breakdown"
            subtitle={`${formatInt(filteredVehicles.length)} vehicles shown for ${scopeLabel}, sorted by operational hours.`}
          />
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="text"
              placeholder="Search coach or plate…"
              className="input input-bordered input-sm w-44 sm:w-56"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <div className="join">
              <button
                type="button"
                className={`btn btn-sm join-item ${filterMode === 'all' ? 'btn-primary' : 'btn-ghost'}`}
                onClick={() => setFilterMode('all')}
              >
                All
              </button>
              <button
                type="button"
                className={`btn btn-sm join-item ${filterMode === 'financed' ? 'btn-primary' : 'btn-ghost'}`}
                onClick={() => setFilterMode('financed')}
              >
                Financed
              </button>
              <button
                type="button"
                className={`btn btn-sm join-item ${filterMode === 'underperforming' ? 'btn-primary' : 'btn-ghost'}`}
                onClick={() => setFilterMode('underperforming')}
              >
                Low Utilisation (&lt;15%)
              </button>
            </div>
            <button
              type="button"
              className="btn btn-outline btn-sm gap-1"
              onClick={downloadCsv}
              title="Download CSV"
            >
              Export CSV
            </button>
          </div>
        </div>

        <div className="overflow-x-auto rounded-xl border border-base-300 bg-base-100">
          <SortableTable
            key={`utilisation-${scopeId}-${filterMode}`}
            rows={filteredVehicles}
            rowKey={(row) => `${row.coach}-${row.licensePlate}`}
            defaultSort={{ key: 'operationalHours', dir: 'desc' }}
            columns={[
              {
                key: 'coach',
                label: 'Coach / Plate',
                render: (row) => (
                  <div className="flex flex-col">
                    <div className="flex items-center gap-1.5">
                      <span className="font-semibold text-base-content">{row.coach}</span>
                      {row.isFinanced ? (
                        <span className="badge badge-warning badge-xs font-normal">Financed</span>
                      ) : null}
                    </div>
                    <span className="text-xs text-base-content/50 font-mono">{row.licensePlate || '—'}</span>
                  </div>
                ),
              },
              {
                key: 'vehicleType',
                label: 'Type',
                render: (row) => <span className="text-xs text-base-content/70">{row.vehicleType}</span>,
              },
              {
                key: 'revenue',
                label: 'Revenue',
                type: 'number',
                align: 'right',
                render: (row) => (
                  <span className="tabular-nums font-semibold text-base-content">{formatGbp(row.revenue)}</span>
                ),
              },
              {
                key: 'operationalHours',
                label: 'Total Hours',
                type: 'number',
                align: 'right',
                render: (row) => (
                  <span className="tabular-nums font-medium text-primary">
                    {Number(row.operationalHours || 0).toFixed(1)} hrs
                  </span>
                ),
              },
              {
                key: 'idleHours',
                label: 'Idle Hours',
                type: 'number',
                align: 'right',
                render: (row) => (
                  <span className="tabular-nums text-base-content/70">
                    {Number(row.idleHours || 0).toFixed(1)} hrs
                  </span>
                ),
              },
              {
                key: 'utilisationPct',
                label: 'Utilisation %',
                type: 'number',
                align: 'right',
                render: (row) => {
                  const pct = row.utilisationPct || 0;
                  const barColor = pct >= 0.2 ? 'bg-success' : pct >= 0.12 ? 'bg-primary' : 'bg-warning';
                  return (
                    <div className="flex flex-col items-end">
                      <span className="tabular-nums font-medium">{formatPct(pct)}</span>
                      <div className="w-16 bg-base-300 rounded-full h-1.5 mt-1 overflow-hidden">
                        <div
                          className={`h-full rounded-full ${barColor}`}
                          style={{ width: `${Math.min(100, Math.round(pct * 100))}%` }}
                        />
                      </div>
                    </div>
                  );
                },
              },
              {
                key: 'revenuePerHour',
                label: 'Rev / Hour',
                type: 'number',
                align: 'right',
                render: (row) => {
                  const val = row.revenuePerHour || 0;
                  const badgeClass =
                    val >= 100
                      ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30'
                      : val >= 65
                      ? 'bg-blue-500/15 text-blue-600 dark:text-blue-400 border-blue-500/30'
                      : 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30';
                  return (
                    <span
                      className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold border ${badgeClass} tabular-nums`}
                    >
                      £{formatInt(val)}/hr
                    </span>
                  );
                },
              },
              {
                key: 'trips',
                label: 'Trips',
                type: 'number',
                align: 'right',
                render: (row) => <span className="tabular-nums">{formatInt(row.trips)}</span>,
              },
              {
                key: 'avgHoursPerTrip',
                label: 'Avg Hrs/Trip',
                type: 'number',
                align: 'right',
                render: (row) => (
                  <span className="tabular-nums text-xs text-base-content/70">
                    {Number(row.avgHoursPerTrip || 0).toFixed(1)} h
                  </span>
                ),
              },
            ]}
          />
        </div>
      </section>
    </div>
  );
}

function JobTypePanel({ panel, note, rangeLabel }) {
  const [scopeId, setScopeId] = useState('both');
  const scope = panel?.scopes?.[scopeId] || panel?.scopes?.both;
  const rows = scope?.byJobType || [];
  const scopeLabel = scope?.label || 'Both';

  if (!scope) {
    return (
      <div className="rounded-xl border border-base-300 bg-base-200/50 px-5 py-8">
        <p className="text-sm text-base-content/60">Job type data is unavailable. Refresh and try again.</p>
      </div>
    );
  }

  return (
    <div className="space-y-8" data-panel="by-job-type">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <PanelIntro title={panel.title} description={panel.description} note={note} />
        <TripScopeToggle value={scopeId} onChange={setScopeId} />
      </div>
      <KpiRow kpis={scope.kpis} />
      <div className="divider my-0" />
      <div className="grid gap-10 lg:grid-cols-[1.3fr_1fr]">
        <TrendBlock
          title="Revenue over time"
          subtitle={`${scopeLabel} trip revenue (${rangeLabel}).`}
          trend={scope.trend}
        />
        <NamedBar
          title="Revenue by job type"
          subtitle="Customer category / job type for this trip filter."
          rows={rows}
        />
      </div>
      <div className="divider my-0" />
      <section>
        <SectionTitle
          title="Job type breakdown"
          subtitle={`${formatInt(rows.length)} categories for ${scopeLabel}, ranked by trip revenue (ex VAT).`}
        />
        <div className="mt-4 overflow-x-auto">
          <SortableTable
            key={`job-type-${scopeId}`}
            rows={rows}
            rowKey={(row) => row.name}
            defaultSort={{ key: 'amount', dir: 'desc' }}
            columns={[
              {
                key: 'name',
                label: 'Job type',
                render: (row) => <span className="font-medium">{row.name}</span>,
              },
              {
                key: 'trips',
                label: 'Trips',
                type: 'number',
                align: 'right',
                render: (row) => <span className="tabular-nums">{formatInt(row.trips || 0)}</span>,
              },
              {
                key: 'amount',
                label: 'Revenue',
                type: 'number',
                align: 'right',
                render: (row) => (
                  <span className="tabular-nums font-medium">{formatGbp(row.amount)}</span>
                ),
              },
              {
                key: 'share',
                label: 'Share',
                type: 'number',
                align: 'right',
                render: (row) => (
                  <span className="tabular-nums text-base-content/70">{formatPct(row.share || 0)}</span>
                ),
              },
            ]}
          />
        </div>
      </section>
    </div>
  );
}

function AcceptancePanel({ panel, note, rangeLabel }) {
  if (!panel) {
    return (
      <div className="rounded-xl border border-base-300 bg-base-200/50 px-5 py-8">
        <p className="text-sm text-base-content/60">Acceptance data is unavailable. Refresh and try again.</p>
      </div>
    );
  }

  const rate = panel.acceptanceRate;
  return (
    <div className="space-y-8" data-panel="acceptance">
      <PanelIntro title={panel.title} description={panel.description} note={note} />
      <p className="text-sm text-base-content/55">
        Order dates in range: {rangeLabel}. Private Hire quotes only (order type Normal).
      </p>
      <section className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi
          label="Acceptance rate"
          value={rate == null ? '—' : formatPct(rate)}
          hint="Won ÷ (won + lost + open)"
          hideDelta
        />
        <Kpi
          label="Won quotes"
          value={formatInt(panel.won || 0)}
          hint="complete / done / manually updated"
          hideDelta
        />
        <Kpi
          label="Lost quotes"
          value={formatInt(panel.lost || 0)}
          hint="Quotes marked lost"
          hideDelta
        />
        <Kpi
          label="Open quotes"
          value={formatInt(panel.openQuotes || 0)}
          hint={`${formatInt(panel.quotes || 0)} total · ${formatInt(panel.cancelled || 0)} cancelled`}
          hideDelta
        />
      </section>
    </div>
  );
}

function ComparisonStrip({ comparisons }) {
  const period = comparisons?.period;
  const mtd = comparisons?.mtd;
  if (!period || !mtd) return null;

  return (
    <section
      className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 rounded-xl border border-base-300 bg-base-200/40 px-4 py-4"
      aria-label="Period comparisons"
    >
      <CompareStat
        label="Period revenue vs LY"
        value={formatGbp(period.current.revenue)}
        delta={period.revenueDelta}
        hint={`${formatUkDate(period.from)} → ${formatUkDate(period.to)} vs last year`}
      />
      <CompareStat
        label="Period trips vs LY"
        value={formatInt(period.current.trips)}
        delta={period.tripsDelta}
        hint={`LY ${formatInt(period.prior.trips)} trips`}
      />
      <CompareStat
        label="MTD revenue vs LY"
        value={formatGbp(mtd.current.revenue)}
        delta={mtd.revenueDelta}
        hint={`${formatUkDate(mtd.from)} → ${formatUkDate(mtd.to)}`}
      />
      <CompareStat
        label="MTD trips vs LY"
        value={formatInt(mtd.current.trips)}
        delta={mtd.tripsDelta}
        hint={`LY MTD ${formatInt(mtd.prior.trips)} trips`}
      />
    </section>
  );
}

function CompareStat({ label, value, delta, hint }) {
  const up = (delta || 0) >= 0;
  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-wider text-base-content/55">{label}</p>
      <p className="mt-1 text-xl font-semibold tabular-nums tracking-tight">{value}</p>
      <p className="mt-1 text-sm">
        <span className={up ? 'text-success' : 'text-warning'}>{formatPct(delta, true)}</span>
        <span className="text-base-content/50"> vs LY</span>
      </p>
      <p className="mt-1 text-xs text-base-content/50">{hint}</p>
    </div>
  );
}

function CustomersPanel({ panel, note, rangeLabel }) {
  const [scopeId, setScopeId] = useState('both');
  const scope = panel?.scopes?.[scopeId] || panel?.scopes?.both;
  const topRows = scope?.topCustomers || [];
  const dormantRows = panel?.dormantTopCustomers || [];
  const health = panel?.health;
  const scopeLabel = scope?.label || 'Both';

  if (!scope) {
    return (
      <div className="rounded-xl border border-base-300 bg-base-200/50 px-5 py-8">
        <p className="text-sm text-base-content/60">Customer data is unavailable. Refresh and try again.</p>
      </div>
    );
  }

  const bands = health?.bands || {};
  const healthColumns = [
    {
      key: 'name',
      label: 'Customer',
      render: (row) => <span className="font-medium">{row.name}</span>,
    },
    {
      key: 'category',
      label: 'Job type',
      render: (row) => <span className="text-base-content/70">{row.category || '—'}</span>,
    },
    {
      key: 'lastTripDate',
      label: 'Last trip',
      render: (row) => (
        <span className="tabular-nums text-base-content/70">
          {row.lastTripDate ? formatUkDate(row.lastTripDate) : '—'}
        </span>
      ),
    },
    {
      key: 'trips',
      label: 'Lifetime trips',
      type: 'number',
      align: 'right',
      render: (row) => <span className="tabular-nums">{formatInt(row.trips || 0)}</span>,
    },
    {
      key: 'revenue',
      label: 'Lifetime revenue',
      type: 'number',
      align: 'right',
      render: (row) => (
        <span className="tabular-nums font-medium">{formatGbp(row.revenue)}</span>
      ),
    },
  ];

  return (
    <div className="space-y-8" data-panel="customers">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <PanelIntro title={panel.title} description={panel.description} note={note} />
        <TripScopeToggle value={scopeId} onChange={setScopeId} />
      </div>
      <KpiRow kpis={scope.kpis} />

      {health ? (
        <>
          <div className="divider my-0" />
          <section className="space-y-4">
            <SectionTitle
              title="Customer health"
              subtitle={health.note || 'Active / at risk / churned by days since last trip.'}
            />
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <HealthBandCard
                label="Active"
                hint="< 60 days"
                customers={bands.active?.customers}
                revenue={bands.active?.revenue}
              />
              <HealthBandCard
                label="At risk"
                hint="60–89 days"
                customers={bands.atRisk?.customers}
                revenue={bands.atRisk?.revenue}
                tone="warning"
              />
              <HealthBandCard
                label="Churned"
                hint="90+ days"
                customers={bands.churned?.customers}
                revenue={bands.churned?.revenue}
                tone="error"
              />
              <HealthBandCard
                label="Revenue at risk"
                hint="At risk + churned lifetime rev"
                customers={null}
                revenue={health.revenueAtRisk}
                tone="warning"
              />
            </div>
            <div className="grid gap-8 lg:grid-cols-2">
              <div>
                <h4 className="text-sm font-semibold text-base-content">Top at-risk customers</h4>
                <div className="mt-3 overflow-x-auto">
                  <SortableTable
                    rows={health.atRiskTop || []}
                    rowKey={(row) => `${row.name}-risk`}
                    defaultSort={{ key: 'revenue', dir: 'desc' }}
                    columns={healthColumns}
                  />
                </div>
              </div>
              <div>
                <h4 className="text-sm font-semibold text-base-content">Top churned customers</h4>
                <div className="mt-3 overflow-x-auto">
                  <SortableTable
                    rows={health.churnedTop || []}
                    rowKey={(row) => `${row.name}-churned`}
                    defaultSort={{ key: 'revenue', dir: 'desc' }}
                    columns={healthColumns}
                  />
                </div>
              </div>
            </div>
          </section>
        </>
      ) : null}

      <div className="divider my-0" />
      <section>
        <SectionTitle
          title="Top customers"
          subtitle={`${formatInt(topRows.length)} customers for ${scopeLabel} in ${rangeLabel}, ranked by trip revenue (ex VAT).`}
        />
        <div className="mt-4 overflow-x-auto">
          <SortableTable
            key={`top-customers-${scopeId}`}
            rows={topRows}
            rowKey={(row) => `${row.name}-${row.category || ''}`}
            defaultSort={{ key: 'revenue', dir: 'desc' }}
            columns={[
              {
                key: 'name',
                label: 'Customer',
                render: (row) => <span className="font-medium">{row.name}</span>,
              },
              {
                key: 'category',
                label: 'Job type',
                render: (row) => (
                  <span className="text-base-content/70">{row.category || '—'}</span>
                ),
              },
              {
                key: 'bookings',
                label: 'Bookings',
                type: 'number',
                align: 'right',
                render: (row) => <span className="tabular-nums">{formatInt(row.bookings || 0)}</span>,
              },
              {
                key: 'trips',
                label: 'Trips',
                type: 'number',
                align: 'right',
                render: (row) => <span className="tabular-nums">{formatInt(row.trips || 0)}</span>,
              },
              {
                key: 'revenue',
                label: 'Revenue',
                type: 'number',
                align: 'right',
                render: (row) => (
                  <span className="tabular-nums font-medium">{formatGbp(row.revenue)}</span>
                ),
              },
            ]}
          />
        </div>
      </section>
      <div className="divider my-0" />
      <section>
        <SectionTitle
          title="Top 10 lapsed customers (9 months)"
          subtitle={panel.dormantNote || 'Highest lifetime revenue with no trip in the last 9 months.'}
        />
        <div className="mt-4 overflow-x-auto">
          <SortableTable
            rows={dormantRows}
            rowKey={(row) => `${row.name}-dormant`}
            defaultSort={{ key: 'revenue', dir: 'desc' }}
            columns={healthColumns}
          />
        </div>
      </section>
    </div>
  );
}

function HealthBandCard({ label, hint, customers, revenue, tone }) {
  const toneClass =
    tone === 'error'
      ? 'border-error/30 bg-error/5'
      : tone === 'warning'
        ? 'border-warning/30 bg-warning/5'
        : 'border-base-300 bg-base-200/40';
  return (
    <div className={`rounded-xl border px-4 py-3 ${toneClass}`}>
      <p className="text-xs font-medium uppercase tracking-wider text-base-content/55">{label}</p>
      {customers != null ? (
        <p className="mt-1 text-2xl font-semibold tabular-nums">{formatInt(customers)}</p>
      ) : (
        <p className="mt-1 text-2xl font-semibold tabular-nums">{formatGbp(revenue || 0)}</p>
      )}
      {customers != null ? (
        <p className="mt-1 text-sm tabular-nums text-base-content/70">{formatGbp(revenue || 0)} lifetime</p>
      ) : null}
      <p className="mt-1 text-xs text-base-content/50">{hint}</p>
    </div>
  );
}

function TripTypePanel({ title, description, note, rangeLabel, kpis, trend, byDepot, byCustomer }) {
  return (
    <div className="space-y-8" data-panel={title}>
      <PanelIntro title={title} description={description} note={note} />
      <KpiRow kpis={kpis} />
      <div className="divider my-0" />
      <div className="grid gap-10 lg:grid-cols-[1.3fr_1fr]">
        <TrendBlock
          title="Revenue over time"
          subtitle={`Trip revenue (ex VAT) for ${rangeLabel}.`}
          trend={trend}
        />
        <NamedBar title="Revenue by depot" subtitle="Where the work was run from." rows={byDepot} />
      </div>
      <div className="divider my-0" />
      <NamedTable title="Top customers" subtitle="Highest trip revenue in this view." rows={byCustomer} />
    </div>
  );
}

function PanelIntro({ title, description, note }) {
  return (
    <div>
      <h2 className="text-xl sm:text-2xl font-semibold text-base-content">{title}</h2>
      <p className="mt-1 text-sm text-base-content/60">{description}</p>
      {note ? <p className="mt-2 text-xs text-base-content/50">{note}</p> : null}
    </div>
  );
}

function KpiRow({ kpis }) {
  const revPerTrip = kpis.trips > 0 ? kpis.revenue / kpis.trips : null;
  return (
    <section className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
      <Kpi
        label="Trip revenue (ex VAT)"
        value={formatGbp(kpis.revenue)}
        delta={kpis.revenueDelta}
        hint={`${formatInt(kpis.trips)} trips`}
      />
      <Kpi
        label="Rev per trip"
        value={revPerTrip == null ? '—' : formatGbp(revPerTrip)}
        hint="Average trip revenue (ex VAT)"
        hideDelta
      />
      <Kpi
        label="Trips"
        value={formatInt(kpis.trips)}
        hint="Operational trips in range"
        hideDelta
      />
      <Kpi
        label="Bookings"
        value={formatInt(kpis.bookings)}
        hint="Distinct orders behind those trips"
        hideDelta
      />
    </section>
  );
}

function TrendBlock({ title, subtitle, trend }) {
  return (
    <div>
      <SectionTitle title={title} subtitle={subtitle} />
      <div className="mt-4 h-72 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={trend} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid stroke="currentColor" strokeOpacity={0.08} vertical={false} />
            <XAxis dataKey="month" tick={{ fontSize: 12 }} axisLine={false} tickLine={false} />
            <YAxis
              tickFormatter={(v) => formatGbp(Number(v), true)}
              tick={{ fontSize: 12 }}
              axisLine={false}
              tickLine={false}
              width={64}
            />
            <Tooltip formatter={(value) => formatGbp(Number(value ?? 0))} />
            <Legend />
            <Line
              type="monotone"
              dataKey="revenue"
              name="Revenue"
              stroke="oklch(var(--p))"
              strokeWidth={2.5}
              dot={false}
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function NamedBar({ title, subtitle, rows }) {
  return (
    <div>
      <SectionTitle title={title} subtitle={subtitle} />
      <div className="mt-4 h-72 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={rows} layout="vertical" margin={{ top: 8, right: 12, left: 8, bottom: 0 }}>
            <CartesianGrid stroke="currentColor" strokeOpacity={0.08} horizontal={false} />
            <XAxis
              type="number"
              tickFormatter={(v) => formatGbp(Number(v), true)}
              tick={{ fontSize: 11 }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              type="category"
              dataKey="name"
              width={120}
              tick={{ fontSize: 11 }}
              axisLine={false}
              tickLine={false}
            />
            <Tooltip formatter={(value) => formatGbp(Number(value ?? 0))} />
            <Bar dataKey="amount" name="Revenue" fill="oklch(var(--p))" radius={[0, 4, 4, 0]} isAnimationActive={false} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function NamedTable({ title, subtitle, rows }) {
  return (
    <section>
      <SectionTitle title={title} subtitle={subtitle} />
      <div className="mt-4 overflow-x-auto">
        <SortableTable
          rows={rows}
          rowKey={(row) => row.name}
          defaultSort={{ key: 'amount', dir: 'desc' }}
          columns={[
            {
              key: 'name',
              label: 'Customer',
              render: (row) => <span className="font-medium">{row.name}</span>,
            },
            {
              key: 'trips',
              label: 'Trips',
              type: 'number',
              align: 'right',
              render: (row) => <span className="tabular-nums">{formatInt(row.trips || 0)}</span>,
            },
            {
              key: 'amount',
              label: 'Revenue',
              type: 'number',
              align: 'right',
              render: (row) => (
                <span className="tabular-nums font-medium">{formatGbp(row.amount)}</span>
              ),
            },
          ]}
        />
      </div>
    </section>
  );
}

function compareSortValues(a, b, type) {
  if (type === 'number') return (Number(a) || 0) - (Number(b) || 0);
  return String(a ?? '').localeCompare(String(b ?? ''), undefined, {
    sensitivity: 'base',
    numeric: true,
  });
}

function SortableTable({ columns, rows, rowKey, defaultSort }) {
  const [sortKey, setSortKey] = useState(defaultSort?.key || columns[0]?.key);
  const [sortDir, setSortDir] = useState(defaultSort?.dir || 'desc');

  const sorted = useMemo(() => {
    const col = columns.find((c) => c.key === sortKey) || columns[0];
    if (!col) return rows;
    const dir = sortDir === 'asc' ? 1 : -1;
    return [...rows].sort(
      (a, b) => dir * compareSortValues(a[col.key], b[col.key], col.type),
    );
  }, [rows, columns, sortKey, sortDir]);

  function toggle(key) {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
      return;
    }
    const col = columns.find((c) => c.key === key);
    setSortKey(key);
    setSortDir(col?.type === 'number' ? 'desc' : 'asc');
  }

  return (
    <table className="table table-sm">
      <thead>
        <tr>
          {columns.map((col) => {
            const active = sortKey === col.key;
            const alignRight = col.align === 'right';
            return (
              <th
                key={col.key}
                className={alignRight ? 'text-right' : undefined}
                aria-sort={active ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'}
              >
                <button
                  type="button"
                  onClick={() => toggle(col.key)}
                  className={`inline-flex items-center gap-1 font-semibold hover:text-base-content ${
                    alignRight ? 'ml-auto' : ''
                  } ${active ? 'text-base-content' : 'text-base-content/60'}`}
                >
                  {col.label}
                  <span className="text-xs opacity-70" aria-hidden>
                    {active ? (sortDir === 'asc' ? '↑' : '↓') : '↕'}
                  </span>
                </button>
              </th>
            );
          })}
        </tr>
      </thead>
      <tbody>
        {sorted.map((row) => (
          <tr key={rowKey(row)}>
            {columns.map((col) => (
              <td
                key={col.key}
                className={col.align === 'right' ? 'text-right' : undefined}
              >
                {col.render ? col.render(row) : row[col.key]}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function FieldDate({ label, value, onChange, min, max }) {
  return (
    <label className="form-control w-full sm:max-w-[11rem]">
      <span className="label py-1">
        <span className="label-text text-xs uppercase tracking-wider text-base-content/55">{label}</span>
      </span>
      <input
        type="date"
        className="input input-bordered input-sm"
        value={value || ''}
        min={min}
        max={max}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  );
}

function FieldSelect({ label, value, onChange, options }) {
  return (
    <label className="form-control w-full sm:max-w-[14rem]">
      <span className="label py-1">
        <span className="label-text text-xs uppercase tracking-wider text-base-content/55">{label}</span>
      </span>
      <select
        className="select select-bordered select-sm"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </label>
  );
}

function Kpi({ label, value, delta, hint, hideDelta }) {
  const up = (delta || 0) >= 0;
  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-wider text-base-content/55">{label}</p>
      <p className="mt-2 text-2xl sm:text-3xl font-semibold tracking-tight tabular-nums">{value}</p>
      {!hideDelta ? (
        <p className="mt-2 text-sm text-base-content/70">
          <span className={up ? 'text-success' : 'text-warning'}>{formatPct(delta, true)}</span>
          <span className="text-base-content/50"> vs prior half of range</span>
        </p>
      ) : (
        <p className="mt-2 text-sm">&nbsp;</p>
      )}
      <p className="mt-1 text-xs text-base-content/50">{hint}</p>
    </div>
  );
}

function SectionTitle({ title, subtitle }) {
  return (
    <div>
      <h3 className="text-lg sm:text-xl font-semibold text-base-content">{title}</h3>
      <p className="mt-1 text-sm text-base-content/60">{subtitle}</p>
    </div>
  );
}

function LoadingState() {
  return (
    <div className="space-y-4" aria-busy aria-label="Loading finance dashboard">
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="skeleton h-24 w-full" />
        <div className="skeleton h-24 w-full" />
        <div className="skeleton h-24 w-full" />
      </div>
      <div className="skeleton h-80 w-full" />
      <p className="text-sm text-base-content/55">Loading Country Lion trip revenue…</p>
    </div>
  );
}

function ErrorState({ message, onRetry }) {
  return (
    <div className="rounded-xl border border-base-300 bg-base-200/50 px-5 py-8">
      <h2 className="text-xl font-semibold">Couldn’t load finance data</h2>
      <p className="mt-2 text-sm text-base-content/60">{message}</p>
      <button type="button" className="btn btn-primary btn-sm mt-4" onClick={onRetry}>Try again</button>
    </div>
  );
}

function EmptyState({ note, onRetry }) {
  return (
    <div className="rounded-xl border border-base-300 bg-base-200/50 px-5 py-8">
      <h2 className="text-xl font-semibold">No trips in this range</h2>
      <p className="mt-2 text-sm text-base-content/60">
        {note || 'Try widening the dates or clearing depot / segment filters.'}
      </p>
      <button type="button" className="btn btn-primary btn-sm mt-4" onClick={onRetry}>Refresh</button>
    </div>
  );
}
