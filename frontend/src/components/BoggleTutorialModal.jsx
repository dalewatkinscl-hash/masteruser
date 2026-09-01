import FunTutorialShell, { makeTutorialStorage } from './FunTutorialShell';

const storage = makeTutorialStorage('boggle:tutorial-seen');

export const hasSeenBoggleTutorial = () => storage.hasSeen();
export const markBoggleTutorialSeen = () => storage.markSeen();
export const clearBoggleTutorialSeen = () => storage.clearSeen();

export const BOGGLE_TUTORIAL_STEPS = [
  {
    id: 'start',
    title: 'Start the round',
    body: 'Letters stay hidden until you hit Start game. Then you get three minutes on the clock — or submit early when you’re done.',
    sketch: 'start',
  },
  {
    id: 'drag',
    title: 'Drag out words',
    body: 'Drag through adjacent letters (including diagonals). Don’t reuse a cell in the same word. Words need at least three letters.',
    sketch: 'drag',
  },
  {
    id: 'qu',
    title: 'Qu counts as two',
    body: 'A Qu tile adds both Q and U to your word. Only dictionary words on the board score — duplicates don’t count twice.',
    sketch: 'qu',
  },
  {
    id: 'score',
    title: 'Rack up points',
    body: 'Scoring: 3 letters = 1 pt, 4 = 2, 5 = 3, and so on. Higher score ranks first, then more words. Ready to start?',
    sketch: 'score',
  },
];

function Die({ letter, active = false }) {
  return (
    <div
      className={`w-8 h-8 rounded-md border flex items-center justify-center text-sm font-bold uppercase ${
        active
          ? 'bg-indigo-600 border-indigo-400 text-white'
          : 'bg-[#0b1220] border-[#1a2540] text-slate-200'
      }`}
    >
      {letter}
    </div>
  );
}

function BoggleSketch({ kind }) {
  if (kind === 'start') {
    return (
      <div className="flex flex-col items-center gap-3 w-full">
        <div className="grid grid-cols-4 gap-1 opacity-40">
          {Array.from({ length: 16 }).map((_, i) => (
            <div key={i} className="w-7 h-7 rounded-md border border-[#1a2540] bg-[#060e1a]" />
          ))}
        </div>
        <span className="text-xs font-semibold bg-indigo-600 text-white rounded-lg px-3 py-1.5">
          Start game
        </span>
      </div>
    );
  }
  if (kind === 'drag') {
    const letters = ['C', 'A', 'T', 'S', 'O', 'R', 'E', 'N', 'L', 'I', 'P', 'D', 'M', 'U', 'G', 'H'];
    const path = new Set([0, 1, 2]);
    return (
      <div className="flex flex-col items-center gap-2 w-full">
        <div className="grid grid-cols-4 gap-1">
          {letters.map((ch, i) => (
            <Die key={i} letter={ch} active={path.has(i)} />
          ))}
        </div>
        <p className="text-[11px] text-indigo-200 font-medium">CAT</p>
      </div>
    );
  }
  if (kind === 'qu') {
    return (
      <div className="flex flex-col items-center gap-2 w-full">
        <div className="flex gap-1">
          <Die letter="Qu" active />
          <Die letter="I" active />
          <Die letter="T" active />
        </div>
        <p className="text-[11px] text-slate-400 text-center">Qu + I + T → QUIT</p>
      </div>
    );
  }
  return (
    <div className="flex flex-col items-center gap-2 w-full">
      <div className="grid grid-cols-3 gap-2 text-center text-xs w-full max-w-[14rem]">
        {[
          ['3 letters', '1 pt'],
          ['4 letters', '2 pts'],
          ['5 letters', '3 pts'],
        ].map(([label, pts]) => (
          <div key={label} className="rounded-lg border border-[#1a2540] bg-[#060e1a] px-2 py-2">
            <p className="text-slate-400">{label}</p>
            <p className="text-amber-200 font-semibold mt-0.5">{pts}</p>
          </div>
        ))}
      </div>
      <p className="text-[11px] text-slate-500">…and so on</p>
    </div>
  );
}

export default function BoggleTutorialModal({ open, onClose }) {
  return (
    <FunTutorialShell
      open={open}
      onClose={onClose}
      onFinish={(dontShowAgain) => {
        if (dontShowAgain) markBoggleTutorialSeen();
      }}
      eyebrow="How to play Boggle"
      accent="amber"
      steps={BOGGLE_TUTORIAL_STEPS}
      renderSketch={(kind) => <BoggleSketch kind={kind} />}
    />
  );
}
