import { useId } from 'react';
import { resolveBusinessContactEmail } from '../utils/employeeProfile';

function MailIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="2" y="4" width="20" height="16" rx="2" stroke="currentColor" strokeWidth="1.5" />
      <path d="m2 7 10 7 10-7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

export default function BusinessCommsEmailSelector({
  workEmail,
  personalEmail,
  value,
  onChange,
  disabled = false,
  className = '',
}) {
  const groupName = `businessCommsEmail-${useId()}`;
  const resolvedContactEmail = resolveBusinessContactEmail({
    email: workEmail,
    businessCommsEmail: value,
    employeeProfile: { personalEmail },
  });

  const personalAvailable = Boolean((personalEmail || '').trim());

  return (
    <div className={className}>
      <p className="text-xs text-slate-400 mb-3">
        Choose which email linked portals use for training invites and business notifications.
      </p>
      <div className="space-y-2">
        <label className={`flex items-start gap-3 rounded-lg border px-3 py-2.5 cursor-pointer transition-colors ${
          value === 'work'
            ? 'border-indigo-500/50 bg-indigo-500/10'
            : 'border-[#1a2540] bg-[#060e1a]/40 hover:border-[#24304d]'
        } ${disabled ? 'opacity-70 cursor-not-allowed' : ''}`}
        >
          <input
            type="radio"
            name={groupName}
            value="work"
            checked={value === 'work'}
            onChange={() => onChange('work')}
            disabled={disabled}
            className="mt-1"
          />
          <div className="min-w-0">
            <p className="text-sm font-medium text-white">Work email</p>
            <p className="text-sm text-slate-400 break-all">{workEmail || '—'}</p>
          </div>
        </label>

        <label className={`flex items-start gap-3 rounded-lg border px-3 py-2.5 transition-colors ${
          personalAvailable ? 'cursor-pointer' : 'cursor-not-allowed opacity-60'
        } ${
          value === 'personal'
            ? 'border-indigo-500/50 bg-indigo-500/10'
            : 'border-[#1a2540] bg-[#060e1a]/40 hover:border-[#24304d]'
        } ${disabled ? 'opacity-70 cursor-not-allowed' : ''}`}
        >
          <input
            type="radio"
            name={groupName}
            value="personal"
            checked={value === 'personal'}
            onChange={() => onChange('personal')}
            disabled={disabled || !personalAvailable}
            className="mt-1"
          />
          <div className="min-w-0">
            <p className="text-sm font-medium text-white">Personal email</p>
            <p className="text-sm text-slate-400 break-all">{personalEmail || 'Add a personal email above to enable this option'}</p>
          </div>
        </label>
      </div>

      <div className="mt-4 flex items-start gap-2 rounded-lg border border-[#1a2540] bg-[#060e1a]/60 px-3 py-2.5">
        <MailIcon className="w-4 h-4 text-indigo-300 mt-0.5 flex-shrink-0" />
        <div>
          <p className="text-[11px] font-medium uppercase tracking-wider text-slate-500">Portals will use</p>
          <p className="text-sm text-white break-all">{resolvedContactEmail || '—'}</p>
        </div>
      </div>
    </div>
  );
}
