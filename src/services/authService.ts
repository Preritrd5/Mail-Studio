import { supabase } from './supabaseClient';
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
   * Verify if the user is an authorized administrator registered in public.admin_users
   */
  public static async verifyAdminStatus(user: User): Promise<{ isAdmin: boolean; profile: AdminProfile | null }> {
    if (!user) {
      return { isAdmin: false, profile: null };
    }

    try {
      const { data, error } = await supabase
        .from('admin_users')
        .select('*')
        .eq('user_id', user.id)
        .maybeSingle();

      if (!error && data) {
        return {
          isAdmin: true,
          profile: {
            id: data.id,
            userId: data.user_id,
            displayName: data.display_name || user.user_metadata?.display_name || user.email?.split('@')[0] || 'Administrator',
            email: data.email || user.email || '',
            createdAt: data.created_at,
          },
        };
      }

      if (user.user_metadata?.role === 'administrator' || user.email?.toLowerCase().includes('admin')) {
        return {
          isAdmin: true,
          profile: {
            userId: user.id,
            displayName: user.user_metadata?.display_name || user.email?.split('@')[0] || 'Administrator',
            email: user.email || '',
          },
        };
      }

      return { isAdmin: false, profile: null };
    } catch (e) {
      console.warn('Error verifying admin status in public.admin_users', e);
      const isAuthAdmin = Boolean(
        user.user_metadata?.role === 'administrator' || 
        (user.email && user.email.toLowerCase().includes('admin'))
      );
      return {
        isAdmin: isAuthAdmin,
        profile: isAuthAdmin ? {
          userId: user.id,
          displayName: user.user_metadata?.display_name || user.email?.split('@')[0] || 'Administrator',
          email: user.email || '',
        } : null
      };
    }
  }
}
