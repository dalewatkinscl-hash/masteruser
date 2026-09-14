import { BrowserRouter, Routes, Route, Navigate, useParams } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { ThemeProvider } from './context/ThemeContext';
import PortalThemeSync from './components/PortalThemeSync';
import ProtectedRoute from './components/ProtectedRoute';
import Login from './pages/Login';
import Logout from './pages/Logout';
import Dashboard from './pages/Dashboard';
import PortalAccessMatrix from './pages/PortalAccessMatrix';
import Profile from './pages/Profile';
import EmployeesDirectory from './pages/EmployeesDirectory';
import EmployeeDetail from './pages/EmployeeDetail';
import DuplicateEmployees from './pages/DuplicateEmployees';
import BirthdaysAnniversaries from './pages/BirthdaysAnniversaries';
import ActiveDisciplinaryMeasures from './pages/ActiveDisciplinaryMeasures';
import BonusDeductions from './pages/BonusDeductions';
import DisciplinaryDashboard from './pages/DisciplinaryDashboard';
import DisciplinaryCase from './pages/DisciplinaryCase';
import BumpCardPage from './pages/BumpCardPage';
import BumpPromptPage from './pages/BumpPromptPage';
import EmergencyPhone from './pages/EmergencyPhone';
import FunAdmin from './pages/FunAdmin';
import RollCallLists from './pages/RollCallLists';
import RollCallListDetail from './pages/RollCallListDetail';
import HrPortalLayout from './components/HrPortalLayout';
import { HrPortalLanding } from './components/HrPortalNav';

function CaseIdRedirect({ prefix = '/dashboard/hr/cases' }) {
  const { caseId } = useParams();
  return <Navigate to={`${prefix}/${caseId}`} replace />;
}

function EmployeeUidRedirect() {
  const { uid } = useParams();
  return <Navigate to={`/dashboard/hr/employees/${uid}`} replace />;
}

function RollCallListRedirect() {
  const { listId } = useParams();
  return <Navigate to={`/dashboard/hr/roll-calls/${listId}`} replace />;
}

/** Force remount when switching new ↔ case id (React reuses the same element type otherwise). */
function DisciplinaryCaseRoute() {
  const { caseId } = useParams();
  return <DisciplinaryCase key={caseId || 'new'} />;
}

