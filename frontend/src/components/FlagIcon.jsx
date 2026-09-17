function GbFlag() {
  return (
    <svg viewBox="0 0 60 40" className="h-full w-full" aria-hidden="true">
      <rect width="60" height="40" fill="#012169" />
      <path d="M0 0 L60 40 M60 0 L0 40" stroke="#fff" strokeWidth="8" />
      <path d="M0 0 L60 40 M60 0 L0 40" stroke="#C8102E" strokeWidth="4.5" />
      <path d="M30 0 V40 M0 20 H60" stroke="#fff" strokeWidth="13" />
      <path d="M30 0 V40 M0 20 H60" stroke="#C8102E" strokeWidth="8" />
    </svg>
  );
}

function AlFlag() {
  return (
    <svg viewBox="0 0 60 40" className="h-full w-full" aria-hidden="true">
      <rect width="60" height="40" fill="#E41E20" />
      <g fill="#1A1A1A" transform="translate(30 21)">
        <path d="M0-11.5c1.1 1.8 1.4 3.6.6 5.2C2.3-5.6 4.6-4 6.8-2.2c.8-2.2 2.2-3.8 4-5.1-1.2 3.4-1 6.2.2 8.2 1.8 1.4 3.2 3.4 3.8 5.8-2.4-1.4-5-2-7.6-1.6.4 2.2.2 4.4-.8 6.2H-6.4c-1-1.8-1.2-4-.8-6.2-2.6-.4-5.2.2-7.6 1.6.6-2.4 2-4.4 3.8-5.8 1.2-2 .4-4.8-.8-8.2 1.8 1.3 3.2 2.9 4 5.1C-4.6-4-2.3-5.6-.6-6.3-.2-7.9.1-9.7 0-11.5Z" />
        <circle cx="0" cy="-1.2" r="1.15" fill="#E41E20" />
      </g>
    </svg>
  );
}

function HuFlag() {
  return (
    <svg viewBox="0 0 60 40" className="h-full w-full" aria-hidden="true">
      <rect width="60" height="13.34" y="0" fill="#C8102E" />
      <rect width="60" height="13.34" y="13.33" fill="#fff" />
      <rect width="60" height="13.34" y="26.66" fill="#00843D" />
    </svg>
  );
}

function PlFlag() {
  return (
    <svg viewBox="0 0 60 40" className="h-full w-full" aria-hidden="true">
      <rect width="60" height="20" fill="#fff" />
      <rect width="60" height="20" y="20" fill="#DC143C" />
    </svg>
  );
}

function RoFlag() {
  return (
    <svg viewBox="0 0 60 40" className="h-full w-full" aria-hidden="true">
      <rect width="20" height="40" x="0" fill="#002B7F" />
      <rect width="20" height="40" x="20" fill="#FCD116" />
      <rect width="20" height="40" x="40" fill="#CE1126" />
    </svg>
  );
}

const FLAGS = {
  GB: GbFlag,
  AL: AlFlag,
  HU: HuFlag,
  PL: PlFlag,
  RO: RoFlag,
};

export default function FlagIcon({ country, className = '' }) {
  const Flag = FLAGS[country] || GbFlag;
  return (
    <span
      className={`inline-flex h-4 w-6 overflow-hidden rounded-[3px] ring-1 ring-black/20 shadow-sm ${className}`}
    >
      <Flag />
    </span>
  );
}
