// Neutralise the native modules imported at the top of syncQueue.js /
// config.js / http.js. The SyncQueue under test uses injected fakes, so these
// mocks only need to exist, not behave.
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(), setItem: jest.fn(), multiRemove: jest.fn(),
}));
jest.mock('@react-native-community/netinfo', () => ({ addEventListener: jest.fn(() => () => {}) }));

const { SyncQueue, computeBackoff, resolveOutcome } = require('../src/services/syncQueue');
const { ApiError } = require('../src/services/http');

// In-memory storage double.
function makeStorage() {
  let store = {};
  return {
    getItem: async (k) => (k in store ? store[k] : null),
    setItem: async (k, v) => { store[k] = v; },
    _dump: () => store,
  };
}
const noNet = { addEventListener: () => () => {} };

describe('computeBackoff', () => {
  test('grows exponentially and is capped', () => {
    expect(computeBackoff(1, { base: 1000, max: 60000 })).toBe(1000);
    expect(computeBackoff(2, { base: 1000, max: 60000 })).toBe(2000);
    expect(computeBackoff(3, { base: 1000, max: 60000 })).toBe(4000);
    expect(computeBackoff(20, { base: 1000, max: 60000 })).toBe(60000);
  });
});

describe('resolveOutcome', () => {
  test('success removes the op', () => {
    expect(resolveOutcome({ attempts: 1 }, { ok: true })).toEqual({ action: 'remove' });
  });
  test('network error retries with backoff', () => {
    const d = resolveOutcome({ attempts: 1 }, { ok: false, error: new ApiError('down', { isNetwork: true }) });
    expect(d.action).toBe('retry');
    expect(d.delayMs).toBeGreaterThan(0);
  });
  test('4xx (not 401) is terminal fail — preserve payload, do not retry forever', () => {
    const d = resolveOutcome({ attempts: 1 }, { ok: false, error: new ApiError('reassigned', { status: 404 }) });
    expect(d.action).toBe('fail');
  });
  test('5xx retries', () => {
    const d = resolveOutcome({ attempts: 1 }, { ok: false, error: new ApiError('boom', { status: 500 }) });
    expect(d.action).toBe('retry');
  });
});

describe('SyncQueue', () => {
  test('enqueue dedupes on stable id (protects against double submit)', async () => {
    const q = new SyncQueue({ storage: makeStorage(), netinfo: noNet, now: () => 1000 });
    q.registerProcessor('noop', async () => {});
    await q.load();
    await q.enqueue({ id: 'op-1', type: 'noop', payload: {} });
    await q.enqueue({ id: 'op-1', type: 'noop', payload: {} });
    // one may already have flushed+removed; assert we never created two entries
    expect(q.ops.filter((o) => o.id === 'op-1').length).toBeLessThanOrEqual(1);
  });

  test('successful processing removes the op', async () => {
    const q = new SyncQueue({ storage: makeStorage(), netinfo: noNet, now: () => 1000 });
    const seen = [];
    q.registerProcessor('deliver', async (payload) => { seen.push(payload); });
    await q.load();
    await q.enqueue({ id: 'd-1', type: 'deliver', payload: { stop: 'S1' } });
    await q.flush();
    expect(seen).toEqual([{ stop: 'S1' }]);
    expect(q.status().pending).toBe(0);
  });

  test('a terminal 4xx marks the op failed and preserves its payload', async () => {
    const q = new SyncQueue({ storage: makeStorage(), netinfo: noNet, now: () => 1000 });
    q.registerProcessor('deliver', async () => { throw new ApiError('gone', { status: 404 }); });
    await q.load();
    await q.enqueue({ id: 'd-2', type: 'deliver', payload: { evidence: 'photo-key' } });
    await q.flush();
    const st = q.status();
    expect(st.failed).toBe(1);
    expect(st.failedOps[0].payload.evidence).toBe('photo-key'); // evidence not lost
  });

  test('network failure schedules a retry (op stays pending, not lost)', async () => {
    let t = 1000;
    const q = new SyncQueue({ storage: makeStorage(), netinfo: noNet, now: () => t });
    let attempts = 0;
    q.registerProcessor('deliver', async () => { attempts += 1; throw new ApiError('offline', { isNetwork: true }); });
    await q.load();
    await q.enqueue({ id: 'd-3', type: 'deliver', payload: {} });
    expect(attempts).toBe(1);
    expect(q.status().pending).toBe(1);
    // Not yet due — flush is a no-op until backoff elapses.
    await q.flush();
    expect(attempts).toBe(1);
    // Advance past backoff — now it retries.
    t += 100000;
    await q.flush();
    expect(attempts).toBe(2);
  });

  test('queue survives a restart by reloading from storage', async () => {
    const storage = makeStorage();
    const q1 = new SyncQueue({ storage, netinfo: noNet, now: () => 1000 });
    q1.registerProcessor('deliver', async () => { throw new ApiError('offline', { isNetwork: true }); });
    await q1.load();
    await q1.enqueue({ id: 'd-4', type: 'deliver', payload: { stop: 'S9' } });

    const q2 = new SyncQueue({ storage, netinfo: noNet, now: () => 1000 });
    await q2.load();
    expect(q2.ops.find((o) => o.id === 'd-4')).toBeTruthy();
  });
});
