import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  TUBE_CAPACITY,
  PIGMENT_COLORS,
  SEED_LEVELS,
  canPour,
  executePour,
  getTopColor,
  getTopRunLength,
  isBoardSolved,
  isTubeCompleted,
  getHintMove,
  generateSolvablePuzzle,
  getDailyPigmentPuzzle,
  playSelectSound,
  playPourSound,
  playTubeCompleteSound,
  playVictorySound,
  playErrorSound,
} from '../lib/pigmentPour';
import { getLondonDayKey } from '../lib/nonogram';

function TubeVisual({
  tube,
  index,
  isSelected,
  isHintSource,
  isHintTarget,
  isInvalidTarget,
  onClick,
  disabled,
}) {
  const isComplete = isTubeCompleted(tube);
  const topColorKey = getTopColor(tube);
  const topColorMeta = topColorKey ? PIGMENT_COLORS[topColorKey] : null;

  return (
    <button
      type="button"
      onClick={() => onClick(index)}
      disabled={disabled}
      className={`group relative flex flex-col items-center focus:outline-none transition-all duration-200 select-none ${
        isSelected
          ? '-translate-y-4 scale-105'
          : 'hover:-translate-y-1.5'
      }`}
      aria-label={`Tube ${index + 1}: ${tube.length} segments filled`}
    >
      {/* Cork / Stopper when completely sorted */}
      <div
        className={`h-3 w-8 rounded-t-sm transition-all duration-300 ${
          isComplete
            ? 'bg-amber-700/80 border border-amber-600/90 shadow-sm opacity-100 scale-100'
            : 'opacity-0 scale-75'
        }`}
        title={isComplete ? 'Complete & Sealed' : ''}
      />

      {/* Tube Rim Lip */}
      <div
        className={`w-14 h-2.5 rounded-t-md border-t-2 border-x-2 transition-colors duration-200 ${
          isSelected
            ? 'border-cyan-400 bg-cyan-400/20 shadow-[0_0_12px_rgba(34,211,238,0.5)]'
            : isHintSource
              ? 'border-amber-400 bg-amber-400/20 animate-pulse'
              : isHintTarget
                ? 'border-emerald-400 bg-emerald-400/20 animate-pulse'
                : isComplete
                  ? 'border-emerald-400/70 bg-emerald-500/10'
                  : 'border-slate-500/60 bg-white/5'
        }`}
      />

      {/* Tube Glass Body */}
      <div
        className={`relative w-12 h-44 rounded-b-2xl border-x-2 border-b-2 flex flex-col justify-end overflow-hidden backdrop-blur-sm transition-all duration-300 ${
          isSelected
            ? 'border-cyan-400 shadow-[0_0_18px_rgba(34,211,238,0.35)] bg-slate-900/80 ring-2 ring-cyan-400/40'
            : isHintSource
              ? 'border-amber-400 shadow-[0_0_14px_rgba(251,191,36,0.4)] bg-slate-900/80 ring-2 ring-amber-400/40'
              : isHintTarget
                ? 'border-emerald-400 shadow-[0_0_14px_rgba(52,211,153,0.4)] bg-slate-900/80 ring-2 ring-emerald-400/40'
                : isInvalidTarget
                  ? 'border-rose-500/60 bg-rose-950/20'
                  : isComplete
                    ? 'border-emerald-400/60 shadow-[0_0_16px_rgba(16,185,129,0.25)] bg-[#071322]'
                    : 'border-slate-600/50 bg-[#060e1a]/85 group-hover:border-slate-400/70'
        }`}
      >
        {/* Glass reflection highlight on left */}
        <div className="absolute top-0 bottom-2 left-1 w-1 bg-gradient-to-r from-white/30 to-transparent rounded-full pointer-events-none z-20" />
        {/* Subtle right specular edge */}
        <div className="absolute top-0 bottom-3 right-1 w-0.5 bg-white/10 rounded-full pointer-events-none z-20" />

        {/* Graduation measurement ticks on side */}
        <div className="absolute inset-y-0 right-1.5 flex flex-col justify-between py-5 pointer-events-none z-10 opacity-30 group-hover:opacity-60 transition-opacity">
          <div className="w-1.5 h-[1px] bg-white" />
          <div className="w-2.5 h-[1px] bg-white" />
          <div className="w-1.5 h-[1px] bg-white" />
          <div className="w-2.5 h-[1px] bg-white" />
        </div>

        {/* Liquid Segments (stacked from bottom to top) */}
        {tube.map((colorKey, segIndex) => {
          const color = PIGMENT_COLORS[colorKey] || PIGMENT_COLORS.royal;
          const isTopSegment = segIndex === tube.length - 1;

          return (
            <div
              key={`${segIndex}-${colorKey}`}
              className="relative w-full h-10 transition-all duration-300 flex items-center justify-center overflow-hidden"
              style={{
                background: `linear-gradient(180deg, ${color.from} 0%, ${color.to} 100%)`,
                boxShadow: isComplete ? `inset 0 0 10px ${color.glow}` : undefined,
              }}
            >
              {/* Internal liquid highlight */}
              <div className="absolute top-0 left-0 right-0 h-[2px] bg-white/25 pointer-events-none" />

              {/* Meniscus / surface curve on top segment */}
              {isTopSegment && (
                <div className="absolute top-0 inset-x-0 h-1.5 bg-white/40 rounded-full blur-[0.5px] pointer-events-none" />
              )}

              {/* Subtle bubble effect for complete tubes */}
              {isComplete && (
                <div
                  className="absolute w-1.5 h-1.5 rounded-full bg-white/60 animate-ping pointer-events-none"
                  style={{
                    left: `${20 + (segIndex * 17) % 55}%`,
                    top: `${15 + (segIndex * 23) % 65}%`,
                    animationDuration: `${1.4 + segIndex * 0.3}s`,
                  }}
                />
              )}
            </div>
          );
        })}

        {/* Complete Checkmark badge inside tube */}
        {isComplete && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-20">
            <div className="w-6 h-6 rounded-full bg-slate-900/80 border border-emerald-400 text-emerald-300 flex items-center justify-center text-xs font-bold shadow-lg">
              ✓
            </div>
          </div>
        )}
      </div>

      {/* Tube Index & Label */}
      <span className="mt-2 text-[11px] font-medium text-slate-400 group-hover:text-slate-200">
        #{index + 1}
      </span>
    </button>
  );
}

