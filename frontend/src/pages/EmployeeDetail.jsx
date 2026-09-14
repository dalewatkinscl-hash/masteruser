import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import EmployeeProfileCard from '../components/EmployeeProfileCard';
import EmployeeDisciplinaryPanel from '../components/EmployeeDisciplinaryPanel';
import EmployeeSharePointDocuments from '../components/EmployeeSharePointDocuments';
import EmployeeFunPanel from '../components/EmployeeFunPanel';
import SuggestionBoxPanel from '../components/SuggestionBoxPanel';
import PollsPanel from '../components/PollsPanel';
import MergeEmployeeCard from '../components/MergeEmployeeCard';
import YearsOfServiceBadge from '../components/YearsOfServiceBadge';
import PortalAccessFields from '../components/PortalAccessFields';
import { canViewAllEmployeeProfiles, readJsonResponse } from '../utils/employeeProfile';
import { SHOW_CASES_PORTAL, SHOW_HR_RECORDS } from '../utils/featureFlags';
import { canManagePeopleCases } from '../utils/peopleCasesAccess';
import {
  buildPortalMappings,
  buildPortalsAccess,
  canManagePortalAccess,
  portalAccessFromUser,
  toCompanyEmail,
} from '../utils/portalAccess';

const DEFAULT_TEMP_PASSWORD = 'socket';

const OVERVIEW_SECTIONS = ['summary', 'communications', 'employment', 'address', 'nextOfKin'];
const PERFORMANCE_SECTIONS = ['hrRecords'];

const TAB_IDS = {
  overview: 'overview',
  performance: 'performance',
  cases: 'cases',
  documents: 'documents',
  fun: 'fun',
  polls: 'polls',
  suggestions: 'suggestions',
  access: 'access',
  admin: 'admin',
};

function EnablePortalLoginCard({
  profile,
  accountForm,
  onAccountChange,
  onPortalRoleChange,
  onEnable,
  saving,
}) {
  return (
    <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-5 space-y-4">
      <div>
        <h3 className="text-sm font-semibold text-amber-100">No portal login yet</h3>
        <p className="text-sm text-amber-200/80 mt-1">
          This employee has HR data only. Create a portal login to let them sign in and assign portal access.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-[11px] font-medium uppercase tracking-wider text-amber-200/70 mb-1">Work email</label>
          <input
            type="email"
            value={profile?.email || ''}
            disabled
            className="w-full bg-[#060e1a] border border-amber-500/20 text-slate-100 text-sm rounded-lg px-3 py-2 opacity-70"
          />
        </div>
        <div>
          <label className="block text-[11px] font-medium uppercase tracking-wider text-amber-200/70 mb-1">Temporary password</label>
          <input
            name="portalPassword"
            type="text"
            value={accountForm.portalPassword}
            onChange={onAccountChange}
            className="w-full bg-[#060e1a] border border-amber-500/20 text-slate-100 text-sm rounded-lg px-3 py-2"
          />
        </div>
      </div>

      <div className="bg-[#0b1220] border border-[#1a2540] rounded-xl overflow-hidden">
        <div className="px-5 py-3 border-b border-[#1a2540]">
          <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-widest">Initial portal access</h4>
        </div>
        <div className="px-5 py-4">
          <PortalAccessFields
            formData={accountForm}
            onChange={onAccountChange}
            onPortalRoleChange={onPortalRoleChange}
            readOnly={false}
          />
        </div>
      </div>

      <div className="flex justify-end">
        <button
          type="button"
          onClick={onEnable}
          disabled={saving || !profile?.email}
          className="px-5 py-2.5 rounded-lg text-sm font-medium bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-[#1a1200] font-semibold"
        >
          {saving ? 'Creating login…' : 'Create portal login'}
        </button>
      </div>
    </div>
  );
}

function ChevronLeftIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M15 6l-6 6 6 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function Spinner({ className }) {
  return (
    <svg className={className} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  );
}

