// Build a valid proof-of-delivery payload for whatever stop the route is
// currently on. Tests that explicitly want to assert the gate fail can
// override individual fields.
const proofForCurrentStop = (route, overrides = {}) => {
  const stop = route.stops[route.current_stop_index];
  return {
    scannedBarcode: stop.barcode,
    driverLocation: { lat: stop.lat, lng: stop.lng },
    ...overrides,
  };
};

describe('services/api - route lifecycle', () => {
  let api;

  beforeEach(() => {
    jest.resetModules();
    api = require('../src/services/api');
  });

  test('getRoutes returns the seeded routes from src/data', async () => {
    const { data } = await api.getRoutes();
    expect(Array.isArray(data)).toBe(true);
    expect(data.length).toBeGreaterThan(0);
    expect(data[0]).toHaveProperty('id');
    expect(data[0]).toHaveProperty('stops');
    expect(data[0]).toHaveProperty('current_stop_index', 0);
  });

  test('every seeded stop carries a barcode and starts uncompleted', async () => {
    const { data } = await api.getRoutes();
    data.forEach((route) => {
      route.stops.forEach((stop) => {
        expect(stop.completed).toBe(false);
        expect(typeof stop.barcode).toBe('string');
        expect(stop.barcode.length).toBeGreaterThan(0);
      });
    });
  });

  test('acceptRoute changes status from available to assigned', async () => {
    const { data: before } = await api.getRoutes();
    const target = before.find((r) => r.status === 'available');
    expect(target).toBeDefined();

    const { data: updated } = await api.acceptRoute(target.id);
    expect(updated.status).toBe('assigned');

    const { data: after } = await api.getRoutes();
    expect(after.find((r) => r.id === target.id).status).toBe('assigned');
  });

  test('startRoute moves an assigned route to in_progress', async () => {
    const { data: routes } = await api.getRoutes();
    const target = routes.find((r) => r.status === 'assigned');
    expect(target).toBeDefined();

    const { data: started } = await api.startRoute(target.id);
    expect(started.status).toBe('in_progress');
  });

  test('completeStop marks the current stop done and increments index when proof is valid', async () => {
    const { data: routes } = await api.getRoutes();
    const target = routes.find((r) => r.status === 'assigned');
    const proof = proofForCurrentStop(target);

    const { data: afterFirst } = await api.completeStop(target.id, proof);
    expect(afterFirst.stops[0].completed).toBe(true);
    expect(afterFirst.current_stop_index).toBe(1);
    expect(afterFirst.status).toBe('in_progress');
    expect(afterFirst.stops.slice(1).every((s) => !s.completed)).toBe(true);
  });

  test('completing every stop transitions the route to completed', async () => {
    const { data: routes } = await api.getRoutes();
    const target = routes.find((r) => r.status === 'assigned');
    let last = target;
    for (let i = 0; i < target.stops.length; i++) {
      last = (await api.completeStop(target.id, proofForCurrentStop(last))).data;
    }
    expect(last.status).toBe('completed');
    expect(last.current_stop_index).toBe(target.stops.length);
    expect(last.stops.every((s) => s.completed)).toBe(true);
  });

  test('completeStop without proof rejects with NO_PROOF and does not mutate state', async () => {
    const { data: before } = await api.getRoutes();
    const target = before.find((r) => r.status === 'assigned');

    await expect(api.completeStop(target.id)).rejects.toMatchObject({ code: 'NO_PROOF' });

    const { data: after } = await api.getRoutes();
    const sameRoute = after.find((r) => r.id === target.id);
    expect(sameRoute.current_stop_index).toBe(target.current_stop_index);
    expect(sameRoute.stops[0].completed).toBe(false);
  });

  test('completeStop with a wrong barcode rejects with BARCODE_MISMATCH', async () => {
    const { data: routes } = await api.getRoutes();
    const target = routes.find((r) => r.status === 'assigned');
    const proof = proofForCurrentStop(target, { scannedBarcode: 'WRONG-CODE' });

    await expect(api.completeStop(target.id, proof)).rejects.toMatchObject({
      code: 'BARCODE_MISMATCH',
    });

    const { data: after } = await api.getRoutes();
    expect(after.find((r) => r.id === target.id).stops[0].completed).toBe(false);
  });

  test('completeStop from out of range rejects with OUT_OF_RANGE', async () => {
    const { data: routes } = await api.getRoutes();
    const target = routes.find((r) => r.status === 'assigned');
    // ~1 km offset from any stop is well beyond the 30 m gate.
    const stop = target.stops[target.current_stop_index];
    const proof = proofForCurrentStop(target, {
      driverLocation: { lat: stop.lat + 0.01, lng: stop.lng + 0.01 },
    });

    await expect(api.completeStop(target.id, proof)).rejects.toMatchObject({
      code: 'OUT_OF_RANGE',
    });

    const { data: after } = await api.getRoutes();
    expect(after.find((r) => r.id === target.id).stops[0].completed).toBe(false);
  });

  test('completeStop without a scanned barcode rejects with NO_BARCODE', async () => {
    const { data: routes } = await api.getRoutes();
    const target = routes.find((r) => r.status === 'assigned');
    const proof = proofForCurrentStop(target, { scannedBarcode: '' });

    await expect(api.completeStop(target.id, proof)).rejects.toMatchObject({
      code: 'NO_BARCODE',
    });
  });

  test('completeStop without driver location rejects with NO_LOCATION', async () => {
    const { data: routes } = await api.getRoutes();
    const target = routes.find((r) => r.status === 'assigned');
    const proof = proofForCurrentStop(target, { driverLocation: null });

    await expect(api.completeStop(target.id, proof)).rejects.toMatchObject({
      code: 'NO_LOCATION',
    });
  });

  test('isActive predicate identifies assigned and in_progress only', () => {
    expect(api.isActive({ status: 'assigned' })).toBe(true);
    expect(api.isActive({ status: 'in_progress' })).toBe(true);
    expect(api.isActive({ status: 'available' })).toBe(false);
    expect(api.isActive({ status: 'completed' })).toBe(false);
  });

  test('completeStop on an unknown route id is a no-op (no throw, no proof needed)', async () => {
    await expect(api.completeStop('does-not-exist')).resolves.toEqual({ data: undefined });
    const { data } = await api.getRoutes();
    expect(data.every((r) => r.current_stop_index === 0)).toBe(true);
  });
});

describe('services/api - history aggregation', () => {
  let api;
  beforeEach(() => {
    jest.resetModules();
    api = require('../src/services/api');
  });

  test('getHistory returns aggregated today + week stats and the raw history list', async () => {
    const { data } = await api.getHistory();
    expect(data).toEqual(
      expect.objectContaining({
        todayRoutes: expect.any(Number),
        todayStops: expect.any(Number),
        todayKm: expect.any(Number),
        todayMin: expect.any(Number),
        weekRoutes: expect.any(Number),
        weekStops: expect.any(Number),
        weekKm: expect.any(Number),
        history: expect.any(Array),
      })
    );
    expect(data.history.length).toBe(data.weekRoutes);
    expect(data.todayRoutes).toBeLessThanOrEqual(data.weekRoutes);
  });

  test('today stats only count history items dated "Today"', async () => {
    const { data } = await api.getHistory();
    const todayItems = data.history.filter((h) => h.date.startsWith('Today'));
    const expectedKm = todayItems.reduce((s, h) => s + h.distance_km, 0);
    expect(data.todayRoutes).toBe(todayItems.length);
    expect(data.todayKm).toBeCloseTo(expectedKm, 5);
  });
});
