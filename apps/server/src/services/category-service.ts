import type { Category, CreateCategoryRequest, UpdateCategoryRequest } from '@toko-podomoro/shared';
import { appErrors } from '../errors';
import { insertAudit } from '../repositories/audit-repository';
import {
  type CategoryPatch,
  type CategoryRow,
  findCategoryById,
  findCategoryByName,
  insertCategory,
  listCategories,
  updateCategory,
} from '../repositories/categories-repository';
import type { Actor, ServiceContext } from './context';

function toCategory(row: CategoryRow): Category {
  return {
    id: row.id,
    name: row.name,
    isDefault: row.isDefault,
    active: row.active,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

const auditSnapshot = (row: CategoryRow) => ({ name: row.name, active: row.active });

export function listAllCategories(ctx: ServiceContext): Category[] {
  return listCategories(ctx.db).map(toCategory);
}

export function createCategory(
  ctx: ServiceContext,
  actor: Actor,
  input: CreateCategoryRequest,
): Category {
  return ctx.db.transaction((tx) => {
    const name = input.name.toUpperCase();
    if (findCategoryByName(tx, name)) {
      throw appErrors.categoryNameTaken();
    }
    const row = insertCategory(tx, name);
    insertAudit(tx, {
      userId: actor.id,
      approvedBy: actor.approvedBy ?? null,
      entity: 'category',
      entityId: row.id,
      action: 'create',
      newValue: auditSnapshot(row),
    });
    return toCategory(row);
  });
}

/** Renames or (de)activates a category. Defaults can be renamed but never deactivated. */
export function updateCategoryById(
  ctx: ServiceContext,
  actor: Actor,
  id: string,
  input: UpdateCategoryRequest,
): Category {
  return ctx.db.transaction((tx) => {
    const row = findCategoryById(tx, id);
    if (!row) {
      throw appErrors.categoryNotFound();
    }
    if (input.active === false && row.isDefault) {
      throw appErrors.defaultCategoryLocked();
    }
    if (input.name !== undefined) {
      const name = input.name.toUpperCase();
      const clash = findCategoryByName(tx, name);
      if (clash && clash.id !== row.id) {
        throw appErrors.categoryNameTaken();
      }
      input = { ...input, name };
    }
    const patch: CategoryPatch = {};
    if (input.name !== undefined) patch.name = input.name.toUpperCase();
    if (input.active !== undefined) patch.active = input.active;
    const updated = updateCategory(tx, row.id, patch);
    insertAudit(tx, {
      userId: actor.id,
      approvedBy: actor.approvedBy ?? null,
      entity: 'category',
      entityId: row.id,
      action: 'update',
      oldValue: auditSnapshot(row),
      newValue: auditSnapshot(updated),
    });
    return toCategory(updated);
  });
}
