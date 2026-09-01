import { useEffect, useMemo, useState } from 'react';
import PollPieChart from './PollPieChart';
import VotersHover from './VotersHover';

async function readJsonResponse(res) {
  const contentType = res.headers.get('content-type') || '';
  if (!contentType.includes('application/json')) return null;
  try {
    return await res.json();
  } catch {
    return null;
  }
}

export default function PollsPanel({ compact = false }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [polls, setPolls] = useState([]);
  const [canManage, setCanManage] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [textDrafts, setTextDrafts] = useState({});
  const [form, setForm] = useState({
    title: '',
    description: '',
    type: 'ab',
    optionA: 'Yes',
    optionB: 'No',
    resultsPublic: true,
  });

  const load = async () => {
    const response = await fetch('/api/getPolls', { credentials: 'include' });
    const payload = (await readJsonResponse(response)) || {};
    if (!response.ok) throw new Error(payload.error || 'Failed to load polls.');
    setPolls(payload.polls || []);
    setCanManage(Boolean(payload.canManage));
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        await load();
      } catch (err) {
        if (!cancelled) setError(err.message || 'Failed to load polls.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const openPolls = useMemo(() => polls.filter((p) => p.status === 'open'), [polls]);
  const closedPolls = useMemo(() => polls.filter((p) => p.status !== 'open'), [polls]);

  const createPoll = async (event) => {
    event.preventDefault();
    setSaving(true);
    setError('');
    setMessage('');
    try {
      const response = await fetch('/api/createPoll', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const payload = (await readJsonResponse(response)) || {};
      if (!response.ok) throw new Error(payload.error || 'Failed to create poll.');
      setForm({
        title: '',
        description: '',
        type: 'ab',
        optionA: 'Yes',
        optionB: 'No',
        resultsPublic: true,
      });
      setMessage('Poll created.');
      await load();
    } catch (err) {
      setError(err.message || 'Failed to create poll.');
    } finally {
      setSaving(false);
    }
  };

  const voteAb = async (pollId, optionKey) => {
    setError('');
    try {
      const response = await fetch('/api/submitPollVote', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pollId, optionKey }),
      });
      const payload = (await readJsonResponse(response)) || {};
      if (!response.ok) throw new Error(payload.error || 'Failed to vote.');
      await load();
    } catch (err) {
      setError(err.message || 'Failed to vote.');
    }
  };

  const voteText = async (pollId, { optionKey, optionLabel }) => {
    setError('');
    try {
      const response = await fetch('/api/submitPollVote', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pollId, optionKey, optionLabel }),
      });
      const payload = (await readJsonResponse(response)) || {};
      if (!response.ok) throw new Error(payload.error || 'Failed to vote.');
      setTextDrafts((prev) => ({ ...prev, [pollId]: '' }));
      await load();
    } catch (err) {
      setError(err.message || 'Failed to vote.');
    }
  };

  const closePoll = async (pollId) => {
    setError('');
    try {
      const response = await fetch('/api/closePoll', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pollId }),
      });
      const payload = (await readJsonResponse(response)) || {};
      if (!response.ok) throw new Error(payload.error || 'Failed to close poll.');
      await load();
    } catch (err) {
      setError(err.message || 'Failed to close poll.');
    }
  };

  if (loading) {
    return <p className="text-sm text-slate-500">Loading polls…</p>;
  }

  return (
    <div className={`space-y-6 ${compact ? 'max-w-none' : 'max-w-3xl'}`}>
      {canManage && !compact && (
        <form onSubmit={createPoll} className="bg-[#0b1220] border border-[#1a2540] rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-[#1a2540] bg-[#060e1a]/50">
            <p className="text-[10px] font-mono uppercase tracking-[0.18em] text-indigo-400">Managers</p>
            <h3 className="text-lg font-semibold text-white mt-1">Create a poll</h3>
          </div>
          <div className="px-5 py-5 space-y-3">
            <label className="block text-sm space-y-1.5">
              <span className="text-xs text-slate-500">Question</span>
              <input
                className="w-full bg-[#060e1a] border border-[#1a2540] text-slate-100 text-sm rounded-lg px-3 py-2.5"
                value={form.title}
                onChange={(e) => setForm((prev) => ({ ...prev, title: e.target.value }))}
                required
                maxLength={120}
              />
            </label>
            <label className="block text-sm space-y-1.5">
              <span className="text-xs text-slate-500">Description (optional)</span>
              <textarea
                className="w-full min-h-[72px] bg-[#060e1a] border border-[#1a2540] text-slate-100 text-sm rounded-lg px-3 py-2.5"
                value={form.description}
                onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))}
                maxLength={500}
              />
            </label>
            <div className="grid md:grid-cols-2 gap-3">
              <label className="block text-sm space-y-1.5">
                <span className="text-xs text-slate-500">Type</span>
                <select
                  className="w-full bg-[#060e1a] border border-[#1a2540] text-slate-100 text-sm rounded-lg px-3 py-2.5"
                  value={form.type}
                  onChange={(e) => setForm((prev) => ({ ...prev, type: e.target.value }))}
                >
                  <option value="ab">A or B</option>
                  <option value="text">Open answers (pie chart)</option>
                </select>
              </label>
              <label className="flex items-end gap-2 text-sm text-slate-300 pb-2">
                <input
                  type="checkbox"
                  checked={form.resultsPublic}
                  onChange={(e) => setForm((prev) => ({ ...prev, resultsPublic: e.target.checked }))}
                />
                Show results publicly on My Profile
              </label>
            </div>
            {form.type === 'ab' && (
              <div className="grid md:grid-cols-2 gap-3">
                <label className="block text-sm space-y-1.5">
                  <span className="text-xs text-slate-500">Option A</span>
                  <input
                    className="w-full bg-[#060e1a] border border-[#1a2540] text-slate-100 text-sm rounded-lg px-3 py-2.5"
                    value={form.optionA}
                    onChange={(e) => setForm((prev) => ({ ...prev, optionA: e.target.value }))}
                    required
                  />
                </label>
                <label className="block text-sm space-y-1.5">
                  <span className="text-xs text-slate-500">Option B</span>
                  <input
                    className="w-full bg-[#060e1a] border border-[#1a2540] text-slate-100 text-sm rounded-lg px-3 py-2.5"
                    value={form.optionB}
                    onChange={(e) => setForm((prev) => ({ ...prev, optionB: e.target.value }))}
                    required
                  />
                </label>
              </div>
            )}
            {message && <p className="text-emerald-300 text-sm">{message}</p>}
            <button type="submit" disabled={saving} className="px-5 py-2.5 rounded-lg text-sm font-medium bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white">
              {saving ? 'Creating…' : 'Create poll'}
            </button>
          </div>
        </form>
      )}

      {error && <p className="text-rose-300 text-sm">{error}</p>}

      <section className="space-y-4">
        <h3 className="text-sm font-semibold text-white">Open polls</h3>
        {!openPolls.length ? (
          <p className="text-sm text-slate-500">No open polls right now.</p>
        ) : (
          openPolls.map((poll) => (
            <div key={poll.id} className="bg-[#0b1220] border border-[#1a2540] rounded-xl overflow-visible">
              <div className="px-5 py-4 border-b border-[#1a2540] bg-[#060e1a]/50 flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h4 className="text-base font-semibold text-white">{poll.title}</h4>
                  {poll.description && <p className="text-xs text-slate-500 mt-1">{poll.description}</p>}
                  <p className="text-[11px] text-slate-500 mt-2">
                    {poll.type === 'ab' ? 'A or B' : 'Text answers'}
                    {poll.resultsPublic ? ' · public results' : ' · private results'}
                    {poll.myVote ? ` · you chose “${poll.myVote.optionLabel}”` : ''}
                  </p>
                </div>
                {canManage && (
                  <button
                    type="button"
                    onClick={() => closePoll(poll.id)}
                    className="px-3 py-1.5 rounded-md text-xs border border-[#1a2540] text-slate-300 hover:bg-white/[0.04]"
                  >
                    Close poll
                  </button>
                )}
              </div>

              <div className="px-5 py-5 space-y-4 overflow-visible">
                {poll.type === 'ab' ? (
                  <div className="flex flex-wrap gap-2">
                    {['a', 'b'].map((key) => {
                      const option = (poll.results?.options || []).find((row) => row.key === key)
                        || {
                          key,
                          label: key === 'a' ? poll.optionA : poll.optionB,
                          votes: 0,
                          voters: [],
                        };
                      return (
                        <VotersHover
                          key={key}
                          label={option.label}
                          voters={option.voters || []}
                          votes={option.votes || 0}
                        >
                          <button
                            type="button"
                            onClick={() => voteAb(poll.id, key)}
                            className={`px-4 py-2 rounded-lg text-sm border ${
                              poll.myVote?.optionKey === key
                                ? key === 'a'
                                  ? 'border-indigo-500/60 bg-indigo-500/15 text-indigo-200'
                                  : 'border-cyan-500/60 bg-cyan-500/15 text-cyan-200'
                                : 'border-[#1a2540] text-slate-200 hover:bg-white/[0.04]'
                            }`}
                          >
                            {option.label}
                          </button>
                        </VotersHover>
                      );
                    })}
                  </div>
                ) : (
                  <div className="space-y-3">
                    {(poll.results?.allAnswers || []).length > 0 && (
                      <div className="flex flex-wrap gap-2">
                        {(poll.results?.allAnswers || []).map((answer) => (
                          <VotersHover
                            key={answer.key}
                            label={answer.label}
                            voters={answer.voters || []}
                            votes={answer.votes || 0}
                          >
                            <button
                              type="button"
                              onClick={() => voteText(poll.id, { optionKey: answer.key, optionLabel: answer.label })}
                              className={`px-3 py-1.5 rounded-lg text-xs border ${
                                poll.myVote?.optionKey === answer.key
                                  ? 'border-indigo-500/60 bg-indigo-500/15 text-indigo-200'
                                  : 'border-[#1a2540] text-slate-300 hover:bg-white/[0.04]'
                              }`}
                            >
                              {answer.label} ({answer.votes})
                            </button>
                          </VotersHover>
                        ))}
                      </div>
                    )}
                    <div className="flex flex-wrap gap-2">
                      <input
                        className="flex-1 min-w-[180px] bg-[#060e1a] border border-[#1a2540] text-slate-100 text-sm rounded-lg px-3 py-2.5"
                        placeholder="Or enter your own answer…"
                        value={textDrafts[poll.id] || ''}
                        onChange={(e) => setTextDrafts((prev) => ({ ...prev, [poll.id]: e.target.value }))}
                        maxLength={80}
                      />
                      <button
                        type="button"
                        onClick={() => voteText(poll.id, { optionLabel: textDrafts[poll.id] || '' })}
                        className="px-4 py-2 rounded-lg text-sm font-medium bg-indigo-600 hover:bg-indigo-500 text-white"
                      >
                        Vote
                      </button>
                    </div>
                  </div>
                )}

                {poll.results && (
                  <div className="pt-2 border-t border-[#1a2540] overflow-visible">
                    <p className="text-xs uppercase tracking-wider text-slate-500 mb-3">
                      Results · {poll.results.totalVotes} vote{poll.results.totalVotes === 1 ? '' : 's'}
                    </p>
                    {poll.type === 'ab' ? (
                      <PollPieChart options={poll.results.options || []} />
                    ) : (
                      <PollPieChart options={poll.results.options || poll.results.allAnswers || []} />
                    )}
                  </div>
                )}
              </div>
            </div>
          ))
        )}
      </section>

      {closedPolls.length > 0 && !compact && (
        <section className="space-y-4">
          <h3 className="text-sm font-semibold text-white">Previous polls</h3>
          {closedPolls.slice(0, 30).map((poll) => (
            <div key={poll.id} className="bg-[#0b1220] border border-[#1a2540] rounded-xl overflow-visible">
              <div className="px-5 py-4 border-b border-[#1a2540] bg-[#060e1a]/50">
                <h4 className="text-base font-semibold text-white">{poll.title}</h4>
                {poll.description && <p className="text-xs text-slate-500 mt-1">{poll.description}</p>}
                <p className="text-[11px] text-slate-500 mt-2">
                  Closed
                  {poll.type === 'ab' ? ' · A or B' : ' · Text answers'}
                  {poll.myVote ? ` · you chose “${poll.myVote.optionLabel}”` : ''}
                  {` · ${poll.results?.totalVotes || 0} vote${(poll.results?.totalVotes || 0) === 1 ? '' : 's'}`}
                </p>
              </div>
              <div className="px-5 py-5">
                {poll.results ? (
                  <PollPieChart
                    options={
                      poll.type === 'ab'
                        ? (poll.results.options || [])
                        : (poll.results.options || poll.results.allAnswers || [])
                    }
                  />
                ) : (
                  <p className="text-sm text-slate-500">No results available.</p>
                )}
              </div>
            </div>
          ))}
        </section>
      )}
    </div>
  );
}
