import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ENCLOSE_SEED_PUZZLES,
  ITEM,
  ITEM_BONUS,
  analyzeEnclosure,
  arrayToWalls,
  clearLocalProgress,
  clonePuzzle,
  describeTile,
  getPuzzleById,
  getPuzzleForDay,
  loadLocalProgress,
  parseKey,
  saveLocalProgress,
  scoreLabel,
  starterPenWalls,
  toggleWall,
  wallsToArray,
} from '../lib/enclose';
import { ENCLOSE_LIVE_FROM } from '../lib/funRotation';
import { getLondonDayKey } from '../lib/nonogram';
import {
  AppleIcon,
  BeeIcon,
  CherryIcon,
  EncloseLegend,
  FenceIcon,
  HorseIcon,
  ItemIcon,
  PortalIcon,
  SignpostTip,
  WheatStalk,
  itemLabel,
  signpostForTile,
} from './encloseGraphics';
import EncloseTutorialModal, {
  hasSeenEncloseTutorial,
} from './EncloseTutorialModal';
import FunLeaderboardRow from './FunLeaderboardRow';

function bonusPopupText(item, bonus) {
  const sign = bonus > 0 ? '+' : '';
  const name = itemLabel(item);
  return `${name} ${sign}${bonus}`;
}

function buildHarvestFx(puzzle, analysis, runId) {
  const horse = puzzle.horse || { r: 0, c: 0 };
  const delays = {};
  let maxDelay = 0;
  for (const key of analysis.reachable) {
    const { r, c } = parseKey(key);
    const dist = Math.abs(r - horse.r) + Math.abs(c - horse.c);
    const delay = dist * 70;
    delays[key] = delay;
    if (delay > maxDelay) maxDelay = delay;
  }

  const popups = [];
  let popupIndex = 0;
  for (const key of analysis.reachable) {
    const { r, c } = parseKey(key);
    const item = (puzzle.items || {})[key];
    if (!item) continue;
    const bonus = ITEM_BONUS[item] || 0;
    popups.push({
      id: `${runId}-${key}-item`,
      r,
      c,
      text: bonusPopupText(item, bonus),
      tone: bonus < 0 ? 'bad' : item === ITEM.APPLE ? 'great' : 'good',
      delay: (delays[key] || 0) + 380 + popupIndex * 90,
    });
    popupIndex += 1;
  }

  popups.push({
    id: `${runId}-tiles`,
    r: horse.r,
    c: horse.c,
    text: `+${analysis.breakdown.tiles} field`,
    tone: 'tile',
    delay: 220,
  });

  return {
    runId,
    delays,
    popups,
    score: analysis.score,
    bannerDelay: maxDelay + 520 + popupIndex * 40,
  };
}

function formatLbTime(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}

