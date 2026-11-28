import React from 'react';
import { BrowserRouter, Routes, Route, Navigate, Outlet, useLocation } from 'react-router-dom';
import { AlertTriangle } from 'lucide-react';
import { AppProvider, useApp } from './context/AppContext';
import { AuthProvider } from './context/AuthContext';
import { Sidebar } from './components/layout/Sidebar';
import { Header } from './components/layout/Header';
import { ToastContainer } from './components/common/ToastContainer';
import { AdminLoginModal } from './components/auth/AdminLoginModal';
import { ProtectedRoute } from './components/auth/ProtectedRoute';
import { Card } from './components/common/Card';
import { Button } from './components/common/Button';

// Views
import { DashboardView } from './views/DashboardView';
import { ComposeEmailView } from './views/ComposeEmailView';
import { BulkImportView } from './views/BulkImportView';
import { SendingQueueView } from './views/SendingQueueView';
import { EmailActivityView } from './views/EmailActivityView';
import { EmailTemplatesView } from './views/EmailTemplatesView';
import { ReportsView } from './views/ReportsView';
import { LoginView } from './views/LoginView';

function PreserveSearchHashRedirect({ to }: { to: string }) {
  const location = useLocation();
  return <Navigate to={`${to}${location.search}${location.hash}`} replace />;
}

function NotFoundView() {
  const { navigateTo } = useApp();
  const location = useLocation();

  return (
    <Card className="max-w-lg mx-auto my-12 p-8 text-center space-y-4">
      <div className="mx-auto w-12 h-12 rounded-xl bg-amber-50 border border-amber-200 flex items-center justify-center text-amber-600">
        <AlertTriangle size={24} />
      </div>
      <div className="space-y-1.5">
        <h2 className="text-lg font-bold text-[#172E58]">Route Not Found</h2>
        <p className="text-xs text-[#64748B]">
          No SNPSUNEXUS Mail Studio section exists at{' '}
          <code className="bg-slate-100 px-1.5 py-0.5 rounded text-[#1E293B]">
            {location.pathname}
          </code>
          .
        </p>
      </div>
      <div className="pt-2">
        <Button variant="primary" size="md" onClick={() => navigateTo('dashboard')}>
          Return to Dashboard
        </Button>
      </div>
    </Card>
  );
}

function MainAppShell() {
  const { activeSection, isSidebarCollapsed } = useApp();

  return (
    <div className="min-h-screen bg-[#F4F6FA] text-[#1E293B] flex overflow-x-clip">
      {/* Sidebar: Fixed Left Deep Navy */}
      <Sidebar />

      {/* Main Content Area: Smoothly transitions padding when sidebar toggles */}
      <div
        className={`flex-1 flex flex-col min-w-0 transition-[padding] duration-200 ease-out ${
          isSidebarCollapsed ? 'lg:pl-20' : 'lg:pl-64'
        }`}
      >
        {/* Top Sticky Header */}
        <Header />

        {/* Section View Container */}
        <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-7xl w-full mx-auto min-w-0">
          <div key={activeSection} className="snpsu-page-enter">
            <Outlet />
          </div>
        </main>

        {/* Application Footer */}
        <footer className="border-t border-[#CBD5E1] bg-white py-4 px-4 sm:px-6 lg:px-8 text-xs text-[#64748B]">
          <div className="max-w-7xl w-full mx-auto flex flex-col sm:flex-row items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <img
                src="/assets/snpsunexus-logo.png"
                alt="SNPSUNEXUS"
                className="w-4 h-5 object-contain shrink-0"
              />
              <span className="font-semibold text-[#172E58]">SNPSUNEXUS Mail Studio</span>
            </div>

            <div className="flex items-center gap-4 text-[11px] text-[#64748B]">
              <span>Administrator Email Management Platform</span>
            </div>
          </div>
        </footer>
      </div>

      {/* Admin Login Modal (available if re-authentication is ever requested inline) */}
      <AdminLoginModal />
    </div>
  );
}

export function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppProvider>
          <Routes>
            {/* Public Administrator Login Route */}
            <Route path="/login" element={<LoginView />} />

            {/* Protected Administrator Workspace Routes */}
            <Route element={<ProtectedRoute />}>
              <Route element={<MainAppShell />}>
                <Route path="/" element={<PreserveSearchHashRedirect to="/dashboard" />} />
                <Route path="/dashboard" element={<DashboardView />} />
                <Route path="/dashboard/*" element={<DashboardView />} />
                <Route path="/compose" element={<ComposeEmailView />} />
                <Route path="/compose/*" element={<ComposeEmailView />} />
                <Route path="/bulk-import" element={<BulkImportView />} />
                <Route path="/bulk-import/*" element={<BulkImportView />} />
                <Route path="/queue" element={<SendingQueueView />} />
                <Route path="/queue/*" element={<SendingQueueView />} />
                <Route path="/sending-queue" element={<SendingQueueView />} />
                <Route path="/sending-queue/*" element={<SendingQueueView />} />
                <Route path="/activity" element={<EmailActivityView />} />
                <Route path="/activity/*" element={<EmailActivityView />} />
                <Route path="/email-activity" element={<EmailActivityView />} />
                <Route path="/email-activity/*" element={<EmailActivityView />} />
                <Route path="/templates" element={<EmailTemplatesView />} />
                <Route path="/templates/*" element={<EmailTemplatesView />} />
                <Route path="/email-templates" element={<EmailTemplatesView />} />
                <Route path="/email-templates/*" element={<EmailTemplatesView />} />
                <Route path="/reports" element={<ReportsView />} />
                <Route path="/reports/*" element={<ReportsView />} />
                <Route path="*" element={<NotFoundView />} />
              </Route>
            </Route>
          </Routes>

          {/* Global Toast Notification Container */}
          <ToastContainer />
        </AppProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
