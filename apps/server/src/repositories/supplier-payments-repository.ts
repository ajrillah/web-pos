import { and, asc, desc, eq, inArray, isNull, ne, or, sql } from 'drizzle-orm';
import type { Executor } from '../db/client';
import { purchases, supplierAllocations, supplierPayments, suppliers, users } from '../db/schema';

export type SupplierPaymentRow = typeof supplierPayments.$inferSelect;
export type NewSupplierPaymentRow = typeof supplierPayments.$inferInsert;
export type SupplierPaymentWithNames = SupplierPaymentRow & {
  supplierName: string;
  userName: string;
};

const withNames = {
  payment: supplierPayments,
  supplierName: suppliers.name,
  userName: users.name,
};
const flatten = (r: {
  payment: SupplierPaymentRow;
  supplierName: string;
  userName: string;
}): SupplierPaymentWithNames => ({
  ...r.payment,
  supplierName: r.supplierName,
  userName: r.userName,
});

const selectWithNames = (db: Executor) =>
  db
    .select(withNames)
    .from(supplierPayments)
    .innerJoin(suppliers, eq(suppliers.id, supplierPayments.supplierId))
    .innerJoin(users, eq(users.id, supplierPayments.userId));

export function supplierPaymentIdExists(db: Executor, id: string): boolean {
  return (
    db
      .select({ id: supplierPayments.id })
      .from(supplierPayments)
      .where(eq(supplierPayments.id, id))
      .get() !== undefined
  );
}

export function findSupplierPaymentById(
  db: Executor,
  id: string,
): SupplierPaymentWithNames | undefined {
  const row = selectWithNames(db).where(eq(supplierPayments.id, id)).get();
  return row && flatten(row);
}

export function listPaymentsOfSupplier(
  db: Executor,
  supplierId: string,
): SupplierPaymentWithNames[] {
  return selectWithNames(db)
    .where(eq(supplierPayments.supplierId, supplierId))
    .orderBy(asc(supplierPayments.createdAt), asc(supplierPayments.number))
    .all()
    .map(flatten);
}

/** Highest payment number with this `BYH-YYYYMMDD-` prefix (longest first, so 10000 > 9999). */
export function lastSupplierPaymentNumber(db: Executor, prefix: string): string | undefined {
  return db
    .select({ number: supplierPayments.number })
    .from(supplierPayments)
    .where(sql`${supplierPayments.number} LIKE ${`${prefix}%`}`)
    .orderBy(desc(sql`length(${supplierPayments.number})`), desc(supplierPayments.number))
    .limit(1)
    .get()?.number;
}

export function insertSupplierPayment(db: Executor, row: NewSupplierPaymentRow): void {
  db.insert(supplierPayments).values(row).run();
}

export function updateSupplierPayment(
  db: Executor,
  id: string,
  patch: Partial<Pick<SupplierPaymentRow, 'status' | 'voidedAt' | 'voidedBy' | 'voidReason'>>,
): void {
  db.update(supplierPayments).set(patch).where(eq(supplierPayments.id, id)).run();
}

export function insertSupplierAllocations(
  db: Executor,
  rows: { paymentId: string; purchaseId: string; amount: number; createdAt?: string }[],
): void {
  if (rows.length > 0) db.insert(supplierAllocations).values(rows).run();
}

export interface SupplierAllocationWithRefs {
  paymentId: string;
  purchaseId: string;
  purchaseNumber: string;
  amount: number;
}

/** Allocations of the given payments with purchase numbers, oldest purchase first. */
export function listSupplierAllocations(
  db: Executor,
  paymentIds: string[],
): SupplierAllocationWithRefs[] {
  if (paymentIds.length === 0) return [];
  return db
    .select({
      paymentId: supplierAllocations.paymentId,
      purchaseId: supplierAllocations.purchaseId,
      purchaseNumber: purchases.number,
      amount: supplierAllocations.amount,
    })
    .from(supplierAllocations)
    .innerJoin(purchases, eq(purchases.id, supplierAllocations.purchaseId))
    .where(inArray(supplierAllocations.paymentId, paymentIds))
    .orderBy(asc(purchases.createdAt), asc(purchases.number))
    .all();
}

/** Every payment share of one purchase (active and voided), oldest first. */
export function listPaymentsOfPurchase(db: Executor, purchaseId: string) {
  return db
    .select({
      paymentId: supplierPayments.id,
      number: supplierPayments.number,
      method: supplierPayments.method,
      amount: supplierAllocations.amount,
      status: supplierPayments.status,
      initialPurchaseId: supplierPayments.initialPurchaseId,
      createdAt: supplierPayments.createdAt,
    })
    .from(supplierAllocations)
    .innerJoin(supplierPayments, eq(supplierPayments.id, supplierAllocations.paymentId))
    .where(eq(supplierAllocations.purchaseId, purchaseId))
    .orderBy(asc(supplierPayments.createdAt), asc(supplierPayments.number))
    .all();
}

/** Whether an active payment other than the purchase's own initial payment paid into it. */
export function hasOtherActivePayments(db: Executor, purchaseId: string): boolean {
  return (
    db
      .select({ id: supplierPayments.id })
      .from(supplierAllocations)
      .innerJoin(supplierPayments, eq(supplierPayments.id, supplierAllocations.paymentId))
      .where(
        and(
          eq(supplierAllocations.purchaseId, purchaseId),
          eq(supplierPayments.status, 'active'),
          or(
            isNull(supplierPayments.initialPurchaseId),
            ne(supplierPayments.initialPurchaseId, purchaseId),
          ),
        ),
      )
      .limit(1)
      .get() !== undefined
  );
}

/** Sum of allocations from active payments, per purchase. */
export function activeAllocatedByPurchase(
  db: Executor,
  purchaseIds: string[],
): Map<string, number> {
  if (purchaseIds.length === 0) return new Map();
  const rows = db
    .select({
      purchaseId: supplierAllocations.purchaseId,
      total: sql<number>`sum(${supplierAllocations.amount})`,
    })
    .from(supplierAllocations)
    .innerJoin(supplierPayments, eq(supplierPayments.id, supplierAllocations.paymentId))
    .where(
      and(
        eq(supplierPayments.status, 'active'),
        inArray(supplierAllocations.purchaseId, purchaseIds),
      ),
    )
    .groupBy(supplierAllocations.purchaseId)
    .all();
  return new Map(rows.map((r) => [r.purchaseId, r.total]));
}
