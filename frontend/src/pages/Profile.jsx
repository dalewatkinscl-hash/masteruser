import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import EmployeeProfileCard from '../components/EmployeeProfileCard';
import EmployeeFunPanel from '../components/EmployeeFunPanel';
import SuggestionBoxPanel from '../components/SuggestionBoxPanel';
import KudosPanel from '../components/KudosPanel';
import PollsPanel from '../components/PollsPanel';
import ProfileWidgets from '../components/ProfileWidgets';
import WorkspaceTabs from '../components/WorkspaceTabs';
import EmployeeCaseActionsPanel from '../components/EmployeeCaseActionsPanel';
import { canManagePortalAccess } from '../utils/portalAccess';
import { useLanguage } from '../context/LanguageContext';

function KeyIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="8" cy="15" r="5" stroke="currentColor" strokeWidth="1.5" />
      <path d="m12.5 10.5 8 8M16 11l2 2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function ExternalLinkIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M15 3h6v6M10 14 21 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function CheckCircleIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="1.5" />
      <path d="m9 12 2 2 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

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

const PORTAL_META = {
  mentoring_app: { labelKey: 'portal.mentor', href: 'https://mentor.countrylion.co.uk' },
  assessment_app: { labelKey: 'portal.assessment', href: 'https://assessments.countrylion.co.uk' },
  routes_app: { labelKey: 'portal.routes', href: 'https://routes.countrylion.co.uk' },
  hr_app: { labelKey: 'portal.headcount', href: 'https://headcount.countrylion.co.uk' },
  tyre_app: { labelKey: 'portal.tyres', href: 'https://tyres.countrylion.co.uk' },
  cleaning_app: { labelKey: 'portal.cleaning', href: 'https://cleaning.countrylion.co.uk' },
  contracts_app: { labelKey: 'portal.contracts', href: 'https://contracts.countrylion.co.uk' },
  cpc_app: { labelKey: 'portal.cpc', href: 'https://cpc.countrylion.co.uk' },
  compliance_app: { labelKey: 'portal.compliance', href: 'https://compliance.countrylion.co.uk' },
  attendance_app: { labelKey: 'portal.attendance', href: 'https://attendance.countrylion.co.uk' },
  training_app: { labelKey: 'portal.training', href: 'https://training.countrylion.co.uk' },
  holidays_app: { labelKey: 'portal.holidays', href: 'https://holidays.countrylion.co.uk' },
  events_app: { labelKey: 'portal.events', href: 'https://events.countrylion.co.uk' },
  cases_app: { labelKey: 'portal.peopleCases', href: null },
  master_admin: { labelKey: 'portal.admin', href: null },
};

