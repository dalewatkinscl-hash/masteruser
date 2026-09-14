import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { printRollCall } from '../utils/rollCallPrint';
import { createRollCallList } from '../utils/rollCallLists';

export default function RollCallModal({ employees, groupBy = '', onClose }) {
  const navigate = useNavigate();
  const [title, setTitle] = useState('Roll call');
  const [includeSignature, setIncludeSignature] = useState(false);
  const [error, setError] = useState('');
  const [printing, setPrinting] = useState(false);
  const [saving, setSaving] = useState(false);

  const busy = printing || saving;

  const handleGenerate = async () => {
    setError('');
    setPrinting(true);

    try {
      await printRollCall({
        title,
        employees,
        includeSignature,
        groupBy,
      });
      onClose();
    } catch (err) {
      setError(err.message || 'Failed to generate roll call.');
    } finally {
      setPrinting(false);
    }
  };

  const handleSave = async () => {
    setError('');
    setSaving(true);
    try {
      const payload = await createRollCallList({
        title: title.trim(),
        memberUids: employees.map((employee) => employee.uid).filter(Boolean),
      });
      onClose();
      navigate(`/dashboard/hr/roll-calls/${payload.list.id}`);
    } catch (err) {
      setError(err.message || 'Failed to save roll call.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60">
      <div
        className="w-full max-w-md rounded-xl border border-[#1a2540] bg-[#0b1220] shadow-2xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="roll-call-title"
      >
        <div className="px-6 py-5 border-b border-[#1a2540]">
          <h2 id="roll-call-title" className="text-lg font-semibold text-white">
            Roll call
          </h2>
          <p className="text-sm text-slate-400 mt-1">
            {employees.length} selected employee{employees.length === 1 ? '' : 's'}
            {groupBy ? ' · grouped to match the directory' : ''}
          </p>
        </div>

        <div className="px-6 py-5 space-y-4">
          {error && (
            <div className="bg-red-500/10 border border-red-500/25 rounded-lg p-3">
              <p className="text-red-300 text-sm">{error}</p>
            </div>
          )}

          <div>
            <label className="block text-[11px] font-medium uppercase tracking-wider text-slate-500 mb-1">
              Title
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Drivers roll call"
              className="w-full bg-[#060e1a] border border-[#1a2540] text-slate-100 text-sm rounded-lg px-3 py-2"
            />
          </div>

          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={includeSignature}
              onChange={(e) => setIncludeSignature(e.target.checked)}
              className="w-4 h-4 rounded border-[#1a2540] bg-[#060e1a] text-indigo-500"
            />
            <span className="text-sm text-slate-300">Include signature box (print only)</span>
          </label>
        </div>

        <div className="px-6 py-4 border-t border-[#1a2540] flex flex-wrap justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="px-4 py-2 rounded-lg text-sm border border-[#1a2540] text-slate-200 hover:bg-[#060e1a]"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={!title.trim() || busy || employees.length === 0}
            className="px-4 py-2 rounded-lg text-sm font-medium border border-indigo-500/40 text-indigo-200 hover:bg-indigo-500/10 disabled:opacity-50"
          >
            {saving ? 'Saving…' : 'Save as roll call'}
          </button>
          <button
            type="button"
            onClick={handleGenerate}
            disabled={!title.trim() || busy}
            className="px-5 py-2 rounded-lg text-sm font-medium bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white"
          >
            {printing ? 'Preparing print…' : 'Print'}
          </button>
        </div>
      </div>
    </div>
  );
}
