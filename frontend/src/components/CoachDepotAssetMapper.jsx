/**
 * Fun Admin: map custom pack PNGs → HQ / buildings / decorations / vehicles.
 * Saves to Firestore coach_depot_config/assetMap; live game loads via getCoachDepot.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ASSET_MAP_BUILDING_KEYS,
  ASSET_MAP_DECOR_KEYS,
  ASSET_MAP_GROUND_KEYS,
  ASSET_MAP_VEHICLE_TIERS,
  BUILDING_MAP_LABELS,
  CUSTOM_ASSET_FILES,
  CUSTOM_BASE,
  DEFAULT_CUSTOM_ASSET_MAP,
  customAssetUrl,
  getCoachDepotAssetMap,
  normalizeCoachDepotAssetMap,
  setCoachDepotAssetMap,
} from '../lib/coachDepotAssets';

async function readJsonResponse(res) {
  const contentType = res.headers.get('content-type') || '';
  if (!contentType.includes('application/json')) return null;
  try {
    return await res.json();
  } catch {
    return null;
  }
}

function Thumb({ file, size = 72, cacheKey = '' }) {
  if (!file) {
    return (
      <div
        className="rounded border border-dashed border-slate-600 bg-slate-900/60 flex items-center justify-center text-[10px] text-slate-500"
        style={{ width: size, height: size }}
      >
        none
      </div>
    );
  }
  const src = `${customAssetUrl(file)}${cacheKey ? `?v=${encodeURIComponent(cacheKey)}` : ''}`;
  return (
    <img
      src={src}
      alt={file}
      title={file}
      className="rounded border border-slate-700 bg-[#1a2740] object-contain"
      style={{ width: size, height: size }}
    />
  );
}

function FileSelect({ value, onChange, files, allowEmpty = true }) {
  return (
    <select
      value={value || ''}
      onChange={(e) => onChange(e.target.value)}
      className="w-full min-w-0 bg-[#060e1a] border border-[#1a2540] rounded-md px-2 py-1.5 text-xs text-slate-100"
    >
      {allowEmpty ? <option value="">— default / none —</option> : null}
      {files.map((f) => (
        <option key={f} value={f}>{f}</option>
      ))}
    </select>
  );
}

function LevelRow({
  label,
  levels,
  onChangeLevel,
  onAddLevel,
  onRemoveLevel,
  files,
  cacheKey = '',
  maxLevels = 8,
}) {
  return (
    <div className="rounded-lg border border-[#1a2540] bg-[#0a1424]/40 p-3 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-medium text-slate-200">{label}</h3>
        <div className="flex gap-1">
          <button
            type="button"
            disabled={levels.length >= maxLevels}
            onClick={onAddLevel}
            className="px-2 py-0.5 text-[11px] rounded bg-slate-800 text-slate-300 hover:bg-slate-700 disabled:opacity-40"
          >
            + level
          </button>
          <button
            type="button"
            disabled={levels.length <= 1}
            onClick={onRemoveLevel}
            className="px-2 py-0.5 text-[11px] rounded bg-slate-800 text-slate-300 hover:bg-slate-700 disabled:opacity-40"
          >
            − level
          </button>
        </div>
      </div>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {levels.map((file, idx) => (
          <div key={`${label}-${idx}`} className="flex items-start gap-2">
            <Thumb file={file} cacheKey={cacheKey} />
            <div className="flex-1 min-w-0 space-y-1">
              <p className="text-[10px] uppercase tracking-wide text-slate-500">Lv {idx + 1}</p>
              <FileSelect
                value={file}
                files={files}
                onChange={(v) => onChangeLevel(idx, v)}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function CoachDepotAssetMapper() {
  const [map, setMap] = useState(() => normalizeCoachDepotAssetMap(getCoachDepotAssetMap()));
  const [catalog, setCatalog] = useState(CUSTOM_ASSET_FILES);
  const [cacheKey, setCacheKey] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');
  const [filter, setFilter] = useState('');
  const [selectedFile, setSelectedFile] = useState('');

  const files = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return catalog;
    return catalog.filter((f) => f.toLowerCase().includes(q));
  }, [catalog, filter]);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [mapRes, catRes] = await Promise.all([
        fetch('/api/getCoachDepotAssetMap', { credentials: 'include' }),
        fetch(`${CUSTOM_BASE}/catalog.json`, { credentials: 'include' }).catch(() => null),
      ]);
      const payload = (await readJsonResponse(mapRes)) || {};
      if (!mapRes.ok) throw new Error(payload.error || 'Failed to load asset map.');
      const next = normalizeCoachDepotAssetMap(payload.assetMap || DEFAULT_CUSTOM_ASSET_MAP);
      setMap(next);
      setCoachDepotAssetMap(next);
      if (catRes?.ok) {
        const cat = await catRes.json();
        if (Array.isArray(cat?.files) && cat.files.length) {
          setCatalog(cat.files.map(String));
        }
        if (cat?.generatedAt) setCacheKey(String(cat.generatedAt));
        else setCacheKey(String(Date.now()));
      } else {
        setCacheKey(String(Date.now()));
      }
    } catch (err) {
      setError(err.message || 'Failed to load.');
      setMap(normalizeCoachDepotAssetMap(DEFAULT_CUSTOM_ASSET_MAP));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const setLevelList = (key, list) => {
    setMap((prev) => ({ ...prev, [key]: list }));
  };

  const setDecor = (key, file) => {
    setMap((prev) => ({
      ...prev,
      decorations: { ...prev.decorations, [key]: file },
    }));
  };

  const setVehicle = (tier, file) => {
    setMap((prev) => ({
      ...prev,
      vehicles: { ...prev.vehicles, [tier]: file },
    }));
  };

  const setGround = (key, file) => {
    setMap((prev) => ({
      ...prev,
      grounds: { ...prev.grounds, [key]: file },
    }));
  };

  const assignSelected = (assign) => {
    if (!selectedFile) {
      setToast('Pick a sprite from the pack first.');
      return;
    }
    assign(selectedFile);
    setToast(`Assigned ${selectedFile}`);
  };

  const save = async () => {
    setSaving(true);
    setError('');
    setToast('');
    try {
      const body = normalizeCoachDepotAssetMap(map);
      const response = await fetch('/api/saveCoachDepotAssetMap', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ map: body }),
      });
      const payload = (await readJsonResponse(response)) || {};
      if (!response.ok) throw new Error(payload.error || 'Save failed.');
      const next = normalizeCoachDepotAssetMap(payload.assetMap || body);
      setMap(next);
      setCoachDepotAssetMap(next);
      setToast('Asset map saved — live Depot will use it on next load.');
    } catch (err) {
      setError(err.message || 'Save failed.');
    } finally {
      setSaving(false);
    }
  };

  const resetDefaults = () => {
    if (!window.confirm('Reset mapper to default custom-pack assignments? (Save to persist.)')) return;
    const next = normalizeCoachDepotAssetMap(DEFAULT_CUSTOM_ASSET_MAP);
    setMap(next);
    setCoachDepotAssetMap(next);
    setToast('Defaults loaded locally — click Save to publish.');
  };

  if (loading) {
    return <p className="text-sm text-slate-400">Loading Depot asset map…</p>;
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-indigo-200">Depot asset map</h2>
          <p className="text-sm text-slate-400 mt-1 max-w-2xl">
            Assign Gemini pack sprites under <code className="text-slate-300">/coach-depot/custom/</code> to
            buildings, decorations, vehicles, and grounds. Custom art is sandbox / Fun Admin only for now —
            live player Depot still uses the stock sprites.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={resetDefaults}
            className="px-3 py-1.5 rounded-md text-sm bg-slate-800 text-slate-200 hover:bg-slate-700"
          >
            Reset defaults
          </button>
          <button
            type="button"
            onClick={load}
            className="px-3 py-1.5 rounded-md text-sm bg-slate-800 text-slate-200 hover:bg-slate-700"
          >
            Reload
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={save}
            className="px-3 py-1.5 rounded-md text-sm bg-indigo-600 text-white hover:bg-indigo-500 disabled:opacity-50"
          >
            {saving ? 'Saving…' : 'Save map'}
          </button>
        </div>
      </div>

      {error ? <p className="text-sm text-rose-300">{error}</p> : null}
      {toast ? <p className="text-sm text-emerald-300">{toast}</p> : null}

      <div className="rounded-lg border border-[#1a2540] bg-[#0a1424]/60 p-3 space-y-3">
        <div className="flex flex-wrap items-end gap-3">
          <label className="text-xs text-slate-400 space-y-1 flex-1 min-w-[12rem]">
            Filter pack
            <input
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="bld_ ops_ veh_ decor_"
              className="block w-full bg-[#060e1a] border border-[#1a2540] rounded-md px-3 py-2 text-sm text-slate-100"
            />
          </label>
          <p className="text-xs text-slate-500 pb-2">
            {files.length} / {catalog.length} files · click a tile then use Assign on a slot
          </p>
        </div>
        <div className="flex flex-wrap gap-2 max-h-48 overflow-y-auto">
          {files.map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setSelectedFile(f)}
              className={`rounded border p-1 ${
                selectedFile === f
                  ? 'border-indigo-400 bg-indigo-950/50'
                  : 'border-slate-700 hover:border-slate-500'
              }`}
              title={f}
            >
              <Thumb file={f} size={56} cacheKey={cacheKey} />
            </button>
          ))}
        </div>
        {selectedFile ? (
          <p className="text-xs text-indigo-200">Selected: {selectedFile}</p>
        ) : null}
      </div>

      <section className="space-y-3">
        <h3 className="text-sm font-semibold text-slate-300 uppercase tracking-wide">Buildings</h3>
        {ASSET_MAP_BUILDING_KEYS.map((key) => {
          const levels = Array.isArray(map[key]) && map[key].length
            ? map[key]
            : [''];
          return (
            <LevelRow
              key={key}
              label={BUILDING_MAP_LABELS[key] || key}
              levels={levels}
              files={catalog}
              cacheKey={cacheKey}
              onChangeLevel={(idx, v) => {
                const next = [...levels];
                next[idx] = v;
                setLevelList(key, next);
              }}
              onAddLevel={() => {
                assignSelected((file) => setLevelList(key, [...levels, file]));
                if (!selectedFile) setLevelList(key, [...levels, '']);
              }}
              onRemoveLevel={() => setLevelList(key, levels.slice(0, -1))}
            />
          );
        })}
      </section>

      <section className="rounded-lg border border-[#1a2540] bg-[#0a1424]/40 p-3 space-y-3">
        <h3 className="text-sm font-semibold text-slate-300 uppercase tracking-wide">Bay · character</h3>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="flex items-start gap-2">
            <Thumb file={map.bay} cacheKey={cacheKey} />
            <div className="flex-1 space-y-1">
              <p className="text-xs text-slate-400">Parking bay</p>
              <FileSelect value={map.bay} files={catalog} onChange={(v) => setMap((p) => ({ ...p, bay: v }))} />
              <button
                type="button"
                className="text-[11px] text-indigo-300 hover:underline"
                onClick={() => assignSelected((f) => setMap((p) => ({ ...p, bay: f })))}
              >
                Assign selected
              </button>
            </div>
          </div>
          <div className="flex items-start gap-2">
            <Thumb file={map.character} cacheKey={cacheKey} />
            <div className="flex-1 space-y-1">
              <p className="text-xs text-slate-400">Driver / character</p>
              <FileSelect
                value={map.character}
                files={catalog}
                onChange={(v) => setMap((p) => ({ ...p, character: v }))}
              />
              <button
                type="button"
                className="text-[11px] text-indigo-300 hover:underline"
                onClick={() => assignSelected((f) => setMap((p) => ({ ...p, character: f })))}
              >
                Assign selected
              </button>
            </div>
          </div>
        </div>
      </section>

      <section className="rounded-lg border border-[#1a2540] bg-[#0a1424]/40 p-3 space-y-3">
        <h3 className="text-sm font-semibold text-slate-300 uppercase tracking-wide">Decorations</h3>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {ASSET_MAP_DECOR_KEYS.map((key) => (
            <div key={key} className="flex items-start gap-2">
              <Thumb file={map.decorations?.[key]} cacheKey={cacheKey} />
              <div className="flex-1 space-y-1">
                <p className="text-xs text-slate-400 capitalize">{key}</p>
                <FileSelect
                  value={map.decorations?.[key] || ''}
                  files={catalog}
                  onChange={(v) => setDecor(key, v)}
                />
                <button
                  type="button"
                  className="text-[11px] text-indigo-300 hover:underline"
                  onClick={() => assignSelected((f) => setDecor(key, f))}
                >
                  Assign selected
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-lg border border-[#1a2540] bg-[#0a1424]/40 p-3 space-y-3">
        <h3 className="text-sm font-semibold text-slate-300 uppercase tracking-wide">Vehicles</h3>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {ASSET_MAP_VEHICLE_TIERS.map(({ tier, label }) => (
            <div key={tier} className="flex items-start gap-2">
              <Thumb file={map.vehicles?.[tier]} cacheKey={cacheKey} />
              <div className="flex-1 space-y-1">
                <p className="text-xs text-slate-400">Tier {tier} · {label}</p>
                <FileSelect
                  value={map.vehicles?.[tier] || ''}
                  files={catalog}
                  onChange={(v) => setVehicle(tier, v)}
                />
                <button
                  type="button"
                  className="text-[11px] text-indigo-300 hover:underline"
                  onClick={() => assignSelected((f) => setVehicle(tier, f))}
                >
                  Assign selected
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-lg border border-[#1a2540] bg-[#0a1424]/40 p-3 space-y-3">
        <h3 className="text-sm font-semibold text-slate-300 uppercase tracking-wide">Grounds</h3>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {ASSET_MAP_GROUND_KEYS.map((key) => (
            <div key={key} className="flex items-start gap-2">
              <Thumb file={map.grounds?.[key]} cacheKey={cacheKey} />
              <div className="flex-1 space-y-1">
                <p className="text-xs text-slate-400 capitalize">{key}</p>
                <FileSelect
                  value={map.grounds?.[key] || ''}
                  files={catalog}
                  onChange={(v) => setGround(key, v)}
                />
                <button
                  type="button"
                  className="text-[11px] text-indigo-300 hover:underline"
                  onClick={() => assignSelected((f) => setGround(key, f))}
                >
                  Assign selected
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
