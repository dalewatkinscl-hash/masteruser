import React, { useEffect, useMemo, useState } from 'react';
import { CARDS_BY_ID, getCardSynergyBonus } from '../lib/coachCapitalistCards';
import { GameUiBadge, GameUiButton } from './gameUi';

function formatCountdown(targetMs, nowMs = Date.now()) {
  if (!targetMs) return '0:00';
  const diff = Math.max(0, targetMs - nowMs);
  const h = Math.floor(diff / 3600000);
  const m = Math.floor((diff % 3600000) / 60000);
  const s = Math.floor((diff % 60000) / 1000);
  return `${h}h ${String(m).padStart(2, '0')}m ${String(s).padStart(2, '0')}s`;
}

export default function CoachCapitalistTrafficOfficePanel({
  trafficOffice = null,
  loading = false,
  busy = false,
  currentUid = '',
  cards = {},
  isAdmin = false,
  isSyndicateDirector = false,
  onAssignRoute,
  onPlaceBid,
  onClaimTenderReward,
  onForceResolveTender,
  onRefresh,
}) {
  const [bidAmount, setBidAmount] = useState('15');
  const [nowMs, setNowMs] = useState(Date.now());
  const [localError, setLocalError] = useState('');

  const clockOffsetMs = useMemo(() => {
    const srv = Number(trafficOffice?.serverNow);
    return Number.isFinite(srv) && srv > 0 ? srv - Date.now() : 0;
  }, [trafficOffice?.serverNow]);

  useEffect(() => {
    const id = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  const gt = trafficOffice?.goldenTender || null;
  const chips = trafficOffice?.chips || { balance: 100, earnedBonus: 0, spent: 0 };
  const myRouteId = trafficOffice?.myRouteId || null;
  const routes = Array.isArray(trafficOffice?.routes) ? trafficOffice.routes : [];
  const switchesRemaining = Number(trafficOffice?.switchesRemaining ?? 2);
  const maxSwitches = Number(trafficOffice?.maxDailySwitches ?? 2);
  const serverNow = nowMs + clockOffsetMs;

  useEffect(() => {
    if (gt?.myBid > 0) {
      setBidAmount(String(gt.myBid));
    }
  }, [gt?.myBid]);

  if (loading && !trafficOffice) {
    return (
      <div className="rounded-xl border border-slate-700 bg-slate-900/70 p-6 text-center text-sm text-slate-400">
        Loading Traffic Office dispatch board…
      </div>
    );
  }

  if (!trafficOffice) {
    return (
      <div className="rounded-xl border border-slate-700 bg-slate-900/70 p-6 text-center space-y-2">
        <p className="text-sm text-slate-300">Traffic Office unavailable right now.</p>
        {onRefresh ? (
          <GameUiButton size="sm" variant="neutral" onClick={onRefresh}>
            Retry
          </GameUiButton>
        ) : null}
      </div>
    );
  }

  const isWeekend = Boolean(trafficOffice.isWeekend);
  const tenderOpen = gt?.status === 'open' && !isWeekend && serverNow < (Number(gt?.closesAtMs) || 0);
  const isWinner = Boolean(currentUid && gt?.winner?.uid === currentUid);
  const isRunnerUp = Boolean(currentUid && !isWinner && gt?.runnerUp?.uid === currentUid);
  const canClaimPrize = gt?.status === 'awarded'
    && ((isWinner && !gt.winner?.claimed) || (isRunnerUp && !gt.runnerUp?.claimed));

  const submitBid = async (val) => {
    setLocalError('');
    const num = Math.floor(Number(val) || 0);
    if (num < 1) {
      setLocalError('Enter at least 1 Tender Chip.');
      return;
    }
    if (num > Number(chips.balance || 0)) {
      setLocalError(`You only have ${chips.balance} Tender Chips remaining this week.`);
      return;
    }
    try {
      await onPlaceBid?.(num);
    } catch (err) {
      setLocalError(err.message || 'Bid failed.');
    }
  };

  return (
    <div className="space-y-4">
      {/* Header Banner */}
      <div className="rounded-xl border-2 border-sky-400/35 bg-gradient-to-r from-sky-950/60 via-slate-900 to-amber-950/40 p-3.5 sm:p-4 flex flex-wrap items-center justify-between gap-3">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xl">🗺️</span>
            <h3 className="gui-font text-base sm:text-lg text-sky-200">
              The Traffic Office — Daily Dispatch &amp; Golden Tenders
            </h3>
            <GameUiBadge tone="blue">Season 5</GameUiBadge>
          </div>
          <p className="text-xs text-slate-300">
            Pick <strong>1 daily corridor</strong> for your fleet (quiet routes pay up to <strong>4.0×</strong> Shortage Surge!) and bid <strong>Tender Chips</strong> blindly before 13:00 London time.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="rounded-xl border border-amber-400/40 bg-slate-950/80 px-3 py-1.5 text-right">
            <p className="text-[10px] uppercase tracking-wider text-amber-300/80 font-bold">
              Weekly Tender Chips
            </p>
            <p className="gui-font text-base text-amber-300 tabular-nums">
              🪙 {chips.balance ?? 0}
              <span className="text-[10px] font-sans text-slate-400 font-normal ml-1.5">
                (100/wk · +15/Syndicate)
              </span>
            </p>
          </div>
          {onRefresh ? (
            <GameUiButton size="sm" variant="neutral" disabled={busy} onClick={onRefresh}>
              ↻ Refresh
            </GameUiButton>
          ) : null}
        </div>
      </div>

      {localError ? (
        <div className="rounded-lg border border-rose-400/50 bg-rose-500/15 px-3 py-2 text-xs text-rose-200">
          {localError}
        </div>
      ) : null}

      {/* Section 1: Daily Sealed-Bid Golden Tender */}
      {gt ? (
        <div className="rounded-xl border-2 border-amber-400/45 bg-gradient-to-br from-amber-950/40 via-slate-900/95 to-slate-950 p-4 space-y-3 shadow-lg">
          <div className="flex flex-wrap items-start justify-between gap-3 border-b border-amber-400/20 pb-3">
            <div className="min-w-0 flex-1 space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded bg-amber-400 px-2 py-0.5 text-[10px] font-black uppercase tracking-wider text-slate-950">
                  👑 Daily Golden Tender
                </span>
                <span className="text-[11px] font-semibold text-amber-200/80">
                  {gt.client}
                </span>
                {gt.status === 'open' ? (
                  <GameUiBadge tone="green">Bidding Open · {gt.bidderCount || 0} bids</GameUiBadge>
                ) : (
                  <GameUiBadge tone="gold">Awarded · {gt.bidderCount || 0} bids</GameUiBadge>
                )}
              </div>
              <h4 className="gui-font text-base sm:text-lg text-white">{gt.title}</h4>
              <p className="text-xs text-slate-300">{gt.desc}</p>
            </div>
            <div className="rounded-lg border border-amber-400/30 bg-slate-950/80 px-3 py-2 text-right shrink-0">
              <p className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold">
                {gt.status === 'open' ? 'Closes at 13:00 London' : 'Auction Closed'}
              </p>
              <p className="gui-font text-sm sm:text-base text-amber-300 font-mono tabular-nums">
                {gt.status === 'open'
                  ? formatCountdown(gt.closesAtMs, serverNow)
                  : 'Settled'}
              </p>
            </div>
          </div>

          {/* Prize Tiers */}
          <div className="grid sm:grid-cols-2 gap-2 text-xs">
            <div className="rounded-lg border border-amber-400/35 bg-amber-500/10 px-3 py-2">
              <p className="font-bold text-amber-300">🥇 1st Place (Highest Blind Bid)</p>
              <p className="text-slate-200 mt-0.5">
                <strong>24h 3.5× Speed</strong> + <strong>24h Breakdown Immunity</strong> + <strong>2 Booster Packs</strong>
              </p>
            </div>
            <div className="rounded-lg border border-slate-600 bg-slate-900/80 px-3 py-2">
              <p className="font-bold text-slate-200">🥈 2nd Place (Subcontractor Cut)</p>
              <p className="text-slate-300 mt-0.5">
                <strong>6h 2.0× Speed</strong> + <strong>1 Booster Pack</strong> (and keeps all Tender Chips!)
              </p>
            </div>
          </div>

          {gt.status === 'open' ? (
            <div className="rounded-xl border border-slate-700 bg-slate-950/70 p-3 space-y-2.5">
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                <p className="text-slate-300">
                  Only the <strong>winning bidder spends their chips</strong> — losing bidders get 100% of their chips refunded!
                </p>
                {gt.myBid > 0 ? (
                  <span className="rounded-md border border-emerald-400/40 bg-emerald-500/15 px-2 py-0.5 font-bold text-emerald-300 tabular-nums">
                    Your sealed bid: 🪙 {gt.myBid}
                  </span>
                ) : null}
              </div>

              {!isWeekend && tenderOpen ? (
                <div className="flex flex-wrap items-center gap-2">
                  <input
                    type="number"
                    min={1}
                    max={Math.max(1, Number(chips.balance) || 0)}
                    value={bidAmount}
                    onChange={(e) => setBidAmount(e.target.value)}
                    className="w-24 rounded-lg border border-amber-400/40 bg-slate-900 px-2.5 py-1.5 text-sm font-mono text-white focus:border-amber-300 focus:outline-none"
                  />
                  {[10, 25, 50].map((preset) => (
                    <GameUiButton
                      key={preset}
                      size="sm"
                      variant="neutral"
                      disabled={busy || (chips.balance || 0) < preset}
                      onClick={() => setBidAmount(String(preset))}
                    >
                      {preset}
                    </GameUiButton>
                  ))}
                  <GameUiButton
                    size="sm"
                    variant="neutral"
                    disabled={busy || (chips.balance || 0) <= 0}
                    onClick={() => setBidAmount(String(chips.balance || 0))}
                  >
                    All-In ({chips.balance || 0})
                  </GameUiButton>
                  <GameUiButton
                    size="sm"
                    variant="warning"
                    disabled={busy || (chips.balance || 0) <= 0}
                    onClick={() => submitBid(bidAmount)}
                  >
                    {busy ? 'Submitting…' : gt.myBid > 0 ? 'Update Sealed Bid' : 'Place Sealed Bid'}
                  </GameUiButton>
                </div>
              ) : (
                <p className="text-xs text-slate-400">
                  {isWeekend ? 'Golden Tenders pause over the weekend.' : 'Resolving bids…'}
                </p>
              )}

              {(isAdmin || isSyndicateDirector) && gt.status === 'open' ? (
                <div className="pt-1 border-t border-slate-800 flex justify-end">
                  <GameUiButton
                    size="sm"
                    variant="neutral"
                    disabled={busy}
                    onClick={() => onForceResolveTender?.()}
                  >
                    ⚡ Force Resolve Tender (Admin)
                  </GameUiButton>
                </div>
              ) : null}
            </div>
          ) : (
            <div className="rounded-xl border border-amber-400/40 bg-slate-950/80 p-3 space-y-2">
              {gt.winner ? (
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="space-y-0.5 text-xs">
                    <p className="gui-font text-sm text-amber-300">
                      👑 Operated by {gt.winner.fullName} (Winning Bid: 🪙 {gt.winner.bid})
                    </p>
                    {gt.runnerUp ? (
                      <p className="text-slate-300">
                        🥈 Subcontractor: <strong>{gt.runnerUp.fullName}</strong> (Bid: 🪙 {gt.runnerUp.bid})
                      </p>
                    ) : null}
                  </div>
                  {canClaimPrize ? (
                    <GameUiButton
                      size="sm"
                      variant="success"
                      disabled={busy}
                      onClick={() => onClaimTenderReward?.()}
                    >
                      {busy
                        ? 'Claiming…'
                        : isWinner
                          ? '🎁 Claim Winner Prize (+2 Packs & 3.5× Speed)'
                          : '🎁 Claim 2nd Place (+1 Pack & 2.0× Speed)'}
                    </GameUiButton>
                  ) : isWinner || isRunnerUp ? (
                    <GameUiBadge tone="green">Prize Claimed</GameUiBadge>
                  ) : null}
                </div>
              ) : (
                <p className="text-xs text-slate-400">
                  No sealed bids were placed before 13:00 London time today.
                </p>
              )}
            </div>
          )}
        </div>
      ) : null}

      {/* Section 2: Daily Dispatch Board */}
      <div className="space-y-2.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h4 className="gui-font text-sm sm:text-base text-white">
              🚌 Today’s 5 Charter Corridors
            </h4>
            <p className="text-[11px] text-slate-400">
              Fewer colleagues on a corridor = higher Shortage Surge! Matching Season 4/5 Trading Cards boost route output by +25% (+50% Shiny).
            </p>
          </div>
          <span className="rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-1 text-[11px] text-slate-300 tabular-nums">
            {myRouteId
              ? `Switches left today: ${switchesRemaining} / ${maxSwitches}`
              : 'First route pick today is free!'}
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {routes.map((route) => {
            const isMine = myRouteId === route.id;
            const synergyPct = Math.round(getCardSynergyBonus(cards, route.synergyCardId) * 100);
            const synergyCard = CARDS_BY_ID.get(route.synergyCardId);
            const effectiveMult = Number(route.multiplier || 1) * (1 + synergyPct / 100);

            const demandClass = route.demandStatus === 'surge'
              ? 'border-emerald-400/50 bg-emerald-500/15 text-emerald-200'
              : route.demandStatus === 'healthy'
                ? 'border-sky-400/45 bg-sky-500/15 text-sky-200'
                : 'border-amber-400/45 bg-amber-500/15 text-amber-200';

            const effectDesc = route.effectType === 'angel_mult'
              ? `Backer Strength ×${(1 + (effectiveMult - 1) * 0.25).toFixed(2)}`
              : `${route.effectTargetLabel} ×${effectiveMult.toFixed(1)}`;

            return (
              <div
                key={route.id}
                className={`rounded-xl border-2 p-3.5 flex flex-col justify-between gap-3 transition ${
                  isMine
                    ? 'border-sky-400 bg-sky-950/35 shadow-lg shadow-sky-500/10'
                    : 'border-slate-700 bg-slate-900/75'
                }`}
              >
                <div className="space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="gui-font text-sm sm:text-base text-white flex items-center gap-1.5">
                        <span>{route.icon}</span>
                        <span className="truncate">{route.title}</span>
                      </p>
                      <p className="text-[11px] text-slate-400 truncate">{route.corridor}</p>
                    </div>
                    <span className={`shrink-0 rounded-lg border px-2 py-0.5 text-[11px] font-bold tabular-nums ${demandClass}`}>
                      {Number(route.multiplier || 1).toFixed(1)}×
                    </span>
                  </div>

                  <p className="text-xs text-slate-300 leading-snug">{route.desc}</p>

                  <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
                    <span className={`rounded border px-2 py-0.5 font-semibold ${demandClass}`}>
                      {route.demandLabel}
                    </span>
                    <span className="rounded border border-violet-400/35 bg-violet-500/15 px-2 py-0.5 font-semibold text-violet-200">
                      {effectDesc}
                    </span>
                  </div>

                  {synergyCard ? (
                    <div className={`rounded-lg border px-2.5 py-1.5 text-[11px] flex items-center justify-between gap-2 ${
                      synergyPct > 0
                        ? 'border-amber-400/40 bg-amber-500/10 text-amber-200'
                        : 'border-slate-800 bg-slate-950/50 text-slate-400'
                    }`}>
                      <span>
                        🃏 Synergy: <strong>{synergyCard.name}</strong>
                      </span>
                      <span className="font-bold">
                        {synergyPct > 0 ? `+${synergyPct}% Active!` : 'Not owned (+25%/+50%)'}
                      </span>
                    </div>
                  ) : null}

                  <div className="pt-1">
                    <p className="text-[10px] uppercase tracking-wider text-slate-400 mb-1">
                      Operators on corridor ({route.operatorCount || 0})
                    </p>
                    {route.operators?.length > 0 ? (
                      <div className="flex flex-wrap gap-1">
                        {route.operators.map((op) => (
                          <span
                            key={op.uid}
                            className={`rounded-full px-2 py-0.5 text-[10px] font-medium border ${
                              op.uid === currentUid
                                ? 'border-sky-400/60 bg-sky-500/25 text-sky-100'
                                : 'border-slate-700 bg-slate-950/70 text-slate-300'
                            }`}
                          >
                            {op.fullName}
                            {op.uid === currentUid ? ' (you)' : ''}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <p className="text-[11px] text-emerald-300/90 italic">
                        Wide open — claim 4.0× Shortage Surge!
                      </p>
                    )}
                  </div>
                </div>

                <div className="pt-1 border-t border-slate-800 flex items-center justify-between gap-2">
                  {isMine ? (
                    <span className="text-xs font-bold text-sky-300">
                      ✓ Your Fleet Is Dispatched Here
                    </span>
                  ) : (
                    <span className="text-[11px] text-slate-400">
                      {myRouteId
                        ? switchesRemaining > 0
                          ? `Uses 1 switch (${switchesRemaining} left)`
                          : 'No switches remaining today'
                        : 'Free assignment'}
                    </span>
                  )}
                  <GameUiButton
                    size="sm"
                    variant={isMine ? 'primary' : 'success'}
                    disabled={busy || isWeekend || isMine || (Boolean(myRouteId) && switchesRemaining <= 0)}
                    onClick={() => onAssignRoute?.(route.id)}
                  >
                    {isMine ? 'Active Route' : 'Assign Fleet'}
                  </GameUiButton>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
