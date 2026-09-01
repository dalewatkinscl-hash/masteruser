import { useCallback, useEffect, useState } from 'react';
import { getLondonDayKey } from './FunDayPicker';
import CasefileTutorialModal, {
  hasSeenCasefileTutorial,
} from './CasefileTutorialModal';
import {
  CASEFILE_ASSET_BASE,
  CASEFILE_PEOPLE,
  CASEFILE_SEED_PUZZLES,
  CASEFILE_SIZE,
  clonePuzzle,
  evaluateCasefile,
  generateCasefilePuzzle,
  getObject,
  getPerson,
  getPuzzleById,
  getPuzzleForDay,
  getRoom,
  marksFromPlacement,
  roomIdAt,
} from '../lib/casefile';

const CELL = 48;
const WALL = 16;

function PixelSheet({
  src,
  sheetW,
  sheetH,
  x,
  y,
  w,
  h,
  scale = 2,
  className = '',
}) {
  return (
    <div
      className={`pointer-events-none casefile-pixel ${className}`}
      style={{
        width: w * scale,
        height: h * scale,
        imageRendering: 'pixelated',
        backgroundImage: `url(${src})`,
        backgroundRepeat: 'no-repeat',
        backgroundPosition: `${-x * scale}px ${-y * scale}px`,
        backgroundSize: `${sheetW * scale}px ${sheetH * scale}px`,
      }}
      aria-hidden
    />
  );
}

function FurnitureSprite({ id }) {
  const art = getObject(id);
  if (!art?.src) return null;
  const scale = CELL / 16;
  return (
    <img
      src={art.src}
      alt=""
      className="pointer-events-none casefile-pixel"
      style={{
        width: art.w * scale,
        height: art.h * scale,
        imageRendering: 'pixelated',
      }}
    />
  );
}

function PersonSprite({ person, scale = 3 }) {
  if (!person?.sprite) {
    return (
      <div
        className="flex items-end justify-center pointer-events-none"
        style={{ width: 16 * scale, height: 32 * scale }}
      >
        <div
          className="rounded-sm border border-rose-300/80 bg-rose-950/80 text-[10px] font-bold text-rose-100 flex items-center justify-center"
          style={{ width: 14 * scale, height: 18 * scale }}
        >
          V
        </div>
      </div>
    );
  }
  return (
    <PixelSheet
      src={person.sprite}
      sheetW={64}
      sheetH={32}
      x={48}
      y={0}
      w={16}
      h={32}
      scale={scale}
    />
  );
}

function objectAt(puzzle, row, col) {
  return (puzzle.objects || []).find((o) => o.row === row && o.col === col) || null;
}

function personAt(placement, row, col) {
  for (const person of CASEFILE_PEOPLE) {
    const pos = placement[person.id];
    if (pos && pos.row === row && pos.col === col) return person.id;
  }
  return null;
}

function WallRun({ src, vertical = false }) {
  return (
    <div
      className="casefile-pixel"
      style={{
        backgroundImage: `url(${src})`,
        backgroundRepeat: vertical ? 'repeat-y' : 'repeat-x',
        backgroundSize: '16px 16px',
        imageRendering: 'pixelated',
        width: vertical ? WALL : '100%',
        height: vertical ? '100%' : WALL,
      }}
      aria-hidden
    />
  );
}

