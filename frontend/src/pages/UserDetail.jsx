import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import BusinessCommsEmailSelector from '../components/BusinessCommsEmailSelector';
import { normalizeBusinessCommsEmail } from '../utils/employeeProfile';

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

// All known portals. Add new apps here as they are integrated.
// roles: array of { value, label } — the options available in the dropdown for that portal.
const KNOWN_PORTALS = [
  {
    key: 'master_admin',
    label: 'Master Admin Portal',
    roles: [{ value: 'admin', label: 'Admin' }],
  },
  {
    key: 'mentoring_app',
    label: 'Mentor Portal',
    roles: [
      { value: 'candidate', label: 'Candidate' },
      { value: 'new_starter', label: 'New Starter' },
      { value: 'trainee', label: 'Trainee' },
      { value: 'mentor', label: 'Mentor' },
      { value: 'admin', label: 'Admin' },
    ],
  },
  {
    key: 'assessment_app',
    label: 'Assessment Portal',
    roles: [
      { value: 'learner', label: 'Learner' },
      { value: 'admin', label: 'Admin' },
    ],
  },
  {
    key: 'routes_app',
    label: 'Routes Portal',
    roles: [
      { value: 'driver', label: 'Driver' },
      { value: 'manager', label: 'Manager' },
      { value: 'admin', label: 'Admin' },
    ],
  },
  {
    key: 'hr_app',
    label: 'Headcount',
    roles: [
      { value: 'staff', label: 'Staff' },
      { value: 'manager', label: 'Manager' },
      { value: 'admin', label: 'Admin' },
    ],
  },
  {
    key: 'cpc_app',
    label: 'CPC Portal',
    roles: [
      { value: 'driver', label: 'Driver' },
      { value: 'trainer', label: 'Trainer' },
      { value: 'admin', label: 'Admin' },
    ],
  },
  {
    key: 'tyre_app',
    label: 'Tyre Tracker',
    roles: [
      { value: 'fitter', label: 'Fitter' },
      { value: 'manager', label: 'Manager' },
      { value: 'admin', label: 'Admin' },
    ],
  },
  {
    key: 'cleaning_app',
    label: 'Vehicle Cleaning Portal',
    roles: [
      { value: 'driver', label: 'Driver' },
      { value: 'manager', label: 'Manager' },
      { value: 'admin', label: 'Admin' },
    ],
  },
  {
    key: 'contracts_app',
    label: 'Contracts Portal',
    roles: [
      { value: 'manager', label: 'Manager' },
      { value: 'admin', label: 'Admin' },
    ],
  },
  {
    key: 'compliance_app',
    label: 'Weekend Availability',
    roles: [
      { value: 'user', label: 'User' },
      { value: 'manager', label: 'Manager' },
      { value: 'planner', label: 'Planner' },
      { value: 'payroll', label: 'Payroll' },
      { value: 'admin', label: 'Admin' },
    ],
  },
  {
    key: 'attendance_app',
    label: 'Attendance',
    roles: [
      { value: 'employee', label: 'Employee' },
      { value: 'manager', label: 'Manager' },
      { value: 'ops', label: 'Ops' },
      { value: 'admin', label: 'Admin' },
    ],
  },
  {
    key: 'training_app',
    label: 'Training',
    roles: [
      { value: 'employee', label: 'Employee' },
      { value: 'trainer', label: 'Trainer' },
      { value: 'admin', label: 'Admin' },
    ],
  },
  {
    key: 'holidays_app',
    label: 'Holidays',
    roles: [
      { value: 'employee', label: 'Employee' },
      { value: 'manager', label: 'Manager' },
      { value: 'hr', label: 'HR' },
      { value: 'admin', label: 'Admin' },
    ],
  },
  {
    key: 'events_app',
    label: 'Events Transport',
    roles: [
      { value: 'driver', label: 'Driver' },
      { value: 'ops', label: 'Ops' },
      { value: 'admin', label: 'Admin' },
    ],
  },
];

function buildPortalsAccess(existing = {}) {
  // Start with all known portals defaulting to '' (no access),
  // then overlay any values already saved on the user.
  const base = Object.fromEntries(KNOWN_PORTALS.map(({ key }) => [key, '']));
  return { ...base, ...existing };
}

