import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '../services/supabaseClient';
import { AuthService, AdminProfile } from '../services/authService';

interface AuthContextType {
  user: User | null;
  session: Session | null;
  adminProfile: AdminProfile | null;
  isAdmin: boolean;
  /** True only during initial session restoration & admin verification on mount */
  isInitializing: boolean;
  /** True during initial restoration OR active login/logout mutations */
  isLoading: boolean;
  authError: string | null;
  sessionExpired: boolean;
  clearAuthNotice: () => void;
  isAuthModalOpen: boolean;
  openAuthModal: () => void;
  closeAuthModal: () => void;
  login: (email: string, password: string) => Promise<{ success: boolean; error?: string }>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [adminProfile, setAdminProfile] = useState<AdminProfile | null>(null);
  const [isAdmin, setIsAdmin] = useState<boolean>(false);
  const [isInitializing, setIsInitializing] = useState<boolean>(true);
  const [isMutatingAuth, setIsMutatingAuth] = useState<boolean>(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [sessionExpired, setSessionExpired] = useState<boolean>(false);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState<boolean>(false);

  const manualLogoutRef = useRef<boolean>(false);
  const wasAuthenticatedRef = useRef<boolean>(false);

  const clearAuthNotice = useCallback(() => {
    setAuthError(null);
    setSessionExpired(false);
  }, []);

  // Check and restore active Supabase session on mount
  useEffect(() => {
    let mounted = true;
    let verifiedUserId: string | null = null;

    async function syncAdminForSession(targetUser: User | null): Promise<{ expired: boolean }> {
      if (!targetUser) {
        verifiedUserId = null;
        if (mounted) {
          setAdminProfile(null);
          setIsAdmin(false);
        }
        return { expired: false };
      }

      if (verifiedUserId === targetUser.id) {
        return { expired: false };
      }
      verifiedUserId = targetUser.id;

      const { isAdmin: adminStatus, profile, error, statusCode } = await AuthService.verifyAdminStatus(targetUser);
      if (!mounted || verifiedUserId !== targetUser.id) {
        return { expired: false };
      }

      // If backend explicitly rejected the restored token with HTTP 401, treat session as expired
      if (statusCode === 401) {
        verifiedUserId = null;
        setUser(null);
        setSession(null);
        setAdminProfile(null);
        setIsAdmin(false);
        setAuthError(null);
        setSessionExpired(true);
        wasAuthenticatedRef.current = false;
        void AuthService.signOut();
        return { expired: true };
      }

      setIsAdmin(adminStatus);
      setAdminProfile(profile);
      setAuthError(adminStatus ? null : error || null);
      if (adminStatus) {
        setSessionExpired(false);
        wasAuthenticatedRef.current = true;
      }
      return { expired: false };
    }

    async function initializeAuth() {
      try {
        const initialSession = await AuthService.getSession();
        if (!mounted) return;

        if (initialSession?.user) {
          setSession(initialSession);
          setUser(initialSession.user);
          await syncAdminForSession(initialSession.user);
        } else {
          setUser(null);
          setSession(null);
          await syncAdminForSession(null);
        }
      } catch (err) {
        console.warn('Supabase auth session restoration notice', err);
      } finally {
        if (mounted) setIsInitializing(false);
      }
    }

    void initializeAuth();

    // Listen to Supabase auth state changes (skipping INITIAL_SESSION handled above)
    const { data: authListener } = supabase.auth.onAuthStateChange(async (event, currentSession) => {
      if (!mounted) return;
      if (event === 'INITIAL_SESSION') return;

      if (event === 'SIGNED_OUT' || !currentSession?.user) {
        const wasManual = manualLogoutRef.current;
        manualLogoutRef.current = false;
        const hadSession = wasAuthenticatedRef.current;
        wasAuthenticatedRef.current = false;
        verifiedUserId = null;

        setSession(null);
        setUser(null);
        setAdminProfile(null);
        setIsAdmin(false);
        setAuthError(null);
        if (!wasManual && hadSession) {
          setSessionExpired(true);
        }
        return;
      }

      // Preserve current route and state on TOKEN_REFRESHED / SIGNED_IN without resetting isInitializing
      setSession(currentSession);
      setUser(currentSession.user);
      if (event !== 'TOKEN_REFRESHED' || verifiedUserId !== currentSession.user.id) {
        await syncAdminForSession(currentSession.user);
      }
    });

    return () => {
      mounted = false;
      authListener?.subscription.unsubscribe();
    };
  }, []);

  const login = useCallback(async (email: string, password: string): Promise<{ success: boolean; error?: string }> => {
    setIsMutatingAuth(true);
    setAuthError(null);
    setSessionExpired(false);

    try {
      const { user: authUser, session: authSession, error } = await AuthService.signIn(email, password);

      if (error) {
        setIsMutatingAuth(false);
        return { success: false, error: error.message };
      }

      if (authUser && authSession) {
        setUser(authUser);
        setSession(authSession);

        const { isAdmin: adminStatus, profile, error: verifyError } = await AuthService.verifyAdminStatus(authUser);
        setIsAdmin(adminStatus);
        setAdminProfile(profile);
        setAuthError(adminStatus ? null : verifyError || null);
        setIsMutatingAuth(false);

        if (!adminStatus) {
          return {
            success: false,
            error: verifyError || 'Signed in, but this account is not authorized as an administrator.',
          };
        }

        wasAuthenticatedRef.current = true;
        setIsAuthModalOpen(false);
        return { success: true };
      }

      setIsMutatingAuth(false);
      return { success: false, error: 'Authentication failed.' };
    } catch (err: any) {
      setIsMutatingAuth(false);
      return { success: false, error: err.message || 'Authentication error.' };
    }
  }, []);

  const logout = useCallback(async () => {
    manualLogoutRef.current = true;
    wasAuthenticatedRef.current = false;
    setIsMutatingAuth(true);
    try {
      await AuthService.signOut();
    } catch (e) {
      console.warn('Sign out notice', e);
    } finally {
      setUser(null);
      setSession(null);
      setAdminProfile(null);
      setIsAdmin(false);
      setAuthError(null);
      setSessionExpired(false);
      setIsMutatingAuth(false);
    }
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        session,
        adminProfile,
        isAdmin,
        isInitializing,
        isLoading: isInitializing || isMutatingAuth,
        authError,
        sessionExpired,
        clearAuthNotice,
        isAuthModalOpen,
        openAuthModal: () => setIsAuthModalOpen(true),
        closeAuthModal: () => setIsAuthModalOpen(false),
        login,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
