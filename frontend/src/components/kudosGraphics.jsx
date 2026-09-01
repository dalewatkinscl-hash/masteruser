/**
 * Graphical kudos badges — each type maps to a distinct illustration.
 * Accents are kept bright for icons; labels use light text for readability.
 */

export const KUDOS_GRAPHICS = {
  great_learning: {
    key: 'great_learning',
    label: 'Great learning',
    description: 'Scholar’s cap',
    accent: '#7dd3fc',
    soft: 'rgba(125, 211, 252, 0.16)',
    border: 'rgba(125, 211, 252, 0.45)',
    labelColor: '#f1f5f9',
  },
  great_performance: {
    key: 'great_performance',
    label: 'Great performance',
    description: 'Gold star',
    accent: '#fbbf24',
    soft: 'rgba(251, 191, 36, 0.16)',
    border: 'rgba(251, 191, 36, 0.45)',
    labelColor: '#f1f5f9',
  },
  dependability: {
    key: 'dependability',
    label: 'Dependability',
    description: 'Shield',
    accent: '#6ee7b7',
    soft: 'rgba(110, 231, 183, 0.16)',
    border: 'rgba(110, 231, 183, 0.45)',
    labelColor: '#f1f5f9',
  },
  teamwork: {
    key: 'teamwork',
    label: 'Teamwork',
    description: 'Handshake',
    accent: '#a5b4fc',
    soft: 'rgba(165, 180, 252, 0.16)',
    border: 'rgba(165, 180, 252, 0.45)',
    labelColor: '#f1f5f9',
  },
  customer_care: {
    key: 'customer_care',
    label: 'Oh well! you tried!',
    description: 'Participation award',
    accent: '#fdba74',
    soft: 'rgba(253, 186, 116, 0.16)',
    border: 'rgba(253, 186, 116, 0.45)',
    labelColor: '#f1f5f9',
  },
  going_above_beyond: {
    key: 'going_above_beyond',
    label: 'Above & beyond',
    description: 'Rocket',
    accent: '#c4b5fd',
    soft: 'rgba(196, 181, 253, 0.16)',
    border: 'rgba(196, 181, 253, 0.45)',
    labelColor: '#f1f5f9',
  },
  leadership: {
    key: 'leadership',
    label: 'Leadership',
    description: 'Crown',
    accent: '#67e8f9',
    soft: 'rgba(103, 232, 249, 0.16)',
    border: 'rgba(103, 232, 249, 0.45)',
    labelColor: '#f1f5f9',
  },
  positivity: {
    key: 'positivity',
    label: 'Positivity',
    description: 'Sunshine',
    accent: '#bef264',
    soft: 'rgba(190, 242, 100, 0.16)',
    border: 'rgba(190, 242, 100, 0.45)',
    labelColor: '#f1f5f9',
  },
};

function ScholarCapIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 64 64" fill="none" aria-hidden="true">
      <path d="M8 28 L32 16 L56 28 L32 40 Z" fill="currentColor" opacity="0.95" />
      <path d="M16 31 V42 C16 48 24 52 32 52 C40 52 48 48 48 42 V31" stroke="currentColor" strokeWidth="3" fill="none" opacity="0.85" />
      <path d="M56 28 V40" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
      <circle cx="56" cy="42" r="3.5" fill="currentColor" />
      <path d="M20 34 L32 28 L44 34" stroke="#0b1220" strokeWidth="2" opacity="0.25" />
    </svg>
  );
}

function StarIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 64 64" fill="none" aria-hidden="true">
      <path
        d="M32 8 L38.5 24.5 L56 26 L43 38 L47 55 L32 46 L17 55 L21 38 L8 26 L25.5 24.5 Z"
        fill="currentColor"
      />
    </svg>
  );
}

function ShieldIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 64 64" fill="none" aria-hidden="true">
      <path
        d="M32 8 L52 16 V32 C52 44 42 54 32 58 C22 54 12 44 12 32 V16 Z"
        fill="currentColor"
        opacity="0.95"
      />
      <path d="M24 32 L30 38 L42 24" stroke="#0b1220" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" opacity="0.45" />
    </svg>
  );
}

function HandshakeIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 64 64" fill="none" aria-hidden="true">
      <path d="M10 30 L22 18 L30 26 L22 34 Z" fill="currentColor" opacity="0.9" />
      <path d="M54 30 L42 18 L34 26 L42 34 Z" fill="currentColor" opacity="0.9" />
      <path d="M22 34 L28 40 L36 32 L42 38 L36 44 L28 48 L20 40 Z" fill="currentColor" />
      <path d="M28 40 L34 34" stroke="#0b1220" strokeWidth="2" opacity="0.3" />
    </svg>
  );
}

function ParticipationMedalIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 64 64" fill="none" aria-hidden="true">
      <path d="M18 8 L28 28 L22 28 L14 10 Z" fill="currentColor" opacity="0.85" />
      <path d="M46 8 L36 28 L42 28 L50 10 Z" fill="currentColor" opacity="0.85" />
      <path d="M24 8 H40 L36 20 H28 Z" fill="currentColor" opacity="0.55" />
      <circle cx="32" cy="40" r="16" fill="currentColor" />
      <circle cx="32" cy="40" r="11" fill="#0b1220" opacity="0.35" />
      <path
        d="M26 38 C27 35 29 34 32 34 C35 34 37 35 38 38"
        stroke="#0b1220"
        strokeWidth="2.5"
        strokeLinecap="round"
        opacity="0.55"
      />
      <circle cx="27.5" cy="36" r="1.6" fill="#0b1220" opacity="0.55" />
      <circle cx="36.5" cy="36" r="1.6" fill="#0b1220" opacity="0.55" />
      <path d="M27 45 C29 43 35 43 37 45" stroke="#0b1220" strokeWidth="2.2" strokeLinecap="round" opacity="0.45" />
    </svg>
  );
}

function RocketIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 64 64" fill="none" aria-hidden="true">
      <path d="M32 8 C42 14 48 26 46 40 L32 54 L18 40 C16 26 22 14 32 8 Z" fill="currentColor" />
      <circle cx="32" cy="28" r="5" fill="#0b1220" opacity="0.35" />
      <path d="M18 40 L10 48 L18 46 Z" fill="currentColor" opacity="0.85" />
      <path d="M46 40 L54 48 L46 46 Z" fill="currentColor" opacity="0.85" />
      <path d="M28 54 L32 60 L36 54" fill="currentColor" opacity="0.7" />
    </svg>
  );
}

function CrownIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 64 64" fill="none" aria-hidden="true">
      <path d="M10 44 L14 22 L26 34 L32 16 L38 34 L50 22 L54 44 Z" fill="currentColor" />
      <rect x="12" y="44" width="40" height="8" rx="2" fill="currentColor" opacity="0.85" />
      <circle cx="14" cy="20" r="3" fill="currentColor" />
      <circle cx="32" cy="14" r="3" fill="currentColor" />
      <circle cx="50" cy="20" r="3" fill="currentColor" />
    </svg>
  );
}

function SunshineIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 64 64" fill="none" aria-hidden="true">
      <circle cx="32" cy="32" r="12" fill="currentColor" />
      {[0, 45, 90, 135, 180, 225, 270, 315].map((deg) => {
        const rad = (deg * Math.PI) / 180;
        const x1 = 32 + Math.cos(rad) * 18;
        const y1 = 32 + Math.sin(rad) * 18;
        const x2 = 32 + Math.cos(rad) * 26;
        const y2 = 32 + Math.sin(rad) * 26;
        return (
          <line
            key={deg}
            x1={x1}
            y1={y1}
            x2={x2}
            y2={y2}
            stroke="currentColor"
            strokeWidth="3.5"
            strokeLinecap="round"
          />
        );
      })}
    </svg>
  );
}

const ICON_BY_TYPE = {
  great_learning: ScholarCapIcon,
  great_performance: StarIcon,
  dependability: ShieldIcon,
  teamwork: HandshakeIcon,
  customer_care: ParticipationMedalIcon,
  going_above_beyond: RocketIcon,
  leadership: CrownIcon,
  positivity: SunshineIcon,
};

export function getKudosGraphic(badgeType) {
  return KUDOS_GRAPHICS[badgeType] || KUDOS_GRAPHICS.great_performance;
}

export function KudosBadgeIcon({ badgeType, className = 'w-8 h-8' }) {
  const Icon = ICON_BY_TYPE[badgeType] || StarIcon;
  const graphic = getKudosGraphic(badgeType);
  return (
    <span className={className} style={{ color: graphic.accent }}>
      <Icon className="w-full h-full" />
    </span>
  );
}

export function KudosBadgeGraphic({
  badgeType,
  size = 'md',
  showLabel = false,
  className = '',
  title,
  gifUrl = '',
}) {
  const graphic = getKudosGraphic(badgeType);
  const Icon = ICON_BY_TYPE[badgeType] || StarIcon;
  const sizes = {
    sm: { wrap: 'w-10 h-10', icon: 'w-6 h-6', label: 'text-[10px]', gif: 'max-w-14 max-h-14' },
    md: { wrap: 'w-14 h-14', icon: 'w-8 h-8', label: 'text-xs', gif: 'max-w-20 max-h-20' },
    lg: { wrap: 'w-24 h-24', icon: 'w-14 h-14', label: 'text-sm', gif: 'max-w-28 max-h-28' },
    xl: { wrap: 'w-32 h-32', icon: 'w-20 h-20', label: 'text-base', gif: 'max-w-40 max-h-40' },
  };
  const dim = sizes[size] || sizes.md;
  const hasGif = Boolean(gifUrl);

  return (
    <div className={`inline-flex flex-col items-center gap-1.5 ${className}`} title={title || graphic.label}>
      {hasGif ? (
        <img
          src={gifUrl}
          alt=""
          className={`${dim.gif} w-auto h-auto object-contain rounded-2xl border border-[#1a2540] bg-white/[0.06] shadow-lg`}
          loading="lazy"
        />
      ) : (
        <div
          className={`${dim.wrap} rounded-2xl flex items-center justify-center border border-[#1a2540] bg-white/[0.06] shadow-lg`}
          style={{ color: graphic.accent }}
        >
          <Icon className={dim.icon} />
        </div>
      )}
      {showLabel && (
        <span className={`${dim.label} font-semibold text-center leading-tight text-slate-100`}>
          {graphic.label}
        </span>
      )}
    </div>
  );
}
