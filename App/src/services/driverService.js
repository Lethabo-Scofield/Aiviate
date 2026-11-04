// services/driverService.js
import { sql } from './neon';

export async function fetchDriverProfile(email) {
  try {
    const rows = await sql`
      SELECT id, name, email, phone_number, car_model, number_plate 
      FROM drivers 
      WHERE email = ${email}
      LIMIT 1;
    `;
    return rows.length > 0 ? rows[0] : null;
  } catch (error) {
    console.error('Failed to fetch driver profile from Neon:', error);
    throw error;
  }
}

export async function updateDriverProfile(id, { name, phone_number, car_model, number_plate }) {
  const rows = await sql`
    UPDATE drivers
    setItem 
      name = ${name},
      phone_number = ${phone_number},
      car_model = ${car_model},
      number_plate = ${number_plate}
    WHERE id = ${id}
    RETURNING *;
  `;
  return rows[0];
}