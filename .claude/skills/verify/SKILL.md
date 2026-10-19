---
name: verify
description: Run Biome, typecheck, and Vitest for changed packages and fix failures. Use after code changes and before committing.
---

# Verify

1. Find changed packages: `git status --porcelain` and `git diff --name-only main...HEAD`. Map paths to `apps/server`, `apps/web`, `packages/shared`.
2. If `packages/shared` changed, also verify every package that depends on it.
3. Read root and package `package.json` scripts. If a script (`check`, `typecheck`, `test`) does not exist yet, skip that step and report it as skipped. If no `package.json` exists, report "nothing to verify" and stop.
4. Run Biome: `pnpm check` (or `pnpm biome check <changed paths>`).
   - For format-only issues, run `pnpm biome check --write <paths>`, then re-run.
5. Run typecheck for each changed package: `pnpm --filter <pkg> typecheck`.
6. Run tests for each changed package: `pnpm --filter <pkg> test -- --run`.
7. On failure: read the error, fix the root cause in source, re-run the failing step. Repeat until green.
   - Never delete, skip, or weaken a test to make it pass. Never add `// @ts-ignore` or `biome-ignore` without a stated reason.
   - If a failure cannot be fixed safely, stop and report it with the output.
8. Report a short table: step, package, result (pass / fixed / skipped / fail).
