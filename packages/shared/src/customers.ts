import { z } from 'zod';
import { moneySchema } from './catalog';
import { paymentMethodSchema } from './sales';

// Contracts for customers, kasbon (receivables), and customer payments. See docs/design.md 6.7.

const nameSchema = z.string().trim().min(1).max(100);
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((v) => (v === '' ? null : v))
    .nullable();

export const customerSchema = z.object({
  id: z.string(),
  name: z.string(),
  phone: z.string().nullable(),
  note: z.string().nullable(),
  active: z.boolean(),
  /** Remaining kasbon: sum of `remaining` over open receivables. */
  balance: z.number().int(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type Customer = z.infer<typeof customerSchema>;

export const createCustomerRequestSchema = z.object({
  name: nameSchema,
  phone: optionalText(30).optional(),
  note: optionalText(200).optional(),
});
export type CreateCustomerRequest = z.input<typeof createCustomerRequestSchema>;

export const updateCustomerRequestSchema = z
  .object({
    name: nameSchema.optional(),
    phone: optionalText(30).optional(),
    note: optionalText(200).optional(),
    active: z.boolean().optional(),
  })
  .refine((v) => Object.keys(v).length > 0);
export type UpdateCustomerRequest = z.input<typeof updateCustomerRequestSchema>;

export const customersQuerySchema = z.object({
  q: z.string().trim().max(100).optional(),
  status: z.enum(['active', 'inactive', 'all']).default('active'),
  /** Only customers with remaining kasbon. */
  withBalance: z.stringbool().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});
export type CustomersQuery = z.input<typeof customersQuerySchema>;

export const customersResponseSchema = z.object({
  customers: z.array(customerSchema),
  total: z.number().int(),
  page: z.number().int(),
  limit: z.number().int(),
});
export type CustomersResponse = z.infer<typeof customersResponseSchema>;

export const customerResponseSchema = z.object({ customer: customerSchema });
export type CustomerResponse = z.infer<typeof customerResponseSchema>;

export const receivableStatusSchema = z.enum(['open', 'paid', 'void']);
export type ReceivableStatus = z.infer<typeof receivableStatusSchema>;

export const receivableSchema = z.object({
  id: z.string(),
  customerId: z.string(),
  customerName: z.string(),
  saleId: z.string(),
  saleNumber: z.string(),
  amount: z.number().int(),
  remaining: z.number().int(),
  status: receivableStatusSchema,
  createdAt: z.string(),
});
export type Receivable = z.infer<typeof receivableSchema>;

export const receivablesQuerySchema = z.object({
  customerId: z.string().min(1).optional(),
  status: z.enum(['open', 'all']).default('open'),
});
export type ReceivablesQuery = z.input<typeof receivablesQuerySchema>;

export const receivablesResponseSchema = z.object({
  receivables: z.array(receivableSchema),
  /** Sum of `remaining` over the listed receivables. */
  totalRemaining: z.number().int(),
});
export type ReceivablesResponse = z.infer<typeof receivablesResponseSchema>;

export const createCustomerPaymentRequestSchema = z.object({
  /** Client-generated UUID; a second request with the same id is rejected. */
  id: z.uuid(),
  customerId: z.string().min(1),
  /** Ticked receivables; the payment fills the oldest first. */
  receivableIds: z.array(z.string().min(1)).min(1).max(500),
  method: paymentMethodSchema,
  /** Cash: amount received (change is returned). QRIS: amount paid. */
  amount: moneySchema.refine((v) => v > 0),
});
export type CreateCustomerPaymentRequest = z.infer<typeof createCustomerPaymentRequestSchema>;

export const paymentAllocationSchema = z.object({
  receivableId: z.string(),
  saleNumber: z.string(),
  amount: z.number().int(),
  /** Remaining on the receivable right after this payment. */
  remainingAfter: z.number().int(),
});
export type PaymentAllocation = z.infer<typeof paymentAllocationSchema>;

export const customerPaymentSchema = z.object({
  id: z.string(),
  number: z.string(),
  customerId: z.string(),
  customerName: z.string(),
  method: paymentMethodSchema,
  /** Applied to receivables. */
  amount: z.number().int(),
  amountReceived: z.number().int(),
  changeAmount: z.number().int(),
  /** Customer's remaining kasbon right after the payment (receipt snapshot). */
  balanceAfter: z.number().int(),
  status: z.enum(['active', 'voided']),
  userName: z.string(),
  receiptCount: z.number().int(),
  allocations: z.array(paymentAllocationSchema),
  createdAt: z.string(),
});
export type CustomerPayment = z.infer<typeof customerPaymentSchema>;

export const customerPaymentResponseSchema = z.object({ payment: customerPaymentSchema });
export type CustomerPaymentResponse = z.infer<typeof customerPaymentResponseSchema>;

export const ledgerEntrySchema = z.object({
  kind: z.enum(['kasbon', 'payment']),
  /** Sale or payment id. */
  refId: z.string(),
  number: z.string(),
  date: z.string(),
  /** Kasbon adds (positive); payments reduce (negative). */
  change: z.number().int(),
  /** Remaining kasbon after this entry. */
  balance: z.number().int(),
  voided: z.boolean(),
});
export type LedgerEntry = z.infer<typeof ledgerEntrySchema>;

export const customerLedgerResponseSchema = z.object({
  customer: customerSchema,
  /** Oldest first; voided entries are listed but do not change the balance. */
  entries: z.array(ledgerEntrySchema),
  receivables: z.array(receivableSchema),
});
export type CustomerLedgerResponse = z.infer<typeof customerLedgerResponseSchema>;

/**
 * Splits an applied amount over ticked receivables, oldest first, each up to its remaining.
 * The amount never exceeds the ticked total (the caller caps it).
 */
export function allocateOldestFirst(
  receivables: { id: string; remaining: number }[],
  amount: number,
): { receivableId: string; amount: number }[] {
  const result: { receivableId: string; amount: number }[] = [];
  let left = amount;
  for (const r of receivables) {
    if (left <= 0) break;
    const part = Math.min(left, r.remaining);
    if (part > 0) result.push({ receivableId: r.id, amount: part });
    left -= part;
  }
  return result;
}
