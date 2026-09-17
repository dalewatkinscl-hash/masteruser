import { useEffect, useRef, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { canViewAllEmployeeProfiles } from '../utils/employeeProfile';
import { useLanguage } from '../context/LanguageContext';

const BADGE_POLL_MS = 45000;
const LAST_SEEN_KEY = 'cl_suggestion_latest_id';

async function readJsonResponse(res) {
  const contentType = res.headers.get('content-type') || '';
  if (!contentType.includes('application/json')) return null;
  try {
    return await res.json();
  } catch {
    return null;
  }
}

function maybeNotifyNewSuggestion({ latestId, latestTitle, onSuggestionsTab, t }) {
  if (!latestId || onSuggestionsTab) return;
  if (typeof window === 'undefined' || !('Notification' in window)) return;

  let previous = null;
  try {
    previous = window.localStorage.getItem(LAST_SEEN_KEY);
  } catch {
    previous = null;
  }

  // First load: remember current latest without notifying (avoid spam on login).
  if (!previous) {
    try {
      window.localStorage.setItem(LAST_SEEN_KEY, latestId);
    } catch {
      // ignore
    }
    return;
  }

  if (previous === latestId) return;

  try {
    window.localStorage.setItem(LAST_SEEN_KEY, latestId);
  } catch {
    // ignore
  }

  if (Notification.permission === 'granted') {
    try {
      const note = new Notification(t('notify.newSuggestion'), {
        body: latestTitle || t('notify.newSuggestionBody'),
        tag: `suggestion-${latestId}`,
      });
      note.onclick = () => {
        window.focus();
        note.close();
      };
    } catch {
      // ignore browser notification failures
    }
  }
}

/**
 * Top workspace tabs for the Employee Portal (profile + admin tools).
 * HR directory / People Cases live in the side-nav HR portal.
 */
export default function WorkspaceTabs({ activeProfileTab = null, onProfileTabChange = null }) {
  const { user } = useAuth();
  const { t } = useLanguage();
  const navigate = useNavigate();
  const location = useLocation();
  const [newSuggestionCount, setNewSuggestionCount] = useState(0);
  const [caseActionCount, setCaseActionCount] = useState(0);
  const notifiedRef = useRef(false);

  const isAdmin = user?.portalsAccess?.master_admin === 'admin';
  const canBrowseEmployees = canViewAllEmployeeProfiles(user);
  const canSeeSuggestionBadge = isAdmin || canBrowseEmployees;

  const path = location.pathname;
  const onPortalMatrix = path.includes('/dashboard/portal-access');
  const onFunAdmin = path.includes('/dashboard/fun-admin') || path.includes('/dashboard/nonograms');
  const onEmergencyPhone = path.includes('/dashboard/emergency-phone');
  const onHr = path.includes('/dashboard/hr');
  const onProfile = path.includes('/dashboard/profile')
    || (!onPortalMatrix && !onFunAdmin && !onEmergencyPhone && !onHr && path.includes('/dashboard'));
  const onSuggestionsTab = onProfile && (activeProfileTab || 'profile') === 'suggestions';

  useEffect(() => {
    if (!canSeeSuggestionBadge) {
      setNewSuggestionCount(0);
      return undefined;
    }

    let cancelled = false;

    const refreshBadge = async () => {
      try {
        const response = await fetch('/api/getSuggestionBadge', { credentials: 'include' });
        const payload = (await readJsonResponse(response)) || {};
        if (!response.ok || cancelled) return;
        if (!payload.canModerate) {
          setNewSuggestionCount(0);
          return;
        }
        setNewSuggestionCount(Number(payload.newCount) || 0);
        maybeNotifyNewSuggestion({
          latestId: payload.latestId,
          latestTitle: payload.latestTitle,
          onSuggestionsTab,
          t,
        });
      } catch {
        // ignore badge polling failures
      }
    };

    refreshBadge();
    const timer = window.setInterval(refreshBadge, BADGE_POLL_MS);
    const onChanged = () => { refreshBadge(); };
    window.addEventListener('cl-suggestions-changed', onChanged);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
      window.removeEventListener('cl-suggestions-changed', onChanged);
    };
  }, [canSeeSuggestionBadge, onSuggestionsTab, t]);

  useEffect(() => {
    if (!canSeeSuggestionBadge || notifiedRef.current) return;
    if (typeof window === 'undefined' || !('Notification' in window)) return;
    if (Notification.permission === 'default') {
      notifiedRef.current = true;
      Notification.requestPermission().catch(() => {});
    }
  }, [canSeeSuggestionBadge]);

  useEffect(() => {
    let cancelled = false;
    const refreshCaseBadge = async () => {
      try {
        const response = await fetch('/api/getEmployeeCaseActions', { credentials: 'include' });
        const payload = (await readJsonResponse(response)) || {};
        if (!cancelled && response.ok) {
          setCaseActionCount(Number(payload.badgeCount) || 0);
        }
      } catch {
        // ignore
      }
    };
    refreshCaseBadge();
    const timer = window.setInterval(refreshCaseBadge, BADGE_POLL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, []);

  const tabs = [
    { id: 'profile', label: t('tabs.profile'), kind: 'profile', profileTab: 'profile' },
    { id: 'cases-inbox', label: t('tabs.myCases'), kind: 'profile', profileTab: 'cases', showDot: caseActionCount > 0 },
    { id: 'fun', label: t('tabs.fun'), kind: 'profile', profileTab: 'fun' },
    { id: 'polls', label: t('tabs.polls'), kind: 'profile', profileTab: 'polls' },
    {
      id: 'suggestions',
      label: t('tabs.suggestions'),
      kind: 'profile',
      profileTab: 'suggestions',
      showDot: canSeeSuggestionBadge && newSuggestionCount > 0,
    },
    user?.canIssueKudos && { id: 'kudos', label: t('tabs.kudos'), kind: 'profile', profileTab: 'kudos' },
    {
      id: 'emergency-phone',
      label: t('tabs.emergencyPhone'),
      kind: 'route',
      to: '/dashboard/emergency-phone',
    },
    isAdmin && {
      id: 'portal-matrix',
      label: t('tabs.portalMatrix'),
      kind: 'route',
      to: '/dashboard/portal-access',
    },
  ].filter(Boolean);

  const isActive = (tab) => {
    if (tab.kind === 'route') {
      if (tab.id === 'portal-matrix') return onPortalMatrix;
      if (tab.id === 'emergency-phone') return onEmergencyPhone;
      return false;
    }
    // Fun admin lives under Fun — keep Fun highlighted while there.
    if (onFunAdmin) return tab.profileTab === 'fun';
    // Profile sub-tabs are only active on the profile page.
    if (!onProfile || onPortalMatrix || onEmergencyPhone || onHr) return false;
    return (activeProfileTab || 'profile') === tab.profileTab;
  };

  const onClick = (tab) => {
    if (tab.kind === 'route') {
      navigate(tab.to);
      return;
    }
    if (onProfile && onProfileTabChange) {
      onProfileTabChange(tab.profileTab);
      return;
    }
    navigate('/dashboard/profile', { state: { profileTab: tab.profileTab } });
  };

  return (
    <div className="px-4 sm:px-8 border-b border-cl-border bg-cl-elevated/40">
      <nav className="flex gap-1 overflow-x-auto scrollbar-thin" aria-label={t('tabs.aria')}>
        {tabs.map((tab) => {
          const active = isActive(tab);
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => onClick(tab)}
              className={`relative flex-shrink-0 px-4 py-3 text-sm font-medium transition-colors ${
                active ? 'text-cl-fg' : 'text-cl-muted hover:text-cl-fg'
              }`}
            >
              <span className="relative inline-flex items-center">
                {tab.label}
                {tab.showDot && (
                  <span
                    className="absolute -top-0.5 -right-2.5 h-2 w-2 rounded-full bg-rose-500 ring-2 ring-[var(--cl-bg-elevated)]"
                    aria-label={
                      newSuggestionCount === 1
                        ? t('tabs.newSuggestions', { count: newSuggestionCount })
                        : t('tabs.newSuggestionsPlural', { count: newSuggestionCount })
                    }
                  />
                )}
              </span>
              <span
                className={`absolute left-2 right-2 bottom-0 h-0.5 rounded-full transition-colors ${
                  active ? 'bg-indigo-500' : 'bg-transparent'
                }`}
              />
            </button>
          );
        })}
      </nav>
    </div>
  );
}
