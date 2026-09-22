import { useEffect, useRef, useState } from 'react';
import {
  COIN_AWARD_EVENT,
  coinReasonLabel,
  installCoinAwardFetchHook,
} from '../utils/coinAwards';

installCoinAwardFetchHook();

function CoinGlyph({ className }) {
  return (
    <svg className={className} viewBox="0 0 64 64" aria-hidden="true">
      <defs>
        <radialGradient id="cl-coin-grad" cx="35%" cy="30%" r="70%">
          <stop offset="0%" stopColor="#fff6c8" />
          <stop offset="45%" stopColor="#f5c842" />
          <stop offset="100%" stopColor="#c48412" />
        </radialGradient>
      </defs>
      <circle cx="32" cy="32" r="28" fill="url(#cl-coin-grad)" stroke="#8a5a0a" strokeWidth="3" />
      <circle cx="32" cy="32" r="20" fill="none" stroke="#ffe9a0" strokeWidth="2" opacity="0.85" />
      <text
        x="32"
        y="38"
        textAnchor="middle"
        fontSize="22"
        fontWeight="700"
        fill="#7a4a08"
        fontFamily="Georgia, serif"
      >
        C
      </text>
    </svg>
  );
}

/**
 * Satisfying animated popup when coins are awarded.
 * Queues bursts; shows total + reasons; pops away cleanly.
 */
