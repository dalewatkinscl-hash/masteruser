import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { ROLE_PREVIEW_PRESETS, getRolePreviewPreset } from '../utils/rolePreview';

/**
 * Master-admin only: UI preview of another role’s nav and gates.
 * Does not change the API session — writes still use your real admin identity.
 */
export default function RolePreviewToolbar() {
  const {
    realUser,
    rolePreviewId,
    setRolePreview,
    canPreviewRoles,
  } = useAuth();
  const navigate = useNavigate();

  if (!canPreviewRoles || !realUser) return null;

  const active = getRolePreviewPreset(rolePreviewId);
  const previewing = Boolean(rolePreviewId);

  const onChange = (event) => {
    const nextId = event.target.value || '';
    setRolePreview(nextId);
    const preset = getRolePreviewPreset(nextId);
    if (preset.homePath) {
      navigate(preset.homePath, preset.homeState ? { state: preset.homeState } : undefined);
    }
  };

  return (
    <div
      className={`border-b px-3 sm:px-4 py-2 flex flex-wrap items-center gap-2 sm:gap-3 text-xs relative z-30 ${
        previewing
          ? 'border-amber-500/40 bg-amber-500/15 text-amber-100'
          : 'border-base-300 bg-base-300/40 text-base-content/80'
      }`}
      role="region"
      aria-label="Role preview"
    >
      <span className="font-semibold tracking-wide uppercase text-[10px] opacity-80 shrink-0">
        View as
      </span>
      <label className="flex items-center gap-2 min-w-0 flex-1 sm:flex-none">
        <span className="sr-only">Role preview</span>
        <select
          className="select select-bordered select-xs bg-base-100 text-base-content max-w-full sm:min-w-[14rem]"
          value={rolePreviewId || ''}
          onChange={onChange}
        >
          {ROLE_PREVIEW_PRESETS.map((preset) => (
            <option key={preset.id || 'mine'} value={preset.id}>
              {preset.label}
            </option>
          ))}
        </select>
      </label>
      <p className="text-[11px] opacity-90 min-w-0 flex-1 basis-full sm:basis-auto">
        {active.hint}
        {previewing ? ' · UI only — APIs still use your admin session.' : ''}
      </p>
      {previewing && (
        <button
          type="button"
          className="btn btn-ghost btn-xs shrink-0"
          onClick={() => {
            setRolePreview('');
            navigate('/dashboard/profile');
          }}
        >
          Exit preview
        </button>
      )}
    </div>
  );
}
