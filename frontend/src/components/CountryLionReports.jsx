import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { FILTER_PERIODS, formatGbp, formatInt, formatPct, formatUkDate } from '../lib/financeFormat';

const TABS = [
  { id: 'private-hire', label: 'Private Hire' },
  { id: 'contracts', label: 'Contracts' },
  { id: 'by-vehicle', label: 'By vehicle' },
  { id: 'by-driver', label: 'By driver' },
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
      const empty =
        data.privateHire.kpis.revenue === 0
        && data.contracts.kpis.revenue === 0
        && data.byVehicle.kpis.revenue === 0;
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
    const t = data.byVehicle;
    return (
      <div className="space-y-8" data-panel="by-vehicle">
        <PanelIntro title={t.title} description={t.description} note={data.note} />
        <KpiRow kpis={t.kpis} />
        <div className="divider my-0" />
        <TrendBlock
          title="Revenue over time"
          subtitle={`All operational trip revenue (${rangeLabel}).`}
          trend={t.trend}
        />
        <div className="divider my-0" />
        <section>
          <SectionTitle
            title="Revenue by coach"
            subtitle="Coach means vehicle — ranked by trip revenue (ex VAT)."
          />
          <div className="mt-4 overflow-x-auto">
            <table className="table table-sm">
              <thead>
                <tr>
                  <th>Coach</th>
                  <th>Type</th>
                  <th>Plate</th>
                  <th className="text-right">Trips</th>
                  <th className="text-right">Revenue</th>
                </tr>
              </thead>
              <tbody>
                {t.byVehicle.map((row) => (
                  <tr key={`${row.coach}-${row.licensePlate}`}>
                    <td className="font-medium">{row.coach}</td>
                    <td className="text-base-content/70">{row.vehicleType}</td>
                    <td className="font-mono text-xs text-base-content/70">{row.licensePlate || '—'}</td>
                    <td className="text-right tabular-nums">{formatInt(row.trips)}</td>
                    <td className="text-right tabular-nums font-medium">{formatGbp(row.revenue)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    );
  }

  const t = data.byDriver;
  return (
    <div className="space-y-8" data-panel="by-driver">
      <PanelIntro title={t.title} description={t.description} note={data.note} />
      <KpiRow kpis={t.kpis} />
      <div className="divider my-0" />
      <TrendBlock
        title="Revenue over time"
        subtitle={`All operational trip revenue (${rangeLabel}).`}
        trend={t.trend}
      />
      <div className="divider my-0" />
      <section>
        <SectionTitle
          title="Revenue by driver"
          subtitle="Driver means the person from the employee list — not the coach."
        />
        <div className="mt-4 overflow-x-auto">
          <table className="table table-sm">
            <thead>
              <tr>
                <th>Driver</th>
                <th className="text-right">Trips</th>
                <th className="text-right">Revenue</th>
              </tr>
            </thead>
            <tbody>
              {t.byDriver.map((row) => (
                <tr key={row.driver}>
                  <td className="font-medium">{row.driver}</td>
                  <td className="text-right tabular-nums">{formatInt(row.trips)}</td>
                  <td className="text-right tabular-nums font-medium">{formatGbp(row.revenue)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
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
  return (
    <section className="grid gap-6 sm:grid-cols-3">
      <Kpi
        label="Trip revenue (ex VAT)"
        value={formatGbp(kpis.revenue)}
        delta={kpis.revenueDelta}
        hint={`${formatInt(kpis.trips)} trips`}
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
        <table className="table table-sm">
          <thead>
            <tr>
              <th>Customer</th>
              <th className="text-right">Trips</th>
              <th className="text-right">Revenue</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.name}>
                <td className="font-medium">{row.name}</td>
                <td className="text-right tabular-nums">{formatInt(row.trips || 0)}</td>
                <td className="text-right tabular-nums font-medium">{formatGbp(row.amount)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
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