function RoomTiles({
  room,
  puzzle,
  placement,
  marks,
  selectedId,
  onCell,
  disabled,
}) {
  const cells = [];
  for (let row = 0; row < CASEFILE_SIZE; row += 1) {
    for (let col = 0; col < CASEFILE_SIZE; col += 1) {
      if (roomIdAt(row, col) === room.id) cells.push({ row, col });
    }
  }
  return (
    <div className="relative overflow-visible" style={{ width: CELL * 3, height: CELL * 3 }}>
      <div className="grid grid-cols-3">
        {cells.map(({ row, col }) => {
          const occupant = personAt(placement, row, col);
          const occupantPerson = occupant ? getPerson(occupant) : null;
          const obj = objectAt(puzzle, row, col);
          const art = obj ? getObject(obj.id) : null;
          const marked = marks[row]?.[col];
          const selectedHere = occupant && occupant === selectedId;
          return (
            <button
              key={`${row}-${col}`}
              type="button"
              disabled={disabled}
              onClick={() => onCell(row, col, 'place')}
              onContextMenu={(event) => {
                event.preventDefault();
                onCell(row, col, 'mark');
              }}
              title={art ? `${room.name} · ${art.label}` : `${room.name} · row ${row + 1}, column ${col + 1}`}
              className={`relative ${disabled ? 'cursor-default' : 'cursor-pointer hover:brightness-110'}`}
              style={{
                width: CELL,
                height: CELL,
                backgroundImage: `url(${room.floor})`,
                backgroundSize: '100% 100%',
                imageRendering: 'pixelated',
              }}
            >
              {obj ? (
                <div className="absolute inset-x-0 bottom-0 z-[1] flex justify-center pointer-events-none">
                  <FurnitureSprite id={obj.id} />
                </div>
              ) : null}
              {marked && !occupant ? (
                <span className="absolute inset-0 z-[2] flex items-center justify-center text-black/55 text-xl font-bold pointer-events-none">
                  ×
                </span>
              ) : null}
              {occupantPerson ? (
                <div className={`absolute inset-x-0 bottom-0 z-[3] flex justify-center ${selectedHere ? 'drop-shadow-[0_0_6px_#818cf8]' : ''}`}>
                  <PersonSprite person={occupantPerson} scale={3} />
                </div>
              ) : null}
            </button>
          );
        })}
      </div>
      <span className="absolute top-0.5 left-1 z-[4] text-[9px] font-bold uppercase tracking-wider text-white drop-shadow-[0_1px_1px_#000] pointer-events-none">
        {room.name}
      </span>
    </div>
  );
}

function CasefileBoard({
  puzzle,
  placement,
  marks,
  selectedId,
  onCell,
  disabled,
}) {
  const lounge = getRoom('lounge');
  const kitchen = getRoom('kitchen');
  const study = getRoom('study');
  const hall = getRoom('hall');
  const frame = `${CASEFILE_ASSET_BASE}/art/wall-terra.png`;

  return (
    <div
      className="inline-block casefile-pixel"
      style={{
        padding: WALL,
        backgroundImage: `url(${frame})`,
        backgroundRepeat: 'repeat',
        backgroundSize: '16px 16px',
        imageRendering: 'pixelated',
      }}
    >
      <div
        className="grid"
        style={{
          gridTemplateColumns: `${CELL * 3}px ${WALL}px ${CELL * 3}px`,
          gridTemplateRows: `${CELL * 3}px ${WALL}px ${CELL * 3}px`,
        }}
      >
        <RoomTiles room={lounge} puzzle={puzzle} placement={placement} marks={marks} selectedId={selectedId} onCell={onCell} disabled={disabled} />
        <WallRun src={kitchen.wall} vertical />
        <RoomTiles room={kitchen} puzzle={puzzle} placement={placement} marks={marks} selectedId={selectedId} onCell={onCell} disabled={disabled} />
        <WallRun src={study.wall} />
        <WallRun src={hall.wall} />
        <WallRun src={hall.wall} />
        <RoomTiles room={study} puzzle={puzzle} placement={placement} marks={marks} selectedId={selectedId} onCell={onCell} disabled={disabled} />
        <WallRun src={hall.wall} vertical />
        <RoomTiles room={hall} puzzle={puzzle} placement={placement} marks={marks} selectedId={selectedId} onCell={onCell} disabled={disabled} />
      </div>
    </div>
  );
}