export default function CoinAwardToaster() {
  const [queue, setQueue] = useState([]);
  const [current, setCurrent] = useState(null);
  const [phase, setPhase] = useState('idle'); // idle | enter | hold | exit
  const timersRef = useRef([]);

  const clearTimers = () => {
    timersRef.current.forEach((id) => window.clearTimeout(id));
    timersRef.current = [];
  };

  useEffect(() => {
    const onAward = (event) => {
      const awards = event?.detail?.awards;
      if (!Array.isArray(awards) || !awards.length) return;
      const total = awards.reduce((sum, row) => sum + (Number(row.amount) || 0), 0);
      if (total <= 0) return;
      setQueue((prev) => [
        ...prev,
        {
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          total,
          awards,
        },
      ]);
    };
    window.addEventListener(COIN_AWARD_EVENT, onAward);
    return () => window.removeEventListener(COIN_AWARD_EVENT, onAward);
  }, []);

  // Pull next item from queue only when idle.
  useEffect(() => {
    if (current || queue.length === 0) return;
    const next = queue[0];
    setQueue((prev) => prev.slice(1));
    setCurrent(next);
  }, [queue, current]);

  // Animate the active toast — timers keyed only to toast id so queue updates don't cancel dismiss.
  useEffect(() => {
    if (!current) {
      setPhase('idle');
      return undefined;
    }

    clearTimers();
    setPhase('enter');

    timersRef.current.push(window.setTimeout(() => setPhase('hold'), 450));
    timersRef.current.push(window.setTimeout(() => setPhase('exit'), 2400));
    timersRef.current.push(window.setTimeout(() => {
      setCurrent(null);
      setPhase('idle');
    }, 2950));

    return clearTimers;
  }, [current?.id]);

  if (!current) return null;

  const reasons = current.awards.map((row) => ({
    amount: row.amount,
    label: coinReasonLabel(row.reason),
  }));

  return (
    <div
      className="pointer-events-none fixed inset-0 z-[80] flex items-start justify-center px-4 pt-[12vh] sm:pt-[16vh]"
      aria-live="polite"
    >
      <div
        className={`coin-award-card relative w-full max-w-sm overflow-hidden rounded-2xl border border-amber-400/30 bg-[#0b1220]/95 px-5 py-5 shadow-[0_20px_60px_rgba(0,0,0,0.55)] backdrop-blur-md ${
          phase === 'enter' ? 'coin-award-enter' : ''
        } ${phase === 'hold' ? 'coin-award-hold' : ''} ${phase === 'exit' ? 'coin-award-exit' : ''}`}
      >
        <div className="coin-award-shine pointer-events-none absolute inset-0" />
        <div className="relative flex flex-col items-center text-center">
          <div className={`coin-award-coin relative mb-3 ${phase === 'exit' ? 'coin-award-coin-exit' : ''}`}>
            <CoinGlyph className="h-16 w-16 drop-shadow-[0_8px_16px_rgba(245,200,66,0.45)]" />
            {phase !== 'exit' && (
              <>
                <span className="coin-award-burst" aria-hidden="true" />
                <span className="coin-award-burst coin-award-burst-delay" aria-hidden="true" />
              </>
            )}
          </div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-200/80">
            Coins earned
          </p>
          <p className="mt-1 text-4xl font-semibold tabular-nums text-amber-200">
            +{current.total}
          </p>
          <ul className="mt-3 w-full space-y-1.5">
            {reasons.map((row, index) => (
              <li
                key={`${row.label}-${index}`}
                className="flex items-center justify-between gap-3 rounded-lg bg-white/[0.04] px-3 py-1.5 text-left text-xs"
              >
                <span className="truncate text-slate-200">{row.label}</span>
                <span className="flex-shrink-0 tabular-nums text-amber-200/90">+{row.amount}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <style>{`
        @keyframes coin-award-pop {
          0% { opacity: 0; transform: translateY(22px) scale(0.82); filter: blur(2px); }
          55% { opacity: 1; transform: translateY(-6px) scale(1.05); filter: blur(0); }
          100% { opacity: 1; transform: translateY(0) scale(1); filter: blur(0); }
        }
        @keyframes coin-award-popaway {
          0% { opacity: 1; transform: translateY(0) scale(1); filter: blur(0); }
          35% { opacity: 1; transform: translateY(-8px) scale(1.08); filter: blur(0); }
          100% { opacity: 0; transform: translateY(-28px) scale(0.55); filter: blur(4px); }
        }
        @keyframes coin-spin-bounce {
          0% { transform: rotateY(0deg) scale(0.6); }
          55% { transform: rotateY(380deg) scale(1.12); }
          100% { transform: rotateY(360deg) scale(1); }
        }
        @keyframes coin-flee {
          0% { transform: rotateY(0deg) scale(1); opacity: 1; }
          100% { transform: rotateY(180deg) scale(0.2) translateY(-20px); opacity: 0; }
        }
        @keyframes coin-burst {
          0% { opacity: 0.9; transform: scale(0.4); }
          100% { opacity: 0; transform: scale(1.8); }
        }
        @keyframes coin-shine {
          0% { transform: translateX(-120%) skewX(-18deg); opacity: 0; }
          30% { opacity: 0.35; }
          100% { transform: translateX(160%) skewX(-18deg); opacity: 0; }
        }
        .coin-award-enter { animation: coin-award-pop 0.45s cubic-bezier(0.2, 0.9, 0.2, 1) both; }
        .coin-award-hold { opacity: 1; transform: none; }
        .coin-award-exit { animation: coin-award-popaway 0.5s cubic-bezier(0.4, 0, 0.7, 0.2) both; }
        .coin-award-coin { animation: coin-spin-bounce 0.7s cubic-bezier(0.2, 0.85, 0.25, 1) both; transform-style: preserve-3d; }
        .coin-award-coin-exit { animation: coin-flee 0.45s ease-in both; }
        .coin-award-burst {
          position: absolute;
          inset: -10px;
          border-radius: 9999px;
          border: 2px solid rgba(245, 200, 66, 0.55);
          animation: coin-burst 0.7s ease-out both;
        }
        .coin-award-burst-delay { animation-delay: 0.12s; border-color: rgba(255, 236, 160, 0.4); }
        .coin-award-shine {
          background: linear-gradient(110deg, transparent 30%, rgba(255,255,255,0.18) 50%, transparent 70%);
          animation: coin-shine 1.1s ease-out 0.15s both;
        }
      `}</style>
    </div>
  );
}
