import {
  type CreateSupplierInput,
  formatRupiah,
  type PayablesQuery,
  type PayablesResponse,
  payablesQuerySchema,
  type Supplier,
  type SupplierLedgerEntry,
  type SupplierLedgerResponse,
  type SuppliersQueryInput,
  type SuppliersResponse,
  type UpdateSupplierInput,
} from '@toko-podomoro/shared';
import { appErrors } from '../errors';
import { insertAudit } from '../repositories/audit-repository';
import {
  listPayables as listPayableRows,
  listPurchasesOfSupplier,
} from '../repositories/purchases-repository';
import { listPaymentsOfSupplier } from '../repositories/supplier-payments-repository';
import {
  findSupplierById,
  insertSupplier,
  type SupplierPatch,
  type SupplierRow,
  type SupplierWithBalance,
  searchSuppliers as searchSupplierRows,
  updateSupplier,
} from '../repositories/suppliers-repository';
import type { Actor, ServiceContext } from './context';
import { toPurchaseSummary } from './purchase-service';

// Rules: docs/design.md 6.6. Suppliers are master data: every change is audit-logged.

function toSupplier(row: SupplierWithBalance): Supplier {
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

const snapshot = (row: SupplierRow) => ({
  name: row.name,
  phone: row.phone,
  note: row.note,
  active: row.active,
});

function loadSupplier(ctx: ServiceContext, id: string): SupplierWithBalance {
  const row = findSupplierById(ctx.db, id);
  if (!row) {
    throw appErrors.supplierNotFound();
  }
  return row;
}

export function searchSuppliers(
  ctx: ServiceContext,
  { q, status, withBalance, page, limit }: SuppliersQueryInput,
): SuppliersResponse {
  const { rows, total } = searchSupplierRows(ctx.db, {
    words: q ? q.split(/\s+/).filter(Boolean) : [],
    active: status === 'all' ? undefined : status === 'active',
    withBalance,
    limit,
    offset: (page - 1) * limit,
  });
  return { suppliers: rows.map(toSupplier), total, page, limit };
}

export function getSupplier(ctx: ServiceContext, id: string): Supplier {
  return toSupplier(loadSupplier(ctx, id));
}

export function createSupplier(
  ctx: ServiceContext,
  actor: Actor,
  input: CreateSupplierInput,
): Supplier {
  return ctx.db.transaction((tx) => {
    const row = insertSupplier(tx, {
      name: input.name.toUpperCase(),
      phone: input.phone ?? null,
      note: input.note ? input.note.toUpperCase() : null,
    });
    insertAudit(tx, {
      userId: actor.id,
      entity: 'supplier',
      entityId: row.id,
      action: 'create',
      newValue: snapshot(row),
    });
    return toSupplier({ ...row, balance: 0 });
  });
}

/** A supplier with remaining debt cannot be deactivated. */
export function updateSupplierById(
  ctx: ServiceContext,
  actor: Actor,
  id: string,
  input: UpdateSupplierInput,
): Supplier {
  return ctx.db.transaction((tx) => {
    const row = findSupplierById(tx, id);
    if (!row) {
      throw appErrors.supplierNotFound();
    }
    if (input.active === false && row.active && row.balance > 0) {
      throw appErrors.supplierHasDebt(formatRupiah(row.balance));
    }
    const patch: SupplierPatch = {};
    if (input.name !== undefined) patch.name = input.name.toUpperCase();
    if (input.phone !== undefined) patch.phone = input.phone;
    if (input.note !== undefined) patch.note = input.note ? input.note.toUpperCase() : null;
    if (input.active !== undefined) patch.active = input.active;
    const updated = updateSupplier(tx, row.id, patch);
    insertAudit(tx, {
      userId: actor.id,
      entity: 'supplier',
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
    return toSupplier({ ...updated, balance: row.balance });
  });
}

/** Daftar Hutang: completed purchases with remaining debt, oldest first. */
export function listPayables(ctx: ServiceContext, query: PayablesQuery): PayablesResponse {
  const { supplierId } = payablesQuerySchema.parse(query);
  const rows = listPayableRows(ctx.db, { supplierId });
  return {
    purchases: rows.map(toPurchaseSummary),
    totalRemaining: rows.reduce((sum, r) => sum + r.remaining, 0),
  };
}

const kindOrder = { purchase: 0, payment: 1 } as const;

/**
 * Kartu Hutang: purchases (+) and payments (-) in date order with a running balance. A purchase
 * comes before its initial payment. Voided entries are listed but do not change the balance.
 */
export function supplierLedger(ctx: ServiceContext, id: string): SupplierLedgerResponse {
  const supplier = loadSupplier(ctx, id);
  const raw: Omit<SupplierLedgerEntry, 'balance'>[] = [
    ...listPurchasesOfSupplier(ctx.db, id).map((p) => ({
      kind: 'purchase' as const,
      refId: p.id,
      number: p.number,
      date: p.createdAt,
      change: p.total,
      voided: p.status === 'voided',
    })),
    ...listPaymentsOfSupplier(ctx.db, id).map((p) => ({
      kind: 'payment' as const,
      refId: p.id,
      number: p.number,
      date: p.createdAt,
      change: -p.amount,
      voided: p.status === 'voided',
    })),
  ].sort(
    (a, b) =>
      a.date.localeCompare(b.date) ||
      kindOrder[a.kind] - kindOrder[b.kind] ||
      a.number.localeCompare(b.number),
  );
  let balance = 0;
  const entries = raw.map((entry) => {
    if (!entry.voided) balance += entry.change;
    return { ...entry, balance };
  });
  return { supplier: toSupplier(supplier), entries };
}
