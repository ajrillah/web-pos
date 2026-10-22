import type { Executor } from '../db/client';
import { auditLogs } from '../db/schema';

export interface AuditEntry {
  userId: string | null;
  approvedBy?: string | null;
  entity: string;
  entityId: string;
  action: string;
  oldValue?: unknown;
  newValue?: unknown;
}

const toJson = (value: unknown) => (value === undefined ? null : JSON.stringify(value));

export function insertAudit(db: Executor, entry: AuditEntry): void {
  db.insert(auditLogs)
    .values({
      userId: entry.userId,
      approvedBy: entry.approvedBy ?? null,
      entity: entry.entity,
      entityId: entry.entityId,
      action: entry.action,
      oldValue: toJson(entry.oldValue),
      newValue: toJson(entry.newValue),
    })
    .run();
}
