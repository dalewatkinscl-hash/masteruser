function medalEmoji(medal) {
  if (medal === 'gold') return '🥇';
  if (medal === 'silver') return '🥈';
  if (medal === 'bronze') return '🥉';
  return null;
}

/**
 * Rank / medal / poop badge for Fun-tab leaderboards.
 */
export function FunRankBadge({ row }) {
  const failed = row?.failed || row?.status === 'lost' || row?.correct === false;
  if (failed) {
    return (
      <span className="w-10 text-center text-base leading-none" title="Failed">
        💩
      </span>
    );
  }

  const medal = medalEmoji(row?.medal) || (row?.rank === 1 ? '🥇' : row?.rank === 2 ? '🥈' : row?.rank === 3 ? '🥉' : null);
  if (medal) {
    return (
      <span
        className="w-10 text-center text-base leading-none"
        title={row?.rankLabel || ''}
      >
        {medal}
      </span>
    );
  }

  return (
    <span className="w-10 text-center text-[10px] font-mono text-slate-500 leading-tight">
      {row?.joint ? 'J' : '#'}{row?.rank || '—'}
    </span>
  );
}

export function FunRankLabel({ row, className = '' }) {
  const failed = row?.failed || row?.status === 'lost' || row?.correct === false;
  if (failed) return null;
  if (!row?.joint) return null;
  return (
    <span className={`text-[10px] text-slate-500 ${className}`}>
      {row.rankLabel || 'Joint'}
    </span>
  );
}

function RecordBadges({ row }) {
  if (!row?.isWorldRecord && !row?.isPersonalBest) return null;
  return (
    <span className="inline-flex items-center gap-1 flex-shrink-0">
      {row.isWorldRecord ? (
        <span
          className="px-1.5 py-0.5 rounded text-[10px] font-semibold tracking-wide uppercase bg-amber-500/20 text-amber-200 border border-amber-500/35"
          title="All-time world record"
        >
          WR
        </span>
      ) : null}
      {row.isPersonalBest ? (
        <span
          className="px-1.5 py-0.5 rounded text-[10px] font-semibold tracking-wide uppercase bg-sky-500/15 text-sky-200 border border-sky-500/30"
          title="Personal record"
        >
          PR
        </span>
      ) : null}
    </span>
  );
}

export default function FunLeaderboardRow({
  row,
  currentUserUid,
  resultText,
  metaText = '',
}) {
  const isMe = row.uid === currentUserUid;
  const failed = row?.failed || row?.status === 'lost' || row?.correct === false;
  const gif = typeof row?.leaderboardGif === 'string' && row.leaderboardGif.trim()
    ? row.leaderboardGif.trim()
    : null;

  return (
    <li
      className={`px-5 py-3 flex items-start justify-between gap-3 text-sm ${isMe ? 'bg-indigo-500/10' : ''}`}
    >
      <div className="flex items-start gap-2 min-w-0">
        <FunRankBadge row={row} />
        <div className="min-w-0">
          <div className="flex items-center gap-2 min-w-0 flex-wrap">
            <span className={`truncate ${isMe ? 'text-indigo-300 font-semibold text-base' : 'text-slate-100'}`}>
              {row.fullName}
              {isMe ? ' (you)' : ''}
            </span>
            <FunRankLabel row={row} />
            <RecordBadges row={row} />
          </div>
          {gif ? (
            <img
              src={gif}
              alt=""
              className="mt-2 max-w-[220px] w-full rounded-md border border-[#1a2540] shadow-sm"
            />
          ) : null}
        </div>
      </div>
      <span className={`text-xs flex-shrink-0 pt-0.5 ${failed ? 'text-rose-300' : 'text-slate-500'}`}>
        {resultText}
        {metaText ? ` · ${metaText}` : ''}
      </span>
    </li>
  );
}
