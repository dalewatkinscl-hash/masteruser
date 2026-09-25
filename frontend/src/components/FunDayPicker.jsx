import { getLondonDayKey } from '../lib/nonogram';
import { getFunRotationForDay } from '../lib/funRotation';

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

/** True when this Fun game is on the day’s competitive rotation (not weekend / sit-out). */
export function isFunGameOnDay(gameKey, dayKey) {
  if (!gameKey) return true;
  const rotation = getFunRotationForDay(dayKey);
  if (rotation.closed) return false;
  return Array.isArray(rotation.games) && rotation.games.includes(String(gameKey));
}

function findAvailableDay(fromKey, delta, gameKey, minDay, maxDay) {
  let key = fromKey;
  for (let i = 0; i < 420; i += 1) {
    key = shiftDayKey(key, delta);
    if (key < minDay || key > maxDay) return null;
    if (isFunGameOnDay(gameKey, key)) return key;
  }
  return null;
}

/**
 * Compact day navigator for Fun games.
 * Admins can optionally step into future days for preview.
 * When `gameKey` is set, Prev/Next/date skip days where that game sits out.
 */
export default function FunDayPicker({
  dayKey,
  onChange,
  todayKey: todayKeyProp,
  allowFuture = false,
  maxFutureDays = 60,
  gameKey = null,
}) {
  const todayKey = todayKeyProp || getLondonDayKey();
  const isToday = dayKey === todayKey;
  const maxDay = allowFuture ? shiftDayKey(todayKey, maxFutureDays) : todayKey;
  const minDay = shiftDayKey(todayKey, -365);
  const isFuture = dayKey > todayKey;
  const onRotation = isFunGameOnDay(gameKey, dayKey);
  const todayOnRotation = isFunGameOnDay(gameKey, todayKey);
  const prevDay = findAvailableDay(dayKey, -1, gameKey, minDay, maxDay);
  const nextDay = findAvailableDay(dayKey, 1, gameKey, minDay, maxDay);
  const snapToPlayable = (candidate) => {
    let next = candidate;
    if (!next) return next;
    if (next > maxDay) next = maxDay;
    if (next < minDay) next = minDay;
    if (gameKey && !isFunGameOnDay(gameKey, next)) {
      const back = findAvailableDay(next, -1, gameKey, minDay, maxDay);
      const fwd = findAvailableDay(next, 1, gameKey, minDay, maxDay);
      next = back || fwd || next;
    }
    return next;
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={() => prevDay && onChange(prevDay)}
        disabled={!prevDay}
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
            const next = snapToPlayable(e.target.value);
            if (next) onChange(next);
          }}
        />
        <span className="font-medium text-slate-200">{formatFunDayLabel(dayKey, todayKey)}</span>
      </label>
      <button
        type="button"
        onClick={() => nextDay && onChange(nextDay)}
        disabled={!nextDay}
        className="px-2.5 py-1.5 rounded-md border border-[#1a2540] text-xs text-slate-300 hover:bg-white/[0.04] disabled:opacity-40"
        aria-label="Next day"
      >
        Next ›
      </button>
      {!isToday && todayOnRotation ? (
        <button
          type="button"
          onClick={() => onChange(todayKey)}
          className="px-2.5 py-1.5 rounded-md border border-indigo-500/40 text-xs text-indigo-200 hover:bg-indigo-500/10"
        >
          Today
        </button>
      ) : null}
      {!isToday && (
        <span className="text-[11px] text-amber-200/90 border border-amber-500/30 bg-amber-500/10 rounded-md px-2 py-1">
          {isFuture ? 'Admin preview — no leaderboard or streak' : 'For fun — no leaderboard or streak'}
        </span>
      )}
      {gameKey && !onRotation ? (
        <span className="text-[11px] text-rose-200/90 border border-rose-500/30 bg-rose-500/10 rounded-md px-2 py-1">
          Not in this day’s Fun rotation
        </span>
      ) : null}
    </div>
  );
}

export { getLondonDayKey, shiftDayKey, formatFunDayLabel };
