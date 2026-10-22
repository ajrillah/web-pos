import { z } from 'zod';

// Request/response contracts for setup, auth, and users. See docs/design.md sections 5 and 10.

export const roleSchema = z.enum(['owner', 'cashier']);
export type Role = z.infer<typeof roleSchema>;

/** Lowercase letters, digits, dot, dash, underscore; 3-32 chars. Input is trimmed and lowercased. */
export const usernameSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9._-]{3,32}$/);

export const personNameSchema = z.string().trim().min(1).max(100);

/** Exactly 6 digits, kept as a string so leading zeros survive. */
export const pinSchema = z.string().regex(/^\d{6}$/);

/** Recovery codes are shown as XXXX-XXXX-XXXX-XXXX; input is normalized before hashing. */
export const recoveryCodeSchema = z.string().trim().min(1).max(64);

export const userSchema = z.object({
  id: z.string(),
  username: z.string(),
  name: z.string(),
  role: roleSchema,
  active: z.boolean(),
  mustChangePin: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type User = z.infer<typeof userSchema>;

export const setupStatusResponseSchema = z.object({ needsSetup: z.boolean() });
export type SetupStatusResponse = z.infer<typeof setupStatusResponseSchema>;

export const setupRequestSchema = z.object({
  username: usernameSchema,
  name: personNameSchema,
  pin: pinSchema,
});
export type SetupRequest = z.infer<typeof setupRequestSchema>;

/** Returned when a recovery code is issued; the plain code is shown once and never stored. */
export const recoveryCodeResponseSchema = z.object({
  user: userSchema,
  recoveryCode: z.string(),
});
export type RecoveryCodeResponse = z.infer<typeof recoveryCodeResponseSchema>;

/** Login picks a user tile (by id) and enters the PIN. */
export const loginRequestSchema = z.object({
  userId: z.string().min(1),
  pin: pinSchema,
});
export type LoginRequest = z.infer<typeof loginRequestSchema>;

/** Login tiles: active users only, never usernames. */
export const loginUserSchema = z.object({ id: z.string(), name: z.string(), role: roleSchema });
export type LoginUser = z.infer<typeof loginUserSchema>;

export const loginUsersResponseSchema = z.object({ users: z.array(loginUserSchema) });
export type LoginUsersResponse = z.infer<typeof loginUsersResponseSchema>;

export const meResponseSchema = z.object({
  user: userSchema,
  /** The session is locked: only unlock, logout, and the login tiles work. */
  locked: z.boolean().default(false),
});
export type MeResponse = z.infer<typeof meResponseSchema>;

export const unlockRequestSchema = z.object({ pin: pinSchema });
export type UnlockRequest = z.infer<typeof unlockRequestSchema>;

// --- Owner approval (docs/design.md 5) ---

/** Single-use approvals for one action (on one target when it has one). */
export const actionScopeSchema = z.enum([
  'sale.void',
  'payment.void',
  'product.price',
  'product.deactivate',
  'category.manage',
  'purchase.void',
  'purchase.cost',
  'supplier-payment.void',
]);
export type ActionScope = z.infer<typeof actionScopeSchema>;

/** Approvals that last while the cashier stays in a menu (max 15 minutes). */
export const menuScopeSchema = z.enum(['laporan', 'pengguna', 'profil-toko']);
export type MenuScope = z.infer<typeof menuScopeSchema>;

export const approvalScopeSchema = z.union([actionScopeSchema, menuScopeSchema]);
export type ApprovalScope = z.infer<typeof approvalScopeSchema>;

/** What an approval is for, completing "... untuk <label>". */
export const APPROVAL_SCOPE_LABELS: Record<ApprovalScope, string> = {
  'sale.void': 'membatalkan transaksi',
  'payment.void': 'membatalkan pembayaran kasbon',
  'product.price': 'mengubah harga atau menambah satuan barang',
  'product.deactivate': 'menonaktifkan barang',
  'category.manage': 'mengubah kategori',
  'purchase.void': 'membatalkan stok masuk',
  'purchase.cost': 'mengubah harga modal dari stok masuk',
  'supplier-payment.void': 'membatalkan pembayaran hutang',
  laporan: 'membuka Laporan',
  pengguna: 'membuka Pengguna',
  'profil-toko': 'membuka Profil Toko',
};

export const APPROVAL_HEADER = 'x-approval-token';

export const approveRequestSchema = z.object({
  pin: pinSchema,
  scope: approvalScopeSchema,
  /** The sale, payment, purchase, product, or category the action applies to. */
  targetId: z.string().min(1).optional(),
  /** The owner chosen on the tiles; required when several owners are active. */
  ownerId: z.string().min(1).optional(),
});
export type ApproveRequest = z.infer<typeof approveRequestSchema>;

export const approveResponseSchema = z.object({
  token: z.string(),
  expiresAt: z.string(),
  ownerName: z.string(),
});
export type ApproveResponse = z.infer<typeof approveResponseSchema>;

export const releaseApprovalRequestSchema = z.object({ token: z.string().min(1) });
export type ReleaseApprovalRequest = z.infer<typeof releaseApprovalRequestSchema>;

export const changePinRequestSchema = z
  .object({
    currentPin: pinSchema,
    newPin: pinSchema,
  })
  .refine((v) => v.currentPin !== v.newPin, { path: ['newPin'] });
export type ChangePinRequest = z.infer<typeof changePinRequestSchema>;

/** `recoveryCode` is set only when a new owner sets their first own PIN. */
export const changePinResponseSchema = z.object({
  user: userSchema,
  recoveryCode: z.string().optional(),
});
export type ChangePinResponse = z.infer<typeof changePinResponseSchema>;

export const recoverRequestSchema = z.object({
  username: usernameSchema,
  recoveryCode: recoveryCodeSchema,
  newPin: pinSchema,
});
export type RecoverRequest = z.infer<typeof recoverRequestSchema>;

export const usersResponseSchema = z.object({ users: z.array(userSchema) });
export type UsersResponse = z.infer<typeof usersResponseSchema>;

export const createUserRequestSchema = z.object({
  username: usernameSchema,
  name: personNameSchema,
  role: roleSchema,
  pin: pinSchema,
});
export type CreateUserRequest = z.infer<typeof createUserRequestSchema>;

export const updateUserRequestSchema = z
  .object({
    name: personNameSchema.optional(),
    active: z.boolean().optional(),
    pin: pinSchema.optional(),
  })
  .refine((v) => Object.keys(v).length > 0);
export type UpdateUserRequest = z.infer<typeof updateUserRequestSchema>;

export const userResponseSchema = z.object({ user: userSchema });
export type UserResponse = z.infer<typeof userResponseSchema>;
