import { useEffect, useMemo, useState } from 'react';
import YearsOfServiceBadge from './YearsOfServiceBadge';
import BusinessCommsEmailSelector from './BusinessCommsEmailSelector';
import BirthdayCelebration from './BirthdayCelebration';
import { badgeMeta } from './KudosPanel';
import { KudosBadgeGraphic } from './kudosGraphics';
import { PORTAL_THEME_OPTIONS } from '../context/ThemeContext';
import {
  createEmptyEmployeeProfile,
  formatBirthdaySummary,
  formatDisplayDate,
  normalizeBusinessCommsEmail,
  phoneHref,
  readJsonResponse,
  resolveBusinessContactEmail,
} from '../utils/employeeProfile';
import { SHOW_HR_RECORDS } from '../utils/featureFlags';
import { useLanguage } from '../context/LanguageContext';

const THEME_KEYS = new Set(PORTAL_THEME_OPTIONS.map((t) => t.key));
const THEME_LABELS = Object.fromEntries(PORTAL_THEME_OPTIONS.map((t) => [t.key, t.label]));

function normalizeThemeKey(value) {
  const theme = String(value || '').trim().toLowerCase();
  return THEME_KEYS.has(theme) ? theme : '';
}

function PhoneIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path
        d="M6.5 3h3l1.5 5-2 1.2a12.5 12.5 0 0 0 5.8 5.8L15 13l5 1.5v3A2 2 0 0 1 18 20.2 16 16 0 0 1 3.8 6 2 2 0 0 1 6.5 3Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function MailIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="2" y="4" width="20" height="16" rx="2" stroke="currentColor" strokeWidth="1.5" />
      <path d="m2 7 10 7 10-7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function Field({ label, value, children, className = '' }) {
  return (
    <div className={`min-w-0 ${className}`}>
      <p className="text-[11px] font-medium uppercase tracking-wider text-slate-500 mb-1">{label}</p>
      {children || <p className="text-sm text-white break-words">{value || '—'}</p>}
    </div>
  );
}

function Section({ title, children }) {
  return (
    <div className="card bg-base-100 shadow-xl border border-base-300 overflow-hidden">
      <div className="px-5 py-3 border-b border-base-300 bg-base-200/40">
        <h3 className="text-[11px] font-mono font-medium text-base-content/60 uppercase tracking-widest">{title}</h3>
      </div>
      <div className="card-body p-5">{children}</div>
    </div>
  );
}

function inputClassName(disabled) {
  return `input input-bordered input-sm w-full ${disabled ? 'input-disabled opacity-70 cursor-not-allowed' : ''}`;
}

function PhoneCallButton({ phone, label }) {
  const { t } = useLanguage();
  const href = phoneHref(phone);
  if (!href) return null;
  const text = label || t('card.call');

  return (
    <a
      href={href}
      className="btn btn-success btn-outline btn-xs gap-1.5"
    >
      <PhoneIcon className="w-3.5 h-3.5" />
      {text}
    </a>
  );
}

