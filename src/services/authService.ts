import { supabase } from './supabaseClient';
import { fetchApiEnvelope, ApiError } from './apiConfig';
import { User, Session } from '@supabase/supabase-js';

export interface AdminProfile {
  id?: string;
  userId: string;
  displayName: string;
  email: string;
  createdAt?: string;
}

export class AuthService {
  /**
   * Authenticate administrator with email and password via Supabase Auth
   */
  public static async signIn(email: string, password: string): Promise<{ user: User | null; session: Session | null; error: Error | null }> {
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password: password.trim(),
      });

      if (error) throw error;
      return { user: data.user, session: data.session, error: null };
    } catch (err: any) {
      return { user: null, session: null, error: err };
    }
  }

  /**
   * Sign out current user and clear local session
   */
  public static async signOut(): Promise<{ error: Error | null }> {
    try {
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
      return { error: null };
    } catch (err: any) {
      return { error: err };
    }
  }

  /**
   * Retrieve active session
   */
  public static async getSession(): Promise<Session | null> {
    try {
      const { data, error } = await supabase.auth.getSession();
      if (error) throw error;
      return data.session;
    } catch (e) {
      console.warn('Failed to retrieve active session', e);
      return null;
    }
  }

  /**
   * Verify administrator authorization strictly via backend /api/auth/session.
   * Never trusts editable user_metadata, email substrings, or browser-only flags.
   */
  public static async verifyAdminStatus(user: User): Promise<{
    isAdmin: boolean;
    profile: AdminProfile | null;
    error?: string;
    statusCode?: number;
  }> {
    if (!user) {
      return { isAdmin: false, profile: null };
    }

    try {
      const res = await fetchApiEnvelope<{ authenticated?: boolean; isAdmin: boolean; profile: AdminProfile | null }>('/auth/session');
      if (res.success && res.data?.authenticated && res.data?.isAdmin) {
        return {
          isAdmin: true,
          profile: res.data.profile || {
            userId: user.id,
            displayName: user.user_metadata?.display_name || user.email?.split('@')[0] || 'Administrator',
            email: user.email || '',
          },
        };
      }
      return {
        isAdmin: false,
        profile: null,
        error: 'Account lacks Certified Administrator authorization.',
        statusCode: 403,
      };
    } catch (err: any) {
      return {
        isAdmin: false,
        profile: null,
        error: err instanceof ApiError ? err.message : 'Unable to verify administrator session with backend.',
        statusCode: err instanceof ApiError ? err.status : undefined,
      };
    }
  }
}
