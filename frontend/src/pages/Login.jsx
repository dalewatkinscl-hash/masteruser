import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { signInWithEmailAndPassword, signOut } from 'firebase/auth';
import { auth } from '../firebase';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import AmbientBackground from '../components/AmbientBackground';
import ThemeToggle from '../components/ThemeToggle';
import LanguageSwitcher from '../components/LanguageSwitcher';

// ─── Icon helpers ────────────────────────────────────────────────────────────

function ShieldIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path
        d="M12 2L3 7v5c0 5.25 3.75 10.15 9 11.35C17.25 22.15 21 17.25 21 12V7l-9-5Z"
        fill="currentColor"
        fillOpacity="0.2"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="m9 12 2 2 4-4"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function EnvelopeIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="2" y="4" width="20" height="16" rx="2" stroke="currentColor" strokeWidth="1.5" />
      <path d="m2 7 10 7 10-7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function LockIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="3" y="11" width="18" height="11" rx="2" stroke="currentColor" strokeWidth="1.5" />
      <path
        d="M7 11V7a5 5 0 0 1 10 0v4"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <circle cx="12" cy="16" r="1.25" fill="currentColor" />
    </svg>
  );
}

function EyeOpenIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path
        d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8S1 12 1 12Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}

function EyeClosedIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path
        d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <line x1="1" y1="1" x2="23" y2="23" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function AlertIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path
        d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <line x1="12" y1="9" x2="12" y2="13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <line x1="12" y1="17" x2="12.01" y2="17" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function Spinner({ className }) {
  return (
    <svg className={className} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
      />
    </svg>
  );
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function mapFirebaseError(code, t) {
  switch (code) {
    case 'auth/invalid-credential':
    case 'auth/wrong-password':
    case 'auth/user-not-found':
    case 'auth/invalid-email':
      return t('login.errorInvalid');
    case 'auth/user-disabled':
      return t('login.errorDisabled');
    case 'auth/too-many-requests':
      return t('login.errorTooMany');
    default:
      return null;
  }
}

// ─── Component ───────────────────────────────────────────────────────────────

// Map portal keys to their destination URLs.
const PORTAL_REDIRECT_MAP = {
  master_admin: null, // stays on this app → navigate('/dashboard')
  mentoring_app: 'https://mentor.countrylion.co.uk',
  assessment_app: 'https://assessments.countrylion.co.uk',
  routes_app: 'https://routes.countrylion.co.uk',
  hr_app: 'https://headcount.countrylion.co.uk',
  cpc_app: 'https://cpc.countrylion.co.uk',
  tyre_app: 'https://tyres.countrylion.co.uk',
  contracts_app: 'https://contracts.countrylion.co.uk',
  cleaning_app: 'https://cleaning.countrylion.co.uk',
  compliance_app: 'https://compliance.countrylion.co.uk',
  attendance_app: 'https://attendance.countrylion.co.uk',
  training_app: 'https://training.countrylion.co.uk',
  holidays_app: 'https://holidays.countrylion.co.uk',
  events_app: 'https://events.countrylion.co.uk',
};

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const navigate = useNavigate();
  const { user, loading, setUser } = useAuth();
  const { t } = useLanguage();

  // Read the optional ?app=<portalKey> query param so we know where to send the user.
  const appParam = new URLSearchParams(window.location.search).get('app');

  // Redirect if already authenticated as an admin.
  useEffect(() => {
    if (!loading && user) {
      const portalsAccess = user?.portalsAccess ?? {};
      if (appParam && portalsAccess[appParam]) {
        const target = PORTAL_REDIRECT_MAP[appParam];
        if (target) {
          window.location.href = target;
          return;
        }
      }
      navigate('/dashboard', { replace: true });
    }
  }, [user, loading, navigate, appParam]);
