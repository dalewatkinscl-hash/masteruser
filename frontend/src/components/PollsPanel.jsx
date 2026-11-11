import { useEffect, useMemo, useRef, useState } from 'react';
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

const BISCUIT_PRESET_32 = [
  { name: 'Chocolate Hobnob', bg: '#7c3f1d', accent: '#3e1e04', emoji: '🍪' },
  { name: 'Custard Cream', bg: '#d9a441', accent: '#f6e3b4', emoji: '🟨' },
  { name: 'Bourbon', bg: '#4a2511', accent: '#2b1306', emoji: '🍫' },
  { name: 'Jammie Dodger', bg: '#d49b54', accent: '#be123c', emoji: '❤️' },
  { name: 'Chocolate Digestive', bg: '#854d27', accent: '#3b1c0a', emoji: '🍪' },
  { name: 'Shortbread Finger', bg: '#eab664', accent: '#fef08a', emoji: '🧈' },
  { name: 'Jaffa Cake', bg: '#3f200d', accent: '#ea580c', emoji: '🍊' },
  { name: 'Lotus Biscoff', bg: '#b45309', accent: '#78350f', emoji: '🟫' },
  { name: 'Maryland Choc Chip', bg: '#b07840', accent: '#291507', emoji: '🍪' },
  { name: 'Ginger Nut', bg: '#b45309', accent: '#92400e', emoji: '🫚' },
  { name: 'Party Ring', bg: '#ec4899', accent: '#fde047', emoji: '🍩' },
  { name: 'Malted Milk', bg: '#c68e4f', accent: '#fef3c7', emoji: '🐄' },
  { name: 'Rich Tea', bg: '#c89158', accent: '#a16207', emoji: '☕' },
  { name: 'Fox’s Viennese Melt', bg: '#d6a15c', accent: '#451a03', emoji: '✨' },
  { name: 'Penguin Bar', bg: '#3b1d0c', accent: '#ef4444', emoji: '🐧' },
  { name: 'Oreo', bg: '#1e1b18', accent: '#f8fafc', emoji: '⚫' },
  { name: 'Tunnock’s Caramel Wafer', bg: '#991b1b', accent: '#fbbf24', emoji: '🏴󠁧󠁢󠁳󠁣󠁴󠁿' },
  { name: 'Tunnock’s Tea Cake', bg: '#b91c1c', accent: '#e2e8f0', emoji: '🧁' },
  { name: 'Plain Hobnob', bg: '#a16207', accent: '#713f12', emoji: '🌾' },
  { name: 'Plain Digestive', bg: '#b87d3e', accent: '#78350f', emoji: '🍪' },
  { name: 'Nice Biscuit', bg: '#d4a359', accent: '#fef9c3', emoji: '🥥' },
  { name: 'Garibaldi', bg: '#9a6332', accent: '#4c1d95', emoji: '🍇' },
  { name: 'Fig Roll', bg: '#854d0e', accent: '#422006', emoji: '🌰' },
  { name: 'Pink Wafer', bg: '#f472b6', accent: '#fbcfe8', emoji: '🩷' },
  { name: 'KitKat (2 Finger)', bg: '#dc2626', accent: '#451a03', emoji: '🍫' },
  { name: 'Twix Finger', bg: '#ca8a04', accent: '#451a03', emoji: '✨' },
  { name: 'Club Orange', bg: '#ea580c', accent: '#3e1e04', emoji: '🍊' },
  { name: 'Club Mint', bg: '#059669', accent: '#3e1e04', emoji: '🌿' },
  { name: 'Viscount Mint', bg: '#10b981', accent: '#064e3b', emoji: '🟢' },
  { name: 'Wagon Wheel', bg: '#991b1b', accent: '#451a03', emoji: '🛞' },
  { name: 'Gold Bar', bg: '#eab308', accent: '#713f12', emoji: '🥇' },
  { name: 'Choc Leibniz', bg: '#6d3614', accent: '#f5d08a', emoji: '🍫' },
];

function makeContenderSvgDataUrl(name, bg = '#312e81', accent = '#6366f1', emoji = '🏆') {
  const safeName = String(name || 'Contender')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .slice(0, 26);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="240" height="240" viewBox="0 0 240 240">
    <defs>
      <radialGradient id="g" cx="35%" cy="30%" r="75%">
        <stop offset="0%" stop-color="${accent}"/>
        <stop offset="100%" stop-color="${bg}"/>
      </radialGradient>
    </defs>
    <rect width="240" height="240" rx="36" fill="url(#g)"/>
    <circle cx="120" cy="96" r="56" fill="rgba(255,255,255,0.14)" stroke="rgba(255,255,255,0.28)" stroke-width="3"/>
    <text x="120" y="114" font-size="52" text-anchor="middle">${emoji}</text>
    <rect x="16" y="172" width="208" height="44" rx="12" fill="rgba(6,14,26,0.78)"/>
    <text x="120" y="199" font-family="system-ui, sans-serif" font-size="14" font-weight="700" fill="#ffffff" text-anchor="middle">${safeName}</text>
  </svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

function createEmpty32Items() {
  return Array.from({ length: 32 }, (_, idx) => ({
    seed: idx + 1,
    name: '',
    imageUrl: '',
  }));
}

function cleanFileNameToTitle(fileName) {
  return String(fileName || '')
    .replace(/\.[^.]+$/, '')
    .replace(/[-_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .slice(0, 60);
}

/** Resize & compress an uploaded image File in browser canvas to keep uploads snappy. */
function compressImageFileToDataUrl(file, maxDim = 640, quality = 0.88) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Could not read image file.'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('Invalid image file.'));
      img.onload = () => {
        const scale = Math.min(1, maxDim / Math.max(img.width || 1, img.height || 1));
        const width = Math.max(1, Math.round((img.width || maxDim) * scale));
        const height = Math.max(1, Math.round((img.height || maxDim) * scale));
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);
        const outType = file.type === 'image/png' ? 'image/png' : 'image/jpeg';
        resolve({
          dataUrl: canvas.toDataURL(outType, quality),
          mimeType: outType,
        });
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

function ensureWeekdayDayKeyClient(dayKey) {
  if (!dayKey || !/^\d{4}-\d{2}-\d{2}$/.test(String(dayKey))) return dayKey;
  const [y, m, d] = String(dayKey).split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d, 12));
  const dow = date.getUTCDay();
  if (dow === 6) {
    date.setUTCDate(date.getUTCDate() + 2);
    return date.toISOString().slice(0, 10);
  }
  if (dow === 0) {
    date.setUTCDate(date.getUTCDate() + 1);
    return date.toISOString().slice(0, 10);
  }
  return String(dayKey);
}

function isWeekendDayKeyClient(dayKey) {
  if (!dayKey || !/^\d{4}-\d{2}-\d{2}$/.test(String(dayKey))) return false;
  const [y, m, d] = String(dayKey).split('-').map(Number);
  const dow = new Date(Date.UTC(y, m - 1, d, 12)).getUTCDay();
  return dow === 0 || dow === 6;
}

function formatDayBadge(dayKey, todayKey, withConfirmTime = false) {
  if (!dayKey) return 'Upcoming';
  const normalizedDayKey = ensureWeekdayDayKeyClient(dayKey);
  const suffix = withConfirmTime ? ' · 17:00' : '';
  if (normalizedDayKey === todayKey) return `Today${suffix}`;
  try {
    const [y, m, d] = String(normalizedDayKey).split('-').map(Number);
    const label = new Date(Date.UTC(y, m - 1, d, 12)).toLocaleDateString('en-GB', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      timeZone: 'UTC',
    });
    return `${label}${suffix}`;
  } catch {
    return `${normalizedDayKey}${suffix}`;
  }
}

