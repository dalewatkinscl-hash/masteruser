import { useEffect, useState } from 'react';

async function readJsonResponse(res) {
  const contentType = res.headers.get('content-type') || '';
  if (!contentType.includes('application/json')) return null;
  try {
    return await res.json();
  } catch {
    return null;
  }
}

const STATUS_META = {
  new: { label: 'New', className: 'border-sky-500/40 bg-sky-500/10 text-sky-200' },
  reviewing: { label: 'We’re reviewing', className: 'border-amber-500/40 bg-amber-500/10 text-amber-200' },
  done: { label: 'Done', className: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-200' },
};

const CATEGORIES = [
  { value: 'portal', label: 'Portal / apps' },
  { value: 'workplace', label: 'Workplace' },
  { value: 'training', label: 'Training' },
  { value: 'other', label: 'Other' },
];

function formatDate(value) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

export default function SuggestionBoxPanel({ currentUserUid }) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [suggestions, setSuggestions] = useState([]);
  const [canModerate, setCanModerate] = useState(false);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [category, setCategory] = useState('portal');
  const [filter, setFilter] = useState('all');
  const [updatingId, setUpdatingId] = useState('');

  const load = async () => {
    const response = await fetch('/api/getSuggestions', { credentials: 'include' });
    const payload = (await readJsonResponse(response)) || {};
    if (!response.ok) throw new Error(payload.error || 'Failed to load suggestions.');
    setCanModerate(Boolean(payload.canModerate));
    setSuggestions(payload.canModerate ? (payload.suggestions || []) : []);
    // Let the Suggestions tab badge update promptly after inbox changes.
    window.dispatchEvent(new CustomEvent('cl-suggestions-changed'));
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        setError('');
        await load();
      } catch (err) {
        if (!cancelled) setError(err.message || 'Failed to load suggestions.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const onSubmit = async (event) => {
    event.preventDefault();
    setSaving(true);
    setError('');
    setMessage('');
    try {
      const response = await fetch('/api/createSuggestion', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, body, category }),
      });
      const payload = (await readJsonResponse(response)) || {};
      if (!response.ok) throw new Error(payload.error || 'Failed to submit suggestion.');
      setTitle('');
      setBody('');
      setCategory('portal');
      setMessage('Thanks — your suggestion was sent privately to the admin team.');
      if (canModerate) await load();
    } catch (err) {
      setError(err.message || 'Failed to submit suggestion.');
    } finally {
      setSaving(false);
    }
  };

  const updateStatus = async (id, status) => {
    setUpdatingId(id);
    setError('');
    try {
      const response = await fetch('/api/updateSuggestionStatus', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, status }),
      });
      const payload = (await readJsonResponse(response)) || {};
      if (!response.ok) throw new Error(payload.error || 'Failed to update status.');
      await load();
    } catch (err) {
      setError(err.message || 'Failed to update status.');
    } finally {
      setUpdatingId('');
    }
  };

  const filtered = suggestions.filter((item) => (filter === 'all' ? true : item.status === filter));

  return (
    <div className="space-y-4 max-w-3xl">
      <div className="bg-[#0b1220] border border-[#1a2540] rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-[#1a2540] bg-[#060e1a]/50">
          <p className="text-[10px] font-mono uppercase tracking-[0.18em] text-indigo-400">Suggestion box</p>
          <h3 className="text-lg font-semibold text-white mt-1">Got an idea?</h3>
          <p className="text-xs text-slate-500 mt-1">
            Suggestions are private and only visible to admins and managers.
          </p>
        </div>

        <form onSubmit={onSubmit} className="px-5 py-5 space-y-3">
          <label className="block text-sm space-y-1.5">
            <span className="text-xs text-slate-500">Title</span>
            <input
              className="w-full bg-[#060e1a] border border-[#1a2540] text-slate-100 text-sm rounded-lg px-3 py-2.5 focus:outline-none focus:border-indigo-500/60"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={120}
              required
              placeholder="Short summary"
            />
          </label>
          <label className="block text-sm space-y-1.5">
            <span className="text-xs text-slate-500">Category</span>
            <select
              className="w-full bg-[#060e1a] border border-[#1a2540] text-slate-100 text-sm rounded-lg px-3 py-2.5 focus:outline-none focus:border-indigo-500/60"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
            >
              {CATEGORIES.map((item) => (
                <option key={item.value} value={item.value}>{item.label}</option>
              ))}
            </select>
          </label>
          <label className="block text-sm space-y-1.5">
            <span className="text-xs text-slate-500">Details</span>
            <textarea
              className="w-full min-h-[96px] bg-[#060e1a] border border-[#1a2540] text-slate-100 text-sm rounded-lg px-3 py-2.5 focus:outline-none focus:border-indigo-500/60"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              maxLength={1000}
              required
              placeholder="What would make things better?"
            />
          </label>
          {error && <p className="text-rose-300 text-sm">{error}</p>}
          {message && <p className="text-emerald-300 text-sm">{message}</p>}
          <button
            type="submit"
            disabled={saving}
            className="px-5 py-2.5 rounded-lg text-sm font-medium bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white"
          >
            {saving ? 'Sending…' : 'Submit suggestion'}
          </button>
        </form>
      </div>

      {canModerate && (
        <div className="bg-[#0b1220] border border-[#1a2540] rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-[#1a2540] bg-[#060e1a]/50 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold text-white">Admin inbox</h3>
              <p className="text-xs text-slate-500 mt-1">Private — only visible to admins and managers.</p>
            </div>
            <div className="flex gap-1 flex-wrap">
              {[
                { id: 'all', label: 'All' },
                { id: 'new', label: 'New' },
                { id: 'reviewing', label: 'Reviewing' },
                { id: 'done', label: 'Done' },
              ].map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setFilter(item.id)}
                  className={`px-2.5 py-1 rounded-md text-xs border transition-colors ${
                    filter === item.id
                      ? 'border-indigo-500/50 bg-indigo-500/15 text-indigo-200'
                      : 'border-[#1a2540] text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>

          {loading ? (
            <p className="px-5 py-8 text-sm text-slate-500 text-center">Loading suggestions…</p>
          ) : !filtered.length ? (
            <p className="px-5 py-8 text-sm text-slate-500 text-center">No suggestions in this view yet.</p>
          ) : (
            <ul className="divide-y divide-[#1a2540]">
              {filtered.map((item) => {
                const status = STATUS_META[item.status] || STATUS_META.new;
                const isMine = item.authorUid === currentUserUid;
                return (
                  <li key={item.id} className="px-5 py-4 space-y-2">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-white">
                          {item.title}
                          {isMine ? <span className="text-indigo-300 font-normal"> · you</span> : ''}
                        </p>
                        <p className="text-xs text-slate-500 mt-1">
                          {item.authorName || 'Colleague'}
                          {item.authorEmail ? ` · ${item.authorEmail}` : ''}
                          {' · '}
                          {formatDate(item.createdAt)}
                          {' · '}
                          {CATEGORIES.find((c) => c.value === item.category)?.label || item.category}
                        </p>
                      </div>
                      <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium border ${status.className}`}>
                        {status.label}
                      </span>
                    </div>
                    <p className="text-sm text-slate-300 whitespace-pre-wrap">{item.body}</p>
                    {item.adminNote && (
                      <p className="text-xs text-slate-400 border border-[#1a2540] rounded-lg px-3 py-2 bg-[#060e1a]">
                        Update: {item.adminNote}
                      </p>
                    )}
                    <div className="flex flex-wrap gap-2 pt-1">
                      {['new', 'reviewing', 'done'].map((nextStatus) => (
                        <button
                          key={nextStatus}
                          type="button"
                          disabled={updatingId === item.id || item.status === nextStatus}
                          onClick={() => updateStatus(item.id, nextStatus)}
                          className="px-2.5 py-1 rounded-md text-xs border border-[#1a2540] text-slate-300 hover:bg-white/[0.04] disabled:opacity-40"
                        >
                          Mark {STATUS_META[nextStatus].label.toLowerCase()}
                        </button>
                      ))}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
