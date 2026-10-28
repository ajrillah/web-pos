import { sql } from 'drizzle-orm';
import {
  type AnySQLiteColumn,
  index,
  integer,
  sqliteTable,
  text,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core';
import { createdAt, id, updatedAt } from './columns';

export const settings = sqliteTable('settings', {
  id: id(),
  key: text('key').notNull().unique(),
  value: text('value').notNull(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const users = sqliteTable('users', {
  id: id(),
  username: text('username').notNull().unique(),
  name: text('name').notNull(),
  role: text('role', { enum: ['owner', 'cashier'] }).notNull(),
  pinHash: text('pin_hash').notNull(),
  // Owners only; null until the owner has set their own PIN.
  recoveryCodeHash: text('recovery_code_hash'),
  mustChangePin: integer('must_change_pin', { mode: 'boolean' }).notNull().default(false),
  active: integer('active', { mode: 'boolean' }).notNull().default(true),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const sessions = sqliteTable(
  'sessions',
  {
    id: id(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id),
    tokenHash: text('token_hash').notNull().unique(),
    expiresAt: text('expires_at').notNull(),
    lastSeenAt: text('last_seen_at').notNull(),
    // Set while the screen is locked (Ctrl+L or idle); only the same user can unlock.
    lockedAt: text('locked_at'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index('sessions_user_id_idx').on(t.userId)],
);

export const auditLogs = sqliteTable(
  'audit_logs',
  {
    id: id(),
    userId: text('user_id').references(() => users.id),
    approvedBy: text('approved_by').references(() => users.id),
    entity: text('entity').notNull(),
    entityId: text('entity_id').notNull(),
    action: text('action').notNull(),
    // JSON text; never contains PIN, recovery code, or token hashes.
    oldValue: text('old_value'),
    newValue: text('new_value'),
    createdAt: createdAt(),
  },
  (t) => [
    index('audit_logs_entity_idx').on(t.entity, t.entityId),
    index('audit_logs_created_at_idx').on(t.createdAt),
  ],
);

export const categories = sqliteTable(
  'categories',
  {
    id: id(),
    name: text('name').notNull(),
    // Seeded defaults (Rokok, Sembako, Lain-lain); they cannot be deactivated.
    isDefault: integer('is_default', { mode: 'boolean' }).notNull().default(false),
    active: integer('active', { mode: 'boolean' }).notNull().default(true),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex('categories_name_unique').on(sql`${t.name} COLLATE NOCASE`)],
);

export const products = sqliteTable(
  'products',
  {
    id: id(),
    // Unique across all products, including inactive ones, ignoring case.
    code: text('code').notNull(),
    name: text('name').notNull(),
    categoryId: text('category_id')
      .notNull()
      .references(() => categories.id),
    type: text('type', { enum: ['unit', 'bulk'] }).notNull(),
    // Stock unit: pcs, gram, ml, ...
    baseUnit: text('base_unit').notNull(),
    // 1000 for bulk (prices per kg / liter), 1 otherwise.
    pricingFactor: integer('pricing_factor').notNull(),
    // Cost for `pricing_factor` base units.
    costPrice: integer('cost_price').notNull(),
    // Cache of SUM(stock_movements.qty_change); updated in the same transaction.
    stock: integer('stock').notNull().default(0),
    // MS3: flagged when a purchase records a cost_price above the product's current cost.
    priceAlert: integer('price_alert', { mode: 'boolean' }).notNull().default(false),
    active: integer('active', { mode: 'boolean' }).notNull().default(true),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex('products_code_unique').on(sql`${t.code} COLLATE NOCASE`),
    index('products_name_idx').on(t.name),
    index('products_category_id_idx').on(t.categoryId),
  ],
);

// A product's units form a pyramid: one chain of levels for products edited since MS1, or
// independent flat rows for older ones and bulk products (docs/design.md 4.1.1).
export const productUnits = sqliteTable(
  'product_units',
  {
    id: id(),
    productId: text('product_id')
      .notNull()
      .references(() => products.id),
    name: text('name').notNull(),
    // Unit one level up; null for level 1 and for flat rows.
    parentUnitId: text('parent_unit_id').references((): AnySQLiteColumn => productUnits.id),
    // 1 = largest. The deepest level is the stock unit; it also orders a flat product's rows.
    level: integer('level').notNull().default(1),
    // Units of this kind in one of the parent; a flat row: base units in one of this unit.
    // `factor` (base units in one) and the primary unit are computed from the chain, not stored.
    isi: integer('isi').notNull().default(1),
    // Cost for one of this unit; below level 1 it is ceil(parent cost / isi).
    costPrice: integer('cost_price').notNull().default(0),
    // Price for one of this unit.
    sellPrice: integer('sell_price').notNull(),
    active: integer('active', { mode: 'boolean' }).notNull().default(true),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index('product_units_product_id_idx').on(t.productId),
    index('product_units_parent_unit_id_idx').on(t.parentUnitId),
  ],
);

export const stockAdjustments = sqliteTable(
  'stock_adjustments',
  {
    id: id(),
    productId: text('product_id')
      .notNull()
      .references(() => products.id),
    qtyChange: integer('qty_change').notNull(),
    reason: text('reason', {
      enum: ['rusak', 'kedaluwarsa', 'hilang', 'opname', 'lainnya'],
    }).notNull(),
    note: text('note'),
    // Product cost_price (per pricing_factor base units) at the time of the adjustment.
    costPrice: integer('cost_price').notNull(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id),
    createdAt: createdAt(),
  },
  (t) => [
    index('stock_adjustments_product_id_idx').on(t.productId),
    index('stock_adjustments_created_at_idx').on(t.createdAt),
  ],
);

export const stockMovements = sqliteTable(
  'stock_movements',
  {
    id: id(),
    productId: text('product_id')
      .notNull()
      .references(() => products.id),
    qtyChange: integer('qty_change').notNull(),
    type: text('type', {
      enum: ['sale', 'void', 'purchase', 'purchase_void', 'adjustment'],
    }).notNull(),
    // Source row: sale, purchase, or stock adjustment id.
    refId: text('ref_id').notNull(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id),
    createdAt: createdAt(),
  },
  (t) => [
    index('stock_movements_product_id_idx').on(t.productId, t.createdAt),
    index('stock_movements_ref_id_idx').on(t.refId),
  ],
);

export const customers = sqliteTable(
  'customers',
  {
    id: id(),
    name: text('name').notNull(),
    phone: text('phone'),
    note: text('note'),
    active: integer('active', { mode: 'boolean' }).notNull().default(true),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index('customers_name_idx').on(t.name)],
);

export const sales = sqliteTable(
  'sales',
  {
    // Client-generated UUID for completed sales (idempotency) and held sales.
    id: text('id').primaryKey(),
    // TRX-YYYYMMDD-NNNN (local date); null while held.
    number: text('number').unique(),
    cashierId: text('cashier_id')
      .notNull()
      .references(() => users.id),
    status: text('status', { enum: ['held', 'completed', 'voided'] }).notNull(),
    // After rounding: sum(sale_items.subtotal) + rounding_amount.
    total: integer('total').notNull(),
    roundingAmount: integer('rounding_amount').notNull(),
    // Cash received + QRIS.
    paidTotal: integer('paid_total').notNull().default(0),
    changeAmount: integer('change_amount').notNull().default(0),
    debtAmount: integer('debt_amount').notNull().default(0),
    // Kasbon customer (required when debt_amount > 0).
    customerId: text('customer_id').references(() => customers.id),
    // Customer's remaining kasbon right after the sale; printed on the receipt.
    customerBalanceAfter: integer('customer_balance_after'),
    completedAt: text('completed_at'),
    voidedAt: text('voided_at'),
    voidedBy: text('voided_by').references(() => users.id),
    voidReason: text('void_reason'),
    // Receipts generated so far; every one after the first is marked "SALINAN".
    receiptCount: integer('receipt_count').notNull().default(0),
    // Last receipt saved to the receipt folder (for "Buka").
    receiptFile: text('receipt_file'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index('sales_status_created_at_idx').on(t.status, t.createdAt),
    index('sales_completed_at_idx').on(t.completedAt),
  ],
);

export const saleItems = sqliteTable(
  'sale_items',
  {
    id: id(),
    saleId: text('sale_id')
      .notNull()
      .references(() => sales.id),
    lineNo: integer('line_no').notNull(),
    productId: text('product_id')
      .notNull()
      .references(() => products.id),
    unitId: text('unit_id')
      .notNull()
      .references(() => productUnits.id),
    // Snapshot at sale time; history never reads current product data.
    productCode: text('product_code').notNull(),
    productName: text('product_name').notNull(),
    // Category at sale time (reports group by it); no foreign key, like the other snapshots.
    categoryId: text('category_id').notNull(),
    categoryName: text('category_name').notNull(),
    unitName: text('unit_name').notNull(),
    qtyBase: integer('qty_base').notNull(),
    unitFactor: integer('unit_factor').notNull(),
    unitPrice: integer('unit_price').notNull(),
    costPrice: integer('cost_price').notNull(),
    pricingFactor: integer('pricing_factor').notNull(),
    subtotal: integer('subtotal').notNull(),
    costTotal: integer('cost_total').notNull(),
    // MS2: optional per-line note; displayed on receipt in parentheses after product name.
    note: text('note'),
    createdAt: createdAt(),
  },
  (t) => [
    index('sale_items_sale_id_idx').on(t.saleId),
    index('sale_items_product_id_idx').on(t.productId),
    index('sale_items_category_id_idx').on(t.categoryId),
  ],
);

export const salePayments = sqliteTable(
  'sale_payments',
  {
    id: id(),
    saleId: text('sale_id')
      .notNull()
      .references(() => sales.id),
    method: text('method', { enum: ['cash', 'qris', 'transfer'] }).notNull(),
    // Cash: amount received (change is in sales.change_amount). QRIS/transfer: amount paid.
    amount: integer('amount').notNull(),
    createdAt: createdAt(),
  },
  (t) => [index('sale_payments_sale_id_idx').on(t.saleId)],
);

export const receivables = sqliteTable(
  'receivables',
  {
    id: id(),
    customerId: text('customer_id')
      .notNull()
      .references(() => customers.id),
    // One receivable per sale.
    saleId: text('sale_id')
      .notNull()
      .unique()
      .references(() => sales.id),
    amount: integer('amount').notNull(),
    // amount - sum(active allocations); kept in the same transaction as allocations.
    remaining: integer('remaining').notNull(),
    status: text('status', { enum: ['open', 'paid', 'void'] }).notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index('receivables_customer_status_idx').on(t.customerId, t.status, t.createdAt)],
);

export const customerPayments = sqliteTable(
  'customer_payments',
  {
    // Client-generated UUID (idempotency).
    id: text('id').primaryKey(),
    // BYR-YYYYMMDD-NNNN (local date).
    number: text('number').notNull().unique(),
    customerId: text('customer_id')
      .notNull()
      .references(() => customers.id),
    method: text('method', { enum: ['cash', 'qris', 'transfer'] }).notNull(),
    // Applied to receivables (sum of allocations).
    amount: integer('amount').notNull(),
    amountReceived: integer('amount_received').notNull(),
    changeAmount: integer('change_amount').notNull(),
    // Customer's remaining kasbon right after the payment; printed on the receipt.
    balanceAfter: integer('balance_after').notNull(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id),
    status: text('status', { enum: ['active', 'voided'] }).notNull(),
    voidedAt: text('voided_at'),
    voidedBy: text('voided_by').references(() => users.id),
    voidReason: text('void_reason'),
    receiptCount: integer('receipt_count').notNull().default(0),
    receiptFile: text('receipt_file'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index('customer_payments_customer_idx').on(t.customerId, t.createdAt)],
);

export const paymentAllocations = sqliteTable(
  'payment_allocations',
  {
    id: id(),
    paymentId: text('payment_id')
      .notNull()
      .references(() => customerPayments.id),
    receivableId: text('receivable_id')
      .notNull()
      .references(() => receivables.id),
    amount: integer('amount').notNull(),
    // Receivable's remaining right after this allocation; printed on the payment receipt.
    remainingAfter: integer('remaining_after').notNull().default(0),
    createdAt: createdAt(),
  },
  (t) => [
    index('payment_allocations_payment_idx').on(t.paymentId),
    index('payment_allocations_receivable_idx').on(t.receivableId),
  ],
);

export const suppliers = sqliteTable(
  'suppliers',
  {
    id: id(),
    name: text('name').notNull(),
    phone: text('phone'),
    note: text('note'),
    active: integer('active', { mode: 'boolean' }).notNull().default(true),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index('suppliers_name_idx').on(t.name)],
);

export const purchases = sqliteTable(
  'purchases',
  {
    // Client-generated UUID (idempotency).
    id: text('id').primaryKey(),
    // BLI-YYYYMMDD-NNNN (local date of recording).
    number: text('number').notNull().unique(),
    supplierId: text('supplier_id')
      .notNull()
      .references(() => suppliers.id),
    // Purchase (invoice) date: local day YYYY-MM-DD.
    date: text('date').notNull(),
    // Sum of purchase_items.subtotal; no rounding.
    total: integer('total').notNull(),
    // total - remaining: sum of allocations from active payments.
    paidAmount: integer('paid_amount').notNull(),
    // Debt left on this purchase; kept in the same transaction as allocations.
    remaining: integer('remaining').notNull(),
    status: text('status', { enum: ['completed', 'voided'] }).notNull(),
    voidedAt: text('voided_at'),
    voidedBy: text('voided_by').references(() => users.id),
    voidReason: text('void_reason'),
    userId: text('user_id')
      .notNull()
      .references(() => users.id),
    note: text('note'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index('purchases_supplier_idx').on(t.supplierId, t.status, t.createdAt),
    index('purchases_created_at_idx').on(t.createdAt),
  ],
);

export const purchaseItems = sqliteTable(
  'purchase_items',
  {
    id: id(),
    purchaseId: text('purchase_id')
      .notNull()
      .references(() => purchases.id),
    lineNo: integer('line_no').notNull(),
    productId: text('product_id')
      .notNull()
      .references(() => products.id),
    unitId: text('unit_id')
      .notNull()
      .references(() => productUnits.id),
    // Snapshot at purchase time.
    productCode: text('product_code').notNull(),
    productName: text('product_name').notNull(),
    unitName: text('unit_name').notNull(),
    qtyBase: integer('qty_base').notNull(),
    unitFactor: integer('unit_factor').notNull(),
    // Buy price for `unit_factor` base units.
    buyPrice: integer('buy_price').notNull(),
    // round(qty_base * buy_price / unit_factor).
    subtotal: integer('subtotal').notNull(),
    pricingFactor: integer('pricing_factor').notNull(),
    // Product cost_price before and after this purchase (per pricing_factor base units).
    oldCostPrice: integer('old_cost_price').notNull(),
    newCostPrice: integer('new_cost_price').notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    index('purchase_items_purchase_id_idx').on(t.purchaseId),
    index('purchase_items_product_id_idx').on(t.productId),
  ],
);

export const supplierPayments = sqliteTable(
  'supplier_payments',
  {
    // Client-generated UUID (idempotency); the purchase's initial payment gets a server UUID.
    id: text('id').primaryKey(),
    // BYH-YYYYMMDD-NNNN (local date).
    number: text('number').notNull().unique(),
    supplierId: text('supplier_id')
      .notNull()
      .references(() => suppliers.id),
    method: text('method', { enum: ['cash', 'qris', 'transfer'] }).notNull(),
    // Sum of allocations.
    amount: integer('amount').notNull(),
    // Set when this is the initial payment recorded with a purchase.
    initialPurchaseId: text('initial_purchase_id').references(() => purchases.id),
    userId: text('user_id')
      .notNull()
      .references(() => users.id),
    status: text('status', { enum: ['active', 'voided'] }).notNull(),
    voidedAt: text('voided_at'),
    voidedBy: text('voided_by').references(() => users.id),
    voidReason: text('void_reason'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index('supplier_payments_supplier_idx').on(t.supplierId, t.createdAt)],
);

export const supplierAllocations = sqliteTable(
  'supplier_allocations',
  {
    id: id(),
    paymentId: text('payment_id')
      .notNull()
      .references(() => supplierPayments.id),
    purchaseId: text('purchase_id')
      .notNull()
      .references(() => purchases.id),
    amount: integer('amount').notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    index('supplier_allocations_payment_idx').on(t.paymentId),
    index('supplier_allocations_purchase_idx').on(t.purchaseId),
  ],
);

export const stockOpnames = sqliteTable(
  'stock_opnames',
  {
    id: id(),
    // One session per category; a product is in at most one open session.
    categoryId: text('category_id')
      .notNull()
      .references(() => categories.id),
    status: text('status', { enum: ['open', 'completed', 'cancelled'] }).notNull(),
    startedAt: text('started_at').notNull(),
    // Completed or cancelled.
    closedAt: text('closed_at'),
    userId: text('user_id')
      .notNull()
      .references(() => users.id),
    closedBy: text('closed_by').references(() => users.id),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index('stock_opnames_status_idx').on(t.status, t.startedAt)],
);

export const stockOpnameItems = sqliteTable(
  'stock_opname_items',
  {
    id: id(),
    opnameId: text('opname_id')
      .notNull()
      .references(() => stockOpnames.id),
    productId: text('product_id')
      .notNull()
      .references(() => products.id),
    systemQtyAtStart: integer('system_qty_at_start').notNull(),
    // Null until counted; uncounted items are skipped on completion.
    countedQty: integer('counted_qty'),
    // The `opname` adjustment written on completion (only when delta != 0).
    adjustmentId: text('adjustment_id').references(() => stockAdjustments.id),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex('stock_opname_items_opname_product_unique').on(t.opnameId, t.productId),
    index('stock_opname_items_product_idx').on(t.productId),
  ],
);