function buildPortalMappings(formData) {
  const portalMappings = {
    mentoring_app: {
      profileId: formData.mentorProfileId,
    },
    assessment_app: {
      profileId: formData.assessmentProfileId,
    },
    tyre_app: {
      profileId: formData.tyreProfileId,
    },
    compliance_app: {
      profileId: formData.complianceProfileId,
    },
  };

  const cpcRole = formData.portalsAccess?.cpc_app || '';
  if (cpcRole === 'driver' || cpcRole === 'trainer' || cpcRole === 'admin') {
    portalMappings.cpc_app = {
      qualifiesAsDriver: cpcRole === 'driver' ? true : Boolean(formData.cpcQualifiesAsDriver),
    };
  }

  return portalMappings;
}

function getMentorProfileId(portalMappings = {}) {
  const value = portalMappings?.mentoring_app?.profileId;
  return typeof value === 'string' ? value : '';
}

function getAssessmentProfileId(portalMappings = {}) {
  const value = portalMappings?.assessment_app?.profileId;
  return typeof value === 'string' ? value : '';
}

function getTyreProfileId(portalMappings = {}) {
  const value = portalMappings?.tyre_app?.profileId;
  return typeof value === 'string' ? value : '';
}

function getComplianceProfileId(portalMappings = {}) {
  const value = portalMappings?.compliance_app?.profileId;
  return typeof value === 'string' ? value : '';
}

function toCompanyEmail(fullName = '') {
  const localPart = String(fullName).replace(/\s+/g, '').toLowerCase();
  return localPart ? `${localPart}@countrylion.co.uk` : '';
}

const DEFAULT_TEMP_PASSWORD = 'socket';

function sortProfilesAtoZ(profiles = [], labelBuilder) {
  return [...profiles].sort((a, b) => {
    const aLabel = labelBuilder(a).toLowerCase();
    const bLabel = labelBuilder(b).toLowerCase();
    return aLabel.localeCompare(bLabel);
  });
}

