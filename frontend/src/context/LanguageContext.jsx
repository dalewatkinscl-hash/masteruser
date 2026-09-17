import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import {
  DEFAULT_LANGUAGE,
  LANGUAGE_STORAGE_KEY,
  LANGUAGES,
  getLanguage,
  normalizeLanguage,
} from '../i18n/languages';
import { TRANSLATIONS } from '../i18n/translations';

const LanguageContext = createContext(null);

function interpolate(template, vars = {}) {
  return String(template).replace(/\{(\w+)\}/g, (_, key) => (
    vars[key] == null ? `{${key}}` : String(vars[key])
  ));
}

function getInitialLanguage() {
  if (typeof window === 'undefined') return DEFAULT_LANGUAGE;
  try {
    return normalizeLanguage(window.localStorage.getItem(LANGUAGE_STORAGE_KEY));
  } catch {
    return DEFAULT_LANGUAGE;
  }
}

export function LanguageProvider({ children }) {
  const [language, setLanguageState] = useState(getInitialLanguage);

  useEffect(() => {
    const next = normalizeLanguage(language);
    if (typeof document !== 'undefined') {
      document.documentElement.lang = next;
    }
    try {
      window.localStorage.setItem(LANGUAGE_STORAGE_KEY, next);
    } catch {
      // ignore
    }
  }, [language]);

  const setLanguage = useCallback((next) => {
    setLanguageState(normalizeLanguage(next));
  }, []);

  const t = useCallback((key, vars) => {
    const table = TRANSLATIONS[language] || TRANSLATIONS.en;
    const template = table[key] ?? TRANSLATIONS.en[key] ?? key;
    return interpolate(template, vars);
  }, [language]);

  const value = useMemo(
    () => ({
      language,
      locale: getLanguage(language).locale,
      languages: LANGUAGES,
      current: getLanguage(language),
      setLanguage,
      t,
    }),
    [language, setLanguage, t],
  );

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLanguage() {
  const ctx = useContext(LanguageContext);
  if (!ctx) {
    throw new Error('useLanguage must be used inside LanguageProvider');
  }
  return ctx;
}
