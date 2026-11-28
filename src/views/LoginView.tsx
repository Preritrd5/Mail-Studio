import React, { useState } from 'react';
import { Navigate, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { ShieldCheck, Lock, Mail, AlertCircle, ArrowRight, Database, Clock } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useApp } from '../context/AppContext';
import { Button } from '../components/common/Button';
import { AuthRestorationScreen } from '../components/auth/ProtectedRoute';
import { getSafeRedirectTarget } from '../routes/routeConfig';

export const LoginView: React.FC = () => {
  const { user, isAdmin, isInitializing, sessionExpired, clearAuthNotice, login, logout } = useAuth();
  const { addToast } = useApp();
  const [searchParams] = useSearchParams();
  const location = useLocation();
  const navigate = useNavigate();

  const redirectTarget = getSafeRedirectTarget(searchParams.get('redirect'), '/dashboard');
  const routeExpiredNotice = Boolean((location.state as { sessionExpired?: boolean } | null)?.sessionExpired);
  const showExpiredBanner = sessionExpired || routeExpiredNotice;

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Prevent flashing login form while valid session restoration is in progress
  if (isInitializing) {
    return <AuthRestorationScreen label="Checking active administrator session..." />;
  }

  // Already signed in as verified administrator -> return directly to originally requested page
  if (user && isAdmin) {
    return <Navigate to={redirectTarget} replace />;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    clearAuthNotice();

    if (!email || !password) {
      setErrorMessage('Please enter both administrator email and password.');
      return;
    }

    setIsSubmitting(true);
    const result = await login(email, password);
    setIsSubmitting(false);

    if (result.success) {
      addToast({
        type: 'success',
        title: 'Authentication Successful',
        message: `Welcome back (${email}).`,
      });
      navigate(redirectTarget, { replace: true });
    } else {
      setErrorMessage(result.error || 'Failed to authenticate with Supabase Auth.');
    }
  };

  return (
    <div className="min-h-screen bg-[#F4F6FA] flex flex-col items-center justify-center p-4 sm:p-6">
      <div className="w-full max-w-md bg-white rounded-2xl border border-[#CBD5E1] shadow-lg overflow-hidden">
        {/* Header Band (Matches Brand Modal Styling) */}
        <div className="bg-[#172E58] px-6 py-5 text-white flex items-center gap-3.5 border-b-2 border-[#C69A4C]">
          <div className="w-10 h-11 rounded-lg bg-white/10 border border-white/20 p-1.5 flex items-center justify-center shrink-0">
            <img
              src="/assets/snpsunexus-logo.png"
              alt="SNPSUNEXUS"
              className="w-full h-full object-contain"
            />
          </div>
          <div className="min-w-0">
            <h1 className="text-base font-bold tracking-tight text-white">Administrator Sign-In</h1>
            <p className="text-[11px] text-slate-300 truncate">
              SNPSUNEXUS Mail Studio — Verified Access
            </p>
          </div>
        </div>

        {/* Body */}
        <div className="p-6 space-y-4">
          <div className="p-3 rounded-xl bg-[#F4F6FA] border border-[#CBD5E1] text-xs text-[#1E293B] flex items-start gap-2.5">
            <ShieldCheck size={18} className="text-[#1456AD] shrink-0 mt-0.5" />
            <div className="leading-relaxed">
              <span className="font-semibold text-[#172E58]">Administrative Access:</span> Sign in with your registered administrator credentials to continue to{' '}
              <code className="text-[11px] bg-white px-1.5 py-0.5 rounded border border-[#CBD5E1]">
                {redirectTarget.split('?')[0]}
              </code>
              .
            </div>
          </div>

          {showExpiredBanner && !errorMessage && (
            <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-900 flex items-start gap-2">
              <Clock size={16} className="text-amber-600 shrink-0 mt-0.5" />
              <div>
                <span className="font-semibold block">Session Expired</span>
                <span>Your administrator session expired or was signed out. Sign in again to resume.</span>
              </div>
            </div>
          )}

          {errorMessage && (
            <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-700 flex items-start gap-2">
              <AlertCircle size={16} className="text-rose-500 shrink-0 mt-0.5" />
              <div>
                <span className="font-semibold block">Authentication Error:</span>
                <span>{errorMessage}</span>
              </div>
            </div>
          )}

          {user && !isAdmin && (
            <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-700 flex items-center justify-between gap-2">
              <span>Current account ({user.email}) is not an authorized administrator.</span>
              <button
                type="button"
                onClick={() => void logout()}
                className="font-semibold underline shrink-0 cursor-pointer"
              >
                Sign out
              </button>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <label htmlFor="login-admin-email" className="block text-xs font-semibold text-[#172E58]">
                Administrator Email
              </label>
              <div className="relative flex items-center">
                <Mail size={16} className="absolute left-3 text-slate-400 pointer-events-none" />
                <input
                  id="login-admin-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="admin@example.com"
                  required
                  autoComplete="email"
                  className="w-full pl-9 pr-3.5 h-10 text-sm rounded-[10px] border border-[#CBD5E1] snpsu-input-base focus:shadow-[0_0_0_3px_rgba(20,86,173,0.08)] text-[#1E293B]"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label htmlFor="login-admin-password" className="block text-xs font-semibold text-[#172E58]">
                Administrative Password
              </label>
              <div className="relative flex items-center">
                <Lock size={16} className="absolute left-3 text-slate-400 pointer-events-none" />
                <input
                  id="login-admin-password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••••••"
                  required
                  autoComplete="current-password"
                  className="w-full pl-9 pr-3.5 h-10 text-sm rounded-[10px] border border-[#CBD5E1] snpsu-input-base focus:shadow-[0_0_0_3px_rgba(20,86,173,0.08)] text-[#1E293B]"
                />
              </div>
            </div>

            <Button
              type="submit"
              variant="primary"
              className="w-full justify-center py-2.5 text-sm font-semibold"
              isLoading={isSubmitting}
              loadingText="Signing In..."
              icon={<ArrowRight size={16} />}
            >
              Authenticate & Continue
            </Button>
          </form>
        </div>

        <div className="px-6 py-3.5 bg-[#F4F6FA] border-t border-[#CBD5E1] flex items-center justify-between text-[11px] text-[#64748B]">
          <span className="flex items-center gap-1.5">
            <Database size={13} className="text-[#1456AD] shrink-0" />
            <span>Supabase Auth Session Persistence</span>
          </span>
          <span>Deep Navy &bull; Royal Blue</span>
        </div>
      </div>
    </div>
  );
};
