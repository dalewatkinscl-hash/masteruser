import { useEffect, useState } from 'react';
import { KNOWN_PORTALS } from '../config/portals';
import { readJsonResponse } from '../utils/employeeProfile';
import { sortProfilesAtoZ } from '../utils/portalAccess';

function Spinner({ className }) {
  return (
    <svg className={className} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  );
}

const selectClassName =
  'w-full bg-[#060e1a] border border-[#1a2540] text-slate-100 text-sm rounded-lg px-4 py-2.5 focus:outline-none focus:border-indigo-500/60 focus:ring-1 focus:ring-indigo-500/40 transition-all';

export default function PortalAccessFields({
  formData,
  onChange,
  onPortalRoleChange,
  readOnly = false,
}) {
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
  const hasMentoringAccess = mentoringRole.trim().length > 0;
  const assessmentRole = formData.portalsAccess?.assessment_app || '';
  const hasAssessmentAccess = assessmentRole.trim().length > 0;
  const tyreRole = formData.portalsAccess?.tyre_app || '';
  const hasTyreAccess = tyreRole.trim().length > 0;
  const cpcRole = formData.portalsAccess?.cpc_app || '';
  const showCpcDriverFlag = cpcRole === 'trainer' || cpcRole === 'admin';

  const fetchMentorProfiles = async () => {
    try {
      setMentorProfilesLoading(true);
      setMentorProfilesError('');
      setMentorProfilesAttempted(true);
      const response = await fetch('/api/getMentorProfiles', { credentials: 'include' });
      const data = (await readJsonResponse(response)) || {};
      if (!response.ok) throw new Error(data?.error || 'Failed to load mentor profiles.');
      const profiles = Array.isArray(data.profiles) ? data.profiles : [];
      setMentorProfiles(
        sortProfilesAtoZ(profiles, (p) => p.name || p.username || p.email || p.id || ''),
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
      const response = await fetch('/api/getAssessmentProfiles', { credentials: 'include' });
      const data = (await readJsonResponse(response)) || {};
      if (!response.ok) throw new Error(data?.error || 'Failed to load assessment profiles.');
      const profiles = Array.isArray(data.profiles) ? data.profiles : [];
      setAssessmentProfiles(
        sortProfilesAtoZ(profiles, (p) => p.name || p.fullName || p.email || p.id || ''),
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
        credentials: 'include',
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      const data = (await readJsonResponse(response)) || {};
      if (!response.ok) throw new Error(data?.error || 'Failed to load tyre profiles.');
      const profiles = Array.isArray(data.profiles) ? data.profiles : [];
      setTyreProfiles(sortProfilesAtoZ(profiles, (p) => p.name || p.email || p.id || ''));
    } catch (err) {
      setTyreProfilesError(err.message || 'Could not load tyre profiles.');
      setTyreProfiles([]);
    } finally {
      setTyreProfilesLoading(false);
    }
  };

  useEffect(() => {
    if (!readOnly && hasMentoringAccess && !mentorProfilesAttempted && !mentorProfilesLoading) {
      fetchMentorProfiles();
    }
  }, [hasMentoringAccess, mentorProfilesAttempted, mentorProfilesLoading, readOnly]);

  useEffect(() => {
    if (!readOnly && hasAssessmentAccess && !assessmentProfilesAttempted && !assessmentProfilesLoading) {
      fetchAssessmentProfiles();
    }
  }, [hasAssessmentAccess, assessmentProfilesAttempted, assessmentProfilesLoading, readOnly]);

  useEffect(() => {
    if (!readOnly && hasTyreAccess && !tyreProfilesAttempted && !tyreProfilesLoading) {
      fetchTyreProfiles();
    }
  }, [hasTyreAccess, tyreProfilesAttempted, tyreProfilesLoading, readOnly]);

  const handlePortalChange = (portal, value) => {
    if (readOnly) return;
    onPortalRoleChange(portal, value);
  };

  return (
    <div className="space-y-3">
      {KNOWN_PORTALS.map(({ key: portal, label, roles }) => {
        const role = formData.portalsAccess[portal] || '';
        return (
          <div key={portal}>
            <label className="block text-xs font-semibold uppercase tracking-widest text-slate-400 mb-1.5">
              {label}
            </label>
            {readOnly ? (
              <p className="text-sm text-white">{role ? role.replace(/_/g, ' ') : 'No access'}</p>
            ) : (
              <select
                value={role}
                onChange={(e) => handlePortalChange(portal, e.target.value)}
                className={selectClassName}
              >
                <option value="">No access</option>
                {roles.map(({ value, label: roleLabel }) => (
                  <option key={value} value={value}>{roleLabel}</option>
                ))}
              </select>
            )}
            {portal === 'cpc_app' && cpcRole === 'driver' && !readOnly && (
              <p className="text-xs text-slate-500 mt-1.5">
                Driver role users are always tracked for CPC compliance and training.
              </p>
            )}
            {portal === 'cpc_app' && showCpcDriverFlag && !readOnly && (
              <label className="flex items-start gap-3 mt-3 cursor-pointer">
                <input
                  type="checkbox"
                  name="cpcQualifiesAsDriver"
                  checked={formData.cpcQualifiesAsDriver}
                  onChange={onChange}
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
        );
      })}

      {!readOnly && (
        <>
          <div className="pt-4 border-t border-[#1a2540]">
            <label className="block text-xs font-semibold uppercase tracking-widest text-slate-400 mb-1.5">
              Mentor profile mapping
            </label>
            <div className="flex gap-2 mb-2">
              <button
                type="button"
                onClick={fetchMentorProfiles}
                disabled={mentorProfilesLoading}
                className="px-3 py-1.5 rounded-md border border-[#1a2540] text-slate-300 text-xs font-medium hover:bg-[#0b1220] transition-colors disabled:opacity-50"
              >
                {mentorProfilesLoading ? 'Loading…' : mentorProfiles.length > 0 ? 'Refresh' : 'Load profiles'}
              </button>
              {mentorProfilesError && <span className="text-xs text-red-300 self-center">{mentorProfilesError}</span>}
            </div>
            {mentorProfiles.length > 0 && (
              <select
                value={formData.mentorProfileId || ''}
                onChange={(e) => onChange({ target: { name: 'mentorProfileId', value: e.target.value } })}
                className={`${selectClassName} mb-2`}
              >
                <option value="">No explicit mapping</option>
                {mentorProfiles.map((profile) => (
                  <option key={profile.id} value={profile.id}>
                    {profile.name || profile.username || profile.email || profile.id}
                  </option>
                ))}
              </select>
            )}
            <input
              name="mentorProfileId"
              type="text"
              value={formData.mentorProfileId}
              onChange={onChange}
              className={selectClassName}
              placeholder="Mentor users document ID"
            />
          </div>

          <div className="pt-4">
            <label className="block text-xs font-semibold uppercase tracking-widest text-slate-400 mb-1.5">
              Assessment profile mapping
            </label>
            <div className="flex gap-2 mb-2">
              <button
                type="button"
                onClick={fetchAssessmentProfiles}
                disabled={assessmentProfilesLoading}
                className="px-3 py-1.5 rounded-md border border-[#1a2540] text-slate-300 text-xs font-medium hover:bg-[#0b1220] transition-colors disabled:opacity-50"
              >
                {assessmentProfilesLoading ? 'Loading…' : assessmentProfiles.length > 0 ? 'Refresh' : 'Load profiles'}
              </button>
              {assessmentProfilesError && <span className="text-xs text-red-300 self-center">{assessmentProfilesError}</span>}
            </div>
            {assessmentProfiles.length > 0 && (
              <select
                value={formData.assessmentProfileId || ''}
                onChange={(e) => onChange({ target: { name: 'assessmentProfileId', value: e.target.value } })}
                className={`${selectClassName} mb-2`}
              >
                <option value="">No explicit mapping</option>
                {assessmentProfiles.map((profile) => (
                  <option key={profile.id} value={profile.id}>
                    {profile.name || profile.fullName || profile.email || profile.id}
                  </option>
                ))}
              </select>
            )}
            <input
              name="assessmentProfileId"
              type="text"
              value={formData.assessmentProfileId}
              onChange={onChange}
              className={selectClassName}
              placeholder="Assessment users document ID"
            />
          </div>

          <div className="pt-4">
            <label className="block text-xs font-semibold uppercase tracking-widest text-slate-400 mb-1.5">
              Tyre profile mapping
            </label>
            <div className="flex gap-2 mb-2">
              <button
                type="button"
                onClick={fetchTyreProfiles}
                disabled={tyreProfilesLoading}
                className="px-3 py-1.5 rounded-md border border-[#1a2540] text-slate-300 text-xs font-medium hover:bg-[#0b1220] transition-colors disabled:opacity-50"
              >
                {tyreProfilesLoading ? 'Loading…' : tyreProfiles.length > 0 ? 'Refresh' : 'Load profiles'}
              </button>
              {tyreProfilesError && <span className="text-xs text-red-300 self-center">{tyreProfilesError}</span>}
            </div>
            {tyreProfiles.length > 0 && (
              <select
                value={formData.tyreProfileId || ''}
                onChange={(e) => onChange({ target: { name: 'tyreProfileId', value: e.target.value } })}
                className={`${selectClassName} mb-2`}
              >
                <option value="">No explicit mapping</option>
                {tyreProfiles.map((profile) => (
                  <option key={profile.id} value={profile.id}>
                    {profile.name || profile.email || profile.id}
                  </option>
                ))}
              </select>
            )}
            <input
              name="tyreProfileId"
              type="text"
              value={formData.tyreProfileId}
              onChange={onChange}
              className={selectClassName}
              placeholder="Tyre users document ID"
            />
          </div>

          <div className="pt-4">
            <label className="block text-xs font-semibold uppercase tracking-widest text-slate-400 mb-1.5">
              Weekend Availability initials mapping
            </label>
            <input
              name="complianceProfileId"
              type="text"
              value={formData.complianceProfileId || ''}
              onChange={onChange}
              className={selectClassName}
              placeholder="e.g. JDO"
            />
            <p className="text-xs text-slate-500 mt-1.5">
              Map to the driver&apos;s existing Weekend Availability initials (Firestore document ID).
            </p>
          </div>
        </>
      )}
    </div>
  );
}
