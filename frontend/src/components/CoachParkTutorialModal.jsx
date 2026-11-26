import FunTutorialShell, { makeTutorialStorage } from './FunTutorialShell';

const storage = makeTutorialStorage('coachpark:tutorial-seen');

export const hasSeenCoachParkTutorial = () => storage.hasSeen();
export const markCoachParkTutorialSeen = () => storage.markSeen();
export const clearCoachParkTutorialSeen = () => storage.clearSeen();

export const COACH_PARK_TUTORIAL_STEPS = [
  {
    id: 'controls',
    title: 'Controls hold their position',
    body: 'Use ← / → (or drag the wheel) to steer and ↑ / ↓ (or the lever) for Forward / Reverse. Neither auto-resets when you let go — unwind the wheel to straighten and pull back to N to stop.',
    sketch: 'controls',
  },
  {
    id: 'park',
    title: 'Park inside the yellow box',
    body: 'Ease the maroon coach into the yellow bay (nose-in or reverse-in) with all 4 corners inside the lines, then return throttle to N and wait for it to lock green.',
    sketch: 'park',
  },
  {
    id: 'avoid',
    title: 'Avoid obstacles · 3 tries a day',
    body: 'Watch your front overhang and tail swing around parked coaches, kerbs, buildings, skips, cones, and bollards. Every bump adds +5s, 5 scrapes ends your run, and you get 3 tries on each daily map.',
    sketch: 'avoid',
  },
];

function Sketch({ kind }) {
  if (kind === 'controls') {
    return (
      <div className="flex items-center justify-center gap-6 w-full">
        {/* Mini steering wheel */}
        <div className="flex flex-col items-center gap-1.5">
          <svg viewBox="0 0 120 120" className="w-16 h-16 -rotate-45 drop-shadow">
            <circle cx="60" cy="60" r="48" fill="none" stroke="#1e293b" strokeWidth="14" />
            <circle cx="60" cy="60" r="48" fill="none" stroke="#475569" strokeWidth="9" />
            <path d="M 52 12 A 48 48 0 0 1 68 12" fill="none" stroke="#eab308" strokeWidth="10" />
            <line x1="18" y1="60" x2="102" y2="60" stroke="#64748b" strokeWidth="8" strokeLinecap="round" />
            <line x1="60" y1="60" x2="60" y2="102" stroke="#64748b" strokeWidth="9" strokeLinecap="round" />
            <circle cx="60" cy="60" r="17" fill="#6b1426" stroke="#facc15" strokeWidth="2" />
            <text x="60" y="63" textAnchor="middle" fill="#fde047" fontSize="9" fontWeight="bold">LION</text>
          </svg>
          <span className="text-[11px] font-mono text-amber-200">← / → Holds angle</span>
        </div>

        {/* Mini throttle lever */}
        <div className="flex flex-col items-center gap-1.5">
          <div className="flex items-center gap-1.5">
            <div className="relative w-8 h-16 rounded-lg border border-slate-600 bg-[#0b1322] overflow-hidden">
              <div className="absolute inset-x-0 bottom-1/2 h-1/3 bg-emerald-500/35" />
              <div className="absolute inset-x-1 top-1/2 h-0.5 bg-sky-400/75" />
              <div className="absolute inset-x-1 top-[26%] h-3 -translate-y-1/2 rounded bg-emerald-500 border border-emerald-200" />
            </div>
            <div className="flex flex-col justify-between h-16 text-[9px] font-mono text-slate-400 leading-none py-0.5">
              <span className="text-emerald-300">FWD</span>
              <span className="text-sky-300 font-bold">N</span>
              <span className="text-amber-300">REV</span>
            </div>
          </div>
          <span className="text-[11px] font-mono text-emerald-200">↑ / ↓ Holds speed</span>
        </div>
      </div>
    );
  }

  if (kind === 'park') {
    return (
      <div className="flex flex-col items-center gap-2.5 w-full">
        <div className="relative w-52 h-14 rounded-md border-2 border-yellow-400 bg-yellow-400/15 flex items-center justify-center shadow-[0_0_20px_rgba(250,204,21,0.18)]">
          {/* Mini maroon coach nicely inside */}
          <div className="relative w-40 h-8 rounded-md bg-gradient-to-b from-[#881337] via-[#9f1239] to-[#4c0519] border border-yellow-300 flex items-center justify-between px-2">
            <div className="w-1 h-4 rounded-sm bg-slate-900" />
            <span className="text-[9px] font-bold tracking-wider text-yellow-300">LION COACH</span>
            <div className="w-2.5 h-6 rounded-sm bg-slate-950 border border-yellow-300/60" />
            {/* 4 green corner lock dots */}
            <span className="absolute -top-1 -left-1 w-2.5 h-2.5 rounded-full bg-emerald-400 border border-slate-950" />
            <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-emerald-400 border border-slate-950" />
            <span className="absolute -bottom-1 -left-1 w-2.5 h-2.5 rounded-full bg-emerald-400 border border-slate-950" />
            <span className="absolute -bottom-1 -right-1 w-2.5 h-2.5 rounded-full bg-emerald-400 border border-slate-950" />
          </div>
        </div>
        <span className="text-[11px] text-emerald-300 font-medium">
          All 4 corners inside + stop in N → Locks park
        </span>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-3 w-full">
      <div className="flex items-center justify-center gap-4">
        <div className="w-20 h-9 rounded bg-gradient-to-b from-[#6b1426] to-[#3b0a16] border border-yellow-300/40 flex items-center justify-center text-[9px] font-semibold text-yellow-200/80">
          PARKED
        </div>
        <div className="w-5 h-5 rounded-full bg-red-600 border-2 border-white shadow" title="Bollard" />
        <div className="w-4 h-4 rounded-full bg-orange-600 border-2 border-white shadow" title="Cone" />
        <div className="px-2 py-0.5 rounded bg-rose-950/90 border border-rose-400/60 text-xs font-mono font-bold text-rose-200">
          +5s
        </div>
      </div>
      <div className="flex items-center gap-2 text-[11px] text-slate-300">
        <span>3 tries / day:</span>
        <span className="inline-flex gap-1">
          <span className="w-2.5 h-2.5 rounded-full bg-indigo-400 border border-indigo-200" />
          <span className="w-2.5 h-2.5 rounded-full bg-indigo-400 border border-indigo-200" />
          <span className="w-2.5 h-2.5 rounded-full bg-indigo-400 border border-indigo-200" />
        </span>
      </div>
    </div>
  );
}

export default function CoachParkTutorialModal({ open, onClose }) {
  return (
    <FunTutorialShell
      open={open}
      onClose={onClose}
      onFinish={(dontShowAgain) => {
        if (dontShowAgain) markCoachParkTutorialSeen();
      }}
      eyebrow="Coach Park"
      accent="amber"
      steps={COACH_PARK_TUTORIAL_STEPS}
      renderSketch={(kind) => <Sketch kind={kind} />}
      titleId="coachpark-tutorial-title"
    />
  );
}
