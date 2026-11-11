import { Component, Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
  ZAxis,
} from 'recharts';
import { FILTER_PERIODS, formatGbp, formatInt, formatPct, formatUkDate } from '../lib/financeFormat';
import CoachManagerReplica from './CoachManagerReplica';

const TABS = [
  { id: 'coach-manager', label: 'Coach Manager Replica' },
  { id: 'private-hire', label: 'Private Hire' },
  { id: 'contracts', label: 'Contracts' },
  { id: 'by-vehicle', label: 'By vehicle' },
  { id: 'utilisation', label: 'Vehicle utilisation' },
  { id: 'midday-utilisation', label: 'Midday Utilisation (09:30–14:30)' },
  { id: 'by-driver', label: 'By driver' },
  { id: 'by-job-type', label: 'By job type' },
  { id: 'acceptance', label: 'Acceptance' },
  { id: 'pax-capacity', label: 'Pax vs Capacity' },
  { id: 'walkaround', label: 'Walk Around Compliance' },
  { id: 'comparison', label: 'Period Comparison' },
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
      const vehicleRev = data?.byVehicle?.scopes?.both?.kpis?.revenue
        ?? data?.byVehicle?.kpis?.revenue
        ?? 0;
      const empty =
        (data?.privateHire?.kpis?.revenue ?? 0) === 0
        && (data?.contracts?.kpis?.revenue ?? 0) === 0
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

      {tab === 'coach-manager' ? (
        <ReportsErrorBoundary resetKey={tab}>
          <CoachManagerReplica />
        </ReportsErrorBoundary>
      ) : (
        <>
          {showInitialLoading ? <LoadingState /> : null}
          {state.status === 'error' && !data ? (
            <ErrorState message={state.message} onRetry={() => void load()} />
          ) : null}
          {state.status === 'empty' && data ? (
            <EmptyState note={data.note} onRetry={() => void load()} />
          ) : null}

          {data && (state.status === 'ready' || state.status === 'loading' || state.status === 'error') ? (
            <ReportsErrorBoundary resetKey={tab}>
              <TabPanel data={data} tab={tab} />
            </ReportsErrorBoundary>
          ) : null}
        </>
      )}
    </div>
  );
}

class ReportsErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidUpdate(prevProps) {
    if (prevProps.resetKey !== this.props.resetKey && this.state.error) {
      this.setState({ error: null });
    }
  }

  componentDidCatch(error, info) {
    console.error('Reports tab crashed:', error, info);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="rounded-xl border border-error/30 bg-error/10 p-6 space-y-3">
          <h2 className="text-lg font-bold text-error">Unable to display this report panel</h2>
          <p className="text-sm text-base-content/70">
            An error occurred while loading this tab:
          </p>
          <pre className="text-xs font-mono bg-base-300/80 p-3 rounded overflow-auto max-h-40 text-error whitespace-pre-wrap select-all">
            {this.state.error?.message || String(this.state.error)}
          </pre>
          <button
            type="button"
            className="btn btn-sm btn-outline mt-2"
            onClick={() => this.setState({ error: null })}
          >
            Reload tab
          </button>
        </div>
      );
    }
    return this.props.children;
  }
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
  if (!data) return null;
  const rangeLabel = data?.dateRange?.from && data?.dateRange?.to
    ? `${formatUkDate(data.dateRange.from)} → ${formatUkDate(data.dateRange.to)}`
    : '';

  if (tab === 'private-hire') {
    const t = data.privateHire;
    if (!t) return <div className="p-8 text-center text-base-content/50">No Private Hire data available.</div>;
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
    if (!t) return <div className="p-8 text-center text-base-content/50">No Contracts data available.</div>;
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
    if (!data.byVehicle) return <div className="p-8 text-center text-base-content/50">No vehicle data available.</div>;
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
    if (!data.vehicleUtilisation) return <div className="p-8 text-center text-base-content/50">No utilisation data available.</div>;
    return (
      <VehicleUtilisationPanel
        panel={data.vehicleUtilisation}
        note={data.note}
        rangeLabel={rangeLabel}
      />
    );
  }
  if (tab === 'midday-utilisation') {
    if (!data.middayUtilisation) return <div className="p-8 text-center text-base-content/50">No midday utilisation data available.</div>;
    return (
      <MiddayUtilisationPanel
        panel={data.middayUtilisation}
        note={data.note}
        rangeLabel={rangeLabel}
      />
    );
  }
  if (tab === 'by-driver') {
    if (!data.byDriver) return <div className="p-8 text-center text-base-content/50">No driver data available.</div>;
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
    if (!data.byJobType) return <div className="p-8 text-center text-base-content/50">No job type data available.</div>;
    return (
      <JobTypePanel
        panel={data.byJobType}
        note={data.note}
        rangeLabel={rangeLabel}
      />
    );
  }
  if (tab === 'acceptance') {
    if (!data.acceptance) return <div className="p-8 text-center text-base-content/50">No acceptance data available.</div>;
    return (
      <AcceptancePanel
        panel={data.acceptance}
        note={data.note}
        rangeLabel={rangeLabel}
      />
    );
  }
  if (tab === 'pax-capacity') {
    if (!data.paxCapacity) return <div className="p-8 text-center text-base-content/50">No Pax vs Capacity data available.</div>;
    return (
      <PaxCapacityPanel
        panel={data.paxCapacity}
        note={data.note}
        rangeLabel={rangeLabel}
      />
    );
  }
  if (tab === 'walkaround') {
    return (
      <WalkaroundCompliancePanel
        panel={data.walkaroundCompliance}
        note={data.note}
      />
    );
  }
  if (tab === 'comparison') {
    return (
      <PeriodComparisonPanel
        panel={data.comparison}
        note={data.note}
        depots={data.depots || []}
        segments={data.segments || []}
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
  if (!panel) {
    return (
      <div className="rounded-xl border border-base-300 bg-base-200/50 px-5 py-8">
        <p className="text-sm text-base-content/60">No attribution data available.</p>
      </div>
    );
  }
  const scope = panel?.scopes?.[scopeId] || panel?.scopes?.both;
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
    <div className="space-y-8" data-panel={panel?.id}>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <PanelIntro title={panel?.title} description={panel?.description} note={note} />
        <TripScopeToggle value={scopeId} onChange={setScopeId} />
      </div>
      <KpiRow kpis={scope?.kpis} />
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
    name: v.licensePlate || (v.coach ? String(v.coach).slice(0, 8) : 'Coach'),
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

function MiddayHourlyTooltip({ active, payload, label }) {
  if (!active || !payload || !payload.length) return null;
  const hours = payload[0]?.value || 0;
  return (
    <div className="rounded-lg border border-base-300 bg-base-100 p-2.5 shadow-lg text-xs space-y-1">
      <p className="font-bold text-base-content">{label}</p>
      <div className="flex justify-between gap-3">
        <span className="text-primary font-medium">Sold Hours:</span>
        <span className="font-mono font-semibold">{hours} hrs</span>
      </div>
    </div>
  );
}

function MiddayDowTooltip({ active, payload, label }) {
  if (!active || !payload || !payload.length) return null;
  const hours = payload.find((p) => p.dataKey === 'hoursSold')?.value || 0;
  const trips = payload.find((p) => p.dataKey === 'trips')?.value || 0;
  return (
    <div className="rounded-lg border border-base-300 bg-base-100 p-2.5 shadow-lg text-xs space-y-1">
      <p className="font-bold text-base-content">{label}</p>
      <div className="flex justify-between gap-3">
        <span className="text-secondary font-medium">Sold Hours:</span>
        <span className="font-mono font-semibold">{hours} hrs</span>
      </div>
      <div className="flex justify-between gap-3">
        <span className="text-base-content/60">Trips:</span>
        <span className="font-mono">{trips}</span>
      </div>
    </div>
  );
}

function MiddayPhSlotTooltip({ active, payload, label }) {
  if (!active || !payload || !payload.length) return null;
  const peak = payload.find((p) => p.dataKey === 'peakCoaches')?.value || 0;
  const avg = payload.find((p) => p.dataKey === 'avgCoaches')?.value || 0;
  return (
    <div className="rounded-lg border border-base-300 bg-base-100 p-2.5 shadow-lg text-xs space-y-1">
      <p className="font-bold text-base-content">{label}</p>
      <div className="flex justify-between gap-3">
        <span className="text-primary font-medium">Peak Simultaneous:</span>
        <span className="font-mono font-bold text-primary">{peak} coaches</span>
      </div>
      <div className="flex justify-between gap-3">
        <span className="text-emerald-600 font-medium">Average Active:</span>
        <span className="font-mono font-semibold">{avg} coaches</span>
      </div>
    </div>
  );
}

function MiddayUtilisationPanel({ panel, note, rangeLabel }) {
  const [activeView, setActiveView] = useState('utilisation'); // 'utilisation' | 'capacity'
  const [scopeId, setScopeId] = useState('both');
  const [filterMode, setFilterMode] = useState('all');
  const [search, setSearch] = useState('');
  const [tripSearch, setTripSearch] = useState('');
  const [calcCoaches, setCalcCoaches] = useState(12);

  const scope = panel?.scopes?.[scopeId] || panel?.scopes?.both;
  const phCapacity = scope?.phCapacity || panel?.phCapacity || {};
  const kpis = scope?.kpis;
  const rawVehicles = scope?.vehicles || [];
  const hourlyProfile = scope?.hourlyProfile || [];
  const dayOfWeekProfile = scope?.dayOfWeekProfile || [];
  const rawTrips = scope?.trips || [];
  const scopeLabel = scope?.label || 'Both';

  const busiestDays = phCapacity?.busiestDays || [];
  const slotDemand = phCapacity?.slotDemand || [];
  const sizeDemand = phCapacity?.sizeDemand || [];

  // Capacity Simulator calculation
  const totalTrackedDays = busiestDays.length;
  const daysCovered = busiestDays.filter((d) => (d.peakConcurrent || 0) <= calcCoaches).length;
  const coveragePct = totalTrackedDays > 0 ? Math.round((daysCovered / totalTrackedDays) * 100) : 100;
  const daysExceeded = totalTrackedDays - daysCovered;
  const totalSubcontractShifts = busiestDays.reduce(
    (sum, d) => sum + Math.max(0, (d.peakConcurrent || 0) - calcCoaches),
    0
  );
  const maxDeficit = Math.max(0, ...busiestDays.map((d) => (d.peakConcurrent || 0) - calcCoaches));

  const busiestSlot = useMemo(() => {
    if (!slotDemand.length) return null;
    return [...slotDemand].sort((a, b) => b.peakCoaches - a.peakCoaches)[0];
  }, [slotDemand]);

  const filteredVehicles = useMemo(() => {
    return rawVehicles.filter((v) => {
      if (filterMode === 'active' && v.middayHoursSold <= 0) return false;
      if (filterMode === 'idle' && v.middayHoursSold > 0) return false;
      if (filterMode === 'high' && v.utilisationPct < 0.3) return false;
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

  const filteredTrips = useMemo(() => {
    if (!tripSearch.trim()) return rawTrips;
    const query = tripSearch.trim().toLowerCase();
    return rawTrips.filter((t) => {
      return (
        (t.customerName || '').toLowerCase().includes(query) ||
        (t.coach || '').toLowerCase().includes(query) ||
        (t.licensePlate || '').toLowerCase().includes(query) ||
        (t.tripCode || '').toLowerCase().includes(query) ||
        (t.customerCategory || '').toLowerCase().includes(query)
      );
    });
  }, [rawTrips, tripSearch]);

  function downloadVehiclesCsv() {
    const headers = [
      'Coach',
      'Plate',
      'Type',
      'Seats',
      'Midday Hours Sold (0930-1430)',
      'Total Day Ops Hours',
      'Available Midday Hours',
      'Midday Utilisation Pct',
      'Midday Trips',
      'Revenue ex VAT',
      'Rev Per Midday Hour',
    ];
    const rows = filteredVehicles.map((v) => [
      `"${v.coach}"`,
      `"${v.licensePlate}"`,
      `"${v.vehicleType}"`,
      v.passengerCapacity || '',
      v.middayHoursSold,
      v.totalOperationalHours,
      v.availableMiddayHours,
      `${(v.utilisationPct * 100).toFixed(1)}%`,
      v.trips,
      v.revenue,
      v.revPerMiddayHour,
    ]);
    const csvContent = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `country-lion-midday-utilisation-vehicles-${scopeId}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  function downloadTripsCsv() {
    const headers = [
      'Trip Code',
      'Date',
      'Day',
      'Customer',
      'Category',
      'Coach',
      'Plate',
      'Type',
      'Dep Time',
      'Arr Time',
      'Total Trip Hours',
      'Midday Hours Sold (0930-1430)',
      'Revenue ex VAT',
    ];
    const rows = filteredTrips.map((t) => [
      `"${t.tripCode}"`,
      `"${t.date}"`,
      `"${t.dayOfWeek}"`,
      `"${t.customerName}"`,
      `"${t.customerCategory}"`,
      `"${t.coach}"`,
      `"${t.licensePlate}"`,
      `"${t.tripType}"`,
      `"${t.departureTime}"`,
      `"${t.arrivalTime}"`,
      t.totalTripHours,
      t.middayHoursSold,
      t.revenue,
    ]);
    const csvContent = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `country-lion-midday-trips-${scopeId}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  function downloadBusiestDaysCsv() {
    const headers = [
      'Date',
      'Day of Week',
      'Midday PH Trips',
      'Peak Simultaneous Coaches Needed',
      'Midday Hours Sold (0930-1430)',
      'Revenue ex VAT (£)',
      `Capacity Status (Against ${calcCoaches} Target Coaches)`,
    ];
    const rows = busiestDays.map((d) => [
      `"${d.date}"`,
      `"${d.dayOfWeek}"`,
      d.phTrips,
      d.peakConcurrent,
      d.hoursSold,
      d.revenue,
      `"${d.peakConcurrent <= calcCoaches ? 'Covered In-House' : `Deficit: ${d.peakConcurrent - calcCoaches} coaches`}"`,
    ]);
    const csvContent = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', 'country-lion-midday-ph-capacity-busiest-days.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  if (!panel || !scope) {
    return (
      <div className="rounded-xl border border-base-300 bg-base-200/50 px-5 py-8">
        <p className="text-sm text-base-content/60">
          Midday utilisation data is unavailable. Refresh and try again.
        </p>
      </div>
    );
  }

  const deployedPct = kpis?.totalFleetVehicles > 0
    ? ((kpis.activeVehiclesInWindow / kpis.totalFleetVehicles) * 100).toFixed(0)
    : 0;

  const fleetHeadroom = (kpis?.totalFleetVehicles || 0) - (phCapacity?.peakSimultaneousCoaches || 0);

  return (
    <div className="space-y-8" data-panel="midday-utilisation">
      {/* Sub-navigation View Toggle */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-base-300 pb-3">
        <div className="tabs tabs-boxed bg-base-200/80 p-1">
          <button
            type="button"
            className={`tab tab-sm font-semibold transition-all ${
              activeView === 'utilisation'
                ? 'tab-active bg-primary text-primary-content shadow-sm'
                : 'text-base-content/70 hover:text-base-content'
            }`}
            onClick={() => setActiveView('utilisation')}
          >
            🚌 Fleet Hours &amp; Utilisation
          </button>
          <button
            type="button"
            className={`tab tab-sm font-semibold transition-all ${
              activeView === 'capacity'
                ? 'tab-active bg-primary text-primary-content shadow-sm'
                : 'text-base-content/70 hover:text-base-content'
            }`}
            onClick={() => setActiveView('capacity')}
          >
            🎯 Private Hire Capacity Planner
            {phCapacity?.peakSimultaneousCoaches ? (
              <span className={`ml-2 badge badge-xs ${activeView === 'capacity' ? 'badge-neutral' : 'badge-primary'}`}>
                Peak {phCapacity.peakSimultaneousCoaches}
              </span>
            ) : null}
          </button>
        </div>

        <div className="flex items-center gap-3">
          <span className="badge badge-primary badge-outline text-xs font-semibold py-3 px-3">
            ⏱ 09:30 – 14:30 · 5.0h / day
          </span>
          {activeView === 'utilisation' ? (
            <TripScopeToggle value={scopeId} onChange={setScopeId} />
          ) : (
            <span className="badge badge-neutral text-xs font-medium py-3 px-3">
              Private Hire Scope
            </span>
          )}
        </div>
      </div>

      {activeView === 'utilisation' ? (
        <>
          {/* Quick Capacity Alert Banner */}
          {phCapacity?.peakSimultaneousCoaches ? (
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 p-3.5 rounded-xl border border-primary/20 bg-primary/5">
              <div className="flex items-center gap-2.5">
                <span className="text-xl">💡</span>
                <div className="text-xs">
                  <span className="font-bold text-base-content">
                    Midday Private Hire Capacity Insight:
                  </span>{' '}
                  <span className="text-base-content/80">
                    Peak simultaneous demand requires up to <strong>{phCapacity.peakSimultaneousCoaches} concurrent coaches</strong> (on {phCapacity.peakDayOfWeek} {phCapacity.peakDate}) across {phCapacity.totalPhTrips || 0} midday trips.
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setActiveView('capacity')}
                className="btn btn-xs btn-primary shrink-0 gap-1"
              >
                Open Capacity Planner →
              </button>
            </div>
          ) : null}

          {/* Intro Header */}
          <PanelIntro
            title={panel.title || 'Middle of the Day Utilisation (09:30 – 14:30)'}
            description={
              panel.description ||
              'Operational hours sold between 09:30 and 14:30 (5-hour window). Measures fleet deployment and sold capacity between morning and afternoon commitments.'
            }
            note={note}
          />

          {/* KPI Cards */}
          {kpis ? (
            <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5 rounded-xl border border-base-300 bg-base-200/40 p-4">
              <Kpi
                label="Midday Hours Sold"
                value={`${formatInt(kpis.totalMiddayHoursSold || 0)} hrs`}
                hint="Overlapping 09:30–14:30 window"
                hideDelta
              />
              <Kpi
                label="Available Capacity"
                value={`${formatInt(kpis.totalAvailableMiddayHours || 0)} hrs`}
                hint={`${kpis.daysCount || 0} days × 5.0h × ${kpis.totalFleetVehicles || 0} coaches`}
                hideDelta
              />
              <Kpi
                label="Midday Utilisation"
                value={formatPct(kpis.overallUtilisationPct || 0)}
                hint="Sold ÷ Available Midday Hours"
                hideDelta
              />
              <Kpi
                label="Fleet Deployed"
                value={`${kpis.activeVehiclesInWindow || 0} / ${kpis.totalFleetVehicles || 0}`}
                hint={`${deployedPct}% of fleet active in window`}
                hideDelta
              />
              <Kpi
                label="Midday Sold Revenue"
                value={formatGbp(kpis.totalMiddayRevenue || 0, true)}
                hint={`£${formatInt(kpis.avgRevenuePerMiddayHour || 0)}/hr sold (${kpis.totalMiddayTrips || 0} trips)`}
                hideDelta
              />
            </section>
          ) : null}

          <div className="divider my-0" />

          {/* Visualisations Grid: Hourly Slots + Day of Week */}
          <div className="grid gap-8 lg:grid-cols-2">
            {/* Hourly Progression (09:30 - 14:30) */}
            <div className="rounded-xl border border-base-300 bg-base-100 p-5 shadow-sm space-y-3">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h4 className="text-base font-semibold text-base-content">Midday Hourly Demand Profile</h4>
                  <p className="text-xs text-base-content/60">
                    Operational hours sold across the five 1-hour slots of the 09:30–14:30 window ({scopeLabel}).
                  </p>
                </div>
                <span className="badge badge-sm badge-outline text-xs">5 Hourly Slots</span>
              </div>

              <div className="h-72 w-full pt-2">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={hourlyProfile} margin={{ top: 10, right: 20, bottom: 25, left: 10 }}>
                    <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                    <XAxis
                      dataKey="slot"
                      tick={{ fontSize: 11 }}
                      interval={0}
                      angle={-15}
                      textAnchor="end"
                    />
                    <YAxis
                      name="Sold Hours"
                      unit="h"
                      tick={{ fontSize: 11 }}
                    />
                    <Tooltip content={<MiddayHourlyTooltip />} />
                    <Bar dataKey="hoursSold" name="Sold Hours" fill="#0284c7" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Day-of-Week Pattern */}
            <div className="rounded-xl border border-base-300 bg-base-100 p-5 shadow-sm space-y-3">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h4 className="text-base font-semibold text-base-content">Midday Utilisation by Day of Week</h4>
                  <p className="text-xs text-base-content/60">
                    Sold operational hours and trip volume between 09:30 and 14:30 by day of week.
                  </p>
                </div>
                <span className="badge badge-sm badge-outline text-xs">Mon – Sun</span>
              </div>

              <div className="h-72 w-full pt-2">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={dayOfWeekProfile} margin={{ top: 10, right: 20, bottom: 25, left: 10 }}>
                    <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                    <XAxis
                      dataKey="day"
                      tick={{ fontSize: 11 }}
                      tickFormatter={(d) => d.slice(0, 3)}
                    />
                    <YAxis
                      name="Sold Hours"
                      unit="h"
                      tick={{ fontSize: 11 }}
                    />
                    <Tooltip content={<MiddayDowTooltip />} />
                    <Bar dataKey="hoursSold" name="Sold Hours" fill="#8b5cf6" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          {/* Vehicle Fleet Breakdown Table */}
          <section className="space-y-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h3 className="text-lg font-bold text-base-content">Coaches &amp; Midday Utilisation</h3>
                <p className="text-xs text-base-content/60">
                  Showing {filteredVehicles.length} of {rawVehicles.length} coaches for {scopeLabel} trips ({rangeLabel}).
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <div className="join">
                  {[
                    ['all', 'All'],
                    ['active', 'Active In Midday'],
                    ['high', 'High (≥30%)'],
                    ['idle', 'Idle (0h)'],
                  ].map(([mode, label]) => (
                    <button
                      key={mode}
                      type="button"
                      onClick={() => setFilterMode(mode)}
                      className={`btn btn-xs join-item ${filterMode === mode ? 'btn-primary' : 'btn-ghost'}`}
                    >
                      {label}
                    </button>
                  ))}
                </div>

                <input
                  type="text"
                  placeholder="Search coach / plate..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="input input-xs input-bordered w-36 sm:w-48"
                />

                <button
                  type="button"
                  onClick={downloadVehiclesCsv}
                  className="btn btn-xs btn-outline gap-1"
                  title="Export vehicle utilisation to CSV"
                >
                  📥 CSV
                </button>
              </div>
            </div>

            <div className="overflow-x-auto rounded-xl border border-base-300 bg-base-100 shadow-sm">
              <SortableTable
                rowKey={(r) => `${r.coach}-${r.licensePlate}`}
                defaultSort={{ key: 'middayHoursSold', dir: 'desc' }}
                rows={filteredVehicles}
                columns={[
                  {
                    key: 'coach',
                    label: 'Coach',
                    render: (row) => (
                      <div className="font-semibold text-base-content">
                        {row.coach}
                      </div>
                    ),
                  },
                  {
                    key: 'licensePlate',
                    label: 'Registration',
                    render: (row) => (
                      <span className="badge badge-neutral badge-sm font-mono text-[11px]">
                        {row.licensePlate || '—'}
                      </span>
                    ),
                  },
                  {
                    key: 'vehicleType',
                    label: 'Type',
                    render: (row) => (
                      <span className="text-xs text-base-content/70">
                        {row.vehicleType}
                        {row.passengerCapacity ? ` (${row.passengerCapacity} seats)` : ''}
                      </span>
                    ),
                  },
                  {
                    key: 'middayHoursSold',
                    label: 'Midday Sold (0930-1430)',
                    type: 'number',
                    align: 'right',
                    render: (row) => {
                      const pct = Math.min(100, Math.round(row.utilisationPct * 100));
                      return (
                        <div className="flex flex-col items-end gap-1">
                          <span className="font-mono font-bold text-primary">
                            {Number(row.middayHoursSold || 0).toFixed(1)} h
                          </span>
                          <div className="w-20 bg-base-200 rounded-full h-1.5 overflow-hidden">
                            <div
                              className={`h-full ${pct >= 35 ? 'bg-success' : pct >= 15 ? 'bg-warning' : 'bg-base-content/30'}`}
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                        </div>
                      );
                    },
                  },
                  {
                    key: 'availableMiddayHours',
                    label: 'Available (5h/day)',
                    type: 'number',
                    align: 'right',
                    render: (row) => (
                      <span className="font-mono text-xs text-base-content/60">
                        {Number(row.availableMiddayHours || 0).toFixed(0)} h
                      </span>
                    ),
                  },
                  {
                    key: 'utilisationPct',
                    label: 'Midday Utilisation %',
                    type: 'number',
                    align: 'right',
                    render: (row) => {
                      const pct = (Number(row.utilisationPct) || 0) * 100;
                      const badgeClass =
                        pct >= 35
                          ? 'badge-success text-success-content font-bold'
                          : pct >= 15
                          ? 'badge-warning text-warning-content font-medium'
                          : pct > 0
                          ? 'badge-ghost text-base-content/70'
                          : 'badge-error badge-outline';
                      return (
                        <span className={`badge badge-sm ${badgeClass}`}>
                          {pct.toFixed(1)}%
                        </span>
                      );
                    },
                  },
                  {
                    key: 'totalOperationalHours',
                    label: 'Full Day Hours',
                    type: 'number',
                    align: 'right',
                    render: (row) => (
                      <span className="font-mono text-xs text-base-content/70">
                        {Number(row.totalOperationalHours || 0).toFixed(1)} h
                      </span>
                    ),
                  },
                  {
                    key: 'trips',
                    label: 'Trips',
                    type: 'number',
                    align: 'right',
                    render: (row) => (
                      <span className="font-mono text-xs font-semibold">
                        {row.trips}
                      </span>
                    ),
                  },
                  {
                    key: 'revenue',
                    label: 'Revenue',
                    type: 'number',
                    align: 'right',
                    render: (row) => (
                      <span className="font-mono font-semibold text-xs">
                        {formatGbp(row.revenue, true)}
                      </span>
                    ),
                  },
                  {
                    key: 'revPerMiddayHour',
                    label: 'Rev / Sold Hr',
                    type: 'number',
                    align: 'right',
                    render: (row) => (
                      <span className="font-mono text-xs text-base-content/70">
                        £{formatInt(row.revPerMiddayHour || 0)}/h
                      </span>
                    ),
                  },
                ]}
              />
            </div>
          </section>

          {/* Individual Midday Trips Drill-down */}
          <section className="space-y-4 pt-4 border-t border-base-300">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h3 className="text-lg font-bold text-base-content">Trips Operating Between 09:30 &amp; 14:30</h3>
                <p className="text-xs text-base-content/60">
                  Individual journeys overlapping the midday window. Showing {filteredTrips.length} trips ({scopeLabel}).
                </p>
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="text"
                  placeholder="Search customer, coach, code..."
                  value={tripSearch}
                  onChange={(e) => setTripSearch(e.target.value)}
                  className="input input-xs input-bordered w-48 sm:w-64"
                />
                <button
                  type="button"
                  onClick={downloadTripsCsv}
                  className="btn btn-xs btn-outline gap-1"
                  title="Export midday trips to CSV"
                >
                  📥 CSV
                </button>
              </div>
            </div>

            <div className="overflow-x-auto rounded-xl border border-base-300 bg-base-100 shadow-sm max-h-[32rem]">
              <SortableTable
                rowKey={(r) => `${r.tripCode}-${r.date}`}
                defaultSort={{ key: 'middayHoursSold', dir: 'desc' }}
                rows={filteredTrips}
                columns={[
                  {
                    key: 'tripCode',
                    label: 'Trip Code',
                    render: (row) => (
                      <span className="font-mono text-xs font-semibold text-primary">
                        {row.tripCode}
                      </span>
                    ),
                  },
                  {
                    key: 'date',
                    label: 'Date',
                    render: (row) => (
                      <div className="text-xs">
                        <div className="font-medium text-base-content">{row.date}</div>
                        <div className="text-[11px] text-base-content/50">{row.dayOfWeek}</div>
                      </div>
                    ),
                  },
                  {
                    key: 'customerName',
                    label: 'Customer',
                    render: (row) => (
                      <div className="text-xs max-w-[12rem] truncate">
                        <div className="font-semibold text-base-content truncate" title={row.customerName}>
                          {row.customerName}
                        </div>
                        <div className="text-[11px] text-base-content/50 truncate">
                          {row.customerCategory || 'Uncategorised'}
                        </div>
                      </div>
                    ),
                  },
                  {
                    key: 'coach',
                    label: 'Vehicle',
                    render: (row) => (
                      <div className="text-xs">
                        <span className="font-medium">{row.coach}</span>
                        {row.licensePlate ? (
                          <span className="ml-1.5 badge badge-ghost badge-xs font-mono">
                            {row.licensePlate}
                          </span>
                        ) : null}
                      </div>
                    ),
                  },
                  {
                    key: 'tripType',
                    label: 'Type',
                    render: (row) => (
                      <span
                        className={`badge badge-xs font-medium ${
                          row.tripType === 'Private Hire' ? 'badge-primary badge-outline' : 'badge-secondary badge-outline'
                        }`}
                      >
                        {row.tripType}
                      </span>
                    ),
                  },
                  {
                    key: 'departureTime',
                    label: 'Times',
                    render: (row) => (
                      <span className="font-mono text-xs text-base-content/80">
                        {row.departureTime || '—'} → {row.arrivalTime || '—'}
                      </span>
                    ),
                  },
                  {
                    key: 'totalTripHours',
                    label: 'Total Duration',
                    type: 'number',
                    align: 'right',
                    render: (row) => (
                      <span className="font-mono text-xs text-base-content/60">
                        {Number(row.totalTripHours || 0).toFixed(1)} h
                      </span>
                    ),
                  },
                  {
                    key: 'middayHoursSold',
                    label: 'Midday Sold',
                    type: 'number',
                    align: 'right',
                    render: (row) => (
                      <span className="badge badge-accent badge-sm font-mono font-bold">
                        {Number(row.middayHoursSold || 0).toFixed(1)} h
                      </span>
                    ),
                  },
                  {
                    key: 'revenue',
                    label: 'Revenue',
                    type: 'number',
                    align: 'right',
                    render: (row) => (
                      <span className="font-mono font-semibold text-xs">
                        {formatGbp(row.revenue, true)}
                      </span>
                    ),
                  },
                ]}
              />
            </div>
          </section>
        </>
      ) : (
        /* Private Hire Capacity Planner View */
        <div className="space-y-8 animate-fadeIn">
          <PanelIntro
            title="Private Hire Midday Capacity Planning (09:30 – 14:30)"
            description="Determines simultaneous vehicle capacity required to service Private Hire trips operating between 09:30 and 14:30. Evaluates peak fleet concurrency, vehicle seating requirements, hourly demand crunches, and subcontracting risk."
            note={note}
          />

          {/* Capacity KPIs */}
          <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5 rounded-xl border border-primary/20 bg-primary/5 p-4">
            <Kpi
              label="Peak Concurrent Coaches"
              value={`${phCapacity?.peakSimultaneousCoaches || 0} coaches`}
              hint={`Peak on ${phCapacity?.peakDayOfWeek || ''} ${phCapacity?.peakDate || ''}`}
              hideDelta
            />
            <Kpi
              label="Total Midday PH Trips"
              value={`${formatInt(phCapacity?.totalPhTrips || 0)} trips`}
              hint={`Avg ${phCapacity?.avgTripsPerDay || 0} trips / day`}
              hideDelta
            />
            <Kpi
              label="Midday PH Hours Sold"
              value={`${formatInt(phCapacity?.totalPhMiddayHours || 0)} hrs`}
              hint={`£${formatInt(phCapacity?.totalPhMiddayRevenue || 0)} revenue`}
              hideDelta
            />
            <Kpi
              label="Busiest Midday Slot"
              value={busiestSlot?.slot || '10:30 - 11:30'}
              hint={`${busiestSlot?.peakCoaches || 0} coaches needed simultaneously`}
              hideDelta
            />
            <Kpi
              label="Midday Fleet Buffer"
              value={fleetHeadroom >= 0 ? `+${fleetHeadroom} spare` : `${fleetHeadroom} deficit`}
              hint={`${kpis?.totalFleetVehicles || 0} fleet - ${phCapacity?.peakSimultaneousCoaches || 0} peak`}
              hideDelta
            />
          </section>

          {/* Slot Concurrency Demand + Vehicle Sizing Bands */}
          <div className="grid gap-8 lg:grid-cols-2">
            {/* Hourly Slot Concurrency Chart */}
            <div className="rounded-xl border border-base-300 bg-base-100 p-5 shadow-sm space-y-3">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h4 className="text-base font-semibold text-base-content">Simultaneous Coaches Needed by Hour Slot</h4>
                  <p className="text-xs text-base-content/60">
                    Peak simultaneous vs average concurrent Private Hire coaches active in each 1-hour window.
                  </p>
                </div>
                <div className="flex items-center gap-2 text-[11px]">
                  <span className="inline-flex items-center gap-1 font-medium text-primary">
                    <span className="w-2.5 h-2.5 rounded-sm bg-primary inline-block" /> Peak Needed
                  </span>
                  <span className="inline-flex items-center gap-1 font-medium text-emerald-600">
                    <span className="w-2.5 h-2.5 rounded-sm bg-emerald-500 inline-block" /> Average Active
                  </span>
                </div>
              </div>

              <div className="h-72 w-full pt-2">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={slotDemand} margin={{ top: 10, right: 20, bottom: 25, left: 10 }}>
                    <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                    <XAxis
                      dataKey="slot"
                      tick={{ fontSize: 11 }}
                      interval={0}
                      angle={-15}
                      textAnchor="end"
                    />
                    <YAxis
                      name="Coaches"
                      unit=""
                      tick={{ fontSize: 11 }}
                    />
                    <Tooltip content={<MiddayPhSlotTooltip />} />
                    <Bar dataKey="peakCoaches" name="Peak Needed" fill="#0284c7" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="avgCoaches" name="Average Active" fill="#10b981" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Vehicle Size & Seating Bands Requirements */}
            <div className="rounded-xl border border-base-300 bg-base-100 p-5 shadow-sm space-y-3 flex flex-col justify-between">
              <div>
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h4 className="text-base font-semibold text-base-content">Capacity Needed by Vehicle Size Band</h4>
                    <p className="text-xs text-base-content/60">
                      Midday Private Hire trips and hours sold grouped by seating capacity.
                    </p>
                  </div>
                  <span className="badge badge-sm badge-outline text-xs">{sizeDemand.length} Bands</span>
                </div>

                <div className="mt-4 space-y-2.5">
                  {sizeDemand.map((band) => {
                    const totalTripsAll = phCapacity?.totalPhTrips || 1;
                    const sharePct = Math.round(((band.totalTrips || 0) / totalTripsAll) * 100);
                    return (
                      <div
                        key={band.key}
                        className="p-3 rounded-lg border border-base-200 bg-base-200/40 hover:bg-base-200/70 transition-colors flex items-center justify-between gap-3"
                      >
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-sm text-base-content">{band.band}</span>
                            <span className="badge badge-xs badge-neutral font-mono">
                              {band.avgPax ? `~ ${band.avgPax} pax` : '—'}
                            </span>
                          </div>
                          <div className="text-xs text-base-content/60 mt-0.5">
                            {band.hoursSold} midday hrs · {formatGbp(band.revenue, true)} rev
                          </div>
                        </div>

                        <div className="text-right shrink-0">
                          <span className="font-mono font-bold text-base text-primary">
                            {band.totalTrips} trips
                          </span>
                          <div className="text-[11px] text-base-content/50 font-medium">
                            {sharePct}% of demand
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="text-[11px] text-base-content/50 italic pt-2 border-t border-base-200">
                * Seating capacity bands match Country Lion fleet categories (Minibus, Midi, Standard, Executive, High Capacity).
              </div>
            </div>
          </div>

          {/* Interactive Capacity & Subcontracting Calculator (What-If) */}
          <section className="rounded-xl border border-base-300 bg-gradient-to-r from-base-100 to-base-200/50 p-5 shadow-sm space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div>
                <h4 className="text-base font-bold text-base-content flex items-center gap-2">
                  <span>🧮</span> Interactive Capacity Simulator &amp; Subcontracting Risk
                </h4>
                <p className="text-xs text-base-content/60">
                  Model how many dedicated in-house coaches are required between 09:30 and 14:30 to avoid outsourcing.
                </p>
              </div>

              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-base-content/70">Target Midday Fleet:</span>
                <div className="join">
                  {[8, 10, 12, 14, 16].map((num) => (
                    <button
                      key={num}
                      type="button"
                      onClick={() => setCalcCoaches(num)}
                      className={`btn btn-xs join-item ${calcCoaches === num ? 'btn-primary' : 'btn-outline'}`}
                    >
                      {num}
                    </button>
                  ))}
                </div>
                <input
                  type="number"
                  min="1"
                  max="50"
                  value={calcCoaches}
                  onChange={(e) => setCalcCoaches(Math.max(1, parseInt(e.target.value, 10) || 1))}
                  className="input input-xs input-bordered w-16 text-center font-mono font-bold"
                />
                <span className="text-xs font-medium text-base-content/60">coaches</span>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 pt-2">
              <div className="rounded-lg border border-base-200 bg-base-100 p-3.5 space-y-1 shadow-sm">
                <span className="text-xs font-medium text-base-content/60">Demand Coverage</span>
                <div className="flex items-baseline justify-between">
                  <span className={`text-2xl font-black font-mono ${coveragePct >= 90 ? 'text-success' : coveragePct >= 75 ? 'text-warning' : 'text-error'}`}>
                    {coveragePct}%
                  </span>
                  <span className="text-xs text-base-content/50">of days fully covered</span>
                </div>
                <div className="w-full bg-base-200 rounded-full h-1.5 overflow-hidden mt-1">
                  <div
                    className={`h-full ${coveragePct >= 90 ? 'bg-success' : coveragePct >= 75 ? 'bg-warning' : 'bg-error'}`}
                    style={{ width: `${coveragePct}%` }}
                  />
                </div>
              </div>

              <div className="rounded-lg border border-base-200 bg-base-100 p-3.5 space-y-1 shadow-sm">
                <span className="text-xs font-medium text-base-content/60">Days Exceeding Allocation</span>
                <div className="flex items-baseline justify-between">
                  <span className="text-2xl font-black font-mono text-base-content">
                    {daysExceeded}
                  </span>
                  <span className="text-xs text-base-content/50">of {totalTrackedDays} active days</span>
                </div>
                <p className="text-[11px] text-base-content/50 mt-1">
                  {daysExceeded === 0 ? '✨ Zero overflow days' : 'Requires subcontract or relief'}
                </p>
              </div>

              <div className="rounded-lg border border-base-200 bg-base-100 p-3.5 space-y-1 shadow-sm">
                <span className="text-xs font-medium text-base-content/60">Subcontract Shifts Needed</span>
                <div className="flex items-baseline justify-between">
                  <span className={`text-2xl font-black font-mono ${totalSubcontractShifts > 0 ? 'text-warning' : 'text-success'}`}>
                    {totalSubcontractShifts}
                  </span>
                  <span className="text-xs text-base-content/50">coach-shifts</span>
                </div>
                <p className="text-[11px] text-base-content/50 mt-1">
                  Across entire date range
                </p>
              </div>

              <div className="rounded-lg border border-base-200 bg-base-100 p-3.5 space-y-1 shadow-sm">
                <span className="text-xs font-medium text-base-content/60">Worst-Day Shortfall</span>
                <div className="flex items-baseline justify-between">
                  <span className={`text-2xl font-black font-mono ${maxDeficit > 0 ? 'text-error' : 'text-success'}`}>
                    {maxDeficit > 0 ? `-${maxDeficit}` : '0'}
                  </span>
                  <span className="text-xs text-base-content/50">coaches peak deficit</span>
                </div>
                <p className="text-[11px] text-base-content/50 mt-1">
                  {maxDeficit > 0 ? `Peak need was ${phCapacity?.peakSimultaneousCoaches || 0}` : 'Full in-house headroom'}
                </p>
              </div>
            </div>
          </section>

          {/* Busiest Days Table */}
          <section className="space-y-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h3 className="text-lg font-bold text-base-content">Busiest Midday Private Hire Dates</h3>
                <p className="text-xs text-base-content/60">
                  Dates ranked by midday Private Hire trip volume and simultaneous coaches required (09:30 – 14:30).
                </p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={downloadBusiestDaysCsv}
                  className="btn btn-xs btn-outline gap-1"
                  title="Export busiest days to CSV"
                >
                  📥 Download CSV
                </button>
              </div>
            </div>

            <div className="overflow-x-auto rounded-xl border border-base-300 bg-base-100 shadow-sm max-h-[30rem]">
              <SortableTable
                rowKey={(r) => r.date}
                defaultSort={{ key: 'phTrips', dir: 'desc' }}
                rows={busiestDays}
                columns={[
                  {
                    key: 'date',
                    label: 'Date',
                    render: (row) => (
                      <div className="text-xs">
                        <div className="font-bold text-base-content font-mono">{row.date}</div>
                        <div className="text-[11px] text-base-content/60">{row.dayOfWeek}</div>
                      </div>
                    ),
                  },
                  {
                    key: 'phTrips',
                    label: 'Midday PH Trips',
                    type: 'number',
                    align: 'right',
                    render: (row) => (
                      <span className="font-mono font-bold text-sm text-primary">
                        {row.phTrips}
                      </span>
                    ),
                  },
                  {
                    key: 'peakConcurrent',
                    label: 'Simultaneous Coaches Needed',
                    type: 'number',
                    align: 'right',
                    render: (row) => {
                      const concurrent = Number(row.peakConcurrent) || 0;
                      const isOver = concurrent > calcCoaches;
                      return (
                        <div className="flex items-center justify-end gap-2">
                          <span className={`badge badge-sm font-mono font-bold ${
                            concurrent >= 12
                              ? 'badge-error text-error-content'
                              : concurrent >= 8
                              ? 'badge-warning text-warning-content'
                              : 'badge-success text-success-content'
                          }`}>
                            {concurrent} coaches
                          </span>
                          {isOver ? (
                            <span className="text-[10px] text-error font-bold">
                              (+{concurrent - calcCoaches} over)
                            </span>
                          ) : null}
                        </div>
                      );
                    },
                  },
                  {
                    key: 'hoursSold',
                    label: 'Midday Hours Sold',
                    type: 'number',
                    align: 'right',
                    render: (row) => (
                      <span className="font-mono text-xs text-base-content/80">
                        {Number(row.hoursSold || 0).toFixed(1)} h
                      </span>
                    ),
                  },
                  {
                    key: 'revenue',
                    label: 'Midday Revenue',
                    type: 'number',
                    align: 'right',
                    render: (row) => (
                      <span className="font-mono font-semibold text-xs text-base-content">
                        {formatGbp(row.revenue, true)}
                      </span>
                    ),
                  },
                ]}
              />
            </div>
          </section>
        </div>
      )}
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

function AcceptanceTooltip({ active, payload, label }) {
  if (!active || !payload || !payload.length) return null;
  const item = payload[0]?.payload;
  if (!item) return null;
  return (
    <div className="rounded-lg border border-base-300 bg-base-100 p-3 shadow-xl text-xs space-y-1.5 z-50">
      <p className="font-semibold text-sm text-base-content border-b border-base-300 pb-1">{item.fullName || label}</p>
      <div className="grid grid-cols-2 gap-x-4 gap-y-1 pt-0.5 text-base-content/80">
        <div>Total Quotes:</div>
        <div className="font-medium text-right">{formatInt(item.quotes || 0)}</div>
        <div className="text-emerald-600 font-medium flex items-center gap-1.5">
          <span className="inline-block w-2 h-2 rounded-full bg-emerald-500" /> Won:
        </div>
        <div className="font-semibold text-emerald-600 text-right">{formatInt(item.won || 0)}</div>
        <div className="text-rose-500 font-medium flex items-center gap-1.5">
          <span className="inline-block w-2 h-2 rounded-full bg-rose-500" /> Lost:
        </div>
        <div className="font-semibold text-rose-500 text-right">{formatInt(item.lost || 0)}</div>
        {item.openQuotes > 0 ? (
          <>
            <div className="text-amber-500 font-medium flex items-center gap-1.5">
              <span className="inline-block w-2 h-2 rounded-full bg-amber-400" /> Open:
            </div>
            <div className="font-semibold text-amber-500 text-right">{formatInt(item.openQuotes)}</div>
          </>
        ) : null}
        <div className="border-t border-base-200 pt-1 text-base-content font-medium">Win Rate:</div>
        <div className="border-t border-base-200 pt-1 font-bold text-right text-emerald-600">
          {formatPct((item.winRate || 0) / 100)}
        </div>
        <div className="text-base-content/70">Loss Rate:</div>
        <div className="font-semibold text-right text-rose-500">
          {formatPct((item.lossRate || 0) / 100)}
        </div>
      </div>
    </div>
  );
}

function AcceptanceRateBarTooltip({ active, payload, label }) {
  if (!active || !payload || !payload.length) return null;
  const item = payload[0]?.payload;
  if (!item) return null;
  return (
    <div className="rounded-lg border border-base-300 bg-base-100 p-3 shadow-xl text-xs space-y-1.5 z-50">
      <p className="font-semibold text-sm text-base-content border-b border-base-300 pb-1">{item.fullName || label}</p>
      <div className="space-y-1 pt-0.5">
        <div className="flex justify-between items-center gap-4">
          <span className="text-base-content/70">Acceptance Rate:</span>
          <span className="font-bold text-sm text-emerald-600">{item.winRate}%</span>
        </div>
        <div className="flex justify-between items-center gap-4">
          <span className="text-base-content/70">Loss Rate:</span>
          <span className="font-semibold text-rose-500">{item.lossRate}%</span>
        </div>
        <div className="flex justify-between items-center gap-4 text-base-content/60 border-t border-base-200 pt-1">
          <span>Total Quotes:</span>
          <span className="font-medium text-base-content">{formatInt(item.quotes)} ({formatInt(item.won)} won / {formatInt(item.lost)} lost)</span>
        </div>
      </div>
    </div>
  );
}

function AcceptancePanel({ panel, note, rangeLabel }) {
  const [viewMode, setViewMode] = useState('brackets'); // 'brackets' | 'specific'
  const [paxSearch, setPaxSearch] = useState('');
  const [sortBy, setSortBy] = useState('quotes'); // 'quotes' | 'pax' | 'winRate' | 'lossRate'
  const [sortAsc, setSortAsc] = useState(false);

  const rate = panel?.acceptanceRate;
  const bands = panel?.byPaxBand || [];
  const rawPaxList = panel?.byPax || [];

  // Filtered and sorted specific pax list - HOOKS UNCONDITIONALLY AT TOP
  const filteredPaxList = useMemo(() => {
    let list = rawPaxList;
    if (paxSearch.trim()) {
      const q = paxSearch.trim().toLowerCase();
      list = list.filter((p) => String(p.pax).includes(q) || (p.band && p.band.toLowerCase().includes(q)));
    }
    return [...list].sort((a, b) => {
      let va = a[sortBy];
      let vb = b[sortBy];
      if (sortBy === 'winRate') {
        va = a.acceptanceRate || 0;
        vb = b.acceptanceRate || 0;
      } else if (sortBy === 'lossRate') {
        va = a.lossRate || 0;
        vb = b.lossRate || 0;
      }
      return sortAsc ? (va > vb ? 1 : -1) : (va < vb ? 1 : -1);
    });
  }, [rawPaxList, paxSearch, sortBy, sortAsc]);

  if (!panel) {
    return (
      <div className="rounded-xl border border-base-300 bg-base-200/50 px-5 py-8">
        <p className="text-sm text-base-content/60">Acceptance data is unavailable. Refresh and try again.</p>
      </div>
    );
  }

  // Key takeaways
  const validBands = bands.filter((b) => b.key !== 'unspecified' && b.quotes > 0);
  const bestBand = validBands.length
    ? [...validBands].sort((a, b) => (b.acceptanceRate || 0) - (a.acceptanceRate || 0))[0]
    : null;
  const worstBand = validBands.length
    ? [...validBands].sort((a, b) => (b.lossRate || 0) - (a.lossRate || 0))[0]
    : null;
  const mostQuotedBand = validBands.length
    ? [...validBands].sort((a, b) => (b.quotes || 0) - (a.quotes || 0))[0]
    : null;

  // Chart data for Brackets
  const bracketChartData = bands
    .filter((b) => b.quotes > 0)
    .map((b) => ({
      name: (b.band || '').replace(/\s*\([^)]*\)/, ''), // short label e.g. '1 - 16'
      fullName: b.band,
      won: b.won,
      lost: b.lost,
      openQuotes: b.openQuotes,
      quotes: b.quotes,
      winRate: Math.round((b.acceptanceRate || 0) * 1000) / 10,
      lossRate: Math.round((b.lossRate || 0) * 1000) / 10,
    }));

  const handleSort = (field) => {
    if (sortBy === field) {
      setSortAsc(!sortAsc);
    } else {
      setSortBy(field);
      setSortAsc(false);
    }
  };

  const overallAvgWinRatePct = rate != null ? Math.round(rate * 1000) / 10 : 0;

  return (
    <div className="space-y-8" data-panel="acceptance">
      <PanelIntro title={panel.title} description={panel.description} note={note} />
      <p className="text-sm text-base-content/55">
        Order dates in range: {rangeLabel}. Private Hire quotes only (order type Normal). Grouped by requested passenger capacity.
      </p>

      {/* 1. Overall KPIs */}
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

      {/* 2. Key Commercial Takeaways */}
      {validBands.length > 0 && (
        <section className="grid gap-4 sm:grid-cols-3">
          <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wider text-emerald-700 dark:text-emerald-400">
                  Winning Most Jobs
                </span>
                <span className="badge badge-success badge-sm text-xs font-medium">Top Conversion</span>
              </div>
              <p className="mt-2 text-base font-bold text-base-content">{bestBand?.band}</p>
              <p className="mt-1 text-2xl font-black text-emerald-600 dark:text-emerald-400">
                {formatPct(bestBand?.acceptanceRate || 0)}
              </p>
            </div>
            <p className="mt-2 text-xs text-base-content/65">
              Won {formatInt(bestBand?.won || 0)} of {formatInt((bestBand?.won || 0) + (bestBand?.lost || 0))} decided quotes.
            </p>
          </div>

          <div className="rounded-xl border border-rose-500/20 bg-rose-500/5 p-4 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wider text-rose-700 dark:text-rose-400">
                  Losing Disproportionately
                </span>
                <span className="badge badge-error badge-sm text-xs font-medium">Highest Loss Rate</span>
              </div>
              <p className="mt-2 text-base font-bold text-base-content">{worstBand?.band}</p>
              <p className="mt-1 text-2xl font-black text-rose-600 dark:text-rose-400">
                {formatPct(worstBand?.lossRate || 0)} loss
              </p>
            </div>
            <p className="mt-2 text-xs text-base-content/65">
              Lost {formatInt(worstBand?.lost || 0)} quotes ({formatInt(worstBand?.won || 0)} won, only {formatPct(worstBand?.acceptanceRate || 0)} win rate).
            </p>
          </div>

          <div className="rounded-xl border border-sky-500/20 bg-sky-500/5 p-4 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wider text-sky-700 dark:text-sky-400">
                  Highest Quote Volume
                </span>
                <span className="badge badge-info badge-sm text-xs font-medium">Core Market</span>
              </div>
              <p className="mt-2 text-base font-bold text-base-content">{mostQuotedBand?.band}</p>
              <p className="mt-1 text-2xl font-black text-sky-600 dark:text-sky-400">
                {formatInt(mostQuotedBand?.quotes || 0)} quotes
              </p>
            </div>
            <p className="mt-2 text-xs text-base-content/65">
              {panel.quotes > 0 ? formatPct(mostQuotedBand?.quotes / panel.quotes) : '-'} of all quote requests received.
            </p>
          </div>
        </section>
      )}

      {/* 3. Visual Charts */}
      {bracketChartData.length > 0 && (
        <section className="grid gap-6 lg:grid-cols-2">
          {/* Chart 1: Won vs Lost Volume */}
          <div className="rounded-2xl border border-base-300 bg-base-100 p-5 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="font-semibold text-base-content">Quotes Won vs Lost by Vehicle Bracket</h3>
                <p className="text-xs text-base-content/60">Volume of quotes won and lost across vehicle capacity bands</p>
              </div>
              <span className="badge badge-sm badge-outline text-xs">Volume</span>
            </div>
            <div className="h-72 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={bracketChartData} margin={{ top: 15, right: 15, left: -10, bottom: 25 }}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.2} vertical={false} />
                  <XAxis
                    dataKey="name"
                    tick={{ fontSize: 11 }}
                    interval={0}
                    angle={-15}
                    textAnchor="end"
                    tickLine={false}
                  />
                  <YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                  <Tooltip content={<AcceptanceTooltip />} />
                  <Legend verticalAlign="top" align="right" height={36} wrapperStyle={{ fontSize: 12 }} />
                  <Bar dataKey="won" name="Won Quotes" fill="#10b981" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="lost" name="Lost Quotes" fill="#f43f5e" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Chart 2: Win Rate % Comparison */}
          <div className="rounded-2xl border border-base-300 bg-base-100 p-5 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="font-semibold text-base-content">Acceptance Rate (%) by Vehicle Bracket</h3>
                <p className="text-xs text-base-content/60">Percentage of quotes won. Dashed line indicates fleet average ({overallAvgWinRatePct}%)</p>
              </div>
              <span className="badge badge-sm badge-outline text-xs">Win Rate %</span>
            </div>
            <div className="h-72 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={bracketChartData} margin={{ top: 15, right: 15, left: -10, bottom: 25 }}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.2} vertical={false} />
                  <XAxis
                    dataKey="name"
                    tick={{ fontSize: 11 }}
                    interval={0}
                    angle={-15}
                    textAnchor="end"
                    tickLine={false}
                  />
                  <YAxis
                    tick={{ fontSize: 11 }}
                    domain={[0, 100]}
                    tickFormatter={(v) => `${v}%`}
                    tickLine={false}
                    axisLine={false}
                  />
                  <Tooltip content={<AcceptanceRateBarTooltip />} />
                  {overallAvgWinRatePct > 0 && (
                    <ReferenceLine
                      y={overallAvgWinRatePct}
                      stroke="#64748b"
                      strokeDasharray="4 4"
                      label={{
                        value: `Avg ${overallAvgWinRatePct}%`,
                        position: 'top',
                        fill: '#64748b',
                        fontSize: 10,
                      }}
                    />
                  )}
                  <Bar dataKey="winRate" name="Win Rate %" radius={[4, 4, 0, 0]}>
                    {bracketChartData.map((entry, index) => {
                      const color =
                        entry.winRate >= overallAvgWinRatePct
                          ? '#10b981' // Green
                          : entry.winRate >= 35
                          ? '#f59e0b' // Amber
                          : '#f43f5e'; // Rose
                      return <Cell key={`cell-${index}`} fill={color} />;
                    })}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </section>
      )}

      {/* 4. Interactive Breakdown Tables with Switcher */}
      <section className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-base-300 pb-3">
          <div>
            <h3 className="text-lg font-semibold text-base-content">Acceptance Breakdown by Passenger Numbers</h3>
            <p className="text-xs text-base-content/60">
              Inspect quote performance by standard coach capacity brackets or explore specific passenger counts.
            </p>
          </div>
          <div className="join bg-base-200 p-0.5 rounded-lg border border-base-300 self-start sm:self-auto">
            <button
              type="button"
              className={`join-item btn btn-xs sm:btn-sm px-3 ${viewMode === 'brackets' ? 'btn-primary' : 'btn-ghost'}`}
              onClick={() => setViewMode('brackets')}
            >
              Capacity Brackets ({bands.length})
            </button>
            <button
              type="button"
              className={`join-item btn btn-xs sm:btn-sm px-3 ${viewMode === 'specific' ? 'btn-primary' : 'btn-ghost'}`}
              onClick={() => setViewMode('specific')}
            >
              Specific Passenger Sizes ({rawPaxList.length})
            </button>
          </div>
        </div>

        {/* View Mode A: Capacity Brackets Table */}
        {viewMode === 'brackets' && (
          <div className="overflow-x-auto rounded-xl border border-base-300 bg-base-100">
            <table className="table table-sm">
              <thead className="bg-base-200/60 text-xs font-semibold uppercase text-base-content/70">
                <tr>
                  <th className="py-3 px-4">Capacity Bracket</th>
                  <th className="py-3 px-3 text-right">Quotes</th>
                  <th className="py-3 px-3 text-right text-emerald-600">Won</th>
                  <th className="py-3 px-3 text-right text-rose-500">Lost</th>
                  <th className="py-3 px-3 text-right text-amber-500">Open</th>
                  <th className="py-3 px-3 text-right">Cancelled</th>
                  <th className="py-3 px-4 text-center min-w-[160px]">Win vs Loss Distribution</th>
                  <th className="py-3 px-3 text-right font-bold text-emerald-600">Win Rate</th>
                  <th className="py-3 px-3 text-right text-rose-500">Loss Rate</th>
                  <th className="py-3 px-4 text-center">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-base-200 text-xs sm:text-sm">
                {bands.map((b) => {
                  const winPct = b.acceptanceRate || 0;
                  const lossPct = b.lossRate || 0;
                  const decided = b.won + b.lost;
                  let statusBadge = (
                    <span className="badge badge-success badge-sm gap-1 py-2 font-medium">Strong Win</span>
                  );
                  if (b.key === 'unspecified') {
                    statusBadge = (
                      <span className="badge badge-ghost badge-sm py-2 font-normal text-base-content/60">Legacy / Blank</span>
                    );
                  } else if (winPct < 0.3) {
                    statusBadge = (
                      <span className="badge badge-error badge-sm gap-1 py-2 font-medium">High Leakage</span>
                    );
                  } else if (winPct < 0.45) {
                    statusBadge = (
                      <span className="badge badge-warning badge-sm gap-1 py-2 font-medium">Underperforming</span>
                    );
                  }

                  return (
                    <tr key={b.key} className="hover:bg-base-200/40 transition-colors">
                      <td className="py-3 px-4 font-semibold text-base-content">
                        {b.band}
                      </td>
                      <td className="py-3 px-3 text-right font-medium tabular-nums">{formatInt(b.quotes)}</td>
                      <td className="py-3 px-3 text-right font-bold text-emerald-600 tabular-nums">
                        {formatInt(b.won)}
                      </td>
                      <td className="py-3 px-3 text-right font-semibold text-rose-500 tabular-nums">
                        {formatInt(b.lost)}
                      </td>
                      <td className="py-3 px-3 text-right text-amber-500 tabular-nums">{formatInt(b.openQuotes)}</td>
                      <td className="py-3 px-3 text-right text-base-content/50 tabular-nums">{formatInt(b.cancelled)}</td>
                      <td className="py-3 px-4">
                        <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-base-200">
                          <div
                            style={{ width: `${Math.round(winPct * 100)}%` }}
                            className="bg-emerald-500"
                            title={`Won: ${formatPct(winPct)}`}
                          />
                          <div
                            style={{ width: `${Math.round(lossPct * 100)}%` }}
                            className="bg-rose-500"
                            title={`Lost: ${formatPct(lossPct)}`}
                          />
                        </div>
                      </td>
                      <td className="py-3 px-3 text-right font-bold text-emerald-600 tabular-nums">
                        {formatPct(winPct)}
                      </td>
                      <td className="py-3 px-3 text-right font-semibold text-rose-500 tabular-nums">
                        {formatPct(lossPct)}
                      </td>
                      <td className="py-3 px-4 text-center">{statusBadge}</td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot className="bg-base-200/80 font-semibold text-xs sm:text-sm text-base-content border-t-2 border-base-300">
                <tr>
                  <td className="py-3 px-4">Total Fleet Normal Quotes</td>
                  <td className="py-3 px-3 text-right tabular-nums">{formatInt(panel.quotes || 0)}</td>
                  <td className="py-3 px-3 text-right text-emerald-600 tabular-nums">{formatInt(panel.won || 0)}</td>
                  <td className="py-3 px-3 text-right text-rose-500 tabular-nums">{formatInt(panel.lost || 0)}</td>
                  <td className="py-3 px-3 text-right text-amber-500 tabular-nums">{formatInt(panel.openQuotes || 0)}</td>
                  <td className="py-3 px-3 text-right text-base-content/50 tabular-nums">{formatInt(panel.cancelled || 0)}</td>
                  <td className="py-3 px-4">
                    <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-base-200">
                      <div
                        style={{ width: `${Math.round((panel.acceptanceRate || 0) * 100)}%` }}
                        className="bg-emerald-500"
                      />
                      <div
                        style={{
                          width: `${Math.round(
                            ((panel.lost || 0) / ((panel.won || 0) + (panel.lost || 0) + (panel.openQuotes || 0) || 1)) *
                              100,
                          )}%`,
                        }}
                        className="bg-rose-500"
                      />
                    </div>
                  </td>
                  <td className="py-3 px-3 text-right text-emerald-600 tabular-nums">
                    {formatPct(panel.acceptanceRate || 0)}
                  </td>
                  <td className="py-3 px-3 text-right text-rose-500 tabular-nums">
                    {formatPct(
                      (panel.lost || 0) / ((panel.won || 0) + (panel.lost || 0) + (panel.openQuotes || 0) || 1),
                    )}
                  </td>
                  <td className="py-3 px-4 text-center">
                    <span className="badge badge-outline badge-sm">Fleet Avg</span>
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}

        {/* View Mode B: Specific Passenger Count Table */}
        {viewMode === 'specific' && (
          <div className="space-y-3">
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-base-100 p-3 rounded-xl border border-base-300">
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  placeholder="Filter passenger count (e.g. 53, 70, 16)..."
                  value={paxSearch}
                  onChange={(e) => setPaxSearch(e.target.value)}
                  className="input input-sm input-bordered w-full sm:w-64"
                />
                {paxSearch && (
                  <button
                    type="button"
                    className="btn btn-ghost btn-xs"
                    onClick={() => setPaxSearch('')}
                  >
                    Clear
                  </button>
                )}
              </div>
              <div className="text-xs text-base-content/60 self-center">
                Showing {filteredPaxList.length} passenger size groups (sorted by {sortBy} {sortAsc ? '▲' : '▼'})
              </div>
            </div>

            <div className="overflow-x-auto rounded-xl border border-base-300 bg-base-100 max-h-[500px]">
              <table className="table table-sm table-pin-rows">
                <thead className="bg-base-200/90 text-xs font-semibold uppercase text-base-content/70">
                  <tr>
                    <th className="py-3 px-4 cursor-pointer hover:text-primary" onClick={() => handleSort('pax')}>
                      Passengers (Pax) {sortBy === 'pax' ? (sortAsc ? '▲' : '▼') : ''}
                    </th>
                    <th className="py-3 px-3">Vehicle Bracket</th>
                    <th className="py-3 px-3 text-right cursor-pointer hover:text-primary" onClick={() => handleSort('quotes')}>
                      Total Quotes {sortBy === 'quotes' ? (sortAsc ? '▲' : '▼') : ''}
                    </th>
                    <th className="py-3 px-3 text-right text-emerald-600 cursor-pointer hover:text-primary" onClick={() => handleSort('won')}>
                      Won {sortBy === 'won' ? (sortAsc ? '▲' : '▼') : ''}
                    </th>
                    <th className="py-3 px-3 text-right text-rose-500 cursor-pointer hover:text-primary" onClick={() => handleSort('lost')}>
                      Lost {sortBy === 'lost' ? (sortAsc ? '▲' : '▼') : ''}
                    </th>
                    <th className="py-3 px-3 text-right cursor-pointer hover:text-primary font-bold text-emerald-600" onClick={() => handleSort('winRate')}>
                      Win Rate % {sortBy === 'winRate' ? (sortAsc ? '▲' : '▼') : ''}
                    </th>
                    <th className="py-3 px-3 text-right cursor-pointer hover:text-primary text-rose-500" onClick={() => handleSort('lossRate')}>
                      Loss Rate % {sortBy === 'lossRate' ? (sortAsc ? '▲' : '▼') : ''}
                    </th>
                    <th className="py-3 px-4 text-center min-w-[140px]">Won / Lost Balance</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-base-200 text-xs sm:text-sm">
                  {filteredPaxList.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="py-8 text-center text-sm text-base-content/50">
                        No passenger counts matching &quot;{paxSearch}&quot;.
                      </td>
                    </tr>
                  ) : (
                    filteredPaxList.map((item) => {
                      const winPct = item.acceptanceRate || 0;
                      const lossPct = item.lossRate || 0;
                      return (
                        <tr key={item.pax} className="hover:bg-base-200/40 transition-colors">
                          <td className="py-3 px-4 font-bold text-base-content flex items-center gap-2">
                            <span className="badge badge-neutral badge-sm font-bold">{item.pax}</span>
                            <span>pax</span>
                          </td>
                          <td className="py-3 px-3 text-base-content/70">{item.band}</td>
                          <td className="py-3 px-3 text-right font-medium tabular-nums">{formatInt(item.quotes)}</td>
                          <td className="py-3 px-3 text-right font-bold text-emerald-600 tabular-nums">
                            {formatInt(item.won)}
                          </td>
                          <td className="py-3 px-3 text-right font-semibold text-rose-500 tabular-nums">
                            {formatInt(item.lost)}
                          </td>
                          <td className="py-3 px-3 text-right font-bold tabular-nums">
                            <span
                              className={`badge badge-sm py-2 font-bold ${
                                winPct >= 0.5
                                  ? 'badge-success text-success-content'
                                  : winPct >= 0.35
                                  ? 'badge-warning text-warning-content'
                                  : 'badge-error text-error-content'
                              }`}
                            >
                              {formatPct(winPct)}
                            </span>
                          </td>
                          <td className="py-3 px-3 text-right font-semibold text-rose-500 tabular-nums">
                            {formatPct(lossPct)}
                          </td>
                          <td className="py-3 px-4">
                            <div className="flex h-2 w-full overflow-hidden rounded-full bg-base-200">
                              <div
                                style={{ width: `${Math.round(winPct * 100)}%` }}
                                className="bg-emerald-500"
                                title={`Won: ${formatPct(winPct)}`}
                              />
                              <div
                                style={{ width: `${Math.round(lossPct * 100)}%` }}
                                className="bg-rose-500"
                                title={`Lost: ${formatPct(lossPct)}`}
                              />
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}

function getRightSizeSuggestion(pax) {
  if (pax <= 8) return '8-seat MPV / Minibus';
  if (pax <= 16) return '16-seat Minibus';
  if (pax <= 24) return '24-seat Midi Coach';
  if (pax <= 33) return '33-seat Midi Coach';
  if (pax <= 49) return '49-seat Standard Coach';
  if (pax <= 57) return '53–57 seat Executive Coach';
  return 'High-Capacity / Double Decker';
}

function PaxCapacityTooltip({ active, payload, label }) {
  if (!active || !payload || !payload.length) return null;
  const item = payload[0]?.payload;
  if (!item) return null;
  return (
    <div className="rounded-lg border border-base-300 bg-base-100 p-3 shadow-xl text-xs space-y-1.5 z-50">
      <p className="font-semibold text-sm text-base-content border-b border-base-300 pb-1">{item.label || item.licensePlate || label}</p>
      {item.description ? <p className="text-base-content/70 italic text-[11px]">{item.description}</p> : null}
      <div className="grid grid-cols-2 gap-x-4 gap-y-1 pt-1 text-base-content/80">
        <div>Trips:</div>
        <div className="font-bold text-right">{formatInt(item.count || item.trips || 0)}</div>
        {item.pct != null ? (
          <>
            <div>% of Fleet Trips:</div>
            <div className="font-semibold text-right">{Math.round(item.pct * 10) / 10}%</div>
          </>
        ) : null}
        {item.capacity ? (
          <>
            <div>Seating Capacity:</div>
            <div className="font-medium text-right">{item.capacity} seats</div>
          </>
        ) : null}
        {item.totalEmptySeats ? (
          <>
            <div className="text-rose-500 font-medium">Empty Seats Dispatched:</div>
            <div className="font-bold text-rose-500 text-right">{formatInt(item.totalEmptySeats)}</div>
          </>
        ) : null}
        {item.avgSeatFillPct != null ? (
          <>
            <div>Avg Seat Fill:</div>
            <div className="font-bold text-emerald-600 text-right">{item.avgSeatFillPct}%</div>
          </>
        ) : null}
      </div>
    </div>
  );
}

function PaxCapacityPanel({ panel, note, rangeLabel }) {
  const [viewMode, setViewMode] = useState('mismatched'); // 'mismatched' | 'vehicles'
  const [searchQuery, setSearchQuery] = useState('');
  const [minEmptyFilter, setMinEmptyFilter] = useState('20'); // 'all' | '20' | '30' | '40' | '50'
  const [sortKey, setSortKey] = useState('emptySeats'); // 'emptySeats' | 'pax' | 'capacity' | 'dateKey' | 'seatFillPct'
  const [sortAsc, setSortAsc] = useState(false);

  // Vehicles table sorting
  const [vehSortKey, setVehSortKey] = useState('highEmptyTrips');
  const [vehSortAsc, setVehSortAsc] = useState(false);
  const [expandedVehicle, setExpandedVehicle] = useState(null);
  const [expandedSortBy, setExpandedSortBy] = useState('pax');
  const [expandedSortAsc, setExpandedSortAsc] = useState(true);

  const kpis = panel?.kpis || {};
  const distribution = panel?.distribution || [];
  const vehicles = panel?.vehicles || [];
  const rawTrips = panel?.mismatchedTrips || [];

  // Filtered & sorted mismatched trips
  const filteredTrips = useMemo(() => {
    let list = rawTrips;
    if (minEmptyFilter !== 'all') {
      const minVal = parseInt(minEmptyFilter, 10);
      list = list.filter((t) => (t.emptySeats || 0) >= minVal);
    }
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      list = list.filter(
        (t) =>
          t.tripCode?.toLowerCase().includes(q) ||
          t.customerName?.toLowerCase().includes(q) ||
          t.licensePlate?.toLowerCase().includes(q) ||
          String(t.pax).includes(q)
      );
    }
    return [...list].sort((a, b) => {
      const va = a[sortKey] ?? 0;
      const vb = b[sortKey] ?? 0;
      return sortAsc ? (va > vb ? 1 : -1) : (va < vb ? 1 : -1);
    });
  }, [rawTrips, minEmptyFilter, searchQuery, sortKey, sortAsc]);

  const sortedVehicles = useMemo(() => {
    return [...vehicles].sort((a, b) => {
      let va = a[vehSortKey] ?? 0;
      let vb = b[vehSortKey] ?? 0;
      if (vehSortKey === 'avgPaxPerTrip') {
        va = a.avgPaxPerTrip != null ? a.avgPaxPerTrip : (a.trips > 0 ? (a.totalPax / a.trips) : 0);
        vb = b.avgPaxPerTrip != null ? b.avgPaxPerTrip : (b.trips > 0 ? (b.totalPax / b.trips) : 0);
      }
      return vehSortAsc ? (va > vb ? 1 : -1) : (va < vb ? 1 : -1);
    });
  }, [vehicles, vehSortKey, vehSortAsc]);

  // Top 10 vehicles by high empty trips for chart
  const topVehiclesChart = useMemo(() => {
    return [...vehicles]
      .filter((v) => v.highEmptyTrips > 0)
      .sort((a, b) => b.highEmptyTrips - a.highEmptyTrips)
      .slice(0, 10)
      .map((v) => ({
        licensePlate: v.licensePlate,
        highEmptyTrips: v.highEmptyTrips,
        capacity: v.capacity,
        totalEmptySeats: v.totalEmptySeats,
        avgSeatFillPct: v.avgSeatFillPct,
      }));
  }, [vehicles]);

  if (!panel) {
    return (
      <div className="rounded-xl border border-base-300 bg-base-200/50 px-5 py-8">
        <p className="text-sm text-base-content/60">Planned vs actual passenger data is unavailable. Refresh and try again.</p>
      </div>
    );
  }

  // Top Insights
  const worstTrip = rawTrips.length
    ? [...rawTrips].sort((a, b) => (b.emptySeats || 0) - (a.emptySeats || 0))[0]
    : null;

  const worstCoach = vehicles.length
    ? [...vehicles].sort((a, b) => (b.highEmptyTrips || 0) - (a.highEmptyTrips || 0))[0]
    : null;

  const mismatchRatePct = kpis.totalTrips > 0 ? Math.round(((kpis.highMismatchTrips || 0) / kpis.totalTrips) * 1000) / 10 : 0;

  const handleTripSort = (key) => {
    if (sortKey === key) {
      setSortAsc(!sortAsc);
    } else {
      setSortKey(key);
      setSortAsc(false);
    }
  };

  const handleVehSort = (key) => {
    if (vehSortKey === key) {
      setVehSortAsc(!vehSortAsc);
    } else {
      setVehSortKey(key);
      setVehSortAsc(false);
    }
  };

  return (
    <div className="space-y-8" data-panel="pax-capacity">
      <PanelIntro title={panel.title} description={panel.description} note={note} />
      <p className="text-sm text-base-content/55">
        Trip dates in range: {rangeLabel}. Private Hire journeys only (order type Normal) with allocated vehicle and planned passenger count.
      </p>

      {/* 1. Top KPI Row */}
      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <Kpi
          label="Avg Fleet Seat Fill"
          value={`${kpis.avgSeatFillPct || 0}%`}
          hint="Planned pax ÷ allocated seats"
          hideDelta
        />
        <Kpi
          label="Avg Pax / Trip"
          value={kpis.avgPaxPerTrip != null ? kpis.avgPaxPerTrip : (kpis.totalTrips > 0 ? Math.round((kpis.totalPax / kpis.totalTrips) * 10) / 10 : 0)}
          hint={`${formatInt(kpis.totalPax || 0)} total passengers carried`}
          hideDelta
        />
        <Kpi
          label="High Mismatch Trips"
          value={formatInt(kpis.highMismatchTrips || 0)}
          hint={`${mismatchRatePct}% of all trips (≥20 empty seats)`}
          hideDelta
        />
        <Kpi
          label="Empty Seats Dispatched"
          value={formatInt(kpis.totalEmptySeats || 0)}
          hint={`${formatInt(kpis.totalPax || 0)} pax / ${formatInt(kpis.totalCapacity || 0)} capacity`}
          hideDelta
        />
        <Kpi
          label="Trips Analyzed"
          value={formatInt(kpis.totalTrips || 0)}
          hint={`${formatInt(kpis.tripsWellMatched || 0)} optimal · ${formatInt(kpis.trips30PlusEmpty || 0)} severe`}
          hideDelta
        />
      </section>

      {/* 2. Commercial Takeaways / Highlights */}
      <section className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-rose-500/20 bg-rose-500/5 p-4 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-rose-700 dark:text-rose-400">
                Largest Capacity Gap
              </span>
              <span className="badge badge-error badge-sm text-xs font-medium">Excess Capacity</span>
            </div>
            {worstTrip ? (
              <>
                <p className="mt-2 text-base font-bold text-base-content truncate" title={worstTrip.customerName}>
                  {worstTrip.customerName}
                </p>
                <div className="mt-1 flex items-baseline gap-2">
                  <span className="text-2xl font-black text-rose-600 dark:text-rose-400">
                    +{worstTrip.emptySeats} empty seats
                  </span>
                  <span className="text-xs text-base-content/60">({worstTrip.seatFillPct}% fill)</span>
                </div>
                <p className="mt-2 text-xs text-base-content/65">
                  Booked <span className="font-bold">{worstTrip.pax} pax</span>, but allocated <span className="font-bold">{worstTrip.licensePlate} ({worstTrip.capacity} seats)</span>.
                </p>
              </>
            ) : (
              <p className="mt-2 text-xs text-base-content/60">No extreme mismatches in range.</p>
            )}
          </div>
        </div>

        <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-amber-700 dark:text-amber-400">
                Most Over-Allocated Coach
              </span>
              <span className="badge badge-warning badge-sm text-xs font-medium">Frequent Mismatch</span>
            </div>
            {worstCoach ? (
              <>
                <p className="mt-2 text-base font-bold text-base-content">
                  {worstCoach.licensePlate} ({worstCoach.capacity} seats)
                </p>
                <p className="mt-1 text-2xl font-black text-amber-600 dark:text-amber-400">
                  {formatInt(worstCoach.highEmptyTrips)} trips
                </p>
                <p className="mt-2 text-xs text-base-content/65">
                  Operated {worstCoach.highEmptyTrips} trips with ≥20 empty seats (carried as few as {worstCoach.minPaxCarried} passengers).
                </p>
              </>
            ) : (
              <p className="mt-2 text-xs text-base-content/60">No vehicle data available.</p>
            )}
          </div>
        </div>

        <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-emerald-700 dark:text-emerald-400">
                Optimal Right-Sizing
              </span>
              <span className="badge badge-success badge-sm text-xs font-medium">Well-Matched</span>
            </div>
            <p className="mt-2 text-base font-bold text-base-content">
              {formatInt(kpis.tripsWellMatched || 0)} trips optimal
            </p>
            <p className="mt-1 text-2xl font-black text-emerald-600 dark:text-emerald-400">
              {kpis.totalTrips > 0 ? Math.round(((kpis.tripsWellMatched || 0) / kpis.totalTrips) * 1000) / 10 : 0}%
            </p>
            <p className="mt-2 text-xs text-base-content/65">
              Trips dispatched within 0–9 seats of passenger capacity.
            </p>
          </div>
        </div>
      </section>

      {/* 3. Visual Charts */}
      <section className="grid gap-6 lg:grid-cols-2">
        {/* Chart 1: Empty Seat Severity Distribution */}
        <div className="rounded-2xl border border-base-300 bg-base-100 p-5 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="font-semibold text-base-content">Seat Fill & Allocation Distribution</h3>
              <p className="text-xs text-base-content/60">Breakdown of operational trips by empty seat headroom</p>
            </div>
            <span className="badge badge-sm badge-outline text-xs">Trips</span>
          </div>
          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={distribution} margin={{ top: 15, right: 15, left: -10, bottom: 25 }}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.2} vertical={false} />
                <XAxis
                  dataKey="shortLabel"
                  tick={{ fontSize: 11 }}
                  interval={0}
                  tickLine={false}
                />
                <YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                <Tooltip content={<PaxCapacityTooltip />} />
                <Bar dataKey="count" name="Trips" radius={[4, 4, 0, 0]}>
                  {distribution.map((entry, index) => (
                    <Cell key={`dist-cell-${index}`} fill={entry.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Chart 2: Top Vehicles Dispatched with Excess Capacity */}
        <div className="rounded-2xl border border-base-300 bg-base-100 p-5 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="font-semibold text-base-content">Top Coaches Dispatched with 20+ Empty Seats</h3>
              <p className="text-xs text-base-content/60">Coaches with the highest number of low-occupancy trips</p>
            </div>
            <span className="badge badge-sm badge-outline text-xs">20+ Empty</span>
          </div>
          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={topVehiclesChart} margin={{ top: 15, right: 15, left: -10, bottom: 25 }}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.2} vertical={false} />
                <XAxis
                  dataKey="licensePlate"
                  tick={{ fontSize: 11 }}
                  interval={0}
                  angle={-20}
                  textAnchor="end"
                  tickLine={false}
                />
                <YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                <Tooltip content={<PaxCapacityTooltip />} />
                <Bar dataKey="highEmptyTrips" name="Trips with 20+ Empty Seats" fill="#f97316" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </section>

      {/* 4. Interactive Breakdown & Granular Trip Table */}
      <section className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-base-300 pb-3">
          <div>
            <h3 className="text-lg font-semibold text-base-content">Capacity Allocation Analysis</h3>
            <p className="text-xs text-base-content/60">
              Inspect flagged journeys where large vehicles were allocated to smaller groups, or explore vehicle efficiency across the whole fleet.
            </p>
          </div>
          <div className="join bg-base-200 p-0.5 rounded-lg border border-base-300 self-start sm:self-auto">
            <button
              type="button"
              className={`join-item btn btn-xs sm:btn-sm px-3 ${viewMode === 'mismatched' ? 'btn-primary' : 'btn-ghost'}`}
              onClick={() => setViewMode('mismatched')}
            >
              Flagged Mismatches ({filteredTrips.length})
            </button>
            <button
              type="button"
              className={`join-item btn btn-xs sm:btn-sm px-3 ${viewMode === 'vehicles' ? 'btn-primary' : 'btn-ghost'}`}
              onClick={() => setViewMode('vehicles')}
            >
              Fleet Vehicle Breakdown ({vehicles.length})
            </button>
          </div>
        </div>

        {/* View Mode A: Flagged Mismatches Table */}
        {viewMode === 'mismatched' && (
          <div className="space-y-3">
            <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 bg-base-100 p-3 rounded-xl border border-base-300">
              <div className="flex flex-wrap items-center gap-2">
                <input
                  type="text"
                  placeholder="Search customer, trip, coach..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="input input-sm input-bordered w-full sm:w-64"
                />
                <select
                  value={minEmptyFilter}
                  onChange={(e) => setMinEmptyFilter(e.target.value)}
                  className="select select-sm select-bordered"
                >
                  <option value="20">Min 20+ Empty Seats</option>
                  <option value="30">Min 30+ Empty Seats</option>
                  <option value="40">Min 40+ Empty Seats</option>
                  <option value="50">Min 50+ Empty Seats</option>
                  <option value="all">All Empty Gaps</option>
                </select>
                <span className="badge badge-sm badge-neutral font-medium py-2.5 px-3">
                  Private Hire Only
                </span>
                {(searchQuery || minEmptyFilter !== '20') && (
                  <button
                    type="button"
                    className="btn btn-ghost btn-xs"
                    onClick={() => {
                      setSearchQuery('');
                      setMinEmptyFilter('20');
                    }}
                  >
                    Reset
                  </button>
                )}
              </div>
              <div className="text-xs text-base-content/60 self-center">
                Showing {filteredTrips.length} flagged trips
              </div>
            </div>

            <div className="overflow-x-auto rounded-xl border border-base-300 bg-base-100 max-h-[550px]">
              <table className="table table-sm table-pin-rows">
                <thead className="bg-base-200/90 text-xs font-semibold uppercase text-base-content/70">
                  <tr>
                    <th className="py-3 px-3 cursor-pointer hover:text-primary" onClick={() => handleTripSort('dateKey')}>
                      Trip Code & Date {sortKey === 'dateKey' ? (sortAsc ? '▲' : '▼') : ''}
                    </th>
                    <th className="py-3 px-3">Customer & Type</th>
                    <th className="py-3 px-3 text-right cursor-pointer hover:text-primary" onClick={() => handleTripSort('pax')}>
                      Planned Pax {sortKey === 'pax' ? (sortAsc ? '▲' : '▼') : ''}
                    </th>
                    <th className="py-3 px-3 text-left">Allocated Vehicle</th>
                    <th className="py-3 px-3 text-right cursor-pointer hover:text-primary text-rose-500 font-bold" onClick={() => handleTripSort('emptySeats')}>
                      Empty Seats {sortKey === 'emptySeats' ? (sortAsc ? '▲' : '▼') : ''}
                    </th>
                    <th className="py-3 px-3 text-right cursor-pointer hover:text-primary" onClick={() => handleTripSort('seatFillPct')}>
                      Seat Fill % {sortKey === 'seatFillPct' ? (sortAsc ? '▲' : '▼') : ''}
                    </th>
                    <th className="py-3 px-4">Right-Size Opportunity</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-base-200 text-xs sm:text-sm">
                  {filteredTrips.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-8 text-center text-sm text-base-content/50">
                        No trips matching the selected criteria.
                      </td>
                    </tr>
                  ) : (
                    filteredTrips.map((t) => {
                      const fillPct = t.seatFillPct || 0;
                      return (
                        <tr key={t.id || t.tripCode} className="hover:bg-base-200/40 transition-colors">
                          <td className="py-3 px-3 font-medium text-base-content">
                            <span className="font-mono text-xs">{t.tripCode}</span>
                            <span className="block text-[11px] text-base-content/50">{formatUkDate(t.dateKey)}</span>
                          </td>
                          <td className="py-3 px-3 max-w-[220px]">
                            <span className="font-semibold text-base-content truncate block" title={t.customerName}>
                              {t.customerName}
                            </span>
                            <span className="badge badge-ghost badge-xs text-[10px] py-1">{t.tripType}</span>
                          </td>
                          <td className="py-3 px-3 text-right font-bold tabular-nums">
                            <span className="badge badge-neutral badge-sm">{t.pax} pax</span>
                          </td>
                          <td className="py-3 px-3">
                            <span className="font-semibold text-base-content">{t.licensePlate}</span>
                            <span className="block text-xs text-base-content/60">{t.capacity} seats</span>
                          </td>
                          <td className="py-3 px-3 text-right font-black tabular-nums">
                            <span
                              className={`badge badge-sm py-2 font-bold ${
                                t.emptySeats >= 40
                                  ? 'badge-error text-error-content'
                                  : t.emptySeats >= 30
                                  ? 'badge-warning text-warning-content'
                                  : 'badge-outline text-rose-500'
                              }`}
                            >
                              +{t.emptySeats} empty
                            </span>
                          </td>
                          <td className="py-3 px-3 text-right tabular-nums">
                            <div className="font-semibold text-xs">{fillPct}%</div>
                            <div className="w-16 h-1.5 bg-base-200 rounded-full overflow-hidden ml-auto mt-1">
                              <div
                                style={{ width: `${Math.min(100, fillPct)}%` }}
                                className={`h-full ${fillPct < 35 ? 'bg-rose-500' : fillPct < 60 ? 'bg-amber-500' : 'bg-emerald-500'}`}
                              />
                            </div>
                          </td>
                          <td className="py-3 px-4">
                            <span className="badge badge-outline badge-sm text-[11px] text-base-content/75 py-2">
                              Could use {getRightSizeSuggestion(t.pax)}
                            </span>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* View Mode B: Fleet Vehicle Breakdown Table */}
        {viewMode === 'vehicles' && (
          <div className="overflow-x-auto rounded-xl border border-base-300 bg-base-100 max-h-[700px]">
            <table className="table table-sm table-pin-rows">
              <thead className="bg-base-200/90 text-xs font-semibold uppercase text-base-content/70">
                <tr>
                  <th className="w-8"></th>
                  <th className="py-3 px-4">Vehicle License Plate</th>
                  <th className="py-3 px-3 text-right cursor-pointer hover:text-primary" onClick={() => handleVehSort('capacity')}>
                    Capacity {vehSortKey === 'capacity' ? (vehSortAsc ? '▲' : '▼') : ''}
                  </th>
                  <th className="py-3 px-3 text-right cursor-pointer hover:text-primary" onClick={() => handleVehSort('trips')}>
                    Trips Operated {vehSortKey === 'trips' ? (vehSortAsc ? '▲' : '▼') : ''}
                  </th>
                  <th className="py-3 px-3 text-right cursor-pointer hover:text-primary" onClick={() => handleVehSort('totalPax')}>
                    Total Pax Carried {vehSortKey === 'totalPax' ? (vehSortAsc ? '▲' : '▼') : ''}
                  </th>
                  <th className="py-3 px-3 text-right cursor-pointer hover:text-primary font-bold text-primary" onClick={() => handleVehSort('avgPaxPerTrip')}>
                    Avg Pax / Trip {vehSortKey === 'avgPaxPerTrip' ? (vehSortAsc ? '▲' : '▼') : ''}
                  </th>
                  <th className="py-3 px-3 text-right cursor-pointer hover:text-primary text-rose-500 font-bold" onClick={() => handleVehSort('highEmptyTrips')}>
                    Trips w/ 20+ Empty Seats {vehSortKey === 'highEmptyTrips' ? (vehSortAsc ? '▲' : '▼') : ''}
                  </th>
                  <th className="py-3 px-3 text-right cursor-pointer hover:text-primary" onClick={() => handleVehSort('totalEmptySeats')}>
                    Empty Seats Dispatched {vehSortKey === 'totalEmptySeats' ? (vehSortAsc ? '▲' : '▼') : ''}
                  </th>
                  <th className="py-3 px-3 text-right cursor-pointer hover:text-primary font-bold text-emerald-600" onClick={() => handleVehSort('avgSeatFillPct')}>
                    Avg Seat Fill % {vehSortKey === 'avgSeatFillPct' ? (vehSortAsc ? '▲' : '▼') : ''}
                  </th>
                  <th className="py-3 px-4 text-center">Min / Max Pax Carried</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-base-200 text-xs sm:text-sm">
                {sortedVehicles.map((v) => {
                  const isExpanded = expandedVehicle === v.licensePlate;
                  const paxLevels = v.paxLevels || [];
                  const sortedPaxLevels = [...paxLevels].sort((a, b) => {
                    let va = a[expandedSortBy] ?? 0;
                    let vb = b[expandedSortBy] ?? 0;
                    return expandedSortAsc ? (va > vb ? 1 : -1) : (va < vb ? 1 : -1);
                  });

                  return (
                    <Fragment key={v.licensePlate}>
                      <tr
                        onClick={() => setExpandedVehicle(isExpanded ? null : v.licensePlate)}
                        className={`cursor-pointer transition-colors ${
                          isExpanded ? 'bg-primary/5 font-semibold border-l-4 border-l-primary' : 'hover:bg-base-200/50'
                        }`}
                        title="Click to expand/collapse details of jobs operated at each passenger level"
                      >
                        <td className="py-3 px-2 text-center text-base-content/60 font-mono">
                          <span className={`inline-block transition-transform duration-150 ${isExpanded ? 'rotate-90 text-primary font-bold' : ''}`}>
                            ▶
                          </span>
                        </td>
                        <td className="py-3 px-4 font-bold text-base-content">
                          <div className="flex items-center gap-2">
                            <span>{v.licensePlate}</span>
                            {paxLevels.length > 0 && (
                              <span className="badge badge-ghost badge-xs text-[10px] font-normal text-base-content/60">
                                {paxLevels.length} sizes
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="py-3 px-3 text-right tabular-nums">{v.capacity} seats</td>
                        <td className="py-3 px-3 text-right tabular-nums font-medium">{formatInt(v.trips)}</td>
                        <td className="py-3 px-3 text-right tabular-nums">{formatInt(v.totalPax)}</td>
                        <td className="py-3 px-3 text-right tabular-nums font-bold text-primary">
                          {v.avgPaxPerTrip != null ? v.avgPaxPerTrip : (v.trips > 0 ? Math.round((v.totalPax / v.trips) * 10) / 10 : 0)}
                        </td>
                        <td className="py-3 px-3 text-right tabular-nums font-bold">
                          <span
                            className={`badge badge-sm py-2 ${
                              v.highEmptyTrips >= 80
                                ? 'badge-error text-error-content'
                                : v.highEmptyTrips >= 40
                                ? 'badge-warning text-warning-content'
                                : 'badge-ghost text-base-content/70'
                            }`}
                          >
                            {v.highEmptyTrips} trips
                          </span>
                        </td>
                        <td className="py-3 px-3 text-right tabular-nums text-rose-500 font-medium">
                          {formatInt(v.totalEmptySeats)}
                        </td>
                        <td className="py-3 px-3 text-right tabular-nums font-bold text-emerald-600">
                          {v.avgSeatFillPct}%
                        </td>
                        <td className="py-3 px-4 text-center tabular-nums text-xs text-base-content/70">
                          {v.minPaxCarried} min → {v.maxPaxCarried} max
                        </td>
                      </tr>

                      {isExpanded && (
                        <tr key={`${v.licensePlate}-expanded`} className="bg-base-200/35">
                          <td colSpan={10} className="p-0 border-b border-base-300">
                            <div className="p-4 sm:p-5 space-y-3 bg-base-100/90 rounded-b-xl border-t border-base-300">
                              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-2 border-b border-base-300/60">
                                <div>
                                  <h4 className="text-sm font-bold text-base-content flex items-center gap-2">
                                    <span>Jobs Operated at Each Passenger Level · {v.licensePlate}</span>
                                    <span className="badge badge-primary badge-sm">{v.capacity} Seats</span>
                                  </h4>
                                  <p className="text-xs text-base-content/65 mt-0.5">
                                    Exact number of journeys completed with each specific group size ({formatInt(v.trips)} total trips, carrying {formatInt(v.totalPax)} passengers).
                                  </p>
                                </div>
                                <div className="flex items-center gap-2 text-xs">
                                  <span className="text-base-content/60">Sort breakdown:</span>
                                  <div className="join">
                                    <button
                                      type="button"
                                      className={`btn btn-xs join-item ${expandedSortBy === 'pax' ? 'btn-active btn-neutral' : 'btn-ghost'}`}
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        if (expandedSortBy === 'pax') setExpandedSortAsc(!expandedSortAsc);
                                        else { setExpandedSortBy('pax'); setExpandedSortAsc(true); }
                                      }}
                                    >
                                      Pax Count {expandedSortBy === 'pax' ? (expandedSortAsc ? '▲' : '▼') : ''}
                                    </button>
                                    <button
                                      type="button"
                                      className={`btn btn-xs join-item ${expandedSortBy === 'trips' ? 'btn-active btn-neutral' : 'btn-ghost'}`}
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        if (expandedSortBy === 'trips') setExpandedSortAsc(!expandedSortAsc);
                                        else { setExpandedSortBy('trips'); setExpandedSortAsc(false); }
                                      }}
                                    >
                                      Jobs Run {expandedSortBy === 'trips' ? (expandedSortAsc ? '▲' : '▼') : ''}
                                    </button>
                                    <button
                                      type="button"
                                      className={`btn btn-xs join-item ${expandedSortBy === 'emptySeats' ? 'btn-active btn-neutral' : 'btn-ghost'}`}
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        if (expandedSortBy === 'emptySeats') setExpandedSortAsc(!expandedSortAsc);
                                        else { setExpandedSortBy('emptySeats'); setExpandedSortAsc(false); }
                                      }}
                                    >
                                      Empty Seats {expandedSortBy === 'emptySeats' ? (expandedSortAsc ? '▲' : '▼') : ''}
                                    </button>
                                  </div>
                                </div>
                              </div>

                              {paxLevels.length === 0 ? (
                                <p className="text-xs text-base-content/50 py-2 italic">No passenger breakdown records available for this vehicle.</p>
                              ) : (
                                <div className="overflow-x-auto rounded-lg border border-base-300 max-h-72">
                                  <table className="table table-xs">
                                    <thead className="bg-base-200/80 text-[11px] uppercase font-semibold text-base-content/70">
                                      <tr>
                                        <th className="py-2 px-3">Passenger Count (Pax)</th>
                                        <th className="py-2 px-3 text-right">Jobs Run</th>
                                        <th className="py-2 px-3 min-w-[130px]">Share of {v.licensePlate} Jobs</th>
                                        <th className="py-2 px-3 text-right">Empty Seats / Job</th>
                                        <th className="py-2 px-3 text-right font-bold text-emerald-600">Seat Fill %</th>
                                        <th className="py-2 px-3 text-right">Total Rev (ex VAT)</th>
                                        <th className="py-2 px-3 text-right">Avg Rev / Job</th>
                                        <th className="py-2 px-3">Right-Sizing Assessment</th>
                                      </tr>
                                    </thead>
                                    <tbody className="divide-y divide-base-200 text-xs">
                                      {sortedPaxLevels.map((lvl) => {
                                        const sharePct = v.trips > 0 ? (lvl.trips / v.trips) * 100 : 0;
                                        const avgRev = lvl.trips > 0 ? (lvl.revenue || 0) / lvl.trips : 0;
                                        const isSevere = lvl.emptySeats >= 30;
                                        const isModerate = lvl.emptySeats >= 20 && lvl.emptySeats < 30;
                                        const isFull = lvl.emptySeats <= 0;

                                        return (
                                          <tr key={lvl.pax} className="hover:bg-base-200/40">
                                            <td className="py-1.5 px-3 font-bold text-base-content whitespace-nowrap">
                                              <span className="badge badge-neutral badge-sm font-mono mr-1.5">{lvl.pax} pax</span>
                                            </td>
                                            <td className="py-1.5 px-3 text-right font-bold text-base-content tabular-nums">
                                              {formatInt(lvl.trips)} {lvl.trips === 1 ? 'job' : 'jobs'}
                                            </td>
                                            <td className="py-1.5 px-3">
                                              <div className="flex items-center gap-2">
                                                <div className="w-16 bg-base-200 h-1.5 rounded-full overflow-hidden shrink-0">
                                                  <div
                                                    style={{ width: `${Math.min(100, Math.max(5, sharePct))}%` }}
                                                    className={`h-full ${isSevere ? 'bg-rose-500' : isModerate ? 'bg-amber-500' : 'bg-emerald-500'}`}
                                                  />
                                                </div>
                                                <span className="text-[11px] tabular-nums font-medium text-base-content/70">
                                                  {Math.round(sharePct * 10) / 10}%
                                                </span>
                                              </div>
                                            </td>
                                            <td className="py-1.5 px-3 text-right tabular-nums font-semibold">
                                              <span
                                                className={`badge badge-xs py-1.5 font-bold ${
                                                  isSevere
                                                    ? 'badge-error text-error-content'
                                                    : isModerate
                                                    ? 'badge-warning text-warning-content'
                                                    : isFull
                                                    ? 'badge-ghost text-base-content/70'
                                                    : 'badge-outline text-emerald-600'
                                                }`}
                                              >
                                                {lvl.emptySeats > 0 ? `+${lvl.emptySeats} empty` : lvl.emptySeats === 0 ? 'Full' : `${Math.abs(lvl.emptySeats)} over cap`}
                                              </span>
                                            </td>
                                            <td className="py-1.5 px-3 text-right tabular-nums font-bold">
                                              <span className={lvl.seatFillPct < 50 ? 'text-rose-500' : lvl.seatFillPct < 75 ? 'text-amber-500' : 'text-emerald-600'}>
                                                {lvl.seatFillPct}%
                                              </span>
                                            </td>
                                            <td className="py-1.5 px-3 text-right tabular-nums font-medium text-base-content/80">
                                              {formatGbp(lvl.revenue || 0)}
                                            </td>
                                            <td className="py-1.5 px-3 text-right tabular-nums text-base-content/65">
                                              {formatGbp(avgRev)}
                                            </td>
                                            <td className="py-1.5 px-3 text-base-content/70">
                                              {isSevere ? (
                                                <span className="badge badge-outline badge-xs text-rose-500 py-1 font-medium">
                                                  Could use {getRightSizeSuggestion(lvl.pax)}
                                                </span>
                                              ) : isModerate ? (
                                                <span className="text-amber-600 text-[11px]">
                                                  {lvl.emptySeats} surplus seats
                                                </span>
                                              ) : isFull ? (
                                                <span className="text-sky-600 font-medium text-[11px]">Optimal capacity</span>
                                              ) : (
                                                <span className="text-emerald-600 text-[11px]">Right-sized</span>
                                              )}
                                            </td>
                                          </tr>
                                        );
                                      })}
                                    </tbody>
                                  </table>
                                </div>
                              )}
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        </section>
    </div>
  );
}



function formatTime(isoString) {
  if (!isoString) return '-';
  try {
    const d = new Date(isoString);
    if (isNaN(d.getTime())) return '-';
    return d.toLocaleTimeString('en-GB', { timeZone: 'Europe/London', hour: '2-digit', minute: '2-digit' });
  } catch {
    return '-';
  }
}

function WalkaroundCompliancePanel({ panel, note }) {
  const [currentPanel, setCurrentPanel] = useState(panel);
  const [selectedDate, setSelectedDate] = useState(panel?.date || new Date().toISOString().split('T')[0]);
  const [loadingDate, setLoadingDate] = useState(!panel);
  const [statusFilter, setStatusFilter] = useState('all'); // 'all' | 'missing' | 'defect' | 'late' | 'compliant'
  const [searchQuery, setSearchQuery] = useState('');
  const [sortKey, setSortKey] = useState('firstDepartureTime');
  const [sortAsc, setSortAsc] = useState(true);
  const [expandedRow, setExpandedRow] = useState(null);
  const [showUnallocated, setShowUnallocated] = useState(false);

  const handleFetchDate = useCallback(async (targetDate) => {
    setSelectedDate(targetDate);
    setLoadingDate(true);
    try {
      const res = await fetch(`/api/getFinanceReports?tab=walkaround&date=${targetDate}`, {
        credentials: 'include',
        cache: 'no-store',
      });
      const json = await res.json().catch(() => ({}));
      if (json.ok && json.data?.walkaroundCompliance) {
        setCurrentPanel(json.data.walkaroundCompliance);
      }
    } catch (err) {
      console.error('Failed to load walkaround compliance for date:', err);
    } finally {
      setLoadingDate(false);
    }
  }, []);

  useEffect(() => {
    if (panel) {
      setCurrentPanel(panel);
    } else {
      void handleFetchDate(selectedDate);
    }
  }, [panel, handleFetchDate]);

  const kpis = currentPanel?.kpis || {};
  const records = currentPanel?.records || [];
  const unallocated = currentPanel?.unallocatedChecks || [];
  const lastSync = currentPanel?.lastSync;

  const filteredRecords = useMemo(() => {
    let list = records;

    if (statusFilter === 'missing') {
      list = list.filter((r) => r.status === 'missing_check');
    } else if (statusFilter === 'defect') {
      list = list.filter((r) => r.status === 'defect_reported');
    } else if (statusFilter === 'late') {
      list = list.filter((r) => r.status === 'late_check');
    } else if (statusFilter === 'compliant') {
      list = list.filter((r) => r.status === 'compliant');
    }

    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      list = list.filter((r) =>
        r.licensePlate?.toLowerCase().includes(q) ||
        r.vehicleName?.toLowerCase().includes(q) ||
        r.firstAllocatedDriver?.toLowerCase().includes(q) ||
        r.inspectingDriver?.toLowerCase().includes(q) ||
        r.firstTripCode?.toLowerCase().includes(q) ||
        r.customerName?.toLowerCase().includes(q)
      );
    }

    return [...list].sort((a, b) => {
      let va = a[sortKey] ?? '';
      let vb = b[sortKey] ?? '';
      if (sortKey === 'status') {
        const score = (s) => (s === 'missing_check' ? 4 : s === 'defect_reported' ? 3 : s === 'late_check' ? 2 : 1);
        va = score(a.status);
        vb = score(b.status);
      }
      return sortAsc ? (va > vb ? 1 : -1) : (va < vb ? 1 : -1);
    });
  }, [records, statusFilter, searchQuery, sortKey, sortAsc]);

  if (!currentPanel) {
    if (loadingDate) {
      return (
        <div className="flex flex-col items-center justify-center py-16 gap-3">
          <span className="loading loading-spinner loading-lg text-primary" />
          <p className="text-sm text-base-content/60 font-medium">Loading walk around compliance records...</p>
        </div>
      );
    }
    return (
      <div className="rounded-xl border border-base-300 bg-base-200/50 px-5 py-8 space-y-3">
        <p className="text-sm text-base-content/60">Walk around compliance data is unavailable for {selectedDate}. Please run the local sync agent or try refreshing.</p>
        <button
          type="button"
          className="btn btn-sm btn-outline"
          onClick={() => void handleFetchDate(selectedDate)}
        >
          Retry
        </button>
      </div>
    );
  }

  const handleSort = (key) => {
    if (sortKey === key) {
      setSortAsc(!sortAsc);
    } else {
      setSortKey(key);
      setSortAsc(key === 'firstDepartureTime');
    }
  };

  const compliancePct = kpis.complianceRate != null ? kpis.complianceRate : 0;
  const isGoodCompliance = compliancePct >= 95;
  const isMedCompliance = compliancePct >= 85;

  return (
    <div className="space-y-8" data-panel="walkaround-compliance">
      {/* Header & Date Controls */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-base-300 pb-4">
        <div>
          <div className="flex items-center gap-3">
            <h2 className="text-2xl font-bold tracking-tight text-base-content">{currentPanel.title}</h2>
            <span className="badge badge-primary badge-sm font-semibold">Redshift ⇄ VMS Sync</span>
          </div>
          <p className="mt-1 text-sm text-base-content/65 max-w-2xl leading-relaxed">
            {currentPanel.description}
          </p>
          {lastSync?.lastSyncAt && (
            <p className="mt-1 text-xs text-base-content/50">
              VMS database last synced: <span className="font-semibold text-base-content/75">{formatUkDate(lastSync.lastSyncAt)} at {formatTime(lastSync.lastSyncAt)}</span> ({lastSync.totalChecksSaved} checks loaded)
            </p>
          )}
        </div>

        {/* Date Filter Toolbar */}
        <div className="flex items-center gap-2 self-start md:self-auto bg-base-100 p-1.5 rounded-xl border border-base-300 shadow-sm">
          <button
            type="button"
            className={`btn btn-xs sm:btn-sm ${selectedDate === new Date().toISOString().split('T')[0] ? 'btn-neutral' : 'btn-ghost'}`}
            onClick={() => handleFetchDate(new Date().toISOString().split('T')[0])}
            disabled={loadingDate}
          >
            Today
          </button>
          <button
            type="button"
            className="btn btn-xs sm:btn-sm btn-ghost"
            onClick={() => {
              const d = new Date();
              d.setDate(d.getDate() - 1);
              handleFetchDate(d.toISOString().split('T')[0]);
            }}
            disabled={loadingDate}
          >
            Yesterday
          </button>
          <div className="divider divider-horizontal mx-0" />
          <input
            type="date"
            value={selectedDate}
            onChange={(e) => handleFetchDate(e.target.value)}
            disabled={loadingDate}
            className="input input-xs sm:input-sm input-bordered"
          />
          {loadingDate && <span className="loading loading-spinner loading-xs text-primary ml-1" />}
        </div>
      </div>

      {/* 1. Top KPI Row */}
      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <Kpi
          label="Compliance Rate"
          value={`${compliancePct}%`}
          hint={`${kpis.compliantCount || 0} of ${kpis.totalAllocated || 0} coaches checked`}
          hideDelta
        />
        <Kpi
          label="Missing Checks"
          value={formatInt(kpis.missingCount || 0)}
          hint={kpis.missingCount > 0 ? "ACTION REQUIRED: First drivers flagged" : "All allocated coaches checked"}
          hideDelta
        />
        <Kpi
          label="Vehicles Allocated"
          value={formatInt(kpis.totalAllocated || 0)}
          hint="Operational vehicles in Redshift today"
          hideDelta
        />
        <Kpi
          label="Defects Reported"
          value={formatInt(kpis.defectCount || 0)}
          hint="Flagged for workshop inspection"
          hideDelta
        />
        <Kpi
          label="Late Inspections"
          value={formatInt(kpis.lateCount || 0)}
          hint="Logged after scheduled departure"
          hideDelta
        />
      </section>

      {/* 2. Critical Alert Banner if Missing Checks */}
      {kpis.missingCount > 0 && (
        <div className="alert alert-error shadow-sm rounded-xl">
          <svg xmlns="http://www.w3.org/2000/svg" className="stroke-current shrink-0 h-6 w-6" fill="none" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <div>
            <h3 className="font-bold text-sm sm:text-base">
              {kpis.missingCount} Vehicle{kpis.missingCount > 1 ? 's' : ''} Allocated Work Without a Walk Around Check!
            </h3>
            <p className="text-xs opacity-90 mt-0.5">
              The first allocated drivers below operated or are scheduled to operate journeys without a recorded walkaround check in VMS.
            </p>
          </div>
          <button
            type="button"
            className="btn btn-xs btn-neutral"
            onClick={() => setStatusFilter(statusFilter === 'missing' ? 'all' : 'missing')}
          >
            {statusFilter === 'missing' ? 'Show All Coaches' : 'Filter Missing Only'}
          </button>
        </div>
      )}

      {/* 3. Table Filters & Search */}
      <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 bg-base-100 p-3 rounded-xl border border-base-300">
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="text"
            placeholder="Search coach, driver, trip, customer..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="input input-sm input-bordered w-full sm:w-72"
          />
          <div className="join">
            <button
              type="button"
              className={`btn btn-xs sm:btn-sm join-item ${statusFilter === 'all' ? 'btn-active btn-neutral' : 'btn-ghost'}`}
              onClick={() => setStatusFilter('all')}
            >
              All ({records.length})
            </button>
            <button
              type="button"
              className={`btn btn-xs sm:btn-sm join-item text-rose-500 ${statusFilter === 'missing' ? 'btn-active btn-error text-error-content' : 'btn-ghost'}`}
              onClick={() => setStatusFilter('missing')}
            >
              Missing ({kpis.missingCount || 0})
            </button>
            <button
              type="button"
              className={`btn btn-xs sm:btn-sm join-item text-amber-600 ${statusFilter === 'defect' ? 'btn-active btn-warning text-warning-content' : 'btn-ghost'}`}
              onClick={() => setStatusFilter('defect')}
            >
              Defects ({kpis.defectCount || 0})
            </button>
            <button
              type="button"
              className={`btn btn-xs sm:btn-sm join-item text-emerald-600 ${statusFilter === 'compliant' ? 'btn-active btn-success text-success-content' : 'btn-ghost'}`}
              onClick={() => setStatusFilter('compliant')}
            >
              Compliant ({kpis.compliantCount || 0})
            </button>
          </div>
          {(searchQuery || statusFilter !== 'all') && (
            <button
              type="button"
              className="btn btn-ghost btn-xs"
              onClick={() => {
                setSearchQuery('');
                setStatusFilter('all');
              }}
            >
              Reset
            </button>
          )}
        </div>
        <div className="text-xs text-base-content/60 self-center">
          Showing {filteredRecords.length} of {records.length} allocated coaches
        </div>
      </div>

      {/* 4. Interactive Compliance Table */}
      <div className="overflow-x-auto rounded-xl border border-base-300 bg-base-100 max-h-[750px]">
        <table className="table table-sm table-pin-rows">
          <thead className="bg-base-200/90 text-xs font-semibold uppercase text-base-content/70">
            <tr>
              <th className="w-8"></th>
              <th className="py-3 px-4 cursor-pointer hover:text-primary" onClick={() => handleSort('licensePlate')}>
                Vehicle Plate {sortKey === 'licensePlate' ? (sortAsc ? '▲' : '▼') : ''}
              </th>
              <th className="py-3 px-3 cursor-pointer hover:text-primary" onClick={() => handleSort('firstDepartureTime')}>
                First Departure {sortKey === 'firstDepartureTime' ? (sortAsc ? '▲' : '▼') : ''}
              </th>
              <th className="py-3 px-3 cursor-pointer hover:text-primary" onClick={() => handleSort('firstAllocatedDriver')}>
                First Allocated Driver {sortKey === 'firstAllocatedDriver' ? (sortAsc ? '▲' : '▼') : ''}
              </th>
              <th className="py-3 px-3 text-center cursor-pointer hover:text-primary" onClick={() => handleSort('status')}>
                Walkaround Status {sortKey === 'status' ? (sortAsc ? '▲' : '▼') : ''}
              </th>
              <th className="py-3 px-3 text-left">Check Time & Duration</th>
              <th className="py-3 px-3 text-left">Inspecting Driver</th>
              <th className="py-3 px-3 text-right">Odometer</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-base-200 text-xs sm:text-sm">
            {filteredRecords.length === 0 ? (
              <tr>
                <td colSpan={8} className="py-8 text-center text-sm text-base-content/50">
                  No vehicle records matching the selected filter.
                </td>
              </tr>
            ) : (
              filteredRecords.map((r) => {
                const isExpanded = expandedRow === r.licensePlate;
                const isMissing = r.status === 'missing_check';
                const isDefect = r.status === 'defect_reported';
                const isLate = r.status === 'late_check';
                const isCompliant = r.status === 'compliant';

                return (
                  <Fragment key={r.licensePlate}>
                    <tr
                      onClick={() => setExpandedRow(isExpanded ? null : r.licensePlate)}
                      className={`cursor-pointer transition-colors ${
                        isMissing
                          ? 'bg-rose-500/10 hover:bg-rose-500/15 border-l-4 border-l-rose-500'
                          : isDefect
                          ? 'bg-amber-500/5 hover:bg-amber-500/10 border-l-4 border-l-amber-500'
                          : isLate
                          ? 'bg-amber-400/5 hover:bg-amber-400/10 border-l-4 border-l-amber-400'
                          : 'hover:bg-base-200/50 border-l-4 border-l-emerald-500'
                      }`}
                    >
                      <td className="py-3 px-2 text-center text-base-content/60 font-mono">
                        <span className={`inline-block transition-transform duration-150 ${isExpanded ? 'rotate-90 text-primary font-bold' : ''}`}>
                          ▶
                        </span>
                      </td>

                      {/* Vehicle Plate */}
                      <td className="py-3 px-4 font-bold text-base-content">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-sm">{r.licensePlate}</span>
                          {r.capacity ? (
                            <span className="badge badge-ghost badge-xs text-[10px] text-base-content/60">{r.capacity} seats</span>
                          ) : null}
                        </div>
                        <span className="block text-xs font-normal text-base-content/60 truncate max-w-[160px]">{r.vehicleName}</span>
                      </td>

                      {/* First Departure Time */}
                      <td className="py-3 px-3 font-semibold tabular-nums text-base-content">
                        <span className="text-sm">{formatTime(r.firstDepartureTime)}</span>
                        <span className="block text-[11px] font-normal text-base-content/50">{r.totalTripsToday} trip{r.totalTripsToday > 1 ? 's' : ''} today</span>
                      </td>

                      {/* First Allocated Driver */}
                      <td className="py-3 px-3">
                        <div className="flex items-center gap-1.5">
                          {isMissing && <span className="text-rose-500 text-sm font-bold">⚠️</span>}
                          <span className={`font-bold ${isMissing ? 'text-rose-600 dark:text-rose-400' : 'text-base-content'}`}>
                            {r.firstAllocatedDriver}
                          </span>
                        </div>
                        {isMissing ? (
                          <span className="badge badge-error badge-xs font-bold text-error-content mt-0.5">
                            MISSING CHECK RESPONSIBLE
                          </span>
                        ) : (
                          <span className="block text-xs text-base-content/55">Trip #{r.firstTripCode}</span>
                        )}
                      </td>

                      {/* Walkaround Status Badge */}
                      <td className="py-3 px-3 text-center">
                        {isMissing && (
                          <span className="badge badge-error text-error-content badge-sm font-bold py-2.5 px-3">
                            MISSING CHECK
                          </span>
                        )}
                        {isDefect && (
                          <span className="badge badge-warning text-warning-content badge-sm font-bold py-2.5 px-3">
                            DEFECT REPORTED
                          </span>
                        )}
                        {isLate && (
                          <span className="badge badge-warning badge-outline badge-sm font-bold py-2.5 px-3">
                            LATE INSPECTION
                          </span>
                        )}
                        {isCompliant && (
                          <span className="badge badge-success text-success-content badge-sm font-bold py-2.5 px-3">
                            COMPLIANT (PASS)
                          </span>
                        )}
                      </td>

                      {/* Check Time & Duration */}
                      <td className="py-3 px-3 tabular-nums">
                        {r.checkCompletedTime ? (
                          <>
                            <span className="font-semibold text-base-content">{formatTime(r.checkCompletedTime)}</span>
                            {r.durationMinutes != null && (
                              <span className="block text-xs text-base-content/60">Duration: {r.durationMinutes} min{r.durationMinutes !== 1 ? 's' : ''}</span>
                            )}
                          </>
                        ) : (
                          <span className="text-base-content/40 font-mono italic">No check logged</span>
                        )}
                      </td>

                      {/* Inspecting Driver */}
                      <td className="py-3 px-3">
                        {r.inspectingDriver ? (
                          <div>
                            <span className="font-medium text-base-content">{r.inspectingDriver}</span>
                            {r.driverMismatch && (
                              <span className="badge badge-ghost badge-xs text-[10px] text-amber-600 block mt-0.5 font-normal" title="Check was performed by someone other than the first allocated driver">
                                Driver Mismatch
                              </span>
                            )}
                          </div>
                        ) : (
                          <span className="text-base-content/40 font-mono">-</span>
                        )}
                      </td>

                      {/* Odometer */}
                      <td className="py-3 px-3 text-right tabular-nums text-xs text-base-content/70">
                        {r.odometer ? `${formatInt(r.odometer)} km` : '-'}
                      </td>
                    </tr>

                    {/* Expanded Row Detail */}
                    {isExpanded && (
                      <tr key={`${r.licensePlate}-details`} className="bg-base-200/40">
                        <td colSpan={8} className="p-0 border-b border-base-300">
                          <div className="p-4 sm:p-5 space-y-4 bg-base-100/90 rounded-b-xl border-t border-base-300">
                            {/* Trip Context Header */}
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pb-3 border-b border-base-300/60 text-xs">
                              <div>
                                <span className="text-base-content/60 block font-medium">First Scheduled Journey:</span>
                                <span className="font-bold text-base-content">{r.firstTripCode} ({r.firstTripType})</span>
                              </div>
                              <div>
                                <span className="text-base-content/60 block font-medium">Customer:</span>
                                <span className="font-bold text-base-content truncate block" title={r.customerName}>{r.customerName || 'N/A'}</span>
                              </div>
                              <div>
                                <span className="text-base-content/60 block font-medium">Scheduled Departure (Point A):</span>
                                <span className="font-bold text-base-content">{formatTime(r.firstDepartureTime)}</span>
                              </div>
                            </div>

                            {/* Defect Details Section */}
                            {(r.defects && r.defects.length > 0) ? (
                              <div className="space-y-2">
                                <h4 className="text-xs font-bold uppercase tracking-wider text-amber-600 flex items-center gap-2">
                                  <span>Reported Defects ({r.defects.length})</span>
                                  <span className="badge badge-warning badge-xs">Requires Workshop Review</span>
                                </h4>
                                <div className="overflow-x-auto rounded-lg border border-base-300">
                                  <table className="table table-xs bg-base-100">
                                    <thead className="bg-base-200/60">
                                      <tr>
                                        <th>Defect #</th>
                                        <th>Type & Description</th>
                                        <th>Severity</th>
                                        <th>Driver Comments</th>
                                        <th>Rectification Status</th>
                                        <th>Workshop Action</th>
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {(r.defects || []).map((d, dIdx) => (
                                        <tr key={d.defectId || dIdx}>
                                          <td className="font-mono text-xs font-bold">{d.defectId || '-'}</td>
                                          <td>
                                            <span className="font-bold text-base-content">{d.type}</span>
                                            <span className="block text-[11px] text-base-content/70">{d.description}</span>
                                          </td>
                                          <td>
                                            <span className={`badge badge-xs ${d.severity?.toLowerCase() === 'major' ? 'badge-error' : 'badge-ghost'}`}>
                                              {d.severity || 'Standard'}
                                            </span>
                                          </td>
                                          <td className="max-w-[220px] text-xs text-base-content/80 italic">
                                            {d.comments || 'No comments'}
                                          </td>
                                          <td>
                                            {d.isRectified ? (
                                              <span className="badge badge-success badge-xs font-semibold">Rectified</span>
                                            ) : (
                                              <span className="badge badge-warning badge-xs font-semibold">Pending / Open</span>
                                            )}
                                          </td>
                                          <td className="text-xs text-base-content/70">
                                            {d.rectifiedDescription ? (
                                              <span>{d.rectifiedDescription}</span>
                                            ) : (
                                              <span className="text-base-content/40 italic">Awaiting sign-off</span>
                                            )}
                                          </td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                </div>
                              </div>
                            ) : isMissing ? (
                              <div className="rounded-lg bg-rose-500/10 border border-rose-500/20 p-3 text-xs text-rose-800 dark:text-rose-300">
                                <p className="font-bold">Compliance Breach Action:</p>
                                <p className="mt-0.5">
                                  Vehicle operated without a first-use walkaround check. Driver <span className="font-bold underline">{r.firstAllocatedDriver}</span> must be contacted to submit a walkaround check immediately or confirm why the inspection was bypassed.
                                </p>
                              </div>
                            ) : (
                              <div className="rounded-lg bg-emerald-500/10 border border-emerald-500/20 p-3 text-xs text-emerald-800 dark:text-emerald-300 flex items-center justify-between">
                                <div>
                                  <p className="font-bold">Nil Defect Walkaround Inspection Verified</p>
                                  <p className="mt-0.5">
                                    Check #{r.checkSerialNo} was completed cleanly with zero safety or mechanical defects reported.
                                  </p>
                                </div>
                                <span className="badge badge-success badge-sm font-semibold">DVSA Compliant</span>
                              </div>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* 5. Unallocated Pre-Checked Vehicles Section */}
      {unallocated.length > 0 && (
        <div className="rounded-xl border border-base-300 bg-base-100 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-semibold text-sm text-base-content flex items-center gap-2">
                <span>Spare / Yard Vehicles Inspected ({unallocated.length})</span>
                <span className="badge badge-ghost badge-sm text-xs">No Trips in Redshift Today</span>
              </h3>
              <p className="text-xs text-base-content/60">
                Coaches that completed a walkaround check in VMS today but have not been dispatched on operational journeys.
              </p>
            </div>
            <button
              type="button"
              className="btn btn-xs btn-outline"
              onClick={() => setShowUnallocated(!showUnallocated)}
            >
              {showUnallocated ? 'Hide Spare Vehicles' : 'Show Spare Vehicles'}
            </button>
          </div>

          {showUnallocated && (
            <div className="overflow-x-auto rounded-lg border border-base-300 pt-1">
              <table className="table table-xs">
                <thead className="bg-base-200/60">
                  <tr>
                    <th>Registration Mark</th>
                    <th>Fleet No</th>
                    <th>Inspecting Driver</th>
                    <th>Check Time</th>
                    <th>Duration</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {(unallocated || []).map((u, uIdx) => (
                    <tr key={u.registrationMark || uIdx}>
                      <td className="font-mono font-bold">{u.registrationMark}</td>
                      <td>{u.fleetNo || '-'}</td>
                      <td>{u.inspectingDriver || 'Staff'}</td>
                      <td>{formatTime(u.completedTime)}</td>
                      <td>{u.durationMinutes != null ? `${u.durationMinutes} min` : '-'}</td>
                      <td>
                        {u.hasDefects ? (
                          <span className="badge badge-warning badge-xs">Defect Reported ({u.defectsCount})</span>
                        ) : (
                          <span className="badge badge-success badge-xs">Nil Defect (Pass)</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}



function PeriodComparisonPanel({ panel, note, depots = [], segments = [] }) {
  const [currentPanel, setCurrentPanel] = useState(panel);
  const [loading, setLoading] = useState(!panel);
  const [viewScope, setViewScope] = useState('all'); // 'all' | 'privateHire' | 'contracts'

  // Presets & Dates
  const [preset, setPreset] = useState('last-month-vs-prior-year');
  const [baseFrom, setBaseFrom] = useState(panel?.basePeriod?.from || '2026-10-01');
  const [baseTo, setBaseTo] = useState(panel?.basePeriod?.to || '2026-10-31');
  const [compFrom, setCompFrom] = useState(panel?.comparePeriod?.from || '2025-10-01');
  const [compareTo, setCompareTo] = useState(panel?.comparePeriod?.to || '2025-10-31');

  const [depot, setDepot] = useState('All');
  const [segment, setSegment] = useState('All');

  const handleApplyPreset = (key) => {
    setPreset(key);
    const now = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    const toIso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

    if (key === 'today-vs-yesterday') {
      const today = new Date();
      const yesterday = new Date();
      yesterday.setDate(today.getDate() - 1);
      setBaseFrom(toIso(today));
      setBaseTo(toIso(today));
      setCompFrom(toIso(yesterday));
      setCompareTo(toIso(yesterday));
    } else if (key === 'today-vs-same-day-last-year') {
      const today = new Date();
      const lastYear = new Date();
      lastYear.setFullYear(today.getFullYear() - 1);
      setBaseFrom(toIso(today));
      setBaseTo(toIso(today));
      setCompFrom(toIso(lastYear));
      setCompareTo(toIso(lastYear));
    } else if (key === 'last-7-days-vs-prior-7-days') {
      const bTo = new Date();
      const bFrom = new Date();
      bFrom.setDate(bTo.getDate() - 6);
      const cTo = new Date();
      cTo.setDate(bFrom.getDate() - 1);
      const cFrom = new Date();
      cFrom.setDate(cTo.getDate() - 6);
      setBaseFrom(toIso(bFrom));
      setBaseTo(toIso(bTo));
      setCompFrom(toIso(cFrom));
      setCompareTo(toIso(cTo));
    } else if (key === 'last-month-vs-prior-year') {
      const y = now.getFullYear();
      const m = now.getMonth(); // 0-based, so current month-1 in 1-based
      const bStart = new Date(y, m - 1, 1);
      const bEnd = new Date(y, m, 0);
      const cStart = new Date(y - 1, m - 1, 1);
      const cEnd = new Date(y - 1, m, 0);
      setBaseFrom(toIso(bStart));
      setBaseTo(toIso(bEnd));
      setCompFrom(toIso(cStart));
      setCompareTo(toIso(cEnd));
    } else if (key === 'last-month-vs-previous-month') {
      const y = now.getFullYear();
      const m = now.getMonth();
      const bStart = new Date(y, m - 1, 1);
      const bEnd = new Date(y, m, 0);
      const cStart = new Date(y, m - 2, 1);
      const cEnd = new Date(y, m - 1, 0);
      setBaseFrom(toIso(bStart));
      setBaseTo(toIso(bEnd));
      setCompFrom(toIso(cStart));
      setCompareTo(toIso(cEnd));
    }
  };

  const executeComparison = useCallback(async (bF, bT, cF, cT, dFilter, sFilter) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        tab: 'comparison',
        baseFrom: bF,
        baseTo: bT,
        compareFrom: cF,
        compareTo: cT,
        depot: dFilter,
        segment: sFilter,
      });
      const res = await fetch(`/api/getFinanceReports?${params.toString()}`, {
        credentials: 'include',
        cache: 'no-store',
      });
      const json = await res.json().catch(() => ({}));
      if (json.ok && json.data?.comparison) {
        setCurrentPanel(json.data.comparison);
      }
    } catch (err) {
      console.error('Failed to run comparison:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (panel) {
      setCurrentPanel(panel);
    } else {
      void executeComparison(baseFrom, baseTo, compFrom, compareTo, depot, segment);
    }
  }, [panel, executeComparison]);

  const kpis = currentPanel?.kpis?.[viewScope] || currentPanel?.kpis?.all || {};
  const vehicles = currentPanel?.vehicles || [];
  const categories = currentPanel?.categories || [];

  const bLabel = currentPanel?.basePeriod?.isSingleDay
    ? formatUkDate(currentPanel.basePeriod.from)
    : `${formatUkDate(currentPanel?.basePeriod?.from || baseFrom)} → ${formatUkDate(currentPanel?.basePeriod?.to || baseTo)}`;

  const cLabel = currentPanel?.comparePeriod?.isSingleDay
    ? formatUkDate(currentPanel.comparePeriod.from)
    : `${formatUkDate(currentPanel?.comparePeriod?.from || compFrom)} → ${formatUkDate(currentPanel?.comparePeriod?.to || compareTo)}`;

  const renderDeltaBadge = (delta, isCurrency = false, diff = 0) => {
    const isUp = delta >= 0;
    return (
      <div className="flex items-center gap-1.5 mt-1">
        <span
          className={`badge badge-sm font-bold ${
            isUp
              ? 'badge-success text-success-content'
              : 'badge-error text-error-content'
          }`}
        >
          {isUp ? '▲ +' : '▼ '}
          {formatPct(delta)}
        </span>
        <span className="text-xs text-base-content/60 font-medium tabular-nums">
          ({isUp ? '+' : ''}{isCurrency ? formatGbp(diff) : formatInt(diff)} vs <span className="text-fuchsia-600 dark:text-fuchsia-400 font-semibold">Period B</span>)
        </span>
      </div>
    );
  };

  return (
    <div className="space-y-8" data-panel="period-comparison">
      {/* 1. Configuration & Date Pickers Toolbar */}
      <div className="rounded-2xl border border-base-300 bg-base-100 p-5 shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-base-300/60 pb-3">
          <div>
            <h2 className="text-2xl font-bold tracking-tight text-base-content flex items-center gap-2">
              <span>{currentPanel?.title || 'Period Comparison'}</span>
              <span className="badge badge-primary badge-sm font-semibold">Custom Period vs Period</span>
            </h2>
            <p className="text-xs text-base-content/65 mt-0.5">
              Select any two specific dates or date ranges to compare operational revenue, passenger volumes, and coach utilisation side-by-side.
            </p>
          </div>

          {/* Quick Presets */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-semibold text-base-content/55 uppercase tracking-wider">Presets:</span>
            <select
              value={preset}
              onChange={(e) => handleApplyPreset(e.target.value)}
              className="select select-sm select-bordered font-medium"
            >
              <option value="last-month-vs-prior-year">Last Month vs Same Month Last Year</option>
              <option value="last-month-vs-previous-month">Last Month vs Previous Month</option>
              <option value="last-7-days-vs-prior-7-days">Last 7 Days vs Prior 7 Days</option>
              <option value="today-vs-yesterday">Today vs Yesterday (Single Day)</option>
              <option value="today-vs-same-day-last-year">Today vs Same Day Last Year</option>
              <option value="custom">Custom Date Ranges</option>
            </select>
          </div>
        </div>

        {/* Date Ranges Input Row */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4 items-end">
          {/* Period A: Primary / Base */}
          <div className="lg:col-span-2 p-3 rounded-xl border border-primary/25 bg-primary/5 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-primary flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-primary" /> Period A (Base Period)
              </span>
              <span className="text-[11px] text-base-content/60 font-medium">
                {baseFrom === baseTo ? 'Single Date' : 'Date Range'}
              </span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[11px] text-base-content/60 block mb-1">From Date</label>
                <input
                  type="date"
                  value={baseFrom}
                  onChange={(e) => { setBaseFrom(e.target.value); setPreset('custom'); }}
                  className="input input-sm input-bordered w-full font-medium"
                />
              </div>
              <div>
                <label className="text-[11px] text-base-content/60 block mb-1">To Date</label>
                <input
                  type="date"
                  value={baseTo}
                  onChange={(e) => { setBaseTo(e.target.value); setPreset('custom'); }}
                  className="input input-sm input-bordered w-full font-medium"
                />
              </div>
            </div>
          </div>

          {/* Period B: Comparison / Benchmark */}
          <div className="lg:col-span-2 p-3 rounded-xl border border-fuchsia-500/35 bg-fuchsia-500/5 dark:bg-fuchsia-950/20 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-fuchsia-600 dark:text-fuchsia-400 flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-fuchsia-500" /> Period B (Comparison Target)
              </span>
              <span className="text-[11px] text-fuchsia-600/80 dark:text-fuchsia-400/80 font-medium">
                {compFrom === compareTo ? 'Single Date' : 'Date Range'}
              </span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[11px] text-base-content/60 block mb-1">From Date</label>
                <input
                  type="date"
                  value={compFrom}
                  onChange={(e) => { setCompFrom(e.target.value); setPreset('custom'); }}
                  className="input input-sm input-bordered w-full font-medium"
                />
              </div>
              <div>
                <label className="text-[11px] text-base-content/60 block mb-1">To Date</label>
                <input
                  type="date"
                  value={compareTo}
                  onChange={(e) => { setCompareTo(e.target.value); setPreset('custom'); }}
                  className="input input-sm input-bordered w-full font-medium"
                />
              </div>
            </div>
          </div>

          {/* Action Button & Filters */}
          <div className="space-y-2">
            <button
              type="button"
              disabled={loading}
              onClick={() => void executeComparison(baseFrom, baseTo, compFrom, compareTo, depot, segment)}
              className="btn btn-sm btn-primary w-full shadow-sm"
            >
              {loading ? (
                <>
                  <span className="loading loading-spinner loading-xs" /> Comparing...
                </>
              ) : (
                'Run Comparison'
              )}
            </button>
            <div className="flex gap-2">
              <select
                value={depot}
                onChange={(e) => {
                  setDepot(e.target.value);
                  void executeComparison(baseFrom, baseTo, compFrom, compareTo, e.target.value, segment);
                }}
                className="select select-xs select-bordered w-1/2"
              >
                <option value="All">All Depots</option>
                {depots.map((d) => (
                  <option key={d} value={d}>{d}</option>
                ))}
              </select>
              <select
                value={segment}
                onChange={(e) => {
                  setSegment(e.target.value);
                  void executeComparison(baseFrom, baseTo, compFrom, compareTo, depot, e.target.value);
                }}
                className="select select-xs select-bordered w-1/2"
              >
                <option value="All">All Segments</option>
                {segments.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Scope Pill Toggle */}
        <div className="flex items-center justify-between border-t border-base-300/60 pt-3">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-base-content/60 uppercase tracking-wider">Service Scope:</span>
            <div className="join">
              <button
                type="button"
                className={`btn btn-xs join-item ${viewScope === 'all' ? 'btn-active btn-neutral' : 'btn-ghost'}`}
                onClick={() => setViewScope('all')}
              >
                Both (All Work)
              </button>
              <button
                type="button"
                className={`btn btn-xs join-item ${viewScope === 'privateHire' ? 'btn-active btn-neutral' : 'btn-ghost'}`}
                onClick={() => setViewScope('privateHire')}
              >
                Private Hire Only
              </button>
              <button
                type="button"
                className={`btn btn-xs join-item ${viewScope === 'contracts' ? 'btn-active btn-neutral' : 'btn-ghost'}`}
                onClick={() => setViewScope('contracts')}
              >
                Contracts Only
              </button>
            </div>
          </div>
          <div className="text-xs text-base-content/60 font-medium">
            Comparing: <span className="font-bold text-primary">{bLabel} (Period A)</span> vs <span className="font-bold text-fuchsia-600 dark:text-fuchsia-400">{cLabel} (Period B)</span>
          </div>
        </div>
      </div>

      {loading && !currentPanel ? (
        <div className="flex flex-col items-center justify-center py-16 gap-3">
          <span className="loading loading-spinner loading-lg text-primary" />
          <p className="text-sm text-base-content/60 font-medium">Calculating period comparison metrics...</p>
        </div>
      ) : !currentPanel ? (
        <div className="rounded-xl border border-base-300 bg-base-200/50 px-5 py-8 space-y-3">
          <h3 className="font-bold text-base text-base-content">Comparison data unavailable</h3>
          <p className="text-sm text-base-content/60">No comparison data could be retrieved for the selected dates. Please adjust your date ranges and click Run Comparison.</p>
          <button
            type="button"
            className="btn btn-sm btn-primary"
            onClick={() => void executeComparison(baseFrom, baseTo, compFrom, compareTo, depot, segment)}
          >
            Run Comparison
          </button>
        </div>
      ) : (
        <>
          {/* 2. Top KPI Cards Comparison Grid */}
          <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {/* Revenue */}
            <div className="rounded-2xl border border-base-300 bg-base-100 p-5 shadow-sm flex flex-col justify-between">
              <div>
                <span className="text-xs font-semibold uppercase tracking-wider text-base-content/55">Total Revenue</span>
                <div className="mt-2 flex items-baseline justify-between gap-2">
                  <div className="flex flex-col">
                    <span className="text-[11px] font-medium text-base-content/60">Period A</span>
                    <span className="text-2xl font-black text-primary tabular-nums">{formatGbp(kpis.baseRevenue || 0)}</span>
                  </div>
                  <div className="flex flex-col items-end">
                    <span className="text-[11px] font-semibold uppercase text-fuchsia-600 dark:text-fuchsia-400">Period B</span>
                    <span className="text-base font-black text-fuchsia-600 dark:text-fuchsia-400 tabular-nums">{formatGbp(kpis.compRevenue || 0)}</span>
                  </div>
                </div>
              </div>
              <div className="mt-3 pt-3 border-t border-base-200">
                {renderDeltaBadge(kpis.revenueDelta || 0, true, kpis.revenueDiff || 0)}
              </div>
            </div>

            {/* Total Trips */}
            <div className="rounded-2xl border border-base-300 bg-base-100 p-5 shadow-sm flex flex-col justify-between">
              <div>
                <span className="text-xs font-semibold uppercase tracking-wider text-base-content/55">Journeys Operated</span>
                <div className="mt-2 flex items-baseline justify-between gap-2">
                  <div className="flex flex-col">
                    <span className="text-[11px] font-medium text-base-content/60">Period A</span>
                    <span className="text-2xl font-black text-primary tabular-nums">{formatInt(kpis.baseTrips || 0)}</span>
                  </div>
                  <div className="flex flex-col items-end">
                    <span className="text-[11px] font-semibold uppercase text-fuchsia-600 dark:text-fuchsia-400">Period B</span>
                    <span className="text-base font-black text-fuchsia-600 dark:text-fuchsia-400 tabular-nums">{formatInt(kpis.compTrips || 0)} trips</span>
                  </div>
                </div>
              </div>
              <div className="mt-3 pt-3 border-t border-base-200">
                {renderDeltaBadge(kpis.tripsDelta || 0, false, kpis.tripsDiff || 0)}
              </div>
            </div>

            {/* Total Passengers */}
            <div className="rounded-2xl border border-base-300 bg-base-100 p-5 shadow-sm flex flex-col justify-between">
              <div>
                <span className="text-xs font-semibold uppercase tracking-wider text-base-content/55">Passengers Carried</span>
                <div className="mt-2 flex items-baseline justify-between gap-2">
                  <div className="flex flex-col">
                    <span className="text-[11px] font-medium text-base-content/60">Period A</span>
                    <span className="text-2xl font-black text-primary tabular-nums">{formatInt(kpis.basePax || 0)}</span>
                  </div>
                  <div className="flex flex-col items-end">
                    <span className="text-[11px] font-semibold uppercase text-fuchsia-600 dark:text-fuchsia-400">Period B</span>
                    <span className="text-base font-black text-fuchsia-600 dark:text-fuchsia-400 tabular-nums">{formatInt(kpis.compPax || 0)} pax</span>
                  </div>
                </div>
              </div>
              <div className="mt-3 pt-3 border-t border-base-200">
                {renderDeltaBadge(kpis.paxDelta || 0, false, kpis.paxDiff || 0)}
                <span className="text-[11px] text-base-content/55 block mt-1">
                  Avg group: {kpis.baseAvgPaxPerTrip || 0} pax vs <span className="font-bold text-fuchsia-600 dark:text-fuchsia-400">{kpis.compAvgPaxPerTrip || 0} pax (B)</span>
                </span>
              </div>
            </div>

            {/* Operational Hours & Yield */}
            <div className="rounded-2xl border border-base-300 bg-base-100 p-5 shadow-sm flex flex-col justify-between">
              <div>
                <span className="text-xs font-semibold uppercase tracking-wider text-base-content/55">Operating Hours & Yield</span>
                <div className="mt-2 flex items-baseline justify-between gap-2">
                  <div className="flex flex-col">
                    <span className="text-[11px] font-medium text-base-content/60">Period A</span>
                    <span className="text-2xl font-black text-primary tabular-nums">{formatInt(kpis.baseHours || 0)} hrs</span>
                  </div>
                  <div className="flex flex-col items-end">
                    <span className="text-[11px] font-semibold uppercase text-fuchsia-600 dark:text-fuchsia-400">Period B</span>
                    <span className="text-base font-black text-fuchsia-600 dark:text-fuchsia-400 tabular-nums">{formatInt(kpis.compHours || 0)} hrs</span>
                  </div>
                </div>
              </div>
              <div className="mt-3 pt-3 border-t border-base-200">
                {renderDeltaBadge(kpis.hoursDelta || 0, false, kpis.hoursDiff || 0)}
                <span className="text-[11px] text-base-content/55 block mt-1">
                  Yield: {formatGbp(kpis.baseRevPerHour || 0)}/hr vs <span className="font-bold text-fuchsia-600 dark:text-fuchsia-400">{formatGbp(kpis.compRevPerHour || 0)}/hr (B)</span>
                </span>
              </div>
            </div>
          </section>

          {/* 3. Detailed Side-by-Side Breakdown Tables */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Left: Customer Category / Segment Comparison (1 col) */}
            <div className="rounded-2xl border border-base-300 bg-base-100 p-5 shadow-sm space-y-4">
              <div>
                <h3 className="font-bold text-base text-base-content">Market Segment Performance</h3>
                <p className="text-xs text-base-content/60">Revenue & trip growth across customer sectors</p>
              </div>
              <div className="overflow-x-auto">
                <table className="table table-xs">
                  <thead className="bg-base-200/60">
                    <tr>
                      <th>Segment</th>
                      <th className="text-right">Period A</th>
                      <th className="text-right text-fuchsia-600 dark:text-fuchsia-400 font-bold">Period B</th>
                      <th className="text-right">Growth</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-base-200">
                    {categories.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="text-center py-4 text-base-content/50">No sector data in range</td>
                      </tr>
                    ) : (
                      (categories || []).map((c, cIdx) => {
                        const isUp = (c.revenueDelta || 0) >= 0;
                        return (
                          <tr key={c.category || cIdx} className="hover:bg-base-200/40">
                            <td className="font-semibold text-xs text-base-content">{c.category}</td>
                            <td className="text-right tabular-nums font-medium text-primary">{formatGbp(c.baseRevenue)}</td>
                            <td className="text-right tabular-nums font-bold text-fuchsia-600 dark:text-fuchsia-400">{formatGbp(c.compRevenue)}</td>
                            <td className="text-right tabular-nums font-bold">
                              <span className={isUp ? 'text-success' : 'text-error'}>
                                {isUp ? '+' : ''}{formatPct(c.revenueDelta)}
                              </span>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Right: Fleet Vehicle Comparison Table (2 cols) */}
            <div className="lg:col-span-2 rounded-2xl border border-base-300 bg-base-100 p-5 shadow-sm space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-bold text-base text-base-content">Coach Utilisation & Revenue Comparison</h3>
                  <p className="text-xs text-base-content/60">Top vehicle performance in Period A vs Period B</p>
                </div>
                <span className="badge badge-sm badge-outline text-xs">Top Coaches</span>
              </div>
              <div className="overflow-x-auto max-h-[480px]">
                <table className="table table-xs table-pin-rows">
                  <thead className="bg-base-200/90 font-semibold text-xs text-base-content/70 uppercase">
                    <tr>
                      <th>Vehicle Plate</th>
                      <th className="text-right">Cap</th>
                      <th className="text-right">Period A Rev</th>
                      <th className="text-right text-fuchsia-600 dark:text-fuchsia-400 font-bold">Period B Rev</th>
                      <th className="text-right">Rev Delta</th>
                      <th className="text-right">Period A Trips</th>
                      <th className="text-right text-fuchsia-600 dark:text-fuchsia-400 font-bold">Period B Trips</th>
                      <th className="text-right">Pax A / <span className="text-fuchsia-600 dark:text-fuchsia-400 font-bold">B</span></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-base-200">
                    {vehicles.length === 0 ? (
                      <tr>
                        <td colSpan={8} className="text-center py-6 text-base-content/50">No vehicle data for these periods</td>
                      </tr>
                    ) : (
                      (vehicles || []).map((v, vIdx) => {
                        const isUp = (v.revenueDelta || 0) >= 0;
                        return (
                          <tr key={v.licensePlate || vIdx} className="hover:bg-base-200/40">
                            <td className="font-bold font-mono text-xs text-base-content">{v.licensePlate}</td>
                            <td className="text-right tabular-nums text-base-content/60">{v.capacity || '-'}</td>
                            <td className="text-right tabular-nums font-bold text-primary">{formatGbp(v.baseRevenue)}</td>
                            <td className="text-right tabular-nums font-bold text-fuchsia-600 dark:text-fuchsia-400">{formatGbp(v.compRevenue)}</td>
                            <td className="text-right tabular-nums font-bold">
                              <span className={isUp ? 'text-success' : 'text-error'}>
                                {isUp ? '+' : ''}{formatPct(v.revenueDelta)}
                              </span>
                            </td>
                            <td className="text-right tabular-nums font-medium">{formatInt(v.baseTrips)}</td>
                            <td className="text-right tabular-nums font-bold text-fuchsia-600 dark:text-fuchsia-400">{formatInt(v.compTrips)}</td>
                            <td className="text-right tabular-nums text-xs font-medium">
                              <span>{formatInt(v.basePax)}</span> / <span className="font-bold text-fuchsia-600 dark:text-fuchsia-400">{formatInt(v.compPax)}</span>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}


function ComparisonStrip({ comparisons }) {
  const period = comparisons?.period;
  const mtd = comparisons?.mtd;
  if (!period || !mtd) return null;
  if (!period.current || !period.prior || !mtd.current || !mtd.prior) return null;

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
  const safeKpis = kpis || {};
  const trips = Number(safeKpis.trips) || 0;
  const rev = Number(safeKpis.revenue) || 0;
  const revPerTrip = trips > 0 ? rev / trips : null;
  return (
    <section className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
      <Kpi
        label="Trip revenue (ex VAT)"
        value={formatGbp(rev)}
        delta={safeKpis.revenueDelta}
        hint={`${formatInt(trips)} trips`}
      />
      <Kpi
        label="Rev per trip"
        value={revPerTrip == null ? '—' : formatGbp(revPerTrip)}
        hint="Average trip revenue (ex VAT)"
        hideDelta
      />
      <Kpi
        label="Trips"
        value={formatInt(trips)}
        hint="Operational trips in range"
        hideDelta
      />
      <Kpi
        label="Bookings"
        value={formatInt(Number(safeKpis.bookings) || 0)}
        hint="Distinct orders behind those trips"
        hideDelta
      />
    </section>
  );
}

function TrendBlock({ title, subtitle, trend }) {
  const safeTrend = Array.isArray(trend) ? trend : [];
  return (
    <div>
      <SectionTitle title={title} subtitle={subtitle} />
      <div className="mt-4 h-72 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={safeTrend} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
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
  const safeRows = Array.isArray(rows) ? rows : [];
  return (
    <div>
      <SectionTitle title={title} subtitle={subtitle} />
      <div className="mt-4 h-72 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={safeRows} layout="vertical" margin={{ top: 8, right: 12, left: 8, bottom: 0 }}>
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

function SortableTable({ columns = [], rows = [], rowKey, defaultSort }) {
  const safeRows = Array.isArray(rows) ? rows : [];
  const [sortKey, setSortKey] = useState(defaultSort?.key || columns[0]?.key);
  const [sortDir, setSortDir] = useState(defaultSort?.dir || 'desc');

  const sorted = useMemo(() => {
    const col = columns.find((c) => c.key === sortKey) || columns[0];
    if (!col) return safeRows;
    const dir = sortDir === 'asc' ? 1 : -1;
    return [...safeRows].sort(
      (a, b) => dir * compareSortValues(a?.[col.key], b?.[col.key], col.type),
    );
  }, [safeRows, columns, sortKey, sortDir]);

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

function FieldSelect({ label, value, onChange, options = [] }) {
  const safeOptions = Array.isArray(options) ? options : [];
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
        {safeOptions.map((o) => (
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