export default function EnclosePanel({
  puzzle: puzzleProp = null,
  sandbox = true,
  forceTutorial = false,
  showDevBadge = true,
  currentUserUid = null,
  onAchievements = null,
  competitive = false,
  initialWalls = null,
  initialSubmitted = false,
  initialBestScore = 0,
  initialMessage = '',
  initialLeaderboard = null,
}) {
  const todayKey = getLondonDayKey();
  const puzzle = useMemo(
    () => clonePuzzle(puzzleProp || getPuzzleForDay(todayKey)),
    [puzzleProp, todayKey],
  );

  const [walls, setWalls] = useState(() => new Set());
  const [previewReach, setPreviewReach] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [bestScore, setBestScore] = useState(0);
  const [message, setMessage] = useState('');
  const [history, setHistory] = useState([]);
  const [harvest, setHarvest] = useState(null);
  const [harvestSettled, setHarvestSettled] = useState(false);
  const [showBanner, setShowBanner] = useState(false);
  const [tutorialOpen, setTutorialOpen] = useState(false);
  const [fenceStampKey, setFenceStampKey] = useState({});
  const [leaderboard, setLeaderboard] = useState(() => (
    Array.isArray(initialLeaderboard) ? initialLeaderboard : []
  ));
  const [startedAt] = useState(() => new Date().toISOString());
  const [submitting, setSubmitting] = useState(false);

  const prevEscapedRef = useRef(true);
  const harvestRunRef = useRef(0);

  useEffect(() => {
    if (competitive) {
      setWalls(initialWalls?.length ? arrayToWalls(initialWalls) : new Set());
      setSubmitted(Boolean(initialSubmitted));
      setBestScore(Number(initialBestScore) || 0);
      setLeaderboard(Array.isArray(initialLeaderboard) ? initialLeaderboard : []);
      setMessage(initialMessage || '');
      setHistory([]);
    } else {
      const saved = loadLocalProgress(puzzle.id);
      if (saved?.walls) {
        setWalls(arrayToWalls(saved.walls));
        setSubmitted(Boolean(saved.submitted));
        setBestScore(Number(saved.bestScore) || 0);
        setHistory([]);
      } else {
        setWalls(new Set());
        setSubmitted(false);
        setBestScore(0);
        setHistory([]);
      }
      setMessage('');
    }
    setPreviewReach(Boolean(competitive && initialSubmitted));
    setHarvest(null);
    setHarvestSettled(false);
    setShowBanner(false);
    setFenceStampKey({});
    prevEscapedRef.current = true;
  }, [
    puzzle.id,
    competitive,
    initialWalls,
    initialSubmitted,
    initialBestScore,
    initialMessage,
    initialLeaderboard,
  ]);

  useEffect(() => {
    // Only auto-open when the user hasn’t opted out (“Don’t show again”).
    if (!hasSeenEncloseTutorial()) setTutorialOpen(true);
  }, []);

  const analysis = useMemo(() => analyzeEnclosure(puzzle, walls), [puzzle, walls]);

  useEffect(() => {
    if (sandbox && !submitted) {
      saveLocalProgress(puzzle.id, {
        walls: wallsToArray(walls),
        bestScore,
        submitted: false,
      });
    }
  }, [walls, bestScore, puzzle.id, sandbox, submitted]);

  useEffect(() => {
    if (!analysis.escaped && analysis.score > bestScore) {
      setBestScore(analysis.score);
    }
  }, [analysis, bestScore]);

  useEffect(() => {
    const wasEscaped = prevEscapedRef.current;
    if (analysis.escaped) {
      prevEscapedRef.current = true;
      setHarvest(null);
      setHarvestSettled(false);
      setShowBanner(false);
      return undefined;
    }

    if (!wasEscaped) {
      prevEscapedRef.current = false;
      return undefined;
    }

    prevEscapedRef.current = false;
    harvestRunRef.current += 1;
    const runId = harvestRunRef.current;
    const fx = buildHarvestFx(puzzle, analysis, runId);
    setHarvest(fx);
    setHarvestSettled(false);
    setShowBanner(false);
    setPreviewReach(false);

    const settleMs = Math.max(...Object.values(fx.delays), 0) + 650;
    const settleTimer = window.setTimeout(() => {
      if (harvestRunRef.current === runId) setHarvestSettled(true);
    }, settleMs);

    const bannerTimer = window.setTimeout(() => {
      if (harvestRunRef.current === runId) setShowBanner(true);
    }, fx.bannerDelay);

    const bannerHide = window.setTimeout(() => {
      if (harvestRunRef.current === runId) setShowBanner(false);
    }, fx.bannerDelay + 2500);

    return () => {
      window.clearTimeout(settleTimer);
      window.clearTimeout(bannerTimer);
      window.clearTimeout(bannerHide);
    };
  }, [analysis, puzzle]);

  const onCellClick = (r, c) => {
    if (submitted) return;
    const horse = puzzle.horse || {};
    if (horse.r === r && horse.c === c) {
      setPreviewReach((open) => !open);
      setMessage(previewReach ? '' : 'Reach preview on — gaps glow amber.');
      return;
    }
    const key = `${r},${c}`;
    const wasWall = walls.has(key);
    const result = toggleWall(puzzle, walls, r, c);
    if (!result.changed) {
      if (result.reason === 'budget') setMessage(`Wall budget used (${puzzle.wallBudget}).`);
      return;
    }
    setHistory((prev) => [...prev, wallsToArray(walls)]);
    setWalls(result.walls);
    if (!wasWall && result.walls.has(key)) {
      setFenceStampKey((prev) => ({ ...prev, [key]: (prev[key] || 0) + 1 }));
    }
    setMessage('');
  };

  const onUndo = () => {
    if (submitted || !history.length) return;
    const prev = history[history.length - 1];
    setHistory((h) => h.slice(0, -1));
    setWalls(arrayToWalls(prev));
    setMessage('Undid last wall change.');
  };

  const onReset = () => {
    if (submitted) return;
    setHistory((prev) => [...prev, wallsToArray(walls)]);
    setWalls(new Set());
    setPreviewReach(false);
    setMessage('Board cleared.');
  };

  const onStarterPen = () => {
    if (submitted) return;
    const pen = starterPenWalls(puzzle);
    if (!pen.size) {
      setMessage('No wallable cells around the cow.');
      return;
    }
    if (pen.size > (puzzle.wallBudget || 0)) {
      setMessage(`Starter pen needs ${pen.size} fences (budget ${puzzle.wallBudget}).`);
      return;
    }
    setHistory((prev) => [...prev, wallsToArray(walls)]);
    const stamps = {};
    for (const key of pen) stamps[key] = (fenceStampKey[key] || 0) + 1;
    setFenceStampKey((prev) => ({ ...prev, ...stamps }));
    setWalls(pen);
    const next = analyzeEnclosure(puzzle, pen);
    setMessage(
      next.escaped
        ? 'Starter pen placed, but the cow can still reach the edge — check chests/gaps.'
        : `Starter pen placed · score ${next.score}. Expand outward for a higher score.`,
    );
  };

  const onSubmit = async () => {
    if (submitted || submitting) return;
    if (analysis.escaped) {
      setMessage('Not enclosed — the cow can still walk to the map edge. Fence around the cow, not the whole border.');
      return;
    }

    if (competitive && !sandbox) {
      setSubmitting(true);
      try {
        const durationMs = Math.max(0, Date.now() - new Date(startedAt).getTime());
        const response = await fetch('/api/submitEncloseResult', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            walls: wallsToArray(walls),
            startedAt,
            durationMs,
          }),
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
          setMessage(payload.error || 'Submit failed.');
          return;
        }
        setSubmitted(true);
        setPreviewReach(true);
        setLeaderboard(Array.isArray(payload.leaderboard) ? payload.leaderboard : []);
        setBestScore(Math.max(bestScore, Number(payload.game?.score) || analysis.score));
        setMessage(`Submitted · score ${payload.game?.score ?? analysis.score}.`);
        if (Array.isArray(payload.achievements) && onAchievements) onAchievements(payload.achievements);
      } catch {
        setMessage('Submit failed.');
      } finally {
        setSubmitting(false);
      }
      return;
    }

    setSubmitted(true);
    setPreviewReach(true);
    saveLocalProgress(puzzle.id, {
      walls: wallsToArray(walls),
      bestScore: Math.max(bestScore, analysis.score),
      submitted: true,
      score: analysis.score,
    });
    setMessage(
      showDevBadge
        ? `Submitted · score ${analysis.score}. Dev sandbox only — nothing saved to live Fun.`
        : `Practice complete · score ${analysis.score}. Practice doesn’t count for leaderboards.`,
    );
  };

  const onClearLocal = () => {
    clearLocalProgress(puzzle.id);
    setWalls(new Set());
    setSubmitted(false);
    setBestScore(0);
    setHistory([]);
    setPreviewReach(false);
    setHarvest(null);
    setHarvestSettled(false);
    setShowBanner(false);
    setFenceStampKey({});
    prevEscapedRef.current = true;
    setMessage('Local progress cleared.');
  };

  const wallCount = walls.size;
  const cellPx = puzzle.cols >= 11 ? 30 : puzzle.cols >= 10 ? 32 : 36;
  const harvesting = Boolean(harvest) && !analysis.escaped;
  const iconPx = cellPx >= 34 ? 'w-5 h-5' : 'w-[18px] h-[18px]';
  const horsePx = cellPx >= 34 ? 'w-8 h-8' : cellPx >= 32 ? 'w-7 h-7' : 'w-6 h-6';

  const popupByCell = useMemo(() => {
    const map = new Map();
    if (!harvest) return map;
    for (const popup of harvest.popups) {
      const key = `${popup.r},${popup.c}`;
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(popup);
    }
    return map;
  }, [harvest]);

  return (
    <div className="space-y-4">
      <EncloseTutorialModal open={tutorialOpen} onClose={() => setTutorialOpen(false)} />

      <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 px-4 py-3 space-y-1">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-sm font-semibold text-emerald-100">{puzzle.title}</p>
            <p className="text-xs text-emerald-200/70">
              Fence a pen around the cow — don’t seal the whole map edge · tap grass for fences · tap the cow for reach
            </p>
          </div>
          {sandbox && showDevBadge ? (
            <span className="text-[11px] text-amber-200 border border-amber-500/30 bg-amber-500/10 rounded-md px-2 py-1">
              Dev sandbox
            </span>
          ) : null}
          {sandbox && !showDevBadge ? (
            <span className="text-[11px] text-emerald-200 border border-emerald-500/30 bg-emerald-500/10 rounded-md px-2 py-1">
              Practice
            </span>
          ) : null}
        </div>
      </div>

      <div className="flex flex-wrap gap-3 text-sm">
        <div className="rounded-lg border border-[#1a2540] bg-[#060e1a] px-3 py-2 min-w-[7rem]">
          <p className="text-[10px] uppercase tracking-wider text-slate-500">Fences</p>
          <p className="text-xl font-semibold tabular-nums text-slate-100">
            {wallCount}/{puzzle.wallBudget}
          </p>
        </div>
        <div
          className={`rounded-lg border border-[#1a2540] bg-[#060e1a] px-3 py-2 min-w-[7rem] ${
            !analysis.escaped ? 'enclose-stat--enclosed' : ''
          }`}
        >
          <p className="text-[10px] uppercase tracking-wider text-slate-500">Score</p>
          <p className={`text-xl font-semibold tabular-nums ${analysis.escaped ? 'text-rose-300' : 'text-amber-200'}`}>
            {scoreLabel(analysis)}
          </p>
        </div>
        <div className="rounded-lg border border-[#1a2540] bg-[#060e1a] px-3 py-2 min-w-[7rem]">
          <p className="text-[10px] uppercase tracking-wider text-slate-500">Best</p>
          <p className="text-xl font-semibold tabular-nums text-amber-200">{bestScore || 0}</p>
        </div>
      </div>

      {analysis.escaped ? (
        <p className="text-xs text-rose-300/80">
          Open — cow can still reach the edge. Build a closed fence around it (corners count).
        </p>
      ) : (
        <p className="text-xs text-slate-500 flex flex-wrap items-center gap-x-2 gap-y-1">
          <span>Enclosed · {analysis.breakdown.tiles} tiles</span>
          {analysis.breakdown.cherries ? (
            <span className="inline-flex items-center gap-1">
              <CherryIcon className="w-3.5 h-3.5" />×{analysis.breakdown.cherries}
              (+{analysis.breakdown.cherries * ITEM_BONUS[ITEM.CHERRY]})
            </span>
          ) : null}
          {analysis.breakdown.apples ? (
            <span className="inline-flex items-center gap-1">
              <AppleIcon className="w-3.5 h-3.5" />×{analysis.breakdown.apples}
              (+{analysis.breakdown.apples * ITEM_BONUS[ITEM.APPLE]})
            </span>
          ) : null}
          {analysis.breakdown.bees ? (
            <span className="inline-flex items-center gap-1">
              <BeeIcon className="w-3.5 h-3.5" />×{analysis.breakdown.bees}
              ({analysis.breakdown.bees * ITEM_BONUS[ITEM.BEE]})
            </span>
          ) : null}
        </p>
      )}

      <div className="enclose-play-row">
        <div className="enclose-board-frame">
          {showBanner && harvest ? (
            <div className="enclose-score-banner">
              Enclosed · {harvest.score} pts
            </div>
          ) : null}
          <div className={`enclose-board-inner ${harvesting && !harvestSettled ? 'enclose-board-inner--harvest-glow' : ''}`}>
            <div
              className="grid gap-[3px] relative"
              style={{ gridTemplateColumns: `repeat(${puzzle.cols}, ${cellPx}px)` }}
            >
              {Array.from({ length: puzzle.rows }).map((_, r) => (
                Array.from({ length: puzzle.cols }).map((__, c) => {
                  const tile = describeTile(puzzle, walls, r, c);
                  const isBorder =
                    r === 0 || c === 0 || r === puzzle.rows - 1 || c === puzzle.cols - 1;
                  const inHarvest = harvesting && analysis.reachable.has(tile.key) && !tile.wall && !tile.water;
                  const inReach = previewReach && analysis.reachable.has(tile.key) && !tile.wall;
                  const tip = signpostForTile(tile);

                  let cellClass = 'enclose-cell enclose-cell--grass';
                  if (isBorder) cellClass += ' enclose-cell--border';
                  if (tile.water) cellClass = 'enclose-cell enclose-cell--water';
                  if (tile.wall) cellClass = 'enclose-cell enclose-cell--wall';
                  if (inHarvest) cellClass = 'enclose-cell enclose-cell--harvest';
                  else if (inReach) {
                    cellClass = analysis.escaped
                      ? 'enclose-cell enclose-cell--reach-open'
                      : 'enclose-cell enclose-cell--reach-closed';
                  }
                  if (tip) cellClass += ' enclose-cell--tip';

                  const cellPopups = popupByCell.get(tile.key) || [];
                  const wheatDelay = harvest?.delays?.[tile.key] ?? 0;

                  return (
                    <button
                      key={tile.key}
                      type="button"
                      disabled={submitted && !tile.isHorse}
                      onClick={() => onCellClick(r, c)}
                      aria-label={
                        tip
                          ? `${tip.title}. ${tip.effect || ''}`
                          : tile.placeable
                            ? 'Grass — place fence'
                            : 'Cell'
                      }
                      className={`${cellClass} disabled:cursor-default`}
                      style={{ width: cellPx, height: cellPx }}
                    >
                      {inHarvest ? (
                        <WheatStalk
                          key={`${harvest.runId}-${tile.key}`}
                          delayMs={wheatDelay}
                          settled={harvestSettled}
                        />
                      ) : null}

                      {tile.isHorse ? (
                        <span className="enclose-piece enclose-piece--cow">
                          <HorseIcon className={horsePx} enclosed={!analysis.escaped} />
                        </span>
                      ) : tile.wall ? (
                        <FenceIcon key={`fence-${tile.key}-${fenceStampKey[tile.key] || 0}`} />
                      ) : tile.portal ? (
                        <span className="enclose-piece">
                          <PortalIcon className={iconPx} />
                        </span>
                      ) : tile.item ? (
                        <span className="enclose-piece">
                          <ItemIcon item={tile.item} className={iconPx} />
                        </span>
                      ) : null}

                      {tip ? <SignpostTip title={tip.title} effect={tip.effect} tone={tip.tone} /> : null}

                      {cellPopups.map((popup) => (
                        <span
                          key={popup.id}
                          className={`enclose-rpg-popup enclose-rpg-popup--${popup.tone}`}
                          style={{ animationDelay: `${popup.delay}ms` }}
                        >
                          {popup.text}
                        </span>
                      ))}
                    </button>
                  );
                })
              ))}
            </div>
          </div>
        </div>
        <EncloseLegend />
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={submitted || !history.length}
          onClick={onUndo}
          className="px-3 py-1.5 rounded-lg text-xs font-medium border border-[#1a2540] text-slate-300 hover:bg-white/[0.03] disabled:opacity-40"
        >
          Undo
        </button>
        <button
          type="button"
          disabled={submitted || wallCount === 0}
          onClick={onReset}
          className="px-3 py-1.5 rounded-lg text-xs font-medium border border-[#1a2540] text-slate-300 hover:bg-white/[0.03] disabled:opacity-40"
        >
          Reset
        </button>
        <button
          type="button"
          disabled={submitted}
          onClick={onStarterPen}
          className="px-3 py-1.5 rounded-lg text-xs font-medium border border-emerald-500/40 text-emerald-100 hover:bg-emerald-500/15 disabled:opacity-40"
        >
          Place starter pen
        </button>
        <button
          type="button"
          disabled={submitted || submitting}
          onClick={onSubmit}
          className="px-3 py-1.5 rounded-lg text-xs font-medium bg-indigo-600 hover:bg-indigo-500 text-white disabled:opacity-40"
        >
          {submitted ? 'Submitted' : submitting ? 'Submitting…' : 'Submit'}
        </button>
        <button
          type="button"
          onClick={() => setPreviewReach((v) => !v)}
          className="px-3 py-1.5 rounded-lg text-xs font-medium border border-emerald-500/30 text-emerald-200 hover:bg-emerald-500/10"
        >
          {previewReach ? 'Hide reach' : 'Show reach'}
        </button>
        <button
          type="button"
          onClick={() => setTutorialOpen(true)}
          className="px-3 py-1.5 rounded-lg text-xs font-medium border border-amber-500/35 text-amber-100 hover:bg-amber-500/10"
        >
          How to play
        </button>
        {sandbox ? (
          <button
            type="button"
            onClick={onClearLocal}
            className="px-3 py-1.5 rounded-lg text-xs font-medium border border-rose-500/30 text-rose-200 hover:bg-rose-500/10"
          >
            Clear local
          </button>
        ) : null}
      </div>

      {message ? <p className="text-sm text-slate-300">{message}</p> : null}

      {competitive && !sandbox ? (
        <div className="rounded-xl border border-[#1a2540] overflow-hidden">
          <div className="px-4 py-3 border-b border-[#1a2540] flex items-center justify-between gap-3">
            <p className="text-sm font-semibold text-indigo-200">Leaderboard</p>
            <p className="text-xs text-slate-500">{leaderboard.length} played</p>
          </div>
          {leaderboard.length === 0 ? (
            <p className="px-4 py-3 text-xs text-slate-500">Nobody has enclosed today’s cow yet.</p>
          ) : (
            <ol className="divide-y divide-[#1a2540]">
              {leaderboard.slice(0, 10).map((row) => (
                <FunLeaderboardRow
                  key={row.uid || row.rank}
                  row={row}
                  currentUserUid={currentUserUid}
                  resultText={row.resultLabel || `${row.score ?? 0} pts`}
                  metaText={row.completedAt ? formatLbTime(row.completedAt) : ''}
                />
              ))}
            </ol>
          )}
        </div>
      ) : null}

      <div className="rounded-xl border border-[#1a2540] px-4 py-3 text-xs text-slate-400 space-y-2">
        <p className="font-semibold text-slate-300">Quick tip</p>
        <p>
          Build a closed pen around the cow so it cannot walk to any border cell. When the fence closes, crops grow and bonuses pop.
        </p>
        <button
          type="button"
          onClick={() => setTutorialOpen(true)}
          className="text-amber-200/90 hover:text-amber-100 underline underline-offset-2"
        >
          Open full tutorial
        </button>
      </div>
    </div>
  );
}

