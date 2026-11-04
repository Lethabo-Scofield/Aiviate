// services/supabase.js
import { createClient } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Replace with your actual Supabase Project URL and Anon/Public API Key
const SUPABASE_URL = 'https://cqtpggtckjkbnooyqkue.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_HWI3hFmSN_evflxALsBsYQ_NHcv3zGm';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});