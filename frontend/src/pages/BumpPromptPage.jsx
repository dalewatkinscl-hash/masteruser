import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import WorkspaceTabs from '../components/WorkspaceTabs';
import EmployeeSelect from '../components/EmployeeSelect';
import { readJsonResponse } from '../utils/employeeProfile';

const inputClass = 'w-full bg-[#060e1a] border border-[#1a2540] text-slate-100 text-sm rounded-lg px-3 py-2';

export default function BumpPromptPage() {
  const navigate = useNavigate();
  const [employeeUid, setEmployeeUid] = useState('');
  const [notes, setNotes] = useState('');
  const [employees, setEmployees] = useState([]);
  const [employeesLoading, setEmployeesLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  useEffect(() => {
    const loadEmployees = async () => {
      try {
        setEmployeesLoading(true);
        const response = await fetch('/api/getEmployeeProfiles', { credentials: 'include' });
        const data = (await readJsonResponse(response)) || {};
        if (!response.ok) throw new Error(data.error || 'Failed to load employees.');
        setEmployees(data.employees || []);
      } catch (err) {
        setError(err.message || 'Failed to load employees.');
      } finally {
        setEmployeesLoading(false);
      }
    };
    loadEmployees();
  }, []);

  const submit = async () => {
    setSaving(true);
    setError('');
    setMessage('');
    try {
      const response = await fetch('/api/createBumpCardPrompt', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ employeeUid, notes }),
      });
      const data = (await readJsonResponse(response)) || {};
      if (!response.ok) throw new Error(data.error || 'Failed to create prompt.');
      setMessage(data.message || 'Prompt created.');
    } catch (err) {
      setError(err.message || 'Failed to create prompt.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col h-full">
      <WorkspaceTabs />
      <div className="px-8 py-6 border-b border-[#1a2540] flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white">Prompt bump card</h1>
          <p className="text-sm text-slate-400 mt-1">Create an in-portal task for a driver to complete a bump card.</p>
        </div>
        <button type="button" onClick={() => navigate('/dashboard/cases')} className="px-3 py-2 text-sm border border-[#1a2540] rounded-lg text-slate-200">
          Back
        </button>
      </div>
      <div className="p-8 max-w-xl space-y-4">
        {error && <div className="bg-red-500/10 border border-red-500/25 rounded-lg p-3 text-sm text-red-300">{error}</div>}
        {message && <div className="bg-emerald-500/10 border border-emerald-500/25 rounded-lg p-3 text-sm text-emerald-300">{message}</div>}
        <label className="block space-y-1">
          <span className="text-xs uppercase text-slate-500">Driver</span>
          <EmployeeSelect
            value={employeeUid}
            onChange={setEmployeeUid}
            employees={employees}
            loading={employeesLoading}
            mode="employees"
            emptyLabel="Select an active employee"
          />
        </label>
        <label className="block space-y-1">
          <span className="text-xs uppercase text-slate-500">Notes</span>
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} className={inputClass} />
        </label>
        <button
          type="button"
          disabled={saving || !employeeUid.trim()}
          onClick={submit}
          className="px-4 py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold"
        >
          {saving ? 'Sending…' : 'Send prompt'}
        </button>
      </div>
    </div>
  );
}
