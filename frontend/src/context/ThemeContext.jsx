import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

const STORAGE_KEY = 'cl_employee_portal_theme';
const ThemeContext = createContext(null);

/** Themes available in the selector (daisyUI + Country Lion custom). */
export const PORTAL_THEME_OPTIONS = [
  { key: 'dark', label: 'Dark', group: 'Core' },
  { key: 'light', label: 'Light', group: 'Core' },
  { key: 'corporate', label: 'Corporate', group: 'Core' },
  { key: 'business', label: 'Business', group: 'Core' },
  { key: 'nord', label: 'Nord', group: 'Core' },
  { key: 'night', label: 'Night', group: 'Core' },
  { key: 'cupcake', label: 'Cupcake', group: 'Playful' },
  { key: 'kawaii', label: 'Kawaii ✨', group: 'Playful' },
  { key: 'forest', label: 'Forest', group: 'Nature' },
  { key: 'autumn', label: 'Autumn', group: 'Nature' },
  { key: 'sunset', label: 'Sunset', group: 'Nature' },
  { key: 'aqua', label: 'Aqua', group: 'Nature' },
  { key: 'aurora', label: 'Aurora', group: 'Nature' },
];

const THEMES = new Set(PORTAL_THEME_OPTIONS.map((t) => t.key));

/** Older stored prefs → current daisyUI / portal theme keys. */
const THEME_ALIASES = {
  // historical aliases if any appear later
};

const LIGHT_THEMES = new Set(['light', 'corporate', 'cupcake', 'kawaii', 'aqua']);
const KAWAII_THEMES = new Set(['kawaii', 'cupcake']);

export function normalizePortalTheme(value) {
  const raw = String(value || '').trim().toLowerCase();
  const theme = THEME_ALIASES[raw] || raw;
  return THEMES.has(theme) ? theme : '';
}

function getInitialTheme() {
  if (typeof window === 'undefined') return 'dark';
  try {
    const stored = normalizePortalTheme(window.localStorage.getItem(STORAGE_KEY));
    if (stored) return stored;
  } catch {
    // ignore
  }
  return 'dark';
}

function applyTheme(theme) {
  if (typeof document === 'undefined') return;
  const next = normalizePortalTheme(theme) || 'dark';
  document.documentElement.setAttribute('data-theme', next);
  document.documentElement.style.colorScheme = LIGHT_THEMES.has(next) ? 'light' : 'dark';
}

export function ThemeProvider({ children }) {
  const [theme, setThemeState] = useState(getInitialTheme);
  const [assignedTheme, setAssignedThemeState] = useState('');
  const [themeEnforced, setThemeEnforcedState] = useState(false);

  useEffect(() => {
    applyTheme(theme);
    try {
      window.localStorage.setItem(STORAGE_KEY, theme);
    } catch {
      // ignore
    }
  }, [theme]);

  const setTheme = useCallback((next) => {
    const normalized = normalizePortalTheme(next) || 'dark';
    setThemeState(normalized);
  }, []);

  const setAssignedTheme = useCallback((nextTheme, enforce = false) => {
    const normalized = normalizePortalTheme(nextTheme);
    const locked = enforce === true;

    setAssignedThemeState(normalized);
    setThemeEnforcedState(locked);

    if (normalized) {
      setThemeState(normalized);
    } else if (locked) {
      setThemeState('dark');
    }
  }, []);

  const toggleTheme = useCallback(() => {
    setThemeState((prev) => {
      if (themeEnforced && assignedTheme) return assignedTheme;
      if (LIGHT_THEMES.has(prev)) return 'dark';
      return 'light';
    });
  }, [assignedTheme, themeEnforced]);

  const value = useMemo(
    () => ({
      theme,
      assignedTheme,
      themeEnforced,
      isLight: LIGHT_THEMES.has(theme),
      isDark: !LIGHT_THEMES.has(theme),
      isKawaii: KAWAII_THEMES.has(theme),
      isAssigned: Boolean(assignedTheme),
      isAssignedThemeLocked: Boolean(assignedTheme) && themeEnforced,
      setTheme,
      setAssignedTheme,
      toggleTheme,
      themes: PORTAL_THEME_OPTIONS,
    }),
    [theme, assignedTheme, themeEnforced, setTheme, setAssignedTheme, toggleTheme],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error('useTheme must be used inside ThemeProvider');
  }
  return ctx;
}
