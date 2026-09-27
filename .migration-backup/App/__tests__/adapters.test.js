const { adaptJob, adaptStop } = require('../src/services/adapters');

describe('services/adapters - backend Job/Stop -> app route/stop', () => {
  const baseJob = (overrides = {}) => ({
    id: 'JOB-1',
    area: 'Sandton',
    status: 'assigned',
    driver_id: 'DRV-1',
    total_distance_km: 12.3,
    estimated_time_min: 45,
    assigned_at: '2026-08-06T08:30:00Z',
    stops: [
      { id: 'S2', order_id: 'ORD-2', customer_name: 'B', address: 'Addr 2', lat: -26.1, lng: 28.0, demand: 2, stop_number: 2, completed: false },
      { id: 'S1', order_id: 'ORD-1', customer_name: 'A', address: 'Addr 1', lat: -26.2, lng: 28.1, demand: 1, stop_number: 1, completed: false },
    ],
    ...overrides,
  });

  test('sorts stops by stop_number and maps core fields', () => {
    const r = adaptJob(baseJob());
    expect(r.stops.map((s) => s.id)).toEqual(['S1', 'S2']);
    expect(r.stops[0]).toMatchObject({ customer: 'A', address: 'Addr 1', type: 'dropoff' });
  });

  test('order_id becomes the scannable proof barcode', () => {
    const r = adaptJob(baseJob());
    expect(r.stops[0].barcode).toBe('ORD-1');
    expect(r.stops[1].barcode).toBe('ORD-2');
  });

  test('cargo pluralises from demand', () => {
    expect(adaptStop({ id: 'x', demand: 1 }).cargo).toBe('1 package');
    expect(adaptStop({ id: 'x', demand: 3 }).cargo).toBe('3 packages');
  });

  test('status is assigned when no stops are completed', () => {
    expect(adaptJob(baseJob()).status).toBe('assigned');
    expect(adaptJob(baseJob()).current_stop_index).toBe(0);
  });

  test('status derives in_progress once at least one stop is done', () => {
    const job = baseJob();
    job.stops[1].completed = true; // S1 (stop_number 1)
    const r = adaptJob(job);
    expect(r.status).toBe('in_progress');
    expect(r.current_stop_index).toBe(1); // first pending is S2
  });

  test('status is completed when every stop is done', () => {
    const job = baseJob();
    job.stops.forEach((s) => { s.completed = true; });
    const r = adaptJob(job);
    expect(r.status).toBe('completed');
    expect(r.current_stop_index).toBe(2); // == stops.length
  });

  test('server-marked completed status is honoured even with no stops', () => {
    expect(adaptJob(baseJob({ status: 'completed', stops: [] })).status).toBe('completed');
  });

  test('assigned_by falls back to Dispatch when area is missing', () => {
    expect(adaptJob(baseJob({ area: null })).assigned_by).toBe('Dispatch');
    expect(adaptJob(baseJob()).assigned_by).toBe('Dispatch · Sandton');
  });
});