function CasefilePlayArea({ puzzle, sandbox = false }) {
  const [placement, setPlacement] = useState({});
  const [marks, setMarks] = useState(() => marksFromPlacement({}, puzzle?.objects));
  const [selectedId, setSelectedId] = useState(CASEFILE_PEOPLE[0].id);
  const [tool, setTool] = useState('place');
  const [accused, setAccused] = useState('');
  const [result, setResult] = useState(null);
  const [message, setMessage] = useState('');
  const [tutorialOpen, setTutorialOpen] = useState(false);

  useEffect(() => {
    if (!hasSeenCasefileTutorial()) setTutorialOpen(true);
  }, []);

  useEffect(() => {
    setPlacement({});
    setMarks(marksFromPlacement({}, puzzle?.objects));
    setSelectedId(CASEFILE_PEOPLE[0].id);
    setTool('place');
    setAccused('');
    setResult(null);
    setMessage('');
  }, [puzzle?.id, puzzle?.objects]);

  const placedCount = Object.keys(placement).length;
  const finished = Boolean(result?.solved);

  const onCell = useCallback((row, col, action) => {
    if (finished) return;
    const intent = action === 'mark' || tool === 'mark' ? 'mark' : 'place';
    if (intent === 'mark') {
      setMarks((prev) => {
        const next = prev.map((line) => [...line]);
        next[row][col] = !next[row][col];
        return next;
      });
      return;
    }
    const furniture = objectAt(puzzle, row, col);
    if (furniture) {
      setMessage(`That square is ${getObject(furniture.id)?.label || 'furniture'}. Stand in a neighbouring square.`);
      return;
    }
    const occupant = personAt(placement, row, col);
    if (occupant === selectedId) {
      setPlacement((prev) => {
        const next = { ...prev };
        delete next[selectedId];
        setMarks(marksFromPlacement(next, puzzle?.objects));
        return next;
      });
      return;
    }
    setPlacement((prev) => {
      const next = { ...prev };
      delete next[selectedId];
      for (const [pid, pos] of Object.entries(next)) {
        if (pos.row === row || pos.col === col) delete next[pid];
      }
      next[selectedId] = { row, col };
      setMarks(marksFromPlacement(next, puzzle?.objects));
      return next;
    });
    setMessage('');
  }, [finished, placement, puzzle, selectedId, tool]);

  const submit = () => {
    const check = evaluateCasefile(puzzle, placement, accused);
    setResult(check);
    if (check.solved) {
      setMessage(`Solved — ${getPerson(check.murderer)?.shortName || getPerson(check.murderer)?.name} did it.`);
    } else if (!check.seatsOk) {
      setMessage(`${check.correctSeats} of ${check.total} people are in the right seat.`);
    } else {
      setMessage('The layout is right, but that’s the wrong suspect.');
    }
  };

  const reveal = () => {
    const next = clonePuzzle(puzzle.solution.placement);
    setPlacement(next);
    setAccused(puzzle.solution.murderer);
    setMarks(marksFromPlacement(next, puzzle?.objects));
    setResult(null);
    setMessage('Solution shown — sandbox only.');
  };

  const reset = () => {
    setPlacement({});
    setMarks(marksFromPlacement({}, puzzle?.objects));
    setAccused('');
    setResult(null);
    setMessage('');
  };

  const clueFor = (personId) => (puzzle.clues || []).find((c) => c.person === personId);

  return (
    <div className="space-y-4">
      <CasefileTutorialModal open={tutorialOpen} onClose={() => setTutorialOpen(false)} />

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-slate-300">
          <span className="text-white font-semibold">{puzzle.title}</span>
          {' · '}
          {placedCount}/{CASEFILE_PEOPLE.length} placed
        </p>
        <div className="flex flex-wrap gap-2">
          {sandbox ? (
            <span className="text-amber-200/90 border border-amber-500/30 bg-amber-500/10 rounded-md px-2 py-1 text-xs">
              Dev sandbox · not on Fun rotation
            </span>
          ) : null}
          <button
            type="button"
            onClick={() => setTutorialOpen(true)}
            className="px-3 py-1.5 rounded-lg text-xs font-medium border border-sky-500/35 text-sky-100 hover:bg-sky-500/10"
          >
            How to play
          </button>
        </div>
      </div>

      <p className="text-sm text-slate-400 max-w-3xl">
        Place every person (one per row and column) so each person’s clue is true. Placing someone
        crosses out the rest of their row and column. “Beside the plant” means a square next to the
        plant tile, not diagonal. Then accuse whoever was left alone with the victim in the same room.
      </p>

      <div className="flex flex-wrap gap-6 items-start">
        <CasefileBoard
          puzzle={puzzle}
          placement={placement}
          marks={marks}
          selectedId={selectedId}
          onCell={onCell}
          disabled={finished}
        />

        <div className="space-y-2 min-w-[16rem] flex-1">
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setTool('place')}
              className={`px-2.5 py-1 rounded-md text-xs border ${tool === 'place' ? 'bg-indigo-600 text-white border-indigo-500' : 'border-[#1a2540] text-slate-300'}`}
            >
              Place
            </button>
            <button
              type="button"
              onClick={() => setTool('mark')}
              className={`px-2.5 py-1 rounded-md text-xs border ${tool === 'mark' ? 'bg-slate-600 text-white border-slate-500' : 'border-[#1a2540] text-slate-300'}`}
            >
              Mark ×
            </button>
          </div>
          {CASEFILE_PEOPLE.map((person) => {
            const clue = clueFor(person.id);
            const placed = Boolean(placement[person.id]);
            const selected = selectedId === person.id;
            const isAccused = accused === person.id;
            return (
              <button
                key={person.id}
                type="button"
                onClick={() => {
                  setSelectedId(person.id);
                  setTool('place');
                  if (person.role === 'suspect') setAccused(person.id);
                }}
                className={`w-full text-left rounded-xl border px-3 py-2 flex gap-3 items-center ${
                  selected ? 'border-indigo-400 bg-indigo-500/10' : 'border-[#1a2540] bg-[#060e1a]'
                } ${isAccused ? 'ring-1 ring-rose-400/60' : ''}`}
              >
                <div className="w-10 h-12 flex items-end justify-center shrink-0">
                  <PersonSprite person={person} scale={1.8} />
                </div>
                <div className="min-w-0">
                  <p className="text-sm text-slate-100 font-medium flex items-center gap-2">
                    {person.shortName || person.name}
                    {placed ? <span className="text-[10px] text-emerald-300">placed</span> : null}
                    {isAccused && person.role === 'suspect' ? (
                      <span className="text-[10px] text-rose-300">accused</span>
                    ) : null}
                  </p>
                  <p className="text-xs text-slate-400 leading-snug">
                    {clue?.text || (person.role === 'victim' ? 'Do not accuse the victim.' : 'No clue for this person.')}
                  </p>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={submit}
          disabled={placedCount < CASEFILE_PEOPLE.length || !accused}
          className="px-3 py-2 rounded-lg text-sm bg-indigo-600 text-white disabled:opacity-40"
        >
          Submit case
        </button>
        <button
          type="button"
          onClick={reset}
          className="px-3 py-2 rounded-lg text-sm border border-[#1a2540] text-slate-300 hover:bg-white/[0.04]"
        >
          Start over
        </button>
        {sandbox ? (
          <button
            type="button"
            onClick={reveal}
            className="px-3 py-2 rounded-lg text-sm border border-amber-500/40 text-amber-100 hover:bg-amber-500/10"
          >
            Reveal solution
          </button>
        ) : null}
      </div>
      {message ? (
        <p className={`text-sm ${result?.solved ? 'text-emerald-300' : 'text-amber-200'}`}>{message}</p>
      ) : null}
    </div>
  );
}

export function CasefileSandbox() {
  const todayKey = getLondonDayKey();
  const [mode, setMode] = useState('seed');
  const [seedId, setSeedId] = useState(CASEFILE_SEED_PUZZLES[0]?.id || '');
  const [dayKey, setDayKey] = useState(todayKey);
  const [puzzle, setPuzzle] = useState(() => CASEFILE_SEED_PUZZLES[0] || getPuzzleForDay(todayKey));
  const [error, setError] = useState('');

  const loadSeed = () => {
    const next = getPuzzleById(seedId);
    if (next) {
      setPuzzle(clonePuzzle(next));
      setError('');
    }
  };

  const loadDay = () => {
    try {
      setPuzzle(getPuzzleForDay(dayKey || todayKey));
      setError('');
    } catch (err) {
      setError(err.message || 'Could not build that day’s case.');
    }
  };

  const loadRandom = () => {
    try {
      setPuzzle(generateCasefilePuzzle({
        seed: `casefile:rand:${Date.now()}`,
        title: 'Random case',
      }));
      setError('');
    } catch (err) {
      setError(err.message || 'Could not generate a case.');
    }
  };

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-[#1a2540] p-4 space-y-3">
        <p className="text-sm text-slate-300">
          Admin sandbox for <span className="text-white font-medium">Casefile</span> — a Murdoku-style
          scene puzzle. One clue per person. The office is LimeZu tile art: four rooms with different
          floors and wall tiles between them. Generated from a known layout until the solver finds
          exactly one solution. Dev-only; not in Fun rotation.
        </p>
        <div className="flex flex-wrap gap-3 items-end">
          <label className="text-xs text-slate-400 space-y-1">
            Mode
            <select
              value={mode}
              onChange={(e) => setMode(e.target.value)}
              className="block bg-[#060e1a] border border-[#1a2540] rounded-md px-3 py-2 text-sm text-slate-100"
            >
              <option value="seed">Seed puzzle</option>
              <option value="day">Day key</option>
              <option value="random">Random</option>
            </select>
          </label>
          {mode === 'seed' ? (
            <>
              <label className="text-xs text-slate-400 space-y-1">
                Seed
                <select
                  value={seedId}
                  onChange={(e) => setSeedId(e.target.value)}
                  className="block bg-[#060e1a] border border-[#1a2540] rounded-md px-3 py-2 text-sm text-slate-100"
                >
                  {CASEFILE_SEED_PUZZLES.map((p) => (
                    <option key={p.id} value={p.id}>{p.title}</option>
                  ))}
                </select>
              </label>
              <button type="button" onClick={loadSeed} className="px-3 py-2 rounded-lg text-sm border border-[#1a2540] text-slate-200">
                Load seed
              </button>
            </>
          ) : null}
          {mode === 'day' ? (
            <>
              <label className="text-xs text-slate-400 space-y-1">
                Day
                <input
                  type="date"
                  value={dayKey}
                  onChange={(e) => setDayKey(e.target.value)}
                  className="block bg-[#060e1a] border border-[#1a2540] rounded-md px-3 py-2 text-sm text-slate-100"
                />
              </label>
              <button type="button" onClick={loadDay} className="px-3 py-2 rounded-lg text-sm border border-[#1a2540] text-slate-200">
                Load day
              </button>
            </>
          ) : null}
          {mode === 'random' ? (
            <button type="button" onClick={loadRandom} className="px-3 py-2 rounded-lg text-sm border border-[#1a2540] text-slate-200">
              New random case
            </button>
          ) : null}
        </div>
        {error ? <p className="text-sm text-rose-300">{error}</p> : null}
      </div>
      {puzzle ? <CasefilePlayArea key={puzzle.id} puzzle={puzzle} sandbox /> : null}
    </div>
  );
}

export default function CasefilePanel({ puzzle, sandbox = false }) {
  return <CasefilePlayArea puzzle={puzzle} sandbox={sandbox} />;
}
