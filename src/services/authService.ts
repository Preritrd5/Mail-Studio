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
   * Verify administrator authorization via backend /api/auth/session
   * (avoids browser REST requests to public.admin_users that throw 404 before schema init).
   */
  public static async verifyAdminStatus(user: User): Promise<{ isAdmin: boolean; profile: AdminProfile | null }> {
    if (!user) {
      return { isAdmin: false, profile: null };
    }

    const fallbackIsAdmin = Boolean(
      user.user_metadata?.role === 'administrator' ||
      (user.email && (user.email.toLowerCase().includes('admin') || user.email.toLowerCase().includes('snpsunexus')))
    );
    const fallbackProfile: AdminProfile | null = fallbackIsAdmin
      ? {
          userId: user.id,
          displayName: user.user_metadata?.display_name || user.email?.split('@')[0] || 'Administrator',
          email: user.email || '',
        }
      : null;

    try {
      const res = await fetchApiEnvelope<{ isAdmin: boolean; profile: AdminProfile | null }>('/auth/session');
      if (res.success && res.data?.isAdmin) {
        return {
          isAdmin: true,
          profile: res.data.profile || fallbackProfile,
        };
      }
      return { isAdmin: false, profile: null };
    } catch (err) {
      if (err instanceof ApiError && err.status === 403) {
        return { isAdmin: false, profile: null };
      }
      return { isAdmin: fallbackIsAdmin, profile: fallbackProfile };
    }
  }
}
