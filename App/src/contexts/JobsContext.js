import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { getRoutes, acceptRoute, completeStop, startRoute, isActive } from '../services/api';

const JobsContext = createContext();

export const useJobs = () => {
  const ctx = useContext(JobsContext);
  if (!ctx) throw new Error('useJobs must be used within JobsProvider');
  return ctx;
};

export const JobsProvider = ({ children }) => {
  const [routes, setRoutes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeRouteId, setActiveRouteId] = useState(null);

  const reload = useCallback(async () => {
    const res = await getRoutes();
    setRoutes(res.data);
    setActiveRouteId((curr) => curr || res.data.find((r) => r.status === 'in_progress')?.id || null);
    setLoading(false);
  }, []);

  useEffect(() => { reload(); }, [reload]);

  const accept = useCallback(async (routeId) => {
    await acceptRoute(routeId);
    setActiveRouteId(routeId);
    await reload();
  }, [reload]);

  const start = useCallback(async (routeId) => {
    await startRoute(routeId);
    setActiveRouteId(routeId);
    await reload();
  }, [reload]);

  const advance = useCallback(async (routeId, proof) => {
    const res = await completeStop(routeId, proof);
    if (res.data?.status === 'completed') setActiveRouteId(null);
    await reload();
    return res;
  }, [reload]);

  const newRoutes = routes.filter((r) => r.status === 'available');
  const assignedRoutes = routes.filter(isActive);
  const activeRoute =
    routes.find((r) => r.id === activeRouteId) ||
    routes.find(isActive) ||
    null;

  return (
    <JobsContext.Provider
      value={{
        routes,
        newRoutes,
        assignedRoutes,
        activeRoute,
        loading,
        accept,
        start,
        advance,
        setActiveRouteId,
        reload,
      }}
    >
      {children}
    </JobsContext.Provider>
  );
};
