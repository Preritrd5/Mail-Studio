import React from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { Lock, ShieldAlert, LogIn, LogOut, Clock } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { PageLoader } from '../common/Loading';
import { Card } from '../common/Card';
import { Button } from '../common/Button';
import { getSectionFromPathname, APP_ROUTES } from '../../routes/routeConfig';

function getSectionLabel(pathname: string): string {
  const section = getSectionFromPathname(pathname);
  const match = APP_ROUTES.find((r) => r.section === section);
  return match?.label || 'this section';
}

/**
 * Centered initialization screen displayed inside the workspace while Supabase Auth
 * restores an existing session and verifies administrator authorization.
 * Prevents route flickering and avoids premature restricted/redirect states.
 */
export const AuthRestorationScreen: React.FC<{ label?: string }> = ({
  label = 'Restoring administrator session...',
}) => {
  return (
    <PageLoader
      title="Verifying Administrator Session"
      subtitle={label}
      size="lg"
    />
  );
};

/**
 * Centralized guard for restricted administrator sections (/compose, /bulk-import,
 * /queue, /activity, /templates, /reports).
 * Keeps the user on the exact requested URL across refreshes, shows a clean
 * "Not signed in — Please sign in first" restricted state when unauthenticated,
 * and reveals the full section immediately after sign-in via AdminLoginModal.
 */
export const ProtectedRoute: React.FC = () => {
  const { user, isAdmin, isInitializing, sessionExpired, authError, openAuthModal, logout } = useAuth();
  const location = useLocation();
  const sectionLabel = getSectionLabel(location.pathname);

  // 1. Wait until Supabase session restoration & admin verification complete
  if (isInitializing) {
    return <AuthRestorationScreen />;
  }

  // 2. Not signed in (or session expired) -> stay on current URL, block content, prompt to sign in first
  if (!user) {
    return (
      <div className="max-w-xl mx-auto my-8">
        <Card className="p-6 sm:p-8 text-center space-y-5 border-amber-200/80">
          <div className="mx-auto w-14 h-14 rounded-2xl bg-[#EEF4FF] border border-[#1456AD]/20 flex items-center justify-center text-[#1456AD]">
            {sessionExpired ? <Clock size={26} /> : <Lock size={26} />}
          </div>

          <div className="space-y-2">
            <span className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-full bg-amber-100 text-amber-800 border border-amber-200">
              {sessionExpired ? 'Session Expired' : 'Not Signed In'}
            </span>
            <h2 className="text-lg sm:text-xl font-bold text-[#172E58]">
              {sessionExpired
                ? `Session Expired — Sign In First`
                : `Not Signed In — First Sign In`}
            </h2>
            <p className="text-xs sm:text-sm text-[#64748B] leading-relaxed max-w-md mx-auto">
              {sessionExpired
                ? `Your administrator session expired. Please sign in first to continue using ${sectionLabel}.`
                : `Access to ${sectionLabel} is restricted until you sign in as a verified administrator.`}
            </p>
          </div>

          <div className="pt-1 flex justify-center">
            <Button
              variant="primary"
              size="md"
              icon={<LogIn size={16} />}
              onClick={openAuthModal}
              className="font-semibold px-6"
            >
              Sign In to Continue
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  // 3. Signed in but lacking administrator authorization -> block restricted UI cleanly
  if (!isAdmin) {
    return (
      <div className="max-w-xl mx-auto my-8">
        <Card className="p-6 sm:p-8 text-center space-y-4">
          <div className="mx-auto w-12 h-12 rounded-xl bg-rose-50 border border-rose-200 flex items-center justify-center text-rose-600">
            <ShieldAlert size={24} />
          </div>
          <div className="space-y-1.5">
            <h2 className="text-lg font-bold text-[#172E58]">Administrator Access Required</h2>
            <p className="text-xs text-[#64748B] leading-relaxed">
              Signed in as <span className="font-semibold text-[#1E293B]">{user.email}</span>, but this account is not authorized to access {sectionLabel}.
            </p>
            {authError && (
              <p className="text-xs text-rose-600 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2 mt-2">
                {authError}
              </p>
            )}
          </div>
          <div className="pt-2 flex justify-center">
            <Button
              variant="primary"
              size="md"
              icon={<LogOut size={15} />}
              onClick={() => void logout()}
            >
              Sign Out & Switch Account
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  // 4. Verified administrator -> render the requested route directly
  return <Outlet />;
};
