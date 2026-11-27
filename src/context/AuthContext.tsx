import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '../services/supabaseClient';
import { AuthService, AdminProfile } from '../services/authService';

interface AuthContextType {
  user: User | null;
  session: Session | null;
  adminProfile: AdminProfile | null;
  isAdmin: boolean;
  isLoading: boolean;
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
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState<boolean>(false);

  // Check and restore active Supabase session on mount
  useEffect(() => {
    let mounted = true;
    let verifiedUserId: string | null = null;

    async function syncAdminForSession(targetUser: User | null) {
      if (!targetUser) {
        verifiedUserId = null;
        if (mounted) {
          setAdminProfile(null);
          setIsAdmin(false);
        }
        return;
      }

      if (verifiedUserId === targetUser.id) return;
      verifiedUserId = targetUser.id;

      const { isAdmin: adminStatus, profile } = await AuthService.verifyAdminStatus(targetUser);
      if (mounted && verifiedUserId === targetUser.id) {
        setIsAdmin(adminStatus);
        setAdminProfile(profile);
      }
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
        if (mounted) setIsLoading(false);
      }
    }

    initializeAuth();

    // Listen to Supabase auth state changes (skipping duplicate INITIAL_SESSION already handled above)
    const { data: authListener } = supabase.auth.onAuthStateChange(async (event, currentSession) => {
      if (!mounted) return;
      if (event === 'INITIAL_SESSION') return;

      setSession(currentSession);
      setUser(currentSession?.user || null);
      await syncAdminForSession(currentSession?.user || null);
    });

    return () => {
      mounted = false;
      authListener?.subscription.unsubscribe();
    };
  }, []);

  const login = useCallback(async (email: string, password: string): Promise<{ success: boolean; error?: string }> => {
    setIsLoading(true);
    try {
      const { user: authUser, session: authSession, error } = await AuthService.signIn(email, password);

      if (error) {
        setIsLoading(false);
        return { success: false, error: error.message };
      }

      if (authUser && authSession) {
        setUser(authUser);
        setSession(authSession);

        const { isAdmin: adminStatus, profile } = await AuthService.verifyAdminStatus(authUser);
        setIsAdmin(adminStatus);
        setAdminProfile(profile);
        setIsAuthModalOpen(false);
        setIsLoading(false);
        return { success: true };
      }

      setIsLoading(false);
      return { success: false, error: 'Authentication failed.' };
    } catch (err: any) {
      setIsLoading(false);
      return { success: false, error: err.message || 'Authentication error.' };
    }
  }, []);

  const logout = useCallback(async () => {
    setIsLoading(true);
    try {
      await AuthService.signOut();
    } catch (e) {
      console.warn('Sign out notice', e);
    } finally {
      setUser(null);
      setSession(null);
      setAdminProfile(null);
      setIsAdmin(false);
      setIsLoading(false);
    }
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        session,
        adminProfile,
        isAdmin,
        isLoading,
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
