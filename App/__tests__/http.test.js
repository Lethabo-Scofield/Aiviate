jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async () => null), setItem: jest.fn(), multiRemove: jest.fn(),
}));

const { request, ApiError, setUnauthorizedHandler } = require('../src/services/http');
const session = require('../src/services/session');

function mockFetchOnce({ status = 200, json = {}, contentType = 'application/json' } = {}) {
  global.fetch = jest.fn(async () => ({
    status,
    ok: status >= 200 && status < 300,
    headers: { get: (h) => (h.toLowerCase() === 'content-type' ? contentType : null) },
    json: async () => json,
  }));
}

describe('services/http', () => {
  afterEach(() => { jest.restoreAllMocks(); session._resetTokenCache(); setUnauthorizedHandler(null); });

  test('GET returns parsed JSON and hits the configured base URL', async () => {
    mockFetchOnce({ json: { ok: true, value: 42 } });
    const data = await request('/my-jobs', { auth: false });
    expect(data).toEqual({ ok: true, value: 42 });
    const url = global.fetch.mock.calls[0][0];
    expect(url).toMatch(/\/api\/my-jobs$/);
  });

  test('attaches a Bearer token when a session exists', async () => {
    jest.spyOn(session, 'getToken').mockResolvedValue('tok-123');
    mockFetchOnce({ json: {} });
    await request('/auth/me');
    const opts = global.fetch.mock.calls[0][1];
    expect(opts.headers.Authorization).toBe('Bearer tok-123');
  });

  test('serialises a JSON body and sets Content-Type', async () => {
    mockFetchOnce({ json: {} });
    await request('/x', { method: 'POST', body: { a: 1 }, auth: false });
    const opts = global.fetch.mock.calls[0][1];
    expect(opts.headers['Content-Type']).toBe('application/json');
    expect(opts.body).toBe(JSON.stringify({ a: 1 }));
  });

  test('non-2xx surfaces the server error message as ApiError', async () => {
    mockFetchOnce({ status: 400, json: { error: 'Bad thing' } });
    await expect(request('/x', { auth: false })).rejects.toMatchObject({
      name: 'ApiError', status: 400, message: 'Bad thing',
    });
  });

  test('401 invokes the unauthorized handler and throws UNAUTHORIZED', async () => {
    const onUnauth = jest.fn();
    setUnauthorizedHandler(onUnauth);
    mockFetchOnce({ status: 401, json: { error: 'nope' } });
    await expect(request('/x', { auth: false })).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
    expect(onUnauth).toHaveBeenCalledTimes(1);
  });

  test('a fetch rejection becomes a retryable network ApiError', async () => {
    global.fetch = jest.fn(async () => { throw new TypeError('Failed to fetch'); });
    const err = await request('/x', { auth: false }).catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err.isNetwork).toBe(true);
  });
});
