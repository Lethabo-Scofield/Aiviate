import React, { createContext, useCallback, useContext, useState } from 'react';
import { driver as seedDriver } from '../data';

const DriverContext = createContext({ driver: null, updateDriver: () => {} });

export const useDriver = () => useContext(DriverContext);

export const DriverProvider = ({ children }) => {
  const [driver, setDriver] = useState(seedDriver);

  // Merge-style update — accepts a partial driver patch. Recomputes the
  // initials whenever the name changes so the avatar fallback stays in sync.
  const updateDriver = useCallback((patch) => {
    setDriver((prev) => {
      const next = { ...prev, ...patch };
      if (patch.name) {
        next.initials = patch.name
          .trim()
          .split(/\s+/)
          .slice(0, 2)
          .map((p) => p[0]?.toUpperCase() || '')
          .join('');
      }
      return next;
    });
  }, []);

  return (
    <DriverContext.Provider value={{ driver, updateDriver }}>
      {children}
    </DriverContext.Provider>
  );
};
