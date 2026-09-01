import { getLondonDayKey } from '../lib/nonogram';

function shiftDayKey(dayKey, deltaDays) {
  const [year, month, day] = String(dayKey).split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day, 12));
  date.setUTCDate(date.getUTCDate() + deltaDays);
  return date.toISOString().slice(0, 10);
}

function formatFunDayLabel(dayKey, todayKey = getLondonDayKey()) {
  if (dayKey === todayKey) return 'Today';
  const yesterday = shiftDayKey(todayKey, -1);
  if (dayKey === yesterday) return 'Yesterday';
  const tomorrow = shiftDayKey(todayKey, 1);
  if (dayKey === tomorrow) return 'Tomorrow';
  try {
    const [year, month, day] = dayKey.split('-').map(Number);
    return new Date(Date.UTC(year, month - 1, day, 12)).toLocaleDateString('en-GB', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      timeZone: 'UTC',
    });
  } catch {
    return dayKey;
  }
}

/**
 * Compact day navigator for Fun games.
 * Admins can optionally step into future days for preview.
 */
export default function FunDayPicker({
  dayKey,
  onChange,
  todayKey: todayKeyProp,
  allowFuture = false,
  maxFutureDays = 60,
}) {
  const todayKey = todayKeyProp || getLondonDayKey();
  const isToday = dayKey === todayKey;
  const maxDay = allowFuture ? shiftDayKey(todayKey, maxFutureDays) : todayKey;
  const canGoForward = dayKey < maxDay;
  const minDay = shiftDayKey(todayKey, -365);
  const isFuture = dayKey > todayKey;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={() => onChange(shiftDayKey(dayKey, -1))}
        disabled={dayKey <= minDay}
        className="px-2.5 py-1.5 rounded-md border border-[#1a2540] text-xs text-slate-300 hover:bg-white/[0.04] disabled:opacity-40"
        aria-label="Previous day"
      >
        ‹ Prev
      </button>
      <label className="inline-flex items-center gap-2 text-xs text-slate-400">
        <span className="sr-only">Choose day</span>
        <input
          type="date"
          className="bg-[#060e1a] border border-[#1a2540] text-slate-200 text-xs rounded-md px-2 py-1.5"
          value={dayKey}
          max={maxDay}
          min={minDay}
          onChange={(e) => {
            const next = e.target.value;
            if (!next) return;
            if (next > maxDay) onChange(maxDay);
            else if (next < minDay) onChange(minDay);
            else onChange(next);
          }}
        />
        <span className="font-medium text-slate-200">{formatFunDayLabel(dayKey, todayKey)}</span>
      </label>
      <button
        type="button"
        onClick={() => onChange(shiftDayKey(dayKey, 1))}
        disabled={!canGoForward}
        className="px-2.5 py-1.5 rounded-md border border-[#1a2540] text-xs text-slate-300 hover:bg-white/[0.04] disabled:opacity-40"
        aria-label="Next day"
      >
        Next ›
      </button>
      {!isToday && (
        <button
          type="button"
          onClick={() => onChange(todayKey)}
          className="px-2.5 py-1.5 rounded-md border border-indigo-500/40 text-xs text-indigo-200 hover:bg-indigo-500/10"
        >
          Today
        </button>
      )}
      {!isToday && (
        <span className="text-[11px] text-amber-200/90 border border-amber-500/30 bg-amber-500/10 rounded-md px-2 py-1">
          {isFuture ? 'Admin preview — no leaderboard or streak' : 'For fun — no leaderboard or streak'}
        </span>
      )}
    </div>
  );
}

export { getLondonDayKey, shiftDayKey, formatFunDayLabel };
