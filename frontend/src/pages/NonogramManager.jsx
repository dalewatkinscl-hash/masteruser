import { useEffect, useMemo, useState } from 'react';

async function readJsonResponse(res) {
  const contentType = res.headers.get('content-type') || '';
  if (!contentType.includes('application/json')) return null;
  try {
    return await res.json();
  } catch {
    return null;
  }
}

const DEFAULT_PALETTE = [
  '#111827', '#6b7280', '#f8fafc', '#ef4444',
  '#f97316', '#eab308', '#84cc16', '#22c55e',
  '#14b8a6', '#0ea5e9', '#3b82f6', '#6366f1',
  '#a855f7', '#ec4899', '#92400e', '#f5d0a9',
];

function emptyColorGrid(size) {
  return Array.from({ length: size }, () => Array(size).fill(null));
}

function PuzzlePreview({ puzzle, cell = 10 }) {
  const size = puzzle.size || 0;
  return (
    <div
      className="inline-grid gap-px rounded-lg border border-[#1a2540] bg-[#1a2540] p-1"
      style={{ gridTemplateColumns: `repeat(${size}, minmax(0, ${cell}px))` }}
    >
      {Array.from({ length: size }).flatMap((_, row) => (
        Array.from({ length: size }).map((__, col) => {
          const filled = puzzle.solution?.[row]?.[col] === 1;
          const color = puzzle.reveal?.[row]?.[col] || '#0b1220';
          return (
            <span
              key={`${puzzle.puzzleId}-${row}-${col}`}
              className="block rounded-[1px]"
              style={{
                width: cell,
                height: cell,
                backgroundColor: filled ? color : '#0b1220',
              }}
            />
          );
        })
      ))}
    </div>
  );
}

function statusLabel(puzzle) {
  if (puzzle.spent) return { text: 'Spent', className: 'text-rose-300 border-rose-500/30 bg-rose-500/10' };
  if (puzzle.scheduledFor) return { text: `Scheduled ${puzzle.scheduledFor}`, className: 'text-sky-300 border-sky-500/30 bg-sky-500/10' };
  return { text: 'Available', className: 'text-emerald-300 border-emerald-500/30 bg-emerald-500/10' };
}

