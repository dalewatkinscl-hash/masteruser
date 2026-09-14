import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { readJsonResponse } from '../utils/employeeProfile';
import {
  canManagePeopleCases,
  caseProgressToneClass,
  getCaseProgressStatus,
} from '../utils/peopleCasesAccess';
import { useAuth } from '../context/AuthContext';

export default function EmployeeDisciplinaryPanel({ employeeUid, employeeName, embedded = false }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [cases, setCases] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const canView = canManagePeopleCases(user);

  useEffect(() => {
    if (!canView || !employeeUid) return;

    const load = async () => {
      try {
        setLoading(true);
        setError('');
        const response = await fetch(
          `/api/getPeopleCases?employeeUid=${encodeURIComponent(employeeUid)}`,
          { credentials: 'include' },
        );
        const data = (await readJsonResponse(response)) || {};
        if (!response.ok) throw new Error(data.error || 'Failed to load case history.');
        setCases(data.cases || []);
      } catch (err) {
        setError(err.message || 'Failed to load case history.');
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [canView, employeeUid]);

  if (!canView) return null;

  const startNewCase = () => {
    const params = new URLSearchParams({ employeeUid, processFamily: 'disciplinary' });
    if (employeeName) params.set('employeeName', employeeName);
    navigate(`/dashboard/hr/cases/new?${params.toString()}`);
  };

  return (
    <div className={embedded ? 'w-full' : 'w-full px-8 pb-4'}>
      <div className="bg-[#0b1220] border border-[#1a2540] rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-[#1a2540] flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h3 className="text-sm font-semibold text-white">People cases</h3>
            <p className="text-sm text-slate-400 mt-1">Disciplinary, grievance, and accident cases for this employee</p>
          </div>
          <button
            type="button"
            onClick={startNewCase}
            className="px-4 py-2 rounded-lg text-sm font-medium bg-indigo-600 hover:bg-indigo-500 text-white"
          >
            Start new case
          </button>
        </div>

        <div className="px-5 py-4">
          {loading ? (
            <p className="text-sm text-slate-400">Loading cases…</p>
          ) : error ? (
            <p className="text-sm text-red-300">{error}</p>
          ) : cases.length === 0 ? (
            <p className="text-sm text-slate-500">No cases on file for this employee.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-[#1a2540]">
                    <th className="px-3 py-2 text-left text-xs text-slate-500 uppercase">Title</th>
                    <th className="px-3 py-2 text-left text-xs text-slate-500 uppercase">Family</th>
                    <th className="px-3 py-2 text-left text-xs text-slate-500 uppercase">Progress</th>
                    <th className="px-3 py-2 text-right text-xs text-slate-500 uppercase">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#1a2540]">
                  {cases.map((item) => {
                    const progress = getCaseProgressStatus(item);
                    return (
                      <tr key={item.id} className="hover:bg-[#060e1a]">
                        <td className="px-3 py-3 text-sm text-white">{item.title || '—'}</td>
                        <td className="px-3 py-3 text-sm text-slate-300 capitalize">
                          {(item.processFamily || 'disciplinary').replace(/_/g, ' ')}
                        </td>
                        <td className="px-3 py-3">
                          <span className={`inline-flex rounded-lg border px-2 py-1 text-xs font-medium ${caseProgressToneClass(progress.tone)}`}>
                            {progress.label}
                          </span>
                        </td>
                        <td className="px-3 py-3 text-right">
                          <button
                            type="button"
                            onClick={() => navigate(`/dashboard/hr/cases/${item.id}`)}
                            className="text-indigo-300 hover:text-indigo-200 text-sm"
                          >
                            Open
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
