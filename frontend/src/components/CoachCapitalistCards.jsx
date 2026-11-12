import React, { useState, useEffect } from 'react';
import {
  FLEET_CARDS_CATALOGUE,
  CARDS_BY_ID,
  drawBoosterPack,
  computeCardBonuses,
} from '../lib/coachCapitalistCards';
import { playCoachCapSfx } from '../lib/coachCapitalist';

/**
 * Single Trading Card component with 3D feel and holographic shiny foil effects.
 */
export function TradingCard({
  card,
  isShiny = false,
  copies = 1,
  shinyCopies = 0,
  isSilhouette = false,
  isFlipped = true,
  onClick = null,
  size = 'md', // 'sm' | 'md' | 'lg'
}) {
  const c = card || FLEET_CARDS_CATALOGUE[0];
  const effectValue = isShiny ? c.shinyValue : c.standardValue;
  const isPercent = c.type !== 'angel_bonus';
  const effectDisplay = isPercent ? `+${effectValue}%` : `+${(effectValue * 100).toFixed(1)}%`;

  let effectDescription = '';
  switch (c.type) {
    case 'all_profit':
      effectDescription = `${effectDisplay} All Fleet Profits`;
      break;
    case 'all_speed':
      effectDescription = `${effectDisplay} All Fleet Speed`;
      break;
    case 'away_rate':
      effectDescription = `${effectDisplay} Offline Away Earnings`;
      break;
    case 'angel_bonus':
      effectDescription = `${effectDisplay} Backer Efficacy`;
      break;
    case 'biz_profit':
      effectDescription = `${effectDisplay} ${c.name} Profit`;
      break;
    case 'biz_speed':
      effectDescription = `${effectDisplay} ${c.name} Speed`;
      break;
    default:
      effectDescription = `${effectDisplay} Boost`;
  }

  const categoryIcons = {
    fleet: '🚌',
    crew: '👔',
    relic: '⭐',
  };

  const rarityBorders = {
    common: 'border-slate-500/50 from-slate-800 to-slate-950',
    rare: 'border-sky-500/60 from-sky-950/80 to-slate-950',
    epic: 'border-purple-500/70 from-purple-950/80 to-slate-950',
    legendary: 'border-amber-400 from-amber-950/80 to-slate-950',
  };

  const sizeClasses = {
    sm: 'w-36 h-52 text-[10px]',
    md: 'w-48 h-68 text-xs',
    lg: 'w-60 h-84 text-sm',
  };

  if (isSilhouette) {
    return (
      <div className={`relative rounded-xl border border-slate-700/60 bg-slate-900/60 p-3 flex flex-col items-center justify-between text-center select-none opacity-40 shadow ${sizeClasses[size] || sizeClasses.md}`}>
        <div className="w-full flex justify-between items-center text-[10px] text-slate-500 font-mono">
          <span>#{String(c.number).padStart(2, '0')}</span>
          <span>{categoryIcons[c.category]} ???</span>
        </div>
        <div className="my-auto flex flex-col items-center">
          <div className="w-14 h-14 rounded-full border border-dashed border-slate-600 flex items-center justify-center text-xl text-slate-600">
            🔒
          </div>
          <p className="mt-2 text-xs font-semibold text-slate-400">Undiscovered</p>
        </div>
        <p className="text-[9px] text-slate-500 italic">Find in Booster Packs</p>
      </div>
    );
  }

  return (
    <div
      onClick={onClick}
      className={`relative rounded-xl select-none transition-transform duration-300 flex flex-col justify-between overflow-hidden shadow-xl ${
        isShiny
          ? 'border-2 border-amber-300 ring-2 ring-amber-400/40 shadow-amber-500/20'
          : `border ${rarityBorders[c.rarity] || rarityBorders.common}`
      } bg-gradient-to-b ${rarityBorders[c.rarity] || rarityBorders.common} p-2.5 ${sizeClasses[size] || sizeClasses.md} ${
        onClick ? 'cursor-pointer hover:scale-105 active:scale-95' : ''
      }`}
    >
      {/* Holographic foil sheen overlay for Shiny cards */}
      {isShiny && (
        <div
          className="absolute inset-0 pointer-events-none opacity-50 z-20"
          style={{
            background:
              'linear-gradient(135deg, rgba(255,0,128,0.25) 0%, rgba(0,255,255,0.25) 35%, rgba(255,255,0,0.3) 70%, rgba(147,51,234,0.25) 100%)',
            backgroundSize: '200% 200%',
            animation: 'holoSheen 4s ease infinite',
          }}
        />
      )}

      {/* Top Header */}
      <div className="flex justify-between items-center z-10">
        <span className="font-mono text-[9px] text-slate-400 font-bold">
          #{String(c.number).padStart(2, '0')}
        </span>
        <span className="text-[10px] uppercase font-black px-1.5 py-0.5 rounded tracking-wider bg-slate-900/80 border border-white/10 text-slate-300">
          {categoryIcons[c.category]} {c.category}
        </span>
      </div>

      {/* Shiny Banner */}
      {isShiny && (
        <div className="z-10 my-0.5 text-center">
          <span className="inline-block px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider bg-gradient-to-r from-amber-400 via-pink-400 to-cyan-400 text-slate-950 shadow-md">
            ✨ ULTRA SHINY ✨
          </span>
        </div>
      )}

      {/* Center Artwork Frame */}
      <div className="relative my-1.5 w-full h-24 rounded-lg bg-slate-950/80 border border-white/10 flex flex-col items-center justify-center p-2 text-center overflow-hidden z-10">
        <div
          className="absolute inset-0 opacity-20"
          style={{
            background: `radial-gradient(circle at center, ${c.color || '#38bdf8'} 0%, transparent 70%)`,
          }}
        />
        <div className="text-3xl mb-1 filter drop-shadow">
          {c.category === 'fleet' ? '🚌' : c.category === 'crew' ? '👔' : '🏆'}
        </div>
        <p className="font-bold text-xs text-white leading-tight truncate max-w-full">
          {c.name}
        </p>
        <span className="text-[9px] text-slate-400 font-medium truncate">
          {c.badge}
        </span>
      </div>

      {/* Perk / Stats Box */}
      <div
        className={`rounded-lg p-1.5 text-center z-10 ${
          isShiny
            ? 'bg-amber-400/20 border border-amber-300/40 text-amber-200'
            : 'bg-slate-900/80 border border-white/10 text-emerald-300'
        }`}
      >
        <p className="font-black text-xs tracking-tight flex items-center justify-center gap-1">
          {isShiny ? '⭐' : '⚡'} {effectDescription}
        </p>
      </div>

      {/* Quote / Lore */}
      <p className="text-[9px] text-slate-400 italic text-center line-clamp-2 my-1 z-10">
        "{c.quote}"
      </p>

      {/* Footer / Copies count */}
      <div className="flex justify-between items-center pt-1 border-t border-white/10 text-[9px] text-slate-400 z-10">
        <span className="uppercase tracking-wider font-semibold text-[8px] text-slate-500">
          SEASON 4 FLEET
        </span>
        {copies > 1 && (
          <span className="font-black text-amber-300 bg-amber-950/80 px-1.5 py-0.2 rounded border border-amber-500/40">
            ×{copies} {shinyCopies > 0 && `(✨${shinyCopies})`}
          </span>
        )}
      </div>
    </div>
  );
}