function formatRole(role) {
  if (!role) return '';
  return role.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

export default function Profile() {
  const { user } = useAuth();
  const { t } = useLanguage();
  const location = useLocation();
  const [activeTab, setActiveTab] = useState(() => location.state?.profileTab || 'profile');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordStatus, setPasswordStatus] = useState(null);
  const [passwordError, setPasswordError] = useState('');

  useEffect(() => {
    if (location.state?.profileTab) {
      setActiveTab(location.state.profileTab);
    }
  }, [location.state]);

  const handleChangePassword = async (e) => {
    e.preventDefault();
    setPasswordError('');

    if (newPassword.length < 6) {
      setPasswordStatus('error');
      setPasswordError(t('profile.passwordTooShort'));
      return;
    }

    if (newPassword !== confirmPassword) {
      setPasswordStatus('error');
      setPasswordError(t('profile.passwordMismatch'));
      return;
    }

    setPasswordStatus('saving');

    try {
      const response = await fetch('/api/changeMyPassword', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ newPassword }),
      });

      const data = (await readJsonResponse(response)) || {};

      if (!response.ok) {
        throw new Error(data.error || t('profile.passwordFailed'));
      }

      setPasswordStatus('saved');
      setNewPassword('');
      setConfirmPassword('');
    } catch (error) {
      setPasswordStatus('error');
      setPasswordError(error.message || t('profile.passwordFailed'));
    }
  };

  const portals = Object.entries(user?.portalsAccess ?? {}).filter(
    ([key, role]) => role && key in PORTAL_META,
  );

  return (
    <div className="space-y-0 w-full">
      <WorkspaceTabs activeProfileTab={activeTab} onProfileTabChange={setActiveTab} />

      {activeTab === 'fun' ? (
        <div className="px-4 sm:px-8 py-6">
          <div className="flex flex-col xl:flex-row gap-6 items-start">
            <div className="min-w-0 flex-1 w-full">
              <EmployeeFunPanel currentUserUid={user?.uid} isAdmin={canManagePortalAccess(user)} />
            </div>
            <aside className="w-full xl:w-[22rem] xl:sticky xl:top-4 flex-shrink-0">
              <div className="rounded-xl border border-base-300 bg-base-100/40 p-4">
                <p className="text-[10px] font-mono uppercase tracking-[0.18em] text-primary mb-3">{t('profile.polls')}</p>
                <PollsPanel compact />
              </div>
            </aside>
          </div>
        </div>
      ) : activeTab === 'cases' ? (
        <div className="px-4 sm:px-8 py-6">
          <EmployeeCaseActionsPanel />
        </div>
      ) : activeTab === 'polls' ? (
        <div className="px-4 sm:px-8 py-6">
          <PollsPanel />
        </div>
      ) : activeTab === 'suggestions' ? (
        <div className="px-4 sm:px-8 py-6">
          <SuggestionBoxPanel currentUserUid={user?.uid} />
        </div>
      ) : activeTab === 'kudos' ? (
        user?.canIssueKudos ? (
          <div className="px-4 sm:px-8 py-6">
            <KudosPanel currentUserUid={user?.uid} />
          </div>
        ) : (
          <div className="px-4 sm:px-8 py-6">
            <p className="text-sm text-slate-400">{t('profile.kudosManagersOnly')}</p>
          </div>
        )
      ) : (
        <div className="w-full pt-6 px-4 sm:px-8 pb-8">
          <div className="max-w-7xl mx-auto grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_320px] gap-6 items-start">
            <div className="space-y-6 min-w-0">
              {user?.uid && (
                <EmployeeProfileCard uid={user.uid} />
              )}

              {portals.length > 0 && (
                <div className="bg-[#0b1220] border border-[#1a2540] rounded-xl overflow-hidden">
                  <div className="px-6 py-6">
                    <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-widest mb-4">
                      {t('profile.yourAccess')}
                    </h2>
                    <div className="space-y-2">
                      {portals.map(([key, role]) => {
                        const meta = PORTAL_META[key] ?? { labelKey: null, href: null };
                        return (
                          <div
                            key={key}
                            className="flex items-center justify-between bg-[#060e1a] rounded-lg px-4 py-3"
                          >
                            <div>
                              <p className="text-sm text-white font-medium">{meta.labelKey ? t(meta.labelKey) : key}</p>
                              <p className="text-xs text-indigo-400 mt-0.5">{formatRole(role)}</p>
                            </div>
                            {meta.href && (
                              <a
                                href={meta.href}
                                className="flex items-center gap-1.5 text-xs text-indigo-300 hover:text-indigo-100 transition-colors"
                              >
                                {t('profile.open')}
                                <ExternalLinkIcon className="w-3.5 h-3.5" />
                              </a>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}

              <div className="bg-[#0b1220] border border-[#1a2540] rounded-xl overflow-hidden">
                <div className="px-6 py-6">
                  <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-widest mb-1">
                    {t('profile.password')}
                  </h2>
                  <p className="text-xs text-slate-500 mb-4">
                    {t('profile.passwordHint')}
                  </p>

                  <form onSubmit={handleChangePassword} className="space-y-3">
                    <div>
                      <label htmlFor="newPassword" className="block text-xs text-slate-500 mb-1">{t('profile.newPassword')}</label>
                      <input
                        id="newPassword"
                        type="password"
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        className="w-full bg-[#060e1a] border border-[#1a2540] text-slate-100 text-sm rounded-lg px-4 py-2.5 focus:outline-none focus:border-indigo-500/60 focus:ring-1 focus:ring-indigo-500/40 transition-all"
                        required
                        minLength={6}
                      />
                    </div>
                    <div>
                      <label htmlFor="confirmPassword" className="block text-xs text-slate-500 mb-1">{t('profile.confirmPassword')}</label>
                      <input
                        id="confirmPassword"
                        type="password"
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        className="w-full bg-[#060e1a] border border-[#1a2540] text-slate-100 text-sm rounded-lg px-4 py-2.5 focus:outline-none focus:border-indigo-500/60 focus:ring-1 focus:ring-indigo-500/40 transition-all"
                        required
                        minLength={6}
                      />
                    </div>

                    <button
                      type="submit"
                      disabled={passwordStatus === 'saving'}
                      className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed text-white transition-colors"
                    >
                      <KeyIcon className="w-4 h-4" />
                      {passwordStatus === 'saving' ? t('profile.saving') : t('profile.changePassword')}
                    </button>

                    {passwordStatus === 'saved' && (
                      <div className="flex items-center gap-2 text-green-400 text-sm">
                        <CheckCircleIcon className="w-4 h-4" />
                        {t('profile.passwordUpdated')}
                      </div>
                    )}

                    {passwordStatus === 'error' && (
                      <p className="mt-1 text-xs text-red-400">{passwordError}</p>
                    )}
                  </form>
                </div>
              </div>
            </div>

            <div>
              <ProfileWidgets currentUserUid={user?.uid} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
