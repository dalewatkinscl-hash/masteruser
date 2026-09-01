import { SokobanTutorialSketch } from './sokobanGraphics';
import FunTutorialShell, { makeTutorialStorage } from './FunTutorialShell';

const storage = makeTutorialStorage('sokoban:tutorial-seen');

export const hasSeenSokobanTutorial = () => storage.hasSeen();
export const markSokobanTutorialSeen = () => storage.markSeen();
export const clearSokobanTutorialSeen = () => storage.clearSeen();

export const SOKOBAN_TUTORIAL_STEPS = [
  {
    id: 'goal',
    title: 'Park the crates',
    body: 'Push every crate onto a glowing button. When all buttons are covered, the warehouse is cleared.',
    sketch: 'goal',
  },
  {
    id: 'move',
    title: 'Move around',
    body: 'Use the arrow keys or the on-screen pad. You walk one tile at a time — walls and water-side scenery block the way.',
    sketch: 'move',
  },
  {
    id: 'push',
    title: 'Push, don’t pull',
    body: 'Walk into a crate to shove it forward one tile. You can only push one crate at a time, and you can’t pull crates back.',
    sketch: 'push',
  },
  {
    id: 'stuck',
    title: 'Watch the corners',
    body: 'A crate jammed against a wall corner often can’t be freed. Think a few moves ahead before you shove.',
    sketch: 'stuck',
  },
  {
    id: 'limits',
    title: 'Undos & resets',
    body: 'Daily puzzles give you a limited number of undos and resets. Practice days are unlimited — today’s competitive run isn’t.',
    sketch: 'limits',
  },
  {
    id: 'win',
    title: 'Climb the board',
    body: 'Solve with fewer moves to rank higher. Ready to clear today’s warehouse?',
    sketch: 'win',
  },
];

/**
 * First-run / replayable Sokoban how-to carousel.
 */
export default function SokobanTutorialModal({ open, onClose }) {
  return (
    <FunTutorialShell
      open={open}
      onClose={onClose}
      onFinish={(dontShowAgain) => {
        if (dontShowAgain) markSokobanTutorialSeen();
      }}
      eyebrow="How to play Sokoban"
      accent="sky"
      titleId="sokoban-tutorial-title"
      steps={SOKOBAN_TUTORIAL_STEPS}
      renderSketch={(kind) => <SokobanTutorialSketch kind={kind} />}
    />
  );
}
