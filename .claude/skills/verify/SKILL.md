---
name: verify
description: Run Biome, typecheck, and Vitest for changed packages and fix failures. Use after code changes and before committing.
---

# Verify

1. Find changed packages: `git status --porcelain` and `git diff --name-only main...HEAD`. Map paths to `apps/server`, `apps/web`, `packages/shared`.
2. If `packages/shared` changed, also verify every package that depends on it.
3. Read root and package `package.json` scripts. If no `package.json` exists, report "nothing to verify" and stop. If a script (`check`, `typecheck`, `test`) is missing, skip that step and report it as skipped.
4. Run Biome: `pnpm check`. For format-only issues run `pnpm biome check --write <paths>`, then re-run.
5. Run typecheck per changed package: `pnpm --filter <pkg> typecheck`.
6. Run tests per changed package: `pnpm --filter <pkg> test -- --run`.
7. On failure: read the error, fix the root cause in source, re-run the failing step. Repeat until green.
   - Never delete, skip, or weaken a test to pass. No `@ts-ignore` or `biome-ignore` without a stated reason.
   - If a failure cannot be fixed safely, stop and report it with the output.
8. Report a table: step, package, result (pass / fixed / skipped / fail).
