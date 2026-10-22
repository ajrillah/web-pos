import { sql } from 'drizzle-orm';
import { index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';
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

export const productUnits = sqliteTable(
  'product_units',
  {
    id: id(),
    productId: text('product_id')
      .notNull()
      .references(() => products.id),
    name: text('name').notNull(),
    // Base units in one of this unit.
    factor: integer('factor').notNull(),
    // Price for `factor` base units.
    sellPrice: integer('sell_price').notNull(),
    // Primary sell unit (exactly one active per product); not the stock unit.
    isBase: integer('is_base', { mode: 'boolean' }).notNull().default(false),
    active: integer('active', { mode: 'boolean' }).notNull().default(true),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index('product_units_product_id_idx').on(t.productId)],
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
