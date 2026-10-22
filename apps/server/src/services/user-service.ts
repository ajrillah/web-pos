import type { CreateUserRequest, UpdateUserRequest, User } from '@toko-podomoro/shared';
import { appErrors } from '../errors';
import { insertAudit } from '../repositories/audit-repository';
import { expireUserSessions } from '../repositories/sessions-repository';
import {
  countActiveOwners,
  findUserById,
  findUserByUsername,
  insertUser,
  listUsers,
  type UserPatch,
  updateUser,
} from '../repositories/users-repository';
import { hashSecret } from '../security/secrets';
import type { Actor, ServiceContext } from './context';
import { auditSnapshot, toUser } from './user-mapper';

export function listAllUsers(ctx: ServiceContext): User[] {
  return listUsers(ctx.db).map(toUser);
}

/** The PIN is chosen by the creating owner, so it is temporary: must_change_pin starts true. */
export async function createUser(
  ctx: ServiceContext,
  actor: Actor,
  input: CreateUserRequest,
): Promise<User> {
  const pinHash = await hashSecret(input.pin);
  return ctx.db.transaction((tx) => {
    if (findUserByUsername(tx, input.username)) {
      throw appErrors.usernameTaken();
    }
    const user = insertUser(tx, {
      username: input.username,
      name: input.name,
      role: input.role,
      pinHash,
      recoveryCodeHash: null,
      mustChangePin: true,
    });
    insertAudit(tx, {
      userId: actor.id,
      entity: 'user',
      entityId: user.id,
      action: 'create',
      newValue: auditSnapshot(user),
    });
    return toUser(user);
  });
}

/**
 * Updates name and active flag, or resets a cashier's PIN to a temporary one.
 * Deactivation and PIN resets end the target's open sessions.
 */
export async function updateUserById(
  ctx: ServiceContext,
  actor: Actor,
  id: string,
  input: UpdateUserRequest,
): Promise<User> {
  const pinHash = input.pin === undefined ? undefined : await hashSecret(input.pin);
  return ctx.db.transaction((tx) => {
    const row = findUserById(tx, id);
    if (!row) {
      throw appErrors.userNotFound();
    }
    if (pinHash !== undefined && row.role === 'owner') {
      throw appErrors.ownerPinResetForbidden();
    }
    const deactivating = input.active === false && row.active;
    if (deactivating && row.id === actor.id) {
      throw appErrors.cannotDeactivateSelf();
    }
    if (deactivating && row.role === 'owner' && countActiveOwners(tx) <= 1) {
      throw appErrors.lastActiveOwner();
    }

    const patch: UserPatch = {};
    if (input.name !== undefined) patch.name = input.name;
    if (input.active !== undefined) patch.active = input.active;
    if (pinHash !== undefined) {
      patch.pinHash = pinHash;
      patch.mustChangePin = true;
    }
    const updated = updateUser(tx, row.id, patch);
    if (deactivating || pinHash !== undefined) {
      expireUserSessions(tx, row.id, ctx.now().toISOString());
    }
    insertAudit(tx, {
      userId: actor.id,
      entity: 'user',
      entityId: row.id,
      action: pinHash === undefined ? 'update' : 'reset_pin',
      oldValue: auditSnapshot(row),
      newValue: auditSnapshot(updated),
    });
    return toUser(updated);
  });
}
