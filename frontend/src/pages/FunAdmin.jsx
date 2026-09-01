import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import WorkspaceTabs from '../components/WorkspaceTabs';
import ConnectionsPanel from '../components/ConnectionsPanel';
import BogglePanel from '../components/BogglePanel';
import SokobanPanel from '../components/SokobanPanel';
import WordlePanel from '../components/WordlePanel';
import NonogramPanel from '../components/NonogramPanel';
import GeoGuessrPanel from '../components/GeoGuessrPanel';
import { EncloseSandbox } from '../components/EnclosePanel';
import { LetterboxSandbox } from '../components/LetterboxPanel';
import { PipesSandbox } from '../components/PipesPanel';
import { CasefileSandbox } from '../components/CasefilePanel';
import { ToolboxKickSandbox } from '../components/ToolboxKickPanel';
import SokobanBuilder from '../components/SokobanBuilder';
import NonogramManagerPanel from './NonogramManager';
import { useAuth } from '../context/AuthContext';
import {
  ENCLOSE_LIVE_FROM,
  LETTERBOX_LIVE_FROM,
  PIPES_LIVE_FROM,
  TOOLBOX_KICK_LIVE_FROM,
  PERMANENT_FUN_FROM,
  FUN_GAME_ROSTER,
  ROTATION_START_DAY_KEY,
  getFunRotationForDay,
  addDaysToDayKey,
} from '../lib/funRotation';
import { getLondonDayKey } from '../lib/nonogram';
import { GEOGUESSR_SEED_PUZZLES, getMapillaryAccessToken, setMapillaryAccessToken, clearMapillaryAccessToken } from '../lib/geoguessr';

async function readJsonResponse(res) {
  const contentType = res.headers.get('content-type') || '';
  if (!contentType.includes('application/json')) return null;
  try {
    return await res.json();
  } catch {
    return null;
  }
}

const EMPTY_CONNECTIONS_GROUPS = () => (
  Array.from({ length: 4 }, () => ({ title: '', words: ['', '', '', ''] }))
);

