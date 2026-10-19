---
name: api-endpoint
description: Procedure for adding or changing a server API endpoint. Use when creating routes, services, or repositories under /api.
paths:
  - apps/server/**
---

# API endpoint

## Layers
1. Schema: define request/response Zod schemas in `packages/shared`; export inferred types.
2. Route: parse input with the shared schema, check auth, call one service function, return JSON. No SQL, no business logic.
3. Service: business rules, recomputation, transactions, audit log. Calls repositories.
4. Repository: Drizzle queries only. No business rules.
5. Match the path and method in `docs/design.md` section 10. Update the doc if the contract changes.

## Errors
- Return `{ error: { code, message } }`. `code` is UPPER_SNAKE English; `message` is Indonesian.
- Throw a typed app error from services; map it in one Fastify error handler.
- Map Zod failures to `VALIDATION_ERROR` with an Indonesian message.
- Never leak stack traces or SQL text to the client.

## Auth
- Require a valid session cookie on every route except `setup/*`, `auth/login`, `auth/recover`.
- For owner-only actions (void, reports, users, settings PUT): allow owner session; for cashier, require a valid `X-Approval-Token` and record the approving owner in `audit_logs.approved_by`.

## Integrity
- For sales, purchases, payments: accept the client UUID as `id`; if it already exists, reject with a duplicate error. Never insert twice.
- Ignore client totals. Recompute subtotals, totals, change, debt, and allocations server-side using `packages/shared` math (see money-rules skill).
- Load prices and costs from the DB, not the request.
- Multi-table writes go through one transaction (see db-change skill).

## Tests
- Use Fastify `inject` in Vitest: success, validation error, auth denied, approval required, duplicate id.
