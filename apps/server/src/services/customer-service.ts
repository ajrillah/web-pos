import {
  type CreateCustomerInput,
  type Customer,
  type CustomerLedgerResponse,
  type CustomersQueryInput,
  type CustomersResponse,
  formatRupiah,
  type LedgerEntry,
  type Receivable,
  type ReceivablesQuery,
  type ReceivablesResponse,
  receivablesQuerySchema,
  type UpdateCustomerInput,
} from '@toko-podomoro/shared';
import { appErrors } from '../errors';
import { insertAudit } from '../repositories/audit-repository';
import { listPaymentsOfCustomer } from '../repositories/customer-payments-repository';
import {
  type CustomerPatch,
  type CustomerRow,
  type CustomerWithBalance,
  findCustomerById,
  insertCustomer,
  searchCustomers as searchCustomerRows,
  updateCustomer,
} from '../repositories/customers-repository';
import {
  listReceivables as listReceivableRows,
  type ReceivableWithRefs,
} from '../repositories/receivables-repository';
import type { Actor, ServiceContext } from './context';

// Rules: docs/design.md 6.7. Customers are master data: every change is audit-logged.

function toCustomer(row: CustomerWithBalance): Customer {
  return {
    id: row.id,
    name: row.name,
    phone: row.phone,
    note: row.note,
    active: row.active,
    balance: row.balance,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export function toReceivable(row: ReceivableWithRefs): Receivable {
  return {
    id: row.id,
    customerId: row.customerId,
    customerName: row.customerName,
    saleId: row.saleId,
    saleNumber: row.saleNumber,
    amount: row.amount,
    remaining: row.remaining,
    status: row.status,
    createdAt: row.createdAt,
  };
}

const snapshot = (row: CustomerRow) => ({
  name: row.name,
  phone: row.phone,
  note: row.note,
  active: row.active,
});

function loadCustomer(ctx: ServiceContext, id: string): CustomerWithBalance {
  const row = findCustomerById(ctx.db, id);
  if (!row) {
    throw appErrors.customerNotFound();
  }
  return row;
}

export function searchCustomers(
  ctx: ServiceContext,
  { q, status, withBalance, page, limit }: CustomersQueryInput,
): CustomersResponse {
  const { rows, total } = searchCustomerRows(ctx.db, {
    words: q ? q.split(/\s+/).filter(Boolean) : [],
    active: status === 'all' ? undefined : status === 'active',
    withBalance,
    limit,
    offset: (page - 1) * limit,
  });
  return { customers: rows.map(toCustomer), total, page, limit };
}

export function getCustomer(ctx: ServiceContext, id: string): Customer {
  return toCustomer(loadCustomer(ctx, id));
}

/** Open to cashiers (quick-add from the kasbon dialog). */
export function createCustomer(
  ctx: ServiceContext,
  actor: Actor,
  input: CreateCustomerInput,
): Customer {
  return ctx.db.transaction((tx) => {
    const row = insertCustomer(tx, {
      name: input.name.toUpperCase(),
      phone: input.phone ?? null,
      note: input.note ? input.note.toUpperCase() : null,
    });
    insertAudit(tx, {
      userId: actor.id,
      entity: 'customer',
      entityId: row.id,
      action: 'create',
      newValue: snapshot(row),
    });
    return toCustomer({ ...row, balance: 0 });
  });
}

/** A customer with remaining kasbon cannot be deactivated. */
export function updateCustomerById(
  ctx: ServiceContext,
  actor: Actor,
  id: string,
  input: UpdateCustomerInput,
): Customer {
  return ctx.db.transaction((tx) => {
    const row = findCustomerById(tx, id);
    if (!row) {
      throw appErrors.customerNotFound();
    }
    if (input.active === false && row.active && row.balance > 0) {
      throw appErrors.customerHasBalance(formatRupiah(row.balance));
    }
    const patch: CustomerPatch = {};
    if (input.name !== undefined) patch.name = input.name.toUpperCase();
    if (input.phone !== undefined) patch.phone = input.phone;
    if (input.note !== undefined) patch.note = input.note ? input.note.toUpperCase() : null;
    if (input.active !== undefined) patch.active = input.active;
    const updated = updateCustomer(tx, row.id, patch);
    insertAudit(tx, {
      userId: actor.id,
      entity: 'customer',
      entityId: row.id,
      action:
        input.active === undefined || input.active === row.active
          ? 'update'
          : input.active
            ? 'activate'
            : 'deactivate',
      oldValue: snapshot(row),
      newValue: snapshot(updated),
    });
    return toCustomer({ ...updated, balance: row.balance });
  });
}

export function listReceivables(ctx: ServiceContext, query: ReceivablesQuery): ReceivablesResponse {
  const { customerId, status } = receivablesQuerySchema.parse(query);
  const rows = listReceivableRows(ctx.db, { customerId, openOnly: status === 'open' });
  return {
    receivables: rows.map(toReceivable),
    totalRemaining: rows.reduce((sum, r) => sum + (r.status === 'open' ? r.remaining : 0), 0),
  };
}

/**
 * Kartu Piutang: kasbon (+) and payments (-) in date order with a running balance.
 * Voided entries are listed but do not change the balance.
 */
export function customerLedger(ctx: ServiceContext, id: string): CustomerLedgerResponse {
  const customer = loadCustomer(ctx, id);
  const receivables = listReceivableRows(ctx.db, { customerId: id });
  const payments = listPaymentsOfCustomer(ctx.db, id);
  const raw: Omit<LedgerEntry, 'balance'>[] = [
    ...receivables.map((r) => ({
      kind: 'kasbon' as const,
      refId: r.saleId,
      number: r.saleNumber,
      date: r.createdAt,
      change: r.amount,
      voided: r.status === 'void',
    })),
    ...payments.map((p) => ({
      kind: 'payment' as const,
      refId: p.id,
      number: p.number,
      date: p.createdAt,
      change: -p.amount,
      voided: p.status === 'voided',
    })),
  ].sort((a, b) => a.date.localeCompare(b.date) || a.number.localeCompare(b.number));
  let balance = 0;
  const entries = raw.map((entry) => {
    if (!entry.voided) balance += entry.change;
    return { ...entry, balance };
  });
  return {
    customer: toCustomer(customer),
    entries,
    receivables: receivables.map(toReceivable),
  };
}
