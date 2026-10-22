import type { User } from '@toko-podomoro/shared';
import type { UserRow } from '../repositories/users-repository';

/** Public view of a user; never exposes PIN or recovery code hashes. */
export function toUser(row: UserRow): User {
  return {
    id: row.id,
    username: row.username,
    name: row.name,
    role: row.role,
    active: row.active,
    mustChangePin: row.mustChangePin,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

/** Fields recorded in audit_logs for user changes. */
export function auditSnapshot(row: UserRow) {
  return {
    username: row.username,
    name: row.name,
    role: row.role,
    active: row.active,
    mustChangePin: row.mustChangePin,
  };
}
