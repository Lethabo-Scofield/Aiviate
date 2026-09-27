// Pure mappers between the backend Job/Stop shape and the app route/stop shape.
//
// Kept free of React Native / Expo imports so the mapping is unit-testable in
// a plain Node environment and reusable anywhere.

const shortWhen = (iso) => {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    return d.toLocaleString([], { hour: '2-digit', minute: '2-digit', month: 'short', day: 'numeric' });
  } catch {
    return '';
  }
};

// Map a single backend Stop -> app stop shape. The package order id doubles as
// the scannable proof barcode (the app's proof gate matches scanned code to
// `stop.barcode`).
export function adaptStop(s) {
  const demand = Number(s.demand) || 1;
  return {
    id: s.id,
    type: 'dropoff', // backend does not distinguish pickup/dropoff today
    address: s.address || '',
    lat: s.lat,
    lng: s.lng,
    customer: s.customer_name || '',
    cargo: `${demand} package${demand === 1 ? '' : 's'}`,
    notes: s.notes || '',
    barcode: s.order_id || s.id, // proof token
    completed: !!s.completed,
    // Preserved for the job-details screen:
    order_id: s.order_id,
    phone: s.phone || '',
    demand,
    service_time: s.service_time,
    time_window_start: s.time_window_start || '',
    time_window_end: s.time_window_end || '',
    stop_number: s.stop_number,
    completed_at: s.completed_at || null,
  };
}

// Map a backend Job -> app route shape. Derives `in_progress` locally because
// the backend tracks only unassigned|assigned|completed; per-stop completion
// is authoritative and persisted server-side.
export function adaptJob(job) {
  const stops = [...(job.stops || [])]
    .sort((a, b) => (a.stop_number || 0) - (b.stop_number || 0))
    .map(adaptStop);

  const completedCount = stops.filter((s) => s.completed).length;
  const firstPending = stops.findIndex((s) => !s.completed);
  const currentIndex = firstPending === -1 ? stops.length : firstPending;

  let status = job.status || 'assigned';
  if (status === 'completed' || (stops.length > 0 && completedCount === stops.length)) {
    status = 'completed';
  } else if (completedCount > 0) {
    status = 'in_progress';
  } else {
    status = 'assigned';
  }

  return {
    id: job.id,
    status,
    assigned_by: job.area ? `Dispatch · ${job.area}` : 'Dispatch',
    created_at: shortWhen(job.assigned_at || job.created_at),
    total_distance_km: job.total_distance_km || 0,
    total_duration_min: job.estimated_time_min || 0,
    current_stop_index: currentIndex,
    stops,
    driver_id: job.driver_id,
    route_geometry: job.route_geometry || null,
    completed_at: job.completed_at || null,
  };
}

export default { adaptJob, adaptStop };
