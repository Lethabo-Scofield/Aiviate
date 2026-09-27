// Barrel export for all mock seed data.
//
// All seed data lives in plain JSON files in this folder so they can be edited
// without touching JS, and so they map 1:1 to whatever a real API will return.
// When you wire up a real backend, update src/services/api.js to fetch from
// the server instead of importing from these JSON files — nothing else in the
// app should need to change.
//
// JSON contracts (one record shape per file):
//   driver.json        -> { id, name, initials, avatar_url, employee_id, phone,
//                           email, vehicle, vehicle_plate, joined, rating,
//                           completed_routes, total_stops, total_km }
//   notifications.json -> [{ id, type, title, body, time, unread }]
//   routes.json        -> [{ id, status, assigned_by, created_at,
//                           total_distance_km, total_duration_min,
//                           stops: [{ id, type, address, lat, lng, customer,
//                                     cargo, notes, barcode }] }]
//   history.json       -> [{ id, date, stops, distance_km, duration_min }]

import driver from './driver.json';
import notifications from './notifications.json';
import routes from './routes.json';
import history from './history.json';

export { driver, notifications, routes, history };
