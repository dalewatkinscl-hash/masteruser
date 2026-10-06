/**
 * Shared full-page / section loading indicator.
 */
export default function PageSpinner({
  label = 'Loading…',
  fullPage = false,
  className = '',
}) {
  const content = (
    <div className={`flex flex-col items-center gap-4 ${className}`}>
      <svg
        className="animate-spin h-8 w-8 text-primary"
        xmlns="http://www.w3.org/2000/svg"
        fill="none"
        viewBox="0 0 24 24"
        aria-hidden="true"
      >
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
        <path
          className="opacity-75"
          fill="currentColor"
          d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
        />
      </svg>
      {label ? <p className="text-base-content/60 text-sm">{label}</p> : null}
    </div>
  );

  if (fullPage) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-base-100" role="status" aria-live="polite">
        {content}
      </div>
    );
  }

  return (
    <div className="flex items-center justify-center py-16" role="status" aria-live="polite">
      {content}
    </div>
  );
}
