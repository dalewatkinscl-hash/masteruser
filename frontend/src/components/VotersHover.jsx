import { useId, useState } from 'react';

/**
 * Hover target that shows a popup list of voter names.
 */
export default function VotersHover({
  label,
  voters = [],
  votes,
  children,
  className = '',
  panelClassName = '',
}) {
  const [open, setOpen] = useState(false);
  const tooltipId = useId();
  const names = Array.isArray(voters) ? voters.filter(Boolean) : [];
  const count = typeof votes === 'number' ? votes : names.length;

  return (
    <span
      className={`relative inline-flex ${className}`}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={() => setOpen(false)}
    >
      {children}
      {open && (
        <span
          id={tooltipId}
          role="tooltip"
          className={`absolute z-50 left-0 top-full mt-1.5 w-56 max-w-[min(16rem,80vw)] rounded-lg border border-[#1a2540] bg-[#0b1220] shadow-2xl px-3 py-2 text-left ${panelClassName}`}
        >
          <span className="block text-[11px] font-semibold text-slate-200 mb-1">
            {label || 'Votes'}
            <span className="text-slate-500 font-normal"> · {count}</span>
          </span>
          {names.length === 0 ? (
            <span className="block text-[11px] text-slate-500">No votes yet</span>
          ) : (
            <ul className="max-h-44 overflow-y-auto space-y-0.5 pr-0.5">
              {names.map((name, index) => (
                <li key={`${name}-${index}`} className="text-[11px] text-slate-300 truncate">
                  {name}
                </li>
              ))}
            </ul>
          )}
        </span>
      )}
    </span>
  );
}
