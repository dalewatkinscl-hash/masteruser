import { TutorialSketch } from './encloseGraphics';
import FunTutorialShell, { makeTutorialStorage } from './FunTutorialShell';

const storage = makeTutorialStorage('enclose-dev:tutorial-seen');

export const hasSeenEncloseTutorial = () => storage.hasSeen();
export const markEncloseTutorialSeen = () => storage.markSeen();
export const clearEncloseTutorialSeen = () => storage.clearSeen();

export const ENCLOSE_TUTORIAL_STEPS = [
  {
    id: 'goal',
    title: 'Build a pen',
    body: 'Fence an enclosure around the cow — don’t seal the whole map edge. The more grass you trap inside, the higher your score.',
    sketch: 'goal',
  },
  {
    id: 'move',
    title: 'Cow movement',
    body: 'The cow moves up, down, left, and right — never diagonally. Fences and water block it. If it can reach any border cell, it escapes (score 0).',
    sketch: 'move',
  },
  {
    id: 'walls',
    title: 'Placing fences',
    body: 'Tap empty grass to place or remove a wooden fence. Each puzzle gives you a limited fence budget — spend it carefully.',
    sketch: 'walls',
  },
  {
    id: 'bonus',
    title: 'Crops & chickens',
    body: 'Things inside your pen change the score: strawberries +3, golden carrots +10, chickens −5. Try to keep chickens outside.',
    sketch: 'bonus',
  },
  {
    id: 'portal',
    title: 'Chests & reach',
    body: 'Paired magic chests teleport the cow between them. Tap the cow or use Show reach to preview where it can still walk — handy for spotting gaps.',
    sketch: 'portal',
  },
  {
    id: 'harvest',
    title: 'Harvest & submit',
    body: 'When the pen closes, crops grow across the field and bonuses pop up. Submit locks your attempt. Ready to play?',
    sketch: 'harvest',
  },
];

/**
 * First-run / replayable Enclose how-to carousel.
 */
export default function EncloseTutorialModal({ open, onClose }) {
  return (
    <FunTutorialShell
      open={open}
      onClose={onClose}
      onFinish={(dontShowAgain) => {
        if (dontShowAgain) markEncloseTutorialSeen();
      }}
      eyebrow="How to play Enclose · Cow"
      accent="emerald"
      titleId="enclose-tutorial-title"
      steps={ENCLOSE_TUTORIAL_STEPS}
      renderSketch={(kind) => <TutorialSketch kind={kind} />}
    />
  );
}