function EmployeeTabNav({ tabs, activeTab, onChange }) {
  return (
    <div className="px-4 sm:px-8 border-b border-[#1a2540] bg-[#060e1a]/40">
      <nav
        className="flex gap-1 overflow-x-auto scrollbar-thin"
        aria-label="Employee sections"
      >
        {tabs.map((tab) => {
          const isActive = tab.id === activeTab;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => onChange(tab.id)}
              className={`relative flex-shrink-0 px-4 py-3 text-sm font-medium transition-colors ${
                isActive
                  ? 'text-white'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <span className="inline-flex items-center gap-2">
                {tab.label}
                {typeof tab.badge === 'number' && tab.badge > 0 && (
                  <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-semibold ${
                    isActive
                      ? 'bg-indigo-500/30 text-indigo-200'
                      : 'bg-[#1a2540] text-slate-400'
                  }`}
                  >
                    {tab.badge}
                  </span>
                )}
              </span>
              <span
                className={`absolute left-2 right-2 bottom-0 h-0.5 rounded-full transition-colors ${
                  isActive ? 'bg-indigo-500' : 'bg-transparent'
                }`}
              />
            </button>
          );
        })}
      </nav>
    </div>
  );
}

export default function EmployeeDetail() {
  const { uid } = useParams();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { user, refreshSession } = useAuth();
  const isNew = uid === 'new';
  const isAdmin = canManagePortalAccess(user);

  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [profileMeta, setProfileMeta] = useState(null);
  const [allEmployees, setAllEmployees] = useState([]);
  const [mergeOpen, setMergeOpen] = useState(false);
  const [resetPassword, setResetPassword] = useState(DEFAULT_TEMP_PASSWORD);
  const [resettingPassword, setResettingPassword] = useState(false);
  const [resetPasswordResult, setResetPasswordResult] = useState('');
  const [accountForm, setAccountForm] = useState({
    fullName: '',
    email: '',
    businessCommsEmail: 'work',
    isActive: true,
    portalsAccess: buildPortalsAccess(),
    mentorProfileId: '',
    assessmentProfileId: '',
    tyreProfileId: '',
    complianceProfileId: '',
    cpcQualifiesAsDriver: false,
    portalPassword: DEFAULT_TEMP_PASSWORD,
  });

  const isHrOnly = profileMeta?.hasPortalAccount === false;
  const canViewPortal = isAdmin || canViewAllEmployeeProfiles(user);
  const canEditPortal = isAdmin && (isNew || !isHrOnly);
  const portalReadOnly = !canEditPortal;
  const portalCount = Object.values(accountForm.portalsAccess || {}).filter(Boolean).length;
  const canStartCases = SHOW_CASES_PORTAL && canManagePeopleCases(user);

  const tabs = useMemo(() => {
    const items = [
      { id: TAB_IDS.overview, label: 'Overview' },
    ];
    if (SHOW_HR_RECORDS) {
      items.push({ id: TAB_IDS.performance, label: 'Performance' });
    }
    if (canStartCases) {
      items.push({ id: TAB_IDS.cases, label: 'Cases' });
    }
    items.push(
      { id: TAB_IDS.documents, label: 'Documents' },
      { id: TAB_IDS.fun, label: 'Fun' },
      { id: TAB_IDS.polls, label: 'Polls' },
      { id: TAB_IDS.suggestions, label: 'Suggestions' },
    );
    if (canViewPortal) {
      items.push({
        id: TAB_IDS.access,
        label: 'Portal & training',
        badge: portalCount || undefined,
      });
    }
    if (isAdmin) {
      items.push({ id: TAB_IDS.admin, label: 'Admin' });
    }
    return items;
  }, [canStartCases, canViewPortal, isAdmin, portalCount]);

  const startCaseFromProfile = () => {
    const params = new URLSearchParams({
      employeeUid: uid,
      processFamily: 'disciplinary',
    });
    if (profileMeta?.fullName) params.set('employeeName', profileMeta.fullName);
    navigate(`/dashboard/hr/cases/new?${params.toString()}`);
  };

  const requestedTab = searchParams.get('tab') || TAB_IDS.overview;
  const activeTab = tabs.some((tab) => tab.id === requestedTab)
    ? requestedTab
    : TAB_IDS.overview;

  const setActiveTab = (tabId) => {
    const next = new URLSearchParams(searchParams);
    if (tabId === TAB_IDS.overview) next.delete('tab');
    else next.set('tab', tabId);
    setSearchParams(next, { replace: true });
  };

  useEffect(() => {
    if (isNew) {
      if (!isAdmin) navigate('/dashboard/hr/employees', { replace: true });
      setLoading(false);
      return;
    }

    const load = async () => {
      try {
        setLoading(true);
        setError('');
        const response = await fetch(`/api/getEmployeeProfile/${uid}`, { credentials: 'include' });
        const data = (await readJsonResponse(response)) || {};
        if (!response.ok) throw new Error(data.error || 'Failed to load employee.');

        setProfileMeta(data.profile);
        setAccountForm(portalAccessFromUser(data.profile));
      } catch (err) {
        setError(err.message || 'Failed to load employee.');
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [uid, isNew, isAdmin, navigate]);

  useEffect(() => {
    if (isNew || !isAdmin) return;

    const loadEmployees = async () => {
      try {
        const response = await fetch('/api/getEmployeeProfiles', { credentials: 'include' });
        const data = (await readJsonResponse(response)) || {};
        if (response.ok) {
          setAllEmployees(data.employees || []);
        }
      } catch {
        // Non-blocking for merge drawer.
      }
    };

    loadEmployees();
  }, [isNew, isAdmin]);

  const handleAccountChange = (e) => {
    const { name, value, type, checked } = e.target;
    if (type === 'checkbox') {
      setAccountForm((prev) => ({ ...prev, [name]: checked }));
    } else {
      setAccountForm((prev) => ({ ...prev, [name]: value }));
    }
  };

  const handlePortalRoleChange = (portal, value) => {
    setAccountForm((prev) => {
      const nextPortalsAccess = { ...prev.portalsAccess, [portal]: value };
      let nextCpcQualifies = prev.cpcQualifiesAsDriver;
      if (portal === 'cpc_app') {
        if (value === 'driver') nextCpcQualifies = true;
        else if (!value) nextCpcQualifies = false;
      }
      return {
        ...prev,
        portalsAccess: nextPortalsAccess,
        cpcQualifiesAsDriver: nextCpcQualifies,
      };
    });
  };

  const savePortalAccess = async (targetUid) => {
    const portalMappings = buildPortalMappings(accountForm);
    const response = await fetch('/api/adminUpdateUser', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        uid: targetUid,
        fullName: accountForm.fullName,
        // Do not send businessCommsEmail here — it lives on the Overview profile
        // form and a stale default of "work" was overwriting personal preferences.
        isActive: accountForm.isActive,
        portalsAccess: accountForm.portalsAccess,
        portalMappings,
      }),
    });
    const data = (await readJsonResponse(response)) || {};
    if (!response.ok) throw new Error(data.error || 'Failed to save portal access.');
  };

  const handleCreate = async () => {
    setSaving(true);
    setError('');
    setSuccess('');

    try {
      const portalMappings = buildPortalMappings(accountForm);
      const response = await fetch('/api/adminCreateUser', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: toCompanyEmail(accountForm.fullName),
          password: DEFAULT_TEMP_PASSWORD,
          fullName: accountForm.fullName,
          businessCommsEmail: accountForm.businessCommsEmail,
          isActive: accountForm.isActive,
          portalsAccess: accountForm.portalsAccess,
          portalMappings,
        }),
      });
      const data = (await readJsonResponse(response)) || {};
      if (!response.ok) throw new Error(data.error || 'Failed to create employee.');

      setSuccess('Employee created successfully.');
      await refreshSession();
      setTimeout(() => navigate('/dashboard/hr/employees'), 1200);
    } catch (err) {
      setError(err.message || 'Failed to create employee.');
    } finally {
      setSaving(false);
    }
  };

  const handleEnablePortalLogin = async () => {
    setSaving(true);
    setError('');
    setSuccess('');

    try {
      const portalMappings = buildPortalMappings(accountForm);
      const response = await fetch('/api/adminEnablePortalLogin', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          uid,
          password: accountForm.portalPassword || DEFAULT_TEMP_PASSWORD,
          isActive: accountForm.isActive,
          portalsAccess: accountForm.portalsAccess,
          portalMappings,
        }),
      });
      const data = (await readJsonResponse(response)) || {};
      if (!response.ok) throw new Error(data.error || 'Failed to create portal login.');

      setSuccess('Portal login created successfully.');
      await refreshSession();
      setTimeout(() => {
        navigate(`/dashboard/hr/employees/${data.uid}?tab=access`, { replace: true });
      }, 800);
    } catch (err) {
      setError(err.message || 'Failed to create portal login.');
    } finally {
      setSaving(false);
    }
  };

  const handleResetPassword = async () => {
    if (isHrOnly) {
      setError('This employee does not have a portal login yet. Enable portal login first.');
      return;
    }

    const confirmed = window.confirm(
      `Reset the portal password for ${profileMeta?.fullName || profileMeta?.email || 'this employee'}?`,
    );
    if (!confirmed) return;

    setResettingPassword(true);
    setError('');
    setSuccess('');
    setResetPasswordResult('');

    try {
      const response = await fetch('/api/adminResetPassword', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          uid,
          password: resetPassword.trim() || undefined,
        }),
      });
      const data = (await readJsonResponse(response)) || {};
      if (!response.ok) throw new Error(data.error || 'Failed to reset password.');

      const temporaryPassword = data.temporaryPassword || resetPassword.trim() || DEFAULT_TEMP_PASSWORD;
      setResetPassword(temporaryPassword);
      setResetPasswordResult(temporaryPassword);
      setSuccess(
        `Password reset for ${data.email || profileMeta?.email || 'employee'}. Copy the temporary password below and share it securely.`,
      );
    } catch (err) {
      setError(err.message || 'Failed to reset password.');
    } finally {
      setResettingPassword(false);
    }
  };

  const handleSavePortal = async () => {
    setSaving(true);
    setError('');
    setSuccess('');

    try {
      await savePortalAccess(uid);
      setSuccess('Portal access saved.');
      await refreshSession();
    } catch (err) {
      setError(err.message || 'Failed to save portal access.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Spinner className="animate-spin h-8 w-8 text-indigo-500" />
      </div>
    );
  }

  const profileSections = activeTab === TAB_IDS.performance
    ? PERFORMANCE_SECTIONS
    : OVERVIEW_SECTIONS;

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="flex items-center justify-between gap-4 px-4 sm:px-8 py-4 border-b border-[#1a2540]">
        <div className="flex items-center gap-4 min-w-0">
          <button
            type="button"
            onClick={() => navigate('/dashboard/hr/employees')}
            className="p-1.5 hover:bg-[#1a2540] rounded-lg transition-colors text-slate-400 hover:text-slate-200 flex-shrink-0"
            aria-label="Back"
          >
            <ChevronLeftIcon className="w-5 h-5" />
          </button>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-xl font-bold text-white truncate">
                {isNew ? 'New employee' : profileMeta?.fullName || 'Employee'}
              </h1>
              {!isNew && (
                <YearsOfServiceBadge startDate={profileMeta?.employeeProfile?.startDate} />
              )}
            </div>
            {!isNew && (
              <p className="text-sm text-slate-400 truncate mt-1">
                {profileMeta?.employeeProfile?.jobRole || '—'}
                {profileMeta?.employeeProfile?.department ? ` · ${profileMeta.employeeProfile.department}` : ''}
              </p>
            )}
          </div>
        </div>
        {!isNew && canStartCases && (
          <button
            type="button"
            onClick={startCaseFromProfile}
            className="px-4 py-2 rounded-lg text-sm font-medium bg-indigo-600 hover:bg-indigo-500 text-white shrink-0"
          >
            Start case
          </button>
        )}
      </div>

      {!isNew && (
        <EmployeeTabNav
          tabs={tabs}
          activeTab={activeTab}
          onChange={setActiveTab}
        />
      )}

      <div className="flex-1 overflow-auto min-h-0">
        {(error || success) && (
          <div className="px-4 sm:px-8 pt-4 space-y-2">
            {error && (
              <div className="bg-red-500/10 border border-red-500/25 rounded-lg p-3">
                <p className="text-red-300 text-sm">{error}</p>
              </div>
            )}
            {success && (
              <div className="bg-emerald-500/10 border border-emerald-500/25 rounded-lg p-3">
                <p className="text-emerald-300 text-sm">{success}</p>
              </div>
            )}
          </div>
        )}

        {isNew ? (
          <div className="w-full px-4 sm:px-8 py-6 space-y-4">
            <div className="bg-[#0b1220] border border-[#1a2540] rounded-xl p-5 space-y-4">
              <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-widest">New employee account</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                <div>
                  <label className="block text-[11px] font-medium uppercase tracking-wider text-slate-500 mb-1">Full name</label>
                  <input
                    name="fullName"
                    type="text"
                    required
                    value={accountForm.fullName}
                    onChange={handleAccountChange}
                    className="w-full bg-[#060e1a] border border-[#1a2540] text-slate-100 text-sm rounded-lg px-3 py-2"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-medium uppercase tracking-wider text-slate-500 mb-1">Business communications</label>
                  <p className="text-sm text-slate-300">Work email by default. Personal preference can be set after the employee profile is created.</p>
                </div>
                <div className="flex items-end">
                  <label className="flex items-center gap-2 cursor-pointer pb-2">
                    <input
                      type="checkbox"
                      name="isActive"
                      checked={accountForm.isActive}
                      onChange={handleAccountChange}
                      className="w-4 h-4 rounded border-[#1a2540] bg-[#060e1a] text-indigo-500"
                    />
                    <span className="text-sm text-slate-300">Active</span>
                  </label>
                </div>
              </div>
              <p className="text-xs text-slate-500">
                Work email: {toCompanyEmail(accountForm.fullName) || '—'} · Default password: <span className="font-mono">socket</span>
              </p>
            </div>

            <div className="bg-[#0b1220] border border-[#1a2540] rounded-xl overflow-hidden">
              <div className="px-5 py-3 border-b border-[#1a2540] bg-[#060e1a]/50">
                <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-widest">Portal access</h3>
              </div>
              <div className="px-5 py-4">
                <PortalAccessFields
                  formData={accountForm}
                  onChange={handleAccountChange}
                  onPortalRoleChange={handlePortalRoleChange}
                  readOnly={false}
                />
                <div className="flex justify-end mt-6 pt-4 border-t border-[#1a2540]">
                  <button
                    type="button"
                    onClick={handleCreate}
                    disabled={saving}
                    className="px-5 py-2.5 rounded-lg text-sm font-medium bg-gradient-to-r from-indigo-500 to-violet-600 text-white disabled:opacity-50"
                  >
                    {saving ? 'Creating…' : 'Create employee'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="px-4 sm:px-8 py-6 space-y-4">
            {/* Keep profile card mounted across overview/performance so edits persist. */}
            <div className={['overview', 'performance'].includes(activeTab) ? 'block' : 'hidden'}>
              <EmployeeProfileCard
                uid={uid}
                embedded
                sections={profileSections}
                onProfileSaved={(profile) => {
                  setProfileMeta(profile);
                  setAccountForm((prev) => ({
                    ...prev,
                    ...portalAccessFromUser(profile),
                    portalPassword: prev.portalPassword,
                  }));
                }}
              />
            </div>

            {activeTab === TAB_IDS.performance && SHOW_HR_RECORDS && (
              <EmployeeDisciplinaryPanel
                employeeUid={uid}
                employeeName={profileMeta?.fullName}
                embedded
              />
            )}

            {activeTab === TAB_IDS.cases && canStartCases && (
              <EmployeeDisciplinaryPanel
                employeeUid={uid}
                employeeName={profileMeta?.fullName}
                embedded
              />
            )}

            {activeTab === TAB_IDS.documents && (
              <EmployeeSharePointDocuments
                employeeUid={uid}
                employeeName={profileMeta?.fullName}
                sharePointFolderName={profileMeta?.sharePointFolderName}
                sharePointEmployeeRoot={profileMeta?.sharePointEmployeeRoot}
                isConfirmed={Boolean(profileMeta?.sharePointFolderConfirmedAt)}
                embedded
                onMappingSaved={(mapping) => {
                  setProfileMeta((current) => (current ? { ...current, ...mapping } : current));
                }}
              />
            )}

            {activeTab === TAB_IDS.fun && (
              <div className="flex flex-col xl:flex-row gap-6 items-start">
                <div className="min-w-0 flex-1 w-full">
                  <EmployeeFunPanel currentUserUid={user?.uid} isAdmin={isAdmin} />
                </div>
                <aside className="w-full xl:w-[22rem] xl:sticky xl:top-4 flex-shrink-0">
                  <div className="rounded-xl border border-[#1a2540] bg-[#0b1220]/60 p-4">
                    <p className="text-[10px] font-mono uppercase tracking-[0.18em] text-indigo-400 mb-3">Polls</p>
                    <PollsPanel compact />
                  </div>
                </aside>
              </div>
            )}

            {activeTab === TAB_IDS.polls && (
              <PollsPanel />
            )}

            {activeTab === TAB_IDS.suggestions && (
              <SuggestionBoxPanel currentUserUid={user?.uid} />
            )}

            {activeTab === TAB_IDS.access && canViewPortal && (
              <div className="space-y-4">
                {isHrOnly && isAdmin && (
                  <EnablePortalLoginCard
                    profile={profileMeta}
                    accountForm={accountForm}
                    onAccountChange={handleAccountChange}
                    onPortalRoleChange={handlePortalRoleChange}
                    onEnable={handleEnablePortalLogin}
                    saving={saving}
                  />
                )}

                {!isHrOnly && (
                  <div className="bg-[#0b1220] border border-[#1a2540] rounded-xl overflow-hidden">
                    <div className="px-5 py-3 border-b border-[#1a2540] bg-[#060e1a]/50 flex items-center justify-between gap-3">
                      <div>
                        <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-widest">
                          Portal access & training
                        </h3>
                        <p className="text-xs text-slate-500 mt-1">
                          App roles, CPC flags, and Weekend Availability initials mapping.
                        </p>
                      </div>
                      {portalCount > 0 && (
                        <span className="text-xs text-indigo-300">{portalCount} portal{portalCount === 1 ? '' : 's'}</span>
                      )}
                    </div>
                    <div className="px-5 py-4">
                      {isAdmin && (
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-5 pb-5 border-b border-[#1a2540]">
                          <div>
                            <label className="block text-[11px] font-medium uppercase tracking-wider text-slate-500 mb-1">Full name</label>
                            <input
                              name="fullName"
                              type="text"
                              value={accountForm.fullName}
                              onChange={handleAccountChange}
                              className="w-full bg-[#060e1a] border border-[#1a2540] text-slate-100 text-sm rounded-lg px-3 py-2"
                            />
                          </div>
                          <div>
                            <label className="block text-[11px] font-medium uppercase tracking-wider text-slate-500 mb-1">Work email</label>
                            <input
                              type="email"
                              value={accountForm.email}
                              disabled
                              className="w-full bg-[#060e1a] border border-[#1a2540] text-slate-100 text-sm rounded-lg px-3 py-2 opacity-60"
                            />
                          </div>
                          <div className="flex items-end">
                            <label className="flex items-center gap-2 cursor-pointer pb-2">
                              <input
                                type="checkbox"
                                name="isActive"
                                checked={accountForm.isActive}
                                onChange={handleAccountChange}
                                className="w-4 h-4 rounded border-[#1a2540] bg-[#060e1a] text-indigo-500"
                              />
                              <span className="text-sm text-slate-300">Active account</span>
                            </label>
                          </div>
                        </div>
                      )}

                      <PortalAccessFields
                        formData={accountForm}
                        onChange={handleAccountChange}
                        onPortalRoleChange={handlePortalRoleChange}
                        readOnly={portalReadOnly}
                      />

                      {canEditPortal && (
                        <div className="flex justify-end mt-6 pt-4 border-t border-[#1a2540]">
                          <button
                            type="button"
                            onClick={handleSavePortal}
                            disabled={saving}
                            className="px-5 py-2.5 rounded-lg text-sm font-medium bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white"
                          >
                            {saving ? 'Saving…' : 'Save portal access'}
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}

            {activeTab === TAB_IDS.admin && isAdmin && (
              <div className="space-y-4">
                <div className="bg-[#0b1220] border border-[#1a2540] rounded-xl overflow-hidden">
                  <div className="px-5 py-4 border-b border-[#1a2540]">
                    <h3 className="text-sm font-semibold text-white">Admin tools</h3>
                    <p className="text-sm text-slate-400 mt-1">
                      Destructive or advanced actions for this employee record.
                    </p>
                  </div>
                  <div className="px-5 py-4 space-y-5">
                    <div className="flex flex-wrap items-end justify-between gap-4">
                      <div className="min-w-[240px] flex-1">
                        <p className="text-sm font-medium text-white">Reset password</p>
                        <p className="text-sm text-slate-400 mt-1">
                          Set a temporary portal password for this employee. Leave blank to generate a random one.
                        </p>
                        <label className="mt-3 block">
                          <span className="mb-1 block text-[11px] font-medium uppercase tracking-wider text-slate-500">
                            Temporary password
                          </span>
                          <input
                            type="text"
                            value={resetPassword}
                            onChange={(event) => setResetPassword(event.target.value)}
                            placeholder="Leave blank to auto-generate"
                            disabled={isHrOnly || resettingPassword}
                            className="w-full max-w-sm rounded-lg border border-[#1a2540] bg-[#111827] px-3 py-2 text-sm text-white font-mono disabled:opacity-50"
                          />
                        </label>
                        {resetPasswordResult ? (
                          <div className="mt-3 flex flex-wrap items-center gap-2">
                            <code className="rounded-md border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1.5 text-sm text-emerald-100 font-mono">
                              {resetPasswordResult}
                            </code>
                            <button
                              type="button"
                              onClick={async () => {
                                try {
                                  await navigator.clipboard.writeText(resetPasswordResult);
                                  setSuccess('Temporary password copied to clipboard.');
                                } catch {
                                  setError('Could not copy password. Select and copy it manually.');
                                }
                              }}
                              className="px-3 py-1.5 rounded-lg text-xs font-medium border border-[#1a2540] text-slate-200 hover:bg-white/5"
                            >
                              Copy
                            </button>
                          </div>
                        ) : null}
                        {isHrOnly ? (
                          <p className="mt-2 text-sm text-amber-200/80">
                            No portal login yet — enable portal login on the Access tab first.
                          </p>
                        ) : null}
                      </div>
                      <button
                        type="button"
                        onClick={handleResetPassword}
                        disabled={isHrOnly || resettingPassword || isNew}
                        className="px-4 py-2.5 rounded-lg text-sm font-medium border border-amber-500/40 text-amber-100 hover:bg-amber-500/10 transition-colors disabled:opacity-50"
                      >
                        {resettingPassword ? 'Resetting…' : 'Reset password'}
                      </button>
                    </div>

                    <div className="border-t border-[#1a2540] pt-5 flex flex-wrap items-center justify-between gap-4">
                      <div>
                        <p className="text-sm font-medium text-white">Merge duplicate</p>
                        <p className="text-sm text-slate-400 mt-1">
                          Combine another employee record into this one using a side drawer.
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setMergeOpen(true)}
                        className="px-4 py-2.5 rounded-lg text-sm font-medium border border-rose-500/40 text-rose-200 hover:bg-rose-500/10 transition-colors"
                      >
                        Open merge drawer
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {isAdmin && (
        <MergeEmployeeCard
          primaryEmployee={profileMeta}
          employees={allEmployees}
          open={mergeOpen}
          onOpenChange={setMergeOpen}
          onMerged={async (data) => {
            setSuccess(data.message || 'Employees merged successfully.');
            setAllEmployees((current) => current.filter(
              (employee) => employee.uid !== data.removedUid,
            ));
            if (data.profile) {
              setProfileMeta(data.profile);
              setAccountForm(portalAccessFromUser(data.profile));
            }
          }}
        />
      )}
    </div>
  );
}
