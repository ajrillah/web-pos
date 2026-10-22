import { createHash, randomBytes, randomInt, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scryptAsync = promisify(scrypt) as (
  password: string,
  salt: Buffer,
  keylen: number,
  options: { N: number; r: number; p: number },
) => Promise<Buffer>;

const SCRYPT = { N: 16_384, r: 8, p: 1 };
const KEY_LENGTH = 32;

/** Salted scrypt hash for low-entropy secrets (PINs, recovery codes): `scrypt$N$r$p$salt$hash`. */
export async function hashSecret(secret: string): Promise<string> {
  const salt = randomBytes(16);
  const hash = await scryptAsync(secret, salt, KEY_LENGTH, SCRYPT);
  return [
    'scrypt',
    SCRYPT.N,
    SCRYPT.r,
    SCRYPT.p,
    salt.toString('base64'),
    hash.toString('base64'),
  ].join('$');
}

export async function verifySecret(secret: string, stored: string): Promise<boolean> {
  const [scheme, n, r, p, salt, hash] = stored.split('$');
  if (scheme !== 'scrypt' || !n || !r || !p || !salt || !hash) {
    return false;
  }
  const expected = Buffer.from(hash, 'base64');
  const actual = await scryptAsync(secret, Buffer.from(salt, 'base64'), expected.length, {
    N: Number(n),
    r: Number(r),
    p: Number(p),
  });
  return timingSafeEqual(actual, expected);
}

let dummyHash: Promise<string> | undefined;

/** Burns the same time as a real verification so unknown usernames are not distinguishable. */
export async function verifyAgainstDummy(secret: string): Promise<false> {
  dummyHash ??= hashSecret('dummy-secret');
  await verifySecret(secret, await dummyHash);
  return false;
}

// Crockford base32 without I, L, O, U: unambiguous when read aloud or written down.
const RECOVERY_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

/** 16 random characters (80 bits) shown as XXXX-XXXX-XXXX-XXXX. */
export function generateRecoveryCode(): string {
  const chars = Array.from({ length: 16 }, () => RECOVERY_ALPHABET[randomInt(32)]);
  return [0, 4, 8, 12].map((i) => chars.slice(i, i + 4).join('')).join('-');
}

/** Uppercases, drops separators, and maps look-alikes (O->0, I/L->1) before hashing or comparing. */
export function normalizeRecoveryCode(input: string): string {
  return input
    .toUpperCase()
    .replace(/[^0-9A-Z]/g, '')
    .replace(/O/g, '0')
    .replace(/[IL]/g, '1');
}

/** 256-bit random session token for the cookie. */
export function generateSessionToken(): string {
  return randomBytes(32).toString('base64url');
}

/** Session tokens are high-entropy, so a fast hash is enough. */
export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
