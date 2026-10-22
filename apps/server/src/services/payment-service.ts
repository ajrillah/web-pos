import {
  allocateOldestFirst,
  type CreateCustomerPaymentRequest,
  type CustomerPayment,
} from '@toko-podomoro/shared';
import type { Executor } from '../db/client';
import { appErrors } from '../errors';
import {
  findPaymentById,
  insertAllocations,
  insertPayment,
  lastPaymentNumber,
  listAllocations,
  paymentIdExists,
} from '../repositories/customer-payments-repository';
import { findCustomerById } from '../repositories/customers-repository';
import { listReceivables, updateReceivable } from '../repositories/receivables-repository';
import type { Actor, ServiceContext } from './context';
import { nextDocNumber } from './numbering';

// Rules: docs/design.md 6.7. Payments are not audit-logged; their tables are the record.

export function loadPayment(db: Executor, id: string): CustomerPayment {
  const row = findPaymentById(db, id);
  if (!row) {
    throw appErrors.paymentNotFound();
  }
  return {
    id: row.id,
    number: row.number,
    customerId: row.customerId,
    customerName: row.customerName,
    method: row.method,
    amount: row.amount,
    amountReceived: row.amountReceived,
    changeAmount: row.changeAmount,
    balanceAfter: row.balanceAfter,
    status: row.status,
    userName: row.userName,
    receiptCount: row.receiptCount,
    allocations: listAllocations(db, [id]).map((a) => ({
      receivableId: a.receivableId,
      saleNumber: a.saleNumber,
      amount: a.amount,
      remainingAfter: a.remainingAfter,
    })),
    createdAt: row.createdAt,
  };
}

export function getPayment(ctx: ServiceContext, id: string): CustomerPayment {
  return loadPayment(ctx.db, id);
}

/**
 * Records a customer payment against ticked receivables in one transaction: the payment,
 * its allocations (oldest receivable first), and each receivable's remaining and status.
 * Cash: the applied amount is min(received, ticked total) and the rest is change.
 * QRIS: the amount must not exceed the ticked total.
 */
export function createCustomerPayment(
  ctx: ServiceContext,
  actor: Actor,
  input: CreateCustomerPaymentRequest,
): CustomerPayment {
  return ctx.db.transaction((tx) => {
    if (paymentIdExists(tx, input.id)) {
      throw appErrors.duplicatePayment();
    }
    const customer = findCustomerById(tx, input.customerId);
    if (!customer) {
      throw appErrors.customerNotFound();
    }
    const ids = [...new Set(input.receivableIds)];
    const ticked = listReceivables(tx, { customerId: customer.id, openOnly: true, ids });
    if (ticked.length !== ids.length) {
      throw appErrors.invalidReceivables();
    }
    const tickedTotal = ticked.reduce((sum, r) => sum + r.remaining, 0);
    if (input.method === 'qris' && input.amount > tickedTotal) {
      throw appErrors.qrisExceedsKasbon();
    }
    const applied = Math.min(input.amount, tickedTotal);
    const allocations = allocateOldestFirst(ticked, applied);

    const now = ctx.now().toISOString();
    insertPayment(tx, {
      id: input.id,
      number: nextDocNumber('BYR', ctx.now(), (prefix) => lastPaymentNumber(tx, prefix)),
      customerId: customer.id,
      method: input.method,
      amount: applied,
      amountReceived: input.amount,
      changeAmount: input.amount - applied,
      balanceAfter: customer.balance - applied,
      userId: actor.id,
      status: 'active',
      createdAt: now,
      updatedAt: now,
    });
    const byId = new Map(ticked.map((r) => [r.id, r]));
    insertAllocations(
      tx,
      allocations.map((a) => {
        const remainingAfter = (byId.get(a.receivableId)?.remaining ?? 0) - a.amount;
        updateReceivable(tx, a.receivableId, {
          remaining: remainingAfter,
          status: remainingAfter === 0 ? 'paid' : 'open',
        });
        return {
          paymentId: input.id,
          receivableId: a.receivableId,
          amount: a.amount,
          remainingAfter,
          createdAt: now,
        };
      }),
    );
    return loadPayment(tx, input.id);
  });
}
