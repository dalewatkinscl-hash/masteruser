import FunTutorialShell, { makeTutorialStorage } from './FunTutorialShell';

const storage = makeTutorialStorage('wordle:tutorial-seen');

export const hasSeenWordleTutorial = () => storage.hasSeen();
export const markWordleTutorialSeen = () => storage.markSeen();
export const clearWordleTutorialSeen = () => storage.clearSeen();

export const WORDLE_TUTORIAL_STEPS = [
  {
    id: 'goal',
    title: 'Guess the word',
    body: 'Each weekday has a secret 5-letter word. You have six tries to find it. Past days are practice only — they don’t count for the leaderboard.',
    sketch: 'goal',
  },
  {
    id: 'type',
    title: 'Type a guess',
    body: 'Use the on-screen keyboard or your physical keyboard. Enter submits a full 5-letter word; Backspace deletes.',
    sketch: 'type',
  },
  {
    id: 'colours',
    title: 'Read the colours',
    body: 'Green = right letter, right spot. Amber = right letter, wrong spot. Grey = not in the word. Keyboard keys keep the best colour you’ve seen.',
    sketch: 'colours',
  },
  {
    id: 'rank',
    title: 'Climb the board',
    body: 'Solve in fewer guesses to rank higher. Ready for today’s word?',
    sketch: 'rank',
  },
];

function Tile({ letter = '', tone = 'empty', small = false }) {
  const size = small ? 'w-8 h-8 text-sm' : 'w-10 h-10 text-base';
  const tones = {
    empty: 'bg-[#060e1a] border-[#1a2540] text-slate-300',
    filled: 'bg-[#0b1220] border-indigo-400/70 text-white',
    correct: 'bg-emerald-600 border-emerald-500 text-white',
    present: 'bg-amber-500 border-amber-400 text-white',
    absent: 'bg-slate-700 border-slate-600 text-slate-200',
  };
  return (
    <div
      className={`${size} border-2 rounded-md flex items-center justify-center font-bold uppercase ${tones[tone] || tones.empty}`}
    >
      {letter}
    </div>
  );
}

function WordleSketch({ kind }) {
  if (kind === 'goal') {
    return (
      <div className="flex flex-col items-center gap-2 w-full">
        <div className="flex gap-1.5">
          {'?????'.split('').map((ch, i) => (
            <Tile key={i} letter={ch === '?' ? '' : ch} />
          ))}
        </div>
        <p className="text-[11px] text-slate-400 text-center">Six tries · 5 letters</p>
      </div>
    );
  }
  if (kind === 'type') {
    return (
      <div className="flex flex-col items-center gap-2 w-full">
        <div className="flex gap-1.5">
          {'CRANE'.split('').map((ch) => (
            <Tile key={ch} letter={ch} tone="filled" />
          ))}
        </div>
        <p className="text-[11px] text-slate-400 text-center">Press Enter to submit</p>
      </div>
    );
  }
  if (kind === 'colours') {
    return (
      <div className="flex flex-col items-center gap-3 w-full">
        <div className="flex gap-1.5">
          <Tile letter="C" tone="absent" small />
          <Tile letter="R" tone="present" small />
          <Tile letter="A" tone="correct" small />
          <Tile letter="N" tone="absent" small />
          <Tile letter="E" tone="present" small />
        </div>
        <div className="flex flex-wrap justify-center gap-x-3 gap-y-1 text-[11px]">
          <span className="text-emerald-300">Green · spot</span>
          <span className="text-amber-300">Amber · letter</span>
          <span className="text-slate-400">Grey · out</span>
        </div>
      </div>
    );
  }
  return (
    <div className="flex flex-col items-center gap-2 w-full">
      <div className="flex gap-1.5">
        {'APPLE'.split('').map((ch) => (
          <Tile key={ch} letter={ch} tone="correct" small />
        ))}
      </div>
      <div className="text-xs font-semibold text-emerald-300 bg-emerald-500/10 border border-emerald-500/30 rounded-full px-3 py-1">
        Solved in 3/6
      </div>
    </div>
  );
}

export default function WordleTutorialModal({ open, onClose }) {
  return (
    <FunTutorialShell
      open={open}
      onClose={onClose}
      onFinish={(dontShowAgain) => {
        if (dontShowAgain) markWordleTutorialSeen();
      }}
      eyebrow="How to play Wordle"
      accent="indigo"
      steps={WORDLE_TUTORIAL_STEPS}
      renderSketch={(kind) => <WordleSketch kind={kind} />}
    />
  );
}
