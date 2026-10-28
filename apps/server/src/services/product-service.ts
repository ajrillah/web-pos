import {
  type CreateProductInput,
  type Product,
  type ProductsQuery,
  type ProductsResponse,
  pricingFactorFor,
  productsQuerySchema,
  type UnitChainItem,
  type UpdateProductInput,
} from '@toko-podomoro/shared';
import type { Executor } from '../db/client';
import { appErrors } from '../errors';
import { insertAudit } from '../repositories/audit-repository';
import { findCategoryById } from '../repositories/categories-repository';
import {
  findProductByCode,
  findProductById,
  findProductsByIds,
  insertProduct,
  insertUnit,
  listUnits,
  type ProductPatch,
  type ProductRow,
  type ProductWithCategory,
  searchProducts as searchProductRows,
  type UnitPatch,
  type UnitRow,
  updateProduct,
  updateUnit,
} from '../repositories/products-repository';
import { productIdsWithMovements } from '../repositories/stock-repository';
import { type Actor, isApproved, type ServiceContext } from './context';
import { recordAdjustment } from './stock-service';
import { checkBaseUnitKept, planUnits, storedFactors, type UnitPlan } from './unit-pyramid';

// Rules: docs/design.md 4.1 and 6.5. Cashier limits: 6.5 "Cashier permissions".

/**
 * API shape of a product. `factor`, the primary unit, and the unit mode are computed from the
 * stored pyramid (docs/design.md 4.1.1); units come back level 1 first.
 */
