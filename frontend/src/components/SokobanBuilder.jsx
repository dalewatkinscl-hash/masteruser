import { useMemo, useState } from 'react';
import {
  SOKOBAN_TOOLS,
  DEFAULT_SOKOBAN_WIDTH,
  DEFAULT_SOKOBAN_HEIGHT,
  createEmptyGrid,
  placeChar,
  resizeGrid,
  validateSokobanGrid,
  cellVisual,
  layoutFromGrid,
  gridFromLayout,
} from '../lib/sokobanEditor';

async function readJsonResponse(res) {
  const contentType = res.headers.get('content-type') || '';
  if (!contentType.includes('application/json')) return null;
  try {
    return await res.json();
  } catch {
    return null;
  }
}

export default function SokobanBuilder({ onSaved }) {
  const [title, setTitle] = useState('Custom Sokoban');
  const [difficulty, setDifficulty] = useState('medium');
  const [scheduledFor, setScheduledFor] = useState('');
  const [width, setWidth] = useState(DEFAULT_SOKOBAN_WIDTH);
  const [height, setHeight] = useState(DEFAULT_SOKOBAN_HEIGHT);
  const [grid, setGrid] = useState(() => createEmptyGrid());
  const [activeTool, setActiveTool] = useState(SOKOBAN_TOOLS[0]);
  const [painting, setPainting] = useState(false);
  const [dragChar, setDragChar] = useState(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const validation = useMemo(() => validateSokobanGrid(grid), [grid]);

  const applyToolAt = (row, col, char) => {
    setGrid((prev) => placeChar(prev, row, col, char));
  };

  const onResize = () => {
    setGrid((prev) => resizeGrid(prev, height, width));
  };

  const fillBorder = () => {
    setGrid((prev) => {
      const next = prev.map((row) => [...row]);
      const h = next.length;
      const w = next[0]?.length || 0;
      for (let r = 0; r < h; r += 1) {
        for (let c = 0; c < w; c += 1) {
          if (r === 0 || c === 0 || r === h - 1 || c === w - 1) next[r][c] = '#';
        }
      }
      return next;
    });
  };

  const clearInterior = () => {
    setGrid((prev) => {
      const next = prev.map((row) => [...row]);
      const h = next.length;
      const w = next[0]?.length || 0;
      for (let r = 0; r < h; r += 1) {
        for (let c = 0; c < w; c += 1) {
          if (r === 0 || c === 0 || r === h - 1 || c === w - 1) next[r][c] = '#';
          else next[r][c] = ' ';
        }
      }
      const pr = Math.floor(h / 2);
      const pc = Math.floor(w / 2);
      if (next[pr]?.[pc] === ' ') next[pr][pc] = '@';
      return next;
    });
  };

  const save = async () => {
    setError('');
    setMessage('');
    const check = validateSokobanGrid(grid);
    if (!check.ok) {
      setError(check.errors.join(' '));
      return;
    }
    try {
      setSaving(true);
      const response = await fetch('/api/adminSaveFunContent', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'sokoban',
          title: title.trim() || 'Custom Sokoban',
          difficulty,
          layout: check.layout,
          scheduledFor: scheduledFor || null,
          status: 'published',
        }),
      });
      const payload = (await readJsonResponse(response)) || {};
      if (!response.ok) throw new Error(payload.error || 'Save failed.');
      setMessage(`Saved ${payload.id}${scheduledFor ? ` · scheduled ${scheduledFor}` : ''}.`);
      onSaved?.();
    } catch (err) {
      setError(err.message || 'Save failed.');
    } finally {
      setSaving(false);
    }
  };

  const loadLayoutText = () => {
    const raw = window.prompt('Paste XSB layout (one row per line):');
    if (!raw) return;
    const lines = raw.split(/\r?\n/).filter((line) => line.length > 0);
    if (!lines.length) return;
    const next = gridFromLayout(lines);
    setGrid(next);
    setHeight(next.length);
    setWidth(next[0]?.length || DEFAULT_SOKOBAN_WIDTH);
  };

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-[#1a2540] p-4 space-y-3">
        <p className="text-sm text-slate-300">
          Drag palette pieces onto the grid (or select a tool and paint). Walls, floors, goals, boxes, and the player.
          Schedule a day to override the procedural daily level.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <label className="text-xs text-slate-400 space-y-1">
            Title
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="block w-full bg-[#060e1a] border border-[#1a2540] rounded-md px-3 py-2 text-sm text-slate-100"
            />
          </label>
          <label className="text-xs text-slate-400 space-y-1">
            Difficulty
            <select
              value={difficulty}
              onChange={(e) => setDifficulty(e.target.value)}
              className="block w-full bg-[#060e1a] border border-[#1a2540] rounded-md px-3 py-2 text-sm text-slate-100"
            >
              <option value="easy">easy</option>
              <option value="medium">medium</option>
              <option value="hard">hard</option>
              <option value="custom">custom</option>
            </select>
          </label>
          <label className="text-xs text-slate-400 space-y-1">
            Schedule for (optional)
            <input
              type="date"
              value={scheduledFor}
              onChange={(e) => setScheduledFor(e.target.value)}
              className="block w-full bg-[#060e1a] border border-[#1a2540] rounded-md px-3 py-2 text-sm text-slate-100"
            />
          </label>
          <div className="flex flex-wrap gap-2 items-end">
            <label className="text-xs text-slate-400 space-y-1">
              W
              <input
                type="number"
                min={3}
                max={16}
                value={width}
                onChange={(e) => setWidth(Number(e.target.value) || 3)}
                className="block w-20 bg-[#060e1a] border border-[#1a2540] rounded-md px-2 py-2 text-sm text-slate-100"
              />
            </label>
            <label className="text-xs text-slate-400 space-y-1">
              H
              <input
                type="number"
                min={3}
                max={16}
                value={height}
                onChange={(e) => setHeight(Number(e.target.value) || 3)}
                className="block w-20 bg-[#060e1a] border border-[#1a2540] rounded-md px-2 py-2 text-sm text-slate-100"
              />
            </label>
            <button
              type="button"
              onClick={onResize}
              className="rounded-lg border border-[#1a2540] px-3 py-2 text-sm text-slate-200 hover:bg-[#0b1220]"
            >
              Resize
            </button>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          {SOKOBAN_TOOLS.map((tool) => (
            <button
              key={tool.id}
              type="button"
              draggable
              onDragStart={(e) => {
                e.dataTransfer.setData('text/sokoban-char', tool.char);
                e.dataTransfer.effectAllowed = 'copy';
                setDragChar(tool.char);
              }}
              onDragEnd={() => setDragChar(null)}
              onClick={() => setActiveTool(tool)}
              className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-xs ${
                activeTool.id === tool.id
                  ? 'border-indigo-400 bg-indigo-500/20 text-white'
                  : 'border-[#1a2540] text-slate-300 hover:bg-[#0b1220]'
              }`}
              title={`Drag onto grid or click to select · ${tool.label}`}
            >
              <span className={`inline-block w-5 h-5 rounded border border-white/20 ${tool.color}`} />
              {tool.label}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={fillBorder} className="rounded-lg border border-[#1a2540] px-3 py-1.5 text-xs text-slate-300 hover:bg-[#0b1220]">
            Fill border walls
          </button>
          <button type="button" onClick={clearInterior} className="rounded-lg border border-[#1a2540] px-3 py-1.5 text-xs text-slate-300 hover:bg-[#0b1220]">
            Clear interior
          </button>
          <button type="button" onClick={() => setGrid(createEmptyGrid(height, width))} className="rounded-lg border border-[#1a2540] px-3 py-1.5 text-xs text-slate-300 hover:bg-[#0b1220]">
            Reset grid
          </button>
          <button type="button" onClick={loadLayoutText} className="rounded-lg border border-[#1a2540] px-3 py-1.5 text-xs text-slate-300 hover:bg-[#0b1220]">
            Paste XSB
          </button>
          <button
            type="button"
            onClick={() => {
              const text = layoutFromGrid(grid).join('\n');
              navigator.clipboard?.writeText(text);
              setMessage('Layout copied to clipboard.');
            }}
            className="rounded-lg border border-[#1a2540] px-3 py-1.5 text-xs text-slate-300 hover:bg-[#0b1220]"
          >
            Copy XSB
          </button>
        </div>
      </div>

      <div
        className="rounded-xl border border-[#1a2540] p-3 overflow-auto select-none touch-none"
        onMouseUp={() => setPainting(false)}
        onMouseLeave={() => setPainting(false)}
      >
        <div
          className="inline-grid gap-0.5 mx-auto"
          style={{ gridTemplateColumns: `repeat(${grid[0]?.length || 1}, minmax(0, 1fr))` }}
        >
          {grid.map((row, r) => row.map((ch, c) => {
            const visual = cellVisual(ch);
            return (
              <div
                key={`${r}-${c}`}
                role="gridcell"
                onMouseDown={(e) => {
                  e.preventDefault();
                  setPainting(true);
                  applyToolAt(r, c, activeTool.char);
                }}
                onMouseEnter={() => {
                  if (painting) applyToolAt(r, c, activeTool.char);
                }}
                onDragOver={(e) => {
                  e.preventDefault();
                  e.dataTransfer.dropEffect = 'copy';
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  const dropped = e.dataTransfer.getData('text/sokoban-char') || dragChar;
                  if (dropped !== null && dropped !== undefined && dropped !== '') {
                    applyToolAt(r, c, dropped);
                  }
                  setDragChar(null);
                }}
                className={`w-8 h-8 sm:w-9 sm:h-9 border flex items-center justify-center text-sm font-bold cursor-crosshair ${visual.className}`}
                title={`${r},${c}`}
              >
                {visual.label}
              </div>
            );
          }))}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3 justify-between">
        <p className={`text-xs ${validation.ok ? 'text-emerald-300' : 'text-amber-300'}`}>
          {validation.ok
            ? `Valid · ${validation.boxes} boxes · ${validation.width}×${validation.height}`
            : validation.errors.join(' · ')}
        </p>
        <button
          type="button"
          disabled={saving || !validation.ok}
          onClick={save}
          className="rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 px-4 py-2 text-sm text-white"
        >
          {saving ? 'Saving…' : 'Save level'}
        </button>
      </div>

      {error ? <p className="text-sm text-rose-300">{error}</p> : null}
      {message ? <p className="text-sm text-emerald-300">{message}</p> : null}
    </div>
  );
}
