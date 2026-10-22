import { and, asc, desc, eq, inArray, type SQL, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/sqlite-core';
import type { Executor } from '../db/client';
import { categories, products, stockOpnameItems, stockOpnames, users } from '../db/schema';

export type OpnameRow = typeof stockOpnames.$inferSelect;
export type OpnameItemRow = typeof stockOpnameItems.$inferSelect;
export type OpnameWithRefs = OpnameRow & {
  categoryName: string;
  userName: string;
  closedByName: string | null;
  itemCount: number;
  countedCount: number;
};

const closer = alias(users, 'closer');

// Explicit names: Drizzle leaves columns unqualified in single-table queries.
const itemCount = sql<number>`(select count(*) from stock_opname_items i where i.opname_id = "stock_opnames"."id")`;
const countedCount = sql<number>`(select count(*) from stock_opname_items i
  where i.opname_id = "stock_opnames"."id" and i.counted_qty is not null)`;

const selectWithRefs = (db: Executor) =>
  db
    .select({
      opname: stockOpnames,
      categoryName: categories.name,
      userName: users.name,
      closedByName: closer.name,
      itemCount,
      countedCount,
    })
    .from(stockOpnames)
    .innerJoin(categories, eq(categories.id, stockOpnames.categoryId))
    .innerJoin(users, eq(users.id, stockOpnames.userId))
    .leftJoin(closer, eq(closer.id, stockOpnames.closedBy));

type Joined = {
  opname: OpnameRow;
  categoryName: string;
  userName: string;
  closedByName: string | null;
  itemCount: number;
  countedCount: number;
};
const flatten = ({ opname, ...refs }: Joined): OpnameWithRefs => ({ ...opname, ...refs });

export function findOpnameById(db: Executor, id: string): OpnameWithRefs | undefined {
  const row = selectWithRefs(db).where(eq(stockOpnames.id, id)).get();
  return row && flatten(row);
}

/** Sessions, open first, then newest first. */
export function listOpnames(db: Executor, status?: OpnameRow['status']): OpnameWithRefs[] {
  const where: SQL | undefined = status ? eq(stockOpnames.status, status) : undefined;
  return selectWithRefs(db)
    .where(where)
    .orderBy(
      sql`${stockOpnames.status} = 'open' desc`,
      desc(stockOpnames.startedAt),
      desc(sql`${stockOpnames}.rowid`),
    )
    .all()
    .map(flatten);
}

export function insertOpname(
  db: Executor,
  row: Pick<OpnameRow, 'categoryId' | 'status' | 'startedAt' | 'userId'> &
    Partial<Pick<OpnameRow, 'createdAt' | 'updatedAt'>>,
): OpnameRow {
  return db.insert(stockOpnames).values(row).returning().get();
}

export function updateOpname(
  db: Executor,
  id: string,
  patch: Partial<Pick<OpnameRow, 'status' | 'closedAt' | 'closedBy'>>,
): void {
  db.update(stockOpnames).set(patch).where(eq(stockOpnames.id, id)).run();
}

export function insertOpnameItems(
  db: Executor,
  rows: Pick<OpnameItemRow, 'opnameId' | 'productId' | 'systemQtyAtStart'>[],
): void {
  // Chunked: one statement has a bound-parameter limit.
  for (let i = 0; i < rows.length; i += 200) {
    db.insert(stockOpnameItems)
      .values(rows.slice(i, i + 200))
      .run();
  }
}

export function updateOpnameItem(
  db: Executor,
  opnameId: string,
  productId: string,
  patch: Partial<Pick<OpnameItemRow, 'countedQty' | 'adjustmentId'>>,
): void {
  db.update(stockOpnameItems)
    .set(patch)
    .where(and(eq(stockOpnameItems.opnameId, opnameId), eq(stockOpnameItems.productId, productId)))
    .run();
}

export interface OpnameItemWithProduct extends OpnameItemRow {
  productCode: string;
  productName: string;
  type: 'unit' | 'bulk';
  baseUnit: string;
  currentStock: number;
  costPrice: number;
}

export function listOpnameItems(db: Executor, opnameId: string): OpnameItemWithProduct[] {
  return db
    .select({
      item: stockOpnameItems,
      productCode: products.code,
      productName: products.name,
      type: products.type,
      baseUnit: products.baseUnit,
      currentStock: products.stock,
      costPrice: products.costPrice,
    })
    .from(stockOpnameItems)
    .innerJoin(products, eq(products.id, stockOpnameItems.productId))
    .where(eq(stockOpnameItems.opnameId, opnameId))
    .orderBy(asc(products.name), asc(products.code))
    .all()
    .map(({ item, ...rest }) => ({ ...item, ...rest }));
}

/** Products among `productIds` already in an open session, with that product's name. */
export function productsInOpenOpnames(
  db: Executor,
  productIds: string[],
): { productId: string; productName: string }[] {
  if (productIds.length === 0) return [];
  return db
    .select({ productId: stockOpnameItems.productId, productName: products.name })
    .from(stockOpnameItems)
    .innerJoin(stockOpnames, eq(stockOpnames.id, stockOpnameItems.opnameId))
    .innerJoin(products, eq(products.id, stockOpnameItems.productId))
    .where(and(eq(stockOpnames.status, 'open'), inArray(stockOpnameItems.productId, productIds)))
    .all();
}

/** Active products of a category with their cached stock. */
export function activeProductsOfCategory(
  db: Executor,
  categoryId: string,
): { id: string; stock: number }[] {
  return db
    .select({ id: products.id, stock: products.stock })
    .from(products)
    .where(and(eq(products.categoryId, categoryId), eq(products.active, true)))
    .all();
}
