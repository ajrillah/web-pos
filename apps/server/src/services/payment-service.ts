import {
  allocateOldestFirst,
  type CreateCustomerPaymentRequest,
  type CustomerPayment,
} from '@toko-podomoro/shared';
import type { Executor } from '../db/client';
import { appErrors } from '../errors';
import { insertAudit } from '../repositories/audit-repository';
import {
  findPaymentById,
  insertAllocations,
  insertPayment,
  lastPaymentNumber,
  listAllocations,
  paymentIdExists,
  updatePayment,
} from '../repositories/customer-payments-repository';
import { findCustomerById } from '../repositories/customers-repository';
import { listReceivables, updateReceivable } from '../repositories/receivables-repository';
import { type Actor, isApproved, type ServiceContext } from './context';
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

/**
 * Voids a customer payment (owner approval for cashiers): each allocated receivable gets its
 * amount back and is open again. Allocations stay as history; only active payments count.
 */
export function voidCustomerPayment(
  ctx: ServiceContext,
  actor: Actor,
  id: string,
  reason: string,
): CustomerPayment {
  if (!isApproved(actor)) {
    throw appErrors.ownerApprovalRequired();
  }
  return ctx.db.transaction((tx) => {
    const payment = loadPayment(tx, id);
    if (payment.status !== 'active') {
      throw appErrors.paymentNotVoidable();
    }
    const receivables = new Map(
      listReceivables(tx, { ids: payment.allocations.map((a) => a.receivableId) }).map((r) => [
        r.id,
        r,
      ]),
    );
    for (const allocation of payment.allocations) {
      const receivable = receivables.get(allocation.receivableId);
      if (!receivable) continue;
      updateReceivable(tx, receivable.id, {
        remaining: receivable.remaining + allocation.amount,
        // A voided sale's kasbon stays voided.
        status: receivable.status === 'void' ? 'void' : 'open',
      });
    }
    const now = ctx.now().toISOString();
    updatePayment(tx, id, {
      status: 'voided',
      voidedAt: now,
      voidedBy: actor.id,
      voidReason: reason,
    });
    insertAudit(tx, {
      userId: actor.id,
      approvedBy: actor.approvedBy ?? null,
      entity: 'customer_payment',
      entityId: id,
      action: 'void',
      oldValue: { number: payment.number, amount: payment.amount, status: payment.status },
      newValue: { status: 'voided', reason },
      createdAt: now,
    });
    return loadPayment(tx, id);
  });
}
