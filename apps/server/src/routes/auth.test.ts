import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { SESSION_IDLE_MS, SESSION_TOUCH_INTERVAL_MS } from '../services/auth-service';
import {
  createHarness,
  createUserAs,
  type Harness,
  login,
  OWNER,
  sessionCookie,
  setupOwner,
  withSession,
} from '../testing/harness';

let h: Harness;

beforeEach(async () => {
  h = await createHarness();
});

afterEach(async () => {
  await h.close();
});

const me = (token?: string) =>
  h.app.inject({
    method: 'GET',
    url: '/api/auth/me',
    ...(token ? { headers: withSession(token) } : {}),
  });

describe('setup', () => {
  it('reports that setup is needed on a fresh database', async () => {
    const res = await h.app.inject({ method: 'GET', url: '/api/setup/status' });
    expect(res.json()).toEqual({ needsSetup: true });
  });

  it('creates the owner, logs them in, and returns a recovery code once', async () => {
    const res = await h.app.inject({ method: 'POST', url: '/api/setup', payload: OWNER });
    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.user).toMatchObject({
      username: 'pemilik',
      name: 'Bu Sari',
      role: 'owner',
      active: true,
      mustChangePin: false,
    });
    expect(body.recoveryCode).toMatch(/^[0-9A-Z]{4}(-[0-9A-Z]{4}){3}$/);
    const cookie = res.cookies.find((c) => c.name === 'toko_session');
    expect(cookie).toMatchObject({ httpOnly: true, sameSite: 'Strict', path: '/' });
    expect((await me(sessionCookie(res))).json().user.username).toBe('pemilik');

    const status = await h.app.inject({ method: 'GET', url: '/api/setup/status' });
    expect(status.json()).toEqual({ needsSetup: false });
  });

  it('refuses a second setup', async () => {
    await setupOwner(h);
    const res = await h.app.inject({
      method: 'POST',
      url: '/api/setup',
      payload: { ...OWNER, username: 'lain' },
    });
    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe('SETUP_ALREADY_DONE');
  });

  it('validates the PIN format', async () => {
    const res = await h.app.inject({
      method: 'POST',
      url: '/api/setup',
      payload: { ...OWNER, pin: '12345' },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toEqual({
      code: 'VALIDATION_ERROR',
      message: 'Data tidak valid pada kolom "pin".',
    });
  });
});

describe('login and logout', () => {
  beforeEach(async () => {
    await setupOwner(h);
  });

  it('logs in with username and PIN, ignoring username case', async () => {
    const res = await h.app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { username: ' Pemilik ', pin: OWNER.pin },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().user.role).toBe('owner');
    expect((await me(sessionCookie(res))).statusCode).toBe(200);
  });

  it('rejects a wrong PIN and an unknown user with the same message', async () => {
    for (const payload of [
      { username: 'pemilik', pin: '999999' },
      { username: 'tidakada', pin: OWNER.pin },
    ]) {
      const res = await h.app.inject({ method: 'POST', url: '/api/auth/login', payload });
      expect(res.statusCode).toBe(401);
      expect(res.json().error).toEqual({
        code: 'INVALID_CREDENTIALS',
        message: 'Nama pengguna atau PIN salah.',
      });
    }
  });

  it('requires a session for auth/me', async () => {
    expect((await me()).json().error.code).toBe('UNAUTHENTICATED');
    expect((await me('not-a-real-token')).statusCode).toBe(401);
  });

  it('ends the session on logout', async () => {
    const token = await login(h, 'pemilik', OWNER.pin);
    const res = await h.app.inject({
      method: 'POST',
      url: '/api/auth/logout',
      headers: withSession(token),
    });
    expect(res.statusCode).toBe(204);
    expect(res.cookies.find((c) => c.name === 'toko_session')?.value).toBe('');
    expect((await me(token)).statusCode).toBe(401);
  });
});

describe('sessions', () => {
  it('survive a server restart', async () => {
    const { token } = await setupOwner(h);
    await h.restart();
    const res = await me(token);
    expect(res.statusCode).toBe(200);
    expect(res.json().user.username).toBe('pemilik');
  });

  it('expire after 12 hours without requests', async () => {
    const { token } = await setupOwner(h);
    h.clock.advance(SESSION_IDLE_MS + 1);
    expect((await me(token)).statusCode).toBe(401);
  });

  it('stay alive while used within 12 hours', async () => {
    const { token } = await setupOwner(h);
    h.clock.advance(SESSION_IDLE_MS - SESSION_TOUCH_INTERVAL_MS);
    expect((await me(token)).statusCode).toBe(200);
    h.clock.advance(SESSION_IDLE_MS - SESSION_TOUCH_INTERVAL_MS);
    expect((await me(token)).statusCode).toBe(200);
  });
});

