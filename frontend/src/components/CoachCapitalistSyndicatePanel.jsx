import React, { useState, useEffect } from 'react';
import { formatMoney, getSyndicateMultiplier } from '../lib/coachCapitalist';
import { GameUiButton, GameUiBadge } from './gameUi';

function formatCountdown(targetMs) {
  if (!targetMs) return 'Soon';
  const diff = Math.max(0, targetMs - Date.now());
  const hours = Math.floor(diff / (1000 * 60 * 60));
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
  const seconds = Math.floor((diff % (1000 * 60)) / 1000);
  if (hours > 24) {
    const days = Math.floor(hours / 24);
    const remHours = hours % 24;
    return `${days}d ${remHours}h ${minutes}m`;
  }
  return `${hours}h ${minutes}m ${seconds}s`;
}

function formatDropTime(targetMs) {
  if (!targetMs) return 'Soon';
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/London',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(targetMs));
}

export default function CoachCapitalistSyndicatePanel({
  contract,
  accountCash = 0,
  gameState = null,
  currentUid = '',
  onContribute,
  busy = false,
  syndicatesCompleted = 0,
  isAdmin = false,
  isSyndicateDirector = false,
  onAdvanceContract,
}) {
  const [pledgePercent, setPledgePercent] = useState(10); // 5%, 10%, 25%, 50%, Max
  const [vehicleDonationQty, setVehicleDonationQty] = useState(1);
  const [error, setError] = useState('');
  const [countdown, setCountdown] = useState('');

  // Live countdown ticker for weekend stand-down, upcoming tender, or tender expiration
  useEffect(() => {
    const tick = () => {
      if (contract?.status === 'weekend_standdown' && contract.opensAt) {
        setCountdown(formatCountdown(contract.opensAt));
      } else if (contract?.status === 'upcoming' && contract.opensAt) {
        setCountdown(formatCountdown(contract.opensAt));
      } else if (contract?.expiresAt) {
        setCountdown(formatCountdown(contract.expiresAt));
      } else {
        setCountdown('');
      }
    };
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [contract]);

  if (!contract) return null;

  const isWeekend = contract.status === 'weekend_standdown';
  const isUpcoming = contract.status === 'upcoming' || (contract.opensAt && Date.now() < contract.opensAt);

  // Eligibility check: is the current user excluded (e.g. they already took part in today's earlier syndicate)?
  const isExcluded = Boolean(
    currentUid && Array.isArray(contract.excludedUids) && contract.excludedUids.includes(currentUid),
  );

  // Target and Progress calculation
  const targetCash = Number(contract.targetCash ?? contract.targetAmount) || 1;
  const currentCash = Number(contract.currentCash ?? contract.currentAmount) || 0;
  const cashPct = Math.min(100, (currentCash / targetCash) * 100);
  const remainingCash = Math.max(0, targetCash - currentCash);
  const cashDone = currentCash >= targetCash;

  const reqVehicle = contract.requiredVehicle || null;
  const targetVehicles = Number(reqVehicle?.targetCount) || 0;
  const currentVehicles = Number(reqVehicle?.currentCount) || 0;
  const vehiclePct = targetVehicles > 0 ? Math.min(100, (currentVehicles / targetVehicles) * 100) : 100;
  const remainingVehicles = Math.max(0, targetVehicles - currentVehicles);
  const vehicleDone = targetVehicles <= 0 || currentVehicles >= targetVehicles;

  const isCompleted = contract.status === 'completed' || (cashDone && vehicleDone);

  // Fair play cap per operator (if configured, e.g. 0.60 = max 60%)
  const maxShare = Number(contract.maxContributionShare) || 0;
  const maxCashPerPlayer = maxShare > 0 ? Math.ceil(targetCash * maxShare) : targetCash;
  const maxVehiclesPerPlayer = maxShare > 0 && targetVehicles > 0 ? Math.ceil(targetVehicles * maxShare) : targetVehicles;

  // My current contributions
  const myContrib = (currentUid && contract.contributors?.[currentUid]) ? contract.contributors[currentUid] : null;
  const myContributedCash = Number(myContrib?.amount) || 0;
  const myContributedVehicles = Number(myContrib?.vehiclesDonated) || 0;

  // Player owned vehicle count in their fleet yard
  const reqDepotId = reqVehicle?.depotId || 'local';
  const reqBizIdx = Number(reqVehicle?.businessIndex) || 0;
  const playerOwnedVehicles = Array.isArray(gameState?.depots?.[reqDepotId]?.owned)
    ? (Number(gameState.depots[reqDepotId].owned[reqBizIdx]) || 0)
    : 0;

  const contributorsList = Object.entries(contract.contributors || {}).map(([uid, c]) => ({
    uid,
    fullName: c.fullName || 'Operator',
    amount: Number(c.amount) || 0,
    vehiclesDonated: Number(c.vehiclesDonated) || 0,
    contributedAt: c.contributedAt || null,
  })).sort((a, b) => b.amount - a.amount || b.vehiclesDonated - a.vehiclesDonated);

  const calculateCashPledge = (pctVal) => {
    let base = accountCash;
    if (pctVal !== 100) {
      base = Math.floor(accountCash * (pctVal / 100));
    }
    if (maxShare > 0) {
      const remainingQuota = Math.max(0, maxCashPerPlayer - myContributedCash);
      base = Math.min(base, remainingQuota);
    }
    if (remainingCash > 0) {
      base = Math.min(base, remainingCash);
    }
    return Math.max(0, base);
  };

  const minContribution = Number(contract.minContribution ?? 1) || 1;

  const handleCashPledge = (amount) => {
    setError('');
    if (isUpcoming) {
      setError(`This tender has not opened yet. It drops at ${formatDropTime(contract.opensAt)} London time!`);
      return;
    }
    if (isExcluded) {
      setError("You've already participated in today's earlier syndicate! This tender is reserved for operators who haven't taken part today.");
      return;
    }
    const num = Number(amount);
    if (!Number.isFinite(num) || num <= 0) {
      setError('Please select or enter an amount to contribute.');
      return;
    }
    if (num > accountCash) {
      setError('Insufficient funds in your account wallet.');
      return;
    }
    if (maxShare > 0 && (myContributedCash + num) > maxCashPerPlayer) {
      const allowed = Math.max(0, maxCashPerPlayer - myContributedCash);
      setError(`Fair play quota: You can pledge up to ${formatMoney(allowed)} more on this tender (${Math.round(maxShare * 100)}% max).`);
      return;
    }
    if (num < minContribution) {
      setError(`Minimum contribution for this tender is ${formatMoney(minContribution)}.`);
      return;
    }
    if (onContribute) {
      onContribute({ amount: num, contributionType: 'cash' });
    }
  };

  const handleVehicleDonation = (qty) => {
    setError('');
    if (isUpcoming) {
      setError(`This tender has not opened yet. It drops at ${formatDropTime(contract.opensAt)} London time!`);
      return;
    }
    if (isExcluded) {
      setError("You've already participated in today's earlier syndicate! This tender is reserved for operators who haven't taken part today.");
      return;
    }
    const count = Math.max(0, Math.floor(Number(qty) || 0));
    if (count <= 0) {
      setError('Please select at least 1 vehicle to donate.');
      return;
    }
    if (count > playerOwnedVehicles) {
      setError(`You only have ${playerOwnedVehicles} ${reqVehicle?.vehicleName || 'vehicles'} in your depot yard.`);
      return;
    }
    if (maxShare > 0 && (myContributedVehicles + count) > maxVehiclesPerPlayer) {
      const allowed = Math.max(0, maxVehiclesPerPlayer - myContributedVehicles);
      setError(`Fair play quota: You can donate up to ${allowed} more vehicles on this tender (${Math.round(maxShare * 100)}% max).`);
      return;
    }
    if (count > remainingVehicles) {
      setError(`Only ${remainingVehicles} more vehicles are needed to satisfy this tender.`);
      return;
    }
    if (onContribute) {
      onContribute({ vehicleCount: count, contributionType: 'vehicle' });
    }
  };

  const myMult = getSyndicateMultiplier(syndicatesCompleted);
  const nextMult = getSyndicateMultiplier(syndicatesCompleted + 1);

  // Return Mult for display
  const cashReturnMult = Number(contract.sponsorReward?.details?.cashReturnMult) || 10;

  // Weekend Stand-down view
  if (isWeekend) {
    return (
      <div className="rounded-xl border-2 border-indigo-500/40 bg-gradient-to-br from-indigo-950/40 via-slate-900/90 to-slate-900 p-5 space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-indigo-500/25 pb-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="rounded bg-indigo-500 px-2.5 py-0.5 text-[10px] font-black uppercase tracking-wider text-slate-950">
                🏁 Weekend Operations Stand-Down
              </span>
              <GameUiBadge tone="cyan">Monday–Friday Schedule</GameUiBadge>
            </div>
            <h3 className="gui-font text-lg sm:text-xl text-white font-bold mt-2 flex items-center gap-2">
              <span>{contract.title || 'Weekend Fleet Operations Stand-Down'}</span>
            </h3>
            <p className="text-xs text-slate-300 mt-1 leading-relaxed">
              {contract.desc || 'Corporate Syndicate tenders operate Monday to Friday. Fleets stand down for weekend maintenance and driver rest.'}
            </p>
          </div>
          <div className="text-right shrink-0 bg-slate-950/80 rounded-lg p-3 border border-indigo-500/30">
            <p className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold">Tenders Resume In</p>
            <p className="gui-font text-base sm:text-lg text-amber-300 font-mono font-bold mt-0.5">
              {countdown || 'Monday 05:00 UTC'}
            </p>
          </div>
        </div>

        {/* Permanent Multiplier Card */}
        <div className="rounded-lg border border-emerald-500/30 bg-slate-950/70 p-3.5 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-emerald-500/20 border border-emerald-400/40 flex items-center justify-center text-xl">
              ⚡
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold">Your Permanent Syndicate Boost</p>
              <p className="gui-font text-base text-emerald-300 font-bold">
                {myMult > 1 ? `${myMult.toFixed(1)}× Fleet Profit Multiplier` : '1.0× (Base Multiplier)'}
                <span className="text-xs text-slate-400 font-normal ml-2">
                  ({syndicatesCompleted} tender{syndicatesCompleted === 1 ? '' : 's'} completed)
                </span>
              </p>
            </div>
          </div>
          <div className="text-right text-xs text-slate-400">
            Next weekday completion:{' '}
            <strong className="text-teal-300 font-mono">
              +{syndicatesCompleted === 0 ? '1.5' : '0.5'}×
            </strong>{' '}
            (Total {nextMult.toFixed(1)}× Boost)
          </div>
        </div>

        {/* Stand-Down Info Notice */}
        <div className="rounded-lg border border-slate-700 bg-slate-950/50 p-4 text-center space-y-2">
          <p className="text-sm text-slate-200">
            🔧 All heavy transport tenders are closed for the weekend. Dispatch workshops are servicing and detailing your fleet for the high-yield tenders opening Monday morning!
          </p>
          {isSyndicateDirector && onAdvanceContract && (
            <div className="pt-2">
              <GameUiButton
                size="sm"
                variant="amber"
                disabled={busy}
                onClick={onAdvanceContract}
              >
                {busy ? 'Launching…' : '⚡ Fleet Director (Dale Watkins): Launch Weekday Tender Now'}
              </GameUiButton>
            </div>
          )}
        </div>
      </div>
    );
  }

  // Active or Upcoming or Completed Weekday Contract view
  return (
    <div className="rounded-xl border-2 border-emerald-500/40 bg-gradient-to-br from-emerald-950/30 via-slate-900/90 to-slate-900 p-4 space-y-4">
      {/* Header Banner */}
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-emerald-500/25 pb-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded bg-emerald-500 px-2 py-0.5 text-[10px] font-black uppercase tracking-wider text-slate-950">
              🤝 Weekday Collective Syndicate Tender
            </span>
            {isCompleted ? (
              <GameUiBadge tone="green">🎉 TARGET ACHIEVED & PAID OUT</GameUiBadge>
            ) : isUpcoming ? (
              <GameUiBadge tone="cyan">🔒 Scheduled Drop · {formatDropTime(contract.opensAt)} London Time</GameUiBadge>
            ) : (
              <GameUiBadge tone="amber">Tender Open · Closes {countdown}</GameUiBadge>
            )}
            {contract.restrictedToNewToday && (
              <span className="rounded bg-amber-400/20 text-amber-300 border border-amber-400/40 px-2 py-0.5 text-[10px] font-bold">
                ⭐ Reserved for New Participants Today
              </span>
            )}
          </div>
          <h3 className="gui-font text-base sm:text-lg text-white font-bold mt-1.5 flex items-center gap-2">
            <span>{contract.title}</span>
          </h3>
          <p className="text-xs text-slate-300 mt-0.5">
            Client: <strong className="text-emerald-300">{contract.client}</strong>
          </p>
        </div>
        <div className="text-right shrink-0">
          <p className="text-[10px] uppercase tracking-wider text-slate-400">Syndicate Dividend</p>
          <p className="gui-font text-sm text-emerald-300 mt-0.5">
            {cashReturnMult}× Return on Cash + {contract.rewardCoins || 250} Coins + Multiplier (+0.5×)
          </p>
        </div>
      </div>

      {/* Upcoming Drop Teaser Card */}
      {isUpcoming && !isCompleted && (
        <div className="rounded-lg border-2 border-cyan-500/50 bg-gradient-to-r from-cyan-950/60 via-slate-950 to-blue-950/60 p-3.5 space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="text-2xl animate-pulse">⏰</span>
              <div>
                <p className="text-xs font-bold uppercase tracking-wider text-cyan-300">
                  Randomized Drop Schedule Active
                </p>
                <p className="gui-font text-sm text-white font-bold">
                  Tender Unlocks at {formatDropTime(contract.opensAt)} London Time ({countdown} remaining)
                </p>
              </div>
            </div>
            <span className="rounded-full bg-cyan-500/20 border border-cyan-400/40 px-3 py-1 text-xs font-mono font-bold text-cyan-200">
              Unlocks in {countdown}
            </span>
          </div>
          <p className="text-xs text-slate-300 leading-relaxed">
            Daily tenders launch at randomized hours between 10:00 AM and 13:00 PM (1:00 PM) to guarantee fair opportunities for all operators across the company. Review the vehicle and capital targets below and prepare your depot!
          </p>
        </div>
      )}

      {/* Excluded Operator Notice (e.g. Paul Shaw who already took part today) */}
      {isExcluded && (
        <div className="rounded-lg border border-amber-500/50 bg-gradient-to-r from-amber-950/60 via-slate-950 to-slate-950 p-3.5 flex items-start gap-3">
          <div className="w-8 h-8 rounded-full bg-amber-500/20 border border-amber-400/50 flex items-center justify-center text-lg shrink-0">
            🛡️
          </div>
          <div className="min-w-0">
            <p className="text-xs font-bold text-amber-300 uppercase tracking-wider">
              Today's Syndicate Quota Already Claimed
            </p>
            <p className="text-xs text-slate-200 mt-0.5 leading-relaxed">
              You have already secured tender glory in today's syndicate! This bonus tender is reserved for fellow operators who haven't taken part yet today so everyone has an opportunity to build their permanent fleet multiplier.
            </p>
          </div>
        </div>
      )}

      {/* Randomized Sponsor Reward Showcase Banner */}
      {contract.sponsorReward && (
        <div className="rounded-lg border border-amber-400/50 bg-gradient-to-r from-amber-950/50 via-slate-950 to-amber-950/40 p-3 flex flex-wrap items-center justify-between gap-3 shadow-inner">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-full bg-amber-500/20 border border-amber-400/50 flex items-center justify-center text-2xl shrink-0">
              {contract.sponsorReward.icon || '🎁'}
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-[9px] font-bold uppercase tracking-wider rounded bg-amber-400/20 text-amber-300 px-1.5 py-0.5 border border-amber-400/30">
                  Featured Sponsor Reward
                </span>
                <span className="text-xs font-semibold text-white truncate">
                  {contract.sponsorReward.title}
                </span>
              </div>
              <p className="text-[11px] text-slate-300 mt-0.5 leading-snug">
                {contract.sponsorReward.desc}
              </p>
            </div>
          </div>
          <div className="text-right shrink-0">
            <span className="rounded-full bg-amber-500/10 border border-amber-400/30 px-2.5 py-1 text-[10px] font-bold text-amber-200">
              Awarded upon tender completion
            </span>
          </div>
        </div>
      )}

      {/* Personal Permanent Multiplier Card */}
      <div className="rounded-lg border border-emerald-500/30 bg-slate-950/70 p-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-full bg-emerald-500/20 border border-emerald-400/40 flex items-center justify-center text-lg">
            ⚡
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold">Your Permanent Syndicate Boost</p>
            <p className="gui-font text-sm text-emerald-300 font-bold">
              {myMult > 1 ? `${myMult.toFixed(1)}× Fleet Profit Multiplier` : '1.0× (Base Multiplier)'}
              <span className="text-xs text-slate-400 font-normal ml-2">
                ({syndicatesCompleted} tender{syndicatesCompleted === 1 ? '' : 's'} completed)
              </span>
            </p>
          </div>
        </div>
        <div className="text-right text-xs text-slate-400">
          Next tender completion:{' '}
          <strong className="text-teal-300 font-mono">
            +{syndicatesCompleted === 0 ? '1.5' : '0.5'}×
          </strong>{' '}
          (Total {nextMult.toFixed(1)}×)
        </div>
      </div>

      {/* Progress Bars: Cash Goal & Vehicle Goal */}
      <div className="space-y-3">
        {/* Cash Target Bar */}
        <div className="space-y-1">
          <div className="flex items-baseline justify-between gap-2 text-xs">
            <span className="text-slate-300">
              💵 Cash Funding: <strong className="text-emerald-300 font-mono">{formatMoney(currentCash)}</strong>
            </span>
            <span className="text-slate-400">
              Target: <strong className="text-white font-mono">{formatMoney(targetCash)}</strong> ({cashPct.toFixed(1)}%)
            </span>
          </div>
          <div className="w-full h-3 rounded-full bg-slate-950 overflow-hidden border border-emerald-500/30 p-0.5">
            <div
              className={`h-full rounded-full transition-all duration-500 ${
                cashDone
                  ? 'bg-gradient-to-r from-emerald-400 to-amber-300'
                  : 'bg-gradient-to-r from-emerald-500 to-teal-400'
              }`}
              style={{ width: `${cashPct}%` }}
            />
          </div>
          {!cashDone && (
            <p className="text-[11px] text-slate-400 text-right">
              Remaining cash needed: <span className="text-amber-300 font-mono font-semibold">{formatMoney(remainingCash)}</span>
            </p>
          )}
        </div>

        {/* Vehicle Target Bar (if requirement present) */}
        {reqVehicle && (
          <div className="space-y-1">
            <div className="flex items-baseline justify-between gap-2 text-xs">
              <span className="text-slate-300">
                🚌 Fleet Donated: <strong className="text-sky-300 font-mono">{currentVehicles} {reqVehicle.vehicleName}</strong>
              </span>
              <span className="text-slate-400">
                Target: <strong className="text-white font-mono">{targetVehicles}</strong> ({vehiclePct.toFixed(1)}%)
              </span>
            </div>
            <div className="w-full h-3 rounded-full bg-slate-950 overflow-hidden border border-sky-500/30 p-0.5">
              <div
                className={`h-full rounded-full transition-all duration-500 ${
                  vehicleDone
                    ? 'bg-gradient-to-r from-sky-400 to-emerald-400'
                    : 'bg-gradient-to-r from-sky-500 to-indigo-400'
                }`}
                style={{ width: `${vehiclePct}%` }}
              />
            </div>
            {!vehicleDone && (
              <p className="text-[11px] text-slate-400 text-right">
                Remaining vehicles required: <span className="text-sky-300 font-mono font-semibold">{remainingVehicles} vehicles</span>
              </p>
            )}
          </div>
        )}

        {isCompleted && (
          <div className="pt-2">
            <div className="rounded-xl border border-emerald-500/40 bg-emerald-950/40 p-3.5 text-center space-y-2">
              <p className="text-xs sm:text-sm text-emerald-300 font-bold flex items-center justify-center gap-1.5">
                <span>🎉</span>
                <span>Tender secured! {cashReturnMult}× dividends, sponsor perks &amp; permanent multiplier boosts awarded to all operators!</span>
              </p>
              <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
                <span className="rounded-full bg-emerald-500/20 border border-emerald-400/30 px-3 py-0.5 text-[11px] font-semibold text-emerald-200">
                  {isSyndicateDirector
                    ? '👑 Syndicate Director: Click below whenever you are ready to trigger the next tender.'
                    : '⏳ Awaiting Fleet Dispatch (Dale Watkins) to announce and launch the next syndicate tender.'}
                </span>
                {isSyndicateDirector && onAdvanceContract && (
                  <GameUiButton
                    size="sm"
                    variant="amber"
                    disabled={busy}
                    onClick={onAdvanceContract}
                  >
                    {busy ? 'Launching…' : '⚡ Fleet Director (Dale Watkins): Launch Next Syndicate Tender'}
                  </GameUiButton>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Contribution Action Bars (if active and open) */}
      {!isCompleted && (
        <div className="space-y-3">
          {/* Teamwork Fair Play Cap Hint */}
          {maxShare > 0 && (
            <div className="flex items-center justify-between text-[11px] text-teal-300/90 bg-teal-950/40 border border-teal-500/30 rounded px-2.5 py-1">
              <span>🤝 Collective Teamwork Rule: Up to {Math.round(maxShare * 100)}% contribution per operator</span>
              <span>
                Your pledged share: {targetCash > 0 ? ((myContributedCash / targetCash) * 100).toFixed(0) : 0}% cash
                {targetVehicles > 0 ? ` · ${((myContributedVehicles / targetVehicles) * 100).toFixed(0)}% fleet` : ''}
              </span>
            </div>
          )}

          {/* 1. Cash Contribution Section */}
          {cashDone ? (
            <div className="rounded-lg border border-emerald-500/40 bg-emerald-950/30 p-3 flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="gui-font text-xs text-emerald-300 flex items-center gap-1.5 font-bold">
                  <span>✅</span>
                  <span>Cash Target Fully Funded</span>
                </p>
                <p className="text-[11px] text-slate-300">
                  The syndicate has met the {formatMoney(targetCash)} funding goal!
                </p>
              </div>
              <span className="rounded bg-emerald-500/20 border border-emerald-400/40 px-2.5 py-1 text-xs text-emerald-300 font-mono font-bold shrink-0">
                {formatMoney(currentCash)} / {formatMoney(targetCash)}
              </span>
            </div>
          ) : (
            <div className="rounded-lg border border-slate-700 bg-slate-950/70 p-3 space-y-2.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="gui-font text-xs text-slate-200 flex items-center gap-1.5">
                    <span>💵</span>
                    <span>Pledge Fleet Cash to Syndicate Tender</span>
                  </p>
                  <p className="text-[11px] text-slate-400">
                    Wallet available: <strong className="text-amber-300 font-mono">{formatMoney(accountCash)}</strong>
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  {[5, 10, 25, 50, 100].map((pctVal) => (
                    <button
                      key={pctVal}
                      type="button"
                      disabled={isUpcoming || isExcluded || accountCash <= 0}
                      onClick={() => setPledgePercent(pctVal)}
                      className={`rounded px-2 py-1 text-[11px] font-bold border transition ${
                        pledgePercent === pctVal
                          ? 'border-emerald-400 bg-emerald-500 text-slate-950'
                          : 'border-slate-700 bg-slate-800 text-slate-300 hover:border-emerald-400/50'
                      } ${isUpcoming || isExcluded || accountCash <= 0 ? 'opacity-50 cursor-not-allowed' : ''}`}
                    >
                      {pctVal === 100 ? 'MAX' : `${pctVal}%`}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <div className="flex-1 min-w-[12rem] flex items-center gap-2 bg-slate-900 border border-slate-700 rounded-md px-2.5 py-1.5">
                  <span className="text-slate-400 text-xs">Pledge:</span>
                  <span className="gui-font text-sm text-emerald-300 font-mono flex-1">
                    {formatMoney(calculateCashPledge(pledgePercent))}
                  </span>
                  <span className="text-[10px] text-slate-500 font-normal">({pledgePercent}%)</span>
                </div>
                <GameUiButton
                  size="sm"
                  variant="success"
                  disabled={
                    busy ||
                    isUpcoming ||
                    isExcluded ||
                    accountCash <= 0 ||
                    calculateCashPledge(pledgePercent) <= 0
                  }
                  onClick={() => handleCashPledge(calculateCashPledge(pledgePercent))}
                >
                  {busy
                    ? 'Transferring…'
                    : isUpcoming
                    ? `🔒 Locked (${countdown})`
                    : isExcluded
                    ? '🛡️ Quota Claimed Today'
                    : accountCash <= 0
                    ? '🪙 Wallet Empty'
                    : maxShare > 0 && myContributedCash >= maxCashPerPlayer
                    ? '🤝 Teamwork Cap Reached'
                    : `🤝 Pledge ${formatMoney(calculateCashPledge(pledgePercent))}`}
                </GameUiButton>
              </div>

              {accountCash <= 0 ? (
                <p className="text-[11px] text-amber-300/80">
                  ℹ️ Wallet is empty (£0.00). Run routes or wait for depot earnings to accumulate cash before pledging!
                </p>
              ) : maxShare > 0 && myContributedCash >= maxCashPerPlayer ? (
                <p className="text-[11px] text-teal-300/80">
                  🤝 Collective Teamwork limit: You have pledged your maximum {Math.round(maxShare * 100)}% share ({formatMoney(maxCashPerPlayer)}) so fellow operators can collaborate!
                </p>
              ) : null}
            </div>
          )}

          {/* 2. Vehicle Fleet Donation Section */}
          {reqVehicle && (
            vehicleDone ? (
              <div className="rounded-lg border border-emerald-500/40 bg-emerald-950/30 p-3 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="gui-font text-xs text-emerald-300 flex items-center gap-1.5 font-bold">
                    <span>✅</span>
                    <span>Fleet Vehicle Requirement Fulfilled</span>
                  </p>
                  <p className="text-[11px] text-slate-300">
                    All {targetVehicles} {reqVehicle.vehicleName} have been donated by the syndicate!
                  </p>
                </div>
                <span className="rounded bg-emerald-500/20 border border-emerald-400/40 px-2.5 py-1 text-xs text-emerald-300 font-mono font-bold shrink-0">
                  {targetVehicles} / {targetVehicles} Donated
                </span>
              </div>
            ) : (
              <div className="rounded-lg border border-sky-500/40 bg-slate-950/70 p-3 space-y-2.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="gui-font text-xs text-sky-200 flex items-center gap-1.5">
                      <span>🚌</span>
                      <span>Donate Fleet Vehicles ({reqVehicle.vehicleName})</span>
                    </p>
                    <p className="text-[11px] text-slate-400">
                      Your Fleet Yard:{' '}
                      <strong className="text-sky-300 font-mono font-bold">
                        {playerOwnedVehicles}
                      </strong>{' '}
                      available in {reqDepotId} depot
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    {[1, 5, 10, 25, 'MAX'].map((val) => {
                      const parsed = val === 'MAX'
                        ? Math.min(playerOwnedVehicles, remainingVehicles)
                        : Number(val);
                      return (
                        <button
                          key={val}
                          type="button"
                          disabled={isUpcoming || isExcluded || playerOwnedVehicles <= 0}
                          onClick={() => setVehicleDonationQty(Math.max(1, parsed))}
                          className={`rounded px-2 py-1 text-[11px] font-bold border transition ${
                            vehicleDonationQty === parsed
                              ? 'border-sky-400 bg-sky-500 text-slate-950'
                              : 'border-slate-700 bg-slate-800 text-slate-300 hover:border-sky-400/50'
                          } ${isUpcoming || isExcluded || playerOwnedVehicles <= 0 ? 'opacity-50 cursor-not-allowed' : ''}`}
                        >
                          {val}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <div className="flex-1 min-w-[12rem] flex items-center gap-2 bg-slate-900 border border-slate-700 rounded-md px-2.5 py-1.5">
                    <span className="text-slate-400 text-xs">Donate:</span>
                    <input
                      type="number"
                      min={1}
                      max={Math.max(1, Math.min(playerOwnedVehicles, remainingVehicles))}
                      value={vehicleDonationQty}
                      disabled={isUpcoming || isExcluded || playerOwnedVehicles <= 0}
                      onChange={(e) => setVehicleDonationQty(Math.max(1, parseInt(e.target.value, 10) || 1))}
                      className="w-20 bg-slate-800 border border-slate-600 rounded px-2 py-0.5 text-xs text-white font-mono disabled:opacity-50"
                    />
                    <span className="text-xs text-sky-300 font-semibold">{reqVehicle.vehicleName}</span>
                  </div>
                  <GameUiButton
                    size="sm"
                    variant="primary"
                    disabled={
                      busy ||
                      isUpcoming ||
                      isExcluded ||
                      playerOwnedVehicles <= 0 ||
                      vehicleDonationQty <= 0 ||
                      vehicleDonationQty > playerOwnedVehicles ||
                      (maxShare > 0 && myContributedVehicles >= maxVehiclesPerPlayer)
                    }
                    onClick={() => handleVehicleDonation(vehicleDonationQty)}
                  >
                    {busy
                      ? 'Transferring…'
                      : isUpcoming
                      ? `🔒 Locked (${countdown})`
                      : isExcluded
                      ? '🛡️ Quota Claimed Today'
                      : playerOwnedVehicles <= 0
                      ? '🚌 None in Depot'
                      : maxShare > 0 && myContributedVehicles >= maxVehiclesPerPlayer
                      ? '🤝 Teamwork Cap Reached'
                      : `🚌 Donate ${vehicleDonationQty} Coach${vehicleDonationQty === 1 ? '' : 'es'}`}
                  </GameUiButton>
                </div>

                {playerOwnedVehicles <= 0 ? (
                  <p className="text-[11px] text-sky-300/80">
                    ℹ️ You do not have any {reqVehicle.vehicleName} in your {reqDepotId} depot. Purchase them in Fleet to donate!
                  </p>
                ) : (
                  <p className="text-[10px] text-amber-300/80">
                    ⚠️ Donated vehicles are permanently transferred to the syndicate tender and removed from your fleet yard!
                  </p>
                )}
              </div>
            )
          )}

          {error && <p className="text-xs text-rose-300 font-semibold">{error}</p>}
        </div>
      )}

      {/* Top Contributors / Fleet Partners Table */}
      <div className="space-y-1.5 pt-1">
        <div className="flex items-center justify-between text-xs text-slate-400 border-b border-slate-800 pb-1">
          <span className="flex items-center gap-1.5">
            <span>Leading Syndicate Contributors ({contributorsList.length})</span>
            <span className="inline-block w-2 h-2 rounded-full bg-emerald-400 animate-ping" title="Live updating" />
          </span>
          <span>Contribution &amp; Dividend</span>
        </div>
        {contributorsList.length === 0 ? (
          <p className="text-xs text-slate-500 py-3 text-center">
            No contributions pledged yet. Be the Lead Contractor to kick off this tender!
          </p>
        ) : (
          <div className="space-y-1 max-h-56 overflow-y-auto pr-1">
            {contributorsList.map((c, i) => (
              <div
                key={c.uid}
                className="flex items-center justify-between gap-2 text-xs py-1.5 px-2.5 rounded bg-slate-950/40 border border-slate-800/80 hover:border-emerald-500/30 transition-colors"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-amber-400 font-bold w-4 text-[11px] tabular-nums">#{i + 1}</span>
                  <span className="font-semibold text-slate-200 truncate">{c.fullName}</span>
                  {i === 0 && (
                    <span className="rounded bg-amber-400/20 border border-amber-400/40 px-1 py-0.2 text-[9px] font-black text-amber-200">
                      LEAD CONTRACTOR
                    </span>
                  )}
                </div>
                <div className="text-right shrink-0">
                  <span className="gui-font text-emerald-300 font-mono tabular-nums block">
                    {formatMoney(c.amount)}
                    {c.vehiclesDonated > 0 && (
                      <span className="text-sky-300 ml-1.5 font-normal text-[11px]">
                        +{c.vehiclesDonated} 🚌
                      </span>
                    )}
                  </span>
                  <span className="text-[10px] text-amber-300/90 block font-mono font-semibold">
                    {cashReturnMult}× Dividend: +{formatMoney(c.amount * cashReturnMult)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
