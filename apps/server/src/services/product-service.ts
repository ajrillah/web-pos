import {
  BULK_FACTOR,
  bulkBaseUnitSchema,
  bulkSellUnit,
  type CreateProductInput,
  type Product,
  type ProductsQuery,
  type ProductsResponse,
  type ProductUnitInput,
  pricingFactorFor,
  productsQuerySchema,
  type UpdateProductRequest,
} from '@toko-podomoro/shared';
import type { Executor } from '../db/client';
import { appErrors } from '../errors';
import { insertAudit } from '../repositories/audit-repository';
import { findCategoryById } from '../repositories/categories-repository';
import {
  findProductByCode,
  findProductById,
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
import type { Actor, ServiceContext } from './context';
import { recordAdjustment } from './stock-service';

// Rules: docs/design.md 4.1 and 6.5. Cashier limits: 6.5 "Cashier permissions".

function toProduct(row: ProductWithCategory, units: UnitRow[]): Product {
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
    active: row.active,
    units: units
      .filter((u) => u.productId === row.id && u.active)
      .sort((a, b) => Number(b.isBase) - Number(a.isBase) || a.factor - b.factor)
      .map((u) => ({
        id: u.id,
        name: u.name,
        factor: u.factor,
        sellPrice: u.sellPrice,
        isBase: u.isBase,
        active: u.active,
      })),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
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
  factor: row.factor,
  sellPrice: row.sellPrice,
  isBase: row.isBase,
  active: row.active,
});

function loadProduct(db: Executor, id: string): Product {
  const row = findProductById(db, id);
  if (!row) {
    throw appErrors.productNotFound();
  }
  return toProduct(row, listUnits(db, [row.id]));
}

/**
 * Checks the unit rows against the product type and returns them normalized.
 * Bulk: base unit gram/ml and exactly one primary row kg/liter with factor 1000.
 */
function checkUnits(
  type: CreateProductInput['type'],
  baseUnit: string,
  units: ProductUnitInput[],
): ProductUnitInput[] {
  const bulkBase = bulkBaseUnitSchema.safeParse(baseUnit.toLowerCase());
  if (type === 'bulk') {
    if (!bulkBase.success) {
      throw appErrors.invalidUnits('Satuan stok barang curah harus gram atau ml.');
    }
    const sellUnit = bulkSellUnit[bulkBase.data];
    const [only] = units;
    if (
      units.length !== 1 ||
      !only ||
      only.name.toLowerCase() !== sellUnit ||
      only.factor !== BULK_FACTOR ||
      !only.isBase
    ) {
      throw appErrors.invalidUnits(
        `Barang curah hanya punya satu satuan jual: ${sellUnit} (isi ${BULK_FACTOR} ${bulkBase.data}).`,
      );
    }
    return [{ ...only, name: sellUnit }];
  }
  if (bulkBase.success) {
    throw appErrors.invalidUnits('Satuan stok gram atau ml hanya untuk barang curah.');
  }
  if (units.filter((u) => u.isBase).length !== 1) {
    throw appErrors.invalidUnits('Pilih tepat satu satuan utama.');
  }
  const names = units.map((u) => u.name.toLowerCase());
  if (new Set(names).size !== names.length) {
    throw appErrors.invalidUnits('Nama satuan tidak boleh sama.');
  }
  return units;
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
  const units = listUnits(
    ctx.db,
    rows.map((r) => r.id),
  );
  return { products: rows.map((row) => toProduct(row, units)), total, page, limit };
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
  return toProduct(row, listUnits(ctx.db, [row.id]));
}