export default function NonogramManagerPanel() {
  const [puzzles, setPuzzles] = useState([]);
  const [palette, setPalette] = useState(DEFAULT_PALETTE);
  const [sizeRange, setSizeRange] = useState({ min: 10, max: 20 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [busyId, setBusyId] = useState('');

  const [showCreator, setShowCreator] = useState(false);
  const [gridSize, setGridSize] = useState(10);
  const [title, setTitle] = useState('');
  const [scheduledFor, setScheduledFor] = useState('');
  const [activeColor, setActiveColor] = useState(DEFAULT_PALETTE[0]);
  const [tool, setTool] = useState('paint'); // paint | erase
  const [colorGrid, setColorGrid] = useState(() => emptyColorGrid(10));
  const [painting, setPainting] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    const response = await fetch('/api/getNonogramCatalog', { credentials: 'include' });
    const payload = await readJsonResponse(response);
    if (!payload) throw new Error('Failed to load Nonogram catalog.');
    if (!response.ok) throw new Error(payload.error || 'Failed to load Nonogram catalog.');
    setPuzzles(payload.puzzles || []);
    if (Array.isArray(payload.palette) && payload.palette.length) {
      setPalette(payload.palette);
      setActiveColor((prev) => (payload.palette.includes(prev) ? prev : payload.palette[0]));
    }
    if (payload.sizeRange) setSizeRange(payload.sizeRange);
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        setError('');
        await load();
      } catch (err) {
        if (!cancelled) setError(err.message || 'Failed to load Nonogram catalog.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    setColorGrid((prev) => {
      const next = emptyColorGrid(gridSize);
      for (let r = 0; r < Math.min(gridSize, prev.length); r += 1) {
        for (let c = 0; c < Math.min(gridSize, prev[r]?.length || 0); c += 1) {
          next[r][c] = prev[r][c];
        }
      }
      return next;
    });
  }, [gridSize]);

  const filledCount = useMemo(
    () => colorGrid.reduce((sum, row) => sum + row.filter(Boolean).length, 0),
    [colorGrid],
  );

  const paintCell = (row, col) => {
    setColorGrid((prev) => {
      const next = prev.map((line) => [...line]);
      next[row][col] = tool === 'erase' ? null : activeColor;
      return next;
    });
  };

  const onSavePuzzle = async (event) => {
    event.preventDefault();
    setSaving(true);
    setError('');
    setMessage('');
    try {
      if (!title.trim()) throw new Error('Please enter a title.');
      if (filledCount < 8) throw new Error('Paint a few more pixels before saving.');
      const response = await fetch('/api/createNonogramPuzzle', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title.trim(),
          colorGrid,
          scheduledFor: scheduledFor || null,
        }),
      });
      const payload = (await readJsonResponse(response)) || {};
      if (!response.ok) throw new Error(payload.error || 'Failed to save puzzle.');
      setMessage('Puzzle saved to the catalog.');
      setTitle('');
      setScheduledFor('');
      setColorGrid(emptyColorGrid(gridSize));
      setShowCreator(false);
      await load();
    } catch (err) {
      setError(err.message || 'Failed to save puzzle.');
    } finally {
      setSaving(false);
    }
  };

  const onDelete = async (puzzleId) => {
    if (!window.confirm('Delete this pixel art puzzle from the catalog?')) return;
    setBusyId(puzzleId);
    setError('');
    setMessage('');
    try {
      const response = await fetch('/api/deleteNonogramPuzzle', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ puzzleId }),
      });
      const payload = (await readJsonResponse(response)) || {};
      if (!response.ok) throw new Error(payload.error || 'Failed to delete puzzle.');
      setMessage('Puzzle deleted.');
      await load();
    } catch (err) {
      setError(err.message || 'Failed to delete puzzle.');
    } finally {
      setBusyId('');
    }
  };

  const onSchedule = async (puzzleId, value) => {
    setBusyId(puzzleId);
    setError('');
    setMessage('');
    try {
      const response = await fetch('/api/scheduleNonogramPuzzle', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ puzzleId, scheduledFor: value || null }),
      });
      const payload = (await readJsonResponse(response)) || {};
      if (!response.ok) throw new Error(payload.error || 'Failed to update schedule.');
      setMessage(value ? `Scheduled for ${value}.` : 'Schedule cleared.');
      await load();
    } catch (err) {
      setError(err.message || 'Failed to update schedule.');
    } finally {
      setBusyId('');
    }
  };

  const sizeOptions = [];
  for (let n = sizeRange.min || 10; n <= (sizeRange.max || 20); n += 1) sizeOptions.push(n);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-white">Nonogram manager</h2>
          <p className="text-sm text-slate-400 mt-1">
            Create pixel art, schedule puzzle days, and retire spent puzzles.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowCreator((value) => !value)}
          className="px-4 py-2 rounded-lg text-sm font-medium bg-indigo-600 hover:bg-indigo-500 text-white transition-colors"
        >
          {showCreator ? 'Close creator' : 'New pixel art'}
        </button>
      </div>

      <div className="space-y-6">
        {error && (
          <div className="bg-red-500/10 border border-red-500/25 rounded-lg p-4">
            <p className="text-red-300 text-sm">{error}</p>
          </div>
        )}
        {message && (
          <div className="bg-emerald-500/10 border border-emerald-500/25 rounded-lg p-4">
            <p className="text-emerald-300 text-sm">{message}</p>
          </div>
        )}

        {showCreator && (
          <form onSubmit={onSavePuzzle} className="rounded-xl border border-[#1a2540] bg-[#0b1220] p-5 space-y-5">
            <div className="grid md:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs text-slate-400 mb-1.5">Title</label>
                <input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-full bg-[#060e1a] border border-[#1a2540] text-slate-100 text-sm rounded-lg px-3 py-2"
                  placeholder="e.g. Farm truck"
                  required
                />
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1.5">Grid size</label>
                <select
                  value={gridSize}
                  onChange={(e) => setGridSize(Number(e.target.value))}
                  className="w-full bg-[#060e1a] border border-[#1a2540] text-slate-100 text-sm rounded-lg px-3 py-2"
                >
                  {sizeOptions.map((n) => (
                    <option key={n} value={n}>{n}×{n}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1.5">Schedule for day (optional)</label>
                <input
                  type="date"
                  value={scheduledFor}
                  onChange={(e) => setScheduledFor(e.target.value)}
                  className="w-full bg-[#060e1a] border border-[#1a2540] text-slate-100 text-sm rounded-lg px-3 py-2"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs text-slate-400 mb-2">16-colour palette</label>
              <div className="flex flex-wrap gap-2 items-center">
                {palette.map((color) => (
                  <button
                    key={color}
                    type="button"
                    onClick={() => {
                      setActiveColor(color);
                      setTool('paint');
                    }}
                    className="w-8 h-8 rounded-md border-2 transition-transform"
                    style={{
                      backgroundColor: color,
                      borderColor: activeColor === color && tool === 'paint' ? '#fff' : '#1a2540',
                      transform: activeColor === color && tool === 'paint' ? 'scale(1.1)' : undefined,
                    }}
                    title={color}
                  />
                ))}
                <button
                  type="button"
                  onClick={() => setTool('erase')}
                  className={`px-3 py-1.5 rounded-md text-xs border ${
                    tool === 'erase'
                      ? 'border-rose-400 text-rose-200 bg-rose-500/10'
                      : 'border-[#1a2540] text-slate-300'
                  }`}
                >
                  Erase
                </button>
                <button
                  type="button"
                  onClick={() => setColorGrid(emptyColorGrid(gridSize))}
                  className="px-3 py-1.5 rounded-md text-xs border border-[#1a2540] text-slate-300"
                >
                  Clear
                </button>
                <span className="text-xs text-slate-500">{filledCount} pixels filled</span>
              </div>
            </div>

            <div
              className="inline-grid gap-px p-2 rounded-xl border border-[#1a2540] bg-[#060e1a] select-none touch-none"
              style={{ gridTemplateColumns: `repeat(${gridSize}, minmax(0, 18px))` }}
              onMouseLeave={() => setPainting(false)}
              onMouseUp={() => setPainting(false)}
            >
              {colorGrid.map((row, rowIndex) => (
                row.map((cell, colIndex) => (
                  <button
                    key={`${rowIndex}-${colIndex}`}
                    type="button"
                    className="w-[18px] h-[18px] rounded-[2px] border border-black/20"
                    style={{ backgroundColor: cell || '#0b1220' }}
                    onMouseDown={(event) => {
                      event.preventDefault();
                      setPainting(true);
                      paintCell(rowIndex, colIndex);
                    }}
                    onMouseEnter={() => {
                      if (painting) paintCell(rowIndex, colIndex);
                    }}
                  />
                ))
              ))}
            </div>

            <div className="flex flex-wrap gap-3">
              <button
                type="submit"
                disabled={saving}
                className="px-4 py-2 rounded-lg text-sm font-medium bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white"
              >
                {saving ? 'Validating & saving…' : 'Generate puzzle & save'}
              </button>
              <p className="text-xs text-slate-500 self-center">
                Saves only if the nonogram has a unique solvable solution.
              </p>
            </div>
          </form>
        )}

        {loading ? (
          <p className="text-sm text-slate-400">Loading puzzles…</p>
        ) : puzzles.length === 0 ? (
          <div className="rounded-lg border border-[#1a2540] bg-[#0b1220] p-6">
            <p className="text-sm text-slate-400">No curated puzzles are available yet.</p>
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {puzzles.map((puzzle) => {
              const status = statusLabel(puzzle);
              return (
                <section
                  key={puzzle.puzzleId}
                  className="rounded-xl border border-[#1a2540] bg-[#0b1220] overflow-hidden"
                >
                  <div className="px-5 py-4 border-b border-[#1a2540] bg-[#060e1a]/50">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <h2 className="text-base font-semibold text-white">{puzzle.title}</h2>
                        <p className="text-xs text-slate-500 mt-1">
                          {puzzle.subject || 'custom'} · {puzzle.size}x{puzzle.size} · {puzzle.difficulty}
                        </p>
                      </div>
                      <span className={`text-[10px] uppercase tracking-widest px-2 py-1 rounded border ${status.className}`}>
                        {status.text}
                      </span>
                    </div>
                  </div>

                  <div className="px-5 py-4 space-y-4">
                    <PuzzlePreview puzzle={puzzle} />

                    <div className="grid grid-cols-2 gap-3 text-xs">
                      <div className="rounded-lg border border-[#1a2540] bg-[#060e1a] px-3 py-2">
                        <p className="text-slate-500">Source</p>
                        <p className="text-slate-100 mt-1">{puzzle.source}</p>
                      </div>
                      <div className="rounded-lg border border-[#1a2540] bg-[#060e1a] px-3 py-2">
                        <p className="text-slate-500">Solutions</p>
                        <p className="text-slate-100 mt-1">{puzzle.validation?.metrics?.solutionCount ?? '—'}</p>
                      </div>
                      <div className="rounded-lg border border-[#1a2540] bg-[#060e1a] px-3 py-2">
                        <p className="text-slate-500">Used on</p>
                        <p className="text-slate-100 mt-1">{puzzle.usedOnDayKey || '—'}</p>
                      </div>
                      <div className="rounded-lg border border-[#1a2540] bg-[#060e1a] px-3 py-2">
                        <p className="text-slate-500">Scheduled</p>
                        <p className="text-slate-100 mt-1">{puzzle.scheduledFor || '—'}</p>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-end gap-2">
                      <div className="flex-1 min-w-[140px]">
                        <label className="block text-[11px] text-slate-500 mb-1">Schedule date</label>
                        <input
                          type="date"
                          disabled={puzzle.spent || busyId === puzzle.puzzleId}
                          defaultValue={puzzle.scheduledFor || ''}
                          key={`${puzzle.puzzleId}-${puzzle.scheduledFor || 'none'}`}
                          onChange={(e) => onSchedule(puzzle.puzzleId, e.target.value)}
                          className="w-full bg-[#060e1a] border border-[#1a2540] text-slate-100 text-xs rounded-lg px-2 py-2 disabled:opacity-50"
                        />
                      </div>
                      {puzzle.scheduledFor && !puzzle.spent && (
                        <button
                          type="button"
                          disabled={busyId === puzzle.puzzleId}
                          onClick={() => onSchedule(puzzle.puzzleId, null)}
                          className="px-3 py-2 rounded-lg text-xs border border-[#1a2540] text-slate-300 disabled:opacity-50"
                        >
                          Clear
                        </button>
                      )}
                      <button
                        type="button"
                        disabled={busyId === puzzle.puzzleId}
                        onClick={() => onDelete(puzzle.puzzleId)}
                        className="px-3 py-2 rounded-lg text-xs border border-rose-500/30 text-rose-300 hover:bg-rose-500/10 disabled:opacity-50"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                </section>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
