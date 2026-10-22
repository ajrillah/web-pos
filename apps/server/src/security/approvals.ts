import { randomBytes } from 'node:crypto';
import {
  type ApprovalScope,
  actionScopeSchema,
  type MenuScope,
  menuScopeSchema,
} from '@toko-podomoro/shared';

// Owner approvals for cashiers (docs/design.md 5). Kept in memory: a restart revokes them all.

/** Unused action tokens expire after this; a token is spent when its action succeeds. */
export const ACTION_TOKEN_MS = 5 * 60 * 1000;
/** Menu tokens last while the cashier stays in the menu, at most this long. */
export const MENU_TOKEN_MS = 15 * 60 * 1000;

export interface Approval {
  token: string;
  kind: 'action' | 'menu';
  scope: ApprovalScope;
  /** The sale, payment, product, or category an action token is for. */
  targetId: string | null;
  sessionId: string;
  cashierId: string;
  ownerId: string;
  expiresAt: number;
}

export const isMenuScope = (scope: ApprovalScope): scope is MenuScope =>
  menuScopeSchema.safeParse(scope).success;

export const isActionScope = (scope: ApprovalScope) => actionScopeSchema.safeParse(scope).success;

export class ApprovalStore {
  private readonly approvals = new Map<string, Approval>();

  constructor(private readonly now: () => Date) {}

  grant(input: {
    scope: ApprovalScope;
    targetId: string | null;
    sessionId: string;
    cashierId: string;
    ownerId: string;
  }): Approval {
    this.prune();
    const kind = isMenuScope(input.scope) ? 'menu' : 'action';
    const approval: Approval = {
      ...input,
      // Menu approvals cover the whole menu, never one record.
      targetId: kind === 'menu' ? null : input.targetId,
      kind,
      token: randomBytes(32).toString('base64url'),
      expiresAt: this.now().getTime() + (kind === 'menu' ? MENU_TOKEN_MS : ACTION_TOKEN_MS),
    };
    this.approvals.set(approval.token, approval);
    return approval;
  }

  /**
   * The approval behind `token` if it is still valid for this session, scope, and target.
   * Does not spend it; call `consume` once the action succeeded.
   */
  check(
    token: string | undefined,
    sessionId: string,
    scope: ApprovalScope,
    targetId: string | null = null,
  ): Approval | null {
    if (!token) return null;
    const approval = this.approvals.get(token);
    if (!approval) return null;
    if (approval.expiresAt <= this.now().getTime()) {
      this.approvals.delete(token);
      return null;
    }
    const matches =
      approval.sessionId === sessionId &&
      approval.scope === scope &&
      (approval.kind === 'menu' || approval.targetId === targetId);
    return matches ? approval : null;
  }

  /** Spends a single-use action token. Menu tokens stay until released or expired. */
  consume(token: string): void {
    if (this.approvals.get(token)?.kind === 'action') {
      this.approvals.delete(token);
    }
  }

  /** The cashier left the menu: the page releases its token. Only the owning session may. */
  release(token: string, sessionId: string): void {
    if (this.approvals.get(token)?.sessionId === sessionId) {
      this.approvals.delete(token);
    }
  }

  /** Locking the screen or logging out ends every approval of the session. */
  revokeSession(sessionId: string): void {
    for (const [token, approval] of this.approvals) {
      if (approval.sessionId === sessionId) this.approvals.delete(token);
    }
  }

  private prune(): void {
    const now = this.now().getTime();
    for (const [token, approval] of this.approvals) {
      if (approval.expiresAt <= now) this.approvals.delete(token);
    }
  }
}
