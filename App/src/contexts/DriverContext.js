import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { useAuth } from './AuthContext';

const DriverContext = createContext({ driver: null, updateDriver: () => {} });

export const useDriver = () => useContext(DriverContext);

const computeInitials = (name) =>
  (name || '')
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() || '')
    .join('');

// Neutral defaults so the Profile/Header screens never read undefined fields.
// Fields the current backend endpoints don't expose (rating, lifetime stats,
// vehicle plate, joined date) default to safe placeholders rather than fake
// demo values, and can be populated later when those endpoints exist.
const DEFAULT_DRIVER = {
  id: null,
  name: '',
  initials: '',
  avatar_url: null,
  employee_id: '',
  phone: '',
  email: '',
  vehicle: '',
  vehicle_plate: '',
  joined: '',
  company_name: '',
  rating: 0,
  completed_routes: 0,
  total_stops: 0,
  total_km: 0,
};

export const DriverProvider = ({ children }) => {
  const { user } = useAuth();
  // Local, client-only edits (EditProfile) layered over the authenticated
  // identity. There is no backend self-profile endpoint yet, so edits persist
  // for the session only.
  const [patch, setPatch] = useState({});

  const driver = useMemo(() => {
    const identity = user
      ? {
          id: user.driver_id || user.id,
          employee_id: user.driver_id || '',
          name: user.name || '',
          email: user.email || '',
          company_name: user.company_name || '',
          initials: computeInitials(user.name),
        }
      : {};
    return { ...DEFAULT_DRIVER, ...identity, ...patch };
  }, [user, patch]);

  const updateDriver = useCallback((next) => {
    setPatch((prev) => {
      const merged = { ...prev, ...next };
      if (next.name) merged.initials = computeInitials(next.name);
      return merged;
    });
  }, []);

  return (
    <DriverContext.Provider value={{ driver, updateDriver }}>
      {children}
    </DriverContext.Provider>
  );
};
