import { and, asc, count, eq, inArray, type SQL, sql } from 'drizzle-orm';
import type { Executor } from '../db/client';
import { categories, products, productUnits } from '../db/schema';

export type ProductRow = typeof products.$inferSelect;
export type NewProductRow = typeof products.$inferInsert;
export type ProductPatch = Partial<
  Pick<
    ProductRow,
    'code' | 'name' | 'categoryId' | 'type' | 'baseUnit' | 'pricingFactor' | 'costPrice' | 'active'
  >
>;
export type ProductWithCategory = ProductRow & { categoryName: string };

export type UnitRow = typeof productUnits.$inferSelect;
export type NewUnitRow = typeof productUnits.$inferInsert;
export type UnitPatch = Partial<
  Pick<UnitRow, 'name' | 'parentUnitId' | 'level' | 'isi' | 'costPrice' | 'sellPrice' | 'active'>
>;

const withCategory = {
  product: products,
  categoryName: categories.name,
};

const flatten = (r: { product: ProductRow; categoryName: string }): ProductWithCategory => ({
  ...r.product,
  categoryName: r.categoryName,
});

export function findProductById(db: Executor, id: string): ProductWithCategory | undefined {
  const row = db
    .select(withCategory)
    .from(products)
    .innerJoin(categories, eq(categories.id, products.categoryId))
    .where(eq(products.id, id))
    .get();
  return row && flatten(row);
}

export function findProductsByIds(db: Executor, ids: string[]): ProductWithCategory[] {
  if (ids.length === 0) return [];
  return db
    .select(withCategory)
    .from(products)
    .innerJoin(categories, eq(categories.id, products.categoryId))
    .where(inArray(products.id, ids))
    .all()
    .map(flatten);
}

/** Exact code match, ignoring case like the unique index; includes inactive products. */
export function findProductByCode(db: Executor, code: string): ProductWithCategory | undefined {
  const row = db
    .select(withCategory)
    .from(products)
    .innerJoin(categories, eq(categories.id, products.categoryId))
    .where(sql`${products.code} = ${code} COLLATE NOCASE`)
    .get();
  return row && flatten(row);
}

export interface ProductSearch {
  /** Each word must appear in the code or the name. */
  words: string[];
  categoryId?: string | undefined;
  active?: boolean | undefined;
  limit: number;
  offset: number;
}

const escapeLike = (s: string) => s.replace(/[\\%_]/g, (c) => `\\${c}`);

function searchConditions({ words, categoryId, active }: ProductSearch): SQL | undefined {
  const conditions: SQL[] = words.map((word) => {
    const pattern = `%${escapeLike(word)}%`;
    return sql`(${products.code} LIKE ${pattern} ESCAPE '\\' OR ${products.name} LIKE ${pattern} ESCAPE '\\')`;
  });
  if (categoryId !== undefined) conditions.push(eq(products.categoryId, categoryId));
  if (active !== undefined) conditions.push(eq(products.active, active));
  return conditions.length > 0 ? and(...conditions) : undefined;
}

/** One page of matches: exact code first, then names starting with the query, then by name. */
export function searchProducts(
  db: Executor,
  search: ProductSearch,
): { rows: ProductWithCategory[]; total: number } {
  const where = searchConditions(search);
  const query = search.words.join(' ');
  // No rank without a query: a bare integer in ORDER BY would mean a column position.
  const order = [asc(products.name), asc(products.code)];
  if (query) {
    order.unshift(sql`CASE WHEN ${products.code} = ${query} COLLATE NOCASE THEN 0
               WHEN ${products.name} LIKE ${`${escapeLike(query)}%`} ESCAPE '\\' THEN 1
               ELSE 2 END`);
  }
  const rows = db
    .select(withCategory)
    .from(products)
    .innerJoin(categories, eq(categories.id, products.categoryId))
    .where(where)
    .orderBy(...order)
    .limit(search.limit)
    .offset(search.offset)
    .all()
    .map(flatten);
  const total = db.select({ n: count() }).from(products).where(where).get()?.n ?? 0;
  return { rows, total };
}

/** Every product code (active and inactive), for checking many codes at once. */
export function listProductCodes(db: Executor): string[] {
  return db
    .select({ code: products.code })
    .from(products)
    .all()
    .map((r) => r.code);
}

export function insertProduct(db: Executor, row: NewProductRow): ProductRow {
  return db.insert(products).values(row).returning().get();
}

export function updateProduct(db: Executor, id: string, patch: ProductPatch): ProductRow {
  return db.update(products).set(patch).where(eq(products.id, id)).returning().get();
}

/** All unit rows (active and inactive) of the given products. */
export function listUnits(db: Executor, productIds: string[]): UnitRow[] {
  if (productIds.length === 0) return [];
  return db.select().from(productUnits).where(inArray(productUnits.productId, productIds)).all();
}

export function insertUnit(db: Executor, row: NewUnitRow): UnitRow {
  return db.insert(productUnits).values(row).returning().get();
}

export function updateUnit(db: Executor, id: string, patch: UnitPatch): UnitRow {
  return db.update(productUnits).set(patch).where(eq(productUnits.id, id)).returning().get();
}
