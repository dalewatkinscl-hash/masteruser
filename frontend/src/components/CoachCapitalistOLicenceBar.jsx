import React from 'react';
import {
  O_LICENCE_MODES,
  computeDvsaCatchChancePer5s,
  formatDuration,
  normalizeOLicence,
} from '../lib/coachCapitalist';

export default function CoachCapitalistOLicenceBar({
  oLicence,
  tachoHeatReduction = 0,
  prohibitionRemainingSec = 0,
  cleanSheetActive = false,
  todayKey = '',
  disabled = false,
  onChangeMode,
}) {
  const ol = normalizeOLicence(oLicence);
  const prohibited = prohibitionRemainingSec > 0;
  const catchChancePct = prohibited ? 0 : computeDvsaCatchChancePer5s(ol) * 100;
  const cleanPct = Math.min(100, Math.round((ol.cleanStreakSec / 900) * 100));
  const cleanPackClaimedToday = Boolean(todayKey && ol.cleanBonusClaimedDay === todayKey);

  if (prohibited) {
    return (
      <div className="rounded-xl border-2 border-rose-500 bg-gradient-to-r from-rose-950 via-red-950/90 to-slate-950 px-3.5 py-2.5 flex flex-wrap items-center justify-between gap-3 shadow-lg">
        <div className="space-y-0.5">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded bg-rose-600 px-2 py-0.5 text-[10px] font-black uppercase tracking-wider text-white animate-pulse">
              🚨 DVSA PUBLIC INQUIRY PROHIBITION
            </span>
            <span className="gui-font text-sm text-rose-200 tabular-nums">
              0.25× Fleet Speed · {formatDuration(prohibitionRemainingSec)} left
            </span>
          </div>
          <p className="text-[11px] text-rose-200/85">
            O-Licence locked to <strong>Green</strong> until prohibition clears. Total Public Inquiries this season: <strong>{ol.inquiriesCount}</strong>.
          </p>
        </div>
        <span className="rounded-lg border border-rose-400/50 bg-rose-500/20 px-2.5 py-1 text-xs font-bold text-rose-100">
          🟢 Locked to Green
        </span>
      </div>
    );
  }

  const heatColor = ol.heat >= 70
    ? 'from-orange-500 via-red-500 to-rose-600'
    : ol.heat >= 35
      ? 'from-amber-400 to-orange-500'
      : 'from-emerald-400 to-sky-400';

  return (
    <div className={`rounded-xl border-2 px-3 py-2.5 space-y-2 transition ${
      ol.mode === 'red'
        ? 'border-rose-500/70 bg-gradient-to-r from-rose-950/50 via-slate-900/95 to-slate-950'
        : ol.mode === 'amber'
          ? 'border-amber-400/60 bg-gradient-to-r from-amber-950/40 via-slate-900/95 to-slate-950'
          : 'border-emerald-500/40 bg-slate-900/80'
    }`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-bold text-white flex items-center gap-1.5">
            <span>🚦 O-Licence Compliance</span>
          </span>
          {tachoHeatReduction > 0 ? (
            <span
              className="rounded border border-emerald-400/40 bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-bold text-emerald-300"
              title="Master Tachograph Key card slows DVSA heat accumulation"
            >
              ⏱️ −{Math.round(tachoHeatReduction * 100)}% Heat
            </span>
          ) : null}
          {cleanSheetActive ? (
            <span className="rounded border border-emerald-400/50 bg-emerald-500/20 px-1.5 py-0.5 text-[10px] font-bold text-emerald-200">
              ✨ 1.15× Clean Operator Active
            </span>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          {[
            { id: 'green', badge: cleanSheetActive ? '1.15×' : '1.0×', icon: '🟢', activeCls: 'border-emerald-400 bg-emerald-500/25 text-emerald-100' },
            { id: 'amber', badge: '2.0×', icon: '🟡', activeCls: 'border-amber-400 bg-amber-500/25 text-amber-100' },
            { id: 'red', badge: '3.5×', icon: '🔴', activeCls: 'border-rose-400 bg-rose-500/30 text-rose-100 animate-pulse' },
          ].map((opt) => {
            const active = ol.mode === opt.id;
            const cfg = O_LICENCE_MODES[opt.id];
            return (
              <button
                key={opt.id}
                type="button"
                disabled={disabled}
                onClick={() => onChangeMode?.(opt.id)}
                title={cfg.desc}
                className={`rounded-lg border px-2.5 py-1 text-xs font-bold transition flex items-center gap-1 disabled:opacity-50 ${
                  active
                    ? opt.activeCls
                    : 'border-slate-700 bg-slate-950/70 text-slate-300 hover:border-slate-500'
                }`}
              >
                <span>{opt.icon}</span>
                <span>{cfg.shortLabel}</span>
                <span className="text-[10px] opacity-85">({opt.badge})</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="grid sm:grid-cols-[1fr_auto] gap-2 items-center text-[11px]">
        <div className="space-y-1">
          <div className="flex items-center justify-between gap-2">
            <span className="text-slate-300">
              DVSA Inspection Heat:{' '}
              <strong className={`tabular-nums ${
                ol.heat >= 70 ? 'text-rose-300' : ol.heat >= 35 ? 'text-amber-300' : 'text-emerald-300'
              }`}>
                {Math.round(ol.heat)}%
              </strong>
              {ol.hotStreakSec >= 1 ? (
                <span className="text-slate-400 ml-2 tabular-nums">
                  · Hot streak: <strong>{formatDuration(ol.hotStreakSec)}</strong>
                </span>
              ) : null}
            </span>
            <span className={`font-bold tabular-nums ${
              catchChancePct >= 15
                ? 'text-rose-300 animate-pulse'
                : catchChancePct > 0
                  ? 'text-amber-300'
                  : 'text-emerald-300'
            }`}>
              {catchChancePct > 0
                ? `⚠️ Catch Risk: ${catchChancePct.toFixed(1)}% / 5s`
                : '✓ Zero Inspection Risk'}
            </span>
          </div>
          <div className="w-full h-2 rounded-full bg-slate-950 border border-slate-800 overflow-hidden">
            <div
              className={`h-full bg-gradient-to-r ${heatColor} transition-all duration-300`}
              style={{ width: `${Math.min(100, Math.max(0, ol.heat))}%` }}
            />
          </div>
        </div>

        <div className="rounded-lg border border-slate-800 bg-slate-950/70 px-2.5 py-1 text-[10px] text-slate-300 shrink-0">
          {ol.mode === 'green' ? (
            cleanPackClaimedToday ? (
              <span className="text-emerald-300 font-semibold">
                ✓ Clean Pack claimed today · {cleanSheetActive ? '+15% Clean active' : `${cleanPct}% to +15%`}
              </span>
            ) : (
              <span>
                Clean Shift Pack: <strong className="text-emerald-300 tabular-nums">{cleanPct}%</strong> (15m Green → +1 Pack)
              </span>
            )
          ) : (
            <span className="text-rose-300 font-semibold">
              Caught = −50% Cash · −15% Backers · 15m 0.25×
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
