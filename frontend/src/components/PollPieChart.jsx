import { useMemo, useState } from 'react';
import VotersHover from './VotersHover';

const SLICE_COLORS = [
  '#6366f1', // indigo
  '#22d3ee', // cyan
  '#f59e0b', // amber
  '#34d399', // emerald
  '#f472b6', // pink
  '#a78bfa', // violet
  '#fb7185', // rose
  '#38bdf8', // sky
  '#fbbf24', // yellow
  '#4ade80', // green
  '#e879f9', // fuchsia
  '#2dd4bf', // teal
];

function colorForIndex(index) {
  return SLICE_COLORS[index % SLICE_COLORS.length];
}

function polarToCartesian(cx, cy, radius, angleDeg) {
  const angleRad = ((angleDeg - 90) * Math.PI) / 180;
  return {
    x: cx + radius * Math.cos(angleRad),
    y: cy + radius * Math.sin(angleRad),
  };
}

function describeSlice(cx, cy, radius, startAngle, endAngle) {
  if (endAngle - startAngle >= 359.9) {
    const mid = startAngle + 180;
    const start = polarToCartesian(cx, cy, radius, startAngle);
    const middle = polarToCartesian(cx, cy, radius, mid);
    const end = polarToCartesian(cx, cy, radius, endAngle);
    return [
      `M ${cx} ${cy}`,
      `L ${start.x} ${start.y}`,
      `A ${radius} ${radius} 0 1 1 ${middle.x} ${middle.y}`,
      `A ${radius} ${radius} 0 1 1 ${end.x} ${end.y}`,
      'Z',
    ].join(' ');
  }

  const start = polarToCartesian(cx, cy, radius, startAngle);
  const end = polarToCartesian(cx, cy, radius, endAngle);
  const largeArc = endAngle - startAngle > 180 ? 1 : 0;
  return [
    `M ${cx} ${cy}`,
    `L ${start.x} ${start.y}`,
    `A ${radius} ${radius} 0 ${largeArc} 1 ${end.x} ${end.y}`,
    'Z',
  ].join(' ');
}

/**
 * Poll pie with hover tooltips listing who voted for each option.
 * Works for A/B (2 slices) and open-text polls (N slices).
 */
export default function PollPieChart({ options = [], size = 'md' }) {
  const [hoveredKey, setHoveredKey] = useState(null);
  const slices = useMemo(() => {
    const list = (Array.isArray(options) ? options : [])
      .map((row, index) => ({
        key: String(row.key || `opt-${index}`),
        label: row.label || `Option ${index + 1}`,
        votes: Number(row.votes) || 0,
        percent: Number.isFinite(row.percent)
          ? row.percent
          : 0,
        voters: Array.isArray(row.voters) ? row.voters : [],
        color: colorForIndex(index),
      }))
      .filter((row) => row.votes > 0 || options.length <= 2);
    return list;
  }, [options]);

  const total = slices.reduce((sum, row) => sum + (row.votes || 0), 0);
  const withPercents = useMemo(() => {
    if (!total) {
      return slices.map((row) => ({ ...row, percent: row.percent || 0, angle: 0 }));
    }
    return slices.map((row) => ({
      ...row,
      percent: row.percent || Math.round((row.votes / total) * 100),
      angle: (row.votes / total) * 360,
    }));
  }, [slices, total]);

  const dim = size === 'sm' ? 56 : 112;
  const radius = dim / 2 - 2;
  const cx = dim / 2;
  const cy = dim / 2;
  const hovered = withPercents.find((row) => row.key === hoveredKey) || null;

  let angleCursor = 0;
  const paths = withPercents
    .map((row) => {
      const start = angleCursor;
      const end = angleCursor + row.angle;
      angleCursor = end;
      return { ...row, startAngle: start, endAngle: end };
    })
    .filter((row) => row.angle > 0.05);

  return (
    <div className={`flex items-start gap-4 flex-wrap ${size === 'sm' ? 'gap-3' : ''}`}>
      <div
        className="relative flex-shrink-0"
        onMouseLeave={() => setHoveredKey(null)}
      >
        <svg width={dim} height={dim} viewBox={`0 0 ${dim} ${dim}`} className="block overflow-visible">
          {total === 0 ? (
            <circle cx={cx} cy={cy} r={radius} fill="#111827" stroke="#1a2540" />
          ) : paths.length === 1 && paths[0].angle >= 359.9 ? (
            <circle
              cx={cx}
              cy={cy}
              r={radius}
              fill={paths[0].color}
              className="cursor-pointer"
              onMouseEnter={() => setHoveredKey(paths[0].key)}
            />
          ) : (
            paths.map((row) => (
              <path
                key={row.key}
                d={describeSlice(cx, cy, radius, row.startAngle, row.endAngle)}
                fill={row.color}
                className="cursor-pointer transition-opacity hover:opacity-90"
                onMouseEnter={() => setHoveredKey(row.key)}
              />
            ))
          )}
        </svg>
        {hovered && (
          <div className="absolute z-50 left-0 top-full mt-1.5 w-56 rounded-lg border border-[#1a2540] bg-[#0b1220] shadow-2xl px-3 py-2 pointer-events-none">
            <p className="text-[11px] font-semibold text-slate-200 mb-1">
              {hovered.label}
              <span className="text-slate-500 font-normal">
                {' '}
                · {hovered.votes || 0} · {hovered.percent || 0}%
              </span>
            </p>
            {(hovered.voters || []).length === 0 ? (
              <p className="text-[11px] text-slate-500">No votes yet</p>
            ) : (
              <ul className="max-h-40 overflow-y-auto space-y-0.5">
                {(hovered.voters || []).map((name, index) => (
                  <li key={`${name}-${index}`} className="text-[11px] text-slate-300 truncate">{name}</li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>

      <div
        className={`space-y-2 min-w-0 max-h-48 overflow-y-auto pr-1 ${
          size === 'sm' ? 'space-y-1.5 text-[11px]' : 'text-sm'
        }`}
      >
        {withPercents.map((option) => (
          <VotersHover
            key={option.key}
            label={option.label}
            voters={option.voters || []}
            votes={option.votes || 0}
            className="w-full"
          >
            <span className="flex items-center gap-2 cursor-default">
              <span
                className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                style={{ backgroundColor: option.color }}
              />
              <span className="text-slate-200 truncate underline decoration-dotted decoration-slate-600 underline-offset-2">
                {option.label}
              </span>
              <span className="text-slate-500 flex-shrink-0">
                {option.percent || 0}% ({option.votes || 0})
              </span>
            </span>
          </VotersHover>
        ))}
        {withPercents.length === 0 ? (
          <p className="text-slate-500 text-xs">No answers yet</p>
        ) : null}
      </div>
    </div>
  );
}
