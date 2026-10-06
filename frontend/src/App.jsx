import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useParams } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { LanguageProvider } from './context/LanguageContext';
import { ThemeProvider } from './context/ThemeContext';
import PortalThemeSync from './components/PortalThemeSync';
import AppErrorBoundary from './components/AppErrorBoundary';
import PageSpinner from './components/PageSpinner';
import RouteDocumentTitle from './components/RouteDocumentTitle';
import ProtectedRoute from './components/ProtectedRoute';
import Login from './pages/Login';
import Logout from './pages/Logout';
import Dashboard from './pages/Dashboard';
import Profile from './pages/Profile';
import NotFound from './pages/NotFound';
import HrPortalLayout from './components/HrPortalLayout';
import { HrPortalLanding } from './components/HrPortalNav';
// HR landing + case open are eager so Open case never depends on a stale lazy chunk
// (orphaned assets after deploy return index.html and crash the section boundary).
import EmployeesDirectory from './pages/EmployeesDirectory';
import DisciplinaryDashboard from './pages/DisciplinaryDashboard';
import DisciplinaryCase from './pages/DisciplinaryCase';

/** Reload once when a deploy orphans a lazy chunk (HTML served instead of JS). */
function lazyPage(importer) {
  return lazy(async () => {
    try {
      return await importer();
    } catch (error) {
      const key = 'cl_lazy_chunk_reload';
      if (!sessionStorage.getItem(key)) {
        sessionStorage.setItem(key, '1');
        window.location.reload();
        return { default: () => null };
      }
      sessionStorage.removeItem(key);
      throw error;
    }
  });
}

const PortalAccessMatrix = lazyPage(() => import('./pages/PortalAccessMatrix'));
const EmployeeDetail = lazyPage(() => import('./pages/EmployeeDetail'));
const DuplicateEmployees = lazyPage(() => import('./pages/DuplicateEmployees'));
const BirthdaysAnniversaries = lazyPage(() => import('./pages/BirthdaysAnniversaries'));
const ActiveDisciplinaryMeasures = lazyPage(() => import('./pages/ActiveDisciplinaryMeasures'));
const BonusDeductions = lazyPage(() => import('./pages/BonusDeductions'));
const BonusPaymentSchedule = lazyPage(() => import('./pages/BonusPaymentSchedule'));
const CaseNotificationSettings = lazyPage(() => import('./pages/CaseNotificationSettings'));
const BumpCardPage = lazyPage(() => import('./pages/BumpCardPage'));
const BumpPromptPage = lazyPage(() => import('./pages/BumpPromptPage'));
const EmergencyPhone = lazyPage(() => import('./pages/EmergencyPhone'));
const FunAdmin = lazyPage(() => import('./pages/FunAdmin'));
const RollCallLists = lazyPage(() => import('./pages/RollCallLists'));
const RollCallListDetail = lazyPage(() => import('./pages/RollCallListDetail'));

function LazyPage({ children }) {
  return (
    <Suspense fallback={<PageSpinner label="Loading page…" />}>
      {children}
    </Suspense>
  );
}

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
      <LanguageProvider>
        <AuthProvider>
          <PortalThemeSync />
          <BrowserRouter>
            <AppErrorBoundary>
              <RouteDocumentTitle />
              <Routes>
                <Route path="/login" element={<Login />} />
                <Route path="/logout" element={<Logout />} />
                <Route path="/" element={<Navigate to="/dashboard/profile" replace />} />
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
                  <Route path="bump-card" element={<LazyPage><BumpCardPage /></LazyPage>} />
                  <Route path="emergency-phone" element={<LazyPage><EmergencyPhone /></LazyPage>} />

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
                          <LazyPage><DuplicateEmployees /></LazyPage>
                        </ProtectedRoute>
                      )}
                    />
                    <Route
                      path="employees/milestones"
                      element={(
                        <ProtectedRoute requireEmployeeDirectory>
                          <LazyPage><BirthdaysAnniversaries /></LazyPage>
                        </ProtectedRoute>
                      )}
                    />
                    <Route
                      path="employees/:uid"
                      element={(
                        <ProtectedRoute requireEmployeeDirectory>
                          <LazyPage><EmployeeDetail /></LazyPage>
                        </ProtectedRoute>
                      )}
                    />
                    <Route
                      path="roll-calls"
                      element={(
                        <ProtectedRoute requireEmployeeDirectory>
                          <LazyPage><RollCallLists /></LazyPage>
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
                          <LazyPage><RollCallListDetail /></LazyPage>
                        </ProtectedRoute>
                      )}
                    />
                    <Route
                      path="active-disciplinary-measures"
                      element={(
                        <ProtectedRoute requireCasesManager>
                          <LazyPage><ActiveDisciplinaryMeasures /></LazyPage>
                        </ProtectedRoute>
                      )}
                    />
                    <Route
                      path="bonus-deductions"
                      element={(
                        <ProtectedRoute requireBonusAccess>
                          <LazyPage><BonusDeductions /></LazyPage>
                        </ProtectedRoute>
                      )}
                    />
                    <Route
                      path="bonus-payments"
                      element={(
                        <ProtectedRoute requireBonusAccess>
                          <LazyPage><BonusPaymentSchedule /></LazyPage>
                        </ProtectedRoute>
                      )}
                    />
                    <Route
                      path="case-notifications"
                      element={(
                        <ProtectedRoute requireAdmin>
                          <LazyPage><CaseNotificationSettings /></LazyPage>
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
                          <LazyPage><BumpPromptPage /></LazyPage>
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

                  <Route path="portal-access" element={<ProtectedRoute requireAdmin><LazyPage><PortalAccessMatrix /></LazyPage></ProtectedRoute>} />
                  <Route path="nonograms" element={<ProtectedRoute requireAdmin><Navigate to="/dashboard/fun-admin?tab=nonograms" replace /></ProtectedRoute>} />
                  <Route path="fun-admin" element={<ProtectedRoute requireAdmin><LazyPage><FunAdmin /></LazyPage></ProtectedRoute>} />
                  <Route path="users" element={<Navigate to="/dashboard/hr/employees" replace />} />
                  <Route path="users/:uid" element={<Navigate to="/dashboard/hr/employees" replace />} />
                </Route>
                <Route path="*" element={<NotFound />} />
              </Routes>
            </AppErrorBoundary>
          </BrowserRouter>
        </AuthProvider>
      </LanguageProvider>
    </ThemeProvider>
  );
}