async function readJsonResponse(res) {
  const contentType = res.headers.get('content-type') || '';
  if (!contentType.includes('application/json')) {
    return null;
  }

  try {
    return await res.json();
  } catch {
    return null;
  }
}

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      // 1. Sign in temporarily to obtain a short-lived ID token.
      const credential = await signInWithEmailAndPassword(auth, email, password);
      const idToken = await credential.user.getIdToken();

      // 2. Exchange the ID token for a server-side session cookie valid for all Country Lion apps.
      const cookieRes = await fetch('/api/loginPortalUser', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken }),
      });

      const cookieData = (await readJsonResponse(cookieRes)) || {};

      if (!cookieRes.ok) {
        throw new Error(cookieData.error ?? 'Session creation failed.');
      }

      // 3. Immediately clear local Firebase state — the cookie is now the only auth mechanism.
      await signOut(auth);

      // 4. Decide where to send the user based on their portalsAccess.
      const portalsAccess = cookieData.user?.portalsAccess ?? {};

      // If a specific app was requested via ?app=, try to redirect there.
      if (appParam && portalsAccess[appParam]) {
        const target = PORTAL_REDIRECT_MAP[appParam];
        if (target) {
          window.location.href = target;
          return;
        }
      }

      // Otherwise: admin users go to the dashboard.
      if (portalsAccess.master_admin === 'admin') {
        const sessionRes = await fetch('/api/verifySession', { credentials: 'include' });
        const sessionData = (await readJsonResponse(sessionRes)) || {};
        if (sessionData.user) setUser(sessionData.user);
        navigate('/dashboard', { replace: true });
        return;
      }

      // Non-admin: land on the dashboard (profile view + portal links in sidebar).
      const sessionRes2 = await fetch('/api/verifyUserSession', { credentials: 'include' });
      const sessionData2 = (await readJsonResponse(sessionRes2)) || {};
      if (sessionData2.user) setUser(sessionData2.user);
      navigate('/dashboard', { replace: true });
    } catch (err) {
      // Ensure local Firebase state is always cleared on error.
      await signOut(auth).catch(() => {});

      const mapped = mapFirebaseError(err.code, t);
      setError(mapped ?? err.message ?? t('login.errorUnexpected'));
    } finally {
      setIsLoading(false);
    }
  };

  if (loading) return null;

  return (
    <div className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden bg-cl-base">
      <AmbientBackground />
      <div className="absolute top-4 right-4 z-20 flex items-start gap-3">
        <div className="card bg-base-100/80 shadow-md border border-base-300 p-2 backdrop-blur-md">
          <LanguageSwitcher />
        </div>
        <ThemeToggle showLabel className="!w-auto card bg-base-100/80 shadow-md border border-base-300 p-3 backdrop-blur-md" />
      </div>

      {/* Card wrapper with ambient glow */}
      <div className="relative z-10 w-full max-w-[440px] animate-fade-in">
        <div className="card bg-base-100 shadow-xl border border-base-300 overflow-hidden">
          <div className="h-px w-full bg-gradient-to-r from-transparent via-primary/70 to-transparent" />

          <div className="card-body px-8 py-8">
            {/* ── Brand header ── */}
            <div className="flex items-center gap-4 mb-7">
              <div className="flex-shrink-0 w-[52px] h-[52px] rounded-xl bg-cl-accent flex items-center justify-center shadow-cl-accent">
                <ShieldIcon className="w-6 h-6 text-white" />
              </div>
              <div>
                <h1 className="text-lg font-semibold text-cl-fg tracking-tight leading-none">
                  Country Lion
                </h1>
                <p className="mt-1 text-[10px] font-mono font-medium tracking-[0.18em] uppercase text-cl-accent">
                  {t('login.employeePortal')}
                </p>
              </div>
            </div>

            <p className="text-[13px] text-cl-muted mb-7 leading-relaxed">
              {t('login.intro')}
            </p>

            {/* ── Error banner ── */}
            {error && (
              <div role="alert" className="mb-5 alert alert-error text-sm">
                <AlertIcon className="w-[18px] h-[18px] flex-shrink-0" />
                <span>{error}</span>
              </div>
            )}

            {/* ── Form ── */}
            <form onSubmit={handleSubmit} noValidate className="space-y-4">
              {/* Email */}
              <div>
                <label
                  htmlFor="email"
                  className="block text-[11px] font-mono font-medium uppercase tracking-widest text-cl-muted mb-1.5"
                >
                  {t('login.email')}
                </label>
                <div className="relative">
                  <div className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-cl-muted">
                    <EnvelopeIcon className="w-[15px] h-[15px]" />
                  </div>
                  <input
                    id="email"
                    type="email"
                    autoComplete="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@countrylion.co.uk"
                    className="cl-input pl-10"
                  />
                </div>
              </div>

              {/* Password */}
              <div>
                <label
                  htmlFor="password"
                  className="block text-[11px] font-mono font-medium uppercase tracking-widest text-cl-muted mb-1.5"
                >
                  {t('login.password')}
                </label>
                <div className="relative">
                  <div className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-cl-muted">
                    <LockIcon className="w-[15px] h-[15px]" />
                  </div>
                  <input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="current-password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••••••"
                    className="cl-input pl-10 pr-12"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    className="absolute right-3.5 top-1/2 -translate-y-1/2 text-cl-muted hover:text-cl-fg transition-colors p-0.5 rounded"
                    aria-label={showPassword ? t('login.hidePassword') : t('login.showPassword')}
                  >
                    {showPassword ? (
                      <EyeClosedIcon className="w-[15px] h-[15px]" />
                    ) : (
                      <EyeOpenIcon className="w-[15px] h-[15px]" />
                    )}
                  </button>
                </div>
              </div>

              {/* Submit */}
              <div className="pt-1">
                <button
                  type="submit"
                  disabled={isLoading}
                  className="btn btn-primary w-full"
                >
                  {isLoading ? (
                    <>
                      <span className="loading loading-spinner loading-sm" />
                      <span>{t('login.authenticating')}</span>
                    </>
                  ) : (
                    t('login.signIn')
                  )}
                </button>
              </div>
            </form>

            {/* ── Footer ── */}
            <div className="mt-8 pt-6 border-t border-cl-border flex items-center justify-center gap-1.5">
              <LockIcon className="w-3 h-3 text-cl-muted/40" />
              <p className="text-[11px] text-cl-muted/50 select-none">
                {t('login.secure')}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
