import FunTutorialShell, { makeTutorialStorage } from './FunTutorialShell';

const storage = makeTutorialStorage('nonogram:tutorial-seen');

export const hasSeenNonogramTutorial = () => storage.hasSeen();
export const markNonogramTutorialSeen = () => storage.markSeen();
export const clearNonogramTutorialSeen = () => storage.clearSeen();

export const NONOGRAM_TUTORIAL_STEPS = [
  {
    id: 'goal',
    title: 'Reveal the picture',
    body: 'Fill the grid so every row and column matches its clue numbers. When the filled cells are right, the hidden picture appears.',
    sketch: 'goal',
  },
  {
    id: 'clues',
    title: 'Read the clues',
    body: 'Numbers are consecutive filled blocks. Example: 3 1 means three filled cells, at least one empty gap, then one filled cell — in that order.',
    sketch: 'clues',
  },
  {
    id: 'paint',
    title: 'Paint and mark',
    body: 'Paint mode fills cells. Switch to X to mark empties (right-click also works). Drag across cells to paint or mark several at once.',
    sketch: 'paint',
  },
  {
    id: 'lives',
    title: 'Three lives',
    body: 'A wrong fill flashes and costs a life. X-marks are free. Lose all three lives and the puzzle ends — faster solves rank higher on the board.',
    sketch: 'lives',
  },
];

function MiniCell({ fill = false, mark = false, flash = false }) {
  let cls = 'w-5 h-5 rounded-[3px] border border-[#1a2540] bg-[#060e1a]';
  if (fill) cls = 'w-5 h-5 rounded-[3px] border border-indigo-400/50 bg-indigo-500';
  if (mark) cls = 'w-5 h-5 rounded-[3px] border border-amber-500/40 bg-[#0b1220] text-amber-300 flex items-center justify-center text-[10px] font-bold';
  if (flash) cls = 'w-5 h-5 rounded-[3px] border border-rose-400 bg-rose-500/80';
  return <div className={cls}>{mark ? '×' : null}</div>;
}

function NonogramSketch({ kind }) {
  if (kind === 'goal') {
    return (
      <div className="flex flex-col items-center gap-2">
        <div className="grid grid-cols-4 gap-0.5">
          {[1, 1, 0, 0, 1, 1, 1, 0, 0, 1, 1, 0, 0, 0, 1, 1].map((v, i) => (
            <MiniCell key={i} fill={v === 1} />
          ))}
        </div>
        <p className="text-[11px] text-slate-400">Fill cells to match the clues</p>
      </div>
    );
  }
  if (kind === 'clues') {
    return (
      <div className="flex flex-col items-center gap-2 w-full">
        <div className="flex items-center gap-2">
          <span className="font-mono text-indigo-200 text-sm w-8 text-right">3 1</span>
          <div className="flex gap-0.5">
            <MiniCell fill />
            <MiniCell fill />
            <MiniCell fill />
            <MiniCell />
            <MiniCell fill />
          </div>
        </div>
        <p className="text-[11px] text-slate-400 text-center">Three filled · gap · one filled</p>
      </div>
    );
  }
  if (kind === 'paint') {
    return (
      <div className="flex flex-wrap items-center justify-center gap-4 w-full">
        <div className="flex flex-col items-center gap-1">
          <div className="flex gap-0.5">
            <MiniCell fill />
            <MiniCell fill />
            <MiniCell />
          </div>
          <span className="text-[11px] text-indigo-200">Paint</span>
        </div>
        <div className="flex flex-col items-center gap-1">
          <div className="flex gap-0.5">
            <MiniCell mark />
            <MiniCell />
            <MiniCell mark />
          </div>
          <span className="text-[11px] text-amber-200">X marks</span>
        </div>
      </div>
    );
  }
  return (
    <div className="flex flex-col items-center gap-3 w-full">
      <div className="flex gap-1.5 text-lg" aria-hidden="true">
        <span>❤️</span>
        <span>❤️</span>
        <span className="opacity-35">🖤</span>
      </div>
      <div className="flex gap-0.5">
        <MiniCell fill />
        <MiniCell flash />
        <MiniCell />
      </div>
      <p className="text-[11px] text-rose-300 text-center">Wrong fill · lose a life</p>
    </div>
  );
}

export default function NonogramTutorialModal({ open, onClose }) {
  return (
    <FunTutorialShell
      open={open}
      onClose={onClose}
      onFinish={(dontShowAgain) => {
        if (dontShowAgain) markNonogramTutorialSeen();
      }}
      eyebrow="How to play Nonogram"
      accent="sky"
      steps={NONOGRAM_TUTORIAL_STEPS}
      renderSketch={(kind) => <NonogramSketch kind={kind} />}
    />
  );
}