function toProduct(
  row: ProductWithCategory,
  units: UnitRow[],
  withMovements: Set<string>,
): Product {
  const rows = units
    .filter((u) => u.productId === row.id && u.active)
    .sort((a, b) => a.level - b.level || a.name.localeCompare(b.name));
  const factors = storedFactors(rows);
  const deepest = rows[rows.length - 1];
  const pyramid = rows.some((u) => u.parentUnitId !== null);
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    categoryId: row.categoryId,
    categoryName: row.categoryName,
    type: row.type,
    baseUnit: row.baseUnit,
    pricingFactor: row.pricingFactor,
    costPrice: row.costPrice,
    stock: row.stock,
    hasStockMovements: withMovements.has(row.id),
    priceAlert: row.priceAlert,
    active: row.active,
    unitMode: pyramid ? 'pyramid' : 'flat',
    units: rows.map((u) => ({
      id: u.id,
      name: u.name,
      parentUnitId: u.parentUnitId,
      level: u.level,
      isi: u.isi,
      factor: factors.get(u.id) ?? u.isi,
      costPrice: u.costPrice,
      sellPrice: u.sellPrice,
      isBase: u.id === deepest?.id,
      active: u.active,
    })),
    unitChain: pyramid
      ? rows.map((u) => ({ name: u.name, factor: factors.get(u.id) ?? u.isi }))
      : [],
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

/** Levels top-down for a stock breakdown, by product id; empty for a flat product (4.1.1). */
export function stockChains(db: Executor, productIds: string[]): Map<string, UnitChainItem[]> {
  const chains = new Map<string, UnitChainItem[]>();
  const rows = listUnits(db, [...new Set(productIds)]).filter((u) => u.active);
  const factors = storedFactors(rows);
  for (const id of new Set(rows.map((r) => r.productId))) {
    const units = rows
      .filter((r) => r.productId === id)
      .sort((a, b) => a.level - b.level || a.name.localeCompare(b.name));
    chains.set(
      id,
      units.some((u) => u.parentUnitId !== null)
        ? units.map((u) => ({ name: u.name, factor: factors.get(u.id) ?? u.isi }))
        : [],
    );
  }
  return chains;
}

const productSnapshot = (row: ProductRow) => ({
  code: row.code,
  name: row.name,
  categoryId: row.categoryId,
  type: row.type,
  baseUnit: row.baseUnit,
  pricingFactor: row.pricingFactor,
  costPrice: row.costPrice,
  active: row.active,
});

const unitSnapshot = (row: UnitRow) => ({
  productId: row.productId,
  name: row.name,
  parentUnitId: row.parentUnitId,
  level: row.level,
  isi: row.isi,
  costPrice: row.costPrice,
  sellPrice: row.sellPrice,
  active: row.active,
});

/** API shape for product rows, loading their units and movement flags in two queries. */
function toProducts(db: Executor, rows: ProductWithCategory[]): Product[] {
  const ids = rows.map((r) => r.id);
  const units = listUnits(db, ids);
  const withMovements = productIdsWithMovements(db, ids);
  return rows.map((row) => toProduct(row, units, withMovements));
}

/** Products by id (any status), in API shape. */
export function productsByIds(db: Executor, ids: string[]): Map<string, Product> {
  const rows = findProductsByIds(db, [...new Set(ids)]);
  return new Map(toProducts(db, rows).map((p) => [p.id, p]));
}

function loadProduct(db: Executor, id: string): Product {
  const row = findProductById(db, id);
  if (!row) {
    throw appErrors.productNotFound();
  }
  return toProducts(db, [row])[0] as Product;
}

/** Category for a product: must exist; must be active unless it is unchanged. */
function checkCategory(db: Executor, categoryId: string, currentId?: string): void {
  const category = findCategoryById(db, categoryId);
  if (!category) {
    throw appErrors.categoryNotFound();
  }
  if (!category.active && categoryId !== currentId) {
    throw appErrors.categoryInactive();
  }
}

function checkCodeFree(db: Executor, code: string, productId?: string): void {
  const clash = findProductByCode(db, code);
  if (clash && clash.id !== productId) {
    throw appErrors.productCodeTaken();
  }
}

export function searchProducts(ctx: ServiceContext, query: ProductsQuery): ProductsResponse {
  const { q, categoryId, status, page, limit } = productsQuerySchema.parse(query);
  const { rows, total } = searchProductRows(ctx.db, {
    words: q ? q.split(/\s+/).filter(Boolean) : [],
    categoryId,
    active: status === 'all' ? undefined : status === 'active',
    limit,
    offset: (page - 1) * limit,
  });
  return { products: toProducts(ctx.db, rows), total, page, limit };
}

export function getProduct(ctx: ServiceContext, id: string): Product {
  return loadProduct(ctx.db, id);
}

/** Active product by exact code (ignoring case), for the cashier screen. */
export function getProductByCode(ctx: ServiceContext, code: string): Product {
  const row = findProductByCode(ctx.db, code.trim());
  if (!row?.active) {
    throw appErrors.productNotFound();
  }
  return toProducts(ctx.db, [row])[0] as Product;
}

/** Creates a product with its unit rows; initial stock becomes a stock adjustment. */
export function createProduct(
  ctx: ServiceContext,
  actor: Actor,
  input: CreateProductInput,
): Product {
  const plan = planUnits(input);
  return ctx.db.transaction((tx) => {
    checkCategory(tx, input.categoryId);
    checkCodeFree(tx, input.code);
    const id = insertNewProduct(tx, actor, input, {
      stockNote: 'Stok awal',
      createdAt: ctx.now().toISOString(),
      plan,
    });
    return loadProduct(tx, id);
  });
}

/** Adds a planned unit row and its audit row; `parents` holds the ids of the levels above. */
function addUnit(
  tx: Executor,
  actor: Actor,
  productId: string,
  unit: UnitPlan['units'][number],
  parents: (string | undefined)[],
): UnitRow {
  const row = insertUnit(tx, {
    productId,
    name: unit.name,
    parentUnitId: unit.parentIndex === null ? null : (parents[unit.parentIndex] ?? null),
    level: unit.level,
    isi: unit.isi,
    costPrice: unit.costPrice,
    sellPrice: unit.sellPrice,
  });
  insertAudit(tx, {
    userId: actor.id,
    approvedBy: actor.approvedBy ?? null,
    entity: 'product_unit',
    entityId: row.id,
    action: 'create',
    newValue: unitSnapshot(row),
  });
  return row;
}

/**
 * Inserts a checked product (units normalized, category and code verified) with its unit rows
 * and audit rows; initial stock becomes an adjustment (`lainnya`) with `stockNote`, dated
 * `createdAt`. Returns the id.
 */
export function insertNewProduct(
  tx: Executor,
  actor: Actor,
  input: CreateProductInput,
  {
    stockNote,
    createdAt,
    plan = planUnits(input),
  }: { stockNote: string; createdAt: string; plan?: UnitPlan },
): string {
  const product = insertProduct(tx, {
    code: input.code,
    name: input.name.toUpperCase(),
    categoryId: input.categoryId,
    type: input.type,
    baseUnit: plan.baseUnit,
    pricingFactor: pricingFactorFor(input.type),
    costPrice: plan.costPrice,
  });
  insertAudit(tx, {
    userId: actor.id,
    approvedBy: actor.approvedBy ?? null,
    entity: 'product',
    entityId: product.id,
    action: 'create',
    newValue: productSnapshot(product),
  });
  // Level 1 first, so a level can reference the row above it.
  const parents: (string | undefined)[] = [];
  for (const unit of plan.units) {
    parents.push(addUnit(tx, actor, product.id, unit, parents).id);
  }
  if (input.initialStock > 0) {
    recordAdjustment(tx, {
      productId: product.id,
      qtyChange: input.initialStock,
      reason: 'lainnya',
      note: stockNote,
      costPrice: product.costPrice,
      userId: actor.id,
      createdAt,
    });
  }
  return product.id;
}

/**
 * Replaces a product's fields and active unit rows. Rows sent with an `id` are updated, rows
 * without one are added, and active rows left out are deactivated. Cashiers need owner approval
 * for price changes and new rows (until Stage 5: refused).
 */
export function updateProductById(
  ctx: ServiceContext,
  actor: Actor,
  id: string,
  input: UpdateProductInput,
): Product {
  const plan = planUnits(input);
  return ctx.db.transaction((tx) => {
    const product = findProductById(tx, id);
    if (!product) {
      throw appErrors.productNotFound();
    }
    checkCategory(tx, input.categoryId, product.categoryId);
    const storedUnits = listUnits(tx, [product.id]);
    // Existing stock is counted in the current unit; it cannot be converted (design 6.5).
    const unitKindChanged =
      input.type !== product.type || (input.type === 'bulk' && plan.baseUnit !== product.baseUnit);
    if (productIdsWithMovements(tx, [product.id]).size > 0) {
      if (unitKindChanged) {
        throw appErrors.stockUnitLocked();
      }
      checkBaseUnitKept(
        plan,
        storedUnits.filter((u) => u.active),
      );
    }
    if (input.code !== product.code) {
      checkCodeFree(tx, input.code, product.id);
    }

    const existing = new Map(storedUnits.map((u) => [u.id, u]));
    for (const unit of plan.units) {
      if (unit.id !== undefined && !existing.has(unit.id)) {
        throw appErrors.invalidUnits('Satuan tidak ditemukan pada barang ini.');
      }
    }
    const keptIds = new Set(plan.units.flatMap((u) => (u.id === undefined ? [] : [u.id])));

    // A row that is new or was inactive brings a new sell price.
    const priceChanged =
      plan.costPrice !== product.costPrice ||
      plan.units.some((u) => {
        const row = u.id === undefined ? undefined : existing.get(u.id);
        return !row?.active || row.sellPrice !== u.sellPrice || row.costPrice !== u.costPrice;
      });
    if (priceChanged && !isApproved(actor)) {
      throw appErrors.ownerApprovalRequired();
    }

    const clearPriceAlert =
      priceChanged && isApproved(actor) && plan.units.every((u) => u.sellPrice >= u.costPrice);
    const next: ProductPatch = {
      code: input.code,
      name: input.name.toUpperCase(),
      categoryId: input.categoryId,
      type: input.type,
      baseUnit: plan.baseUnit,
      pricingFactor: pricingFactorFor(input.type),
      costPrice: plan.costPrice,
      priceAlert: clearPriceAlert ? false : product.priceAlert,
    };
    const changed = (Object.keys(next) as (keyof ProductPatch)[]).some(
      (key) => next[key] !== product[key],
    );
    if (changed) {
      const updated = updateProduct(tx, product.id, next);
      insertAudit(tx, {
        userId: actor.id,
        approvedBy: actor.approvedBy ?? null,
        entity: 'product',
        entityId: product.id,
        action: 'update',
        oldValue: productSnapshot(product),
        newValue: productSnapshot(updated),
      });
    }

    const auditUnit = (action: string, before: UnitRow | undefined, after: UnitRow) =>
      insertAudit(tx, {
        userId: actor.id,
        approvedBy: actor.approvedBy ?? null,
        entity: 'product_unit',
        entityId: after.id,
        action,
        ...(before ? { oldValue: unitSnapshot(before) } : {}),
        newValue: unitSnapshot(after),
      });

    // A dropped row leaves the pyramid; the rows that stay get their parent from the plan.
    for (const row of existing.values()) {
      if (row.active && !keptIds.has(row.id)) {
        auditUnit('deactivate', row, updateUnit(tx, row.id, { active: false, parentUnitId: null }));
      }
    }
    const parents: (string | undefined)[] = [];
    for (const unit of plan.units) {
      const row = unit.id === undefined ? undefined : existing.get(unit.id);
      if (!row) {
        parents.push(addUnit(tx, actor, product.id, unit, parents).id);
        continue;
      }
      const patch: UnitPatch = {
        name: unit.name,
        parentUnitId: unit.parentIndex === null ? null : (parents[unit.parentIndex] ?? null),
        level: unit.level,
        isi: unit.isi,
        costPrice: unit.costPrice,
        sellPrice: unit.sellPrice,
        active: true,
      };
      if ((Object.keys(patch) as (keyof UnitPatch)[]).some((key) => patch[key] !== row[key])) {
        auditUnit(row.active ? 'update' : 'activate', row, updateUnit(tx, row.id, patch));
      }
      parents.push(row.id);
    }
    return loadProduct(tx, product.id);
  });
}

/**
 * Keeps the per-level costs in step with a new `products.cost_price` (a purchase can change it):
 * one of a unit costs its factor worth of base units. The product's audit row covers the change.
 */
export function syncUnitCosts(
  tx: Executor,
  productId: string,
  costPrice: number,
  pricingFactor: number,
): void {
  const rows = listUnits(tx, [productId]).filter((u) => u.active);
  const factors = storedFactors(rows);
  for (const row of rows) {
    const next = Math.round(((factors.get(row.id) ?? row.isi) * costPrice) / pricingFactor);
    if (next !== row.costPrice) {
      updateUnit(tx, row.id, { costPrice: next });
    }
  }
}

/** Deactivating needs owner approval for cashiers; reactivating is open. */
export function setProductActive(
  ctx: ServiceContext,
  actor: Actor,
  id: string,
  active: boolean,
): Product {
  return ctx.db.transaction((tx) => {
    const product = findProductById(tx, id);
    if (!product) {
      throw appErrors.productNotFound();
    }
    if (!active && !isApproved(actor)) {
      throw appErrors.ownerApprovalRequired();
    }
    if (product.active !== active) {
      const updated = updateProduct(tx, product.id, { active });
      insertAudit(tx, {
        userId: actor.id,
        approvedBy: actor.approvedBy ?? null,
        entity: 'product',
        entityId: product.id,
        action: active ? 'activate' : 'deactivate',
        oldValue: productSnapshot(product),
        newValue: productSnapshot(updated),
      });
    }
    return loadProduct(tx, product.id);
  });
}
