import FunTutorialShell, { makeTutorialStorage } from './FunTutorialShell';

const storage = makeTutorialStorage('stackwalk:tutorial-seen');

export const hasSeenStackWalkTutorial = () => storage.hasSeen();
export const markStackWalkTutorialSeen = () => storage.markSeen();
export const clearStackWalkTutorialSeen = () => storage.clearSeen();

export const STACK_WALK_TUTORIAL_STEPS = [
  {
    id: 'help',
    title: 'Help the Amazon man',
    body: 'O Dell’s parcels need delivering. Help the Amazon delivery driver carry them as far as he can without dropping the lot.',
    sketch: 'help',
  },
  {
    id: 'stack',
    title: 'The stack grows',
    body: 'You start with one parcel. Every 10 metres another lands on top — and the balance needle gets harder to hold.',
    sketch: 'stack',
  },
  {
    id: 'controls',
    title: 'Keep him upright',
    body: 'Use Left / Right (or arrow keys / A D) to steer the balance meter. Fall and your distance is locked for the day.',
    sketch: 'controls',
  },
];

function Sketch({ kind }) {
  if (kind === 'help') {
    return (
      <div className="flex flex-col items-center gap-3 w-full text-center">
        <div className="text-4xl" aria-hidden>📦</div>
        <p className="text-sm text-amber-100 font-semibold">O Dell’s → Amazon driver</p>
        <p className="text-[11px] text-slate-400 max-w-[220px]">
          You’re lending a hand so his parcels make it down the road.
        </p>
      </div>
    );
  }
  if (kind === 'stack') {
    return (
      <div className="flex flex-col items-center gap-2 w-full">
        <div className="flex flex-col-reverse items-center gap-0.5">
          <div className="w-16 h-5 rounded-sm bg-[#c4a574] border border-[#232f3e]" />
          <div className="w-14 h-5 rounded-sm bg-[#d2b48c] border border-[#ff9900]" />
          <div className="w-12 h-5 rounded-sm bg-[#c9a66b] border border-[#232f3e]" />
        </div>
        <p className="text-[11px] text-slate-400">+1 parcel every 10 m</p>
      </div>
    );
  }
  return (
    <div className="flex flex-col items-center gap-3 w-full">
      <div className="w-40 h-3 rounded-full bg-slate-800 border border-slate-600 relative overflow-hidden">
        <div className="absolute inset-y-0 left-0 w-[18%] bg-rose-500/40" />
        <div className="absolute inset-y-0 right-0 w-[18%] bg-rose-500/40" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-2.5 h-2.5 rotate-45 bg-amber-400" />
      </div>
      <p className="text-[11px] text-slate-400">← Left · Right →</p>
    </div>
  );
}

export default function StackWalkTutorialModal({ open, onClose }) {
  return (
    <FunTutorialShell
      open={open}
      onClose={onClose}
      onFinish={(dontShowAgain) => {
        if (dontShowAgain) markStackWalkTutorialSeen();
      }}
      eyebrow="O Dell's Amazon Run"
      accent="amber"
      steps={STACK_WALK_TUTORIAL_STEPS}
      renderSketch={(kind) => <Sketch kind={kind} />}
      titleId="stackwalk-tutorial-title"
    />
  );
}
