import { text } from 'drizzle-orm/sqlite-core';

// Timestamps are ISO 8601 UTC text (e.g. 2026-10-19T08:30:00.000Z): sortable and readable.
const now = () => new Date().toISOString();

export const id = () =>
  text('id')
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID());

export const createdAt = () => text('created_at').notNull().$defaultFn(now);

export const updatedAt = () => text('updated_at').notNull().$defaultFn(now).$onUpdateFn(now);
