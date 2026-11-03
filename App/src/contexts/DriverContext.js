// contexts/DriverContext.js
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useAuth } from './AuthContext';
import { sql } from '../services/neon'; // Neon database client

const DriverContext = createContext({ 
  driver: null, 
  updateDriver: async () => {},
  loading: false,
});

export const useDriver = () => useContext(DriverContext);

const computeInitials = (name) =>
  (name || '')
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() || '')
    .join('');

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
  const [dbData, setDbData] = useState({});
  const [loading, setLoading] = useState(false);

  // 1. Fetch live profile data from Neon database whenever auth user changes
  useEffect(() => {
    let isMounted = true;

    async function loadProfile() {
      if (!user) {
        if (isMounted) setDbData({});
        return;
      }

      const driverId = user.driver_id || user.id;
      const userId = user.id;

      try {
        setLoading(true);

        // Fetch driver record matching id or user_id
        const rows = await sql`
          SELECT * FROM drivers 
          WHERE id = ${driverId} OR user_id = ${userId}
          LIMIT 1;
        `;

        if (isMounted && rows && rows.length > 0) {
          const record = rows[0];
          setDbData({
            id: record.id,
            name: record.name || '',
            email: record.email || '',
            phone: record.phone_number || '',
            phone_number: record.phone_number || '',
            vehicle: record.car_model || record.vehicle_type || '',
            car_model: record.car_model || '',
            vehicle_plate: record.number_plate || '',
            number_plate: record.number_plate || '',
            joined: record.created_at ? new Date(record.created_at).toLocaleDateString() : '',
            initials: computeInitials(record.name),
          });
        }
      } catch (err) {
        console.error('Error fetching driver profile from Neon:', err);
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    loadProfile();

    return () => {
      isMounted = false;
    };
  }, [user]);

  // 2. Computed driver object combining auth user identity, Neon DB data, and safe defaults
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

    const computed = { ...DEFAULT_DRIVER, ...identity, ...dbData };
    
    // Ensure initials are accurately computed from final name
    if (computed.name) {
      computed.initials = computeInitials(computed.name);
    }
    
    return computed;
  }, [user, dbData]);

  // 3. Update driver profile directly in Neon PostgreSQL database
  const updateDriver = useCallback(async (next) => {
    const targetId = driver.id || user?.driver_id || user?.id;

    if (!targetId) {
      throw new Error('No driver ID found to perform database update.');
    }

    // Extract updated fields or retain current values
    const newName = next.name !== undefined ? next.name : driver.name;
    const newPhone = next.phone !== undefined ? next.phone : (next.phone_number !== undefined ? next.phone_number : driver.phone);
    const newVehicle = next.vehicle !== undefined ? next.vehicle : (next.car_model !== undefined ? next.car_model : driver.vehicle);
    const newPlate = next.vehicle_plate !== undefined ? next.vehicle_plate : (next.number_plate !== undefined ? next.number_plate : driver.vehicle_plate);

    // Execute SQL UPDATE query on Neon
    const rows = await sql`
      UPDATE drivers
      SET 
        name = ${newName.trim()},
        phone_number = ${newPhone.trim()},
        car_model = ${newVehicle.trim()},
        number_plate = ${newPlate.trim()}
      WHERE id = ${targetId} OR user_id = ${targetId}
      RETURNING *;
    `;

    if (rows && rows.length > 0) {
      const updated = rows[0];
      setDbData({
        id: updated.id,
        name: updated.name || '',
        email: updated.email || '',
        phone: updated.phone_number || '',
        phone_number: updated.phone_number || '',
        vehicle: updated.car_model || updated.vehicle_type || '',
        car_model: updated.car_model || '',
        vehicle_plate: updated.number_plate || '',
        number_plate: updated.number_plate || '',
        joined: updated.created_at ? new Date(updated.created_at).toLocaleDateString() : '',
        initials: computeInitials(updated.name),
      });
      return updated;
    } else {
      throw new Error('Database update returned no modified records.');
    }
  }, [driver, user]);

  return (
    <DriverContext.Provider value={{ driver, updateDriver, loading }}>
      {children}
    </DriverContext.Provider>
  );
};