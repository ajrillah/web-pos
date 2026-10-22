import { describe, expect, it } from 'vitest';
import {
  generateRecoveryCode,
  generateSessionToken,
  hashSecret,
  hashToken,
  normalizeRecoveryCode,
  verifyAgainstDummy,
  verifySecret,
} from './secrets';

describe('hashSecret / verifySecret', () => {
  it('verifies the right secret and rejects a wrong one', async () => {
    const stored = await hashSecret('123456');
    expect(stored).toMatch(/^scrypt\$16384\$8\$1\$/);
    expect(await verifySecret('123456', stored)).toBe(true);
    expect(await verifySecret('654321', stored)).toBe(false);
  });

  it('salts each hash', async () => {
    expect(await hashSecret('123456')).not.toBe(await hashSecret('123456'));
  });

  it('rejects malformed stored values', async () => {
    expect(await verifySecret('123456', 'plain-text')).toBe(false);
  });

  it('dummy verification always fails', async () => {
    expect(await verifyAgainstDummy('123456')).toBe(false);
  });
});

describe('recovery codes', () => {
  it('generates XXXX-XXXX-XXXX-XXXX from the unambiguous alphabet', () => {
    const code = generateRecoveryCode();
    expect(code).toMatch(/^[0-9A-HJKMNP-TV-Z]{4}(-[0-9A-HJKMNP-TV-Z]{4}){3}$/);
    expect(generateRecoveryCode()).not.toBe(code);
  });

  it('normalizes case, separators, and look-alike letters', () => {
    expect(normalizeRecoveryCode(' abcd-efgh 0ooi-l1jk ')).toBe('ABCDEFGH000111JK');
  });
});

describe('session tokens', () => {
  it('are random base64url and hash to stable hex', () => {
    const token = generateSessionToken();
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(hashToken(token)).toBe(hashToken(token));
    expect(hashToken(token)).toMatch(/^[0-9a-f]{64}$/);
  });
});
