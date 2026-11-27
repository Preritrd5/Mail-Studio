import { createClient } from '@supabase/supabase-js';

// Read Vite environment variables
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
const supabaseAnonKey = (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || import.meta.env.VITE_SUPABASE_ANON_KEY) as string;

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn(
    'Supabase configuration warning: VITE_SUPABASE_URL or VITE_SUPABASE_PUBLISHABLE_KEY is not defined in the frontend environment.'
  );
}

// Client-side Supabase client instance (Uses Publishable/Anon Key ONLY - never Secret Key)
export const supabase = createClient(
  supabaseUrl || 'https://placeholder.supabase.co',
  supabaseAnonKey || 'placeholder-key',
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      storageKey: 'snpsunexus_mail_studio_auth_token',
    },
    realtime: {
      params: {
        eventsPerSecond: 10,
      },
    },
  }
);