function TriviaSandbox({ dayKey }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [data, setData] = useState(null);
  const [selectedIndex, setSelectedIndex] = useState(null);
  const [result, setResult] = useState(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        setError('');
        setResult(null);
        setSelectedIndex(null);
        const params = new URLSearchParams({ dayKey, sandbox: '1' });
        const response = await fetch(`/api/getDailyTrivia?${params}`, { credentials: 'include' });
        const payload = (await readJsonResponse(response)) || {};
        if (!response.ok) throw new Error(payload.error || 'Failed to load trivia.');
        if (!cancelled) setData(payload);
      } catch (err) {
        if (!cancelled) setError(err.message || 'Failed to load.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [dayKey]);

  if (loading) return <p className="text-sm text-slate-400">Loading sandbox trivia…</p>;
  if (error) return <p className="text-sm text-rose-300">{error}</p>;

  const question = data?.question;
  return (
    <div className="space-y-3">
      <p className="text-xs text-amber-200/90">Admin sandbox · {dayKey} · not saved</p>
      <p className="text-base text-slate-100 font-medium">{question?.prompt}</p>
      <div className="space-y-2">
        {(question?.options || []).map((option, index) => (
          <button
            key={`${question?.questionId}-${index}`}
            type="button"
            onClick={() => setSelectedIndex(index)}
            className={`w-full text-left rounded-lg border px-4 py-3 text-sm ${
              selectedIndex === index
                ? 'border-indigo-500/60 bg-indigo-500/10'
                : 'border-[#1a2540] bg-[#060e1a]'
            }`}
          >
            {option}
          </button>
        ))}
      </div>
      <button
        type="button"
        disabled={selectedIndex == null}
        onClick={() => {
          const correct = selectedIndex === data?.correctIndex;
          setResult(correct ? 'Correct (sandbox only).' : `Wrong — answer was ${String.fromCharCode(65 + (data?.correctIndex ?? 0))}.`);
        }}
        className="px-4 py-2 rounded-lg text-sm bg-indigo-600 text-white disabled:opacity-50"
      >
        Check answer
      </button>
      {result ? <p className="text-sm text-slate-300">{result}</p> : null}
    </div>
  );
}

function ConnectionsBuilder({ onSaved }) {
  const [title, setTitle] = useState('');
  const [scheduledFor, setScheduledFor] = useState('');
  const [groups, setGroups] = useState(EMPTY_CONNECTIONS_GROUPS);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const updateGroup = (gi, patch) => {
    setGroups((prev) => prev.map((g, i) => (i === gi ? { ...g, ...patch } : g)));
  };

  const updateWord = (gi, wi, value) => {
    setGroups((prev) => prev.map((g, i) => {
      if (i !== gi) return g;
      const words = [...g.words];
      words[wi] = value.toUpperCase();
      return { ...g, words };
    }));
  };

  const save = async () => {
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const response = await fetch('/api/adminSaveFunContent', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'connections',
          title,
          scheduledFor: scheduledFor || null,
          groups: groups.map((g) => ({
            title: g.title,
            words: g.words,
          })),
        }),
      });
      const payload = (await readJsonResponse(response)) || {};
      if (!response.ok) throw new Error(payload.error || 'Save failed.');
      setMessage(`Saved Connections puzzle ${payload.item?.id || payload.id}.`);
      setTitle('');
      setScheduledFor('');
      setGroups(EMPTY_CONNECTIONS_GROUPS());
      if (onSaved) onSaved();
    } catch (err) {
      setError(err.message || 'Save failed.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-400">
        Author a Connections puzzle (4 groups × 4 unique words). Optionally schedule it for a London day key —
        that day will use this instead of the embedded bank.
      </p>
      <label className="block text-xs text-slate-400 space-y-1">
        Title
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="w-full bg-[#060e1a] border border-[#1a2540] rounded-md px-3 py-2 text-sm text-slate-100"
        />
      </label>
      <label className="block text-xs text-slate-400 space-y-1">
        Schedule for (optional YYYY-MM-DD)
        <input
          type="date"
          value={scheduledFor}
          onChange={(e) => setScheduledFor(e.target.value)}
          className="w-full bg-[#060e1a] border border-[#1a2540] rounded-md px-3 py-2 text-sm text-slate-100"
        />
      </label>
      {groups.map((group, gi) => (
        <div key={`g-${gi}`} className="rounded-xl border border-[#1a2540] p-3 space-y-2">
          <p className="text-xs font-semibold text-indigo-300">Group {gi + 1}</p>
          <input
            value={group.title}
            onChange={(e) => updateGroup(gi, { title: e.target.value })}
            placeholder="Group title"
            className="w-full bg-[#060e1a] border border-[#1a2540] rounded-md px-3 py-2 text-sm text-slate-100"
          />
          <div className="grid grid-cols-2 gap-2">
            {group.words.map((word, wi) => (
              <input
                key={`w-${gi}-${wi}`}
                value={word}
                onChange={(e) => updateWord(gi, wi, e.target.value)}
                placeholder={`Word ${wi + 1}`}
                className="bg-[#060e1a] border border-[#1a2540] rounded-md px-3 py-2 text-sm uppercase text-slate-100"
              />
            ))}
          </div>
        </div>
      ))}
      <button
        type="button"
        disabled={busy}
        onClick={save}
        className="px-4 py-2 rounded-lg text-sm bg-indigo-600 hover:bg-indigo-500 text-white disabled:opacity-50"
      >
        {busy ? 'Saving…' : 'Save Connections puzzle'}
      </button>
      {message ? <p className="text-sm text-emerald-300">{message}</p> : null}
      {error ? <p className="text-sm text-rose-300">{error}</p> : null}
    </div>
  );
}