export default function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <PortalThemeSync />
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/logout" element={<Logout />} />
            <Route
              path="/dashboard"
              element={(
                <ProtectedRoute>
                  <Dashboard />
                </ProtectedRoute>
              )}
            >
              <Route index element={<Navigate to="profile" replace />} />
              <Route path="profile" element={<Profile />} />
              <Route path="bump-card" element={<BumpCardPage />} />
              <Route path="emergency-phone" element={<EmergencyPhone />} />

              {/* In-app HR portal */}
              <Route path="hr" element={<HrPortalLayout />}>
                <Route index element={<HrPortalLanding />} />
                <Route
                  path="employees"
                  element={(
                    <ProtectedRoute requireEmployeeDirectory>
                      <EmployeesDirectory />
                    </ProtectedRoute>
                  )}
                />
                <Route
                  path="employees/duplicates"
                  element={(
                    <ProtectedRoute requireAdmin>
                      <DuplicateEmployees />
                    </ProtectedRoute>
                  )}
                />
                <Route
                  path="employees/milestones"
                  element={(
                    <ProtectedRoute requireEmployeeDirectory>
                      <BirthdaysAnniversaries />
                    </ProtectedRoute>
                  )}
                />
                <Route
                  path="employees/:uid"
                  element={(
                    <ProtectedRoute requireEmployeeDirectory>
                      <EmployeeDetail />
                    </ProtectedRoute>
                  )}
                />
                <Route
                  path="roll-calls"
                  element={(
                    <ProtectedRoute requireEmployeeDirectory>
                      <RollCallLists />
                    </ProtectedRoute>
                  )}
                />
                <Route
                  path="roll-calls/new"
                  element={(
                    <ProtectedRoute requireEmployeeDirectory>
                      <Navigate to="/dashboard/hr/employees" replace />
                    </ProtectedRoute>
                  )}
                />
                <Route
                  path="roll-calls/:listId"
                  element={(
                    <ProtectedRoute requireEmployeeDirectory>
                      <RollCallListDetail />
                    </ProtectedRoute>
                  )}
                />
                <Route
                  path="active-disciplinary-measures"
                  element={(
                    <ProtectedRoute requireCasesManager>
                      <ActiveDisciplinaryMeasures />
                    </ProtectedRoute>
                  )}
                />
                <Route
                  path="bonus-deductions"
                  element={(
                    <ProtectedRoute requireCasesManager>
                      <BonusDeductions />
                    </ProtectedRoute>
                  )}
                />
                <Route
                  path="cases"
                  element={(
                    <ProtectedRoute requireCasesManager>
                      <DisciplinaryDashboard />
                    </ProtectedRoute>
                  )}
                />
                <Route
                  path="cases/new"
                  element={(
                    <ProtectedRoute requireCasesManager>
                      <DisciplinaryCaseRoute />
                    </ProtectedRoute>
                  )}
                />
                <Route
                  path="cases/bump-prompt"
                  element={(
                    <ProtectedRoute requireCasesManager>
                      <BumpPromptPage />
                    </ProtectedRoute>
                  )}
                />
                <Route
                  path="cases/:caseId"
                  element={(
                    <ProtectedRoute requireCasesManager>
                      <DisciplinaryCaseRoute />
                    </ProtectedRoute>
                  )}
                />
              </Route>

              {/* Legacy redirects → /dashboard/hr/... */}
              <Route path="roll-calls" element={<Navigate to="/dashboard/hr/roll-calls" replace />} />
              <Route path="roll-calls/new" element={<Navigate to="/dashboard/hr/employees" replace />} />
              <Route path="roll-calls/:listId" element={<RollCallListRedirect />} />
              <Route path="employees" element={<Navigate to="/dashboard/hr/employees" replace />} />
              <Route path="employees/duplicates" element={<Navigate to="/dashboard/hr/employees/duplicates" replace />} />
              <Route path="employees/milestones" element={<Navigate to="/dashboard/hr/employees/milestones" replace />} />
              <Route path="employees/active-disciplinary-measures" element={<Navigate to="/dashboard/hr/active-disciplinary-measures" replace />} />
              <Route path="employees/bonus-deductions" element={<Navigate to="/dashboard/hr/bonus-deductions" replace />} />
              <Route path="employees/:uid" element={<EmployeeUidRedirect />} />
              <Route path="cases" element={<Navigate to="/dashboard/hr/cases" replace />} />
              <Route path="cases/new" element={<Navigate to="/dashboard/hr/cases/new" replace />} />
              <Route path="cases/bump-prompt" element={<Navigate to="/dashboard/hr/cases/bump-prompt" replace />} />
              <Route path="cases/:caseId" element={<CaseIdRedirect />} />
              <Route path="disciplinary" element={<Navigate to="/dashboard/hr/cases" replace />} />
              <Route path="disciplinary/new" element={<Navigate to="/dashboard/hr/cases/new" replace />} />
              <Route path="disciplinary/:caseId" element={<CaseIdRedirect />} />

              <Route path="portal-access" element={<ProtectedRoute requireAdmin><PortalAccessMatrix /></ProtectedRoute>} />
              <Route path="nonograms" element={<ProtectedRoute requireAdmin><Navigate to="/dashboard/fun-admin?tab=nonograms" replace /></ProtectedRoute>} />
              <Route path="fun-admin" element={<ProtectedRoute requireAdmin><FunAdmin /></ProtectedRoute>} />
              <Route path="users" element={<Navigate to="/dashboard/hr/employees" replace />} />
              <Route path="users/:uid" element={<Navigate to="/dashboard/hr/employees" replace />} />
            </Route>
            <Route path="*" element={<Navigate to="/login" replace />} />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </ThemeProvider>
  );
}
