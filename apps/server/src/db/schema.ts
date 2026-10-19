import { sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { createdAt, id, updatedAt } from './columns';

export const settings = sqliteTable('settings', {
  id: id(),
  key: text('key').notNull().unique(),
  value: text('value').notNull(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});
