import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLanguage } from '../context/LanguageContext';

async function readJsonResponse(res) {
  const contentType = res.headers.get('content-type') || '';
  if (!contentType.includes('application/json')) return null;
  try {
    return await res.json();
  } catch {
    return null;
  }
}

function bumpHrefFromActions(payload) {
  const prompt = payload?.bumpPrompts?.[0];
  if (!prompt) return { href: '/dashboard/bump-card', required: false };
  const params = new URLSearchParams();
  if (prompt.caseId) params.set('caseId', prompt.caseId);
  if (prompt.id) params.set('promptId', prompt.id);
  const query = params.toString();
  return {
    href: query ? `/dashboard/bump-card?${query}` : '/dashboard/bump-card',
    required: true,
  };
}

/** Large first-screen CTA for employees to open the bump card form. */
export default function SubmitBumpCardCta() {
  const { t } = useLanguage();
  const navigate = useNavigate();
  const [href, setHref] = useState('/dashboard/bump-card');
  const [required, setRequired] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const response = await fetch('/api/getEmployeeCaseActions', { credentials: 'include' });
        const payload = (await readJsonResponse(response)) || {};
        if (cancelled || !response.ok) return;
        const next = bumpHrefFromActions(payload);
        setHref(next.href);
        setRequired(next.required);
      } catch {
        // keep default link
      }
    })();
    return () => { cancelled = true; };
  }, []);

  return (
    <div
      className={`rounded-2xl border px-5 py-6 sm:px-8 sm:py-8 ${
        required
          ? 'border-amber-400/50 bg-amber-500/15'
          : 'border-indigo-500/40 bg-indigo-500/10'
      }`}
    >
      <div className="flex flex-col sm:flex-row sm:items-center gap-4 sm:gap-6">
        <div className="min-w-0 flex-1 space-y-1">
          <p
            className={`text-[10px] font-mono uppercase tracking-[0.2em] ${
              required ? 'text-amber-200' : 'text-indigo-300'
            }`}
          >
            {required ? t('profile.bumpCardRequired') : t('profile.bumpCardLabel')}
          </p>
          <p className={`text-sm sm:text-base ${required ? 'text-amber-50' : 'text-slate-200'}`}>
            {required ? t('profile.bumpCardRequiredHint') : t('profile.bumpCardHint')}
          </p>
        </div>
        <button
          type="button"
          onClick={() => navigate(href)}
          className={`w-full sm:w-auto shrink-0 rounded-xl px-8 py-4 text-base sm:text-lg font-semibold text-white shadow-lg transition-colors ${
            required
              ? 'bg-amber-500 hover:bg-amber-400 shadow-amber-900/40'
              : 'bg-indigo-600 hover:bg-indigo-500 shadow-indigo-900/40'
          }`}
        >
          {t('profile.submitBumpCard')}
        </button>
      </div>
    </div>
  );
}
