/**
 * Over-the-top My Little Pony décor for the kawaii portal theme.
 * Purely decorative — pointer-events none, respects reduced motion via CSS.
 */

function Sparkle({ className = '', style, size = 18 }) {
  return (
    <svg className={className} style={style} width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M12 1.5 L13.9 9.1 L21.5 11 L13.9 12.9 L12 20.5 L10.1 12.9 L2.5 11 L10.1 9.1 Z"
        fill="currentColor"
      />
    </svg>
  );
}

function Heart({ className = '', style, size = 22 }) {
  return (
    <svg className={className} style={style} width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M12 21s-7.5-4.6-7.5-10A4.5 4.5 0 0 1 12 7.2 4.5 4.5 0 0 1 19.5 11c0 5.4-7.5 10-7.5 10Z"
        fill="currentColor"
      />
    </svg>
  );
}

function Star({ className = '', style, size = 20 }) {
  return (
    <svg className={className} style={style} width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M12 2.2l2.4 6.8h7.1l-5.7 4.2 2.2 6.8L12 16.8 6 20l2.2-6.8L2.5 9h7.1L12 2.2Z"
        fill="currentColor"
      />
    </svg>
  );
}

function Cloud({ className = '', style, width = 120 }) {
  return (
    <svg className={className} style={style} width={width} height={width * 0.55} viewBox="0 0 120 66" fill="none" aria-hidden>
      <path
        d="M30 52c-12 0-22-8-22-20S18 12 30 14c4-8 14-12 24-10 8-10 24-10 32-2 12-2 24 6 24 18 0 12-10 20-22 20H30Z"
        fill="currentColor"
        opacity="0.9"
      />
      <circle cx="78" cy="28" r="3" fill="#f9a8d4" />
      <circle cx="88" cy="34" r="2.2" fill="#c4b5fd" />
      <circle cx="70" cy="36" r="2" fill="#7dd3fc" />
    </svg>
  );
}

function Unicorn({ className = '', style, size = 72 }) {
  return (
    <svg className={className} style={style} width={size} height={size} viewBox="0 0 80 80" fill="none" aria-hidden>
      <defs>
        <linearGradient id="kawaiiHorn" x1="40" y1="4" x2="52" y2="28" gradientUnits="userSpaceOnUse">
          <stop stopColor="#fde68a" />
          <stop offset="0.5" stopColor="#f9a8d4" />
          <stop offset="1" stopColor="#c4b5fd" />
        </linearGradient>
        <linearGradient id="kawaiiMane" x1="18" y1="28" x2="58" y2="70" gradientUnits="userSpaceOnUse">
          <stop stopColor="#f472b6" />
          <stop offset="0.33" stopColor="#a78bfa" />
          <stop offset="0.66" stopColor="#38bdf8" />
          <stop offset="1" stopColor="#86efac" />
        </linearGradient>
      </defs>
      <ellipse cx="42" cy="48" rx="22" ry="18" fill="#fff7fb" stroke="#f9a8d4" strokeWidth="2" />
      <path d="M46 18 L54 34 L42 32 Z" fill="url(#kawaiiHorn)" />
      <path d="M28 34 C18 28 16 44 24 50 C20 40 24 34 28 34Z" fill="url(#kawaiiMane)" />
      <path d="M48 36 C58 30 66 42 58 52 C62 42 56 36 48 36Z" fill="url(#kawaiiMane)" opacity="0.85" />
      <circle cx="36" cy="46" r="2.4" fill="#6b2158" />
      <circle cx="50" cy="46" r="2.4" fill="#6b2158" />
      <circle cx="36.7" cy="45.3" r="0.8" fill="#fff" />
      <circle cx="50.7" cy="45.3" r="0.8" fill="#fff" />
      <path d="M38 54 C42 57 48 57 52 54" stroke="#f472b6" strokeWidth="2" strokeLinecap="round" fill="none" />
      <circle cx="30" cy="52" r="3.5" fill="#fda4af" opacity="0.7" />
      <circle cx="56" cy="52" r="3.5" fill="#fda4af" opacity="0.7" />
    </svg>
  );
}

function Rainbow({ className = '', style, width = 280 }) {
  return (
    <svg className={className} style={style} width={width} height={width * 0.55} viewBox="0 0 280 150" fill="none" aria-hidden>
      <path d="M20 130 A120 120 0 0 1 260 130" stroke="#f87171" strokeWidth="10" strokeLinecap="round" fill="none" />
      <path d="M32 130 A108 108 0 0 1 248 130" stroke="#fb923c" strokeWidth="10" strokeLinecap="round" fill="none" />
      <path d="M44 130 A96 96 0 0 1 236 130" stroke="#facc15" strokeWidth="10" strokeLinecap="round" fill="none" />
      <path d="M56 130 A84 84 0 0 1 224 130" stroke="#4ade80" strokeWidth="10" strokeLinecap="round" fill="none" />
      <path d="M68 130 A72 72 0 0 1 212 130" stroke="#38bdf8" strokeWidth="10" strokeLinecap="round" fill="none" />
      <path d="M80 130 A60 60 0 0 1 200 130" stroke="#a78bfa" strokeWidth="10" strokeLinecap="round" fill="none" />
      <path d="M92 130 A48 48 0 0 1 188 130" stroke="#f472b6" strokeWidth="10" strokeLinecap="round" fill="none" />
    </svg>
  );
}

