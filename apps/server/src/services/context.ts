import type { Role } from '@toko-podomoro/shared';
import type { AppDatabase } from '../db/client';
import type { ApprovalStore } from '../security/approvals';

/** Dependencies shared by all services. `now` is injectable so tests can move time. */
export interface ServiceContext {
  db: AppDatabase;
  now: () => Date;
  /** Opens a file or folder with the OS default app (receipts); tests inject a fake. */
  openPath: (target: string) => void;
  /** Owner approvals for cashiers, in memory. */
  approvals: ApprovalStore;
}

/** The logged-in user performing an action. */
export interface Actor {
  id: string;
  role: Role;
  /** Owner who approved this action for a cashier (recorded as audit_logs.approved_by). */
  approvedBy?: string | null;
}

/** Owners act directly; cashiers need an owner's approval. */
export const isApproved = (actor: Actor) => actor.role === 'owner' || Boolean(actor.approvedBy);
