import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

export function ColumnsIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="3" y="4" width="5" height="16" rx="1" stroke="currentColor" strokeWidth="1.5" />
      <rect x="10" y="4" width="5" height="16" rx="1" stroke="currentColor" strokeWidth="1.5" />
      <rect x="17" y="4" width="4" height="16" rx="1" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}

export function SortButton({ label, column, sortColumn, sortDirection, onSort }) {
  const active = sortColumn === column;
  return (
    <button
      type="button"
      onClick={() => onSort(column)}
      className={`inline-flex items-center gap-1 whitespace-nowrap hover:text-slate-200 ${active ? 'text-indigo-300' : ''}`}
    >
      {label}
      <span className="text-[10px]">{active ? (sortDirection === 'asc' ? '↑' : '↓') : '↕'}</span>
    </button>
  );
}

export function ColumnFilterDropdown({
  columnId,
  options,
  selected,
  onChange,
  open,
  onToggle,
  onClose,
}) {
  const buttonRef = useRef(null);
  const panelRef = useRef(null);
  const [query, setQuery] = useState('');
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const selectedSet = useMemo(() => new Set(selected || []), [selected]);
  const activeCount = selectedSet.size;

  useEffect(() => {
    if (!open) {
      setQuery('');
      return undefined;
    }

    const updatePosition = () => {
      if (!buttonRef.current) return;
      const rect = buttonRef.current.getBoundingClientRect();
      const panelWidth = 240;
      const maxLeft = window.innerWidth - panelWidth - 8;
      setPosition({
        top: rect.bottom + 6,
        left: Math.max(8, Math.min(rect.left, maxLeft)),
      });
    };

    updatePosition();
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);
    return () => {
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;

    const onPointerDown = (event) => {
      const target = event.target;
      if (buttonRef.current?.contains(target)) return;
      if (panelRef.current?.contains(target)) return;
      onClose();
    };

    const onKeyDown = (event) => {
      if (event.key === 'Escape') onClose();
    };

    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open, onClose]);

  const filteredOptions = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return options;
    return options.filter((option) => String(option).toLowerCase().includes(needle));
  }, [options, query]);

  const toggleOption = (option) => {
    const next = new Set(selectedSet);
    if (next.has(option)) next.delete(option);
    else next.add(option);
    onChange([...next]);
  };

  const selectAllVisible = () => {
    const next = new Set(selectedSet);
    filteredOptions.forEach((option) => next.add(option));
    onChange([...next]);
  };

  const clearAll = () => onChange([]);

  return (
    <div className="relative">
      <button
        ref={buttonRef}
        type="button"
        onClick={onToggle}
        className={`inline-flex items-center gap-1.5 max-w-[9rem] px-2 py-1.5 rounded border text-xs transition-colors ${
          activeCount > 0
            ? 'border-indigo-500/50 bg-indigo-500/10 text-indigo-200'
            : 'border-[#1a2540] bg-[#060e1a] text-slate-300 hover:border-slate-600'
        }`}
      >
        <span className="truncate">{activeCount > 0 ? `${activeCount} selected` : 'All'}</span>
        <span className="text-[10px] opacity-70">{open ? '▴' : '▾'}</span>
      </button>

      {open && createPortal(
        <div
          ref={panelRef}
          style={{ top: position.top, left: position.left }}
          className="fixed z-[80] w-60 rounded-xl border border-[#1a2540] bg-[#0b1220] shadow-2xl"
        >
          <div className="p-2 border-b border-[#1a2540] space-y-2">
            {options.length > 8 && (
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search options…"
                className="w-full bg-[#060e1a] border border-[#1a2540] text-slate-200 text-xs rounded px-2 py-1.5 focus:outline-none focus:border-indigo-500/50"
              />
            )}
            <div className="flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={selectAllVisible}
                className="text-[11px] text-indigo-300 hover:text-indigo-200"
              >
                Select all
              </button>
              <button
                type="button"
                onClick={clearAll}
                className="text-[11px] text-slate-400 hover:text-slate-200"
              >
                Clear
              </button>
            </div>
          </div>
          <div className="max-h-56 overflow-y-auto p-1">
            {filteredOptions.length === 0 ? (
              <p className="px-2 py-3 text-xs text-slate-500">No options</p>
            ) : (
              filteredOptions.map((option) => {
                const checked = selectedSet.has(option);
                return (
                  <label
                    key={`${columnId}-${option}`}
                    className="flex items-start gap-2 px-2 py-1.5 rounded-lg hover:bg-[#060e1a] cursor-pointer text-xs text-slate-200"
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleOption(option)}
                      className="mt-0.5 w-3.5 h-3.5 rounded border-[#1a2540] bg-[#060e1a] text-indigo-500"
                    />
                    <span className="break-words">{option}</span>
                  </label>
                );
              })
            )}
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}
