export default function CaseGuidePanel({ guide, stageLabel }) {
  if (!guide) return null;

  return (
    <aside className="bg-[#0b1220] border border-[#1a2540] rounded-xl p-5 space-y-4">
      <div>
        <p className="text-xs uppercase tracking-wide text-slate-500">Current step</p>
        <h2 className="text-lg font-semibold text-white mt-1">{guide.title || stageLabel}</h2>
      </div>

      {guide.doNext && (
        <div className="rounded-lg border border-indigo-500/30 bg-indigo-500/10 p-3">
          <p className="text-xs uppercase text-indigo-300 mb-1">Do this next</p>
          <p className="text-sm text-indigo-100">{guide.doNext}</p>
        </div>
      )}

      {Array.isArray(guide.howTo) && guide.howTo.length > 0 && (
        <div>
          <p className="text-xs uppercase text-slate-500 mb-2">How to</p>
          <ol className="list-decimal list-inside space-y-1.5 text-sm text-slate-300">
            {guide.howTo.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
        </div>
      )}

      {guide.acasTip && (
        <div className="rounded-lg border border-amber-500/25 bg-amber-500/10 p-3 space-y-2">
          <p className="text-xs uppercase text-amber-300">Acas guidance</p>
          <p className="text-sm text-amber-50/90">{guide.acasTip}</p>
          {guide.acasUrl && (
            <a
              href={guide.acasUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-block text-xs text-amber-200 underline hover:text-amber-100"
            >
              View Acas Code of Practice
            </a>
          )}
        </div>
      )}

      {guide.disclaimer && (
        <p className="text-[11px] leading-relaxed text-slate-500">{guide.disclaimer}</p>
      )}
    </aside>
  );
}
