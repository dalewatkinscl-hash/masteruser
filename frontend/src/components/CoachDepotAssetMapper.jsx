/**
 * Placeholder — full asset mapper UI was not present in the working tree.
 * Keeps Fun Admin tab mountable until the mapper is restored.
 */
export default function CoachDepotAssetMapper() {
  return (
    <div className="rounded-xl border border-slate-700 bg-slate-900/60 px-4 py-6 text-sm text-slate-300 space-y-2">
      <p className="font-medium text-white">Coach Depot asset mapper</p>
      <p className="text-slate-400">
        This admin tool is temporarily unavailable in this build. Use the Coach Depot sandbox tab for gameplay testing.
      </p>
    </div>
  );
}
