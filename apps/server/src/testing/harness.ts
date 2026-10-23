import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { Product } from '@toko-podomoro/shared';
import type { FastifyInstance, LightMyRequestResponse } from 'fastify';
import { buildApp } from '../app';
import { SESSION_COOKIE } from '../auth/session';
import { DB_FILE } from '../config';
import { type DatabaseHandle, openDatabase } from '../db/client';
import { runMigrations } from '../db/migrate';
import { migrationsDir } from '../paths';
import { writeSetting } from '../repositories/settings-repository';
import { ApprovalStore } from '../security/approvals';
import type { ServiceContext } from '../services/context';

/** A test app on a migrated SQLite file in a temp dir, with a clock tests can move. */
export interface Harness {
  app: FastifyInstance;
  handle: DatabaseHandle;
  dbFile: string;
  clock: { now: Date; advance(ms: number): void };
  /** Paths the app asked the OS to open (receipts, receipt folder), instead of opening them. */
  opened: string[];
  /** Directory the receipt_folder setting points at. */
  receiptDir: string;
  /** Data directory (holds the DB file and config.json). */
  dataDir: string;
  /** File-replacing steps the app handed to its restart hook (restore), not yet run. */
  restarts: (() => void)[];
  /** Rebuilds the app on the same DB file, like a server restart; `between` runs while stopped. */
  restart(between?: () => void): Promise<void>;
  close(): Promise<void>;
}

export async function createHarness(): Promise<Harness> {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'toko-test-'));
  const dbFile = path.join(dir, DB_FILE);
  const clock = {
    now: new Date('2026-10-22T08:00:00.000Z'),
    advance(ms: number) {
      clock.now = new Date(clock.now.getTime() + ms);
    },
  };
  const opened: string[] = [];
  const receiptDir = path.join(dir, 'Nota');
  const restarts: (() => void)[] = [];
  const open = async () => {
    const handle = openDatabase(dbFile);
    runMigrations(handle.db, migrationsDir);
    writeSetting(handle.db, 'receipt_folder', receiptDir);
    const app = await buildApp({
      db: handle.db,
      now: () => clock.now,
      openPath: (target) => opened.push(target),
      system: {
        dataDir: dir,
        sqlite: handle.sqlite,
        migrationsDir,
        restart: (apply) => restarts.push(apply),
      },
    });
    return { app, handle };
  };
  const harness: Harness = {
    ...(await open()),
    dbFile,
    clock,
    opened,
    receiptDir,
    dataDir: dir,
    restarts,
    async restart(between) {
      await harness.app.close();
      harness.handle.sqlite.close();
      between?.();
      Object.assign(harness, await open());
    },
    async close() {
      await harness.app.close();
      harness.handle.sqlite.close();
      fs.rmSync(dir, { recursive: true, force: true });
    },
  };
  return harness;
}

export function sessionCookie(res: LightMyRequestResponse): string {
  const cookie = res.cookies.find((c) => c.name === SESSION_COOKIE);
  if (!cookie?.value) {
    throw new Error(`no session cookie in response (${res.statusCode} ${res.body})`);
  }
  return cookie.value;
}

export const withSession = (token: string) => ({ cookie: `${SESSION_COOKIE}=${token}` });

export const OWNER = { username: 'pemilik', name: 'Bu Sari', pin: '111111' };

/** Runs first-run setup and returns the owner's session token and recovery code. */
export async function setupOwner(h: Harness): Promise<{ token: string; recoveryCode: string }> {
  const res = await h.app.inject({ method: 'POST', url: '/api/setup', payload: OWNER });
  if (res.statusCode !== 201) {
    throw new Error(`setup failed: ${res.statusCode} ${res.body}`);
  }
  return { token: sessionCookie(res), recoveryCode: res.json().recoveryCode };
}

/** The id of the user with this username (login tiles identify users by id). */
export function userIdOf(h: Harness, username: string): string {
  const row = h.handle.sqlite.prepare('select id from users where username = ?').get(username) as
    | { id: string }
    | undefined;
  return row?.id ?? `unknown-${username}`;
}

export async function login(h: Harness, username: string, pin: string): Promise<string> {
  const res = await h.app.inject({
    method: 'POST',
    url: '/api/auth/login',
    payload: { userId: userIdOf(h, username), pin },
  });
  return sessionCookie(res);
}

/** Creates a user as the given owner and returns its id. */
export async function createUserAs(
  h: Harness,
  ownerToken: string,
  user: { username: string; name: string; role: 'owner' | 'cashier'; pin: string },
): Promise<string> {
  const res = await h.app.inject({
    method: 'POST',
    url: '/api/users',
    headers: withSession(ownerToken),
    payload: user,
  });
  if (res.statusCode !== 201) {
    throw new Error(`create user failed: ${res.statusCode} ${res.body}`);
  }
  return res.json().user.id;
}

export const CASHIER = {
  username: 'kasir1',
  name: 'Rina',
  role: 'cashier' as const,
  pin: '555555',
};

/** Creates a cashier, logs in, and completes the forced PIN change; returns a usable session. */
export async function activeCashier(
  h: Harness,
  ownerToken: string,
): Promise<{ id: string; token: string }> {
  const id = await createUserAs(h, ownerToken, CASHIER);
  const token = await login(h, CASHIER.username, CASHIER.pin);
  const res = await h.app.inject({
    method: 'PUT',
    url: '/api/auth/me/pin',
    headers: withSession(token),
    payload: { currentPin: CASHIER.pin, newPin: '565656' },
  });
  if (res.statusCode !== 200) {
    throw new Error(`cashier PIN change failed: ${res.statusCode} ${res.body}`);
  }
  return { id, token };
}

/** Audit rows for one entity type, oldest first, with JSON values parsed. */
export function auditRows(h: Harness, entity: string) {
  return h.handle.sqlite
    .prepare(
      'select entity_id, action, user_id, old_value, new_value from audit_logs where entity = ? order by created_at, rowid',
    )
    .all(entity)
    .map((r) => {
      const row = r as Record<string, string | null>;
      return {
        entityId: row.entity_id,
        action: row.action,
        userId: row.user_id,
        oldValue: row.old_value ? JSON.parse(row.old_value) : null,
        newValue: row.new_value ? JSON.parse(row.new_value) : null,
      };
    });
}

/** Service context on the harness DB and clock, for calling services directly. */
export function serviceContext(h: Harness): ServiceContext {
  const now = () => h.clock.now;
  return {
    db: h.handle.db,
    now,
    openPath: (t) => h.opened.push(t),
    approvals: new ApprovalStore(now),
  };
}

/** Creates a product as the given user and returns it (`category` is a category name). */
export async function createProductAs(
  h: Harness,
  token: string,
  product: Record<string, unknown> & { category: string },
): Promise<Product> {
  const categories = await h.app.inject({
    method: 'GET',
    url: '/api/categories',
    headers: withSession(token),
  });
  const { category, ...rest } = product;
  const categoryId = categories
    .json()
    .categories.find((c: { name: string }) => c.name === category)?.id;
  const res = await h.app.inject({
    method: 'POST',
    url: '/api/products',
    headers: withSession(token),
    payload: { ...rest, categoryId },
  });
  if (res.statusCode !== 201) {
    throw new Error(`create product failed: ${res.statusCode} ${res.body}`);
  }
  return res.json().product;
}
