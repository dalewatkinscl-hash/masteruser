export const DEFAULT_LANGUAGE = 'en';
export const LANGUAGE_STORAGE_KEY = 'cl_employee_portal_language';

export const LANGUAGES = [
  {
    code: 'en',
    locale: 'en-GB',
    englishName: 'English',
    nativeName: 'English',
    country: 'GB',
  },
  {
    code: 'sq',
    locale: 'sq-AL',
    englishName: 'Albanian',
    nativeName: 'Shqip',
    country: 'AL',
  },
  {
    code: 'hu',
    locale: 'hu-HU',
    englishName: 'Hungarian',
    nativeName: 'Magyar',
    country: 'HU',
  },
  {
    code: 'pl',
    locale: 'pl-PL',
    englishName: 'Polish',
    nativeName: 'Polski',
    country: 'PL',
  },
  {
    code: 'ro',
    locale: 'ro-RO',
    englishName: 'Romanian',
    nativeName: 'Română',
    country: 'RO',
  },
];

export const LANGUAGE_CODES = new Set(LANGUAGES.map((language) => language.code));

export function normalizeLanguage(value) {
  const code = String(value || '').trim().toLowerCase();
  return LANGUAGE_CODES.has(code) ? code : DEFAULT_LANGUAGE;
}

export function getLanguage(code) {
  const normalized = normalizeLanguage(code);
  return LANGUAGES.find((language) => language.code === normalized) || LANGUAGES[0];
}
