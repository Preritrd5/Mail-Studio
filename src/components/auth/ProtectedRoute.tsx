import React from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { ShieldAlert, LogOut } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { LoadingSpinner } from '../common/Loading';
import { Card } from '../common/Card';
import { Button } from '../common/Button';

/**
 * Centered initialization screen displayed only while Supabase Auth restores
 * an existing session and verifies administrator authorization.
 * Prevents route flickering (no Dashboard or Login flash during startup).
 */
export const AuthRestorationScreen: React.FC<{ label?: string }> = ({
  label = 'Restoring administrator session...',
}) => {
  return (
    <div className="min-h-screen bg-[#F4F6FA] flex items-center justify-center p-6">
      <div className="bg-white border border-[#CBD5E1] rounded-2xl shadow-sm px-8 py-9 max-w-sm w-full flex flex-col items-center text-center gap-4">
        <img
          src="/assets/snpsunexus-logo.png"
          alt="SNPSUNEXUS"
          className="w-10 h-12 object-contain shrink-0"
        />
        <LoadingSpinner size="lg" tone="brand" label={label} />
        <div className="space-y-1">
          <p className="text-sm font-bold text-[#172E58]">SNPSUNEXUS Mail Studio</p>
          <p className="text-xs text-[#64748B]">{label}</p>
        </div>
      </div>
    </div>
  );
};

/**
 * Centralized route guard for all authenticated administrator routes.
 * Waits for authentication initialization to complete before redirecting,
 * preserving the full requested URL (pathname + search + hash) across reloads.
 */
export const ProtectedRoute: React.FC = () => {
  const { user, isAdmin, isInitializing, sessionExpired, authError, logout } = useAuth();
  const location = useLocation();

  // 1. Wait until Supabase session restoration & admin verification finish
  if (isInitializing) {
    return <AuthRestorationScreen />;
  }

  // 2. Unauthenticated or expired session -> redirect to /login with return path preserved
  if (!user) {
    const requestedPath = `${location.pathname}${location.search}${location.hash}`;
    const loginTarget = `/login?redirect=${encodeURIComponent(requestedPath)}`;
    return <Navigate to={loginTarget} replace state={{ sessionExpired }} />;
  }

  // 3. Authenticated user who lacks administrator privileges -> block protected UI
  if (!isAdmin) {
    return (
      <div className="min-h-screen bg-[#F4F6FA] flex items-center justify-center p-6">
        <Card className="max-w-md w-full p-6 sm:p-8 text-center space-y-4">
          <div className="mx-auto w-12 h-12 rounded-xl bg-rose-50 border border-rose-200 flex items-center justify-center text-rose-600">
            <ShieldAlert size={24} />
          </div>
          <div className="space-y-1.5">
            <h1 className="text-lg font-bold text-[#172E58]">Administrator Access Required</h1>
            <p className="text-xs text-[#64748B] leading-relaxed">
              Signed in as <span className="font-semibold text-[#1E293B]">{user.email}</span>, but this account is not authorized in <code className="text-[11px] bg-slate-100 px-1 py-0.5 rounded">public.admin_users</code>.
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

  // 4. Verified administrator -> render the exact requested route
  return <Outlet />;
};
