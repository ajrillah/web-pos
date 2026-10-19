---
name: api-endpoint
description: Procedure for adding or changing a server API endpoint. Use when creating routes, services, or repositories under /api.
paths:
  - apps/server/**
---

# API endpoint

## Layers
1. Define request/response Zod schemas in `packages/shared`; export inferred types.
2. Route: parse input with the shared schema, check auth, call one service, return JSON. No SQL, no business rules.
3. Service: business rules, recomputation, transaction, audit log. Calls repositories.
4. Repository: Drizzle queries only.
5. Match the path and method in `docs/design.md` section 10. Update the doc if the contract changes.

## Errors
- Return `{ error: { code, message } }`: `code` UPPER_SNAKE English, `message` Indonesian.
- Throw typed app errors from services; map them in one Fastify error handler.
- Map Zod failures to `VALIDATION_ERROR` with an Indonesian message. Never leak stack traces or SQL.

## Auth
- Require a valid DB session cookie on every route except `setup/*`, `auth/login`, `auth/recover`.
- PIN endpoints (void, reports, users, settings PUT): owner session passes directly. Cashier must send a valid `X-Approval-Token`.
- Approval tokens live in memory, are short-lived; action tokens (void) are consumed on use.
- Record the approving owner in `audit_logs.approved_by`.
- Do not choose approval token lifetime or menu-token scope; they are open questions. Ask.

## Integrity
- Sales, purchases, payments: accept the client UUID as `id`; if it exists, reject with a duplicate error. Never insert twice.
- Ignore client totals. Load prices and costs from the DB and recompute with `packages/shared` math (money-rules skill).
- Multi-table writes in one transaction (db-change skill).
- Compute "today" and TRX dates in the PC's local time zone; store UTC.

## Tests
- Fastify `inject` in Vitest: success, validation error, unauthenticated, approval required, token reuse rejected, duplicate id.