function TriviaBuilder({ onSaved }) {
  const [prompt, setPrompt] = useState('');
  const [options, setOptions] = useState(['', '', '', '']);
  const [correctIndex, setCorrectIndex] = useState(0);
  const [scheduledFor, setScheduledFor] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const save = async () => {
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const response = await fetch('/api/adminSaveFunContent', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'trivia',
          prompt,
          options,
          correctIndex,
          scheduledFor: scheduledFor || null,
        }),
      });
      const payload = (await readJsonResponse(response)) || {};
      if (!response.ok) throw new Error(payload.error || 'Save failed.');
      setMessage(`Saved trivia question ${payload.item?.id || payload.id}.`);
      setPrompt('');
      setOptions(['', '', '', '']);
      setCorrectIndex(0);
      setScheduledFor('');
      if (onSaved) onSaved();
    } catch (err) {
      setError(err.message || 'Save failed.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-400">
        Add a trivia question. Schedule it for a day to override the deterministic bank for that London date.
      </p>
      <label className="block text-xs text-slate-400 space-y-1">
        Prompt
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          rows={3}
          className="w-full bg-[#060e1a] border border-[#1a2540] rounded-md px-3 py-2 text-sm text-slate-100"
        />
      </label>
      {options.map((opt, i) => (
        <label key={`opt-${i}`} className="flex items-center gap-2 text-xs text-slate-400">
          <input
            type="radio"
            name="correct"
            checked={correctIndex === i}
            onChange={() => setCorrectIndex(i)}
          />
          <span className="w-4">{String.fromCharCode(65 + i)}</span>
          <input
            value={opt}
            onChange={(e) => setOptions((prev) => prev.map((v, idx) => (idx === i ? e.target.value : v)))}
            className="flex-1 bg-[#060e1a] border border-[#1a2540] rounded-md px-3 py-2 text-sm text-slate-100"
          />
        </label>
      ))}
      <label className="block text-xs text-slate-400 space-y-1">
        Schedule for (optional)
        <input
          type="date"
          value={scheduledFor}
          onChange={(e) => setScheduledFor(e.target.value)}
          className="w-full bg-[#060e1a] border border-[#1a2540] rounded-md px-3 py-2 text-sm text-slate-100"
        />
      </label>
      <button
        type="button"
        disabled={busy}
        onClick={save}
        className="px-4 py-2 rounded-lg text-sm bg-indigo-600 hover:bg-indigo-500 text-white disabled:opacity-50"
      >
        {busy ? 'Saving…' : 'Save trivia question'}
      </button>
      {message ? <p className="text-sm text-emerald-300">{message}</p> : null}
      {error ? <p className="text-sm text-rose-300">{error}</p> : null}
    </div>
  );
}

