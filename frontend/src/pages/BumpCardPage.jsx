import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import WorkspaceTabs from '../components/WorkspaceTabs';
import { readJsonResponse } from '../utils/employeeProfile';

const inputClass = 'w-full bg-[#060e1a] border border-[#1a2540] text-slate-100 text-sm rounded-lg px-3 py-2';

export default function BumpCardPage() {
  const navigate = useNavigate();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState({
    incidentAt: new Date().toISOString().slice(0, 16),
    location: '',
    vehicleReg: '',
    description: '',
    injuries: '',
    thirdParty: '',
    weather: '',
    policeInvolved: false,
  });

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setForm((prev) => ({ ...prev, [name]: type === 'checkbox' ? checked : value }));
  };

  const submit = async () => {
    setSaving(true);
    setError('');
    try {
      const response = await fetch('/api/submitBumpCard', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          incidentAt: form.incidentAt ? new Date(form.incidentAt).toISOString() : new Date().toISOString(),
        }),
      });
      const data = (await readJsonResponse(response)) || {};
      if (!response.ok) throw new Error(data.error || 'Failed to submit bump card.');
      navigate('/dashboard/profile', { state: { profileTab: 'cases' } });
    } catch (err) {
      setError(err.message || 'Failed to submit bump card.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col h-full">
      <WorkspaceTabs />
      <div className="px-8 py-6 border-b border-[#1a2540]">
        <h1 className="text-2xl font-bold text-white">Vehicle bump card</h1>
        <p className="text-sm text-slate-400 mt-1">Report an accident or incident. One bump card per employee involved.</p>
      </div>
      <div className="p-8 max-w-2xl space-y-4 overflow-auto">
        {error && <div className="bg-red-500/10 border border-red-500/25 rounded-lg p-3 text-sm text-red-300">{error}</div>}
        <label className="block space-y-1">
          <span className="text-xs uppercase text-slate-500">When</span>
          <input type="datetime-local" name="incidentAt" value={form.incidentAt} onChange={handleChange} className={inputClass} />
        </label>
        <label className="block space-y-1">
          <span className="text-xs uppercase text-slate-500">Location</span>
          <input name="location" value={form.location} onChange={handleChange} className={inputClass} />
        </label>
        <label className="block space-y-1">
          <span className="text-xs uppercase text-slate-500">Vehicle registration</span>
          <input name="vehicleReg" value={form.vehicleReg} onChange={handleChange} className={inputClass} />
        </label>
        <label className="block space-y-1">
          <span className="text-xs uppercase text-slate-500">What happened</span>
          <textarea name="description" value={form.description} onChange={handleChange} rows={4} className={inputClass} />
        </label>
        <label className="block space-y-1">
          <span className="text-xs uppercase text-slate-500">Injuries</span>
          <input name="injuries" value={form.injuries} onChange={handleChange} className={inputClass} />
        </label>
        <label className="block space-y-1">
          <span className="text-xs uppercase text-slate-500">Third party details</span>
          <input name="thirdParty" value={form.thirdParty} onChange={handleChange} className={inputClass} />
        </label>
        <label className="block space-y-1">
          <span className="text-xs uppercase text-slate-500">Weather</span>
          <input name="weather" value={form.weather} onChange={handleChange} className={inputClass} />
        </label>
        <label className="flex items-center gap-2 text-sm text-slate-300">
          <input type="checkbox" name="policeInvolved" checked={form.policeInvolved} onChange={handleChange} />
          Police / authorities involved
        </label>
        <button
          type="button"
          onClick={submit}
          disabled={saving || !form.description.trim()}
          className="px-4 py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold"
        >
          {saving ? 'Submitting…' : 'Submit bump card'}
        </button>
      </div>
    </div>
  );
}
