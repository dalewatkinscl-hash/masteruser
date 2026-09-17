import { useEffect, useState } from 'react';
import { useLanguage } from '../context/LanguageContext';

function formatTime(date, locale) {
  return date.toLocaleTimeString(locale, {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
}

function formatTitle(date, locale) {
  return date.toLocaleString(locale, {
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
  const { locale, t } = useLanguage();
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  const label = formatTime(now, locale);

  return (
    <time
      dateTime={now.toISOString()}
      title={formatTitle(now, locale)}
      aria-label={t('nav.currentTime', { time: label })}
      className="shrink-0 font-mono tabular-nums text-sm font-semibold tracking-wider text-base-content px-2.5 py-1 rounded-lg border border-base-300 bg-base-100/70"
    >
      {label}
    </time>
  );
}
