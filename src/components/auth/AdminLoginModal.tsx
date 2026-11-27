import React, { useState } from 'react';
import {
  ShieldCheck,
  Lock,
  Mail,
  AlertCircle,
  ArrowRight,
  Database,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useApp } from '../../context/AppContext';
import { Modal } from '../common/Modal';
import { Button } from '../common/Button';

export const AdminLoginModal: React.FC = () => {
  const { isAuthModalOpen, closeAuthModal, login } = useAuth();
  const { addToast } = useApp();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

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
        message: `Welcome back (${email}). Connected to Supabase Auth.`,
      });
      closeAuthModal();
    } else {
      setErrorMessage(result.error || 'Failed to authenticate with Supabase Auth.');
    }
  };

  return (
    <Modal
      isOpen={isAuthModalOpen}
      onClose={closeAuthModal}
      title="Administrator Sign-In"
      subtitle="SNPSUNEXUS Mail Studio — Verified Access"
      maxWidth="md"
      headerVariant="navy"
      footer={
        <div className="flex items-center justify-between gap-2 w-full text-[11px] text-[#64748B]">
          <div className="flex items-center gap-1.5">
            <Database size={13} className="text-[#1456AD] shrink-0" />
            <span>Supabase Authentication</span>
          </div>
          <Button variant="outline" size="sm" onClick={closeAuthModal}>
            Cancel
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        <div className="p-3 rounded-xl bg-[#F4F6FA] border border-[#CBD5E1] text-xs text-[#1E293B] flex items-start gap-2.5">
          <ShieldCheck size={18} className="text-[#1456AD] shrink-0 mt-0.5" />
          <div className="leading-relaxed">
            <span className="font-semibold text-[#172E58]">Administrative Access:</span> Authenticated via Supabase Auth and verified against registered administrator credentials.
          </div>
        </div>

        {errorMessage && (
          <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-700 flex items-start gap-2">
            <AlertCircle size={16} className="text-rose-500 shrink-0 mt-0.5" />
            <div>
              <span className="font-semibold block">Authentication Error:</span>
              <span>{errorMessage}</span>
            </div>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <label htmlFor="admin-auth-email" className="block text-xs font-semibold text-[#172E58]">
              Administrator Email
            </label>
            <div className="relative flex items-center">
              <Mail size={16} className="absolute left-3 text-slate-400 pointer-events-none" />
              <input
                id="admin-auth-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="admin@example.com"
                required
                className="w-full pl-9 pr-3.5 h-10 text-sm rounded-[10px] border border-[#CBD5E1] focus:outline-none focus:ring-2 focus:ring-[#1456AD]/20 focus:border-[#1456AD] text-[#1E293B]"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label htmlFor="admin-auth-password" className="block text-xs font-semibold text-[#172E58]">
              Administrative Password
            </label>
            <div className="relative flex items-center">
              <Lock size={16} className="absolute left-3 text-slate-400 pointer-events-none" />
              <input
                id="admin-auth-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••••••"
                required
                className="w-full pl-9 pr-3.5 h-10 text-sm rounded-[10px] border border-[#CBD5E1] focus:outline-none focus:ring-2 focus:ring-[#1456AD]/20 focus:border-[#1456AD] text-[#1E293B]"
              />
            </div>
          </div>

          <Button
            type="submit"
            variant="primary"
            size="md"
            isLoading={isSubmitting}
            icon={<ArrowRight size={16} />}
            iconPosition="right"
            className="w-full font-semibold"
          >
            {isSubmitting ? 'Authenticating...' : 'Sign In'}
          </Button>
        </form>
      </div>
    </Modal>
  );
};
