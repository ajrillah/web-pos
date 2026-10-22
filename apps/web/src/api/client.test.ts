import { afterEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { ApiRequestError, apiRequest, errorMessage } from './client';

afterEach(() => {
  vi.unstubAllGlobals();
});

function stubFetch(response: Response | Error) {
  const fn = vi.fn(async () => {
    if (response instanceof Error) throw response;
    return response;
  });
  vi.stubGlobal('fetch', fn);
  return fn;
}

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

describe('apiRequest', () => {
  it('sends JSON to /api and parses the response', async () => {
    const fetchMock = stubFetch(json(200, { ok: true }));
    const result = await apiRequest('POST', '/auth/login', z.object({ ok: z.boolean() }), {
      username: 'pemilik',
    });
    expect(result).toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledWith('/api/auth/login', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'content-type': 'application/json' },
      body: '{"username":"pemilik"}',
    });
  });

  it('returns undefined for no-content responses when no schema is given', async () => {
    stubFetch(new Response(null, { status: 204 }));
    await expect(apiRequest('POST', '/auth/logout', null)).resolves.toBeUndefined();
  });

  it('throws the server error code and Indonesian message', async () => {
    stubFetch(
      json(401, {
        error: { code: 'INVALID_CREDENTIALS', message: 'Nama pengguna atau PIN salah.' },
      }),
    );
    const error = await apiRequest('GET', '/auth/me', null).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiRequestError);
    expect(error).toMatchObject({ status: 401, code: 'INVALID_CREDENTIALS' });
    expect(errorMessage(error)).toBe('Nama pengguna atau PIN salah.');
  });

  it('maps network failures to NETWORK_ERROR', async () => {
    stubFetch(new TypeError('Failed to fetch'));
    await expect(apiRequest('GET', '/health', null)).rejects.toMatchObject({
      code: 'NETWORK_ERROR',
    });
  });

  it('maps non-standard error bodies to UNEXPECTED_RESPONSE', async () => {
    stubFetch(new Response('Bad Gateway', { status: 502 }));
    await expect(apiRequest('GET', '/health', null)).rejects.toMatchObject({
      status: 502,
      code: 'UNEXPECTED_RESPONSE',
    });
  });
});
