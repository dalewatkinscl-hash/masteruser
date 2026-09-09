import FunTutorialShell, { makeTutorialStorage } from './FunTutorialShell';

const storage = makeTutorialStorage('wanted:tutorial-seen');

export const hasSeenWantedTutorial = () => storage.hasSeen();
export const markWantedTutorialSeen = () => storage.markSeen();
export const clearWantedTutorialSeen = () => storage.clearSeen();

export const WANTED_TUTORIAL_STEPS = [
  {
    id: 'goal',
    title: 'Find the Wanted emoji',
    body: 'A swarm of emojis drifts around the board. Spot the one on the WANTED poster and tap it as fast as you can.',
    sketch: 'goal',
  },
  {
    id: 'penalty',
    title: 'Wrong taps cost time',
    body: 'Every miss adds a +3 second penalty to your score. Accuracy matters as much as speed.',
    sketch: 'penalty',
  },
  {
    id: 'flow',
    title: 'Two rounds, one score',
    body: 'Clear Standard first. That unlocks Impossible. Your final score is the combined corrected time — and you only get one attempt for the leaderboard.',
    sketch: 'impossible',
  },
  {
    id: 'impossible',
    title: 'Impossible: find the unique one',
    body: 'On Impossible the WANTED poster is hidden. Most emojis appear more than once — tap the emoji that appears only once.',
    sketch: 'impossible',
  },
  {
    id: 'grade',
    title: 'Chase the grade',
    body: 'Lower combined time ranks higher. Grades scale for the full run (S through F).',
    sketch: 'grade',
  },
];

function WantedSketch({ kind }) {
  if (kind === 'goal') {
    return (
      <div className="flex flex-col items-center gap-3 w-full">
        <div className="rounded-lg border-2 border-rose-500/70 bg-white/5 px-4 py-2 text-center">
          <p className="text-[10px] font-bold tracking-widest text-rose-400">WANTED</p>
          <p className="text-3xl mt-1">🦊</p>
        </div>
        <div className="flex flex-wrap justify-center gap-1 text-xl opacity-80">
          <span>🐶</span><span>🐱</span><span className="ring-2 ring-rose-400 rounded">🦊</span><span>🐼</span><span>🐸</span>
        </div>
      </div>
    );
  }
  if (kind === 'penalty') {
    return (
      <div className="text-center space-y-2">
        <p className="text-4xl">❌</p>
        <p className="text-lg font-bold text-rose-300">+3.0s</p>
        <p className="text-[11px] text-slate-400">Wrong emoji tapped</p>
      </div>
    );
  }
  if (kind === 'impossible') {
    return (
      <div className="flex flex-col items-center gap-3 w-full">
        <div className="rounded-lg border-2 border-rose-500/70 bg-white/5 px-4 py-2 text-center">
          <p className="text-[10px] font-bold tracking-widest text-rose-400">WANTED</p>
          <p className="text-sm font-bold mt-1 tracking-wider">HIDDEN</p>
        </div>
        <div className="flex flex-wrap justify-center gap-1 text-xl">
          <span>⭐</span><span>⭐</span><span className="ring-2 ring-amber-400 rounded">🌟</span><span>⭐</span><span>⭐</span>
        </div>
        <p className="text-[11px] text-slate-400">Only 🌟 appears once</p>
      </div>
    );
  }
  return (
    <div className="text-center space-y-1">
      <p className="text-4xl font-black text-amber-300">S</p>
      <p className="text-sm text-slate-300">5.8s combined</p>
      <p className="text-[11px] text-slate-500">Standard + Impossible · lower is better</p>
    </div>
  );
}

export default function WantedTutorialModal({ open, onClose }) {
  return (
    <FunTutorialShell
      open={open}
      onClose={onClose}
      onFinish={(dontShowAgain) => {
        if (dontShowAgain) markWantedTutorialSeen();
      }}
      eyebrow="How to play Wanted"
      accent="amber"
      steps={WANTED_TUTORIAL_STEPS}
      renderSketch={(kind) => <WantedSketch kind={kind} />}
      titleId="wanted-tutorial-title"
    />
  );
}
