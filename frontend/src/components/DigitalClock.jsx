import { useEffect, useState } from 'react';

function formatTime(date) {
  return date.toLocaleTimeString('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
}

function formatTitle(date) {
  return date.toLocaleString('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
}

export default function DigitalClock() {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  const label = formatTime(now);

  return (
    <time
      dateTime={now.toISOString()}
      title={formatTitle(now)}
      aria-label={`Current time ${label}`}
      className="shrink-0 font-mono tabular-nums text-sm font-semibold tracking-wider text-base-content px-2.5 py-1 rounded-lg border border-base-300 bg-base-100/70"
    >
      {label}
    </time>
  );
}
