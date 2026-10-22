import { describe, expect, it } from 'vitest';
import { allocateOldestFirst, createCustomerRequestSchema } from './customers';

const ticked = [
  { id: 'a', remaining: 10_000 },
  { id: 'b', remaining: 5_000 },
  { id: 'c', remaining: 2_000 },
];

describe('allocateOldestFirst', () => {
  it('fills the oldest ticked receivable first', () => {
    expect(allocateOldestFirst(ticked, 12_000)).toEqual([
      { receivableId: 'a', amount: 10_000 },
      { receivableId: 'b', amount: 2_000 },
    ]);
  });

  it('pays everything with the ticked total', () => {
    expect(allocateOldestFirst(ticked, 17_000).map((a) => a.amount)).toEqual([
      10_000, 5_000, 2_000,
    ]);
  });

  it('never allocates more than each remaining amount', () => {
    expect(allocateOldestFirst(ticked, 99_000).reduce((s, a) => s + a.amount, 0)).toBe(17_000);
  });

  it('allocates nothing for zero', () => {
    expect(allocateOldestFirst(ticked, 0)).toEqual([]);
  });
});

describe('createCustomerRequestSchema', () => {
  it('trims and turns empty optional text into null', () => {
    expect(createCustomerRequestSchema.parse({ name: ' Pak Budi ', phone: ' ', note: '' })).toEqual(
      {
        name: 'Pak Budi',
        phone: null,
        note: null,
      },
    );
  });
});
