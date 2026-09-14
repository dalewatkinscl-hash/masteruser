import { useCallback, useEffect, useState } from 'react';
import { canViewAllEmployeeProfiles, readJsonResponse } from '../utils/employeeProfile';
import { useAuth } from '../context/AuthContext';

function formatDate(value) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString('en-GB');
}

function formatFileSize(bytes) {
  const size = Number(bytes) || 0;
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${Math.round(size / 1024)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function scoreLabel(score) {
  if (score >= 0.95) return 'Exact match';
  if (score >= 0.8) return 'Very likely';
  if (score >= 0.65) return 'Likely';
  return 'Possible';
}

export default function EmployeeSharePointDocuments({
  employeeUid,
  employeeName,
  sharePointFolderName,
  sharePointEmployeeRoot,
  isConfirmed,
  onMappingSaved,
  embedded = false,
}) {
  const { user } = useAuth();
  const canView = canViewAllEmployeeProfiles(user);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [documents, setDocuments] = useState([]);
  const [folders, setFolders] = useState([]);
  const [employeeFolderExists, setEmployeeFolderExists] = useState(false);
  const [employeeFolderPath, setEmployeeFolderPath] = useState('');
  const [currentPath, setCurrentPath] = useState('');
  const [relativePath, setRelativePath] = useState('');
  const [breadcrumbs, setBreadcrumbs] = useState([]);
  const [configured, setConfigured] = useState(false);
  const [mappingOpen, setMappingOpen] = useState(false);
  const [suggestionsLoading, setSuggestionsLoading] = useState(false);
  const [suggestions, setSuggestions] = useState([]);
  const [savingMapping, setSavingMapping] = useState(false);
  const [manualFolderName, setManualFolderName] = useState('');
  const [manualEmployeeRoot, setManualEmployeeRoot] = useState('Current Employees');

  const applyListing = (data = {}) => {
    setConfigured(true);
    setDocuments(data.documents || []);
    setFolders(data.folders || []);
    setEmployeeFolderExists(Boolean(data.employeeFolderExists ?? data.folderExists));
    setEmployeeFolderPath(data.employeeFolderPath || '');
    setCurrentPath(data.currentPath || data.employeeFolderPath || '');
    setRelativePath(data.relativePath || '');
    setBreadcrumbs(data.breadcrumbs || []);
  };

  const loadDocuments = useCallback(async (path = '') => {
    if (!canView || !employeeUid) return;

    try {
      setLoading(true);
      setError('');
      const params = new URLSearchParams({ employeeUid });
      if (path) params.set('path', path);
      const response = await fetch(
        `/api/getEmployeeSharePointDocuments?${params.toString()}`,
        { credentials: 'include' },
      );
      const data = (await readJsonResponse(response)) || {};
      if (!response.ok) {
        setConfigured(response.status !== 503);
        throw new Error(data.error || 'Failed to load SharePoint documents.');
      }

      applyListing(data);
    } catch (err) {
      setError(err.message || 'Failed to load SharePoint documents.');
    } finally {
      setLoading(false);
    }
  }, [canView, employeeUid]);

  useEffect(() => {
    loadDocuments('');
  }, [loadDocuments]);

  const openMapping = async () => {
    setMappingOpen(true);
    setSuggestionsLoading(true);
    setError('');

    try {
      const response = await fetch(
        `/api/getSharePointFolderSuggestions?employeeUid=${encodeURIComponent(employeeUid)}`,
        { credentials: 'include' },
      );
      const data = (await readJsonResponse(response)) || {};
      if (!response.ok) throw new Error(data.error || 'Failed to load folder suggestions.');

      setSuggestions(data.suggestions || []);
      setManualFolderName(data.currentFolderName || '');
      setManualEmployeeRoot(data.currentEmployeeRoot || 'Current Employees');
    } catch (err) {
      setError(err.message || 'Failed to load folder suggestions.');
    } finally {
      setSuggestionsLoading(false);
    }
  };

  const confirmMapping = async ({ folderName, employeeRoot }) => {
    setSavingMapping(true);
    setError('');

    try {
      const response = await fetch('/api/confirmSharePointFolderMapping', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          employeeUid,
          folderName,
          employeeRoot,
        }),
      });
      const data = (await readJsonResponse(response)) || {};
      if (!response.ok) throw new Error(data.error || 'Failed to save folder mapping.');

      applyListing(data);
      setMappingOpen(false);
      onMappingSaved?.({
        sharePointFolderName: folderName,
        sharePointEmployeeRoot: employeeRoot,
        sharePointFolderConfirmedAt: new Date().toISOString(),
      });
    } catch (err) {
      setError(err.message || 'Failed to save folder mapping.');
    } finally {
      setSavingMapping(false);
    }
  };

  if (!canView) return null;

  const linkedFolderLabel = sharePointFolderName
    ? `${sharePointEmployeeRoot || 'Current Employees'} / ${sharePointFolderName}`
    : employeeName;
  const hasEntries = folders.length > 0 || documents.length > 0;

  return (
    <div className={embedded ? 'w-full' : 'w-full px-8 pb-4'}>
      <div className="bg-[#0b1220] border border-[#1a2540] rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-[#1a2540] flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h3 className="text-sm font-semibold text-white">SharePoint documents</h3>
            <p className="text-sm text-slate-400 mt-1">
              Browse files and folders in this employee&apos;s SharePoint folder
            </p>
          </div>
          {configured && (
            <button
              type="button"
              onClick={openMapping}
              className="px-4 py-2 rounded-lg text-sm font-medium border border-[#1a2540] text-slate-200 hover:bg-[#060e1a]"
            >
              {isConfirmed ? 'Change folder link' : 'Link SharePoint folder'}
            </button>
          )}
        </div>

        <div className="px-5 py-4 space-y-4">
          {!configured && !loading && !error && (
            <p className="text-sm text-amber-300">
              SharePoint credentials are not set on the server yet.
            </p>
          )}

          {configured && !loading && !error && (
            <div className="text-sm text-slate-400 space-y-2">
              <p>
                Linked folder:
                {' '}
                <span className="text-slate-200">{linkedFolderLabel}</span>
                {isConfirmed ? (
                  <span className="ml-2 text-emerald-300">(confirmed)</span>
                ) : (
                  <span className="ml-2 text-amber-300">(auto-matched by name)</span>
                )}
              </p>
              {employeeFolderExists && (
                <div className="flex flex-wrap items-center gap-1 text-xs text-slate-400">
                  <button
                    type="button"
                    onClick={() => loadDocuments('')}
                    className={`hover:text-indigo-300 ${relativePath ? 'text-indigo-300' : 'text-slate-300'}`}
                  >
                    {employeeFolderPath || 'Employee folder'}
                  </button>
                  {breadcrumbs.map((crumb) => (
                    <span key={crumb.relativePath} className="inline-flex items-center gap-1">
                      <span className="text-slate-600">/</span>
                      <button
                        type="button"
                        onClick={() => loadDocuments(crumb.relativePath)}
                        className="hover:text-indigo-300 text-slate-300"
                      >
                        {crumb.name}
                      </button>
                    </span>
                  ))}
                </div>
              )}
              {currentPath && (
                <p className="text-xs text-slate-500">{currentPath}</p>
              )}
            </div>
          )}

          {error && (
            <div className="bg-red-500/10 border border-red-500/25 rounded-lg p-4 text-sm text-red-200">
              {error}
            </div>
          )}

          {loading ? (
            <p className="text-sm text-slate-400">Loading SharePoint documents…</p>
          ) : !error && configured && !employeeFolderExists ? (
            <div className="bg-amber-500/10 border border-amber-500/25 rounded-lg p-4 text-sm text-amber-100">
              The linked employee folder could not be found in SharePoint.
              {' '}
              Click <strong>Link SharePoint folder</strong> to choose the correct employee folder.
            </div>
          ) : !error && configured && !hasEntries ? (
            <p className="text-sm text-slate-500">No files or folders found here.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-[#1a2540]">
                    <th className="px-3 py-2 text-left text-xs text-slate-500 uppercase">Name</th>
                    <th className="px-3 py-2 text-left text-xs text-slate-500 uppercase">Type</th>
                    <th className="px-3 py-2 text-left text-xs text-slate-500 uppercase">Modified</th>
                    <th className="px-3 py-2 text-left text-xs text-slate-500 uppercase">Size</th>
                    <th className="px-3 py-2 text-right text-xs text-slate-500 uppercase">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#1a2540]">
                  {relativePath && (
                    <tr className="hover:bg-[#060e1a]">
                      <td className="px-3 py-3 text-sm text-indigo-300" colSpan={4}>
                        <button
                          type="button"
                          onClick={() => {
                            const parent = relativePath.split('/').slice(0, -1).join('/');
                            loadDocuments(parent);
                          }}
                          className="hover:text-indigo-200"
                        >
                          ← Up one folder
                        </button>
                      </td>
                      <td className="px-3 py-3" />
                    </tr>
                  )}
                  {folders.map((folder) => (
                    <tr key={folder.id} className="hover:bg-[#060e1a]">
                      <td className="px-3 py-3 text-sm text-white">
                        <button
                          type="button"
                          onClick={() => loadDocuments(folder.relativePath)}
                          className="text-left hover:text-indigo-300"
                        >
                          {folder.name}
                        </button>
                      </td>
                      <td className="px-3 py-3 text-sm text-slate-400">Folder</td>
                      <td className="px-3 py-3 text-sm text-slate-300">{formatDate(folder.lastModifiedAt)}</td>
                      <td className="px-3 py-3 text-sm text-slate-500">—</td>
                      <td className="px-3 py-3 text-right">
                        <button
                          type="button"
                          onClick={() => loadDocuments(folder.relativePath)}
                          className="text-indigo-300 hover:text-indigo-200 text-sm"
                        >
                          Open
                        </button>
                      </td>
                    </tr>
                  ))}
                  {documents.map((document) => (
                    <tr key={document.id} className="hover:bg-[#060e1a]">
                      <td className="px-3 py-3 text-sm text-white">{document.fileName || document.name}</td>
                      <td className="px-3 py-3 text-sm text-slate-400">File</td>
                      <td className="px-3 py-3 text-sm text-slate-300">{formatDate(document.lastModifiedAt)}</td>
                      <td className="px-3 py-3 text-sm text-slate-300">{formatFileSize(document.size)}</td>
                      <td className="px-3 py-3 text-right">
                        {document.webUrl ? (
                          <a
                            href={document.webUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="text-indigo-300 hover:text-indigo-200 text-sm"
                          >
                            Open
                          </a>
                        ) : (
                          <span className="text-sm text-slate-500">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {mappingOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-2xl bg-[#0b1220] border border-[#1a2540] rounded-xl shadow-xl overflow-hidden">
            <div className="px-5 py-4 border-b border-[#1a2540] flex items-center justify-between gap-4">
              <div>
                <h3 className="text-base font-semibold text-white">Link SharePoint folder</h3>
                <p className="text-sm text-slate-400 mt-1">
                  Match {employeeName || 'this employee'} to their folder in Employee Files
                </p>
              </div>
              <button
                type="button"
                onClick={() => setMappingOpen(false)}
                className="text-slate-400 hover:text-slate-200 text-sm"
              >
                Close
              </button>
            </div>

            <div className="px-5 py-4 space-y-5 max-h-[70vh] overflow-auto">
              {suggestionsLoading ? (
                <p className="text-sm text-slate-400">Searching SharePoint folders…</p>
              ) : suggestions.length > 0 ? (
                <div className="space-y-3">
                  <p className="text-sm text-slate-300">Suggested matches</p>
                  {suggestions.map((suggestion) => (
                    <div
                      key={`${suggestion.employeeRoot}-${suggestion.folderName}`}
                      className="border border-[#1a2540] rounded-lg p-4 flex items-start justify-between gap-4"
                    >
                      <div>
                        <p className="text-sm text-white">{suggestion.folderName}</p>
                        <p className="text-xs text-slate-500 mt-1">{suggestion.employeeFolderPath}</p>
                        <p className="text-xs text-slate-400 mt-2">
                          {scoreLabel(suggestion.score)}
                          {' '}
                          ·
                          {' '}
                          {Math.round(suggestion.score * 100)}
                          % match
                          {suggestion.disciplinaryFolderExists ? ' · has Disciplinaries folder' : ''}
                        </p>
                      </div>
                      <button
                        type="button"
                        disabled={savingMapping}
                        onClick={() => confirmMapping({
                          folderName: suggestion.folderName,
                          employeeRoot: suggestion.employeeRoot,
                        })}
                        className="px-3 py-2 rounded-lg text-sm font-medium bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white shrink-0"
                      >
                        Use this folder
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-slate-500">No close matches found automatically.</p>
              )}

              <div className="border-t border-[#1a2540] pt-4 space-y-3">
                <p className="text-sm text-slate-300">Or enter the folder name manually</p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <label className="block">
                    <span className="block text-[11px] font-medium uppercase tracking-wider text-slate-500 mb-1">Folder name</span>
                    <input
                      value={manualFolderName}
                      onChange={(e) => setManualFolderName(e.target.value)}
                      placeholder="Geoff Wilking"
                      className="w-full bg-[#060e1a] border border-[#1a2540] text-slate-100 text-sm rounded-lg px-3 py-2"
                    />
                  </label>
                  <label className="block">
                    <span className="block text-[11px] font-medium uppercase tracking-wider text-slate-500 mb-1">Employee group</span>
                    <select
                      value={manualEmployeeRoot}
                      onChange={(e) => setManualEmployeeRoot(e.target.value)}
                      className="w-full bg-[#060e1a] border border-[#1a2540] text-slate-100 text-sm rounded-lg px-3 py-2"
                    >
                      <option value="Current Employees">Current Employees</option>
                      <option value="Previous Employees">Previous Employees</option>
                    </select>
                  </label>
                </div>
                <div className="flex justify-end">
                  <button
                    type="button"
                    disabled={savingMapping || !manualFolderName.trim()}
                    onClick={() => confirmMapping({
                      folderName: manualFolderName.trim(),
                      employeeRoot: manualEmployeeRoot,
                    })}
                    className="px-4 py-2 rounded-lg text-sm font-medium bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white"
                  >
                    {savingMapping ? 'Saving…' : 'Confirm manual link'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
