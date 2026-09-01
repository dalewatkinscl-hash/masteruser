import FunTutorialShell, { makeTutorialStorage } from './FunTutorialShell';

const storage = makeTutorialStorage('casefile:tutorial-seen');

export const hasSeenCasefileTutorial = () => storage.hasSeen();
export const markCasefileTutorialSeen = () => storage.markSeen();
export const clearCasefileTutorialSeen = () => storage.clearSeen();

export const CASEFILE_TUTORIAL_STEPS = [
  {
    id: 'scene',
    title: 'A scene, not a story',
    body: 'Casefile is a logic puzzle on a tiny office map. Five people are standing somewhere on the 6×6 grid. Your job is to place every one of them using the clue cards — then name who committed the crime.',
    sketch: 'scene',
  },
  {
    id: 'rows',
    title: 'One person per row and column',
    body: 'No two people share a row or a column — the same rule as Sudoku digits. Confirming Adam in a square crosses out the rest of that row and column (and furniture is crossed out too).',
    sketch: 'rows',
  },
  {
    id: 'rooms',
    title: 'The map is evidence',
    body: 'The office is four rooms with different floor tiles and a wall between them: Lounge, Kitchen, Study, and Hall. Furniture is also tile art. “Beside the plant” means the square next to the plant — up, down, left, or right, not diagonal.',
    sketch: 'rooms',
  },
  {
    id: 'clues',
    title: 'Clues are rules, not hints',
    body: 'Each person has one clue, and it is true. “Amelia was north of Adam” means Amelia is on a higher row. Tap a card to select that person, then tap a floor tile to stand them there. Right-click (or the X tool) marks a square empty.',
    sketch: 'clues',
  },
  {
    id: 'killer',
    title: 'Find the murderer last',
    body: 'When everyone is placed, look at the victim’s room. The murderer is the only other person left in that same room. Tap that suspect, then Submit. If the layout is wrong you’ll be told how many people are in the right seat.',
    sketch: 'killer',
  },
];

function MiniMap({ people = {}, highlightRow = -1, highlightCol = -1, killer = null, showX = false }) {
  const rooms = [
    ['#64748b', '#38bdf8'],
    ['#b45309', '#d6d3d1'],
  ];
  return (
    <svg viewBox="0 0 100 100" className="w-40 h-40" aria-hidden>
      {rooms.map((rowColors, br) => rowColors.map((fill, bc) => (
        <rect
          key={`${br}-${bc}`}
          x={2 + bc * 48}
          y={2 + br * 48}
          width="47"
          height="47"
          fill={fill}
          opacity="0.35"
          stroke="#1e293b"
          strokeWidth="0.8"
        />
      )))}
      {Array.from({ length: 6 }, (_, row) => Array.from({ length: 6 }, (_, col) => {
        const x = 4 + col * 15.5;
        const y = 4 + row * 15.5;
        const key = `${row},${col}`;
        const who = people[key];
        const dimRow = highlightRow >= 0 && row === highlightRow && !who;
        const dimCol = highlightCol >= 0 && col === highlightCol && !who;
        return (
          <g key={key}>
            <rect
              x={x}
              y={y}
              width="14.5"
              height="14.5"
              fill={who ? '#0f172a' : dimRow || dimCol ? '#1e293b' : '#020617'}
              stroke={who === killer ? '#f87171' : who ? '#a5b4fc' : '#334155'}
              strokeWidth={who === killer ? 1.4 : 0.6}
            />
            {who ? (
              <text x={x + 7.25} y={y + 10} textAnchor="middle" fontSize="7" fill={who === 'V' ? '#fda4af' : '#e2e8f0'}>
                {who}
              </text>
            ) : showX && (dimRow || dimCol) ? (
              <text x={x + 7.25} y={y + 10} textAnchor="middle" fontSize="7" fill="#64748b">×</text>
            ) : null}
          </g>
        );
      }))}
    </svg>
  );
}

function CasefileSketch({ kind }) {
  if (kind === 'rows') {
    return <MiniMap people={{ '1,2': 'A' }} highlightRow={1} highlightCol={2} showX />;
  }
  if (kind === 'rooms') {
    return <MiniMap people={{ '1,1': 'P' }} />;
  }
  if (kind === 'clues') {
    return (
      <div className="text-center space-y-2">
        <p className="text-[11px] text-indigo-200 border border-indigo-500/30 rounded-md px-2 py-1">
          Amelia was north of Adam.
        </p>
        <MiniMap people={{ '0,3': 'Am', '4,1': 'Ad' }} />
      </div>
    );
  }
  if (kind === 'killer') {
    return <MiniMap people={{ '1,1': 'V', '2,4': 'B' }} killer="B" />;
  }
  return <MiniMap people={{ '0,1': 'A', '1,4': 'X', '3,0': 'M', '4,3': 'B', '5,5': 'V' }} />;
}

export default function CasefileTutorialModal({ open, onClose }) {
  return (
    <FunTutorialShell
      open={open}
      onClose={onClose}
      onFinish={(dontShowAgain) => {
        if (dontShowAgain) markCasefileTutorialSeen();
      }}
      eyebrow="How to play Casefile"
      accent="indigo"
      titleId="casefile-tutorial-title"
      steps={CASEFILE_TUTORIAL_STEPS}
      renderSketch={(kind) => <CasefileSketch kind={kind} />}
    />
  );
}