/** Practice launch: 5 seed levels (pre-rotation). */
export function EnclosePracticePanel() {
  const [seedId, setSeedId] = useState(ENCLOSE_SEED_PUZZLES[0]?.id || '');
  const [puzzle, setPuzzle] = useState(() => clonePuzzle(ENCLOSE_SEED_PUZZLES[0]));

  const loadSeed = (id) => {
    const next = getPuzzleById(id);
    if (!next) return;
    setSeedId(id);
    setPuzzle(clonePuzzle(next));
  };

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 space-y-2">
        <p className="text-sm font-semibold text-emerald-100">Enclose practice · 5 levels</p>
        <p className="text-sm text-slate-300">
          We’re putting Enclose into the Fun rotation from{' '}
          <span className="text-white font-medium">{ENCLOSE_LIVE_FROM}</span>. Today, play through these five
          seed levels to get used to fencing the cow — practice scores stay local and don’t count for
          leaderboards or streaks.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {ENCLOSE_SEED_PUZZLES.map((seed, index) => {
          const active = seed.id === seedId;
          return (
            <button
              key={seed.id}
              type="button"
              onClick={() => loadSeed(seed.id)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                active
                  ? 'bg-emerald-600/30 border-emerald-400/50 text-emerald-100'
                  : 'border-[#1a2540] text-slate-300 hover:bg-white/[0.03]'
              }`}
            >
              {index + 1}. {seed.title}
            </button>
          );
        })}
      </div>

      <EnclosePanel
        key={puzzle.id}
        puzzle={puzzle}
        sandbox
        showDevBadge={false}
      />
    </div>
  );
}

/** Competitive daily Enclose (from ENCLOSE_LIVE_FROM). */
export function EncloseDailyPanel({ currentUserUid = null, onAchievements = null }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [puzzle, setPuzzle] = useState(null);
  const [game, setGame] = useState(null);
  const [leaderboard, setLeaderboard] = useState([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        setError('');
        const response = await fetch('/api/getDailyEnclose', { credentials: 'include' });
        const payload = await response.json().catch(() => ({}));
        if (cancelled) return;
        if (!response.ok) {
          setError(payload.error || 'Could not load daily Enclose.');
          return;
        }
        if (!payload.puzzle) {
          setError(payload.message || 'Enclose is closed today.');
          return;
        }
        setPuzzle(clonePuzzle(payload.puzzle));
        setGame(payload.game || null);
        setLeaderboard(Array.isArray(payload.leaderboard) ? payload.leaderboard : []);
        if (Array.isArray(payload.achievements) && onAchievements) onAchievements(payload.achievements);
      } catch {
        if (!cancelled) setError('Could not load daily Enclose.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- load once on mount
  }, []);

  if (loading) {
    return <p className="text-sm text-slate-400">Loading Enclose…</p>;
  }
  if (error || !puzzle) {
    return <p className="text-sm text-rose-300">{error || 'Puzzle unavailable.'}</p>;
  }

  const done = game?.status === 'won' || game?.status === 'lost';
  const initialMessage = done
    ? (game.status === 'won'
      ? `Submitted · score ${game.score}.`
      : 'Already submitted (escaped).')
    : '';

  return (
    <EnclosePanel
      key={puzzle.id}
      puzzle={puzzle}
      sandbox={false}
      competitive
      showDevBadge={false}
      currentUserUid={currentUserUid}
      onAchievements={onAchievements}
      initialWalls={Array.isArray(game?.walls) ? game.walls : []}
      initialSubmitted={done}
      initialBestScore={Number(game?.score) || 0}
      initialMessage={initialMessage}
      initialLeaderboard={leaderboard}
    />
  );
}

export function EncloseSandbox() {
  const todayKey = getLondonDayKey();
  const [mode, setMode] = useState('seed');
  const [seedId, setSeedId] = useState(ENCLOSE_SEED_PUZZLES[0]?.id || '');
  const [dayKey, setDayKey] = useState(todayKey);
  const [puzzle, setPuzzle] = useState(() => ENCLOSE_SEED_PUZZLES[0] || getPuzzleForDay(todayKey));

  const loadSeed = () => {
    const next = getPuzzleById(seedId);
    if (next) setPuzzle(clonePuzzle(next));
  };

  const loadDay = () => {
    setPuzzle(getPuzzleForDay(dayKey || todayKey));
  };

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-[#1a2540] p-4 space-y-3">
        <p className="text-sm text-slate-300">
          Admin sandbox for Enclose (cow). Practice seeds are on the Fun tab until{' '}
          <span className="text-white font-medium">{ENCLOSE_LIVE_FROM}</span>; competitive daily + leaderboards
          start that day.
        </p>
        <div className="flex flex-wrap gap-3 items-end">
          <label className="text-xs text-slate-400 space-y-1">
            Mode
            <select
              value={mode}
              onChange={(e) => setMode(e.target.value)}
              className="block bg-[#060e1a] border border-[#1a2540] rounded-md px-3 py-2 text-sm text-slate-100"
            >
              <option value="seed">Seed puzzle</option>
              <option value="day">Day key (generated)</option>
            </select>
          </label>
          {mode === 'seed' ? (
            <>
              <label className="text-xs text-slate-400 space-y-1">
                Seed
                <select
                  value={seedId}
                  onChange={(e) => setSeedId(e.target.value)}
                  className="block bg-[#060e1a] border border-[#1a2540] rounded-md px-3 py-2 text-sm text-slate-100"
                >
                  {ENCLOSE_SEED_PUZZLES.map((p) => (
                    <option key={p.id} value={p.id}>{p.title}</option>
                  ))}
                </select>
              </label>
              <button
                type="button"
                onClick={loadSeed}
                className="rounded-lg bg-indigo-600 hover:bg-indigo-500 px-4 py-2 text-sm text-white"
              >
                Load seed
              </button>
            </>
          ) : (
            <>
              <label className="text-xs text-slate-400 space-y-1">
                Day
                <input
                  type="date"
                  value={dayKey}
                  onChange={(e) => setDayKey(e.target.value)}
                  className="block bg-[#060e1a] border border-[#1a2540] rounded-md px-3 py-2 text-sm text-slate-100"
                />
              </label>
              <button
                type="button"
                onClick={loadDay}
                className="rounded-lg bg-indigo-600 hover:bg-indigo-500 px-4 py-2 text-sm text-white"
              >
                Load day
              </button>
            </>
          )}
        </div>
      </div>
      <EnclosePanel key={puzzle.id} puzzle={puzzle} sandbox showDevBadge />
    </div>
  );
}