export default function UserDetail() {
  const { uid } = useParams();
  const navigate = useNavigate();
  const { refreshSession } = useAuth();
  const isNew = uid === 'new';

  const [formData, setFormData] = useState({
    email: '',
    businessCommsEmail: 'work',
    employeePersonalEmail: '',
    fullName: '',
    isActive: true,
    portalsAccess: buildPortalsAccess(),
    mentorProfileId: '',
    assessmentProfileId: '',
    tyreProfileId: '',
    complianceProfileId: '',
    cpcQualifiesAsDriver: false,
  });

  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [mentorProfiles, setMentorProfiles] = useState([]);
  const [mentorProfilesLoading, setMentorProfilesLoading] = useState(false);
  const [mentorProfilesError, setMentorProfilesError] = useState('');
  const [mentorProfilesAttempted, setMentorProfilesAttempted] = useState(false);
  const [assessmentProfiles, setAssessmentProfiles] = useState([]);
  const [assessmentProfilesLoading, setAssessmentProfilesLoading] = useState(false);
  const [assessmentProfilesError, setAssessmentProfilesError] = useState('');
  const [assessmentProfilesAttempted, setAssessmentProfilesAttempted] = useState(false);
  const [tyreProfiles, setTyreProfiles] = useState([]);
  const [tyreProfilesLoading, setTyreProfilesLoading] = useState(false);
  const [tyreProfilesError, setTyreProfilesError] = useState('');
  const [tyreProfilesAttempted, setTyreProfilesAttempted] = useState(false);
  const mentoringRole = formData.portalsAccess?.mentoring_app || '';
  const hasMentoringAccess = typeof mentoringRole === 'string' && mentoringRole.trim().length > 0;
  const assessmentRole = formData.portalsAccess?.assessment_app || '';
  const hasAssessmentAccess = typeof assessmentRole === 'string' && assessmentRole.trim().length > 0;
  const tyreRole = formData.portalsAccess?.tyre_app || '';
  const hasTyreAccess = typeof tyreRole === 'string' && tyreRole.trim().length > 0;
  const cpcRole = formData.portalsAccess?.cpc_app || '';
  const showCpcDriverFlag = cpcRole === 'trainer' || cpcRole === 'admin';
  const fetchMentorProfiles = async () => {
    try {
      setMentorProfilesLoading(true);
      setMentorProfilesError('');
      setMentorProfilesAttempted(true);

      const response = await fetch('/api/getMentorProfiles', {
        method: 'GET',
        credentials: 'include',
      });

      if (!response.ok) {
        const data = (await readJsonResponse(response)) || {};
        throw new Error(data?.error?.message || data?.error || 'Failed to load mentor profiles.');
      }

      const data = (await readJsonResponse(response)) || {};
      const profiles = Array.isArray(data.profiles) ? data.profiles : [];
      setMentorProfiles(
        sortProfilesAtoZ(
          profiles,
          (profile) => profile.name || profile.username || profile.email || profile.id || '',
        ),
      );
    } catch (err) {
      setMentorProfilesError(err.message || 'Could not load mentor profiles.');
      setMentorProfiles([]);
    } finally {
      setMentorProfilesLoading(false);
    }
  };

  const fetchAssessmentProfiles = async () => {
    try {
      setAssessmentProfilesLoading(true);
      setAssessmentProfilesError('');
      setAssessmentProfilesAttempted(true);

      const response = await fetch('/api/getAssessmentProfiles', {
        method: 'GET',
        credentials: 'include',
      });

      if (!response.ok) {
        const data = (await readJsonResponse(response)) || {};
        throw new Error(data?.error?.message || data?.error || 'Failed to load assessment profiles.');
      }

      const data = await readJsonResponse(response);
      if (!data) {
        throw new Error('Assessment profiles API returned non-JSON content. Please refresh and try again.');
      }

      const profiles = Array.isArray(data.profiles) ? data.profiles : [];
      setAssessmentProfiles(
        sortProfilesAtoZ(
          profiles,
          (profile) => profile.name || profile.fullName || profile.email || profile.id || '',
        ),
      );
    } catch (err) {
      setAssessmentProfilesError(err.message || 'Could not load assessment profiles.');
      setAssessmentProfiles([]);
    } finally {
      setAssessmentProfilesLoading(false);
    }
  };

  const fetchTyreProfiles = async () => {
    try {
      setTyreProfilesLoading(true);
      setTyreProfilesError('');
      setTyreProfilesAttempted(true);

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 15000);

      const response = await fetch('/api/getTyreProfiles', {
        method: 'GET',
        credentials: 'include',
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (!response.ok) {
        const data = (await readJsonResponse(response)) || {};
        throw new Error(data?.error?.message || data?.error || 'Failed to load tyre profiles.');
      }

      const data = (await readJsonResponse(response)) || {};
      if (!Array.isArray(data.profiles)) {
        throw new Error('Tyre profiles API returned invalid data.');
      }
      const profiles = Array.isArray(data.profiles) ? data.profiles : [];
      setTyreProfiles(
        sortProfilesAtoZ(
          profiles,
          (profile) => profile.name || profile.email || profile.id || '',
        ),
      );
    } catch (err) {
      setTyreProfilesError(err.message || 'Could not load tyre profiles.');
      setTyreProfiles([]);
    } finally {
      setTyreProfilesLoading(false);
    }
  };

  useEffect(() => {
    if (isNew) {
      setLoading(false);
      return;
    }

    const fetchUser = async () => {
      try {
        setLoading(true);
        setError('');

        // Note: In Phase 3, you'll need a /api/getUser/:uid endpoint.
        // For now, this is a placeholder. You can fetch from Firestore directly
        // via a security-rule-protected endpoint, or we can add it to the functions.
        const response = await fetch(`/api/getUser/${uid}`, { credentials: 'include' });

        if (!response.ok) {
          const data = (await readJsonResponse(response)) || {};
          throw new Error(data.error ?? 'Failed to fetch user.');
        }

        const data = (await readJsonResponse(response)) || {};
        setFormData({
          email: data.user.email || '',
          businessCommsEmail: normalizeBusinessCommsEmail(data.user.businessCommsEmail),
          employeePersonalEmail: data.user.employeeProfile?.personalEmail || '',
          fullName: data.user.fullName || '',
          isActive: data.user.isActive ?? true,
          portalsAccess: buildPortalsAccess(data.user.portalsAccess || {}),
          mentorProfileId: getMentorProfileId(data.user.portalMappings || {}),
          assessmentProfileId: getAssessmentProfileId(data.user.portalMappings || {}),
          tyreProfileId: getTyreProfileId(data.user.portalMappings || {}),
          complianceProfileId: getComplianceProfileId(data.user.portalMappings || {}),
          cpcQualifiesAsDriver: data.user.portalMappings?.cpc_app?.qualifiesAsDriver === true,
        });
      } catch (err) {
        setError(err.message ?? 'An error occurred.');
      } finally {
        setLoading(false);
      }
    };

    fetchUser();
  }, [uid, isNew]);

  useEffect(() => {
    if (hasMentoringAccess && !mentorProfilesAttempted && !mentorProfilesLoading) {
      fetchMentorProfiles();
    }
  }, [hasMentoringAccess, mentorProfilesAttempted, mentorProfilesLoading]);

  useEffect(() => {
    if (hasAssessmentAccess && !assessmentProfilesAttempted && !assessmentProfilesLoading) {
      fetchAssessmentProfiles();
    }
  }, [hasAssessmentAccess, assessmentProfilesAttempted, assessmentProfilesLoading]);

  useEffect(() => {
    if (hasTyreAccess && !tyreProfilesAttempted && !tyreProfilesLoading) {
      fetchTyreProfiles();
    }
  }, [hasTyreAccess, tyreProfilesAttempted, tyreProfilesLoading]);

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;

    if (type === 'checkbox') {
      setFormData((prev) => ({ ...prev, [name]: checked }));
    } else if (name.startsWith('portal_')) {
      const portalName = name.replace('portal_', '');
      setFormData((prev) => {
        const nextPortalsAccess = {
          ...prev.portalsAccess,
          [portalName]: value,
        };
        let nextCpcQualifies = prev.cpcQualifiesAsDriver;
        if (portalName === 'cpc_app') {
          if (value === 'driver') nextCpcQualifies = true;
          else if (!value) nextCpcQualifies = false;
        }
        return {
          ...prev,
          portalsAccess: nextPortalsAccess,
          cpcQualifiesAsDriver: nextCpcQualifies,
        };
      });
    } else if (name === 'fullName' && isNew) {
      setFormData((prev) => {
        return {
          ...prev,
          fullName: value,
        };
      });
    } else {
      setFormData((prev) => ({ ...prev, [name]: value }));
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setSaving(true);

    try {
      const endpoint = isNew ? '/api/adminCreateUser' : '/api/adminUpdateUser';
      const portalMappings = buildPortalMappings(formData);

      const payload = isNew
        ? {
            email: toCompanyEmail(formData.fullName),
            password: DEFAULT_TEMP_PASSWORD,
            fullName: formData.fullName,
            businessCommsEmail: formData.businessCommsEmail,
            isActive: formData.isActive,
            portalsAccess: formData.portalsAccess,
            portalMappings,
          }
        : {
            uid,
            email: undefined,
            fullName: formData.fullName,
            businessCommsEmail: formData.businessCommsEmail,
            isActive: formData.isActive,
            portalsAccess: formData.portalsAccess,
            portalMappings,
          };

      if (!isNew) {
        delete payload.email;
      }

      const response = await fetch(endpoint, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const data = (await readJsonResponse(response)) || {};
        throw new Error(data.error ?? `Failed to ${isNew ? 'create' : 'update'} user.`);
      }

      setSuccess(`User ${isNew ? 'created' : 'updated'} successfully!`);
      await refreshSession();
      setTimeout(() => {
        navigate('/dashboard/users');
      }, 1500);
    } catch (err) {
      setError(err.message ?? 'An error occurred.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-4 px-8 py-6 border-b border-[#1a2540]">
        <button
          onClick={() => navigate('/dashboard/users')}
          className="p-1.5 hover:bg-[#1a2540] rounded-lg transition-colors text-slate-400 hover:text-slate-200"
          aria-label="Back"
        >
          <ChevronLeftIcon className="w-5 h-5" />
        </button>
        <div>
          <h1 className="text-2xl font-bold text-white">{isNew ? 'New User' : 'Edit User'}</h1>
          <p className="text-sm text-slate-400 mt-1">{isNew ? 'Create a new employee account' : 'Modify employee details and permissions'}</p>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto">
        {loading ? (
          <div className="flex items-center justify-center h-full">
            <div className="flex flex-col items-center gap-3">
              <Spinner className="animate-spin h-8 w-8 text-indigo-500" />
              <p className="text-slate-400 text-sm">Loading user…</p>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="max-w-2xl p-8" autoComplete="off">
            {/* Error banner */}
            {error && (
              <div className="mb-6 px-4 py-3 bg-red-500/10 border border-red-500/25 rounded-lg">
                <p className="text-red-300 text-sm">{error}</p>
              </div>
            )}

            {/* Success banner */}
            {success && (
              <div className="mb-6 px-4 py-3 bg-emerald-500/10 border border-emerald-500/25 rounded-lg">
                <p className="text-emerald-300 text-sm">{success}</p>
              </div>
            )}

            {/* Form sections */}
            <div className="space-y-8">
              {/* Basic info */}
              <div>
                <h2 className="text-sm font-semibold uppercase tracking-widest text-slate-400 mb-4">Basic Information</h2>
                <div className="space-y-4">
                  <div>
                    <label htmlFor="fullName" className="block text-xs font-semibold uppercase tracking-widest text-slate-400 mb-1.5">
                      Full Name
                    </label>
                    <input
                      id="fullName"
                      name="fullName"
                      type="text"
                      required
                      value={formData.fullName}
                      onChange={handleChange}
                      className="w-full bg-[#060e1a] border border-[#1a2540] text-slate-100 text-sm rounded-lg px-4 py-2.5 placeholder:text-slate-600 focus:outline-none focus:border-indigo-500/60 focus:ring-1 focus:ring-indigo-500/40 transition-all"
                      placeholder="John Doe"
                    />
                  </div>

                  {isNew ? (
                    <div>
                      <p className="text-xs text-slate-500 mt-1">
                        Email will be auto-generated from full name{toCompanyEmail(formData.fullName) ? `: ${toCompanyEmail(formData.fullName)}` : '.'}
                      </p>
                    </div>
                  ) : (
                    <div>
                      <label htmlFor="email" className="block text-xs font-semibold uppercase tracking-widest text-slate-400 mb-1.5">
                        Email Address
                      </label>
                      <input
                        id="email"
                        name="email"
                        type="email"
                        required
                        value={formData.email || ''}
                        onChange={handleChange}
                        disabled
                        className="w-full bg-[#060e1a] border border-[#1a2540] text-slate-100 text-sm rounded-lg px-4 py-2.5 placeholder:text-slate-600 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                        placeholder="john@countrylion.co.uk"
                      />
                      <p className="text-xs text-slate-500 mt-1">Email cannot be changed after creation</p>
                    </div>
                  )}

                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-widest text-slate-400 mb-1.5">
                      Business communications
                    </label>
                    <BusinessCommsEmailSelector
                      workEmail={isNew ? toCompanyEmail(formData.fullName) : (formData.email || '')}
                      personalEmail={formData.employeePersonalEmail}
                      value={formData.businessCommsEmail}
                      onChange={(value) => setFormData((prev) => ({ ...prev, businessCommsEmail: value }))}
                    />
                    {!isNew && !formData.employeePersonalEmail && (
                      <p className="text-xs text-slate-500 mt-2">
                        Add a personal email on the employee profile to enable personal notifications.
                      </p>
                    )}
                  </div>

                  {isNew && (
                    <div>
                      <p className="text-xs text-slate-500 mt-1">Default temporary password will be <span className="font-mono">socket</span>. User should change this after login.</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Status */}
              <div>
                <h2 className="text-sm font-semibold uppercase tracking-widest text-slate-400 mb-4">Status</h2>
                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    name="isActive"
                    checked={formData.isActive}
                    onChange={handleChange}
                    className="w-4 h-4 rounded border-[#1a2540] bg-[#060e1a] text-indigo-500 focus:ring-indigo-500 focus:ring-1"
                  />
                  <span className="text-sm text-slate-300">
                    Active Account {!formData.isActive && <span className="text-slate-500">(disabled)</span>}
                  </span>
                </label>
              </div>

              {/* Portal access */}
              <div>
                <h2 className="text-sm font-semibold uppercase tracking-widest text-slate-400 mb-4">Portal Access</h2>
                <p className="text-xs text-slate-500 mb-4">Select the role for each portal. Leave blank to revoke access.</p>
                <div className="space-y-3">
                  {KNOWN_PORTALS.map(({ key: portal, label, roles }) => (
                    <div key={portal}>
                      <label htmlFor={`portal_${portal}`} className="block text-xs font-semibold uppercase tracking-widest text-slate-400 mb-1.5">
                        {label}
                      </label>
                      <select
                        id={`portal_${portal}`}
                        name={`portal_${portal}`}
                        value={formData.portalsAccess[portal] || ''}
                        onChange={handleChange}
                        className="w-full bg-[#060e1a] border border-[#1a2540] text-slate-100 text-sm rounded-lg px-4 py-2.5 focus:outline-none focus:border-indigo-500/60 focus:ring-1 focus:ring-indigo-500/40 transition-all"
                      >
                        <option value="">No access</option>
                        {roles.map(({ value, label: roleLabel }) => (
                          <option key={value} value={value}>{roleLabel}</option>
                        ))}
                      </select>
                      {portal === 'cpc_app' && cpcRole === 'driver' && (
                        <p className="text-xs text-slate-500 mt-1.5">
                          Driver role users are always tracked for CPC compliance and training.
                        </p>
                      )}
                      {portal === 'cpc_app' && showCpcDriverFlag && (
                        <label className="flex items-start gap-3 mt-3 cursor-pointer">
                          <input
                            type="checkbox"
                            name="cpcQualifiesAsDriver"
                            checked={formData.cpcQualifiesAsDriver}
                            onChange={handleChange}
                            className="mt-0.5 w-4 h-4 rounded border-[#1a2540] bg-[#060e1a] text-indigo-500 focus:ring-indigo-500 focus:ring-1"
                          />
                          <span className="text-sm text-slate-300">
                            Also requires CPC training
                            <span className="block text-xs text-slate-500 mt-0.5">
                              Include this {cpcRole} in driver compliance, delegate lists, and training records.
                            </span>
                          </span>
                        </label>
                      )}
                    </div>
                  ))}
                </div>

                <div className="mt-6">
                  <label htmlFor="mentorProfileId" className="block text-xs font-semibold uppercase tracking-widest text-slate-400 mb-1.5">
                    Mentor Profile ID (optional)
                  </label>
                  <div className="flex gap-2 mb-2">
                    <button
                      type="button"
                      onClick={fetchMentorProfiles}
                      disabled={mentorProfilesLoading}
                      className="px-3 py-1.5 rounded-md border border-[#1a2540] text-slate-300 text-xs font-medium hover:bg-[#0b1220] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {mentorProfilesLoading ? 'Loading profiles…' : mentorProfiles.length > 0 ? 'Refresh profiles' : 'Load profiles'}
                    </button>
                    {mentorProfilesError && <span className="text-xs text-red-300 self-center">{mentorProfilesError}</span>}
                  </div>
                  {mentorProfiles.length > 0 && (
                    <div className="mb-2">
                      <label htmlFor="mentorProfileSelect" className="block text-[11px] font-semibold uppercase tracking-widest text-slate-500 mb-1">
                        Pick Existing Mentor Profile
                      </label>
                      <select
                        id="mentorProfileSelect"
                        value={formData.mentorProfileId || ''}
                        onChange={(e) => setFormData((prev) => ({ ...prev, mentorProfileId: e.target.value }))}
                        className="w-full bg-[#060e1a] border border-[#1a2540] text-slate-100 text-sm rounded-lg px-4 py-2.5 focus:outline-none focus:border-indigo-500/60 focus:ring-1 focus:ring-indigo-500/40 transition-all"
                      >
                        <option value="">No explicit mapping</option>
                        {mentorProfiles.map((profile) => {
                          const label = profile.name || profile.username || profile.email || profile.id;
                          const roleLabel = profile.role ? ` (${profile.role})` : '';
                          const emailLabel = profile.email ? ` - ${profile.email}` : '';
                          return (
                            <option key={profile.id} value={profile.id}>
                              {label}{roleLabel}{emailLabel}
                            </option>
                          );
                        })}
                      </select>
                    </div>
                  )}
                  <input
                    id="mentorProfileId"
                    name="mentorProfileId"
                    type="text"
                    value={formData.mentorProfileId}
                    onChange={handleChange}
                    className="w-full bg-[#060e1a] border border-[#1a2540] text-slate-100 text-sm rounded-lg px-4 py-2.5 placeholder:text-slate-600 focus:outline-none focus:border-indigo-500/60 focus:ring-1 focus:ring-indigo-500/40 transition-all"
                    placeholder="Existing mentor users document ID"
                  />
                  <p className="text-xs text-slate-500 mt-1">
                    Use this to map the main account to an existing mentor profile when email matching is not enough.
                  </p>
                </div>

                <div className="mt-6">
                  <label htmlFor="assessmentProfileId" className="block text-xs font-semibold uppercase tracking-widest text-slate-400 mb-1.5">
                    Assessment Profile ID (optional)
                  </label>
                  <div className="flex gap-2 mb-2">
                    <button
                      type="button"
                      onClick={fetchAssessmentProfiles}
                      disabled={assessmentProfilesLoading}
                      className="px-3 py-1.5 rounded-md border border-[#1a2540] text-slate-300 text-xs font-medium hover:bg-[#0b1220] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {assessmentProfilesLoading ? 'Loading profiles…' : assessmentProfiles.length > 0 ? 'Refresh profiles' : 'Load profiles'}
                    </button>
                    {assessmentProfilesError && <span className="text-xs text-red-300 self-center">{assessmentProfilesError}</span>}
                  </div>
                  {assessmentProfiles.length > 0 && (
                    <div className="mb-2">
                      <label htmlFor="assessmentProfileSelect" className="block text-[11px] font-semibold uppercase tracking-widest text-slate-500 mb-1">
                        Pick Existing Assessment Profile
                      </label>
                      <select
                        id="assessmentProfileSelect"
                        value={formData.assessmentProfileId || ''}
                        onChange={(e) => setFormData((prev) => ({ ...prev, assessmentProfileId: e.target.value }))}
                        className="w-full bg-[#060e1a] border border-[#1a2540] text-slate-100 text-sm rounded-lg px-4 py-2.5 focus:outline-none focus:border-indigo-500/60 focus:ring-1 focus:ring-indigo-500/40 transition-all"
                      >
                        <option value="">No explicit mapping</option>
                        {assessmentProfiles.map((profile) => {
                          const label = profile.name || profile.username || profile.email || profile.id;
                          const roleLabel = profile.role ? ` (${profile.role})` : '';
                          const emailLabel = profile.email ? ` - ${profile.email}` : '';
                          return (
                            <option key={profile.id} value={profile.id}>
                              {label}{roleLabel}{emailLabel}
                            </option>
                          );
                        })}
                      </select>
                    </div>
                  )}
                  <input
                    id="assessmentProfileId"
                    name="assessmentProfileId"
                    type="text"
                    value={formData.assessmentProfileId}
                    onChange={handleChange}
                    className="w-full bg-[#060e1a] border border-[#1a2540] text-slate-100 text-sm rounded-lg px-4 py-2.5 placeholder:text-slate-600 focus:outline-none focus:border-indigo-500/60 focus:ring-1 focus:ring-indigo-500/40 transition-all"
                    placeholder="Existing assessment users document ID"
                  />
                  <p className="text-xs text-slate-500 mt-1">
                    Use this to map the main account to an existing assessment profile when email matching is not enough.
                  </p>
                </div>

                <div className="mt-6">
                  <label htmlFor="tyreProfileId" className="block text-xs font-semibold uppercase tracking-widest text-slate-400 mb-1.5">
                    Tyre Profile ID (optional)
                  </label>
                  <div className="flex gap-2 mb-2">
                    <button
                      type="button"
                      onClick={fetchTyreProfiles}
                      disabled={tyreProfilesLoading}
                      className="px-3 py-1.5 rounded-md border border-[#1a2540] text-slate-300 text-xs font-medium hover:bg-[#0b1220] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {tyreProfilesLoading ? 'Loading profiles…' : tyreProfiles.length > 0 ? 'Refresh profiles' : 'Load profiles'}
                    </button>
                    {tyreProfilesError && <span className="text-xs text-red-300 self-center">{tyreProfilesError}</span>}
                  </div>
                  {tyreProfilesAttempted && tyreProfiles.length === 0 && !tyreProfilesLoading && (
                    <div className="mb-3 p-2.5 bg-amber-500/10 border border-amber-500/25 rounded-lg">
                      <p className="text-xs text-amber-200">
                        To find a tyre user's ID: visit <a href="https://tyres.countrylion.co.uk" target="_blank" rel="noopener noreferrer" className="underline hover:text-amber-100">Tyre Tracker</a>, navigate to that user's profile, and copy their ID from the URL or profile details.
                      </p>
                    </div>
                  )}
                  {tyreProfiles.length > 0 && (
                    <div className="mb-2">
                      <label htmlFor="tyreProfileSelect" className="block text-[11px] font-semibold uppercase tracking-widest text-slate-500 mb-1">
                        Pick Existing Tyre Profile
                      </label>
                      <select
                        id="tyreProfileSelect"
                        value={formData.tyreProfileId || ''}
                        onChange={(e) => setFormData((prev) => ({ ...prev, tyreProfileId: e.target.value }))}
                        className="w-full bg-[#060e1a] border border-[#1a2540] text-slate-100 text-sm rounded-lg px-4 py-2.5 focus:outline-none focus:border-indigo-500/60 focus:ring-1 focus:ring-indigo-500/40 transition-all"
                      >
                        <option value="">No explicit mapping</option>
                        {tyreProfiles.map((profile) => {
                          const label = profile.name || profile.email || profile.id;
                          const initialsLabel = profile.initials ? ` [${profile.initials}]` : '';
                          const roleLabel = profile.role ? ` (${profile.role})` : '';
                          const emailLabel = profile.email ? ` - ${profile.email}` : '';
                          return (
                            <option key={profile.id} value={profile.id}>
                              {label}{initialsLabel}{roleLabel}{emailLabel}
                            </option>
                          );
                        })}
                      </select>
                    </div>
                  )}
                  <input
                    id="tyreProfileId"
                    name="tyreProfileId"
                    type="text"
                    value={formData.tyreProfileId}
                    onChange={handleChange}
                    className="w-full bg-[#060e1a] border border-[#1a2540] text-slate-100 text-sm rounded-lg px-4 py-2.5 placeholder:text-slate-600 focus:outline-none focus:border-indigo-500/60 focus:ring-1 focus:ring-indigo-500/40 transition-all"
                    placeholder="Existing tyre users document ID"
                  />
                  <p className="text-xs text-slate-500 mt-1">
                    Optional: map to an existing tyre user profile ID for automatic provisioning.
                  </p>
                </div>

                <div>
                  <label htmlFor="complianceProfileId" className="block text-xs font-semibold uppercase tracking-widest text-slate-400 mb-1.5">
                    Weekend Availability initials mapping
                  </label>
                  <input
                    id="complianceProfileId"
                    name="complianceProfileId"
                    type="text"
                    value={formData.complianceProfileId || ''}
                    onChange={handleChange}
                    className="w-full bg-[#060e1a] border border-[#1a2540] text-slate-100 text-sm rounded-lg px-4 py-2.5 placeholder:text-slate-600 focus:outline-none focus:border-indigo-500/60 focus:ring-1 focus:ring-indigo-500/40 transition-all"
                    placeholder="e.g. JDO"
                  />
                  <p className="text-xs text-slate-500 mt-1">
                    Map this employee to their Weekend Availability user initials (Firestore document ID).
                  </p>
                </div>


              </div>
            </div>

            {/* Actions */}
            <div className="flex gap-3 mt-8 pt-6 border-t border-[#1a2540]">
              <button
                type="button"
                onClick={() => navigate('/dashboard/users')}
                className="flex-1 px-4 py-2.5 rounded-lg border border-[#1a2540] text-slate-300 text-sm font-medium hover:bg-[#0b1220] transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-gradient-to-r from-indigo-500 to-violet-600 text-white text-sm font-semibold hover:from-indigo-600 hover:to-violet-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {saving ? (
                  <>
                    <Spinner className="animate-spin h-4 w-4" />
                    <span>Saving…</span>
                  </>
                ) : (
                  <span>{isNew ? 'Create User' : 'Save Changes'}</span>
                )}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
