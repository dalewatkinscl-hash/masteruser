import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { readJsonResponse } from '../utils/employeeProfile';

function formatUkDate(value) {
  const text = String(value || '').slice(0, 10);
  const match = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return text || '—';
  return `${match[3]}/${match[2]}/${match[1]}`;
}

const EMPTY_FORM = {
  id: '',
  name: '',
  calculationFrom: '',
  calculationTo: '',
  paymentDate: '',
  paymentOfYear: 1,
};

export default function BonusPaymentSchedule() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [runs, setRuns] = useState([]);
  const [form, setForm] = useState(EMPTY_FORM);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const response = await fetch('/api/getBonusPaymentRuns', { credentials: 'include' });
      const data = (await readJsonResponse(response)) || {};
      if (!response.ok) throw new Error(data.error || 'Failed to load payment schedules.');
      setRuns(Array.isArray(data.paymentRuns) ? data.paymentRuns : []);
    } catch (err) {
      setError(err.message || 'Failed to load payment schedules.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const editRun = (run) => {
    setForm({
      id: run.id || '',
      name: run.name || '',
      calculationFrom: run.calculationFrom || '',
      calculationTo: run.calculationTo || '',
      paymentDate: run.paymentDate || '',
      paymentOfYear: Number(run.paymentOfYear) === 2 ? 2 : 1,
    });
    setMessage('');
    setError('');
  };

  const resetForm = () => {
    setForm(EMPTY_FORM);
    setMessage('');
    setError('');
  };

  const save = async (event) => {
    event.preventDefault();
    setSaving(true);
    setError('');
    setMessage('');
    try {
      const response = await fetch('/api/saveBonusPaymentRun', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const data = (await readJsonResponse(response)) || {};
      if (!response.ok) throw new Error(data.error || 'Failed to save payment.');
      setMessage(form.id ? `Updated “${data.paymentRun?.name || form.name}”.` : `Created “${data.paymentRun?.name || form.name}”.`);
      resetForm();
      await load();
    } catch (err) {
      setError(err.message || 'Failed to save payment.');
    } finally {
      setSaving(false);
    }
  };

  const remove = async (run) => {
    if (!run?.id) return;
    if (!window.confirm(`Delete payment schedule “${run.name}”?`)) return;
    setError('');
    setMessage('');
    try {
      const response = await fetch('/api/deleteBonusPaymentRun', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: run.id }),
      });
      const data = (await readJsonResponse(response)) || {};
      if (!response.ok) throw new Error(data.error || 'Failed to delete payment.');
      if (form.id === run.id) resetForm();
      setMessage(`Deleted “${run.name}”.`);
      await load();
    } catch (err) {
      setError(err.message || 'Failed to delete payment.');
    }
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-8 py-5 border-b border-[#1a2540] gap-3 flex-wrap">
        <div>
          <button
            type="button"
            onClick={() => navigate('/dashboard/hr/bonus-deductions')}
            className="text-xs text-slate-500 hover:text-slate-300 mb-1"
          >
            ← Bonus deductions
          </button>
          <h1 className="text-xl font-semibold text-white">Bonus payment schedule</h1>
          <p className="text-sm text-slate-400 mt-1 max-w-3xl">
            Create named payments (e.g. Xmas 2026) with a calculation period, payment date, and
            whether it is payment 1 or 2 of the year. Excess deductions from payment 1 carry into
            payment 2; after payment 2 the balance resets.
          </p>
          {message ? <p className="text-sm text-emerald-300/90 mt-2">{message}</p> : null}
        </div>
      </div>

      <div className="p-8 overflow-auto space-y-6">
        {error ? (
          <div className="bg-red-500/10 border border-red-500/25 rounded-lg p-4 text-sm text-red-300">{error}</div>
        ) : null}

        <form
          onSubmit={save}
          className="rounded-xl border border-[#1a2540] bg-[#0b1220] p-5 space-y-4 max-w-3xl"
        >
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <h2 className="text-sm font-semibold text-white">
              {form.id ? 'Edit payment' : 'New payment'}
            </h2>
            {form.id ? (
              <button
                type="button"
                onClick={resetForm}
                className="text-xs text-slate-400 hover:text-slate-200"
              >
                Cancel edit
              </button>
            ) : null}
          </div>
          <label className="block text-xs text-slate-400">
            Name
            <input
              type="text"
              required
              value={form.name}
              onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
              placeholder="e.g. Xmas 2026"
              className="mt-1.5 w-full bg-[#060e1a] border border-[#1a2540] text-slate-100 text-sm rounded-lg px-3 py-2.5"
            />
          </label>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <label className="block text-xs text-slate-400">
              Calc from
              <input
                type="date"
                required
                value={form.calculationFrom}
                onChange={(e) => setForm((prev) => ({ ...prev, calculationFrom: e.target.value }))}
                className="mt-1.5 w-full bg-[#060e1a] border border-[#1a2540] text-slate-100 text-sm rounded-lg px-3 py-2.5"
              />
            </label>
            <label className="block text-xs text-slate-400">
              Calc to
              <input
                type="date"
                required
                value={form.calculationTo}
                onChange={(e) => setForm((prev) => ({ ...prev, calculationTo: e.target.value }))}
                className="mt-1.5 w-full bg-[#060e1a] border border-[#1a2540] text-slate-100 text-sm rounded-lg px-3 py-2.5"
              />
            </label>
            <label className="block text-xs text-slate-400">
              Payment date
              <input
                type="date"
                required
                value={form.paymentDate}
                onChange={(e) => setForm((prev) => ({ ...prev, paymentDate: e.target.value }))}
                className="mt-1.5 w-full bg-[#060e1a] border border-[#1a2540] text-slate-100 text-sm rounded-lg px-3 py-2.5"
              />
            </label>
            <label className="block text-xs text-slate-400">
              Payment of year
              <select
                required
                value={form.paymentOfYear}
                onChange={(e) => setForm((prev) => ({
                  ...prev,
                  paymentOfYear: Number(e.target.value) === 2 ? 2 : 1,
                }))}
                className="mt-1.5 w-full bg-[#060e1a] border border-[#1a2540] text-slate-100 text-sm rounded-lg px-3 py-2.5"
              >
                <option value={1}>1 — first (e.g. July)</option>
                <option value={2}>2 — second (e.g. December)</option>
              </select>
            </label>
          </div>
          <button
            type="submit"
            disabled={saving}
            className="px-4 py-2.5 rounded-lg bg-indigo-600 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-40"
          >
            {saving ? 'Saving…' : form.id ? 'Update payment' : 'Create payment'}
          </button>
        </form>

        <div className="rounded-xl border border-[#1a2540] bg-[#0b1220] overflow-hidden max-w-4xl">
          <div className="px-5 py-3 border-b border-[#1a2540]">
            <h2 className="text-sm font-semibold text-white">Scheduled payments</h2>
          </div>
          {loading ? (
            <p className="px-5 py-6 text-sm text-slate-400">Loading…</p>
          ) : runs.length === 0 ? (
            <p className="px-5 py-6 text-sm text-slate-500">No payment schedules yet.</p>
          ) : (
            <table className="w-full">
              <thead>
                <tr className="border-b border-[#1a2540] bg-[#060e1a]/70 text-left text-xs uppercase tracking-widest text-slate-500">
                  <th className="px-5 py-3 font-semibold">Name</th>
                  <th className="px-5 py-3 font-semibold">Half</th>
                  <th className="px-5 py-3 font-semibold">Calc period</th>
                  <th className="px-5 py-3 font-semibold">Payment date</th>
                  <th className="px-5 py-3 font-semibold" />
                </tr>
              </thead>
              <tbody className="divide-y divide-[#1a2540]">
                {runs.map((run) => (
                  <tr key={run.id} className="hover:bg-[#060e1a]/40">
                    <td className="px-5 py-3 text-sm text-white font-medium">{run.name}</td>
                    <td className="px-5 py-3 text-sm text-slate-300">
                      {Number(run.paymentOfYear) === 2 ? '2 of 2' : '1 of 2'}
                    </td>
                    <td className="px-5 py-3 text-sm text-slate-300">
                      {formatUkDate(run.calculationFrom)} – {formatUkDate(run.calculationTo)}
                    </td>
                    <td className="px-5 py-3 text-sm text-slate-300">{formatUkDate(run.paymentDate)}</td>
                    <td className="px-5 py-3 text-sm text-right space-x-3">
                      <button
                        type="button"
                        onClick={() => editRun(run)}
                        className="text-indigo-300 hover:text-indigo-200"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => remove(run)}
                        className="text-rose-300 hover:text-rose-200"
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
