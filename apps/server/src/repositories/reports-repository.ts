import { sql } from 'drizzle-orm';
import type { Executor } from '../db/client';

// Read-only queries for Laporan. Bounds are UTC ISO strings: `from` inclusive, `to` exclusive.
// Grouping by local day happens in the service (the PC's time zone).

export interface Range {
  from: string;
  to: string;
}

const categoryFilter = (categoryId: string | undefined, column = 'p.category_id') =>
  categoryId ? sql`and ${sql.raw(column)} = ${categoryId}` : sql``;

/** Completed and voided sales completed in the range, with item sums. */
export function salesInRange(db: Executor, { from, to }: Range) {
  return db.all<{
    id: string;
    status: 'completed' | 'voided';
    completed_at: string;
    total: number;
    rounding_amount: number;
    debt_amount: number;
    items_subtotal: number;
    cost: number;
  }>(sql`
    select s.id, s.status, s.completed_at, s.total, s.rounding_amount, s.debt_amount,
      coalesce((select sum(i.subtotal) from sale_items i where i.sale_id = s.id), 0) as items_subtotal,
      coalesce((select sum(i.cost_total) from sale_items i where i.sale_id = s.id), 0) as cost
    from sales s
    where s.status in ('completed', 'voided') and s.completed_at >= ${from} and s.completed_at < ${to}
    order by s.completed_at`);
}

/**
 * Item sums of valid (completed) sales in the range, per category at sale time (the sale line
 * snapshot). A renamed category shows the name of its latest sale in the range.
 */
export function salesByCategory(db: Executor, range: Range, categoryId?: string) {
  return db.all<{
    category_id: string;
    category_name: string;
    revenue: number;
    cost: number;
  }>(sql`
    select i.category_id, i.category_name, sum(i.subtotal) as revenue, sum(i.cost_total) as cost,
      max(s.completed_at) as last_sold
    from sale_items i
    join sales s on s.id = i.sale_id
    where s.status = 'completed' and s.completed_at >= ${range.from} and s.completed_at < ${range.to}
      ${categoryFilter(categoryId, 'i.category_id')}
    group by i.category_id
    order by revenue desc, i.category_name`);
}

export interface ProductSalesRaw {
  product_id: string;
  product_code: string;
  product_name: string;
  category_name: string;
  base_unit: string;
  active: number;
  stock: number;
  qty_base: number;
  revenue: number;
  cost: number;
}

/**
 * Sold products in the range, per product and category at sale time (a product moved to
 * another category during the range has one row per category). The filter uses the snapshot.
 */
export function soldProducts(db: Executor, range: Range, categoryId?: string): ProductSalesRaw[] {
  return db.all<ProductSalesRaw>(sql`
    select p.id as product_id, p.code as product_code, p.name as product_name,
      i.category_name, p.base_unit, p.active, p.stock,
      sum(i.qty_base) as qty_base, sum(i.subtotal) as revenue, sum(i.cost_total) as cost,
      max(s.completed_at) as last_sold
    from sale_items i
    join sales s on s.id = i.sale_id
    join products p on p.id = i.product_id
    where s.status = 'completed' and s.completed_at >= ${range.from} and s.completed_at < ${range.to}
      ${categoryFilter(categoryId, 'i.category_id')}
    group by i.product_id, i.category_id`);
}

/**
 * Active products in their current category with everything they sold in the range
 * (slow movers: the catalog as it is now).
 */
export function activeProductSales(
  db: Executor,
  range: Range,
  categoryId?: string,
): ProductSalesRaw[] {
  return db.all<ProductSalesRaw>(sql`
    with sold as (
      select i.product_id, sum(i.qty_base) as qty_base, sum(i.subtotal) as revenue,
        sum(i.cost_total) as cost
      from sale_items i
      join sales s on s.id = i.sale_id
      where s.status = 'completed' and s.completed_at >= ${range.from} and s.completed_at < ${range.to}
      group by i.product_id
    )
    select p.id as product_id, p.code as product_code, p.name as product_name,
      c.name as category_name, p.base_unit, p.active, p.stock,
      coalesce(sold.qty_base, 0) as qty_base, coalesce(sold.revenue, 0) as revenue,
      coalesce(sold.cost, 0) as cost
    from products p
    join categories c on c.id = p.category_id
    left join sold on sold.product_id = p.id
    where p.active = 1 ${categoryFilter(categoryId)}`);
}

/** Products with non-zero stock. */
export function stockedProducts(db: Executor, categoryId?: string) {
  return db.all<{
    product_id: string;
    product_code: string;
    product_name: string;
    category_name: string;
    base_unit: string;
    active: number;
    stock: number;
    cost_price: number;
    pricing_factor: number;
  }>(sql`
    select p.id as product_id, p.code as product_code, p.name as product_name,
      c.name as category_name, p.base_unit, p.active, p.stock, p.cost_price, p.pricing_factor
    from products p
    join categories c on c.id = p.category_id
    where p.stock != 0 ${categoryFilter(categoryId)}`);
}

