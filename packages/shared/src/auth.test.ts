import { describe, expect, it } from 'vitest';
import { changePinRequestSchema, pinSchema, updateUserRequestSchema, usernameSchema } from './auth';

describe('usernameSchema', () => {
  it('trims and lowercases', () => {
    expect(usernameSchema.parse('  Budi.Santoso ')).toBe('budi.santoso');
  });

  it('rejects too short, too long, and invalid characters', () => {
    expect(usernameSchema.safeParse('ab').success).toBe(false);
    expect(usernameSchema.safeParse('a'.repeat(33)).success).toBe(false);
    expect(usernameSchema.safeParse('budi santoso').success).toBe(false);
  });
});

describe('pinSchema', () => {
  it('accepts exactly six digits, keeping leading zeros', () => {
    expect(pinSchema.parse('012345')).toBe('012345');
  });

  it('rejects other lengths and non-digits', () => {
    for (const pin of ['12345', '1234567', '12a456', ' 123456']) {
      expect(pinSchema.safeParse(pin).success).toBe(false);
    }
  });
});

describe('changePinRequestSchema', () => {
  it('rejects a new PIN equal to the current PIN', () => {
    const result = changePinRequestSchema.safeParse({ currentPin: '111111', newPin: '111111' });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toEqual(['newPin']);
  });
});

describe('updateUserRequestSchema', () => {
  it('rejects an empty update', () => {
    expect(updateUserRequestSchema.safeParse({}).success).toBe(false);
  });

  it('accepts a partial update', () => {
    expect(updateUserRequestSchema.parse({ active: false })).toEqual({ active: false });
  });
});
