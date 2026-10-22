import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { auditLogs } from '../db/schema';
import { findUserByUsername } from '../repositories/users-repository';
import { updateUserById } from '../services/user-service';
import {
  activeCashier as activeCashierFor,
  CASHIER,
  createHarness,
  createUserAs,
  type Harness,
  login,
  serviceContext,
  setupOwner,
  withSession,
} from '../testing/harness';

let h: Harness;
let ownerToken: string;

beforeEach(async () => {
  h = await createHarness();
  ({ token: ownerToken } = await setupOwner(h));
});

afterEach(async () => {
  await h.close();
});

const put = (token: string, id: string, payload: object) =>
  h.app.inject({ method: 'PUT', url: `/api/users/${id}`, headers: withSession(token), payload });

const me = (token: string) =>
  h.app.inject({ method: 'GET', url: '/api/auth/me', headers: withSession(token) });

const activeCashier = () => activeCashierFor(h, ownerToken);

describe('access', () => {
  it('requires a session', async () => {
    const res = await h.app.inject({ method: 'GET', url: '/api/users' });
    expect(res.statusCode).toBe(401);
  });

  it('refuses cashiers until owner approval exists', async () => {
    const { token } = await activeCashier();
    const res = await h.app.inject({
      method: 'GET',
      url: '/api/users',
      headers: withSession(token),
    });
    expect(res.statusCode).toBe(403);
    expect(res.json().error).toEqual({
      code: 'OWNER_APPROVAL_REQUIRED',
      message: 'Tindakan ini memerlukan persetujuan pemilik.',
    });
  });
});

describe('create and list', () => {
  it('creates a cashier with a temporary PIN', async () => {
    const res = await h.app.inject({
      method: 'POST',
      url: '/api/users',
      headers: withSession(ownerToken),
      payload: CASHIER,
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().user).toMatchObject({
      username: 'kasir1',
      role: 'cashier',
      mustChangePin: true,
    });
    expect(JSON.stringify(res.json())).not.toContain('scrypt');

    const list = await h.app.inject({
      method: 'GET',
      url: '/api/users',
      headers: withSession(ownerToken),
    });
    expect(list.json().users.map((u: { username: string }) => u.username)).toEqual([
      'pemilik',
      'kasir1',
    ]);
  });

  it('rejects a duplicate username regardless of case', async () => {
    await createUserAs(h, ownerToken, CASHIER);
    const res = await h.app.inject({
      method: 'POST',
      url: '/api/users',
      headers: withSession(ownerToken),
      payload: { ...CASHIER, username: 'KASIR1' },
    });
    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe('USERNAME_TAKEN');
  });
});

describe('update', () => {
  it('renames a user', async () => {
    const id = await createUserAs(h, ownerToken, CASHIER);
    const res = await put(ownerToken, id, { name: 'Rina Wati' });
    expect(res.json().user.name).toBe('Rina Wati');
  });

  it('deactivates a cashier, ending their session and blocking login', async () => {
    const { id, token } = await activeCashier();
    const res = await put(ownerToken, id, { active: false });
    expect(res.json().user.active).toBe(false);
    expect((await me(token)).statusCode).toBe(401);
    await expect(login(h, CASHIER.username, '565656')).rejects.toThrow();

    expect((await put(ownerToken, id, { active: true })).json().user.active).toBe(true);
    await expect(login(h, CASHIER.username, '565656')).resolves.toBeTypeOf('string');
  });

  it('resets a cashier PIN to a temporary one that must be changed', async () => {
    const { id, token } = await activeCashier();
    const res = await put(ownerToken, id, { pin: '909090' });
    expect(res.json().user.mustChangePin).toBe(true);
    expect((await me(token)).statusCode).toBe(401);

    const newToken = await login(h, CASHIER.username, '909090');
    expect((await me(newToken)).json().user.mustChangePin).toBe(true);
  });

  it('never resets an owner PIN, including the acting owner', async () => {
    const otherId = await createUserAs(h, ownerToken, {
      username: 'pemilik2',
      name: 'Pak Budi',
      role: 'owner',
      pin: '333333',
    });
    const selfId = findUserByUsername(h.handle.db, 'pemilik')?.id ?? '';
    for (const id of [otherId, selfId]) {
      const res = await put(ownerToken, id, { pin: '121212' });
      expect(res.statusCode).toBe(403);
      expect(res.json().error.code).toBe('OWNER_PIN_RESET_FORBIDDEN');
    }
  });

  it('stops owners from deactivating themselves', async () => {
    const selfId = findUserByUsername(h.handle.db, 'pemilik')?.id ?? '';
    const res = await put(ownerToken, selfId, { active: false });
    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe('CANNOT_DEACTIVATE_SELF');
  });

  it('lets one owner deactivate another while another owner stays active', async () => {
    const otherId = await createUserAs(h, ownerToken, {
      username: 'pemilik2',
      name: 'Pak Budi',
      role: 'owner',
      pin: '333333',
    });
    expect((await put(ownerToken, otherId, { active: false })).statusCode).toBe(200);
  });

  it('never deactivates the last active owner', async () => {
    // Reachable once cashiers act with owner approval (Stage 5); checked at the service level.
    const { id: cashierId } = await activeCashier();
    const owner = findUserByUsername(h.handle.db, 'pemilik');
    const ctx = serviceContext(h);
    await expect(
      updateUserById(ctx, { id: cashierId, role: 'cashier' }, owner?.id ?? '', { active: false }),
    ).rejects.toMatchObject({ code: 'LAST_ACTIVE_OWNER' });
  });

  it('returns 404 for an unknown user', async () => {
    const res = await put(ownerToken, 'missing', { name: 'X' });
    expect(res.statusCode).toBe(404);
    expect(res.json().error.code).toBe('USER_NOT_FOUND');
  });
});

describe('audit log', () => {
  it('records user changes without secrets', async () => {
    const { id } = await activeCashier();
    await put(ownerToken, id, { name: 'Rina Wati' });
    await put(ownerToken, id, { pin: '909090' });
    const rows = h.handle.db.select().from(auditLogs).all();
    expect(rows.map((r) => r.action)).toEqual([
      'setup',
      'create',
      'change_pin',
      'update',
      'reset_pin',
    ]);
    expect(rows.every((r) => r.entity === 'user')).toBe(true);
    const owner = findUserByUsername(h.handle.db, 'pemilik');
    expect(rows.find((r) => r.action === 'update')).toMatchObject({
      userId: owner?.id,
      entityId: id,
      approvedBy: null,
    });
    const text = JSON.stringify(rows);
    expect(text).not.toContain('scrypt');
    expect(text).not.toMatch(/pin_?hash|recovery_?code_?hash/i);
  });
});
