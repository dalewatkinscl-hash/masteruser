import { useEffect, useState } from 'react';
import { KudosBadgeGraphic, getKudosGraphic } from './kudosGraphics';

async function readJsonResponse(res) {
  const contentType = res.headers.get('content-type') || '';
  if (!contentType.includes('application/json')) return null;
  try {
    return await res.json();
  } catch {
    return null;
  }
}

function seenStorageKey(uid) {
  return `kudos-welcome-seen:${uid || 'anon'}`;
}

function loadSeenIds(uid) {
  try {
    const raw = window.localStorage.getItem(seenStorageKey(uid));
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

function saveSeenIds(uid, ids) {
  try {
    window.localStorage.setItem(
      seenStorageKey(uid),
      JSON.stringify([...new Set(ids.map(String))].slice(-100)),
    );
  } catch {
    // ignore
  }
}

/**
 * Shows a modal once per new kudos when the user lands in the dashboard.
 */
export default function KudosWelcomeModal({ uid }) {
  const [items, setItems] = useState([]);
  const [open, setOpen] = useState(false);
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (!uid) return undefined;
    let cancelled = false;

    (async () => {
      try {
        const response = await fetch('/api/getMyKudos', { credentials: 'include' });
        const payload = (await readJsonResponse(response)) || {};
        if (!response.ok || cancelled) return;
        const received = Array.isArray(payload.received) ? payload.received : [];
        if (!received.length) return;

        const seen = new Set(loadSeenIds(uid));
        const unseen = received.filter((row) => row?.id && !seen.has(String(row.id)));
        if (!unseen.length || cancelled) return;

        setItems(unseen);
        setIndex(0);
        setOpen(true);
      } catch {
        // non-blocking
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [uid]);

  const dismiss = () => {
    if (uid && items.length) {
      const seen = loadSeenIds(uid);
      saveSeenIds(uid, [...seen, ...items.map((row) => row.id)]);
    }
    setOpen(false);
  };

  const current = items[index];
  if (!open || !current) return null;

  const graphic = getKudosGraphic(current.badgeType);
  const hasMore = items.length > 1;
  const isLast = index >= items.length - 1;

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-4">
      <button
        type="button"
        aria-label="Close kudos"
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={dismiss}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="kudos-welcome-title"
        className="relative w-full max-w-md rounded-2xl border border-[#1a2540] bg-[#0b1220] shadow-2xl overflow-hidden"
      >
        <div
          className="absolute inset-x-0 top-0 h-32 opacity-80"
          style={{
            background: `radial-gradient(ellipse at top, ${graphic.soft}, transparent 70%)`,
          }}
        />

        <div className="relative px-6 pt-8 pb-6 text-center">
          <div className="flex justify-center mb-4">
            <KudosBadgeGraphic badgeType={current.badgeType} size="xl" gifUrl={current.gifUrl} />
          </div>

          <p className="text-[11px] font-mono uppercase tracking-[0.2em] text-slate-500 mb-2">
            You’ve received kudos
          </p>
          <h2 id="kudos-welcome-title" className="text-2xl font-semibold text-white mb-1">
            {current.badgeLabel || graphic.label}
          </h2>
          <p className="text-sm text-slate-400 mb-4">
            From <span className="text-slate-200 font-medium">{current.fromName || 'a colleague'}</span>
          </p>

          <blockquote className="rounded-xl border border-[#1a2540] bg-[#060e1a] px-4 py-3 text-sm text-slate-200 leading-relaxed">
            “{current.message}”
          </blockquote>

          {hasMore && (
            <p className="text-xs text-slate-500 mt-3">
              {index + 1} of {items.length} new kudos today
            </p>
          )}

          <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
            {hasMore && !isLast ? (
              <button
                type="button"
                onClick={() => setIndex((value) => value + 1)}
                className="px-4 py-2 rounded-lg text-sm font-medium bg-indigo-600 hover:bg-indigo-500 text-white transition-colors"
              >
                Next
              </button>
            ) : (
              <button
                type="button"
                onClick={dismiss}
                className="px-4 py-2 rounded-lg text-sm font-medium bg-indigo-600 hover:bg-indigo-500 text-white transition-colors"
              >
                Nice!
              </button>
            )}
            {hasMore && (
              <button
                type="button"
                onClick={dismiss}
                className="px-4 py-2 rounded-lg text-sm font-medium border border-[#1a2540] text-slate-300 hover:bg-white/[0.04] transition-colors"
              >
                Close
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
