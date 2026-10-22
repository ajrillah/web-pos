import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';
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
