import { defineConfig } from 'drizzle-kit';

// Generates versioned SQL migrations only. Migrations are applied by the app (src/db/migrate.ts).
export default defineConfig({
  dialect: 'sqlite',
  schema: './src/db/schema.ts',
  out: './drizzle',
});
