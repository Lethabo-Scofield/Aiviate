// contexts/AuthContext.js
import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { sql } from '../services/neon';

const SESSION_KEY = '@aiviate_driver_session';

const AuthContext = createContext({
  status: 'restoring', // 'restoring' | 'signedIn' | 'suspended' | 'signedOut'
  user: null,
  signIn: async () => {},
  signOut: async () => {},
});

export const useAuth = () => useContext(AuthContext);

export const AuthProvider = ({ children }) => {
  const [status, setStatus] = useState('restoring');
  const [user, setUser] = useState(null);

  // Load stored session on app startup
  useEffect(() => {
    async function loadStoredSession() {
      try {
        const stored = await AsyncStorage.getItem(SESSION_KEY);
        if (stored) {
          const session = JSON.parse(stored);
          if (session && session.user) {
            setUser(session.user);
            setStatus('signedIn');
            return;
          }
        }
        setStatus('signedOut');
      } catch (err) {
        console.error('Failed to load session:', err);
        setStatus('signedOut');
      }
    }
    loadStoredSession();
  }, []);

  // SIGN IN directly via Neon database query
  const signIn = useCallback(async (email, password) => {
    try {
      const cleanEmail = email.trim().toLowerCase();

      // Query Neon directly
      const rows = await sql`
        SELECT * FROM drivers 
        WHERE LOWER(email) = ${cleanEmail} 
        LIMIT 1;
      `;

      if (!rows || rows.length === 0) {
        throw new Error(`No account found for "${email}" in the drivers table.`);
      }

      const record = rows[0];

      // Optional check if account is suspended in database
      if (record.is_suspended || record.status === 'suspended') {
        setStatus('suspended');
        return { ok: false, suspended: true };
      }

      const sessionData = {
        token: `neon_session_${record.id}`,
        user: {
          id: record.id,
          driver_id: record.driver_id || record.id,
          name: record.name || '',
          email: record.email || '',
          company_name: record.company_name || 'Aiviate',
        },
      };

      await AsyncStorage.setItem(SESSION_KEY, JSON.stringify(sessionData));
      setUser(sessionData.user);
      setStatus('signedIn'); // This triggers RootNavigation to switch stacks automatically!
      return { ok: true };
    } catch (err) {
      console.error('Neon Sign-in Error:', err);
      return { ok: false, error: err.message || 'Login failed' };
    }
  }, []);

  // SIGN OUT
  const signOut = useCallback(async () => {
    try {
      await AsyncStorage.removeItem(SESSION_KEY);
      setUser(null);
      setStatus('signedOut');
    } catch (err) {
      console.error('Sign out error:', err);
    }
  }, []);

  return (
    <AuthContext.Provider value={{ status, user, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  );
};