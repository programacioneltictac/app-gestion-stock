import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const store = {};
vi.stubGlobal('localStorage', {
  getItem: (k) => store[k] ?? null,
  setItem: (k, v) => { store[k] = v; },
  removeItem: (k) => { delete store[k]; },
});

const { default: apiClient } = await import('./apiClient');

const reply = (status, body) => ({
  status,
  ok: status >= 200 && status < 300,
  text: async () => body,
});

describe('apiClient.request', () => {
  let fetchMock;
  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    store.token = 'T';
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.stubGlobal('localStorage', {
      getItem: (k) => store[k] ?? null,
      setItem: (k, v) => { store[k] = v; },
      removeItem: (k) => { delete store[k]; },
    });
  });

  it('devuelve el JSON y manda el token', async () => {
    fetchMock.mockResolvedValue(reply(200, '{"status":"success","n":1}'));
    expect(await apiClient.get('/x')).toEqual({ status: 'success', n: 1 });
    const [, config] = fetchMock.mock.calls[0];
    expect(config.headers.Authorization).toBe('Bearer T');
  });

  it('tolera 204 sin cuerpo', async () => {
    fetchMock.mockResolvedValue(reply(204, ''));
    expect(await apiClient.delete('/x')).toBeNull();
  });

  it('error con cuerpo no-JSON usa errorMessage, no un SyntaxError', async () => {
    fetchMock.mockResolvedValue(reply(413, '<html>Payload Too Large</html>'));
    await expect(apiClient.post('/x', {}, { errorMessage: 'Error importando el archivo' }))
      .rejects.toThrow('Error importando el archivo');
    const [, config] = fetchMock.mock.calls[0];
    expect(config).not.toHaveProperty('errorMessage');
  });

  it('adjunta code y details del backend', async () => {
    fetchMock.mockResolvedValue(reply(409, '{"message":"Sync en curso","code":"SYNC_BUSY","details":{"a":1}}'));
    const err = await apiClient.post('/x', {}).catch((e) => e);
    expect(err.message).toBe('Sync en curso');
    expect(err.code).toBe('SYNC_BUSY');
    expect(err.details).toEqual({ a: 1 });
  });

  it('postRaw manda el cuerpo sin serializar y con su Content-Type', async () => {
    fetchMock.mockResolvedValue(reply(200, '{"ok":true}'));
    const buf = new ArrayBuffer(4);
    await apiClient.postRaw('/import', buf, 'text/csv');
    const [, config] = fetchMock.mock.calls[0];
    expect(config.body).toBe(buf);
    expect(config.method).toBe('POST');
    expect(config.headers['Content-Type']).toBe('text/csv');
    expect(config.headers.Authorization).toBe('Bearer T');
  });
});
