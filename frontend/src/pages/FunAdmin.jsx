import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
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
import { StackWalkSandbox } from '../components/StackWalkPanel';
import { CasefileSandbox } from '../components/CasefilePanel';
import { ToolboxKickSandbox } from '../components/ToolboxKickPanel';
import { WantedSandbox } from '../components/WantedPanel';
import EmployeeSelect from '../components/EmployeeSelect';
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
  getDefaultRotationSettings,
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
  { id: 'overview', label: 'Rotation' },
  { id: 'test', label: 'Test / preview' },
  { id: 'wanted', label: 'Dev · Wanted' },
  { id: 'wordle-suspects', label: 'Wordle suspects' },
  { id: 'toolbox-punishments', label: 'Toolbox punishments' },
  { id: 'enclose', label: 'Dev · Enclose (cow)' },
  { id: 'letterbox', label: 'Dev · Letter Box' },
  { id: 'pipes', label: 'Dev · Pipes' },
  { id: 'stackwalk', label: "Dev · O Dell's Amazon Run" },
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

function RotationSettingsPanel() {
  const todayKey = getLondonDayKey();
  const defaults = getDefaultRotationSettings();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [permanentKeys, setPermanentKeys] = useState(defaults.permanentGameKeys);
  const [rotatedDailyCount, setRotatedDailyCount] = useState(defaults.rotatedDailyCount);
  const [settingsMeta, setSettingsMeta] = useState(null);

  const load = async () => {
    try {
      setLoading(true);
      setError('');
      const response = await fetch('/api/adminGetFunRotationSettings', { credentials: 'include' });
      const payload = (await readJsonResponse(response)) || {};
      if (!response.ok) throw new Error(payload.error || 'Failed to load rotation settings.');
      const settings = payload.settings || defaults;
      setPermanentKeys(settings.permanentGameKeys || defaults.permanentGameKeys);
      setRotatedDailyCount(settings.rotatedDailyCount ?? defaults.rotatedDailyCount);
      setSettingsMeta(settings);
    } catch (err) {
      setError(err.message || 'Failed to load rotation settings.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const livePreview = useMemo(() => {
    const settings = { permanentGameKeys: permanentKeys, rotatedDailyCount };
    const rows = [];
    let cursor = todayKey;
    for (let i = 0; i < 14; i += 1) {
      rows.push(getFunRotationForDay(cursor, settings));
      cursor = addDaysToDayKey(cursor, 1);
    }
    return rows;
  }, [todayKey, permanentKeys, rotatedDailyCount]);

  const permanentCount = permanentKeys.length;
  const totalEstimate = permanentCount + Number(rotatedDailyCount || 0);

  const togglePermanent = (key) => {
    setPermanentKeys((prev) => (
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]
    ));
    setMessage('');
  };

  const save = async () => {
    try {
      setSaving(true);
      setError('');
      setMessage('');
      const response = await fetch('/api/adminSaveFunRotationSettings', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          permanentGameKeys: permanentKeys,
          rotatedDailyCount: Number(rotatedDailyCount),
        }),
      });
      const payload = (await readJsonResponse(response)) || {};
      if (!response.ok) throw new Error(payload.error || 'Save failed.');
      setSettingsMeta(payload.settings || null);
      setPermanentKeys(payload.settings?.permanentGameKeys || permanentKeys);
      setRotatedDailyCount(payload.settings?.rotatedDailyCount ?? rotatedDailyCount);
      setMessage('Rotation settings saved — live for Fun players.');
    } catch (err) {
      setError(err.message || 'Save failed.');
    } finally {
      setSaving(false);
    }
  };

  const resetDefaults = () => {
    setPermanentKeys([...defaults.permanentGameKeys]);
    setRotatedDailyCount(defaults.rotatedDailyCount);
    setMessage('');
  };

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-[#1a2540] p-4 space-y-2">
        <p className="text-sm text-slate-300">
          Control which games are <span className="text-white font-medium">permanent</span> (always on)
          vs <span className="text-white font-medium">rotated</span>, and how many rotated games appear
          each weekday. Sit-outs roll through the rotated pool. Weekends stay closed. Permanent
          enforcement applies from <span className="text-white font-medium">{PERMANENT_FUN_FROM}</span>.
        </p>
        <p className="text-xs text-slate-500">
          Rotation started {ROTATION_START_DAY_KEY}. Staged live-from dates still apply
          (Enclose {ENCLOSE_LIVE_FROM}, Letter Box {LETTERBOX_LIVE_FROM}, Pipes {PIPES_LIVE_FROM},
          Toolbox {TOOLBOX_KICK_LIVE_FROM}).
        </p>
      </div>

      {loading ? (
        <p className="text-sm text-slate-500">Loading settings…</p>
      ) : (
        <>
          <div className="rounded-xl border border-[#1a2540] overflow-hidden">
            <div className="px-4 py-3 border-b border-[#1a2540] flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-semibold text-indigo-200">Games</p>
              <p className="text-xs text-slate-500">
                ~{totalEstimate} games/weekday ({permanentCount} permanent + {rotatedDailyCount} rotated)
              </p>
            </div>
            <ul className="divide-y divide-[#1a2540]">
              {FUN_GAME_ROSTER.map((game) => {
                const isPermanent = permanentKeys.includes(game.key);
                return (
                  <li key={game.key} className="px-4 py-3 flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="text-sm text-slate-100 font-medium">{game.label}</p>
                      <p className="text-xs text-slate-500">{game.key}</p>
                    </div>
                    <div className="flex rounded-lg border border-[#1a2540] overflow-hidden text-xs">
                      <button
                        type="button"
                        onClick={() => { if (!isPermanent) togglePermanent(game.key); }}
                        className={`px-3 py-1.5 ${
                          isPermanent
                            ? 'bg-emerald-600 text-white'
                            : 'text-slate-400 hover:bg-white/[0.04]'
                        }`}
                      >
                        Permanent
                      </button>
                      <button
                        type="button"
                        onClick={() => { if (isPermanent) togglePermanent(game.key); }}
                        className={`px-3 py-1.5 border-l border-[#1a2540] ${
                          !isPermanent
                            ? 'bg-sky-600 text-white'
                            : 'text-slate-400 hover:bg-white/[0.04]'
                        }`}
                      >
                        Rotated
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>

          <div className="rounded-xl border border-[#1a2540] p-4 space-y-3">
            <label className="block text-sm text-slate-300 space-y-2">
              Rotated games per weekday
              <input
                type="number"
                min={0}
                max={FUN_GAME_ROSTER.length}
                value={rotatedDailyCount}
                onChange={(e) => {
                  setRotatedDailyCount(e.target.value);
                  setMessage('');
                }}
                className="block w-40 bg-[#060e1a] border border-[#1a2540] rounded-md px-3 py-2 text-sm text-slate-100 tabular-nums"
              />
            </label>
            <p className="text-xs text-slate-500">
              Permanent games always appear (from {PERMANENT_FUN_FROM}). This number is how many
              additional games are picked from the rotated pool each day.
            </p>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={saving}
                onClick={save}
                className="px-4 py-2 rounded-lg text-sm bg-indigo-600 text-white hover:bg-indigo-500 disabled:opacity-40"
              >
                {saving ? 'Saving…' : 'Save rotation'}
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={resetDefaults}
                className="px-4 py-2 rounded-lg text-sm border border-[#1a2540] text-slate-300 hover:bg-white/[0.04]"
              >
                Reset draft to defaults
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={load}
                className="px-4 py-2 rounded-lg text-sm border border-[#1a2540] text-slate-300 hover:bg-white/[0.04]"
              >
                Reload saved
              </button>
            </div>
            {settingsMeta?.updatedAt ? (
              <p className="text-xs text-slate-500">
                Last saved
                {settingsMeta.updatedByName ? ` by ${settingsMeta.updatedByName}` : ''}
                {' · '}
                {typeof settingsMeta.updatedAt === 'string'
                  ? settingsMeta.updatedAt
                  : 'just now'}
                {' · source '}
                {settingsMeta.source || 'firestore'}
              </p>
            ) : null}
            {error ? <p className="text-sm text-rose-300">{error}</p> : null}
            {message ? <p className="text-sm text-emerald-300">{message}</p> : null}
          </div>

          <div className="rounded-xl border border-[#1a2540] overflow-hidden">
            <div className="px-4 py-3 border-b border-[#1a2540] text-sm font-semibold text-indigo-200">
              Next 14 days (live preview of draft)
            </div>
            <ul className="divide-y divide-[#1a2540]">
              {livePreview.map((row) => (
                <li key={row.dayKey} className="px-4 py-2.5 text-sm flex flex-wrap gap-2 justify-between">
                  <span className="text-slate-200 font-medium">{row.dayKey}</span>
                  {row.closed ? (
                    <span className="text-slate-500">Closed · {row.nextOpenDayKey}</span>
                  ) : (
                    <span className="text-slate-400">
                      {row.games.join(', ')}
                      {row.sitOuts?.length ? ` · sit out ${row.sitOuts.join(', ')}` : ''}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </div>
        </>
      )}
    </div>
  );
}

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

function WordleSuspectsPanel() {
  const [employees, setEmployees] = useState([]);
  const [employeesLoading, setEmployeesLoading] = useState(true);
  const [suspects, setSuspects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [pickUid, setPickUid] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const loadSuspects = async () => {
    const response = await fetch('/api/adminListWordleSuspects', { credentials: 'include' });
    const payload = (await readJsonResponse(response)) || {};
    if (!response.ok) throw new Error(payload.error || 'Failed to load suspects.');
    setSuspects(payload.suspects || []);
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        setError('');
        const [empRes] = await Promise.all([
          fetch('/api/getEmployeeProfiles', { credentials: 'include' }),
          loadSuspects(),
        ]);
        const empPayload = (await readJsonResponse(empRes)) || {};
        if (!empRes.ok) throw new Error(empPayload.error || 'Failed to load employees.');
        if (!cancelled) {
          setEmployees(empPayload.employees || empPayload.profiles || empPayload.items || []);
        }
      } catch (err) {
        if (!cancelled) setError(err.message || 'Failed to load Wordle suspects.');
      } finally {
        if (!cancelled) {
          setLoading(false);
          setEmployeesLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const setSuspect = async (uid, suspected) => {
    if (!uid) return;
    try {
      setSaving(true);
      setError('');
      setMessage('');
      const response = await fetch('/api/adminSetWordleSuspect', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ uid, suspected }),
      });
      const payload = (await readJsonResponse(response)) || {};
      if (!response.ok) throw new Error(payload.error || 'Failed to update suspect.');
      setSuspects(payload.suspects || []);
      if (suspected) setPickUid('');
      setMessage(suspected ? 'Marked as suspected cheater.' : 'Removed from suspects.');
    } catch (err) {
      setError(err.message || 'Failed to update suspect.');
    } finally {
      setSaving(false);
    }
  };

  const suspectUids = new Set(suspects.map((row) => row.uid));

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-[#1a2540] p-4 space-y-2">
        <p className="text-sm text-slate-300">
          Mark accounts as <span className="text-white font-medium">Wordle suspects</span>. They get a
          different daily answer from everyone else. If they guess the real shared word — or another
          suspect&apos;s trap word — they instantly fail with 💩.
        </p>
        <p className="text-xs text-slate-500">
          Honest solves of their own trap word still count as a normal win. Practice / sandbox still
          uses the public word.
        </p>
      </div>

      <div className="rounded-xl border border-[#1a2540] p-4 space-y-3">
        <p className="text-sm font-semibold text-indigo-200">Add suspect</p>
        <div className="flex flex-wrap gap-3 items-end">
          <div className="min-w-[16rem] flex-1">
            <EmployeeSelect
              value={pickUid}
              onChange={setPickUid}
              employees={employees}
              loading={employeesLoading}
              emptyLabel="Search employee…"
              disabled={saving}
            />
          </div>
          <button
            type="button"
            disabled={!pickUid || saving || suspectUids.has(pickUid)}
            onClick={() => setSuspect(pickUid, true)}
            className="px-3 py-2 rounded-lg text-sm border border-rose-500/40 text-rose-100 hover:bg-rose-500/10 disabled:opacity-40"
          >
            Mark as suspect
          </button>
        </div>
      </div>

      {error ? <p className="text-sm text-rose-300">{error}</p> : null}
      {message ? <p className="text-sm text-emerald-300">{message}</p> : null}

      <div className="rounded-xl border border-[#1a2540] overflow-hidden">
        <div className="px-4 py-3 border-b border-[#1a2540] text-sm font-semibold text-indigo-200">
          Current suspects ({suspects.length})
        </div>
        {loading ? (
          <p className="px-4 py-6 text-sm text-slate-500">Loading…</p>
        ) : !suspects.length ? (
          <p className="px-4 py-6 text-sm text-slate-500">Nobody marked yet.</p>
        ) : (
          <ul className="divide-y divide-[#1a2540]">
            {suspects.map((row) => (
              <li key={row.uid} className="px-4 py-3 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-sm text-slate-100 font-medium">{row.fullName}</p>
                  <p className="text-xs text-slate-500">
                    {row.email || row.uid}
                    {row.markedByName ? ` · marked by ${row.markedByName}` : ''}
                  </p>
                </div>
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => setSuspect(row.uid, false)}
                  className="px-3 py-1.5 rounded-lg text-xs border border-[#1a2540] text-slate-300 hover:bg-white/[0.04] disabled:opacity-40"
                >
                  Clear
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function ToolboxPunishmentsPanel() {
  const [employees, setEmployees] = useState([]);
  const [employeesLoading, setEmployeesLoading] = useState(true);
  const [punishments, setPunishments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [pickUid, setPickUid] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const loadPunishments = async () => {
    const response = await fetch('/api/adminListToolboxPunishments', { credentials: 'include' });
    const payload = (await readJsonResponse(response)) || {};
    if (!response.ok) throw new Error(payload.error || 'Failed to load punishments.');
    setPunishments(payload.punishments || []);
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        setError('');
        const [empRes] = await Promise.all([
          fetch('/api/getEmployeeProfiles', { credentials: 'include' }),
          loadPunishments(),
        ]);
        const empPayload = (await readJsonResponse(empRes)) || {};
        if (!empRes.ok) throw new Error(empPayload.error || 'Failed to load employees.');
        if (!cancelled) {
          setEmployees(empPayload.employees || empPayload.profiles || empPayload.items || []);
        }
      } catch (err) {
        if (!cancelled) setError(err.message || 'Failed to load Toolbox punishments.');
      } finally {
        if (!cancelled) {
          setLoading(false);
          setEmployeesLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const setPunishment = async (uid, punished) => {
    if (!uid) return;
    try {
      setSaving(true);
      setError('');
      setMessage('');
      const response = await fetch('/api/adminSetToolboxPunishment', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ uid, punished }),
      });
      const payload = (await readJsonResponse(response)) || {};
      if (!response.ok) throw new Error(payload.error || 'Failed to update punishment.');
      setPunishments(payload.punishments || []);
      if (punished) setPickUid('');
      setMessage(punished ? 'Added to Toolbox punishment list.' : 'Removed from punishment list.');
    } catch (err) {
      setError(err.message || 'Failed to update punishment.');
    } finally {
      setSaving(false);
    }
  };

  const punishedUids = new Set(punishments.map((row) => row.uid));

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-[#1a2540] p-4 space-y-2">
        <p className="text-sm text-slate-300">
          Mark accounts for a <span className="text-white font-medium">Little Dicks Toolbox punishment</span>.
          They play at 10% power, get coaches flooding the path on kick, a HA-HA taunt on every landing,
          and each attempt is logged to the leaderboard immediately (so quitting early still counts).
        </p>
        <p className="text-xs text-slate-500">
          Same attempt-logging also applies to anyone caught reloading mid-round (F5).
        </p>
      </div>

      <div className="rounded-xl border border-[#1a2540] p-4 space-y-3">
        <p className="text-sm font-semibold text-indigo-200">Add punishment</p>
        <div className="flex flex-wrap gap-3 items-end">
          <div className="min-w-[16rem] flex-1">
            <EmployeeSelect
              value={pickUid}
              onChange={setPickUid}
              employees={employees}
              loading={employeesLoading}
              emptyLabel="Search employee…"
              disabled={saving}
            />
          </div>
          <button
            type="button"
            disabled={!pickUid || saving || punishedUids.has(pickUid)}
            onClick={() => setPunishment(pickUid, true)}
            className="px-3 py-2 rounded-lg text-sm border border-rose-500/40 text-rose-100 hover:bg-rose-500/10 disabled:opacity-40"
          >
            Punish
          </button>
        </div>
      </div>

      {error ? <p className="text-sm text-rose-300">{error}</p> : null}
      {message ? <p className="text-sm text-emerald-300">{message}</p> : null}

      <div className="rounded-xl border border-[#1a2540] overflow-hidden">
        <div className="px-4 py-3 border-b border-[#1a2540] text-sm font-semibold text-indigo-200">
          Current punishments ({punishments.length})
        </div>
        {loading ? (
          <p className="px-4 py-6 text-sm text-slate-500">Loading…</p>
        ) : !punishments.length ? (
          <p className="px-4 py-6 text-sm text-slate-500">Nobody marked yet.</p>
        ) : (
          <ul className="divide-y divide-[#1a2540]">
            {punishments.map((row) => (
              <li key={row.uid} className="px-4 py-3 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-sm text-slate-100 font-medium">{row.fullName}</p>
                  <p className="text-xs text-slate-500">
                    {row.email || row.uid}
                    {row.markedByName ? ` · marked by ${row.markedByName}` : ''}
                  </p>
                </div>
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => setPunishment(row.uid, false)}
                  className="px-3 py-1.5 rounded-lg text-xs border border-[#1a2540] text-slate-300 hover:bg-white/[0.04] disabled:opacity-40"
                >
                  Clear
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

export default function FunAdmin() {
  const { user } = useAuth();
  const navigate = useNavigate();
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
      <div className={`${tab === 'geoguessr' || tab === 'nonograms' || tab === 'casefile' || tab === 'wanted' ? 'max-w-6xl' : 'max-w-4xl'} mx-auto px-4 sm:px-8 py-6 space-y-5`}>
        <div>
          <button
            type="button"
            onClick={() => navigate('/dashboard/profile', { state: { profileTab: 'fun' } })}
            className="text-sm text-slate-400 hover:text-slate-200"
          >
            ← Back to Fun
          </button>
          <h1 className="text-2xl font-semibold text-indigo-200 mt-3">Fun admin</h1>
          <p className="text-sm text-slate-400 mt-1">
            Tune weekday rotation, test games in a sandbox, and build Nonogram/Sokoban/Connections/trivia content.
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

        {tab === 'overview' && <RotationSettingsPanel />}

        {tab === 'wanted' && <WantedSandbox />}

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

        {tab === 'wordle-suspects' && <WordleSuspectsPanel />}
        {tab === 'toolbox-punishments' && <ToolboxPunishmentsPanel />}
        {tab === 'nonograms' && <NonogramManagerPanel />}
        {tab === 'connections' && <ConnectionsBuilder onSaved={loadLibrary} />}
        {tab === 'trivia' && <TriviaBuilder onSaved={loadLibrary} />}
        {tab === 'sokoban' && <SokobanBuilder onSaved={loadLibrary} />}
        {tab === 'enclose' && <EncloseSandbox />}
        {tab === 'letterbox' && <LetterboxSandbox />}
        {tab === 'pipes' && <PipesSandbox />}
        {tab === 'stackwalk' && <StackWalkSandbox />}
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
