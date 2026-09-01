import { useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { PORTAL_THEME_OPTIONS, useTheme } from '../context/ThemeContext';

const LABELS = Object.fromEntries(PORTAL_THEME_OPTIONS.map((t) => [t.key, t.label]));

async function persistThemePreference(theme) {
  const response = await fetch('/api/updateEmployeeProfile', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ themePreference: theme }),
  });
  if (!response.ok) {
    let message = 'Failed to save theme.';
    try {
      const payload = await response.json();
      if (payload?.error) message = payload.error;
    } catch {
      // ignore
    }
    throw new Error(message);
  }
}

export default function ThemeToggle({ showLabel = true, className = '' }) {
  const { theme, assignedTheme, isAssignedThemeLocked, setTheme, themes } = useTheme();
  const { user, setUser } = useAuth();
  const saveSeq = useRef(0);
  const label = LABELS[theme] || 'Theme';
  const options = themes || PORTAL_THEME_OPTIONS;
  const selectValue = options.some((option) => option.key === theme) ? theme : 'dark';

  const onThemeChange = (next) => {
    setTheme(next);
    if (!user?.uid || isAssignedThemeLocked) return;

    const seq = ++saveSeq.current;
    persistThemePreference(next)
      .then(() => {
        if (seq !== saveSeq.current) return;
        setUser((prev) => (prev ? { ...prev, themePreference: next } : prev));
      })
      .catch(() => {
        // Local choice still sticks via localStorage; server sync can retry next change.
      });
  };

  const selectClass = 'select select-bordered select-sm w-full font-medium';

  if (isAssignedThemeLocked) {
    return (
      <div
        className={`w-full space-y-2 ${className}`}
        title={`Theme set by HR (${LABELS[assignedTheme] || assignedTheme})`}
      >
        {showLabel ? <p className="text-sm font-medium text-base-content/70">Theme</p> : null}
        <select className={`${selectClass} select-disabled`} value={selectValue} disabled>
          {options.map((option) => (
            <option key={option.key} value={option.key}>
              {option.label}
            </option>
          ))}
        </select>
        <p className="text-[10px] text-base-content/60">
          {label}
          <span className="ml-1 opacity-70">(enforced)</span>
        </p>
      </div>
    );
  }

  return (
    <div className={`w-full space-y-2 ${className}`}>
      {showLabel ? (
        <label className="block text-sm font-medium text-base-content/70" htmlFor="portal-theme-select">
          Theme
        </label>
      ) : null}
      <select
        id="portal-theme-select"
        aria-label="Theme"
        className={selectClass}
        value={selectValue}
        onChange={(e) => onThemeChange(e.target.value)}
      >
        {options.map((option) => (
          <option key={option.key} value={option.key}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}