describe('change own PIN', () => {
  const changePin = (token: string, currentPin: string, newPin: string) =>
    h.app.inject({
      method: 'PUT',
      url: '/api/auth/me/pin',
      headers: withSession(token),
      payload: { currentPin, newPin },
    });

  it('requires the current PIN', async () => {
    const { token } = await setupOwner(h);
    const res = await changePin(token, '999999', '222222');
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('WRONG_CURRENT_PIN');
  });

  it('rejects reusing the same PIN', async () => {
    const { token } = await setupOwner(h);
    const res = await changePin(token, OWNER.pin, OWNER.pin);
    expect(res.json().error.message).toBe('Data tidak valid pada kolom "newPin".');
  });

  it('changes the PIN without issuing a new code for an owner who has one', async () => {
    const { token } = await setupOwner(h);
    const res = await changePin(token, OWNER.pin, '222222');
    expect(res.statusCode).toBe(200);
    expect(res.json().recoveryCode).toBeUndefined();
    await expect(login(h, 'pemilik', OWNER.pin)).rejects.toThrow();
    await expect(login(h, 'pemilik', '222222')).resolves.toBeTypeOf('string');
  });
});

describe('must_change_pin', () => {
  it('limits a new owner to changing their PIN, then issues their recovery code', async () => {
    const { token: ownerToken } = await setupOwner(h);
    await createUserAs(h, ownerToken, {
      username: 'pemilik2',
      name: 'Pak Budi',
      role: 'owner',
      pin: '333333',
    });
    const token = await login(h, 'pemilik2', '333333');
    expect((await me(token)).json().user.mustChangePin).toBe(true);

    const blocked = await h.app.inject({
      method: 'GET',
      url: '/api/users',
      headers: withSession(token),
    });
    expect(blocked.statusCode).toBe(403);
    expect(blocked.json().error.code).toBe('PIN_CHANGE_REQUIRED');

    const changed = await h.app.inject({
      method: 'PUT',
      url: '/api/auth/me/pin',
      headers: withSession(token),
      payload: { currentPin: '333333', newPin: '444444' },
    });
    expect(changed.json().user.mustChangePin).toBe(false);
    expect(changed.json().recoveryCode).toMatch(/^[0-9A-Z]{4}(-[0-9A-Z]{4}){3}$/);

    const allowed = await h.app.inject({
      method: 'GET',
      url: '/api/users',
      headers: withSession(token),
    });
    expect(allowed.statusCode).toBe(200);
  });

  it('does not issue recovery codes to cashiers', async () => {
    const { token: ownerToken } = await setupOwner(h);
    await createUserAs(h, ownerToken, {
      username: 'kasir1',
      name: 'Rina',
      role: 'cashier',
      pin: '555555',
    });
    const token = await login(h, 'kasir1', '555555');
    const res = await h.app.inject({
      method: 'PUT',
      url: '/api/auth/me/pin',
      headers: withSession(token),
      payload: { currentPin: '555555', newPin: '666666' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().recoveryCode).toBeUndefined();
  });
});

describe('recover PIN', () => {
  const recover = (username: string, recoveryCode: string, newPin = '777777') =>
    h.app.inject({
      method: 'POST',
      url: '/api/auth/recover',
      payload: { username, recoveryCode, newPin },
    });

  it('resets the owner PIN, issues a new code, and ends open sessions', async () => {
    const { token, recoveryCode } = await setupOwner(h);
    const res = await recover('pemilik', recoveryCode);
    expect(res.statusCode).toBe(200);
    const newCode = res.json().recoveryCode;
    expect(newCode).not.toBe(recoveryCode);

    expect((await me(token)).statusCode).toBe(401);
    await expect(login(h, 'pemilik', '777777')).resolves.toBeTypeOf('string');

    const reused = await recover('pemilik', recoveryCode, '888888');
    expect(reused.json().error.code).toBe('INVALID_RECOVERY');
    expect((await recover('pemilik', newCode, '888888')).statusCode).toBe(200);
  });

  it('accepts the code in lowercase without dashes', async () => {
    const { recoveryCode } = await setupOwner(h);
    const res = await recover('pemilik', recoveryCode.replaceAll('-', '').toLowerCase());
    expect(res.statusCode).toBe(200);
  });

  it('rejects wrong codes, cashiers, and owners without a code alike', async () => {
    const { token } = await setupOwner(h);
    await createUserAs(h, token, {
      username: 'kasir1',
      name: 'Rina',
      role: 'cashier',
      pin: '555555',
    });
    await createUserAs(h, token, {
      username: 'pemilik2',
      name: 'Pak Budi',
      role: 'owner',
      pin: '333333',
    });
    for (const username of ['pemilik', 'kasir1', 'pemilik2', 'tidakada']) {
      const res = await recover(username, 'AAAA-BBBB-CCCC-DDDD');
      expect(res.statusCode).toBe(400);
      expect(res.json().error).toEqual({
        code: 'INVALID_RECOVERY',
        message: 'Nama pengguna atau kode pemulihan salah.',
      });
    }
  });
});
