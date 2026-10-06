import { useEffect, useState } from 'react';
import { readJsonResponse } from '../utils/employeeProfile';

const CHANNEL_ORDER = ['restriction', 'written_warning', 'final_written_warning'];

function emailsToText(emails) {
  return (emails || []).join('\n');
}

function textToEmails(text) {
  return String(text || '')
    .split(/[\n,;]+/)
    .map((item) => item.trim().toLowerCase())
    .filter((item) => item.includes('@'));
}

export default function CaseNotificationSettings() {
  const [channels, setChannels] = useState([]);
  const [settings, setSettings] = useState(null);
  const [drafts, setDrafts] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [isDefault, setIsDefault] = useState(false);

  const load = async () => {
    setLoading(true);
    setError('');
    setSuccess('');
    try {
      const response = await fetch('/api/getCaseNotificationSettings', { credentials: 'include' });
      const data = (await readJsonResponse(response)) || {};
      if (!response.ok) throw new Error(data.error || 'Failed to load settings.');
      const nextSettings = data.settings || {};
      setSettings(nextSettings);
      setIsDefault(Boolean(nextSettings.isDefault));
      setChannels(data.channels || []);
      const nextDrafts = {};
      for (const id of CHANNEL_ORDER) {
        const channel = nextSettings[id] || { enabled: true, emails: [] };
        nextDrafts[id] = {
          enabled: channel.enabled !== false,
          emailsText: emailsToText(channel.emails),
        };
      }
      setDrafts(nextDrafts);
    } catch (err) {
      setError(err.message || 'Failed to load settings.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const updateDraft = (channelId, patch) => {
    setDrafts((current) => ({
      ...current,
      [channelId]: { ...current[channelId], ...patch },
    }));
    setSuccess('');
  };

  const handleSave = async () => {
    setSaving(true);
    setError('');
    setSuccess('');
    try {
      const payload = {};
      for (const id of CHANNEL_ORDER) {
        const draft = drafts[id] || { enabled: true, emailsText: '' };
        payload[id] = {
          enabled: draft.enabled !== false,
          emails: textToEmails(draft.emailsText),
        };
      }
      const response = await fetch('/api/saveCaseNotificationSettings', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ settings: payload }),
      });
      const data = (await readJsonResponse(response)) || {};
      if (!response.ok) throw new Error(data.error || 'Failed to save settings.');
      setSettings(data.settings || payload);
      setIsDefault(false);
      setSuccess('Notification settings saved.');
    } catch (err) {
      setError(err.message || 'Failed to save settings.');
    } finally {
      setSaving(false);
    }
  };

  const channelMeta = Object.fromEntries((channels || []).map((item) => [item.id, item]));

  return (
    <div className="flex-1 overflow-auto p-4 sm:p-8">
      <div className="max-w-3xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-semibold text-white">Case notifications</h1>
          <p className="mt-2 text-sm text-slate-400">
            Choose who is emailed when work restrictions or written / final written warnings are applied.
            Enter one email per line (or separate with commas).
          </p>
          {isDefault && !loading && (
            <p className="mt-2 text-sm text-amber-300/90">
              Showing defaults for testing (dalewatkins@countrylion.co.uk). Save to store your own list.
            </p>
          )}
        </div>

        {loading ? (
          <p className="text-sm text-slate-400">Loading settings…</p>
        ) : error && !settings ? (
          <div className="rounded-lg border border-red-500/25 bg-red-500/10 p-4 text-sm text-red-300">{error}</div>
        ) : (
          <>
            {error && (
              <div className="rounded-lg border border-red-500/25 bg-red-500/10 p-4 text-sm text-red-300">{error}</div>
            )}
            {success && (
              <div className="rounded-lg border border-emerald-500/25 bg-emerald-500/10 p-4 text-sm text-emerald-300">{success}</div>
            )}

            <div className="space-y-4">
              {CHANNEL_ORDER.map((channelId) => {
                const meta = channelMeta[channelId] || {
                  id: channelId,
                  label: channelId.replace(/_/g, ' '),
                  description: '',
                };
                const draft = drafts[channelId] || { enabled: true, emailsText: '' };
                return (
                  <section
                    key={channelId}
                    className="rounded-xl border border-[#1a2540] bg-[#0b1220] p-5 space-y-4"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <h2 className="text-base font-medium text-white">{meta.label}</h2>
                        {meta.description && (
                          <p className="mt-1 text-sm text-slate-400">{meta.description}</p>
                        )}
                      </div>
                      <label className="inline-flex items-center gap-2 text-sm text-slate-300 cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={draft.enabled !== false}
                          onChange={(event) => updateDraft(channelId, { enabled: event.target.checked })}
                          className="rounded border-[#1a2540] bg-[#060e1a] text-indigo-500 focus:ring-indigo-500/40"
                        />
                        Enabled
                      </label>
                    </div>
                    <div>
                      <label className="block text-xs font-semibold uppercase tracking-widest text-slate-500 mb-2">
                        Recipients
                      </label>
                      <textarea
                        value={draft.emailsText}
                        onChange={(event) => updateDraft(channelId, { emailsText: event.target.value })}
                        rows={3}
                        disabled={draft.enabled === false}
                        placeholder="name@countrylion.co.uk"
                        className="w-full rounded-lg border border-[#1a2540] bg-[#060e1a] px-3 py-2 text-sm text-slate-100 placeholder:text-slate-600 focus:outline-none focus:border-indigo-500/60 disabled:opacity-50"
                      />
                    </div>
                  </section>
                );
              })}
            </div>

            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={handleSave}
                disabled={saving}
                className="px-4 py-2 rounded-lg text-sm font-medium bg-indigo-600 hover:bg-indigo-500 text-white disabled:opacity-50"
              >
                {saving ? 'Saving…' : 'Save notification settings'}
              </button>
              <button
                type="button"
                onClick={load}
                disabled={loading || saving}
                className="px-4 py-2 rounded-lg text-sm font-medium border border-[#1a2540] text-slate-300 hover:text-white hover:border-slate-500 disabled:opacity-50"
              >
                Reload
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