/** Creates a product with its unit rows; initial stock becomes a stock adjustment. */
export function createProduct(
  ctx: ServiceContext,
  actor: Actor,
  input: CreateProductInput,
): Product {
  const units = checkUnits(input.type, input.baseUnit, input.units);
  const baseUnit = input.type === 'bulk' ? input.baseUnit.toLowerCase() : input.baseUnit;
  return ctx.db.transaction((tx) => {
    checkCategory(tx, input.categoryId);
    checkCodeFree(tx, input.code);
    const product = insertProduct(tx, {
      code: input.code,
      name: input.name,
      categoryId: input.categoryId,
      type: input.type,
      baseUnit,
      pricingFactor: pricingFactorFor(input.type),
      costPrice: input.costPrice,
    });
    insertAudit(tx, {
      userId: actor.id,
      entity: 'product',
      entityId: product.id,
      action: 'create',
      newValue: productSnapshot(product),
    });
    for (const unit of units) {
      const row = insertUnit(tx, {
        productId: product.id,
        name: unit.name,
        factor: unit.factor,
        sellPrice: unit.sellPrice,
        isBase: unit.isBase,
      });
      insertAudit(tx, {
        userId: actor.id,
        entity: 'product_unit',
        entityId: row.id,
        action: 'create',
        newValue: unitSnapshot(row),
      });
    }
    if (input.initialStock > 0) {
      recordAdjustment(tx, {
        productId: product.id,
        qtyChange: input.initialStock,
        reason: 'lainnya',
        note: 'Stok awal',
        costPrice: product.costPrice,
        userId: actor.id,
      });
    }
    return loadProduct(tx, product.id);
  });
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
  input: UpdateProductRequest,
): Product {
  const units = checkUnits(input.type, input.baseUnit, input.units);
  const baseUnit = input.type === 'bulk' ? input.baseUnit.toLowerCase() : input.baseUnit;
  return ctx.db.transaction((tx) => {
    const product = findProductById(tx, id);
    if (!product) {
      throw appErrors.productNotFound();
    }
    checkCategory(tx, input.categoryId, product.categoryId);
    if (input.code !== product.code) {
      checkCodeFree(tx, input.code, product.id);
    }

    const existing = new Map(listUnits(tx, [product.id]).map((u) => [u.id, u]));
    for (const unit of units) {
      if (unit.id !== undefined && !existing.has(unit.id)) {
        throw appErrors.invalidUnits('Satuan tidak ditemukan pada barang ini.');
      }
    }
    const keptIds = new Set(units.flatMap((u) => (u.id === undefined ? [] : [u.id])));

    // A row that is new or was inactive brings a new sell price.
    const priceChanged =
      input.costPrice !== product.costPrice ||
      units.some((u) => {
        const row = u.id === undefined ? undefined : existing.get(u.id);
        return !row?.active || row.sellPrice !== u.sellPrice;
      });
    if (priceChanged && actor.role !== 'owner') {
      throw appErrors.ownerApprovalRequired();
    }

    const next: ProductPatch = {
      code: input.code,
      name: input.name,
      categoryId: input.categoryId,
      type: input.type,
      baseUnit,
      pricingFactor: pricingFactorFor(input.type),
      costPrice: input.costPrice,
    };
    const changed = (Object.keys(next) as (keyof ProductPatch)[]).some(
      (key) => next[key] !== product[key],
    );
    if (changed) {
      const updated = updateProduct(tx, product.id, next);
      insertAudit(tx, {
        userId: actor.id,
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
        entity: 'product_unit',
        entityId: after.id,
        action,
        ...(before ? { oldValue: unitSnapshot(before) } : {}),
        newValue: unitSnapshot(after),
      });

    for (const row of existing.values()) {
      if (row.active && !keptIds.has(row.id)) {
        auditUnit('deactivate', row, updateUnit(tx, row.id, { active: false, isBase: false }));
      }
    }
    for (const unit of units) {
      const row = unit.id === undefined ? undefined : existing.get(unit.id);
      if (!row) {
        auditUnit(
          'create',
          undefined,
          insertUnit(tx, {
            productId: product.id,
            name: unit.name,
            factor: unit.factor,
            sellPrice: unit.sellPrice,
            isBase: unit.isBase,
          }),
        );
        continue;
      }
      const patch: UnitPatch = {
        name: unit.name,
        factor: unit.factor,
        sellPrice: unit.sellPrice,
        isBase: unit.isBase,
        active: true,
      };
      if ((Object.keys(patch) as (keyof UnitPatch)[]).some((key) => patch[key] !== row[key])) {
        auditUnit(row.active ? 'update' : 'activate', row, updateUnit(tx, row.id, patch));
      }
    }
    return loadProduct(tx, product.id);
  });
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
    if (!active && actor.role !== 'owner') {
      throw appErrors.ownerApprovalRequired();
    }
    if (product.active !== active) {
      const updated = updateProduct(tx, product.id, { active });
      insertAudit(tx, {
        userId: actor.id,
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
