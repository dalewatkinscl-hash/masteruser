import { useEffect, useMemo, useState } from 'react';
import {
  KNOWN_PORTALS,
  PORTAL_KEYS,
  buildPortalsAccessFromMatrixRow,
  defaultRoleForPortal,
  matrixRowFromUser,
} from '../config/portals';
import { getComplianceProfileId } from '../utils/portalAccess';
import WorkspaceTabs from '../components/WorkspaceTabs';

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
  if (!contentType.includes('application/json')) return null;
  try {
    return await res.json();
  } catch {
    return null;
  }
}

function rowsEqual(a, b) {
  return PORTAL_KEYS.every((key) => (a[key] || '') === (b[key] || ''));
}

function deriveInitialsFromName(fullName) {
  const parts = String(fullName || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (parts.length === 0) return '';
  if (parts.length === 1) {
    return parts[0].replace(/[^a-zA-Z]/g, '').slice(0, 3).toUpperCase();
  }
  const letters = parts
    .map((part) => part.replace(/[^a-zA-Z]/g, '')[0] || '')
    .join('')
    .toUpperCase();
  return letters.slice(0, 3);
}

function normalizeInitials(value) {
  return String(value || '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 6);
}

export default function PortalAccessMatrix() {
  const [users, setUsers] = useState([]);
  const [accessByUid, setAccessByUid] = useState({});
  const [initialByUid, setInitialByUid] = useState({});
  const [complianceInitialsByUid, setComplianceInitialsByUid] = useState({});
  const [initialComplianceInitialsByUid, setInitialComplianceInitialsByUid] = useState({});
  const [columnDefaults, setColumnDefaults] = useState(() =>
    Object.fromEntries(PORTAL_KEYS.map((key) => [key, defaultRoleForPortal(key)])),
  );
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [search, setSearch] = useState('');
  const [activeOnly, setActiveOnly] = useState(true);
  const [focusPortal, setFocusPortal] = useState('compliance_app');
  const [focusRole, setFocusRole] = useState(defaultRoleForPortal('compliance_app'));
  const [viewMode, setViewMode] = useState('quick');
  const [highlightPortal, setHighlightPortal] = useState('compliance_app');

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true);
        setError('');
        const response = await fetch('/api/getUsers', { credentials: 'include' });
        const data = (await readJsonResponse(response)) || {};
        if (!response.ok) throw new Error(data.error || 'Failed to load users.');
        const list = data.users ?? [];
        const matrix = {};
        const initials = {};
        list.forEach((user) => {
          matrix[user.uid] = matrixRowFromUser(user);
          initials[user.uid] = getComplianceProfileId(user.portalMappings || {});
        });
        setUsers(list);
        setAccessByUid(matrix);
        setInitialByUid(matrix);
        setComplianceInitialsByUid(initials);
        setInitialComplianceInitialsByUid(initials);
      } catch (err) {
        setError(err.message || 'Failed to load users.');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const focusPortalDef = KNOWN_PORTALS.find((p) => p.key === focusPortal);
  const showComplianceInitialsColumn =
    viewMode === 'matrix' || focusPortal === 'compliance_app';

  const filteredUsers = useMemo(() => {
    const term = search.trim().toLowerCase();
    return [...users]
      .filter((user) => !activeOnly || user.isActive !== false)
      .filter((user) => {
        if (!term) return true;
        const name = (user.fullName || '').toLowerCase();
        const email = (user.email || '').toLowerCase();
        const initials = (complianceInitialsByUid[user.uid] || '').toLowerCase();
        return name.includes(term) || email.includes(term) || initials.includes(term);
      })
      .sort((a, b) =>
        (a.fullName || a.email || '').localeCompare(b.fullName || b.email || '', undefined, {
          sensitivity: 'base',
        }),
      );
  }, [users, search, activeOnly, complianceInitialsByUid]);

  const dirtyUids = useMemo(() => {
    const uids = new Set([
      ...Object.keys(accessByUid),
      ...Object.keys(complianceInitialsByUid),
    ]);
    return [...uids].filter((uid) => {
      const accessDirty =
        initialByUid[uid] && !rowsEqual(accessByUid[uid] || {}, initialByUid[uid] || {});
      const initialsDirty =
        (complianceInitialsByUid[uid] || '') !== (initialComplianceInitialsByUid[uid] || '');
      return accessDirty || initialsDirty;
    });
  }, [accessByUid, initialByUid, complianceInitialsByUid, initialComplianceInitialsByUid]);

  function setUserPortalRole(uid, portalKey, role) {
    setAccessByUid((prev) => ({
      ...prev,
      [uid]: {
        ...prev[uid],
        [portalKey]: role || '',
      },
    }));
  }

  function setComplianceInitials(uid, value) {
    setComplianceInitialsByUid((prev) => ({
      ...prev,
      [uid]: normalizeInitials(value),
    }));
  }

  function toggleUserPortal(uid, portalKey, checked) {
    const role = checked ? columnDefaults[portalKey] || defaultRoleForPortal(portalKey) : '';
    setUserPortalRole(uid, portalKey, role);
  }

  function applyFocusToChecked(uids, grant) {
    if (!focusPortal) return;
    setAccessByUid((prev) => {
      const next = { ...prev };
      uids.forEach((uid) => {
        if (!next[uid]) return;
        next[uid] = {
          ...next[uid],
          [focusPortal]: grant ? focusRole : '',
        };
      });
      return next;
    });
  }

  function selectAllVisibleForFocus() {
    applyFocusToChecked(
      filteredUsers.map((u) => u.uid),
      true,
    );
  }

  function clearAllVisibleForFocus() {
    applyFocusToChecked(
      filteredUsers.map((u) => u.uid),
      false,
    );
  }

  function selectAllColumn(portalKey) {
    setAccessByUid((prev) => {
      const next = { ...prev };
      const role = columnDefaults[portalKey] || defaultRoleForPortal(portalKey);
      filteredUsers.forEach((user) => {
        if (!next[user.uid]) return;
        next[user.uid] = { ...next[user.uid], [portalKey]: role };
      });
      return next;
    });
  }

  function clearAllColumn(portalKey) {
    setAccessByUid((prev) => {
      const next = { ...prev };
      filteredUsers.forEach((user) => {
        if (!next[user.uid]) return;
        next[user.uid] = { ...next[user.uid], [portalKey]: '' };
      });
      return next;
    });
  }

  function autoFillComplianceInitials({ overwrite = false } = {}) {
    setComplianceInitialsByUid((prev) => {
      const next = { ...prev };
      const used = new Set(
        Object.values(next)
          .map((value) => normalizeInitials(value))
          .filter(Boolean),
      );

      filteredUsers.forEach((user) => {
        const current = normalizeInitials(next[user.uid]);
        if (current && !overwrite) return;

        if (current && overwrite) {
          used.delete(current);
        }

        let candidate = deriveInitialsFromName(user.fullName || user.email || '');
        if (!candidate) return;

        if (used.has(candidate)) {
          const base = candidate;
          let suffix = 2;
          while (used.has(`${base}${suffix}`.slice(0, 6)) && suffix < 50) {
            suffix += 1;
          }
          candidate = `${base}${suffix}`.slice(0, 6);
        }

        next[user.uid] = candidate;
        used.add(candidate);
      });

      return next;
    });
  }

  function clearVisibleComplianceInitials() {
    setComplianceInitialsByUid((prev) => {
      const next = { ...prev };
      filteredUsers.forEach((user) => {
        next[user.uid] = '';
      });
      return next;
    });
  }

  function resetChanges() {
    setAccessByUid(initialByUid);
    setComplianceInitialsByUid(initialComplianceInitialsByUid);
    setSuccess('');
    setError('');
  }

  async function handleSave() {
    if (dirtyUids.length === 0) return;
    setSaving(true);
    setError('');
    setSuccess('');
    try {
      const updates = dirtyUids.map((uid) => {
        const portalsAccess = buildPortalsAccessFromMatrixRow(
          accessByUid[uid] || initialByUid[uid] || {},
        );
        const initials = normalizeInitials(complianceInitialsByUid[uid]);
        const update = { uid, portalsAccess };
        if (initials || initialComplianceInitialsByUid[uid]) {
          update.portalMappings = {
            compliance_app: { profileId: initials },
          };
        }
        return update;
      });

      const response = await fetch('/api/adminBulkUpdatePortals', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ updates }),
      });
      const data = (await readJsonResponse(response)) || {};
      if (!response.ok) throw new Error(data.error || 'Failed to save portal access.');

      const nextInitialAccess = { ...initialByUid };
      const nextInitialInitials = { ...initialComplianceInitialsByUid };
      dirtyUids.forEach((uid) => {
        nextInitialAccess[uid] = { ...(accessByUid[uid] || {}) };
        nextInitialInitials[uid] = normalizeInitials(complianceInitialsByUid[uid]);
      });
      setInitialByUid(nextInitialAccess);
      setInitialComplianceInitialsByUid(nextInitialInitials);
      setComplianceInitialsByUid((prev) => ({ ...prev, ...nextInitialInitials }));
      setSuccess(`Saved portal access for ${data.updatedCount ?? dirtyUids.length} user(s).`);
    } catch (err) {
      setError(err.message || 'Save failed.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col h-full">
      <WorkspaceTabs />
      <div className="px-8 py-6 border-b border-[#1a2540]">
        <h1 className="text-2xl font-bold text-white">Portal Access</h1>
        <p className="text-sm text-slate-400 mt-1">
          Bulk assign portal roles and Weekend Availability initials.
        </p>
      </div>

      <div className="flex-1 overflow-auto p-8 space-y-4">
        {error && (
          <div className="px-4 py-3 bg-red-500/10 border border-red-500/25 rounded-lg">
            <p className="text-red-300 text-sm">{error}</p>
          </div>
        )}
        {success && (
          <div className="px-4 py-3 bg-emerald-500/10 border border-emerald-500/25 rounded-lg">
            <p className="text-emerald-300 text-sm">{success}</p>
          </div>
        )}

        <div className="flex flex-wrap gap-3 items-end">
          <div>
            <label className="block text-xs font-semibold uppercase tracking-widest text-slate-400 mb-1.5">
              Search
            </label>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Name, email, or initials"
              className="w-56 bg-[#060e1a] border border-[#1a2540] text-slate-100 text-sm rounded-lg px-3 py-2"
            />
          </div>
          <label className="flex items-center gap-2 text-sm text-slate-300 pb-2">
            <input
              type="checkbox"
              checked={activeOnly}
              onChange={(e) => setActiveOnly(e.target.checked)}
              className="rounded border-[#1a2540]"
            />
            Active users only
          </label>
          <div className="flex rounded-lg border border-[#1a2540] overflow-hidden ml-auto">
            <button
              type="button"
              onClick={() => setViewMode('quick')}
              className={`px-3 py-2 text-sm font-medium ${
                viewMode === 'quick'
                  ? 'bg-indigo-500/30 text-indigo-200'
                  : 'text-slate-400 hover:bg-[#0b1220]'
              }`}
            >
              Quick assign
            </button>
            <button
              type="button"
              onClick={() => setViewMode('matrix')}
              className={`px-3 py-2 text-sm font-medium ${
                viewMode === 'matrix'
                  ? 'bg-indigo-500/30 text-indigo-200'
                  : 'text-slate-400 hover:bg-[#0b1220]'
              }`}
            >
              Full matrix
            </button>
          </div>
        </div>

        {viewMode === 'quick' && (
          <div className="p-4 rounded-lg border border-[#1a2540] bg-[#0b1220] space-y-3">
            <p className="text-sm text-slate-300">
              Choose a portal and role, then tick users to grant access. Untick to remove access for that portal.
            </p>
            <div className="flex flex-wrap gap-3 items-end">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-widest text-slate-400 mb-1.5">
                  Portal
                </label>
                <select
                  value={focusPortal}
                  onChange={(e) => {
                    const key = e.target.value;
                    setFocusPortal(key);
                    setFocusRole(defaultRoleForPortal(key));
                  }}
                  className="bg-[#060e1a] border border-[#1a2540] text-slate-100 text-sm rounded-lg px-3 py-2 min-w-[180px]"
                >
                  {KNOWN_PORTALS.map((portal) => (
                    <option key={portal.key} value={portal.key}>
                      {portal.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold uppercase tracking-widest text-slate-400 mb-1.5">
                  Role
                </label>
                <select
                  value={focusRole}
                  onChange={(e) => setFocusRole(e.target.value)}
                  className="bg-[#060e1a] border border-[#1a2540] text-slate-100 text-sm rounded-lg px-3 py-2 min-w-[160px]"
                >
                  {(focusPortalDef?.roles || []).map((role) => (
                    <option key={role.value} value={role.value}>
                      {role.label}
                    </option>
                  ))}
                </select>
              </div>
              <button
                type="button"
                onClick={selectAllVisibleForFocus}
                className="px-3 py-2 text-sm rounded-lg border border-[#1a2540] text-slate-300 hover:bg-[#060e1a]"
              >
                Tick all visible
              </button>
              <button
                type="button"
                onClick={clearAllVisibleForFocus}
                className="px-3 py-2 text-sm rounded-lg border border-[#1a2540] text-slate-300 hover:bg-[#060e1a]"
              >
                Untick all visible
              </button>
            </div>
          </div>
        )}

        {showComplianceInitialsColumn && (
          <div className="p-4 rounded-lg border border-[#1a2540] bg-[#0b1220] space-y-3">
            <p className="text-sm text-slate-300">
              Weekend Availability initials map each employee to their local profile. Auto-fill derives
              initials from names for empty rows; collisions get a numeric suffix.
            </p>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => autoFillComplianceInitials({ overwrite: false })}
                className="px-3 py-2 text-sm rounded-lg border border-[#1a2540] text-slate-300 hover:bg-[#060e1a]"
              >
                Auto-fill empty initials
              </button>
              <button
                type="button"
                onClick={() => autoFillComplianceInitials({ overwrite: true })}
                className="px-3 py-2 text-sm rounded-lg border border-[#1a2540] text-slate-300 hover:bg-[#060e1a]"
              >
                Re-fill all visible initials
              </button>
              <button
                type="button"
                onClick={clearVisibleComplianceInitials}
                className="px-3 py-2 text-sm rounded-lg border border-[#1a2540] text-slate-300 hover:bg-[#060e1a]"
              >
                Clear visible initials
              </button>
            </div>
          </div>
        )}

        {viewMode === 'matrix' && (
          <div className="p-4 rounded-lg border border-[#1a2540] bg-[#0b1220]">
            <p className="text-sm text-slate-300 mb-3">
              Each cell is access for one user and portal. Use column headers to set the default role when ticking boxes.
            </p>
            <label className="block text-xs font-semibold uppercase tracking-widest text-slate-400 mb-1.5">
              Highlight column (optional)
            </label>
            <select
              value={highlightPortal}
              onChange={(e) => setHighlightPortal(e.target.value)}
              className="bg-[#060e1a] border border-[#1a2540] text-slate-100 text-sm rounded-lg px-3 py-2 min-w-[200px]"
            >
              <option value="">All columns</option>
              {KNOWN_PORTALS.map((portal) => (
                <option key={portal.key} value={portal.key}>
                  {portal.label}
                </option>
              ))}
            </select>
          </div>
        )}

        {loading ? (
          <div className="flex justify-center py-16">
            <Spinner className="animate-spin h-8 w-8 text-indigo-500" />
          </div>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-[#1a2540]">
            <table className="w-full min-w-[900px]">
              <thead>
                <tr className="border-b border-[#1a2540] bg-[#0b1220]">
                  <th className="sticky left-0 z-20 bg-[#0b1220] px-4 py-3 text-left text-xs font-semibold uppercase tracking-widest text-slate-400 min-w-[220px]">
                    User
                  </th>
                  {showComplianceInitialsColumn && (
                    <th className="px-3 py-3 text-left text-xs font-semibold uppercase tracking-widest text-slate-400 min-w-[120px] bg-indigo-500/5">
                      WA Initials
                    </th>
                  )}
                  {viewMode === 'matrix' &&
                    KNOWN_PORTALS.map((portal) => (
                      <th
                        key={portal.key}
                        className={`px-2 py-2 text-center text-[10px] font-semibold uppercase tracking-wide text-slate-400 min-w-[108px] ${
                          highlightPortal === portal.key ? 'bg-indigo-500/10' : ''
                        }`}
                      >
                        <div className="space-y-1">
                          <div>{portal.label}</div>
                          <select
                            value={columnDefaults[portal.key]}
                            onChange={(e) =>
                              setColumnDefaults((prev) => ({
                                ...prev,
                                [portal.key]: e.target.value,
                              }))
                            }
                            className="w-full text-[10px] bg-[#060e1a] border border-[#1a2540] rounded px-1 py-0.5 text-slate-300"
                          >
                            {portal.roles.map((role) => (
                              <option key={role.value} value={role.value}>
                                {role.label}
                              </option>
                            ))}
                          </select>
                          <div className="flex gap-1 justify-center">
                            <button
                              type="button"
                              title="Grant column role to all visible"
                              onClick={() => selectAllColumn(portal.key)}
                              className="text-[10px] text-indigo-300 hover:underline"
                            >
                              All
                            </button>
                            <button
                              type="button"
                              title="Remove access for all visible"
                              onClick={() => clearAllColumn(portal.key)}
                              className="text-[10px] text-slate-500 hover:underline"
                            >
                              None
                            </button>
                          </div>
                        </div>
                      </th>
                    ))}
                  {viewMode === 'quick' && (
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-widest text-slate-400">
                      {focusPortalDef?.label} — {focusRole}
                    </th>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-[#1a2540]">
                {filteredUsers.map((user) => {
                  const row = accessByUid[user.uid] || matrixRowFromUser(user);
                  const accessDirty =
                    initialByUid[user.uid] && !rowsEqual(row, initialByUid[user.uid]);
                  const initialsDirty =
                    (complianceInitialsByUid[user.uid] || '') !==
                    (initialComplianceInitialsByUid[user.uid] || '');
                  const isDirty = accessDirty || initialsDirty;
                  const focusHasAccess = !!row[focusPortal];
                  const focusMatchesRole = row[focusPortal] === focusRole;

                  return (
                    <tr
                      key={user.uid}
                      className={`hover:bg-[#0b1220]/80 ${isDirty ? 'bg-amber-500/5' : ''}`}
                    >
                      <td className="sticky left-0 z-10 bg-[#030712] px-4 py-2.5 border-r border-[#1a2540]">
                        <p className="text-sm font-medium text-white">{user.fullName || '—'}</p>
                        <p className="text-xs text-slate-500 truncate max-w-[200px]">{user.email}</p>
                        {!user.isActive && (
                          <span className="text-[10px] text-amber-300">Inactive</span>
                        )}
                      </td>

                      {showComplianceInitialsColumn && (
                        <td className="px-3 py-2.5 align-middle bg-indigo-500/5">
                          <input
                            value={complianceInitialsByUid[user.uid] || ''}
                            onChange={(e) => setComplianceInitials(user.uid, e.target.value)}
                            placeholder="e.g. JDO"
                            maxLength={6}
                            className="w-24 bg-[#060e1a] border border-[#1a2540] text-slate-100 text-sm rounded-lg px-2 py-1.5 uppercase tracking-wide"
                            aria-label={`${user.fullName} Weekend Availability initials`}
                          />
                        </td>
                      )}

                      {viewMode === 'matrix' &&
                        KNOWN_PORTALS.map((portal) => {
                          const hasAccess = !!row[portal.key];
                          const highlighted = highlightPortal === portal.key;
                          return (
                            <td
                              key={portal.key}
                              className={`px-2 py-2 text-center align-middle ${
                                highlighted ? 'bg-indigo-500/5' : ''
                              }`}
                            >
                              <div className="flex flex-col items-center gap-1">
                                <input
                                  type="checkbox"
                                  checked={hasAccess}
                                  onChange={(e) =>
                                    toggleUserPortal(user.uid, portal.key, e.target.checked)
                                  }
                                  className="rounded border-[#1a2540]"
                                  aria-label={`${user.fullName} ${portal.label}`}
                                />
                                {hasAccess && (
                                  <select
                                    value={row[portal.key]}
                                    onChange={(e) =>
                                      setUserPortalRole(user.uid, portal.key, e.target.value)
                                    }
                                    className="w-full max-w-[96px] text-[10px] bg-[#060e1a] border border-[#1a2540] rounded px-1 py-0.5 text-slate-300"
                                  >
                                    {portal.roles.map((role) => (
                                      <option key={role.value} value={role.value}>
                                        {role.label}
                                      </option>
                                    ))}
                                  </select>
                                )}
                              </div>
                            </td>
                          );
                        })}

                      {viewMode === 'quick' && (
                        <td className="px-4 py-2.5">
                          <label className="inline-flex items-center gap-2 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={focusHasAccess && focusMatchesRole}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setUserPortalRole(user.uid, focusPortal, focusRole);
                                } else {
                                  setUserPortalRole(user.uid, focusPortal, '');
                                }
                              }}
                              className="rounded border-[#1a2540]"
                            />
                            <span className="text-xs text-slate-400">
                              {focusHasAccess && !focusMatchesRole
                                ? `Has ${row[focusPortal]} (tick replaces)`
                                : focusHasAccess
                                  ? 'Has access'
                                  : 'No access'}
                            </span>
                          </label>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="sticky bottom-0 px-8 py-4 border-t border-[#1a2540] bg-[#060e1a] flex flex-wrap items-center gap-3">
        <p className="text-sm text-slate-400">
          {dirtyUids.length === 0
            ? 'No unsaved changes'
            : `${dirtyUids.length} user(s) with unsaved changes`}
        </p>
        <div className="ml-auto flex gap-2">
          <button
            type="button"
            onClick={resetChanges}
            disabled={dirtyUids.length === 0 || saving}
            className="px-4 py-2 rounded-lg border border-[#1a2540] text-slate-300 text-sm disabled:opacity-50"
          >
            Discard
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={dirtyUids.length === 0 || saving}
            className="px-4 py-2 rounded-lg bg-gradient-to-r from-indigo-500 to-violet-600 text-white text-sm font-semibold disabled:opacity-50"
          >
            {saving ? 'Saving…' : 'Save changes'}
          </button>
        </div>
      </div>
    </div>
  );
}
