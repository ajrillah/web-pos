import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { apiErrorSchema, healthResponseSchema } from '@toko-podomoro/shared';
import type { FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { buildApp } from './app';
import { type DatabaseHandle, openDatabase } from './db/client';
import { AppError } from './errors';

let handle: DatabaseHandle;
let app: FastifyInstance;
let webDir: string;

beforeEach(() => {
  handle = openDatabase(':memory:');
  webDir = fs.mkdtempSync(path.join(os.tmpdir(), 'toko-web-'));
  fs.writeFileSync(path.join(webDir, 'index.html'), '<!doctype html><title>TOKO PODOMORO</title>');
  fs.writeFileSync(path.join(webDir, 'app.js'), 'console.log(1);');
});

afterEach(async () => {
  await app.close();
  handle.sqlite.close();
  fs.rmSync(webDir, { recursive: true, force: true });
});

async function build(withWeb = true): Promise<FastifyInstance> {
  app = await buildApp({ db: handle.db, webDir: withWeb ? webDir : undefined });
  return app;
}

describe('api', () => {
  it('answers health checks', async () => {
    await build();
    const res = await app.inject({ method: 'GET', url: '/api/health' });
    expect(res.statusCode).toBe(200);
    expect(healthResponseSchema.parse(res.json()).status).toBe('ok');
  });

  it('returns a JSON 404 for unknown api routes', async () => {
    await build();
    const res = await app.inject({ method: 'GET', url: '/api/nope' });
    expect(res.statusCode).toBe(404);
    expect(apiErrorSchema.parse(res.json()).error.code).toBe('NOT_FOUND');
  });

  it('maps AppError to the error format', async () => {
    await build();
    app.get('/api/test-app-error', async () => {
      throw new AppError(409, 'DUPLICATE_ID', 'Data sudah ada.');
    });
    const res = await app.inject({ method: 'GET', url: '/api/test-app-error' });
    expect(res.statusCode).toBe(409);
    expect(res.json()).toEqual({ error: { code: 'DUPLICATE_ID', message: 'Data sudah ada.' } });
  });

  it('maps Zod errors to VALIDATION_ERROR with the field name', async () => {
    await build();
    app.post('/api/test-zod', async (request) =>
      z.object({ name: z.string() }).parse(request.body),
    );
    const res = await app.inject({ method: 'POST', url: '/api/test-zod', payload: { name: 1 } });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toEqual({
      error: { code: 'VALIDATION_ERROR', message: 'Data tidak valid pada kolom "name".' },
    });
  });

  it('maps malformed JSON to BAD_REQUEST', async () => {
    await build();
    app.post('/api/test-json', async () => ({ ok: true }));
    const res = await app.inject({
      method: 'POST',
      url: '/api/test-json',
      headers: { 'content-type': 'application/json' },
      payload: '{ bad',
    });
    expect(res.statusCode).toBe(400);
    expect(apiErrorSchema.parse(res.json()).error.code).toBe('BAD_REQUEST');
  });

  it('hides unexpected errors behind INTERNAL_ERROR', async () => {
    await build();
    app.get('/api/test-crash', async () => {
      throw new Error('SQLITE_CONSTRAINT: secret detail');
    });
    const res = await app.inject({ method: 'GET', url: '/api/test-crash' });
    expect(res.statusCode).toBe(500);
    expect(res.json()).toEqual({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Terjadi kesalahan pada server. Silakan coba lagi.',
      },
    });
  });

  it('rejects requests with a foreign Host header', async () => {
    await build();
    const res = await app.inject({
      method: 'GET',
      url: '/api/health',
      headers: { host: 'evil.example:4747' },
    });
    expect(res.statusCode).toBe(403);
    expect(apiErrorSchema.parse(res.json()).error.code).toBe('FORBIDDEN_HOST');
  });

  it('accepts localhost on any port', async () => {
    await build();
    const res = await app.inject({
      method: 'GET',
      url: '/api/health',
      headers: { host: 'localhost:5173' },
    });
    expect(res.statusCode).toBe(200);
  });
});

describe('web', () => {
  it('serves static assets', async () => {
    await build();
    const res = await app.inject({ method: 'GET', url: '/app.js' });
    expect(res.statusCode).toBe(200);
    expect(res.body).toBe('console.log(1);');
  });

  it('falls back to index.html for client routes', async () => {
    await build();
    const res = await app.inject({ method: 'GET', url: '/kasir' });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('text/html');
    expect(res.body).toContain('TOKO PODOMORO');
  });

  it('returns JSON 404 for client routes when no web build exists', async () => {
    await build(false);
    const res = await app.inject({ method: 'GET', url: '/kasir' });
    expect(res.statusCode).toBe(404);
    expect(apiErrorSchema.parse(res.json()).error.code).toBe('NOT_FOUND');
  });
});