function Bow({ className = '', style, size = 36 }) {
  return (
    <svg className={className} style={style} width={size} height={size} viewBox="0 0 40 40" fill="none" aria-hidden>
      <path d="M8 20 C4 10 14 8 20 16 C26 8 36 10 32 20 C36 30 26 32 20 24 C14 32 4 30 8 20Z" fill="#f472b6" />
      <circle cx="20" cy="20" r="4" fill="#fde68a" stroke="#f9a8d4" strokeWidth="1.5" />
    </svg>
  );
}

const SPARKLES = [
  { top: '8%', left: '12%', size: 14, color: '#f472b6', delay: '0s', dur: '2.4s' },
  { top: '14%', left: '78%', size: 18, color: '#a78bfa', delay: '0.4s', dur: '2.8s' },
  { top: '22%', left: '42%', size: 12, color: '#38bdf8', delay: '0.8s', dur: '2.2s' },
  { top: '28%', left: '88%', size: 16, color: '#fde68a', delay: '1.1s', dur: '3s' },
  { top: '36%', left: '6%', size: 20, color: '#86efac', delay: '0.2s', dur: '2.6s' },
  { top: '48%', left: '70%', size: 13, color: '#fb7185', delay: '1.4s', dur: '2.3s' },
  { top: '58%', left: '18%', size: 17, color: '#c4b5fd', delay: '0.6s', dur: '2.9s' },
  { top: '66%', left: '92%', size: 15, color: '#f9a8d4', delay: '1.8s', dur: '2.5s' },
  { top: '74%', left: '38%', size: 19, color: '#7dd3fc', delay: '0.9s', dur: '3.1s' },
  { top: '82%', left: '58%', size: 14, color: '#fbbf24', delay: '1.6s', dur: '2.1s' },
  { top: '10%', left: '55%', size: 11, color: '#f472b6', delay: '2s', dur: '2.7s' },
  { top: '40%', left: '48%', size: 10, color: '#a78bfa', delay: '0.3s', dur: '2s' },
  { top: '88%', left: '10%', size: 16, color: '#34d399', delay: '1.2s', dur: '2.8s' },
  { top: '18%', left: '28%', size: 13, color: '#f0abfc', delay: '1.7s', dur: '2.4s' },
  { top: '52%', left: '84%', size: 12, color: '#fda4af', delay: '0.5s', dur: '3.2s' },
];

const HEARTS = [
  { top: '20%', left: '85%', size: 24, color: '#fb7185', delay: '0s' },
  { top: '62%', left: '8%', size: 18, color: '#f472b6', delay: '1.2s' },
  { top: '78%', left: '72%', size: 22, color: '#f9a8d4', delay: '0.6s' },
  { top: '34%', left: '22%', size: 16, color: '#e879f9', delay: '1.8s' },
];

const STARS = [
  { top: '12%', left: '64%', size: 18, color: '#fde68a', delay: '0.3s' },
  { top: '44%', left: '90%', size: 14, color: '#fbbf24', delay: '1s' },
  { top: '70%', left: '28%', size: 20, color: '#fef08a', delay: '1.5s' },
  { top: '86%', left: '48%', size: 15, color: '#fcd34d', delay: '0.7s' },
];

export default function KawaiiDecor() {
  return (
    <div className="kawaii-decor pointer-events-none fixed inset-0 z-[5] overflow-hidden" aria-hidden="true">
      <div className="kawaii-rainbow-banner absolute top-0 inset-x-0 h-2.5" />

      <Rainbow
        className="kawaii-float absolute -top-2 left-1/2 -translate-x-1/2 opacity-90 drop-shadow-lg"
        width={320}
      />

      <Unicorn
        className="kawaii-bob absolute top-[18%] right-[4%] drop-shadow-md"
        size={88}
      />
      <Unicorn
        className="kawaii-bob-delayed absolute bottom-[14%] left-[3%] opacity-90 drop-shadow-md -scale-x-100"
        size={70}
      />

      <Cloud className="kawaii-drift absolute top-[12%] left-[4%] text-white/90" width={130} />
      <Cloud className="kawaii-drift-slow absolute top-[55%] right-[2%] text-white/85" width={110} />
      <Cloud className="kawaii-drift absolute bottom-[8%] left-[35%] text-pink-50/90" width={100} />

      <Bow className="kawaii-spin-soft absolute top-[30%] left-[48%]" size={40} />
      <Bow className="kawaii-bob absolute bottom-[22%] right-[18%]" size={32} />

      {SPARKLES.map((item, index) => (
        <Sparkle
          key={`sparkle-${index}`}
          className="kawaii-twinkle absolute"
          size={item.size}
          style={{
            top: item.top,
            left: item.left,
            color: item.color,
            animationDelay: item.delay,
            animationDuration: item.dur,
          }}
        />
      ))}

      {HEARTS.map((item, index) => (
        <Heart
          key={`heart-${index}`}
          className="kawaii-bob absolute"
          size={item.size}
          style={{
            top: item.top,
            left: item.left,
            color: item.color,
            animationDelay: item.delay,
            opacity: 0.85,
          }}
        />
      ))}

      {STARS.map((item, index) => (
        <Star
          key={`star-${index}`}
          className="kawaii-twinkle absolute"
          size={item.size}
          style={{
            top: item.top,
            left: item.left,
            color: item.color,
            animationDelay: item.delay,
          }}
        />
      ))}

      <div className="kawaii-glitter absolute inset-0" />
    </div>
  );
}
