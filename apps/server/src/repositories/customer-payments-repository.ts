import { asc, desc, eq, inArray, sql } from 'drizzle-orm';
import type { Executor } from '../db/client';
import {
  customerPayments,
  customers,
  paymentAllocations,
  receivables,
  sales,
  users,
} from '../db/schema';

export type PaymentRow = typeof customerPayments.$inferSelect;
export type NewPaymentRow = typeof customerPayments.$inferInsert;
export type PaymentWithNames = PaymentRow & { customerName: string; userName: string };

const withNames = { payment: customerPayments, customerName: customers.name, userName: users.name };
const flatten = (r: {
  payment: PaymentRow;
  customerName: string;
  userName: string;
}): PaymentWithNames => ({ ...r.payment, customerName: r.customerName, userName: r.userName });

export function paymentIdExists(db: Executor, id: string): boolean {
  return (
    db
      .select({ id: customerPayments.id })
      .from(customerPayments)
      .where(eq(customerPayments.id, id))
      .get() !== undefined
  );
}

export function findPaymentById(db: Executor, id: string): PaymentWithNames | undefined {
  const row = db
    .select(withNames)
    .from(customerPayments)
    .innerJoin(customers, eq(customers.id, customerPayments.customerId))
    .innerJoin(users, eq(users.id, customerPayments.userId))
    .where(eq(customerPayments.id, id))
    .get();
  return row && flatten(row);
}

export function listPaymentsOfCustomer(db: Executor, customerId: string): PaymentWithNames[] {
  return db
    .select(withNames)
    .from(customerPayments)
    .innerJoin(customers, eq(customers.id, customerPayments.customerId))
    .innerJoin(users, eq(users.id, customerPayments.userId))
    .where(eq(customerPayments.customerId, customerId))
    .orderBy(asc(customerPayments.createdAt))
    .all()
    .map(flatten);
}

/** Highest payment number with this `BYR-YYYYMMDD-` prefix (longest first, so 10000 > 9999). */
export function lastPaymentNumber(db: Executor, prefix: string): string | undefined {
  return db
    .select({ number: customerPayments.number })
    .from(customerPayments)
    .where(sql`${customerPayments.number} LIKE ${`${prefix}%`}`)
    .orderBy(desc(sql`length(${customerPayments.number})`), desc(customerPayments.number))
    .limit(1)
    .get()?.number;
}

export function insertPayment(db: Executor, row: NewPaymentRow): void {
  db.insert(customerPayments).values(row).run();
}

export function updatePayment(
  db: Executor,
  id: string,
  patch: Partial<Pick<PaymentRow, 'receiptCount' | 'receiptFile'>>,
): void {
  db.update(customerPayments).set(patch).where(eq(customerPayments.id, id)).run();
}

export interface AllocationWithSale {
  paymentId: string;
  receivableId: string;
  saleNumber: string;
  amount: number;
}

export function insertAllocations(
  db: Executor,
  rows: { paymentId: string; receivableId: string; amount: number; createdAt?: string }[],
): void {
  if (rows.length > 0) db.insert(paymentAllocations).values(rows).run();
}

/** Allocations of the given payments with their sale numbers, oldest receivable first. */
export function listAllocations(db: Executor, paymentIds: string[]): AllocationWithSale[] {
  if (paymentIds.length === 0) return [];
  return db
    .select({
      paymentId: paymentAllocations.paymentId,
      receivableId: paymentAllocations.receivableId,
      saleNumber: sales.number,
      amount: paymentAllocations.amount,
    })
    .from(paymentAllocations)
    .innerJoin(receivables, eq(receivables.id, paymentAllocations.receivableId))
    .innerJoin(sales, eq(sales.id, receivables.saleId))
    .where(inArray(paymentAllocations.paymentId, paymentIds))
    .orderBy(asc(receivables.createdAt))
    .all()
    .map((r) => ({ ...r, saleNumber: r.saleNumber ?? '' }));
}

/** Sum of allocations from active payments, per receivable. */
export function activeAllocatedByReceivable(
  db: Executor,
  receivableIds: string[],
): Map<string, number> {
  if (receivableIds.length === 0) return new Map();
  const rows = db
    .select({
      receivableId: paymentAllocations.receivableId,
      total: sql<number>`sum(${paymentAllocations.amount})`,
    })
    .from(paymentAllocations)
    .innerJoin(customerPayments, eq(customerPayments.id, paymentAllocations.paymentId))
    .where(
      sql`${customerPayments.status} = 'active' and ${inArray(paymentAllocations.receivableId, receivableIds)}`,
    )
    .groupBy(paymentAllocations.receivableId)
    .all();
  return new Map(rows.map((r) => [r.receivableId, r.total]));
}