function ProfileSummary({
  profile,
  employee,
  editable,
  form,
  fullName,
  onFullNameChange,
  onFieldChange,
  isDriver = false,
  kudosToday = [],
}) {
  const { t } = useLanguage();
  const displayPhone = editable.phoneNumber ? form.phoneNumber : employee.phoneNumber;
  const displayPersonalEmail = editable.personalEmail ? form.personalEmail : employee.personalEmail;
  const displayDob = editable.hr ? form.dateOfBirth : employee.dateOfBirth;
  const displayName = editable.hr ? fullName : (profile?.fullName || '');
  const birthday = formatBirthdaySummary(displayDob);
  const isBirthdayToday = birthday?.daysUntil === 0;

  return (
    <div className={`cl-card ${isBirthdayToday ? 'relative overflow-visible' : 'overflow-hidden'}`}>
      <div className="h-px w-full bg-gradient-to-r from-transparent via-[#5E6AD2]/60 to-transparent" />
      <div className="px-6 py-5">
        {isBirthdayToday && (
          <BirthdayCelebration fullName={displayName || profile?.fullName} age={birthday.age} />
        )}

        <div className="flex flex-wrap items-start justify-between gap-4 mb-5">
          <div>
            <div className="flex flex-wrap items-center gap-3">
              {editable.hr ? (
                <input
                  className={`${inputClassName(false)} text-2xl font-semibold tracking-tight text-cl-fg max-w-md`}
                  value={fullName}
                  onChange={(e) => onFullNameChange?.(e.target.value)}
                  placeholder={t('card.employeeName')}
                  aria-label={t('card.employeeName')}
                />
              ) : (
                <h2 className="text-2xl font-semibold tracking-tight text-cl-fg">{profile?.fullName || '—'}</h2>
              )}
              <YearsOfServiceBadge startDate={employee.startDate} />
              {isBirthdayToday && (
                <span className="px-2.5 py-1 rounded-full text-xs font-medium bg-pink-500/20 text-pink-200 border border-pink-400/35">
                  {t('card.birthdayToday')}
                </span>
              )}
            </div>
            <p className="text-sm text-cl-muted mt-1">
              {[employee.jobRole, employee.department].filter(Boolean).join(' · ') || '—'}
            </p>
            {kudosToday.length > 0 && (
              <div className="mt-4 flex flex-wrap gap-4">
                {kudosToday.slice(0, 4).map((item) => {
                  const meta = badgeMeta(item.badgeType);
                  return (
                    <div key={item.id} className="flex items-start gap-3 max-w-xs">
                      <KudosBadgeGraphic
                        badgeType={item.badgeType}
                        size="md"
                        gifUrl={item.gifUrl}
                        title={`${item.badgeLabel || meta.label} from ${item.fromName}`}
                      />
                      <div className="min-w-0 pt-0.5">
                        <p className="text-xs font-semibold text-cl-fg">
                          {item.badgeLabel || meta.label}
                        </p>
                        <p className="text-[11px] text-cl-muted mt-0.5">{t('card.from', { name: item.fromName })}</p>
                        <p className="text-xs text-slate-400 mt-1 leading-relaxed line-clamp-3">
                          {item.message}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {profile?.isActive ? (
              <span className="px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                {t('card.active')}
              </span>
            ) : (
              <span className="px-2.5 py-1 rounded-full text-xs font-medium bg-white/5 text-cl-muted border border-cl-border">
                {t('card.inactive')}
              </span>
            )}
            {displayPhone && <PhoneCallButton phone={displayPhone} />}
          </div>
        </div>

        <div className={`grid grid-cols-1 sm:grid-cols-2 gap-4 ${isDriver ? 'lg:grid-cols-3 xl:grid-cols-4' : 'lg:grid-cols-4 xl:grid-cols-5'}`}>
          {!isDriver && (
            <Field label={t('card.workEmail')}>
              <div className="flex items-center gap-2 text-sm text-cl-fg break-all">
                <MailIcon className="w-4 h-4 text-cl-muted flex-shrink-0" />
                {profile?.email || '—'}
              </div>
            </Field>
          )}

          <Field label={isDriver ? t('card.email') : t('card.personalEmail')}>
            {editable.personalEmail ? (
              <input
                type="email"
                className={inputClassName(false)}
                value={form.personalEmail}
                onChange={(e) => onFieldChange('personalEmail', e.target.value)}
                placeholder={isDriver ? 'your@email.com' : undefined}
              />
            ) : (
              <div className="flex items-center gap-2 text-sm text-cl-fg break-all">
                <MailIcon className="w-4 h-4 text-cl-muted flex-shrink-0" />
                {displayPersonalEmail || '—'}
              </div>
            )}
          </Field>

          <Field label={t('card.phone')}>
            {editable.phoneNumber ? (
              <input
                className={inputClassName(false)}
                value={form.phoneNumber}
                onChange={(e) => onFieldChange('phoneNumber', e.target.value)}
              />
            ) : (
              <p className="text-sm text-cl-fg">{displayPhone || '—'}</p>
            )}
          </Field>

          <Field label={t('card.dob')}>
            {editable.hr ? (
              <input
                type="date"
                className={inputClassName(false)}
                value={form.dateOfBirth || ''}
                onChange={(e) => onFieldChange('dateOfBirth', e.target.value)}
              />
            ) : (
              <p className="text-sm text-cl-fg">{formatDisplayDate(displayDob)}</p>
            )}
          </Field>

          <Field label={t('card.age')}>
            <p className="text-sm text-cl-fg">
              {birthday ? t('card.years', { count: birthday.age }) : '—'}
            </p>
            {birthday && (
              <p className="text-xs text-cl-accent mt-0.5">
                {birthday.daysUntil === 0
                  ? t('card.birthdayToday')
                  : birthday.daysUntil === 1
                    ? t('card.birthdayTomorrow')
                    : t('card.birthdayInDays', { count: birthday.daysUntil })}
              </p>
            )}
          </Field>
        </div>
      </div>
    </div>
  );
}

export default function EmployeeProfileCard({
  uid,
  embedded = false,
  sections = null,
  className = '',
  onProfileSaved,
}) {
  const visibleSections = useMemo(() => {
    const all = ['summary', 'communications', 'employment', 'hrRecords', 'address', 'nextOfKin'];
    if (!sections || sections === 'all') return new Set(all);
    return new Set(sections);
  }, [sections]);

  const show = (key) => visibleSections.has(key);
  const [profile, setProfile] = useState(null);
  const [permissions, setPermissions] = useState(null);
  const [kudosToday, setKudosToday] = useState([]);
  const [kudosHistory, setKudosHistory] = useState([]);
  const [form, setForm] = useState(createEmptyEmployeeProfile());
  const [businessCommsEmail, setBusinessCommsEmail] = useState('work');
  const [fullName, setFullName] = useState('');
  const [themePreference, setThemePreference] = useState('');
  const [themeEnforced, setThemeEnforced] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const { t, locale } = useLanguage();

  const canEditAll = permissions?.canEditAll;
  const canEditSelfService = permissions?.canEditSelfService;
  const isEditing = canEditSelfService;

  const editable = useMemo(
    () => ({
      hr: Boolean(canEditAll),
      phoneNumber: isEditing,
      personalEmail: isEditing,
      address: isEditing,
      nextOfKin: isEditing,
    }),
    [canEditAll, isEditing],
  );

  useEffect(() => {
    let cancelled = false;

    const loadProfile = async () => {
      try {
        setLoading(true);
        setError('');

        const response = await fetch(`/api/getEmployeeProfile/${uid}`, { credentials: 'include' });
        const data = (await readJsonResponse(response)) || {};

        if (!response.ok) {
          throw new Error(data.error || t('card.loadFailed'));
        }

        if (cancelled) return;

        setProfile(data.profile);
        setPermissions(data.permissions);
        setFullName(String(data.profile?.fullName || '').trim());
        setKudosToday(Array.isArray(data.kudosToday) ? data.kudosToday : []);
        setKudosHistory(Array.isArray(data.kudosHistory) ? data.kudosHistory : []);
        const loadedProfile = {
          ...createEmptyEmployeeProfile(),
          ...data.profile?.employeeProfile,
          address: {
            ...createEmptyEmployeeProfile().address,
            ...data.profile?.employeeProfile?.address,
          },
          nextOfKin: {
            ...createEmptyEmployeeProfile().nextOfKin,
            ...data.profile?.employeeProfile?.nextOfKin,
          },
        };
        setForm(loadedProfile);

        // Prefer explicit preference; if an older API omits it, infer from contactEmail.
        let loadedComms = normalizeBusinessCommsEmail(data.profile?.businessCommsEmail);
        if (
          data.profile?.businessCommsEmail !== 'personal'
          && data.profile?.businessCommsEmail !== 'work'
        ) {
          const contact = String(data.profile?.contactEmail || '').trim().toLowerCase();
          const personal = String(loadedProfile.personalEmail || '').trim().toLowerCase();
          const work = String(data.profile?.email || '').trim().toLowerCase();
          if (personal && contact && contact === personal && contact !== work) {
            loadedComms = 'personal';
          }
        }
        setBusinessCommsEmail(loadedComms);
        setThemePreference(normalizeThemeKey(data.profile?.themePreference));
        setThemeEnforced(data.profile?.themeEnforced === true);
      } catch (err) {
        if (!cancelled) setError(err.message || t('card.loadFailed'));
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    if (uid) loadProfile();

    return () => {
      cancelled = true;
    };
  }, [uid, t]);

  const updateField = (key, value) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    const driver = Boolean(form.drivingStaff || profile?.employeeProfile?.drivingStaff);
    if (
      key === 'personalEmail'
      && !value.trim()
      && businessCommsEmail === 'personal'
      && !driver
    ) {
      setBusinessCommsEmail('work');
    }
  };

  const updateAddress = (key, value) => {
    setForm((prev) => ({
      ...prev,
      address: { ...prev.address, [key]: value },
    }));
  };

  const updateNextOfKin = (key, value) => {
    setForm((prev) => ({
      ...prev,
      nextOfKin: { ...prev.nextOfKin, [key]: value },
    }));
  };

  const handleSave = async () => {
    setSaving(true);
    setError('');
    setSuccess('');

    const driver = Boolean(form.drivingStaff || profile?.employeeProfile?.drivingStaff);

    try {
      const response = await fetch('/api/updateEmployeeProfile', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          uid,
          employeeProfile: form,
          businessCommsEmail: driver ? 'personal' : businessCommsEmail,
          fullName: canEditAll ? fullName : undefined,
          themePreference,
          themeEnforced,
        }),
      });

      const data = (await readJsonResponse(response)) || {};
      if (!response.ok) {
        throw new Error(data.error || t('card.saveFailed'));
      }

      setProfile(data.profile);
      setFullName(String(data.profile?.fullName || '').trim());
      setBusinessCommsEmail(normalizeBusinessCommsEmail(data.profile?.businessCommsEmail));
      setThemePreference(normalizeThemeKey(data.profile?.themePreference));
      setThemeEnforced(data.profile?.themeEnforced === true);
      setForm({
        ...createEmptyEmployeeProfile(),
        ...data.profile?.employeeProfile,
        address: {
          ...createEmptyEmployeeProfile().address,
          ...data.profile?.employeeProfile?.address,
        },
        nextOfKin: {
          ...createEmptyEmployeeProfile().nextOfKin,
          ...data.profile?.employeeProfile?.nextOfKin,
        },
      });
      setSuccess('Profile saved successfully.');
      if (typeof onProfileSaved === 'function') {
        onProfileSaved(data.profile);
      }
    } catch (err) {
      setError(err.message || t('card.saveFailed'));
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <p className="text-slate-400 text-sm">{t('card.loading')}</p>
      </div>
    );
  }

  if (error && !profile) {
    return (
      <div className="bg-red-500/10 border border-red-500/25 rounded-lg p-4">
        <p className="text-red-300 text-sm">{error}</p>
      </div>
    );
  }

  const employee = profile?.employeeProfile || {};
  const isDriver = Boolean(form.drivingStaff ?? employee.drivingStaff);
  const resolvedContactEmail = resolveBusinessContactEmail({
    email: profile?.email,
    businessCommsEmail: isDriver ? 'personal' : businessCommsEmail,
    employeeProfile: form,
  });
  const wrapperClass = `${embedded ? 'space-y-4' : 'w-full px-8 py-6 space-y-4'} ${className}`.trim();
  const showEmployment = show('employment');
  // Hidden company-wide for now (SHOW_HR_RECORDS). When re-enabled, drivers
  // still do not see HR records on their own profile; HR staff still can.
  const showHrRecords =
    SHOW_HR_RECORDS
    && show('hrRecords')
    && (canEditAll || (permissions?.isOwnProfile && !isDriver));
  const showAddress = show('address');
  const showNextOfKin = show('nextOfKin');
  const showCommunications = show('communications') && !isDriver;

  return (
    <div className={wrapperClass}>
      {error && (
        <div className="bg-red-500/10 border border-red-500/25 rounded-lg p-4">
          <p className="text-red-300 text-sm">{error}</p>
        </div>
      )}

      {success && (
        <div className="bg-emerald-500/10 border border-emerald-500/25 rounded-lg p-4">
          <p className="text-emerald-300 text-sm">{success}</p>
        </div>
      )}

      {show('summary') && (
        <ProfileSummary
          profile={profile}
          employee={employee}
          editable={editable}
          form={form}
          fullName={fullName}
          onFullNameChange={setFullName}
          onFieldChange={updateField}
          isDriver={isDriver}
          kudosToday={kudosToday}
        />
      )}

      {show('summary') && (
        <Section title={t('card.kudosHistory')}>
          {kudosHistory.length === 0 ? (
            <p className="text-sm text-cl-muted">{t('card.noKudos')}</p>
          ) : (
            <ul className="space-y-3">
              {kudosHistory.map((item) => {
                const meta = badgeMeta(item.badgeType);
                const when = item.dayKey
                  ? formatDisplayDate(item.dayKey)
                  : (item.createdAt
                    ? new Date(item.createdAt).toLocaleDateString(locale, {
                      day: 'numeric',
                      month: 'short',
                      year: 'numeric',
                    })
                    : '—');
                return (
                  <li
                    key={item.id}
                    className="flex gap-3 rounded-xl border border-cl-border bg-white/[0.02] px-3 py-3"
                  >
                    <KudosBadgeGraphic badgeType={item.badgeType} size="sm" gifUrl={item.gifUrl} />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-medium text-cl-fg">
                          {item.badgeLabel || meta.label}
                        </span>
                        <span className="text-xs text-cl-muted">
                          {t('card.fromWhen', { name: item.fromName, when })}
                          {kudosToday.some((row) => row.id === item.id) ? ` · ${t('card.today')}` : ''}
                        </span>
                      </div>
                      <p className="text-sm text-slate-400 mt-1 leading-relaxed">{item.message}</p>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </Section>
      )}

      {showCommunications && (
        <Section title={t('card.businessComms')}>
          <BusinessCommsEmailSelector
            workEmail={profile?.email}
            personalEmail={form.personalEmail}
            value={businessCommsEmail}
            onChange={setBusinessCommsEmail}
            disabled={!isEditing}
          />
          {!isEditing && (
            <p className="text-xs text-cl-muted mt-3">
              {t('card.currentlySending', { email: resolvedContactEmail || '—' })}
            </p>
          )}
        </Section>
      )}

      {isDriver && show('summary') && (
        <p className="text-xs text-cl-muted -mt-2 px-1">
          {t('card.driverNotifications')}
        </p>
      )}

      {(showEmployment || showHrRecords) && (
        <div className={`grid grid-cols-1 gap-4 ${showEmployment && showHrRecords ? 'xl:grid-cols-2' : ''}`}>
          {showEmployment && (
            <Section title={t('card.employment')}>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                <Field label={t('card.jobTitle')}>
                  {editable.hr ? (
                    <input
                      className={inputClassName(false)}
                      value={form.jobRole}
                      onChange={(e) => updateField('jobRole', e.target.value)}
                    />
                  ) : (
                    <p className="text-sm text-white">{employee.jobRole || '—'}</p>
                  )}
                </Field>
                <Field label={t('card.department')}>
                  {editable.hr ? (
                    <input
                      className={inputClassName(false)}
                      value={form.department}
                      onChange={(e) => updateField('department', e.target.value)}
                    />
                  ) : (
                    <p className="text-sm text-white">{employee.department || '—'}</p>
                  )}
                </Field>
                <Field label={t('card.manager')}>
                  {editable.hr ? (
                    <input
                      className={inputClassName(false)}
                      value={form.managerName}
                      onChange={(e) => updateField('managerName', e.target.value)}
                    />
                  ) : (
                    <p className="text-sm text-white">{employee.managerName || '—'}</p>
                  )}
                </Field>
                <Field label={t('card.contract')}>
                  {editable.hr ? (
                    <input
                      className={inputClassName(false)}
                      value={form.contractType}
                      onChange={(e) => updateField('contractType', e.target.value)}
                      placeholder="Full Time / Part Time"
                    />
                  ) : (
                    <p className="text-sm text-white">{employee.contractType || '—'}</p>
                  )}
                </Field>
                <Field label={t('card.annualHours')}>
                  {editable.hr ? (
                    <input
                      type="number"
                      min="0"
                      step="1"
                      className={inputClassName(false)}
                      value={form.annualContractedHours || ''}
                      onChange={(e) => updateField(
                        'annualContractedHours',
                        e.target.value === '' ? 0 : Number(e.target.value),
                      )}
                      placeholder="e.g. 1000 (FT = 2210)"
                    />
                  ) : (
                    <p className="text-sm text-white">
                      {employee.annualContractedHours
                        ? t('card.hrsYear', { count: employee.annualContractedHours })
                        : '—'}
                    </p>
                  )}
                </Field>
                <Field label={t('card.startDate')} value={formatDisplayDate(employee.startDate)}>
                  {editable.hr ? (
                    <input
                      type="date"
                      className={inputClassName(false)}
                      value={form.startDate || ''}
                      onChange={(e) => updateField('startDate', e.target.value)}
                    />
                  ) : null}
                </Field>
                <Field label={t('card.drivingStaff')} value={employee.drivingStaff ? t('card.yes') : t('card.no')}>
                  {editable.hr ? (
                    <select
                      className={inputClassName(false)}
                      value={form.drivingStaff ? 'yes' : 'no'}
                      onChange={(e) => updateField('drivingStaff', e.target.value === 'yes')}
                    >
                      <option value="yes">{t('card.yes')}</option>
                      <option value="no">{t('card.no')}</option>
                    </select>
                  ) : null}
                </Field>
                <Field label={t('card.computerUser')} value={employee.computerUser ? t('card.yes') : t('card.no')}>
                  {editable.hr ? (
                    <select
                      className={inputClassName(false)}
                      value={form.computerUser ? 'yes' : 'no'}
                      onChange={(e) => updateField('computerUser', e.target.value === 'yes')}
                    >
                      <option value="yes">{t('card.yes')}</option>
                      <option value="no">{t('card.no')}</option>
                    </select>
                  ) : null}
                </Field>
                <Field label={t('card.emergencyPhoneCover')} value={employee.emergencyPhoneCover ? t('card.yes') : t('card.no')}>
                  {editable.hr ? (
                    <select
                      className={inputClassName(false)}
                      value={form.emergencyPhoneCover ? 'yes' : 'no'}
                      onChange={(e) => updateField('emergencyPhoneCover', e.target.value === 'yes')}
                    >
                      <option value="yes">{t('card.yes')}</option>
                      <option value="no">{t('card.no')}</option>
                    </select>
                  ) : null}
                </Field>
                <Field label={t('card.canIssueKudos')} value={employee.canIssueKudos ? t('card.yes') : t('card.no')}>
                  {editable.hr ? (
                    <select
                      className={inputClassName(false)}
                      value={form.canIssueKudos ? 'yes' : 'no'}
                      onChange={(e) => updateField('canIssueKudos', e.target.value === 'yes')}
                    >
                      <option value="yes">{t('card.yes')}</option>
                      <option value="no">{t('card.no')}</option>
                    </select>
                  ) : null}
                </Field>
                <Field
                  label={t('card.portalTheme')}
                  value={THEME_LABELS[themePreference] || t('card.userChoice')}
                >
                  {editable.hr ? (
                    <div className="space-y-2">
                      <select
                        className="select select-bordered select-sm w-full"
                        value={themePreference}
                        onChange={(e) => setThemePreference(e.target.value)}
                      >
                        <option value="">{t('card.userChoice')}</option>
                        {PORTAL_THEME_OPTIONS.map((option) => (
                          <option key={option.key} value={option.key}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                      <label className="label cursor-pointer justify-start gap-2 py-0">
                        <input
                          type="checkbox"
                          className="checkbox checkbox-sm checkbox-primary"
                          checked={themeEnforced}
                          onChange={(e) => setThemeEnforced(e.target.checked)}
                        />
                        <span className="label-text text-xs">{t('card.enforceTheme')}</span>
                      </label>
                    </div>
                  ) : null}
                </Field>
                <Field label={t('card.equipment')}>
                  {editable.hr ? (
                    <input
                      className={inputClassName(false)}
                      value={form.computerAsset}
                      onChange={(e) => updateField('computerAsset', e.target.value)}
                    />
                  ) : (
                    <p className="text-sm text-white">{employee.computerAsset || '—'}</p>
                  )}
                </Field>
              </div>
            </Section>
          )}

          {showHrRecords && (
            <Section title={t('card.hrRecords')}>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                <Field label={t('card.lastAppraisal')} value={formatDisplayDate(employee.lastAppraisalDate)}>
                  {editable.hr ? (
                    <input
                      type="date"
                      className={inputClassName(false)}
                      value={form.lastAppraisalDate || ''}
                      onChange={(e) => updateField('lastAppraisalDate', e.target.value)}
                    />
                  ) : null}
                </Field>
                <Field
                  label={t('card.daysSinceAppraisal')}
                  value={
                    employee.daysSinceLastAppraisal === null || employee.daysSinceLastAppraisal === undefined
                      ? '—'
                      : String(employee.daysSinceLastAppraisal)
                  }
                />
                <Field label={t('card.lastAccident')} value={formatDisplayDate(employee.lastAtFaultAccidentDate)}>
                  {editable.hr ? (
                    <input
                      type="date"
                      className={inputClassName(false)}
                      value={form.lastAtFaultAccidentDate || ''}
                      onChange={(e) => updateField('lastAtFaultAccidentDate', e.target.value)}
                    />
                  ) : null}
                </Field>
              </div>
            </Section>
          )}
        </div>
      )}

      {(showAddress || showNextOfKin) && (
        <div className={`grid grid-cols-1 gap-4 ${showAddress && showNextOfKin ? 'xl:grid-cols-2' : ''}`}>
          {showAddress && (
            <Section title={t('card.homeAddress')}>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {[
                  ['line1', t('card.line1')],
                  ['line2', t('card.line2')],
                  ['city', t('card.city')],
                  ['county', t('card.county')],
                  ['postcode', t('card.postcode')],
                ].map(([key, label]) => (
                  <Field key={key} label={label} className={key === 'line1' ? 'sm:col-span-2' : ''}>
                    {editable.address ? (
                      <input
                        className={inputClassName(false)}
                        value={form.address?.[key] || ''}
                        onChange={(e) => updateAddress(key, e.target.value)}
                      />
                    ) : (
                      <p className="text-sm text-white">{employee.address?.[key] || '—'}</p>
                    )}
                  </Field>
                ))}
              </div>
            </Section>
          )}

          {showNextOfKin && (
            <Section title={t('card.nextOfKin')}>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Field label={t('card.name')}>
                  {editable.nextOfKin ? (
                    <input
                      className={inputClassName(false)}
                      value={form.nextOfKin?.name || ''}
                      onChange={(e) => updateNextOfKin('name', e.target.value)}
                    />
                  ) : (
                    <p className="text-sm text-white">{employee.nextOfKin?.name || '—'}</p>
                  )}
                </Field>
                <Field label={t('card.relationship')}>
                  {editable.nextOfKin ? (
                    <input
                      className={inputClassName(false)}
                      value={form.nextOfKin?.relationship || ''}
                      onChange={(e) => updateNextOfKin('relationship', e.target.value)}
                    />
                  ) : (
                    <p className="text-sm text-white">{employee.nextOfKin?.relationship || '—'}</p>
                  )}
                </Field>
                <Field label={t('card.phone')}>
                  <div className="flex items-center gap-2 flex-wrap">
                    {editable.nextOfKin ? (
                      <input
                        className={inputClassName(false)}
                        value={form.nextOfKin?.phoneNumber || ''}
                        onChange={(e) => updateNextOfKin('phoneNumber', e.target.value)}
                      />
                    ) : (
                      <p className="text-sm text-white">{employee.nextOfKin?.phoneNumber || '—'}</p>
                    )}
                    {employee.nextOfKin?.phoneNumber && (
                      <PhoneCallButton phone={employee.nextOfKin.phoneNumber} />
                    )}
                  </div>
                </Field>
                <Field label={t('card.email')}>
                  {editable.nextOfKin ? (
                    <input
                      type="email"
                      className={inputClassName(false)}
                      value={form.nextOfKin?.email || ''}
                      onChange={(e) => updateNextOfKin('email', e.target.value)}
                    />
                  ) : (
                    <p className="text-sm text-white">{employee.nextOfKin?.email || '—'}</p>
                  )}
                </Field>
                <Field label={t('card.address')} className="sm:col-span-2">
                  {editable.nextOfKin ? (
                    <textarea
                      rows={2}
                      className={inputClassName(false)}
                      value={form.nextOfKin?.address || ''}
                      onChange={(e) => updateNextOfKin('address', e.target.value)}
                    />
                  ) : (
                    <p className="text-sm text-white">{employee.nextOfKin?.address || '—'}</p>
                  )}
                </Field>
              </div>
            </Section>
          )}
        </div>
      )}

      {canEditSelfService && (
        <div className="flex justify-end">
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="cl-btn-primary disabled:opacity-50"
          >
            {saving ? t('profile.saving') : t('card.saveProfile')}
          </button>
        </div>
      )}
    </div>
  );
}
