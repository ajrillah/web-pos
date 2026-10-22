import { defineConfig } from 'vitest/config';

// Route tests hash PINs with scrypt (CPU-bound). When every workspace runs `pnpm test` in
// parallel, unbounded workers starve each other and tests hit the default 5 s timeout.
export default defineConfig({
  test: {
    maxWorkers: 4,
    testTimeout: 20_000,
  },
});