/** Sales with money moving in the range: completed in it (money in) or voided in it (refund). */
export function salesMoney(db: Executor, { from, to }: Range) {
  return db.all<{
    status: 'completed' | 'voided';
    completed_at: string;
    voided_at: string | null;
    cash: number;
    qris: number;
    transfer: number;
    change_amount: number;
  }>(sql`
    select s.status, s.completed_at, s.voided_at, s.change_amount,
      coalesce((select sum(p.amount) from sale_payments p where p.sale_id = s.id and p.method = 'cash'), 0) as cash,
      coalesce((select sum(p.amount) from sale_payments p where p.sale_id = s.id and p.method = 'qris'), 0) as qris,
      coalesce((select sum(p.amount) from sale_payments p where p.sale_id = s.id and p.method = 'transfer'), 0) as transfer
    from sales s
    where s.status in ('completed', 'voided')
      and ((s.completed_at >= ${from} and s.completed_at < ${to})
        or (s.voided_at >= ${from} and s.voided_at < ${to}))`);
}

/** Customer or supplier payments made or voided in the range. */
export function paymentsMoney(db: Executor, table: 'customer' | 'supplier', { from, to }: Range) {
  const name = sql.raw(table === 'customer' ? 'customer_payments' : 'supplier_payments');
  return db.all<{
    method: 'cash' | 'qris' | 'transfer';
    amount: number;
    status: 'active' | 'voided';
    created_at: string;
    voided_at: string | null;
  }>(sql`
    select method, amount, status, created_at, voided_at
    from ${name}
    where (created_at >= ${from} and created_at < ${to})
      or (voided_at >= ${from} and voided_at < ${to})`);
}

/** Customers with open kasbon, largest balance first. */
export function openReceivablesByCustomer(db: Executor) {
  return db.all<{
    id: string;
    name: string;
    balance: number;
    open_count: number;
    oldest_at: string;
  }>(sql`
    select c.id, c.name, sum(r.remaining) as balance, count(*) as open_count,
      min(r.created_at) as oldest_at
    from receivables r
    join customers c on c.id = r.customer_id
    where r.status = 'open'
    group by c.id
    order by balance desc, c.name`);
}

/** Suppliers with open debt, largest balance first. */
export function openPayablesBySupplier(db: Executor) {
  return db.all<{
    id: string;
    name: string;
    balance: number;
    open_count: number;
    oldest_at: string;
  }>(sql`
    select s.id, s.name, sum(p.remaining) as balance, count(*) as open_count,
      min(p.created_at) as oldest_at
    from purchases p
    join suppliers s on s.id = p.supplier_id
    where p.status = 'completed' and p.remaining > 0
    group by s.id
    order by balance desc, s.name`);
}

/** Adjustments that removed stock in the range, newest first. */
export function lossesInRange(db: Executor, range: Range, categoryId?: string) {
  return db.all<{
    id: string;
    created_at: string;
    product_code: string;
    product_name: string;
    category_name: string;
    base_unit: string;
    pricing_factor: number;
    qty_change: number;
    reason: 'rusak' | 'kedaluwarsa' | 'hilang' | 'opname' | 'lainnya';
    note: string | null;
    cost_price: number;
    user_name: string;
  }>(sql`
    select a.id, a.created_at, p.code as product_code, p.name as product_name,
      c.name as category_name, p.base_unit, p.pricing_factor, a.qty_change, a.reason, a.note,
      a.cost_price, u.name as user_name
    from stock_adjustments a
    join products p on p.id = a.product_id
    join categories c on c.id = p.category_id
    join users u on u.id = a.user_id
    where a.qty_change < 0 and a.created_at >= ${range.from} and a.created_at < ${range.to}
      ${categoryFilter(categoryId)}
    order by a.created_at desc, a.rowid desc`);
}

export interface AuditRaw {
  id: string;
  created_at: string;
  user_name: string | null;
  approved_by_name: string | null;
  entity: string;
  entity_id: string;
  action: string;
  old_value: string | null;
  new_value: string | null;
}

/** Audit rows in the range, newest first. */
export function auditInRange(
  db: Executor,
  { from, to }: Range,
  page: { limit: number; offset: number },
): { rows: AuditRaw[]; total: number } {
  const where = sql`where a.created_at >= ${from} and a.created_at < ${to}`;
  const rows = db.all<AuditRaw>(sql`
    select a.id, a.created_at, u.name as user_name, o.name as approved_by_name, a.entity,
      a.entity_id, a.action, a.old_value, a.new_value
    from audit_logs a
    left join users u on u.id = a.user_id
    left join users o on o.id = a.approved_by
    ${where}
    order by a.created_at desc, a.rowid desc
    limit ${page.limit} offset ${page.offset}`);
  const total = db.get<{ n: number }>(sql`select count(*) as n from audit_logs a ${where}`)?.n ?? 0;
  return { rows, total };
}

/** Display names of audited records by id: document numbers, product, people, categories. */
export function entityNames(db: Executor, ids: string[]): Map<string, string> {
  if (ids.length === 0) return new Map();
  const list = sql.join(
    ids.map((id) => sql`${id}`),
    sql`, `,
  );
  const rows = db.all<{ id: string; name: string }>(sql`
    select id, number as name from sales where id in (${list}) and number is not null
    union all select id, number from customer_payments where id in (${list})
    union all select id, number from purchases where id in (${list})
    union all select id, number from supplier_payments where id in (${list})
    union all select id, code || ' ' || name from products where id in (${list})
    union all select u.id, p.name || ' (' || u.name || ')' from product_units u
      join products p on p.id = u.product_id where u.id in (${list})
    union all select id, name from customers where id in (${list})
    union all select id, name from suppliers where id in (${list})
    union all select id, name from users where id in (${list})
    union all select id, name from categories where id in (${list})`);
  return new Map(rows.map((r) => [r.id, r.name]));
}
