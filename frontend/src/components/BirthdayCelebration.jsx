import { useEffect, useMemo, useState } from 'react';

const BALLOON_COLORS = ['#f472b6', '#60a5fa', '#fbbf24', '#34d399', '#a78bfa', '#fb7185'];

function firstNameFrom(fullName) {
  const name = String(fullName || '').trim();
  if (!name) return 'there';
  return name.split(/\s+/)[0];
}

function Balloon({ color, left, delay, size, sway }) {
  return (
    <div
      className="birthday-balloon"
      style={{
        left,
        width: size,
        animationDelay: delay,
        '--sway': sway,
      }}
      aria-hidden="true"
    >
      <svg viewBox="0 0 64 96" className="w-full h-auto drop-shadow-lg">
        <ellipse cx="32" cy="34" rx="26" ry="32" fill={color} opacity="0.92" />
        <ellipse cx="22" cy="22" rx="8" ry="12" fill="rgba(255,255,255,0.35)" />
        <path d="M32 66 L28 72 L36 72 Z" fill={color} opacity="0.85" />
        <path
          d="M32 72 C28 80, 36 86, 32 96"
          fill="none"
          stroke="rgba(255,255,255,0.35)"
          strokeWidth="1.5"
        />
      </svg>
    </div>
  );
}

function ConfettiBurst({ active }) {
  const pieces = useMemo(() => {
    if (!active) return [];
    return Array.from({ length: 48 }, (_, i) => ({
      id: i,
      left: `${8 + Math.random() * 84}%`,
      delay: `${Math.random() * 0.35}s`,
      duration: `${1.8 + Math.random() * 1.4}s`,
      rotate: `${Math.random() * 720 - 360}deg`,
      color: BALLOON_COLORS[i % BALLOON_COLORS.length],
      width: 6 + Math.floor(Math.random() * 6),
      height: 8 + Math.floor(Math.random() * 10),
      drift: `${Math.random() * 80 - 40}px`,
    }));
  }, [active]);

  if (!active) return null;

  return (
    <div className="birthday-confetti" aria-hidden="true">
      {pieces.map((piece) => (
        <span
          key={piece.id}
          className="birthday-confetti-piece"
          style={{
            left: piece.left,
            width: piece.width,
            height: piece.height,
            background: piece.color,
            animationDelay: piece.delay,
            animationDuration: piece.duration,
            '--drift': piece.drift,
            '--spin': piece.rotate,
          }}
        />
      ))}
    </div>
  );
}

/**
 * Birthday celebration for an employee profile.
 * Shows a greeting + confetti burst once, and keeps floating balloons on the card.
 */
export default function BirthdayCelebration({ fullName, age }) {
  const [showConfetti, setShowConfetti] = useState(true);
  const name = firstNameFrom(fullName);

  useEffect(() => {
    const timer = window.setTimeout(() => setShowConfetti(false), 4200);
    return () => window.clearTimeout(timer);
  }, []);

  const balloons = useMemo(
    () => [
      { color: BALLOON_COLORS[0], left: '4%', delay: '0s', size: 44, sway: '10px' },
      { color: BALLOON_COLORS[1], left: '14%', delay: '0.4s', size: 36, sway: '-12px' },
      { color: BALLOON_COLORS[2], left: '78%', delay: '0.2s', size: 42, sway: '14px' },
      { color: BALLOON_COLORS[3], left: '88%', delay: '0.7s', size: 34, sway: '-10px' },
      { color: BALLOON_COLORS[4], left: '68%', delay: '1s', size: 30, sway: '8px' },
    ],
    [],
  );

  return (
    <div className="relative mb-4 overflow-visible rounded-2xl border border-pink-400/25 bg-gradient-to-br from-pink-500/15 via-violet-500/10 to-amber-400/10 px-5 py-5 sm:py-6">
      <ConfettiBurst active={showConfetti} />

      {balloons.map((balloon) => (
        <Balloon key={`${balloon.left}-${balloon.color}`} {...balloon} />
      ))}

      <div className="relative z-10 text-center sm:text-left px-1 sm:px-10">
        <p className="text-[11px] font-mono uppercase tracking-[0.2em] text-pink-300/90 mb-1">
          Celebration
        </p>
        <h3 className="text-xl sm:text-2xl font-semibold tracking-tight text-white">
          Happy Birthday, {name}!
        </h3>
        <p className="mt-1 text-sm text-slate-300">
          {typeof age === 'number'
            ? `Wishing you a wonderful day as you turn ${age}.`
            : 'Wishing you a wonderful day.'}
        </p>
      </div>
    </div>
  );
}
