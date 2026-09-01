import { useEffect, useMemo, useRef, useState } from 'react';
import { KudosBadgeGraphic, KUDOS_GRAPHICS, getKudosGraphic } from './kudosGraphics';

async function readJsonResponse(res) {
  const contentType = res.headers.get('content-type') || '';
  if (!contentType.includes('application/json')) return null;
  try {
    return await res.json();
  } catch {
    return null;
  }
}

function readFileAsBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || '');
      const comma = result.indexOf(',');
      resolve(comma >= 0 ? result.slice(comma + 1) : result);
    };
    reader.onerror = () => reject(new Error('Failed to read GIF file.'));
    reader.readAsDataURL(file);
  });
}

export const KUDOS_BADGE_META = Object.fromEntries(
  Object.entries(KUDOS_GRAPHICS).map(([key, graphic]) => [
    key,
    {
      label: graphic.label,
      className: 'border-transparent',
      accent: graphic.accent,
      soft: graphic.soft,
      border: graphic.border,
    },
  ]),
);

export function badgeMeta(badgeType) {
  return KUDOS_BADGE_META[badgeType] || {
    label: badgeType || 'Kudos',
    className: 'border-[#1a2540] bg-white/5 text-slate-300',
  };
}

function formatTime(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}

function formatRecipientList(names) {
  if (!names.length) return 'your colleagues';
  if (names.length === 1) return names[0];
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names.slice(0, -1).join(', ')}, and ${names[names.length - 1]}`;
}

function ColleaguePicker({ colleagues, selected, onChange, disabled, maxSelected }) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);
  const selectedIds = useMemo(() => new Set(selected.map((row) => row.uid)), [selected]);

  useEffect(() => {
    const onDocClick = (event) => {
      if (!wrapRef.current?.contains(event.target)) setOpen(false);
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);

  const matches = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const pool = colleagues.filter((row) => !selectedIds.has(row.uid));
    if (!needle) return pool.slice(0, 8);
    return pool
      .filter((row) => {
        const hay = `${row.fullName} ${row.department || ''} ${row.jobRole || ''}`.toLowerCase();
        return hay.includes(needle);
      })
      .slice(0, 8);
  }, [colleagues, query, selectedIds]);

  const atLimit = selected.length >= maxSelected;

  return (
    <div ref={wrapRef} className="relative space-y-2">
      {selected.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {selected.map((row) => (
            <span
              key={row.uid}
              className="inline-flex items-center gap-1.5 rounded-full border border-indigo-500/30 bg-indigo-500/10 px-2.5 py-1 text-xs text-indigo-100"
            >
              {row.fullName}
              <button
                type="button"
                disabled={disabled}
                aria-label={`Remove ${row.fullName}`}
                onClick={() => onChange(selected.filter((item) => item.uid !== row.uid))}
                className="text-indigo-300 hover:text-white disabled:opacity-50"
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}
      <input
        type="text"
        value={query}
        disabled={disabled || atLimit}
        placeholder={atLimit ? `Maximum ${maxSelected} selected` : 'Search and add colleagues…'}
        onFocus={() => setOpen(true)}
        onChange={(event) => {
          setQuery(event.target.value);
          setOpen(true);
        }}
        className="w-full bg-[#060e1a] border border-[#1a2540] text-slate-100 text-sm rounded-lg px-4 py-2.5 focus:outline-none focus:border-indigo-500/60 focus:ring-1 focus:ring-indigo-500/40 disabled:opacity-50"
      />
      {open && !atLimit && matches.length > 0 && (
        <ul className="absolute z-20 mt-1 w-full max-h-56 overflow-auto rounded-lg border border-[#1a2540] bg-[#0b1220] shadow-xl">
          {matches.map((row) => (
            <li key={row.uid}>
              <button
                type="button"
                className="w-full text-left px-4 py-2.5 hover:bg-white/[0.04] transition-colors"
                onClick={() => {
                  onChange([...selected, row]);
                  setQuery('');
                  setOpen(false);
                }}
              >
                <p className="text-sm text-slate-100">{row.fullName}</p>
                {(row.jobRole || row.department) && (
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    {[row.jobRole, row.department].filter(Boolean).join(' · ')}
                  </p>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
      <p className="text-[11px] text-slate-500">
        {selected.length} selected · each person uses one of your daily kudos
      </p>
    </div>
  );
}

function KudosCard({ item, perspective }) {
  const graphic = getKudosGraphic(item.badgeType);
  const otherName = perspective === 'received' ? item.fromName : item.toName;
  const prefix = perspective === 'received' ? 'From' : 'To';

  return (
    <article className="rounded-xl border border-[#1a2540] bg-[#060e1a] p-4 flex gap-3">
      <KudosBadgeGraphic badgeType={item.badgeType} size="sm" gifUrl={item.gifUrl} />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2 mb-1">
          <span className="text-xs font-semibold text-slate-100">
            {item.badgeLabel || graphic.label}
          </span>
          <span className="text-xs text-slate-400">
            {prefix} {otherName}
            {item.createdAt ? ` · ${formatTime(item.createdAt)}` : ''}
          </span>
        </div>
        <p className="text-sm text-slate-200 leading-relaxed">{item.message}</p>
      </div>
    </article>
  );
}

export default function KudosPanel({ currentUserUid }) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [colleagues, setColleagues] = useState([]);
  const [badges, setBadges] = useState([]);
  const [received, setReceived] = useState([]);
  const [sent, setSent] = useState([]);
  const [remainingToday, setRemainingToday] = useState(10);
  const [selectedColleagues, setSelectedColleagues] = useState([]);
  const [badgeType, setBadgeType] = useState('great_performance');
  const [message, setMessage] = useState('');
  const [gifFile, setGifFile] = useState(null);
  const [gifPreviewUrl, setGifPreviewUrl] = useState('');
  const [libraryGifs, setLibraryGifs] = useState([]);
  const [selectedLibraryGifUrl, setSelectedLibraryGifUrl] = useState('');
  const gifInputRef = useRef(null);

  useEffect(() => {
    if (!gifFile) {
      setGifPreviewUrl('');
      return undefined;
    }
    const url = URL.createObjectURL(gifFile);
    setGifPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [gifFile]);

  const selectedGifPreview = gifPreviewUrl || selectedLibraryGifUrl;

  const maxSelectable = Math.max(1, Math.min(10, remainingToday || 0));

  const load = async () => {
    const kudosRes = await fetch('/api/getMyKudos', { credentials: 'include' });
    const kudosPayload = (await readJsonResponse(kudosRes)) || {};
    if (!kudosRes.ok) throw new Error(kudosPayload.error || 'Failed to load kudos.');
    if (!kudosPayload.canIssue) {
      throw new Error('Only managers and admins can issue kudos.');
    }
    setBadges(kudosPayload.badges || []);
    setReceived(kudosPayload.received || []);
    setSent(kudosPayload.sent || []);
    setLibraryGifs(Array.isArray(kudosPayload.gifs) ? kudosPayload.gifs : []);
    setRemainingToday(Number.isFinite(kudosPayload.remainingToday) ? kudosPayload.remainingToday : 10);
    if (!badgeType && kudosPayload.badges?.[0]?.key) {
      setBadgeType(kudosPayload.badges[0].key);
    }

    const directoryRes = await fetch('/api/listColleagueDirectory', { credentials: 'include' });
    const directoryPayload = (await readJsonResponse(directoryRes)) || {};
    if (!directoryRes.ok) throw new Error(directoryPayload.error || 'Failed to load colleagues.');
    setColleagues(directoryPayload.colleagues || []);
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        setError('');
        await load();
      } catch (err) {
        if (!cancelled) setError(err.message || 'Failed to load kudos.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [currentUserUid]);

  const clearGif = () => {
    setGifFile(null);
    setSelectedLibraryGifUrl('');
    if (gifInputRef.current) gifInputRef.current.value = '';
  };

  const onGifChange = (event) => {
    const file = event.target.files?.[0] || null;
    setError('');
    if (!file) {
      clearGif();
      return;
    }
    if (file.type !== 'image/gif') {
      clearGif();
      setError('Please choose a .gif file.');
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      clearGif();
      setError('GIF must be 2MB or smaller.');
      return;
    }
    setSelectedLibraryGifUrl('');
    setGifFile(file);
  };

  const pickLibraryGif = (url) => {
    setError('');
    setGifFile(null);
    if (gifInputRef.current) gifInputRef.current.value = '';
    setSelectedLibraryGifUrl((current) => (current === url ? '' : url));
  };

  const onSubmit = async (event) => {
    event.preventDefault();
    setSaving(true);
    setError('');
    setSuccess('');
    try {
      if (!selectedColleagues.length) throw new Error('Please choose at least one colleague.');
      if (selectedColleagues.length > remainingToday) {
        throw new Error(`You only have ${remainingToday} kudos left today.`);
      }

      const body = {
        toUids: selectedColleagues.map((row) => row.uid),
        badgeType,
        message,
      };
      if (gifFile) {
        body.gifBase64 = await readFileAsBase64(gifFile);
        body.gifMimeType = 'image/gif';
      } else if (selectedLibraryGifUrl) {
        body.gifUrl = selectedLibraryGifUrl;
      }

      const response = await fetch('/api/sendKudos', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const payload = (await readJsonResponse(response)) || {};
      if (!response.ok) throw new Error(payload.error || 'Failed to send kudos.');

      const sentRows = Array.isArray(payload.sent)
        ? payload.sent
        : (payload.kudos ? [payload.kudos] : []);
      const names = sentRows.map((row) => row.toName).filter(Boolean);
      setMessage('');
      setSelectedColleagues([]);
      clearGif();
      setSuccess(
        `Kudos sent to ${formatRecipientList(names.length ? names : selectedColleagues.map((row) => row.fullName))} — it will show on their profile today.`,
      );
      window.dispatchEvent(new CustomEvent('cl-kudos-changed'));
      await load();
    } catch (err) {
      setError(err.message || 'Failed to send kudos.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <p className="text-sm text-slate-400">Loading kudos…</p>;
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-white">Kudos</h2>
        <p className="text-sm text-slate-400 mt-1">
          Pick one or more colleagues, a graphic badge, optional GIF (replaces the badge icon), and message — they get a popup when they next log in, and it stays on their profile for today.
        </p>
      </div>

      <form onSubmit={onSubmit} className="bg-[#0b1220] border border-[#1a2540] rounded-xl p-5 space-y-4">
        <div>
          <label className="block text-xs font-medium text-slate-400 mb-1.5">Colleagues</label>
          <ColleaguePicker
            colleagues={colleagues}
            selected={selectedColleagues}
            onChange={setSelectedColleagues}
            disabled={saving || remainingToday <= 0}
            maxSelected={maxSelectable}
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-400 mb-2">
            Choose a graphic badge
          </label>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {(badges.length ? badges : Object.values(KUDOS_GRAPHICS).map((graphic) => ({
              key: graphic.key,
              label: graphic.label,
              description: graphic.description,
            }))).map((badge) => {
              const graphic = getKudosGraphic(badge.key);
              const selected = badgeType === badge.key;
              return (
                <button
                  key={badge.key}
                  type="button"
                  disabled={saving || remainingToday <= 0}
                  onClick={() => setBadgeType(badge.key)}
                  className={`rounded-xl border px-3 py-3 transition-all disabled:opacity-50 text-center ${
                    selected
                      ? 'border-indigo-400/60 bg-white/[0.06] ring-2 ring-indigo-400/50'
                      : 'border-[#1a2540] bg-[#060e1a] hover:bg-white/[0.03]'
                  }`}
                >
                  <div className="flex justify-center mb-2">
                    <KudosBadgeGraphic badgeType={badge.key} size="md" />
                  </div>
                  <p className="text-xs font-semibold leading-snug text-slate-100">
                    {badge.label || graphic.label}
                  </p>
                  <p className="text-[10px] text-slate-400 mt-0.5 leading-snug">
                    {badge.description || graphic.description}
                  </p>
                </button>
              );
            })}
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-400 mb-1.5">Message</label>
          <textarea
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            rows={3}
            maxLength={280}
            disabled={saving || remainingToday <= 0}
            placeholder="What did they do well?"
            className="w-full bg-[#060e1a] border border-[#1a2540] text-slate-100 text-sm rounded-lg px-4 py-2.5 focus:outline-none focus:border-indigo-500/60 focus:ring-1 focus:ring-indigo-500/40 resize-y"
          />
          <p className="text-[11px] text-slate-500 mt-1">{message.length}/280 · {remainingToday} left today</p>
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-400 mb-1.5">
            GIF icon (optional)
          </label>
          <p className="text-[11px] text-slate-500 mb-2">
            Replaces the badge icon for this kudos. Pick a shared library GIF or upload a new one (GIF only · max 2MB).
          </p>
          {libraryGifs.length > 0 && (
            <div className="mb-3 grid grid-cols-4 sm:grid-cols-6 gap-2">
              {libraryGifs.map((gif) => {
                const selected = selectedLibraryGifUrl === gif.url && !gifFile;
                return (
                  <button
                    key={gif.id || gif.url}
                    type="button"
                    disabled={saving || remainingToday <= 0}
                    title={gif.uploadedByName ? `Uploaded by ${gif.uploadedByName}` : 'Shared GIF'}
                    onClick={() => pickLibraryGif(gif.url)}
                    className={`aspect-square rounded-xl border overflow-hidden transition-all disabled:opacity-50 flex items-center justify-center bg-[#060e1a] ${
                      selected
                        ? 'border-indigo-400/60 ring-2 ring-indigo-400/50'
                        : 'border-[#1a2540] hover:border-slate-500'
                    }`}
                  >
                    <img src={gif.url} alt="" className="max-w-full max-h-full w-auto h-auto object-contain" loading="lazy" />
                  </button>
                );
              })}
            </div>
          )}
          <div className="flex flex-wrap items-center gap-3">
            <input
              ref={gifInputRef}
              type="file"
              accept="image/gif,.gif"
              disabled={saving || remainingToday <= 0}
              onChange={onGifChange}
              className="block w-full max-w-sm text-sm text-slate-300 file:mr-3 file:rounded-md file:border-0 file:bg-indigo-600 file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-white hover:file:bg-indigo-500 disabled:opacity-50"
            />
            {(gifFile || selectedLibraryGifUrl) ? (
              <button
                type="button"
                disabled={saving}
                onClick={clearGif}
                className="text-xs text-slate-400 hover:text-slate-200"
              >
                Clear GIF
              </button>
            ) : null}
          </div>
          {selectedGifPreview ? (
            <div className="mt-3 flex items-center gap-3">
              <KudosBadgeGraphic
                badgeType={badgeType}
                size="md"
                gifUrl={selectedGifPreview}
                title="GIF will replace the badge icon"
              />
              <p className="text-[11px] text-slate-500">Preview — GIF as badge icon</p>
            </div>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="submit"
            disabled={saving || remainingToday <= 0 || !selectedColleagues.length}
            className="px-4 py-2 rounded-lg text-sm font-medium bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed text-white transition-colors"
          >
            {saving
              ? 'Sending…'
              : selectedColleagues.length > 1
                ? `Send kudos to ${selectedColleagues.length}`
                : 'Send kudos'}
          </button>
          {success && <p className="text-sm text-emerald-300">{success}</p>}
          {error && <p className="text-sm text-rose-300">{error}</p>}
        </div>
      </form>

      <div className="grid md:grid-cols-2 gap-6">
        <section>
          <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-400 mb-3">
            Received today
          </h3>
          {received.length === 0 ? (
            <p className="text-sm text-slate-500">No kudos on your profile yet today.</p>
          ) : (
            <div className="space-y-3">
              {received.map((item) => (
                <KudosCard key={item.id} item={item} perspective="received" />
              ))}
            </div>
          )}
        </section>

        <section>
          <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-400 mb-3">
            Sent today
          </h3>
          {sent.length === 0 ? (
            <p className="text-sm text-slate-500">You haven’t sent any kudos today.</p>
          ) : (
            <div className="space-y-3">
              {sent.map((item) => (
                <KudosCard key={item.id} item={item} perspective="sent" />
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
