import { useEffect, useRef, useState } from 'react';

const ACCENT = {
  indigo: {
    border: 'border-indigo-900/60',
    glow: 'from-indigo-700/25',
    eyebrow: 'text-indigo-400/80',
    title: 'text-indigo-50',
    dot: 'bg-indigo-900',
    back: 'border-indigo-800/60 text-indigo-100 hover:bg-indigo-500/10',
    next: 'bg-indigo-700 hover:bg-indigo-600 text-white',
    sketchBorder: 'border-indigo-500/20',
    sketchBg: 'rgba(99, 102, 241, 0.12)',
  },
  sky: {
    border: 'border-sky-900/60',
    glow: 'from-sky-700/25',
    eyebrow: 'text-sky-500/80',
    title: 'text-sky-50',
    dot: 'bg-sky-900',
    back: 'border-sky-800/60 text-sky-100 hover:bg-sky-500/10',
    next: 'bg-sky-700 hover:bg-sky-600 text-white',
    sketchBorder: 'border-sky-500/20',
    sketchBg: 'rgba(56, 189, 248, 0.12)',
  },
  amber: {
    border: 'border-amber-900/50',
    glow: 'from-amber-700/20',
    eyebrow: 'text-amber-500/80',
    title: 'text-amber-50',
    dot: 'bg-amber-950',
    back: 'border-amber-800/60 text-amber-100 hover:bg-amber-500/10',
    next: 'bg-amber-700 hover:bg-amber-600 text-white',
    sketchBorder: 'border-amber-500/20',
    sketchBg: 'rgba(245, 158, 11, 0.12)',
  },
  emerald: {
    border: 'border-emerald-900/60',
    glow: 'from-emerald-700/25',
    eyebrow: 'text-emerald-500/80',
    title: 'text-emerald-50',
    titleStyle: { fontFamily: 'Cinzel, Georgia, serif' },
    dot: 'bg-emerald-900',
    back: 'border-emerald-800/60 text-emerald-100 hover:bg-emerald-500/10',
    next: 'bg-emerald-700 hover:bg-emerald-600 text-white',
    sketchBorder: 'border-emerald-500/20',
    sketchBg: 'rgba(16, 185, 129, 0.12)',
    panelBg: 'bg-[#0a1610]',
  },
};

/**
 * Shared Fun-tab how-to carousel shell.
 * onFinish(dontShowAgain) — only persist when the checkbox is checked.
 */
export default function FunTutorialShell({
  open,
  onClose,
  onFinish,
  eyebrow = 'How to play',
  accent = 'indigo',
  steps = [],
  renderSketch,
  titleId = 'fun-tutorial-title',
  sketchFrameClassName = '',
}) {
  const [index, setIndex] = useState(0);
  const [dontShowAgain, setDontShowAgain] = useState(true);
  const dontShowAgainRef = useRef(true);
  const theme = ACCENT[accent] || ACCENT.indigo;

  useEffect(() => {
    if (open) {
      setIndex(0);
      setDontShowAgain(true);
      dontShowAgainRef.current = true;
    }
  }, [open]);

  if (!open || !steps.length) return null;

  const step = steps[index];
  const isFirst = index === 0;
  const isLast = index >= steps.length - 1;

  const finish = () => {
    onFinish?.(dontShowAgainRef.current);
    onClose?.();
  };

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-4">
      <button
        type="button"
        aria-label="Close tutorial"
        className="absolute inset-0 bg-black/65 backdrop-blur-sm"
        onClick={finish}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={`fun-tutorial-shell relative w-full max-w-md rounded-2xl border ${theme.border} ${theme.panelBg || 'bg-[#0a121c]'} shadow-2xl overflow-hidden`}
      >
        <div className={`absolute inset-x-0 top-0 h-28 bg-gradient-to-b ${theme.glow} to-transparent pointer-events-none`} />

        <div className="relative px-5 pt-5 pb-5">
          <p className={`fun-tutorial-shell__eyebrow text-[11px] font-mono uppercase tracking-[0.18em] ${theme.eyebrow} mb-2`}>
            {eyebrow}
          </p>

          <div
            className={`mb-4 min-h-[7.5rem] flex items-center justify-center rounded-xl border ${theme.sketchBorder} p-4 ${sketchFrameClassName}`}
            style={{
              background: `radial-gradient(ellipse at 50% 0%, ${theme.sketchBg}, transparent 55%), #071018`,
            }}
          >
            {typeof renderSketch === 'function' ? renderSketch(step.sketch) : null}
          </div>

          <h2
            id={titleId}
            className={`fun-tutorial-shell__title text-xl font-semibold ${theme.title} mb-2`}
            style={theme.titleStyle || undefined}
          >
            {step.title}
          </h2>
          <p className="fun-tutorial-shell__body text-sm leading-relaxed min-h-[4.5rem]">{step.body}</p>

          <div className="mt-4 flex items-center justify-center gap-1.5" aria-hidden="true">
            {steps.map((s, i) => (
              <span
                key={s.id}
                className={`h-1.5 rounded-full transition-all ${
                  i === index ? 'w-5 bg-amber-400' : `w-1.5 ${theme.dot}`
                }`}
              />
            ))}
          </div>

          <label className="fun-tutorial-shell__meta mt-4 flex items-center gap-2.5 cursor-pointer select-none text-sm">
            <input
              type="checkbox"
              className="checkbox checkbox-sm checkbox-warning"
              checked={dontShowAgain}
              onChange={(e) => {
                const next = e.target.checked;
                dontShowAgainRef.current = next;
                setDontShowAgain(next);
              }}
              onClick={(e) => e.stopPropagation()}
            />
            <span>Don’t show again</span>
          </label>

          <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
            <button
              type="button"
              onClick={finish}
              className="fun-tutorial-shell__skip px-3 py-2 rounded-lg text-xs font-medium border border-[#1a2540] hover:bg-white/[0.04] transition-colors"
            >
              Skip
            </button>
            <div className="flex gap-2">
              <button
                type="button"
                disabled={isFirst}
                onClick={() => setIndex((v) => Math.max(0, v - 1))}
                className={`px-3 py-2 rounded-lg text-sm font-medium border disabled:opacity-35 transition-colors ${theme.back}`}
              >
                Back
              </button>
              {isLast ? (
                <button
                  type="button"
                  onClick={finish}
                  className="px-4 py-2 rounded-lg text-sm font-medium bg-amber-600 hover:bg-amber-500 text-amber-50 transition-colors"
                >
                  Play
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => setIndex((v) => Math.min(steps.length - 1, v + 1))}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${theme.next}`}
                >
                  Next
                </button>
              )}
            </div>
          </div>

          <p className="fun-tutorial-shell__meta mt-3 text-center text-[11px]">
            Step {index + 1} of {steps.length}
          </p>
        </div>
      </div>
    </div>
  );
}

export function makeTutorialStorage(storageKey) {
  return {
    hasSeen() {
      try {
        return window.localStorage.getItem(storageKey) === '1';
      } catch {
        return false;
      }
    },
    markSeen() {
      try {
        window.localStorage.setItem(storageKey, '1');
      } catch {
        // ignore
      }
    },
    clearSeen() {
      try {
        window.localStorage.removeItem(storageKey);
      } catch {
        // ignore
      }
    },
  };
}
