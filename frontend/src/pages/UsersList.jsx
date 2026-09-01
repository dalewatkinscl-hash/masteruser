import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

function PlusIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <line x1="12" y1="5" x2="12" y2="19" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <line x1="5" y1="12" x2="19" y2="12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function ChevronRightIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="m9 6 6 6-6 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

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
  if (!contentType.includes('application/json')) {
    return null;
  }

  try {
    return await res.json();
  } catch {
    return null;
  }
}

export default function UsersList() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [nameSortDirection, setNameSortDirection] = useState('asc');
  const [activeOnly, setActiveOnly] = useState(true);
  const navigate = useNavigate();

  const sortedUsers = [...users]
    .filter((user) => !activeOnly || user.isActive !== false)
    .sort((a, b) => {
      const aName = (a.fullName || a.email || '').toLowerCase();
      const bName = (b.fullName || b.email || '').toLowerCase();
      return nameSortDirection === 'asc'
        ? aName.localeCompare(bName)
        : bName.localeCompare(aName);
    });

  const toggleNameSort = () => {
    setNameSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'));
  };

  useEffect(() => {
    const fetchUsers = async () => {
      try {
        setLoading(true);
        setError('');

        // Fetch all users from Firestore via a direct read.
        // In production, you'd want a dedicated /api/getUsers endpoint with pagination.
        const response = await fetch('/api/getUsers', { credentials: 'include' });

        if (!response.ok) {
          const data = (await readJsonResponse(response)) || {};
          throw new Error(data.error ?? 'Failed to fetch users.');
        }

        const data = (await readJsonResponse(response)) || {};
        setUsers(data.users ?? []);
      } catch (err) {
        setError(err.message ?? 'An error occurred.');
        setUsers([]);
      } finally {
        setLoading(false);
      }
    };

    fetchUsers();
  }, []);

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-8 py-6 border-b border-[#1a2540]">
        <div>
          <h1 className="text-2xl font-bold text-white">Users</h1>
          <p className="text-sm text-slate-400 mt-1">Manage employee access and portal permissions</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => navigate('/dashboard/portal-access')}
            className="px-4 py-2.5 rounded-lg border border-[#1a2540] text-slate-200 text-sm font-medium hover:bg-[#0b1220] transition-colors"
          >
            Portal access matrix
          </button>
          <button
            onClick={() => navigate('/dashboard/users/new')}
            className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-gradient-to-r from-indigo-500 to-violet-600 text-white text-sm font-semibold hover:from-indigo-600 hover:to-violet-700 transition-all shadow-lg shadow-indigo-500/20"
          >
            <PlusIcon className="w-5 h-5" />
            New user
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto">
        {loading ? (
          <div className="flex items-center justify-center h-full">
            <div className="flex flex-col items-center gap-3">
              <Spinner className="animate-spin h-8 w-8 text-indigo-500" />
              <p className="text-slate-400 text-sm">Loading users…</p>
            </div>
          </div>
        ) : error ? (
          <div className="p-8">
            <div className="bg-red-500/10 border border-red-500/25 rounded-lg p-4">
              <p className="text-red-300 text-sm">{error}</p>
            </div>
          </div>
        ) : users.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-center">
              <p className="text-slate-400 text-sm mb-4">No users found</p>
              <button
                onClick={() => navigate('/dashboard/users/new')}
                className="text-indigo-400 hover:text-indigo-300 text-sm font-medium"
              >
                Create the first user
              </button>
            </div>
          </div>
        ) : (
          <div className="p-8 space-y-4">
            <label className="inline-flex items-center gap-2 text-sm text-slate-300">
              <input
                type="checkbox"
                checked={activeOnly}
                onChange={(e) => setActiveOnly(e.target.checked)}
                className="w-4 h-4 rounded border-[#1a2540] bg-[#060e1a] text-indigo-500"
              />
              Active staff only
            </label>
            <div className="overflow-x-auto rounded-lg border border-[#1a2540]">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-[#1a2540] bg-[#0b1220]">
                    <th className="px-6 py-4 text-left text-xs font-semibold uppercase tracking-widest text-slate-400">
                      <button
                        type="button"
                        onClick={toggleNameSort}
                        className="inline-flex items-center gap-1 hover:text-slate-200 transition-colors"
                      >
                        Name
                        <span>{nameSortDirection === 'asc' ? '↑' : '↓'}</span>
                      </button>
                    </th>
                    <th className="px-6 py-4 text-left text-xs font-semibold uppercase tracking-widest text-slate-400">
                      Email
                    </th>
                    <th className="px-6 py-4 text-left text-xs font-semibold uppercase tracking-widest text-slate-400">
                      Status
                    </th>
                    <th className="px-6 py-4 text-left text-xs font-semibold uppercase tracking-widest text-slate-400">
                      Portals
                    </th>
                    <th className="px-6 py-4 text-right text-xs font-semibold uppercase tracking-widest text-slate-400">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#1a2540]">
                  {sortedUsers.map((user) => (
                    <tr key={user.uid} className="hover:bg-[#0b1220] transition-colors">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center text-white text-sm font-semibold flex-shrink-0">
                            {(user.fullName || user.email || '?')[0].toUpperCase()}
                          </div>
                          <div>
                            <p className="text-sm font-medium text-white">{user.fullName || '—'}</p>
                            <p className="text-xs text-slate-500">{user.uid}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <p className="text-sm text-slate-300">{user.email || '—'}</p>
                      </td>
                      <td className="px-6 py-4">
                        {user.isActive ? (
                          <span className="inline-flex items-center gap-2 px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                            <span className="w-2 h-2 rounded-full bg-emerald-400" />
                            Active
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-2 px-2.5 py-1 rounded-full text-xs font-medium bg-slate-500/20 text-slate-300 border border-slate-500/30">
                            <span className="w-2 h-2 rounded-full bg-slate-400" />
                            Inactive
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex flex-wrap gap-1">
                          {Object.entries(user.portalsAccess || {}).map(([portal, role]) => (
                            <span key={portal} className="inline-flex px-2 py-1 rounded text-xs font-medium bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                              {portal}: {role}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <button
                          onClick={() => navigate(`/dashboard/users/${user.uid}`)}
                          className="inline-flex items-center gap-1 text-indigo-400 hover:text-indigo-300 text-sm font-medium transition-colors"
                        >
                          Edit
                          <ChevronRightIcon className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
