import React from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider, useAuth } from './features/auth/AuthContext';
import { ToastProvider } from './components/ui/ToastProvider';
import { StaffLoginPage } from './pages/StaffLoginPage';
import { DashboardPage } from './pages/admin/AdminDashboardPage';
import { TeachersPage } from './pages/admin/TeachersPage';
import { StudentsPage } from './pages/admin/StudentsPage';
import { SubjectsPage } from './pages/admin/SubjectsPage';
import { AdmissionCardsPage } from './pages/admin/AdmissionCardsPage';
import { SettingsAuditPage } from './pages/admin/SettingsAuditPage';
import { QuestionBankPage } from './pages/shared/QuestionBankPage';
import { WordImportPage } from './pages/shared/WordImportPage';
import { ExamBuilderPage } from './pages/shared/ExamBuilderPage';
import { SchedulesTokensPage } from './pages/shared/SchedulesTokensPage';
import { LiveMonitoringPage } from './pages/shared/LiveMonitoringPage';
import { ResultsPage } from './pages/shared/ResultsPage';
import { ImportScoresViolationsPage } from './pages/shared/ImportScoresViolationsPage';
import { ViolationsPage } from './pages/shared/ViolationsPage';
import { ChangePasswordPage } from './pages/shared/ChangePasswordPage';
import { StudentAccessPage } from './pages/student/StudentAccessPage';
import { StudentExamPage } from './pages/student/StudentExamPage';

function ProtectedStaffRoute({
  children,
  requireAdminRole = false,
}: {
  children: React.ReactNode;
  requireAdminRole?: boolean;
}) {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen bg-[#FAFBFD] flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-[#243B64] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to={requireAdminRole ? '/admin/login' : '/teacher/login'} replace />;
  }

  if (requireAdminRole && user.role !== 'admin') {
    return <Navigate to="/teacher/dashboard" replace />;
  }

  return <>{children}</>;
}

class PortalErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; message: string }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, message: '' };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, message: error.message };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-[#F1F4F8] flex items-center justify-center p-6">
          <div className="max-w-md w-full bg-white border border-slate-200 rounded-xl p-6 text-center space-y-3">
            <h1 className="text-lg font-bold text-[#243B64]">Something went wrong</h1>
            <p className="text-xs text-slate-600">{this.state.message}</p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="px-4 py-2 text-xs font-semibold text-white bg-[#243B64] rounded-lg"
            >
              Reload Portal
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

export default function App() {
  return (
    <PortalErrorBoundary>
      <ToastProvider>
        <AuthProvider>
          <BrowserRouter basename={import.meta.env.BASE_URL.replace(/\/+$/, '') || '/'}>
            <Routes>
              {/* Default to Student Exam Access */}
              <Route path="/" element={<Navigate to="/student/access" replace />} />

              {/* Public Authentication & Student Access */}
              <Route path="/admin/login" element={<StaffLoginPage portalRole="admin" />} />
              <Route path="/teacher/login" element={<StaffLoginPage portalRole="teacher" />} />
              <Route path="/student/access" element={<StudentAccessPage />} />
              <Route path="/student/exam" element={<StudentExamPage />} />

              {/* Admin Protected Routes */}
              <Route
                path="/admin/dashboard"
                element={
                  <ProtectedStaffRoute requireAdminRole>
                    <DashboardPage />
                  </ProtectedStaffRoute>
                }
              />
              <Route
                path="/admin/teachers"
                element={
                  <ProtectedStaffRoute requireAdminRole>
                    <TeachersPage />
                  </ProtectedStaffRoute>
                }
              />
              <Route
                path="/admin/students"
                element={
                  <ProtectedStaffRoute requireAdminRole>
                    <StudentsPage />
                  </ProtectedStaffRoute>
                }
              />
              <Route
                path="/admin/subjects"
                element={
                  <ProtectedStaffRoute requireAdminRole>
                    <SubjectsPage />
                  </ProtectedStaffRoute>
                }
              />
              <Route
                path="/admin/question-bank"
                element={
                  <ProtectedStaffRoute requireAdminRole>
                    <QuestionBankPage />
                  </ProtectedStaffRoute>
                }
              />
              <Route
                path="/admin/import-word"
                element={
                  <ProtectedStaffRoute requireAdminRole>
                    <WordImportPage />
                  </ProtectedStaffRoute>
                }
              />
              <Route
                path="/admin/exams"
                element={
                  <ProtectedStaffRoute requireAdminRole>
                    <ExamBuilderPage />
                  </ProtectedStaffRoute>
                }
              />
              <Route
                path="/admin/schedules"
                element={
                  <ProtectedStaffRoute requireAdminRole>
                    <SchedulesTokensPage />
                  </ProtectedStaffRoute>
                }
              />
              <Route
                path="/admin/admission-cards"
                element={
                  <ProtectedStaffRoute requireAdminRole>
                    <AdmissionCardsPage />
                  </ProtectedStaffRoute>
                }
              />
              <Route
                path="/admin/monitoring"
                element={
                  <ProtectedStaffRoute requireAdminRole>
                    <LiveMonitoringPage />
                  </ProtectedStaffRoute>
                }
              />
              <Route
                path="/admin/results"
                element={
                  <ProtectedStaffRoute requireAdminRole>
                    <ResultsPage />
                  </ProtectedStaffRoute>
                }
              />
              <Route
                path="/admin/imports"
                element={
                  <ProtectedStaffRoute requireAdminRole>
                    <ImportScoresViolationsPage />
                  </ProtectedStaffRoute>
                }
              />
              <Route
                path="/admin/violations"
                element={
                  <ProtectedStaffRoute requireAdminRole>
                    <ViolationsPage />
                  </ProtectedStaffRoute>
                }
              />
              <Route
                path="/admin/settings"
                element={
                  <ProtectedStaffRoute requireAdminRole>
                    <SettingsAuditPage />
                  </ProtectedStaffRoute>
                }
              />
              <Route
                path="/admin/change-password"
                element={
                  <ProtectedStaffRoute requireAdminRole>
                    <ChangePasswordPage />
                  </ProtectedStaffRoute>
                }
              />

              {/* Teacher Protected Routes */}
              <Route
                path="/teacher/dashboard"
                element={
                  <ProtectedStaffRoute>
                    <DashboardPage />
                  </ProtectedStaffRoute>
                }
              />
              <Route
                path="/teacher/question-bank"
                element={
                  <ProtectedStaffRoute>
                    <QuestionBankPage />
                  </ProtectedStaffRoute>
                }
              />
              <Route
                path="/teacher/import-word"
                element={
                  <ProtectedStaffRoute>
                    <WordImportPage />
                  </ProtectedStaffRoute>
                }
              />
              <Route
                path="/teacher/exams"
                element={
                  <ProtectedStaffRoute>
                    <ExamBuilderPage />
                  </ProtectedStaffRoute>
                }
              />
              <Route
                path="/teacher/schedules"
                element={
                  <ProtectedStaffRoute>
                    <SchedulesTokensPage />
                  </ProtectedStaffRoute>
                }
              />
              <Route
                path="/teacher/monitoring"
                element={
                  <ProtectedStaffRoute>
                    <LiveMonitoringPage />
                  </ProtectedStaffRoute>
                }
              />
              <Route
                path="/teacher/results"
                element={
                  <ProtectedStaffRoute>
                    <ResultsPage />
                  </ProtectedStaffRoute>
                }
              />
              <Route
                path="/teacher/imports"
                element={
                  <ProtectedStaffRoute>
                    <ImportScoresViolationsPage />
                  </ProtectedStaffRoute>
                }
              />
              <Route
                path="/teacher/violations"
                element={
                  <ProtectedStaffRoute>
                    <ViolationsPage />
                  </ProtectedStaffRoute>
                }
              />
              <Route
                path="/teacher/change-password"
                element={
                  <ProtectedStaffRoute>
                    <ChangePasswordPage />
                  </ProtectedStaffRoute>
                }
              />

              <Route path="*" element={<Navigate to="/student/access" replace />} />
            </Routes>
          </BrowserRouter>
        </AuthProvider>
      </ToastProvider>
    </PortalErrorBoundary>
  );
}
