import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  activeCashier,
  auditRows,
  createHarness,
  type Harness,
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

const list = (token: string) =>
  h.app.inject({ method: 'GET', url: '/api/categories', headers: withSession(token) });
const create = (token: string, name: string) =>
  h.app.inject({
    method: 'POST',
    url: '/api/categories',
    headers: withSession(token),
    payload: { name },
  });
const put = (token: string, id: string, payload: object) =>
  h.app.inject({
    method: 'PUT',
    url: `/api/categories/${id}`,
    headers: withSession(token),
    payload,
  });

describe('GET /api/categories', () => {
  it('requires a session', async () => {
    expect((await h.app.inject({ method: 'GET', url: '/api/categories' })).statusCode).toBe(401);
  });

  it('lists the defaults for cashiers too', async () => {
    const { token } = await activeCashier(h, ownerToken);
    const res = await list(token);
    expect(res.statusCode).toBe(200);
    expect(res.json().categories.map((c: { name: string }) => c.name)).toEqual([
      'Lain-lain',
      'Rokok',
      'Sembako',
    ]);
  });
});

describe('POST /api/categories', () => {
  it('lets the owner add a category, audited', async () => {
    const res = await create(ownerToken, ' Minuman ');
    expect(res.statusCode).toBe(201);
    expect(res.json().category).toMatchObject({ name: 'Minuman', isDefault: false, active: true });
    expect(auditRows(h, 'category')).toMatchObject([
      { action: 'create', newValue: { name: 'Minuman', active: true } },
    ]);
  });

  it('rejects a name already used, ignoring case', async () => {
    const res = await create(ownerToken, 'sembako');
    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe('CATEGORY_NAME_TAKEN');
  });

  it('needs owner approval for cashiers', async () => {
    const { token } = await activeCashier(h, ownerToken);
    const res = await create(token, 'Minuman');
    expect(res.statusCode).toBe(403);
    expect(res.json().error.code).toBe('OWNER_APPROVAL_REQUIRED');
  });

  it('validates the name', async () => {
    const res = await create(ownerToken, '   ');
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('VALIDATION_ERROR');
  });
});

describe('PUT /api/categories/:id', () => {
  it('renames and deactivates a custom category', async () => {
    const id = (await create(ownerToken, 'Minuman')).json().category.id;
    const res = await put(ownerToken, id, { name: 'Minuman Dingin', active: false });
    expect(res.statusCode).toBe(200);
    expect(res.json().category).toMatchObject({ name: 'Minuman Dingin', active: false });
    expect(auditRows(h, 'category').at(-1)).toMatchObject({
      action: 'update',
      oldValue: { name: 'Minuman', active: true },
      newValue: { name: 'Minuman Dingin', active: false },
    });
  });

  it('never deactivates a default category', async () => {
    const rokok = (await list(ownerToken))
      .json()
      .categories.find((c: { name: string }) => c.name === 'Rokok');
    const res = await put(ownerToken, rokok.id, { active: false });
    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe('DEFAULT_CATEGORY_LOCKED');
  });

  it('rejects renaming onto another category', async () => {
    const id = (await create(ownerToken, 'Minuman')).json().category.id;
    const res = await put(ownerToken, id, { name: 'ROKOK' });
    expect(res.json().error.code).toBe('CATEGORY_NAME_TAKEN');
  });

  it('returns 404 for an unknown id', async () => {
    const res = await put(ownerToken, 'nope', { name: 'X' });
    expect(res.statusCode).toBe(404);
  });
});
