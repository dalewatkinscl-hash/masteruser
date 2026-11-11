import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { printRollCall } from '../utils/rollCallPrint';
import { createRollCallList, ROLL_CALL_RESPONSE_PRESETS } from '../utils/rollCallLists';

export default function RollCallModal({ employees, groupBy = '', onClose }) {
  const navigate = useNavigate();
  const [title, setTitle] = useState('Roll call');
  const [message, setMessage] = useState('');
  const [distribute, setDistribute] = useState(true);
  const [selectedPreset, setSelectedPreset] = useState('availability');
  const [confirmLabel, setConfirmLabel] = useState('I am available');
  const [rejectLabel, setRejectLabel] = useState('I am not available');
  const [customizingButtons, setCustomizingButtons] = useState(false);
  const [includeSignature, setIncludeSignature] = useState(false);
  const [error, setError] = useState('');
  const [printing, setPrinting] = useState(false);
  const [saving, setSaving] = useState(false);

  const busy = printing || saving;

  const handleSelectPreset = (preset) => {
    setSelectedPreset(preset.id);
    if (preset.id === 'custom') {
      setCustomizingButtons(true);
    } else {
      setConfirmLabel(preset.confirmLabel);
      setRejectLabel(preset.rejectLabel);
    }
  };

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

  const handleSave = async (shouldDistribute = distribute) => {
    setError('');
    setSaving(true);
    try {
      const payload = await createRollCallList({
        title: title.trim(),
        message: message.trim(),
        memberUids: employees.map((employee) => employee.uid).filter(Boolean),
        distribute: shouldDistribute,
        confirmLabel: confirmLabel.trim() || 'I am available',
        rejectLabel: rejectLabel.trim() || 'I am not available',
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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
      <div
        className="w-full max-w-lg rounded-2xl border border-[#1a2540] bg-[#0b1220] shadow-2xl overflow-hidden"
        role="dialog"
        aria-modal="true"
        aria-labelledby="roll-call-title"
      >
        <div className="px-6 py-5 border-b border-[#1a2540] bg-[#0d1627]">
          <h2 id="roll-call-title" className="text-lg font-semibold text-white">
            Create &amp; Issue Roll Call
          </h2>
          <p className="text-sm text-slate-400 mt-1">
            {employees.length} selected employee{employees.length === 1 ? '' : 's'}
            {groupBy ? ' · grouped to match the directory' : ''}
          </p>
        </div>

        <div className="px-6 py-5 space-y-4 max-h-[75vh] overflow-y-auto scrollbar-thin">
          {error && (
            <div className="bg-red-500/10 border border-red-500/25 rounded-lg p-3">
              <p className="text-red-300 text-sm">{error}</p>
            </div>
          )}

          <div>
            <label className="block text-[11px] font-medium uppercase tracking-wider text-slate-400 mb-1">
              Title / Question
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Who is available this weekend for a job?"
              className="w-full bg-[#060e1a] border border-[#1a2540] text-slate-100 text-sm rounded-lg px-3 py-2.5 focus:outline-none focus:border-indigo-500"
              required
            />
          </div>

          <div>
            <label className="block text-[11px] font-medium uppercase tracking-wider text-slate-400 mb-1">
              Instructions / Message to Staff (optional)
            </label>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="e.g. We have a private hire to London on Saturday. Please confirm whether you are available to drive."
              rows={2}
              className="w-full bg-[#060e1a] border border-[#1a2540] text-slate-100 text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-indigo-500"
            />
          </div>

          {/* Distribution Option */}
          <div className="rounded-xl border border-indigo-500/30 bg-indigo-950/20 p-4 space-y-3">
            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={distribute}
                onChange={(e) => setDistribute(e.target.checked)}
                className="mt-0.5 w-4 h-4 rounded border-[#1a2540] bg-[#060e1a] text-indigo-500 focus:ring-indigo-500/40"
              />
              <div className="min-w-0 flex-1">
                <span className="block text-sm font-semibold text-white">
                  Distribute to all {employees.length} selected staff
                </span>
                <span className="block text-xs text-slate-400 mt-0.5">
                  Sends an email alert and pins a response banner to the top of each employee&rsquo;s portal page.
                </span>
              </div>
            </label>

            {distribute && (
              <div className="pt-2 border-t border-indigo-500/20 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-indigo-300">
                    Response Button Presets:
                  </span>
                  {!customizingButtons && selectedPreset !== 'custom' && (
                    <button
                      type="button"
                      onClick={() => setCustomizingButtons(true)}
                      className="text-xs text-indigo-300 hover:text-indigo-200 underline"
                    >
                      Customize text
                    </button>
                  )}
                </div>

                {/* Preset Chips */}
                <div className="flex flex-wrap gap-1.5">
                  {ROLL_CALL_RESPONSE_PRESETS.map((preset) => {
                    const active = selectedPreset === preset.id;
                    return (
                      <button
                        key={preset.id}
                        type="button"
                        onClick={() => handleSelectPreset(preset)}
                        className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all ${
                          active
                            ? 'bg-indigo-600 text-white shadow-sm'
                            : 'bg-[#060e1a] border border-[#1a2540] text-slate-300 hover:bg-[#0e172a]'
                        }`}
                      >
                        {preset.name}
                      </button>
                    );
                  })}
                </div>

                {/* Live Button Preview */}
                <div className="rounded-lg bg-[#060e1a]/80 border border-white/5 p-3">
                  <span className="block text-[10px] uppercase tracking-wider text-slate-500 font-medium mb-2">
                    Staff Button Preview:
                  </span>
                  <div className="flex items-center gap-2">
                    <div className="flex-1 px-3 py-2 rounded-lg text-xs font-semibold bg-emerald-600/90 text-white text-center flex items-center justify-center gap-1.5">
                      <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                      </svg>
                      <span className="truncate">{confirmLabel || 'Confirm'}</span>
                    </div>
                    <div className="flex-1 px-3 py-2 rounded-lg text-xs font-semibold bg-rose-600/90 text-white text-center flex items-center justify-center gap-1.5">
                      <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                      <span className="truncate">{rejectLabel || 'Decline'}</span>
                    </div>
                  </div>
                </div>

                {/* Custom Button Labels Inputs */}
                {(customizingButtons || selectedPreset === 'custom') && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
                    <div>
                      <label className="block text-[10px] font-medium uppercase tracking-wider text-emerald-400 mb-1">
                        Confirm Button Label
                      </label>
                      <input
                        type="text"
                        value={confirmLabel}
                        onChange={(e) => {
                          setConfirmLabel(e.target.value);
                          setSelectedPreset('custom');
                        }}
                        placeholder="e.g. I am available"
                        maxLength={40}
                        className="w-full bg-[#060e1a] border border-[#1a2540] text-slate-100 text-xs rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-indigo-500"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-medium uppercase tracking-wider text-rose-400 mb-1">
                        Decline Button Label
                      </label>
                      <input
                        type="text"
                        value={rejectLabel}
                        onChange={(e) => {
                          setRejectLabel(e.target.value);
                          setSelectedPreset('custom');
                        }}
                        placeholder="e.g. I am not available"
                        maxLength={40}
                        className="w-full bg-[#060e1a] border border-[#1a2540] text-slate-100 text-xs rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-indigo-500"
                      />
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          <label className="flex items-center gap-2 cursor-pointer pt-1">
            <input
              type="checkbox"
              checked={includeSignature}
              onChange={(e) => setIncludeSignature(e.target.checked)}
              className="w-4 h-4 rounded border-[#1a2540] bg-[#060e1a] text-indigo-500"
            />
            <span className="text-xs text-slate-400">Include signature box when printing paper sheet</span>
          </label>
        </div>

        <div className="px-6 py-4 border-t border-[#1a2540] bg-[#08101d] flex flex-wrap justify-between items-center gap-3">
          <button
            type="button"
            onClick={handleGenerate}
            disabled={!title.trim() || busy}
            className="px-3.5 py-2 rounded-lg text-xs font-medium border border-[#1a2540] text-slate-300 hover:bg-[#060e1a] disabled:opacity-40"
          >
            {printing ? 'Preparing…' : 'Print sheet'}
          </button>

          <div className="flex flex-wrap justify-end gap-2.5">
            <button
              type="button"
              onClick={onClose}
              disabled={busy}
              className="px-4 py-2 rounded-lg text-xs border border-[#1a2540] text-slate-300 hover:bg-[#060e1a]"
            >
              Cancel
            </button>

            {distribute ? (
              <>
                <button
                  type="button"
                  onClick={() => handleSave(false)}
                  disabled={!title.trim() || busy || employees.length === 0}
                  className="px-3.5 py-2 rounded-lg text-xs font-medium border border-slate-700 text-slate-300 hover:bg-[#060e1a] disabled:opacity-50"
                  title="Save as roll call without notifying staff yet"
                >
                  Save as draft
                </button>
                <button
                  type="button"
                  onClick={() => handleSave(true)}
                  disabled={!title.trim() || busy || employees.length === 0}
                  className="px-4 py-2 rounded-lg text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white disabled:opacity-50 flex items-center gap-1.5 shadow-lg shadow-indigo-900/40"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                  </svg>
                  {saving ? 'Distributing…' : `Distribute to ${employees.length} staff`}
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={() => handleSave(false)}
                disabled={!title.trim() || busy || employees.length === 0}
                className="px-4 py-2 rounded-lg text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white disabled:opacity-50"
              >
                {saving ? 'Saving…' : 'Save roll call'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
