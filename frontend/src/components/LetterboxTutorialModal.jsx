import FunTutorialShell, { makeTutorialStorage } from './FunTutorialShell';

const storage = makeTutorialStorage('letterbox:tutorial-seen');

export const hasSeenLetterboxTutorial = () => storage.hasSeen();
export const markLetterboxTutorialSeen = () => storage.markSeen();
export const clearLetterboxTutorialSeen = () => storage.clearSeen();

export const LETTERBOX_TUTORIAL_STEPS = [
  {
    id: 'intro',
    title: 'New puzzle · try it today',
    body: 'Daily Letter Box is a brand-new Fun game. Practice today — it joins the weekday rotation from tomorrow, when scores will count for leaderboards and streaks.',
    sketch: 'intro',
  },
  {
    id: 'board',
    title: 'Twelve letters on a square',
    body: 'Three letters sit on each side of the square. Your job is to use every letter at least once by chaining words together.',
    sketch: 'board',
  },
  {
    id: 'sides',
    title: 'No same-side hops',
    body: 'Each word must be at least 3 letters. Consecutive letters cannot come from the same side — tap around the square, not along one edge.',
    sketch: 'sides',
  },
  {
    id: 'chain',
    title: 'Chain your words',
    body: 'After you enter a word, the next one must start with that word’s last letter. Tap the last selected letter to undo it.',
    sketch: 'chain',
  },
  {
    id: 'goal',
    title: 'Beat par',
    body: 'Clear all 12 letters in as few words as you can. Par is usually 3 or 4. Today’s practice stays local — no leaderboard until tomorrow.',
    sketch: 'goal',
  },
];

function MiniSquare({ highlightSides = null, path = null, dimSame = false }) {
  const sides = ['CEW', 'HNR', 'PSU', 'MTY'];
  const positions = [];
  (sides[0] || '').split('').forEach((ch, i) => positions.push({ ch, x: 25 + i * 25, y: 8, side: 0 }));
  (sides[1] || '').split('').forEach((ch, i) => positions.push({ ch, x: 92, y: 25 + i * 25, side: 1 }));
  (sides[2] || '').split('').forEach((ch, i) => positions.push({ ch, x: 25 + i * 25, y: 92, side: 2 }));
  (sides[3] || '').split('').forEach((ch, i) => positions.push({ ch, x: 8, y: 25 + i * 25, side: 3 }));
  const byLetter = Object.fromEntries(positions.map((p) => [p.ch, p]));
  const pathPts = (path || '')
    .split('')
    .map((ch) => byLetter[ch])
    .filter(Boolean);

  return (
    <svg viewBox="0 0 100 100" className="w-40 h-40" aria-hidden>
      <rect x="14" y="14" width="72" height="72" fill="#0b1220" stroke="#1e293b" strokeWidth="1.5" rx="1" />
      {pathPts.length >= 2 ? (
        <polyline
          fill="none"
          stroke="#818cf8"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          points={pathPts.map((p) => `${p.x},${p.y}`).join(' ')}
        />
      ) : null}
      {positions.map((pos) => {
        const muted = dimSame && highlightSides != null && pos.side === highlightSides;
        const active = highlightSides != null && pos.side === highlightSides && !dimSame;
        return (
          <g key={`${pos.side}-${pos.ch}`} opacity={muted ? 0.35 : 1}>
            <circle
              cx={pos.x}
              cy={pos.y}
              r="7"
              fill={active ? '#78350f' : muted ? '#0b1220' : '#060e1a'}
              stroke={active ? '#fbbf24' : muted ? '#1e293b' : '#334155'}
              strokeWidth="1.2"
            />
            <text
              x={pos.x}
              y={pos.y}
              textAnchor="middle"
              dominantBaseline="central"
              fill={active ? '#fef3c7' : muted ? '#475569' : '#f1f5f9'}
              fontSize="6.5"
              fontWeight="700"
            >
              {pos.ch}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

function LetterboxSketch({ kind }) {
  if (kind === 'intro') {
    return (
      <div className="flex flex-col items-center gap-2 w-full">
        <MiniSquare />
        <p className="text-[11px] text-amber-200/90 text-center font-medium">New · enters rotation tomorrow</p>
      </div>
    );
  }
  if (kind === 'board') {
    return (
      <div className="flex flex-col items-center gap-2 w-full">
        <MiniSquare />
        <p className="text-[11px] text-slate-400 text-center">3 letters per side · 12 unique</p>
      </div>
    );
  }
  if (kind === 'sides') {
    return (
      <div className="flex flex-col items-center gap-2 w-full">
        <MiniSquare dimSame highlightSides={0} />
        <p className="text-[11px] text-slate-400 text-center">Same-side letters can’t follow each other</p>
      </div>
    );
  }
  if (kind === 'chain') {
    return (
      <div className="flex flex-col items-center gap-2 w-full">
        <MiniSquare path="WRENCH" />
        <p className="text-[11px] text-slate-400 text-center">Next word starts with the last letter</p>
      </div>
    );
  }
  if (kind === 'goal') {
    return (
      <div className="flex flex-col items-center gap-1.5 w-full px-2">
        <div className="rounded-lg border border-indigo-500/30 bg-indigo-500/10 px-3 py-2 text-center">
          <p className="text-sm font-semibold text-indigo-100">Par 3–4 words</p>
          <p className="text-[11px] text-slate-400 mt-0.5">Use every letter · fewest words wins</p>
        </div>
        <p className="text-[11px] text-slate-500 text-center">Practice today · leaderboards from tomorrow</p>
      </div>
    );
  }
  return null;
}

/**
 * First-run / replayable Letter Box how-to carousel.
 */
export default function LetterboxTutorialModal({ open, onClose }) {
  return (
    <FunTutorialShell
      open={open}
      onClose={onClose}
      onFinish={(dontShowAgain) => {
        if (dontShowAgain) markLetterboxTutorialSeen();
      }}
      eyebrow="How to play Letter Box"
      accent="indigo"
      titleId="letterbox-tutorial-title"
      steps={LETTERBOX_TUTORIAL_STEPS}
      renderSketch={(kind) => <LetterboxSketch kind={kind} />}
    />
  );
}