export function PigmentPourSandbox() {
  const [levelIndex, setLevelIndex] = useState(3); // Default to Level 4 (Reddit standard 6c 2e)
  const [isDaily, setIsDaily] = useState(false);
  const [puzzleTitle, setPuzzleTitle] = useState(SEED_LEVELS[3].title);
  const [puzzleSubtitle, setPuzzleSubtitle] = useState(SEED_LEVELS[3].subtitle);

  const [tubes, setTubes] = useState(() => SEED_LEVELS[3].tubes.map((t) => [...t]));
  const [history, setHistory] = useState([]);
  const [selectedTube, setSelectedTube] = useState(null);
  const [movesCount, setMovesCount] = useState(0);
  const [hint, setHint] = useState(null);
  const [solved, setSolved] = useState(false);
  const [muted, setMuted] = useState(false);
  const [invalidTube, setInvalidTube] = useState(null);
  const [generating, setGenerating] = useState(false);

  // Timer
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [timerRunning, setTimerRunning] = useState(true);

  useEffect(() => {
    let interval = null;
    if (timerRunning && !solved) {
      interval = setInterval(() => {
        setElapsedSeconds((s) => s + 1);
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [timerRunning, solved]);

  const formatTimer = (secs) => {
    const mins = Math.floor(secs / 60);
    const remainder = secs % 60;
    return `${mins}:${String(remainder).padStart(2, '0')}`;
  };

  const loadSeedLevel = (idx) => {
    const seed = SEED_LEVELS[idx];
    if (!seed) return;
    setLevelIndex(idx);
    setIsDaily(false);
    setPuzzleTitle(seed.title);
    setPuzzleSubtitle(seed.subtitle);
    setTubes(seed.tubes.map((t) => [...t]));
    setHistory([]);
    setSelectedTube(null);
    setMovesCount(0);
    setHint(null);
    setSolved(false);
    setElapsedSeconds(0);
    setTimerRunning(true);
  };

  const loadDailyPuzzle = () => {
    const dayKey = getLondonDayKey();
    const puzzle = getDailyPigmentPuzzle(dayKey);
    setIsDaily(true);
    setLevelIndex(-1);
    setPuzzleTitle(`Daily Pour · ${dayKey}`);
    setPuzzleSubtitle(`${puzzle.colorCount} Colors · ${puzzle.emptyCount} Empty Tubes`);
    setTubes(puzzle.tubes.map((t) => [...t]));
    setHistory([]);
    setSelectedTube(null);
    setMovesCount(0);
    setHint(null);
    setSolved(false);
    setElapsedSeconds(0);
    setTimerRunning(true);
  };

  const generateRandomPuzzle = (colors = 6, empty = 2) => {
    setGenerating(true);
    setTimeout(() => {
      const puzzle = generateSolvablePuzzle({
        colorCount: colors,
        emptyCount: empty,
        seed: Date.now(),
        minMoves: 12,
      });
      setIsDaily(false);
      setLevelIndex(-2);
      setPuzzleTitle(`Random Flask (${colors} Colors)`);
      setPuzzleSubtitle(`${colors} Colors · ${empty} Empty Tubes`);
      setTubes(puzzle.tubes.map((t) => [...t]));
      setHistory([]);
      setSelectedTube(null);
      setMovesCount(0);
      setHint(null);
      setSolved(false);
      setElapsedSeconds(0);
      setTimerRunning(true);
      setGenerating(false);
    }, 50);
  };

  const restartCurrent = () => {
    if (history.length === 0) return;
    const initialTubes = history[0];
    setTubes(initialTubes.map((t) => [...t]));
    setHistory([]);
    setSelectedTube(null);
    setMovesCount(0);
    setHint(null);
    setSolved(false);
    setElapsedSeconds(0);
    setTimerRunning(true);
  };

  const undoMove = () => {
    if (history.length === 0) return;
    const prevTubes = history[history.length - 1];
    setHistory((prev) => prev.slice(0, -1));
    setTubes(prevTubes.map((t) => [...t]));
    setSelectedTube(null);
    setMovesCount((m) => Math.max(0, m - 1));
    setHint(null);
    setSolved(false);
    playSelectSound(muted);
  };

  const handleTubeClick = (index) => {
    if (solved) return;
    setHint(null);

    // If no tube selected yet
    if (selectedTube === null) {
      if (tubes[index].length === 0) {
        // Can't pour from empty tube
        playErrorSound(muted);
        return;
      }
      if (isTubeCompleted(tubes[index])) {
        // Already fully sorted tube
        playSelectSound(muted);
        return;
      }
      setSelectedTube(index);
      playSelectSound(muted);
      return;
    }

    // If clicking same tube, deselect
    if (selectedTube === index) {
      setSelectedTube(null);
      playSelectSound(muted);
      return;
    }

    // Attempt pour from selectedTube -> index
    if (canPour(tubes, selectedTube, index)) {
      const result = executePour(tubes, selectedTube, index);
      if (result) {
        setHistory((prev) => [...prev, tubes.map((t) => [...t])]);
        setTubes(result.tubes);
        setSelectedTube(null);
        setMovesCount((m) => m + 1);

        playPourSound(result.pourCount, muted);

        if (result.justCompleted) {
          setTimeout(() => playTubeCompleteSound(muted), 120);
        }

        if (isBoardSolved(result.tubes)) {
          setSolved(true);
          setTimerRunning(false);
          setTimeout(() => playVictorySound(muted), 250);
        }
      }
    } else {
      // Invalid pour attempt
      setInvalidTube(index);
      setTimeout(() => setInvalidTube(null), 350);
      playErrorSound(muted);

      // If clicked another valid source tube, switch selection
      if (tubes[index].length > 0 && !isTubeCompleted(tubes[index])) {
        setSelectedTube(index);
      } else {
        setSelectedTube(null);
      }
    }
  };

  const requestHint = () => {
    if (solved) return;
    const nextMove = getHintMove(tubes);
    if (nextMove) {
      setHint(nextMove);
      setSelectedTube(nextMove.from);
      playSelectSound(muted);
    } else {
      alert('No winning solution found from this current configuration. Try undoing some moves or restarting!');
    }
  };

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      {/* Dev Area Header Banner */}
      <div className="rounded-2xl border border-indigo-500/30 bg-gradient-to-r from-indigo-950/40 via-purple-950/30 to-slate-900/60 p-5 shadow-xl backdrop-blur-md">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold tracking-wider uppercase bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                Dev Sandbox
              </span>
              <h2 className="text-xl font-bold text-white tracking-tight">
                Pigment Pour
              </h2>
            </div>
            <p className="text-sm text-slate-300 mt-1 max-w-2xl">
              Clone of the Reddit <span className="text-indigo-300 font-medium">Pigment Pour</span> daily puzzle.
              Pour colored pigments between flasks until each contains only a single uniform pigment.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setMuted((m) => !m)}
              className="px-3 py-1.5 rounded-lg border border-[#1a2540] bg-[#060e1a] text-slate-300 hover:text-white text-xs font-medium transition-colors flex items-center gap-1.5"
              title={muted ? 'Unmute audio' : 'Mute audio'}
            >
              {muted ? '🔇 Muted' : '🔊 Sound On'}
            </button>
            <button
              type="button"
              onClick={loadDailyPuzzle}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
                isDaily
                  ? 'bg-amber-500/20 border-amber-400 text-amber-200 shadow-[0_0_12px_rgba(251,191,36,0.25)]'
                  : 'bg-indigo-600/20 border-indigo-500/40 text-indigo-200 hover:bg-indigo-600/30'
              }`}
            >
              📅 Today’s Daily
            </button>
          </div>
        </div>

        {/* Level Progression Pills */}
        <div className="mt-4 pt-4 border-t border-[#1a2540] flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-xs text-slate-400 font-medium mr-1">Levels:</span>
            {SEED_LEVELS.map((seed, idx) => (
              <button
                key={seed.id}
                type="button"
                onClick={() => loadSeedLevel(idx)}
                className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
                  !isDaily && levelIndex === idx
                    ? 'bg-indigo-600 text-white font-semibold shadow-sm'
                    : 'bg-[#060e1a] text-slate-300 border border-[#1a2540] hover:bg-white/5'
                }`}
              >
                {idx + 1}. {seed.title.split('·')[1]?.trim() || seed.title}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={generating}
              onClick={() => generateRandomPuzzle(6, 2)}
              className="px-3 py-1 rounded-md text-xs font-medium bg-[#060e1a] text-slate-300 border border-[#1a2540] hover:bg-white/5 disabled:opacity-50"
            >
              🎲 {generating ? 'Generating…' : 'Random 6c'}
            </button>
            <button
              type="button"
              disabled={generating}
              onClick={() => generateRandomPuzzle(8, 2)}
              className="px-3 py-1 rounded-md text-xs font-medium bg-[#060e1a] text-slate-300 border border-[#1a2540] hover:bg-white/5 disabled:opacity-50"
            >
              🎲 Random 8c
            </button>
          </div>
        </div>
      </div>

      {/* Main Play Area Card */}
      <div className="relative rounded-2xl border border-[#1a2540] bg-[#0b1220]/90 p-6 shadow-2xl backdrop-blur-md">
        {/* Status Bar */}
        <div className="flex flex-wrap items-center justify-between gap-4 pb-5 border-b border-[#1a2540]">
          <div>
            <h3 className="text-lg font-bold text-white flex items-center gap-2">
              {puzzleTitle}
              {solved && (
                <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 animate-bounce">
                  SOLVED!
                </span>
              )}
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">{puzzleSubtitle}</p>
          </div>

          <div className="flex items-center gap-4">
            <div className="bg-[#060e1a] border border-[#1a2540] rounded-lg px-3 py-1.5 text-center">
              <span className="block text-[10px] uppercase text-slate-400 font-semibold">Moves</span>
              <span className="text-sm font-bold text-indigo-300 font-mono">{movesCount}</span>
            </div>

            <div className="bg-[#060e1a] border border-[#1a2540] rounded-lg px-3 py-1.5 text-center">
              <span className="block text-[10px] uppercase text-slate-400 font-semibold">Time</span>
              <span className="text-sm font-bold text-slate-200 font-mono">{formatTimer(elapsedSeconds)}</span>
            </div>
          </div>
        </div>

        {/* Tubes Rack Shelf */}
        <div className="py-12 px-4 flex flex-wrap justify-center items-end gap-5 sm:gap-7 min-h-[280px]">
          {tubes.map((tube, index) => (
            <TubeVisual
              key={index}
              tube={tube}
              index={index}
              isSelected={selectedTube === index}
              isHintSource={hint?.from === index}
              isHintTarget={hint?.to === index}
              isInvalidTarget={invalidTube === index}
              onClick={handleTubeClick}
              disabled={solved}
            />
          ))}
        </div>

        {/* Wooden / Metallic Lab Rack Floor Stand */}
        <div className="w-full h-3 rounded-full bg-gradient-to-r from-slate-700 via-slate-500 to-slate-700 shadow-lg border-t border-white/20 mt-2" />

        {/* Controls Toolbar */}
        <div className="mt-6 flex flex-wrap items-center justify-between gap-3 pt-4 border-t border-[#1a2540]">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={undoMove}
              disabled={history.length === 0 || solved}
              className="px-3 py-2 rounded-lg border border-[#1a2540] bg-[#060e1a] text-slate-200 hover:bg-white/5 text-sm font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1.5"
            >
              ↩️ Undo
            </button>
            <button
              type="button"
              onClick={restartCurrent}
              disabled={history.length === 0 && movesCount === 0}
              className="px-3 py-2 rounded-lg border border-[#1a2540] bg-[#060e1a] text-slate-200 hover:bg-white/5 text-sm font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1.5"
            >
              🔄 Restart
            </button>
            <button
              type="button"
              onClick={requestHint}
              disabled={solved}
              className="px-3 py-2 rounded-lg border border-amber-500/40 bg-amber-500/10 text-amber-200 hover:bg-amber-500/20 text-sm font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1.5"
            >
              💡 Hint
            </button>
          </div>

          <div className="text-xs text-slate-400">
            {selectedTube !== null ? (
              <span className="text-cyan-300 font-medium">
                Tube #{selectedTube + 1} selected — tap target flask to pour
              </span>
            ) : (
              <span>Tap any flask to select it</span>
            )}
          </div>
        </div>

        {/* Solved Overlay Celebration */}
        {solved && (
          <div className="absolute inset-0 bg-[#060e1a]/85 backdrop-blur-md rounded-2xl flex flex-col items-center justify-center p-6 z-30 animate-fadeIn text-center">
            <div className="w-16 h-16 rounded-full bg-emerald-500/20 border-2 border-emerald-400 flex items-center justify-center text-3xl mb-3 shadow-[0_0_24px_rgba(16,185,129,0.4)] animate-bounce">
              🧪
            </div>
            <h3 className="text-2xl font-extrabold text-white">
              Flasks Sorted!
            </h3>
            <p className="text-slate-300 text-sm mt-1 max-w-md">
              Spectacular pour work! You sorted every pigment cleanly in{' '}
              <strong className="text-indigo-300">{movesCount} moves</strong> and{' '}
              <strong className="text-emerald-300">{formatTimer(elapsedSeconds)}</strong>.
            </p>

            <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
              {levelIndex >= 0 && levelIndex < SEED_LEVELS.length - 1 && (
                <button
                  type="button"
                  onClick={() => loadSeedLevel(levelIndex + 1)}
                  className="px-5 py-2.5 rounded-xl font-bold bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg transition-transform hover:scale-105"
                >
                  Next Level →
                </button>
              )}
              <button
                type="button"
                onClick={restartCurrent}
                className="px-4 py-2.5 rounded-xl font-medium border border-[#1a2540] bg-[#060e1a] text-slate-200 hover:bg-white/5"
              >
                Replay Level
              </button>
              <button
                type="button"
                onClick={() => generateRandomPuzzle(6, 2)}
                className="px-4 py-2.5 rounded-xl font-medium bg-emerald-600/30 border border-emerald-500/50 text-emerald-100 hover:bg-emerald-600/40"
              >
                Play Random Puzzle
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Rules & Help Card */}
      <div className="rounded-xl border border-[#1a2540] bg-[#060e1a]/60 p-4 text-xs text-slate-400 space-y-2">
        <h4 className="font-semibold text-slate-200 uppercase tracking-wider text-[11px]">
          How to Play Pigment Pour
        </h4>
        <ul className="list-disc list-inside space-y-1">
          <li>
            <strong>Pour matching pigments:</strong> You can pour liquid onto the same color in the destination flask, or into any completely empty flask.
          </li>
          <li>
            <strong>Flask capacity:</strong> Each flask holds up to 4 segments of liquid. Multiple contiguous segments of the same top color will pour together if space permits.
          </li>
          <li>
            <strong>Win condition:</strong> Separate all colors so each non-empty flask holds 4 segments of one single pure color.
          </li>
        </ul>
      </div>
    </div>
  );
}

export default PigmentPourSandbox;