function ContentLibrary({ items, onRefresh, onDelete }) {
  useEffect(() => { onRefresh(); }, []);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-indigo-200">Saved content</h3>
        <button type="button" onClick={onRefresh} className="text-xs text-slate-400 hover:text-slate-200">Refresh</button>
      </div>
      {!items.length ? (
        <p className="text-sm text-slate-500">No admin-authored Fun content yet.</p>
      ) : (
        <ul className="space-y-2">
          {items.map((item) => (
            <li key={item.id} className="rounded-lg border border-[#1a2540] px-3 py-2 text-sm text-slate-200 flex flex-wrap items-center justify-between gap-2">
              <div>
                <span className="text-[10px] uppercase tracking-wider text-slate-500 mr-2">{item.type}</span>
                <span>{item.title}</span>
                {item.scheduledFor ? (
                  <span className="ml-2 text-xs text-sky-300">· {item.scheduledFor}</span>
                ) : null}
              </div>
              <button
                type="button"
                onClick={() => onDelete(item.id)}
                className="text-xs text-rose-300 hover:text-rose-200"
              >
                Delete
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

const TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'test', label: 'Test / preview' },
  { id: 'enclose', label: 'Dev · Enclose (cow)' },
  { id: 'letterbox', label: 'Dev · Letter Box' },
  { id: 'pipes', label: 'Dev · Pipes' },
  { id: 'casefile', label: 'Dev · Casefile' },
  { id: 'toolboxkick', label: 'Dev · Little Dicks Toolbox' },
  { id: 'geoguessr', label: 'GeoGuessr' },
  { id: 'nonograms', label: 'Build Nonogram' },
  { id: 'sokoban', label: 'Build Sokoban' },
  { id: 'connections', label: 'Build Connections' },
  { id: 'trivia', label: 'Build trivia' },
  { id: 'library', label: 'Library' },
];

const VALID_TAB_IDS = new Set(TABS.map((t) => t.id));

function GeoGuessrSandbox() {
  const [seedId, setSeedId] = useState(GEOGUESSR_SEED_PUZZLES[0]?.id || '');
  const [customImageId, setCustomImageId] = useState('');
  const [customLat, setCustomLat] = useState('');
  const [customLng, setCustomLng] = useState('');
  const [customLabel, setCustomLabel] = useState('');
  const [activePuzzle, setActivePuzzle] = useState(GEOGUESSR_SEED_PUZZLES[0] || null);
  const [tokenDraft, setTokenDraft] = useState(() => getMapillaryAccessToken());
  const [accessToken, setAccessToken] = useState(() => getMapillaryAccessToken());
  const [tokenMessage, setTokenMessage] = useState('');

  const saveToken = () => {
    const saved = setMapillaryAccessToken(tokenDraft);
    setAccessToken(saved);
    setTokenDraft(saved);
    setTokenMessage(saved ? 'Token saved in this browser.' : 'Token cleared.');
  };

  const clearToken = () => {
    clearMapillaryAccessToken();
    setAccessToken('');
    setTokenDraft('');
    setTokenMessage('Token cleared.');
  };

  const playSeed = () => {
    const seed = GEOGUESSR_SEED_PUZZLES.find((p) => p.id === seedId);
    if (seed) setActivePuzzle({ ...seed });
  };

  const playCustom = () => {
    const imageId = customImageId.trim();
    const lat = customLat.trim() === '' ? undefined : Number(customLat);
    const lng = customLng.trim() === '' ? undefined : Number(customLng);
    if (customLat.trim() !== '' && !Number.isFinite(lat)) return;
    if (customLng.trim() !== '' && !Number.isFinite(lng)) return;
    if (!imageId && !(Number.isFinite(lat) && Number.isFinite(lng))) return;
    setActivePuzzle({
      id: `custom-${Date.now()}`,
      label: customLabel.trim() || (imageId ? 'Custom Mapillary image' : 'Custom coordinates'),
      ...(imageId ? { imageId } : {}),
      ...(Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : {}),
    });
  };

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-[#1a2540] p-4 space-y-3">
        <p className="text-sm text-slate-300">
          Mapillary street view (pan &amp; zoom only, no walking). 3 minutes, then score by how close the pin is.
        </p>
        <div className="rounded-lg border border-indigo-500/30 bg-indigo-500/5 p-3 space-y-2">
          <label className="text-xs text-slate-400 space-y-1 block">
            Mapillary access token
            <input
              type="password"
              autoComplete="off"
              value={tokenDraft}
              onChange={(e) => {
                setTokenDraft(e.target.value);
                setTokenMessage('');
              }}
              placeholder="Paste client access token"
              className="block w-full bg-[#060e1a] border border-[#1a2540] rounded-md px-3 py-2 text-sm text-slate-100 font-mono"
            />
          </label>
          <p className="text-xs text-slate-500">
            Create an app at{' '}
            <a
              className="text-indigo-300 hover:underline"
              href="https://www.mapillary.com/dashboard/developers"
              target="_blank"
              rel="noreferrer"
            >
              mapillary.com/dashboard/developers
            </a>
            . Stored only in this browser (localStorage).
          </p>
          <div className="flex flex-wrap gap-2 items-center">
            <button
              type="button"
              onClick={saveToken}
              className="rounded-lg bg-indigo-600 hover:bg-indigo-500 px-4 py-2 text-sm text-white"
            >
              Save token
            </button>
            <button
              type="button"
              onClick={clearToken}
              className="rounded-lg border border-[#1a2540] px-4 py-2 text-sm text-slate-300 hover:bg-[#0b1220]"
            >
              Clear
            </button>
            {accessToken ? (
              <span className="text-xs text-emerald-300">Token on file · ending …{accessToken.slice(-6)}</span>
            ) : (
              <span className="text-xs text-amber-300">No token saved yet</span>
            )}
            {tokenMessage ? <span className="text-xs text-slate-400">{tokenMessage}</span> : null}
          </div>
        </div>
        <div className="flex flex-wrap gap-3 items-end">
          <label className="text-xs text-slate-400 space-y-1 grow min-w-[200px]">
            Seed location
            <select
              value={seedId}
              onChange={(e) => setSeedId(e.target.value)}
              className="block w-full bg-[#060e1a] border border-[#1a2540] rounded-md px-3 py-2 text-sm text-slate-100"
            >
              {GEOGUESSR_SEED_PUZZLES.map((p) => (
                <option key={p.id} value={p.id}>{p.label}</option>
              ))}
            </select>
          </label>
          <button
            type="button"
            onClick={playSeed}
            className="rounded-lg bg-indigo-600 hover:bg-indigo-500 px-4 py-2 text-sm text-white"
          >
            Play seed
          </button>
        </div>
        <div className="border-t border-[#1a2540] pt-3 space-y-2">
          <p className="text-xs text-slate-500">
            Or paste a Mapillary image ID and/or lat/lng. Seeds look up a live image near the coordinates
            (hardcoded IDs go stale). Lat/lng alone is enough.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <label className="text-xs text-slate-400 space-y-1 sm:col-span-2">
              Image ID (optional)
              <input
                value={customImageId}
                onChange={(e) => setCustomImageId(e.target.value)}
                placeholder="From mapillary.com URL"
                className="block w-full bg-[#060e1a] border border-[#1a2540] rounded-md px-3 py-2 text-sm text-slate-100"
              />
            </label>
            <label className="text-xs text-slate-400 space-y-1">
              Lat
              <input
                value={customLat}
                onChange={(e) => setCustomLat(e.target.value)}
                placeholder="51.5"
                className="block w-full bg-[#060e1a] border border-[#1a2540] rounded-md px-3 py-2 text-sm text-slate-100"
              />
            </label>
            <label className="text-xs text-slate-400 space-y-1">
              Lng
              <input
                value={customLng}
                onChange={(e) => setCustomLng(e.target.value)}
                placeholder="-0.12"
                className="block w-full bg-[#060e1a] border border-[#1a2540] rounded-md px-3 py-2 text-sm text-slate-100"
              />
            </label>
            <label className="text-xs text-slate-400 space-y-1 sm:col-span-2">
              Label (optional)
              <input
                value={customLabel}
                onChange={(e) => setCustomLabel(e.target.value)}
                placeholder="Near depot"
                className="block w-full bg-[#060e1a] border border-[#1a2540] rounded-md px-3 py-2 text-sm text-slate-100"
              />
            </label>
          </div>
          <button
            type="button"
            onClick={playCustom}
            disabled={!customImageId.trim() && !(customLat.trim() && customLng.trim())}
            className="rounded-lg border border-[#1a2540] px-4 py-2 text-sm text-slate-200 hover:bg-[#0b1220] disabled:opacity-40"
          >
            Play custom
          </button>
        </div>
      </div>
      <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4">
        <GeoGuessrPanel puzzle={activePuzzle} sandbox accessToken={accessToken} />
      </div>
    </div>
  );
}

export default function FunAdmin() {
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const todayKey = getLondonDayKey();
  const initialTab = VALID_TAB_IDS.has(searchParams.get('tab')) ? searchParams.get('tab') : 'overview';
  const [tab, setTab] = useState(initialTab);
  const [sandboxGame, setSandboxGame] = useState('connections');
  const [sandboxDay, setSandboxDay] = useState(todayKey);
  const [items, setItems] = useState([]);
  const [error, setError] = useState('');

  const selectTab = (id) => {
    setTab(id);
    if (id === 'overview') {
      setSearchParams({}, { replace: true });
    } else {
      setSearchParams({ tab: id }, { replace: true });
    }
  };

  const upcoming = useMemo(() => {
    const rows = [];
    let cursor = todayKey;
    for (let i = 0; i < 14; i += 1) {
      rows.push(getFunRotationForDay(cursor));
      cursor = addDaysToDayKey(cursor, 1);
    }
    return rows;
  }, [todayKey]);

  const loadLibrary = async () => {
    try {
      const response = await fetch('/api/adminListFunContent', { credentials: 'include' });
      const payload = (await readJsonResponse(response)) || {};
      if (!response.ok) throw new Error(payload.error || 'Failed to load content.');
      setItems(payload.items || []);
    } catch (err) {
      setError(err.message || 'Failed to load content.');
    }
  };

  const deleteItem = async (id) => {
    if (!window.confirm(`Delete ${id}?`)) return;
    try {
      const response = await fetch('/api/adminDeleteFunContent', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      });
      const payload = (await readJsonResponse(response)) || {};
      if (!response.ok) throw new Error(payload.error || 'Delete failed.');
      await loadLibrary();
    } catch (err) {
      setError(err.message || 'Delete failed.');
    }
  };

  return (
    <div className="min-h-screen bg-cl-bg text-cl-fg">
      <WorkspaceTabs />
      <div className={`${tab === 'geoguessr' || tab === 'nonograms' || tab === 'casefile' ? 'max-w-6xl' : 'max-w-4xl'} mx-auto px-4 sm:px-8 py-6 space-y-5`}>
        <div>
          <h1 className="text-2xl font-semibold text-indigo-200">Fun admin</h1>
          <p className="text-sm text-slate-400 mt-1">
            Test games in a sandbox, build Nonogram/Sokoban/Connections/trivia content, and preview the weekday rotation.
          </p>
        </div>

        <div className="flex flex-wrap gap-1 border-b border-[#1a2540] pb-2">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => selectTab(t.id)}
              className={`px-3 py-1.5 rounded-md text-sm ${
                tab === t.id ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {error ? <p className="text-sm text-rose-300">{error}</p> : null}

        {tab === 'overview' && (
          <div className="space-y-4">
            <div className="rounded-xl border border-[#1a2540] p-4 space-y-2">
              <p className="text-sm text-slate-300">
                Rotation starts <span className="text-white font-medium">{ROTATION_START_DAY_KEY}</span> (Monday).
                Each weekday shows six games; the rest of the roster sits out on a rolling window. Enclose from{' '}
                {ENCLOSE_LIVE_FROM}; Letter Box from {LETTERBOX_LIVE_FROM}; Pipes from {PIPES_LIVE_FROM};
                Little Dicks Toolbox from {TOOLBOX_KICK_LIVE_FROM}. From {PERMANENT_FUN_FROM}, Wordle and
                Little Dicks Toolbox never sit out. Weekends are closed.
              </p>
              <p className="text-xs text-slate-500">
                This list is which <span className="text-slate-300">games</span> are on — not identical puzzle content.
                Use <span className="text-slate-300">Test / preview</span> and set the Day to compare actual puzzles
                (Wordle word, Nonogram, etc.). Before {ROTATION_START_DAY_KEY}, weekdays still show all roster games.
              </p>
              <p className="text-xs text-slate-500">
                Author overrides (Connections / trivia / Sokoban) appear in Library when scheduled for a day.
                Admin sandboxes: Dev · Enclose / Dev · Letter Box / Dev · Pipes / Dev · Casefile / Dev · Little Dicks Toolbox.
              </p>
            </div>
            <div className="rounded-xl border border-[#1a2540] overflow-hidden">
              <div className="px-4 py-3 border-b border-[#1a2540] text-sm font-semibold text-indigo-200">
                Next 14 days
              </div>
              <ul className="divide-y divide-[#1a2540]">
                {upcoming.map((row) => (
                  <li key={row.dayKey} className="px-4 py-2.5 text-sm flex flex-wrap gap-2 justify-between">
                    <span className="text-slate-200 font-medium">{row.dayKey}</span>
                    {row.closed ? (
                      <span className="text-slate-500">Closed · {row.nextOpenDayKey}</span>
                    ) : (
                      <span className="text-slate-400">
                        {row.games.join(', ')}
                        {row.sitOuts?.length
                          ? ` · sit out ${row.sitOuts.join(', ')}`
                          : row.sitOut
                            ? ` · sit out ${row.sitOut}`
                            : ''}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}

        {tab === 'test' && (
          <div className="space-y-4">
            <div className="flex flex-wrap gap-3 items-end">
              <label className="text-xs text-slate-400 space-y-1">
                Game
                <select
                  value={sandboxGame}
                  onChange={(e) => setSandboxGame(e.target.value)}
                  className="block bg-[#060e1a] border border-[#1a2540] rounded-md px-3 py-2 text-sm text-slate-100"
                >
                  {FUN_GAME_ROSTER.map((g) => (
                    <option key={g.key} value={g.key}>{g.label}</option>
                  ))}
                </select>
              </label>
              <label className="text-xs text-slate-400 space-y-1">
                Day
                <input
                  type="date"
                  value={sandboxDay}
                  onChange={(e) => setSandboxDay(e.target.value)}
                  className="block bg-[#060e1a] border border-[#1a2540] rounded-md px-3 py-2 text-sm text-slate-100"
                />
              </label>
            </div>
            <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4">
              {sandboxGame === 'trivia' && <TriviaSandbox dayKey={sandboxDay} />}
              {sandboxGame === 'wordle' && (
                <WordlePanel
                  currentUserUid={user?.uid}
                  isAdmin
                  sandbox
                  forcedDayKey={sandboxDay}
                />
              )}
              {sandboxGame === 'nonogram' && (
                <div className="space-y-2">
                  <p className="text-xs text-slate-400">
                    Full pixel-art builder:{' '}
                    <button
                      type="button"
                      onClick={() => selectTab('nonograms')}
                      className="text-indigo-300 hover:underline"
                    >
                      Open Build Nonogram
                    </button>
                  </p>
                  <NonogramPanel
                    currentUserUid={user?.uid}
                    isAdmin
                    sandbox
                    forcedDayKey={sandboxDay}
                  />
                </div>
              )}
              {sandboxGame === 'sokoban' && (
                <SokobanPanel
                  currentUserUid={user?.uid}
                  isAdmin
                  sandbox
                  forcedDayKey={sandboxDay}
                />
              )}
              {sandboxGame === 'boggle' && (
                <BogglePanel
                  currentUserUid={user?.uid}
                  isAdmin
                  sandbox
                  forcedDayKey={sandboxDay}
                />
              )}
              {sandboxGame === 'connections' && (
                <ConnectionsPanel
                  currentUserUid={user?.uid}
                  isAdmin
                  sandbox
                  forcedDayKey={sandboxDay}
                />
              )}
            </div>
          </div>
        )}

        {tab === 'nonograms' && <NonogramManagerPanel />}
        {tab === 'connections' && <ConnectionsBuilder onSaved={loadLibrary} />}
        {tab === 'trivia' && <TriviaBuilder onSaved={loadLibrary} />}
        {tab === 'sokoban' && <SokobanBuilder onSaved={loadLibrary} />}
        {tab === 'enclose' && <EncloseSandbox />}
        {tab === 'letterbox' && <LetterboxSandbox />}
        {tab === 'pipes' && <PipesSandbox />}
        {tab === 'casefile' && <CasefileSandbox />}
        {tab === 'toolboxkick' && <ToolboxKickSandbox />}
        {tab === 'geoguessr' && <GeoGuessrSandbox />}
        {tab === 'library' && (
          <ContentLibrary items={items} onRefresh={loadLibrary} onDelete={deleteItem} />
        )}
      </div>
    </div>
  );
}