function getLondonCountdownTo1700(scheduledDayKey) {
  try {
    const now = new Date();
    const formatter = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Europe/London',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
    });
    const parts = {};
    formatter.formatToParts(now).forEach((p) => {
      parts[p.type] = p.value;
    });
    const londonDayKey = `${parts.year}-${parts.month}-${parts.day}`;
    const hour = Number(parts.hour || 0);
    const minute = Number(parts.minute || 0);
    const second = Number(parts.second || 0);

    const targetDay = ensureWeekdayDayKeyClient(scheduledDayKey || londonDayKey);

    if (isWeekendDayKeyClient(londonDayKey)) {
      return {
        isDue: false,
        isWeekend: true,
        label: `Weekend Break · Next matchup ${formatDayBadge(targetDay, londonDayKey, true)}`,
      };
    }

    if (londonDayKey > targetDay || (londonDayKey === targetDay && hour >= 17)) {
      return {
        isDue: true,
        isWeekend: false,
        label: 'Result confirming at 17:00…',
      };
    }

    if (londonDayKey === targetDay) {
      const secsLeft = Math.max(0, (17 * 3600) - (hour * 3600 + minute * 60 + second));
      const h = Math.floor(secsLeft / 3600);
      const m = Math.floor((secsLeft % 3600) / 60);
      const timeRemaining = h > 0 ? `${h}h ${m}m` : `${m}m`;
      return {
        isDue: false,
        isWeekend: false,
        label: `Result confirmed today at 17:00 (${timeRemaining} left)`,
      };
    }

    return {
      isDue: false,
      isWeekend: false,
      label: `Result confirmed ${formatDayBadge(targetDay, londonDayKey, false)} at 17:00`,
    };
  } catch {
    return {
      isDue: false,
      isWeekend: false,
      label: 'Result confirmed Mon–Fri at 17:00',
    };
  }
}

function ContenderThumb({ item, label, size = 'md', className = '' }) {
  const name = item?.name || label || 'TBD';
  const imageUrl = item?.imageUrl || '';
  const dims = size === 'xl'
    ? 'w-52 h-52 sm:w-64 sm:h-64 lg:w-72 lg:h-72 rounded-2xl text-4xl'
    : size === 'lg'
      ? 'w-20 h-20 sm:w-24 sm:h-24 rounded-xl text-2xl'
      : size === 'sm'
        ? 'w-12 h-12 rounded-lg text-sm'
        : 'w-16 h-16 rounded-xl text-base';

  if (imageUrl) {
    return (
      <img
        src={imageUrl}
        alt={name}
        className={`${dims} object-cover flex-shrink-0 border border-white/10 bg-[#060e1a] ${className}`}
        loading="lazy"
      />
    );
  }

  const initials = String(name)
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() || '')
    .join('') || '?';

  return (
    <div
      className={`${dims} flex-shrink-0 flex items-center justify-center font-bold bg-gradient-to-br from-indigo-900/60 to-slate-900 border border-indigo-500/30 text-indigo-200 ${className}`}
      title={name}
    >
      {initials}
    </div>
  );
}

