import net from 'node:net';
import type { FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';
import { buildApp } from './app';
import { type DatabaseHandle, openDatabase } from './db/client';
import { StartupError } from './errors';
import { HOST, listenLocal } from './server';

let handle: DatabaseHandle | undefined;
let app: FastifyInstance | undefined;
let blocker: net.Server | undefined;

afterEach(async () => {
  await app?.close();
  handle?.sqlite.close();
  await new Promise<void>((resolve) => (blocker ? blocker.close(() => resolve()) : resolve()));
  app = undefined;
  handle = undefined;
  blocker = undefined;
});

function occupyPort(): Promise<number> {
  const server = net.createServer();
  blocker = server;
  return new Promise((resolve) => {
    server.listen(0, HOST, () => resolve((server.address() as net.AddressInfo).port));
  });
}

describe('listenLocal', () => {
  it('binds to 127.0.0.1 only', async () => {
    handle = openDatabase(':memory:');
    app = await buildApp({ db: handle.db });
    await listenLocal(app, 0);
    const address = app.server.address() as net.AddressInfo;
    expect(address.address).toBe('127.0.0.1');
  });

  it('reports a busy port with an Indonesian StartupError', async () => {
    const port = await occupyPort();
    handle = openDatabase(':memory:');
    app = await buildApp({ db: handle.db });
    const attempt = listenLocal(app, port);
    await expect(attempt).rejects.toBeInstanceOf(StartupError);
    await expect(attempt).rejects.toThrow(`Port ${port} sudah dipakai aplikasi lain.`);
  });
});
