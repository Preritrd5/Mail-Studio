import React from 'react';
import { AppProvider, useApp } from './context/AppContext';
import { AuthProvider } from './context/AuthContext';
import { Sidebar } from './components/layout/Sidebar';
import { Header } from './components/layout/Header';
import { ToastContainer } from './components/common/ToastContainer';
import { AdminLoginModal } from './components/auth/AdminLoginModal';

// Views
import { DashboardView } from './views/DashboardView';
import { ComposeEmailView } from './views/ComposeEmailView';
import { BulkImportView } from './views/BulkImportView';
import { SendingQueueView } from './views/SendingQueueView';
import { EmailActivityView } from './views/EmailActivityView';
import { EmailTemplatesView } from './views/EmailTemplatesView';
import { ReportsView } from './views/ReportsView';

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
            {activeSection === 'dashboard' && <DashboardView />}
            {activeSection === 'compose' && <ComposeEmailView />}
            {activeSection === 'bulk-import' && <BulkImportView />}
            {activeSection === 'sending-queue' && <SendingQueueView />}
            {activeSection === 'email-activity' && <EmailActivityView />}
            {activeSection === 'email-templates' && <EmailTemplatesView />}
            {activeSection === 'reports' && <ReportsView />}
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

      {/* Admin Login Modal (Supabase Auth) */}
      <AdminLoginModal />

      {/* Floating Toast Notification Container */}
      <ToastContainer />
    </div>
  );
}

export function App() {
  return (
    <AuthProvider>
      <AppProvider>
        <MainAppShell />
      </AppProvider>
    </AuthProvider>
  );
}

export default App;