function BracketMatchCard({ match, todayKey, isCurrent }) {
  const isTiebreaker = match.status === 'tiebreaker';
  const isCompleted = match.status === 'completed';
  const isOpen = match.status === 'open';
  const isWeekendBreak = Boolean(match.isWeekendBreak);
  const winnerA = isCompleted && match.winnerKey === 'a';
  const winnerB = isCompleted && match.winnerKey === 'b';

  return (
    <div
      className={`rounded-xl border transition-all ${
        isTiebreaker
          ? 'border-amber-400/80 bg-amber-950/25 shadow-[0_0_20px_rgba(251,191,36,0.2)]'
          : isCurrent || isOpen
            ? 'border-indigo-500/80 bg-indigo-950/25 shadow-[0_0_18px_rgba(99,102,241,0.18)]'
            : isCompleted
              ? 'border-[#1f2e4d] bg-[#08101f]'
              : 'border-[#152038] bg-[#060c17]/80 opacity-85'
      }`}
    >
      <div className="px-3 py-1.5 border-b border-white/[0.06] flex items-center justify-between gap-2 text-[10px]">
        <span className="font-mono font-semibold text-slate-400">
          M{match.matchNumber} · {match.shortRound || match.roundName}
        </span>
        {isTiebreaker ? (
          <span className="px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 font-semibold animate-pulse">
            ⚡ SUDDEN DEATH
          </span>
        ) : isOpen ? (
          <span className="px-1.5 py-0.5 rounded bg-indigo-500/25 text-indigo-200 font-semibold">
            {isWeekendBreak ? formatDayBadge(match.scheduledDayKey, todayKey, true) : 'LIVE · 17:00'}
          </span>
        ) : isCompleted ? (
          <span className="text-emerald-400/90 font-medium">
            {match.tiebreaker ? '⚡ Sudden Death' : 'Confirmed 17:00'}
          </span>
        ) : (
          <span className="text-slate-500">{formatDayBadge(match.scheduledDayKey, todayKey, true)}</span>
        )}
      </div>

      <div className="divide-y divide-white/[0.05]">
        {[
          { key: 'a', slot: match.slotA, fallback: match.labelA, votes: match.votesA, isWinner: winnerA },
          { key: 'b', slot: match.slotB, fallback: match.labelB, votes: match.votesB, isWinner: winnerB },
        ].map((row) => (
          <div
            key={row.key}
            className={`px-2.5 py-2 flex items-center justify-between gap-2 ${
              row.isWinner
                ? 'bg-emerald-500/10 text-emerald-100'
                : isCompleted && !row.isWinner
                  ? 'opacity-55 text-slate-400'
                  : 'text-slate-200'
            }`}
          >
            <div className="flex items-center gap-2 min-w-0">
              <ContenderThumb item={row.slot} label={row.fallback} size="sm" />
              <div className="min-w-0">
                <p className={`text-xs truncate ${row.isWinner ? 'font-semibold text-emerald-200' : 'font-medium'}`}>
                  {row.slot?.seed ? (
                    <span className="text-[10px] font-mono text-slate-500 mr-1">#{row.slot.seed}</span>
                  ) : null}
                  {row.slot?.name || row.fallback || 'TBD'}
                </p>
              </div>
            </div>
            {(isCompleted || isOpen || isTiebreaker) ? (
              <span
                className={`text-xs font-mono tabular-nums px-1.5 py-0.5 rounded ${
                  row.isWinner
                    ? 'bg-emerald-500/20 text-emerald-300 font-bold'
                    : 'text-slate-400'
                }`}
              >
                {row.votes ?? 0}
              </span>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
}

export default function PollsPanel({ compact = false }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [worldCup, setWorldCup] = useState(null);
  const [todayKey, setTodayKey] = useState('');
  const [canManage, setCanManage] = useState(false);
  const [activeView, setActiveView] = useState('matchup'); // 'matchup' | 'bracket' | 'table' | 'manage'
  const [voting, setVoting] = useState(false);
  const [actionBusy, setActionBusy] = useState(false);
  const [bannerMessage, setBannerMessage] = useState('');
  const [bracketRoundFilter, setBracketRoundFilter] = useState('all');
  const [tableFilter, setTableFilter] = useState('all'); // 'all' | 'upcoming' | 'completed'
  const [tableRoundFilter, setTableRoundFilter] = useState('all');
  const [confirmCountdown, setConfirmCountdown] = useState(() => getLondonCountdownTo1700(null));
  const autoSyncedMatchRef = useRef('');
  const [revertTargetMatch, setRevertTargetMatch] = useState(1);

  // Manager World Cup creation state
  const [wcTitle, setWcTitle] = useState('World Cup of Biscuits');
  const [wcDescription, setWcDescription] = useState(
    '32 contenders enter the knockout bracket. One head-to-head matchup every day — each match result is confirmed at 17:00 UK time!',
  );
  const [wcItems, setWcItems] = useState(createEmpty32Items);
  const [creatingWc, setCreatingWc] = useState(false);
  const [uploadingSlot, setUploadingSlot] = useState(null);
  const [bulkUploading, setBulkUploading] = useState(false);
  const [showPasteModal, setShowPasteModal] = useState(false);
  const [pasteText, setPasteText] = useState('');
  const [editingContenderSeed, setEditingContenderSeed] = useState(null);
  const [editContenderName, setEditContenderName] = useState('');
  const [editContenderImage, setEditContenderImage] = useState('');
  const bulkInputRef = useRef(null);

  const load = async () => {
    const response = await fetch('/api/getPolls', { credentials: 'include' });
    const payload = (await readJsonResponse(response)) || {};
    if (!response.ok) throw new Error(payload.error || 'Failed to load World Cup.');
    setWorldCup(payload.worldCup || null);
    if (payload.worldCup?.activeMatch?.matchNumber) {
      setRevertTargetMatch(Math.max(1, Number(payload.worldCup.activeMatch.matchNumber) - 1));
    }
    setCanManage(Boolean(payload.canManage));
    if (payload.todayKey) setTodayKey(payload.todayKey);
    if (!payload.worldCup && payload.canManage && !compact) {
      setActiveView('manage');
    }
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        await load();
      } catch (err) {
        if (!cancelled) setError(err.message || 'Failed to load World Cup.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Update countdown to 17:00 UK time & auto-confirm match when 17:00 arrives
  useEffect(() => {
    const active = worldCup?.activeMatch;
    if (!active || active.status !== 'open') {
      setConfirmCountdown(getLondonCountdownTo1700(active?.scheduledDayKey || todayKey));
      return undefined;
    }
    const tick = () => {
      const next = getLondonCountdownTo1700(active.scheduledDayKey || todayKey);
      setConfirmCountdown(next);
      const matchSyncKey = `${worldCup?.id}_${active.matchNumber}_${active.scheduledDayKey}`;
      if (next.isDue && autoSyncedMatchRef.current !== matchSyncKey) {
        autoSyncedMatchRef.current = matchSyncKey;
        load().catch(() => {});
      }
    };
    tick();
    const timer = setInterval(tick, 15000);
    return () => clearInterval(timer);
  }, [worldCup?.id, worldCup?.activeMatch?.matchNumber, worldCup?.activeMatch?.status, worldCup?.activeMatch?.scheduledDayKey, todayKey]);

  const uploadSingleFileForSlot = async (file) => {
    const compressed = await compressImageFileToDataUrl(file, 640, 0.88);
    const response = await fetch('/api/createPoll', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'upload_world_cup_image',
        imageBase64: compressed.dataUrl,
        mimeType: compressed.mimeType,
        fileName: file.name,
      }),
    });
    const payload = (await readJsonResponse(response)) || {};
    if (!response.ok) throw new Error(payload.error || 'Failed to upload image.');
    return payload.imageUrl || compressed.dataUrl;
  };

  const handleSlotFileSelect = async (index, file) => {
    if (!file) return;
    setUploadingSlot(index);
    setError('');
    try {
      const imageUrl = await uploadSingleFileForSlot(file);
      const suggestedName = cleanFileNameToTitle(file.name);
      setWcItems((prev) => prev.map((item, idx) => {
        if (idx !== index) return item;
        return {
          ...item,
          name: item.name.trim() ? item.name : suggestedName,
          imageUrl,
        };
      }));
    } catch (err) {
      setError(err.message || 'Image upload failed.');
    } finally {
      setUploadingSlot(null);
    }
  };

  const handleBulkFilesSelect = async (fileList) => {
    const files = Array.from(fileList || []).slice(0, 32);
    if (!files.length) return;
    setBulkUploading(true);
    setError('');
    setBannerMessage('');
    try {
      const nextItems = [...wcItems];
      // Find empty slots first, or overwrite from slot 0
      let cursor = nextItems.findIndex((it) => !it.name.trim() && !it.imageUrl);
      if (cursor === -1) cursor = 0;

      for (let i = 0; i < files.length; i += 1) {
        const targetIdx = (cursor + i) % 32;
        setUploadingSlot(targetIdx);
        const file = files[i];
        const imageUrl = await uploadSingleFileForSlot(file);
        const suggestedName = cleanFileNameToTitle(file.name);
        nextItems[targetIdx] = {
          ...nextItems[targetIdx],
          name: nextItems[targetIdx].name.trim() || suggestedName,
          imageUrl,
        };
        setWcItems([...nextItems]);
      }
      setBannerMessage(`Uploaded ${files.length} contender image${files.length === 1 ? '' : 's'}.`);
    } catch (err) {
      setError(err.message || 'Bulk image upload failed.');
    } finally {
      setUploadingSlot(null);
      setBulkUploading(false);
    }
  };

  const applyBiscuitPreset = () => {
    setWcTitle('World Cup of Biscuits');
    setWcDescription(
      '32 iconic biscuits go head-to-head! Vote each day to crown Country Lion’s ultimate champion biscuit. If a matchup finishes tied, Sudden Death is announced and the very next vote wins!',
    );
    setWcItems(
      BISCUIT_PRESET_32.map((b, idx) => ({
        seed: idx + 1,
        name: b.name,
        imageUrl: makeContenderSvgDataUrl(b.name, b.bg, b.accent, b.emoji),
      })),
    );
    setBannerMessage('Loaded 32 classic biscuits! You can swap any name or upload custom photos before launching.');
  };

  const shuffleContenders = () => {
    setWcItems((prev) => {
      const copy = [...prev];
      for (let i = copy.length - 1; i > 0; i -= 1) {
        const j = Math.floor(Math.random() * (i + 1));
        const temp = copy[i];
        copy[i] = copy[j];
        copy[j] = temp;
      }
      return copy.map((item, idx) => ({ ...item, seed: idx + 1 }));
    });
    setBannerMessage('Matchup seeds shuffled randomly!');
  };

  const applyPastedNames = () => {
    const lines = String(pasteText || '')
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean)
      .slice(0, 32);
    if (!lines.length) return;
    setWcItems((prev) => prev.map((item, idx) => {
      const nextName = lines[idx] || item.name;
      return {
        ...item,
        name: nextName,
        imageUrl: item.imageUrl || (nextName ? makeContenderSvgDataUrl(nextName) : ''),
      };
    }));
    setShowPasteModal(false);
    setPasteText('');
    setBannerMessage(`Filled ${lines.length} contender names.`);
  };

  const handleCreateWorldCup = async (e) => {
    e.preventDefault();
    setCreatingWc(true);
    setError('');
    setBannerMessage('');
    try {
      const preparedItems = wcItems.map((it, idx) => {
        const name = it.name.trim() || `Contender #${idx + 1}`;
        return {
          seed: idx + 1,
          name,
          imageUrl: it.imageUrl || makeContenderSvgDataUrl(name),
        };
      });
      const response = await fetch('/api/createPoll', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: 'world_cup',
          title: wcTitle.trim(),
          description: wcDescription.trim(),
          items: preparedItems,
        }),
      });
      const payload = (await readJsonResponse(response)) || {};
      if (!response.ok) throw new Error(payload.error || 'Failed to launch World Cup.');
      setWorldCup(payload.worldCup || null);
      setActiveView('matchup');
      setBannerMessage('🏆 World Cup launched! Match 1 is now open for voting.');
    } catch (err) {
      setError(err.message || 'Failed to launch World Cup.');
    } finally {
      setCreatingWc(false);
    }
  };

  const handleVote = async (optionKey) => {
    if (!worldCup?.id || !worldCup?.activeMatch || voting) return;
    setVoting(true);
    setError('');
    setBannerMessage('');
    try {
      const response = await fetch('/api/submitPollVote', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          worldCupId: worldCup.id,
          matchNumber: worldCup.activeMatch.matchNumber,
          optionKey,
        }),
      });
      const payload = (await readJsonResponse(response)) || {};
      if (!response.ok) throw new Error(payload.error || 'Failed to submit vote.');
      if (payload.worldCup) {
        setWorldCup(payload.worldCup);
      } else {
        await load();
      }
      if (payload.tiebreakerResolved && payload.lastResolvedMatch?.winner?.name) {
        setBannerMessage(
          `⚡ SUDDEN DEATH WINNER! Your golden vote sent ${payload.lastResolvedMatch.winner.name} through to the next round!`,
        );
      }
    } catch (err) {
      setError(err.message || 'Failed to submit vote.');
      await load().catch(() => {});
    } finally {
      setVoting(false);
    }
  };

  const handleManagerAction = async (action, extraBody = {}) => {
    if (!worldCup?.id || actionBusy) return;
    setActionBusy(true);
    setError('');
    setBannerMessage('');
    try {
      const response = await fetch('/api/closePoll', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          worldCupId: worldCup.id,
          action,
          ...extraBody,
        }),
      });
      const payload = (await readJsonResponse(response)) || {};
      if (!response.ok) throw new Error(payload.error || 'Failed to update tournament.');
      setWorldCup(payload.worldCup || null);
      if (action === 'advance_match') {
        if (payload.worldCup?.activeMatch?.status === 'tiebreaker') {
          setBannerMessage('⚡ Match ended in a tie! Sudden Death Tie-Breaker is now live — everyone gets another vote and the next vote wins!');
        } else {
          setBannerMessage('Match concluded and bracket updated!');
        }
      } else if (action === 'force_tiebreaker') {
        setBannerMessage('⚡ Sudden Death Tie-Breaker announced! Everyone gets another vote and the first additional vote wins.');
      } else if (action === 'revert_step' || action === 'revert_match') {
        setBannerMessage(`Tournament successfully reverted back to Match #${payload.worldCup?.activeMatch?.matchNumber || ''}!`);
      }
      if (payload.worldCup?.activeMatch?.matchNumber) {
        setRevertTargetMatch(Math.max(1, Number(payload.worldCup.activeMatch.matchNumber) - 1));
      }
    } catch (err) {
      setError(err.message || 'Failed to run manager action.');
    } finally {
      setActionBusy(false);
    }
  };

  const handleSaveContenderEdit = async (e) => {
    e.preventDefault();
    if (!worldCup?.id || !editingContenderSeed) return;
    setActionBusy(true);
    setError('');
    try {
      const response = await fetch('/api/createPoll', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'update_world_cup_item',
          worldCupId: worldCup.id,
          seed: editingContenderSeed,
          name: editContenderName.trim(),
          imageUrl: editContenderImage,
        }),
      });
      const payload = (await readJsonResponse(response)) || {};
      if (!response.ok) throw new Error(payload.error || 'Failed to update contender.');
      setWorldCup(payload.worldCup || null);
      setEditingContenderSeed(null);
      setBannerMessage('Contender updated.');
    } catch (err) {
      setError(err.message || 'Failed to update contender.');
    } finally {
      setActionBusy(false);
    }
  };

  const matches = useMemo(() => worldCup?.matches || [], [worldCup]);
  const completedCount = useMemo(
    () => matches.filter((m) => m.status === 'completed').length,
    [matches],
  );

  const matchesByRound = useMemo(() => {
    const map = { 1: [], 2: [], 3: [], 4: [], 5: [] };
    matches.forEach((m) => {
      if (map[m.round]) map[m.round].push(m);
    });
    return map;
  }, [matches]);

  const filteredTableMatches = useMemo(() => {
    return matches.filter((m) => {
      if (tableRoundFilter !== 'all' && Number(m.round) !== Number(tableRoundFilter)) {
        return false;
      }
      if (tableFilter === 'upcoming') {
        return m.status === 'upcoming' || m.status === 'open' || m.status === 'tiebreaker';
      }
      if (tableFilter === 'completed') {
        return m.status === 'completed';
      }
      return true;
    });
  }, [matches, tableFilter, tableRoundFilter]);

  if (loading) {
    return <p className="text-sm text-slate-500">Loading World Cup…</p>;
  }

  const activeMatch = worldCup?.activeMatch || null;
  const isTiebreaker = activeMatch?.status === 'tiebreaker';
  const isWeekendBreak = Boolean(!isTiebreaker && (worldCup?.isWeekendBreak || activeMatch?.isWeekendBreak));
  const lastResolved = worldCup?.lastResolvedMatch || null;

  return (
    <div className={`space-y-6 ${compact ? 'max-w-none' : 'max-w-6xl'}`}>
      {/* Top World Cup Header */}
      {worldCup ? (
        <div className="bg-gradient-to-br from-[#0f172a] via-[#0b1220] to-[#131c33] border border-indigo-500/30 rounded-2xl p-5 shadow-lg space-y-4">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="space-y-1">
              <div className="inline-flex flex-wrap items-center gap-2 px-2.5 py-1 rounded-full bg-amber-500/15 border border-amber-400/30 text-amber-300 text-[11px] font-semibold uppercase tracking-wider">
                <span>🏆 Knockout World Cup</span>
                <span>·</span>
                <span>{completedCount}/31 Matches Decided</span>
                <span>·</span>
                <span>⏰ Mon–Fri · Results Confirmed at 17:00</span>
              </div>
              <h2 className="text-xl sm:text-2xl font-bold text-white tracking-tight">
                {worldCup.title}
              </h2>
              {worldCup.description ? (
                <p className="text-xs sm:text-sm text-slate-300 max-w-3xl">{worldCup.description}</p>
              ) : null}
            </div>

            {/* Navigation Tabs */}
            <div className="flex flex-wrap items-center gap-1.5 bg-[#060e1a]/90 p-1.5 rounded-xl border border-[#1a2540]">
              <button
                type="button"
                onClick={() => setActiveView('matchup')}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                  activeView === 'matchup'
                    ? 'bg-indigo-600 text-white'
                    : 'text-slate-300 hover:text-white hover:bg-white/[0.04]'
                }`}
              >
                {isTiebreaker ? '⚡ Tie-Breaker Poll' : isWeekendBreak ? '⏸️ Monday’s Poll' : '🔥 Today’s Poll'}
              </button>
              <button
                type="button"
                onClick={() => setActiveView('bracket')}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                  activeView === 'bracket'
                    ? 'bg-indigo-600 text-white'
                    : 'text-slate-300 hover:text-white hover:bg-white/[0.04]'
                }`}
              >
                🏆 Results Bracket
              </button>
              <button
                type="button"
                onClick={() => setActiveView('table')}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                  activeView === 'table'
                    ? 'bg-indigo-600 text-white'
                    : 'text-slate-300 hover:text-white hover:bg-white/[0.04]'
                }`}
              >
                📅 Matchups Table
              </button>
              {canManage && !compact ? (
                <button
                  type="button"
                  onClick={() => setActiveView('manage')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                    activeView === 'manage'
                      ? 'bg-amber-600 text-white'
                      : 'text-amber-300 hover:bg-amber-500/10'
                  }`}
                >
                  ⚙️ Manage / New
                </button>
              ) : null}
            </div>
          </div>

          {/* Progress Bar */}
          <div className="space-y-1">
            <div className="h-2 w-full rounded-full bg-[#060e1a] overflow-hidden border border-[#1a2540]">
              <div
                className="h-full bg-gradient-to-r from-indigo-500 via-cyan-400 to-emerald-400 transition-all duration-500"
                style={{ width: `${Math.min(100, Math.round((completedCount / 31) * 100))}%` }}
              />
            </div>
            <div className="flex justify-between text-[11px] text-slate-400">
              <span>Round of 32</span>
              <span>Round of 16</span>
              <span>Quarter-Finals</span>
              <span>Semi-Finals</span>
              <span>Grand Final</span>
            </div>
          </div>
        </div>
      ) : (
        <div className="bg-[#0b1220] border border-[#1a2540] rounded-xl p-6 text-center space-y-2">
          <p className="text-lg font-semibold text-white">No World Cup tournament is active yet</p>
          <p className="text-xs text-slate-400">
            {canManage
              ? 'Use the setup form below to upload 32 contenders and kick off Day 1 of the World Cup!'
              : 'Check back soon — a new 32-contender knockout World Cup will be starting shortly.'}
          </p>
        </div>
      )}

      {bannerMessage ? (
        <div className="rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200 flex items-center justify-between gap-3">
          <span>{bannerMessage}</span>
          <button
            type="button"
            onClick={() => setBannerMessage('')}
            className="text-xs text-emerald-300/70 hover:text-emerald-100"
          >
            Dismiss
          </button>
        </div>
      ) : null}

      {error ? (
        <div className="rounded-xl border border-rose-500/40 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
          {error}
        </div>
      ) : null}

      {/* Champion Showcase when tournament is completed */}
      {worldCup?.status === 'completed' && worldCup?.champion ? (
        <div className="rounded-2xl border-2 border-amber-400/60 bg-gradient-to-b from-amber-500/20 via-[#0b1220] to-[#0b1220] p-6 text-center space-y-4 shadow-[0_0_40px_rgba(251,191,36,0.15)]">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-400/20 border border-amber-300/40 text-amber-200 text-xs font-bold uppercase tracking-widest">
            👑 Tournament Champion
          </div>
          <div className="flex justify-center">
            <ContenderThumb item={worldCup.champion} size="xl" />
          </div>
          <div>
            <h3 className="text-2xl sm:text-3xl font-extrabold text-amber-200">
              {worldCup.champion.name}
            </h3>
            <p className="text-xs text-slate-300 mt-1">
              Seed #{worldCup.champion.seed} · Winner of the {worldCup.title}!
            </p>
          </div>
        </div>
      ) : null}

      {/* VIEW 1: TODAY'S MATCHUP / SUDDEN DEATH POLL */}
      {worldCup && activeView === 'matchup' && (
        <div className="space-y-5">
          {/* Previous Match / Sudden Death Resolution Notice */}
          {lastResolved && (
            <div className="rounded-xl border border-[#1e2d4d] bg-[#081121] px-4 py-3 flex flex-wrap items-center justify-between gap-3 text-xs">
              <div className="flex items-center gap-2.5">
                <ContenderThumb item={lastResolved.winner} size="sm" />
                <span className="text-slate-300">
                  <strong className="text-emerald-300">Previous Result (M{lastResolved.matchNumber} · {lastResolved.roundName}):</strong>{' '}
                  <span className="font-semibold text-white">{lastResolved.winner?.name}</span> defeated{' '}
                  {lastResolved.winnerKey === 'a' ? lastResolved.slotB?.name : lastResolved.slotA?.name}{' '}
                  ({lastResolved.votesA}–{lastResolved.votesB})
                  {lastResolved.tiebreaker && lastResolved.tiebreakerVotedBy?.fullName
                    ? ` · ⚡ Won in Sudden Death by ${lastResolved.tiebreakerVotedBy.fullName}’s golden vote!`
                    : '!'}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setActiveView('bracket')}
                className="text-indigo-300 hover:text-indigo-200 font-medium"
              >
                View bracket →
              </button>
            </div>
          )}

          {activeMatch ? (
            <div className="bg-[#0b1220] border border-[#1a2540] rounded-2xl overflow-visible shadow-xl">
              {/* Sudden Death Tie-Breaker Announcement Banner */}
              {isTiebreaker ? (
                <div className="px-5 py-4 bg-gradient-to-r from-amber-600/30 via-rose-600/30 to-amber-600/30 border-b border-amber-400/50 space-y-1">
                  <div className="flex items-center gap-2 text-amber-200 font-extrabold text-sm sm:text-base uppercase tracking-wide">
                    <span className="animate-bounce">⚡</span>
                    <span>Tie Announcement — Sudden Death Overtime!</span>
                  </div>
                  <p className="text-xs sm:text-sm text-amber-100/95 leading-relaxed">
                    <strong>{activeMatch.slotA?.name}</strong> and <strong>{activeMatch.slotB?.name}</strong> finished tied at 17:00 at{' '}
                    <strong>{activeMatch.tiebreakerTiedScore ?? activeMatch.votesA}–{activeMatch.tiebreakerTiedScore ?? activeMatch.votesB}</strong>!
                    Everyone gets another vote — <strong>the first contender to receive an additional vote wins immediately</strong> and advances to the next round!
                  </p>
                </div>
              ) : isWeekendBreak ? (
                <div className="px-5 py-4 bg-gradient-to-r from-indigo-900/40 via-slate-900/60 to-indigo-900/40 border-b border-indigo-400/30 space-y-1">
                  <div className="flex items-center gap-2 text-indigo-200 font-bold text-sm uppercase tracking-wide">
                    <span>⏸️</span>
                    <span>Weekend Break — Matchups Run Monday to Friday</span>
                  </div>
                  <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">
                    No World Cup matchups take place on Saturdays or Sundays. Voting for{' '}
                    <strong>{activeMatch.slotA?.name} vs {activeMatch.slotB?.name}</strong> opens on Monday and will be confirmed at <strong>17:00</strong>!
                  </p>
                </div>
              ) : null}

              {/* Match Header */}
              <div className="px-5 py-4 border-b border-[#1a2540] bg-[#060e1a]/60 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="px-2.5 py-0.5 rounded-md bg-indigo-500/20 border border-indigo-400/30 text-indigo-200 text-xs font-semibold">
                      {activeMatch.roundName}
                    </span>
                    <span className="text-xs font-mono text-slate-400">
                      Match #{activeMatch.matchNumber} of 31
                    </span>
                    {!isTiebreaker ? (
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md bg-cyan-500/15 border border-cyan-400/30 text-cyan-200 text-xs font-medium">
                        ⏰ {confirmCountdown.label}
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md bg-amber-500/20 border border-amber-400/40 text-amber-200 text-xs font-semibold">
                        ⚡ 17:00 Tie-Breaker · Next Vote Wins
                      </span>
                    )}
                  </div>
                  <h3 className="text-lg font-bold text-white mt-1">
                    {activeMatch.slotA?.name} <span className="text-indigo-400 font-normal">vs</span> {activeMatch.slotB?.name}
                  </h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    {isTiebreaker
                      ? 'Sudden Death: Cast the deciding vote right now!'
                      : isWeekendBreak
                        ? `Up next on Monday · Result confirmed at 17:00 · Winner advances to ${activeMatch.nextMatchNumber ? `Match #${activeMatch.nextMatchNumber}` : 'the Championship'}`
                        : activeMatch.myVote
                          ? `You voted for “${activeMatch.myVote.optionLabel}” · Match result confirmed at 17:00 · Winner advances to Match #${activeMatch.nextMatchNumber || 'Champion'}`
                          : `Tap either contender below to cast today’s vote · Match result confirmed at 17:00 · Winner advances to ${activeMatch.nextMatchNumber ? `Match #${activeMatch.nextMatchNumber}` : 'the Championship'}`}
                  </p>
                </div>

                {worldCup?.isOwner && (
                  <div className="flex flex-wrap items-center gap-2">
                    {Number(activeMatch.matchNumber) > 1 && (
                      <button
                        type="button"
                        disabled={actionBusy}
                        onClick={() => {
                          const prevNum = Number(activeMatch.matchNumber) - 1;
                          if (window.confirm(`Revert tournament back to Match #${prevNum}?`)) {
                            handleManagerAction('revert_step', { targetMatchNumber: prevNum });
                          }
                        }}
                        className="px-2.5 py-1.5 rounded-lg text-xs font-semibold border border-rose-500/50 bg-rose-500/15 text-rose-200 hover:bg-rose-500/25 disabled:opacity-50"
                        title={`Revert tournament back 1 step to Match #${Number(activeMatch.matchNumber) - 1}`}
                      >
                        {actionBusy ? 'Reverting…' : `↩ Revert to M${Number(activeMatch.matchNumber) - 1}`}
                      </button>
                    )}
                    {Number(activeMatch.matchNumber) > 2 && (
                      <div className="flex items-center gap-1">
                        <select
                          value={revertTargetMatch}
                          onChange={(e) => setRevertTargetMatch(Number(e.target.value))}
                          className="bg-[#060e1a] border border-[#1a2540] text-slate-200 text-xs rounded-lg px-2 py-1.5"
                          title="Select match to jump back to"
                        >
                          {matches.slice(0, Math.max(1, Number(activeMatch.matchNumber) - 1)).map((m) => (
                            <option key={m.matchNumber} value={m.matchNumber}>
                              M{m.matchNumber}: {m.slotA?.name || 'A'} vs {m.slotB?.name || 'B'}
                            </option>
                          ))}
                        </select>
                        <button
                          type="button"
                          disabled={actionBusy}
                          onClick={() => {
                            if (window.confirm(`Revert tournament back to Match #${revertTargetMatch}?`)) {
                              handleManagerAction('revert_match', { targetMatchNumber: revertTargetMatch });
                            }
                          }}
                          className="px-2.5 py-1.5 rounded-lg text-xs font-medium border border-slate-700 bg-slate-800 text-slate-200 hover:bg-slate-700 disabled:opacity-50"
                        >
                          Jump
                        </button>
                      </div>
                    )}
                    {!isTiebreaker && (
                      <button
                        type="button"
                        disabled={actionBusy}
                        onClick={() => handleManagerAction('force_tiebreaker')}
                        className="px-2.5 py-1.5 rounded-lg text-xs font-medium border border-amber-500/40 bg-amber-500/10 text-amber-200 hover:bg-amber-500/20 disabled:opacity-50"
                        title="Announce a tie-breaker"
                      >
                        ⚡ Tie-Breaker
                      </button>
                    )}
                    <button
                      type="button"
                      disabled={actionBusy}
                      onClick={() => handleManagerAction('advance_match')}
                      className="px-2.5 py-1.5 rounded-lg text-xs font-medium border border-indigo-500/40 bg-indigo-500/15 text-indigo-200 hover:bg-indigo-500/25 disabled:opacity-50"
                      title="Conclude this match now"
                    >
                      {actionBusy ? 'Updating…' : 'Conclude Early →'}
                    </button>
                  </div>
                )}
              </div>

              {/* Head-to-Head Contender Cards */}
              <div className="p-5 space-y-6 overflow-visible">
                <div className="grid grid-cols-1 md:grid-cols-[1fr_auto_1fr] gap-4 items-stretch">
                  {['a', 'b'].map((key, idx) => {
                    const slot = key === 'a' ? activeMatch.slotA : activeMatch.slotB;
                    const option = (activeMatch.results?.options || []).find((o) => o.key === key) || {
                      key,
                      label: slot?.name || (key === 'a' ? 'Option A' : 'Option B'),
                      votes: 0,
                      percent: 0,
                      voters: [],
                    };
                    const isSelected = activeMatch.myVote?.optionKey === key;
                    const accentRing = key === 'a'
                      ? isSelected
                        ? 'border-indigo-400 bg-indigo-500/15 ring-2 ring-indigo-500/30'
                        : 'border-[#1a2540] bg-[#060e1a] hover:border-indigo-500/50'
                      : isSelected
                        ? 'border-cyan-400 bg-cyan-500/15 ring-2 ring-cyan-500/30'
                        : 'border-[#1a2540] bg-[#060e1a] hover:border-cyan-500/50';

                    return (
                      <div key={key} className="contents">
                        <VotersHover
                          label={option.label}
                          voters={option.voters || []}
                          votes={option.votes || 0}
                          className="w-full h-full"
                        >
                          <button
                            type="button"
                            disabled={voting || isWeekendBreak}
                            onClick={() => handleVote(key)}
                            className={`w-full h-full rounded-2xl border p-5 flex flex-col items-center text-center justify-between gap-4 transition-all group ${accentRing} ${
                              isTiebreaker ? 'hover:scale-[1.01] hover:border-amber-400/70' : ''
                            } ${isWeekendBreak ? 'opacity-80 cursor-not-allowed' : ''}`}
                          >
                            <div className="w-full flex items-center justify-between text-xs">
                              <span className="px-2 py-0.5 rounded bg-white/[0.06] font-mono text-slate-300">
                                Seed #{slot?.seed || (idx + 1)}
                              </span>
                              {isSelected && !isTiebreaker ? (
                                <span className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 font-semibold">
                                  ✓ Your Vote
                                </span>
                              ) : isTiebreaker && activeMatch.myRegularVote?.optionKey === key ? (
                                <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-400 text-[11px]">
                                  Regular vote
                                </span>
                              ) : null}
                            </div>

                            <ContenderThumb item={slot} size="xl" className="shadow-lg group-hover:scale-105 transition-transform" />

                            <div className="space-y-1 w-full">
                              <h4 className="text-lg sm:text-xl font-bold text-white">
                                {slot?.name || option.label}
                              </h4>
                              <p className="text-xs text-slate-400 font-mono">
                                {option.votes} vote{option.votes === 1 ? '' : 's'} ({option.percent || 0}%)
                              </p>
                            </div>

                            {/* Progress Bar */}
                            <div className="w-full h-2.5 rounded-full bg-[#0b1220] overflow-hidden border border-white/[0.06]">
                              <div
                                className={`h-full transition-all duration-300 ${
                                  key === 'a' ? 'bg-indigo-500' : 'bg-cyan-400'
                                }`}
                                style={{ width: `${option.percent || 0}%` }}
                              />
                            </div>

                            <span
                              className={`w-full py-2.5 px-4 rounded-xl text-xs sm:text-sm font-bold transition-colors ${
                                isTiebreaker
                                  ? 'bg-gradient-to-r from-amber-500 to-rose-500 text-slate-950 shadow-md'
                                  : isWeekendBreak
                                    ? 'bg-slate-800 text-slate-400'
                                    : isSelected
                                      ? key === 'a'
                                        ? 'bg-indigo-600 text-white'
                                        : 'bg-cyan-600 text-white'
                                      : 'bg-white/[0.07] text-slate-100 group-hover:bg-indigo-600 group-hover:text-white'
                              }`}
                            >
                              {voting
                                ? 'Submitting…'
                                : isTiebreaker
                                  ? `⚡ Cast Winning Tie-Breaker Vote for ${slot?.name}`
                                  : isWeekendBreak
                                    ? '⏸️ Voting Opens Monday'
                                    : isSelected
                                      ? `Voted for ${slot?.name}`
                                      : `Vote for ${slot?.name}`}
                            </span>
                          </button>
                        </VotersHover>

                        {idx === 0 && (
                          <div className="flex items-center justify-center py-2 md:py-0">
                            <div className="w-11 h-11 rounded-full bg-[#060e1a] border border-indigo-500/40 flex items-center justify-center text-xs font-black tracking-tighter text-indigo-300 shadow-inner">
                              VS
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* Live Pie Chart Breakdown */}
                {activeMatch.results && (
                  <div className="pt-4 border-t border-[#1a2540] overflow-visible">
                    <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                      <p className="text-xs uppercase tracking-wider text-slate-400 font-semibold">
                        Live Matchup Tally · {activeMatch.results.totalVotes} total vote{activeMatch.results.totalVotes === 1 ? '' : 's'}
                      </p>
                      <div className="flex items-center gap-3 text-xs">
                        <button
                          type="button"
                          onClick={() => setActiveView('bracket')}
                          className="text-indigo-300 hover:text-indigo-200"
                        >
                          Open Full Bracket →
                        </button>
                        <button
                          type="button"
                          onClick={() => setActiveView('table')}
                          className="text-cyan-300 hover:text-cyan-200"
                        >
                          See Future Matchups →
                        </button>
                      </div>
                    </div>
                    <PollPieChart options={activeMatch.results.options || []} />
                  </div>
                )}
              </div>
            </div>
          ) : null}
        </div>
      )}

      {/* VIEW 2: KNOCKOUT RESULTS BRACKET */}
      {worldCup && activeView === 'bracket' && (
        <div className="bg-[#0b1220] border border-[#1a2540] rounded-2xl p-5 space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-base sm:text-lg font-bold text-white">
                Knockout Tournament Bracket
              </h3>
              <p className="text-xs text-slate-400">
                Track every contender’s path from the Round of 32 to the Grand Final.
              </p>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {[
                { key: 'all', label: 'All Rounds' },
                { key: '1', label: 'R32 (16)' },
                { key: '2', label: 'R16 (8)' },
                { key: '3', label: 'Quarter-Finals (4)' },
                { key: '4', label: 'Semi-Finals (2)' },
                { key: '5', label: 'Final (1)' },
              ].map((tab) => (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => setBracketRoundFilter(tab.key)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-medium border transition-colors ${
                    bracketRoundFilter === tab.key
                      ? 'border-indigo-500/60 bg-indigo-500/20 text-indigo-200'
                      : 'border-[#1a2540] bg-[#060e1a] text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          <div className="overflow-x-auto pb-2">
            <div
              className={`grid gap-4 ${
                bracketRoundFilter === 'all'
                  ? 'min-w-[1080px] grid-cols-5'
                  : 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3'
              }`}
            >
              {[
                { round: 1, title: 'Round of 32', subtitle: 'Matches 1–16' },
                { round: 2, title: 'Round of 16', subtitle: 'Matches 17–24' },
                { round: 3, title: 'Quarter-Finals', subtitle: 'Matches 25–28' },
                { round: 4, title: 'Semi-Finals', subtitle: 'Matches 29–30' },
                { round: 5, title: 'Grand Final', subtitle: 'Match 31' },
              ]
                .filter((col) => bracketRoundFilter === 'all' || Number(bracketRoundFilter) === col.round)
                .map((col) => (
                  <div key={col.round} className="space-y-3">
                    <div className="px-3 py-2 rounded-lg bg-[#060e1a] border border-[#1a2540]">
                      <p className="text-xs font-bold uppercase tracking-wider text-indigo-300">
                        {col.title}
                      </p>
                      <p className="text-[11px] text-slate-500">{col.subtitle}</p>
                    </div>
                    <div className="space-y-2.5">
                      {(matchesByRound[col.round] || []).map((m) => (
                        <BracketMatchCard
                          key={m.matchNumber}
                          match={m}
                          todayKey={todayKey}
                          isCurrent={Number(m.matchNumber) === Number(worldCup.currentMatchNumber)}
                        />
                      ))}
                    </div>
                  </div>
                ))}
            </div>
          </div>
        </div>
      )}

      {/* VIEW 3: FUTURE MATCHUPS & RESULTS TABLE */}
      {worldCup && activeView === 'table' && (
        <div className="bg-[#0b1220] border border-[#1a2540] rounded-2xl overflow-hidden">
          <div className="p-5 border-b border-[#1a2540] flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-base sm:text-lg font-bold text-white">
                Tournament Schedule, Future Matchups & Results
              </h3>
              <p className="text-xs text-slate-400">
                See upcoming daily polls, who plays who next, and past knockout scores.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <div className="flex rounded-lg bg-[#060e1a] p-1 border border-[#1a2540]">
                {[
                  { id: 'all', label: 'All (31)' },
                  { id: 'upcoming', label: 'Live & Future Matchups' },
                  { id: 'completed', label: `Results (${completedCount})` },
                ].map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => setTableFilter(f.id)}
                    className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
                      tableFilter === f.id
                        ? 'bg-indigo-600 text-white'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    {f.label}
                  </button>
                ))}
              </div>

              <select
                value={tableRoundFilter}
                onChange={(e) => setTableRoundFilter(e.target.value)}
                className="bg-[#060e1a] border border-[#1a2540] text-slate-200 text-xs rounded-lg px-2.5 py-1.5"
              >
                <option value="all">All Rounds</option>
                <option value="1">Round of 32</option>
                <option value="2">Round of 16</option>
                <option value="3">Quarter-Finals</option>
                <option value="4">Semi-Finals</option>
                <option value="5">Grand Final</option>
              </select>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-[#1a2540] bg-[#060e1a]/70 text-[11px] uppercase tracking-wider text-slate-400">
                  <th className="py-3 px-4">Match</th>
                  <th className="py-3 px-4">Round</th>
                  <th className="py-3 px-4">Date / Status</th>
                  <th className="py-3 px-4">Contender A</th>
                  <th className="py-3 px-4 text-center">Score / VS</th>
                  <th className="py-3 px-4">Contender B</th>
                  <th className="py-3 px-4">Progression / Winner</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#1a2540]">
                {filteredTableMatches.map((m) => {
                  const isLive = m.status === 'open';
                  const isTb = m.status === 'tiebreaker';
                  const isDone = m.status === 'completed';
                  return (
                    <tr
                      key={m.matchNumber}
                      className={
                        isTb
                          ? 'bg-amber-500/10'
                          : isLive
                            ? 'bg-indigo-500/10'
                            : 'hover:bg-white/[0.02]'
                      }
                    >
                      <td className="py-3 px-4 font-mono font-bold text-slate-300">
                        M{m.matchNumber}
                      </td>
                      <td className="py-3 px-4 text-slate-300 font-medium">
                        {m.roundName}
                      </td>
                      <td className="py-3 px-4">
                        {isTb ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-amber-500/20 border border-amber-400/40 text-amber-200 font-semibold">
                            ⚡ Tie-Breaker Live
                          </span>
                        ) : isLive ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-indigo-500/25 border border-indigo-400/40 text-indigo-200 font-semibold">
                            {m.isWeekendBreak
                              ? `⏸️ Opens ${formatDayBadge(m.scheduledDayKey, todayKey, true)}`
                              : `🔥 Live · Confirms ${formatDayBadge(m.scheduledDayKey, todayKey, true)}`}
                          </span>
                        ) : isDone ? (
                          <span className="text-slate-400">
                            Confirmed · {formatDayBadge(m.dayKey, todayKey, true)}
                          </span>
                        ) : (
                          <span className="text-slate-400">
                            {formatDayBadge(m.scheduledDayKey, todayKey, true)}
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-3">
                          <ContenderThumb item={m.slotA} label={m.labelA} size="md" />
                          <span className={isDone && m.winnerKey === 'a' ? 'font-bold text-emerald-300 text-sm' : 'text-slate-200 text-sm'}>
                            {m.slotA?.seed ? <span className="text-slate-500 font-mono mr-1">#{m.slotA.seed}</span> : null}
                            {m.slotA?.name || m.labelA}
                          </span>
                        </div>
                      </td>
                      <td className="py-3 px-4 text-center font-mono">
                        {isDone || isLive || isTb ? (
                          <span className="px-2.5 py-1 rounded bg-[#060e1a] border border-[#1a2540] text-slate-200 font-bold text-sm">
                            {m.votesA ?? 0} – {m.votesB ?? 0}
                            {m.tiebreaker ? ' ⚡' : ''}
                          </span>
                        ) : (
                          <span className="text-slate-500">vs</span>
                        )}
                      </td>
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-3">
                          <ContenderThumb item={m.slotB} label={m.labelB} size="md" />
                          <span className={isDone && m.winnerKey === 'b' ? 'font-bold text-emerald-300 text-sm' : 'text-slate-200 text-sm'}>
                            {m.slotB?.seed ? <span className="text-slate-500 font-mono mr-1">#{m.slotB.seed}</span> : null}
                            {m.slotB?.name || m.labelB}
                          </span>
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        {isDone && m.winner ? (
                          <div className="flex items-center gap-2 text-emerald-300 font-semibold">
                            <span>🏆 {m.winner.name}</span>
                            {m.tiebreakerVotedBy?.fullName ? (
                              <span className="text-[10px] text-amber-300 font-normal">
                                (⚡ {m.tiebreakerVotedBy.fullName})
                              </span>
                            ) : null}
                          </div>
                        ) : m.nextMatchNumber ? (
                          <span className="text-slate-500">
                            Winner → Match #{m.nextMatchNumber}
                          </span>
                        ) : (
                          <span className="text-amber-300/80 font-medium">
                            👑 Crowns Champion
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* VIEW 4: MANAGER SETUP & CONTENDER EDITOR */}
      {canManage && !compact && (activeView === 'manage' || !worldCup) && (
        <div className="space-y-6">
          {/* Edit existing tournament contenders if a tournament is running */}
          {worldCup && Array.isArray(worldCup.items) && worldCup.items.length === 32 && (
            <div className="bg-[#0b1220] border border-[#1a2540] rounded-2xl p-5 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-[10px] font-mono uppercase tracking-[0.18em] text-indigo-400">
                    Active World Cup Contenders
                  </p>
                  <h3 className="text-base font-bold text-white mt-0.5">
                    Edit Names or Images in “{worldCup.title}”
                  </h3>
                </div>
              </div>

              {editingContenderSeed && (
                <form
                  onSubmit={handleSaveContenderEdit}
                  className="rounded-xl border border-indigo-500/40 bg-[#060e1a] p-4 space-y-3"
                >
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-bold text-indigo-200">
                      Editing Seed #{editingContenderSeed}
                    </p>
                    <button
                      type="button"
                      onClick={() => setEditingContenderSeed(null)}
                      className="text-xs text-slate-400 hover:text-white"
                    >
                      Cancel
                    </button>
                  </div>
                  <div className="grid sm:grid-cols-2 gap-3">
                    <label className="block space-y-1">
                      <span className="text-xs text-slate-400">Contender Name</span>
                      <input
                        className="w-full bg-[#0b1220] border border-[#1a2540] text-slate-100 text-xs rounded-lg px-3 py-2"
                        value={editContenderName}
                        onChange={(e) => setEditContenderName(e.target.value)}
                        required
                      />
                    </label>
                    <label className="block space-y-1">
                      <span className="text-xs text-slate-400">Upload New Image</span>
                      <input
                        type="file"
                        accept="image/*"
                        onChange={async (e) => {
                          const f = e.target.files?.[0];
                          if (!f) return;
                          try {
                            const url = await uploadSingleFileForSlot(f);
                            setEditContenderImage(url);
                          } catch (err) {
                            setError(err.message || 'Upload failed.');
                          }
                        }}
                        className="w-full text-xs text-slate-300"
                      />
                    </label>
                  </div>
                  <button
                    type="submit"
                    disabled={actionBusy}
                    className="px-4 py-2 rounded-lg text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white"
                  >
                    Save Changes
                  </button>
                </form>
              )}

              <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-8 gap-2.5">
                {worldCup.items.map((item) => (
                  <button
                    key={item.seed}
                    type="button"
                    onClick={() => {
                      setEditingContenderSeed(item.seed);
                      setEditContenderName(item.name);
                      setEditContenderImage(item.imageUrl || '');
                    }}
                    className="p-2.5 rounded-xl border border-[#1a2540] bg-[#060e1a] hover:border-indigo-500/50 flex flex-col items-center text-center gap-2 transition-colors"
                  >
                    <ContenderThumb item={item} size="lg" />
                    <span className="text-xs font-medium text-slate-200 truncate w-full">
                      #{item.seed} {item.name}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Create a New 32-Item World Cup */}
          <form
            onSubmit={handleCreateWorldCup}
            className="bg-[#0b1220] border border-[#1a2540] rounded-2xl overflow-hidden"
          >
            <div className="px-5 py-4 border-b border-[#1a2540] bg-[#060e1a]/60 flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-[10px] font-mono uppercase tracking-[0.18em] text-amber-400">
                  Tournament Builder · 32 Contenders
                </p>
                <h3 className="text-lg font-bold text-white mt-0.5">
                  Launch a New World Cup of Things
                </h3>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={applyBiscuitPreset}
                  className="px-3 py-1.5 rounded-lg text-xs font-semibold border border-amber-500/40 bg-amber-500/15 text-amber-200 hover:bg-amber-500/25"
                >
                  🍪 Load 32 Biscuits Preset
                </button>
                <button
                  type="button"
                  onClick={() => bulkInputRef.current?.click()}
                  disabled={bulkUploading}
                  className="px-3 py-1.5 rounded-lg text-xs font-semibold border border-indigo-500/40 bg-indigo-500/15 text-indigo-200 hover:bg-indigo-500/25 disabled:opacity-50"
                >
                  {bulkUploading ? 'Uploading Images…' : '📁 Bulk Upload 32 Images'}
                </button>
                <input
                  ref={bulkInputRef}
                  type="file"
                  accept="image/*"
                  multiple
                  className="hidden"
                  onChange={(e) => handleBulkFilesSelect(e.target.files)}
                />
                <button
                  type="button"
                  onClick={() => setShowPasteModal((v) => !v)}
                  className="px-3 py-1.5 rounded-lg text-xs font-medium border border-[#1a2540] text-slate-300 hover:bg-white/[0.04]"
                >
                  📋 Paste 32 Names
                </button>
                <button
                  type="button"
                  onClick={shuffleContenders}
                  className="px-3 py-1.5 rounded-lg text-xs font-medium border border-[#1a2540] text-slate-300 hover:bg-white/[0.04]"
                >
                  🎲 Shuffle Draw
                </button>
              </div>
            </div>

            <div className="p-5 space-y-5">
              {showPasteModal && (
                <div className="rounded-xl border border-indigo-500/30 bg-[#060e1a] p-4 space-y-3">
                  <p className="text-xs text-slate-300 font-medium">
                    Paste up to 32 contender names (one per line):
                  </p>
                  <textarea
                    className="w-full min-h-[120px] bg-[#0b1220] border border-[#1a2540] text-slate-100 text-xs rounded-lg p-3"
                    placeholder={'Chocolate Hobnob\nCustard Cream\nBourbon\nJammie Dodger...'}
                    value={pasteText}
                    onChange={(e) => setPasteText(e.target.value)}
                  />
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={applyPastedNames}
                      className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-indigo-600 text-white"
                    >
                      Apply Names
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowPasteModal(false)}
                      className="px-3 py-1.5 rounded-lg text-xs text-slate-400"
                    >
                      Close
                    </button>
                  </div>
                </div>
              )}

              <div className="grid md:grid-cols-2 gap-4">
                <label className="block space-y-1.5">
                  <span className="text-xs text-slate-400 font-medium">World Cup Title</span>
                  <input
                    className="w-full bg-[#060e1a] border border-[#1a2540] text-slate-100 text-sm rounded-lg px-3.5 py-2.5"
                    value={wcTitle}
                    onChange={(e) => setWcTitle(e.target.value)}
                    placeholder="e.g. World Cup of Biscuits"
                    required
                    maxLength={120}
                  />
                </label>
                <label className="block space-y-1.5">
                  <span className="text-xs text-slate-400 font-medium">Description / Rules Note</span>
                  <input
                    className="w-full bg-[#060e1a] border border-[#1a2540] text-slate-100 text-sm rounded-lg px-3.5 py-2.5"
                    value={wcDescription}
                    onChange={(e) => setWcDescription(e.target.value)}
                    maxLength={500}
                  />
                </label>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                    32 Contenders · Paired by Round of 32 Matchups (M1–M16)
                  </p>
                  <p className="text-[11px] text-slate-500">
                    Upload a photo or paste an image URL for each contender
                  </p>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                  {Array.from({ length: 16 }, (_, matchIdx) => {
                    const idxA = matchIdx * 2;
                    const idxB = matchIdx * 2 + 1;
                    return (
                      <div
                        key={matchIdx}
                        className="rounded-xl border border-[#1a2540] bg-[#060e1a]/70 p-3 space-y-2.5"
                      >
                        <div className="flex items-center justify-between text-[11px] text-indigo-300 font-mono font-semibold">
                          <span>Round of 32 · Match #{matchIdx + 1}</span>
                          <span className="text-slate-500">Seed #{idxA + 1} vs Seed #{idxB + 1}</span>
                        </div>

                        {[idxA, idxB].map((slotIdx) => {
                          const item = wcItems[slotIdx] || { seed: slotIdx + 1, name: '', imageUrl: '' };
                          const isBusy = uploadingSlot === slotIdx;
                          return (
                            <div
                              key={slotIdx}
                              className="flex items-center gap-3 bg-[#0b1220] border border-[#1a2540] rounded-lg p-2.5"
                            >
                              <label className="relative cursor-pointer group flex-shrink-0" title="Click to upload image">
                                <ContenderThumb item={item} label={item.name || `#${slotIdx + 1}`} size="lg" />
                                <span className="absolute inset-0 rounded-xl bg-black/60 opacity-0 group-hover:opacity-100 flex items-center justify-center text-xs text-white font-semibold transition-opacity">
                                  {isBusy ? '…' : '📷'}
                                </span>
                                <input
                                  type="file"
                                  accept="image/*"
                                  className="hidden"
                                  onChange={(e) => handleSlotFileSelect(slotIdx, e.target.files?.[0])}
                                />
                              </label>

                              <div className="flex-1 min-w-0 space-y-1">
                                <input
                                  className="w-full bg-[#060e1a] border border-[#1a2540] text-slate-100 text-xs rounded-md px-2.5 py-1.5"
                                  placeholder={`Contender #${slotIdx + 1} name (e.g. Bourbon)`}
                                  value={item.name}
                                  onChange={(e) => {
                                    const val = e.target.value;
                                    setWcItems((prev) => prev.map((row, idx) => (idx === slotIdx ? { ...row, name: val } : row)));
                                  }}
                                  required
                                />
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="pt-2 flex flex-wrap items-center justify-between gap-3">
                <p className="text-xs text-slate-400">
                  Launching starts Match #1 immediately for today and schedules the remaining 30 knockout matches.
                </p>
                <button
                  type="submit"
                  disabled={creatingWc || bulkUploading}
                  className="px-6 py-3 rounded-xl text-sm font-bold bg-gradient-to-r from-indigo-600 to-cyan-600 hover:from-indigo-500 hover:to-cyan-500 disabled:opacity-50 text-white shadow-lg"
                >
                  {creatingWc ? 'Launching World Cup…' : '🏆 Launch 32-Contender World Cup'}
                </button>
              </div>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