/**
 * Foil Booster Wrapper & Unboxing Modal with tactile tear & 3D card flips.
 */
export function BoosterPackOpeningModal({
  open,
  onClose,
  unopenedCount = 0,
  onPackOpened = null,
}) {
  const [phase, setPhase] = useState('pack'); // 'pack' | 'cards' | 'summary'
  const [isRipping, setIsRipping] = useState(false);
  const [drawnCards, setDrawnCards] = useState([]);
  const [revealedIndices, setRevealedIndices] = useState(new Set());
  const [hasShiny, setHasShiny] = useState(false);

  useEffect(() => {
    if (open) {
      setPhase('pack');
      setIsRipping(false);
      setDrawnCards([]);
      setRevealedIndices(new Set());
      setHasShiny(false);
    }
  }, [open]);

  if (!open) return null;

  const handleRipPack = () => {
    if (isRipping) return;
    setIsRipping(true);
    playCoachCapSfx('pack_rip');

    const cards = drawBoosterPack();
    const shinyPresent = cards.some((c) => c.isShiny);

    setTimeout(() => {
      setDrawnCards(cards);
      setHasShiny(shinyPresent);
      setPhase('cards');
      setIsRipping(false);

      if (onPackOpened) {
        onPackOpened(cards);
      }
    }, 700);
  };

  const handleRevealCard = (idx) => {
    if (revealedIndices.has(idx)) return;
    const next = new Set(revealedIndices);
    next.add(idx);
    setRevealedIndices(next);

    const card = drawnCards[idx];
    if (card?.isShiny) {
      playCoachCapSfx('shiny_fanfare');
    } else {
      playCoachCapSfx('card_flip');
    }

    if (next.size === 3) {
      setTimeout(() => setPhase('summary'), 1200);
    }
  };

  const handleRevealAll = () => {
    const next = new Set([0, 1, 2]);
    setRevealedIndices(next);
    if (hasShiny) {
      playCoachCapSfx('shiny_fanfare');
    } else {
      playCoachCapSfx('card_flip');
    }
    setTimeout(() => setPhase('summary'), 1000);
  };

  const handleOpenAnother = () => {
    setPhase('pack');
    setDrawnCards([]);
    setRevealedIndices(new Set());
    setHasShiny(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-md animate-fade-in">
      <div className="relative w-full max-w-xl rounded-2xl border-2 border-amber-400/40 bg-gradient-to-b from-slate-900 via-slate-950 to-slate-900 p-6 shadow-2xl text-slate-100 flex flex-col items-center">
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-slate-400 hover:text-white text-lg font-bold w-8 h-8 rounded-full bg-slate-800/60 hover:bg-slate-700 flex items-center justify-center transition"
        >
          ×
        </button>

        {/* Title */}
        <div className="text-center mb-4">
          <p className="gui-font text-xl text-amber-300 flex items-center justify-center gap-2">
            <span>📦</span> Season 4 Trading Card Booster
          </p>
          <p className="text-xs text-slate-400">
            {unopenedCount > 1
              ? `${unopenedCount} Booster Packs in your depot storage`
              : 'Whole Fleet Milestone Reward!'}
          </p>
        </div>

        {/* PHASE 1: Sealed Foil Booster Pack */}
        {phase === 'pack' && (
          <div className="flex flex-col items-center my-4 animate-scale-up">
            <div
              onClick={handleRipPack}
              className={`relative w-56 h-80 rounded-2xl cursor-pointer shadow-2xl transition-all duration-300 select-none overflow-hidden flex flex-col justify-between p-4 border-2 border-amber-400/80 ${
                isRipping
                  ? 'scale-105 rotate-2 filter brightness-125 opacity-80'
                  : 'hover:scale-105 hover:shadow-amber-500/30'
              }`}
              style={{
                background:
                  'linear-gradient(135deg, #1e3a8a 0%, #1e1b4b 50%, #b45309 100%)',
              }}
            >
              {/* Foil Shimmer */}
              <div
                className="absolute inset-0 pointer-events-none opacity-40"
                style={{
                  background:
                    'linear-gradient(105deg, transparent 40%, rgba(255,255,255,0.6) 50%, transparent 60%)',
                  backgroundSize: '200% 200%',
                  animation: 'packShimmer 3s infinite',
                }}
              />

              {/* Pack Header */}
              <div className="flex justify-between items-center text-[10px] text-amber-300 font-bold uppercase tracking-widest z-10">
                <span>COUNTRY LION</span>
                <span>SERIES 1</span>
              </div>

              {/* Central Seal */}
              <div className="my-auto text-center z-10">
                <div className="w-20 h-20 mx-auto rounded-full bg-amber-400/20 border-2 border-amber-300 flex items-center justify-center text-4xl shadow-inner">
                  🦁
                </div>
                <p className="gui-font text-lg font-black text-amber-200 mt-2 tracking-wide uppercase">
                  FLEET CARDS
                </p>
                <p className="text-[10px] text-amber-100 font-semibold tracking-wider">
                  SEASON 4 OFFICIAL EDITION
                </p>
              </div>

              {/* Pack Footer */}
              <div className="text-center border-t border-amber-400/30 pt-2 z-10 space-y-1">
                <span className="inline-block bg-amber-400 text-slate-950 font-black px-2 py-0.5 rounded text-[10px] uppercase">
                  3 TRADING CARDS
                </span>
                <p className="text-[9px] text-amber-200/80 font-medium">
                  ✨ 2% Chance of Holographic Shiny Card!
                </p>
              </div>
            </div>

            <button
              onClick={handleRipPack}
              disabled={isRipping}
              className="mt-6 px-6 py-2.5 rounded-xl font-black text-sm uppercase tracking-wider bg-gradient-to-r from-amber-400 to-amber-500 hover:from-amber-300 hover:to-amber-400 text-slate-950 shadow-lg shadow-amber-500/25 active:scale-95 transition"
            >
              {isRipping ? '⚡ Tearing Foil Open...' : '✂️ Tear Open Pack!'}
            </button>
          </div>
        )}

        {/* PHASE 2 & 3: Mystery Cards Revealed / Flips */}
        {(phase === 'cards' || phase === 'summary') && (
          <div className="flex flex-col items-center w-full my-2">
            {hasShiny && (
              <div className="mb-3 px-3 py-1 rounded-full bg-gradient-to-r from-pink-500 via-amber-400 to-cyan-400 text-slate-950 font-black text-xs uppercase tracking-wider animate-bounce shadow-lg">
                ✨ WOW! YOU PULLED A SHINY HOLOGRAPHIC CARD! ✨
              </div>
            )}

            <p className="text-xs text-slate-300 mb-4">
              {revealedIndices.size < 3
                ? 'Tap each card to reveal its fleet perk!'
                : 'All cards revealed and added to your collection!'}
            </p>

            {/* 3-Card Display */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 justify-items-center w-full">
              {drawnCards.map((item, idx) => {
                const isFlipped = revealedIndices.has(idx);
                return (
                  <div key={item.id + idx} className="flex flex-col items-center">
                    {isFlipped ? (
                      <div className="animate-scale-up">
                        <TradingCard
                          card={item.card}
                          isShiny={item.isShiny}
                          size="sm"
                        />
                      </div>
                    ) : (
                      /* Face Down Card Back */
                      <div
                        onClick={() => handleRevealCard(idx)}
                        className="w-36 h-52 rounded-xl cursor-pointer hover:scale-105 active:scale-95 transition-all duration-300 border-2 border-amber-400/60 shadow-xl flex flex-col justify-between items-center p-3 text-center select-none"
                        style={{
                          background:
                            'radial-gradient(circle at center, #1e3a8a 0%, #0f172a 100%)',
                        }}
                      >
                        <div className="text-[9px] text-amber-300 font-bold uppercase tracking-wider">
                          COACH CAPITALIST
                        </div>
                        <div className="w-12 h-12 rounded-full border-2 border-amber-400/60 flex items-center justify-center text-2xl bg-amber-400/10">
                          🦁
                        </div>
                        <div className="text-[10px] text-amber-200 font-bold animate-pulse">
                          TAP TO REVEAL
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Actions */}
            <div className="mt-6 flex flex-wrap gap-3 justify-center">
              {revealedIndices.size < 3 ? (
                <button
                  onClick={handleRevealAll}
                  className="px-4 py-2 rounded-xl text-xs font-bold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-600 transition"
                >
                  Reveal All Cards
                </button>
              ) : (
                <>
                  {unopenedCount > 1 ? (
                    <button
                      onClick={handleOpenAnother}
                      className="px-5 py-2.5 rounded-xl font-bold text-xs uppercase tracking-wider bg-gradient-to-r from-amber-400 to-amber-500 hover:from-amber-300 text-slate-950 shadow-lg active:scale-95 transition"
                    >
                      Open Next Pack ({unopenedCount - 1} left)
                    </button>
                  ) : null}
                  <button
                    onClick={onClose}
                    className="px-5 py-2.5 rounded-xl font-bold text-xs bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-600 transition"
                  >
                    Done · View Collection
                  </button>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Full Card Binder & Collection Tab UI
 */
export function CardBinderView({
  cards = {},
  unopenedPacks = 0,
  onOpenPackClick = null,
}) {
  const [filter, setFilter] = useState('all'); // 'all' | 'fleet' | 'crew' | 'relic' | 'shinies'
  const bonuses = computeCardBonuses(cards);

  const totalPossible = FLEET_CARDS_CATALOGUE.length;
  const progressPct = Math.round((bonuses.uniqueCardsCount / totalPossible) * 100);

  const filteredCards = FLEET_CARDS_CATALOGUE.filter((c) => {
    if (filter === 'shinies') {
      return (cards[c.id]?.shinyCount || 0) > 0;
    }
    if (filter === 'all') return true;
    return c.category === filter;
  });

  return (
    <div className="space-y-4">
      {/* Top Banner & Summary */}
      <div className="rounded-2xl border border-amber-400/30 bg-gradient-to-r from-amber-500/10 via-slate-900 to-slate-900 p-4">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-2xl">🃏</span>
              <h2 className="gui-font text-lg text-amber-300">Fleet Trading Cards</h2>
              <span className="text-[10px] uppercase font-bold px-2 py-0.5 rounded bg-amber-400 text-slate-950">
                Season 4
              </span>
            </div>
            <p className="text-xs text-slate-300 mt-1">
              Earn a 3-card booster pack every time your entire fleet hits a global milestone. Cards grant permanent passive multipliers!
            </p>
          </div>

          {/* Unopened Packs Button */}
          {unopenedPacks > 0 ? (
            <button
              onClick={onOpenPackClick}
              className="px-5 py-2.5 rounded-xl font-black text-xs uppercase tracking-wider bg-gradient-to-r from-amber-400 via-amber-300 to-amber-500 text-slate-950 shadow-lg shadow-amber-500/20 hover:scale-105 active:scale-95 transition flex items-center gap-2 animate-pulse"
            >
              <span>📦</span>
              <span>Open Booster Pack ({unopenedPacks})</span>
            </button>
          ) : (
            <div className="text-right text-[11px] text-slate-400 bg-slate-950/60 border border-slate-800 rounded-xl px-3 py-2">
              <p className="font-semibold text-slate-300">No packs waiting</p>
              <p className="text-[10px]">Get all 10 vehicles to the next milestone to earn one!</p>
            </div>
          )}
        </div>

        {/* Collection Progress & Stats Bar */}
        <div className="mt-4 pt-4 border-t border-slate-800 grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="bg-slate-950/60 rounded-xl p-2.5 border border-slate-800 text-center">
            <p className="text-[10px] text-slate-400 uppercase font-semibold">Cards Discovered</p>
            <p className="gui-font text-base text-amber-300 font-bold">
              {bonuses.uniqueCardsCount} / {totalPossible} ({progressPct}%)
            </p>
          </div>
          <div className="bg-slate-950/60 rounded-xl p-2.5 border border-slate-800 text-center">
            <p className="text-[10px] text-slate-400 uppercase font-semibold">Total Cards Owned</p>
            <p className="gui-font text-base text-slate-200 font-bold">
              {bonuses.totalCardsCount} copies
            </p>
          </div>
          <div className="bg-slate-950/60 rounded-xl p-2.5 border border-slate-800 text-center">
            <p className="text-[10px] text-slate-400 uppercase font-semibold">✨ Shinies Pulled</p>
            <p className="gui-font text-base text-pink-300 font-bold">
              {bonuses.totalShiniesCount}
            </p>
          </div>
          <div className="bg-slate-950/60 rounded-xl p-2.5 border border-slate-800 text-center">
            <p className="text-[10px] text-slate-400 uppercase font-semibold">Total Profit Boost</p>
            <p className="gui-font text-base text-emerald-400 font-bold">
              +{bonuses.allProfitPct}%
            </p>
          </div>
        </div>

        {/* Active Multiplier Badges */}
        {(bonuses.allProfitPct > 0 || bonuses.allSpeedPct > 0 || bonuses.awayRatePct > 0 || bonuses.angelBonusExtra > 0) && (
          <div className="mt-3 flex flex-wrap gap-2 text-xs">
            {bonuses.allProfitPct > 0 && (
              <span className="px-2.5 py-1 rounded-lg bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 font-bold">
                💰 +{bonuses.allProfitPct}% All Profits
              </span>
            )}
            {bonuses.allSpeedPct > 0 && (
              <span className="px-2.5 py-1 rounded-lg bg-sky-500/15 border border-sky-500/30 text-sky-300 font-bold">
                ⚡ +{bonuses.allSpeedPct}% All Fleet Speed
              </span>
            )}
            {bonuses.awayRatePct > 0 && (
              <span className="px-2.5 py-1 rounded-lg bg-purple-500/15 border border-purple-500/30 text-purple-300 font-bold">
                🌙 +{bonuses.awayRatePct}% Away Earnings
              </span>
            )}
            {bonuses.angelBonusExtra > 0 && (
              <span className="px-2.5 py-1 rounded-lg bg-amber-500/15 border border-amber-500/30 text-amber-300 font-bold">
                👼 +{(bonuses.angelBonusExtra * 100).toFixed(1)}% Backer Bonus
              </span>
            )}
          </div>
        )}
      </div>

      {/* Filter Tabs */}
      <div className="flex flex-wrap gap-2 text-xs">
        {[
          { id: 'all', label: 'All Cards (20)' },
          { id: 'fleet', label: '🚌 Fleet (8)' },
          { id: 'crew', label: '👔 Crew & Staff (6)' },
          { id: 'relic', label: '⭐ Relics & Artifacts (6)' },
          { id: 'shinies', label: `✨ Shinies (${bonuses.totalShiniesCount})` },
        ].map((t) => (
          <button
            key={t.id}
            onClick={() => setFilter(t.id)}
            className={`px-3 py-1.5 rounded-xl font-bold transition ${
              filter === t.id
                ? 'bg-amber-400 text-slate-950 shadow'
                : 'bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-700'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Cards Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3 justify-items-center">
        {filteredCards.map((c) => {
          const entry = cards[c.id];
          const owned = Boolean(entry && entry.count > 0);
          const shinyCount = entry?.shinyCount || 0;

          if (!owned) {
            return (
              <TradingCard
                key={c.id}
                card={c}
                isSilhouette={true}
                size="sm"
              />
            );
          }

          return (
            <TradingCard
              key={c.id}
              card={c}
              copies={entry.count}
              shinyCopies={shinyCount}
              isShiny={shinyCount > 0}
              size="sm"
            />
          );
        })}
      </div>
    </div>
  );
}
