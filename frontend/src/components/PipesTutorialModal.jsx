import FunTutorialShell, { makeTutorialStorage } from './FunTutorialShell';

const storage = makeTutorialStorage('pipes:tutorial-seen');

export const hasSeenPipesTutorial = () => storage.hasSeen();
export const markPipesTutorialSeen = () => storage.markSeen();
export const clearPipesTutorialSeen = () => storage.clearSeen();

export const PIPES_TUTORIAL_STEPS = [
  {
    id: 'goal',
    title: 'Fill every tile with water',
    body: 'Every square on the board is a pipe tile. Your job is to rotate them until water can reach every single tile — the whole grid lights up green. If even one tile is dry, you have not finished.',
    sketch: 'goal',
  },
  {
    id: 'rotate',
    title: 'Click to rotate',
    body: 'Tap a tile to turn it 90° clockwise. Shift-click (or Ctrl-click) turns the other way. Right-click pins a tile you are sure about so you do not bump it by accident.',
    sketch: 'rotate',
  },
  {
    id: 'connect',
    title: 'Openings must meet',
    body: 'Water only flows when two neighbouring tiles open toward each other. A dead end against a blank side stays dry. Keep turning until every pipe joins the network.',
    sketch: 'connect',
  },
  {
    id: 'score',
    title: 'Faster time wins',
    body: 'The leaderboard ranks by time to fill the whole board. Moves are shown for interest, but the score that counts is your clock. Start the day, fill every tile, submit once.',
    sketch: 'score',
  },
];

function MiniBoard({ lit = false, highlight = -1 }) {
  const cells = [
    [1 | 2, 8 | 2, 8 | 4],
    [1 | 4, 0, 1 | 4],
    [1 | 2, 8 | 2, 8 | 1],
  ];
  const N = 1;
  const E = 2;
  const S = 4;
  const W = 8;
  return (
    <svg viewBox="0 0 100 100" className="w-40 h-40" aria-hidden>
      {cells.map((row, r) => row.map((mask, c) => {
        const x = 8 + c * 28;
        const y = 8 + r * 28;
        const i = r * 3 + c;
        const on = lit || i === highlight;
        const stroke = on ? '#34d399' : '#64748b';
        const cx = x + 14;
        const cy = y + 14;
        return (
          <g key={`${r}-${c}`}>
            <rect x={x} y={y} width="26" height="26" rx="4" fill="#060e1a" stroke="#1e293b" strokeWidth="1" />
            {mask & N ? <line x1={cx} y1={cy} x2={cx} y2={y + 1} stroke={stroke} strokeWidth="5" /> : null}
            {mask & E ? <line x1={cx} y1={cy} x2={x + 25} y2={cy} stroke={stroke} strokeWidth="5" /> : null}
            {mask & S ? <line x1={cx} y1={cy} x2={cx} y2={y + 25} stroke={stroke} strokeWidth="5" /> : null}
            {mask & W ? <line x1={cx} y1={cy} x2={x + 1} y2={cy} stroke={stroke} strokeWidth="5" /> : null}
            <circle cx={cx} cy={cy} r="3.5" fill={stroke} />
          </g>
        );
      }))}
    </svg>
  );
}

function PipesSketch({ kind }) {
  if (kind === 'rotate') {
    return (
      <div className="text-center space-y-2">
        <p className="text-[11px] text-indigo-200 border border-indigo-500/30 rounded-md px-2 py-1">
          Click · rotate 90°
        </p>
        <MiniBoard highlight={4} />
      </div>
    );
  }
  if (kind === 'connect') {
    return <MiniBoard highlight={1} />;
  }
  if (kind === 'score') {
    return (
      <div className="text-center space-y-2">
        <p className="text-[11px] text-emerald-200 border border-emerald-500/30 rounded-md px-2 py-1">
          01:24 · filled every tile
        </p>
        <MiniBoard lit />
      </div>
    );
  }
  return <MiniBoard lit />;
}

export default function PipesTutorialModal({ open, onClose }) {
  return (
    <FunTutorialShell
      open={open}
      onClose={onClose}
      onFinish={(dontShowAgain) => {
        if (dontShowAgain) markPipesTutorialSeen();
      }}
      eyebrow="How to play Pipes"
      accent="sky"
      titleId="pipes-tutorial-title"
      steps={PIPES_TUTORIAL_STEPS}
      renderSketch={(kind) => <PipesSketch kind={kind} />}
    />
  );
}
