import { fetchOptimizedRoute } from '../src/services/routing';

describe('services/routing - fetchOptimizedRoute', () => {
  const stops = [
    { lat: -26.107, lng: 28.0567 },
    { lat: -26.1465, lng: 28.0436 },
    { lat: -26.1303, lng: 28.0345 },
  ];

  afterEach(() => {
    jest.restoreAllMocks();
    delete global.fetch;
  });

  test('returns null when fewer than 2 stops are passed', async () => {
    expect(await fetchOptimizedRoute([])).toBeNull();
    expect(await fetchOptimizedRoute([{ lat: 0, lng: 0 }])).toBeNull();
    expect(await fetchOptimizedRoute(null)).toBeNull();
  });

  test('builds an OSRM URL using lng,lat pairs joined by semicolons', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        routes: [{ geometry: { coordinates: [[28.0, -26.0], [28.1, -26.1]] } }],
      }),
    });

    await fetchOptimizedRoute(stops);
    const calledUrl = global.fetch.mock.calls[0][0];
    expect(calledUrl).toMatch(/router\.project-osrm\.org/);
    expect(calledUrl).toContain('28.0567,-26.107;28.0436,-26.1465;28.0345,-26.1303');
    expect(calledUrl).toContain('overview=full');
    expect(calledUrl).toContain('geometries=geojson');
  });

  test('parses the GeoJSON response into {latitude, longitude} pairs', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        routes: [{
          geometry: {
            coordinates: [
              [28.0567, -26.107],
              [28.0500, -26.120],
              [28.0436, -26.1465],
            ],
          },
        }],
      }),
    });

    const result = await fetchOptimizedRoute(stops);
    expect(result).toHaveLength(3);
    expect(result[0]).toEqual({ latitude: -26.107, longitude: 28.0567 });
    expect(result[2]).toEqual({ latitude: -26.1465, longitude: 28.0436 });
  });

  test('returns null when OSRM responds non-OK', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 503 });
    expect(await fetchOptimizedRoute(stops)).toBeNull();
  });

  test('returns null when the response has no route geometry', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ routes: [] }),
    });
    expect(await fetchOptimizedRoute(stops)).toBeNull();
  });

  test('returns null (does not throw) when fetch rejects', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('network down'));
    expect(await fetchOptimizedRoute(stops)).toBeNull();
  });
});
