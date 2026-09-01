import { calculateYearsOfService } from '../utils/employeeProfile';

export default function YearsOfServiceBadge({ startDate, className = '' }) {
  const years = calculateYearsOfService(startDate);
  if (years === null) return null;

  const isGold = years >= 25;
  const label = years === 1 ? '1 year of service' : `${years} years of service`;

  if (isGold) {
    return (
      <span
        className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-bold service-badge-gold text-amber-950 border border-amber-200/80 shadow-lg shadow-amber-500/30 ${className}`}
        title={label}
      >
        {label}
      </span>
    );
  }

  return (
    <span
      className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold bg-slate-500/20 text-slate-200 border border-slate-500/30 ${className}`}
      title={label}
    >
      {label}
    </span>
  );
}
